import { useEffect, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';

import { attachRoomContact, getChatRoom, listChatAttachments } from '@/api/chat';
import {
  getGmailContactSummary,
  getGmailContactThreads,
  getGmailRoomSummary,
  getGmailRoomThreads,
} from '@/api/gmail';
import DecisionMirrorPanel from '@/components/chat/DecisionMirrorPanel';
import { useAuth } from '@/hooks/useAuth';
import type { DecisionMirrorContext } from '@/types/decisionMirror';
import type { ChatRoom } from '@/types/chat';

type RoomContextCache = {
  room: ChatRoom;
  messages: {
    sender: { user_id: string; name?: string | null };
    text: string;
  }[];
};

export default function DecisionMirrorPage() {
  const { roomId } = useParams<{ roomId: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const { isAuthenticated, loading, user } = useAuth();

  const [room, setRoom] = useState<ChatRoom | null>(null);
  const [sourceRoom, setSourceRoom] = useState<ChatRoom | null>(null);
  const [initialContext, setInitialContext] = useState<DecisionMirrorContext>({
    email_thread_text: '',
    chat_log_text: '',
    attachments_text: '',
  });
  const [loadingContext, setLoadingContext] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const logGmailRoute = (
    route: 'contact' | 'contact-fallback-room' | 'room-no-contact',
    extra: Record<string, unknown> = {},
  ) => {
    if (!import.meta.env?.DEV) return;
    if (route === 'contact') {
      console.info('[gmail-context] decision-mirror route=contact', { roomId, ...extra });
      return;
    }
    if (route === 'contact-fallback-room') {
      console.warn('[gmail-context] decision-mirror route=fallback-room (contact API failed)', {
        roomId,
        ...extra,
      });
      return;
    }
    console.info('[gmail-context] decision-mirror route=room', { roomId, ...extra });
  };

  const cloneBaseName =
    sourceRoom?.contact_alias ||
    sourceRoom?.contact_email?.split('@')[0] ||
    room?.contact_alias ||
    room?.contact_email?.split('@')[0] ||
    '대상자';
  const cloneName = `${cloneBaseName}의 판단 미러`;

  const buildChatLogText = (messages: RoomContextCache['messages']) => {
    return messages
      .slice(-40)
      .map((item) => `${item.sender.user_id === user?.uid ? '나' : '상대방'}: ${item.text}`)
      .join('\n');
  };

  const buildEmailText = async (roomLike: ChatRoom): Promise<string> => {
    try {
      let summary;
      let threads;
      if (roomLike.contact_id) {
        try {
          [summary, threads] = await Promise.all([
            getGmailContactSummary(roomLike.contact_id, 20),
            getGmailContactThreads(roomLike.contact_id, 10),
          ]);
          logGmailRoute('contact', {
            roomId: roomLike.id,
            contactId: roomLike.contact_id,
          });
        } catch {
          [summary, threads] = await Promise.all([
            getGmailRoomSummary(roomLike.id, 20),
            getGmailRoomThreads(roomLike.id, 10),
          ]);
          logGmailRoute('contact-fallback-room', {
            roomId: roomLike.id,
            contactId: roomLike.contact_id,
          });
        }
      } else {
        [summary, threads] = await Promise.all([
          getGmailRoomSummary(roomLike.id, 20),
          getGmailRoomThreads(roomLike.id, 10),
        ]);
        logGmailRoute('room-no-contact', {
          roomId: roomLike.id,
        });
      }

      const threadText = (threads.threads || []).map((item) => `[${item.subject || '제목 없음'}] ${item.snippet || ''}`).join('\n');
      return [summary.summary, threadText].filter(Boolean).join('\n');
    } catch {
      return '';
    }
  };

  const buildAttachmentsText = async (sourceRoomId: string): Promise<string> => {
    try {
      const attachmentRes = await listChatAttachments(sourceRoomId);
      return (attachmentRes.attachments || [])
        .map((item) => `${item.filename}\n${item.extracted_preview || ''}`)
        .join('\n\n');
    } catch {
      return '';
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
    const params = new URLSearchParams(location.search);
    const targetUser = (params.get('target_user') || '').trim().toLowerCase();
    const sourceRoomId = (params.get('source_room_id') || params.get('source_room') || '').trim();
    const attachSource = (params.get('source') || params.get('source_user') || 'auto_openchat').trim().slice(0, 32);

    const load = async () => {
      setLoadingContext(true);
      setError(null);

      try {
        const detail = await getChatRoom(roomId);
        if (!mounted) return;

        const roomCache = new Map<string, RoomContextCache>();
        roomCache.set(roomId, {
          room: detail.room,
          messages: detail.recent_messages,
        });

        const isOwner = detail.room.owner_user_id === user?.uid;
        const shouldAttach =
          isOwner && targetUser && (detail.room.contact_email?.trim().toLowerCase() !== targetUser || !detail.room.contact_id);
        if (shouldAttach) {
          try {
            const updatedRoom = await attachRoomContact(roomId, {
              target_user: targetUser,
              source: attachSource,
            });
            if (!mounted) return;
            detail.room.contact_id = updatedRoom.contact_id;
            detail.room.contact_alias = updatedRoom.contact_alias;
            detail.room.contact_email = updatedRoom.contact_email;
          } catch {
            // Keep fallback context even if mapping fails.
          }
        }

        setRoom(detail.room);

        if (sourceRoomId && sourceRoomId !== roomId) {
          const sourceDetail = await getChatRoom(sourceRoomId).catch(() => null);
          if (!mounted) return;
          if (sourceDetail) {
            roomCache.set(sourceRoomId, {
              room: sourceDetail.room,
              messages: sourceDetail.recent_messages,
            });
            setSourceRoom(sourceDetail.room);
          }
        } else {
          setSourceRoom(null);
        }

        const roomIds = sourceRoomId && sourceRoomId !== roomId ? [sourceRoomId, roomId] : [roomId];
        const visited = new Set<string>();
        const emailParts: string[] = [];
        const chatParts: string[] = [];
        const attachmentParts: string[] = [];

        for (const id of roomIds) {
          if (visited.has(id)) continue;
          visited.add(id);

          const source = roomCache.get(id);
          if (!source) continue;

          const chatText = buildChatLogText(source.messages);
          if (chatText) {
            const marker = sourceRoomId && id === sourceRoomId ? `[${id.slice(0, 8)} source]` : `[${id.slice(0, 8)} target]`;
            chatParts.push(`${marker}\n${chatText}`);
          }

          const emailText = await buildEmailText(source.room);
          if (emailText) {
            emailParts.push(`[${id.slice(0, 8)}] ${emailText}`);
          }

          const attachmentsText = await buildAttachmentsText(id);
          if (attachmentsText) {
            attachmentParts.push(`[${id.slice(0, 8)}]\n${attachmentsText}`);
          }
        }

        setInitialContext({
          email_thread_text: emailParts.join('\n\n'),
          chat_log_text: chatParts.join('\n\n---\n\n'),
          attachments_text: attachmentParts.join('\n\n') || undefined,
        });
      } catch (err) {
        if (!mounted) return;
        setError(err instanceof Error ? err.message : '데이터를 불러오는 중 오류가 발생했습니다.');
      } finally {
        if (mounted) setLoadingContext(false);
      }
    };

    load();
    return () => {
      mounted = false;
    };
  }, [location.search, roomId, isAuthenticated, user?.uid]);

  if (loading || loadingContext) {
    return <main className="p-4 text-sm text-gray-500">로딩 중입니다...</main>;
  }

  if (!roomId) {
    return <main className="p-4 text-sm text-red-600">room_id is missing.</main>;
  }

  return (
    <main className="mx-auto w-full max-w-6xl p-4">
      <div className="mb-3 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900">{cloneName}</h1>
          <div className="text-xs text-gray-500">{room?.name || `Room ${roomId.slice(0, 8)}`}</div>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => navigate('/chat/rooms')}
            className="rounded-md border border-gray-300 px-2 py-1 text-xs text-gray-700"
          >
            채팅 목록
          </button>
          <button
            type="button"
            onClick={() => navigate(`/chat/rooms/${roomId}`)}
            className="rounded-md border border-blue-500 px-2 py-1 text-xs text-blue-700"
          >
            채팅방으로 이동
          </button>
        </div>
      </div>

      {error && <div className="mb-2 text-sm text-red-600">{error}</div>}

      <DecisionMirrorPanel
        roomId={roomId}
        initialContext={initialContext}
        cloneName={cloneName}
        onApplyMessage={(text) => navigate(`/chat/rooms/${roomId}?prefill=${encodeURIComponent(text)}`)}
      />
    </main>
  );
}
