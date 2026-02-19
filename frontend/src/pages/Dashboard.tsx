import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import Card from "../components/ui/Card";
import { Button } from "../components/ui/Button";
import PWAInstallPrompt from "../components/feature/PWAInstallPrompt";
import { useAuth } from "../hooks/useAuth";

type EmotionRecordPreview = {
  id: number;
  created_at: string;
  core_emotion: string;
  intensity: number;
  situation_context: string;
};

type EmotionStats = {
  total_records: number;
  emotion_distribution: Record<string, number>;
  average_intensity: number;
};

type EmotionWeeklyReport = {
  template_type: string;
  template_title: string;
  week_start: string;
  week_end: string;
  total_records: number;
  confidence: number;
  source: string;
  model: string;
  generated_at: string;
  summary_text: string;
  recommendations: string[];
  fields: Record<string, any>;
};

const Dashboard: React.FC = () => {
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuth();

  const [records, setRecords] = useState<EmotionRecordPreview[]>([]);
  const [stats, setStats] = useState<EmotionStats | null>(null);
  const [adaptiveReport, setAdaptiveReport] = useState<any | null>(null);
  const [weeklyReport, setWeeklyReport] = useState<EmotionWeeklyReport | null>(null);
  const [loadingData, setLoadingData] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    if (authLoading) return;
    if (!user?.uid) {
      setRecords([]);
      setStats(null);
      setAdaptiveReport(null);
      setWeeklyReport(null);
      setLoadingData(false);
      return;
    }

    let cancelled = false;
    setLoadingData(true);
    setLoadError(null);

    (async () => {
      try {
        const [recentRes, statsRes, adaptiveReportRes, weeklyReportRes] = await Promise.all([
          fetch("/api/emotion/recent?limit=5", { credentials: "include" }),
          fetch("/api/emotion/stats", { credentials: "include" }),
          fetch("/api/emotion/adaptive-report", { credentials: "include" }),
          fetch("/api/emotion/weekly-report", { credentials: "include" }),
        ]);

        if (!recentRes.ok || !statsRes.ok || !adaptiveReportRes.ok) {
          throw new Error(
            `dashboard load failed: ${recentRes.status}/${statsRes.status}/${adaptiveReportRes.status}`
          );
        }

        const [recentData, statsData] = await Promise.all([
          recentRes.json() as Promise<EmotionRecordPreview[]>,
          statsRes.json() as Promise<EmotionStats>,
        ]);
        const adaptiveData = (await adaptiveReportRes.json()) as any;
        let weeklyData: EmotionWeeklyReport | null = null;
        if (weeklyReportRes.ok) {
          try {
            weeklyData = (await weeklyReportRes.json()) as EmotionWeeklyReport;
          } catch (err) {
            console.warn("weekly report parse failed:", err);
          }
        } else {
          console.warn(`weekly report not available: ${weeklyReportRes.status}`);
        }

        if (!cancelled) {
          setRecords(Array.isArray(recentData) ? recentData : []);
          setStats(statsData ?? null);
          setAdaptiveReport(adaptiveData ?? null);
          setWeeklyReport(weeklyData ?? null);
        }
      } catch (error) {
        if (!cancelled) {
          console.warn("dashboard data load failed:", error);
          setLoadError("데이터를 불러오지 못했습니다.");
        }
      } finally {
        if (!cancelled) {
          setLoadingData(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [authLoading, user?.uid]);

  const todayEmotionChecked = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10);
    return records.some((r) => {
      try {
        return new Date(r.created_at).toISOString().slice(0, 10) === today;
      } catch {
        return false;
      }
    });
  }, [records]);

  const formatDate = (raw: string) => {
    try {
      return new Date(raw).toLocaleString("ko-KR", {
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
      });
    } catch {
      return raw;
    }
  };

  const formatNumber = (value: number) => (Number.isFinite(value) ? value.toFixed(1) : "-");

  const formatPercent = (value: number) => `${formatNumber(value)}%`;

  const formatWeeklyRange = (start: string, end: string) => {
    try {
      const startAt = new Date(start);
      const endAt = new Date(end);
      const dateFormatter = new Intl.DateTimeFormat("ko-KR", {
        month: "2-digit",
        day: "2-digit",
      });
      return `${dateFormatter.format(startAt)}~${dateFormatter.format(endAt)}`;
    } catch {
      return `${start.slice(0, 10)} ~ ${end.slice(0, 10)}`;
    }
  };

  const renderAdaptiveReport = () => {
    if (!adaptiveReport) return null;

    const fields: Record<string, any> = adaptiveReport.fields || {};
    const cardTone =
      adaptiveReport.template_type === "core_pattern"
        ? "from-sky-50 to-blue-50 text-sky-800 border-sky-200"
        : adaptiveReport.template_type === "intervention_effect"
          ? "from-violet-50 to-fuchsia-50 text-violet-800 border-violet-200"
          : adaptiveReport.template_type === "prediction_recovery"
            ? "from-emerald-50 to-teal-50 text-emerald-800 border-emerald-200"
            : "from-gray-50 to-gray-100 text-gray-700 border-gray-200";

    const commonRows = Object.entries(fields).slice(0, 8);
    return (
      <Card>
        <div className={`rounded-lg bg-gradient-to-br ${cardTone} -m-1 p-4 space-y-2 border`}>
          <div className="font-bold">{adaptiveReport.template_title || "감정 리포트"}</div>
          <div className="text-sm opacity-90">{adaptiveReport.summary_text || adaptiveReport.summary || ""}</div>
          <div className="text-xs opacity-80">
            총 {adaptiveReport.total_records}건 / 신뢰도 {(adaptiveReport.confidence || 0).toFixed(2)}
          </div>
        </div>
        <div className="mt-3 space-y-2">
          {adaptiveReport.template_type === "core_pattern" && (
            <>
              <div className="text-sm">핵심 감정: {fields.core_emotion_top || "-"}</div>
              <div className="text-sm">상황: {fields.situation_context_top || "-"}</div>
              <div className="text-sm">자동사고: {fields.automatic_thought_top || "-"}</div>
              <div className="text-sm">신체 반응: {fields.physical_sensation_top || "-"}</div>
              <div className="text-sm">평균 강도: {formatNumber(fields.avg_intensity)}</div>
              <div className="text-sm">강도 8 이상 비율: {formatNumber(fields.high_ratio)}%</div>
              <div className="text-sm">흐름: {fields.loop_summary || "-"}</div>
            </>
          )}
          {adaptiveReport.template_type === "intervention_effect" && (
            <>
              <div className="text-sm">전체 평균 감소폭: {formatNumber(fields.avg_drop)}</div>
              <div className="text-sm">EFT: {formatNumber(fields.eft_drop)} / 회복률 {formatNumber(fields.eft_success_rate)}%</div>
              <div className="text-sm">명상: {formatNumber(fields.meditation_drop)} / 회복률 {formatNumber(fields.meditation_success_rate)}%</div>
              <div className="text-sm">물 한 잔: {formatNumber(fields.water_drop)} / 회복률 {formatNumber(fields.water_success_rate)}%</div>
              <div className="text-sm">최적 개입: {fields.best_method || "-"}</div>
              <div className="text-sm">평균 대기시간: {formatNumber(fields.avg_delay)}분</div>
              <div className="text-sm">회복 속도 차이: {formatNumber(fields.speed_effect)}%</div>
            </>
          )}
          {adaptiveReport.template_type === "prediction_recovery" && (
            <>
              <div className="text-sm">예측 정확도: {formatNumber(fields.model_accuracy)}%</div>
              <div className="text-sm">기대 회복시간: {formatNumber(fields.expected_recovery_time)}분</div>
              <div className="text-sm">패턴1: {fields.situation_context_1 || "-"} / {fields.emotion_1 || "-"} ({formatNumber(fields.prob_1)}%)</div>
              <div className="text-sm">추천개입: {fields.recommended_intervention_1 || "-"}</div>
              <div className="text-sm">패턴2: {fields.situation_context_2 || "-"} / {fields.emotion_2 || "-"} ({formatNumber(fields.prob_2)}%)</div>
              <div className="text-sm">추천개입: {fields.recommended_intervention_2 || "-"}</div>
              <div className="text-sm">핵심 패턴: {fields.trigger_pattern || "-"}</div>
              <div className="text-sm">예상 제안: {fields.expected_recovery_rate || 0}%</div>
            </>
          )}
          {adaptiveReport.template_type === "warming_up" &&
            commonRows.map(([key, value]) => (
              <div key={key} className="text-sm">
                {key}: {typeof value === "number" ? formatNumber(value) : String(value ?? "-")}
              </div>
            ))}
        </div>
      </Card>
    );
  };

  const renderWeeklyReport = () => {
    if (!weeklyReport) return null;

    const fields: Record<string, any> = weeklyReport.fields || {};
    const cardTone =
      weeklyReport.template_type === "weekly_intervention"
        ? "from-sky-50 to-blue-100 text-sky-800 border-sky-200"
        : weeklyReport.template_type === "weekly_no_intervention"
          ? "from-amber-50 to-orange-100 text-amber-800 border-amber-200"
          : weeklyReport.template_type === "weekly_minimal"
            ? "from-gray-50 to-slate-100 text-gray-700 border-gray-200"
            : "from-emerald-50 to-teal-100 text-emerald-800 border-emerald-200";

    return (
      <Card>
        <div className={`rounded-lg bg-gradient-to-br ${cardTone} -m-1 p-4 space-y-2 border`}>
          <div className="font-bold">주간 리포트</div>
          <div className="font-semibold">{weeklyReport.template_title || "주간 감정 리포트"}</div>
          <div className="text-xs opacity-80">
            기간: {formatWeeklyRange(weeklyReport.week_start, weeklyReport.week_end)}
          </div>
          <div className="text-sm opacity-90">{weeklyReport.summary_text || "-"}</div>
          <div className="text-xs opacity-80">
            총 {weeklyReport.total_records}건 / 신뢰도 {formatPercent(weeklyReport.confidence * 100)}
          </div>
        </div>
        <div className="mt-3 space-y-2 text-sm">
          <div>핵심 감정: {fields.dominant_emotion || "-"}</div>
          <div>핵심 감정 비율: {formatPercent(fields.dominant_emotion_ratio || 0)}</div>
          <div>평균 강도: {formatNumber(fields.average_intensity || 0)}</div>
          <div>주요 집중 시간대: {fields.hour_block_top_high_intensity || fields.time_window_fatigue || "-"}</div>
          <div>재발 방해 패턴: {fields.trigger_recurrence_level || "-"}</div>
          <div>최적 개입: {fields.best_intervention_method || "-"}</div>
          <div>회복 개입 효과: {formatPercent(fields.best_method_success_rate || 0)} / 감소 {formatNumber(fields.best_method_avg_drop || 0)}</div>
          {weeklyReport.recommendations?.length ? (
            <div className="pt-1">
              <div className="text-xs font-semibold">추천 행동</div>
              <ul className="list-disc pl-4 text-sm space-y-1">
                {weeklyReport.recommendations.slice(0, 3).map((item, index) => (
                  <li key={`${item}-${index}`}>{item}</li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      </Card>
    );
  };

  if (authLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 via-indigo-50 to-cyan-50">
        <div className="max-w-md mx-auto px-4 py-10">
          <Card>
            <div className="py-8 text-center text-gray-500">로그인 상태를 확인 중입니다.</div>
          </Card>
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 via-indigo-50 to-cyan-50">
        <div className="max-w-md mx-auto px-4 py-10">
          <Card>
            <div className="space-y-4 text-center py-6">
              <div className="text-gray-700 font-semibold">로그인이 필요합니다.</div>
              <Button onClick={() => navigate("/login")} fullWidth>
                로그인 하기
              </Button>
            </div>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-indigo-50 to-cyan-50">
      <div className="bg-white shadow-sm border-b border-gray-100 sticky top-0 z-20">
        <div className="max-w-md mx-auto px-4 py-3">
          <div className="text-sm text-gray-500">최근 접속</div>
          <div className="font-semibold text-gray-800">{user.name || user.email || user.uid}</div>
          <div className="text-xs text-gray-500">{user.uid}</div>
        </div>
      </div>

        <div className="max-w-md mx-auto px-4 py-4 space-y-4 pb-10">
        <PWAInstallPrompt />

        <Card>
          <div className="space-y-3">
            <div className="font-bold text-gray-800">빠른 입력</div>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              <Button
                variant="outline"
                className="h-16 text-xs"
                onClick={() => navigate("/plan/day")}
              >
                플랜 입력
              </Button>
              <Button
                variant="outline"
                className="h-16 text-xs"
                onClick={() => navigate("/checkin")}
              >
                체크인
              </Button>
              <Button
                variant="outline"
                className="h-16 text-xs"
                onClick={() => navigate("/condition")}
              >
                Condition Hub
              </Button>
              <Button
                variant="outline"
                className="h-16 text-xs flex flex-col items-center justify-center gap-1"
                onClick={() => navigate("/menstrual")}
              >
                <span className="text-base leading-none" aria-hidden="true">♀</span>
                <span>월경 기록</span>
              </Button>
              <Button
                variant="outline"
                className="h-16 text-xs"
                onClick={() => navigate("/emotion-sessions")}
                >
                감정 기록
              </Button>
              <Button
                variant="outline"
                className="h-16 text-xs"
                onClick={() => navigate("/work-guide-demo")}
              >
                작업 가이드
              </Button>
              <Button
                variant="outline"
                className="h-16 text-xs"
                onClick={() => navigate("/eft-strict")}
              >
                EFT STRICT
              </Button>
            </div>
          </div>
        </Card>

        <Card>
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="font-bold text-gray-800">감정 기록</div>
              <button
                type="button"
                onClick={() => navigate("/emotion-sessions")}
                className="text-xs text-indigo-600 hover:text-indigo-700 font-medium"
              >
                전체 보기
              </button>
            </div>

            {loadingData ? (
              <div className="text-sm text-gray-500">불러오는 중...</div>
            ) : loadError ? (
              <div className="text-sm text-red-600">{loadError}</div>
            ) : records.length === 0 ? (
              <div className="text-sm text-gray-500">아직 기록이 없습니다.</div>
            ) : (
              <div className="space-y-2">
                {records.map((record) => (
                  <button
                    key={record.id}
                    type="button"
                    onClick={() => navigate(`/emotion-sessions/${record.id}`)}
                    className="w-full text-left p-3 rounded-lg border border-gray-100 hover:bg-gray-50 transition-colors"
                  >
                    <div className="text-xs text-gray-500 mb-1">{formatDate(record.created_at)}</div>
                    <div className="text-sm font-medium text-gray-800">
                       {record.core_emotion}의 강도 {record.intensity}/10
                    </div>
                    <div className="text-xs text-gray-600 truncate">
                      {record.situation_context || "-"}
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </Card>

        <Card>
          <div className="space-y-3">
            <div className="font-bold text-gray-800">감정 리포트</div>
            {loadingData ? (
              <div className="text-sm text-gray-500">리포트 불러오는 중...</div>
            ) : adaptiveReport ? (
              renderAdaptiveReport()
            ) : (
              <div className="text-sm text-gray-500">리포트 데이터가 없습니다.</div>
            )}
          </div>
        </Card>

        <Card>
          <div className="space-y-3">
            <div className="font-bold text-gray-800">독립 주간 리포트</div>
            {loadingData ? (
              <div className="text-sm text-gray-500">주간 리포트 불러오는 중...</div>
            ) : weeklyReport ? (
              renderWeeklyReport()
            ) : (
              <div className="text-sm text-gray-500">주간 리포트 데이터가 없습니다.</div>
            )}
          </div>
        </Card>

        <Card>
          <div className="space-y-2">
            <div className="font-bold text-gray-800">감정 통계</div>
            {loadingData ? (
              <div className="text-sm text-gray-500">불러오는 중...</div>
            ) : (
              <>
                <div className="text-sm text-gray-700">
                  총 감정 기록: <span className="font-semibold">{stats?.total_records ?? 0}</span>
                </div>
                <div className="text-sm text-gray-700">
                  평균 강도: <span className="font-semibold">{stats?.average_intensity ?? 0}</span>/10
                </div>
                <div className="text-sm text-gray-700">
                  오늘 감정 체크: {" "}
                  <span className={`font-semibold ${todayEmotionChecked ? "text-green-600" : "text-gray-600"}`}>
                    {todayEmotionChecked ? "완료" : "미완료"}
                  </span>
                </div>
              </>
            )}
          </div>
        </Card>
      </div>
    </div>
  );
};

export default Dashboard;
