import type { AlarmConfig } from "./mission";

export type DeadlineRepeatRule = AlarmConfig["repeat"];

export interface DeadlineChecklistItem {
  id: string;
  title: string;
  estMinutes: number;
  source: "manual" | "generated";
}

export interface DeadlineGoalDraft {
  title: string;
  startDate: string;
  deadlineDate: string;
  windowStartTime: string;
  windowEndTime: string;
  endsNextDay: boolean;
  repeat: DeadlineRepeatRule;
  customDays: number[];
  totalMinutes: number;
  checklistText: string;
}

export interface DeadlineGoalPlan {
  id: string;
  title: string;
  startDate: string;
  deadlineDate: string;
  windowStartTime: string;
  windowEndTime: string;
  endsNextDay: boolean;
  repeat: DeadlineRepeatRule;
  customDays: number[];
  totalMinutes: number;
  items: DeadlineChecklistItem[];
  assignments: Record<string, string[]>;
  completionLog: Record<string, string>;
  syncedDates: string[];
  createdAt: string;
  updatedAt: string;
  lastOpenedAt: string | null;
}

export interface DeadlineAgendaItem extends DeadlineChecklistItem {
  lane: "overdue" | "today";
}

export interface DeadlineGoalAgenda {
  date: string;
  pendingItems: DeadlineAgendaItem[];
  completedTodayCount: number;
  overdueCount: number;
  remainingCapacityMinutes: number;
  nextDate: string | null;
  nextItems: DeadlineChecklistItem[];
  allVisibleDone: boolean;
}

export interface DeadlineGoalSummary {
  planId: string;
  title: string;
  dDay: number;
  completionRate: number;
  completedCount: number;
  totalCount: number;
  overdueCount: number;
  hatchProbability: number;
  hatchStage: string;
  driftMessage: string | null;
}

export interface DeadlineGoalHeadline {
  plan: DeadlineGoalPlan;
  agenda: DeadlineGoalAgenda;
  summary: DeadlineGoalSummary;
}
