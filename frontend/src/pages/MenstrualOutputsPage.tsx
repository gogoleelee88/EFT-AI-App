import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";

import { Button } from "../components/ui/Button";
import { useAuth } from "../hooks/useAuth";
import {
  getJournal,
  getMenstrualCalendar,
  getMenstrualInsights,
  getMenstrualPrediction,
  type JournalEntry,
  type MenstrualCalendarResponse,
  type MenstrualInsightsResponse,
  type MenstrualPrediction,
} from "../services/menstrualService";

const PHASE_LABELS: Record<string, string> = {
  menstruation: "월경기",
  follicular: "난포기",
  ovulation_window: "배란기",
  luteal: "황체기",
  unknown: "미확정",
};

const BLEEDING_LABELS: Record<string, string> = {
  none: "무방사",
  spotting: "소량",
  period: "월경",
};

const QUALITY_LABELS: Record<string, string> = {
  insufficient: "데이터 부족",
  fair: "보통",
  good: "양호",
};

const toIsoDate = (date: Date): string => date.toISOString().slice(0, 10);
const formatDate = (value: string): string =>
  new Date(value).toLocaleDateString("ko-KR", {
    month: "short",
    day: "numeric",
    weekday: "short",
  });

export default function MenstrualOutputsPage() {
  const navigate = useNavigate();
  const { loading: authLoading, isAuthenticated } = useAuth();

  const today = toIsoDate(new Date());
  const defaultFrom = toIsoDate(new Date(Date.now() - 29 * 24 * 60 * 60 * 1000));

  const [fromDate, setFromDate] = useState(defaultFrom);
  const [toDate, setToDate] = useState(today);
  const [prediction, setPrediction] = useState<MenstrualPrediction | null>(null);
  const [calendar, setCalendar] = useState<MenstrualCalendarResponse | null>(null);
  const [insights, setInsights] = useState<MenstrualInsightsResponse | null>(null);
  const [journalEntries, setJournalEntries] = useState<JournalEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastLoadedAt, setLastLoadedAt] = useState<string | null>(null);

  const canLoad = isAuthenticated && !authLoading;

  const loadOutputs = useCallback(async () => {
    if (!canLoad) {
      setError("로그인 후 결과 페이지를 볼 수 있습니다.");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const [predictionResult, calendarResult, insightsResult, journalResult] = await Promise.all([
        getMenstrualPrediction(),
        getMenstrualCalendar(fromDate, toDate),
        getMenstrualInsights(fromDate, toDate),
        getJournal({ fromDate, toDate }),
      ]);

      setPrediction(predictionResult);
      setCalendar(calendarResult);
      setInsights(insightsResult);
      setJournalEntries(journalResult.entries ?? []);
      setLastLoadedAt(new Date().toLocaleString("ko-KR"));
    } catch (err) {
      setError(err instanceof Error ? err.message : "결과를 불러오지 못했습니다.");
    } finally {
      setLoading(false);
    }
  }, [canLoad, fromDate, toDate]);

  useEffect(() => {
    if (!authLoading && canLoad) {
      void loadOutputs();
    }
  }, [authLoading, canLoad, loadOutputs]);

  const recentSummaries = useMemo(() => (calendar?.day_summaries ?? []).slice(-14).reverse(), [calendar]);

  const topTrendText = useMemo(() => {
    if (!insights) {
      return "-";
    }
    return insights.recent_two_week_pattern || "패턴 데이터가 충분하지 않습니다.";
  }, [insights]);

  if (authLoading) {
    return <div className="p-6 text-sm">인증 상태를 확인 중입니다...</div>;
  }

  return (
    <main className="mx-auto w-full max-w-4xl space-y-4 p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">월경 기록 결과</h1>
          <p className="mt-1 text-sm text-gray-600">입력한 맥락 로그와 월경 기록을 정리해서 보여줍니다.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => navigate("/menstrual")}>
            월경 기록으로 돌아가기
          </Button>
          <Button variant="outline" onClick={() => void loadOutputs()} disabled={!canLoad || loading}>
            {loading ? "불러오는 중..." : "결과 새로고침"}
          </Button>
        </div>
      </div>

      {!canLoad && (
        <section className="rounded border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
          로그인 후 저장 데이터의 분석 결과를 볼 수 있습니다.
        </section>
      )}

      {error && <section className="rounded border border-red-300 bg-red-50 p-3 text-sm text-red-700">{error}</section>}

      <section className="rounded-xl border bg-white p-4">
        <h2 className="mb-3 text-lg font-semibold">조회 기간</h2>
        <div className="grid gap-2 text-sm sm:grid-cols-3">
          <label className="space-y-1">
            <span className="text-xs text-gray-500">시작</span>
            <input
              type="date"
              className="w-full rounded border px-2 py-1"
              value={fromDate}
              max={toDate}
              onChange={(e) => setFromDate(e.target.value)}
            />
          </label>
          <label className="space-y-1">
            <span className="text-xs text-gray-500">종료</span>
            <input
              type="date"
              className="w-full rounded border px-2 py-1"
              value={toDate}
              min={fromDate}
              onChange={(e) => setToDate(e.target.value)}
            />
          </label>
          <div className="flex items-end">
            <p className="text-xs text-gray-500">최종 갱신: {lastLoadedAt ?? "-"}</p>
          </div>
        </div>
      </section>

      <section className="rounded-xl border bg-white p-4">
        <h2 className="mb-3 text-lg font-semibold">예측 요약</h2>
        {!prediction ? (
          <p className="text-sm text-gray-500">데이터를 조회 중입니다.</p>
        ) : (
          <div className="grid gap-2 text-sm sm:grid-cols-3">
            <p>
              <strong className="text-gray-900">예측 구간</strong>:
              <span className="ml-1 text-gray-700">
                {prediction.next_period_window_start ?? "-"} ~ {prediction.next_period_window_end ?? "-"}
              </span>
            </p>
            <p>
              <strong className="text-gray-900">신뢰도</strong>:
              <span className="ml-1 text-gray-700">{prediction.confidence_score}%</span>
            </p>
            <p>
              <strong className="text-gray-900">데이터 품질</strong>:
              <span className="ml-1 text-gray-700">{QUALITY_LABELS[prediction.data_quality] ?? prediction.data_quality}</span>
            </p>
            <p className="sm:col-span-3 text-xs text-gray-500">
              {prediction.why_this || "예측 근거가 아직 충분하지 않습니다."}
            </p>
          </div>
        )}
      </section>

      <section className="rounded-xl border bg-white p-4">
        <h2 className="mb-3 text-lg font-semibold">최근 2주 패턴</h2>
        <p className="text-sm text-gray-700">{topTrendText}</p>
      </section>

      {insights && (
        <section className="rounded-xl border bg-white p-4">
          <h2 className="mb-3 text-lg font-semibold">인사이트</h2>
          <div className="grid gap-2 text-sm sm:grid-cols-3">
            <p>
              <strong>PMDD 상위 기준점</strong>
              <span className="ml-1 text-gray-700">
                {insights.worsening_threshold_p75 == null ? "-" : insights.worsening_threshold_p75}
              </span>
            </p>
            <p>
              <strong>증상 트리거 후보</strong>
              <span className="ml-1 text-gray-700">
                {insights.top_triggers_in_worsening_days.length === 0
                  ? "없음"
                  : insights.top_triggers_in_worsening_days.map((item) => item.tag).slice(0, 2).join(", ")}
              </span>
            </p>
            <p>
              <strong>악화 일수</strong>
              <span className="ml-1 text-gray-700">{insights.worsening_days.length}일</span>
            </p>
          </div>
        </section>
      )}

      <section className="rounded-xl border bg-white p-4">
        <h2 className="mb-3 text-lg font-semibold">요약 캘린더 (최근 14일)</h2>
        {recentSummaries.length === 0 ? (
          <p className="text-sm text-gray-500">조회된 날짜가 없습니다.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs sm:text-sm">
              <thead>
                <tr className="bg-gray-50 text-left">
                  <th className="p-2">날짜</th>
                  <th className="p-2">출혈</th>
                  <th className="p-2">유량</th>
                  <th className="p-2">주기 단계</th>
                  <th className="p-2">PMDD</th>
                </tr>
              </thead>
              <tbody>
                {recentSummaries.map((row) => (
                  <tr key={row.day_date} className="border-t">
                    <td className="p-2">{formatDate(row.day_date)}</td>
                    <td className="p-2">{BLEEDING_LABELS[row.bleeding_status] ?? row.bleeding_status}</td>
                    <td className="p-2">{row.flow_level ?? 0}</td>
                    <td className="p-2">{PHASE_LABELS[row.phase] ?? row.phase}</td>
                    <td className="p-2">{row.pmdd_symptom_index ?? "-"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="rounded-xl border bg-white p-4">
        <h2 className="mb-3 text-lg font-semibold">최근 상담/기록 메모</h2>
        {journalEntries.length === 0 ? (
          <p className="text-sm text-gray-500">해당 기간에 메모가 없습니다.</p>
        ) : (
          <div className="space-y-2">
            {journalEntries.slice(0, 6).map((entry) => (
              <div key={entry.event_id} className="rounded border bg-gray-50 p-2 text-sm">
                <p className="text-xs text-gray-500">
                  {new Date(entry.datetime).toLocaleString("ko-KR", {
                    year: "numeric",
                    month: "2-digit",
                    day: "2-digit",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                  {entry.severity != null ? ` · 심리강도 ${entry.severity}` : ""}
                </p>
                <p className="text-gray-800">{entry.text}</p>
              </div>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
