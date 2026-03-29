import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { Clock, CheckCircle2, XCircle, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { format, formatDistanceToNow } from "date-fns";

interface ActivityItem {
  id: string;
  bloodGroup: string;
  hospital: string;
  status: "completed" | "declined" | "pending" | "en-route" | "accepted";
  time: string;
  units: number;
}

const statusIcons: Record<string, React.ReactNode> = {
  completed: <CheckCircle2 className="w-4 h-4 text-success" />,
  declined: <XCircle className="w-4 h-4 text-destructive" />,
  pending: <Clock className="w-4 h-4 text-accent" />,
  accepted: <CheckCircle2 className="w-4 h-4 text-accent" />,
  "en-route": <Clock className="w-4 h-4 text-accent" />,
};

const DashboardScreen = () => {
  const { user, role } = useAuth();
  const [activity, setActivity] = useState<ActivityItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({ total: 0, accepted: 0, avgResponse: "—" });

  useEffect(() => {
    if (!user) return;

    const fetchData = async () => {
      if (role === "donor") {
        // Donor: fetch their responses joined with requests
        const { data: responses } = await supabase
          .from("donor_responses")
          .select("*, blood_requests(*)")
          .eq("donor_id", user.id)
          .order("created_at", { ascending: false })
          .limit(20);

        if (responses) {
          const items: ActivityItem[] = responses.map((r) => {
            const req = r.blood_requests as any;
            let itemStatus: ActivityItem["status"] = "pending";
            if (r.status === "accepted" || r.status === "en-route") itemStatus = r.status as any;
            if (r.status === "arrived" || r.status === "completed") itemStatus = "completed";
            if (r.status === "declined") itemStatus = "declined";

            return {
              id: r.id,
              bloodGroup: req?.blood_group || "?",
              hospital: req?.hospital_name || "Unknown",
              status: itemStatus,
              time: formatDistanceToNow(new Date(r.created_at), { addSuffix: true }),
              units: req?.units || 1,
            };
          });
          setActivity(items);

          const accepted = responses.filter((r) =>
            ["accepted", "en-route", "arrived", "completed"].includes(r.status)
          ).length;

          // Avg response time
          const responseTimes = responses
            .filter((r) => r.accepted_at)
            .map((r) => new Date(r.accepted_at!).getTime() - new Date(r.created_at).getTime());

          const avgMs = responseTimes.length
            ? responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length
            : 0;
          const avgMin = avgMs > 0 ? `${Math.round(avgMs / 60000)}m` : "—";

          setStats({ total: responses.length, accepted, avgResponse: avgMin });
        }
      } else {
        // Requester: fetch their blood requests
        const { data: requests } = await supabase
          .from("blood_requests")
          .select("*")
          .eq("requester_id", user.id)
          .order("created_at", { ascending: false })
          .limit(20);

        if (requests) {
          const items: ActivityItem[] = requests.map((r) => {
            let itemStatus: ActivityItem["status"] = "pending";
            if (r.status === "assigned" || r.status === "en-route") itemStatus = "en-route";
            if (r.status === "completed" || r.status === "arrived") itemStatus = "completed";
            if (r.status === "searching") itemStatus = "pending";

            return {
              id: r.id,
              bloodGroup: r.blood_group,
              hospital: r.hospital_name,
              status: itemStatus,
              time: formatDistanceToNow(new Date(r.created_at), { addSuffix: true }),
              units: r.units,
            };
          });
          setActivity(items);

          const fulfilled = requests.filter((r) =>
            ["completed", "arrived", "assigned", "en-route"].includes(r.status)
          ).length;

          setStats({ total: requests.length, accepted: fulfilled, avgResponse: "—" });
        }
      }
      setLoading(false);
    };

    fetchData();
  }, [user, role]);

  const statCards = [
    { label: role === "donor" ? "Responses" : "Requests", value: String(stats.total) },
    { label: role === "donor" ? "Accepted" : "Fulfilled", value: String(stats.accepted) },
    { label: "Avg Response", value: stats.avgResponse },
  ];

  return (
    <div className="min-h-screen bg-background max-w-lg mx-auto pb-24">
      <div className="px-6 pt-12 pb-4">
        <p className="text-label mb-1">Overview</p>
        <h1 className="text-display">Dashboard</h1>
      </div>

      {/* Stats */}
      <div className="px-6 mb-6">
        <div className="grid grid-cols-3 gap-3">
          {statCards.map((stat, i) => (
            <motion.div
              key={stat.label}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.04 }}
              className="bg-card rounded-2xl p-4 shadow-card text-center"
            >
              <p className="text-2xl font-bold text-foreground">
                {loading ? <Loader2 className="w-5 h-5 animate-spin mx-auto" /> : stat.value}
              </p>
              <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mt-1">
                {stat.label}
              </p>
            </motion.div>
          ))}
        </div>
      </div>

      {/* Recent activity */}
      <div className="px-6">
        <p className="text-label mb-3">Recent Activity</p>

        {loading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="w-6 h-6 animate-spin text-primary" />
          </div>
        ) : activity.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-3xl mb-2">📋</p>
            <p className="font-semibold text-foreground">No activity yet</p>
            <p className="text-sm text-muted-foreground mt-1">
              {role === "donor" ? "Accept a request to get started" : "Create a request to get started"}
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {activity.map((req, i) => (
              <motion.div
                key={req.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.04 }}
                className="flex items-center gap-4 bg-card rounded-2xl p-4 shadow-card"
              >
                <div className="w-11 h-11 rounded-xl bg-primary/10 flex items-center justify-center">
                  <span className="text-sm font-bold text-primary">{req.bloodGroup}</span>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-foreground truncate">{req.hospital}</p>
                  <p className="text-xs text-muted-foreground">
                    {req.units} unit{req.units > 1 ? "s" : ""} • {req.time}
                  </p>
                </div>
                {statusIcons[req.status] || statusIcons.pending}
              </motion.div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default DashboardScreen;
