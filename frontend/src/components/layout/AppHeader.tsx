import { CheckCircle2, Egg, Sparkles } from "lucide-react";
import { Link, NavLink, useLocation } from "react-router-dom";

import { useDeadlineGoals } from "../../hooks/useDeadlineGoals";
import useInstallPrompt from "../../hooks/useInstallPrompt";
import { useAuth } from "../../hooks/useAuth";
import { buildPlannerHref } from "../../utils/plannerRoutes";

const LINK_CLASS =
  "rounded-full px-3 py-1.5 text-sm font-medium text-slate-600 transition hover:bg-slate-100 hover:text-slate-900";

export default function AppHeader() {
  const location = useLocation();
  const { supported, promptInstall } = useInstallPrompt();
  const { user } = useAuth();
  const { todayHeadline, toggleItem, pullForward } = useDeadlineGoals(user?.uid);
  const plannerSearchParams = location.pathname === "/planner" ? location.search : undefined;

  return (
    <header className="sticky top-0 z-40 border-b border-slate-200 bg-white/95 shadow-sm backdrop-blur">
      <div className="mx-auto max-w-6xl px-4 py-3 sm:px-6">
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex flex-wrap items-center gap-2">
              <NavLink
                to="/signal-inbox"
                className={({ isActive }) =>
                  `${LINK_CLASS} ${isActive ? "bg-sky-50 text-sky-700" : ""}`
                }
              >
                신호함
              </NavLink>
              <NavLink
                to={buildPlannerHref("alarm", { baseSearchParams: plannerSearchParams })}
                className={({ isActive }) =>
                  `${LINK_CLASS} ${isActive ? "bg-sky-50 text-sky-700" : ""}`
                }
              >
                플래너
              </NavLink>
              <NavLink
                to="/my-page"
                className={({ isActive }) =>
                  `${LINK_CLASS} ${isActive ? "bg-sky-50 text-sky-700" : ""}`
                }
              >
                마이페이지
              </NavLink>
            </div>

            <div className="flex flex-wrap items-center gap-2 sm:justify-end">
              <Link
                to="/mobile-link"
                className="rounded-full border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
              >
                모바일 QR 로그인
              </Link>
              {supported && (
                <button
                  type="button"
                  onClick={async () => {
                    await promptInstall();
                  }}
                  className="rounded-full bg-sky-600 px-3 py-1.5 text-sm font-medium text-white transition hover:bg-sky-700"
                >
                  앱 설치
                </button>
              )}
            </div>
          </div>

          {todayHeadline && (
            <div className="rounded-[28px] border border-slate-200 bg-[linear-gradient(135deg,_rgba(14,165,233,0.12),_rgba(255,255,255,0.96)_48%,_rgba(16,185,129,0.12))] p-4 shadow-sm">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                <div className="space-y-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="inline-flex items-center gap-1 rounded-full bg-sky-100 px-3 py-1 text-xs font-semibold text-sky-700">
                      <Sparkles className="h-3.5 w-3.5" />
                      오늘의 마감 헤드라인
                    </span>
                    <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-700">
                      <Egg className="h-3.5 w-3.5" />
                      부화 확률 {todayHeadline.summary.hatchProbability}%
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
                      · {todayHeadline.summary.completedCount}/{todayHeadline.summary.totalCount} 완료
                    </div>
                  </div>
                </div>

                <Link
                  to={buildPlannerHref("deadline", {
                    baseSearchParams: plannerSearchParams,
                  })}
                  className="inline-flex items-center justify-center rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition hover:border-sky-300 hover:text-sky-700"
                >
                  전체 목표 보기
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
                    className="flex w-full items-start gap-3 rounded-2xl border border-slate-200 bg-white/90 px-4 py-3 text-left transition hover:border-sky-300 hover:bg-sky-50"
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
                        {item.estMinutes}분 · {item.lane === "overdue" ? "이월 분량" : "오늘 분량"}
                      </div>
                    </div>
                  </button>
                ))}

                {todayHeadline.agenda.pendingItems.length === 0 && (
                  <div className="rounded-2xl border border-dashed border-slate-200 bg-white/80 px-4 py-4 text-sm text-slate-500">
                    오늘 체크리스트를 모두 완료했습니다.
                  </div>
                )}
              </div>

              {todayHeadline.agenda.allVisibleDone &&
                todayHeadline.agenda.remainingCapacityMinutes > 0 &&
                todayHeadline.agenda.nextItems.length > 0 && (
                  <div className="mt-4 flex flex-col gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <div className="text-sm font-semibold text-emerald-900">
                        시간이 남아 있습니다.
                      </div>
                      <div className="mt-1 text-xs text-emerald-700">
                        내일 분량 {todayHeadline.agenda.nextItems.length}개를 앞으로 당길 수 있습니다.
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        if (window.confirm("내일 분량을 오늘로 당길까요?")) {
                          void pullForward(todayHeadline.plan.id);
                        }
                      }}
                      className="rounded-2xl bg-emerald-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-emerald-700"
                    >
                      내일 분량 당기기
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
