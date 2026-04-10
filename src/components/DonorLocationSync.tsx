import { useGeolocation } from "@/hooks/useGeolocation";
import { useAuth } from "@/contexts/AuthContext";

/**
 * Persists donor GPS to profiles whenever location is available, even if the donor
 * never opens the home map (Index). Requesters skip DB writes here.
 */
const DonorLocationSync = () => {
  const { role } = useAuth();
  useGeolocation(role === "donor");
  return null;
};

export default DonorLocationSync;
