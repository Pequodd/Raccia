export type User = {
  id: number;
  username: string;
  online?: boolean;
};

export type Member = User & { online: boolean; lastReadId: number; lastDeliveredId: number };

export type Message = {
  id: number;
  chatId: number;
  userId: number;
  username: string;
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

export type ServerEvent =
  | { type: 'ready'; user: User }
  | { type: 'message'; message: Message }
  | { type: 'chat'; chat: Chat }
  | { type: 'read'; chatId: number; userId: number; messageId: number }
  | { type: 'delivered'; chatId: number; userId: number; messageId: number }
  | { type: 'typing'; chatId: number; userId: number; username: string }
  | { type: 'presence'; userId: number; online: boolean };

// A message the server has not confirmed yet.
export type PendingMessage = {
  tempId: string;
  chatId: number;
  body: string;
  createdAt: number;
  failed: boolean;
};
