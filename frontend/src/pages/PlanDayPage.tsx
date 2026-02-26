// PlanDayPage - Google Calendar + Planner
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import { useGoogleCalendar } from "../hooks/useGoogleCalendar";
import { usePlanWizard } from "../hooks/usePlanWizard";
import { Button } from "../components/ui/Button";
import Card from "../components/ui/Card";
import { TodayConditionBanner, type PatchSuggestion } from "../components/spec";
import StepWizard from "../components/plan/StepWizard";
import TaskInputStep from "../components/plan/TaskInputStep";
import MicroActionStep from "../components/plan/MicroActionStep";
import MissionSettingStep from "../components/plan/MissionSettingStep";
import AlarmSettingStep from "../components/plan/AlarmSettingStep";
import PlanSummary from "../components/plan/PlanSummary";
import { TimeTable } from "../components/schedule/TimeTable";
import type { ScheduleItem } from "../components/schedule/TimeTable";
import AlarmInstallGuide from "../components/feature/AlarmInstallGuide";
import {
  type AppOnlyEvent,
  buildPrivacyKey,
  createAppOnlyEvent,
  createMaskedPayload,
  loadAppOnlyEvents,
  saveAppOnlyEvent,
  savePrivacyMapping,
  updateAppOnlyEvent,
  updatePrivacyMappingKey,
} from "../services/privacySync";
import type { PlanItemInput, SelectedTask } from "../types/mission";
import type { PrivacyMode } from "../types/privacy";

type BannerSummary = {
  confidence: "low" | "med" | "high";
  evidence_snapshot: string[];
  drivers_top2: Array<{
    driver: string;
    score: number;
    confidence: "low" | "med" | "high";
    evidence?: string[];
  }>;
  drivers?: Array<{
    driver: string;
    score: number;
    confidence: "low" | "med" | "high";
    evidence?: string[];
  }>;
  data_quality?: string;
};

const parseTimeLabel = (timeStr: string): number => {
  const match = timeStr.match(/(\d{2}):(\d{2})/);
  if (!match) return 0;
  return parseInt(match[1]) + parseInt(match[2]) / 60;
};

const formatTimeLabel = (timeValue: number): string => {
  const hour = Math.floor(timeValue);
  const minute = Math.round((timeValue - hour) * 60);
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
};

const PlanDayPage: React.FC = () => {
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuth();

  // Google Calendar 연결 상태
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

  // 계획 위저드 상태
  const wizard = usePlanWizard();

  // ?곹깭
  const [showGoogleSection, setShowGoogleSection] = useState(true);
  const [plannedGoogleSyncMode, setPlannedGoogleSyncMode] =
    useState<PrivacyMode>("NORMAL");
  const [appOnlyEvents, setAppOnlyEvents] = useState<AppOnlyEvent[]>(() =>
    loadAppOnlyEvents(wizard.state.date)
  );
  const [bannerSummary, setBannerSummary] = useState<BannerSummary | null>(null);
  const [bannerPatch, setBannerPatch] = useState<PatchSuggestion | null>(null);
  const [bannerPatchLoading, setBannerPatchLoading] = useState(false);
  const [bannerPatchError, setBannerPatchError] = useState<string | null>(null);
  const [bannerPatchResult, setBannerPatchResult] = useState<string | null>(null);
  const [showEmotionPrompt, setShowEmotionPrompt] = useState(false);
  const [showAlarmInstallGuide, setShowAlarmInstallGuide] = useState(false);

  const buildPlanStartResistanceLabel = (resistanceLevel?: number) => {
    if (resistanceLevel == null) return "시작저항";
    return resistanceLevel >= 7 ? "업무시작했으나 막힘" : "시작저항";
};

  const refreshAppOnlyEvents = useCallback(() => {
    setAppOnlyEvents(loadAppOnlyEvents(wizard.state.date));
  }, [wizard.state.date]);

  const planItems: PlanItemInput[] = React.useMemo(() => {
    const items: PlanItemInput[] = [];
    if (wizard.state.task?.task_title) {
      items.push({ title: wizard.state.task.task_title });
    }
    googleEvents.forEach((event) => {
      if (event.title) {
        items.push({
          title: event.displayTitle ?? event.title,
          start: event.start,
          end: event.end,
        });
      }
    });
    return items;
  }, [googleEvents, wizard.state.task?.task_title]);

  const missionType = React.useMemo(() => {
    const enabled = wizard.state.missions.find((m) => m.enabled);
    return enabled?.type;
  }, [wizard.state.missions]);

  // ?좎쭨 蹂寃???Google ?쇱젙 ?숆린??  useEffect(() => {
  useEffect(() => {
    if (isConnected && wizard.state.date) {
      fetchGoogleEvents(wizard.state.date);
    }
  }, [isConnected, wizard.state.date, fetchGoogleEvents]);

  useEffect(() => {
    refreshAppOnlyEvents();
  }, [wizard.state.date, refreshAppOnlyEvents]);

  useEffect(() => {
    if (wizard.state.step === 1) {
      setPlannedGoogleSyncMode(wizard.state.privacy_mode);
    }
  }, [wizard.state.step, wizard.state.privacy_mode]);

  const loadBanner = useCallback(async () => {
    try {
      const params = new URLSearchParams({ date: wizard.state.date });
      if (user?.uid) params.set("user_id", user.uid);
      const dayId = wizard.state.savedPlan?.day_id;
      if (dayId != null) params.set("day_id", String(dayId));
      const res = await fetch(`/api/spec/plan/patch/suggest?${params.toString()}`, {
        credentials: "include",
      });
      if (!res.ok) {
        setBannerSummary(null);
        setBannerPatch(null);
        return;
      }
      const data = await res.json();
      setBannerSummary({
        confidence: data.confidence ?? "low",
        evidence_snapshot: data.evidence_snapshot ?? [],
        drivers_top2: data.drivers_top2 ?? [],
        drivers: data.drivers ?? [],
        data_quality: data.data_quality ?? "low",
      });
      setBannerPatch(
        Array.isArray(data.suggestions) && data.suggestions.length > 0
          ? (data.suggestions[0] as PatchSuggestion)
          : null
      );
    } catch {
      setBannerSummary(null);
      setBannerPatch(null);
    }
  }, [user?.uid, wizard.state.date, wizard.state.savedPlan?.day_id]);

  const applyBannerPatch = useCallback(async () => {
    if (!bannerPatch) return;
    setBannerPatchError(null);
    setBannerPatchResult(null);
    setBannerPatchLoading(true);
    try {
      const res = await fetch("/api/spec/plan/patch/apply", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          date: wizard.state.date,
          patch_type: bannerPatch.patch_type,
          day_id: wizard.state.savedPlan?.day_id ?? null,
          user_id: user?.uid ?? null,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.detail || `status ${res.status}`);
      }
      setBannerPatchResult(data.message || "패치가 적용되었습니다.");
      await loadBanner();
      if (isConnected) {
        await fetchGoogleEvents(wizard.state.date);
      }
    } catch (e) {
      setBannerPatchError(
        e instanceof Error ? e.message : "패치 적용 중 오류가 발생했습니다."
      );
    } finally {
      setBannerPatchLoading(false);
    }
  }, [
    bannerPatch,
    fetchGoogleEvents,
    isConnected,
    loadBanner,
    user?.uid,
    wizard.state.date,
    wizard.state.savedPlan?.day_id,
  ]);

  useEffect(() => {
    loadBanner();
  }, [loadBanner]);

  // Google ?대깽????ScheduleItem 蹂??  const googleScheduleItems: ScheduleItem[] = useMemo(() => {
  const googleScheduleItems: ScheduleItem[] = useMemo(() => {
    return googleEvents.map((ev) => {
      const startTime = parseTimeLabel(ev.start);
      const endTime = parseTimeLabel(ev.end);
      const duration = Math.max(0.5, endTime - startTime);
      return {
        id: ev.id,
        title: ev.displayTitle ?? ev.title,
        raw_title: ev.title,
        category: "work" as const,
        startTime,
        duration,
        privacy_mode: ev.privacy_mode,
        source: "google",
      };
    });
  }, [googleEvents]);

  const appOnlyScheduleItems: ScheduleItem[] = useMemo(() => {
    return appOnlyEvents.map((event) => {
      const startTime = parseTimeLabel(event.startIso);
      const endTime = parseTimeLabel(event.endIso);
      const duration = Math.max(0.5, endTime - startTime);
      return {
        id: event.id,
        title: event.title,
        raw_title: event.title,
        category: "personal" as const,
        startTime,
        duration,
        privacy_mode: event.privacy_mode,
        source: "app",
      };
    });
  }, [appOnlyEvents]);

  const scheduleItems = useMemo(() => {
    return [...googleScheduleItems, ...appOnlyScheduleItems].sort(
      (a, b) => a.startTime - b.startTime
    );
  }, [googleScheduleItems, appOnlyScheduleItems]);

  // TimeTable?먯꽌 ?대깽???낅뜲?댄듃 ??Google Calendar API ?몄텧
  const handleScheduleUpdate = useCallback(
    async (updatedEvent: ScheduleItem, previousEvent?: ScheduleItem) => {
      const startHour = Math.floor(updatedEvent.startTime);
      const startMinute = Math.round((updatedEvent.startTime - startHour) * 60);
      const endTime = updatedEvent.startTime + updatedEvent.duration;
      const endHour = Math.floor(endTime);
      const endMinute = Math.round((endTime - endHour) * 60);

      const startIso = `${wizard.state.date}T${String(startHour).padStart(2, "0")}:${String(startMinute).padStart(2, "0")}:00`;
      const endIso = `${wizard.state.date}T${String(endHour).padStart(2, "0")}:${String(endMinute).padStart(2, "0")}:00`;

      if (updatedEvent.privacy_mode === "APP_ONLY" || updatedEvent.source === "app") {
        updateAppOnlyEvent(updatedEvent.id, {
          startIso,
          endIso,
          date: wizard.state.date,
        });
        refreshAppOnlyEvents();
        return;
      }

      try {
        await updateGoogleEvent({
          eventId: updatedEvent.id,
          startIso,
          endIso,
        });
      } catch (err) {
      console.error("Google 일정 수정 오류:", err);
        return;
      }

      if (
        updatedEvent.privacy_mode === "MASKED" &&
        previousEvent &&
        previousEvent.raw_title
      ) {
        const prevKey = buildPrivacyKey(
          previousEvent.raw_title,
          formatTimeLabel(previousEvent.startTime),
          formatTimeLabel(previousEvent.startTime + previousEvent.duration)
        );
        const nextKey = buildPrivacyKey(
          previousEvent.raw_title,
          formatTimeLabel(updatedEvent.startTime),
          formatTimeLabel(updatedEvent.startTime + updatedEvent.duration)
        );
        updatePrivacyMappingKey(prevKey, nextKey);
      }
    },
    [refreshAppOnlyEvents, updateGoogleEvent, wizard.state.date]
  );

  // Google ?쇱젙 ?대낫?닿린 (?꾨즺 ??
  const buildExportDescription = useCallback(() => {
    const details: string[] = [];

    const microActionDescription =
      wizard.state.microAction?.description ||
      wizard.state.microAction?.name;
    if (microActionDescription) {
      details.push(`Micro action: ${microActionDescription}`);
    }

    wizard.state.missions
      .filter((mission) => mission.enabled)
      .forEach((mission, idx) => {
        if (mission.type === "photo") {
          const config = mission.config as {
            description?: string;
            requirement?: string;
          };
          const requirement = config?.description || config?.requirement;
          details.push(
            `Mission ${idx + 1} (Photo): ${requirement || "Proof required"}`
          );
          return;
        }
        if (mission.type === "location") {
          const config = mission.config as {
            place_name?: string;
            address?: string;
            road_address?: string;
          };
          const placeName = config?.place_name;
          const address = config?.address || config?.road_address;
          const locationText = [placeName, address].filter(Boolean).join(" / ");
          details.push(`Mission ${idx + 1} (Location): ${locationText || "Location check"}`);
          return;
        }
        if (mission.type === "time_check") {
          const config = mission.config as {
            check_type?: string[];
            time?: string;
          };
          const checkType =
            config?.check_type?.join(", ") || "time check";
          const timeText = config?.time ? ` @ ${config.time}` : "";
          details.push(`Mission ${idx + 1} (Time check): ${checkType}`);
          if (timeText) {
            details.push(`  - ${timeText}`);
          }
        }
      });

    return details.length > 0 ? details.join("\n") : undefined;
  }, [wizard.state.missions, wizard.state.microAction]);

  const handleExportToGoogle = async (
    mode?: PrivacyMode,
    alarmOverride?: AlarmConfig
  ) => {
    const privacyMode = mode || wizard.state.privacy_mode;

    if (!isConnected && privacyMode !== "APP_ONLY") {
      alert("Google 캘린더 연동이 필요합니다.");
      return;
    }

    const task = wizard.state.task;
    const alarm = alarmOverride ?? wizard.state.alarm;
    if (!task || !alarm) {
      alert("작업 제목과 알람 시간을 모두 입력해 주세요.");
      return;
    }

    const timeStr = alarm.time; // "HH:mm"
    const [hours, minutes] = timeStr.split(":").map(Number);
    const start = new Date(wizard.state.date);
    start.setHours(hours, minutes, 0, 0);

    const durationMinutes = task.est_minutes || 30;
    const end = new Date(start.getTime() + durationMinutes * 60 * 1000);
    const endIso = end.toISOString();
    const startIso = start.toISOString();
    const totalMinutes = hours * 60 + minutes + durationMinutes;
    const endHour = Math.floor(totalMinutes / 60) % 24;
    const endMinute = totalMinutes % 60;
    const endLabel = `${String(endHour).padStart(2, "0")}:${String(endMinute).padStart(2, "0")}`;
    const originalTitle = task.task_title;
    const originalDescription = buildExportDescription();

    try {
      // Task ID媛 ?덉쑝硫??ъ슜, ?놁쑝硫?savedPlan?먯꽌 媛?몄삤湲?(Google sync??
      const taskId =
        task.task_id ||
        wizard.state.savedPlan?.items?.[0]?.task_id;

      if (privacyMode !== "APP_ONLY" && !taskId) {
      alert(
        "Task ID를 찾을 수 없습니다. Google 연동을 위해 기존 계획 정보가 필요합니다."
      );
        return;
      }

      if (privacyMode === "APP_ONLY") {
        const appOnlyEvent = createAppOnlyEvent({
          title: originalTitle,
          description: originalDescription,
          startIso,
          endIso,
        });
        saveAppOnlyEvent(appOnlyEvent);
        refreshAppOnlyEvents();
        alert("Saved in app only.");
        return;
      }

      if (privacyMode === "MASKED") {
        const { maskedTitle, maskedDescription, privacyKey } =
          createMaskedPayload(timeStr, endLabel);
        savePrivacyMapping({
          key: privacyKey,
          originalTitle,
          originalDescription,
          maskedTitle,
          maskedDescription,
          privacy_mode: "MASKED",
          updatedAt: new Date().toISOString(),
        });
        await exportToGoogle({
          taskId: taskId as number,
          startIso,
          durationMinutes,
          summary: maskedTitle,
          description: maskedDescription,
          privacyMode,
          privacyKey,
          originalTitle,
          originalDescription,
        });
      } else {
        await exportToGoogle({
          taskId: taskId as number,
          startIso,
          durationMinutes,
          summary: originalTitle,
          description: originalDescription,
          privacyMode,
          originalTitle,
          originalDescription,
        });
      }

      alert("Synced to Google Calendar.");
      fetchGoogleEvents(wizard.state.date);
    } catch (err) {
      console.error("Google 캘린더 동기화 오류:", err);
    }
  };

  // ?ㅼ젣 濡쒓렇???ъ슜??ID ?ъ슜
  const userId = user?.uid;
  const exportLabel =
    wizard.state.privacy_mode === "APP_ONLY" ? "Save in app" : "Add to Google";

  const handleTaskCreate = (task: SelectedTask) => {
    wizard.setTask(task);
    wizard.nextStep();
  };

  const handleEmotionPromptClose = () => {
    setShowEmotionPrompt(false);
  };

  const navigateToEmotionInput = () => {
    setShowEmotionPrompt(false);
    navigate("/eft-strict", {
      state: {
        planStartResistance: buildPlanStartResistanceLabel(
          wizard.state.task?.resistance_level
        ),
      },
    });
  };

  // 濡쒓렇???뺤씤
  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-gray-600">로딩 중...</div>
      </div>
    );
  }


  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center space-y-4">
          <div className="text-xl font-bold text-gray-800">로그인 후 이용 가능합니다.</div>
          <Button variant="primary" onClick={() => navigate("/login")} >
            로그인
          </Button>
        </div>
      </div>
    );
  }



  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-purple-50 to-indigo-50">
      {/* ?ㅻ뜑 */}
      <div className="bg-white border-b border-gray-200 px-4 py-3 flex items-center justify-between sticky top-0 z-20">
        <div className="flex items-center gap-3">
          <h1 className="text-xl font-bold text-gray-800">일정 계획 입력</h1>
          {user && (
            <span className="text-xs text-gray-500">
              님 {user.name || user.email}
            </span>
          )}
        </div>
          <Button
            variant="ghost"
            size="sm"
          onClick={() => {
            if (
              wizard.state.step > 1 &&
              wizard.state.step < 5 &&
              !confirm("입력 중인 내용이 삭제될 수 있습니다. 이동하시겠습니까?")
            ) {
              return;
            }
            navigate("/dashboard");
          }}
          >
            대시보드로 이동          </Button>
        </div>

      {(bannerSummary || bannerPatch) && (
        <div className="max-w-2xl mx-auto px-4 py-4">
          <Card>
            <TodayConditionBanner
              summary={bannerSummary}
              recommendedPatch={bannerPatch}
              patchLoading={bannerPatchLoading}
              patchError={bannerPatchError}
              patchResultMessage={bannerPatchResult}
              onApplyPatch={applyBannerPatch}
              onEditInputs={() =>
                navigate("/checkin", {
                  state: { dayId: wizard.state.savedPlan?.day_id },
                })
              }
            />
          </Card>
        </div>
      )}

      {/* Google 罹섎┛???뱀뀡 (?묒뿀???쇱튂湲? */}
      <div className="max-w-2xl mx-auto px-4 py-4">
        <Card>
          <div className="space-y-3">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setShowGoogleSection(!showGoogleSection)}
                  className="text-gray-500 hover:text-gray-700"
                >
                  {showGoogleSection ? "접기" : "펼치기"}
                </button>
                <h2 className="text-sm font-semibold text-gray-800">
                  Google 캘린더              </h2>
              </div>
              {!isConnected ? (
                <Button size="sm" variant="outline" onClick={connectGoogle}>
                  Google 캘린더 연동
                </Button>
              ) : (
                <div className="flex items-center gap-2 text-xs text-gray-600">
                  <span className="inline-flex items-center rounded-full bg-emerald-50 px-2 py-0.5 text-emerald-700 border border-emerald-200">
                    연동됨                  </span>
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

            {showGoogleSection && (
              <>
            {googleError && (
              <div className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-md px-2 py-1.5">
                {googleError}
              </div>
            )}

                {/* Google ?쇱젙 */}
              {googleLoading && (
                  <div className="text-xs text-gray-500 py-2">
                    Google 일정 불러오는 중...
                  </div>
              )}
              {!googleLoading && googleEvents.length === 0 && (
                  <div className="text-xs text-gray-400 py-2">
                  {isConnected
                      ? `${wizard.state.date}에 등록된 Google 일정이 없습니다.`
                      : "Google 연동 후 오늘 일정을 이곳에서 함께 볼 수 있습니다."}
                </div>
              )}

                {/* TimeTable 而댄룷?뚰듃 (?쒕옒洹?& 由ъ궗?댁쫰) */}
            {scheduleItems.length > 0 && (
                  <TimeTable
                    date={new Date(wizard.state.date)}
                    initialEvents={scheduleItems}
                    onUpdateEvent={handleScheduleUpdate}
                  />
                )}
              </>
            )}
                </div>
        </Card>
                  </div>
                  
      {/* ?ㅽ뀦 ?꾨줈洹몃젅??諛?*/}
      {wizard.state.step < 5 && (
        <StepWizard currentStep={wizard.state.step} onStepClick={wizard.goToStep} />
      )}

      {/* ?먮윭 硫붿떆吏 */}
      {wizard.error && wizard.state.step < 5 && (
        <div className="max-w-2xl mx-auto px-4 mt-4">
          <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-md px-4 py-3">
            {wizard.error}
                </div>
              </div>
            )}

      {/* ?ㅽ뀦蹂?而댄룷?뚰듃 */}
      <div className="pb-8">
        {wizard.state.step === 1 && (
          <div className="space-y-4">
            {/* ?좎쭨/紐⑤뱶 ?좏깮 */}
            <div className="max-w-2xl mx-auto px-4">
              <Card>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  날짜
                </label>
                <input
                  type="date"
                      value={wizard.state.date}
                      onChange={(e) => wizard.setDate(e.target.value)}
                  className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                      난이도 모드
                </label>
                <select
                      value={wizard.state.mode}
                      onChange={(e) => wizard.setMode(Number(e.target.value))}
                  className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                >
                  <option value={100}>100 - 강도 높음</option>
                  <option value={70}>70 - 강도 보통</option>
                  <option value={40}>40 - 강도 낮음</option>
                </select>
              </div>
            </div>
              </Card>
            </div>

            <TaskInputStep
              initialTask={wizard.state.task}
              onNext={handleTaskCreate}
              userId={userId}
              privacyMode={wizard.state.privacy_mode}
              onPrivacyModeChange={wizard.setPrivacyMode}
            />
                  </div>
        )}

        {wizard.state.step === 2 && wizard.state.task && (
          <MicroActionStep
            task={wizard.state.task}
            initialMicroAction={wizard.state.microAction}
            onNext={(microAction) => {
              wizard.setMicroAction(microAction);
              wizard.nextStep();
            }}
            onBack={wizard.prevStep}
            onTaskUpdate={(updatedTask) => wizard.setTask(updatedTask)}
            userId={userId}
            planItems={planItems}
            missionType={missionType}
          />
        )}

        {wizard.state.step === 3 &&
          wizard.state.task &&
          wizard.state.microAction && (
            <MissionSettingStep
              task={wizard.state.task}
              microAction={wizard.state.microAction}
              initialMissions={wizard.state.missions}
              onNext={(missions, combinationMode) => {
                wizard.setMissions(missions);
                wizard.setMissionCombinationMode(combinationMode);
                wizard.nextStep();
              }}
              onBack={wizard.prevStep}
              userId={userId}
            />
          )}

        {wizard.state.step === 4 &&
          wizard.state.task &&
          wizard.state.microAction && (
            <div className="space-y-4">
              <AlarmSettingStep
                task={wizard.state.task}
                microAction={wizard.state.microAction}
                missions={wizard.state.missions}
                initialAlarm={wizard.state.alarm}
                userId={userId}
                isGoogleConnected={isConnected}
                privacyMode={wizard.state.privacy_mode}
                onComplete={async (alarm, options) => {
                  wizard.setAlarm(alarm);
                  try {
                    setPlannedGoogleSyncMode(options.syncMode);
                    await wizard.submit(userId, { alarm });
                    setShowEmotionPrompt(true);
                    setShowAlarmInstallGuide(true);
                    // ?깃났 ???먮룞?쇰줈 step 5濡??대룞
                  } catch (err) {
                    console.error("????ㅽ뙣:", err);
                  }
                }}
                onBack={wizard.prevStep}
              />

              {/* Google 罹섎┛???대낫?닿린 踰꾪듉 */}
              {isConnected && wizard.state.alarm && (
                <div className="max-w-2xl mx-auto px-4">
                  <Card className="bg-green-50 border-green-200">
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex-1">
                        <div className="text-sm font-semibold text-green-800">
                          Google 캘린더에 일정 추가
                    </div>
                        <div className="text-xs text-gray-600 mt-1">
                          입력한 시간({wizard.state.alarm.time})으로 Google
                          일정에 등록하세요
                  </div>
                  </div>
                       <Button
                         variant="primary"
                         size="sm"
                         onClick={() =>
                           handleExportToGoogle(
                             plannedGoogleSyncMode,
                             wizard.state.alarm!
                           )
                         }
                       >
                         {exportLabel}
                       </Button>
          </div>
        </Card>
                </div>
              )}
            </div>
          )}

        {wizard.state.step === 5 &&
          wizard.state.task &&
          wizard.state.microAction &&
          wizard.state.alarm && (
            <div className="space-y-4">
              {showAlarmInstallGuide && (
                <AlarmInstallGuide
                  title="알람은 앱에서 푸시 연동이 안정적입니다"
                  description="일정 알림은 앱에서 푸시 권한을 받아야 정확하게 동작합니다. 앱을 설치해서 알람을 연결해 주세요."
                  className="mx-4"
                  onDismiss={() => setShowAlarmInstallGuide(false)}
                  showDismiss
                />
              )}
              <PlanSummary
                task={wizard.state.task}
                microAction={wizard.state.microAction}
                missions={wizard.state.missions}
                alarm={wizard.state.alarm}
                savedPlan={wizard.state.savedPlan}
                privacyMode={wizard.state.privacy_mode}
                onReset={() => {
                  wizard.reset();
                }}
              />

              {/* Google 罹섎┛???대낫?닿린 (?꾨즺 ?꾩뿉??媛?? */}
              {isConnected && (
                <div className="max-w-2xl mx-auto px-4">
                  <Card className="bg-blue-50 border-blue-200">
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex-1">
                        <div className="text-sm font-semibold text-blue-800">
                          Google 캘린더로 동기화
                          </div>
                        <div className="text-xs text-gray-600 mt-1">
                          현재 계획을 Google 일정으로 바로 동기화할 수 있습니다
                        </div>
                        </div>
                    <Button
                        variant="primary"
                      size="sm"
                        onClick={() =>
                          handleExportToGoogle(
                            plannedGoogleSyncMode,
                            wizard.state.alarm!
                          )
                        }
                      >
                        {exportLabel}
                    </Button>
                  </div>
                  </Card>
                </div>
              )}
                  </div>
                )}
                      </div>

      {/* 濡쒕뵫 ?ㅻ쾭?덉씠 */}
      {showEmotionPrompt && (
        <div
          className="fixed inset-0 bg-black/40 flex items-center justify-center z-[60] p-4"
          onClick={handleEmotionPromptClose}
        >
          <div
            className="w-full max-w-sm rounded-lg bg-white p-5 shadow-xl"
            onClick={(event) => event.stopPropagation()}
          >
            <h2 className="text-base font-bold text-gray-900">
              일정에 대한 저항감이 있나요?
            </h2>
            <p className="mt-2 text-sm text-gray-600">
              하기 싫은 마음이 든다면, 감정을 먼저 다뤄보세요.
            </p>
            <div className="mt-5 flex justify-end gap-2">
              <Button variant="ghost" size="sm" onClick={handleEmotionPromptClose}>
                닫기
              </Button>
              <Button size="sm" onClick={navigateToEmotionInput}>
                감정 입력하기              </Button>
            </div>
          </div>
        </div>
      )}
      {wizard.loading && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl px-6 py-4">
            <div className="flex items-center gap-3">
              <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-indigo-600"></div>
              <span className="text-gray-700 font-medium">로딩 중...</span>
                            </div>
                    </div>
                  </div>
                )}
    </div>
  );
};

export default PlanDayPage;
