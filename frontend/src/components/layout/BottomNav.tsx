import React from "react";
import { BellPlus, CalendarClock, Inbox, UserRound } from "lucide-react";

interface BottomNavProps {
  activeTab: string;
  onTabChange: (tabId: string) => void;
  className?: string;
}

const NAV_ITEMS = [
  {
    id: "home",
    label: "Signals",
    icon: Inbox,
    accent: "from-sky-400 via-cyan-300 to-sky-400",
  },
  {
    id: "planner",
    label: "Planner",
    icon: CalendarClock,
    accent: "from-sky-400 via-cyan-300 to-emerald-300",
  },
  {
    id: "addAlarm",
    label: "Alarm",
    icon: BellPlus,
    accent: "from-amber-300 via-orange-300 to-rose-300",
  },
  {
    id: "myPage",
    label: "My",
    icon: UserRound,
    accent: "from-emerald-300 via-teal-300 to-cyan-300",
  },
] as const;

const BottomNav: React.FC<BottomNavProps> = ({
  activeTab,
  onTabChange,
  className = "",
}) => {
  return (
    <nav
      className={`mx-auto max-w-xl rounded-[30px] border border-white/70 bg-[linear-gradient(180deg,_rgba(255,255,255,0.92),_rgba(248,250,252,0.84))] p-2 shadow-[0_24px_70px_rgba(15,23,42,0.16)] backdrop-blur-xl ${className}`}
    >
      <div className="grid grid-cols-4 gap-2">
        {NAV_ITEMS.map((item) => {
          const isActive = activeTab === item.id;
          const Icon = item.icon;

          return (
            <button
              key={item.id}
              type="button"
              onClick={() => onTabChange(item.id)}
              className={`group relative flex min-w-0 flex-col items-center overflow-hidden rounded-[22px] px-2 py-2.5 text-[11px] font-semibold transition ${
                isActive
                  ? "bg-slate-950 text-white shadow-[0_18px_30px_rgba(15,23,42,0.18)]"
                  : "text-slate-500 hover:bg-white/85 hover:text-slate-900"
              }`}
            >
              {isActive && (
                <span
                  className={`absolute inset-x-3 top-0 h-px bg-gradient-to-r ${item.accent}`}
                />
              )}
              <div
                className={`flex h-9 w-9 items-center justify-center rounded-2xl transition ${
                  isActive ? "bg-white/10" : "bg-slate-100 group-hover:bg-slate-200"
                }`}
              >
                <Icon className={`h-5 w-5 ${isActive ? "scale-105" : ""}`} />
              </div>
              <span className="mt-1 truncate">{item.label}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
};

export default BottomNav;
