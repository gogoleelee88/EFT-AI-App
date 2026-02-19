import { useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';

import {
  buildChatWebSocketUrl,
  getChatRoom,
  joinChatRoom,
  listChatAttachments,
  attachRoomContact,
  reissueInvite,
  uploadChatAttachment,
  updateChatRoomSettings,
} from '@/api/chat';
import {
  getGmailContactMessageDetail,
  getGmailContactSummary,
  getGmailContactThreads,
  getGmailRoomMessageDetail,
  getGmailRoomSummary,
  getGmailRoomThreads,
} from '@/api/gmail';
import ChatComposer from '@/components/chat/ChatComposer';
import ChatMessageList from '@/components/chat/ChatMessageList';
import CopilotPanel from '@/components/chat/CopilotPanel';
import RoomSettingsModal from '@/components/chat/RoomSettingsModal';
import { useAuth } from '@/hooks/useAuth';
import type { GmailSummaryResponse, GmailThreadItem } from '@/types/gmail';
import type { ChatAttachment, ChatMessage, ChatRoom, RoomDefaults, ServerChatEvent } from '@/types/chat';

function mapRoomDefaults(room: ChatRoom): RoomDefaults {
  return {
    relationship: room.default_relationship,
    goal: room.default_goal,
    image_goal: room.default_image_goal,
    banned_tones: room.default_banned_tones,
    default_send_policy: room.default_send_policy,
    language: 'ko',
  };
}

export default function ChatRoomPage() {
  const { roomId } = useParams<{ roomId: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const { isAuthenticated, loading, user } = useAuth();

  const [room, setRoom] = useState<ChatRoom | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState('');
  const [defaults, setDefaults] = useState<RoomDefaults | null>(null);
  const [loadingRoom, setLoadingRoom] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [connected, setConnected] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [inviteLink, setInviteLink] = useState<string | null>(null);
  const [gmailSummary, setGmailSummary] = useState<GmailSummaryResponse | null>(null);
  const [gmailThreads, setGmailThreads] = useState<GmailThreadItem[]>([]);
  const [gmailThreadsLoading, setGmailThreadsLoading] = useState(false);
  const [gmailThreadsError, setGmailThreadsError] = useState<string | null>(null);
  const [selectedGmailMessage, setSelectedGmailMessage] = useState<GmailThreadItem | null>(null);
  const [gmailDetailLoading, setGmailDetailLoading] = useState(false);
  const [attachments, setAttachments] = useState<ChatAttachment[]>([]);
  const [attachmentsLoading, setAttachmentsLoading] = useState(false);
  const [attachmentsError, setAttachmentsError] = useState<string | null>(null);
  const [selectedAttachmentIds, setSelectedAttachmentIds] = useState<string[]>([]);
  const [uploadingAttachment, setUploadingAttachment] = useState(false);

  const socketRef = useRef<WebSocket | null>(null);
  const appliedPrefillKeyRef = useRef<string | null>(null);
  const contactAttachKeyRef = useRef<string | null>(null);
  const currentUserId = user?.uid ?? null;

  const theirLastMessage = useMemo(
    () => [...messages].reverse().find((item) => item.sender.user_id !== currentUserId)?.text ?? null,
    [messages, currentUserId],
  );
  const threadSummary = useMemo(() => {
    const recent = messages
      .slice(-6)
      .map((item) => item.text.trim())
      .filter(Boolean);
    if (recent.length === 0) return null;
    return recent.join(' / ').slice(0, 300);
  }, [messages]);

  const decisionMirrorPath = useMemo(() => {
    const params = new URLSearchParams(location.search);
    const targetUser = (params.get('target_user') || room?.contact_email || '').trim().toLowerCase();
    const sourceRoomId = (params.get('source_room_id') || params.get('source_room') || roomId || '').trim();

    if (targetUser) {
      params.set('target_user', targetUser);
    } else {
      params.delete('target_user');
    }
    if (sourceRoomId) {
      params.set('source_room_id', sourceRoomId);
    } else {
      params.delete('source_room_id');
    }
    params.delete('source_room');

    const query = params.toString();
    return `/chat/rooms/${roomId}/decision-mirror${query ? `?${query}` : ''}`;
  }, [location.search, room?.contact_email, roomId]);

  const logGmailRoute = (route: 'contact' | 'contact-fallback-room' | 'room-no-contact' | 'message-contact' | 'message-room') => {
    if (!import.meta.env?.DEV) return;
    if (route === 'contact') {
      console.info('[gmail-context] route=contact', { roomId, contactId: room?.contact_id });
      return;
    }
    if (route === 'contact-fallback-room') {
      console.warn('[gmail-context] route=fallback-room (contact API failed)', {
        roomId,
        contactId: room?.contact_id,
      });
      return;
    }
    if (route === 'room-no-contact') {
      console.info('[gmail-context] route=room-no-contact', { roomId });
      return;
    }
    if (route === 'message-contact') {
      console.info('[gmail-context] message route=contact', { roomId, contactId: room?.contact_id });
      return;
    }
    if (route === 'message-room') {
      console.info('[gmail-context] message route=room', {
        roomId,
        contactId: room?.contact_id,
        reason: room?.contact_id ? 'contact-detail-failed' : 'no-contact-id',
      });
    }
  };

  useEffect(() => {
    if (loading) return;
    if (!isAuthenticated) {
      const next = encodeURIComponent(`${location.pathname}${location.search}`);
      navigate(`/login?next=${next}`, { replace: true });
    }
  }, [isAuthenticated, loading, location.pathname, location.search, navigate]);

  useEffect(() => {
    if (!roomId || !isAuthenticated) return;
    let mounted = true;
    const load = async () => {
      setLoadingRoom(true);
      setError(null);
      try {
        const detail = await getChatRoom(roomId);
        if (!mounted) return;
        setRoom(detail.room);
        setMessages(detail.recent_messages);
        setDefaults(mapRoomDefaults(detail.room));
      } catch (err) {
        if (!mounted) return;
        setError(err instanceof Error ? err.message : 'Failed to load room');
      } finally {
        if (mounted) setLoadingRoom(false);
      }
    };
    load();
    return () => {
      mounted = false;
    };
  }, [roomId, isAuthenticated]);

  useEffect(() => {
    if (!roomId || !isAuthenticated || !room || !currentUserId) return;
    if (room.owner_user_id !== currentUserId) return;

    const params = new URLSearchParams(location.search);
    const targetUser = (params.get('target_user') || '').trim().toLowerCase();
    if (!targetUser) return;

    const source = (params.get('source') || params.get('source_user') || 'auto_openchat').trim().slice(0, 32);
    const currentContactEmail = (room.contact_email || '').trim().toLowerCase();
    const currentContactId = room.contact_id || '';
    const shouldAttach = currentContactEmail !== targetUser || !currentContactId;
    if (!shouldAttach) return;

    const attachKey = `${roomId}:${targetUser}`;
    if (contactAttachKeyRef.current === attachKey) return;
    contactAttachKeyRef.current = attachKey;

    void (async () => {
      try {
        const updatedRoom = await attachRoomContact(roomId, { target_user: targetUser, source });
        setRoom(updatedRoom);
      } catch {
        contactAttachKeyRef.current = null;
      }
    })();
  }, [room, roomId, location.search, isAuthenticated, currentUserId]);

  useEffect(() => {
    if (!roomId || !isAuthenticated) {
      setAttachments([]);
      setSelectedAttachmentIds([]);
      return;
    }
    loadAttachments(roomId);
  }, [roomId, isAuthenticated]);

  useEffect(() => {
    if (!roomId || !isAuthenticated) {
      setGmailSummary(null);
      setGmailThreads([]);
      setSelectedGmailMessage(null);
      setGmailThreadsError(null);
      return;
    }
    let mounted = true;
    setGmailThreadsLoading(true);
    setGmailThreadsError(null);
    const loadGmailContext = async () => {
      try {
        let summaryData;
        let threadsData;
        if (room?.contact_id) {
          try {
            [summaryData, threadsData] = await Promise.all([
              getGmailContactSummary(room.contact_id),
              getGmailContactThreads(room.contact_id, 12),
            ]);
            logGmailRoute('contact');
          } catch {
            logGmailRoute('contact-fallback-room');
            [summaryData, threadsData] = await Promise.all([
              getGmailRoomSummary(roomId),
              getGmailRoomThreads(roomId, 12),
            ]);
          }
        } else {
          logGmailRoute('room-no-contact');
          [summaryData, threadsData] = await Promise.all([getGmailRoomSummary(roomId), getGmailRoomThreads(roomId, 12)]);
        }
        if (!mounted) return;
        setGmailSummary(summaryData);
        setGmailThreads(threadsData.threads || []);
      } catch (err) {
        if (!mounted) return;
        setGmailSummary(null);
        setGmailThreads([]);
        setGmailThreadsError(err instanceof Error ? err.message : 'Failed to load Gmail threads');
      } finally {
        if (mounted) setGmailThreadsLoading(false);
      }
    };
    void loadGmailContext();
    return () => {
      mounted = false;
    };
  }, [roomId, isAuthenticated, room?.contact_id, room]);

  useEffect(() => {
    if (!roomId) return;
    const params = new URLSearchParams(location.search);
    const prefill = (params.get('prefill') || '').trim();
    if (!prefill) return;

    const key = `${roomId}:${prefill}`;
    if (appliedPrefillKeyRef.current === key) return;

    setDraft(prefill);
    appliedPrefillKeyRef.current = key;
  }, [roomId, location.search]);

  const handleOpenGmailMessage = async (messageId: string) => {
    if (!roomId || !messageId) return;
    setGmailDetailLoading(true);
    try {
    let detail;
      if (room?.contact_id) {
        try {
          detail = await getGmailContactMessageDetail(room.contact_id, messageId);
          logGmailRoute('message-contact');
        } catch {
          detail = await getGmailRoomMessageDetail(roomId, messageId);
          logGmailRoute('message-room');
        }
      } else {
        detail = await getGmailRoomMessageDetail(roomId, messageId);
        logGmailRoute('message-room');
      }
      setSelectedGmailMessage(detail.message);
    } catch (err) {
      setGmailThreadsError(err instanceof Error ? err.message : 'Failed to load Gmail message');
    } finally {
      setGmailDetailLoading(false);
    }
  };

  const loadAttachments = async (targetRoomId: string) => {
    setAttachmentsLoading(true);
    setAttachmentsError(null);
    try {
      const response = await listChatAttachments(targetRoomId);
      setAttachments(response.attachments ?? []);
      setSelectedAttachmentIds((prev) => prev.filter((id) => response.attachments.some((item) => item.id === id)));
    } catch (err) {
      setAttachments([]);
      setAttachmentsError(err instanceof Error ? err.message : 'Failed to load attachments');
    } finally {
      setAttachmentsLoading(false);
    }
  };

  const handleUploadAttachment = async (file: File | null) => {
    if (!roomId || !file) return;
    setUploadingAttachment(true);
    setAttachmentsError(null);
    try {
      const created = await uploadChatAttachment(roomId, file);
      await loadAttachments(roomId);
      setSelectedAttachmentIds((prev) => (prev.includes(created.id) ? prev : [...prev, created.id]));
    } catch (err) {
      setAttachmentsError(err instanceof Error ? err.message : 'Failed to upload attachment');
    } finally {
      setUploadingAttachment(false);
    }
  };

  const toggleAttachment = (attachmentId: string) => {
    setSelectedAttachmentIds((prev) =>
      prev.includes(attachmentId) ? prev.filter((item) => item !== attachmentId) : [...prev, attachmentId],
    );
  };

  useEffect(() => {
    if (!roomId || !isAuthenticated) return;
    const wsUrl = buildChatWebSocketUrl(roomId);
    const socket = new WebSocket(wsUrl);
    socketRef.current = socket;

    socket.onopen = () => setConnected(true);
    socket.onclose = () => setConnected(false);
    socket.onerror = () => setConnected(false);
    socket.onmessage = (event) => {
      try {
        const payload = JSON.parse(event.data) as ServerChatEvent;
        if (payload.type === 'message:new') {
          setMessages((prev) => {
            if (prev.some((item) => item.id === payload.message.id)) return prev;
            return [...prev, payload.message];
          });
        }
      } catch {
        // ignore malformed messages
      }
    };

    return () => {
      socket.close();
      socketRef.current = null;
    };
  }, [roomId, isAuthenticated]);

  const handleSend = () => {
    const text = draft.trim();
    if (!text) return;
    const socket = socketRef.current;
    if (!socket || socket.readyState !== WebSocket.OPEN) {
      setError('WebSocket is not connected');
      return;
    }
    socket.send(JSON.stringify({ type: 'message:new', text }));
    setDraft('');
  };

  const handleReissueInvite = async () => {
    if (!roomId) return;
    try {
      const response = await reissueInvite(roomId);
      const link = `${window.location.origin}/chat/invite/${response.invite_token}`;
      setInviteLink(link);
      await navigator.clipboard.writeText(link);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to reissue invite link');
    }
  };

  const handleSaveRoomDefaults = async (value: RoomDefaults) => {
    if (!roomId) return;
    const updated = await updateChatRoomSettings(roomId, {
      relationship: value.relationship,
      goal: value.goal,
      image_goal: value.image_goal,
      banned_tones: value.banned_tones,
      default_send_policy: value.default_send_policy,
    });
    setRoom(updated);
    setDefaults(mapRoomDefaults(updated));
  };

  if (loading || loadingRoom) {
    return <main className="p-4 text-sm text-gray-500">Loading...</main>;
  }

  if (!roomId) {
    return <main className="p-4 text-sm text-red-600">room_id is missing.</main>;
  }

  return (
    <main className="mx-auto w-full max-w-5xl p-4">
      <div className="mb-3 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900">{room?.name || `Room ${roomId.slice(0, 8)}`}</h1>
          <div className="text-xs text-gray-500">
            ws: {connected ? 'connected' : 'disconnected'} / room: {roomId}
          </div>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => navigate('/chat/rooms')}
            className="rounded-md border border-gray-300 px-2 py-1 text-xs text-gray-700"
          >
            List
          </button>
          <button
            type="button"
            onClick={() => navigate(decisionMirrorPath)}
            className="rounded-md border border-cyan-500 px-2 py-1 text-xs text-cyan-700"
            disabled={!roomId}
          >
            Decision Mirror
          </button>
          <button
            type="button"
            onClick={handleReissueInvite}
            className="rounded-md border border-blue-500 px-2 py-1 text-xs text-blue-700"
          >
            Reissue Invite
          </button>
        </div>
      </div>

      {inviteLink && <div className="mb-2 text-xs text-blue-700">Copied: {inviteLink}</div>}
      {error && <div className="mb-2 text-sm text-red-600">{error}</div>}

      {gmailSummary && (
        <section className="mb-3 rounded-lg border border-amber-200 bg-amber-50 p-3">
          <div className="text-xs font-semibold text-amber-900">Gmail Summary ({gmailSummary.contact_email})</div>
          <div className="mt-1 text-xs text-amber-900">{gmailSummary.summary}</div>
          {gmailSummary.recent_subjects.length > 0 && (
            <div className="mt-2 text-xs text-amber-800">Recent subjects: {gmailSummary.recent_subjects.join(' / ')}</div>
          )}
          <div className="mt-3">
            <div className="text-xs font-semibold text-amber-900">메일 목록</div>
            {gmailThreadsLoading ? (
              <div className="mt-1 text-xs text-amber-700">메일을 불러오는 중...</div>
            ) : gmailThreads.length === 0 ? (
              <div className="mt-1 text-xs text-amber-700">표시할 메일이 없습니다.</div>
            ) : (
              <ul className="mt-1 max-h-48 space-y-1 overflow-y-auto">
                {gmailThreads.map((thread) => (
                  <li key={thread.id || `${thread.thread_id}-${thread.date}`} className="rounded border border-amber-200 bg-white p-2">
                    <div className="text-xs font-semibold text-gray-800">{thread.subject || '(제목 없음)'}</div>
                    <div className="mt-1 text-[11px] text-gray-600">{thread.date || ''}</div>
                    {thread.snippet && <div className="mt-1 text-[11px] text-gray-700">{thread.snippet}</div>}
                    {thread.id && (
                      <button
                        type="button"
                        onClick={() => handleOpenGmailMessage(thread.id!)}
                        className="mt-2 rounded border border-amber-500 px-2 py-1 text-[11px] text-amber-700"
                      >
                        본문 보기
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
          {gmailThreadsError && <div className="mt-2 text-xs text-red-600">{gmailThreadsError}</div>}
          {(gmailDetailLoading || selectedGmailMessage) && (
            <div className="mt-3 rounded border border-amber-300 bg-white p-2">
              <div className="mb-1 flex items-center justify-between">
                <div className="text-xs font-semibold text-gray-800">메일 본문 상세</div>
                {selectedGmailMessage && (
                  <button
                    type="button"
                    onClick={() => setSelectedGmailMessage(null)}
                    className="rounded border border-gray-300 px-2 py-1 text-[11px] text-gray-600"
                  >
                    닫기
                  </button>
                )}
              </div>
              {gmailDetailLoading ? (
                <div className="text-xs text-gray-500">본문을 불러오는 중...</div>
              ) : selectedGmailMessage ? (
                <div className="space-y-1">
                  <div className="text-xs text-gray-700">제목: {selectedGmailMessage.subject || '(제목 없음)'}</div>
                  <div className="text-xs text-gray-700">보낸이: {selectedGmailMessage.from || '-'}</div>
                  <div className="text-xs text-gray-700">받는이: {selectedGmailMessage.to || '-'}</div>
                  <div className="text-xs text-gray-700">날짜: {selectedGmailMessage.date || '-'}</div>
                  <pre className="mt-2 max-h-64 overflow-y-auto whitespace-pre-wrap rounded border bg-gray-50 p-2 text-xs text-gray-800">
                    {selectedGmailMessage.body_text || selectedGmailMessage.snippet || '(본문 없음)'}
                  </pre>
                </div>
              ) : null}
            </div>
          )}
        </section>
      )}

      <section className="mb-3 rounded-lg border border-emerald-200 bg-emerald-50 p-3">
        <div className="flex items-center justify-between">
          <div className="text-xs font-semibold text-emerald-900">외부 컨텍스트 파일</div>
          <label className="cursor-pointer rounded border border-emerald-600 px-2 py-1 text-[11px] text-emerald-700">
            {uploadingAttachment ? '업로드 중...' : '파일 업로드'}
            <input
              type="file"
              className="hidden"
              disabled={uploadingAttachment}
              onChange={(event) => {
                const file = event.target.files?.[0] ?? null;
                event.currentTarget.value = '';
                void handleUploadAttachment(file);
              }}
            />
          </label>
        </div>
        <div className="mt-1 text-[11px] text-emerald-800">
          Gmail 요약은 기본 포함됩니다. 추가 맥락으로 반영할 업로드 파일을 선택하세요.
        </div>
        {attachmentsLoading ? (
          <div className="mt-2 text-xs text-emerald-700">첨부 파일을 불러오는 중...</div>
        ) : attachments.length === 0 ? (
          <div className="mt-2 text-xs text-emerald-700">업로드된 파일이 아직 없습니다.</div>
        ) : (
          <ul className="mt-2 max-h-48 space-y-1 overflow-y-auto">
            {attachments.map((item) => {
              const checked = selectedAttachmentIds.includes(item.id);
              return (
                <li key={item.id} className="rounded border border-emerald-200 bg-white p-2 text-xs">
                  <label className="flex cursor-pointer items-start gap-2">
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggleAttachment(item.id)}
                      className="mt-0.5"
                    />
                    <div className="min-w-0 flex-1">
                      <div className="font-semibold text-gray-800">
                        {item.filename} ({Math.round(item.size_bytes / 1024)} KB)
                      </div>
                      <div className="text-[11px] text-gray-500">{item.mime_type}</div>
                      {item.extracted_preview && (
                        <div className="mt-1 line-clamp-3 text-[11px] text-gray-700">{item.extracted_preview}</div>
                      )}
                    </div>
                  </label>
                </li>
              );
            })}
          </ul>
        )}
        {attachmentsError && <div className="mt-2 text-xs text-red-600">{attachmentsError}</div>}
      </section>

      <div className="grid gap-3 lg:grid-cols-[1.2fr,1fr]">
        <section className="space-y-3">
          <ChatMessageList messages={messages} currentUserId={currentUserId} />
          <ChatComposer
            draft={draft}
            onDraftChange={setDraft}
            onSend={handleSend}
            onOpenSettings={() => setShowSettings(true)}
            disabled={!connected}
          />
        </section>

        {defaults && (
          <CopilotPanel
            roomId={roomId}
            defaults={defaults}
            draft={draft}
            theirLastMessage={theirLastMessage}
            threadSummary={threadSummary}
            attachmentIds={selectedAttachmentIds}
            onApplyReply={setDraft}
          />
        )}
      </div>

      {defaults && (
        <RoomSettingsModal
          open={showSettings}
          defaults={defaults}
          onClose={() => setShowSettings(false)}
          onSave={handleSaveRoomDefaults}
        />
      )}
    </main>
  );
}

export function ChatInvitePage() {
  const { inviteToken } = useParams<{ inviteToken: string }>();
  const { isAuthenticated, loading } = useAuth();
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (loading) return;
    if (!inviteToken) {
      navigate('/chat/rooms', { replace: true });
      return;
    }

    if (!isAuthenticated) {
      navigate(`/auth/signup?invite_token=${encodeURIComponent(inviteToken)}`, { replace: true });
      return;
    }

    let mounted = true;
    const run = async () => {
      try {
        const response = await joinChatRoom(inviteToken);
        if (!mounted) return;
        navigate(`/chat/rooms/${response.room_id}`, { replace: true });
      } catch (err) {
        if (!mounted) return;
        setError(err instanceof Error ? err.message : 'Failed to process invite link');
      }
    };
    run();
    return () => {
      mounted = false;
    };
  }, [inviteToken, isAuthenticated, loading, navigate]);

  return (
    <main className="mx-auto max-w-md p-4">
      <h1 className="mb-2 text-lg font-semibold text-gray-900">Processing invite link</h1>
      {error ? (
        <p className="text-sm text-red-600">{error}</p>
      ) : (
        <p className="text-sm text-gray-600">Please wait...</p>
      )}
    </main>
  );
}
