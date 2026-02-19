import React, { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import Card from "../components/ui/Card";
import { Button } from "../components/ui/Button";
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

type MetricNode = {
  key: MetricKey;
  label: string;
  route: string;
  color: string;
  fallback: number;
  hint: string;
};

const SCORE_STORAGE_KEY = "condition_metric_scores_v1";

const METRIC_NODES: MetricNode[] = [
  {
    key: "sleep",
    label: "수면",
    route: "/condition/module/sleep",
    color: "#0ea5e9",
    fallback: 38,
    hint: "수면 부채와 질",
  },
  {
    key: "fatigue",
    label: "피로",
    route: "/condition/module/fatigue",
    color: "#f97316",
    fallback: 52,
    hint: "정신/신체 피로도",
  },
  {
    key: "pain",
    label: "통증",
    route: "/condition/module/pain",
    color: "#ef4444",
    fallback: 35,
    hint: "현재 통증과 변화량",
  },
  {
    key: "meal",
    label: "식사",
    route: "/condition/module/meal",
    color: "#84cc16",
    fallback: 45,
    hint: "식후 에너지 저하",
  },
  {
    key: "emotion",
    label: "감정",
    route: "/condition/module/emotion",
    color: "#14b8a6",
    fallback: 47,
    hint: "기분/스트레스 입력",
  },
  {
    key: "menstrual",
    label: "생리",
    route: "/condition/module/menstrual",
    color: "#e11d48",
    fallback: 33,
    hint: "생리 증상 로드",
  },
  {
    key: "behavior",
    label: "행동",
    route: "/condition/module/behavior",
    color: "#8b5cf6",
    fallback: 42,
    hint: "입력 지연/앱 전환",
  },
  {
    key: "planning",
    label: "일정부하",
    route: "/condition/module/planning",
    color: "#475569",
    fallback: 40,
    hint: "우선순위/에너지비용",
  },
];

function clampScore(value: unknown, fallback: number): number {
  const num = Number(value);
  if (Number.isNaN(num)) return fallback;
  return Math.max(0, Math.min(100, Math.round(num)));
}

function loadScores(): Partial<Record<MetricKey, number>> {
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

function polarPoint(
  index: number,
  total: number,
  center: number,
  radius: number
): [number, number] {
  const angle = -Math.PI / 2 + (index * Math.PI * 2) / total;
  return [center + Math.cos(angle) * radius, center + Math.sin(angle) * radius];
}

const ConditionHubPage: React.FC = () => {
  const navigate = useNavigate();

  const metrics = useMemo(() => {
    const saved = loadScores();
    return METRIC_NODES.map((node) => ({
      ...node,
      value: clampScore(saved[node.key], node.fallback),
    }));
  }, []);

  const viewSize = 420;
  const center = viewSize / 2;
  const maxRadius = 152;
  const rings = [0.25, 0.5, 0.75, 1];

  const loadPoints = metrics
    .map((metric, index) => {
      const [x, y] = polarPoint(index, metrics.length, center, (maxRadius * metric.value) / 100);
      return `${x},${y}`;
    })
    .join(" ");

  const loadAverage = Math.round(
    metrics.reduce((acc, metric) => acc + metric.value, 0) / Math.max(1, metrics.length)
  );
  const estimatedScore = Math.max(0, Math.min(100, 100 - Math.round(loadAverage * 0.9)));
  const estimatedMode = estimatedScore >= 70 ? 100 : estimatedScore >= 40 ? 70 : 40;

  const topLoads = [...metrics].sort((a, b) => b.value - a.value).slice(0, 3);

  const modeLabel =
    estimatedMode === 100 ? "집중 모드" : estimatedMode === 70 ? "보호 모드" : "회복 모드";

  return (
    <div className="condition-page-shell">
      <div className="mx-auto max-w-6xl px-4 py-6 md:px-6">
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="condition-title text-3xl font-semibold text-slate-900">Condition Hub</h1>
            <p className="condition-subtitle mt-1 text-sm text-slate-600">
              모서리를 눌러 각 모듈 페이지로 이동하고, 일정 반영에 쓰이는 값을 업데이트하세요.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => navigate("/checkin")}>
              체크인 리밸런스
            </Button>
            <Button onClick={() => navigate("/plan/day")}>오늘 일정 보기</Button>
          </div>
        </div>

        <div className="grid gap-4 lg:grid-cols-[1.25fr_1fr]">
          <Card className="condition-radar-wrap p-4 md:p-5">
            <div className="grid gap-4 xl:grid-cols-[1fr_220px]">
              <div>
                <svg
                  viewBox={`0 0 ${viewSize} ${viewSize}`}
                  className="h-auto w-full max-h-[560px]"
                  role="img"
                  aria-label="컨디션 다각형 허브"
                >
                  <defs>
                    <linearGradient id="conditionLoadFill" x1="0%" y1="0%" x2="100%" y2="100%">
                      <stop offset="0%" stopColor="rgba(14,165,233,0.48)" />
                      <stop offset="100%" stopColor="rgba(249,115,22,0.44)" />
                    </linearGradient>
                  </defs>

                  {rings.map((ring) => {
                    const points = metrics
                      .map((_, index) => {
                        const [x, y] = polarPoint(index, metrics.length, center, maxRadius * ring);
                        return `${x},${y}`;
                      })
                      .join(" ");
                    return (
                      <polygon
                        key={ring}
                        points={points}
                        fill="none"
                        stroke="rgba(51,65,85,0.18)"
                        strokeWidth={ring === 1 ? 1.6 : 1}
                      />
                    );
                  })}

                  {metrics.map((_, index) => {
                    const [x, y] = polarPoint(index, metrics.length, center, maxRadius);
                    return (
                      <line
                        key={`axis-${index}`}
                        x1={center}
                        y1={center}
                        x2={x}
                        y2={y}
                        stroke="rgba(51,65,85,0.14)"
                        strokeWidth={1}
                      />
                    );
                  })}

                  <polygon
                    points={loadPoints}
                    fill="url(#conditionLoadFill)"
                    stroke="rgba(15,23,42,0.55)"
                    strokeWidth={2}
                  />

                  {metrics.map((metric, index) => {
                    const [dotX, dotY] = polarPoint(
                      index,
                      metrics.length,
                      center,
                      (maxRadius * metric.value) / 100
                    );
                    const [labelX, labelY] = polarPoint(index, metrics.length, center, maxRadius + 38);
                    return (
                      <g
                        key={metric.key}
                        className="condition-radar-node"
                        onClick={() => navigate(metric.route)}
                        onKeyDown={(event) => {
                          if (event.key === "Enter" || event.key === " ") {
                            event.preventDefault();
                            navigate(metric.route);
                          }
                        }}
                        tabIndex={0}
                        role="button"
                        aria-label={`${metric.label} 모듈로 이동`}
                      >
                        <circle cx={dotX} cy={dotY} r={7} fill={metric.color} />
                        <text
                          x={labelX}
                          y={labelY}
                          textAnchor="middle"
                          dominantBaseline="middle"
                          fill="#0f172a"
                          fontSize="12"
                          fontWeight="700"
                        >
                          {metric.label}
                        </text>
                      </g>
                    );
                  })}

                  <circle cx={center} cy={center} r={53} fill="rgba(255,255,255,0.9)" stroke="#cbd5e1" />
                  <text
                    x={center}
                    y={center - 10}
                    textAnchor="middle"
                    fill="#0f172a"
                    fontSize="13"
                    fontWeight="700"
                  >
                    예상 점수
                  </text>
                  <text
                    x={center}
                    y={center + 14}
                    textAnchor="middle"
                    fill="#0f172a"
                    fontSize="22"
                    fontWeight="700"
                  >
                    {estimatedScore}
                  </text>
                </svg>
              </div>

              <div className="space-y-2">
                <div className="rounded-xl border border-slate-200 bg-white/85 p-3 text-sm">
                  <div className="text-xs text-slate-500">모드 추정</div>
                  <div className="mt-1 text-lg font-semibold text-slate-900">{modeLabel}</div>
                  <div className="mt-1 text-xs text-slate-600">mode {estimatedMode} 기준</div>
                </div>

                {metrics.map((metric) => (
                  <button
                    key={metric.key}
                    type="button"
                    className="w-full rounded-xl border border-slate-200 bg-white/90 px-3 py-2 text-left transition hover:border-slate-300 hover:bg-white"
                    onClick={() => navigate(metric.route)}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium text-slate-800">{metric.label}</span>
                      <span
                        className="condition-load-pill text-white"
                        style={{ backgroundColor: metric.color }}
                      >
                        {metric.value}
                      </span>
                    </div>
                    <div className="mt-1 text-xs text-slate-500">{metric.hint}</div>
                  </button>
                ))}
              </div>
            </div>
          </Card>

          <div className="space-y-4">
            <Card className="p-4">
              <h2 className="text-sm font-semibold text-slate-900">지금 일정에 반영되는 요소</h2>
              <div className="mt-3 space-y-2 text-sm text-slate-700">
                <div>1. 피로/통증/수면/감정/생리 상태</div>
                <div>2. 식후 저하(POST_MEAL_DIP)와 식사 시그널</div>
                <div>3. 행동추론: 입력 지연, 앱 전환 과다</div>
                <div>4. pain delta(이전 체크인 대비 통증 급상승)</div>
                <div>5. 일정 항목의 우선순위/에너지 비용</div>
                <div>6. confidence gate(낮은 신뢰도에서 이동/취소 제한)</div>
              </div>
            </Card>

            <Card className="p-4">
              <h2 className="text-sm font-semibold text-slate-900">우선 점검 추천</h2>
              <div className="mt-3 space-y-2">
                {topLoads.map((metric, idx) => (
                  <button
                    key={metric.key}
                    type="button"
                    className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-left hover:bg-slate-100"
                    onClick={() => navigate(metric.route)}
                  >
                    <div className="text-xs text-slate-500">우선순위 {idx + 1}</div>
                    <div className="mt-0.5 flex items-center justify-between">
                      <span className="text-sm font-medium text-slate-800">{metric.label}</span>
                      <span className="text-xs font-semibold text-slate-600">부하 {metric.value}</span>
                    </div>
                  </button>
                ))}
              </div>
            </Card>

            <Card className="p-4">
              <h2 className="text-sm font-semibold text-slate-900">빠른 이동</h2>
              <div className="mt-3 grid grid-cols-2 gap-2">
                <Button variant="outline" size="sm" onClick={() => navigate("/meal-coach")}>
                  식사 코치
                </Button>
                <Button variant="outline" size="sm" onClick={() => navigate("/menstrual")}>
                  생리 모듈
                </Button>
                <Button variant="outline" size="sm" onClick={() => navigate("/emotion-sessions")}>
                  감정 기록
                </Button>
                <Button variant="outline" size="sm" onClick={() => navigate("/checkin")}>
                  조건 체크인
                </Button>
              </div>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ConditionHubPage;

