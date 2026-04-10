import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes, Navigate } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import { useFCM } from "@/hooks/useFCM";
import BottomNav from "@/components/BottomNav";
import NotificationPrompt from "@/components/NotificationPrompt";
import InstallPrompt from "@/components/InstallPrompt";
import DonorLocationSync from "@/components/DonorLocationSync";
import Index from "./pages/Index";
import RequestEntryScreen from "./pages/RequestEntryScreen";
import HospitalDiscoveryScreen from "./pages/HospitalDiscoveryScreen";
import DonorBroadcastScreen from "./pages/DonorBroadcastScreen";
import TrackingScreen from "./pages/TrackingScreen";
import AlertsScreen from "./pages/AlertsScreen";
import DashboardScreen from "./pages/DashboardScreen";
import ProfileScreen from "./pages/ProfileScreen";
import LoginScreen from "./pages/LoginScreen";
import DonorSignupScreen from "./pages/DonorSignupScreen";
import DonationHistoryScreen from "./pages/DonationHistoryScreen";
import RequesterSignupScreen from "./pages/RequesterSignupScreen";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const ProtectedRoute = ({ children }: { children: React.ReactNode }) => {
  const { session, loading } = useAuth();
  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="animate-pulse text-primary text-4xl">🩸</div>
      </div>
    );
  }
  if (!session) return <Navigate to="/login" replace />;
  return <>{children}</>;
};

const PublicRoute = ({ children }: { children: React.ReactNode }) => {
  const { session, loading } = useAuth();
  if (loading) return null;
  if (session) return <Navigate to="/" replace />;
  return <>{children}</>;
};

const AppRoutes = () => (
  <Routes>
    <Route path="/login" element={<PublicRoute><LoginScreen /></PublicRoute>} />
    <Route path="/signup/donor" element={<PublicRoute><DonorSignupScreen /></PublicRoute>} />
    <Route path="/signup/requester" element={<PublicRoute><RequesterSignupScreen /></PublicRoute>} />
    <Route path="/" element={<ProtectedRoute><Index /></ProtectedRoute>} />
    <Route path="/request" element={<ProtectedRoute><RequestEntryScreen /></ProtectedRoute>} />
    <Route path="/hospitals" element={<ProtectedRoute><HospitalDiscoveryScreen /></ProtectedRoute>} />
    <Route path="/request-donors" element={<ProtectedRoute><DonorBroadcastScreen /></ProtectedRoute>} />
    <Route path="/track" element={<ProtectedRoute><TrackingScreen /></ProtectedRoute>} />
    <Route path="/alerts" element={<ProtectedRoute><AlertsScreen /></ProtectedRoute>} />
    <Route path="/dashboard" element={<ProtectedRoute><DashboardScreen /></ProtectedRoute>} />
    <Route path="/donation-history" element={<ProtectedRoute><DonationHistoryScreen /></ProtectedRoute>} />
    <Route path="/profile" element={<ProtectedRoute><ProfileScreen /></ProtectedRoute>} />
    <Route path="*" element={<NotFound />} />
  </Routes>
);

const FCMProvider = ({ children }: { children: React.ReactNode }) => {
  useFCM();
  return <>{children}</>;
};

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter
        basename={import.meta.env.BASE_URL}
        future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
      >
        <AuthProvider>
          <FCMProvider>
            <DonorLocationSync />
            <NotificationPrompt />
            <InstallPrompt />
            <AppRoutes />
            <BottomNav />
          </FCMProvider>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
