import React, { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import { generateProposal, streamProposal } from "../services/proposalService";
import { proposalSessionStore } from "../stores/proposalSessionStore";
import type { ProposalResponse } from "../types/proposalOS";

const MorningBriefPage: React.FC = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const userId = useMemo(() => user?.uid || "demo-user", [user?.uid]);

  const [conditionNote, setConditionNote] = useState("");
  const [availableMinutes, setAvailableMinutes] = useState(240);
  const [fixedEventsText, setFixedEventsText] = useState("");
  const [proposal, setProposal] = useState<ProposalResponse | null>(null);
  const [status, setStatus] = useState("Idle");
  const [loading, setLoading] = useState(false);
  const [events, setEvents] = useState<string[]>([]);

  const unsubscribeRef = useRef<(() => void) | null>(null);

  const pushEvent = (line: string) => {
    setEvents((prev) => [line, ...prev].slice(0, 20));
  };

  const handleGenerate = async () => {
    setLoading(true);
    setStatus("Generating Phase-1");
    setEvents([]);
    if (unsubscribeRef.current) {
      unsubscribeRef.current();
      unsubscribeRef.current = null;
    }

    try {
      const next = await generateProposal({
        user_id: userId,
        context: {
          condition_note: conditionNote || undefined,
          available_minutes: availableMinutes,
          fixed_events: fixedEventsText
            .split(/\n|,/g)
            .map((v) => v.trim())
            .filter(Boolean),
        },
      });

      setProposal(next);
      proposalSessionStore.setProposal(next);
      localStorage.setItem("lastProposalId", next.proposal_id);
      setStatus("Phase-1 ready, waiting Phase-2");
      pushEvent("phase1.ready");

      const unsubscribe = streamProposal(
        next.proposal_id,
        (event, data) => {
          pushEvent(event);
          setProposal((prev) => {
            if (!prev) return prev;
            if (event === "proposal.phase2_started") {
              const nextProposal = { ...prev, phase: "phase2" as const };
              proposalSessionStore.setProposal(nextProposal);
              return nextProposal;
            }
            if (event === "evidence.updated") {
              const nextProposal = {
                ...prev,
                evidence_cards: data.evidence_cards || prev.evidence_cards,
              };
              proposalSessionStore.setProposal(nextProposal);
              return nextProposal;
            }
            if (event === "research.completed") {
              const nextProposal = {
                ...prev,
                research_pack: data.research_pack || prev.research_pack,
              };
              proposalSessionStore.setProposal(nextProposal);
              return nextProposal;
            }
            if (event === "draft.updated") {
              const nextProposal = {
                ...prev,
                drafts: data.drafts || prev.drafts,
              };
              proposalSessionStore.setProposal(nextProposal);
              return nextProposal;
            }
            if (event === "checklist.updated") {
              const nextProposal = {
                ...prev,
                checklist: data.checklist || prev.checklist,
              };
              proposalSessionStore.setProposal(nextProposal);
              return nextProposal;
            }
            if (event === "done" && data?.proposal) {
              const doneProposal = data.proposal as ProposalResponse;
              proposalSessionStore.setProposal(doneProposal);
              localStorage.setItem("lastProposalId", doneProposal.proposal_id);
              return doneProposal;
            }
            return prev;
          });

          if (event === "proposal.phase2_started") setStatus("Phase-2 refining");
          if (event === "done") setStatus("Done");
        },
        () => setStatus("SSE error")
      );
      unsubscribeRef.current = unsubscribe;
    } catch (e) {
      setStatus(e instanceof Error ? e.message : "Generate failed");
    } finally {
      setLoading(false);
    }
  };

  const openExecuteBoard = () => {
    if (!proposal) return;
    proposalSessionStore.setProposal(proposal);
    localStorage.setItem("lastProposalId", proposal.proposal_id);
    navigate("/execute-board");
  };

  useEffect(() => {
    return () => {
      if (unsubscribeRef.current) {
        unsubscribeRef.current();
        unsubscribeRef.current = null;
      }
    };
  }, []);

  return (
    <div className="max-w-5xl mx-auto px-4 py-6 space-y-6">
      <h1 className="text-2xl font-bold text-gray-900">Morning Brief</h1>
      <p className="text-sm text-gray-600">User ID: {userId}</p>

      <section className="bg-white border rounded-lg p-4 space-y-3">
        <textarea
          className="w-full border rounded px-3 py-2"
          rows={2}
          placeholder="Condition note"
          value={conditionNote}
          onChange={(e) => setConditionNote(e.target.value)}
        />
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <input
            type="number"
            className="border rounded px-3 py-2"
            value={availableMinutes}
            onChange={(e) => setAvailableMinutes(Number(e.target.value))}
            min={30}
            max={720}
          />
          <input
            className="border rounded px-3 py-2"
            placeholder="Fixed events (comma/newline)"
            value={fixedEventsText}
            onChange={(e) => setFixedEventsText(e.target.value)}
          />
        </div>
        <div className="flex items-center gap-3">
          <button
            className="px-4 py-2 rounded bg-blue-600 text-white disabled:opacity-60"
            onClick={handleGenerate}
            disabled={loading}
          >
            {loading ? "Generating..." : "Generate Proposal"}
          </button>
          <span className="text-sm text-gray-700">{status}</span>
          {proposal && (
            <button className="px-4 py-2 rounded border" onClick={openExecuteBoard}>
              Open Execute Board
            </button>
          )}
        </div>
      </section>

      {proposal && (
        <section className="bg-white border rounded-lg p-4 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold">Proposal Card</h2>
            <div className="text-sm text-gray-600">
              {proposal.phase} | role: {proposal.role_inference} | confidence: {proposal.confidence}
            </div>
          </div>

          <div>
            <h3 className="font-medium mb-2">Today To-do</h3>
            <ul className="space-y-2">
              {proposal.today_todos.map((t) => (
                <li key={`${t.task_id}-${t.title}`} className="border rounded p-3">
                  <div className="font-medium">{t.title}</div>
                  <div className="text-sm text-gray-700">{t.description}</div>
                  <div className="text-xs text-gray-500">
                    {t.duration_minutes}m | priority {t.priority} | status {t.status}
                  </div>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <h3 className="font-medium mb-2">Draft Skeleton</h3>
            <ul className="space-y-2">
              {proposal.drafts.map((d) => (
                <li key={`${d.draft_id}-${d.title}`} className="border rounded p-3">
                  <div className="font-medium">{d.title}</div>
                  <pre className="text-xs whitespace-pre-wrap text-gray-700">{d.content}</pre>
                </li>
              ))}
            </ul>
          </div>
        </section>
      )}

      <section className="bg-white border rounded-lg p-4">
        <h2 className="font-semibold mb-2">SSE Event Log</h2>
        <ul className="space-y-1 text-sm text-gray-700">
          {events.map((evt, idx) => (
            <li key={`${evt}-${idx}`}>{evt}</li>
          ))}
        </ul>
      </section>
    </div>
  );
};

export default MorningBriefPage;
