import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";

type AppRole = Database["public"]["Enums"]["app_role"];

interface AuthContextType {
  session: Session | null;
  user: User | null;
  role: AppRole | null;
  profile: Database["public"]["Tables"]["profiles"]["Row"] | null;
  loading: boolean;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  session: null,
  user: null,
  role: null,
  profile: null,
  loading: true,
  signOut: async () => {},
  refreshProfile: async () => {},
});

export const useAuth = () => useContext(AuthContext);

/** Silently update the user's lat/lng in their profile using the browser GPS. */
const updateLocationInBackground = async (userId: string) => {
  if (!navigator.geolocation) return;
  navigator.geolocation.getCurrentPosition(
    async (pos) => {
      try {
        await supabase
          .from("profiles")
          .update({ latitude: pos.coords.latitude, longitude: pos.coords.longitude })
          .eq("user_id", userId);
        console.log("[Location] Updated:", pos.coords.latitude, pos.coords.longitude);
      } catch (err) {
        console.warn("[Location] Failed to update:", err);
      }
    },
    (err) => console.warn("[Location] Permission denied or unavailable:", err.message),
    { timeout: 10000, maximumAge: 60_000 }
  );
};

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [session, setSession]   = useState<Session | null>(null);
  const [user, setUser]         = useState<User | null>(null);
  const [role, setRole]         = useState<AppRole | null>(null);
  const [profile, setProfile]   = useState<Database["public"]["Tables"]["profiles"]["Row"] | null>(null);
  const [loading, setLoading]   = useState(true);

  const fetchUserData = async (userId: string) => {
    try {
      const [{ data: roles }, { data: prof }] = await Promise.all([
        supabase.from("user_roles").select("role").eq("user_id", userId),
        supabase.from("profiles").select("*").eq("user_id", userId).single(),
      ]);

      if (roles && roles.length > 0) {
        setRole(roles[0].role);
      } else {
        // New user — assign default donor role
        const defaultRole: AppRole = "donor";
        await supabase.from("user_roles").insert({ user_id: userId, role: defaultRole });
        setRole(defaultRole);
      }

      setProfile(prof ?? null);

      // ── Dynamic location update ──────────────────────────────────────────
      // Update location every time the user opens / returns to the app.
      // This replaces the need to store a static lat/lng at signup.
      updateLocationInBackground(userId);
    } catch (err) {
      console.error("Error fetching user data:", err);
    }
  };

  const refreshProfile = async () => {
    if (!user) return;
    const { data: prof } = await supabase
      .from("profiles")
      .select("*")
      .eq("user_id", user.id)
      .single();
    setProfile(prof ?? null);
  };

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (_event, session) => {
        setSession(session);
        setUser(session?.user ?? null);
        if (session?.user) {
          // Use setTimeout to avoid Supabase internal deadlock
          setTimeout(() => fetchUserData(session.user.id), 0);
        } else {
          setRole(null);
          setProfile(null);
        }
        setLoading(false);
      }
    );

    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      if (session?.user) {
        fetchUserData(session.user.id);
      }
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  // ── Re-update location when the user comes back to the browser tab ────────
  useEffect(() => {
    const handleVisibility = () => {
      if (document.visibilityState === "visible" && user) {
        updateLocationInBackground(user.id);
      }
    };
    document.addEventListener("visibilitychange", handleVisibility);
    return () => document.removeEventListener("visibilitychange", handleVisibility);
  }, [user]);

  const signOut = async () => {
    await supabase.auth.signOut();
    setSession(null);
    setUser(null);
    setRole(null);
    setProfile(null);
  };

  return (
    <AuthContext.Provider value={{ session, user, role, profile, loading, signOut, refreshProfile }}>
      {children}
    </AuthContext.Provider>
  );
};
