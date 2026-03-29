import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import type { Database } from "@/integrations/supabase/types";

type BloodRequest = Database["public"]["Tables"]["blood_requests"]["Row"];

// Haversine formula to calculate distance between two coordinates in km
function getDistanceFromLatLonInKm(lat1: number, lon1: number, lat2: number, lon2: number) {
  const R = 6371; // Radius of the earth in km
  const dLat = (lat2 - lat1) * (Math.PI / 180);
  const dLon = (lon2 - lon1) * (Math.PI / 180);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * (Math.PI / 180)) * Math.cos(lat2 * (Math.PI / 180)) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

export const useRealtimeAlerts = () => {
  const { profile } = useAuth();
  const [requests, setRequests] = useState<BloodRequest[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // 1. Initial fetch
    const fetchInitialRequests = async () => {
      const { data, error } = await supabase
        .from("blood_requests")
        .select("*")
        .eq("status", "OPEN")
        .order("created_at", { ascending: false });

      if (error) {
        toast.error("Failed to load requests");
        setLoading(false);
        return;
      }

      // Filter 15km radius if user has location for Production Broadcast Mode constraint
      if (profile?.latitude && profile?.longitude) {
        const nearbyRequests = (data || []).filter((req) => {
          const targetLat = (req as any).latitude || req.hospital_lat;
          const targetLng = (req as any).longitude || req.hospital_lng;
          if (!targetLat || !targetLng) return true;
          
          const distance = getDistanceFromLatLonInKm(
            profile.latitude!,
            profile.longitude!,
            targetLat,
            targetLng
          );
          return distance <= 15;
        });
        setRequests(nearbyRequests);
      } else {
        setRequests(data || []);
      }
      
      setLoading(false);
    };

    try {
      fetchInitialRequests();
    } catch (err) {
      console.error("[STEP 7 ERROR] Failed to fetch initial requests:", err);
    }

    // 2. Realtime Subscription
    const channel = supabase
      .channel("blood_requests_channel")
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "blood_requests",
          filter: "status=eq.OPEN"
        },
        (payload) => {
          const newRequest = payload.new as BloodRequest;
          const targetLat = (newRequest as any).latitude || newRequest.hospital_lat;
          const targetLng = (newRequest as any).longitude || newRequest.hospital_lng;
          
          if (profile?.latitude && profile?.longitude && targetLat && targetLng) {
            const distance = getDistanceFromLatLonInKm(
              profile.latitude,
              profile.longitude,
              targetLat,
              targetLng
            );
            
            if (distance <= 15) {
              setRequests((prev) => [newRequest, ...prev]);
              toast.success(`EMERGENCY: ${newRequest.blood_group} blood needed ${distance.toFixed(1)}km away!`, {
                duration: 6000,
                icon: '🚨'
              });
            }
          } else {
            // Fallback if no location data
            setRequests((prev) => [newRequest, ...prev]);
            toast.success(`New blood request: ${newRequest.blood_group} needed!`);
          }
        }
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "blood_requests"
        },
        (payload) => {
          const updated = payload.new as BloodRequest;
          if (updated.status !== "OPEN") {
            // Remove from list if it's no longer open
            setRequests((prev) => prev.filter((r) => r.id !== updated.id));
          } else {
             // Update in place if still open
            setRequests((prev) => prev.map((r) => r.id === updated.id ? updated : r));
          }
        }
      )
      .on(
        "postgres_changes",
        {
          event: "DELETE",
          schema: "public",
          table: "blood_requests"
        },
        (payload) => {
          setRequests((prev) => prev.filter((r) => r.id !== payload.old.id));
        }
      )
      .subscribe();

    // 3. Cleanup on unmount
    return () => {
      supabase.removeChannel(channel);
    };
  }, [profile?.latitude, profile?.longitude]); // Re-run if user's location changes

  return { requests, loading, setRequests };
};
