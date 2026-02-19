import React, { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import {
  getProposal,
  listProofLogs,
  submitProofLog,
  updateProposalDraft,
  updateProposalTaskStatus,
} from "../services/proposalService";
import { proposalSessionStore, useProposalSessionStore } from "../stores/proposalSessionStore";
import type { ProposalResponse, ProposalTaskStatus } from "../types/proposalOS";

type ProofLogRow = {
  prooflog_id: number;
  proposal_id: string;
  task_id?: number;
  user_id: string;
  proof_url: string;
  note?: string;
  submitted_at: string;
};

const ExecuteBoardPage: React.FC = () => {
  const { user } = useAuth();
  const userId = useMemo(() => user?.uid || "demo-user", [user?.uid]);
  const session = useProposalSessionStore();
  const [searchParams] = useSearchParams();

  const proposalId =
    session.proposalId ||
    searchParams.get("proposal_id") ||
    localStorage.getItem("lastProposalId") ||
    "";

  const [proposal, setProposal] = useState<ProposalResponse | null>(session.proposal || null);
  const [draftEdits, setDraftEdits] = useState<Record<number, string>>({});
  const [proofLogs, setProofLogs] = useState<ProofLogRow[]>([]);
  const [proofTaskId, setProofTaskId] = useState<number | "">("");
  const [proofUrl, setProofUrl] = useState("");
  const [proofNote, setProofNote] = useState("");
  const [status, setStatus] = useState("");
  const [loading, setLoading] = useState(false);

  const loadProofLogs = async (nextProposalId: string) => {
    const rows = await listProofLogs(nextProposalId);
    setProofLogs(rows as ProofLogRow[]);
  };

  const loadData = async () => {
    if (!proposalId) return;
    setLoading(true);
    setStatus("");
    try {
      const detail = await getProposal(proposalId);
      setProposal(detail);
      proposalSessionStore.setProposal(detail);
      localStorage.setItem("lastProposalId", detail.proposal_id);
      await loadProofLogs(proposalId);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Failed to load proposal");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (session.proposal && session.proposal.proposal_id === proposalId) {
      setProposal(session.proposal);
      localStorage.setItem("lastProposalId", session.proposal.proposal_id);
    }
  }, [proposalId, session.proposal]);

  useEffect(() => {
    void loadData();
  }, [proposalId]);

  const patchTaskStatus = async (taskId: number, nextStatus: ProposalTaskStatus) => {
    if (!proposalId) return;
    try {
      const next = await updateProposalTaskStatus(proposalId, taskId, nextStatus);
      setProposal(next);
      proposalSessionStore.setProposal(next);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Failed to update task status");
    }
  };

  const saveDraft = async (draftId: number) => {
    if (!proposalId) return;
    const content = draftEdits[draftId];
    if (!content) return;
    try {
      const next = await updateProposalDraft(proposalId, draftId, content, "edited");
      setProposal(next);
      proposalSessionStore.setProposal(next);
      setStatus("Draft updated");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Failed to update draft");
    }
  };

  const onSubmitProof = async () => {
    if (!proposalId || !proofUrl.trim()) return;
    try {
      await submitProofLog(proposalId, {
        user_id: userId,
        task_id: proofTaskId === "" ? undefined : proofTaskId,
        proof_url: proofUrl.trim(),
        note: proofNote || undefined,
      });
      setProofUrl("");
      setProofNote("");
      setProofTaskId("");
      setStatus("ProofLog submitted");
      await loadProofLogs(proposalId);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Failed to submit ProofLog");
    }
  };

  if (!proposalId) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-6">
        <p className="text-gray-700">
          No proposal selected. Generate one in Morning Brief first.
        </p>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto px-4 py-6 space-y-6">
      <h1 className="text-2xl font-bold text-gray-900">Execute Board</h1>
      <p className="text-sm text-gray-600">proposal_id: {proposalId}</p>
      {status && <p className="text-sm text-gray-700">{status}</p>}
      {loading && <p className="text-sm text-gray-500">Loading...</p>}

      {proposal && (
        <>
          <section className="bg-white border rounded-lg p-4">
            <h2 className="font-semibold mb-3">Task Board</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {proposal.today_todos.map((task) => (
                <div key={`${task.task_id}-${task.title}`} className="border rounded p-3 space-y-2">
                  <div className="font-medium">{task.title}</div>
                  <div className="text-sm text-gray-700">{task.description}</div>
                  <div className="text-xs text-gray-500">
                    {task.duration_minutes}m | priority {task.priority}
                  </div>
                  {task.task_id && (
                    <select
                      className="border rounded px-2 py-1 text-sm"
                      value={task.status}
                      onChange={(e) =>
                        patchTaskStatus(task.task_id!, e.target.value as ProposalTaskStatus)
                      }
                    >
                      <option value="todo">todo</option>
                      <option value="in_progress">in_progress</option>
                      <option value="done">done</option>
                      <option value="blocked">blocked</option>
                    </select>
                  )}
                </div>
              ))}
            </div>
          </section>

          <section className="bg-white border rounded-lg p-4 space-y-3">
            <h2 className="font-semibold">Draft Editor</h2>
            {proposal.drafts.map((draft) => (
              <div key={`${draft.draft_id}-${draft.title}`} className="border rounded p-3 space-y-2">
                <div className="font-medium">{draft.title}</div>
                <textarea
                  className="w-full border rounded px-3 py-2 text-sm"
                  rows={6}
                  value={draftEdits[draft.draft_id || 0] ?? draft.content}
                  onChange={(e) =>
                    setDraftEdits((prev) => ({
                      ...prev,
                      [draft.draft_id || 0]: e.target.value,
                    }))
                  }
                />
                {draft.draft_id && (
                  <button
                    className="px-3 py-1 rounded bg-blue-600 text-white text-sm"
                    onClick={() => saveDraft(draft.draft_id!)}
                  >
                    Save Draft
                  </button>
                )}
              </div>
            ))}
          </section>

          <section className="bg-white border rounded-lg p-4 space-y-3">
            <h2 className="font-semibold">ProofLog</h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <select
                className="border rounded px-3 py-2"
                value={proofTaskId}
                onChange={(e) => setProofTaskId(e.target.value ? Number(e.target.value) : "")}
              >
                <option value="">Task (optional)</option>
                {proposal.today_todos
                  .filter((task) => task.task_id)
                  .map((task) => (
                    <option key={task.task_id} value={task.task_id}>
                      {task.title}
                    </option>
                  ))}
              </select>
              <input
                className="border rounded px-3 py-2 md:col-span-2"
                placeholder="Proof URL"
                value={proofUrl}
                onChange={(e) => setProofUrl(e.target.value)}
              />
            </div>
            <textarea
              className="w-full border rounded px-3 py-2"
              rows={2}
              placeholder="Note (optional)"
              value={proofNote}
              onChange={(e) => setProofNote(e.target.value)}
            />
            <button className="px-4 py-2 rounded bg-blue-600 text-white" onClick={onSubmitProof}>
              Submit ProofLog
            </button>

            <div className="space-y-2">
              {proofLogs.map((row) => (
                <div key={row.prooflog_id} className="border rounded p-2 text-sm">
                  <div>
                    task_id: {row.task_id ?? "-"} | {new Date(row.submitted_at).toLocaleString()}
                  </div>
                  <a
                    className="text-blue-700 underline break-all"
                    href={row.proof_url}
                    target="_blank"
                    rel="noreferrer"
                  >
                    {row.proof_url}
                  </a>
                  {row.note && <div className="text-gray-700">{row.note}</div>}
                </div>
              ))}
            </div>
          </section>
        </>
      )}
    </div>
  );
};

export default ExecuteBoardPage;
