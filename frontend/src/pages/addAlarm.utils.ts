import type {
  AlarmConfig,
  MissionConfig,
  SelectedMicroAction,
} from "../types/mission";
import {
  addMinutesToKoreaOffsetDateTime,
  buildKoreaOffsetDateTime,
  getKoreaTimeLabel,
} from "../utils/koreaTime";

const HHMM_RX = /^([01]\d|2[0-3]):([0-5]\d)$/;

const DAY_LABELS = ["일", "월", "화", "수", "목", "금", "토"];

export const parseHhmm = (value: string): { hour: number; minute: number } | null => {
  const match = value.match(HHMM_RX);
  if (!match) return null;
  return { hour: Number(match[1]), minute: Number(match[2]) };
};

export const formatRepeatLabel = (
  repeat: AlarmConfig["repeat"],
  customDays?: number[]
) => {
  if (repeat === "once") return "한 번만";
  if (repeat === "daily") return "매일";
  if (repeat === "weekdays") return "평일";
  if (repeat === "weekends") return "주말";
  if (!customDays || customDays.length === 0) return "커스텀";
  return customDays.map((day) => `${DAY_LABELS[day]}요일`).join(", ");
};

export const resolveAlarmWindow = (
  dateIso: string,
  alarm: AlarmConfig,
  fallbackDurationMinutes: number
): {
  startIso: string;
  endIso: string;
  startLabel: string;
  endLabel: string;
  durationMinutes: number;
} | null => {
  const startLabel = (alarm.start_time || alarm.time || "").trim();
  const endLabel = (alarm.end_time || "").trim();
  const parsedStart = parseHhmm(startLabel);
  if (!parsedStart) return null;

  const hasExplicitEnd = endLabel.length > 0;
  const parsedEnd = hasExplicitEnd ? parseHhmm(endLabel) : null;
  if (hasExplicitEnd && !parsedEnd) return null;

  let durationMinutes = Math.max(1, Math.round(fallbackDurationMinutes));
  if (parsedEnd) {
    const startTotal = parsedStart.hour * 60 + parsedStart.minute;
    const endTotal = parsedEnd.hour * 60 + parsedEnd.minute;
    if (alarm.ends_next_day) {
      durationMinutes = 24 * 60 - startTotal + endTotal;
    } else {
      if (endTotal <= startTotal) return null;
      durationMinutes = endTotal - startTotal;
    }
  }

  const startIso = buildKoreaOffsetDateTime(dateIso, startLabel);
  if (!startIso) return null;

  const endIso = addMinutesToKoreaOffsetDateTime(startIso, durationMinutes);
  if (!endIso) return null;

  const resolvedEndLabel = parsedEnd ? endLabel : getKoreaTimeLabel(endIso);
  if (!resolvedEndLabel) return null;

  return {
    startIso,
    endIso,
    startLabel,
    endLabel: resolvedEndLabel,
    durationMinutes,
  };
};

export const buildAlarmDescription = (
  microAction: SelectedMicroAction | null,
  missions: MissionConfig[]
) => {
  const details: string[] = [];

  const microActionDescription = microAction?.description || microAction?.name;
  if (microActionDescription) {
    details.push(`마이크로 액션: ${microActionDescription}`);
  }

  missions
    .filter((mission) => mission.enabled)
    .forEach((mission, index) => {
      if (mission.type === "photo") {
        const config = mission.config as {
          description?: string;
          requirement?: string;
        };
        details.push(
          `미션 ${index + 1}(사진): ${config.description || config.requirement || "증빙 필요"}`
        );
        return;
      }

      if (mission.type === "location") {
        const config = mission.config as {
          place_name?: string;
          address?: string;
        };
        details.push(
          `미션 ${index + 1}(위치): ${[config.place_name, config.address]
            .filter(Boolean)
            .join(" / ") || "위치 확인"}`
        );
        return;
      }

      const config = mission.config as {
        time?: string;
        check_type?: string[];
      };
      details.push(
        `미션 ${index + 1}(시간): ${(config.check_type || []).join(", ") || "시간 체크"}${
          config.time ? ` @ ${config.time}` : ""
        }`
      );
    });

  return details.length > 0 ? details.join("\n") : undefined;
};
