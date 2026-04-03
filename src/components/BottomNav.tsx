import { MapPin, Bell, User, LayoutDashboard } from "lucide-react";
import { useLocation, useNavigate } from "react-router-dom";

const tabs = [
  { path: "/", icon: MapPin, label: "Map" },
  { path: "/dashboard", icon: LayoutDashboard, label: "Dashboard" },
  { path: "/alerts", icon: Bell, label: "Alerts" },
  { path: "/profile", icon: User, label: "Profile" },
];

const BottomNav = () => {
  const location = useLocation();
  const navigate = useNavigate();

  // Hide nav on tracking screen
  if (location.pathname.startsWith("/track")) return null;

  return (
    <nav className="fixed bottom-0 left-0 right-0 bg-card border-t border-border z-[1001]">
      <div className="max-w-lg mx-auto flex items-center justify-around h-16">
        {tabs.map((tab) => {
          const active = location.pathname === tab.path;
          return (
            <button
              key={tab.path}
              onClick={() => navigate(tab.path)}
              className={`flex flex-col items-center gap-0.5 px-4 py-2 transition-colors ${
                active ? "text-primary" : "text-muted-foreground"
              }`}
            >
              <tab.icon className="w-5 h-5" strokeWidth={active ? 2.5 : 2} />
              <span className="text-[10px] font-semibold">{tab.label}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
};

export default BottomNav;
