import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowLeft, User, Mail, Lock, Phone, Shield, MapPin, CheckCircle } from "lucide-react";
import PhoneInput from "@/components/PhoneInput";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable/index";
import BloodGroupPicker from "@/components/BloodGroupPicker";
import { toast } from "sonner";

// Step order: verify_phone → details → location
// Phone is verified BEFORE account creation, so no session is required for OTP.
type Step = "verify_phone" | "details" | "location";

const STEP_LABELS = ["Phone", "Account", "Location"];
const STEP_MAP: Record<Step, number> = { verify_phone: 0, details: 1, location: 2 };

const formatPhone = (raw: string) => {
  const clean = raw.replace(/[^0-9+]/g, "");
  return clean.startsWith("+") ? clean : `+91${clean}`;
};

const DonorSignupScreen = () => {
  const navigate = useNavigate();

  const [step, setStep] = useState<Step>("verify_phone");

  // ── Phone step (step 1) ───────────────────────────────────────────────────
  const [phone, setPhone]               = useState("");
  const [otpSent, setOtpSent]           = useState(false);
  const [pendingOtp, setPendingOtp]     = useState(""); // stored in memory
  const [otpExpiry, setOtpExpiry]       = useState<Date | null>(null);
  const [otp, setOtp]                   = useState("");
  const [phoneVerified, setPhoneVerified] = useState(false);
  const [verifiedPhone, setVerifiedPhone] = useState(""); // E.164 after verify

  // ── Account step (step 2) ─────────────────────────────────────────────────
  const [fullName, setFullName]     = useState("");
  const [email, setEmail]           = useState("");
  const [password, setPassword]     = useState("");
  const [bloodGroup, setBloodGroup] = useState("O+");

  // ── Location step (step 3) ────────────────────────────────────────────────
  const [userId, setUserId] = useState<string | null>(null);

  // ── Shared ────────────────────────────────────────────────────────────────
  const [loading, setLoading] = useState(false);
  const [focused, setFocused] = useState<string | null>(null);

  const inputClass = (field: string) =>
    `relative flex items-center gap-3 bg-card border-2 rounded-2xl px-4 h-14 transition-all duration-200 ${
      focused === field
        ? "border-primary shadow-[0_0_0_3px_hsl(var(--primary)/0.1)]"
        : "border-border"
    }`;
  const iconClass = (field: string) =>
    `w-[18px] h-[18px] flex-shrink-0 transition-colors ${
      focused === field ? "text-primary" : "text-muted-foreground"
    }`;

  // ── 1a. Send OTP (no auth session needed — anon key is used automatically) ─
  const handleSendOtp = async () => {
    if (!phone) { toast.error("Please enter your phone number."); return; }
    setLoading(true);
    try {
      const formatted = formatPhone(phone);

      // Generate cryptographically random 6-digit OTP stored in memory
      const raw = crypto.getRandomValues(new Uint32Array(1))[0] % 1_000_000;
      const code = String(raw).padStart(6, "0");
      setPendingOtp(code);
      setOtpExpiry(new Date(Date.now() + 10 * 60 * 1000)); // 10 min

      // Send via the already-deployed send-emergency-alert edge function
      const smsBody = `🔐 Raktha Shodak code: ${code}. Valid 10 min. Do NOT share.`;
      const { data: smsData, error: smsErr } = await supabase.functions.invoke(
        "send-emergency-alert",
        { body: { to: formatted, body: smsBody, sendSms: true, sendVoice: false } }
      );

      if (smsErr) { toast.error("SMS error: " + smsErr.message); return; }
      if (smsData?.skipped) {
        toast.error(`⚠️ ${formatted} is not Twilio-verified. Add it in Twilio Console → Verified Caller IDs.`);
        return;
      }

      setOtpSent(true);
      toast.success(`OTP sent to ${formatted}`);
    } finally {
      setLoading(false);
    }
  };

  // ── 1b. Verify OTP (in-memory comparison, no DB needed) ──────────────────
  const handleVerifyOtp = () => {
    if (!pendingOtp || !otpExpiry) { toast.error("Please request an OTP first."); return; }
    if (new Date() > otpExpiry)   { toast.error("OTP expired. Please request a new one."); setOtpSent(false); return; }
    if (otp.trim() !== pendingOtp) { toast.error("Incorrect OTP. Please try again."); return; }

    const formatted = formatPhone(phone);
    setVerifiedPhone(formatted);
    setPhoneVerified(true);
    toast.success("Phone verified! ✓");
    setTimeout(() => setStep("details"), 1100);
  };

  // ── 2. Create account (phone already verified) ────────────────────────────
  const handleCreateAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: { 
            full_name: fullName, 
            role: "donor", 
            blood_group: bloodGroup,
            phone: verifiedPhone,
            phone_verified: true
          },
          emailRedirectTo: `${window.location.origin}/login`,
        },
      });

      if (error) { toast.error(error.message); return; }
      if (!data.user) { toast.error("Signup failed. Please try again."); return; }

      const uid = data.user.id;
      setUserId(uid);

      // The handle_new_user DB trigger will automatically write everything 
      // from user_metadata (including phone) into the profiles table!
      await supabase.from("user_roles").upsert({ user_id: uid, role: "donor" as const });

      if (!data.session) {
        toast.success("Verification email sent! Your phone number is already saved. Please confirm your email then log in.");
        navigate("/login");
        return;
      }

      toast.success("Account created! Almost done — enable location.");
      setStep("location");
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleSignup = async () => {
    const { error } = await lovable.auth.signInWithOAuth("google", {
      redirect_uri: window.location.origin,
    });
    if (error) toast.error(String(error));
  };

  // ── 3. Save location ──────────────────────────────────────────────────────
  const handleGetLocation = async () => {
    setLoading(true);
    try {
      const pos = await new Promise<GeolocationPosition>((resolve, reject) =>
        navigator.geolocation.getCurrentPosition(resolve, reject, { timeout: 12000 })
      );
      if (userId) {
        await supabase
          .from("profiles")
          .update({ latitude: pos.coords.latitude, longitude: pos.coords.longitude })
          .eq("user_id", userId);
      }
      toast.success("All set! Welcome to Raktha Shodak 🎉");
      navigate("/");
    } catch {
      toast.warning("Location skipped. You can enable it later.");
      navigate("/");
    } finally {
      setLoading(false);
    }
  };

  const stepIdx = STEP_MAP[step];

  return (
    <div className="min-h-screen bg-background max-w-lg mx-auto pb-12">
      {/* Header */}
      <div className="px-6 pt-12 pb-6">
        <button onClick={() => navigate("/login")} className="mb-4 text-muted-foreground">
          <ArrowLeft className="w-6 h-6" />
        </button>
        <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground mb-1">
          Donor Registration
        </p>
        <h1 className="text-3xl font-extrabold tracking-[-0.04em] text-foreground">Join as Donor</h1>

        {/* Step indicator */}
        <div className="flex items-center mt-5">
          {STEP_LABELS.map((label, i) => (
            <div key={label} className="flex items-center">
              <div className="flex flex-col items-center">
                <div
                  className={`flex items-center justify-center w-8 h-8 rounded-full text-xs font-bold transition-all ${
                    i < stepIdx
                      ? "bg-green-500 text-white"
                      : i === stepIdx
                      ? "bg-primary text-primary-foreground shadow-[0_0_0_4px_hsl(var(--primary)/0.2)]"
                      : "bg-muted text-muted-foreground"
                  }`}
                >
                  {i < stepIdx ? "✓" : i + 1}
                </div>
                <span className={`text-[10px] font-semibold mt-1 ${i === stepIdx ? "text-primary" : "text-muted-foreground"}`}>
                  {label}
                </span>
              </div>
              {i < STEP_LABELS.length - 1 && (
                <div className={`h-[2px] w-12 mb-4 mx-1 rounded transition-all ${i < stepIdx ? "bg-green-500" : "bg-muted"}`} />
              )}
            </div>
          ))}
        </div>
      </div>

      <AnimatePresence mode="wait">

        {/* ── STEP 1: Phone verification ──────────────────────────────────── */}
        {step === "verify_phone" && (
          <motion.div
            key="verify_phone"
            initial={{ opacity: 0, x: 40 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -40 }}
            transition={{ duration: 0.22 }}
            className="px-6 space-y-4"
          >
            <div className="p-4 rounded-2xl bg-primary/5 border border-primary/20 flex gap-3">
              <Shield className="w-8 h-8 text-primary flex-shrink-0 mt-0.5" />
              <div>
                <p className="font-bold text-foreground">Verify your phone number</p>
                <p className="text-sm text-muted-foreground mt-0.5">
                  Donors with verified phones receive emergency blood alerts via SMS.
                </p>
              </div>
            </div>

            {!phoneVerified ? (
              <>
                {!otpSent ? (
                  <>
                    <PhoneInput
                      value={phone} onChange={setPhone}
                      onFocus={() => setFocused("phone")} onBlur={() => setFocused(null)}
                      focused={focused === "phone"} required
                    />
                    <motion.button
                      whileTap={{ scale: 0.97 }} onClick={handleSendOtp}
                      disabled={loading || !phone}
                      className="w-full h-14 bg-primary text-primary-foreground rounded-2xl font-bold text-[15px] shadow-button disabled:opacity-60"
                    >
                      {loading
                        ? <span className="flex items-center justify-center gap-2"><span className="w-4 h-4 border-2 border-primary-foreground/30 border-t-primary-foreground rounded-full animate-spin" />Sending…</span>
                        : "Send OTP →"}
                    </motion.button>
                  </>
                ) : (
                  <>
                    <p className="text-sm text-muted-foreground">
                      Enter the 6-digit code sent to <span className="font-semibold text-foreground">{formatPhone(phone)}</span>
                    </p>

                    <div className={inputClass("otp")}>
                      <Shield className={iconClass("otp")} />
                      <input
                        type="tel" inputMode="numeric" value={otp}
                        onChange={e => setOtp(e.target.value.replace(/\D/g, "").slice(0, 6))}
                        onFocus={() => setFocused("otp")} onBlur={() => setFocused(null)}
                        placeholder="6-digit OTP" maxLength={6}
                        className="flex-1 bg-transparent text-lg text-foreground font-bold placeholder:text-muted-foreground/60 outline-none tracking-[0.4em]"
                      />
                    </div>

                    <motion.button
                      whileTap={{ scale: 0.97 }} onClick={handleVerifyOtp}
                      disabled={loading || otp.length < 6}
                      className="w-full h-14 bg-primary text-primary-foreground rounded-2xl font-bold text-[15px] shadow-button disabled:opacity-60"
                    >
                      Verify OTP ✓
                    </motion.button>

                    <button onClick={() => { setOtpSent(false); setOtp(""); setPendingOtp(""); }}
                      className="w-full text-sm text-muted-foreground text-center py-1">
                      ← Change phone number
                    </button>
                  </>
                )}
              </>
            ) : (
              <div className="flex flex-col items-center gap-3 py-10">
                <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: "spring" }}>
                  <CheckCircle className="w-20 h-20 text-green-500" />
                </motion.div>
                <p className="font-extrabold text-2xl text-foreground">Phone Verified ✓</p>
                <p className="text-muted-foreground text-sm">Proceeding to account setup…</p>
              </div>
            )}

            {!phoneVerified && (
              <button onClick={() => setStep("details")}
                className="w-full text-sm text-muted-foreground text-center py-2">
                Skip for now →
              </button>
            )}
          </motion.div>
        )}

        {/* ── STEP 2: Account Details ─────────────────────────────────────── */}
        {step === "details" && (
          <motion.form
            key="details"
            initial={{ opacity: 0, x: 40 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -40 }}
            transition={{ duration: 0.22 }}
            onSubmit={handleCreateAccount}
            className="px-6 space-y-3"
          >
            {verifiedPhone && (
              <div className="flex items-center gap-2 px-4 py-2 rounded-xl bg-green-500/10 border border-green-500/30 text-green-600 text-sm font-semibold">
                <CheckCircle className="w-4 h-4" />
                Phone verified: {verifiedPhone}
              </div>
            )}

            <div className={inputClass("name")}>
              <User className={iconClass("name")} />
              <input type="text" value={fullName} onChange={e => setFullName(e.target.value)}
                onFocus={() => setFocused("name")} onBlur={() => setFocused(null)}
                required placeholder="Full name"
                className="flex-1 bg-transparent text-sm text-foreground font-medium placeholder:text-muted-foreground/60 outline-none" />
            </div>

            <div className={inputClass("email")}>
              <Mail className={iconClass("email")} />
              <input type="email" value={email} onChange={e => setEmail(e.target.value)}
                onFocus={() => setFocused("email")} onBlur={() => setFocused(null)}
                required placeholder="Email address"
                className="flex-1 bg-transparent text-sm text-foreground font-medium placeholder:text-muted-foreground/60 outline-none" />
            </div>

            <div className={inputClass("password")}>
              <Lock className={iconClass("password")} />
              <input type="password" value={password} onChange={e => setPassword(e.target.value)}
                onFocus={() => setFocused("password")} onBlur={() => setFocused(null)}
                required minLength={6} placeholder="Password (min 6 characters)"
                className="flex-1 bg-transparent text-sm text-foreground font-medium placeholder:text-muted-foreground/60 outline-none" />
            </div>

            <div className="pt-2">
              <label className="text-xs font-bold uppercase tracking-widest text-muted-foreground mb-3 block">Blood Group</label>
              <BloodGroupPicker selected={bloodGroup} onChange={setBloodGroup} />
            </div>

            <motion.button whileTap={{ scale: 0.97 }} type="submit" disabled={loading}
              className="w-full h-14 bg-primary text-primary-foreground rounded-2xl font-bold text-[15px] shadow-button disabled:opacity-60 mt-2">
              {loading
                ? <span className="flex items-center justify-center gap-2"><span className="w-4 h-4 border-2 border-primary-foreground/30 border-t-primary-foreground rounded-full animate-spin" />Creating Account…</span>
                : "Create Donor Account →"}
            </motion.button>

            <div className="relative my-1">
              <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-border" /></div>
              <div className="relative flex justify-center">
                <span className="bg-background px-4 text-[11px] font-bold uppercase tracking-widest text-muted-foreground/50">or</span>
              </div>
            </div>

            <motion.button whileTap={{ scale: 0.97 }} type="button" onClick={handleGoogleSignup}
              className="w-full h-14 bg-card border-2 border-border rounded-2xl font-semibold text-sm text-foreground flex items-center justify-center gap-3 hover:border-muted-foreground/30 transition-colors">
              <svg width="18" height="18" viewBox="0 0 18 18"><path d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844a4.14 4.14 0 01-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.875 2.684-6.615z" fill="#4285F4"/><path d="M9 18c2.43 0 4.467-.806 5.956-2.184l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 009 18z" fill="#34A853"/><path d="M3.964 10.706A5.41 5.41 0 013.682 9c0-.593.102-1.17.282-1.706V4.962H.957A8.996 8.996 0 000 9c0 1.452.348 2.827.957 4.038l3.007-2.332z" fill="#FBBC05"/><path d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 00.957 4.962L3.964 7.294C4.672 5.163 6.656 3.58 9 3.58z" fill="#EA4335"/></svg>
              Sign up with Google
            </motion.button>

            <p className="text-center text-sm text-muted-foreground pb-2">
              Already have an account?{" "}
              <Link to="/login" className="text-primary font-semibold">Sign in</Link>
            </p>
          </motion.form>
        )}

        {/* ── STEP 3: Location ────────────────────────────────────────────── */}
        {step === "location" && (
          <motion.div
            key="location"
            initial={{ opacity: 0, x: 40 }} animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.22 }}
            className="px-6 space-y-4"
          >
            <div className="p-4 rounded-2xl bg-primary/5 border border-primary/20 flex gap-3">
              <MapPin className="w-8 h-8 text-primary flex-shrink-0 mt-0.5" />
              <div>
                <p className="font-bold text-foreground">Enable Location Access</p>
                <p className="text-sm text-muted-foreground mt-0.5">
                  Nearby patients find you based on your GPS location. It updates automatically every time you open the app.
                </p>
              </div>
            </div>

            <motion.button whileTap={{ scale: 0.97 }} onClick={handleGetLocation} disabled={loading}
              className="w-full h-14 bg-primary text-primary-foreground rounded-2xl font-bold text-[15px] shadow-button disabled:opacity-60">
              {loading
                ? <span className="flex items-center justify-center gap-2"><span className="w-4 h-4 border-2 border-primary-foreground/30 border-t-primary-foreground rounded-full animate-spin" />Saving…</span>
                : "📍 Enable Location Access"}
            </motion.button>

            <button onClick={() => navigate("/")} className="w-full text-sm text-muted-foreground text-center py-2">
              Skip for now →
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default DonorSignupScreen;
