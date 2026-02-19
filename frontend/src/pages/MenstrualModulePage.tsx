import React, { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";

import { Button } from "../components/ui/Button";
import { useAuth } from "../hooks/useAuth";
import {
  createMenstrualExport,
  getMenstrualCalendar,
  getJournal,
  getMenstrualExportDownloadUrl,
  getMenstrualExportStatus,
  getMenstrualInsights,
  getMenstrualPrediction,
  getMenstrualSettings,
  logBleeding,
  logJournal,
  logMeds,
  logPmddLite,
  logSymptoms,
  logTrigger,
  updateMenstrualSettings,
  type MenstrualCalendarResponse,
  type MenstrualExportJob,
  type JournalEntry,
  type MenstrualExportStatus,
  type MenstrualInsightsResponse,
  type MenstrualPrediction,
  type MenstrualPrivacySettings,
} from "../services/menstrualService";

type BleedingType = "menstruation_start" | "menstruation_end" | "spotting_start" | "spotting_end";
type MedType = "painkiller" | "contraceptive" | "ssri" | "supplement" | "other";
type MedEffect = "improved" | "unchanged" | "worsened";
type MedHistoryItem = {
  id: string;
  med_name: string;
  dose: string;
  type: MedType;
  effect: MedEffect;
};
type QuickMenstrualStatus = "start" | "middle" | "end" | "none";
type TriggerHistoryItem = {
  id: string;
  tags: TriggerTag[];
  stress_level: number;
  note: string;
};

const QUICK_SYMPTOMS = [
  "irritable",
  "depressed",
  "anxious",
  "mood_swings",
  "bloating",
  "headache",
  "fatigue",
  "brain_fog",
] as const;
type QuickSymptom = (typeof QUICK_SYMPTOMS)[number];

const SYMPTOM_LABELS: Record<QuickSymptom, string> = {
  irritable: "Irritable",
  depressed: "Depressed mood",
  anxious: "Anxiety",
  mood_swings: "Mood swings",
  bloating: "Bloating",
  headache: "Headache",
  fatigue: "Fatigue",
  brain_fog: "Brain fog",
};

const SEVERITY_SEGMENTS = [
  { value: 0, label: "없음" },
  { value: 1, label: "약함" },
  { value: 2, label: "보통" },
  { value: 3, label: "심함" },
  { value: 4, label: "매우 심함" },
] as const;

const PMDD_CORE_QUESTION_IDS = [
  "depressed_mood",
  "anxious_tense",
  "irritability",
  "concentration_difficulty",
  "sleep_disturbance",
  "overeating_craving",
] as const;

const DRSP_LITE_ITEMS: Array<{ id: string; label: string }> = [
  { id: "depressed_mood", label: "우울" },
  { id: "hopelessness", label: "절망감" },
  { id: "self_critical", label: "자기비난" },
  { id: "anxious_tense", label: "불안" },
  { id: "mood_swings", label: "기분 변동" },
  { id: "irritability", label: "짜증" },
  { id: "interpersonal_conflict", label: "대인 갈등" },
  { id: "fatigue", label: "피로" },
  { id: "sleep_disturbance", label: "수면" },
  { id: "concentration_difficulty", label: "집중" },
  { id: "overeating_craving", label: "식욕" },
  { id: "physical_symptoms", label: "신체 증상" },
];

const TRIGGER_TAGS = [
  "conflict",
  "overtime",
  "caffeine",
  "alcohol",
  "travel",
  "sickness",
  "exercise_change",
  "sleep_change",
  "other",
] as const;
type TriggerTag = (typeof TRIGGER_TAGS)[number];

const TRIGGER_LABELS: Record<TriggerTag, string> = {
  conflict: "Conflict",
  overtime: "Overtime",
  caffeine: "Caffeine",
  alcohol: "Alcohol",
  travel: "Travel",
  sickness: "Sickness",
  exercise_change: "Exercise change",
  sleep_change: "Sleep change",
  other: "Other",
};

const QUICK_MENSTRUAL_STATUS_LABELS: Record<QuickMenstrualStatus, string> = {
  start: "시작",
  middle: "중간",
  end: "끝",
  none: "없음",
};

const QUICK_MENSTRUAL_STATUS_TO_BLEEDING_TYPE: Record<Exclude<QuickMenstrualStatus, "none">, BleedingType> = {
  start: "menstruation_start",
  middle: "spotting_start",
  end: "menstruation_end",
};

const MED_TYPE_LABELS: Record<MedType, string> = {
  painkiller: "Painkiller",
  contraceptive: "Contraceptive",
  ssri: "SSRI",
  supplement: "Supplement",
  other: "Other",
};
const MED_EFFECT_LABELS: Record<MedEffect, string> = {
  improved: "좋아짐",
  unchanged: "변화없음",
  worsened: "악화",
};
const MED_EFFECT_VALUES: Record<MedEffect, number> = {
  improved: 5,
  unchanged: 3,
  worsened: 0,
};
const MED_NAME_SUGGESTIONS = [
  "이부프로펜",
  "나프록센",
  "타이레놀",
  "미페프리스톤",
  "세티리진",
  "엽산",
  "마그네슘",
  "비타민D",
  "칼슘",
];
const JOURNAL_SUMMARY_PLACEHOLDER = "요약: 오늘 가장 힘든 상황 1줄";
const JOURNAL_MEMO_PLACEHOLDER = "메모: 몸 상태/기분 한 줄";

const PHASE_LABELS: Record<
  "menstruation" | "follicular" | "ovulation_window" | "luteal" | "unknown",
  string
> = {
  menstruation: "Menstruation",
  follicular: "Follicular",
  ovulation_window: "Ovulation window",
  luteal: "Luteal",
  unknown: "Unknown",
};

const BLEEDING_STATUS_LABELS: Record<"none" | "spotting" | "period", string> = {
  none: "None",
  spotting: "Spotting",
  period: "Period",
};

const DATA_QUALITY_LABELS: Record<"insufficient" | "fair" | "good", string> = {
  insufficient: "Insufficient",
  fair: "Fair",
  good: "Good",
};

const PMS_SEVERITY_LABELS: Record<string, string> = {
  mild: "Mild",
  moderate: "Moderate",
  severe: "Severe",
};

type MenstrualTab = "today" | "context" | "insight";

const MENSTRUAL_TABS: Array<{ value: MenstrualTab; label: string }> = [
  { value: "today", label: "오늘 기록" },
  { value: "context", label: "맥락 로그" },
  { value: "insight", label: "인사이트/내보내기" },
];

type ContextSaveResult = {
  ok: boolean;
  error: string | null;
};

function plusDays(base: Date, days: number): string {
  const next = new Date(base);
  next.setDate(base.getDate() + days);
  return next.toISOString().slice(0, 10);
}

function getSelectedDateDatetime(baseDate: string, at: Date = new Date()): string {
  const hours = String(at.getHours()).padStart(2, "0");
  const minutes = String(at.getMinutes()).padStart(2, "0");
  const seconds = String(at.getSeconds()).padStart(2, "0");
  return `${baseDate}T${hours}:${minutes}:${seconds}`;
}

export default function MenstrualModulePage() {
  const navigate = useNavigate();
  const { loading: authLoading, isAuthenticated } = useAuth();
  const [activeTab, setActiveTab] = useState<MenstrualTab>("today");
  const today = useMemo(() => new Date(), []);

  const [selectedDate, setSelectedDate] = useState(today.toISOString().slice(0, 10));
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const [prediction, setPrediction] = useState<MenstrualPrediction | null>(null);
  const [calendar, setCalendar] = useState<MenstrualCalendarResponse | null>(null);
  const [insights, setInsights] = useState<MenstrualInsightsResponse | null>(null);
  const [settings, setSettings] = useState<MenstrualPrivacySettings | null>(null);

  const [quickMenstrualStatus, setQuickMenstrualStatus] = useState<QuickMenstrualStatus>("none");
  const [quickPainLevel, setQuickPainLevel] = useState(0);
  const [quickMoodLevel, setQuickMoodLevel] = useState(0);
  const [showQuickDetails, setShowQuickDetails] = useState(false);

  const [symptomScores, setSymptomScores] = useState<Record<QuickSymptom, number>>(
    QUICK_SYMPTOMS.reduce((acc, key) => ({ ...acc, [key]: 0 }), {} as Record<QuickSymptom, number>),
  );
  const [symptomNotes, setSymptomNotes] = useState("");

  const [pmddAnswers, setPmddAnswers] = useState<number[]>(DRSP_LITE_ITEMS.map(() => 0));
  const [pmddSummary, setPmddSummary] = useState<string>("");
  const [showAllPmddItems, setShowAllPmddItems] = useState(false);

  const [triggerTags, setTriggerTags] = useState<TriggerTag[]>([]);
  const [triggerStress, setTriggerStress] = useState(5);
  const [triggerNote, setTriggerNote] = useState("");
  const [editingTriggerId, setEditingTriggerId] = useState<string | null>(null);
  const [triggerHistoryByDate, setTriggerHistoryByDate] = useState<Record<string, TriggerHistoryItem[]>>({});

  const [medName, setMedName] = useState("");
  const [medType, setMedType] = useState<MedType>("painkiller");
  const [medDose, setMedDose] = useState("");
  const [medEffect, setMedEffect] = useState<MedEffect>("unchanged");
  const [editingMedId, setEditingMedId] = useState<string | null>(null);
  const [medHistoryByDate, setMedHistoryByDate] = useState<Record<string, MedHistoryItem[]>>({});

  const [journalSummary, setJournalSummary] = useState("");
  const [journalMemo, setJournalMemo] = useState("");
  const [journalEntries, setJournalEntries] = useState<JournalEntry[]>([]);

  const [exportFrom, setExportFrom] = useState(plusDays(today, -30));
  const [exportTo, setExportTo] = useState(today.toISOString().slice(0, 10));
  const [exportJob, setExportJob] = useState<MenstrualExportJob | null>(null);
  const [exportStatus, setExportStatus] = useState<MenstrualExportStatus | null>(null);
  const [todayDraftDirtyByDate, setTodayDraftDirtyByDate] = useState<Record<string, boolean>>({});
  const [isAutoSavingToday, setIsAutoSavingToday] = useState(false);
  const [isSaveQueued, setIsSaveQueued] = useState(false);
  const [isSavingContext, setIsSavingContext] = useState(false);
  const [lastSavedAtByDate, setLastSavedAtByDate] = useState<Record<string, string>>({});
  const todayAutoSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const calendarFrom = useMemo(() => plusDays(new Date(selectedDate), -7), [selectedDate]);
  const calendarTo = useMemo(() => plusDays(new Date(selectedDate), 21), [selectedDate]);
  const insightsFrom = useMemo(() => plusDays(new Date(selectedDate), -30), [selectedDate]);
  const canPersistData = isAuthenticated && !authLoading;

  const refresh = async () => {
    setLoading(true);
    setError(null);
    try {
      const [p, c, i, s, journalResponse] = await Promise.all([
        getMenstrualPrediction(),
        getMenstrualCalendar(calendarFrom, calendarTo),
        getMenstrualInsights(insightsFrom, selectedDate),
        getMenstrualSettings(),
        getJournal({ fromDate: selectedDate, toDate: selectedDate }),
      ]);
      setPrediction(p);
      setCalendar(c);
      setInsights(i);
      setSettings(s);
      const filteredJournalEntries = (journalResponse?.entries ?? []).filter((entry) => {
        const entryDate = new Date(entry.datetime).toLocaleDateString("en-CA");
        return entryDate === selectedDate;
      });
      setJournalEntries(filteredJournalEntries);
    } catch (e) {
      setError(e instanceof Error ? e.message : "월경 모듈 정보를 불러오지 못했습니다.");
      setJournalEntries([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (authLoading) return;
    if (!isAuthenticated) {
      setPrediction(null);
      setCalendar(null);
      setInsights(null);
      setSettings(null);
      return;
    }
    void refresh();
  }, [authLoading, isAuthenticated, calendarFrom, calendarTo, insightsFrom, selectedDate]);

  const markTodayDraftDirty = () => {
    setTodayDraftDirtyByDate((prev) => ({ ...prev, [selectedDate]: true }));
  };

  const markTodayInputSaved = () => {
    setTodayDraftDirtyByDate((prev) => ({ ...prev, [selectedDate]: false }));
  };

  const onSaveToday = async () => {
    if (!canPersistData || isAutoSavingToday || !todayDraftDirty) {
      if (!canPersistData) {
        setError("로그인 후에만 저장할 수 있습니다.");
      }
      return;
    }
    setIsAutoSavingToday(true);
    setError(null);
    setIsSaveQueued(false);

    try {
      const normalizedPainForFlow = Math.max(0, Math.min(4, Math.round((quickPainLevel / 10) * 4)));
      const normalizedPainForCramp = Math.max(0, Math.min(5, Math.round((quickPainLevel / 10) * 5)));
      const normalizedMood = Math.max(0, Math.min(4, Math.round((quickMoodLevel / 10) * 4)));
      const quickSymptomPayload = {
        mood: normalizedMood,
      };
      const detailSymptomPayload = showQuickDetails
        ? QUICK_SYMPTOMS.reduce<Record<string, number>>((acc, key) => {
            const value = symptomScores[key];
            if (value > 0) acc[key] = value;
            return acc;
          }, {})
        : {};
      const symptomPayload = { ...quickSymptomPayload, ...detailSymptomPayload };
      const bleedingType = quickMenstrualStatus === "none" ? null : QUICK_MENSTRUAL_STATUS_TO_BLEEDING_TYPE[quickMenstrualStatus];

      const errors: string[] = [];
      let pmddResult: Awaited<ReturnType<typeof logPmddLite>>["score"] | null = null;

      try {
        if (bleedingType) {
          await logBleeding({
            date: selectedDate,
            type: bleedingType,
            flow_level: normalizedPainForFlow,
            cramp_level: normalizedPainForCramp,
            notes: `생리 상태: ${QUICK_MENSTRUAL_STATUS_LABELS[quickMenstrualStatus]} / 통증 ${quickPainLevel} / 기분 ${quickMoodLevel}`,
          });
        }
      } catch (err) {
        errors.push(err instanceof Error ? err.message : "출혈 저장 실패");
      }

      try {
        await logSymptoms({
          date: selectedDate,
          symptom_severity_map: symptomPayload,
          notes: showQuickDetails ? symptomNotes || null : null,
        });
      } catch (err) {
        errors.push(err instanceof Error ? err.message : "증상 저장 실패");
      }

      if (showQuickDetails) {
        try {
          const pmddResponse = await logPmddLite({
            date: selectedDate,
            answers: pmddAnswers,
            question_ids: DRSP_LITE_ITEMS.map((item) => item.id),
          });
          pmddResult = pmddResponse.score;
        } catch (err) {
          errors.push(err instanceof Error ? err.message : "PMDD 저장 실패");
        }
      }

      if (pmddResult) {
        const band = PMS_SEVERITY_LABELS[pmddResult.pms_severity_band] ?? pmddResult.pms_severity_band;
        setPmddSummary(`PMDD-lite 점수 ${pmddResult.pmdd_symptom_index} (강도: ${band})`);
      } else {
        setPmddSummary("");
      }

      if (errors.length === 0) {
        markTodayInputSaved();
        setLastSavedAtByDate((prev) => ({ ...prev, [selectedDate]: new Date().toISOString() }));
      }
      await refresh();
      if (errors.length > 0) {
        setError(errors.join(" / "));
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "오늘 기록 저장에 실패했습니다.");
    } finally {
      setIsAutoSavingToday(false);
    }
  };

  const onSaveTrigger = async (): Promise<ContextSaveResult> => {
    if (!canPersistData) {
      return { ok: false, error: "로그인 후에만 저장할 수 있습니다." };
    }
    if (triggerTags.length === 0) {
      return { ok: false, error: "트리거 태그를 1개 이상 선택해 주세요." };
    }
    try {
      const response = await logTrigger({
        date: selectedDate,
        tags: triggerTags,
        stress_level: triggerStress,
        note: triggerNote.trim() || null,
      });
      const nextItem: TriggerHistoryItem = {
        id: response.event_id,
        tags: triggerTags,
        stress_level: triggerStress,
        note: triggerNote.trim(),
      };
      setTriggerHistoryByDate((prev) => {
        const current = [...(prev[selectedDate] ?? [])];
        if (editingTriggerId) {
          const idx = current.findIndex((item) => item.id === editingTriggerId);
          if (idx >= 0) {
            current[idx] = nextItem;
          } else {
            current.unshift(nextItem);
          }
        } else {
          current.unshift(nextItem);
        }
        return { ...prev, [selectedDate]: current };
      });
      setEditingTriggerId(null);
      setTriggerTags([]);
      setTriggerStress(5);
      setTriggerNote("");
      setLastSavedAtByDate((prev) => ({ ...prev, [selectedDate]: new Date().toISOString() }));
      await refresh();
      return { ok: true, error: null };
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : "맥락 기록 저장에 실패했습니다." };
    }
  };

  const onSaveMeds = async (): Promise<ContextSaveResult> => {
    if (!canPersistData) {
      return { ok: false, error: "로그인 후에만 저장할 수 있습니다." };
    }
    if (!medName.trim()) {
      return { ok: false, error: "약 이름을 입력해 주세요." };
    }
    try {
      const response = await logMeds({
        datetime: getSelectedDateDatetime(selectedDate),
        med_name: medName.trim(),
        dose: medDose.trim() || null,
        type: medType,
        effect_rating: MED_EFFECT_VALUES[medEffect],
      });
      const nextItem: MedHistoryItem = {
        id: response.event_id,
        med_name: medName.trim(),
        dose: medDose.trim(),
        type: medType,
        effect: medEffect,
      };
      setMedHistoryByDate((prev) => {
        const current = [...(prev[selectedDate] ?? [])];
        if (editingMedId) {
          const idx = current.findIndex((item) => item.id === editingMedId);
          if (idx >= 0) {
            current[idx] = nextItem;
          } else {
            current.unshift(nextItem);
          }
        } else {
          current.unshift(nextItem);
        }
        return { ...prev, [selectedDate]: current };
      });
      setEditingMedId(null);
      setMedName("");
      setMedDose("");
      setLastSavedAtByDate((prev) => ({ ...prev, [selectedDate]: new Date().toISOString() }));
      await refresh();
      return { ok: true, error: null };
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : "복용 기록 저장에 실패했습니다." };
    }
  };

  const onSaveJournal = async (): Promise<ContextSaveResult> => {
    if (!canPersistData) {
      return { ok: false, error: "로그인 후에만 저장할 수 있습니다." };
    }
    const summaryText = journalSummary.trim();
    const memoText = journalMemo.trim();
    if (!summaryText && !memoText) {
      return { ok: false, error: "요약 또는 메모 중 하나는 입력해 주세요." };
    }

    const payloadLines = [
      summaryText ? `${JOURNAL_SUMMARY_PLACEHOLDER.split(":")[0]} ${summaryText}` : null,
      memoText ? `${JOURNAL_MEMO_PLACEHOLDER.split(":")[0]} ${memoText}` : null,
    ].filter(Boolean) as string[];

    try {
      await logJournal({
        datetime: getSelectedDateDatetime(selectedDate),
        text: payloadLines.join("\n"),
      });
      setJournalSummary("");
      setJournalMemo("");
      setLastSavedAtByDate((prev) => ({ ...prev, [selectedDate]: new Date().toISOString() }));
      await refresh();
      return { ok: true, error: null };
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : "일기 기록 저장에 실패했습니다." };
    }
  };

  const onSaveContext = async () => {
    if (!canPersistData) {
      setError("로그인 후에만 저장할 수 있습니다.");
      return;
    }
    const hasTriggerDraft = triggerTags.length > 0 || triggerNote.trim() !== "" || triggerStress !== 5 || Boolean(editingTriggerId);
    const hasMedDraft = medName.trim() !== "" || Boolean(editingMedId);
    const hasJournalDraft = journalSummary.trim() !== "" || journalMemo.trim() !== "";
    if (!hasTriggerDraft && !hasMedDraft && !hasJournalDraft) {
      setError("저장할 맥락 로그 항목이 없습니다.");
      return;
    }

    setIsSavingContext(true);
    setError(null);

    try {
      const errors: string[] = [];
      if (hasTriggerDraft) {
        const result = await onSaveTrigger();
        if (result.error) {
          errors.push(result.error);
        }
      }
      if (hasMedDraft) {
        const result = await onSaveMeds();
        if (result.error) {
          errors.push(result.error);
        }
      }
      if (hasJournalDraft) {
        const result = await onSaveJournal();
        if (result.error) {
          errors.push(result.error);
        }
      }

      const nextError = errors.join(" / ");

      if (!nextError) {
        setLastSavedAtByDate((prev) => ({ ...prev, [selectedDate]: new Date().toISOString() }));
      } else {
        setError(nextError);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "맥락 로그 저장에 실패했습니다.");
    } finally {
      setIsSavingContext(false);
    }
  };

  const onToggleOnDevice = async () => {
    if (!canPersistData) {
      setError("로그인 후에만 변경할 수 있습니다.");
      return;
    }
    if (!settings) return;
    try {
      const updated = await updateMenstrualSettings({ on_device_only: !settings.on_device_only });
      setSettings(updated);
    } catch (e) {
      setError(e instanceof Error ? e.message : "설정 업데이트에 실패했습니다.");
    }
  };

  const onExport = async () => {
    if (!canPersistData) {
      setError("로그인 후에만 내보내기할 수 있습니다.");
      return;
    }
    try {
      const job = await createMenstrualExport({
        from: exportFrom,
        to: exportTo,
        formats: ["csv", "pdf"],
      });
      setExportJob(job);
      setExportStatus(await getMenstrualExportStatus(job.job_id));
    } catch (e) {
      setError(e instanceof Error ? e.message : "내보내기 작업 생성에 실패했습니다.");
    }
  };

  const todayDraftDirty = todayDraftDirtyByDate[selectedDate] ?? false;
  const todaysTriggerHistory = triggerHistoryByDate[selectedDate] ?? [];
  const todaysMedHistory = medHistoryByDate[selectedDate] ?? [];
  const hasContextTriggerDraft =
    triggerTags.length > 0 || triggerNote.trim() !== "" || triggerStress !== 5 || Boolean(editingTriggerId);
  const hasContextMedDraft = medName.trim() !== "" || Boolean(editingMedId);
  const hasContextJournalDraft = journalSummary.trim() !== "" || journalMemo.trim() !== "";
  const hasContextDraft = hasContextTriggerDraft || hasContextMedDraft || hasContextJournalDraft;
  const contextSaveLabel = isSavingContext ? "저장 중..." : "맥락 로그 저장";
  const isContextSaveDisabled = !canPersistData || isSavingContext || !hasContextDraft;

  const startEditTrigger = (entry: TriggerHistoryItem) => {
    setEditingTriggerId(entry.id);
    setTriggerTags(entry.tags);
    setTriggerStress(entry.stress_level);
    setTriggerNote(entry.note);
  };
  const deleteTrigger = (id: string) => {
    setTriggerHistoryByDate((prev) => {
      const current = (prev[selectedDate] ?? []).filter((item) => item.id !== id);
      return { ...prev, [selectedDate]: current };
    });
    if (editingTriggerId === id) {
      setEditingTriggerId(null);
      setTriggerTags([]);
      setTriggerStress(5);
      setTriggerNote("");
    }
  };

  const startEditMed = (entry: MedHistoryItem) => {
    setEditingMedId(entry.id);
    setMedName(entry.med_name);
    setMedType(entry.type);
    setMedDose(entry.dose);
    setMedEffect(entry.effect);
  };
  const deleteMed = (id: string) => {
    setMedHistoryByDate((prev) => {
      const current = (prev[selectedDate] ?? []).filter((item) => item.id !== id);
      return { ...prev, [selectedDate]: current };
    });
    if (editingMedId === id) {
      setEditingMedId(null);
      setMedName("");
      setMedDose("");
      setMedType("painkiller");
      setMedEffect("unchanged");
    }
  };

  const getJournalDisplayLines = (entry: JournalEntry) => {
    const lines = entry.text.split("\n").map((line) => line.trim()).filter(Boolean);
    const summary = lines[0] ?? "요약 없음";
    const memo = lines.slice(1).join(" / ").trim() || "메모 없음";
    return { summary, memo };
  };

  useEffect(() => {
    setEditingTriggerId(null);
    setEditingMedId(null);
  }, [selectedDate]);

  useEffect(() => {
    if (authLoading || activeTab !== "today" || !todayDraftDirty || isAutoSavingToday) return;

    if (todayAutoSaveTimerRef.current) {
      clearTimeout(todayAutoSaveTimerRef.current);
    }

    setIsSaveQueued(true);
    todayAutoSaveTimerRef.current = setTimeout(() => {
      setIsSaveQueued(false);
      void onSaveToday();
    }, 1400);

    return () => {
      if (todayAutoSaveTimerRef.current) {
        clearTimeout(todayAutoSaveTimerRef.current);
      }
    };
  }, [
    activeTab,
    authLoading,
    todayDraftDirty,
    isAutoSavingToday,
    selectedDate,
    quickMenstrualStatus,
    quickPainLevel,
    quickMoodLevel,
    showQuickDetails,
    symptomScores,
    symptomNotes,
    pmddAnswers,
  ]);

  const activeTabClass = (isActive: boolean) =>
    `rounded-full border px-3 py-2 text-sm font-medium transition ${
      isActive ? "bg-rose-600 text-white border-rose-600" : "bg-white text-gray-700 border-gray-200 hover:bg-white"
    }`;

  const summary = prediction
    ? {
        window: `${prediction.next_period_window_start ?? "-"} ~ ${prediction.next_period_window_end ?? "-"}`,
        confidence: `${prediction.confidence_score}%`,
        quality: DATA_QUALITY_LABELS[prediction.data_quality] ?? prediction.data_quality,
      }
    : {
        window: "예측 데이터 없음",
        confidence: "-",
        quality: "-",
      };

  const selectedDaySummary = useMemo(
    () => (calendar?.day_summaries ?? []).find((row) => row.day_date === selectedDate) ?? null,
    [calendar?.day_summaries, selectedDate]
  );
  const hasServerRecord = Boolean(selectedDaySummary);
  const cycleMode = useMemo(() => {
    const policy = (calendar?.phase_policy ?? prediction?.phase_policy ?? "").toLowerCase();
    if (!policy) return "미확인";
    if (policy.includes("manual")) return "수동";
    return "자동";
  }, [calendar?.phase_policy, prediction?.phase_policy]);
  const todaySummary = useMemo(
    () => ({
      symptomScore:
        selectedDaySummary?.top_symptoms.reduce((acc, item) => acc + item.severity, 0) ??
        QUICK_SYMPTOMS.reduce((acc, key) => acc + (symptomScores[key] ?? 0), 0),
      pmddScore: selectedDaySummary?.pmdd_symptom_index ?? pmddAnswers.reduce((acc, score) => acc + score, 0),
      phase: selectedDaySummary ? PHASE_LABELS[selectedDaySummary.phase] : "-",
    }),
    [selectedDaySummary, symptomScores, pmddAnswers]
  );
  const lastSavedAt = lastSavedAtByDate[selectedDate] ?? null;
  const isTodaySaved = !isAutoSavingToday && !todayDraftDirty && !isSaveQueued && (hasServerRecord || Boolean(lastSavedAt));
  const topSaveLabel = isAutoSavingToday
    ? "저장 중..."
    : isTodaySaved
      ? "저장됨 ✓"
      : "미저장";
  const topSaveClass = isTodaySaved ? "text-green-700" : "text-amber-700";
  const todaySectionSaveLabel = topSaveLabel;
  const todaySectionSaveClass = isTodaySaved ? "text-green-700" : "text-amber-700";
  const lastSavedLabel = lastSavedAt ? new Date(lastSavedAt).toLocaleString("ko-KR") : "-";
  const visiblePmddItems = useMemo(() => {
    if (showAllPmddItems) {
      return DRSP_LITE_ITEMS;
    }

    const coreSet = new Set(PMDD_CORE_QUESTION_IDS);
    return DRSP_LITE_ITEMS.filter((item) => coreSet.has(item.id));
  }, [showAllPmddItems]);
  const hasExtraPmddItems = visiblePmddItems.length < DRSP_LITE_ITEMS.length;

  if (authLoading) return <div className="p-6 text-sm">인증 정보를 확인 중입니다...</div>;

  return (
    <div className="min-h-screen bg-gradient-to-br from-rose-50 via-amber-50 to-sky-50">
      <div className="mx-auto max-w-5xl space-y-4 p-4">
        {!isAuthenticated && (
          <section className="rounded-xl border border-amber-300 bg-amber-50 p-2 text-sm text-amber-900">
            비로그인 미리보기 모드입니다. 데이터 조회/저장은 비활성화되어 있으며, 저장하려면 로그인해주세요.
          </section>
        )}
        <section className="rounded-2xl border bg-white p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h1 className="text-2xl font-bold">월경 모듈</h1>
              <p className="text-sm text-gray-600">월경 기록을 한곳에서 빠르게 확인하고 기록하세요</p>
            </div>
            <Button variant="outline" size="sm" onClick={() => navigate("/menstrual/outputs")}>
                결과 보기
            </Button>
          </div>
          <div className="mt-3 grid gap-3 rounded-xl bg-rose-50 p-3 text-sm sm:grid-cols-3">
            <div>
                <p className="text-xs text-gray-500">예측 구간</p>
              <p className="font-semibold">{summary.window}</p>
            </div>
            <div>
                <p className="text-xs text-gray-500">예측 신뢰도</p>
              <p className="font-semibold">{summary.confidence}</p>
            </div>
            <div>
                <p className="text-xs text-gray-500">데이터 품질</p>
              <p className="font-semibold">{summary.quality}</p>
            </div>
          </div>
          {prediction && (
            <p className="mt-2 text-xs text-gray-500">{prediction.medical_disclaimer || "의학적 진단을 대체하지 않습니다."}</p>
          )}
        </section>

        <div className="sticky top-0 z-20 rounded-xl border bg-white/95 p-1 shadow-sm backdrop-blur">
          <div className="grid grid-cols-3 gap-2">
            {MENSTRUAL_TABS.map((tab) => (
              <button
                key={tab.value}
                type="button"
                className={activeTabClass(activeTab === tab.value)}
                onClick={() => setActiveTab(tab.value)}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        <section className="sticky top-12 z-10 rounded-xl border bg-white p-3">
          <p className="mb-2 text-sm font-semibold">오늘 요약 카드</p>
          <div className="grid grid-cols-1 gap-2 text-sm sm:grid-cols-5">
            <div>
              <p className="text-xs text-gray-500">날짜</p>
              <p className="font-semibold">{selectedDate}</p>
            </div>
            <div>
              <p className="text-xs text-gray-500">주기 단계(자동/수동)</p>
              <p className="font-semibold">{todaySummary.phase} ({cycleMode})</p>
            </div>
            <div>
              <p className="text-xs text-gray-500">오늘 점수(증상/PMDD)</p>
              <p className="font-semibold">
                {todaySummary.symptomScore} / {todaySummary.pmddScore}
              </p>
            </div>
            <div>
              <p className="text-xs text-gray-500">마지막 저장 시간</p>
              <p className="font-semibold">{lastSavedLabel}</p>
            </div>
              <div>
                <p className="text-xs text-gray-500">저장 상태</p>
                <p className={`font-semibold ${topSaveClass}`}>{topSaveLabel}</p>
              </div>
            </div>
          </section>

        {error && <section className="rounded border border-red-300 bg-red-50 p-2 text-sm">{error}</section>}

        <section className="space-y-2 rounded-2xl border bg-white p-4">
          {activeTab === "today" && (
            <div className="space-y-3">
              <div className="space-y-2 rounded-xl border bg-white p-3">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-semibold">빠른 기록</p>
                  <p className={`text-xs font-medium ${todaySectionSaveClass}`}>{todaySectionSaveLabel}</p>
                </div>
                <div className="grid grid-cols-1 gap-2 md:grid-cols-4">
                  <label className="space-y-1 text-xs">
                    <p className="font-medium">오늘 날짜</p>
                    <input
                      type="date"
                      className="w-full rounded border px-2 py-1 text-sm"
                      value={selectedDate}
                      onChange={(e) => {
                        setSelectedDate(e.target.value);
                        markTodayDraftDirty();
                      }}
                    />
                  </label>
                  <label className="space-y-1 text-xs">
                    <p className="font-medium">생리 상태</p>
                    <select
                      className="w-full rounded border px-2 py-1 text-sm"
                      value={quickMenstrualStatus}
                      onChange={(e) => {
                        setQuickMenstrualStatus(e.target.value as QuickMenstrualStatus);
                        markTodayDraftDirty();
                      }}
                    >
                      {Object.entries(QUICK_MENSTRUAL_STATUS_LABELS).map(([value, label]) => (
                        <option key={value} value={value}>
                          {label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="space-y-1 text-xs">
                    <p className="font-medium">통증(0~10)</p>
                    <div className="flex items-center gap-2">
                      <input
                        type="range"
                        min={0}
                        max={10}
                        step={1}
                        className="h-2 w-full accent-rose-500"
                        value={quickPainLevel}
                        onChange={(e) => {
                          setQuickPainLevel(Number(e.target.value || 0));
                          markTodayDraftDirty();
                        }}
                      />
                      <span className="w-8 text-center text-sm font-semibold">{quickPainLevel}</span>
                    </div>
                  </label>
                  <label className="space-y-1 text-xs">
                    <p className="font-medium">기분(0~10)</p>
                    <div className="flex items-center gap-2">
                      <input
                        type="range"
                        min={0}
                        max={10}
                        step={1}
                        className="h-2 w-full accent-rose-500"
                        value={quickMoodLevel}
                        onChange={(e) => {
                          setQuickMoodLevel(Number(e.target.value || 0));
                          markTodayDraftDirty();
                        }}
                      />
                      <span className="w-8 text-center text-sm font-semibold">{quickMoodLevel}</span>
                    </div>
                  </label>
                </div>
                <div className="flex items-start justify-between gap-3">
                  <button
                    type="button"
                    className="rounded border border-rose-200 bg-rose-50 px-2 py-1 text-xs font-medium text-rose-700"
                    onClick={() => setShowQuickDetails((prev) => !prev)}
                  >
                    {showQuickDetails ? "접기" : "추가로 기록하기"}
                  </button>
                </div>
                {showQuickDetails && (
                  <div className="grid grid-cols-1 gap-3 pt-2 md:grid-cols-2">
                    <div className="space-y-1">
                      <div className="mb-1 flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <p className="text-xs font-semibold">증상 체크리스트</p>
                          <button
                            type="button"
                            className="rounded border border-rose-200 bg-rose-50 px-2 py-0.5 text-xs font-medium text-rose-700"
                            onClick={() => {
                              setSymptomScores(
                                QUICK_SYMPTOMS.reduce(
                                  (acc, key) => ({ ...acc, [key]: 0 }),
                                  {} as Record<QuickSymptom, number>,
                                ),
                              );
                              markTodayDraftDirty();
                            }}
                          >
                            증상 없음
                          </button>
                        </div>
                      </div>
                      <div className="mb-1 grid grid-cols-5 gap-1 text-[10px] text-gray-500">
                        {SEVERITY_SEGMENTS.map((segment) => (
                          <div key={segment.value} className="text-center">
                            {segment.value} {segment.label}
                          </div>
                        ))}
                      </div>
                      {QUICK_SYMPTOMS.map((symptom) => (
                        <div key={symptom} className="flex items-center justify-between gap-2">
                          <span className="text-xs">{SYMPTOM_LABELS[symptom]}</span>
                          <div className="grid grid-cols-5 gap-1">
                            {SEVERITY_SEGMENTS.map((segment) => (
                              <button
                                type="button"
                                key={segment.value}
                                className={`rounded border px-1 py-1 text-[10px] ${
                                  (symptomScores[symptom] ?? 0) === segment.value
                                    ? "border-rose-500 bg-rose-100 text-rose-700"
                                    : "border-gray-200 bg-white text-gray-600 hover:border-rose-300"
                                }`}
                                onClick={() => {
                                  setSymptomScores((prev) => {
                                    markTodayDraftDirty();
                                    return { ...prev, [symptom]: segment.value };
                                  });
                                }}
                              >
                                {segment.value}
                              </button>
                            ))}
                          </div>
                        </div>
                      ))}
                      <textarea
                        className="w-full rounded border px-2 py-1 text-sm"
                        rows={2}
                        placeholder="증상 메모"
                        value={symptomNotes}
                        onChange={(e) => {
                          setSymptomNotes(e.target.value);
                          markTodayDraftDirty();
                        }}
                      />
                    </div>

                    <div className="space-y-1">
                      <div className="mb-1 flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <p className="text-xs font-semibold">PMDD-lite</p>
                          <button
                            type="button"
                            className="rounded border border-rose-200 bg-rose-50 px-2 py-0.5 text-xs font-medium text-rose-700"
                            onClick={() => setShowAllPmddItems((prev) => !prev)}
                          >
                            {showAllPmddItems ? "접기" : "더 보기"}
                          </button>
                        </div>
                      </div>
                      <div className="mb-1 grid grid-cols-5 gap-1 text-[10px] text-gray-500">
                        {SEVERITY_SEGMENTS.map((segment) => (
                          <div key={segment.value} className="text-center">
                            {segment.value} {segment.label}
                          </div>
                        ))}
                      </div>
                      {visiblePmddItems.map((item) => (
                        <div key={item.id} className="flex items-center justify-between gap-2">
                          <span className="text-xs">{item.label}</span>
                          <div className="grid grid-cols-5 gap-1">
                            {SEVERITY_SEGMENTS.map((segment) => {
                              const sourceIndex = DRSP_LITE_ITEMS.findIndex((source) => source.id === item.id);
                              return (
                                <button
                                  type="button"
                                  key={segment.value}
                                  className={`rounded border px-1 py-1 text-[10px] ${
                                    pmddAnswers[sourceIndex] === segment.value
                                      ? "border-rose-500 bg-rose-100 text-rose-700"
                                      : "border-gray-200 bg-white text-gray-600 hover:border-rose-300"
                                  }`}
                                  onClick={() => {
                                    const next = [...pmddAnswers];
                                    next[sourceIndex] = segment.value;
                                    markTodayDraftDirty();
                                    setPmddAnswers(next);
                                  }}
                                >
                                  {segment.value}
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      ))}
                      {!hasExtraPmddItems && (
                        <p className="text-[10px] text-gray-500">
                          {showAllPmddItems ? "현재 전체 항목 표시 중입니다." : "핵심 6개 항목만 표시 중입니다."}
                        </p>
                      )}
                      {pmddSummary && <p className="text-xs">PMDD-lite 요약: {pmddSummary}</p>}
                    </div>
                  </div>
                )}
              </div>
              <div className="pt-1">
                <Button onClick={() => void onSaveToday()} disabled={!canPersistData}>
                  오늘 기록 저장
                </Button>
              </div>
            </div>
          )}

          {activeTab === "context" && (
            <div className="space-y-3">
              <div className="grid grid-cols-1 gap-2 md:grid-cols-3">
                <div className="space-y-2 rounded-xl border bg-white p-3">
                  <p className="text-xs font-semibold">트리거</p>
                  <div className="flex flex-wrap gap-1">
                    {TRIGGER_TAGS.map((tag) => (
                      <button
                        key={tag}
                        type="button"
                        className={`rounded border px-2 py-1 text-xs ${
                          triggerTags.includes(tag) ? "border-rose-300 bg-rose-100" : "bg-white"
                        }`}
                        onClick={() =>
                          setTriggerTags((prev) =>
                            prev.includes(tag) ? prev.filter((it) => it !== tag) : [...prev, tag],
                          )
                        }
                      >
                        {TRIGGER_LABELS[tag]}
                      </button>
                    ))}
                  </div>
                  <div className="space-y-1">
                    <p className="text-xs text-gray-500">강도(0~10)</p>
                    <input
                      type="range"
                      min={0}
                      max={10}
                      step={1}
                      className="h-2 w-full accent-rose-500"
                      value={triggerStress}
                      onChange={(e) => setTriggerStress(Number(e.target.value || 0))}
                    />
                    <p className="text-xs text-gray-500">{triggerStress}</p>
                  </div>
                  <textarea
                    className="w-full rounded border px-2 py-1 text-sm"
                    rows={2}
                    placeholder="메모 (선택)"
                    value={triggerNote}
                    onChange={(e) => setTriggerNote(e.target.value)}
                  />
                    <div className="space-y-1">
                    <div className="flex items-center justify-between">
                      <p className="text-xs font-semibold">오늘 추가한 트리거</p>
                      <p className="text-xs text-gray-500">{todaysTriggerHistory.length}개</p>
                    </div>
                    {todaysTriggerHistory.length === 0 ? (
                      <p className="text-xs text-gray-400">아직 추가되지 않았습니다.</p>
                    ) : (
                      <div className="space-y-1">
                        {todaysTriggerHistory.map((entry) => (
                          <div key={entry.id} className="space-y-1 rounded border bg-gray-50 p-2">
                            <div className="flex flex-wrap gap-1">
                              {entry.tags.map((tag) => (
                                <span
                                  key={`${entry.id}-${tag}`}
                                  className="rounded-full bg-rose-50 px-2 py-0.5 text-[11px] text-rose-700"
                                >
                                  {TRIGGER_LABELS[tag]}
                                </span>
                              ))}
                            </div>
                            <p className="text-xs text-gray-600">강도: {entry.stress_level} / 10</p>
                            {entry.note ? <p className="text-xs text-gray-600">{entry.note}</p> : null}
                            <div className="flex gap-1">
                              <button
                                type="button"
                                className="rounded border px-2 py-1 text-[11px]"
                                onClick={() => startEditTrigger(entry)}
                              >
                                수정
                              </button>
                              <button
                                type="button"
                                className="rounded border px-2 py-1 text-[11px] text-red-700"
                                onClick={() => deleteTrigger(entry.id)}
                              >
                                삭제
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                <div className="space-y-2 rounded-xl border bg-white p-3">
                  <p className="text-xs font-semibold">약 복용 기록</p>
                  <div className="space-y-1">
                    <p className="text-xs text-gray-500">약 이름 (자동완성)</p>
                    <input
                      className="w-full rounded border px-2 py-1 text-sm"
                      placeholder="예: 이부프로펜"
                      list="menstrual-med-suggestions"
                      value={medName}
                      onChange={(e) => setMedName(e.target.value)}
                    />
                    <datalist id="menstrual-med-suggestions">
                      {MED_NAME_SUGGESTIONS.map((name) => (
                        <option key={name} value={name} />
                      ))}
                    </datalist>
                  </div>
                  <input
                    className="w-full rounded border px-2 py-1 text-sm"
                    placeholder="용량 (선택)"
                    value={medDose}
                    onChange={(e) => setMedDose(e.target.value)}
                  />
                  <label className="space-y-1 text-xs">
                    <p className="text-xs text-gray-500">효과</p>
                    <select
                      className="w-full rounded border px-2 py-1 text-sm"
                      value={medEffect}
                      onChange={(e) => setMedEffect(e.target.value as MedEffect)}
                    >
                      {Object.entries(MED_EFFECT_LABELS).map(([value, label]) => (
                        <option key={value} value={value}>
                          {label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="space-y-1 text-xs">
                    <p className="text-xs text-gray-500">약 종류</p>
                    <select
                      className="w-full rounded border px-2 py-1 text-sm"
                      value={medType}
                      onChange={(e) => setMedType(e.target.value as MedType)}
                    >
                      {Object.entries(MED_TYPE_LABELS).map(([value, label]) => (
                        <option key={value} value={value}>
                          {label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <div className="space-y-1">
                    <div className="flex items-center justify-between">
                      <p className="text-xs font-semibold">오늘 추가한 약</p>
                      <p className="text-xs text-gray-500">{todaysMedHistory.length}개</p>
                    </div>
                    {todaysMedHistory.length === 0 ? (
                      <p className="text-xs text-gray-400">아직 추가되지 않았습니다.</p>
                    ) : (
                      <div className="space-y-1">
                        {todaysMedHistory.map((entry) => (
                          <div key={entry.id} className="space-y-1 rounded border bg-gray-50 p-2">
                            <p className="text-xs font-semibold">
                              {entry.med_name}
                              {entry.dose ? ` / ${entry.dose}` : ""}
                            </p>
                            <p className="text-xs text-gray-600">
                              {MED_TYPE_LABELS[entry.type]} · {MED_EFFECT_LABELS[entry.effect]}
                            </p>
                            <div className="flex gap-1">
                              <button
                                type="button"
                                className="rounded border px-2 py-1 text-[11px]"
                                onClick={() => startEditMed(entry)}
                              >
                                수정
                              </button>
                              <button
                                type="button"
                                className="rounded border px-2 py-1 text-[11px] text-red-700"
                                onClick={() => deleteMed(entry.id)}
                              >
                                삭제
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                <div className="space-y-2 rounded-xl border bg-white p-3">
                  <p className="text-xs font-semibold">상담/기록 메모 (선택)</p>
                  <input
                    className="w-full rounded border px-2 py-1 text-sm"
                    placeholder={JOURNAL_SUMMARY_PLACEHOLDER}
                    value={journalSummary}
                    onChange={(e) => setJournalSummary(e.target.value)}
                  />
                  <textarea
                    className="w-full rounded border px-2 py-1 text-sm"
                    rows={2}
                    placeholder={JOURNAL_MEMO_PLACEHOLDER}
                    value={journalMemo}
                    onChange={(e) => setJournalMemo(e.target.value)}
                  />
                  <div className="space-y-1">
                    <div className="flex items-center justify-between">
                      <p className="text-xs font-semibold">오늘 상담/기록 메모</p>
                      <p className="text-xs text-gray-500">{journalEntries.length}개</p>
                    </div>
                    {journalEntries.length === 0 ? (
                      <p className="text-xs text-gray-400">아직 추가되지 않았습니다.</p>
                    ) : (
                      <div className="space-y-1">
                        {journalEntries.map((entry) => {
                          const lines = getJournalDisplayLines(entry);
                          return (
                            <div key={entry.event_id} className="space-y-1 rounded border bg-gray-50 p-2">
                              <p className="text-[11px] text-gray-500">
                                {new Date(entry.datetime).toLocaleTimeString("ko-KR", {
                                  hour: "2-digit",
                                  minute: "2-digit",
                                })}
                              </p>
                              <p className="text-xs font-semibold">요약: {lines.summary}</p>
                              <p className="text-xs text-gray-600 whitespace-pre-line">{lines.memo}</p>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>
                </div>
                <div className="pt-1">
                  <Button onClick={() => void onSaveContext()} disabled={isContextSaveDisabled}>
                    {contextSaveLabel}
                  </Button>
                </div>
              </div>
            )}

          {activeTab === "insight" && (
            <div className="space-y-3">
              {settings && (
                <div className="rounded-xl border bg-gray-50 p-3 text-sm">
                  <label className="flex items-center gap-2">
                    <input type="checkbox" checked={settings.on_device_only} onChange={() => void onToggleOnDevice()} />
                    온디바이스 전용 설정 ({settings.on_device_only ? "ON" : "OFF"})
                  </label>
                  <p className="mt-1 text-xs text-gray-500">{settings.privacy_notice}</p>
                </div>
              )}

              <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                <input
                  type="date"
                  className="rounded border px-2 py-1 text-sm"
                  value={exportFrom}
                  onChange={(e) => setExportFrom(e.target.value)}
                />
                <input
                  type="date"
                  className="rounded border px-2 py-1 text-sm"
                  value={exportTo}
                  onChange={(e) => setExportTo(e.target.value)}
                />
                    <Button onClick={onExport} disabled={!canPersistData}>
                      내보내기
                    </Button>
                  </div>

              {exportJob && (
                <div className="text-sm">
                  <p>작업 ID: {exportJob.job_id}</p>
                  <p>상태: {exportStatus?.status ?? exportJob.status}</p>
                  {exportStatus?.status === "completed" && (
                    <div className="mt-2 flex gap-2">
                      <a
                        className="rounded border px-2 py-1 text-sm"
                        href={getMenstrualExportDownloadUrl(exportJob.job_id, "csv")}
                      >
                        CSV 내려받기
                      </a>
                      <a
                        className="rounded border px-2 py-1 text-sm"
                        href={getMenstrualExportDownloadUrl(exportJob.job_id, "pdf")}
                      >
                        PDF 내려받기
                      </a>
                    </div>
                  )}
                </div>
              )}

              <section className="rounded-xl border bg-gray-50 p-3 space-y-2">
                <p className="text-xs text-gray-600">
                  조회 기간: {calendarFrom} ~ {calendarTo}
                </p>
                <p className="text-xs text-gray-600">
                  패턴: {insights?.recent_two_week_pattern ?? "분석할 데이터가 충분하지 않습니다."}
                </p>
                <div className="max-h-48 overflow-auto rounded border">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-gray-100">
                        <th className="p-2 text-left">날짜</th>
                        <th className="p-2 text-left">출혈</th>
                        <th className="p-2 text-left">주기</th>
                        <th className="p-2 text-left">PMDD</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(calendar?.day_summaries ?? []).map((row) => (
                        <tr key={row.day_date} className="border-t">
                          <td className="p-2">{row.day_date}</td>
                          <td className="p-2">{BLEEDING_STATUS_LABELS[row.bleeding_status] ?? row.bleeding_status}</td>
                          <td className="p-2">{PHASE_LABELS[row.phase] ?? row.phase}</td>
                          <td className="p-2">{row.pmdd_symptom_index ?? "-"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            </div>
          )}

          <div className="flex items-center gap-2 border-t pt-3">
            <span className="text-xs text-gray-600">조회 날짜</span>
            <input
              type="date"
              className="rounded border px-2 py-1 text-sm"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
            />
          </div>
        </section>
      </div>

      {loading && <div className="fixed bottom-2 right-2 rounded border bg-white px-2 py-1 text-xs">저장 중...</div>}
    </div>
  );
}


