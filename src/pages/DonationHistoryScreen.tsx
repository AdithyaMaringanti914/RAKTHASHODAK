import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { ArrowLeft, Droplets, Flame, Award, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

interface Donation {
  id: string;
  blood_group: string;
  units: number;
  hospital_name: string;
  donated_at: string;
}

const BADGES = [
  { name: "First Drop", desc: "Complete your first donation", icon: "🩸", threshold: 1 },
  { name: "Lifesaver", desc: "Donate 5 times", icon: "💉", threshold: 5 },
  { name: "Hero", desc: "Donate 10 times", icon: "🦸", threshold: 10 },
  { name: "Legend", desc: "Donate 25 times", icon: "🏆", threshold: 25 },
  { name: "Champion", desc: "Donate 50 times", icon: "👑", threshold: 50 },
];

const DonationHistoryScreen = () => {
  const navigate = useNavigate();
  const { user, profile } = useAuth();
  const [donations, setDonations] = useState<Donation[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    const fetch = async () => {
      const { data } = await supabase
        .from("donations")
        .select("*")
        .eq("donor_id", user.id)
        .order("donated_at", { ascending: false });
      setDonations((data as Donation[]) ?? []);
      setLoading(false);
    };
    fetch();
  }, [user]);

  const totalDonations = profile?.total_donations ?? donations.length;

  // Streak calculation (consecutive months with donations)
  const streak = (() => {
    if (!donations.length) return 0;
    const months = new Set(
      donations.map((d) => {
        const dt = new Date(d.donated_at);
        return `${dt.getFullYear()}-${dt.getMonth()}`;
      })
    );
    const sorted = Array.from(months).sort().reverse();
    let count = 1;
    for (let i = 1; i < sorted.length; i++) {
      const [y1, m1] = sorted[i - 1].split("-").map(Number);
      const [y2, m2] = sorted[i].split("-").map(Number);
      const diff = (y1 - y2) * 12 + (m1 - m2);
      if (diff === 1) count++;
      else break;
    }
    return count;
  })();

  return (
    <div className="min-h-screen bg-background max-w-lg mx-auto pb-24">
      {/* Header */}
      <div className="px-6 pt-12 pb-4 flex items-center gap-3">
        <button
          onClick={() => navigate("/profile")}
          className="w-10 h-10 bg-card rounded-full shadow-card flex items-center justify-center"
        >
          <ArrowLeft className="w-5 h-5 text-foreground" />
        </button>
        <div>
          <p className="text-label mb-0.5">Your Journey</p>
          <h1 className="text-display">Donation History</h1>
        </div>
      </div>

      {/* Stats */}
      <div className="px-6 mb-6">
        <div className="grid grid-cols-3 gap-3">
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="bg-card rounded-2xl p-4 shadow-card text-center">
            <Droplets className="w-5 h-5 mx-auto mb-2 text-primary" />
            <p className="text-xl font-bold text-foreground">{totalDonations}</p>
            <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mt-0.5">Total</p>
          </motion.div>
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.04 }} className="bg-card rounded-2xl p-4 shadow-card text-center">
            <Flame className="w-5 h-5 mx-auto mb-2 text-destructive" />
            <p className="text-xl font-bold text-foreground">{streak}</p>
            <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mt-0.5">Month Streak</p>
          </motion.div>
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.08 }} className="bg-card rounded-2xl p-4 shadow-card text-center">
            <Award className="w-5 h-5 mx-auto mb-2 text-accent" />
            <p className="text-xl font-bold text-foreground">{BADGES.filter((b) => totalDonations >= b.threshold).length}</p>
            <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mt-0.5">Badges</p>
          </motion.div>
        </div>
      </div>

      {/* Badges */}
      <div className="px-6 mb-6">
        <p className="text-label mb-3">Badges</p>
        <div className="flex gap-3 overflow-x-auto no-scrollbar pb-1">
          {BADGES.map((badge) => {
            const earned = totalDonations >= badge.threshold;
            return (
              <motion.div
                key={badge.name}
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                className={`flex-shrink-0 w-24 bg-card rounded-2xl p-3 shadow-card text-center ${
                  !earned ? "opacity-40 grayscale" : ""
                }`}
              >
                <span className="text-2xl block mb-1">{badge.icon}</span>
                <p className="text-[10px] font-bold text-foreground">{badge.name}</p>
                <p className="text-[9px] text-muted-foreground mt-0.5">{badge.desc}</p>
              </motion.div>
            );
          })}
        </div>
      </div>

      {/* Donation list */}
      <div className="px-6">
        <p className="text-label mb-3">Past Donations</p>
        {loading ? (
          <div className="flex justify-center py-16">
            <Loader2 className="w-6 h-6 animate-spin text-primary" />
          </div>
        ) : donations.length === 0 ? (
          <div className="text-center py-16">
            <p className="text-4xl mb-3">🩸</p>
            <p className="font-semibold text-foreground">No donations yet</p>
            <p className="text-sm text-muted-foreground mt-1">Your donation history will appear here</p>
          </div>
        ) : (
          <div className="space-y-3">
            {donations.map((d, i) => (
              <motion.div
                key={d.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.03 }}
                className="bg-card rounded-2xl p-4 shadow-card flex items-center gap-4"
              >
                <div className="w-11 h-11 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                  <span className="text-sm font-bold text-primary">{d.blood_group}</span>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-foreground text-sm truncate">{d.hospital_name}</p>
                  <p className="text-xs text-muted-foreground">
                    {d.units} unit{d.units > 1 ? "s" : ""} •{" "}
                    {new Date(d.donated_at).toLocaleDateString("en-IN", {
                      day: "numeric",
                      month: "short",
                      year: "numeric",
                    })}
                  </p>
                </div>
              </motion.div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default DonationHistoryScreen;
