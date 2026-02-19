export type Relationship = 'boss' | 'peer' | 'client' | 'friend' | 'family' | 'stranger' | 'romance_interest';
export type Goal = 'request' | 'refuse' | 'negotiate' | 'maintain' | 'deescalate';
export type ImageGoal =
  | 'professional'
  | 'kind'
  | 'firm_polite'
  | 'leaderlike'
  | 'humble'
  | 'relaxed';
export type BannedTone = 'blame' | 'over_apology' | 'excuses' | 'emotional_outburst';
export type SendPolicy = 'prefer_fast' | 'prefer_calm' | 'prefer_boundary';
export type MemberRole = 'owner' | 'member';

export interface RoomDefaults {
  relationship: Relationship;
  goal: Goal;
  image_goal: ImageGoal[];
  banned_tones: BannedTone[];
  default_send_policy: SendPolicy;
  language: 'ko' | string;
}

export interface ChatRoom {
  id: string;
  name: string | null;
  owner_user_id: string;
  contact_id: string | null;
  contact_alias: string | null;
  contact_email: string | null;
  default_relationship: Relationship;
  default_goal: Goal;
  default_image_goal: ImageGoal[];
  default_banned_tones: BannedTone[];
  default_send_policy: SendPolicy;
  created_at: string;
  updated_at: string;
}

export interface ChatMember {
  user_id: string;
  role: MemberRole;
  name: string | null;
  email: string | null;
  joined_at: string;
}

export interface ChatSender {
  user_id: string;
  name: string | null;
}

export interface ChatMessage {
  id: string;
  room_id: string;
  sender: ChatSender;
  text: string;
  created_at: string;
}

export interface ChatAttachment {
  id: string;
  room_id: string;
  uploaded_by_user_id: string;
  filename: string;
  mime_type: string;
  size_bytes: number;
  extracted_preview: string | null;
  extracted_text: string | null;
  created_at: string;
}

export interface ChatRoomCreateRequest {
  name?: string;
  contact_id?: string;
  defaults?: RoomDefaults;
}

export interface ChatRoomContactMapRequest {
  contact_id?: string;
  target_user?: string;
  source?: string;
}

export interface ChatRoomCreateResponse {
  room: ChatRoom;
  invite_token: string;
  invite_link: string;
}

export interface ChatRoomListItem {
  room: ChatRoom;
  role: MemberRole;
  member_count: number;
}

export interface ChatRoomListResponse {
  rooms: ChatRoomListItem[];
}

export interface Contact {
  id: string;
  owner_user_id: string;
  contact_user_id: string | null;
  alias: string | null;
  email: string;
  source: string;
  created_at: string;
  updated_at: string;
}

export interface ContactCreateRequest {
  email: string;
  alias?: string;
  source?: string;
}

export interface ContactListResponse {
  contacts: Contact[];
}

export interface ChatRoomDetailResponse {
  room: ChatRoom;
  members: ChatMember[];
  recent_messages: ChatMessage[];
}

export interface ChatAttachmentListResponse {
  attachments: ChatAttachment[];
}

export interface ChatRoomJoinResponse {
  room_id: string;
  joined: boolean;
}

export interface InviteReissueResponse {
  room_id: string;
  invite_token: string;
  invite_link: string;
}

export interface ChatRoomSettingsUpdateRequest {
  relationship?: Relationship;
  goal?: Goal;
  image_goal?: ImageGoal[];
  banned_tones?: BannedTone[];
  default_send_policy?: SendPolicy;
}

export interface ClientMessageNewEvent {
  type: 'message:new';
  text: string;
}

export interface ClientTypingEvent {
  type: 'typing';
}

export interface ServerJoinLeaveEvent {
  type: 'join' | 'leave';
  member: ChatSender;
}

export interface ServerTypingEvent {
  type: 'typing';
  member: ChatSender;
}

export interface ServerMessageNewEvent {
  type: 'message:new';
  message: ChatMessage;
}

export type ServerChatEvent = ServerJoinLeaveEvent | ServerTypingEvent | ServerMessageNewEvent;
