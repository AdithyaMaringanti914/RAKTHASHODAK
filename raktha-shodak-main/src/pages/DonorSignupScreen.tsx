import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { motion } from "framer-motion";
import { ArrowLeft, User, Mail, Lock, Phone } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable/index";
import BloodGroupPicker from "@/components/BloodGroupPicker";
import { toast } from "sonner";

const DonorSignupScreen = () => {
  const navigate = useNavigate();
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [bloodGroup, setBloodGroup] = useState("O+");
  const [phone, setPhone] = useState("");
  const [loading, setLoading] = useState(false);
  const [focused, setFocused] = useState<string | null>(null);

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { full_name: fullName },
        emailRedirectTo: window.location.origin,
      },
    });

    if (error) {
      toast.error(error.message);
      setLoading(false);
      return;
    }

    if (data.user) {
      await Promise.all([
        supabase.from("user_roles").insert({ user_id: data.user.id, role: "donor" as const }),
        supabase.from("profiles").update({ blood_group: bloodGroup, phone }).eq("user_id", data.user.id),
      ]);
      toast.success("Account created! Check your email to verify.");
      navigate("/");
    }
    setLoading(false);
  };

  const handleGoogleSignup = async () => {
    const { error } = await lovable.auth.signInWithOAuth("google", {
      redirect_uri: window.location.origin,
    });
    if (error) toast.error(String(error));
  };

  const inputClass = (field: string) =>
    `relative flex items-center gap-3 bg-card border-2 rounded-2xl px-4 h-14 transition-all duration-200 ${
      focused === field
        ? "border-primary shadow-[0_0_0_3px_hsl(var(--primary)/0.1)]"
        : "border-border"
    }`;

  const iconClass = (field: string) =>
    `w-[18px] h-[18px] flex-shrink-0 transition-colors ${focused === field ? "text-primary" : "text-muted-foreground"}`;

  return (
    <div className="min-h-screen bg-background max-w-lg mx-auto pb-12">
      <div className="px-6 pt-12 pb-4">
        <button onClick={() => navigate("/login")} className="mb-4 text-muted-foreground">
          <ArrowLeft className="w-6 h-6" />
        </button>
        <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground mb-1">Donor Registration</p>
        <h1 className="text-3xl font-extrabold tracking-[-0.04em] text-foreground">Join as Donor</h1>
      </div>

      <form onSubmit={handleSignup} className="px-6 space-y-3">
        <div className={inputClass("name")}>
          <User className={iconClass("name")} />
          <input
            type="text"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            onFocus={() => setFocused("name")}
            onBlur={() => setFocused(null)}
            required
            placeholder="Full name"
            className="flex-1 bg-transparent text-sm text-foreground font-medium placeholder:text-muted-foreground/60 outline-none"
          />
        </div>

        <div className={inputClass("email")}>
          <Mail className={iconClass("email")} />
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            onFocus={() => setFocused("email")}
            onBlur={() => setFocused(null)}
            required
            placeholder="Email address"
            className="flex-1 bg-transparent text-sm text-foreground font-medium placeholder:text-muted-foreground/60 outline-none"
          />
        </div>

        <div className={inputClass("password")}>
          <Lock className={iconClass("password")} />
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            onFocus={() => setFocused("password")}
            onBlur={() => setFocused(null)}
            required
            minLength={6}
            placeholder="Password (min 6 characters)"
            className="flex-1 bg-transparent text-sm text-foreground font-medium placeholder:text-muted-foreground/60 outline-none"
          />
        </div>

        <div className={inputClass("phone")}>
          <Phone className={iconClass("phone")} />
          <input
            type="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            onFocus={() => setFocused("phone")}
            onBlur={() => setFocused(null)}
            placeholder="+91 XXXXX XXXXX"
            className="flex-1 bg-transparent text-sm text-foreground font-medium placeholder:text-muted-foreground/60 outline-none"
          />
        </div>

        <div className="pt-2">
          <label className="text-xs font-bold uppercase tracking-widest text-muted-foreground mb-3 block">Blood Group</label>
          <BloodGroupPicker selected={bloodGroup} onChange={setBloodGroup} />
        </div>

        <motion.button
          whileTap={{ scale: 0.97 }}
          type="submit"
          disabled={loading}
          className="w-full h-14 bg-primary text-primary-foreground rounded-2xl font-bold text-[15px] shadow-button disabled:opacity-60 mt-2"
        >
          {loading ? (
            <span className="flex items-center justify-center gap-2">
              <span className="w-4 h-4 border-2 border-primary-foreground/30 border-t-primary-foreground rounded-full animate-spin" />
              Creating Account…
            </span>
          ) : (
            "Create Donor Account"
          )}
        </motion.button>

        <div className="relative">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-border" />
          </div>
          <div className="relative flex justify-center">
            <span className="bg-background px-4 text-[11px] font-bold uppercase tracking-widest text-muted-foreground/50">or</span>
          </div>
        </div>

        <motion.button
          whileTap={{ scale: 0.97 }}
          type="button"
          onClick={handleGoogleSignup}
          className="w-full h-14 bg-card border-2 border-border rounded-2xl font-semibold text-sm text-foreground flex items-center justify-center gap-3 hover:border-muted-foreground/30 transition-colors"
        >
          <svg width="18" height="18" viewBox="0 0 18 18"><path d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844a4.14 4.14 0 01-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.875 2.684-6.615z" fill="#4285F4"/><path d="M9 18c2.43 0 4.467-.806 5.956-2.184l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 009 18z" fill="#34A853"/><path d="M3.964 10.706A5.41 5.41 0 013.682 9c0-.593.102-1.17.282-1.706V4.962H.957A8.996 8.996 0 000 9c0 1.452.348 2.827.957 4.038l3.007-2.332z" fill="#FBBC05"/><path d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 00.957 4.962L3.964 7.294C4.672 5.163 6.656 3.58 9 3.58z" fill="#EA4335"/></svg>
          Sign up with Google
        </motion.button>

        <p className="text-center text-sm text-muted-foreground">
          Already have an account?{" "}
          <Link to="/login" className="text-primary font-semibold">Sign in</Link>
        </p>
      </form>
    </div>
  );
};

export default DonorSignupScreen;
