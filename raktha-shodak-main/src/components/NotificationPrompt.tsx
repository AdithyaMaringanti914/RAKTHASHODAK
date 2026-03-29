import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Bell, X } from "lucide-react";
import { useNotifications } from "@/hooks/useNotifications";

const NotificationPrompt = () => {
  const { permission, requestPermission } = useNotifications();
  const [dismissed, setDismissed] = useState(false);

  if (permission !== "default" || dismissed) return null;

  const handleEnable = async () => {
    await requestPermission();
  };

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -20 }}
        className="fixed top-4 left-4 right-4 z-50 max-w-lg mx-auto"
      >
        <div className="bg-card border border-border rounded-2xl p-4 shadow-lg flex items-start gap-3">
          <div className="w-10 h-10 bg-primary/10 rounded-xl flex items-center justify-center flex-shrink-0">
            <Bell className="w-5 h-5 text-primary" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-foreground text-sm">Enable Notifications</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              Get instant alerts for new blood requests, even when the app is in the background.
            </p>
            <div className="flex gap-2 mt-3">
              <motion.button
                whileTap={{ scale: 0.97 }}
                onClick={handleEnable}
                className="px-4 h-8 bg-primary text-primary-foreground rounded-lg text-xs font-semibold"
              >
                Enable
              </motion.button>
              <button
                onClick={() => setDismissed(true)}
                className="px-4 h-8 bg-secondary text-foreground rounded-lg text-xs font-medium"
              >
                Not now
              </button>
            </div>
          </div>
          <button onClick={() => setDismissed(true)} className="text-muted-foreground">
            <X className="w-4 h-4" />
          </button>
        </div>
      </motion.div>
    </AnimatePresence>
  );
};

export default NotificationPrompt;
