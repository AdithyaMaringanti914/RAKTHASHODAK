import { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { ArrowLeft, MapPin, Loader2, AlertCircle, Compass, Phone } from "lucide-react";
import { useNearbyHospitals, Hospital } from "@/hooks/useNearbyHospitals";
import { calculateScore } from "@/lib/scoring";

const HospitalDiscoveryScreen = () => {
  const navigate = useNavigate();
  const { hospitals, userLocation, loading, error } = useNearbyHospitals();

  const rankedHospitals = useMemo(() => {
    if (!hospitals.length) return [];
    return hospitals
      .map((h) => ({
        ...h,
        ...calculateScore(h, userLocation, "Standard"),
      }))
      .sort((a, b) => b.score - a.score);
  }, [hospitals, userLocation]);

  const handleDirections = (hospital: Hospital) => {
    window.open(`https://www.google.com/maps/dir/?api=1&destination=${hospital.lat},${hospital.lng}`, "_blank");
  };

  const handleCall = (hospital: Hospital) => {
    // Attempting generic directory redirect if specific number missing from OSM
    window.location.href = `tel:+918000000000`; // Would map to hospital.phone in actual OSM property
  };

  return (
    <div className="min-h-screen bg-background max-w-lg mx-auto overflow-x-hidden">
      <div className="px-6 pt-12 pb-4">
        <button onClick={() => navigate(-1)} className="mb-4 text-muted-foreground">
          <ArrowLeft className="w-6 h-6" />
        </button>
        <p className="text-label mb-1">Self-Service</p>
        <h1 className="text-display min-w-[200px] leading-tight">Find Hospitals & Blood Banks</h1>
      </div>

      <div className="px-6 space-y-6 pb-24">
        <div className="space-y-4">
          {loading ? (
            <div className="flex flex-col items-center gap-3 py-16 text-muted-foreground">
              <Loader2 className="w-8 h-8 animate-spin text-primary" />
              <span className="font-semibold text-sm">Searching your area...</span>
            </div>
          ) : error ? (
            <div className="flex items-center gap-3 p-4 bg-destructive/10 text-destructive rounded-2xl">
              <AlertCircle className="w-6 h-6 flex-shrink-0" />
              <p className="text-sm font-semibold">{error}</p>
            </div>
          ) : rankedHospitals.length > 0 ? (
            <div className="space-y-4">
              {rankedHospitals.map((h, i) => (
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.05 }}
                  key={h.id}
                  className="w-full bg-card shadow-card p-5 rounded-3xl border border-transparent overflow-hidden relative"
                >
                  <div className="flex items-start justify-between gap-2 mb-3">
                    <div className="flex items-start gap-2 max-w-[80%]">
                      <MapPin className="w-5 h-5 mt-0.5 flex-shrink-0 text-primary" />
                      <div>
                        <h3 className="text-base font-bold text-foreground leading-tight">{h.name}</h3>
                        <p className="text-[12px] text-muted-foreground mt-1 line-clamp-2">
                          {h.address}
                        </p>
                      </div>
                    </div>
                    <span className="text-[11px] font-black px-2 py-1 rounded-full bg-secondary text-foreground flex-shrink-0">
                      {h.distanceKm.toFixed(1)} km
                    </span>
                  </div>

                  <div className="flex flex-wrap items-center gap-2 mb-4 ml-7">
                    <span className={`text-[10px] font-black px-2 py-1 rounded-full uppercase tracking-wider ${
                      h.availability === "Likely Available" ? "bg-emerald-500/20 text-emerald-600" :
                      h.availability === "Limited Availability" ? "bg-amber-500/20 text-amber-600" :
                      "bg-rose-500/20 text-rose-600"
                    }`}>
                      {h.availability}
                    </span>
                    <span className="text-[10px] font-bold text-muted-foreground bg-secondary px-2 py-1 rounded-full">
                      {h.type === "blood_bank" ? "Dedicated Blood Bank" : "General Hospital"}
                    </span>
                  </div>

                  <div className="flex gap-3 mt-4">
                    <button
                      onClick={() => handleCall(h)}
                      className="flex-1 h-11 bg-secondary rounded-xl flex items-center justify-center gap-2 text-sm font-semibold hover:bg-secondary/80 transition-colors"
                    >
                      <Phone className="w-4 h-4" /> Call
                    </button>
                    <button
                      onClick={() => handleDirections(h)}
                      className="flex-1 h-11 bg-primary text-primary-foreground rounded-xl flex items-center justify-center gap-2 text-sm font-semibold shadow-button hover:opacity-90 transition-opacity"
                    >
                      <Compass className="w-4 h-4" /> Directions
                    </button>
                  </div>
                </motion.div>
              ))}
            </div>
          ) : (
            <div className="p-8 bg-secondary rounded-3xl text-center">
              <AlertCircle className="w-8 h-8 text-muted-foreground mx-auto mb-3" />
              <p className="text-sm font-semibold text-foreground">No hospitals found</p>
              <p className="text-xs text-muted-foreground mt-1">Try expanding your search radius or checking GPS permissions.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default HospitalDiscoveryScreen;
