import { CheckCircle2, Egg, Sparkles } from "lucide-react";
import { Link, NavLink, useLocation } from "react-router-dom";

import { useDeadlineGoals } from "../../hooks/useDeadlineGoals";
import useInstallPrompt from "../../hooks/useInstallPrompt";
import { useAuth } from "../../hooks/useAuth";
import { buildAddAlarmHref, buildPlannerHref } from "../../utils/plannerRoutes";

const LINK_CLASS =
  "inline-flex items-center rounded-full border border-transparent px-3.5 py-2 text-sm font-medium text-slate-600 transition duration-200";

const getLinkClassName = (isActive: boolean) =>
  `${LINK_CLASS} ${
    isActive
      ? "border-slate-900/10 bg-slate-950 text-white shadow-[0_16px_30px_rgba(15,23,42,0.18)]"
      : "hover:border-slate-200 hover:bg-white hover:text-slate-950"
  }`;

export default function AppHeader() {
  const location = useLocation();
  const { supported, promptInstall } = useInstallPrompt();
  const { user } = useAuth();
  const { todayHeadline, toggleItem, pullForward } = useDeadlineGoals(user?.uid);
  const plannerSearchParams =
    location.pathname === "/planner" || location.pathname === "/add-alarm"
      ? location.search
      : undefined;

  return (
    <header className="sticky top-0 z-40 border-b border-white/50 bg-[linear-gradient(180deg,_rgba(248,251,255,0.92),_rgba(255,255,255,0.82))] backdrop-blur-xl">
      <div className="mx-auto max-w-6xl px-4 py-3 sm:px-6">
        <div className="flex flex-col gap-3">
          <div className="rounded-[30px] border border-white/70 bg-white/80 p-3 shadow-[0_20px_50px_rgba(15,23,42,0.08)] backdrop-blur">
            <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
              <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:gap-4">
                <div className="flex items-center gap-3">
                  <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-slate-950 text-white shadow-[0_18px_40px_rgba(15,23,42,0.2)]">
                    <Sparkles className="h-4 w-4" />
                  </div>
                  <div>
                    <div className="text-[10px] font-semibold uppercase tracking-[0.24em] text-slate-400">
                      Production Flow
                    </div>
                    <div className="text-sm font-semibold text-slate-950">EFT Control Surface</div>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <NavLink
                    to="/signal-inbox"
                    className={({ isActive }) => getLinkClassName(isActive)}
                  >
                    Signal Inbox
                  </NavLink>
                  <NavLink
                    to={buildPlannerHref("today", { baseSearchParams: plannerSearchParams })}
                    className={({ isActive }) => getLinkClassName(isActive)}
                  >
                    Planner
                  </NavLink>
                  <NavLink
                    to={buildAddAlarmHref({ baseSearchParams: plannerSearchParams })}
                    className={({ isActive }) => getLinkClassName(isActive)}
                  >
                    Alarm Studio
                  </NavLink>
                  <NavLink
                    to="/my-page"
                    className={({ isActive }) => getLinkClassName(isActive)}
                  >
                    My Page
                  </NavLink>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2 xl:justify-end">
                <Link
                  to="/mobile-link"
                  className="inline-flex items-center rounded-full border border-slate-200 bg-white px-3.5 py-2 text-sm font-medium text-slate-700 shadow-sm transition hover:-translate-y-0.5 hover:border-slate-300 hover:text-slate-950"
                >
                  Mobile QR Login
                </Link>
                {supported && (
                  <button
                    type="button"
                    onClick={async () => {
                      const result = await promptInstall();
                      console.log("PWA install outcome:", result?.outcome);
                    }}
                    className="inline-flex items-center rounded-full bg-slate-950 px-3.5 py-2 text-sm font-medium text-white shadow-[0_18px_40px_rgba(15,23,42,0.18)] transition hover:-translate-y-0.5 hover:bg-slate-900"
                  >
                    Install App
                  </button>
                )}
              </div>
            </div>
          </div>

          {todayHeadline && (
            <div className="rounded-[32px] border border-white/70 bg-[linear-gradient(135deg,_rgba(14,165,233,0.14),_rgba(255,255,255,0.98)_48%,_rgba(16,185,129,0.12))] p-5 shadow-[0_20px_50px_rgba(15,23,42,0.08)]">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                <div className="space-y-2.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="inline-flex items-center gap-1 rounded-full bg-sky-100 px-3 py-1 text-xs font-semibold text-sky-700">
                      <Sparkles className="h-3.5 w-3.5" />
                      Live Deadline Signal
                    </span>
                    <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-700">
                      <Egg className="h-3.5 w-3.5" />
                      Hatch Probability {todayHeadline.summary.hatchProbability}%
                    </span>
                  </div>
                  <div>
                    <div className="text-lg font-semibold text-slate-950">
                      {todayHeadline.plan.title}
                    </div>
                    <div className="mt-1 text-sm text-slate-500">
                      {todayHeadline.summary.dDay >= 0
                        ? `D-${todayHeadline.summary.dDay}`
                        : `D+${Math.abs(todayHeadline.summary.dDay)}`}{" "}
                      completed {todayHeadline.summary.completedCount}/
                      {todayHeadline.summary.totalCount}
                    </div>
                  </div>
                </div>

                <Link
                  to={buildPlannerHref("deadline", {
                    baseSearchParams: plannerSearchParams,
                  })}
                  className="inline-flex items-center justify-center rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-sm transition hover:-translate-y-0.5 hover:border-sky-300 hover:text-sky-700"
                >
                  Open Deadline Engine
                </Link>
              </div>

              <div className="mt-4 space-y-2">
                {todayHeadline.agenda.pendingItems.slice(0, 3).map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => {
                      void toggleItem(todayHeadline.plan.id, item.id);
                    }}
                    className="flex w-full items-start gap-3 rounded-[24px] border border-slate-200 bg-white/90 px-4 py-3 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-sky-300 hover:bg-sky-50"
                  >
                    <div
                      className={`mt-0.5 flex h-5 w-5 items-center justify-center rounded-full border ${
                        item.lane === "overdue"
                          ? "border-amber-400 bg-amber-50 text-amber-600"
                          : "border-sky-300 bg-sky-50 text-sky-600"
                      }`}
                    >
                      <CheckCircle2 className="h-3.5 w-3.5" />
                    </div>
                    <div className="flex-1">
                      <div className="text-sm font-medium text-slate-900">{item.title}</div>
                      <div className="mt-1 text-xs text-slate-500">
                        {item.estMinutes} min {item.lane === "overdue" ? "overdue" : "today"}
                      </div>
                    </div>
                  </button>
                ))}

                {todayHeadline.agenda.pendingItems.length === 0 && (
                  <div className="rounded-[24px] border border-dashed border-slate-200 bg-white/80 px-4 py-4 text-sm text-slate-500">
                    Today's visible checklist is complete.
                  </div>
                )}
              </div>

              {todayHeadline.agenda.allVisibleDone &&
                todayHeadline.agenda.remainingCapacityMinutes > 0 &&
                todayHeadline.agenda.nextItems.length > 0 && (
                  <div className="mt-4 flex flex-col gap-3 rounded-[24px] border border-emerald-200 bg-emerald-50 px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <div className="text-sm font-semibold text-emerald-900">
                        Capacity is still available.
                      </div>
                      <div className="mt-1 text-xs text-emerald-700">
                        You can pull {todayHeadline.agenda.nextItems.length} future items into today.
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        if (window.confirm("Pull future items into today?")) {
                          void pullForward(todayHeadline.plan.id);
                        }
                      }}
                      className="rounded-2xl bg-emerald-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:-translate-y-0.5 hover:bg-emerald-700"
                    >
                      Pull Forward
                    </button>
                  </div>
                )}
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
