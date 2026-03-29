import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { Locate } from "lucide-react";
import MapView from "@/components/MapView";
import BottomSheet from "@/components/BottomSheet";
import BloodGroupPicker from "@/components/BloodGroupPicker";
import { useGeolocation } from "@/hooks/useGeolocation";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";

interface NearbyDonor {
  id: string;
  lat: number;
  lng: number;
  bloodGroup: string;
  active: boolean;
}

const Index = () => {
  const navigate = useNavigate();
  const { role } = useAuth();
  const [showRequest, setShowRequest] = useState(false);
  const [selectedGroup, setSelectedGroup] = useState("O+");
  const [nearbyDonors, setNearbyDonors] = useState<NearbyDonor[]>([]);

  // Track location and persist to DB if donor
  const { position } = useGeolocation(role === "donor");

  // Fetch nearby donors from profiles
  useEffect(() => {
    const fetchDonors = async () => {
      const { data: donorRoles } = await supabase
        .from("user_roles")
        .select("user_id")
        .eq("role", "donor");

      if (!donorRoles?.length) return;

      const { data: profiles } = await supabase
        .from("profiles")
        .select("user_id, blood_group, latitude, longitude, is_available")
        .in("user_id", donorRoles.map((r) => r.user_id))
        .eq("is_available", true)
        .not("latitude", "is", null);

      if (profiles) {
        setNearbyDonors(
          profiles.map((p) => ({
            id: p.user_id,
            lat: p.latitude!,
            lng: p.longitude!,
            bloodGroup: p.blood_group || "?",
            active: true,
          }))
        );
      }
    };

    fetchDonors();
    const interval = setInterval(fetchDonors, 15000); // refresh every 15s
    return () => clearInterval(interval);
  }, []);

  const mapCenter: [number, number] = position
    ? [position.lat, position.lng]
    : [12.975, 77.600];

  return (
    <div className="relative h-[100dvh] w-full max-w-lg mx-auto overflow-hidden bg-background pb-16">
      <MapView
        donors={nearbyDonors}
        center={mapCenter}
        zoom={13}
        userLocation={position ?? undefined}
        className="absolute inset-0"
      />

      {/* Top bar */}
      <div className="absolute top-0 left-0 right-0 z-[1000] px-6 pt-12 pb-4 pointer-events-none">
        <div className="flex items-center justify-between pointer-events-auto">
          <div>
            <p className="text-label text-muted-foreground">Raktha Shodak</p>
            <h1 className="text-display text-foreground">Nearby Donors</h1>
          </div>
          <div className="flex items-center gap-2">
            {position && (
              <div className="w-10 h-10 rounded-full bg-card shadow-card flex items-center justify-center">
                <Locate className="w-4 h-4 text-accent" />
              </div>
            )}
            <div className="w-10 h-10 rounded-full bg-card shadow-card flex items-center justify-center">
              <span className="text-lg">🩸</span>
            </div>
          </div>
        </div>
      </div>

      {/* Bottom Sheet */}
      {!showRequest ? (
        <BottomSheet>
          <p className="text-label mb-1">Emergency Request</p>
          <p className="text-body text-muted-foreground mb-5">
            {nearbyDonors.length > 0
              ? `${nearbyDonors.length} donor${nearbyDonors.length > 1 ? "s" : ""} available near you`
              : "Searching for nearby donors…"}
          </p>
          <motion.button
            whileTap={{ scale: 0.97 }}
            onClick={() => setShowRequest(true)}
            className="w-full h-[56px] bg-primary text-primary-foreground rounded-2xl font-bold text-base shadow-button"
          >
            Request Blood
          </motion.button>
        </BottomSheet>
      ) : (
        <BottomSheet>
          <p className="text-label mb-1">Select Blood Group</p>
          <p className="text-body text-muted-foreground mb-4">
            Choose the required blood type
          </p>
          <BloodGroupPicker selected={selectedGroup} onChange={setSelectedGroup} />
          <div className="mt-5 flex gap-3">
            <button
              onClick={() => setShowRequest(false)}
              className="flex-1 h-[52px] bg-secondary text-foreground rounded-2xl font-semibold text-sm"
            >
              Cancel
            </button>
            <motion.button
              whileTap={{ scale: 0.97 }}
              onClick={() => navigate("/request", { state: { bloodGroup: selectedGroup } })}
              className="flex-1 h-[52px] bg-primary text-primary-foreground rounded-2xl font-bold text-sm shadow-button"
            >
              Continue
            </motion.button>
          </div>
        </BottomSheet>
      )}
    </div>
  );
};

export default Index;
