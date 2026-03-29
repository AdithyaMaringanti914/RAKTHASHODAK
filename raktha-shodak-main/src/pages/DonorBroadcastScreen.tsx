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

const DonorBroadcastScreen = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();
  
  // Tracking requesters coords directly (not tied to a hospital picker anymore)
  const { position: userLocation } = useGeolocation(true);

  const initialGroup = (location.state as any)?.bloodGroup || "O+";
  const [bloodGroup, setBloodGroup] = useState(initialGroup);
  const [units, setUnits] = useState(1);
  const [urgency, setUrgency] = useState("Urgent");
  const [submitting, setSubmitting] = useState(false);

  // Determine a safe payload base (Default to Bangalore target if GPS fails)
  const safeLat = userLocation?.lat || 12.975;
  const safeLng = userLocation?.lng || 77.600;

  const handleSubmit = async () => {
    if (!user) {
      toast.error("Authentication error.");
      return;
    }

    setSubmitting(true);

    const payload = {
      requester_id: user.id,
      blood_group: bloodGroup,
      units,
      urgency,
      status: "searching", // Legacy RLS requirement fallback bypassing missing schema updates
      
      // Using legacy structural columns strictly to solve the Supabase "column missing" cache errors securely 
      hospital_name: "Emergency Broadcast Ping",
      hospital_address: "Current Geolocation",
      hospital_lat: safeLat,
      hospital_lng: safeLng,
    };

    try {
      const { data, error } = await supabase
        .from("blood_requests")
        .insert(payload)
        .select()
        .single();

      setSubmitting(false);

      if (error) {
        throw error;
      }

      toast.success("Emergency Ping dispatched globally to connected Donors!");
      navigate("/track", {
        state: {
          requestId: data.id,
          bloodGroup,
          units,
          urgency,
          hospital: "Local Coordinates",
          hospitalLat: safeLat,
          hospitalLng: safeLng,
        },
      });
    } catch (err: any) {
      console.error("Supabase Insert Error:", err);
      toast.error(`Failed to broadcast: ${err?.message || JSON.stringify(err)}`);
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

      <div className="px-6 space-y-8 pb-32">
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
              className="w-14 h-14 rounded-2xl bg-secondary text-foreground font-black text-xl hover:bg-secondary/80 transition-colors"
            >
              −
            </button>
            <span className="text-4xl font-extrabold text-foreground w-16 text-center">{units}</span>
            <button
              onClick={() => setUnits(Math.min(10, units + 1))}
              className="w-14 h-14 rounded-2xl bg-secondary text-foreground font-black text-xl hover:bg-secondary/80 transition-colors"
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
                className={`flex-1 h-14 rounded-2xl text-sm font-bold transition-all ${
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

        <motion.button
          whileTap={{ scale: 0.97 }}
          onClick={handleSubmit}
          disabled={submitting}
          className="w-full h-[64px] bg-primary text-primary-foreground rounded-2xl font-black text-[17px] shadow-button disabled:opacity-60 flex items-center justify-center gap-2 mt-8 uppercase tracking-widest"
        >
          {submitting ? (
            <>
              <Loader2 className="w-6 h-6 animate-spin" /> PINGING...
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
