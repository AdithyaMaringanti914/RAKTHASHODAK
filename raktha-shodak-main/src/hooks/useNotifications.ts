import { useEffect, useRef, useCallback, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useNavigate } from "react-router-dom";

export const useNotifications = () => {
  const { user, role } = useAuth();
  const navigate = useNavigate();
  const [permission, setPermission] = useState<NotificationPermission>(
    typeof Notification !== "undefined" ? Notification.permission : "default"
  );
  const swRegistration = useRef<ServiceWorkerRegistration | null>(null);

  // Register service worker
  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker
        .register("/sw.js")
        .then((reg) => {
          swRegistration.current = reg;
        })
        .catch((err) => console.warn("SW registration failed:", err));

      // Listen for messages from SW
      navigator.serviceWorker.addEventListener("message", (event) => {
        if (event.data?.type === "NOTIFICATION_ACTION") {
          const { action, data } = event.data;
          if (action === "accept" && data?.requestId) {
            navigate("/alerts");
          } else {
            navigate("/alerts");
          }
        }
      });
    }
  }, [navigate]);

  const requestPermission = useCallback(async () => {
    if (typeof Notification === "undefined") return "denied" as const;
    const result = await Notification.requestPermission();
    setPermission(result);
    return result;
  }, []);

  const showNotification = useCallback(
    (title: string, body: string, data?: Record<string, unknown>) => {
      if (permission !== "granted") return;

      // Use service worker to show notification (works in background)
      if (swRegistration.current?.active) {
        swRegistration.current.active.postMessage({
          type: "SHOW_NOTIFICATION",
          title,
          body,
          tag: `request-${data?.requestId || Date.now()}`,
          data,
        });
      } else {
        // Fallback to regular notification
        new Notification(title, { body, icon: "/placeholder.svg" });
      }
    },
    [permission]
  );

  // Subscribe to new blood requests for donors
  useEffect(() => {
    if (!user || role !== "donor" || permission !== "granted") return;

    const channel = supabase
      .channel("donor-notifications")
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "blood_requests",
        },
        (payload) => {
          const req = payload.new as Record<string, unknown>;
          showNotification(
            `🩸 ${req.blood_group} Blood Needed`,
            `${req.units} unit(s) at ${req.hospital_name} — ${req.urgency} urgency`,
            { requestId: req.id }
          );
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user, role, permission, showNotification]);

  return { permission, requestPermission, showNotification };
};
