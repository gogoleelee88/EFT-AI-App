// 5단계: 저장 완료 요약 화면 컴포넌트
import React from "react";
import { useNavigate } from "react-router-dom";
import { EyeOff, Lock, ShieldCheck } from "lucide-react";
import { Button } from "../ui/Button";
import Card from "../ui/Card";
import type {
  SelectedTask,
  SelectedMicroAction,
  MissionConfig,
  AlarmConfig,
  PlanWithMissionResponse,
  PhotoMissionConfig,
  LocationMissionConfig,
  TimeMissionConfig,
} from "../../types/mission";
import type { PrivacyMode } from "../../types/privacy";
import {
  PRIVACY_MODE_DESCRIPTIONS,
  PRIVACY_MODE_LABELS,
} from "../../types/privacy";

interface PlanSummaryProps {
  task: SelectedTask;
  microAction: SelectedMicroAction;
  missions: MissionConfig[];
  alarm: AlarmConfig;
  savedPlan: PlanWithMissionResponse | null;
  onReset: () => void;
  privacyMode: PrivacyMode;
}

const PlanSummary: React.FC<PlanSummaryProps> = ({
  task,
  microAction,
  missions,
  alarm,
  savedPlan,
  onReset,
  privacyMode,
}) => {
  const navigate = useNavigate();

  const formatRepeat = (repeat: AlarmConfig["repeat"], customDays?: number[]) => {
    switch (repeat) {
      case "once":
        return "한 번만";
      case "daily":
        return "매일";
      case "weekdays":
        return "평일만 (월~금)";
      case "weekends":
        return "주말만 (토~일)";
      case "custom":
      case "custom_days":
        if (!customDays || customDays.length === 0) return "커스텀";
        const days = ["일", "월", "화", "수", "목", "금", "토"];
        return customDays.map((d) => days[d]).join(", ");
      default:
        return repeat;
    }
  };

  const privacyMeta: Record<
    PrivacyMode,
    { icon: typeof ShieldCheck; className: string }
  > = {
    NORMAL: {
      icon: ShieldCheck,
      className: "border-emerald-200 bg-emerald-50 text-emerald-700",
    },
    MASKED: {
      icon: EyeOff,
      className: "border-amber-200 bg-amber-50 text-amber-700",
    },
    APP_ONLY: {
      icon: Lock,
      className: "border-slate-200 bg-slate-100 text-slate-700",
    },
  };

  const PrivacyIcon = privacyMeta[privacyMode].icon;
  const start = alarm.start_time || alarm.time || "--:--";
  const end = alarm.end_time || "--:--";
  const windowText = `${start} ~ ${end}${alarm.ends_next_day ? " (+1일)" : ""}`;

  return (
    <div className="space-y-4 p-4 max-w-2xl mx-auto">
      {/* 성공 메시지 */}
      <div className="text-center py-8">
        <div className="text-6xl mb-4">✅</div>
        <h2 className="text-2xl font-bold text-gray-800 mb-2">
          "{task.task_title}" 알람이 설정되었어요!
        </h2>
        <p className="text-sm text-gray-600">
          설정한 시간에 미션과 함께 알림을 보내드릴게요.
        </p>
      </div>

      {/* 할 일 정보 */}
      <Card className="border-l-4 border-l-blue-500">
        <div className="space-y-2">
          <div className="text-sm font-semibold text-gray-700">📚 할 일</div>
          <div className="text-base font-medium text-gray-800">
            {task.task_title}
          </div>
          {task.est_minutes && (
            <div className="text-xs text-gray-600">
              예상 시간: {task.est_minutes}분
            </div>
          )}
          {typeof task.resistance_level === "number" && (
            <div className="text-xs text-amber-700">
              일정 저항감: {task.resistance_level}/10
            </div>
          )}
          {task.success_rate !== undefined && (
            <div className="text-xs text-gray-600">
              이전 성공률: {Math.round(task.success_rate * 100)}%
            </div>
          )}
        </div>
      </Card>

      {/* 미세 행동 */}
      <Card className="border-l-4 border-l-green-500">
        <div className="space-y-2">
          <div className="text-sm font-semibold text-gray-700">🎯 미세 행동</div>
          <div className="text-base font-medium text-gray-800">
            {microAction.name}
          </div>
          {microAction.description && (
            <div className="text-xs text-gray-600">{microAction.description}</div>
          )}
          {microAction.start_trigger && (
            <div className="text-xs text-indigo-600">
              시작 행동: {microAction.start_trigger}
            </div>
          )}
        </div>
      </Card>

      {/* 미션 목록 */}
      <Card className="border-l-4 border-l-purple-500">
        <div className="space-y-2">
          <div className="text-sm font-semibold text-gray-700">🎮 미션</div>
          {missions.filter((m) => m.enabled).length === 0 ? (
            <div className="text-sm text-gray-500">설정된 미션이 없습니다.</div>
          ) : (
            <div className="space-y-2">
              {missions
                .filter((m) => m.enabled)
                .map((m, idx) => (
                  <div
                    key={idx}
                    className="bg-gray-50 border border-gray-200 rounded-md p-2"
                  >
                    {m.type === "photo" && (
                      <div>
                        <div className="text-sm font-medium text-gray-800">
                          📸 사진 인증
                        </div>
                        <div className="text-xs text-gray-600 mt-1">
                          {(m.config as PhotoMissionConfig).requirement}
                        </div>
                      </div>
                    )}
                    {m.type === "location" && (
                      <div>
                        <div className="text-sm font-medium text-gray-800">
                          📍 장소 인증
                        </div>
                        <div className="text-xs text-gray-600 mt-1">
                          {(m.config as LocationMissionConfig).place_name}
                        </div>
                      </div>
                    )}
                    {m.type === "time_check" && (
                      <div>
                        <div className="text-sm font-medium text-gray-800">
                          ⏰ 시간 확인
                        </div>
                        <div className="text-xs text-gray-600 mt-1">
                          {(m.config as TimeMissionConfig).time}에 자동 확인
                        </div>
                      </div>
                    )}
                  </div>
                ))}
            </div>
          )}
        </div>
      </Card>

      {/* 알람 정보 */}
      <Card className="border-l-4 border-l-yellow-500">
        <div className="space-y-2">
          <div className="text-sm font-semibold text-gray-700">🔔 알람</div>
          <div className="text-base font-medium text-gray-800">
            {windowText}
          </div>
          <div className="text-xs text-gray-600">
            {formatRepeat(alarm.repeat, alarm.custom_days)}
          </div>
        </div>
      </Card>

      <Card className="border-l-4 border-l-slate-500">
        <div className="space-y-2">
          <div className="text-sm font-semibold text-gray-700">
            🔐 개인정보 보호 동기화
          </div>
          <div
            className={`inline-flex items-center gap-2 rounded-full border px-2 py-1 text-xs font-semibold ${privacyMeta[privacyMode].className}`}
          >
            <PrivacyIcon className="h-3.5 w-3.5" />
            {PRIVACY_MODE_LABELS[privacyMode]}
          </div>
          <div className="text-xs text-gray-600">
            {PRIVACY_MODE_DESCRIPTIONS[privacyMode]}
          </div>
        </div>
      </Card>

      {/* 저장 결과 */}
      {savedPlan && (
        <div className="text-xs text-gray-500 bg-gray-50 border border-gray-200 rounded-md px-3 py-2">
          DayPlan ID: {savedPlan.day_id} | 날짜: {savedPlan.date} | 모드:{" "}
          {savedPlan.mode}
        </div>
      )}

      {/* 액션 버튼 */}
      <div className="flex gap-2 pt-4">
        <Button
          variant="outline"
          size="md"
          onClick={() => navigate("/dashboard")}
          fullWidth
        >
          대시보드로 이동
        </Button>
        <Button variant="primary" size="md" onClick={onReset} fullWidth>
          새 할 일 추가
        </Button>
      </div>
    </div>
  );
};

export default PlanSummary;
