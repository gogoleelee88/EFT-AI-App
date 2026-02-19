import React from "react";
import { cva } from "class-variance-authority";
import { EyeOff, Lock, ShieldCheck } from "lucide-react";
import { cn } from "@/lib/utils";
import type { PrivacyMode } from "@/types/privacy";
import {
  PRIVACY_MODE_DESCRIPTIONS,
  PRIVACY_MODE_LABELS,
} from "@/types/privacy";

const optionCard = cva(
  "flex flex-col gap-1.5 rounded-xl border px-3 py-2.5 text-left transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500",
  {
    variants: {
      selected: {
        true: "border-indigo-500 bg-indigo-50 shadow-sm",
        false: "border-gray-200 bg-white hover:border-indigo-200 hover:bg-indigo-50/40",
      },
    },
    defaultVariants: {
      selected: false,
    },
  }
);

type PrivacyModeSelectProps = {
  value: PrivacyMode;
  onChange: (value: PrivacyMode) => void;
  className?: string;
};

const OPTIONS: Array<{
  value: PrivacyMode;
  icon: typeof ShieldCheck;
}> = [
  { value: "NORMAL", icon: ShieldCheck },
  { value: "MASKED", icon: EyeOff },
  { value: "APP_ONLY", icon: Lock },
];

const PrivacyModeSelect: React.FC<PrivacyModeSelectProps> = ({
  value,
  onChange,
  className,
}) => {
  return (
    <div className={cn("space-y-2", className)}>
      <div className="text-sm font-medium text-gray-700">
        개인정보 보호 동기화(옵션 선택)
      </div>
      <div role="radiogroup" className="grid gap-2 md:grid-cols-3">
        {OPTIONS.map((option) => {
          const Icon = option.icon;
          const isSelected = value === option.value;
          return (
            <button
              key={option.value}
              type="button"
              role="radio"
              aria-checked={isSelected}
              onClick={() => onChange(option.value)}
              className={cn(optionCard({ selected: isSelected }))}
            >
              <div className="flex items-center gap-2 text-gray-800">
                <Icon className="h-4 w-4" />
                <span className="text-sm font-semibold">
                  {PRIVACY_MODE_LABELS[option.value]}
                </span>
              </div>
              <p className="text-xs text-gray-600">
                {PRIVACY_MODE_DESCRIPTIONS[option.value]}
              </p>
            </button>
          );
        })}
      </div>
    </div>
  );
};

export default PrivacyModeSelect;
