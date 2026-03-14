import { todayInKoreaIso } from "./koreaTime";

export type PlannerTab = "alarm" | "deadline" | "today";

export const PLANNER_PATH = "/planner";

export const DEFAULT_PLANNER_TAB: PlannerTab = "alarm";

const ISO_DATE_RX = /^\d{4}-\d{2}-\d{2}$/;

type BuildPlannerHrefOptions = {
  activeDate?: string | null;
  baseSearchParams?: string | URLSearchParams | null;
};

export const normalizePlannerTab = (value: string | null | undefined): PlannerTab =>
  value === "deadline" || value === "today" ? value : DEFAULT_PLANNER_TAB;

export const normalizePlannerActiveDate = (
  value: string | null | undefined,
  fallback: string = todayInKoreaIso()
): string => {
  const trimmed = value?.trim();
  return trimmed && ISO_DATE_RX.test(trimmed) ? trimmed : fallback;
};

export const buildPlannerHref = (
  tab: PlannerTab = DEFAULT_PLANNER_TAB,
  options: BuildPlannerHrefOptions = {}
): string => {
  const params = new URLSearchParams(options.baseSearchParams ?? undefined);

  if (tab === DEFAULT_PLANNER_TAB) {
    params.delete("tab");
  } else {
    params.set("tab", tab);
  }

  if (options.activeDate !== undefined) {
    const normalized = options.activeDate
      ? normalizePlannerActiveDate(options.activeDate, "")
      : "";
    if (normalized) {
      params.set("active_date", normalized);
    } else {
      params.delete("active_date");
    }
  }

  const search = params.toString();
  return search ? `${PLANNER_PATH}?${search}` : PLANNER_PATH;
};
