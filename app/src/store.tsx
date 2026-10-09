import { createContext, useCallback, useContext, useEffect, useMemo, useReducer, useRef, useState, type ReactNode } from 'react';
import { AppState, Platform } from 'react-native';
import { api } from './api';
import { Socket } from './socket';
import type { Chat, Me, Message, PendingMessage, ServerEvent, Vote, VoteResult } from './types';

type ChatMessages = { items: Message[]; hasMore: boolean; loaded: boolean };

type State = {
  chats: Chat[];
  messages: Record<number, ChatMessages>;
  typing: Record<number, { name: string; until: number } | undefined>;
  votes: Record<number, Vote>; // by candidate id, while the vote runs
  results: VoteResult[]; // finished votes not yet dismissed
  pending: Record<number, PendingMessage[] | undefined>;
  connected: boolean;
};

type Action =
  | { type: 'chats'; chats: Chat[] }
  | { type: 'upsertChat'; chat: Chat }
  | { type: 'messages'; chatId: number; items: Message[]; hasMore: boolean; prepend: boolean }
  | { type: 'message'; message: Message; me: number; activeChatId: number | null }
  | { type: 'read'; chatId: number; userId: number; messageId: number; me: number }
  | { type: 'delivered'; chatId: number; userId: number; messageId: number }
  | { type: 'pendingAdd'; item: PendingMessage }
  | { type: 'pendingFail'; chatId: number; tempId: string; failed: boolean }
  | { type: 'pendingDrop'; chatId: number; tempId: string }
  | { type: 'typing'; chatId: number; name: string }
  | { type: 'votes'; votes: Vote[] }
  | { type: 'vote'; vote: Vote }
  | { type: 'voteClosed'; candidateId: number }
  | { type: 'voteResult'; result: VoteResult }
  | { type: 'dismissResult'; candidateId: number }
  | { type: 'clearTyping'; chatId: number }
  | { type: 'presence'; userId: number; online: boolean }
  | { type: 'connected'; connected: boolean };

const initialState: State = { chats: [], messages: {}, typing: {}, pending: {}, votes: {}, results: [], connected: false };

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

    case 'delivered':
      return {
        ...state,
        chats: state.chats.map((c) =>
          c.id !== action.chatId
            ? c
            : {
                ...c,
                members: c.members.map((m) =>
                  m.id === action.userId
                    ? { ...m, lastDeliveredId: Math.max(m.lastDeliveredId, action.messageId) }
                    : m
                ),
              }
        ),
      };

    case 'pendingAdd': {
      const list = state.pending[action.item.chatId] ?? [];
      return { ...state, pending: { ...state.pending, [action.item.chatId]: [...list, action.item] } };
    }

    case 'pendingFail': {
      const list = (state.pending[action.chatId] ?? []).map((p) =>
        p.tempId === action.tempId ? { ...p, failed: action.failed } : p
      );
      return { ...state, pending: { ...state.pending, [action.chatId]: list } };
    }

    case 'pendingDrop': {
      const list = (state.pending[action.chatId] ?? []).filter((p) => p.tempId !== action.tempId);
      return { ...state, pending: { ...state.pending, [action.chatId]: list } };
    }

    case 'typing':
      return {
        ...state,
        typing: { ...state.typing, [action.chatId]: { name: action.name, until: Date.now() + 4000 } },
      };

    case 'votes':
      return { ...state, votes: Object.fromEntries(action.votes.map((v) => [v.candidate.id, v])) };

    case 'vote':
      return { ...state, votes: { ...state.votes, [action.vote.candidate.id]: action.vote } };

    case 'voteClosed': {
      const { [action.candidateId]: _closed, ...votes } = state.votes;
      return { ...state, votes };
    }

    case 'voteResult': {
      const { [action.result.candidateId]: _done, ...votes } = state.votes;
      const results = [action.result, ...state.results.filter((r) => r.candidateId !== action.result.candidateId)];
      return { ...state, votes, results };
    }

    case 'dismissResult':
      return { ...state, results: state.results.filter((r) => r.candidateId !== action.candidateId) };

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

// Is Oleg on screen right now? The server skips push for people who are looking.
function isVisible() {
  if (Platform.OS === 'web') return typeof document === 'undefined' || document.visibilityState === 'visible';
  return AppState.currentState === 'active';
}

// A message from someone else in a chat that is not open: the in-app banner shows it.
export type Incoming = { key: number; message: Message; title: string };

type Messenger = State & {
  me: Me;
  incoming: Incoming | null;
  dismissIncoming: () => void;
  setMe: (me: Me) => void;
  castVote: (candidateId: number, vote: 'for' | 'against' | null) => Promise<void>;
  dismissResult: (candidateId: number) => void;
  activeChatId: number | null;
  setActiveChat: (chatId: number | null) => void;
  loadMessages: (chatId: number, older?: boolean) => Promise<void>;
  sendMessage: (chatId: number, body: string) => void;
  retryMessage: (item: PendingMessage) => void;
  markRead: (chatId: number) => void;
  notifyTyping: (chatId: number) => void;
  openDirect: (userId: number) => Promise<Chat>;
  createGroup: (title: string, memberIds: number[]) => Promise<Chat>;
};

const MessengerContext = createContext<Messenger | null>(null);

export function MessengerProvider({
  me: initialMe,
  token,
  activeChatId,
  setActiveChat,
  children,
}: {
  me: Me;
  token: string;
  activeChatId: number | null;
  setActiveChat: (chatId: number | null) => void;
  children: ReactNode;
}) {
  const [state, dispatch] = useReducer(reducer, initialState);
  const [me, setMe] = useState(initialMe);
  const [incoming, setIncoming] = useState<Incoming | null>(null);
  const socketRef = useRef<Socket | null>(null);
  const activeRef = useRef(activeChatId);
  activeRef.current = activeChatId;
  const stateRef = useRef(state);
  stateRef.current = state;

  const refreshChats = useCallback(async () => {
    const { chats } = await api.chats();
    dispatch({ type: 'chats', chats });
  }, []);

  const refreshVotes = useCallback(async () => {
    const { votes } = await api.votes();
    dispatch({ type: 'votes', votes });
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
        case 'ready':
        case 'me':
          setMe(event.user);
          break;
        case 'user':
          // Someone changed name or avatar: titles and member lists follow.
          refreshChats().catch(() => {});
          break;
        case 'vote':
          dispatch({ type: 'vote', vote: event.vote });
          break;
        case 'vote_closed':
          dispatch({ type: 'voteClosed', candidateId: event.candidateId });
          break;
        case 'vote_result': {
          const { type: _t, ...result } = event;
          dispatch({ type: 'voteResult', result });
          refreshChats().catch(() => {});
          break;
        }
        case 'message':
          dispatch({ type: 'message', message: event.message, me: me.id, activeChatId: activeRef.current });
          if (event.message.chatId === activeRef.current && event.message.userId !== me.id) {
            setTimeout(() => markRead(event.message.chatId), 0);
          } else if (event.message.userId !== me.id) {
            const chat = stateRef.current.chats.find((c) => c.id === event.message.chatId);
            setIncoming({ key: event.message.id, message: event.message, title: chat?.title ?? event.message.name });
          }
          break;
        case 'chat':
          dispatch({ type: 'upsertChat', chat: event.chat });
          break;
        case 'read':
          dispatch({ type: 'read', chatId: event.chatId, userId: event.userId, messageId: event.messageId, me: me.id });
          break;
        case 'delivered':
          dispatch({ type: 'delivered', chatId: event.chatId, userId: event.userId, messageId: event.messageId });
          break;
        case 'typing':
          dispatch({ type: 'typing', chatId: event.chatId, name: event.name });
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
        socketRef.current?.send({ type: 'visibility', visible: isVisible() });
        refreshChats().catch(() => {});
        refreshVotes().catch(() => {});
        const active = activeRef.current;
        if (active) api.messages(active).then((r) =>
          dispatch({ type: 'messages', chatId: active, items: r.messages, hasMore: r.hasMore, prepend: false })
        ).catch(() => {});
      }
    };
    const socket = new Socket(token, onEvent, onStatus);
    socketRef.current = socket;
    return () => socket.close();
  }, [token, me.id, refreshChats, refreshVotes, markRead]);

  useEffect(() => {
    const report = () => socketRef.current?.send({ type: 'visibility', visible: isVisible() });
    if (Platform.OS === 'web') {
      if (typeof document === 'undefined') return;
      document.addEventListener('visibilitychange', report);
      return () => document.removeEventListener('visibilitychange', report);
    }
    const sub = AppState.addEventListener('change', report);
    return () => sub.remove();
  }, []);

  const dismissIncoming = useCallback(() => setIncoming(null), []);

  const castVote = useCallback(async (candidateId: number, vote: 'for' | 'against' | null) => {
    const res = await api.vote(candidateId, vote);
    if (res.vote) dispatch({ type: 'vote', vote: res.vote });
  }, []);

  const dismissResult = useCallback((candidateId: number) => dispatch({ type: 'dismissResult', candidateId }), []);

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

  const lastTypingSent = useRef(0);

  // Optimistic send: the bubble shows at once, turns into «Ошибка Y2K! Повторить» on failure.
  const deliver = useCallback(async (item: PendingMessage) => {
    dispatch({ type: 'pendingFail', chatId: item.chatId, tempId: item.tempId, failed: false });
    try {
      const { message } = await api.send(item.chatId, item.body);
      dispatch({ type: 'message', message, me: me.id, activeChatId: activeRef.current });
      dispatch({ type: 'pendingDrop', chatId: item.chatId, tempId: item.tempId });
    } catch {
      dispatch({ type: 'pendingFail', chatId: item.chatId, tempId: item.tempId, failed: true });
    }
  }, [me.id]);

  const sendMessage = useCallback((chatId: number, body: string) => {
    const item: PendingMessage = {
      tempId: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
      chatId,
      body,
      createdAt: Date.now(),
      failed: false,
    };
    dispatch({ type: 'pendingAdd', item });
    deliver(item);
    // The recipient's typing indicator clears on our message; let the next keystroke re-announce it.
    lastTypingSent.current = 0;
  }, [deliver]);

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
      setMe,
      incoming,
      dismissIncoming,
      castVote,
      dismissResult,
      activeChatId,
      setActiveChat,
      loadMessages,
      sendMessage,
      retryMessage: deliver,
      markRead,
      notifyTyping,
      openDirect,
      createGroup,
    }),
    [state, me, incoming, dismissIncoming, castVote, dismissResult, activeChatId, setActiveChat, loadMessages, sendMessage, deliver, markRead, notifyTyping, openDirect, createGroup]
  );

  return <MessengerContext.Provider value={value}>{children}</MessengerContext.Provider>;
}

export function useMessenger() {
  const ctx = useContext(MessengerContext);
  if (!ctx) throw new Error('useMessenger must be used inside MessengerProvider');
  return ctx;
}
