import { motion } from "framer-motion";
import { Heart, ArrowRight } from "lucide-react";

const COMPATIBILITY: Record<string, { giveTo: string[]; receiveFrom: string[] }> = {
  "O-":  { giveTo: ["O-","O+","A-","A+","B-","B+","AB-","AB+"], receiveFrom: ["O-"] },
  "O+":  { giveTo: ["O+","A+","B+","AB+"], receiveFrom: ["O-","O+"] },
  "A-":  { giveTo: ["A-","A+","AB-","AB+"], receiveFrom: ["O-","A-"] },
  "A+":  { giveTo: ["A+","AB+"], receiveFrom: ["O-","O+","A-","A+"] },
  "B-":  { giveTo: ["B-","B+","AB-","AB+"], receiveFrom: ["O-","B-"] },
  "B+":  { giveTo: ["B+","AB+"], receiveFrom: ["O-","O+","B-","B+"] },
  "AB-": { giveTo: ["AB-","AB+"], receiveFrom: ["O-","A-","B-","AB-"] },
  "AB+": { giveTo: ["AB+"], receiveFrom: ["O-","O+","A-","A+","B-","B+","AB-","AB+"] },
};

const ALL_GROUPS = ["O-","O+","A-","A+","B-","B+","AB-","AB+"];

interface Props {
  bloodGroup: string | null;
}

const BloodCompatibilityCard = ({ bloodGroup }: Props) => {
  const bg = bloodGroup ?? "O+";
  const compat = COMPATIBILITY[bg];

  if (!compat) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-card rounded-2xl p-5 shadow-card"
    >
      <div className="flex items-center gap-2 mb-4">
        <Heart className="w-4 h-4 text-primary" />
        <p className="text-label !text-foreground font-bold text-xs tracking-wide uppercase">
          Blood Compatibility — {bg}
        </p>
      </div>

      {/* Can Give To */}
      <div className="mb-4">
        <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-2 flex items-center gap-1">
          Can Donate To <ArrowRight className="w-3 h-3" />
        </p>
        <div className="flex flex-wrap gap-1.5">
          {ALL_GROUPS.map((g) => (
            <span
              key={`give-${g}`}
              className={`px-2.5 py-1 rounded-lg text-[11px] font-bold ${
                compat.giveTo.includes(g)
                  ? "bg-primary/10 text-primary"
                  : "bg-muted text-muted-foreground/40"
              }`}
            >
              {g}
            </span>
          ))}
        </div>
      </div>

      {/* Can Receive From */}
      <div>
        <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-2 flex items-center gap-1">
          <ArrowRight className="w-3 h-3 rotate-180" /> Can Receive From
        </p>
        <div className="flex flex-wrap gap-1.5">
          {ALL_GROUPS.map((g) => (
            <span
              key={`recv-${g}`}
              className={`px-2.5 py-1 rounded-lg text-[11px] font-bold ${
                compat.receiveFrom.includes(g)
                  ? "bg-accent/10 text-accent"
                  : "bg-muted text-muted-foreground/40"
              }`}
            >
              {g}
            </span>
          ))}
        </div>
      </div>
    </motion.div>
  );
};

export default BloodCompatibilityCard;
