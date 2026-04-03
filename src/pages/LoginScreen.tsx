import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { Mail, Lock, Eye, EyeOff, KeyRound } from "lucide-react";
import PhoneInput from "@/components/PhoneInput";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable/index";
import { toast } from "sonner";

const LoginScreen = () => {
  const navigate = useNavigate();
  const [mode, setMode] = useState<"email" | "phone">("email");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [phone, setPhone] = useState("");
  const [otpSent, setOtpSent] = useState(false);
  const [otpCode, setOtpCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [focused, setFocused] = useState<string | null>(null);

  const handleEmailLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (error) {
      toast.error(error.message);
    } else {
      navigate("/");
    }
  };

  const handleSendOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    
    // phone already contains prefix from PhoneInput
    const { error } = await supabase.auth.signInWithOtp({ phone });
    setLoading(false);
    if (error) {
      toast.error(`OTP Failed: ${error.message}`);
    } else {
      setOtpSent(true);
      toast.success(`Secure OTP dispatched to ${phone}!`);
    }
  };

  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    
    const { error } = await supabase.auth.verifyOtp({ 
      phone, 
      token: otpCode, 
      type: 'sms' 
    });
    
    setLoading(false);
    if (error) {
      toast.error(`Verification Failed: ${error.message}`);
    } else {
      navigate("/");
    }
  };

  const handleGoogleLogin = async () => {
    const { error } = await lovable.auth.signInWithOAuth("google", {
      redirect_uri: window.location.origin,
    });
    if (error) toast.error(String(error));
  };

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center px-6 max-w-lg mx-auto">
      <motion.div
        className="w-full"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
      >
        {/* Hero */}
        <div className="text-center mb-12">
          <motion.div
            className="w-20 h-20 rounded-[1.25rem] bg-primary/10 mx-auto mb-5 flex items-center justify-center"
            initial={{ scale: 0.8 }}
            animate={{ scale: 1 }}
            transition={{ delay: 0.2, type: "spring", stiffness: 200 }}
          >
            <span className="text-4xl">🩸</span>
          </motion.div>
          <h1 className="text-3xl font-extrabold tracking-[-0.04em] text-foreground">Raktha Shodak</h1>
          <p className="text-sm text-muted-foreground mt-2 font-medium">Every drop counts. Sign in to save lives.</p>
        </div>

        {/* Mode Toggle */}
        <div className="flex bg-secondary/50 p-1 rounded-2xl mb-8">
          <button
            onClick={() => setMode("email")}
            className={`flex-1 h-10 rounded-xl text-sm font-semibold transition-all ${
              mode === "email" ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            Email
          </button>
          <button
            onClick={() => setMode("phone")}
            className={`flex-1 h-10 rounded-xl text-sm font-semibold transition-all ${
              mode === "phone" ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            Phone OTP
          </button>
        </div>

        {/* Form */}
        <div className="mb-6 relative min-h-[160px]">
          <AnimatePresence mode="wait">
            {mode === "email" ? (
              <motion.form 
                key="email-form"
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                transition={{ duration: 0.2 }}
                onSubmit={handleEmailLogin} 
                className="space-y-3 absolute inset-0"
              >
                {/* Email */}
                <div
                  className={`relative flex items-center gap-3 bg-card border-2 rounded-2xl px-4 h-14 transition-all duration-200 ${
                    focused === "email"
                      ? "border-primary shadow-[0_0_0_3px_hsl(var(--primary)/0.1)]"
                      : "border-border"
                  }`}
                >
                  <Mail className={`w-[18px] h-[18px] flex-shrink-0 transition-colors ${focused === "email" ? "text-primary" : "text-muted-foreground"}`} />
                  <input
                    type="email"
                    placeholder="Email address"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    onFocus={() => setFocused("email")}
                    onBlur={() => setFocused(null)}
                    required
                    className="flex-1 bg-transparent text-sm text-foreground font-medium placeholder:text-muted-foreground/60 outline-none"
                  />
                </div>

                {/* Password */}
                <div
                  className={`relative flex items-center gap-3 bg-card border-2 rounded-2xl px-4 h-14 transition-all duration-200 ${
                    focused === "password"
                      ? "border-primary shadow-[0_0_0_3px_hsl(var(--primary)/0.1)]"
                      : "border-border"
                  }`}
                >
                  <Lock className={`w-[18px] h-[18px] flex-shrink-0 transition-colors ${focused === "password" ? "text-primary" : "text-muted-foreground"}`} />
                  <input
                    type={showPassword ? "text" : "password"}
                    placeholder="Password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    onFocus={() => setFocused("password")}
                    onBlur={() => setFocused(null)}
                    required
                    className="flex-1 bg-transparent text-sm text-foreground font-medium placeholder:text-muted-foreground/60 outline-none"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="text-muted-foreground hover:text-foreground transition-colors"
                    tabIndex={-1}
                  >
                    {showPassword ? <EyeOff className="w-[18px] h-[18px]" /> : <Eye className="w-[18px] h-[18px]" />}
                  </button>
                </div>

                {/* Submit Email */}
                <motion.button
                  whileTap={{ scale: 0.97 }}
                  type="submit"
                  disabled={loading}
                  className="w-full h-14 bg-primary text-primary-foreground rounded-2xl font-bold text-[15px] shadow-button disabled:opacity-60 mt-2"
                >
                  {loading ? "Signing in…" : "Sign In"}
                </motion.button>
              </motion.form>
            ) : (
              <motion.form 
                key="phone-form"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 20 }}
                transition={{ duration: 0.2 }}
                onSubmit={otpSent ? handleVerifyOtp : handleSendOtp} 
                className="space-y-3 absolute inset-0"
              >
                {/* Phone */}
                <PhoneInput
                  value={phone}
                  onChange={setPhone}
                  onFocus={() => setFocused("phone")}
                  onBlur={() => setFocused(null)}
                  focused={focused === "phone"}
                  disabled={otpSent}
                  required
                />

                {/* OTP Code */}
                {otpSent && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: "auto" }}
                    className={`relative flex items-center gap-3 bg-card border-2 rounded-2xl px-4 h-14 transition-all duration-200 ${
                      focused === "otp"
                        ? "border-primary shadow-[0_0_0_3px_hsl(var(--primary)/0.1)]"
                        : "border-border"
                    }`}
                  >
                    <KeyRound className={`w-[18px] h-[18px] flex-shrink-0 transition-colors ${focused === "otp" ? "text-primary" : "text-muted-foreground"}`} />
                    <input
                      type="text"
                      placeholder="Enter 6-digit OTP"
                      value={otpCode}
                      maxLength={6}
                      onChange={(e) => setOtpCode(e.target.value)}
                      onFocus={() => setFocused("otp")}
                      onBlur={() => setFocused(null)}
                      required
                      className="flex-1 bg-transparent text-sm text-foreground font-medium tracking-widest placeholder:text-muted-foreground/60 placeholder:tracking-normal outline-none"
                    />
                  </motion.div>
                )}

                {/* Submit Phone */}
                <motion.button
                  whileTap={{ scale: 0.97 }}
                  type="submit"
                  disabled={loading || (otpSent && otpCode.length < 6)}
                  className="w-full h-14 bg-primary text-primary-foreground rounded-2xl font-bold text-[15px] shadow-button disabled:opacity-60 mt-2 flex items-center justify-center gap-2"
                >
                  {loading && <span className="w-4 h-4 border-2 border-primary-foreground/30 border-t-primary-foreground rounded-full animate-spin" />}
                  {!loading && (otpSent ? "Verify Security Code" : "Dispatch OTP")}
                </motion.button>
                
                {otpSent && (
                  <div className="text-center mt-2">
                    <button type="button" onClick={() => setOtpSent(false)} className="text-xs font-semibold text-primary hover:underline">
                      Changed your number?
                    </button>
                  </div>
                )}
              </motion.form>
            )}
          </AnimatePresence>
        </div>

        {/* Divider */}
        <div className="relative mb-6 mt-12">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-border" />
          </div>
          <div className="relative flex justify-center">
            <span className="bg-background px-4 text-[11px] font-bold uppercase tracking-widest text-muted-foreground/50">or</span>
          </div>
        </div>

        {/* Google */}
        <motion.button
          whileTap={{ scale: 0.97 }}
          onClick={handleGoogleLogin}
          className="w-full h-14 bg-card border-2 border-border rounded-2xl font-semibold text-sm text-foreground flex items-center justify-center gap-3 hover:border-muted-foreground/30 transition-colors"
        >
          <svg width="18" height="18" viewBox="0 0 18 18">
            <path d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844a4.14 4.14 0 01-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.875 2.684-6.615z" fill="#4285F4" />
            <path d="M9 18c2.43 0 4.467-.806 5.956-2.184l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 009 18z" fill="#34A853" />
            <path d="M3.964 10.706A5.41 5.41 0 013.682 9c0-.593.102-1.17.282-1.706V4.962H.957A8.996 8.996 0 000 9c0 1.452.348 2.827.957 4.038l3.007-2.332z" fill="#FBBC05" />
            <path d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 00.957 4.962L3.964 7.294C4.672 5.163 6.656 3.58 9 3.58z" fill="#EA4335" />
          </svg>
          Continue with Google
        </motion.button>

        {/* Register links */}
        <div className="mt-10 flex items-center justify-center gap-1">
          <span className="text-sm text-muted-foreground">New here?</span>
        </div>
        <div className="mt-3 grid grid-cols-2 gap-3">
          <Link
            to="/signup/donor"
            className="h-12 flex items-center justify-center rounded-2xl border-2 border-primary/20 text-primary font-semibold text-sm hover:bg-primary/5 transition-colors"
          >
            Join as Donor
          </Link>
          <Link
            to="/signup/requester"
            className="h-12 flex items-center justify-center rounded-2xl border-2 border-border text-foreground font-semibold text-sm hover:bg-secondary transition-colors"
          >
            Request Blood
          </Link>
        </div>
      </motion.div>
    </div>
  );
};

export default LoginScreen;
