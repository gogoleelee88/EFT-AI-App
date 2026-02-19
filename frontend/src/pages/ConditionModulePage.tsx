import React, { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import Card from "../components/ui/Card";
import "./condition-pages.css";

type MetricKey =
  | "fatigue"
  | "pain"
  | "sleep"
  | "meal"
  | "emotion"
  | "menstrual"
  | "behavior"
  | "planning";

type SliderField = {
  id: string;
  label: string;
  min: number;
  max: number;
  step: number;
  helper: string;
  defaultValue: number;
};

type MetricConfig = {
  key: MetricKey;
  title: string;
  subtitle: string;
  accent: string;
  fields: SliderField[];
  scheduleFactors: string[];
  uiSuggestions: string[];
  deepLinks: Array<{ label: string; path: string }>;
};

const SCORE_STORAGE_KEY = "condition_metric_scores_v1";
const INPUT_STORAGE_KEY = "condition_metric_inputs_v1";

const METRIC_CONFIGS: Record<MetricKey, MetricConfig> = {
  fatigue: {
    key: "fatigue",
    title: "피로 모듈",
    subtitle: "피로가 높으면 블록 축소(shrink)와 보호시간 확보가 우선됩니다.",
    accent: "#f97316",
    fields: [
      { id: "mental_fatigue", label: "정신 피로", min: 0, max: 10, step: 1, helper: "집중 유지 난이도", defaultValue: 5 },
      { id: "physical_fatigue", label: "신체 피로", min: 0, max: 10, step: 1, helper: "몸의 무거움", defaultValue: 5 },
    ],
    scheduleFactors: [
      "condition_score: fatigue_weight 반영",
      "SLEEP_DEBT_LOAD driver와 결합",
      "mode 하향 시 shrink/protect 액션 유도",
    ],
    uiSuggestions: [
      "슬라이더 2개 + 30초 내 입력",
      "피로 7 이상은 경고 배지",
      "이전 체크인 대비 증감 표시",
    ],
    deepLinks: [{ label: "체크인 페이지 열기", path: "/checkin" }],
  },
  pain: {
    key: "pain",
    title: "통증 모듈",
    subtitle: "통증은 모드 강제 하향(override)에 직접 영향을 줍니다.",
    accent: "#ef4444",
    fields: [
      { id: "pain_now", label: "현재 통증", min: 0, max: 10, step: 1, helper: "통증 강도", defaultValue: 3 },
      { id: "pain_delta", label: "2시간 변화량", min: 0, max: 4, step: 1, helper: "이전 대비 급상승", defaultValue: 1 },
    ],
    scheduleFactors: [
      "pain >= 9 => mode 40",
      "pain >= 7 또는 pain_delta >= 2 => mode 70",
      "delay/split/protect 액션 트리거",
    ],
    uiSuggestions: [
      "현재 통증 + 변화량 분리 입력",
      "급상승 조건을 시각적 임계선으로 표시",
      "통증 고위험 시 '회복 모드' CTA 강조",
    ],
    deepLinks: [{ label: "체크인 페이지 열기", path: "/checkin" }],
  },
  sleep: {
    key: "sleep",
    title: "수면 모듈",
    subtitle: "수면 부채가 높을수록 점수 패널티와 보호 모드 가능성이 커집니다.",
    accent: "#0ea5e9",
    fields: [
      { id: "sleep_debt", label: "수면 부채", min: 0, max: 10, step: 1, helper: "잠 부족 체감", defaultValue: 4 },
      { id: "sleep_quality", label: "수면 질 저하", min: 0, max: 10, step: 1, helper: "깊은 잠 부족", defaultValue: 3 },
    ],
    scheduleFactors: [
      "sleep_penalty band( LT5~GT8 )",
      "SLEEP_DEBT_LOAD driver 스코어 산출",
      "고부채 시 집중 블록 축소 우선",
    ],
    uiSuggestions: [
      "수면시간 band 선택 + 질 슬라이더",
      "권장 취침시간 가이드 칩",
      "아침/점심 체크인 분리 탭",
    ],
    deepLinks: [{ label: "체크인 페이지 열기", path: "/checkin" }],
  },
  meal: {
    key: "meal",
    title: "식사 모듈",
    subtitle: "식후 저하(post-meal dip)는 당일 집중 슬롯 재배치 근거가 됩니다.",
    accent: "#84cc16",
    fields: [
      { id: "post_meal_dip", label: "식후 저하", min: 0, max: 4, step: 1, helper: "식후 에너지 하락", defaultValue: 2 },
      { id: "focus_drop", label: "집중력 저하", min: 0, max: 4, step: 1, helper: "식후 집중 저하", defaultValue: 2 },
    ],
    scheduleFactors: [
      "POST_MEAL_DIP driver 생성",
      "meal coach sync로 양방향 업데이트",
      "식후 저하 높을 때 저에너지 태스크 우선 배치",
    ],
    uiSuggestions: [
      "T30/T90 체크 슬롯 분리",
      "식후 저하 그래프(오늘/주간)",
      "카페인 사용 체크 토글",
    ],
    deepLinks: [{ label: "식사 코치 열기", path: "/meal-coach" }],
  },
  emotion: {
    key: "emotion",
    title: "감정 모듈",
    subtitle: "감정/스트레스는 STRESS_LOAD와 mode 결정에 함께 반영됩니다.",
    accent: "#14b8a6",
    fields: [
      { id: "mood_load", label: "감정 부담", min: 0, max: 10, step: 1, helper: "불안/저하 체감", defaultValue: 5 },
      { id: "stress_inferred", label: "추정 스트레스", min: 0, max: 4, step: 1, helper: "행동 기반 스트레스", defaultValue: 2 },
    ],
    scheduleFactors: [
      "mood_penalty(calm~irritated)",
      "STRESS_LOAD driver 계산",
      "high stress 시 mode 하향 및 완충 블록 필요",
    ],
    uiSuggestions: [
      "감정 단어 선택 + 강도 슬라이더",
      "최근 7일 감정 분포 미니 차트",
      "감정-통증 상관 라벨",
    ],
    deepLinks: [
      { label: "감정 세션 기록 보기", path: "/emotion-sessions" },
      { label: "EFT 입력 시작", path: "/eft-strict" },
    ],
  },
  menstrual: {
    key: "menstrual",
    title: "생리 모듈",
    subtitle: "생리 증상 로드는 요약 confidence와 patch 제안에도 영향을 줍니다.",
    accent: "#e11d48",
    fields: [
      { id: "cramps", label: "경련/통증", min: 0, max: 4, step: 1, helper: "cramps_0_4", defaultValue: 1 },
      { id: "irritability", label: "과민/예민", min: 0, max: 4, step: 1, helper: "irritability_0_4", defaultValue: 1 },
      { id: "bleeding", label: "출혈 강도", min: 0, max: 2, step: 1, helper: "bleeding_level_0_2", defaultValue: 0 },
    ],
    scheduleFactors: [
      "MENSTRUAL_SYMPTOM_LOAD driver",
      "quality gate + confidence cap",
      "고증상 반복 시 medical notice",
    ],
    uiSuggestions: [
      "quick check 4칸 + 메모 60자",
      "주기 예측 윈도우 배지",
      "생리 데이터 품질(low/med) 표시",
    ],
    deepLinks: [{ label: "생리 모듈 열기", path: "/menstrual" }],
  },
  behavior: {
    key: "behavior",
    title: "행동추론 모듈",
    subtitle: "입력 지연/앱 전환 과다는 condition_score 추가 패널티로 들어갑니다.",
    accent: "#8b5cf6",
    fields: [
      { id: "input_latency_sec", label: "입력 지연(초)", min: 0, max: 300, step: 10, helper: "threshold 120s", defaultValue: 90 },
      { id: "app_switch_30m", label: "앱 전환(30분)", min: 0, max: 30, step: 1, helper: "threshold 15", defaultValue: 8 },
    ],
    scheduleFactors: [
      "behavior_inference inferred flag 확인",
      "input_latency penalty",
      "app_switch penalty",
    ],
    uiSuggestions: [
      "자동수집 값 + 수동수정 분리",
      "threshold 넘어가면 즉시 경고",
      "today trend sparkline 배치",
    ],
    deepLinks: [{ label: "체크인 페이지 열기", path: "/checkin" }],
  },
  planning: {
    key: "planning",
    title: "일정부하 모듈",
    subtitle: "우선순위/에너지비용/집중도 메타가 순서 재배치 기준이 됩니다.",
    accent: "#475569",
    fields: [
      { id: "energy_cost_pressure", label: "에너지 비용 압박", min: 0, max: 10, step: 1, helper: "high energy task 비중", defaultValue: 4 },
      { id: "focus_task_ratio", label: "집중 태스크 비중", min: 0, max: 10, step: 1, helper: "requires_focus 비중", defaultValue: 5 },
    ],
    scheduleFactors: [
      "drop: low priority + high energy",
      "delay/swap: energy_cost 기반 재정렬",
      "smart suggest: priority/requires_focus 반영",
    ],
    uiSuggestions: [
      "태스크 카드에 priority/energy 배지",
      "딥워크(90+) 자동 split 토글",
      "buffer block 제안칩 제공",
    ],
    deepLinks: [{ label: "일정 페이지 열기", path: "/plan/day" }],
  },
};

function loadInputStorage(): Record<string, Record<string, number>> {
  if (typeof window === "undefined") return {};
  try {
    const raw = localStorage.getItem(INPUT_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, Record<string, number>>;
    if (!parsed || typeof parsed !== "object") return {};
    return parsed;
  } catch {
    return {};
  }
}

function loadScoreStorage(): Partial<Record<MetricKey, number>> {
  if (typeof window === "undefined") return {};
  try {
    const raw = localStorage.getItem(SCORE_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Partial<Record<MetricKey, number>>;
    if (!parsed || typeof parsed !== "object") return {};
    return parsed;
  } catch {
    return {};
  }
}

function saveInputStorage(next: Record<string, Record<string, number>>) {
  if (typeof window === "undefined") return;
  localStorage.setItem(INPUT_STORAGE_KEY, JSON.stringify(next));
}

function saveScoreStorage(next: Partial<Record<MetricKey, number>>) {
  if (typeof window === "undefined") return;
  localStorage.setItem(SCORE_STORAGE_KEY, JSON.stringify(next));
}

function scoreToLabel(score: number): string {
  if (score >= 75) return "높음";
  if (score >= 45) return "중간";
  return "낮음";
}

const ConditionModulePage: React.FC = () => {
  const navigate = useNavigate();
  const { metricKey } = useParams<{ metricKey: MetricKey }>();
  const config = metricKey ? METRIC_CONFIGS[metricKey] : undefined;

  const [values, setValues] = useState<Record<string, number>>({});
  const [savedToast, setSavedToast] = useState(false);

  useEffect(() => {
    if (!config) return;
    const stored = loadInputStorage();
    const prevValues = stored[config.key] || {};
    const seed: Record<string, number> = {};
    config.fields.forEach((field) => {
      const candidate = Number(prevValues[field.id]);
      if (!Number.isNaN(candidate)) {
        seed[field.id] = candidate;
      } else {
        seed[field.id] = field.defaultValue;
      }
    });
    setValues(seed);
  }, [config]);

  useEffect(() => {
    if (!savedToast) return;
    const timer = window.setTimeout(() => setSavedToast(false), 1600);
    return () => window.clearTimeout(timer);
  }, [savedToast]);

  const moduleScore = useMemo(() => {
    if (!config || config.fields.length === 0) return 0;
    const total = config.fields.reduce((acc, field) => {
      const raw = Number(values[field.id]);
      const safe = Number.isNaN(raw) ? field.defaultValue : raw;
      const ratio = (safe - field.min) / Math.max(1, field.max - field.min);
      return acc + Math.max(0, Math.min(1, ratio));
    }, 0);
    return Math.round((total / config.fields.length) * 100);
  }, [config, values]);

  const saveModule = (goBack: boolean) => {
    if (!config) return;
    const inputStore = loadInputStorage();
    inputStore[config.key] = values;
    saveInputStorage(inputStore);

    const scoreStore = loadScoreStorage();
    scoreStore[config.key] = moduleScore;
    saveScoreStorage(scoreStore);

    setSavedToast(true);
    if (goBack) {
      navigate("/condition");
    }
  };

  if (!config) {
    return (
      <div className="condition-module-shell flex items-center justify-center p-6">
        <Card className="max-w-lg p-6 text-center">
          <h1 className="text-lg font-semibold text-slate-900">모듈을 찾지 못했습니다.</h1>
          <p className="mt-2 text-sm text-slate-600">컨디션 허브에서 모듈을 다시 선택해 주세요.</p>
          <button type="button" className="condition-cta-btn mt-4" onClick={() => navigate("/condition")}>
            컨디션 허브로 돌아가기
          </button>
        </Card>
      </div>
    );
  }

  return (
    <div className="condition-module-shell">
      <div className="mx-auto max-w-5xl px-4 py-6 md:px-6">
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <button type="button" className="condition-cta-btn" onClick={() => navigate("/condition")}>
            ← 허브로
          </button>
          <button type="button" className="condition-cta-btn" onClick={() => navigate("/checkin")}>
            체크인 페이지
          </button>
        </div>

        <Card className="mb-4 p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h1 className="condition-title text-2xl font-semibold text-slate-900">{config.title}</h1>
              <p className="mt-1 text-sm text-slate-600">{config.subtitle}</p>
            </div>
            <div
              className="rounded-xl border px-3 py-2 text-right"
              style={{
                borderColor: `${config.accent}55`,
                backgroundColor: `${config.accent}18`,
              }}
            >
              <div className="text-xs text-slate-600">모듈 부하</div>
              <div className="text-xl font-semibold text-slate-900">{moduleScore}</div>
              <div className="text-xs text-slate-600">{scoreToLabel(moduleScore)}</div>
            </div>
          </div>
        </Card>

        <div className="grid gap-4 lg:grid-cols-[1.25fr_1fr]">
          <Card className="p-4 md:p-5">
            <h2 className="mb-3 text-sm font-semibold text-slate-900">측정 요소</h2>
            <div className="space-y-3">
              {config.fields.map((field) => {
                const value = Number(values[field.id] ?? field.defaultValue);
                const pct = ((value - field.min) / Math.max(1, field.max - field.min)) * 100;
                return (
                  <div key={field.id} className="condition-slider-card px-3 py-3">
                    <div className="flex items-center justify-between">
                      <label className="text-sm font-medium text-slate-800">{field.label}</label>
                      <span className="text-sm font-semibold text-slate-900">{value}</span>
                    </div>
                    <input
                      className="mt-2 w-full"
                      type="range"
                      min={field.min}
                      max={field.max}
                      step={field.step}
                      value={value}
                      style={{ accentColor: config.accent }}
                      onChange={(event) =>
                        setValues((prev) => ({
                          ...prev,
                          [field.id]: Number(event.target.value),
                        }))
                      }
                    />
                    <div className="mt-1 flex items-center justify-between text-[11px] text-slate-500">
                      <span>{field.min}</span>
                      <span>{field.helper}</span>
                      <span>{field.max}</span>
                    </div>
                    <div className="mt-2 h-1.5 rounded-full bg-slate-100">
                      <div
                        className="h-1.5 rounded-full"
                        style={{
                          width: `${Math.max(0, Math.min(100, pct))}%`,
                          backgroundColor: config.accent,
                        }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
              <button type="button" className="condition-cta-btn condition-cta-primary" onClick={() => saveModule(true)}>
                저장 후 허브 반영
              </button>
              <button type="button" className="condition-cta-btn" onClick={() => saveModule(false)}>
                이 페이지만 저장
              </button>
            </div>
            {savedToast && <div className="mt-2 text-xs font-medium text-emerald-700">저장 완료: 허브 점수에 반영되었습니다.</div>}
          </Card>

          <div className="space-y-4">
            <Card className="p-4">
              <h2 className="text-sm font-semibold text-slate-900">스케줄 반영 매핑</h2>
              <div className="mt-2 space-y-2 text-sm text-slate-700">
                {config.scheduleFactors.map((factor) => (
                  <div key={factor}>{factor}</div>
                ))}
              </div>
            </Card>

            <Card className="p-4">
              <h2 className="text-sm font-semibold text-slate-900">UI 제안</h2>
              <div className="mt-2 space-y-2 text-sm text-slate-700">
                {config.uiSuggestions.map((suggestion) => (
                  <div key={suggestion}>{suggestion}</div>
                ))}
              </div>
            </Card>

            <Card className="p-4">
              <h2 className="text-sm font-semibold text-slate-900">연결 모듈</h2>
              <div className="mt-2 space-y-2">
                {config.deepLinks.map((link) => (
                  <button
                    key={link.path}
                    type="button"
                    className="condition-cta-btn w-full text-left"
                    onClick={() => navigate(link.path)}
                  >
                    {link.label}
                  </button>
                ))}
              </div>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ConditionModulePage;

