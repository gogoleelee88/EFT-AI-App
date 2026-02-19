import React from "react";
import { useNavigate } from "react-router-dom";

export default function DemoStartPage() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-slate-50 px-4 py-10">
      <div className="mx-auto max-w-2xl rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <h1 className="text-2xl font-bold text-slate-900">심사자 데모 시작</h1>
        <p className="mt-2 text-sm text-slate-600">
          3클릭 데모 동선: 홈 → 데모 실행 → 결과 확인 → 피드백
        </p>

        <div className="mt-6 space-y-3 rounded-xl bg-slate-100 p-4 text-sm text-slate-700">
          <p>1) 아래 버튼으로 데모 실행 화면으로 이동</p>
          <p>2) 결과 페이지에서 AI 응답 확인</p>
          <p>3) 피드백 페이지로 이동해 코멘트 제출</p>
        </div>

        <div className="mt-6 flex flex-wrap gap-3">
          <button
            type="button"
            onClick={() => navigate("/demo/result")}
            className="rounded-lg bg-amber-500 px-5 py-3 text-sm font-semibold text-white hover:bg-amber-600"
          >
            데모 실행
          </button>
          <button
            type="button"
            onClick={() => navigate("/eft-strict")}
            className="rounded-lg border border-slate-300 bg-white px-5 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-50"
          >
            전체 플로우 보기 (/eft-strict)
          </button>
        </div>
      </div>
    </div>
  );
}
