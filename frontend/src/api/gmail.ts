import type { GmailMessageDetailResponse, GmailSummaryResponse, GmailThreadsResponse } from '@/types/gmail';

async function parseError(response: Response): Promise<string> {
  try {
    const payload = await response.json();
    return payload?.detail || payload?.message || `${response.status} ${response.statusText}`;
  } catch {
    return `${response.status} ${response.statusText}`;
  }
}

async function requestJson<T>(url: string): Promise<T> {
  const response = await fetch(url, {
    credentials: 'include',
  });
  if (!response.ok) {
    throw new Error(await parseError(response));
  }
  return (await response.json()) as T;
}

export async function getGmailContactSummary(contactId: string, limit = 20): Promise<GmailSummaryResponse> {
  return requestJson<GmailSummaryResponse>(
    `/api/google/gmail/contacts/${encodeURIComponent(contactId)}/summary?limit=${encodeURIComponent(String(limit))}`,
  );
}

export async function getGmailRoomSummary(roomId: string, limit = 20): Promise<GmailSummaryResponse> {
  return requestJson<GmailSummaryResponse>(
    `/api/google/gmail/rooms/${encodeURIComponent(roomId)}/summary?limit=${encodeURIComponent(String(limit))}`,
  );
}

export async function getGmailContactThreads(contactId: string, limit = 10): Promise<GmailThreadsResponse> {
  return requestJson<GmailThreadsResponse>(
    `/api/google/gmail/contacts/${encodeURIComponent(contactId)}/threads?limit=${encodeURIComponent(String(limit))}`,
  );
}

export async function getGmailRoomThreads(roomId: string, limit = 10): Promise<GmailThreadsResponse> {
  return requestJson<GmailThreadsResponse>(
    `/api/google/gmail/rooms/${encodeURIComponent(roomId)}/threads?limit=${encodeURIComponent(String(limit))}`,
  );
}

export async function getGmailContactMessageDetail(
  contactId: string,
  messageId: string,
): Promise<GmailMessageDetailResponse> {
  return requestJson<GmailMessageDetailResponse>(
    `/api/google/gmail/contacts/${encodeURIComponent(contactId)}/messages/${encodeURIComponent(messageId)}`,
  );
}

export async function getGmailRoomMessageDetail(roomId: string, messageId: string): Promise<GmailMessageDetailResponse> {
  return requestJson<GmailMessageDetailResponse>(
    `/api/google/gmail/rooms/${encodeURIComponent(roomId)}/messages/${encodeURIComponent(messageId)}`,
  );
}
