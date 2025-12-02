import React from "react";
import { ActionRunner } from "@/components/ActionRunner";

//===========감정후보때문에 추가한 코드
// 🔹 /api/emotion/candidates 응답용 타입
interface EmotionCandidate {
  label: string;
  reason: string;
  confidence: number;
}

// 🔹 /api/chat/compare 응답용 최소 타입
interface CompareResponse {
  actions?: any[];
  needs_emotion_choice?: boolean;
}

//===========

export default function CompareChat() {
  const [actions, setActions] = React.useState<any[]>([]);
  const [text, setText] = React.useState("");

  //==감정 후보때문에 추가한 코드
  // 🔹 감정 선택 모드 여부
  const [needsEmotionChoice, setNeedsEmotionChoice] = React.useState(false);
  // 🔹 감정 후보 리스트
  const [emotionCandidates, setEmotionCandidates] = React.useState<EmotionCandidate[]>([]);

  // 세션 ID (지금은 백엔드랑 맞추려고 dev 고정)
  const sessionId = "dev";

  //===============================

  // async function send() { 
  //   const res = await fetch("/api/chat/compare", {
  //     method: "POST",
  //     headers: { "Content-Type": "application/json" },
  //     body: JSON.stringify({ message: text, session_id: "dev" }),
  //   });
  //   // eslint-disable-next-line no-console
  //   console.log("X-Debug-Actions:", res.headers.get("X-Debug-Actions"));
  //   // eslint-disable-next-line no-console
  //   console.log("X-Actions-Hash:", res.headers.get("X-Actions-Hash"));

  //   const data = await res.json();
  //   setActions(data.actions || []);
  // }

  async function send() {
    const res = await fetch("/api/chat/compare", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: text, session_id: sessionId }),
    });
    // eslint-disable-next-line no-console
    console.log("X-Debug-Actions:", res.headers.get("X-Debug-Actions"));
    // eslint-disable-next-line no-console
    console.log("X-Actions-Hash:", res.headers.get("X-Actions-Hash"));

    const data: CompareResponse & { actions?: any[] } = await res.json();

    // 🔥 백엔드가 "감정 후보 선택 필요"라고 알려준 경우
    if (data.needs_emotion_choice === true) {
      setNeedsEmotionChoice(true);
      setActions([]);      // 기존 액션 숨기기
      setText("");         // 입력창 비우기
      await fetchEmotionCandidates(); // 감정 후보 불러오기
    } else {
      // 평소처럼 액션 실행
      setNeedsEmotionChoice(false);
      setEmotionCandidates([]);
      setActions(data.actions || []);
    }
  }

  // =======================================
  // /api/emotion/candidates 호출 (후보 목록)
  // =======================================
  async function fetchEmotionCandidates() {
    try {
      const res = await fetch("/api/emotion/candidates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ session_id: sessionId }),
      });

      const data = await res.json();

      const list: EmotionCandidate[] = Array.isArray(data.candidates)
        ? data.candidates.map((c: any) => ({
            label: String(c.label ?? ""),
            reason: String(c.reason ?? ""),
            confidence:
              typeof c.confidence === "number"
                ? c.confidence
                : parseFloat(c.confidence || "0") || 0,
          }))
        : [];

      setEmotionCandidates(list);
    } catch (err) {
      console.error("Error fetching emotion candidates:", err);
      setEmotionCandidates([]);
    }
  }

  // ==================================
  // /api/emotion/choice 호출 (선택)
  // ==================================
  async function handleEmotionChoice(emotionLabel: string) {
    try {
      const res = await fetch("/api/emotion/choice", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          session_id: sessionId,
          core_emotion: emotionLabel,
        }),
      });

      const data = await res.json();

      // 감정 선택 이후에는 다시 액션 모드로 복귀
      setNeedsEmotionChoice(false);
      setEmotionCandidates([]);
      setActions(data.actions || []);
    } catch (err) {
      console.error("Error submitting emotion choice:", err);
    }
  }




//   return (
//     <div className="max-w-2xl mx-auto p-4 space-y-4">
//       <div className="flex gap-2">
//         <input
//           className="flex-1 border p-2 rounded"
//           value={text}
//           onChange={(e) => setText(e.target.value)}
//           placeholder="메시지를 입력하세요"
//         />
//         <button className="px-3 py-2 bg-black text-white rounded" onClick={send}>
//           보내기
//         </button>
//       </div>
//       <ActionRunner actions={actions} />
//     </div>
//   );
// }

  return (
    <div className="max-w-2xl mx-auto p-4 space-y-4">
      <div className="flex gap-2">
        <input
          className="flex-1 border p-2 rounded"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="메시지를 입력하세요"
          // 감정 선택 중에는 입력 비활성화
          disabled={needsEmotionChoice}
        />
        <button
          className="px-3 py-2 bg-black text-white rounded disabled:bg-gray-400"
          onClick={send}
          // 감정 선택 중에는 보내기 막기
          disabled={needsEmotionChoice}
        >
          보내기
        </button>
      </div>

      {needsEmotionChoice && emotionCandidates.length > 0 ? (
        // 🔹 감정 후보 선택 모드
        <div className="p-4 border rounded-md bg-gray-50 space-y-3">
          <h3 className="font-semibold text-center">
            지금 상태와 가장 가까운 감정을 선택해볼까요?
          </h3>

          <div className="flex flex-col gap-2">
            {emotionCandidates.map((c, idx) => {
              const isTop = idx === 0; // 1순위 후보만 ⭐
              const star = isTop ? " ⭐" : "";
              const probStr = c.confidence.toFixed(2); // 0.87 이런 느낌

              return (
                <button
                  key={c.label + idx}
                  onClick={() => handleEmotionChoice(c.label)}
                  className="w-full text-left px-4 py-3 bg-white border rounded-lg hover:bg-blue-50 transition-colors"
                >
                  <div className="font-semibold">
                    [{c.label}
                    {star}] 확률: {probStr}
                  </div>
                  {c.reason && (
                    <div className="text-sm text-gray-600">
                      이유: "{c.reason}"
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      ) : (
        // 🔹 평소 모드: 기존 ActionRunner
        <ActionRunner actions={actions} />
      )}
    </div>
  );
}
