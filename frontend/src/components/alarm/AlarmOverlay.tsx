// 알람 전체 화면 오버레이
import React, { useEffect, useState } from "react";
import { Button } from "../ui/Button";
import Card from "../ui/Card";
import PhotoUploadForm from "./PhotoUploadForm";
import LocationCheckForm from "./LocationCheckForm";
import type { MissionConfig, MissionCombinationMode } from "../../types/mission";

interface AlarmOverlayProps {
  dayId: number;
  taskTitle: string;
  microActionName: string;
  startTrigger?: string;
  missions: MissionConfig[];
  combinationMode: MissionCombinationMode;
  onDismiss: () => void;
  onSnooze: () => void;
  userId?: string;
}

type MissionStatus = "pending" | "verifying" | "passed" | "failed";

const AlarmOverlay: React.FC<AlarmOverlayProps> = ({
  dayId,
  taskTitle,
  microActionName,
  startTrigger,
  missions,
  combinationMode,
  onDismiss,
  onSnooze,
  userId,
}) => {
  const [missionStatuses, setMissionStatuses] = useState<Record<string, MissionStatus>>(
    missions.reduce((acc, m, idx) => ({ ...acc, [`${m.type}_${idx}`]: "pending" }), {})
  );

  const [activeModal, setActiveModal] = useState<"photo" | "location" | null>(null);
  const [checkingDismissal, setCheckingDismissal] = useState(false);
  const [missionRunId, setMissionRunId] = useState<string | null>(null);

  const updateMissionStatus = (key: string, status: MissionStatus) => {
    setMissionStatuses((prev) => ({ ...prev, [key]: status }));
  };

  useEffect(() => {
    let cancelled = false;
    const startMissionRun = async () => {
      try {
        const response = await fetch("/api/spec/missions/start", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({
            day_id: dayId,
            user_id: userId || undefined,
          }),
        });
        if (!response.ok) return;
        const data = await response.json();
        if (!cancelled && typeof data?.mission_run_id === "string") {
          setMissionRunId(data.mission_run_id);
        }
      } catch {
        // Keep backward compatibility when mission start is unavailable.
      }
    };
    startMissionRun();
    return () => {
      cancelled = true;
    };
  }, [dayId, userId]);

  const handleCheckDismissal = async () => {
    setCheckingDismissal(true);
    try {
      const checkParams = new URLSearchParams({
        day_id: String(dayId),
        combination_mode: combinationMode,
      });
      if (missionRunId) checkParams.append("mission_run_id", missionRunId);
      if (userId) checkParams.append("user_id", userId);

      const response = await fetch(`/api/spec/missions/check-alarm?${checkParams.toString()}`, {
        method: "POST",
        credentials: "include",
      });

      const data = await response.json();

      if (data.can_dismiss) {
        // 알람 해제
        const dismissParams = new URLSearchParams({
          day_id: String(dayId),
        });
        if (missionRunId) dismissParams.append("mission_run_id", missionRunId);
        if (userId) dismissParams.append("user_id", userId);
        await fetch(`/api/spec/missions/dismiss-alarm?${dismissParams.toString()}`, {
          method: "POST",
          credentials: "include",
        });

        alert("✅ " + data.reason);
        onDismiss();
      } else {
        alert("⚠️ " + data.reason);
      }
    } catch (err) {
      alert("알람 해제 확인 중 오류가 발생했습니다.");
    } finally {
      setCheckingDismissal(false);
    }
  };

  const enabledMissions = missions.filter((m) => m.enabled);

  return (
    <div className="fixed inset-0 bg-gradient-to-br from-indigo-900 to-purple-900 flex items-center justify-center z-50 p-4">
      <div className="w-full max-w-lg">
        <Card padding="lg">
          <div className="space-y-6">
            {/* 헤더 */}
            <div className="text-center space-y-2">
              <div className="text-4xl">⏰</div>
              <h1 className="text-2xl font-bold text-gray-800">{taskTitle}</h1>
              <div className="text-base text-gray-700 font-medium">
                🎯 {microActionName}
              </div>
              {startTrigger && (
                <div className="text-sm text-indigo-600 bg-indigo-50 rounded-md px-3 py-2">
                  • {startTrigger}
                </div>
              )}
            </div>

            {/* 미션 목록 */}
            <div className="space-y-4">
              <div className="text-sm font-semibold text-gray-700 border-b border-gray-200 pb-2">
                미션 완료하기
              </div>

              {enabledMissions.map((mission, idx) => {
                const key = `${mission.type}_${idx}`;
                const status = missionStatuses[key];

                return (
                  <div
                    key={key}
                    className={`border rounded-md p-4 transition-all ${
                      status === "passed"
                        ? "border-green-500 bg-green-50"
                        : status === "failed"
                        ? "border-red-500 bg-red-50"
                        : status === "verifying"
                        ? "border-blue-500 bg-blue-50"
                        : "border-gray-300"
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          checked={status === "passed"}
                          readOnly
                          className="w-5 h-5"
                        />
                        <span className="font-medium text-gray-800">
                          {mission.type === "photo" && "📸 사진 인증"}
                          {mission.type === "location" && "📍 장소 인증"}
                          {mission.type === "time_check" && "⏰ 시간 확인"}
                        </span>
                      </div>

                      {status === "pending" && (
                        <Button
                          size="sm"
                          variant="primary"
                          onClick={() =>
                            setActiveModal(
                              mission.type === "photo"
                                ? "photo"
                                : mission.type === "location"
                                ? "location"
                                : null
                            )
                          }
                        >
                          {mission.type === "photo" && "사진 찍기"}
                          {mission.type === "location" && "위치 확인"}
                          {mission.type === "time_check" && "확인"}
                        </Button>
                      )}

                      {status === "verifying" && (
                        <div className="text-xs text-blue-600">검증 중...</div>
                      )}

                      {status === "passed" && <div className="text-green-600 text-xl">✓</div>}

                      {status === "failed" && (
                        <Button size="sm" variant="outline">
                          재시도
                        </Button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* 미션 조합 모드 안내 */}
            <div className="text-xs text-gray-600 bg-gray-50 rounded-md px-3 py-2">
              🎮 모드:{" "}
              {combinationMode === "strict"
                ? "엄격 (모든 미션 통과 필요)"
                : combinationMode === "basic"
                ? "기본 (사진 미션만 통과)"
                : "유연 (1개만 통과)"}
            </div>

            {/* 액션 버튼 */}
            <div className="flex gap-2 pt-4 border-t border-gray-200">
              <Button variant="outline" size="md" onClick={onSnooze} fullWidth>
                나중에 하기 (10분)
              </Button>
              <Button
                variant="primary"
                size="md"
                onClick={handleCheckDismissal}
                disabled={checkingDismissal}
                fullWidth
              >
                {checkingDismissal ? "확인 중..." : "미션 완료"}
              </Button>
            </div>
          </div>
        </Card>

        {/* 사진 업로드 모달 */}
        {activeModal === "photo" && (
          <PhotoUploadForm
            dayId={dayId}
            mission={missions.find((m) => m.type === "photo")!}
            onSuccess={(key) => {
              updateMissionStatus(key, "passed");
              setActiveModal(null);
            }}
            onFail={(key) => {
              updateMissionStatus(key, "failed");
              setActiveModal(null);
            }}
            onCancel={() => setActiveModal(null)}
            userId={userId}
            missionRunId={missionRunId || undefined}
          />
        )}

        {/* 위치 확인 모달 */}
        {activeModal === "location" && (
          <LocationCheckForm
            dayId={dayId}
            mission={missions.find((m) => m.type === "location")!}
            onSuccess={(key) => {
              updateMissionStatus(key, "passed");
              setActiveModal(null);
            }}
            onFail={(key) => {
              updateMissionStatus(key, "failed");
              setActiveModal(null);
            }}
            onCancel={() => setActiveModal(null)}
            userId={userId}
            missionRunId={missionRunId || undefined}
          />
        )}
      </div>
    </div>
  );
};

export default AlarmOverlay;
