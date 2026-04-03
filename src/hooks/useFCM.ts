import { useEffect, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { messaging, getToken, onMessage } from "@/lib/firebase";
import { toast } from "sonner";
import { useNavigate } from "react-router-dom";

export const useFCM = () => {
  const { user, role } = useAuth();
  const navigate = useNavigate();
  const [fcmToken, setFcmToken] = useState<string | null>(null);

  useEffect(() => {
    // Only register logic if the user is a donor expecting messages
    if (!user || role !== "donor") return;

    const requestPermissionAndToken = async () => {
      try {
        const msg = await messaging();
        if (!msg) {
          console.warn("Firebase Messaging perfectly unsupported on this environment.");
          return;
        }

        const permission = await Notification.requestPermission();
        if (permission === "granted") {
          // You must generate a VAPID Key inside the Firebase Cloud Console -> Project Settings -> Cloud Messaging -> Web Push certificates
          const currentToken = await getToken(msg, {
            // vapidKey: import.meta.env.VITE_FIREBASE_VAPID_KEY
            // Replace with your VAPID here for real production testing
          });

          if (currentToken) {
            setFcmToken(currentToken);
            // Sync securely to Postgres
            await supabase
              .from("profiles") // Using raw profiles table for compatibility
              .update({ fcm_token: currentToken } as any)
              .eq("id", user.id);
            console.log("FCM VAPID token secured & synced to DB:", currentToken);
          }
        } else {
          console.warn("Notification system denied by user.");
        }
      } catch (error) {
        console.error("FCM Token compilation failed:", error);
      }
    };

    requestPermissionAndToken();

    // Attach Active Foreground Event Listener
    const attachForegoundListener = async () => {
      const msg = await messaging();
      if (!msg) return;

      return onMessage(msg, (payload) => {
        console.log("FCM foreground event intercepted:", payload);

        // Render visual toast prompting explicit redirection to the payload's intent Link
        toast.message(`🚨 ${payload.notification?.title || "Emergency Blood Request"}`, {
          description: payload.notification?.body || "A nearby patient matched your profile. Tap to accept.",
          duration: 10000,
          action: {
            label: "Open Request",
            onClick: () => {
              // Parse deep link action (e.g. '/alerts') sent by the backend logic
              navigate(payload.data?.click_action || "/alerts");
            },
          },
        });
      });
    };

    let unsubscribe: any;
    attachForegoundListener().then((unsub) => {
      unsubscribe = unsub;
    });

    return () => {
      if (unsubscribe) unsubscribe();
    };
  }, [user, role, navigate]);

  return fcmToken;
};
