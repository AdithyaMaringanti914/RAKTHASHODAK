import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { Locate, Phone, MessageSquare } from "lucide-react";
import MapView from "@/components/MapView";
import BottomSheet from "@/components/BottomSheet";
import BloodGroupPicker from "@/components/BloodGroupPicker";
import ChatSheet from "@/components/ChatSheet";
import { useGeolocation } from "@/hooks/useGeolocation";
import { useAuth } from "@/contexts/AuthContext";
import { useRealtimeAlerts } from "@/hooks/useRealtimeAlerts";
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
  const { role, user } = useAuth();
  const [viewMode, setViewMode] = useState<"donor" | "requester">((role as "donor" | "requester") || "requester");
  const [showRequest, setShowRequest] = useState(false);
  const [selectedGroup, setSelectedGroup] = useState("O+");
  const [nearbyDonors, setNearbyDonors] = useState<NearbyDonor[]>([]);
  const [showUniversal, setShowUniversal] = useState(false);
  
  const { requests } = useRealtimeAlerts();
  const [selectedRequest, setSelectedRequest] = useState<any>(null);
  const [chatOpen, setChatOpen] = useState(false);

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

  const displayedDonors = showUniversal
    ? nearbyDonors.filter((d) => d.bloodGroup === "O-")
    : nearbyDonors;

  // Requesters should see donors (but not themselves). Donors shouldn't see other donors.
  const visibleDonors = viewMode === "requester" 
    ? displayedDonors.filter((d) => d.id !== user?.id) 
    : [];

  // Donors should see requests (but not their own). Requesters shouldn't see requests.
  const visibleRequests = viewMode === "donor" 
    ? requests.filter((r) => r.requester_id !== user?.id) 
    : [];

  return (
    <div className="relative h-[100dvh] w-full max-w-lg mx-auto overflow-hidden bg-background pb-16">
      <MapView
        donors={visibleDonors}
        requests={visibleRequests}
        onRequestClick={(req) => setSelectedRequest(req)}
        center={mapCenter}
        zoom={13}
        userLocation={position ?? undefined}
        className="absolute inset-0"
      />

      {/* Top bar */}
      <div className="absolute top-0 left-0 right-0 z-[1000] px-6 pt-12 pb-4 pointer-events-none">
        <div className="flex items-center justify-between pointer-events-auto">
          <div>
            <p className="text-label text-muted-foreground flex items-center gap-2">
              Raktha Shodak 
              <span className="text-[10px]">•</span> 
              <button 
                onClick={async () => {
                  const newMode = viewMode === "donor" ? "requester" : "donor";
                  setViewMode(newMode);
                  // Ensure local role matches the view to satisfy RLS during actions
                  if (user) {
                    try {
                      await supabase.from("user_roles").upsert({ user_id: user.id, role: newMode });
                    } catch (e) {
                      console.warn("Role sync issue:", e);
                    }
                  }
                }}
                className="bg-secondary/50 hover:bg-secondary px-2 py-0.5 rounded text-xs font-bold transition-colors"
                title="Switch Context"
              >
                {viewMode === "donor" ? "Donor View" : "Requester View"}
              </button>
            </p>
            <h1 className="text-display text-foreground">
              {viewMode === "donor" ? "Active Alerts" : "Nearby Donors"}
            </h1>
          </div>
          <div className="flex items-center gap-2">
            {position && (
              <div 
                className="w-10 h-10 rounded-full bg-card shadow-card flex items-center justify-center cursor-pointer active:scale-95 transition-transform"
                onClick={() => {
                  window.dispatchEvent(
                    new CustomEvent("recenter-map", {
                      detail: { lat: position.lat, lng: position.lng }
                    })
                  );
                }}
              >
                <Locate className="w-4 h-4 text-accent" />
              </div>
            )}
            <div 
              className={`w-10 h-10 rounded-full bg-card shadow-card flex items-center justify-center cursor-pointer active:scale-95 transition-all ${
                showUniversal ? 'ring-2 ring-primary ring-offset-2 ring-offset-background' : ''
              }`}
              onClick={() => setShowUniversal((prev) => !prev)}
              title="Show Universal Donors (O-)"
            >
              <span className="text-lg">🩸</span>
            </div>
          </div>
        </div>
      </div>

      {/* Bottom Sheet */}
      {selectedRequest ? (
        <BottomSheet>
          <div className="flex items-start justify-between mb-4">
            <div>
              <p className="text-label mb-1">Emergency Ping</p>
              <p className="text-display leading-tight mb-2">Blood Needed</p>
              <p className="text-body text-muted-foreground font-bold">
                {selectedRequest.blood_group} • {selectedRequest.units} Units • {selectedRequest.hospital_name || "Unknown Location"}
              </p>
            </div>
            <span className="bg-primary/20 text-primary px-3 py-1 font-black text-xs uppercase tracking-wider rounded-full h-min">
              {selectedRequest.urgency || "URGENT"}
            </span>
          </div>

          <div className="flex gap-3 mt-6">
            <button 
              onClick={() => setSelectedRequest(null)}
              className="w-12 h-12 bg-secondary rounded-2xl flex items-center justify-center flex-shrink-0 text-foreground hover:bg-secondary/80"
              title="Close"
            >
              ✕
            </button>
            <button className="flex-1 h-12 bg-primary rounded-2xl flex items-center justify-center gap-2 text-sm font-black text-primary-foreground shadow-button">
              <Phone className="w-4 h-4" /> Call
            </button>
            <button
              onClick={() => setChatOpen(true)}
              className="flex-1 h-12 bg-accent rounded-2xl flex items-center justify-center gap-2 text-sm font-black text-accent-foreground shadow-button"
            >
              <MessageSquare className="w-4 h-4" /> Message
            </button>
          </div>
        </BottomSheet>
      ) : !showRequest ? (
        <BottomSheet>
          {viewMode === "requester" ? (
            <>
              <p className="text-label mb-1">Emergency Request</p>
              <p className="text-body text-muted-foreground mb-5">
                {displayedDonors.length > 0
                  ? `${displayedDonors.length} donor${displayedDonors.length > 1 ? "s" : ""} available near you${showUniversal ? " (Universal)" : ""}`
                  : "Searching for nearby donors…"}
              </p>
              <motion.button
                whileTap={{ scale: 0.97 }}
                onClick={() => setShowRequest(true)}
                className="w-full h-[56px] bg-primary text-primary-foreground rounded-2xl font-bold text-base shadow-button"
              >
                Request Blood
              </motion.button>
            </>
          ) : (
            <>
              <p className="text-label mb-1">Donor Watch</p>
              <p className="text-body text-muted-foreground mb-5">
                {visibleRequests.length > 0
                  ? `${visibleRequests.length} emergency request${visibleRequests.length > 1 ? "s" : ""} nearby`
                  : "No active emergencies right now. You're on standby."}
              </p>
              <motion.button
                whileTap={{ scale: 0.97 }}
                onClick={() => navigate("/alerts")}
                className="w-full h-[56px] bg-accent text-accent-foreground rounded-2xl font-bold text-base shadow-button"
              >
                View Alerts Board
              </motion.button>
            </>
          )}
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

      {/* Chat popup rendered out-of-flow */}
      {selectedRequest && (
        <ChatSheet requestId={selectedRequest.id} open={chatOpen} onClose={() => setChatOpen(false)} />
      )}
    </div>
  );
};

export default Index;
