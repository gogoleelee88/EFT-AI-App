import type {
  DecisionMirrorCallResponse,
  DecisionMirrorContext,
  DecisionMirrorMessagesResponse,
  DecisionMirrorProfile,
  DecisionMirrorProfileResponse,
  DecisionMirrorMessagesRequestPayload,
  DecisionMirrorScoreResponse,
  DecisionMirrorTranscriptTurn,
  Difficulty,
} from '@/types/decisionMirror';

async function parseError(response: Response): Promise<string> {
  try {
    const payload = await response.json();
    return payload?.detail || payload?.message || `${response.status} ${response.statusText}`;
  } catch {
    return `${response.status} ${response.statusText}`;
  }
}

async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    credentials: 'include',
    ...init,
  });
  if (!response.ok) {
    throw new Error(await parseError(response));
  }
  return (await response.json()) as T;
}

export async function createDecisionMirrorProfile(
  context: DecisionMirrorContext,
): Promise<DecisionMirrorProfileResponse> {
  return requestJson<DecisionMirrorProfileResponse>('/api/decision-mirror/profile', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(context),
  });
}

export async function createDecisionMirrorMessages(payload: DecisionMirrorMessagesRequestPayload): Promise<DecisionMirrorMessagesResponse> {
  return requestJson<DecisionMirrorMessagesResponse>('/api/decision-mirror/messages', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
}

export async function scoreDecisionMirrorMessage(payload: {
  profile: DecisionMirrorProfile;
  message: string;
  goal: string;
  constraints?: string;
}): Promise<DecisionMirrorScoreResponse> {
  return requestJson<DecisionMirrorScoreResponse>('/api/decision-mirror/score', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
}

export async function nextDecisionMirrorCallTurn(payload: {
  profile: DecisionMirrorProfile;
  call_goal: string;
  my_key_points: string;
  difficulty: Difficulty;
  transcript: DecisionMirrorTranscriptTurn[];
}): Promise<DecisionMirrorCallResponse> {
  return requestJson<DecisionMirrorCallResponse>('/api/decision-mirror/call', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
}
