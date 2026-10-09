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

// An attachment on the server: file is a path under /media.
export type Media = { file: string; poster?: string; size: number; width: number | null; height: number | null; duration: number | null };

// «Сходка»: a bar (or any place) and a time; friends answer «Иду» / «Не иду».
export type Place = { name: string; address: string | null; phone: string | null; mapUrl: string; note: string | null };
export type Bar = Place & { id: number };
export type Meetup = {
  id: number;
  number: number; // «Заявка №4815»
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
  kind: 'text' | 'service' | 'meetup' | MediaKind;
  media: Media | null;
  meetup?: Meetup | null;
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
