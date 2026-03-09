// 미션 설정 위자드 상태 관리
import { useState } from "react";
import type {
  SelectedTask,
  SelectedMicroAction,
  MissionConfig,
  AlarmConfig,
  MissionCombinationMode,
  PlanWithMissionRequest,
  PlanWithMissionResponse,
} from "../types/mission";
import type { PrivacyMode } from "../types/privacy";
import { savePlanWithMission } from "../services/missionService";
import { ingestSignal } from "../services/proposalService";

export type WizardStep = 1 | 2 | 3 | 4 | 5; // 5 = ?꾨즺 ?붾㈃

interface PlanWizardState {
  step: WizardStep;
  date: string; // "YYYY-MM-DD"
  mode: number; // 100 | 70 | 40
  task: SelectedTask | null;
  microAction: SelectedMicroAction | null;
  missions: MissionConfig[];
  missionCombinationMode: MissionCombinationMode;
  alarm: AlarmConfig | null;
  savedPlan: PlanWithMissionResponse | null;
  privacy_mode: PrivacyMode;
}

const HHMM_RX = /^([01]\d|2[0-3]):([0-5]\d)$/;

function parseMinutes(value: string): number | null {
  const match = value.match(HHMM_RX);
  if (!match) return null;
  return Number(match[1]) * 60 + Number(match[2]);
}

function normalizeAlarm(alarm: AlarmConfig | null): AlarmConfig | null {
  if (!alarm) return null;
  const startTime = (alarm.start_time || alarm.time || "").trim();
  return {
    ...alarm,
    start_time: startTime,
    end_time: (alarm.end_time || "").trim(),
    ends_next_day: Boolean(alarm.ends_next_day),
    time: startTime || undefined,
  };
}

function todayInKoreaIso(): string {
  try {
    return new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Seoul",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date());
  } catch {
    return new Date().toISOString().slice(0, 10);
  }
}

export function usePlanWizard() {
  const today = todayInKoreaIso();

  const [state, setState] = useState<PlanWizardState>({
    step: 1,
    date: today,
    mode: 100,
    task: null,
    microAction: null,
    missions: [],
    missionCombinationMode: "basic",
    alarm: null,
    savedPlan: null,
    privacy_mode: "NORMAL",
  });

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // === ?ㅽ뀦 ?ㅻ퉬寃뚯씠??===
  const nextStep = () => {
    if (state.step < 5) {
      setState((prev) => ({ ...prev, step: (prev.step + 1) as WizardStep }));
    }
  };

  const prevStep = () => {
    if (state.step > 1) {
      setState((prev) => ({ ...prev, step: (prev.step - 1) as WizardStep }));
    }
  };

  const goToStep = (step: WizardStep) => {
    setState((prev) => ({ ...prev, step }));
  };

  // === ?곗씠???ㅼ젙 ===
  const setDate = (date: string) => {
    setState((prev) => ({ ...prev, date }));
  };

  const setMode = (mode: number) => {
    setState((prev) => ({ ...prev, mode }));
  };

  const setTask = (task: SelectedTask) => {
    setState((prev) => ({ ...prev, task }));
  };

  const setMicroAction = (microAction: SelectedMicroAction) => {
    setState((prev) => ({ ...prev, microAction }));
  };

  const setMissions = (missions: MissionConfig[]) => {
    setState((prev) => ({ ...prev, missions }));
  };

  const setMissionCombinationMode = (mode: MissionCombinationMode) => {
    setState((prev) => ({ ...prev, missionCombinationMode: mode }));
  };

  const setAlarm = (alarm: AlarmConfig) => {
    const normalized = normalizeAlarm(alarm);
    setState((prev) => ({ ...prev, alarm: normalized }));
  };

  const setPrivacyMode = (privacyMode: PrivacyMode) => {
    setState((prev) => ({ ...prev, privacy_mode: privacyMode }));
  };

  // === ?꾩껜 ?곗씠??寃利?===
  const validate = (alarm: AlarmConfig | null = state.alarm): string | null => {
    if (!state.task) {
      return "???쇱쓣 ?좏깮?섍굅???낅젰?섏꽭??";
    }

    if (!state.microAction) {
      return "誘몄꽭 ?됰룞???좏깮?섍굅???낅젰?섏꽭??";
    }

    if (!alarm) {
      return "?뚮엺 ?쒓컙???ㅼ젙?섏꽭??";
    }

    const startTime = alarm.start_time || alarm.time || "";
    const endTime = alarm.end_time || "";
    const startMinutes = parseMinutes(startTime);
    const endMinutes = parseMinutes(endTime);

    if (startMinutes == null) {
      return "Alarm start_time must be HH:mm";
    }
    if (endMinutes == null) {
      return "Alarm end_time must be HH:mm";
    }
    if (!alarm.ends_next_day && endMinutes <= startMinutes) {
      return "For same-day schedule, end_time must be later than start_time.";
    }
    if (
      (alarm.repeat === "custom" || alarm.repeat === "custom_days") &&
      (!alarm.custom_days || alarm.custom_days.length === 0)
    ) {
      return "Custom repeat requires at least one custom day.";
    }

    // ?쒖꽦?붾맂 誘몄뀡???덈뒗吏 ?뺤씤 (?좏깮??
    const enabledMissions = state.missions.filter((m) => m.enabled);
    if (enabledMissions.length === 0) {
      console.warn("?쒖꽦?붾맂 誘몄뀡???놁뒿?덈떎. (?좏깮 ?ы빆)");
    }

    return null;
  };

  // === API ?꾩넚 ===
  const submit = async (
    userId?: string,
    options?: { alarm?: AlarmConfig }
  ): Promise<PlanWithMissionResponse> => {
    const effectiveAlarm = normalizeAlarm(options?.alarm ?? state.alarm);
    const validationError = validate(effectiveAlarm);
    if (validationError) {
      setError(validationError);
      throw new Error(validationError);
    }

    setLoading(true);
    setError(null);

    try {
      // PlanWithMissionRequest 援ъ꽦
      const request: PlanWithMissionRequest = {
        date: state.date,
        mode: state.mode,
        items: [
          {
            // Task ?뺣낫
            task_id: state.task!.task_id,
            task_title: state.task!.task_id ? undefined : state.task!.task_title,
            est_minutes: state.task!.est_minutes,
            resistance_level: state.task!.resistance_level,
            planned_block_minutes: state.task!.est_minutes || 30,
            micro_steps: state.microAction!.start_trigger
              ? [state.microAction!.start_trigger]
              : [],

            // 誘몄꽭?됰룞 ?뺣낫
            micro_action: {
              micro_action_id: state.microAction!.micro_action_id,
              name: state.microAction!.name,
              description: state.microAction!.description,
              start_trigger: state.microAction!.start_trigger,
              source:
                state.microAction!.source === "history"
                  ? "user_history"
                  : state.microAction!.source,
            },

            // 誘몄뀡 ?뺣낫
            missions: state.missions.map((m, idx) => ({
              mission_id: `mission_${idx + 1}`,
              type: m.type,
              enabled: m.enabled,
              config: m.config as any,
            })),

            // 誘몄뀡 議고빀 紐⑤뱶
            missions_combination_mode: state.missionCombinationMode,

            // ?뚮엺 ?뺣낫
            alarm: effectiveAlarm!,
            privacy_mode: state.privacy_mode,
          },
        ],
        user_id: userId,
      };

      const response = await savePlanWithMission(request);
      try {
        await ingestSignal({
          user_id: userId || "demo-user",
          signal_type: "temporal",
          source: "plan_day",
          title: `?쇱젙 ?낅젰 ${state.date}`,
          body: [
            `date=${state.date}`,
            `mode=${state.mode}`,
            `task=${state.task?.task_title || "untitled"}`,
            `duration=${state.task?.est_minutes || 30}`,
            `resistance=${state.task?.resistance_level ?? "unset"}`,
            `alarm=${effectiveAlarm?.start_time || "unset"}~${effectiveAlarm?.end_time || "unset"}${effectiveAlarm?.ends_next_day ? " (+1d)" : ""}`,
          ].join(" | "),
          metadata: {
            day_id: response.day_id,
            privacy_mode: state.privacy_mode,
          },
        });
      } catch (signalError) {
        console.warn("Temporal signal ingest failed:", signalError);
      }
      setState((prev) => ({ ...prev, savedPlan: response, step: 5 })); // ?꾨즺 ?붾㈃?쇰줈 ?대룞
      return response;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "?????녿뒗 ?ㅻ쪟";
      setError(errorMessage);
      throw err;
    } finally {
      setLoading(false);
    }
  };

  // === 珥덇린??===
  const reset = () => {
    setState({
      step: 1,
      date: today,
      mode: 100,
      task: null,
      microAction: null,
      missions: [],
      missionCombinationMode: "basic",
      alarm: null,
      savedPlan: null,
      privacy_mode: "NORMAL",
    });
    setError(null);
  };

  return {
    // ?곹깭
    state,
    loading,
    error,

    // step navigation
    nextStep,
    prevStep,
    goToStep,

    // ?곗씠???ㅼ젙
    setDate,
    setMode,
    setTask,
    setMicroAction,
    setMissions,
    setMissionCombinationMode,
    setAlarm,
    setPrivacyMode,

    // ?≪뀡
    submit,
    reset,
    validate,
  };
}
