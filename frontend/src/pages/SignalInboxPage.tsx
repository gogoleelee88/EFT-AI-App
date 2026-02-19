import React, { useEffect, useMemo, useRef, useState } from "react";
import ClarificationCard from "../components/behavior/ClarificationCard";
import TimelineLabelEditor from "../components/behavior/TimelineLabelEditor";
import { useAuth } from "../hooks/useAuth";
import {
  answerBehaviorQuestion,
  dismissBehaviorQuestion,
  listBehaviorTimeline,
  listPendingBehaviorQuestions,
  patchBehaviorTimelineSegment,
} from "../services/behaviorService";
import { ingestSignal, listSignals } from "../services/proposalService";
import type { BehaviorLabel, ClarificationQuestionOut, TimelineSegmentOut } from "../types/behavior";
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
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [result, setResult] = useState("");
  const autoLoginAttempted = useRef(false);

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

  useEffect(() => {
    void loadSignals(activeUserId);
    void loadTimeline(activeUserId);
    void loadPendingQuestion(activeUserId);
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
      <h1 className="text-2xl font-bold text-gray-900">Signal Inbox</h1>

      <section className="bg-white border rounded-lg p-4 space-y-3">
        <h2 className="font-semibold">?ъ슜???곌껐</h2>
        <p className="text-sm text-gray-600">
          ?깆뿉??濡쒓렇?명븳 ?대찓???먮뒗 user_id瑜??낅젰?섏꽭??
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
            className="px-4 py-2 rounded bg-blue-600 text-white disabled:opacity-50"
          >
            {connecting ? "?곌껐 以?.." : "?ъ슜???곌껐"}
          </button>
        </div>
        <p className="text-xs text-gray-500">
          ?꾩옱 議고쉶 user_id: <span className="font-mono">{activeUserId}</span>
          {connectedUserEmail ? ` (${connectedUserEmail})` : ""}
        </p>
      </section>

      <section className="bg-white border rounded-lg p-4 space-y-3">
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
        <button className="px-4 py-2 rounded bg-blue-600 text-white" onClick={onSubmit}>
          ?좏샇 ?깅줉
        </button>
      </section>

      <section className="bg-white border rounded-lg p-4 space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold">?됰룞 ?꾨낫 ?뺤씤</h2>
          <span className="text-xs text-gray-500">?대깽???낅젰 API ?곕룞 ?뺤씤</span>
        </div>
        {question ? (
          <div className="space-y-2">
            <ClarificationCard question={question} onAnswer={onAnswerQuestion} busy={busy} />
            <button
              type="button"
              disabled={busy}
              onClick={onDismissQuestion}
              className="px-3 py-1.5 text-xs rounded border bg-white hover:bg-gray-50 disabled:opacity-50"
            >
              吏湲덉? 嫄대꼫?곌린
            </button>
          </div>
        ) : (
          <p className="text-sm text-gray-500">?꾩옱 ?뺤씤???꾩슂??吏덈Ц???놁뒿?덈떎.</p>
        )}
      </section>

      <section className="bg-white border rounded-lg p-4 space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold">?됰룞 ??꾨씪</h2>
          <button className="text-sm text-blue-700" onClick={() => loadTimeline()}>
            ?덈줈怨좎묠
          </button>
        </div>
        {timelineItems.length === 0 ? (
          <p className="text-sm text-gray-500">?꾩쭅 ??λ맂 ??꾨씪??援ш컙???놁뒿?덈떎.</p>
        ) : (
          <ul className="space-y-2">
            {timelineItems.map((item) => (
              <TimelineLabelEditor key={item.segment_id} segment={item} onPatch={onPatchTimeline} busy={busy} />
            ))}
          </ul>
        )}
      </section>

      <section className="bg-white border rounded-lg p-4 space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold">?좏샇 由ъ뒪</h2>
          <button className="text-sm text-blue-700" onClick={() => loadSignals()}>
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

