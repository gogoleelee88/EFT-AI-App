import type {
  ActivityCandidateIn,
  ActivityCandidateOut,
  ClarificationAnswerIn,
  ClarificationAnswerOut,
  ClarificationQuestionIn,
  ClarificationQuestionOut,
  TimelineSegmentListOut,
  TimelineSegmentOut,
} from "../types/behavior";

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

export function ingestBehaviorCandidate(payload: ActivityCandidateIn, userId?: string) {
  const q = userId ? `?user_id=${encodeURIComponent(userId)}` : "";
  return requestJson<ActivityCandidateOut>(`/api/spec/behavior/candidates${q}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}

export function createBehaviorQuestion(payload: ClarificationQuestionIn, userId?: string) {
  const q = userId ? `?user_id=${encodeURIComponent(userId)}` : "";
  return requestJson<ClarificationQuestionOut>(`/api/spec/behavior/questions${q}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}

export function answerBehaviorQuestion(
  questionId: number,
  payload: ClarificationAnswerIn,
  userId?: string
) {
  const q = userId ? `?user_id=${encodeURIComponent(userId)}` : "";
  return requestJson<ClarificationAnswerOut>(`/api/spec/behavior/questions/${questionId}/answer${q}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}

export function dismissBehaviorQuestion(questionId: number, userId?: string) {
  const q = userId ? `?user_id=${encodeURIComponent(userId)}` : "";
  return requestJson<{ question_id: number; status: string }>(
    `/api/spec/behavior/questions/${questionId}/dismiss${q}`,
    { method: "POST" }
  );
}

export function listPendingBehaviorQuestions(userId: string, limit = 20) {
  const q = `?user_id=${encodeURIComponent(userId)}&limit=${encodeURIComponent(String(limit))}`;
  return requestJson<ClarificationQuestionOut[]>(`/api/spec/behavior/questions/pending${q}`);
}

export function listBehaviorTimeline(userId: string) {
  const q = `?user_id=${encodeURIComponent(userId)}`;
  return requestJson<TimelineSegmentListOut>(`/api/spec/behavior/timeline${q}`);
}

export function patchBehaviorTimelineSegment(
  segmentId: number,
  payload: { user_id?: string; final_label: "work" | "rest" | "move" | "exercise" | "other"; note?: string },
  userId?: string
) {
  const q = userId ? `?user_id=${encodeURIComponent(userId)}` : "";
  return requestJson<TimelineSegmentOut>(`/api/spec/behavior/timeline/${segmentId}${q}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}
