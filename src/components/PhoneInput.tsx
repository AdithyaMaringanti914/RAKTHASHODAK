import { useState, useEffect } from "react";
import { Phone, Check, ChevronDown } from "lucide-react";

interface PhoneInputProps {
  value: string;
  onChange: (value: string) => void;
  onFocus: () => void;
  onBlur: () => void;
  focused: boolean;
  disabled?: boolean;
  required?: boolean;
}

const COUNTRY_CODES = [
  { code: "+91", country: "IN", label: "India (+91)" },
  { code: "+1", country: "US", label: "USA (+1)" },
  { code: "+44", country: "GB", label: "UK (+44)" },
  { code: "+971", country: "AE", label: "UAE (+971)" },
  { code: "+61", country: "AU", label: "Australia (+61)" },
  { code: "+65", country: "SG", label: "Singapore (+65)" },
  { code: "+1", country: "CA", label: "Canada (+1)" },
  { code: "+49", country: "DE", label: "Germany (+49)" },
  { code: "+33", country: "FR", label: "France (+33)" },
  { code: "+81", country: "JP", label: "Japan (+81)" },
];

const PhoneInput = ({ value, onChange, onFocus, onBlur, focused, disabled, required }: PhoneInputProps) => {
  const [selectedCountry, setSelectedCountry] = useState(COUNTRY_CODES[0]);
  const [localNumber, setLocalNumber] = useState("");

  // Sync internal state with external value only on mount or if external value changes from outside
  useEffect(() => {
    if (value && value.startsWith("+")) {
       const matchingCode = COUNTRY_CODES.find(c => value.startsWith(c.code));
       if (matchingCode) {
         setSelectedCountry(matchingCode);
         const num = value.slice(matchingCode.code.length).trim();
         setLocalNumber(num);
       } else {
         setLocalNumber(value);
       }
    } else if (!value) {
       setLocalNumber("");
    }
  }, [value === "" ? "" : undefined]); // Only reset localNumber if value is cleared

  const handleNumberChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const num = e.target.value.replace(/[^0-9]/g, "");
    setLocalNumber(num);
    onChange(`${selectedCountry.code}${num}`);
  };

  const handleCountryChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newCode = COUNTRY_CODES.find(c => c.code === e.target.value) || COUNTRY_CODES[0];
    setSelectedCountry(newCode);
    onChange(`${newCode.code}${localNumber}`);
  };

  return (
    <div className={`relative flex items-center bg-card border-2 rounded-2xl px-4 h-14 transition-all duration-200 ${
      focused
        ? "border-primary shadow-[0_0_0_3px_hsl(var(--primary)/0.1)]"
        : "border-border"
    } ${disabled ? "opacity-50 cursor-not-allowed" : ""}`}>
      <div className="flex items-center gap-2 pr-3 border-r border-border h-2/3">
        <Phone className={`w-[18px] h-[18px] flex-shrink-0 transition-colors ${focused ? "text-primary" : "text-muted-foreground"}`} />
        <div className="relative flex items-center">
          <select 
            value={selectedCountry.code}
            onChange={handleCountryChange}
            disabled={disabled}
            className="bg-transparent text-sm font-bold text-foreground outline-none cursor-pointer appearance-none pr-4 z-10"
          >
            {COUNTRY_CODES.map((c, i) => (
              <option key={`${c.country}-${i}`} value={c.code}>{c.code}</option>
            ))}
          </select>
          <ChevronDown className="w-3 h-3 text-muted-foreground absolute right-0 pointer-events-none" />
        </div>
      </div>
      
      <input
        type="tel"
        value={localNumber}
        onChange={handleNumberChange}
        onFocus={onFocus}
        onBlur={onBlur}
        disabled={disabled}
        required={required}
        placeholder="Phone number"
        className="flex-1 bg-transparent text-sm text-foreground font-medium placeholder:text-muted-foreground/60 outline-none pl-3"
      />
    </div>
  );
};

export default PhoneInput;
