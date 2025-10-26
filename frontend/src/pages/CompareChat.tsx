import React from "react";
import { ActionRunner } from "@/components/ActionRunner";

export default function CompareChat() {
  const [actions, setActions] = React.useState<any[]>([]);
  const [text, setText] = React.useState("");

  async function send() {
    const res = await fetch("/api/chat/compare", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: text, session_id: "dev" }),
    });
    // eslint-disable-next-line no-console
    console.log("X-Debug-Actions:", res.headers.get("X-Debug-Actions"));
    // eslint-disable-next-line no-console
    console.log("X-Actions-Hash:", res.headers.get("X-Actions-Hash"));

    const data = await res.json();
    setActions(data.actions || []);
  }

  return (
    <div className="max-w-2xl mx-auto p-4 space-y-4">
      <div className="flex gap-2">
        <input
          className="flex-1 border p-2 rounded"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="메시지를 입력하세요"
        />
        <button className="px-3 py-2 bg-black text-white rounded" onClick={send}>
          보내기
        </button>
      </div>
      <ActionRunner actions={actions} />
    </div>
  );
}
