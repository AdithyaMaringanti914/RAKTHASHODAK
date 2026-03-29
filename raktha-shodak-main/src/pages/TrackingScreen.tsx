import { useState, useEffect } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { motion } from "framer-motion";
import { ArrowLeft, Phone, MessageSquare } from "lucide-react";
import MapView from "@/components/MapView";
import ChatSheet from "@/components/ChatSheet";
import BottomSheet from "@/components/BottomSheet";
import StatusBadge from "@/components/StatusBadge";
import { useGeolocation } from "@/hooks/useGeolocation";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";

const TrackingScreen = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { role, user } = useAuth();
  const requestData = (location.state as any) || {};

  const hospitalLat = requestData.hospitalLat || 12.975;
  const hospitalLng = requestData.hospitalLng || 77.600;
  const requestId = requestData.requestId;

  // If user is a donor, track their real GPS and push to DB
  const isDonor = role === "donor";
  const { position: gpsPosition } = useGeolocation(isDonor);

  const [chatOpen, setChatOpen] = useState(false);
  const [status, setStatus] = useState<"OPEN" | "ASSIGNED" | "EN_ROUTE" | "ARRIVED" | "COMPLETED">(
    requestData.requestId && isDonor ? "ASSIGNED" : "OPEN"
  );
  const [eta, setEta] = useState(12);
  const [donorPos, setDonorPos] = useState({ lat: hospitalLat + 0.015, lng: hospitalLng - 0.012 });

  // If donor with GPS, use real position
  useEffect(() => {
    if (isDonor && gpsPosition) {
      setDonorPos(gpsPosition);
    }
  }, [isDonor, gpsPosition]);

  // Update donor_response location in DB when donor moves
  useEffect(() => {
    if (!isDonor || !gpsPosition || !requestId || !user) return;

    const updateLocation = async () => {
      await supabase
        .from("donor_responses")
        .update({
          donor_lat: gpsPosition.lat,
          donor_lng: gpsPosition.lng,
          // Sync location but don't overwrite if they arrived
          status: status === "ARRIVED" ? "ARRIVED" : "EN_ROUTE",
        })
        .eq("request_id", requestId)
        .eq("donor_id", user.id);
    };

    updateLocation();
  }, [gpsPosition, isDonor, requestId, user, status]);

  // For requester: subscribe to donor_responses to get live donor position
  useEffect(() => {
    if (isDonor || !requestId) return;

    const channel = supabase
      .channel(`tracking-${requestId}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "donor_responses",
          filter: `request_id=eq.${requestId}`,
        },
        (payload) => {
          const row = payload.new as any;
          if (row.donor_lat && row.donor_lng) {
            setDonorPos({ lat: row.donor_lat, lng: row.donor_lng });
          }
          if (row.status === "EN_ROUTE") setStatus("EN_ROUTE");
          if (row.status === "ARRIVED") setStatus("ARRIVED");
        }
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "blood_requests",
          filter: `id=eq.${requestId}`,
        },
        (payload) => {
          const row = payload.new as any;
          if (row.status === "ASSIGNED") setStatus("ASSIGNED");
          if (row.status === "FAILED") alert("This request has timed out and failed.");
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [isDonor, requestId]);

  // Simulate movement if no real GPS and no real request
  useEffect(() => {
    if (requestId || isDonor) return;
    if (status !== "EN_ROUTE") return;
    const interval = setInterval(() => {
      setDonorPos((prev) => ({
        lat: prev.lat + (hospitalLat - prev.lat) * 0.1,
        lng: prev.lng + (hospitalLng - prev.lng) * 0.1,
      }));
      setEta((prev) => Math.max(0, prev - 1));
    }, 1000);
    return () => clearInterval(interval);
  }, [status, hospitalLat, hospitalLng, requestId, isDonor]);

  // Calculate ETA based on distance
  useEffect(() => {
    if (status !== "EN_ROUTE") return;
    const dist = Math.sqrt(
      (donorPos.lat - hospitalLat) ** 2 + (donorPos.lng - hospitalLng) ** 2
    );
    const kmApprox = dist * 111;
    const etaMins = Math.max(1, Math.round(kmApprox * 3)); // ~20km/h avg
    setEta(etaMins);

    if (kmApprox < 0.05) setStatus("ARRIVED");
  }, [donorPos, hospitalLat, hospitalLng, status]);

  // Donor controls
  const handleMarkEnRoute = async () => {
    setStatus("EN_ROUTE");
    if (requestId && user) {
      await supabase
        .from("donor_responses")
        .update({ status: "EN_ROUTE" })
        .eq("request_id", requestId)
        .eq("donor_id", user.id);
      await supabase
        .from("blood_requests")
        .update({ status: "EN_ROUTE" })
        .eq("id", requestId);
    }
  };

  const handleMarkArrived = async () => {
    setStatus("ARRIVED");
    if (requestId && user) {
      await supabase
        .from("donor_responses")
        .update({ status: "ARRIVED", accepted_at: new Date().toISOString() }) // simulating arrived_at 
        .eq("request_id", requestId)
        .eq("donor_id", user.id);
      await supabase
        .from("blood_requests")
        .update({ status: "COMPLETED" })
        .eq("id", requestId);
    }
  };

  return (
    <div className="relative h-screen w-full max-w-lg mx-auto overflow-hidden bg-background">
      <MapView
        donors={[]}
        hospitalMarker={{ lat: hospitalLat, lng: hospitalLng, name: requestData.hospital || "Dispatch Target" }}
        donorTrack={status !== "OPEN" ? donorPos : undefined}
        showRoute={status === "EN_ROUTE"}
        center={[hospitalLat, hospitalLng]}
        zoom={14}
        userLocation={gpsPosition ?? undefined}
      />

      {/* Back button */}
      <div className="absolute top-12 left-6 z-[1000]">
        <button
          onClick={() => navigate("/")}
          className="w-10 h-10 bg-card rounded-full shadow-card flex items-center justify-center"
        >
          <ArrowLeft className="w-5 h-5 text-foreground" />
        </button>
      </div>

      {/* Searching overlay */}
      {status === "OPEN" && (
        <div className="absolute inset-0 flex items-center justify-center z-[999] pointer-events-none">
          <div className="text-center">
             <div className="bg-background/80 backdrop-blur-md px-6 py-8 rounded-3xl shadow-2xl border border-border">
                <motion.div
                  className="w-24 h-24 rounded-full border-4 border-primary/40 mx-auto mb-4"
                  animate={{ scale: [1, 1.5, 1], opacity: [0.8, 0, 0.8] }}
                  transition={{ duration: 1.5, repeat: Infinity }}
                />
                <p className="text-xl font-bold text-foreground">Awaiting Donor</p>
                <p className="text-sm text-muted-foreground mt-1 text-center max-w-[200px] mx-auto">
                    Your emergency request is visible to community proxies in range.
                </p>
             </div>
          </div>
        </div>
      )}

      {/* Bottom sheet */}
      {status !== "OPEN" && (
        <BottomSheet>
          <div className="flex items-start justify-between mb-4">
            <div>
              <p className="text-label mb-1">{isDonor ? "Your Delivery" : "Donor Found"}</p>
              <p className="text-display min-w-[150px] leading-tight mb-2">
                 {status === "ASSIGNED" ? (isDonor ? "Awaiting Start" : "Donor Assigned") : 
                  status === "EN_ROUTE" ? (isDonor ? "Navigate to Target" : "Donor En Route") : 
                  (isDonor ? "Target Reached" : "Donor Arrived")}
              </p>
              <p className="text-body text-muted-foreground font-bold">
                {requestData.bloodGroup || "Emergency"} • {requestData.units || 1} Units
              </p>
            </div>
            
            {/* Status Visualizer placeholder to bypass old Badge types */}
            <span className="bg-primary/20 text-primary px-3 py-1 font-black text-xs uppercase tracking-wider rounded-full h-min whitespace-nowrap">
              {status.replace("_", " ")}
            </span>
          </div>

          {status === "EN_ROUTE" && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="bg-secondary rounded-2xl p-4 mb-4">
              <p className="text-label mb-1">Estimated Arrival</p>
              <div className="flex items-baseline gap-1">
                <span className="text-4xl font-bold text-foreground">{eta}</span>
                <span className="text-sm text-muted-foreground font-medium">min</span>
              </div>
            </motion.div>
          )}

          {status === "ARRIVED" && (
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="bg-success/10 rounded-2xl p-5 mb-4 text-center border border-success/20"
            >
              <div className="w-12 h-12 rounded-full bg-success text-success-foreground mx-auto flex items-center justify-center font-black text-2xl mb-2">
                ✓
              </div>
              <p className="font-bold text-success text-lg">{isDonor ? "You have arrived successfully" : "Donor has arrived"}</p>
              <p className="text-xs text-muted-foreground mt-1">Please coordinate the handover.</p>
            </motion.div>
          )}

          {/* Donor action buttons */}
          {isDonor && status === "ASSIGNED" && (
            <motion.button
              whileTap={{ scale: 0.97 }}
              onClick={handleMarkEnRoute}
              className="w-full h-14 bg-accent text-accent-foreground rounded-2xl font-black text-[15px] shadow-button mb-3 uppercase tracking-wider"
            >
              Start Navigation
            </motion.button>
          )}
          {isDonor && status === "EN_ROUTE" && (
            <motion.button
              whileTap={{ scale: 0.97 }}
              onClick={handleMarkArrived}
              className="w-full h-14 bg-success text-success-foreground rounded-2xl font-black text-[15px] mb-3 uppercase tracking-wider shadow-button hover:bg-success/90 transition-colors"
            >
              Mark as Arrived
            </motion.button>
          )}

          <div className="flex gap-3">
            <button className="flex-1 h-12 bg-secondary rounded-2xl flex items-center justify-center gap-2 text-sm font-semibold text-foreground hover:bg-secondary/80">
              <Phone className="w-4 h-4" /> Call
            </button>
            <button
              onClick={() => requestId && setChatOpen(true)}
              className="flex-1 h-12 bg-secondary rounded-2xl flex items-center justify-center gap-2 text-sm font-semibold text-foreground hover:bg-secondary/80"
            >
              <MessageSquare className="w-4 h-4" /> Message
            </button>
          </div>
        </BottomSheet>
      )}

      {requestId && (
        <ChatSheet requestId={requestId} open={chatOpen} onClose={() => setChatOpen(false)} />
      )}
    </div>
  );
};

export default TrackingScreen;
