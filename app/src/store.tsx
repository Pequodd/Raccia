import { createContext, useCallback, useContext, useEffect, useMemo, useReducer, useRef, type ReactNode } from 'react';
import { api } from './api';
import { Socket } from './socket';
import type { Chat, Message, ServerEvent, User } from './types';

type ChatMessages = { items: Message[]; hasMore: boolean; loaded: boolean };

type State = {
  chats: Chat[];
  messages: Record<number, ChatMessages>;
  typing: Record<number, { username: string; until: number } | undefined>;
  connected: boolean;
};

type Action =
  | { type: 'chats'; chats: Chat[] }
  | { type: 'upsertChat'; chat: Chat }
  | { type: 'messages'; chatId: number; items: Message[]; hasMore: boolean; prepend: boolean }
  | { type: 'message'; message: Message; me: number; activeChatId: number | null }
  | { type: 'read'; chatId: number; userId: number; messageId: number; me: number }
  | { type: 'typing'; chatId: number; username: string }
  | { type: 'clearTyping'; chatId: number }
  | { type: 'presence'; userId: number; online: boolean }
  | { type: 'connected'; connected: boolean };

const initialState: State = { chats: [], messages: {}, typing: {}, connected: false };

const lastActivity = (c: Chat) => c.lastMessage?.createdAt ?? c.createdAt;
const sortChats = (chats: Chat[]) => [...chats].sort((a, b) => lastActivity(b) - lastActivity(a));

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case 'chats':
      return { ...state, chats: sortChats(action.chats) };

    case 'upsertChat': {
      const rest = state.chats.filter((c) => c.id !== action.chat.id);
      return { ...state, chats: sortChats([action.chat, ...rest]) };
    }

    case 'messages': {
      const prev = state.messages[action.chatId];
      const existing = prev?.items ?? [];
      const known = new Set(existing.map((m) => m.id));
      const fresh = action.items.filter((m) => !known.has(m.id));
      const items = action.prepend ? [...fresh, ...existing] : mergeSorted(existing, fresh);
      return {
        ...state,
        messages: { ...state.messages, [action.chatId]: { items, hasMore: action.hasMore, loaded: true } },
      };
    }

    case 'message': {
      const { message, me, activeChatId } = action;
      const bucket = state.messages[message.chatId];
      const messages =
        bucket && !bucket.items.some((m) => m.id === message.id)
          ? { ...state.messages, [message.chatId]: { ...bucket, items: [...bucket.items, message] } }
          : state.messages;
      const countsAsUnread = message.userId !== me && message.chatId !== activeChatId;
      const chats = sortChats(
        state.chats.map((c) =>
          c.id === message.chatId
            ? { ...c, lastMessage: message, unread: countsAsUnread ? c.unread + 1 : c.unread }
            : c
        )
      );
      const typing = { ...state.typing, [message.chatId]: undefined };
      return { ...state, messages, chats, typing };
    }

    case 'read':
      return {
        ...state,
        chats: state.chats.map((c) =>
          c.id !== action.chatId
            ? c
            : {
                ...c,
                unread: action.userId === action.me ? 0 : c.unread,
                members: c.members.map((m) =>
                  m.id === action.userId ? { ...m, lastReadId: Math.max(m.lastReadId, action.messageId) } : m
                ),
              }
        ),
      };

    case 'typing':
      return {
        ...state,
        typing: { ...state.typing, [action.chatId]: { username: action.username, until: Date.now() + 4000 } },
      };

    case 'clearTyping':
      return { ...state, typing: { ...state.typing, [action.chatId]: undefined } };

    case 'presence':
      return {
        ...state,
        chats: state.chats.map((c) => ({
          ...c,
          members: c.members.map((m) => (m.id === action.userId ? { ...m, online: action.online } : m)),
        })),
      };

    case 'connected':
      return { ...state, connected: action.connected };
  }
}

function mergeSorted(a: Message[], b: Message[]) {
  return [...a, ...b].sort((x, y) => x.id - y.id);
}

type Messenger = State & {
  me: User;
  activeChatId: number | null;
  setActiveChat: (chatId: number | null) => void;
  loadMessages: (chatId: number, older?: boolean) => Promise<void>;
  sendMessage: (chatId: number, body: string) => Promise<void>;
  markRead: (chatId: number) => void;
  notifyTyping: (chatId: number) => void;
  openDirect: (userId: number) => Promise<Chat>;
  createGroup: (title: string, memberIds: number[]) => Promise<Chat>;
};

const MessengerContext = createContext<Messenger | null>(null);

export function MessengerProvider({
  me,
  token,
  activeChatId,
  setActiveChat,
  children,
}: {
  me: User;
  token: string;
  activeChatId: number | null;
  setActiveChat: (chatId: number | null) => void;
  children: ReactNode;
}) {
  const [state, dispatch] = useReducer(reducer, initialState);
  const socketRef = useRef<Socket | null>(null);
  const activeRef = useRef(activeChatId);
  activeRef.current = activeChatId;
  const stateRef = useRef(state);
  stateRef.current = state;

  const refreshChats = useCallback(async () => {
    const { chats } = await api.chats();
    dispatch({ type: 'chats', chats });
  }, []);

  const markRead = useCallback((chatId: number) => {
    const items = stateRef.current.messages[chatId]?.items;
    const last = items?.[items.length - 1];
    const chat = stateRef.current.chats.find((c) => c.id === chatId);
    if (!last || !chat) return;
    const mine = chat.members.find((m) => m.id === me.id);
    if (chat.unread === 0 && mine && mine.lastReadId >= last.id) return;
    dispatch({ type: 'read', chatId, userId: me.id, messageId: last.id, me: me.id });
    api.markRead(chatId, last.id).catch(() => {});
  }, [me.id]);

  useEffect(() => {
    const onEvent = (event: ServerEvent) => {
      switch (event.type) {
        case 'message':
          dispatch({ type: 'message', message: event.message, me: me.id, activeChatId: activeRef.current });
          if (event.message.chatId === activeRef.current && event.message.userId !== me.id) {
            setTimeout(() => markRead(event.message.chatId), 0);
          }
          break;
        case 'chat':
          dispatch({ type: 'upsertChat', chat: event.chat });
          break;
        case 'read':
          dispatch({ type: 'read', chatId: event.chatId, userId: event.userId, messageId: event.messageId, me: me.id });
          break;
        case 'typing':
          dispatch({ type: 'typing', chatId: event.chatId, username: event.username });
          setTimeout(() => {
            const t = stateRef.current.typing[event.chatId];
            if (t && t.until <= Date.now()) dispatch({ type: 'clearTyping', chatId: event.chatId });
          }, 4100);
          break;
        case 'presence':
          dispatch({ type: 'presence', userId: event.userId, online: event.online });
          break;
      }
    };
    const onStatus = (connected: boolean) => {
      dispatch({ type: 'connected', connected });
      // After a reconnect, catch up on anything missed while offline.
      if (connected) {
        refreshChats().catch(() => {});
        const active = activeRef.current;
        if (active) api.messages(active).then((r) =>
          dispatch({ type: 'messages', chatId: active, items: r.messages, hasMore: r.hasMore, prepend: false })
        ).catch(() => {});
      }
    };
    const socket = new Socket(token, onEvent, onStatus);
    socketRef.current = socket;
    return () => socket.close();
  }, [token, me.id, refreshChats, markRead]);

  const loadMessages = useCallback(async (chatId: number, older = false) => {
    const bucket = stateRef.current.messages[chatId];
    const before = older ? bucket?.items[0]?.id : undefined;
    if (older && (!bucket?.hasMore || !before)) return;
    const { messages, hasMore } = await api.messages(chatId, before);
    dispatch({
      type: 'messages',
      chatId,
      items: messages,
      hasMore: older || !bucket ? hasMore : bucket.hasMore,
      prepend: older,
    });
  }, []);

  const sendMessage = useCallback(async (chatId: number, body: string) => {
    const { message } = await api.send(chatId, body);
    dispatch({ type: 'message', message, me: me.id, activeChatId: activeRef.current });
  }, [me.id]);

  const lastTypingSent = useRef(0);
  const notifyTyping = useCallback((chatId: number) => {
    const now = Date.now();
    if (now - lastTypingSent.current < 2500) return;
    lastTypingSent.current = now;
    socketRef.current?.send({ type: 'typing', chatId });
  }, []);

  const openDirect = useCallback(async (userId: number) => {
    const { chat } = await api.openDirect(userId);
    dispatch({ type: 'upsertChat', chat });
    return chat;
  }, []);

  const createGroup = useCallback(async (title: string, memberIds: number[]) => {
    const { chat } = await api.createGroup(title, memberIds);
    dispatch({ type: 'upsertChat', chat });
    return chat;
  }, []);

  const value = useMemo<Messenger>(
    () => ({
      ...state,
      me,
      activeChatId,
      setActiveChat,
      loadMessages,
      sendMessage,
      markRead,
      notifyTyping,
      openDirect,
      createGroup,
    }),
    [state, me, activeChatId, setActiveChat, loadMessages, sendMessage, markRead, notifyTyping, openDirect, createGroup]
  );

  return <MessengerContext.Provider value={value}>{children}</MessengerContext.Provider>;
}

export function useMessenger() {
  const ctx = useContext(MessengerContext);
  if (!ctx) throw new Error('useMessenger must be used inside MessengerProvider');
  return ctx;
}
