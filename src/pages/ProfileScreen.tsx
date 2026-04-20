import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Droplets, Star, Calendar, ChevronRight, LogOut, Phone, Shield, X, AlertCircle, CheckCircle2 } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useNavigate } from "react-router-dom";
import BloodCompatibilityCard from "@/components/BloodCompatibilityCard";
import PhoneInput from "@/components/PhoneInput";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

const formatPhone = (raw: string) => {
  const clean = raw.replace(/[^0-9+]/g, "");
  return clean.startsWith("+") ? clean : `+91${clean}`;
};

const ProfileScreen = () => {
  const { user, profile, role, signOut, fetchProfile } = useAuth();
  const navigate = useNavigate();

  // Verification state
  const [showVerify, setShowVerify] = useState(false);
  const [phone, setPhone] = useState("");
  const [loading, setLoading] = useState(false);
  const [otpSent, setOtpSent] = useState(false);
  const [pendingOtp, setPendingOtp] = useState("");
  const [otpExpiry, setOtpExpiry] = useState<Date | null>(null);
  const [otp, setOtp] = useState("");
  const [focused, setFocused] = useState<string | null>(null);

  const inputClass = (field: string) =>
    `relative flex items-center gap-3 bg-card border-2 rounded-2xl px-4 h-12 transition-all duration-200 ${
      focused === field
        ? "border-primary shadow-[0_0_0_3px_hsl(var(--primary)/0.1)]"
        : "border-border"
    }`;
  const iconClass = (field: string) =>
    `w-[16px] h-[16px] flex-shrink-0 transition-colors ${
      focused === field ? "text-primary" : "text-muted-foreground"
    }`;

  const handleSignOut = async () => {
    await signOut();
    navigate("/login");
  };

  const handleSendOtp = async () => {
    if (!phone) { toast.error("Please enter your phone number."); return; }
    setLoading(true);
    try {
      const formatted = formatPhone(phone);
      const raw = crypto.getRandomValues(new Uint32Array(1))[0] % 1_000_000;
      const code = String(raw).padStart(6, "0");
      setPendingOtp(code);
      setOtpExpiry(new Date(Date.now() + 10 * 60 * 1000));

      const smsBody = `🔐 Raktha Shodak code: ${code}. Valid 10 min. Do NOT share.`;
      const { data: smsData, error: smsErr } = await supabase.functions.invoke(
        "send-emergency-alert",
        { body: { to: formatted, body: smsBody, sendSms: true, sendVoice: false } }
      );

      if (smsErr) { toast.error("SMS error: " + smsErr.message); return; }
      if (smsData?.skipped) {
        toast.error(`⚠️ ${formatted} is not Twilio-verified.`);
        return;
      }

      setOtpSent(true);
      toast.success(`OTP sent to ${formatted}`);
    } catch (e: any) {
      toast.error(e.message || "Failed to send OTP");
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyOtp = async () => {
    if (!pendingOtp || !otpExpiry) { toast.error("Request an OTP first."); return; }
    if (new Date() > otpExpiry) { toast.error("OTP expired."); setOtpSent(false); return; }
    if (otp.trim() !== pendingOtp) { toast.error("Incorrect OTP."); return; }

    setLoading(true);
    try {
      const formatted = formatPhone(phone);
      if (user) {
        const { error } = await supabase
          .from("profiles")
          .update({ phone: formatted, phone_verified: true } as any)
          .eq("user_id", user.id);
        
        if (error) throw error;
        
        await fetchProfile(user.id);
        toast.success("Phone verified successfully! ✓");
        setShowVerify(false);
      }
    } catch (e: any) {
      toast.error(e.message || "Failed to save verified phone.");
    } finally {
      setLoading(false);
    }
  };


  return (
    <div className="min-h-screen bg-background max-w-lg mx-auto pb-24">
      <div className="px-6 pt-12 pb-6">
        <p className="text-label mb-1">Profile</p>
        <h1 className="text-display">{profile?.full_name ?? "User"}</h1>
        <p className="text-body text-muted-foreground mt-1">
          {profile?.blood_group ?? "—"} • {role === "donor" ? "Donor" : "Requester"}
        </p>
      </div>

      {/* Stats cards */}
      <div className="px-6 mb-6">
        <div className="grid grid-cols-3 gap-3">
          {[
            { icon: Droplets, value: String(profile?.total_donations ?? 0), label: "Donations", color: "text-primary" },
            { icon: Star, value: String(profile?.reliability_score ?? "5.0"), label: "Reliability", color: "text-accent" },
            { icon: Calendar, value: profile?.last_donation_date ?? "N/A", label: "Last Donation", color: "text-success" },
          ].map((stat, i) => (
            <motion.div
              key={stat.label}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.04 }}
              className="bg-card rounded-2xl p-4 shadow-card text-center"
            >
              <stat.icon className={`w-5 h-5 mx-auto mb-2 ${stat.color}`} />
              <p className="text-xl font-bold text-foreground">{stat.value}</p>
              <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mt-0.5">
                {stat.label}
              </p>
            </motion.div>
          ))}
        </div>
      </div>

      {/* Blood Compatibility Card */}
      <div className="px-6 mb-6">
        <BloodCompatibilityCard bloodGroup={profile?.blood_group ?? null} />
      </div>

      {/* Eligibility */}
      <div className="px-6 mb-6">
        <div className="bg-success/10 rounded-2xl p-4 flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-success flex items-center justify-center">
            <span className="text-success-foreground font-bold text-sm">✓</span>
          </div>
          <div>
            <p className="font-semibold text-foreground text-sm">Eligible to Donate</p>
            <p className="text-xs text-muted-foreground">Next eligible: Available now</p>
          </div>
        </div>
      </div>

      {/* Phone Verification Section */}
      <div className="px-6 mb-6">
        <div className={`p-4 rounded-2xl border ${profile?.phone_verified ? "bg-card border-border shadow-card" : "bg-destructive/5 border-destructive/20"}`}>
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-3">
              <div className={`w-10 h-10 rounded-full flex items-center justify-center ${profile?.phone_verified ? "bg-success/10 text-success" : "bg-destructive/10 text-destructive"}`}>
                <Phone className="w-4 h-4" />
              </div>
              <div>
                <p className="font-semibold text-foreground text-sm">Phone Number</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {profile?.phone 
                    ? profile.phone 
                    : "No phone number added"}
                </p>
              </div>
            </div>
            {profile?.phone_verified ? (
              <span className="flex items-center gap-1 text-xs font-semibold text-success bg-success/10 px-2.5 py-1 rounded-full">
                <CheckCircle2 className="w-3 h-3" /> Verified
              </span>
            ) : (
              <button 
                onClick={() => {
                  setPhone(profile?.phone || "");
                  setShowVerify(true);
                  setOtpSent(false);
                  setOtp("");
                }}
                className="flex items-center gap-1 text-xs font-semibold text-destructive bg-destructive/10 px-2.5 py-1 rounded-full hover:bg-destructive/20 transition-colors"
                >
                <AlertCircle className="w-3 h-3" /> Verify Now
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Verification Modal */}
      <AnimatePresence>
        {showVerify && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm"
          >
            <motion.div 
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="w-full max-w-sm bg-card rounded-3xl shadow-[0_8px_30px_rgb(0,0,0,0.12)] border border-border p-6 overflow-hidden relative"
            >
              <button 
                onClick={() => setShowVerify(false)}
                className="absolute right-4 top-4 text-muted-foreground hover:text-foreground"
              >
                <X className="w-5 h-5" />
              </button>

              <div className="flex justify-center mb-4">
                <div className="w-12 h-12 rounded-full bg-primary/10 text-primary flex items-center justify-center">
                  <Shield className="w-6 h-6" />
                </div>
              </div>
              
              <h3 className="text-xl font-bold text-center mb-1">Verify Phone</h3>
              <p className="text-sm text-center text-muted-foreground mb-6">
                Receive emergency alerts via SMS.
              </p>

              {!otpSent ? (
                <div className="space-y-4">
                  <PhoneInput 
                    value={phone} 
                    onChange={setPhone}
                    onFocus={() => setFocused("phone")} 
                    onBlur={() => setFocused(null)}
                    focused={focused === "phone"} 
                    required 
                  />
                  <button 
                    onClick={handleSendOtp}
                    disabled={loading || !phone}
                    className="w-full h-12 bg-primary text-primary-foreground rounded-2xl font-bold text-[14px] shadow-button disabled:opacity-60 flex items-center justify-center"
                  >
                    {loading ? <span className="flex items-center gap-2"><span className="w-4 h-4 border-2 border-primary-foreground/30 border-t-primary-foreground rounded-full animate-spin" />Sending…</span> : "Send OTP"}
                  </button>
                </div>
              ) : (
                <div className="space-y-4">
                   <p className="text-xs text-center text-muted-foreground">
                    Sent to <span className="font-semibold text-foreground">{formatPhone(phone)}</span>
                  </p>
                  <div className={inputClass("otp")}>
                    <Shield className={iconClass("otp")} />
                    <input 
                      type="tel" inputMode="numeric" value={otp}
                      onChange={e => setOtp(e.target.value.replace(/\D/g, "").slice(0, 6))}
                      onFocus={() => setFocused("otp")} onBlur={() => setFocused(null)}
                      placeholder="6-digit OTP" maxLength={6}
                      className="flex-1 bg-transparent text-center text-lg text-foreground font-bold outline-none tracking-[0.4em]" 
                    />
                  </div>
                  <button 
                    onClick={handleVerifyOtp}
                    disabled={loading || otp.length < 6}
                    className="w-full h-12 bg-primary text-primary-foreground rounded-2xl font-bold text-[14px] shadow-button disabled:opacity-60 flex items-center justify-center"
                  >
                     {loading ? <span className="flex items-center gap-2"><span className="w-4 h-4 border-2 border-primary-foreground/30 border-t-primary-foreground rounded-full animate-spin" />Verifying…</span> : "Verify OTP"}
                  </button>
                  <button 
                    onClick={() => { setOtpSent(false); setOtp(""); setPendingOtp(""); }}
                    className="w-full text-xs text-muted-foreground py-2"
                  >
                    Change phone number
                  </button>
                </div>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>


      {/* Menu */}
      <div className="px-6">
        <p className="text-label mb-3">Settings</p>
        <div className="bg-card rounded-2xl shadow-card overflow-hidden">
          {[
            { label: "Donation History", action: () => navigate("/donation-history") },
            { label: "Medical Info", action: undefined },
            { label: "Notification Preferences", action: undefined },
            { label: "Help & Support", action: undefined },
          ].map((item, i) => (
            <button
              key={item.label}
              onClick={item.action}
              className={`w-full flex items-center justify-between px-4 py-3.5 text-sm font-medium text-foreground ${
                i > 0 ? "border-t border-border" : ""
              }`}
            >
              {item.label}
              <ChevronRight className="w-4 h-4 text-muted-foreground" />
            </button>
          ))}
        </div>

        <button
          onClick={handleSignOut}
          className="w-full mt-4 flex items-center justify-center gap-2 h-12 bg-destructive/10 text-destructive rounded-2xl font-semibold text-sm"
        >
          <LogOut className="w-4 h-4" />
          Sign Out
        </button>
      </div>
    </div>
  );
};

export default ProfileScreen;
