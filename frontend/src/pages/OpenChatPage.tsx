import { FormEvent, KeyboardEvent, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";

type OpenChatRole = "user" | "assistant";

type OpenChatMessage = {
  id: string;
  role: OpenChatRole;
  content: string;
};

type OpenChatApiResponse = {
  session_id?: string;
  assistant_message?: string;
  response?: string;
};

const SOOGYEONG_ROOM_ID = "7465e17d-a496-40f1-b682-1a2d4b382c23";
const SOURCE_USER_EMAIL = "isugyeong332@gmail.com";
const TARGET_USER_EMAIL = "leesoogyoungbiz88@gmail.com";

function makeMessageId(): string {
  return `${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

async function parseError(response: Response): Promise<string> {
  try {
    const data = await response.json();
    if (typeof data?.detail === "string" && data.detail.trim()) {
      return data.detail;
    }
    if (typeof data?.message === "string" && data.message.trim()) {
      return data.message;
    }
  } catch {
    // Ignore parse failures and fallback to status text.
  }
  return `요청 처리 중 오류가 발생했습니다. (${response.status} ${response.statusText})`;
}

export default function OpenChatPage() {
  const navigate = useNavigate();
  const [messages, setMessages] = useState<OpenChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const listEndRef = useRef<HTMLDivElement | null>(null);

  const historyPayload = useMemo(
    () =>
      messages.map((message) => ({
        role: message.role,
        content: message.content,
      })),
    [messages],
  );

  useEffect(() => {
    listEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  const sendMessage = async () => {
    const text = input.trim();
    if (!text || loading) return;

    const userMessage: OpenChatMessage = {
      id: makeMessageId(),
      role: "user",
      content: text,
    };

    setMessages((prev) => [...prev, userMessage]);
    setInput("");
    setLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/openchat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: text,
          session_id: sessionId ?? undefined,
          history: historyPayload,
        }),
      });

      if (!response.ok) {
        throw new Error(await parseError(response));
      }

      const data = (await response.json()) as OpenChatApiResponse;
      const assistantText = (data.assistant_message || data.response || "").trim();
  const fallbackText = "응답이 비어있습니다. 잠시 후에 다시 시도해주세요.";

      setMessages((prev) => [
        ...prev,
        {
          id: makeMessageId(),
          role: "assistant",
          content: assistantText || fallbackText,
        },
      ]);

      if (typeof data.session_id === "string" && data.session_id.trim()) {
        setSessionId(data.session_id);
      }
    } catch (err) {
      const message =
        err instanceof Error
          ? err.message
          : "요청을 처리하는 중 문제가 발생했습니다. 다시 시도해주세요.";
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    await sendMessage();
  };

  const onInputKeyDown = async (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      await sendMessage();
    }
  };

  const handleOpenSoogyeongRoom = () => {
    const params = new URLSearchParams();
    const aiDraft =
      [...messages]
        .reverse()
        .find((message) => message.role === "assistant" && message.content.trim())?.content.trim() ?? "";
    const prefill = aiDraft || input.trim();
    if (prefill) {
      params.set("prefill", prefill);
    }
    params.set("source_user", SOURCE_USER_EMAIL);
    params.set("target_user", TARGET_USER_EMAIL);
    const query = params.toString();
    navigate(`/chat/rooms/${SOOGYEONG_ROOM_ID}${query ? `?${query}` : ""}`);
  };

  return (
    <div className="min-h-screen bg-slate-50 py-8">
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-4 px-4">
        <div className="flex items-center justify-end">
          <div className="flex flex-col items-end gap-2">
            <button
              type="button"
              onClick={handleOpenSoogyeongRoom}
              className="inline-flex items-center gap-2 rounded-xl bg-violet-600 px-3 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-violet-700"
            >
              <svg
                aria-hidden="true"
                viewBox="0 0 24 24"
                className="h-4 w-4"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M3 12a9 9 0 0 0 15.5 6.36L21 21l-2.64-2.5A9 9 0 1 0 3 12z" />
              </svg>
              수경 채팅방 초안 추천
            </button>
            
            <Link
              to="/chat/rooms"
              className="inline-flex items-center gap-2 rounded-xl bg-sky-500 px-3 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-sky-600"
            >
              <svg
                aria-hidden="true"
                viewBox="0 0 24 24"
                className="h-4 w-4"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
              </svg>
              채팅방
            </Link>
            
            <Link
              to="/menstrual"
              className="inline-flex items-center gap-2 rounded-xl bg-rose-500 px-3 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-rose-600"
            >
              <span aria-hidden="true" className="text-base leading-none">
                🩸
              </span>
              생리 모듈
            </Link>
            
            <Link
              to="/meal-coach"
              className="inline-flex items-center gap-2 rounded-xl bg-emerald-500 px-3 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-600"
            >
              <svg
                aria-hidden="true"
                viewBox="0 0 24 24"
                className="h-4 w-4"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M4 3v7a2 2 0 0 0 2 2h1v9" />
                <path d="M9 3v7a2 2 0 0 1-2 2" />
                <path d="M14 3h2a4 4 0 0 1 4 4v14" />
                <path d="M14 7h6" />
              </svg>
              밀코치
            </Link>
            <Link
              to="/emotion-sessions"
              className="inline-flex items-center gap-2 rounded-xl bg-rose-500 px-3 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-rose-600"
            >
              감정기록
            </Link>
            <Link
              to="/work-guide-demo"
              className="inline-flex items-center gap-2 rounded-xl bg-amber-500 px-3 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-amber-600"
            >
              막힘
            </Link>

          </div>
        </div>

        <div className="h-[62vh] overflow-y-auto rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="space-y-3">
            {messages.map((message) => (
              <div
                key={message.id}
                className={`flex ${message.role === "user" ? "justify-end" : "justify-start"}`}
              >
                <div
                  className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm leading-relaxed ${
                    message.role === "user"
                      ? "bg-indigo-600 text-white"
                      : "bg-slate-100 text-slate-800"
                  }`}
                >
                  {message.content}
                </div>
              </div>
            ))}

            {loading && (
              <div className="flex justify-start">
                <div className="rounded-2xl bg-slate-100 px-4 py-3 text-sm text-slate-600">
                  응답을 생성 중입니다...
                </div>
              </div>
            )}

            <div ref={listEndRef} />
          </div>
        </div>

        {error && (
          <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
            {error}
          </div>
        )}

        <form onSubmit={onSubmit} className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
          <div className="flex items-end gap-3">
            <textarea
              value={input}
              onChange={(event) => setInput(event.target.value)}
              onKeyDown={onInputKeyDown}
              placeholder="메시지를 입력하세요..."
              className="min-h-[48px] flex-1 resize-none rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200"
              disabled={loading}
            />
            <button
              type="submit"
              disabled={loading || !input.trim()}
              className="rounded-xl bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:bg-slate-300"
            >
              전송
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}




