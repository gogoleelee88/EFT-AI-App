import React, { useState } from "react";
import { Button } from "../ui/Button";
import Card from "../ui/Card";
import type {
  SelectedTask,
  SelectedMicroAction,
  MissionConfig,
  AlarmConfig,
} from "../../types/mission";
import type { PrivacyMode } from "../../types/privacy";

interface AlarmSettingStepProps {
  task: SelectedTask;
  microAction: SelectedMicroAction;
  missions: MissionConfig[];
  initialAlarm?: AlarmConfig | null;
  onComplete: (
    alarm: AlarmConfig,
    options: { syncMode: PrivacyMode }
  ) => Promise<void> | void;
  onBack: () => void;
  userId?: string;
  isGoogleConnected?: boolean;
  privacyMode?: PrivacyMode;
}

type GoogleSyncMode = "NORMAL" | "MASKED" | "APP_ONLY";

const WEEKDAYS = [
  { value: 0, label: "Sun" },
  { value: 1, label: "Mon" },
  { value: 2, label: "Tue" },
  { value: 3, label: "Wed" },
  { value: 4, label: "Thu" },
  { value: 5, label: "Fri" },
  { value: 6, label: "Sat" },
];

const HHMM_RX = /^([01]\d|2[0-3]):([0-5]\d)$/;

const parseMinutes = (value: string): number | null => {
  const match = value.match(HHMM_RX);
  if (!match) return null;
  return Number(match[1]) * 60 + Number(match[2]);
};

const missionLabel = (type: MissionConfig["type"]): string => {
  if (type === "photo") return "Photo verification";
  if (type === "location") return "Location verification";
  return "Time check";
};

const AlarmSettingStep: React.FC<AlarmSettingStepProps> = ({
  task,
  microAction,
  missions,
  initialAlarm,
  onComplete,
  onBack,
  isGoogleConnected = false,
  privacyMode = "NORMAL",
}) => {
  const initialStart = initialAlarm?.start_time || initialAlarm?.time || "19:00";
  const initialEnd = initialAlarm?.end_time || "20:00";

  const [startTime, setStartTime] = useState(initialStart);
  const [endTime, setEndTime] = useState(initialEnd);
  const [endsNextDay, setEndsNextDay] = useState(Boolean(initialAlarm?.ends_next_day));
  const [repeat, setRepeat] = useState<AlarmConfig["repeat"]>(initialAlarm?.repeat || "daily");
  const [customDays, setCustomDays] = useState<number[]>(initialAlarm?.custom_days || []);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [syncMode, setSyncMode] = useState<GoogleSyncMode>(
    privacyMode === "MASKED"
      ? "MASKED"
      : privacyMode === "APP_ONLY"
      ? "APP_ONLY"
      : "NORMAL"
  );

  const enabledMissions = missions.filter((m) => m.enabled);

  const toggleCustomDay = (day: number) => {
    if (customDays.includes(day)) {
      setCustomDays((prev) => prev.filter((d) => d !== day));
      return;
    }
    setCustomDays((prev) => [...prev, day].sort((a, b) => a - b));
  };

  const handleComplete = async () => {
    const startMinutes = parseMinutes(startTime);
    const endMinutes = parseMinutes(endTime);

    if (startMinutes == null) {
      setError("Please choose a valid start time (HH:mm).");
      return;
    }
    if (endMinutes == null) {
      setError("Please choose a valid end time (HH:mm).");
      return;
    }
    if (!endsNextDay && endMinutes <= startMinutes) {
      setError(
        "End time must be later than start time. Enable 'Ends next day' for overnight schedules."
      );
      return;
    }
    if ((repeat === "custom" || repeat === "custom_days") && customDays.length === 0) {
      setError("Choose at least one day for custom repeat.");
      return;
    }

    const alarm: AlarmConfig = {
      start_time: startTime,
      end_time: endTime,
      ends_next_day: endsNextDay,
      time: startTime,
      repeat,
      custom_days: repeat === "custom" || repeat === "custom_days" ? customDays : undefined,
    };

    const resolvedSyncMode: PrivacyMode =
      !isGoogleConnected && syncMode !== "APP_ONLY" ? "APP_ONLY" : syncMode;

    setSubmitting(true);
    setError(null);
    try {
      await Promise.resolve(
        onComplete(alarm, {
          syncMode: resolvedSyncMode,
        })
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Alarm save failed.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-4 p-4 max-w-2xl mx-auto">
      <Card className="bg-gradient-to-br from-blue-50 to-indigo-50 border-indigo-200">
        <div className="space-y-3">
          <div className="text-sm font-semibold text-indigo-900">Plan Preview</div>
          <div className="space-y-2 text-sm">
            <div className="flex items-start gap-2">
              <span className="text-gray-600">Task:</span>
              <span className="font-medium text-gray-800">{task.task_title}</span>
            </div>
            <div className="flex items-start gap-2">
              <span className="text-gray-600">Micro action:</span>
              <span className="font-medium text-gray-800">{microAction.name}</span>
            </div>
            <div className="flex items-start gap-2">
              <span className="text-gray-600">Missions:</span>
              <div className="flex-1">
                {enabledMissions.length > 0 ? (
                  enabledMissions.map((m, idx) => (
                    <div key={`${m.type}-${idx}`} className="text-xs text-indigo-700">
                      {missionLabel(m.type)}
                    </div>
                  ))
                ) : (
                  <span className="text-xs text-gray-500">No mission enabled</span>
                )}
              </div>
            </div>
          </div>
        </div>
      </Card>

      <Card>
        <div className="space-y-4">
          <h3 className="text-lg font-bold text-gray-800">Alarm Settings</h3>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="space-y-2">
              <label className="block text-sm font-medium text-gray-700">Work start time</label>
              <input
                type="time"
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
                className="w-full rounded-md border border-gray-300 px-4 py-3 text-lg font-mono focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
            <div className="space-y-2">
              <label className="block text-sm font-medium text-gray-700">Work end time</label>
              <input
                type="time"
                value={endTime}
                onChange={(e) => setEndTime(e.target.value)}
                className="w-full rounded-md border border-gray-300 px-4 py-3 text-lg font-mono focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
          </div>

          <label className="inline-flex items-center gap-2 text-sm text-gray-700">
            <input
              type="checkbox"
              checked={endsNextDay}
              onChange={(e) => setEndsNextDay(e.target.checked)}
              className="h-4 w-4"
            />
            Ends next day
          </label>

          <div className="space-y-2">
            <label className="block text-sm font-medium text-gray-700">Repeat</label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setRepeat("daily")}
                className={`border rounded-md p-3 text-center ${repeat === "daily" ? "border-indigo-500 bg-indigo-50" : "border-gray-200 hover:border-indigo-300"}`}
              >
                Daily
              </button>
              <button
                type="button"
                onClick={() => setRepeat("weekdays")}
                className={`border rounded-md p-3 text-center ${repeat === "weekdays" ? "border-indigo-500 bg-indigo-50" : "border-gray-200 hover:border-indigo-300"}`}
              >
                Weekdays
              </button>
              <button
                type="button"
                onClick={() => setRepeat("weekends")}
                className={`border rounded-md p-3 text-center ${repeat === "weekends" ? "border-indigo-500 bg-indigo-50" : "border-gray-200 hover:border-indigo-300"}`}
              >
                Weekends
              </button>
              <button
                type="button"
                onClick={() => setRepeat("custom")}
                className={`border rounded-md p-3 text-center ${repeat === "custom" ? "border-indigo-500 bg-indigo-50" : "border-gray-200 hover:border-indigo-300"}`}
              >
                Custom
              </button>
            </div>
          </div>

          {repeat === "custom" && (
            <div className="space-y-2">
              <label className="block text-sm font-medium text-gray-700">Custom days</label>
              <div className="flex gap-2">
                {WEEKDAYS.map((day) => (
                  <button
                    type="button"
                    key={day.value}
                    onClick={() => toggleCustomDay(day.value)}
                    className={`flex-1 border rounded-md p-2 text-center ${customDays.includes(day.value) ? "border-indigo-500 bg-indigo-500 text-white" : "border-gray-200 hover:border-indigo-300"}`}
                  >
                    <span className="text-sm font-medium">{day.label}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="text-xs text-gray-600 bg-gray-50 border border-gray-200 rounded-md px-3 py-2">
            Alarm is saved now. Push registration is optional and can be enabled later.
          </div>

          <div className="space-y-2">
            <label className="block text-sm font-medium text-gray-700">
              Google sync mode
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="radio"
                name="google-sync-mode"
                checked={syncMode === "NORMAL"}
                onChange={() => setSyncMode("NORMAL")}
                disabled={!isGoogleConnected}
                className="h-4 w-4"
              />
              <span>일반 동기화</span>
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="radio"
                name="google-sync-mode"
                checked={syncMode === "MASKED"}
                onChange={() => setSyncMode("MASKED")}
                disabled={!isGoogleConnected}
                className="h-4 w-4"
              />
              <span>마스킹 동기화</span>
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="radio"
                name="google-sync-mode"
                checked={syncMode === "APP_ONLY"}
                onChange={() => setSyncMode("APP_ONLY")}
                className="h-4 w-4"
              />
              <span>앱 전용(외부 공유 없음)</span>
            </label>
            <div className="text-xs text-gray-500">
              - 일반 동기화: Google Calendar로 일정 제목과 세부내용(설명/장소 등)을 그대로 보냅니다.
              <br />
              - 마스킹 동기화: Google Calendar에는 가명(별칭) 제목과 민감정보를 뺀 안전한 설명만 보냅니다.
              <br />
              - 앱 전용(외부 공유 없음): 일정을 앱 안에만 저장하고 Google Calendar로는 보내지 않습니다.
            </div>
            {privacyMode !== "APP_ONLY" && !isGoogleConnected && (
              <div className="text-xs text-amber-700">
                Google Calendar 미연결 상태입니다. 앱 전용으로 저장됩니다.
              </div>
            )}
          </div>

          {error && (
            <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-md px-3 py-2">
              {error}
            </div>
          )}
        </div>
      </Card>

      <div className="flex justify-between pt-2">
        <Button variant="outline" size="md" onClick={onBack} disabled={submitting}>
          Back
        </Button>
        <Button variant="primary" size="md" onClick={handleComplete} disabled={submitting}>
          {submitting ? "Setting..." : "Complete"}
        </Button>
      </div>
    </div>
  );
};

export default AlarmSettingStep;
