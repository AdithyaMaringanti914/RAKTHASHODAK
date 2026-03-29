import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useRealtimeAlerts } from "@/hooks/useRealtimeAlerts";
import { motion, AnimatePresence } from "framer-motion";
import { MapPin, Clock, Loader2 } from "lucide-react";
import StatusBadge from "@/components/StatusBadge";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import type { Database } from "@/integrations/supabase/types";

type BloodRequest = Database["public"]["Tables"]["blood_requests"]["Row"];

const AlertsScreen = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { requests, loading, setRequests } = useRealtimeAlerts();
  const [accepting, setAccepting] = useState<string | null>(null);

  const handleAccept = async (requestId: string) => {
    if (!user) return;
    setAccepting(requestId);

    // 1. Atomic donor assignment (Single SQL update query condition)
    // Only succeeds if exactly one row matches status OPEN and is unassigned
    const { data: updatedRequest, error: updateError } = await supabase
      .from("blood_requests")
      // @ts-ignore - assigned_donor_id hasn't been generated in types yet
      .update({ status: "ASSIGNED", assigned_donor_id: user.id })
      .eq("id", requestId)
      .eq("status", "OPEN")
      .is("assigned_donor_id", null)
      .select()
      .single();

    if (updateError || !updatedRequest) {
      // Error handling: row count = 0 means it didn't meet the conditions
      toast.error("Request already assigned or unavailable");
      setAccepting(null);
      setRequests((prev) => prev.filter((r) => r.id !== requestId));
      return;
    }

    // 2. Insert donor response upon winning the race condition
    const { error: responseError } = await supabase.from("donor_responses").insert({
      request_id: requestId,
      donor_id: user.id,
      status: "ACCEPTED",
      accepted_at: new Date().toISOString(),
    });

    if (responseError) {
      toast.error("Failed to commit donor response");
      setAccepting(null);
      return;
    }

    const req = requests.find((r) => r.id === requestId);
    toast.success("Request accepted successfully!");
    setAccepting(null);

    navigate("/track", {
      state: {
        requestId,
        bloodGroup: req?.blood_group,
        units: req?.units,
        hospital: req?.hospital_name,
        hospitalLat: req?.hospital_lat,
        hospitalLng: req?.hospital_lng,
      },
    });
  };

  const handleDecline = (id: string) => {
    setRequests((prev) => prev.filter((r) => r.id !== id));
  };

  const timeAgo = (dateStr: string) => {
    const diff = Date.now() - new Date(dateStr).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return "just now";
    if (mins < 60) return `${mins} min ago`;
    const hours = Math.floor(mins / 60);
    return `${hours}h ago`;
  };

  return (
    <div className="min-h-screen bg-background max-w-lg mx-auto pb-24">
      <div className="px-6 pt-12 pb-4">
        <p className="text-label mb-1">Incoming</p>
        <h1 className="text-display">Donor Alerts</h1>
      </div>

      <div className="px-6 space-y-4">
        {loading ? (
          <div className="flex justify-center py-20">
            <Loader2 className="w-6 h-6 animate-spin text-primary" />
          </div>
        ) : (
          <AnimatePresence>
            {requests.map((req, i) => (
              <motion.div
                key={req.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, x: -100 }}
                transition={{ delay: i * 0.04 }}
                className="bg-card rounded-3xl p-5 shadow-card"
              >
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-2xl font-bold text-foreground">{req.blood_group}</span>
                      <span className="text-sm text-muted-foreground font-medium">
                        {req.units} Unit{req.units > 1 ? "s" : ""}
                      </span>
                    </div>
                  </div>
                  <StatusBadge status={req.urgency === "Critical" ? "urgent" : "searching"} />
                </div>

                <div className="space-y-2 mb-4">
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <MapPin className="w-3.5 h-3.5 flex-shrink-0" />
                    <span>{req.hospital_name}</span>
                  </div>
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Clock className="w-3.5 h-3.5 flex-shrink-0" />
                    <span>{timeAgo(req.created_at)}</span>
                  </div>
                </div>

                <div className="flex gap-3">
                  <button
                    onClick={() => handleDecline(req.id)}
                    className="flex-1 h-11 bg-secondary text-foreground rounded-xl font-semibold text-sm"
                  >
                    Decline
                  </button>
                  <motion.button
                    whileTap={{ scale: 0.97 }}
                    onClick={() => handleAccept(req.id)}
                    disabled={accepting === req.id}
                    className="flex-1 h-11 bg-primary text-primary-foreground rounded-xl font-bold text-sm shadow-button disabled:opacity-60"
                  >
                    {accepting === req.id ? (
                      <Loader2 className="w-4 h-4 animate-spin mx-auto" />
                    ) : (
                      "Accept"
                    )}
                  </motion.button>
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
        )}

        {!loading && requests.length === 0 && (
          <div className="text-center py-20">
            <p className="text-4xl mb-3">🔔</p>
            <p className="font-semibold text-foreground">No active alerts</p>
            <p className="text-sm text-muted-foreground mt-1">New requests will appear here in real-time</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default AlertsScreen;
