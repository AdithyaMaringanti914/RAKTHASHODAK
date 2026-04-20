import { useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { ArrowLeft, Loader2, Users } from "lucide-react";
import BloodGroupPicker from "@/components/BloodGroupPicker";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { useGeolocation } from "@/hooks/useGeolocation";

const URGENCY_LEVELS = ["Standard", "Urgent", "Critical"];
const ALERT_RADIUS_KM = 15;

const DonorBroadcastScreen = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, profile } = useAuth();
  
  // Tracking requesters coords directly (not tied to a hospital picker anymore)
  const { position: userLocation } = useGeolocation(true);

  const initialGroup = (location.state as any)?.bloodGroup || "O+";
  const [bloodGroup, setBloodGroup] = useState(initialGroup);
  const [units, setUnits] = useState(1);
  const [urgency, setUrgency] = useState("Urgent");
  const [submitting, setSubmitting] = useState(false);

  // Use live GPS first, then persisted profile coordinates.
  const requesterLat = userLocation?.lat ?? profile?.latitude ?? null;
  const requesterLng = userLocation?.lng ?? profile?.longitude ?? null;
  const hasRequesterLocation = requesterLat != null && requesterLng != null;

  const handleSubmit = async () => {
    if (!user) {
      toast.error("Authentication error.");
      return;
    }
    if (!hasRequesterLocation) {
      toast.error("Location required. Please enable GPS and try again.");
      return;
    }

    setSubmitting(true);

    const payload = {
      requester_id: user.id,
      blood_group: bloodGroup,
      units,
      urgency,
      hospital_name: "Emergency Broadcast Ping",
      hospital_address: "Current Geolocation",
      hospital_lat: requesterLat,
      hospital_lng: requesterLng,
    };

    try {
      const { data: fnData, error: fnError } = await supabase.functions.invoke("requests", {
        body: payload,
      });

      let data = fnData;
      let error = fnError;

      // Fallback: if edge function fails (not deployed/auth issue), try direct insert.
      if (error) {
        const fallback = await supabase
          .from("blood_requests")
          .insert(payload)
          .select()
          .single();
        data = fallback.data;
        error = fallback.error;
      }

      setSubmitting(false);

      if (error) {
        throw error;
      }

      toast.success("Emergency request created. Nearby donors are being alerted in stages.");

      // Stage pipeline:
      // 0-10s: in-app notifications via realtime insert
      // 10-20s: SMS via Twilio
      // 20-30s: voice calls via Twilio
      try {
        // Fetch donors matching blood group directly via client (identical to TrackingScreen)
        const { data: profiles, error: profilesError } = await supabase
          .from("profiles")
          .select("*, user_roles!inner(role)")
          .eq("is_available", true)
          .eq("blood_group", bloodGroup)
          .eq("user_roles.role", "donor");

        if (profilesError) {
          console.error("Donor lookup error:", profilesError);
          toast.warning("Error fetching donor directory.");
        }

        const nearbyDonors = profiles || [];
        
        // Exact same calculation as TrackingScreen
        const donorsWithinRadius = nearbyDonors.filter((d: any) => {
          if (!d.latitude || !d.longitude) return true; // Include donors prioritizing their availability if GPS missing
          const dist = Math.sqrt(Math.pow(d.latitude - requesterLat, 2) + Math.pow(d.longitude - requesterLng, 2)) * 111;
          return dist <= ALERT_RADIUS_KM;
        });

        if (donorsWithinRadius.length === 0) {
          toast.warning("No nearby donors found within 15 km.");
        } else {
          toast.success(
            `Stage 1 started: App notifications active for ${donorsWithinRadius.length} nearby donors (0-10s).`
          );

          const donorPhones = Array.from(
            new Set(
              donorsWithinRadius
                .map((d: any) => d?.phone)
                .filter((phone: unknown): phone is string => typeof phone === "string" && phone.trim().length > 0)
            )
          );

          if (donorPhones.length === 0) {
            toast.warning("Nearby donors found, but none have a valid phone number for SMS escalation.");
          } else {
          const smsLink = `https://www.google.com/maps?q=${requesterLat},${requesterLng}`;
          const rName = profile?.full_name || "A patient";
          const rPhone = profile?.phone || "Unknown";
          const smsBody = `🚨 Emergency Blood Alert: ${rName} (${rPhone}) needs ${units} unit(s) of ${bloodGroup} blood.\n📍 Map: ${smsLink}`;
          const voiceMsg = `Critical alert from Raktha Shodak. ${rName} requires ${units} unit of ${bloodGroup} blood. Please assist immediately.`;

              setTimeout(() => {
                void Promise.allSettled(
                  donorPhones.map((to) =>
                    supabase.functions.invoke("send-emergency-alert", {
                      body: { to, body: smsBody, sendSms: true, sendVoice: false },
                    })
                  )
                )
                  .then((results) => {
                    console.log("[Stage 2] raw results:", JSON.stringify(results));
                    const fulfilled = results.filter((r) => r.status === "fulfilled").map((r) => (r as PromiseFulfilledResult<any>).value);
                    const rejected  = results.filter((r) => r.status === "rejected").map((r) => (r as PromiseRejectedResult).reason);
                    const smsSent   = fulfilled.filter((r) => !r.error && r.data?.success === true).length;
                    const skipped   = fulfilled.filter((r) => !r.error && r.data?.skipped === true).length;
                    const failed    = fulfilled.filter((r) => r.error || (!r.data?.success && !r.data?.skipped)).length;
                    if (smsSent > 0) {
                      toast.success(`Stage 2 complete: SMS sent to ${smsSent} nearby donor(s).${skipped > 0 ? ` (${skipped} skipped – not Twilio-verified)` : ""}`);
                    } else if (skipped > 0 && failed === 0 && rejected.length === 0) {
                      toast.warning(
                        `Stage 2: All ${skipped} number(s) were skipped. For Twilio trial, add E.164 numbers to the edge secret TWILIO_VERIFIED_NUMBERS (or upgrade Twilio).`
                      );
                    } else {
                      const firstFulfillFail = fulfilled.find((r) => r.error || (!r.data?.success && !r.data?.skipped));
                      const details =
                        firstFulfillFail?.error?.message ||
                        firstFulfillFail?.data?.errors?.sms ||
                        firstFulfillFail?.data?.reason ||
                        firstFulfillFail?.data?.error ||
                        (rejected[0] instanceof Error ? rejected[0].message : String(rejected[0] ?? "")) ||
                        `fulfilled=${results.filter(r=>r.status==="fulfilled").length}, rejected=${rejected.length}` ||
                        "Unknown error";
                      toast.error(`Stage 2 failed: ${details}`);
                    }
                  })
                  .catch((smsErr) => {
                    console.error("SMS stage failed:", smsErr);
                    toast.error("Twilio SMS stage failed.");
                  });
              }, 10_000);

              setTimeout(() => {
                void Promise.allSettled(
                  donorPhones.map((to) =>
                    supabase.functions.invoke("send-emergency-alert", {
                      body: { to, voiceMessage: voiceMsg, sendSms: false, sendVoice: true },
                    })
                  )
                )
                  .then((results) => {
                    console.log("[Stage 3] raw results:", JSON.stringify(results));
                    const fulfilled  = results.filter((r) => r.status === "fulfilled").map((r) => (r as PromiseFulfilledResult<any>).value);
                    const rejected   = results.filter((r) => r.status === "rejected").map((r) => (r as PromiseRejectedResult).reason);
                    const callsSent  = fulfilled.filter((r) => !r.error && r.data?.success === true).length;
                    const skipped    = fulfilled.filter((r) => !r.error && r.data?.skipped === true).length;
                    const failed     = fulfilled.filter((r) => r.error || (!r.data?.success && !r.data?.skipped)).length;
                    if (callsSent > 0) {
                      toast.success(`Stage 3 complete: Voice calls sent to ${callsSent} donor(s).${skipped > 0 ? ` (${skipped} skipped – not Twilio-verified)` : ""}`);
                    } else if (skipped > 0 && failed === 0 && rejected.length === 0) {
                      toast.warning(
                        `Stage 3: All ${skipped} number(s) were skipped. For Twilio trial, set TWILIO_VERIFIED_NUMBERS on send-emergency-alert (or upgrade Twilio).`
                      );
                    } else {
                      const firstFulfillFail = fulfilled.find((r) => r.error || (!r.data?.success && !r.data?.skipped));
                      const details =
                        firstFulfillFail?.error?.message ||
                        firstFulfillFail?.data?.errors?.voice ||
                        firstFulfillFail?.data?.reason ||
                        firstFulfillFail?.data?.error ||
                        (rejected[0] instanceof Error ? rejected[0].message : String(rejected[0] ?? "")) ||
                        `fulfilled=${results.filter(r=>r.status==="fulfilled").length}, rejected=${rejected.length}` ||
                        "Unknown error";
                      toast.error(`Stage 3 failed: ${details}`);
                    }
                  })
                  .catch((callErr) => {
                    console.error("Voice stage failed:", callErr);
                    toast.error("Twilio voice stage failed.");
                  });
              }, 20_000);
          }
        }
      } catch (wiringError) {
        console.error("Twilio Wiring Critical Failure:", wiringError);
        toast.error("Wiring Error: Unable to start escalation pipeline.");
      }

      navigate("/track", {
        state: {
          requestId: data?.id,
          bloodGroup,
          units,
          urgency,
          hospital: "Local Coordinates",
          hospitalLat: requesterLat,
          hospitalLng: requesterLng,
        },
      });
    } catch (err) {
      console.error("Supabase Insert Error:", err);
      toast.error(`Failed to broadcast: ${String(err)}`);
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-background max-w-lg mx-auto overflow-x-hidden">
      <div className="px-6 pt-12 pb-4">
        <button onClick={() => navigate(-1)} className="mb-4 text-muted-foreground">
          <ArrowLeft className="w-6 h-6" />
        </button>
        <p className="text-label mb-1">Direct Ping</p>
        <h1 className="text-display">Broadcast to Donors</h1>
      </div>

      <div className="px-6 flex flex-col gap-8 pb-32">
        {/* Radar Placeholder simulating "Show Nearby Donors" requirement visually */}
        <div className="bg-primary/5 rounded-3xl p-6 border border-primary/10 relative overflow-hidden text-center">
            <div className="absolute inset-0 flex items-center justify-center opacity-30 pointer-events-none">
              <motion.div className="w-48 h-48 rounded-full border border-primary/20" animate={{ scale: [1, 1.5], opacity: [0.5, 0] }} transition={{ duration: 2, repeat: Infinity }} />
              <motion.div className="w-32 h-32 rounded-full border border-primary/40 absolute" animate={{ scale: [1, 1.8], opacity: [0.8, 0] }} transition={{ duration: 2, repeat: Infinity, delay: 0.5 }} />
            </div>
            
            <Users className="w-10 h-10 mx-auto text-primary mb-2 relative z-10" />
            <h3 className="font-bold text-foreground text-lg relative z-10">Searching 15km Radius</h3>
            <p className="text-sm font-medium text-muted-foreground relative z-10">We will ping matching users exclusively securely.</p>
        </div>

        <div>
          <label className="text-label mb-3 block">Required Blood Group</label>
          <BloodGroupPicker selected={bloodGroup} onChange={setBloodGroup} />
        </div>

        <div>
          <label className="text-label mb-3 block">Units Required</label>
          <div className="flex items-center gap-4">
            <button
              onClick={() => setUnits(Math.max(1, units - 1))}
              className="w-14 h-14 rounded-2xl bg-secondary text-foreground font-black text-2xl hover:bg-secondary/80 transition-colors flex items-center justify-center flex-shrink-0 border border-border"
            >
              −
            </button>
            <span className="text-4xl font-extrabold text-foreground w-16 text-center">{units}</span>
            <button
              onClick={() => setUnits(Math.min(10, units + 1))}
              className="w-14 h-14 rounded-2xl bg-secondary text-foreground font-black text-2xl hover:bg-secondary/80 transition-colors flex items-center justify-center flex-shrink-0 border border-border"
            >
              +
            </button>
          </div>
        </div>

        <div>
          <label className="text-label mb-3 block">Urgency Level</label>
          <div className="flex gap-2">
            {URGENCY_LEVELS.map((level) => (
              <button
                key={level}
                onClick={() => setUrgency(level)}
                className={`flex-1 h-14 rounded-2xl flex items-center justify-center text-sm font-bold transition-all ${
                  urgency === level
                    ? level === "Critical"
                      ? "bg-primary text-primary-foreground shadow-button"
                      : "bg-foreground text-background"
                    : "bg-secondary text-muted-foreground hover:bg-secondary/80"
                }`}
              >
                {level}
              </button>
            ))}
          </div>
        </div>

        <div className="p-4 rounded-2xl border border-primary/30 bg-primary/5">
          <p className="font-bold text-sm text-foreground mb-1">Escalation Pipeline</p>
          <p className="text-xs text-muted-foreground">
            0-10s: in-app notifications to nearby donors, 10-20s: Twilio SMS, 20-30s: Twilio voice calls.
          </p>
        </div>

        <motion.button
          whileTap={hasRequesterLocation ? { scale: 0.97 } : {}}
          onClick={handleSubmit}
          disabled={submitting || !hasRequesterLocation}
          className="w-full h-16 bg-primary text-primary-foreground rounded-2xl font-black text-[17px] shadow-button disabled:opacity-60 flex items-center justify-center gap-2 uppercase tracking-widest flex-shrink-0"
        >
          {submitting ? (
            <>
              <Loader2 className="w-6 h-6 animate-spin" /> PINGING...
            </>
          ) : !hasRequesterLocation ? (
            <>
              <Loader2 className="w-5 h-5 animate-spin" /> WAITING FOR LOCATION...
            </>
          ) : (
            "🚨 Broadcast Now"
          )}
        </motion.button>
      </div>
    </div>
  );
};

export default DonorBroadcastScreen;
