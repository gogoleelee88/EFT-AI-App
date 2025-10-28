import React from "react";
import { useNavigate } from "react-router-dom";
import { SUDSBanner } from "./SUDSBanner";
import { parseActions, Action } from "@/lib/parseActions";
import { normalizeAction } from "@/lib/normalizeAction";
import { recordSuds } from "@/services/serverAI";

export function ActionRunner({ actions }: { actions: any[] }) {
  const nav = useNavigate();
  const acts: Action[] = parseActions(actions).map(normalizeAction);

  const lastStartRef = React.useRef<string | null>(null);

  React.useEffect(() => {
    const immediate = acts.find((a) => a.type === "start_eftar");
    if (!immediate) {
      lastStartRef.current = null;
      return;
    }
    const p = immediate.payload || {};
    const signature = `${p.route || "/eftar"}|${p.script || "standard_relief"}|${p.suds ?? ""}`;
    if (lastStartRef.current === signature) {
      return;
    }
    lastStartRef.current = signature;
    nav(
      `${p.route || "/eftar"}?script=${encodeURIComponent(p.script || "standard_relief")}` +
        `${p.suds != null ? `&suds=${p.suds}` : ""}`
    );
  }, [acts, nav]);

  async function sendSuds(score: number) {
    const result = await recordSuds({ score, source: "compare" });
    if (!result.ok) {
      // eslint-disable-next-line no-console
      console.warn("[suds] failed to record SUDS", result.error);
      return;
    }

    const next = parseActions(result.actions || [])
      .map(normalizeAction)
      .find((a) => a.type === "start_eftar");
    if (next) {
      const p = next.payload || {};
      // eslint-disable-next-line no-console
      console.log("✅ actions received → banner rendered → route changed");
      // eslint-disable-next-line no-console
      console.log("✅ Full EFT Loop: emotion→EFT suggestion→SUDS→EFT AR confirmed.");
      nav(
        `${p.route || "/eftar"}?script=${encodeURIComponent(p.script || "standard_relief")}` +
          `${p.suds != null ? `&suds=${p.suds}` : ""}`
      );
    } else {
      // eslint-disable-next-line no-console
      console.warn("[suds] no start_eftar in response", result);
    }
  }

  return (
    <>
      {acts.map((a, i) => {
        if (a.type === "ask_suds") {
          const p = a.payload || {};
          return p.ui === "banner" ? (
            <SUDSBanner key={i} payload={p} onSubmit={sendSuds} />
          ) : (
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
              <div className="text-sm opacity-80">{p.reason ?? "감정 완화를 위해 EFT를 제안합니다."}</div>
            </div>
          );
        }
        if (a.type === "start_eftar") {
          return null;
        }
        // eslint-disable-next-line no-console
        console.warn("[actions] unhandled action type:", a);
        return null;
      })}
    </>
  );
}
