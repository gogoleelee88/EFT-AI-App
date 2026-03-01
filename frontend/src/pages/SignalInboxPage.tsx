import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import ClarificationCard from "../components/behavior/ClarificationCard";
import TimelineLabelEditor from "../components/behavior/TimelineLabelEditor";
import { useAuth } from "../hooks/useAuth";
import {
  answerBehaviorQuestion,
  dismissBehaviorQuestion,
  getRecoveryJournal,
  listBehaviorTimeline,
  listPendingBehaviorQuestions,
  patchBehaviorTimelineSegment,
} from "../services/behaviorService";
import { ingestSignal, listSignals } from "../services/proposalService";
import type {
  BehaviorLabel,
  ClarificationQuestionOut,
  RecoveryJournalOut,
  TimelineSegmentOut,
} from "../types/behavior";
import type { SignalType } from "../types/proposalOS";

type SignalItem = {
  signal_id: string;
  signal_type: SignalType;
  source: string;
  title: string;
  body: string;
  metadata?: Record<string, unknown>;
  created_at: string;
};

type MobileLoginResponse = {
  ok: boolean;
  created?: boolean;
  error?: string;
  user?: {
    id: string;
    email?: string | null;
    name?: string | null;
  };
};

const ENTRY_POINT_KEYS = ["schedule_start", "progress_blocked", "distraction_detected"] as const;
const ENTRY_POINT_COLORS: Record<(typeof ENTRY_POINT_KEYS)[number], string> = {
  schedule_start: "#f59e0b",
  progress_blocked: "#ef4444",
  distraction_detected: "#3b82f6",
};
const TREND_COLORS = ["#7c3aed", "#2563eb", "#059669", "#ea580c", "#dc2626"];

const pad2 = (n: number): string => String(n).padStart(2, "0");

const toDayTokenLocal = (date: Date): string =>
  `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;

const toDayLabel = (date: Date): string => `${date.getMonth() + 1}/${date.getDate()}`;

const SignalInboxPage: React.FC = () => {
  const { user } = useAuth();
  const defaultUserId = useMemo(() => user?.uid || "demo-user", [user?.uid]);

  const [userIdentifier, setUserIdentifier] = useState(defaultUserId);
  const [activeUserId, setActiveUserId] = useState(defaultUserId);
  const [connectedUserEmail, setConnectedUserEmail] = useState("");

  const [signalType, setSignalType] = useState<SignalType>("external");
  const [source, setSource] = useState("manual");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [url, setUrl] = useState("");
  const [items, setItems] = useState<SignalItem[]>([]);
  const [timelineItems, setTimelineItems] = useState<TimelineSegmentOut[]>([]);
  const [question, setQuestion] = useState<ClarificationQuestionOut | null>(null);
  const [journal, setJournal] = useState<RecoveryJournalOut | null>(null);
  const [journalLoading, setJournalLoading] = useState(false);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [result, setResult] = useState("");
  const autoLoginAttempted = useRef(false);
  const chartDays = useMemo(() => {
    const now = new Date();
    const days: Date[] = [];
    for (let i = 6; i >= 0; i -= 1) {
      days.push(new Date(now.getFullYear(), now.getMonth(), now.getDate() - i));
    }
    return days;
  }, []);
  const topSchedules = useMemo(() => {
    const counter = new Map<string, number>();
    for (const event of journal?.events ?? []) {
      const name = (event.schedule_name || "미지정 일정").trim() || "미지정 일정";
      counter.set(name, (counter.get(name) || 0) + 1);
    }
    return [...counter.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([name]) => name);
  }, [journal?.events]);
  const entryPointTrend = useMemo(() => {
    const rows = chartDays.map((day) => ({
      dayToken: toDayTokenLocal(day),
      day: toDayLabel(day),
      schedule_start: 0,
      progress_blocked: 0,
      distraction_detected: 0,
    }));
    const indexByDay = new Map(rows.map((row, idx) => [row.dayToken, idx]));
    for (const event of journal?.events ?? []) {
      const dayToken = toDayTokenLocal(new Date(event.created_at));
      const idx = indexByDay.get(dayToken);
      if (idx == null) continue;
      if (ENTRY_POINT_KEYS.includes(event.entry_point)) {
        rows[idx][event.entry_point] += 1;
      }
    }
    return rows;
  }, [chartDays, journal?.events]);
  const scheduleTrend = useMemo(() => {
    const rows = chartDays.map((day) => {
      const base: Record<string, number | string> = {
        dayToken: toDayTokenLocal(day),
        day: toDayLabel(day),
      };
      for (const scheduleName of topSchedules) {
        base[scheduleName] = 0;
      }
      return base;
    });
    const indexByDay = new Map(rows.map((row, idx) => [String(row.dayToken), idx]));
    for (const event of journal?.events ?? []) {
      const scheduleName = (event.schedule_name || "미지정 일정").trim() || "미지정 일정";
      if (!topSchedules.includes(scheduleName)) continue;
      const dayToken = toDayTokenLocal(new Date(event.created_at));
      const idx = indexByDay.get(dayToken);
      if (idx == null) continue;
      const prev = Number(rows[idx][scheduleName] || 0);
      rows[idx][scheduleName] = prev + 1;
    }
    return rows;
  }, [chartDays, journal?.events, topSchedules]);

  useEffect(() => {
    if (!userIdentifier.trim()) {
      setUserIdentifier(defaultUserId);
    }
    if (!activeUserId.trim()) {
      setActiveUserId(defaultUserId);
    }
  }, [defaultUserId, userIdentifier, activeUserId]);

  const loadSignals = async (targetUserId: string = activeUserId) => {
    setLoading(true);
    try {
      const rows = (await listSignals(targetUserId)) as SignalItem[];
      setItems(rows);
    } catch (e) {
      setResult(e instanceof Error ? e.message : "?좏샇 議고쉶 ?ㅽ뙣");
    } finally {
      setLoading(false);
    }
  };

  const loadTimeline = async (targetUserId: string = activeUserId) => {
    try {
      const rows = await listBehaviorTimeline(targetUserId);
      setTimelineItems(rows.items || []);
    } catch {
      setTimelineItems([]);
    }
  };

  const loadPendingQuestion = async (targetUserId: string = activeUserId) => {
    try {
      const rows = await listPendingBehaviorQuestions(targetUserId, 10);
      setQuestion(rows.length > 0 ? rows[0] : null);
    } catch {
      setQuestion(null);
    }
  };

  const loadRecoveryJournal = async (targetUserId: string = activeUserId) => {
    setJournalLoading(true);
    try {
      const result = await getRecoveryJournal({
        userId: targetUserId,
        days: 7,
        limit: 100,
        includeEvents: true,
      });
      setJournal(result);
    } catch {
      setJournal(null);
    } finally {
      setJournalLoading(false);
    }
  };

  useEffect(() => {
    void loadSignals(activeUserId);
    void loadTimeline(activeUserId);
    void loadPendingQuestion(activeUserId);
    void loadRecoveryJournal(activeUserId);
  }, [activeUserId]);

  const performMobileLogin = async (identifier: string, options: { silent?: boolean } = {}) => {
    const trimmedIdentifier = identifier.trim();
    if (!trimmedIdentifier) {
      if (!options.silent) {
        setResult("?꾩씠???먮뒗 ?대찓?쇱쓣 ?낅젰?섏꽭??");
      }
      return false;
    }

    if (!options.silent) {
      setConnecting(true);
      setResult("");
    }

    try {
      const response = await fetch("/api/reminders/mobile-login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ identifier: trimmedIdentifier }),
      });
      const text = await response.text();
      if (!response.ok) {
        throw new Error(text || `HTTP ${response.status}`);
      }
      const json = JSON.parse(text) as MobileLoginResponse;
      if (!json.ok || !json.user?.id) {
        throw new Error(json.error || "?ъ슜???곌껐 ?ㅽ뙣");
      }

      const resolvedUserId = json.user.id;
      setActiveUserId(resolvedUserId);
      setConnectedUserEmail(json.user.email || "");
      setUserIdentifier(json.user.email || resolvedUserId);
      await Promise.all([
        loadSignals(resolvedUserId),
        loadTimeline(resolvedUserId),
        loadPendingQuestion(resolvedUserId),
        loadRecoveryJournal(resolvedUserId),
      ]);
      if (!options.silent) {
        setResult(
          json.created
            ? `???ъ슜???앹꽦 諛??곌껐 ?꾨즺: ${json.user.email || resolvedUserId}`
            : `?ъ슜???곌껐 ?꾨즺: ${json.user.email || resolvedUserId}`
        );
      }
      return true;
    } catch (e) {
      if (!options.silent) {
        setResult(e instanceof Error ? e.message : "?ъ슜???곌껐 ?ㅽ뙣");
      }
      return false;
    } finally {
      if (!options.silent) {
        setConnecting(false);
      }
    }
  };

  const resolveAndUseUser = async () => {
    await performMobileLogin(userIdentifier);
  };

  useEffect(() => {
    if (autoLoginAttempted.current) return;

    const params = new URLSearchParams(window.location.search);
    const queryUserId = params.get("user_id");
    const trimmedQueryUserId = queryUserId?.trim() ?? "";

    if (!trimmedQueryUserId) return;

    autoLoginAttempted.current = true;
    void performMobileLogin(trimmedQueryUserId, { silent: true });
  }, []);

  const onSubmit = async () => {
    setResult("");
    try {
      await ingestSignal({
        user_id: activeUserId,
        signal_type: signalType,
        source,
        title: title || "Untitled Signal",
        body: body || "?댁슜 ?놁쓬",
        metadata: url ? { url } : {},
      });
      setTitle("");
      setBody("");
      setUrl("");
      setResult("?좏샇 ????꾨즺");
      await loadSignals();
    } catch (e) {
      setResult(e instanceof Error ? e.message : "?좏샇 ????ㅽ뙣");
    }
  };

  const onAnswerQuestion = async (label: BehaviorLabel) => {
    if (!question) return;
    setBusy(true);
    setResult("");
    try {
      await answerBehaviorQuestion(
        question.question_id,
        {
          user_id: activeUserId,
          label,
        },
        activeUserId
      );
      await loadPendingQuestion();
      await loadTimeline();
      setResult("吏덈Ц ?듬? ?꾨즺");
    } catch (e) {
      setResult(e instanceof Error ? e.message : "吏덈Ц ?듬? ?ㅽ뙣");
    } finally {
      setBusy(false);
    }
  };

  const onDismissQuestion = async () => {
    if (!question) return;
    setBusy(true);
    setResult("");
    try {
      await dismissBehaviorQuestion(question.question_id, activeUserId);
      await loadPendingQuestion();
      setResult("吏덈Ц??嫄대꼫?곗뿀?듬땲??");
    } catch (e) {
      setResult(e instanceof Error ? e.message : "吏덈Ц 嫄대꼫?곌린 ?ㅽ뙣");
    } finally {
      setBusy(false);
    }
  };

  const onPatchTimeline = async (segmentId: number, label: BehaviorLabel) => {
    setBusy(true);
    setResult("");
    try {
      await patchBehaviorTimelineSegment(
        segmentId,
        { user_id: activeUserId, final_label: label },
        activeUserId
      );
      await loadTimeline();
      setResult("??꾨씪???쇰꺼 ?섏젙 ?꾨즺");
    } catch (e) {
      setResult(e instanceof Error ? e.message : "??꾨씪???쇰꺼 ?섏젙 ?ㅽ뙣");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto px-4 py-6 space-y-6">
      <h1 className="text-2xl font-bold text-gray-900">행동 복구 체크인</h1>
      <p className="text-sm text-gray-600">
        작업 전환이 잘 안 맞는 순간에 부드럽게 도와주는 페이지입니다.
      </p>

      <section className="bg-white border rounded-xl p-4 md:p-5 space-y-3 shadow-sm">
        <h2 className="font-semibold text-lg text-gray-900">사용자 연결</h2>
        <p className="text-sm text-gray-600">
          모바일 에이전트 앱에서 넘어온 user_id를 간단히 붙여서 확인해요.
        </p>
        <div className="flex flex-col md:flex-row gap-2">
          <input
            className="border rounded px-3 py-2 flex-1"
            value={userIdentifier}
            onChange={(e) => setUserIdentifier(e.target.value)}
            placeholder="email ?먮뒗 user_id"
          />
          <button
            type="button"
            onClick={resolveAndUseUser}
            disabled={connecting}
            className="px-4 py-2 rounded bg-purple-600 text-white disabled:opacity-50"
          >
            {connecting ? "연결 중..." : "연결하기"}
          </button>
        </div>
        <p className="text-xs text-gray-500">
          현재 표시 user_id: <span className="font-mono">{activeUserId}</span>
          {connectedUserEmail ? ` (${connectedUserEmail})` : ""}
        </p>
      </section>

      <section className="bg-white border rounded-xl p-4 md:p-5 space-y-3 shadow-sm">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <select
            className="border rounded px-3 py-2"
            value={signalType}
            onChange={(e) => setSignalType(e.target.value as SignalType)}
          >
            <option value="external">External</option>
            <option value="temporal">Temporal</option>
            <option value="identity_derived">Identity-derived</option>
          </select>
          <input
            className="border rounded px-3 py-2"
            value={source}
            onChange={(e) => setSource(e.target.value)}
            placeholder="source"
          />
          <input
            className="border rounded px-3 py-2"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="title"
          />
        </div>
        <textarea
          className="w-full border rounded px-3 py-2"
          rows={4}
          placeholder="怨듦퀬, 硫붿떆吏, 硫붿씪, 硫붾え ?댁슜??遺숈뿬 ?ｌ쑝?몄슂"
          value={body}
          onChange={(e) => setBody(e.target.value)}
        />
        <input
          className="w-full border rounded px-3 py-2"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="洹쇨굅 留곹겕 URL (?좏깮)"
        />
          <button className="px-4 py-2 rounded bg-purple-600 text-white" onClick={onSubmit}>
            시그널 남기기
          </button>
      </section>

      <section className="bg-white border rounded-xl p-4 md:p-5 space-y-3 shadow-sm">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold text-lg text-gray-900">Recovery Journal (최근 7일)</h2>
          <button className="text-sm text-purple-700" onClick={() => loadRecoveryJournal()}>
            새로고침
          </button>
        </div>
        {journalLoading && <p className="text-sm text-gray-500">로딩 중...</p>}
        {!journalLoading && !journal && (
          <p className="text-sm text-gray-500">요약 데이터를 불러오지 못했습니다.</p>
        )}
        {!journalLoading && journal && (
          <div className="space-y-3">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
              <div className="rounded border border-gray-200 bg-gray-50 px-3 py-2 text-sm">
                총 이벤트: <span className="font-semibold">{journal.total_events}</span>
              </div>
              <div className="rounded border border-green-200 bg-green-50 px-3 py-2 text-sm">
                웹 개입: <span className="font-semibold">{journal.open_web_count}</span>
              </div>
              <div className="rounded border border-slate-200 bg-slate-50 px-3 py-2 text-sm">
                억제됨: <span className="font-semibold">{journal.ignored_count}</span>
              </div>
            </div>
            <ul className="space-y-1 text-sm text-gray-700">
              {journal.summary_lines.map((line, idx) => (
                <li key={`${line}_${idx}`} className="rounded border border-gray-100 bg-white px-3 py-2">
                  {line}
                </li>
              ))}
            </ul>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <div className="rounded border border-gray-200 bg-white p-3">
                <p className="text-xs font-semibold text-gray-500 mb-2">entry_point 주간 추이</p>
                <div className="h-56">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={entryPointTrend}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="day" />
                      <YAxis allowDecimals={false} />
                      <Tooltip />
                      <Legend />
                      {ENTRY_POINT_KEYS.map((key) => (
                        <Bar
                          key={key}
                          dataKey={key}
                          stackId="entry"
                          fill={ENTRY_POINT_COLORS[key]}
                          name={key}
                        />
                      ))}
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
              <div className="rounded border border-gray-200 bg-white p-3">
                <p className="text-xs font-semibold text-gray-500 mb-2">schedule 주간 추이 (상위 3개)</p>
                <div className="h-56">
                  {topSchedules.length > 0 ? (
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={scheduleTrend}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="day" />
                        <YAxis allowDecimals={false} />
                        <Tooltip />
                        <Legend />
                        {topSchedules.map((scheduleName, idx) => (
                          <Line
                            key={scheduleName}
                            type="monotone"
                            dataKey={scheduleName}
                            stroke={TREND_COLORS[idx % TREND_COLORS.length]}
                            strokeWidth={2}
                            dot={{ r: 3 }}
                          />
                        ))}
                      </LineChart>
                    </ResponsiveContainer>
                  ) : (
                    <div className="h-full flex items-center justify-center text-sm text-gray-500">
                      스케줄별 데이터가 없습니다.
                    </div>
                  )}
                </div>
              </div>
            </div>
            <div className="space-y-2">
              <p className="text-xs font-semibold text-gray-500">최근 이벤트</p>
              {journal.events.slice(0, 5).map((event) => (
                <div key={event.event_id} className="rounded border border-gray-200 px-3 py-2 text-sm">
                  <div className="text-xs text-gray-500">
                    {new Date(event.created_at).toLocaleString()} | {event.entry_point} | {event.action}
                  </div>
                  <div className="text-gray-800">{event.entry_sentence}</div>
                </div>
              ))}
            </div>
          </div>
        )}
      </section>

      <section className="bg-white border rounded-xl p-4 md:p-5 space-y-3 shadow-sm">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold text-lg text-gray-900">대기 중인 질문</h2>
          <span className="text-xs text-gray-500">가장 최근 1개만 표시</span>
        </div>
        {question ? (
          <div className="space-y-2">
            <ClarificationCard question={question} onAnswer={onAnswerQuestion} busy={busy} />
            <button
              type="button"
              disabled={busy}
              onClick={onDismissQuestion}
              className="px-3 py-1.5 text-xs rounded border border-purple-200 text-purple-700 bg-purple-50 hover:bg-purple-100 disabled:opacity-50"
            >
              오늘은 괜찮아요
            </button>
          </div>
        ) : (
          <p className="text-sm text-gray-500">현재 처리할 질문이 없습니다.</p>
        )}
      </section>

      <section className="bg-white border rounded-xl p-4 md:p-5 space-y-3 shadow-sm">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold text-lg text-gray-900">행동 타임라인</h2>
          <button className="text-sm text-purple-700" onClick={() => loadTimeline()}>
            ?덈줈怨좎묠
          </button>
        </div>
        {timelineItems.length === 0 ? (
          <p className="text-sm text-gray-500">아직 기록이 없어요.</p>
        ) : (
          <ul className="space-y-2">
            {timelineItems.map((item) => (
              <TimelineLabelEditor key={item.segment_id} segment={item} onPatch={onPatchTimeline} busy={busy} />
            ))}
          </ul>
        )}
      </section>

      <section className="bg-white border rounded-xl p-4 md:p-5 space-y-3 shadow-sm">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold text-lg text-gray-900">로그 기록</h2>
          <button className="text-sm text-purple-700" onClick={() => loadSignals()}>
            ?덈줈怨좎묠
          </button>
        </div>
        {loading && <p className="text-sm text-gray-500">濡쒕뵫 以?..</p>}
        {!loading && items.length === 0 && <p className="text-sm text-gray-500">?깅줉???좏샇媛 ?놁뒿?덈떎.</p>}
        <ul className="space-y-2">
          {items.map((item) => (
            <li key={item.signal_id} className="border rounded p-3">
              <div className="text-xs text-gray-500">
                {item.signal_type} 쨌 {item.source}
              </div>
              <div className="font-medium">{item.title}</div>
              <div className="text-sm text-gray-700 whitespace-pre-wrap">{item.body}</div>
            </li>
          ))}
        </ul>
      </section>

      {result ? <p className="text-sm text-gray-700">{result}</p> : null}
    </div>
  );
};

export default SignalInboxPage;


