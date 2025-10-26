import React from "react";
import { useNavigate } from "react-router-dom";
import { SUDSBanner } from "./SUDSBanner";
import { normalizeAction } from "@/lib/normalizeAction";

type Action = { type: string; payload?: any };

export function ActionRunner({ actions }: { actions: Action[] }) {
  const nav = useNavigate();

  async function sendSuds(score: number) {
    const res = await fetch("/api/suds/record", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ score, source: "compare" }),
    });
    const data = await res.json();
    const next = (data.actions || []).map(normalizeAction).find((a: Action) => a.type === "start_eftar");
    if (next) {
      const p = next.payload || {};
      nav(
        `${p.route || "/eftar"}?script=${encodeURIComponent(p.script || "standard_relief")}` +
          `${p.suds != null ? `&suds=${p.suds}` : ""}`
      );
    }
  }

  return (
    <>
      {actions.map((raw, i) => {
        const a = raw;
        if (a.type === "ask_suds") {
          const p = a.payload || {};
          if (p.ui === "banner") return <SUDSBanner key={i} payload={p} onSubmit={sendSuds} />;
          return (
            <div key={i} className="p-3 rounded-xl border bg-white">
              <div className="font-semibold">SUDS 측정</div>
              <div className="text-sm opacity-80">지금 느끼는 강도를 0~10 중 숫자로 입력해 주세요.</div>
            </div>
          );
        }
        if (a.type === "suggest_eft") {
          const p = a.payload || {};
          return (
            <div key={i} className="p-3 rounded-xl border bg-emerald-50">
              <div className="font-semibold">EFT 제안</div>
              <div className="text-sm opacity-80">
                {p.reason ? `사유: ${p.reason}` : "감정 완화를 위해 EFT를 제안합니다."}
              </div>
            </div>
          );
        }
        return null;
      })}
    </>
  );
}
