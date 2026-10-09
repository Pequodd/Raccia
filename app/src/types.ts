export type UserStatus = 'initiated' | 'candidate' | 'rejected';

export type User = {
  id: number;
  username: string; // login nick
  name: string; // shown name: «Олег#N» until initiated
  avatar: string | null; // sticker id, or «photo:<file>» for an uploaded photo
  bio: string | null; // «о себе», initiated only
  status: UserStatus;
  online?: boolean;
};

// The card on the profile screen.
export type Profile = User & { joinedAt: number; invitedBy: User | null; invitedCount: number };

export type Me = Profile & { isAdmin: boolean; onboarded: boolean; push: boolean; photo: string | null };

export type Member = User & { online: boolean; lastReadId: number; lastDeliveredId: number };

export type MediaKind = 'image' | 'video' | 'voice' | 'circle';
export const MEDIA_KINDS: readonly string[] = ['image', 'video', 'voice', 'circle'];

// --- Conferences (a whole chat, mesh WebRTC, screen sharing) ---
export type ConfPerson = CallPeer & { screen: boolean };
export type Conference = { id: string; active: boolean; video: boolean; startedAt: number; duration?: number; people: ConfPerson[] };
export type ConfInfo = { id: string; chatId: number; video: boolean; title: string };
export type ConfEvent =
  | { type: 'conf_joined'; conf: ConfInfo; peers: ConfPerson[] }
  | { type: 'conf_invite'; conf: ConfInfo & { host: CallPeer } }
  | { type: 'conf_peer_joined'; confId: string; peer: ConfPerson }
  | { type: 'conf_peer_left'; confId: string; userId: number }
  | { type: 'conf_signal'; confId: string; from: number; data: CallSignal }
  | { type: 'conf_screen'; confId: string; userId: number; on: boolean }
  | { type: 'conf_left'; confId: string }
  | { type: 'conf_error'; error: string };

// --- Calls (1:1, in direct chats) ---
export type CallPeer = { id: number; name: string; avatar: string | null };
export type CallInfo = { id: string; chatId: number; video: boolean; from: CallPeer; to: CallPeer };
export type CallOutcome = 'ended' | 'missed' | 'declined' | 'canceled' | 'failed';
export type CallSignal = { sdp?: RTCSessionDescriptionInit; candidate?: RTCIceCandidateInit };
export type CallEvent =
  | { type: 'call_ringing'; call: CallInfo }
  | { type: 'call_incoming'; call: CallInfo }
  | { type: 'call_accepted'; callId: string }
  | { type: 'call_answered_elsewhere'; callId: string }
  | { type: 'call_signal'; callId: string; data: CallSignal }
  | { type: 'call_ended'; callId: string; outcome: CallOutcome }
  | { type: 'call_busy'; chatId: number }
  | { type: 'call_error'; error: string };

// An attachment on the server: file is a path under /media.
export type Media = { file: string; poster?: string; size: number; width: number | null; height: number | null; duration: number | null };

// «Сходка»: a bar (or any place) and a time; friends answer «Иду» / «Не иду».
export type Place = { name: string; address: string | null; phone: string | null; mapUrl: string; note: string | null };
export type Bar = Place & { id: number };
export type Meetup = {
  id: number;
  place: Place;
  startsAt: number;
  createdBy: { id: number; name: string };
  going: { id: number; name: string }[];
  notGoing: { id: number; name: string }[];
  undecided: number;
};

export type Message = {
  id: number;
  chatId: number;
  userId: number;
  kind: 'text' | 'service' | 'meetup' | 'call' | 'conference' | MediaKind;
  media: Media | null;
  meetup?: Meetup | null;
  forwardedFrom?: string | null; // «Переслано от …»
  conference?: Conference | null;
  name: string;
  body: string; // text, or the caption of an attachment
  createdAt: number;
};

// An attachment on its way: shown at once from the local file.
export type MediaDraft = {
  kind: MediaKind;
  uri: string; // local file or blob: URL, for the preview
  blob?: Blob; // web: the file itself
  mime: string;
  width?: number;
  height?: number;
  duration?: number; // ms
  caption?: string;
};

export type Chat = {
  id: number;
  type: 'direct' | 'group';
  title: string;
  members: Member[];
  lastMessage: Message | null;
  unread: number;
  createdAt: number;
};

export type Vote = {
  candidate: User;
  invitedBy: User | null;
  startedAt: number;
  endsAt: number;
  yes: number;
  no: number;
  thinking: number;
  myVote: 'for' | 'against' | null;
  canVote: boolean;
};

export type VoteResult = { candidateId: number; accepted: boolean; yes: number; no: number; user: User };

export type ServerEvent =
  | { type: 'ready'; user: Me }
  | { type: 'me'; user: Me }
  | { type: 'user'; user: User }
  | { type: 'message'; message: Message }
  | { type: 'chat'; chat: Chat }
  | { type: 'read'; chatId: number; userId: number; messageId: number }
  | { type: 'delivered'; chatId: number; userId: number; messageId: number }
  | { type: 'typing'; chatId: number; userId: number; name: string }
  | { type: 'presence'; userId: number; online: boolean }
  | { type: 'meetup'; chatId: number; message: Message }
  | { type: 'message_update'; chatId: number; message: Message }
  | { type: 'chat_deleted'; chatId: number }
  | CallEvent
  | ConfEvent
  | { type: 'vote'; vote: Vote }
  | { type: 'vote_closed'; candidateId: number }
  | ({ type: 'vote_result' } & VoteResult);

// A message the server has not confirmed yet.
export type PendingMessage = {
  tempId: string;
  chatId: number;
  body: string;
  createdAt: number;
  failed: boolean;
  media?: MediaDraft;
  progress?: number; // 0..1 while uploading
};
