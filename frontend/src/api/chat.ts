import type {
  ChatRoomCreateRequest,
  ChatRoomCreateResponse,
  ChatRoomDetailResponse,
  ChatRoomContactMapRequest,
  ChatRoomJoinResponse,
  ChatRoomListResponse,
  ChatRoomSettingsUpdateRequest,
  ChatAttachment,
  ChatAttachmentListResponse,
  Contact,
  ContactCreateRequest,
  ContactListResponse,
  InviteReissueResponse,
} from '@/types/chat';

const JSON_HEADERS: HeadersInit = { 'Content-Type': 'application/json' };

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

export async function listChatRooms(): Promise<ChatRoomListResponse> {
  return requestJson<ChatRoomListResponse>('/api/chat/rooms');
}

export async function createChatRoom(payload: ChatRoomCreateRequest): Promise<ChatRoomCreateResponse> {
  return requestJson<ChatRoomCreateResponse>('/api/chat/rooms', {
    method: 'POST',
    headers: JSON_HEADERS,
    body: JSON.stringify(payload),
  });
}

export async function getChatRoom(roomId: string): Promise<ChatRoomDetailResponse> {
  return requestJson<ChatRoomDetailResponse>(`/api/chat/rooms/${encodeURIComponent(roomId)}`);
}

export async function joinChatRoom(inviteToken: string): Promise<ChatRoomJoinResponse> {
  return requestJson<ChatRoomJoinResponse>('/api/chat/rooms/join', {
    method: 'POST',
    headers: JSON_HEADERS,
    body: JSON.stringify({ invite_token: inviteToken }),
  });
}

export async function reissueInvite(roomId: string): Promise<InviteReissueResponse> {
  return requestJson<InviteReissueResponse>(`/api/chat/rooms/${encodeURIComponent(roomId)}/invite`, {
    method: 'POST',
  });
}

export async function updateChatRoomSettings(
  roomId: string,
  payload: ChatRoomSettingsUpdateRequest,
): Promise<ChatRoomDetailResponse['room']> {
  return requestJson<ChatRoomDetailResponse['room']>(`/api/chat/rooms/${encodeURIComponent(roomId)}/settings`, {
    method: 'PATCH',
    headers: JSON_HEADERS,
    body: JSON.stringify(payload),
  });
}

export async function attachRoomContact(
  roomId: string,
  payload: ChatRoomContactMapRequest,
): Promise<ChatRoomDetailResponse['room']> {
  return requestJson<ChatRoomDetailResponse['room']>(`/api/chat/rooms/${encodeURIComponent(roomId)}/contact`, {
    method: 'PATCH',
    headers: JSON_HEADERS,
    body: JSON.stringify(payload),
  });
}

export async function listContacts(): Promise<ContactListResponse> {
  return requestJson<ContactListResponse>('/api/contacts');
}

export async function createContact(payload: ContactCreateRequest): Promise<Contact> {
  return requestJson<Contact>('/api/contacts', {
    method: 'POST',
    headers: JSON_HEADERS,
    body: JSON.stringify(payload),
  });
}

export async function listChatAttachments(roomId: string): Promise<ChatAttachmentListResponse> {
  return requestJson<ChatAttachmentListResponse>(`/api/chat/rooms/${encodeURIComponent(roomId)}/attachments`);
}

export async function uploadChatAttachment(roomId: string, file: File): Promise<ChatAttachment> {
  const formData = new FormData();
  formData.append('file', file);
  return requestJson<ChatAttachment>(`/api/chat/rooms/${encodeURIComponent(roomId)}/attachments`, {
    method: 'POST',
    body: formData,
  });
}

export async function getChatAttachment(roomId: string, attachmentId: string): Promise<ChatAttachment> {
  return requestJson<ChatAttachment>(
    `/api/chat/rooms/${encodeURIComponent(roomId)}/attachments/${encodeURIComponent(attachmentId)}`,
  );
}

export function buildChatWebSocketUrl(roomId: string, authToken?: string): string {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const url = new URL(`/ws/chat/${encodeURIComponent(roomId)}`, `${protocol}//${window.location.host}`);
  if (authToken) {
    url.searchParams.set('auth', authToken);
  }
  return url.toString();
}
