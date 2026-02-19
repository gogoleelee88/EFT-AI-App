// 1단계: 할 일 입력 컴포넌트
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Button } from "../ui/Button";
import Card from "../ui/Card";
import type {
  SelectedTask,
  TaskHistory,
  TaskClarifySuggestion,
} from "../../types/mission";
import type { PrivacyMode } from "../../types/privacy";
import { clarifyTaskTitle, getRecentTasks } from "../../services/missionService";
import PrivacyModeSelect from "./PrivacyModeSelect";

interface TaskInputStepProps {
  initialTask?: SelectedTask | null;
  onNext: (task: SelectedTask) => void;
  userId?: string;
  privacyMode: PrivacyMode;
  onPrivacyModeChange: (value: PrivacyMode) => void;
}

const CLARIFY_DEBOUNCE_MS = 450;
const DEFAULT_RESISTANCE_LEVEL = 5;

const TaskInputStep: React.FC<TaskInputStepProps> = ({
  initialTask,
  onNext,
  userId,
  privacyMode,
  onPrivacyModeChange,
}) => {
  const [inputMode, setInputMode] = useState<"new" | "existing">(
    initialTask?.source || "new"
  );
  const [taskTitle, setTaskTitle] = useState(initialTask?.task_title || "");
  const [recentTasks, setRecentTasks] = useState<TaskHistory[]>([]);
  const [selectedTaskId, setSelectedTaskId] = useState<number | undefined>(
    initialTask?.task_id
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resistanceLevel, setResistanceLevel] = useState<number>(
    initialTask?.resistance_level ?? DEFAULT_RESISTANCE_LEVEL
  );

  const [clarifySuggestions, setClarifySuggestions] = useState<
    TaskClarifySuggestion[]
  >([]);
  const [clarifyIssues, setClarifyIssues] = useState<string[]>([]);
  const [clarifyLoading, setClarifyLoading] = useState(false);
  const [clarifyError, setClarifyError] = useState<string | null>(null);
  const [clarifyAmbiguous, setClarifyAmbiguous] = useState(false);
  const lastClarifyRef = useRef<string>("");

  const localIssues = useMemo(
    () => detectAmbiguityIssues(taskTitle),
    [taskTitle]
  );
  const showClarifyPanel = clarifyAmbiguous && clarifySuggestions.length > 0;

  useEffect(() => {
    if (inputMode === "existing") {
      loadRecentTasks();
    }
  }, [inputMode]);

  const loadRecentTasks = async () => {
    setLoading(true);
    setError(null);
    try {
      const tasks = await getRecentTasks(userId, 10);
      setRecentTasks(tasks);
    } catch (err) {
      setError("최근 할 일을 불러오는 중 오류가 발생했어요.");
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const resetClarifyState = useCallback(() => {
    setClarifySuggestions([]);
    setClarifyIssues([]);
    setClarifyError(null);
    setClarifyLoading(false);
    setClarifyAmbiguous(false);
  }, []);

  const requestClarify = useCallback(
    async (title: string) => {
      if (lastClarifyRef.current === title) return;
      lastClarifyRef.current = title;

      setClarifyLoading(true);
      setClarifyError(null);
      try {
        const response = await clarifyTaskTitle({
          title,
          recent_tasks: recentTasks.map((task) => task.title).slice(0, 5),
        });

        const suggestions = response.rewrite_suggestions?.length
          ? response.rewrite_suggestions
          : buildClarifyFallback(title);

        setClarifyAmbiguous(response.is_ambiguous);
        setClarifyIssues(response.issues || []);
        setClarifySuggestions(suggestions);
      } catch (err) {
        console.error("할 일 구체화 실패:", err);
        setClarifyError("구체화 추천을 불러오지 못했어요.");
        if (localIssues.length > 0) {
          setClarifyAmbiguous(true);
          setClarifyIssues(localIssues);
          setClarifySuggestions(buildClarifyFallback(title));
        } else {
          resetClarifyState();
        }
      } finally {
        setClarifyLoading(false);
      }
    },
    [localIssues, recentTasks, resetClarifyState]
  );

  useEffect(() => {
    if (inputMode !== "new") {
      resetClarifyState();
      return;
    }

    const trimmed = taskTitle.trim();
    if (!trimmed) {
      resetClarifyState();
      return;
    }

    if (localIssues.length === 0) {
      resetClarifyState();
      return;
    }

    const handle = window.setTimeout(() => {
      void requestClarify(trimmed);
    }, CLARIFY_DEBOUNCE_MS);

    return () => window.clearTimeout(handle);
  }, [inputMode, localIssues, requestClarify, resetClarifyState, taskTitle]);

  const handleSuggestionClick = (suggestion: TaskClarifySuggestion) => {
    setTaskTitle(suggestion.title);
    setError(null);
    setClarifyAmbiguous(false);
    setClarifySuggestions([]);
    setClarifyIssues([]);
    setClarifyError(null);
  };

  const handleNext = () => {
    if (inputMode === "new") {
      if (!taskTitle.trim()) {
        setError("할 일을 입력해주세요.");
        return;
      }
      onNext({
        source: "new",
        task_title: taskTitle.trim(),
        est_minutes: 30,
        resistance_level: resistanceLevel,
      });
    } else {
      if (!selectedTaskId) {
        setError("최근 할 일을 선택해주세요.");
        return;
      }
      const selectedTask = recentTasks.find((t) => t.task_id === selectedTaskId);
      if (!selectedTask) {
        setError("선택한 할 일을 찾을 수 없어요.");
        return;
      }
      onNext({
        source: "existing",
        task_id: selectedTask.task_id,
        task_title: selectedTask.title,
        est_minutes: selectedTask.est_minutes,
        success_rate: selectedTask.success_rate,
        resistance_level: resistanceLevel,
      });
    }
  };

  return (
    <div className="space-y-4 p-4 max-w-2xl mx-auto">
      <Card>
        <div className="space-y-4">
          <div className="flex gap-2">
            <Button
              variant={inputMode === "new" ? "primary" : "outline"}
              size="sm"
              onClick={() => setInputMode("new")}
              fullWidth
            >
              새로 입력
            </Button>
            <Button
              variant={inputMode === "existing" ? "primary" : "outline"}
              size="sm"
              onClick={() => setInputMode("existing")}
              fullWidth
            >
              최근 할 일
            </Button>
          </div>

          {inputMode === "new" && (
            <div className="space-y-3">
              <label className="block text-sm font-medium text-gray-700">
                할 일 입력
              </label>
              <input
                type="text"
                value={taskTitle}
                onChange={(e) => setTaskTitle(e.target.value)}
                placeholder="예) 수학 문제집 2페이지 풀기"
                className="w-full rounded-md border border-gray-300 px-4 py-2 text-base focus:outline-none focus:ring-2 focus:ring-indigo-500"
                autoFocus
              />

              {clarifyLoading && (
                <div className="text-xs text-gray-500">구체화 추천 생성 중...</div>
              )}

              {clarifyError && (
                <div className="text-xs text-red-600">{clarifyError}</div>
              )}

              {showClarifyPanel && (
                <div className="rounded-md border border-indigo-200 bg-indigo-50/40 p-3 space-y-2">
                  <div className="text-xs font-semibold text-indigo-700">
                    이거는 어때요?
                  </div>
                  {clarifyIssues.length > 0 && (
                    <div className="text-xs text-indigo-700/80">
                      {clarifyIssues.join(" · ")}
                    </div>
                  )}
                  <div className="space-y-2">
                    {clarifySuggestions.map((suggestion, idx) => (
                      <button
                        key={`${suggestion.title}-${idx}`}
                        type="button"
                        onClick={() => handleSuggestionClick(suggestion)}
                        className="w-full text-left border border-indigo-200 rounded-md px-3 py-2 bg-white hover:bg-indigo-50 transition"
                      >
                        <div className="text-sm font-medium text-gray-800">
                          {idx + 1}. {suggestion.title}
                        </div>
                        <div className="text-xs text-gray-600 mt-1">
                          {suggestion.reason}
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {inputMode === "existing" && (
            <div className="space-y-3">
              <label className="block text-sm font-medium text-gray-700">
                최근 할 일 선택
              </label>

              {loading && (
                <div className="text-sm text-gray-500 py-4 text-center">
                  불러오는 중...
                </div>
              )}

              {!loading && recentTasks.length === 0 && (
                <div className="text-sm text-gray-400 py-4 text-center border border-dashed border-gray-300 rounded-md">
                  최근 할 일이 없어요. 새로 입력해주세요.
                </div>
              )}

              {!loading && recentTasks.length > 0 && (
                <div className="space-y-2 max-h-64 overflow-y-auto">
                  {recentTasks.map((task) => (
                    <div
                      key={task.task_id}
                      onClick={() => setSelectedTaskId(task.task_id)}
                      className={`
                        p-3 rounded-md border cursor-pointer transition-all
                        ${
                          selectedTaskId === task.task_id
                            ? "border-indigo-500 bg-indigo-50"
                            : "border-gray-200 hover:border-indigo-300 hover:bg-gray-50"
                        }
                      `}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1">
                          <div className="font-medium text-gray-800">
                            {task.title}
                          </div>
                          <div className="text-xs text-gray-500 mt-1">
                            예상 시간: {task.est_minutes}분
                          </div>
                        </div>
                        <div className="text-right">
                          {task.total_count > 0 && (
                            <div className="text-sm font-semibold text-indigo-600">
                              {Math.round(task.success_rate * 100)}%
                            </div>
                          )}
                          <div className="text-xs text-gray-400">
                            {task.success_count}/{task.total_count}회
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          <div className="rounded-md border border-amber-200 bg-amber-50/60 px-3 py-3 space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-sm font-medium text-gray-700">
                일정 저항감
              </label>
              <span className="text-sm font-semibold text-amber-700">
                {resistanceLevel}/10
              </span>
            </div>
            <input
              type="range"
              min={0}
              max={10}
              step={1}
              value={resistanceLevel}
              onChange={(e) => setResistanceLevel(Number(e.target.value))}
              className="w-full accent-amber-500"
              aria-label="일정 저항감"
            />
            <div className="flex justify-between text-[11px] text-gray-500">
              <span>낮음</span>
              <span>보통</span>
              <span>높음</span>
            </div>
          </div>

          <PrivacyModeSelect
            value={privacyMode}
            onChange={onPrivacyModeChange}
          />

          {error && (
            <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-md px-3 py-2">
              {error}
            </div>
          )}

          <div className="flex justify-end pt-2">
            <Button variant="primary" size="md" onClick={handleNext}>
              다음
            </Button>
          </div>
        </div>
      </Card>
    </div>
  );
};

const VAGUE_KEYWORDS = [
  "공부",
  "운동",
  "정리",
  "준비",
  "복습",
  "학습",
  "독서",
  "리서치",
  "연락",
  "작성",
  "업무",
  "작업",
  "개발",
  "코딩",
  "회의",
  "계획",
  "점검",
  "관리",
  "청소",
];

function detectAmbiguityIssues(title: string): string[] {
  const trimmed = title.trim();
  if (!trimmed) return [];

  const issues: string[] = [];
  if (trimmed.length < 6) {
    issues.push("제목이 너무 짧아요.");
  }

  const hasQuantity = /\d+\s*(분|시간|페이지|장|문제|개|회|번|세트|챕터|줄)/.test(
    trimmed
  );
  if (!hasQuantity) {
    issues.push("수량/시간 정보가 없어요.");
  }

  if (!hasQuantity && VAGUE_KEYWORDS.some((keyword) => trimmed.includes(keyword))) {
    issues.push("범위나 산출물이 모호해요.");
  }

  return Array.from(new Set(issues));
}

function shortenTopic(title: string): string {
  const trimmed = title.trim();
  if (!trimmed) return "오늘 일정";
  if (trimmed.length <= 12) return trimmed;
  return trimmed.slice(0, 12);
}

function buildClarifyFallback(title: string): TaskClarifySuggestion[] {
  const topic = shortenTopic(title);
  return [
    {
      title: `${topic} 핵심 3개 요약 메모 작성`.slice(0, 40),
      reason: "작업 결과가 남으면 다음 행동이 쉬워져요.",
    },
    {
      title: `${topic} 20분 집중 후 3줄 회고`.slice(0, 40),
      reason: "짧게 집중하고 회고하면 흐름이 이어져요.",
    },
    {
      title: `${topic} 자료 1개 읽고 5줄 정리`.slice(0, 40),
      reason: "작게 시작해도 진입 장벽이 낮아져요.",
    },
  ];
}

export default TaskInputStep;
