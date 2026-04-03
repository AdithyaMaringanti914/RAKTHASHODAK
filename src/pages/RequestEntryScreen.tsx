import { useLocation, useNavigate } from "react-router-dom";
import { ArrowLeft, Search, Radio, Compass, Bell } from "lucide-react";
import { motion } from "framer-motion";

const RequestEntryScreen = () => {
  const navigate = useNavigate();
  const location = useLocation();

  return (
    <div className="min-h-screen bg-background max-w-lg mx-auto overflow-x-hidden">
      <div className="px-6 pt-12 pb-4">
        <button onClick={() => navigate("/")} className="mb-4 text-muted-foreground">
          <ArrowLeft className="w-6 h-6" />
        </button>
        <p className="text-label mb-1">Emergency Action</p>
        <h1 className="text-display min-w-[200px] leading-tight flex flex-col gap-1">
          <span>Choose Your</span>
          <span>Path</span>
        </h1>
      </div>

      <div className="px-6 space-y-4 pt-4 pb-24">
        <motion.button
          whileTap={{ scale: 0.98 }}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          onClick={() => navigate("/hospitals")}
          className="w-full text-left p-6 bg-secondary/80 hover:bg-secondary rounded-3xl border-2 border-transparent transition-all flex items-start gap-4 overflow-hidden relative"
        >
          <div className="absolute top-0 right-0 w-24 h-24 bg-card translate-x-10 -translate-y-10 rounded-full blur-2xl opacity-50 pointer-events-none"></div>
          
          <div className="w-12 h-12 rounded-2xl bg-card shadow-sm flex items-center justify-center flex-shrink-0 relative z-10 text-foreground">
            <Search className="w-6 h-6" />
          </div>
          <div className="flex-1 relative z-10">
            <h3 className="text-lg font-bold text-foreground mb-1">Find Hospitals</h3>
            <p className="text-sm font-medium text-muted-foreground leading-relaxed">
              Self-service search for nearby hospitals and active blood bank locations.
            </p>
            <div className="mt-4 flex items-center gap-2 text-xs font-bold text-foreground bg-background/50 w-fit px-3 py-1.5 rounded-full uppercase tracking-wider">
              <Compass className="w-4 h-4 text-primary" /> View Directory
            </div>
          </div>
        </motion.button>

        <motion.button
          whileTap={{ scale: 0.98 }}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          onClick={() => navigate("/request-donors", { state: location.state })}
          className="w-full text-left p-6 bg-primary/10 hover:bg-primary/15 rounded-3xl border-2 border-primary/20 transition-all flex items-start gap-4 overflow-hidden relative"
        >
          <div className="absolute top-0 left-0 w-32 h-32 bg-primary translate-x-12 -translate-y-12 rounded-full blur-3xl opacity-20 pointer-events-none"></div>

          <div className="w-12 h-12 rounded-2xl bg-primary text-primary-foreground shadow-button flex items-center justify-center flex-shrink-0 relative z-10">
            <Radio className="w-6 h-6 animate-pulse" />
          </div>
          <div className="flex-1 relative z-10">
            <h3 className="text-lg font-bold text-primary mb-1 text-shadow-sm">Request Donors</h3>
            <p className="text-sm font-bold text-muted-foreground leading-relaxed">
              Broadcast an emergency ping to active community donors in realtime.
            </p>
            <div className="mt-4 flex items-center gap-2 text-xs font-black text-primary-foreground bg-primary w-fit px-3 py-1.5 rounded-full shadow-button uppercase tracking-wider">
              <Bell className="w-4 h-4" /> Broadcast Ping
            </div>
          </div>
        </motion.button>
      </div>
    </div>
  );
};

export default RequestEntryScreen;
