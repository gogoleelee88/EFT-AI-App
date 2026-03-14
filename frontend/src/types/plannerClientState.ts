import type {
  AlarmConfig,
  MissionCombinationMode,
  MissionConfig,
  SelectedMicroAction,
  SelectedTask,
} from "./mission";
import type { DeadlineGoalPlan } from "./deadlinePlanner";
import type { PrivacyMode } from "./privacy";

export type PrivacyMapping = {
  key: string;
  originalTitle: string;
  originalDescription?: string;
  maskedTitle: string;
  maskedDescription?: string;
  privacy_mode: "MASKED";
  updatedAt: string;
};

export type AppOnlyEvent = {
  id: string;
  title: string;
  description?: string;
  date: string;
  startIso: string;
  endIso: string;
  privacy_mode: "APP_ONLY";
  createdAt: string;
};

export type AddAlarmDraft = {
  date: string;
  mode: number;
  step: 1 | 2 | 3 | 4 | 5;
  task: SelectedTask | null;
  microAction: SelectedMicroAction | null;
  missions: MissionConfig[];
  missionCombinationMode: MissionCombinationMode;
  alarm: AlarmConfig | null;
  privacyMode: PrivacyMode;
  updatedAt: string;
};

export interface PlannerClientStateSnapshot {
  user_id: string;
  version: number;
  updated_at: string | null;
  deadline_goals: DeadlineGoalPlan[];
  privacy_mappings: PrivacyMapping[];
  app_only_events: AppOnlyEvent[];
  add_alarm_draft: AddAlarmDraft | null;
}
