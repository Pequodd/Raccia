import { API_URL } from './config';
import type { Chat, Me, Message, User, Vote } from './types';

export class ApiError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

let authToken: string | null = null;

export function setAuthToken(token: string | null) {
  authToken = token;
}

async function request<T>(path: string, body?: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(API_URL + path, {
      method: body === undefined ? 'GET' : 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new ApiError('Нет связи с сервером', 0);
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(data.error ?? `Ошибка ${res.status}`, res.status);
  return data as T;
}

type Session = { token: string; user: Me };

export const api = {
  register: (username: string, password: string, invite?: string) =>
    request<Session>('/api/register', { username, password, invite }),
  invite: (code: string) => request<{ invitedBy: string }>(`/api/invites/${encodeURIComponent(code)}`),
  createInvite: () => request<{ code: string }>('/api/invites', {}),
  votes: () => request<{ votes: Vote[] }>('/api/votes'),
  vote: (candidateId: number, vote: 'for' | 'against' | null) =>
    request<{ vote: Vote | null }>(`/api/votes/${candidateId}`, { vote }),
  updateProfile: (profile: { name?: string; avatar?: string | null }) => request<{ user: Me }>('/api/me', profile),
  login: (username: string, password: string) => request<Session>('/api/login', { username, password }),
  logout: () => request<{ ok: true }>('/api/logout', {}),
  me: () => request<{ user: Me }>('/api/me'),
  searchUsers: (q: string) => request<{ users: User[] }>(`/api/users?q=${encodeURIComponent(q)}`),
  chats: () => request<{ chats: Chat[] }>('/api/chats'),
  openDirect: (userId: number) => request<{ chat: Chat }>('/api/chats/direct', { userId }),
  createGroup: (title: string, memberIds: number[]) =>
    request<{ chat: Chat }>('/api/chats/group', { title, memberIds }),
  messages: (chatId: number, before?: number) =>
    request<{ messages: Message[]; hasMore: boolean }>(
      `/api/chats/${chatId}/messages${before ? `?before=${before}` : ''}`
    ),
  send: (chatId: number, body: string) => request<{ message: Message }>(`/api/chats/${chatId}/messages`, { body }),
  markRead: (chatId: number, messageId: number) =>
    request<{ ok: true }>(`/api/chats/${chatId}/read`, { messageId }),
};
