import { todayInKoreaIso } from "./koreaTime";

export type PlannerTab = "alarm" | "deadline" | "today";

export const PLANNER_PATH = "/planner";
export const ADD_ALARM_PATH = "/add-alarm";

export const DEFAULT_PLANNER_TAB: PlannerTab = "today";

const ISO_DATE_RX = /^\d{4}-\d{2}-\d{2}$/;

type BuildHrefOptions = {
  activeDate?: string | null;
  baseSearchParams?: string | URLSearchParams | null;
};

export const normalizePlannerTab = (value: string | null | undefined): PlannerTab =>
  value === "alarm" || value === "deadline" || value === "today"
    ? value
    : DEFAULT_PLANNER_TAB;

export const normalizePlannerActiveDate = (
  value: string | null | undefined,
  fallback: string = todayInKoreaIso()
): string => {
  const trimmed = value?.trim();
  return trimmed && ISO_DATE_RX.test(trimmed) ? trimmed : fallback;
};

const applyActiveDate = (
  params: URLSearchParams,
  activeDate: string | null | undefined
) => {
  if (activeDate === undefined) return;

  const normalized = activeDate ? normalizePlannerActiveDate(activeDate, "") : "";
  if (normalized) {
    params.set("active_date", normalized);
    return;
  }

  params.delete("active_date");
};

export const buildPlannerHref = (
  tab: PlannerTab = DEFAULT_PLANNER_TAB,
  options: BuildHrefOptions = {}
): string => {
  const params = new URLSearchParams(options.baseSearchParams ?? undefined);

  if (tab === DEFAULT_PLANNER_TAB) {
    params.delete("tab");
  } else {
    params.set("tab", tab);
  }

  applyActiveDate(params, options.activeDate);

  const search = params.toString();
  return search ? `${PLANNER_PATH}?${search}` : PLANNER_PATH;
};

export const buildAddAlarmHref = (options: BuildHrefOptions = {}): string => {
  const params = new URLSearchParams(options.baseSearchParams ?? undefined);
  params.delete("tab");
  applyActiveDate(params, options.activeDate);

  const search = params.toString();
  return search ? `${ADD_ALARM_PATH}?${search}` : ADD_ALARM_PATH;
};
