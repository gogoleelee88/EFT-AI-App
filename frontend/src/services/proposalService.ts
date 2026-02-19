import type {
  AspirationProfilePayload,
  CapabilityProfilePayload,
  ProofLogPayload,
  ProposalResponse,
  ProposalSSEEventType,
  SignalIngestPayload,
} from "../types/proposalOS";

type EventCallback = (event: ProposalSSEEventType, data: any) => void;

async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    credentials: "include",
    ...init,
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || `HTTP ${res.status}`);
  }
  return (await res.json()) as T;
}

export function upsertAspirationProfile(payload: AspirationProfilePayload) {
  return requestJson("/api/profiles/aspiration", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}

export function upsertCapabilityProfile(payload: CapabilityProfilePayload) {
  return requestJson("/api/profiles/capability", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}

export function ingestSignal(payload: SignalIngestPayload) {
  return requestJson("/api/signal/ingest", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}

export function listSignals(userId: string) {
  return requestJson(`/api/signal/list?user_id=${encodeURIComponent(userId)}`);
}

export function generateProposal(payload: {
  user_id: string;
  proposal_date?: string;
  context?: {
    condition_note?: string;
    available_minutes?: number;
    fixed_events?: string[];
  };
}) {
  return requestJson<ProposalResponse>("/api/proposal/generate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}

export function getProposal(proposalId: string) {
  return requestJson<ProposalResponse>(`/api/proposal/${encodeURIComponent(proposalId)}`);
}

export function updateProposalTaskStatus(
  proposalId: string,
  taskId: number,
  status: "todo" | "in_progress" | "done" | "blocked"
) {
  return requestJson<ProposalResponse>(
    `/api/proposal/${encodeURIComponent(proposalId)}/task/${taskId}`,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    }
  );
}

export function updateProposalDraft(
  proposalId: string,
  draftId: number,
  content: string,
  status?: string
) {
  return requestJson<ProposalResponse>(
    `/api/proposal/${encodeURIComponent(proposalId)}/draft/${draftId}`,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content, status }),
    }
  );
}

export function submitProofLog(proposalId: string, payload: ProofLogPayload) {
  return requestJson(`/api/proposal/${encodeURIComponent(proposalId)}/prooflog`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}

export function listProofLogs(proposalId: string) {
  return requestJson(`/api/proposal/${encodeURIComponent(proposalId)}/prooflog`);
}

export function streamProposal(
  proposalId: string,
  onEvent: EventCallback,
  onError?: (error: Event) => void
): () => void {
  const source = new EventSource(`/api/proposal/${encodeURIComponent(proposalId)}/stream`);
  const events: ProposalSSEEventType[] = [
    "proposal.phase2_started",
    "evidence.updated",
    "research.completed",
    "draft.updated",
    "checklist.updated",
    "done",
  ];

  for (const evt of events) {
    source.addEventListener(evt, (raw: MessageEvent<string>) => {
      try {
        const data = JSON.parse(raw.data);
        onEvent(evt, data);
      } catch {
        onEvent(evt, { raw: raw.data });
      }
    });
  }

  source.onerror = (error) => {
    if (onError) onError(error);
  };

  return () => source.close();
}
