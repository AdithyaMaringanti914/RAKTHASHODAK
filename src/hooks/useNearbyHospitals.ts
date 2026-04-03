import { useState, useEffect } from "react";

export type AvailabilityStatus = "Likely Available" | "Limited Availability" | "Check Required";
export type FacilityType = "blood_bank" | "hospital";

export interface Hospital {
  id: string;
  name: string;
  lat: number;
  lng: number;
  address: string;
  distanceKm: number;
  availability: AvailabilityStatus;
  type: FacilityType;
}

function getDistanceKm(lat1: number, lon1: number, lat2: number, lon2: number) {
  const R = 6371;
  const dLat = (lat2 - lat1) * (Math.PI / 180);
  const dLon = (lon2 - lon1) * (Math.PI / 180);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * (Math.PI / 180)) * Math.cos(lat2 * (Math.PI / 180)) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

export const useNearbyHospitals = () => {
  const [hospitals, setHospitals] = useState<Hospital[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [userLocation, setUserLocation] = useState<{lat: number, lng: number} | null>(null);

  useEffect(() => {
    const DEFAULT_LAT = 12.975;
    const DEFAULT_LNG = 77.600;

    const queryOverpass = async (latitude: number, longitude: number, isFallback = false) => {
      // 5km radius. Removed regex name search to prevent Overpass query timeouts.
      const query = `
        [out:json][timeout:15];
        (
          nwr["amenity"="hospital"](around:5000,${latitude},${longitude});
          nwr["healthcare"="blood_bank"](around:5000,${latitude},${longitude});
        );
        out center 20;
      `;

      try {
        // Enforce an absolute 6.5-second timeout on the OSM query independently because OpenStreetMap frequently freezes
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 6500);

        const response = await fetch(`https://overpass-api.de/api/interpreter?data=${encodeURIComponent(query)}`, {
          signal: controller.signal
        });
        
        clearTimeout(timeoutId);

        if (!response.ok) {
          throw new Error("Failed to fetch from OSM");
        }
        
        const data = await response.json();
        
        const parsedHospitals = data.elements
          .filter((el: any) => el.tags && el.tags.name)
          .map((el: any): Hospital => {
            const lat = el.lat || el.center?.lat;
            const lon = el.lon || el.center?.lon;
            
            let address = "Address unavailable";
            if (el.tags["addr:full"]) {
              address = el.tags["addr:full"];
            } else if (el.tags["addr:street"]) {
              address = el.tags["addr:street"];
              if (el.tags["addr:city"]) address += `, ${el.tags["addr:city"]}`;
            }

            const currentHour = new Date().getHours();
            const isLateNight = currentHour >= 22 || currentHour < 6;
            const openingHours = el.tags["opening_hours"];
            
            let availability: AvailabilityStatus = "Check Required";
            if (openingHours === "24/7") {
              availability = "Likely Available";
            } else if (isLateNight) {
              availability = "Limited Availability";
            } else if (el.tags["amenity"] === "hospital") {
              availability = "Likely Available";
            } else {
              availability = "Check Required";
            }

            const facilityType: FacilityType = el.tags["healthcare"] === "blood_bank" ? "blood_bank" : "hospital";

            return {
              id: String(el.id),
              name: el.tags.name,
              lat,
              lng: lon,
              address,
              distanceKm: getDistanceKm(latitude, longitude, lat, lon),
              availability,
              type: facilityType,
            };
          })
          .filter((h: Hospital) => h.lat && h.lng)
          .sort((a: Hospital, b: Hospital) => a.distanceKm - b.distanceKm);

        if (parsedHospitals.length === 0) {
           throw new Error("No nearby hospitals found via OSM");
        }

        const uniqueHospitals = Array.from(new Map(parsedHospitals.map((item: Hospital) => [item.name, item])).values()) as Hospital[];

        setHospitals(uniqueHospitals);
        if (isFallback) {
          setError("Using default location (Bangalore) due to GPS failure.");
        }
      } catch (err) {
        console.warn("OSM Fetch Error:", err);
        setError("OSM API unreachable or empty. Showing fallback mock data.");
        
        // Populate fallback mock hospitals to unblock development/UI
        setHospitals([
          {
            id: "mock-1",
            name: "City General Hospital",
            lat: 12.975,
            lng: 77.600,
            address: "MG Road, Bangalore - 560001",
            distanceKm: 0.8,
            availability: "Likely Available",
            type: "hospital"
          },
          {
            id: "mock-2",
            name: "Apollo Blood Bank",
            lat: 12.980,
            lng: 77.605,
            address: "Brigade Road, Bangalore",
            distanceKm: 1.5,
            availability: "Limited Availability",
            type: "blood_bank"
          },
          {
            id: "mock-3",
            name: "Fortis Hospital",
            lat: 12.965,
            lng: 77.590,
            address: "Cunningham Road, Bangalore",
            distanceKm: 2.1,
            availability: "Check Required",
            type: "hospital"
          }
        ]);
      } finally {
        setLoading(false);
      }
    };

    const fetchHospitals = async () => {
      setLoading(true);
      setError(null);

      if (!navigator.geolocation) {
        // Fallback for completely unsupported browsers
        setUserLocation({ lat: DEFAULT_LAT, lng: DEFAULT_LNG });
        await queryOverpass(DEFAULT_LAT, DEFAULT_LNG, true);
        return;
      }

      navigator.geolocation.getCurrentPosition(
        (position) => {
          setUserLocation({ lat: position.coords.latitude, lng: position.coords.longitude });
          queryOverpass(position.coords.latitude, position.coords.longitude);
        },
        (geolocationError) => {
          console.warn("Geolocation Error/Timeout:", geolocationError.message);
          // Gracefully fallback to the default location automatically if GPS throws timeout/unavailable
          setUserLocation({ lat: DEFAULT_LAT, lng: DEFAULT_LNG });
          queryOverpass(DEFAULT_LAT, DEFAULT_LNG, true);
        },
        { enableHighAccuracy: false, timeout: 3500, maximumAge: 10000 }
      );
    };

    fetchHospitals();
  }, []);

  return { hospitals, userLocation, loading, error };
};
