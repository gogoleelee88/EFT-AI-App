import React from "react";
import { BellPlus, Inbox, UserRound } from "lucide-react";

interface BottomNavProps {
  activeTab: string;
  onTabChange: (tabId: string) => void;
  className?: string;
}

const NAV_ITEMS = [
  {
    id: "home",
    label: "신호함",
    icon: Inbox,
  },
  {
    id: "addAlarm",
    label: "알람 추가",
    icon: BellPlus,
  },
  {
    id: "myPage",
    label: "마이페이지",
    icon: UserRound,
  },
] as const;

const BottomNav: React.FC<BottomNavProps> = ({
  activeTab,
  onTabChange,
  className = "",
}) => {
  return (
    <nav
      className={`border-t border-slate-200 bg-white/95 px-3 py-2 shadow-[0_-10px_30px_rgba(15,23,42,0.08)] backdrop-blur ${className}`}
    >
      <div className="mx-auto flex max-w-md justify-around gap-2">
        {NAV_ITEMS.map((item) => {
          const isActive = activeTab === item.id;
          const Icon = item.icon;

          return (
            <button
              key={item.id}
              type="button"
              onClick={() => onTabChange(item.id)}
              className={`flex min-w-[88px] flex-col items-center rounded-2xl px-3 py-2 text-xs font-semibold transition ${
                isActive
                  ? "bg-sky-50 text-sky-700"
                  : "text-slate-500 hover:bg-slate-50 hover:text-slate-900"
              }`}
            >
              <Icon className={`h-5 w-5 ${isActive ? "scale-105" : ""}`} />
              <span className="mt-1">{item.label}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
};

export default BottomNav;
