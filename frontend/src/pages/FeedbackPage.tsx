import React, { FormEvent, useMemo, useState } from "react";
import { Link } from "react-router-dom";

type FeedbackPayload = {
  name: string;
  email: string;
  feedback: string;
  submittedAt: string;
};

export default function FeedbackPage() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [feedback, setFeedback] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const formspreeEndpoint = (import.meta.env.VITE_FORMSPREE_ENDPOINT as string | undefined)?.trim();
  const usingLocalStorage = useMemo(() => !formspreeEndpoint, [formspreeEndpoint]);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setMessage(null);

    const payload: FeedbackPayload = {
      name: name.trim(),
      email: email.trim(),
      feedback: feedback.trim(),
      submittedAt: new Date().toISOString(),
    };

    if (!payload.feedback) {
      setMessage("피드백 내용을 입력해 주세요.");
      return;
    }

    if (usingLocalStorage) {
      const key = "demo_feedback_items";
      const existing = JSON.parse(localStorage.getItem(key) || "[]") as FeedbackPayload[];
      existing.push(payload);
      localStorage.setItem(key, JSON.stringify(existing));
      setSaved(true);
      setMessage("로컬 저장 완료: PR3에서 Formspree 실연동 예정입니다.");
      return;
    }

    try {
      const res = await fetch(formspreeEndpoint as string, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        setMessage("폼 전송 실패: 잠시 후 다시 시도해 주세요.");
        return;
      }

      setSaved(true);
      setMessage("피드백이 전송되었습니다. 감사합니다.");
    } catch {
      setMessage("네트워크 오류로 전송에 실패했습니다.");
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 px-4 py-10">
      <div className="mx-auto max-w-xl rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <h1 className="text-2xl font-bold text-slate-900">피드백</h1>
        <p className="mt-2 text-sm text-slate-600">심사자 코멘트를 남겨주세요.</p>

        {usingLocalStorage && (
          <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
            `VITE_FORMSPREE_ENDPOINT` 미설정: 현재는 로컬 저장 모드입니다.
          </div>
        )}

        <form className="mt-6 space-y-4" onSubmit={onSubmit}>
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">이름</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-indigo-500"
              placeholder="선택 입력"
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">이메일</label>
            <input
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-indigo-500"
              placeholder="선택 입력"
              type="email"
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">피드백</label>
            <textarea
              value={feedback}
              onChange={(e) => setFeedback(e.target.value)}
              className="min-h-[120px] w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-indigo-500"
              placeholder="데모에서 확인한 점을 적어 주세요."
              required
            />
          </div>

          <div className="flex flex-wrap gap-3">
            <button
              type="submit"
              className="rounded-lg bg-indigo-600 px-5 py-3 text-sm font-semibold text-white hover:bg-indigo-700"
            >
              {saved ? "저장됨" : "피드백 제출"}
            </button>
            <Link
              to="/demo/result"
              className="rounded-lg border border-slate-300 bg-white px-5 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-50"
            >
              결과로 돌아가기
            </Link>
          </div>
        </form>

        {message && <p className="mt-4 text-sm text-slate-700">{message}</p>}
      </div>
    </div>
  );
}
