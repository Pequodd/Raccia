export type UserStatus = 'initiated' | 'candidate' | 'rejected';

export type User = {
  id: number;
  username: string; // login nick
  name: string; // shown name: «Олег#N» until initiated
  avatar: string | null; // sticker id
  status: UserStatus;
  online?: boolean;
};

export type Me = User & { isAdmin: boolean };

export type Member = User & { online: boolean; lastReadId: number; lastDeliveredId: number };

export type Message = {
  id: number;
  chatId: number;
  userId: number;
  kind: 'text' | 'service';
  name: string;
  body: string;
  createdAt: number;
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
};
