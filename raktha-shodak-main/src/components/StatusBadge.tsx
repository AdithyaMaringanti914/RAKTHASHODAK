interface StatusBadgeProps {
  status: "urgent" | "searching" | "assigned" | "en-route" | "arrived";
}

const statusConfig: Record<string, { label: string; className: string }> = {
  urgent: { label: "URGENT", className: "bg-primary/10 text-primary" },
  searching: { label: "SEARCHING", className: "bg-accent/10 text-accent" },
  assigned: { label: "ASSIGNED", className: "bg-accent/10 text-accent" },
  "en-route": { label: "EN ROUTE", className: "bg-success/10 text-success" },
  arrived: { label: "ARRIVED", className: "bg-success/10 text-success" },
};

const StatusBadge = ({ status }: StatusBadgeProps) => {
  const config = statusConfig[status];
  return (
    <span className={`px-3 py-1 rounded-full text-[11px] font-bold tracking-wider ${config.className}`}>
      {config.label}
    </span>
  );
};

export default StatusBadge;
