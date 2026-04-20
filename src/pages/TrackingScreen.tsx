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
import { toast } from "sonner";

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
  const [nearbyDonors, setNearbyDonors] = useState<any[]>([]);
  const [timeLeft, setTimeLeft] = useState(300); // 5 minutes in seconds

  // Periodically fetch available donors nearby (within 15km)
  useEffect(() => {
    if (isDonor || status !== "OPEN") return;
    const fetchNearby = async () => {
      const { data } = await supabase
        .from('profiles')
        .select('*, user_roles!inner(role)')
        .eq('is_available', true)
        .eq('blood_group', requestData.bloodGroup || "O+")
        .eq('user_roles.role', 'donor');
      if (data) {
        const filtered = data.filter((d: any) => {
          if (!d.latitude || !d.longitude) return false;
          // Approximate Euclidean bounds logic for UI proximity rendering
          const dist = Math.sqrt(Math.pow(d.latitude - hospitalLat, 2) + Math.pow(d.longitude - hospitalLng, 2)) * 111;
          return dist <= 15;
        });
        setNearbyDonors(filtered);
      }
    };
    fetchNearby();
    const interval = setInterval(fetchNearby, 8000);
    return () => clearInterval(interval);
  }, [isDonor, status, hospitalLat, hospitalLng]);

  // Handle 5 minute timeout logic
  useEffect(() => {
    if (isDonor || status !== "OPEN" || !requestId) return;

    if (timeLeft <= 0) {
      const failRequest = async () => {
        await supabase
          .from("blood_requests")
          .update({ status: "FAILED" })
          .eq("id", requestId);
        
        toast.error("Request Timed Out", {
          description: "No donors were able to accept your request in time. Please try broadcasting again.",
        });
        navigate("/");
      };
      failRequest();
      return;
    }

    const timer = setInterval(() => setTimeLeft((t) => t - 1), 1000);
    return () => clearInterval(timer);
  }, [timeLeft, status, isDonor, requestId, navigate]);

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
          if (row.status === "ASSIGNED" || row.status === "assigned") setStatus("ASSIGNED");
          if (row.status === "FAILED") alert("This request has timed out and failed.");
          if (row.status === "searching") setStatus("OPEN");
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
        donors={nearbyDonors}
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

      {/* Navigation elements moved into BottomSheet for layout consistency */}
      <BottomSheet>
        {status === "OPEN" ? (
          <div className="py-2">
            <div className="flex flex-col items-center mb-6">
              <motion.div
                className="w-14 h-14 rounded-full border-4 border-primary/40 mb-3"
                animate={{ scale: [1, 1.2, 1], opacity: [0.8, 0.4, 0.8] }}
                transition={{ duration: 1.5, repeat: Infinity }}
              />
              <h2 className="text-xl font-bold text-foreground">Awaiting Donor</h2>
              <p className="text-sm text-muted-foreground mt-1 text-center font-medium">Searching for available matches...</p>
              
              <div className="mt-4 flex items-center justify-center gap-2 bg-primary/10 px-4 py-2 rounded-full border border-primary/20">
                <span className="text-xs font-black text-primary uppercase tracking-widest">Timeout In</span>
                <span className="text-sm font-bold text-primary font-mono tracking-tighter">
                  {Math.floor(timeLeft / 60)}:{String(timeLeft % 60).padStart(2, '0')}
                </span>
              </div>
            </div>

            {nearbyDonors.length > 0 && (
              <div className="w-full text-left bg-secondary/30 rounded-2xl p-4">
                <p className="text-[11px] font-black uppercase tracking-wider text-muted-foreground mb-3">
                  {nearbyDonors.length} Potential Match{(nearbyDonors.length !== 1) ? 'es' : ''} Pinging
                </p>
                <div className="space-y-3 max-h-[40vh] overflow-y-auto pr-1 custom-scrollbar">
                  {nearbyDonors.map(donor => (
                    <div key={donor.id} className="flex items-center gap-3 bg-card p-3 rounded-xl border border-border/50">
                      <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center text-primary font-black flex-shrink-0">
                        {donor.blood_group || "?"}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-bold text-sm text-foreground truncate">{donor.full_name}</p>
                        <p className="text-xs text-muted-foreground flex items-center gap-2 mt-0.5 font-medium">
                          <span>⭐ {donor.reliability_score?.toFixed(1) || "5.0"}</span>
                          <span>• {donor.total_donations || 0} donations</span>
                        </p>
                      </div>
                      <div className="text-[10px] text-muted-foreground text-right flex-shrink-0 font-medium">
                        Last Active<br/>
                        <span className="font-bold text-foreground opacity-80">{donor.last_donation_date ? new Date(donor.last_donation_date).toLocaleDateString() : "Recently"}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        ) : (
          <>
            <div className="flex items-start justify-between mb-4">
              <div>
                <p className="text-label mb-1">{isDonor ? "Your Delivery" : "Donor Found"}</p>
                <p className="text-display min-w-[150px] leading-tight mb-2 uppercase">
                   {status === "ASSIGNED" ? (isDonor ? "Awaiting Start" : "Donor Assigned") : 
                    status === "EN_ROUTE" ? (isDonor ? "In Transit" : "Donor En Route") : 
                    (isDonor ? "Arrived" : "Donor Arrived")}
                </p>
                <p className="text-body text-muted-foreground font-bold">
                  {requestData.bloodGroup || "Emergency"} • {requestData.units || 1} Units
                </p>
              </div>
              
              <span className="bg-primary/20 text-primary px-3 py-1 font-black text-xs uppercase tracking-wider rounded-full h-min">
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
                <p className="font-bold text-success text-lg">{isDonor ? "Target Reached" : "Donor Arrived"}</p>
                <p className="text-xs text-muted-foreground mt-1 font-medium">Coordinate the handover via chat or call.</p>
              </motion.div>
            )}

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
                className="w-full h-14 bg-success text-success-foreground rounded-2xl font-black text-[15px] mb-3 uppercase tracking-wider shadow-button"
              >
                Mark as Arrived
              </motion.button>
            )}

            <div className="flex gap-3 mt-2">
              <button className="flex-1 h-12 bg-secondary rounded-2xl flex items-center justify-center gap-2 text-sm font-bold text-foreground hover:bg-secondary/80 transition-all">
                <Phone className="w-4 h-4" /> Call
              </button>
              <button
                onClick={() => requestId && setChatOpen(true)}
                className="flex-1 h-12 bg-secondary rounded-2xl flex items-center justify-center gap-2 text-sm font-bold text-foreground hover:bg-secondary/80 transition-all"
              >
                <MessageSquare className="w-4 h-4" /> Message
              </button>
            </div>
          </>
        )}
      </BottomSheet>

      {requestId && (
        <ChatSheet requestId={requestId} open={chatOpen} onClose={() => setChatOpen(false)} />
      )}
    </div>
  );
};

export default TrackingScreen;
