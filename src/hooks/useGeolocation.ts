import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

interface GeoPosition {
  lat: number;
  lng: number;
}

export const useGeolocation = (updateDb = false) => {
  const { user } = useAuth();
  const [position, setPosition] = useState<GeoPosition | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [watching, setWatching] = useState(false);

  const updateProfileLocation = useCallback(
    async (lat: number, lng: number) => {
      if (!user || !updateDb) return;
      await supabase
        .from("profiles")
        .update({ latitude: lat, longitude: lng })
        .eq("user_id", user.id);
    },
    [user, updateDb]
  );

  useEffect(() => {
    if (!navigator.geolocation) {
      setError("Geolocation is not supported by your browser");
      return;
    }

    setWatching(true);

    // Initial immediate fetch
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const newPos = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        if (!position) setPosition(newPos);
        updateProfileLocation(newPos.lat, newPos.lng);
      },
      (err) => {
        console.warn("Initial geolocation fetch failed:", err.message);
        setError(err.message);
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );

    const watchId = navigator.geolocation.watchPosition(
      (pos) => {
        const newPos = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        setPosition(newPos);
        setError(null);
        updateProfileLocation(newPos.lat, newPos.lng);
      },
      (err) => {
        console.warn("Geolocation watch error:", err.message);
        setError(err.message);
      },
      {
        enableHighAccuracy: true,
        maximumAge: 5000,
        timeout: 15000,
      }
    );

    return () => {
      navigator.geolocation.clearWatch(watchId);
      setWatching(false);
    };
  }, [updateProfileLocation]);

  return { position, error, watching };
};
