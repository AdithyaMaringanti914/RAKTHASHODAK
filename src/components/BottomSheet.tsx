import { motion } from "framer-motion";
import { ReactNode } from "react";

interface BottomSheetProps {
  children: ReactNode;
  className?: string;
}

const BottomSheet = ({ children, className = "" }: BottomSheetProps) => {
  return (
    <motion.div
      className={`absolute bottom-0 left-0 right-0 bg-card rounded-t-[2rem] px-6 pt-3 pb-24 shadow-elevated z-30 ${className}`}
      initial={{ y: 100, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ type: "spring", mass: 0.5, damping: 12 }}
    >
      <div className="w-12 h-1.5 bg-border rounded-full mx-auto mb-5" />
      {children}
    </motion.div>
  );
};

export default BottomSheet;
