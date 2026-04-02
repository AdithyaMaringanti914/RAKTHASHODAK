import { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

interface DonorMarker {
  id: string;
  lat: number;
  lng: number;
  bloodGroup: string;
  active?: boolean;
}

import type { Database } from "@/integrations/supabase/types";
type BloodRequest = Database["public"]["Tables"]["blood_requests"]["Row"];

interface MapViewProps {
  donors?: DonorMarker[];
  hospitalMarker?: { lat: number; lng: number; name: string };
  donorTrack?: { lat: number; lng: number };
  userLocation?: { lat: number; lng: number };
  showRoute?: boolean;
  center?: [number, number];
  zoom?: number;
  className?: string;
  requests?: BloodRequest[];
  onRequestClick?: (req: BloodRequest) => void;
}

const createDonorIcon = (bloodGroup: string, active: boolean) =>
  L.divIcon({
    className: "",
    html: `<div style="position:relative;display:flex;align-items:center;justify-content:center">
      ${active ? '<div style="position:absolute;width:40px;height:40px;border-radius:50%;background:rgba(198,0,0,0.15);animation:ping 2s cubic-bezier(0,0,0.2,1) infinite"></div>' : ""}
      <div style="position:relative;width:32px;height:32px;border-radius:50%;background:${active ? "hsl(0,84%,45%)" : "#9ca3af"};display:flex;align-items:center;justify-content:center;box-shadow:0 4px 14px rgba(0,0,0,0.2);z-index:10">
        <span style="font-size:9px;font-weight:700;color:#fff">${bloodGroup}</span>
      </div>
    </div>`,
    iconSize: [40, 40],
    iconAnchor: [20, 20],
  });

const createRequestIcon = (bloodGroup: string) =>
  L.divIcon({
    className: "",
    html: `<div style="position:relative;display:flex;align-items:center;justify-content:center">
      <div style="position:absolute;width:60px;height:60px;border-radius:50%;background:rgba(198,0,0,0.2);animation:ping 1.5s cubic-bezier(0,0,0.2,1) infinite"></div>
      <div style="position:relative;width:44px;height:44px;border-radius:50%;background:hsl(0,84%,45%);border:3px solid #fff;display:flex;flex-direction:column;align-items:center;justify-content:center;box-shadow:0 8px 24px rgba(198,0,0,0.5);z-index:20;cursor:pointer;">
        <span style="font-size:16px;">🩸</span>
        <span style="font-size:10px;font-weight:900;color:#fff;margin-top:-4px">${bloodGroup}</span>
      </div>
    </div>`,
    iconSize: [60, 60],
    iconAnchor: [30, 30],
  });

const hospitalIcon = L.divIcon({
  className: "",
  html: `<div style="width:40px;height:40px;border-radius:10px;background:#111;display:flex;align-items:center;justify-content:center;box-shadow:0 8px 24px rgba(0,0,0,0.2);font-size:18px">🏥</div>`,
  iconSize: [40, 40],
  iconAnchor: [20, 20],
});

const donorTrackIcon = L.divIcon({
  className: "",
  html: `<div style="width:40px;height:40px;border-radius:50%;background:hsl(210,100%,50%);display:flex;align-items:center;justify-content:center;box-shadow:0 8px 24px rgba(0,0,0,0.2);font-size:14px">🩸</div>`,
  iconSize: [40, 40],
  iconAnchor: [20, 20],
});

const userLocationIcon = L.divIcon({
  className: "",
  html: `<div style="position:relative;display:flex;align-items:center;justify-content:center">
    <div style="position:absolute;width:32px;height:32px;border-radius:50%;background:hsl(210,100%,50%);opacity:0.2;animation:ping 2s cubic-bezier(0,0,0.2,1) infinite"></div>
    <div style="width:14px;height:14px;border-radius:50%;background:hsl(210,100%,50%);border:3px solid #fff;box-shadow:0 2px 8px rgba(0,0,0,0.3);z-index:10"></div>
  </div>`,
  iconSize: [32, 32],
  iconAnchor: [16, 16],
});

const MapView = ({
  donors = [],
  hospitalMarker,
  donorTrack,
  userLocation,
  showRoute,
  center = [12.975, 77.600],
  zoom = 14,
  className = "",
  requests = [],
  onRequestClick,
}: MapViewProps) => {
  const mapRef = useRef<L.Map | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const markersRef = useRef<L.LayerGroup | null>(null);
  const routeRef = useRef<L.Polyline | null>(null);
  const trackMarkerRef = useRef<L.Marker | null>(null);
  const userMarkerRef = useRef<L.Marker | null>(null);
  const initialCenterSet = useRef(false);

  // Initialize map
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = L.map(containerRef.current, {
      center,
      zoom,
      zoomControl: false,
      attributionControl: false,
    });

    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
    }).addTo(map);

    L.control.zoom({ position: "bottomright" }).addTo(map);

    mapRef.current = map;
    markersRef.current = L.layerGroup().addTo(map);

    // Fix grey tiles / partial rendering by invalidating size after mount
    const timeoutId = setTimeout(() => {
      if (mapRef.current) {
        map.invalidateSize();
      }
    }, 200);

    return () => {
      clearTimeout(timeoutId);
      map.remove();
      mapRef.current = null;
    };
  }, []);

  // Center map on user location once
  useEffect(() => {
    if (!mapRef.current || !userLocation || initialCenterSet.current) return;
    mapRef.current.setView([userLocation.lat, userLocation.lng], zoom);
    initialCenterSet.current = true;
  }, [userLocation, zoom]);

  // Listen for recenter events
  useEffect(() => {
    const handleRecenter = (e: Event) => {
      const customEvent = e as CustomEvent<{ lat: number; lng: number }>;
      if (mapRef.current && customEvent.detail) {
        mapRef.current.flyTo([customEvent.detail.lat, customEvent.detail.lng], zoom, { duration: 1 });
      }
    };
    
    window.addEventListener("recenter-map", handleRecenter);
    return () => window.removeEventListener("recenter-map", handleRecenter);
  }, [zoom]);

  // Update donor and request markers
  useEffect(() => {
    if (!markersRef.current) return;
    markersRef.current.clearLayers();

    donors.forEach((donor) => {
      if (typeof donor.lat === "number" && typeof donor.lng === "number") {
        const icon = createDonorIcon(donor.bloodGroup, !!donor.active);
        L.marker([donor.lat, donor.lng], { icon }).addTo(markersRef.current!);
      }
    });

    requests.forEach((req) => {
      const lat = (req as any).latitude || req.hospital_lat;
      const lng = (req as any).longitude || req.hospital_lng;
      if (typeof lat === "number" && typeof lng === "number") {
        const icon = createRequestIcon(req.blood_group);
        const marker = L.marker([lat, lng], { icon, zIndexOffset: 500 }).addTo(markersRef.current!);
        if (onRequestClick) {
          marker.on("click", () => onRequestClick(req));
        }
      }
    });

    if (hospitalMarker && typeof hospitalMarker.lat === "number" && typeof hospitalMarker.lng === "number") {
      L.marker([hospitalMarker.lat, hospitalMarker.lng], { icon: hospitalIcon })
        .bindPopup(`<b>${hospitalMarker.name}</b>`)
        .addTo(markersRef.current);
    }
  }, [donors, hospitalMarker, requests, onRequestClick]);

  // User location marker
  useEffect(() => {
    if (!mapRef.current) return;

    if (userMarkerRef.current) {
      if (userLocation && typeof userLocation.lat === "number" && typeof userLocation.lng === "number") {
        userMarkerRef.current.setLatLng([userLocation.lat, userLocation.lng]);
      } else {
        userMarkerRef.current.remove();
        userMarkerRef.current = null;
      }
    } else if (userLocation && typeof userLocation.lat === "number" && typeof userLocation.lng === "number") {
      userMarkerRef.current = L.marker([userLocation.lat, userLocation.lng], {
        icon: userLocationIcon,
        zIndexOffset: 1000,
      }).addTo(mapRef.current);
    }
  }, [userLocation]);

  // Donor tracking marker — smoothly update position
  useEffect(() => {
    if (!mapRef.current) return;

    if (trackMarkerRef.current) {
      if (donorTrack && typeof donorTrack.lat === "number" && typeof donorTrack.lng === "number") {
        trackMarkerRef.current.setLatLng([donorTrack.lat, donorTrack.lng]);
      } else {
        trackMarkerRef.current.remove();
        trackMarkerRef.current = null;
      }
    } else if (donorTrack && typeof donorTrack.lat === "number" && typeof donorTrack.lng === "number") {
      trackMarkerRef.current = L.marker([donorTrack.lat, donorTrack.lng], {
        icon: donorTrackIcon,
        zIndexOffset: 900,
      }).addTo(mapRef.current);
    }
  }, [donorTrack]);

  // Route line
  useEffect(() => {
    if (!mapRef.current) return;

    if (routeRef.current) {
      routeRef.current.remove();
      routeRef.current = null;
    }

    if (showRoute && 
        donorTrack && typeof donorTrack.lat === "number" && typeof donorTrack.lng === "number" && 
        hospitalMarker && typeof hospitalMarker.lat === "number" && typeof hospitalMarker.lng === "number") {
      routeRef.current = L.polyline(
        [
          [donorTrack.lat, donorTrack.lng],
          [hospitalMarker.lat, hospitalMarker.lng],
        ],
        { color: "hsl(210, 100%, 50%)", weight: 3, dashArray: "8 4", opacity: 0.7 }
      ).addTo(mapRef.current);
    }
  }, [showRoute, donorTrack, hospitalMarker]);

  return <div ref={containerRef} className={`w-full h-full ${className}`} style={{ zIndex: 0 }} />;
};

export default MapView;
