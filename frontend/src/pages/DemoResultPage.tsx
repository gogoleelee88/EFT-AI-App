import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";

type DemoState = {
  answer: string;
  source: "live" | "fallback";
  rawStatus?: number;
};

const DEMO_MESSAGE = "업무 스트레스가 높고 집중이 잘 안 됩니다. 30초 안에 할 수 있는 안정화 방법을 알려주세요.";

function extractAnswer(payload: any): string {
  if (!payload || typeof payload !== "object") return "";

  if (typeof payload.response === "string" && payload.response.trim()) {
    return payload.response.trim();
  }

  const winner = payload?.faster_model === "llama3" ? payload?.llama3_response : payload?.qwen25_response;
  const winnerText = winner?.response;
  if (typeof winnerText === "string" && winnerText.trim()) {
    return winnerText.trim();
  }

  const firstChoice = payload?.choices?.[0]?.message?.content;
  if (typeof firstChoice === "string" && firstChoice.trim()) {
    return firstChoice.trim();
  }

  return "";
}

export default function DemoResultPage() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<DemoState | null>(null);

  useEffect(() => {
    let cancelled = false;

    const runDemo = async () => {
      try {
        const res = await fetch("/api/chat/compare", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            message: DEMO_MESSAGE,
            temperature: 0.3,
            max_tokens: 180,
          }),
        });

        const json = await res.json().catch(() => ({}));
        const answer = extractAnswer(json);

        if (!cancelled && res.ok && answer) {
          setResult({ answer, source: "live", rawStatus: res.status });
          setError(null);
          return;
        }

        const fallback = "지금 가능한 30초 안정화: 4초 들숨-6초 날숨을 3회 반복하고, 발바닥 감각에 집중하세요.";
        if (!cancelled) {
          setResult({ answer: fallback, source: "fallback", rawStatus: res.status });
          setError("실서버 응답이 불안정하여 fallback 결과를 표시했습니다.");
        }
      } catch {
        if (!cancelled) {
          setResult({
            answer: "네트워크 상태가 불안정합니다. 30초 호흡(4초 들숨/6초 날숨)을 3회 반복해 보세요.",
            source: "fallback",
          });
          setError("서버 연결 실패로 fallback 결과를 표시했습니다.");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    runDemo();
    return () => {
      cancelled = true;
    };
  }, []);

  const badge = useMemo(() => {
    if (!result) return "";
    return result.source === "live" ? "LIVE RESULT" : "FALLBACK RESULT";
  }, [result]);

  return (
    <div className="min-h-screen bg-slate-50 px-4 py-10">
      <div className="mx-auto max-w-2xl rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <h1 className="text-2xl font-bold text-slate-900">데모 결과</h1>
        <p className="mt-2 text-sm text-slate-600">입력: {DEMO_MESSAGE}</p>

        {loading && (
          <div className="mt-6 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
            데모 실행 중...
          </div>
        )}

        {!loading && result && (
          <div className="mt-6 space-y-3">
            <span className="inline-block rounded-full bg-slate-900 px-3 py-1 text-xs font-semibold text-white">
              {badge}
            </span>
            {typeof result.rawStatus === "number" && (
              <p className="text-xs text-slate-500">HTTP status: {result.rawStatus}</p>
            )}
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm leading-relaxed text-slate-800">
              {result.answer}
            </div>
          </div>
        )}

        {error && (
          <div className="mt-4 rounded-lg border border-rose-200 bg-rose-50 p-3 text-xs text-rose-700">{error}</div>
        )}

        <div className="mt-6 flex flex-wrap gap-3">
          <button
            type="button"
            onClick={() => navigate("/feedback")}
            className="rounded-lg bg-indigo-600 px-5 py-3 text-sm font-semibold text-white hover:bg-indigo-700"
          >
            피드백 남기기
          </button>
          <button
            type="button"
            onClick={() => navigate("/demo")}
            className="rounded-lg border border-slate-300 bg-white px-5 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-50"
          >
            데모 다시 실행
          </button>
        </div>
      </div>
    </div>
  );
}
