import { useState, useMemo } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowLeft, MapPin, Loader2, AlertCircle } from "lucide-react";
import BloodGroupPicker from "@/components/BloodGroupPicker";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { useNearbyHospitals, Hospital } from "@/hooks/useNearbyHospitals";
import { calculateScore } from "@/lib/scoring";

const URGENCY_LEVELS = ["Standard", "Urgent", "Critical"];

const RequestScreen = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();
  const initialGroup = (location.state as any)?.bloodGroup || "O+";

  const { hospitals, userLocation, loading: fetchingHospitals, error: hospitalError } = useNearbyHospitals();

  const [bloodGroup, setBloodGroup] = useState(initialGroup);
  const [units, setUnits] = useState(1);
  const [urgency, setUrgency] = useState("Urgent");

  const rankedHospitals = useMemo(() => {
    if (!hospitals.length) return [];
    return hospitals
      .map((h) => ({
        ...h,
        ...calculateScore(h, userLocation, urgency),
      }))
      .sort((a, b) => b.score - a.score);
  }, [hospitals, userLocation, urgency]);

  const [selectedHospital, setSelectedHospital] = useState<Hospital | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async () => {
    console.log("[STEP 1] Button Clicked! handleSubmit triggered. User ID:", user?.id);

    if (!user) {
      console.warn("[STEP 1 FAIL] User is not authenticated. Aborting.");
      return;
    }
    if (!selectedHospital) {
      toast.error("Please select a hospital from the list.");
      return;
    }
    setSubmitting(true);

    const payload = {
      requester_id: user.id,
      blood_group: bloodGroup,
      units,
      urgency,
      status: "searching", // explicitly ensuring OPEN status
      hospital_name: selectedHospital.name,
      hospital_address: selectedHospital.address,
      hospital_lat: selectedHospital.lat,
      hospital_lng: selectedHospital.lng,
    };

    console.log("[STEP 2] Sending request payload to Supabase:", payload);

    try {
      const { data, error } = await supabase
        .from("blood_requests")
        .insert(payload)
        .select()
        .single();

      console.log("[STEP 3] Insert response from Supabase DB:", { data, error });
      
      setSubmitting(false);

      if (error) {
        console.error("[STEP 3 ERROR] Supabase insert failed:", error);
        toast.error(error.message);
        return;
      }

      toast.success("Request broadcast to nearby donors!");
      navigate("/track", {
        state: {
          requestId: data.id,
          bloodGroup,
          units,
          urgency,
          hospital: selectedHospital.name,
          hospitalLat: selectedHospital.lat,
          hospitalLng: selectedHospital.lng,
        },
      });
    } catch (err) {
      console.error("[STEP 7 ERROR] Uncaught exception during handleSubmit:", err);
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-background max-w-lg mx-auto overflow-x-hidden">
      {/* Header */}
      <div className="px-6 pt-12 pb-4">
        <button onClick={() => navigate(-1)} className="mb-4 text-muted-foreground">
          <ArrowLeft className="w-6 h-6" />
        </button>
        <p className="text-label mb-1">New Request</p>
        <h1 className="text-display">Request Blood</h1>
      </div>

      <div className="px-6 space-y-6 pb-32">
        {/* Blood Group */}
        <div>
          <label className="text-label mb-3 block">Blood Group</label>
          <BloodGroupPicker selected={bloodGroup} onChange={setBloodGroup} />
        </div>

        {/* Units */}
        <div>
          <label className="text-label mb-3 block">Units Required</label>
          <div className="flex items-center gap-4">
            <button
              onClick={() => setUnits(Math.max(1, units - 1))}
              className="w-12 h-12 rounded-xl bg-secondary text-foreground font-bold text-lg"
            >
              −
            </button>
            <span className="text-3xl font-bold text-foreground w-12 text-center">{units}</span>
            <button
              onClick={() => setUnits(Math.min(10, units + 1))}
              className="w-12 h-12 rounded-xl bg-secondary text-foreground font-bold text-lg"
            >
              +
            </button>
          </div>
        </div>

        {/* Urgency */}
        <div>
          <label className="text-label mb-3 block">Urgency Level</label>
          <div className="flex gap-2">
            {URGENCY_LEVELS.map((level) => (
              <button
                key={level}
                onClick={() => setUrgency(level)}
                className={`flex-1 h-11 rounded-xl text-sm font-semibold transition-all ${
                  urgency === level
                    ? level === "Critical"
                      ? "bg-primary text-primary-foreground shadow-button"
                      : "bg-foreground text-background"
                    : "bg-secondary text-muted-foreground"
                }`}
              >
                {level}
              </button>
            ))}
          </div>
        </div>

        {/* Dynamic Hospitals */}
        <div>
          <label className="text-label mb-3 block">Select Hospital Location</label>
          
          <div className="space-y-3">
            {fetchingHospitals ? (
              <div className="flex items-center gap-3 p-6 bg-secondary rounded-2xl justify-center text-muted-foreground">
                <Loader2 className="w-5 h-5 animate-spin text-primary" />
                <span className="font-semibold text-sm">Finding nearby hospitals...</span>
              </div>
            ) : hospitalError ? (
              <div className="flex items-center gap-3 p-4 bg-destructive/10 text-destructive rounded-2xl">
                <AlertCircle className="w-5 h-5 flex-shrink-0" />
                <p className="text-sm font-semibold">{hospitalError}</p>
              </div>
            ) : rankedHospitals.length > 0 ? (
              <div className="max-h-[280px] overflow-y-auto pr-1 space-y-2 snap-y">
                {rankedHospitals.map((h, i) => {
                  const isSelected = selectedHospital?.id === h.id;
                  const isTopMatch = i === 0;
                  
                  return (
                    <motion.button
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: i * 0.05 }}
                      whileTap={{ scale: 0.98 }}
                      key={h.id}
                      onClick={() => setSelectedHospital(h)}
                      className={`w-full text-left flex items-start gap-3 p-4 rounded-2xl border-2 transition-all snap-start relative overflow-hidden ${
                        isSelected 
                          ? "border-primary bg-primary/5 shadow-button" 
                          : "border-transparent bg-secondary"
                      }`}
                    >
                      {isTopMatch && (
                        <div className="absolute top-0 right-0 bg-primary text-primary-foreground text-[10px] font-black px-3 py-1 rounded-bl-xl tracking-wider uppercase">
                          ★ Recommended
                        </div>
                      )}

                      <MapPin className={`w-5 h-5 mt-0.5 flex-shrink-0 ${isSelected ? 'text-primary' : (isTopMatch ? 'text-primary' : 'text-muted-foreground')}`} />
                      <div className="flex-1 min-w-0 pr-16 text-left">
                        <div className="flex justify-between items-start gap-2">
                          <p className={`text-sm font-bold truncate ${isSelected ? 'text-primary' : 'text-foreground'}`}>
                            {h.name}
                          </p>
                          <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-background flex-shrink-0">
                            {h.distanceKm.toFixed(1)} km
                          </span>
                        </div>
                        <p className="text-[11px] text-muted-foreground mt-1 line-clamp-1">
                          {h.address}
                        </p>
                        
                        <div className="mt-2 text-left flex flex-wrap items-center gap-2">
                          <span className={`text-[10px] font-black px-2 py-1 rounded-full uppercase tracking-wider ${
                            h.availability === "Likely Available" ? "bg-emerald-500/20 text-emerald-600" :
                            h.availability === "Limited Availability" ? "bg-amber-500/20 text-amber-600" :
                            "bg-rose-500/20 text-rose-600"
                          }`}>
                            {h.availability}
                          </span>
                          
                          {/* Reason Badge */}
                          <span className="text-[10px] font-bold text-muted-foreground bg-background px-2 py-1 rounded-full border border-border">
                            {h.reason}
                          </span>
                        </div>
                      </div>
                    </motion.button>
                  );
                })}
              </div>
            ) : (
              <div className="p-4 bg-secondary rounded-2xl text-center text-sm font-semibold text-muted-foreground">
                No hospitals found within 5km.
              </div>
            )}
          </div>
        </div>

        {/* Submit */}
        <motion.button
          whileTap={{ scale: 0.97 }}
          onClick={handleSubmit}
          disabled={submitting || !selectedHospital}
          className="w-full h-[60px] bg-primary text-primary-foreground rounded-2xl font-bold text-base shadow-button disabled:opacity-60 flex items-center justify-center gap-2 mt-4"
        >
          {submitting ? (
            <>
              <Loader2 className="w-5 h-5 animate-spin" />
              Broadcasting…
            </>
          ) : (
            "Broadcast to Nearby Donors"
          )}
        </motion.button>
      </div>
    </div>
  );
};

export default RequestScreen;
