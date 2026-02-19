import React, { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import Card from "../components/ui/Card";
import { Button } from "../components/ui/Button";
import { useGoogleCalendar } from "../hooks/useGoogleCalendar";

type LocalTask = {
  id: number;
  existingTaskId: number | "";
  title: string;
  estMinutes: number | "";
  priority: number | "";
  plannedBlockMinutes: number | "";
  microSteps: string[];
};

type SavedPlanItem = {
  task_id?: number;
  planned_block_minutes?: number;
  micro_steps?: string[];
  [key: string]: any;
};

type SavedPlan = {
  day_id?: number;
  date?: string;
  mode?: number;
  items?: SavedPlanItem[];
  [key: string]: any;
};

const PlanDayPage: React.FC = () => {
  const navigate = useNavigate();
  const today = new Date().toISOString().slice(0, 10);
  const {
    isConnected,
    googleEvents,
    lastSync,
    loading: googleLoading,
    error: googleError,
    connectGoogle,
    fetchGoogleEvents,
    exportToGoogle,
    updateGoogleEvent,
  } = useGoogleCalendar();

  const [date, setDate] = useState<string>(today);
  const [mode, setMode] = useState<number>(100);
  const [tasks, setTasks] = useState<LocalTask[]>([
    {
      id: 1,
      existingTaskId: "",
      title: "",
      estMinutes: "",
      priority: "",
      plannedBlockMinutes: "",
      microSteps: [],
    },
  ]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedPlan, setSavedPlan] = useState<SavedPlan | null>(null);
  const [smartLoading, setSmartLoading] = useState(false);
  const [smartError, setSmartError] = useState<string | null>(null);
  const [smartSlots, setSmartSlots] = useState<
    { task_id: number; start: string; end: string }[]
  >([]);
  const [applyingSmart, setApplyingSmart] = useState(false);
  const [applyError, setApplyError] = useState<string | null>(null);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [dragStartX, setDragStartX] = useState(0);
  const [dragStartDate, setDragStartDate] = useState<Date | null>(null);
  const [dragGoogleEventId, setDragGoogleEventId] = useState<string | null>(null);
  const [dragGoogleMinutesDelta, setDragGoogleMinutesDelta] = useState(0);
  const timelineRef = useRef<HTMLDivElement | null>(null);

  // Ref로 최신 값 추적 (useEffect 리스너 중복 방지)
  const dragDeltaRef = useRef(0);
  const dragEventIdRef = useRef<string | null>(null);
  const dragStartDateRef = useRef<Date | null>(null);
  const isSavingRef = useRef(false);

  // delta 변경 시 ref 동기화
  useEffect(() => {
    dragDeltaRef.current = dragGoogleMinutesDelta;
  }, [dragGoogleMinutesDelta]);

  // Google 이벤트 드래그 처리 (window 레벨, 한 번만 등록)
  useEffect(() => {
    if (dragGoogleEventId === null) return;

    dragEventIdRef.current = dragGoogleEventId;

    const handleMouseMove = (e: MouseEvent) => {
      if (dragEventIdRef.current === null) return;
      const deltaY = e.clientY - dragStartX;
      // 1px = 1분, 15분 단위 스냅
      const snappedMinutes = Math.round(deltaY / 15) * 15;
      dragDeltaRef.current = snappedMinutes;
      setDragGoogleMinutesDelta(snappedMinutes);
    };

    const handleMouseUp = async () => {
      if (isSavingRef.current) return; // 중복 저장 방지
      
      const eventId = dragEventIdRef.current;
      const delta = dragDeltaRef.current;
      const startDate = dragStartDateRef.current;

      // 즉시 상태 초기화 (다중 호출 방지)
      dragEventIdRef.current = null;
      setDragGoogleEventId(null);
      setDragGoogleMinutesDelta(0);

      if (eventId && startDate && Math.abs(delta) >= 15) {
        isSavingRef.current = true;
        const googleEvent = googleEvents.find((ev) => ev.id === eventId);
        if (googleEvent) {
          const parseTime = (timeStr: string) => {
            const match = timeStr.match(/(\d{2}):(\d{2})/);
            if (!match) return null;
            return new Date(`${date}T${match[1]}:${match[2]}:00`);
          };

          const originalEnd = parseTime(googleEvent.end);
          if (originalEnd) {
            const durationMs = originalEnd.getTime() - startDate.getTime();
            const newStart = new Date(startDate.getTime() + delta * 60000);
            const newEnd = new Date(newStart.getTime() + durationMs);

            try {
              await updateGoogleEvent({
                eventId: eventId,
                startIso: newStart.toISOString(),
                endIso: newEnd.toISOString(),
              });
            } catch (error: any) {
              if (error.message?.includes('sequence') || error.message?.includes('409')) {
                alert('⚠️ 페이지를 새로고침해주세요.');
              }
            }
          }
        }
        isSavingRef.current = false;
      }
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dragGoogleEventId]);

  // 날짜 변경 시 Google 일정 동기화 시도 (연동된 경우에만)
  useEffect(() => {
    if (!isConnected || !date) return;
    fetchGoogleEvents(date);
  }, [isConnected, date, fetchGoogleEvents]);

  const handleAddTask = () => {
    setTasks((prev) => [
      ...prev,
      {
        id: prev.length ? prev[prev.length - 1].id + 1 : 1,
        existingTaskId: "",
        title: "",
        estMinutes: "",
        priority: "",
        plannedBlockMinutes: "",
        microSteps: [],
      },
    ]);
  };

  const handleRemoveTask = (id: number) => {
    setTasks((prev) => prev.filter((t) => t.id !== id));
  };

  const handleEditGoogleEvent = async (event: typeof googleEvents[0]) => {
    const newStartTime = prompt(
      `📅 "${event.title}"\n\n시작 시간 (HH:MM):`,
      event.start
    );
    if (!newStartTime || !newStartTime.trim()) return;

    const newEndTime = prompt(
      `종료 시간 (HH:MM):`,
      event.end
    );
    if (!newEndTime || !newEndTime.trim()) return;

    try {
      // HH:MM 형식 검증
      const timeRegex = /^([0-1][0-9]|2[0-3]):([0-5][0-9])$/;
      if (!timeRegex.test(newStartTime) || !timeRegex.test(newEndTime)) {
        alert("⚠️ 시간 형식이 올바르지 않습니다 (HH:MM)");
        return;
      }

      // ISO 8601 형식으로 변환
      const startDateTime = `${date}T${newStartTime}:00`;
      const endDateTime = `${date}T${newEndTime}:00`;

      await updateGoogleEvent({
        eventId: event.id,
        startIso: startDateTime,
        endIso: endDateTime,
      });
      // 성공 시 자동으로 일정이 새로고침됨
    } catch (error: any) {
      if (error.message?.includes('409')) {
        alert('⚠️ 일정이 다른 곳에서 수정되었습니다. 페이지를 새로고침해주세요.');
      } else {
        alert("❌ 일정 수정에 실패했습니다.");
      }
    }
  };

  const updateTaskField = <K extends keyof LocalTask>(
    id: number,
    field: K,
    value: LocalTask[K]
  ) => {
    setTasks((prev) =>
      prev.map((t) => (t.id === id ? { ...t, [field]: value } : t))
    );
  };

  const setMicroSteps = (taskId: number, value: string) => {
    const steps = value
      .split(/[\n,]+/)
      .map((s) => s.trim())
      .filter(Boolean);
    setTasks((prev) =>
      prev.map((t) => (t.id === taskId ? { ...t, microSteps: steps } : t))
    );
  };

  const validate = () => {
    if (!date) return "날짜를 선택하세요.";
    if (![100, 70, 40].includes(mode)) return "mode는 100 / 70 / 40 중 하나여야 합니다.";
    if (!tasks.length) return "최소 1개 이상의 항목을 입력하세요.";
    for (const t of tasks) {
      const hasExisting = t.existingTaskId !== "" && Number(t.existingTaskId) > 0;
      if (hasExisting) {
        if (
          t.plannedBlockMinutes === "" ||
          Number(t.plannedBlockMinutes) < 1
        ) {
          return "기존 Task를 사용할 때는 블록 시간(분)을 1 이상 입력하세요.";
        }
      } else {
        if (!t.title.trim()) {
          return "모든 신규 Task에 제목을 입력하세요.";
        }
        if (!t.estMinutes || Number(t.estMinutes) < 1) {
          return "모든 신규 Task에 예상 시간(분)을 1 이상 입력하세요.";
        }
      }
    }
    return null;
  };

  const handleSave = async () => {
    const validationError = validate();
    if (validationError) {
      setError(validationError);
      return;
    }
    setError(null);
    setSaving(true);

    const items = tasks.map((t) => {
      const hasExisting = t.existingTaskId !== "" && Number(t.existingTaskId) > 0;
      const planned =
        t.plannedBlockMinutes !== ""
          ? Number(t.plannedBlockMinutes)
          : t.estMinutes !== ""
          ? Number(t.estMinutes)
          : 30;

      return {
        task_id: hasExisting ? Number(t.existingTaskId) : undefined,
        task_title: hasExisting ? undefined : t.title.trim(),
        est_minutes:
          hasExisting || t.estMinutes === "" ? undefined : Number(t.estMinutes),
        priority:
          hasExisting || t.priority === "" ? undefined : Number(t.priority),
        planned_block_minutes: Math.max(1, planned),
        micro_steps: Array.isArray(t.microSteps) ? t.microSteps : [],
      };
    });

    const payload = {
      date,
      mode,
      items,
    };

    try {
      const res = await fetch("/api/spec/plan/day", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        let detail = `status ${res.status}`;
        try {
          const contentType = res.headers.get("content-type") || "";
          if (contentType.includes("application/json")) {
            const data = await res.json();
            if (typeof data?.detail === "string" && data.detail.trim()) {
              detail = data.detail;
            } else {
              detail = JSON.stringify(data);
            }
          } else {
            const text = (await res.text()).trim();
            if (text) detail = text.slice(0, 200);
          }
        } catch {
          // 응답 파싱 실패 시 기본 status 문자열 유지
        }
        throw new Error(detail);
      }

      const data: SavedPlan = await res.json();
      setSavedPlan(data);
    } catch (e) {
      console.error("PlanDay 저장 오류:", e);
      const message =
        e instanceof Error && e.message
          ? e.message
          : "알 수 없는 오류가 발생했습니다.";
      setError(`계획 저장 실패: ${message}`);
    } finally {
      setSaving(false);
    }
  };

  const handleSmartSuggest = async () => {
    if (!savedPlan || !savedPlan.items || savedPlan.items.length === 0) {
      setSmartError("먼저 DayPlan을 저장해주세요.");
      return;
    }
    if (!isConnected) {
      setSmartError("먼저 Google 캘린더를 연동해주세요.");
      return;
    }
    const schedulableItems = savedPlan.items
      .filter((item) => typeof item.task_id === "number")
      .map((item) => ({
        task_id: item.task_id as number,
        planned_block_minutes:
          typeof item.planned_block_minutes === "number" &&
          item.planned_block_minutes > 0
            ? item.planned_block_minutes
            : 30,
      }));
    if (schedulableItems.length === 0) {
      setSmartError("Task ID가 있는 항목이 없어 추천을 생성할 수 없습니다.");
      return;
    }

    setSmartError(null);
    setSmartLoading(true);
    setSmartSlots([]);
    try {
      const body = {
        date: savedPlan.date || date,
        items: schedulableItems,
      };
      const res = await fetch("/api/spec/plan/suggest-smart", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        throw new Error(`status ${res.status}`);
      }
      const data = await res.json();
      setSmartSlots(
        Array.isArray(data.slots)
          ? data.slots.map((s: any) => ({
              task_id: s.task_id,
              start: s.start,
              end: s.end,
            }))
          : []
      );
    } catch (e) {
      console.error("스마트 추천 오류:", e);
      setSmartError("스마트 추천 생성 중 오류가 발생했습니다.");
    } finally {
      setSmartLoading(false);
    }
  };

  const handleApplySmartToGoogle = async () => {
    if (!isConnected) {
      setApplyError("먼저 Google 캘린더를 연동해주세요.");
      return;
    }
    if (!savedPlan || !savedPlan.items || savedPlan.items.length === 0) {
      setApplyError("먼저 DayPlan을 저장하고 추천을 받으세요.");
      return;
    }
    if (smartSlots.length === 0) {
      setApplyError("적용할 추천 슬롯이 없습니다. 먼저 '추천 받기'를 실행하세요.");
      return;
    }

    setApplyError(null);
    setApplyingSmart(true);
    try {
      for (const slot of smartSlots) {
        const taskId = slot.task_id;
        if (typeof taskId !== "number") continue;
        const start = new Date(slot.start);
        const end = new Date(slot.end);
        const diffMs = end.getTime() - start.getTime();
        const durationMinutes = Math.max(1, Math.round(diffMs / 60000));
        await exportToGoogle({
          taskId,
          startIso: start.toISOString(),
          durationMinutes,
        });
      }
      window.alert("추천 스케줄이 Google 캘린더에 반영되었습니다.");
    } catch (e) {
      console.error("추천 스케줄 Google 반영 오류:", e);
      setApplyError("일부 또는 전체 슬롯을 Google에 반영하는 중 오류가 발생했습니다.");
    } finally {
      setApplyingSmart(false);
    }
  };

  const handleSlotMouseDown = (idx: number, event: React.MouseEvent<HTMLDivElement>) => {
    if (!timelineRef.current) return;
    setDragIndex(idx);
    setDragStartX(event.clientX);
    setDragStartDate(new Date(smartSlots[idx].start));
  };

  const handleGoogleEventMouseDown = (ev: typeof googleEvents[0], event: React.MouseEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    const parseTime = (timeStr: string) => {
      const match = timeStr.match(/(\d{2}):(\d{2})/);
      if (!match) return null;
      return new Date(`${date}T${match[1]}:${match[2]}:00`);
    };
    const startDate = parseTime(ev.start);
    if (startDate) {
      dragStartDateRef.current = startDate;
      setDragStartDate(startDate);
    }
    dragDeltaRef.current = 0;
    setDragStartX(event.clientY);
    setDragGoogleMinutesDelta(0);
    setDragGoogleEventId(ev.id); // 이게 마지막! (useEffect 트리거)
  };

  const handleTimelineMouseMove = (event: React.MouseEvent<HTMLDivElement>) => {
    // Google 이벤트 드래그 중
    if (dragGoogleEventId !== null && timelineRef.current && dragStartDate) {
      const dayStart = new Date(`${date}T08:00:00`);
      const dayEnd = new Date(`${date}T22:00:00`);
      const totalMinutes = (dayEnd.getTime() - dayStart.getTime()) / 60000;
      if (totalMinutes <= 0) return;

      const rect = timelineRef.current.getBoundingClientRect();
      if (!rect.width) return;

      const deltaX = event.clientX - dragStartX;
      const minutesDelta = (deltaX / rect.width) * totalMinutes;

      // 15분 단위로 스냅
      const snappedMinutes = Math.round(minutesDelta / 15) * 15;
      if (snappedMinutes !== dragGoogleMinutesDelta) {
        setDragGoogleMinutesDelta(snappedMinutes);
      }
      return;
    }

    // Task 슬롯 드래그 중
    if (dragIndex === null || !timelineRef.current || !dragStartDate || !savedPlan) {
      return;
    }
    const baseDate = savedPlan.date || date;
    const dayStart = new Date(`${baseDate}T08:00:00`);
    const dayEnd = new Date(`${baseDate}T22:00:00`);
    const totalMinutes = (dayEnd.getTime() - dayStart.getTime()) / 60000;
    if (totalMinutes <= 0) return;

    const rect = timelineRef.current.getBoundingClientRect();
    if (!rect.width) return;

    const deltaX = event.clientX - dragStartX;
    const minutesDelta = (deltaX / rect.width) * totalMinutes;

    const originalStart = dragStartDate;
    const durationMs =
      new Date(smartSlots[dragIndex].end).getTime() -
      new Date(smartSlots[dragIndex].start).getTime();

    let newStartTime = originalStart.getTime() + minutesDelta * 60000;
    const minStart = dayStart.getTime();
    const maxStart = dayEnd.getTime() - durationMs;
    if (newStartTime < minStart) newStartTime = minStart;
    if (newStartTime > maxStart) newStartTime = maxStart;

    const newStart = new Date(newStartTime);
    const newEnd = new Date(newStartTime + durationMs);

    setSmartSlots((prev) =>
      prev.map((s, i) =>
        i === dragIndex
          ? { ...s, start: newStart.toISOString(), end: newEnd.toISOString() }
          : s
      )
    );
  };

  const handleTimelineMouseUp = () => {
    // Task 슬롯 드래그만 처리 (Google 이벤트는 useEffect에서 처리)
    setDragIndex(null);
    setDragStartDate(null);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-purple-50 to-indigo-50 flex justify-center px-4 py-6">
      <div className="w-full max-w-2xl space-y-4">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-bold text-gray-800">📝 오늘 계획 입력</h1>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => navigate("/dashboard")}
          >
            대시보드로 돌아가기
          </Button>
        </div>

        {/* Google 캘린더 연동 섹션 (Phase 2: READ 전용) */}
        <Card>
          <div className="space-y-3">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <h2 className="text-sm font-semibold text-gray-800">
                📅 Google 캘린더
              </h2>
              {!isConnected ? (
                <Button size="sm" variant="outline" onClick={connectGoogle}>
                  Google 캘린더 연동
                </Button>
              ) : (
                <div className="flex items-center gap-2 text-xs text-gray-600">
                  <span className="inline-flex items-center rounded-full bg-emerald-50 px-2 py-0.5 text-emerald-700 border border-emerald-200">
                    연동됨
                  </span>
                  {lastSync && (
                    <span>
                      마지막 동기화:{" "}
                      {lastSync.toLocaleTimeString(undefined, {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </span>
                  )}
                </div>
              )}
            </div>
            {googleError && (
              <div className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-md px-2 py-1.5">
                {googleError}
              </div>
            )}
            <div className="space-y-1 max-h-32 overflow-auto rounded-md bg-white/60 border border-gray-100 px-3 py-2">
              {googleLoading && (
                <div className="text-xs text-gray-500">Google 일정을 불러오는 중...</div>
              )}
              {!googleLoading && googleEvents.length === 0 && (
                <div className="text-xs text-gray-400">
                  {isConnected
                    ? "선택한 날짜에 등록된 Google 일정이 없습니다."
                    : "Google 연동 후 오늘 일정을 이곳에서 함께 볼 수 있습니다."}
                </div>
              )}
              {googleEvents.map((ev) => (
                <div
                  key={ev.id}
                  className="text-xs text-gray-700 flex items-center gap-1 hover:bg-blue-50 rounded px-1 py-0.5 cursor-pointer group"
                  onClick={() => handleEditGoogleEvent(ev)}
                  title="우클릭하여 시간 수정"
                >
                  <span className="text-gray-400">▸</span>
                  <span className="truncate flex-1">
                    {ev.start} ~ {ev.end} · {ev.title}
                  </span>
                  <span className="text-blue-500 opacity-0 group-hover:opacity-100 text-[10px]">
                    ✏️ 수정
                  </span>
                </div>
              ))}
            </div>

            {/* Google 일정 타임테이블 (구글 캘린더 스타일) */}
            {googleEvents.length > 0 && (
              <div className="mt-3 space-y-2">
                <div className="text-[11px] font-medium text-gray-700 flex items-center gap-1">
                  <span>📅 Google 일정</span>
                  <span className="text-[10px] text-gray-400">({googleEvents.length}개)</span>
                </div>
                
                {/* 타임테이블 컨테이너 */}
                <div className="relative border border-gray-200 rounded-lg bg-white overflow-hidden">
                  {/* 시간 눈금 레일 (배경) */}
                  <div className="absolute inset-0 pointer-events-none">
                    {Array.from({ length: 25 }).map((_, i) => {
                      const hour = i;
                      const topPercent = (hour / 24) * 100;
                      return (
                        <div
                          key={hour}
                          className="absolute left-0 right-0 border-t border-gray-100"
                          style={{ top: `${topPercent}%` }}
                        >
                          <div className="text-[10px] text-gray-400 px-2 py-0.5 bg-white/90">
                            {String(hour).padStart(2, '0')}:00
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  
                  {/* 일정 카드들 (절대 위치) */}
                  <div className="relative" style={{ height: '600px' }}>
                    {googleEvents.map((ev) => {
                      const isDragging = dragGoogleEventId === ev.id;
                      
                      const parseTime = (timeStr: string) => {
                        const match = timeStr.match(/(\d{2}):(\d{2})/);
                        if (!match) return null;
                        return parseInt(match[1]) * 60 + parseInt(match[2]);
                      };
                      
                      const startMin = parseTime(ev.start) || 0;
                      const endMin = parseTime(ev.end) || startMin + 60;
                      
                      // 드래그 중이면 오프셋 적용
                      const adjustedStartMin = startMin + (isDragging ? dragGoogleMinutesDelta : 0);
                      const adjustedEndMin = endMin + (isDragging ? dragGoogleMinutesDelta : 0);
                      const durationMin = adjustedEndMin - adjustedStartMin;
                      
                      // 위치 계산 (0~1440분 = 0~600px)
                      const topPx = (adjustedStartMin / 1440) * 600;
                      const heightPx = Math.max(20, (durationMin / 1440) * 600);
                      
                      // 시간 표시
                      const displayStartH = Math.floor(adjustedStartMin / 60);
                      const displayStartM = adjustedStartMin % 60;
                      const displayEndH = Math.floor(adjustedEndMin / 60);
                      const displayEndM = adjustedEndMin % 60;
                      const displayStart = `${String(displayStartH).padStart(2, '0')}:${String(displayStartM).padStart(2, '0')}`;
                      const displayEnd = `${String(displayEndH).padStart(2, '0')}:${String(displayEndM).padStart(2, '0')}`;
                      
                      const durationText = durationMin >= 60 
                        ? `${Math.floor(durationMin / 60)}시간${durationMin % 60 > 0 ? ` ${durationMin % 60}분` : ''}`
                        : `${durationMin}분`;
                      
                      return (
                        <div
                          key={ev.id}
                          className={`absolute left-12 right-2 flex items-stretch gap-0 rounded-md border overflow-hidden transition-all ${
                            isDragging
                              ? "bg-blue-100 border-blue-400 shadow-lg z-20"
                              : "bg-white border-blue-200 hover:border-blue-400 hover:shadow-md z-10"
                          }`}
                          style={{
                            top: `${topPx}px`,
                            height: `${heightPx}px`,
                            transition: isDragging ? 'none' : 'top 0.2s, height 0.2s',
                          }}
                        >
                          {/* 드래그 핸들 */}
                          <div
                            className={`flex-shrink-0 w-6 flex items-center justify-center cursor-grab active:cursor-grabbing select-none ${
                              isDragging ? "bg-blue-500 text-white" : "bg-blue-100 text-blue-400 hover:bg-blue-200"
                            }`}
                            onMouseDown={(e) => handleGoogleEventMouseDown(ev, e)}
                            title="드래그하여 시간 조정"
                          >
                            <div className="text-xs font-bold">⋮</div>
                          </div>
                          
                          {/* 일정 내용 */}
                          <div className="flex-1 p-1.5 min-w-0 flex flex-col justify-center">
                            <div className={`text-xs font-semibold ${isDragging ? 'text-blue-700' : 'text-gray-700'}`}>
                              {displayStart} - {displayEnd}
                              <span className="text-[10px] text-gray-500 ml-1">
                                ({durationText})
                              </span>
                            </div>
                            <div className="text-sm text-gray-800 truncate">
                              {ev.title}
                            </div>
                          </div>
                          
                          {/* 편집 버튼 */}
                          <div className="flex-shrink-0 flex items-center pr-1">
                            <button
                              className="text-xs px-1.5 py-0.5 hover:bg-blue-100 rounded text-gray-400 hover:text-blue-600"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleEditGoogleEvent(ev);
                              }}
                              title="정확한 시간 입력"
                            >
                              ✏️
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
                <div className="text-[10px] text-gray-400 text-center">
                  💡 [⋮] 드래그: 위아래로 시간 이동 | ✏️ 클릭: 정확한 시간 입력
                </div>
              </div>
            )}
          </div>
        </Card>

        <Card>
          <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  날짜
                </label>
                <input
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  모드 (100 / 70 / 40)
                </label>
                <select
                  value={mode}
                  onChange={(e) => setMode(Number(e.target.value))}
                  className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                >
                  <option value={100}>100 - 풀 파워</option>
                  <option value={70}>70 - 보호 모드</option>
                  <option value={40}>40 - 최소 보호</option>
                </select>
              </div>
            </div>

            <div className="flex items-center justify-between mt-2">
              <h2 className="text-sm font-semibold text-gray-800">
                Task 리스트
              </h2>
              <Button
                variant="outline"
                size="sm"
                onClick={handleAddTask}
                className="text-xs"
              >
                + Task 추가
              </Button>
            </div>

            <p className="text-xs text-gray-500">
              ※ Task ID를 채우면 기존 Task를 재사용하고, 비워두면 제목/예상 시간을 기반으로 새 Task가 자동 생성됩니다.
            </p>
            <div className="space-y-3">
              {tasks.map((task) => (
                <div
                  key={task.id}
                  className="border border-gray-200 rounded-lg p-3 space-y-2 bg-gray-50"
                >
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <input
                      type="text"
                      placeholder="Task 제목 (신규 Task 생성 시 필수)"
                      value={task.title}
                      onChange={(e) =>
                        updateTaskField(task.id, "title", e.target.value)
                      }
                      className="flex-1 rounded-md border border-gray-300 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-xs text-red-500"
                      onClick={() => handleRemoveTask(task.id)}
                    >
                      삭제
                    </Button>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-2 text-xs">
                    <div>
                      <label className="block mb-1 text-gray-600">
                        Task ID (선택)
                      </label>
                      <input
                        type="number"
                        min={1}
                        value={task.existingTaskId}
                        onChange={(e) =>
                          updateTaskField(
                            task.id,
                            "existingTaskId",
                            e.target.value === "" ? "" : Number(e.target.value)
                          )
                        }
                        className="w-full rounded-md border border-gray-300 px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                        aria-label="기존 Task ID"
                      />
                    </div>
                    <div>
                      <label className="block mb-1 text-gray-600">
                        예상 시간(분)
                      </label>
                      <input
                        type="number"
                        min={1}
                        value={task.estMinutes}
                        onChange={(e) =>
                          updateTaskField(
                            task.id,
                            "estMinutes",
                            e.target.value === "" ? "" : Number(e.target.value)
                          )
                        }
                        className="w-full rounded-md border border-gray-300 px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                      />
                    </div>
                    <div>
                      <label className="block mb-1 text-gray-600">
                        블록(분, 비우면 예상 시간 사용)
                      </label>
                      <input
                        type="number"
                        min={1}
                        value={task.plannedBlockMinutes}
                        onChange={(e) =>
                          updateTaskField(
                            task.id,
                            "plannedBlockMinutes",
                            e.target.value === "" ? "" : Number(e.target.value)
                          )
                        }
                        className="w-full rounded-md border border-gray-300 px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                        aria-label="계획 블록 분"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block mb-1 text-xs text-gray-600">
                      micro_steps (한 줄에 하나, 쉼표 구분 가능)
                    </label>
                    <textarea
                      value={task.microSteps.join("\n")}
                      onChange={(e) => setMicroSteps(task.id, e.target.value)}
                      placeholder="예: 첫 2분 착수, 문서 열기"
                      rows={2}
                      className="w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                      aria-label="마이크로 스텝"
                    />
                  </div>
                </div>
              ))}
            </div>

            {error && (
              <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-md px-3 py-2">
                {error}
              </div>
            )}

            <div className="flex justify-end">
              <Button
                variant="primary"
                size="md"
                onClick={handleSave}
                disabled={saving}
                className="min-w-[140px]"
              >
                {saving ? "저장 중..." : "계획 저장"}
              </Button>
            </div>
          </div>
        </Card>

        {savedPlan && (
          <>
            <Card className="bg-gray-50">
              <div className="space-y-3">
                <h2 className="text-sm font-semibold text-gray-800">
                  ✅ 저장된 DayPlan 미리보기
                </h2>
                <div className="text-xs text-gray-600">
                  날짜: {savedPlan.date || date} · 모드: {savedPlan.mode || mode}
                </div>
                <div className="space-y-2">
                  {(savedPlan.items || []).map((item, idx) => {
                    const taskId = item.task_id;
                    const plannedMinutes =
                      item.planned_block_minutes != null
                        ? item.planned_block_minutes
                        : null;
                    const canExport = isConnected && typeof taskId === "number";
                    const exportLabel = canExport
                      ? "Google에 추가"
                      : !isConnected
                      ? "Google 연동 필요"
                      : "Task ID 없음";

                    const handleExportClick = async () => {
                      if (!canExport) {
                        window.alert(exportLabel);
                        return;
                      }
                      const baseDate = savedPlan.date || date;
                      const timeStr =
                        window.prompt(
                          "이 Task를 시작할 시간을 입력하세요 (HH:MM 형식, 예: 09:00)",
                          "09:00"
                        ) ?? "";
                      if (!timeStr.trim()) return;
                      const match = timeStr.trim().match(/^(\d{1,2}):(\d{2})$/);
                      if (!match) {
                        window.alert("시간 형식이 올바르지 않습니다. 예: 09:00");
                        return;
                      }
                      const hours = Number(match[1]);
                      const minutes = Number(match[2]);
                      if (
                        Number.isNaN(hours) ||
                        Number.isNaN(minutes) ||
                        hours < 0 ||
                        hours > 23 ||
                        minutes < 0 ||
                        minutes > 59
                      ) {
                        window.alert("시간 범위가 올바르지 않습니다.");
                        return;
                      }
                      const start = new Date(`${baseDate}T00:00:00`);
                      start.setHours(hours, minutes, 0, 0);
                      const durationMinutes =
                        typeof plannedMinutes === "number" && plannedMinutes > 0
                          ? plannedMinutes
                          : 30;
                      try {
                        await exportToGoogle({
                          taskId,
                          startIso: start.toISOString(),
                          durationMinutes,
                        });
                        window.alert("Google 캘린더에 추가되었습니다.");
                      } catch {
                        // useGoogleCalendar 쪽에서 에러 상태를 관리하므로 여기서는 조용히 둔다.
                      }
                    };

                    return (
                      <div
                        key={idx}
                        className="rounded-md border border-gray-200 bg-white p-3 space-y-2"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <div className="text-sm font-medium text-gray-800">
                            Task #{taskId ?? idx + 1}
                          </div>
                          <Button
                            size="xs"
                            variant="outline"
                            onClick={handleExportClick}
                            disabled={!canExport}
                          >
                            {exportLabel}
                          </Button>
                        </div>
                        <div className="text-xs text-gray-600 mb-1">
                          블록 시간:{" "}
                          {plannedMinutes != null
                            ? `${plannedMinutes}분`
                            : "-"}
                        </div>
                        {Array.isArray(item.micro_steps) &&
                          item.micro_steps.length > 0 && (
                            <div className="text-xs text-gray-600">
                              <div className="font-medium mb-1">
                                micro_steps
                              </div>
                              <ul className="list-disc list-inside space-y-0.5">
                                {item.micro_steps.map((m, i) => (
                                  <li key={i}>{m}</li>
                                ))}
                              </ul>
                            </div>
                          )}
                      </div>
                    );
                  })}
                </div>
                <div className="text-xs text-gray-500">
                  ※ "첫 2분 착수" micro_step이 보이면 보호 모드/적응이 올바르게 적용된
                  것입니다.
                </div>
              </div>
            </Card>

            <Card className="bg-indigo-50 border-indigo-100 mt-3">
              <div className="space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <h3 className="text-sm font-semibold text-indigo-900">
                    💡 Google 일정 고려 스마트 추천 (실험)
                  </h3>
                  <div className="flex items-center gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={handleSmartSuggest}
                      disabled={smartLoading}
                    >
                      {smartLoading ? "계산 중..." : "추천 받기"}
                    </Button>
                    <Button
                      size="sm"
                      variant="primary"
                      onClick={handleApplySmartToGoogle}
                      disabled={applyingSmart || smartSlots.length === 0}
                    >
                      {applyingSmart ? "Google 반영 중..." : "추천 일정 Google에 반영"}
                    </Button>
                  </div>
                </div>
                {(smartError || applyError) && (
                  <div className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-md px-2 py-1.5">
                    {smartError || applyError}
                  </div>
                )}
                {smartSlots.length > 0 && (
                  <div className="space-y-2 text-xs text-indigo-900">
                    {smartSlots.map((slot, idx) => (
                      <div key={idx} className="flex items-center gap-2">
                        <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-indigo-600 text-white text-[10px]">
                          {idx + 1}
                        </span>
                        <span>
                          Task #{slot.task_id} ·{" "}
                          {new Date(slot.start).toLocaleTimeString(undefined, {
                            hour: "2-digit",
                            minute: "2-digit",
                          })}{" "}
                          ~{" "}
                          {new Date(slot.end).toLocaleTimeString(undefined, {
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </span>
                      </div>
                    ))}
                    {/* 하루 타임라인 시각화 */}
                    <div className="space-y-1">
                      <div className="text-[11px] font-medium text-indigo-800">
                        하루 타임라인 (드래그해서 시간 조정)
                      </div>
                      <div
                        ref={timelineRef}
                        className="relative w-full h-12 rounded-md bg-white border border-indigo-100 overflow-hidden cursor-pointer"
                        onMouseMove={handleTimelineMouseMove}
                        onMouseUp={handleTimelineMouseUp}
                        onMouseLeave={handleTimelineMouseUp}
                      >
                        {/* 시간 눈금 (08~22시, 2시간 간격) */}
                        {Array.from({ length: 8 }).map((_, i) => {
                          const hour = 8 + i * 2;
                          const totalMinutes = 14 * 60;
                          const offsetMinutes = (hour - 8) * 60;
                          const leftPercent = (offsetMinutes / totalMinutes) * 100;
                          return (
                            <div
                              key={hour}
                              className="absolute top-0 bottom-0 border-l border-indigo-100"
                              style={{ left: `${leftPercent}%` }}
                            >
                              <div className="absolute top-0 -translate-x-1/2 text-[10px] text-indigo-300">
                                {hour}:00
                              </div>
                            </div>
                          );
                        })}
                        {/* Google 캘린더 이벤트 블록 */}
                        {googleEvents.map((ev) => {
                          const baseDate = date;
                          const dayStart = new Date(`${baseDate}T08:00:00`);
                          const dayEnd = new Date(`${baseDate}T22:00:00`);
                          const totalMinutes =
                            (dayEnd.getTime() - dayStart.getTime()) / 60000;
                          if (totalMinutes <= 0) return null;
                          
                          const parseTime = (timeStr: string) => {
                            const match = timeStr.match(/(\d{2}):(\d{2})/);
                            if (!match) return null;
                            return new Date(`${baseDate}T${match[1]}:${match[2]}:00`);
                          };
                          
                          const startDate = parseTime(ev.start);
                          const endDate = parseTime(ev.end);
                          if (!startDate || !endDate) return null;
                          
                          // 드래그 중이면 오프셋 적용
                          const isDragging = dragGoogleEventId === ev.id;
                          const offsetMs = isDragging ? dragGoogleMinutesDelta * 60000 : 0;
                          const adjustedStart = new Date(startDate.getTime() + offsetMs);
                          const adjustedEnd = new Date(endDate.getTime() + offsetMs);
                          
                          const startMinutes =
                            (adjustedStart.getTime() - dayStart.getTime()) / 60000;
                          const durationMinutes =
                            (adjustedEnd.getTime() - adjustedStart.getTime()) / 60000;
                          
                          if (startMinutes < -durationMinutes || startMinutes > totalMinutes) return null;
                          
                          const left = Math.max(0, (startMinutes / totalMinutes) * 100);
                          const width = Math.max(4, (durationMinutes / totalMinutes) * 100);
                          
                          // 드래그 중 시간 표시
                          const hh = String(adjustedStart.getHours()).padStart(2, "0");
                          const mm = String(adjustedStart.getMinutes()).padStart(2, "0");
                          const dragTimeLabel = isDragging ? `${hh}:${mm}` : "";
                          
                          return (
                            <div
                              key={ev.id}
                              className={`absolute top-7 bottom-1 rounded-md text-[10px] text-white flex items-center justify-center shadow-sm cursor-move select-none ${
                                isDragging
                                  ? "bg-green-600 ring-2 ring-green-300 z-10 opacity-90"
                                  : "bg-green-500/80 hover:bg-green-600/90"
                              }`}
                              style={{
                                left: `${left}%`,
                                width: `${width}%`,
                                transition: isDragging ? "none" : "left 0.15s",
                              }}
                              onMouseDown={(e) => handleGoogleEventMouseDown(ev, e)}
                              onContextMenu={(e) => {
                                e.preventDefault();
                                handleEditGoogleEvent(ev);
                              }}
                              title={`${ev.title}\n드래그: 시간 이동 | 우클릭: 시간 수정`}
                            >
                              <span className="truncate px-1">
                                {isDragging ? `⏰ ${dragTimeLabel}` : `📅 ${ev.title}`}
                              </span>
                            </div>
                          );
                        })}
                        {/* 추천 슬롯 블록 */}
                        {smartSlots.map((slot, idx) => {
                          const baseDate = savedPlan?.date || date;
                          const dayStart = new Date(`${baseDate}T08:00:00`);
                          const dayEnd = new Date(`${baseDate}T22:00:00`);
                          const totalMinutes =
                            (dayEnd.getTime() - dayStart.getTime()) / 60000;
                          if (totalMinutes <= 0) return null;
                          const startDate = new Date(slot.start);
                          const endDate = new Date(slot.end);
                          const startMinutes =
                            (startDate.getTime() - dayStart.getTime()) / 60000;
                          const durationMinutes =
                            (endDate.getTime() - startDate.getTime()) / 60000;
                          const left = Math.max(
                            0,
                            (startMinutes / totalMinutes) * 100
                          );
                          const width = Math.max(
                            4,
                            (durationMinutes / totalMinutes) * 100
                          );
                          return (
                            <div
                              key={idx}
                              className="absolute top-1 bottom-1 rounded-md bg-indigo-500/80 text-[10px] text-white flex items-center justify-center shadow-sm"
                              style={{
                                left: `${left}%`,
                                width: `${width}%`,
                              }}
                              onMouseDown={(e) => handleSlotMouseDown(idx, e)}
                            >
                              #{slot.task_id}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                )}
                {smartSlots.length === 0 && !smartError && !smartLoading && (
                  <div className="text-xs text-indigo-700">
                    Google 일정과 Task ID 기반으로, 빈 시간에 맞춰 추천 스케줄을 생성합니다.
                  </div>
                )}
              </div>
            </Card>

            <div className="flex justify-end">
              <Button
                variant="outline"
                size="md"
                onClick={() =>
                  navigate("/checkin", {
                    state: { dayId: savedPlan.day_id, originalPlan: savedPlan },
                  })
                }
                className="mt-2"
              >
                컨디션 기반 재조정으로 이동
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default PlanDayPage;

