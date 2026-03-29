import { motion } from "framer-motion";

const BLOOD_GROUPS = ["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"];

interface BloodGroupPickerProps {
  selected: string;
  onChange: (group: string) => void;
}

const BloodGroupPicker = ({ selected, onChange }: BloodGroupPickerProps) => {
  return (
    <div className="grid grid-cols-4 gap-2">
      {BLOOD_GROUPS.map((group, i) => {
        const isSelected = selected === group;
        return (
          <motion.button
            key={group}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.04 }}
            onClick={() => onChange(group)}
            className={`h-12 rounded-xl text-sm font-bold transition-all ${
              isSelected
                ? "bg-primary text-primary-foreground shadow-button"
                : "bg-secondary text-foreground hover:bg-muted"
            }`}
          >
            {group}
          </motion.button>
        );
      })}
    </div>
  );
};

export default BloodGroupPicker;
