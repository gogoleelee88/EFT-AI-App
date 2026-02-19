// 2단계: 미세 행동 선택 화면
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button } from "../ui/Button";
import Card from "../ui/Card";
import type {
  MicroAction,
  MicroActionSuggestion,
  PlanItemInput,
  SelectedMicroAction,
  SelectedTask,
} from "../../types/mission";
import {
  createMicroAction,
  getMicroActions,
  getMissionPresets,
  suggestMicroActions,
} from "../../services/missionService";

interface MicroActionStepProps {
  task: SelectedTask;
  initialMicroAction?: SelectedMicroAction | null;
  onNext: (action: SelectedMicroAction) => void;
  onBack: () => void;
  onTaskUpdate?: (task: SelectedTask) => void;
  userId?: string;
  planItems?: PlanItemInput[];
  missionType?: string;
}

const SUGGEST_COOLDOWN_MS = 20000;

const MicroActionStep: React.FC<MicroActionStepProps> = ({
  task,
  initialMicroAction,
  onNext,
  onBack,
  onTaskUpdate,
  userId,
  planItems,
  missionType,
}) => {
  const [historyActions, setHistoryActions] = useState<MicroAction[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");

  const [customInput, setCustomInput] = useState("");
  const [saveError, setSaveError] = useState<string | null>(null);

  const [aiSuggestions, setAiSuggestions] = useState<MicroActionSuggestion[]>([]);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);

  const lastSuggestRef = useRef<{ key: string; at: number } | null>(null);
  const recentNamesRef = useRef<string[]>([]);

  const normalizedPlanItems = useMemo(() => {
    const items = (planItems && planItems.length > 0 ? planItems : []).filter(
      (item) => item.title && item.title.trim().length > 0
    );
    if (items.length === 0 && task.task_title) {
      items.push({ title: task.task_title });
    }
    return items.slice(0, 6);
  }, [planItems, task.task_title]);

  const suggestKey = useMemo(() => {
    return JSON.stringify({ items: normalizedPlanItems, missionType });
  }, [normalizedPlanItems, missionType]);

  const canSuggest = normalizedPlanItems.length > 0;
  const displaySuggestions = useMemo(
    () =>
      aiSuggestions.length > 0
        ? aiSuggestions
        : buildFallbackSuggestions(normalizedPlanItems),
    [aiSuggestions, normalizedPlanItems]
  );

  if (import.meta.env.DEV && displaySuggestions.length > 0) {
    console.log("[MicroActionStep] suggestions", displaySuggestions);
  }

  useEffect(() => {
    recentNamesRef.current = historyActions
      .map((action) => action.name)
      .filter(Boolean)
      .slice(0, 5);
  }, [historyActions]);

  const loadHistory = useCallback(
    async (query: string) => {
      if (!task.task_id) {
        setHistoryActions([]);
        return;
      }
      setHistoryLoading(true);
      setHistoryError(null);
      try {
        const history = await getMicroActions(task.task_id, userId, 20, query, true);
        setHistoryActions(history);
      } catch (err) {
        console.error("미세 행동 이력 조회 실패:", err);
        setHistoryError("이력 조회 중 오류가 발생했어요.");
      } finally {
        setHistoryLoading(false);
      }
    },
    [task.task_id, userId]
  );

  useEffect(() => {
    if (!task.task_id) {
      setHistoryActions([]);
      return;
    }
    const handle = window.setTimeout(() => {
      loadHistory(searchQuery.trim());
    }, 250);
    return () => window.clearTimeout(handle);
  }, [task.task_id, searchQuery, loadHistory]);

  const ensureSuggestions = useCallback(
    (items: MicroActionSuggestion[]) => {
      if (items.length >= 3) return items.slice(0, 3);
      const fallback = buildFallbackSuggestions(normalizedPlanItems);
      const merged = [...items];
      for (const fb of fallback) {
        if (merged.length >= 3) break;
        merged.push(fb);
      }
      return merged.slice(0, 3);
    },
    [normalizedPlanItems]
  );

  const requestSuggestions = useCallback(
    async (force = false) => {
      if (!canSuggest) {
        setAiSuggestions(buildFallbackSuggestions(normalizedPlanItems));
        return;
      }
      const now = Date.now();
      const currentKey = suggestKey;
      if (!force && lastSuggestRef.current) {
        const { key, at } = lastSuggestRef.current;
        if (key === currentKey && now - at < SUGGEST_COOLDOWN_MS) {
          return;
        }
      }
      lastSuggestRef.current = { key: currentKey, at: now };

      setAiLoading(true);
      setAiError(null);
      try {
        const response = await suggestMicroActions({
          plan_items: normalizedPlanItems,
          mission_type: missionType,
          recent_micro_actions: recentNamesRef.current,
        });
        const suggestions = ensureSuggestions(response.suggestions || []);
        setAiSuggestions(suggestions);
      } catch (err) {
        console.error("AI 추천 요청 실패:", err);
        setAiError("AI 추천을 가져오지 못했어요. 다시 시도해주세요.");
        setAiSuggestions(buildFallbackSuggestions(normalizedPlanItems));
      } finally {
        setAiLoading(false);
      }
    },
    [canSuggest, ensureSuggestions, missionType, normalizedPlanItems, suggestKey]
  );

  useEffect(() => {
    if (!canSuggest) return;
    requestSuggestions(false);
  }, [canSuggest, requestSuggestions, suggestKey]);

  const updateTaskIfNeeded = (microAction: MicroAction) => {
    if (!task.task_id && onTaskUpdate) {
      onTaskUpdate({
        source: task.source,
        task_id: microAction.task_id,
        task_title: task.task_title,
        est_minutes: task.est_minutes,
      });
    }
  };

  const mergeHistoryAction = (action: MicroAction) => {
    setHistoryActions((prev) => {
      const exists = prev.find((item) => item.micro_action_id === action.micro_action_id);
      if (exists) return prev;
      return [action, ...prev];
    });
  };

  const handleUseHistory = async (action: MicroAction) => {
    setSaveError(null);
    try {
      const presets = await getMissionPresets(action.micro_action_id, userId);
      onNext({
        source: "history",
        micro_action_id: action.micro_action_id,
        name: action.name,
        description: action.description,
        start_trigger: action.start_trigger,
        est_minutes: action.est_minutes,
        previousMissions: presets,
      });
    } catch (err) {
      console.error("미션 프리셋 조회 실패:", err);
      onNext({
        source: "history",
        micro_action_id: action.micro_action_id,
        name: action.name,
        description: action.description,
        start_trigger: action.start_trigger,
        est_minutes: action.est_minutes,
      });
    }
  };

  const saveAndSelect = async (payload: {
    name: string;
    description?: string;
    start_trigger?: string;
    source: "user_custom" | "ai_recommendation";
    est_minutes?: number;
  }) => {
    setSaveError(null);
    try {
      const microAction = await createMicroAction(
        {
          task_id: task.task_id,
          task_title: task.task_id ? undefined : task.task_title,
          task_est_minutes: task.est_minutes,
          name: payload.name,
          description: payload.description,
          start_trigger: payload.start_trigger,
          source: payload.source,
          est_minutes: payload.est_minutes,
        },
        userId
      );
      mergeHistoryAction(microAction);
      updateTaskIfNeeded(microAction);
      onNext({
        source: payload.source,
        micro_action_id: microAction.micro_action_id,
        name: microAction.name,
        description: microAction.description,
        start_trigger: microAction.start_trigger,
        est_minutes: microAction.est_minutes,
      });
    } catch (err) {
      console.error("미세 행동 저장 실패:", err);
      setSaveError("미세 행동 저장 중 오류가 발생했어요.");
    }
  };

  const handleCustomInput = () => {
    if (!customInput.trim()) {
      setSaveError("내용을 입력해주세요.");
      return;
    }
    void saveAndSelect({
      name: customInput.trim(),
      source: "user_custom",
    });
  };

  const handleAddSuggestion = (suggestion: MicroActionSuggestion) => {
    void saveAndSelect({
      name: suggestion.title,
      description: suggestion.why,
      start_trigger: suggestion.trigger,
      est_minutes: suggestion.duration_min,
      source: "ai_recommendation",
    });
  };

  return (
    <div className="space-y-4 p-4 max-w-2xl mx-auto">
      <div className="text-center">
        <h2 className="text-xl font-bold text-gray-800">
          미세 행동 설정: {task.task_title}
        </h2>
        <p className="text-sm text-gray-600 mt-1">
          시작을 도와줄 작은 행동을 선택하거나 추가하세요.
        </p>
      </div>

      <Card>
        <div className="space-y-3">
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-sm font-semibold text-gray-700">내 이력에서 선택</h3>
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="검색"
                className="rounded-md border border-gray-300 px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
          </div>

          {historyLoading && (
            <div className="text-xs text-gray-500">이력 불러오는 중...</div>
          )}
          {historyError && (
            <div className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-md px-2 py-1.5">
              {historyError}
            </div>
          )}
          {!historyLoading && historyActions.length === 0 && (
            <div className="text-xs text-gray-400">
              {task.task_id
                ? "저장된 이력이 없어요. 직접 입력해 추가해보세요."
                : "먼저 할 일을 저장하면 이력 조회가 가능해요."}
            </div>
          )}
          {historyActions.length > 0 && (
            <div className="space-y-2">
              {historyActions.map((action) => (
                <div
                  key={action.micro_action_id}
                  className="border border-gray-200 rounded-md p-3 hover:border-indigo-300 hover:bg-indigo-50/30 transition-all"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1">
                      <div className="font-medium text-gray-800">{action.name}</div>
                      {action.description && (
                        <div className="text-xs text-gray-600 mt-1">
                          {action.description}
                        </div>
                      )}
                      <div className="text-xs text-gray-500 mt-1 flex items-center gap-2">
                        <span>
                          성공률 {Math.round(action.success_rate * 100)}% (
                          {action.success_count}/{action.total_count}회)
                        </span>
                        {action.last_used_at && (
                          <span>{formatRelativeTime(action.last_used_at)}</span>
                        )}
                      </div>
                    </div>
                    <Button
                      variant="primary"
                      size="sm"
                      onClick={() => handleUseHistory(action)}
                    >
                      선택
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </Card>

      <Card>
        <div className="space-y-3">
          <label className="block text-sm font-medium text-gray-700">
            직접 입력
          </label>
          <div className="flex gap-2">
            <input
              type="text"
              value={customInput}
              onChange={(e) => setCustomInput(e.target.value)}
              placeholder="예) 물 한 컵 마시기"
              className="flex-1 rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              onKeyDown={(e) => e.key === "Enter" && handleCustomInput()}
            />
            <Button variant="outline" size="sm" onClick={handleCustomInput}>
              추가
            </Button>
          </div>
        </div>
      </Card>

      <Card>
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-gray-700">AI 추천 3개</h3>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => requestSuggestions(true)}
              disabled={aiLoading || !canSuggest}
            >
              추천 다시 받기
            </Button>
          </div>

          {aiLoading && (
            <div className="text-xs text-gray-500">추천 불러오는 중...</div>
          )}
          {aiError && (
            <div className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-md px-2 py-1.5">
              {aiError}
            </div>
          )}

          {!aiLoading && displaySuggestions.length > 0 && (
            <div className="space-y-2">
              {displaySuggestions.map((rec, idx) => (
                <div
                  key={`${rec.title}-${idx}`}
                  className="border border-gray-200 rounded-md p-3 hover:border-indigo-300 hover:bg-indigo-50/30 transition-all"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-indigo-100 text-indigo-700 text-xs font-bold">
                          {idx + 1}
                        </span>
                        <span className="font-medium text-gray-800">{rec.title}</span>
                        <span className="text-xs text-gray-500">
                          약 {rec.duration_min}분
                        </span>
                      </div>
                      <div className="text-xs text-gray-600 mt-1 ml-7">
                        {rec.why}
                      </div>
                      <div className="text-xs text-gray-500 mt-1 ml-7">
                        시작 트리거: {rec.trigger}
                      </div>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleAddSuggestion(rec)}
                    >
                      추가
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </Card>

      {saveError && (
        <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-md px-3 py-2">
          {saveError}
        </div>
      )}

      {initialMicroAction && (
        <div className="text-xs text-gray-500">
          현재 선택: {initialMicroAction.name}
        </div>
      )}

      <div className="flex justify-between pt-2">
        <Button variant="outline" size="md" onClick={onBack}>
          뒤로
        </Button>
      </div>
    </div>
  );
};

function buildFallbackSuggestions(planItems: PlanItemInput[]): MicroActionSuggestion[] {
  const topic = planItems[0]?.title || "오늘 일정";
  return [
    {
      title: `${topic} 시작 전 2분 정리`.slice(0, 28),
      why: "시작 전에 환경을 정리하면 진입이 빨라져요.",
      duration_min: 2,
      trigger: "시작 알림 직후",
    },
    {
      title: "5분 집중 준비 루틴",
      why: "짧게 준비하면 부담 없이 시작할 수 있어요.",
      duration_min: 5,
      trigger: "타이머 시작 직전",
    },
    {
      title: "첫 단계만 3분 실행",
      why: "첫 단추를 끼우면 흐름이 이어져요.",
      duration_min: 3,
      trigger: "작업 자리에 앉았을 때",
    },
  ];
}

// 상대 시간 표시
function formatRelativeTime(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays === 0) return "오늘";
  if (diffDays === 1) return "어제";
  if (diffDays < 7) return `${diffDays}일 전`;
  if (diffDays < 30) return `${Math.floor(diffDays / 7)}주 전`;
  return `${Math.floor(diffDays / 30)}개월 전`;
}

export default MicroActionStep;
