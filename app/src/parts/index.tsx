import type { ReactNode } from 'react';
import type { NativeSyntheticEvent, TextInputKeyPressEventData } from 'react-native';
import { useSkin } from '../skins';
import { winampParts } from './winamp';
import { xpParts } from './xp';

// Pieces of a screen a theme may draw its own way. Screens keep the logic and the
// default (Y2K) look; a theme that needs a different layout — not just colours —
// overrides the piece here. Missing pieces fall back to the screen's default.

export type ChatRowProps = {
  index: number;
  title: string;
  preview: string;
  typing: boolean;
  time: string | null;
  unread: number;
  isNew: boolean; // the other side is a candidate («НОВЫЙ»)
  online: boolean;
  avatar: string | null;
  selected: boolean;
  onPress: () => void;
};

export type ListHeaderProps = {
  myName: string;
  myAvatar: string | null;
  connected: boolean;
  query: string;
  onQuery: (q: string) => void;
  onNewChat: () => void;
  topInset: number;
};

export type ChatHeaderProps = {
  title: string;
  subtitle: string;
  avatar: string | null;
  online: boolean;
  onBack?: () => void;
  onOpenProfile?: () => void; // direct chats: tap the title to see who that is
  wide: boolean;
  topInset: number;
};

export type ComposerProps = {
  value: string;
  onChange: (v: string) => void;
  onSend: () => void;
  onKeyPress: (e: NativeSyntheticEvent<TextInputKeyPressEventData>) => void;
  wide: boolean;
  bottomInset: number;
};

export type TabItem = { key: string; label: string; on: boolean; onPress: () => void };

export type Parts = {
  ListHeader: (p: ListHeaderProps) => ReactNode;
  ChatRow: (p: ChatRowProps) => ReactNode;
  ChatHeader: (p: ChatHeaderProps) => ReactNode;
  Composer: (p: ComposerProps) => ReactNode;
  TabBar: (p: { items: TabItem[]; bottomInset: number }) => ReactNode;
  DayPill: (p: { label: string }) => ReactNode;
  Service: (p: { text: string }) => ReactNode;
  Typing: (p: { name: string; group: boolean }) => ReactNode;
};

const byTheme: Record<string, Partial<Parts>> = {
  winamp: winampParts,
  xp: xpParts,
};

export function useParts(): Partial<Parts> {
  return byTheme[useSkin().id] ?? {};
}
