// 3단계: 미션 설정 컴포넌트 (케이스 A/B 분기)
import React, { useEffect, useState } from "react";
import { Button } from "../ui/Button";
import Card from "../ui/Card";
import type {
  SelectedTask,
  SelectedMicroAction,
  MissionConfig,
  MissionCombinationMode,
  PhotoMissionConfig,
  LocationMissionConfig,
  TimeMissionConfig,
} from "../../types/mission";
import { recommendMissions } from "../../services/missionService";
import MissionPhotoConfig from "./MissionPhotoConfig";
import MissionLocationConfig from "./MissionLocationConfig";
import MissionTimeConfig from "./MissionTimeConfig";

interface MissionSettingStepProps {
  task: SelectedTask;
  microAction: SelectedMicroAction;
  initialMissions?: MissionConfig[];
  onNext: (
    missions: MissionConfig[],
    combinationMode: MissionCombinationMode
  ) => void;
  onBack: () => void;
  userId?: string;
}

type ConfigModalType = "photo" | "location" | "time_check" | null;

const MissionSettingStep: React.FC<MissionSettingStepProps> = ({
  task,
  microAction,
  initialMissions = [],
  onNext,
  onBack,
  userId,
}) => {
  const isReuseMode = microAction.source === "history" && microAction.previousMissions;

  const [missions, setMissions] = useState<MissionConfig[]>(
    initialMissions.length > 0
      ? initialMissions
      : microAction.previousMissions?.map((m) => ({
          type: m.type,
          enabled: m.enabled,
          config: m.config,
        })) || []
  );
  const [combinationMode, setCombinationMode] =
    useState<MissionCombinationMode>("basic");
  const [aiRecommendations, setAiRecommendations] = useState<any>(null);
  const [configModal, setConfigModal] = useState<ConfigModalType>(null);
  const [loading, setLoading] = useState(false);

  // AI 추천 로드 (새로운 방법인 경우)
  useEffect(() => {
    if (!isReuseMode) {
      loadAiRecommendations();
    }
  }, []);

  const loadAiRecommendations = async () => {
    setLoading(true);
    try {
      const recommendations = await recommendMissions(
        task.task_title,
        microAction.name,
        microAction.start_trigger,
        userId
      );
      setAiRecommendations(recommendations);

      // AI 추천으로 초기 미션 자동 설정 (사진 인증 기본 활성화)
      if (missions.length === 0 && recommendations.photo_options?.length > 0) {
        setMissions([
          {
            type: "photo",
            enabled: true,
            config: recommendations.photo_options[0].config,
          },
        ]);
      }
    } catch (err) {
      console.error("AI 미션 추천 실패:", err);
    } finally {
      setLoading(false);
    }
  };

  const getMission = (type: MissionConfig["type"]) => {
    return missions.find((m) => m.type === type);
  };

  const toggleMissionEnabled = (type: MissionConfig["type"]) => {
    setMissions((prev) => {
      const existing = prev.find((m) => m.type === type);
      if (existing) {
        return prev.map((m) =>
          m.type === type ? { ...m, enabled: !m.enabled } : m
        );
      }
      return prev;
    });
  };

  const updateMissionConfig = (
    type: MissionConfig["type"],
    config: PhotoMissionConfig | LocationMissionConfig | TimeMissionConfig | null
  ) => {
    if (config === null) {
      // 장소 상관없음 선택 시 → 미션 제거
      setMissions((prev) => prev.filter((m) => m.type !== type));
      setConfigModal(null);
      return;
    }

    setMissions((prev) => {
      const existing = prev.find((m) => m.type === type);
      if (existing) {
        return prev.map((m) => (m.type === type ? { ...m, config, enabled: true } : m));
      } else {
        return [...prev, { type, enabled: true, config }];
      }
    });
    setConfigModal(null);
  };

  const handleQuickAccept = () => {
    // 이전 설정 그대로 사용 (케이스 A) 또는 AI 추천대로 전부 (케이스 B)
    onNext(missions, combinationMode);
  };

  const handleNext = () => {
    if (missions.filter((m) => m.enabled).length === 0) {
      if (!confirm("활성화된 미션이 없습니다. 계속하시겠습니까?")) {
        return;
      }
    }
    onNext(missions, combinationMode);
  };

  return (
    <div className="space-y-4 p-4 max-w-2xl mx-auto">
      {/* 헤더 */}
      <div className="text-center">
        <h2 className="text-xl font-bold text-gray-800">
          🎯 {microAction.name}
        </h2>
        {microAction.description && (
          <p className="text-sm text-gray-600 mt-1">"{microAction.description}"</p>
        )}
      </div>

      {/* 케이스 표시 */}
      <Card className={isReuseMode ? "bg-blue-50 border-blue-200" : "bg-green-50 border-green-200"}>
        <div className="text-sm">
          {isReuseMode ? (
            <>
              <div className="font-semibold text-blue-800">
                💾 이전 설정 불러오기
              </div>
              {microAction.start_trigger && (
                <div className="text-gray-700 mt-2">
                  시작 행동: • {microAction.start_trigger}
                </div>
              )}
            </>
          ) : (
            <>
              <div className="font-semibold text-green-800">
                🆕 처음 시도하는 방법이에요
              </div>
              {microAction.start_trigger && (
                <div className="text-gray-700 mt-2">
                  시작 행동: • {microAction.start_trigger}
                </div>
              )}
            </>
          )}
        </div>
      </Card>

      {/* 미션 설정 */}
      <Card>
        <div className="space-y-4">
          <div className="text-sm font-semibold text-gray-700 border-b border-gray-200 pb-2">
            미션 설정
          </div>

          {/* 미션1: 사진 인증 */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={getMission("photo")?.enabled || false}
                  onChange={() => toggleMissionEnabled("photo")}
                  className="cursor-pointer"
                />
                <span className="text-sm font-medium text-gray-800">
                  미션1: 📸 사진 인증
                </span>
              </div>
              {getMission("photo") && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setConfigModal("photo")}
                >
                  {isReuseMode ? "수정" : "설정"}
                </Button>
              )}
              {!getMission("photo") && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setConfigModal("photo")}
                >
                  추가하기
                </Button>
              )}
            </div>
            {getMission("photo")?.config && (
              <div className="ml-6 text-xs text-gray-600 bg-gray-50 border border-gray-200 rounded-md p-2">
                📸 {(getMission("photo")!.config as PhotoMissionConfig).requirement}
                {isReuseMode && getMission("photo")?.enabled && (
                  <span className="text-green-600 ml-2">✅</span>
                )}
              </div>
            )}
          </div>

          {/* 미션2: 장소 인증 */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={getMission("location")?.enabled || false}
                  onChange={() => toggleMissionEnabled("location")}
                  className="cursor-pointer"
                />
                <span className="text-sm font-medium text-gray-800">
                  미션2: 📍 장소 인증
                </span>
              </div>
              {getMission("location") && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setConfigModal("location")}
                >
                  {isReuseMode ? "수정" : "설정"}
                </Button>
              )}
              {!getMission("location") && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setConfigModal("location")}
                >
                  추가하기
                </Button>
              )}
            </div>
            {getMission("location")?.config && (
              <div className="ml-6 text-xs text-gray-600 bg-gray-50 border border-gray-200 rounded-md p-2">
                📍{" "}
                {(getMission("location")!.config as LocationMissionConfig).place_name}
                {isReuseMode && getMission("location")?.enabled && (
                  <span className="text-green-600 ml-2">✅</span>
                )}
              </div>
            )}
          </div>

          {/* 미션3: 시간 확인 */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={getMission("time_check")?.enabled || false}
                  onChange={() => toggleMissionEnabled("time_check")}
                  className="cursor-pointer"
                />
                <span className="text-sm font-medium text-gray-800">
                  미션3: ⏰ 시간 확인
                </span>
              </div>
              {getMission("time_check") && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setConfigModal("time_check")}
                >
                  {isReuseMode ? "수정" : "설정"}
                </Button>
              )}
              {!getMission("time_check") && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setConfigModal("time_check")}
                >
                  추가하기
                </Button>
              )}
            </div>
            {getMission("time_check")?.config && (
              <div className="ml-6 text-xs text-gray-600 bg-gray-50 border border-gray-200 rounded-md p-2">
                ⏰ {(getMission("time_check")!.config as TimeMissionConfig).time}에 자동 확인
                {isReuseMode && getMission("time_check")?.enabled && (
                  <span className="text-green-600 ml-2">✅</span>
                )}
              </div>
            )}
          </div>
        </div>
      </Card>

      {/* 미션 조합 모드 */}
      <Card className="bg-gradient-to-br from-purple-50 to-indigo-50">
        <div className="space-y-3">
          <div className="text-sm font-semibold text-gray-700">
            🎮 미션 조합 모드
          </div>
          <div className="space-y-2">
            <div
              onClick={() => setCombinationMode("strict")}
              className={`
                border rounded-md p-2 cursor-pointer transition-all
                ${
                  combinationMode === "strict"
                    ? "border-purple-500 bg-purple-50"
                    : "border-gray-200 hover:border-purple-300"
                }
              `}
            >
              <input
                type="radio"
                checked={combinationMode === "strict"}
                onChange={() => {}}
                className="cursor-pointer mr-2"
              />
              <span className="text-sm font-medium">엄격 — 모든 미션 통과 필요</span>
            </div>
            <div
              onClick={() => setCombinationMode("basic")}
              className={`
                border rounded-md p-2 cursor-pointer transition-all
                ${
                  combinationMode === "basic"
                    ? "border-indigo-500 bg-indigo-50"
                    : "border-gray-200 hover:border-indigo-300"
                }
              `}
            >
              <input
                type="radio"
                checked={combinationMode === "basic"}
                onChange={() => {}}
                className="cursor-pointer mr-2"
              />
              <span className="text-sm font-medium">
                기본 — 사진 미션만 통과하면 OK
              </span>
            </div>
            <div
              onClick={() => setCombinationMode("flexible")}
              className={`
                border rounded-md p-2 cursor-pointer transition-all
                ${
                  combinationMode === "flexible"
                    ? "border-green-500 bg-green-50"
                    : "border-gray-200 hover:border-green-300"
                }
              `}
            >
              <input
                type="radio"
                checked={combinationMode === "flexible"}
                onChange={() => {}}
                className="cursor-pointer mr-2"
              />
              <span className="text-sm font-medium">
                유연 — 아무 미션 1개만 통과하면 OK
              </span>
            </div>
          </div>
        </div>
      </Card>

      {/* 빠른 설정 버튼 */}
      <div className="flex gap-2">
        {isReuseMode && (
          <Button variant="primary" size="md" onClick={handleQuickAccept} fullWidth>
            이전 설정 그대로 사용
          </Button>
        )}
        {!isReuseMode && aiRecommendations && (
          <Button variant="primary" size="md" onClick={handleQuickAccept} fullWidth>
            AI 추천대로 전부
          </Button>
        )}
      </div>

      {/* 네비게이션 버튼 */}
      <div className="flex justify-between pt-2">
        <Button variant="outline" size="md" onClick={onBack}>
          ← 이전
        </Button>
        <Button variant="primary" size="md" onClick={handleNext}>
          다음 (알람 설정) →
        </Button>
      </div>

      {/* 미션 상세 설정 모달 */}
      {configModal === "photo" && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="max-w-lg w-full">
            <MissionPhotoConfig
              aiRecommendations={aiRecommendations?.photo_options}
              initialConfig={getMission("photo")?.config as PhotoMissionConfig}
              onSave={(config) => updateMissionConfig("photo", config)}
              onCancel={() => setConfigModal(null)}
            />
          </div>
        </div>
      )}

      {configModal === "location" && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="max-w-lg w-full">
            <MissionLocationConfig
              userId={userId}
              initialConfig={getMission("location")?.config as LocationMissionConfig}
              onSave={(config) => updateMissionConfig("location", config)}
              onCancel={() => setConfigModal(null)}
            />
          </div>
        </div>
      )}

      {configModal === "time_check" && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="max-w-lg w-full">
            <MissionTimeConfig
              initialConfig={getMission("time_check")?.config as TimeMissionConfig}
              onSave={(config) => updateMissionConfig("time_check", config)}
              onCancel={() => setConfigModal(null)}
            />
          </div>
        </div>
      )}
    </div>
  );
};

export default MissionSettingStep;
