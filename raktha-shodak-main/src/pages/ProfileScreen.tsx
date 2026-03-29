import { motion } from "framer-motion";
import { Droplets, Star, Calendar, ChevronRight, LogOut } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useNavigate } from "react-router-dom";
import BloodCompatibilityCard from "@/components/BloodCompatibilityCard";

const ProfileScreen = () => {
  const { profile, role, signOut } = useAuth();
  const navigate = useNavigate();

  const handleSignOut = async () => {
    await signOut();
    navigate("/login");
  };

  return (
    <div className="min-h-screen bg-background max-w-lg mx-auto pb-24">
      <div className="px-6 pt-12 pb-6">
        <p className="text-label mb-1">Profile</p>
        <h1 className="text-display">{profile?.full_name ?? "User"}</h1>
        <p className="text-body text-muted-foreground mt-1">
          {profile?.blood_group ?? "—"} • {role === "donor" ? "Donor" : "Requester"}
        </p>
      </div>

      {/* Stats cards */}
      <div className="px-6 mb-6">
        <div className="grid grid-cols-3 gap-3">
          {[
            { icon: Droplets, value: String(profile?.total_donations ?? 0), label: "Donations", color: "text-primary" },
            { icon: Star, value: String(profile?.reliability_score ?? "5.0"), label: "Reliability", color: "text-accent" },
            { icon: Calendar, value: profile?.last_donation_date ?? "N/A", label: "Last Donation", color: "text-success" },
          ].map((stat, i) => (
            <motion.div
              key={stat.label}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.04 }}
              className="bg-card rounded-2xl p-4 shadow-card text-center"
            >
              <stat.icon className={`w-5 h-5 mx-auto mb-2 ${stat.color}`} />
              <p className="text-xl font-bold text-foreground">{stat.value}</p>
              <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mt-0.5">
                {stat.label}
              </p>
            </motion.div>
          ))}
        </div>
      </div>

      {/* Blood Compatibility Card */}
      <div className="px-6 mb-6">
        <BloodCompatibilityCard bloodGroup={profile?.blood_group ?? null} />
      </div>

      {/* Eligibility */}
      <div className="px-6 mb-6">
        <div className="bg-success/10 rounded-2xl p-4 flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-success flex items-center justify-center">
            <span className="text-success-foreground font-bold text-sm">✓</span>
          </div>
          <div>
            <p className="font-semibold text-foreground text-sm">Eligible to Donate</p>
            <p className="text-xs text-muted-foreground">Next eligible: Available now</p>
          </div>
        </div>
      </div>

      {/* Menu */}
      <div className="px-6">
        <p className="text-label mb-3">Settings</p>
        <div className="bg-card rounded-2xl shadow-card overflow-hidden">
          {[
            { label: "Donation History", action: () => navigate("/donation-history") },
            { label: "Medical Info", action: undefined },
            { label: "Notification Preferences", action: undefined },
            { label: "Help & Support", action: undefined },
          ].map((item, i) => (
            <button
              key={item.label}
              onClick={item.action}
              className={`w-full flex items-center justify-between px-4 py-3.5 text-sm font-medium text-foreground ${
                i > 0 ? "border-t border-border" : ""
              }`}
            >
              {item.label}
              <ChevronRight className="w-4 h-4 text-muted-foreground" />
            </button>
          ))}
        </div>

        <button
          onClick={handleSignOut}
          className="w-full mt-4 flex items-center justify-center gap-2 h-12 bg-destructive/10 text-destructive rounded-2xl font-semibold text-sm"
        >
          <LogOut className="w-4 h-4" />
          Sign Out
        </button>
      </div>
    </div>
  );
};

export default ProfileScreen;
