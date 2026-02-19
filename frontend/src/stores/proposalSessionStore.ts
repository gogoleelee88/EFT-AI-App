import { useSyncExternalStore } from "react";
import type { ProposalResponse } from "../types/proposalOS";

type ProposalSessionState = {
  proposalId: string | null;
  proposal: ProposalResponse | null;
  updatedAt: number | null;
};

const STORAGE_KEY = "proposal_session_state";

let state: ProposalSessionState = {
  proposalId: null,
  proposal: null,
  updatedAt: null,
};

const listeners = new Set<() => void>();

function notify() {
  for (const listener of listeners) listener();
}

function safeLoad() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw) as ProposalSessionState;
    state = {
      proposalId: parsed?.proposalId || null,
      proposal: parsed?.proposal || null,
      updatedAt: parsed?.updatedAt || null,
    };
  } catch {
    // ignore
  }
}

function safeSave() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // ignore
  }
}

if (typeof window !== "undefined") {
  safeLoad();
}

export const proposalSessionStore = {
  getState(): ProposalSessionState {
    return state;
  },
  subscribe(listener: () => void) {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
  setProposal(nextProposal: ProposalResponse | null) {
    state = {
      proposalId: nextProposal?.proposal_id || null,
      proposal: nextProposal,
      updatedAt: Date.now(),
    };
    safeSave();
    notify();
  },
  setProposalId(nextProposalId: string | null) {
    state = {
      ...state,
      proposalId: nextProposalId,
      updatedAt: Date.now(),
    };
    safeSave();
    notify();
  },
  clear() {
    state = { proposalId: null, proposal: null, updatedAt: Date.now() };
    safeSave();
    notify();
  },
};

export function useProposalSessionStore() {
  return useSyncExternalStore(
    proposalSessionStore.subscribe,
    proposalSessionStore.getState,
    proposalSessionStore.getState
  );
}
