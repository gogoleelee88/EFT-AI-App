import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { createChatRoom, createContact, listChatRooms, listContacts } from '@/api/chat';
import { useAuth } from '@/hooks/useAuth';
import type { ChatRoomListItem, Contact, RoomDefaults } from '@/types/chat';

const DEFAULT_ROOM_DEFAULTS: RoomDefaults = {
  relationship: 'peer',
  goal: 'maintain',
  image_goal: ['professional', 'kind'],
  banned_tones: ['blame', 'emotional_outburst'],
  default_send_policy: 'prefer_calm',
  language: 'ko',
};

const ROLE_LABEL: Record<string, string> = {
  owner: '방장',
  member: '멤버',
};

export default function ChatRoomsPage() {
  const navigate = useNavigate();
  const { isAuthenticated, loading } = useAuth();

  const [rooms, setRooms] = useState<ChatRoomListItem[]>([]);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [busy, setBusy] = useState(false);
  const [creating, setCreating] = useState(false);
  const [creatingContact, setCreatingContact] = useState(false);
  const [connectingGoogle, setConnectingGoogle] = useState(false);
  const [showContactsPanel, setShowContactsPanel] = useState(false);
  const [showCreateRoomPanel, setShowCreateRoomPanel] = useState(false);
  const [roomName, setRoomName] = useState('');
  const [selectedContactId, setSelectedContactId] = useState('');
  const [contactEmail, setContactEmail] = useState('');
  const [contactAlias, setContactAlias] = useState('');
  const [inviteLink, setInviteLink] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const nextQuery = useMemo(() => encodeURIComponent('/chat/rooms'), []);

  const buildDecisionMirrorUrl = (roomId: string, contactEmail?: string) => {
    const params = new URLSearchParams();
    if (contactEmail) {
      const targetUser = contactEmail.trim().toLowerCase();
      if (targetUser) params.set('target_user', targetUser);
    }
    params.set('source_room_id', roomId);
    const query = params.toString();
    return `/chat/rooms/${encodeURIComponent(roomId)}/decision-mirror${query ? `?${query}` : ''}`;
  };

  const loadRooms = async () => {
    setBusy(true);
    setError(null);
    try {
      const response = await listChatRooms();
      setRooms(response.rooms);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load room list');
    } finally {
      setBusy(false);
    }
  };

  const loadContacts = async () => {
    try {
      const response = await listContacts();
      setContacts(response.contacts);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load contacts');
    }
  };

  useEffect(() => {
    if (loading) return;
    if (!isAuthenticated) {
      navigate(`/login?next=${nextQuery}`, { replace: true });
      return;
    }
    loadRooms();
    loadContacts();
  }, [isAuthenticated, loading, navigate, nextQuery]);

  const handleConnectGoogle = async () => {
    setConnectingGoogle(true);
    setError(null);
    try {
      const response = await fetch('/api/spec/google/auth?next=%2Fchat%2Frooms', {
        credentials: 'include',
      });
      if (!response.ok) {
        throw new Error(`${response.status} ${response.statusText}`);
      }
      const payload = (await response.json()) as { authUrl?: string };
      if (!payload.authUrl) {
        throw new Error('Google auth URL is missing');
      }
      window.location.href = payload.authUrl;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to start Google connect');
    } finally {
      setConnectingGoogle(false);
    }
  };

  const handleCreateContact = async () => {
    const email = contactEmail.trim();
    if (!email) return;
    setCreatingContact(true);
    setError(null);
    try {
      const created = await createContact({
        email,
        alias: contactAlias.trim() || undefined,
        source: 'manual',
      });
      setContacts((prev) => [created, ...prev.filter((item) => item.id !== created.id)]);
      setSelectedContactId(created.id);
      setContactEmail('');
      setContactAlias('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create contact');
    } finally {
      setCreatingContact(false);
    }
  };

  const handleCreateRoom = async () => {
    setCreating(true);
    setError(null);
    try {
      const response = await createChatRoom({
        name: roomName.trim() || undefined,
        contact_id: selectedContactId || undefined,
        defaults: DEFAULT_ROOM_DEFAULTS,
      });
      setInviteLink(`${window.location.origin}/chat/invite/${response.invite_token}`);
      setRoomName('');
      setSelectedContactId('');
      await loadRooms();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create room');
    } finally {
      setCreating(false);
    }
  };

  const copyInviteLink = async () => {
    if (!inviteLink) return;
    await navigator.clipboard.writeText(inviteLink);
  };

  return (
    <main className="mx-auto w-full max-w-4xl p-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h1 className="text-2xl font-bold text-gray-900">초대 채팅</h1>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleConnectGoogle}
            disabled={connectingGoogle}
            className="rounded-md border border-gray-300 px-3 py-2 text-xs text-gray-700"
          >
            {connectingGoogle ? '연결 중...' : 'Google 연결'}
          </button>
          <button
            type="button"
            onClick={() => setShowContactsPanel((prev) => !prev)}
            className="rounded-md border border-gray-300 px-3 py-2 text-xs text-gray-700"
          >
            연락처
          </button>
          <button
            type="button"
            onClick={() => setShowCreateRoomPanel((prev) => !prev)}
            className="rounded-md border border-gray-300 px-3 py-2 text-xs text-gray-700"
          >
            방 만들기
          </button>
        </div>
      </div>

      {showContactsPanel && (
        <section className="mb-4 rounded-lg border bg-white p-3">
          <div className="mb-2 text-sm font-semibold text-gray-700">연락처</div>
          <div className="mb-2 grid gap-2 sm:grid-cols-2">
            <input
              value={contactEmail}
              onChange={(event) => setContactEmail(event.target.value)}
              placeholder="Contact email"
              className="rounded-md border border-gray-300 px-3 py-2 text-sm"
            />
            <div className="flex gap-2">
              <input
                value={contactAlias}
                onChange={(event) => setContactAlias(event.target.value)}
                placeholder="Alias (optional)"
                className="flex-1 rounded-md border border-gray-300 px-3 py-2 text-sm"
              />
              <button
                type="button"
                onClick={handleCreateContact}
                disabled={creatingContact}
                className="rounded-md border border-gray-300 px-3 py-2 text-xs text-gray-700"
              >
                {creatingContact ? '추가 중...' : '추가'}
              </button>
            </div>
          </div>
          <select
            value={selectedContactId}
            onChange={(event) => setSelectedContactId(event.target.value)}
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
          >
            <option value="">1:1 방 연락처 선택 (선택)</option>
            {contacts.map((contact) => (
              <option key={contact.id} value={contact.id}>
                {contact.alias || contact.email} ({contact.email})
              </option>
            ))}
          </select>
        </section>
      )}

      {showCreateRoomPanel && (
        <section className="mb-4 rounded-lg border bg-white p-3">
          <div className="mb-2 text-sm font-semibold text-gray-700">방 만들기</div>
          <div className="flex flex-col gap-2 sm:flex-row">
            <input
              value={roomName}
              onChange={(event) => setRoomName(event.target.value)}
              placeholder="Room name (optional)"
              className="flex-1 rounded-md border border-gray-300 px-3 py-2 text-sm"
            />
            <button
              type="button"
              onClick={handleCreateRoom}
              disabled={creating}
              className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white disabled:bg-gray-400"
            >
              {creating ? '생성 중...' : '방 만들기'}
            </button>
          </div>
          {inviteLink && (
            <div className="mt-3 rounded-md bg-blue-50 p-2 text-xs text-blue-900">
              <div className="mb-1 font-semibold">초대 링크</div>
              <div className="break-all">{inviteLink}</div>
              <button
                type="button"
                onClick={copyInviteLink}
                className="mt-2 rounded border border-blue-500 px-2 py-1 text-[11px] text-blue-700"
              >
                링크 복사
              </button>
            </div>
          )}
        </section>
      )}

      {error && <div className="mb-2 text-sm text-red-600">{error}</div>}

      <section className="rounded-lg border bg-white p-3">
        <div className="mb-2 text-sm font-semibold text-gray-700">대화 목록</div>
        {busy ? (
          <div className="text-sm text-gray-500">불러오는 중...</div>
        ) : rooms.length === 0 ? (
          <div className="text-sm text-gray-500">아직 방이 없습니다.</div>
        ) : (
          <ul className="space-y-2">
            {rooms.map((item) => (
              <li key={item.room.id} className="rounded-md border p-2">
                <div className="mb-1 text-sm font-semibold text-gray-800">
                  {item.room.name || `Room ${item.room.id.slice(0, 8)}`}
                </div>
                {(item.room.contact_alias || item.room.contact_email) && (
                  <div className="mb-1 text-xs text-blue-700">
                    contact: {item.room.contact_alias || item.room.contact_email}
                  </div>
                )}
                <div className="mb-2 text-xs text-gray-500">
                  역할: {ROLE_LABEL[item.role] || item.role} / 참여자: {item.member_count}
                </div>
                <button
                  type="button"
                  onClick={() => navigate(`/chat/rooms/${item.room.id}`)}
                  className="rounded-md border border-gray-300 px-2 py-1 text-xs text-gray-700"
                >
                  열기
                </button>
                <div className="mt-1">
                  <button
                    type="button"
                    onClick={() =>
                      navigate(
                        buildDecisionMirrorUrl(item.room.id, item.room.contact_email || ''),
                      )
                    }
                    className="rounded-md border border-cyan-500 px-2 py-1 text-xs text-cyan-700"
                  >
                    의사결정 시뮬레이터
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
