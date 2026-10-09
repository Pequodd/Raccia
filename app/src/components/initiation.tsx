import * as Clipboard from 'expo-clipboard';
import { LinearGradient } from 'expo-linear-gradient';
import { useEffect, useState } from 'react';
import { Platform, Pressable, Share, StyleSheet, Text, View } from 'react-native';
import { api } from '../api';
import { inviteLink } from '../config';
import { useMessenger } from '../store';
import type { Vote, VoteResult } from '../types';
import { clockTime, diagonal } from '../y2k';
import { makeStyles, useSkin } from '../skins';
import { ChromeButton, Lcd, Lollipop, Plastic } from './y2k';

// Re-renders every second while mounted: drives the LCD countdowns.
function useNow() {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  return now;
}

function countdown(endsAt: number, now: number) {
  const left = Math.max(0, Math.ceil((endsAt - now) / 1000));
  return `${String(Math.floor(left / 60)).padStart(2, '0')}:${String(left % 60).padStart(2, '0')}`;
}

function GrapeCard({ children }: { children: React.ReactNode }) {
  const skin = useSkin();
  const { colors, plastic, fonts, chrome } = skin;
  const styles = useStyles();
  return (
    <View style={styles.card}>
      <View style={[StyleSheet.absoluteFill, styles.cardClip]} pointerEvents="none">
        <LinearGradient colors={plastic.vote} {...diagonal} style={StyleSheet.absoluteFill} />
        <LinearGradient colors={['rgba(255,255,255,0.3)', 'rgba(255,255,255,0)']} style={styles.cardShine} />
      </View>
      {children}
    </View>
  );
}

function Tally({ vote }: { vote: Vote }) {
  const skin = useSkin();
  const { colors, plastic, fonts, chrome } = skin;
  const styles = useStyles();
  const total = vote.yes + vote.no + vote.thinking || 1;
  return (
    <>
      <View style={styles.bar}>
        <View style={[styles.barYes, { flex: vote.yes / total }]} />
        <View style={[styles.barNo, { flex: vote.no / total }]} />
        <View style={{ flex: vote.thinking / total }} />
      </View>
      <Text style={styles.tally}>
        Впустить: {vote.yes} · Отключить: {vote.no} · Думают: {vote.thinking}
      </Text>
    </>
  );
}

// «НОВЫЙ АБОНЕНТ!» — shown to everyone while a newcomer's vote runs.
export function VoteCard({ vote }: { vote: Vote }) {
  const skin = useSkin();
  const { colors, plastic, fonts, chrome } = skin;
  const styles = useStyles();
  const now = useNow();
  const { castVote } = useMessenger();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function cast(v: 'for' | 'against' | null) {
    setBusy(true);
    setError(null);
    try {
      await castVote(vote.candidate.id, v);
    } catch (e) {
      setError(`${skin.copy.errorPrefix} ${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <GrapeCard>
      <View style={styles.titleRow}>
        <Text style={styles.title}>{skin.copy.voteTitle}</Text>
        <Lcd>{countdown(vote.endsAt, now)}</Lcd>
      </View>
      <View style={styles.candidate}>
        <Lollipop name={vote.candidate.name} avatar={vote.candidate.avatar} size={42} />
        <View style={{ flex: 1 }}>
          <Text style={styles.candidateName}>{vote.candidate.name} подключается</Text>
          <Text style={styles.candidateMeta}>
            {vote.invitedBy ? `по инвайту от ${vote.invitedBy.name} · ` : ''}
            {clockTime(vote.startedAt)}
          </Text>
        </View>
      </View>
      <Tally vote={vote} />
      {!vote.canVote ? (
        <Text style={styles.note}>Голосуют только посвящённые абоненты.</Text>
      ) : vote.myVote ? (
        <View style={styles.buttons}>
          <Text style={styles.myVote}>Твой голос: {vote.myVote === 'for' ? 'впустить' : 'отключить'}</Text>
          <ChromeButton label="Передумал" onPress={() => cast(null)} disabled={busy} />
        </View>
      ) : (
        <View style={styles.buttons}>
          <Plastic colors={plastic.lime} style={styles.button} onPress={() => cast('for')} disabled={busy} accessibilityLabel="Впустить">
            <Text style={[styles.buttonText, { color: colors.limeText }]}>{skin.copy.voteFor}</Text>
          </Plastic>
          <ChromeButton label={skin.copy.voteAgainst} onPress={() => cast('against')} disabled={busy} style={styles.button} />
        </View>
      )}
      {error ? <Text style={styles.error}>{error}</Text> : null}
    </GrapeCard>
  );
}

// What the newcomer sees while the others decide.
export function CandidateCard({ vote }: { vote: Vote | undefined }) {
  const skin = useSkin();
  const { colors, plastic, fonts, chrome } = skin;
  const styles = useStyles();
  const now = useNow();
  const { me } = useMessenger();
  return (
    <GrapeCard>
      <View style={styles.titleRow}>
        <Text style={styles.title}>ИДЁТ ГОЛОСОВАНИЕ</Text>
        {vote ? <Lcd>{countdown(vote.endsAt, now)}</Lcd> : null}
      </View>
      <View style={styles.candidate}>
        <Lollipop name={me.name} avatar={me.avatar} size={42} />
        <View style={{ flex: 1 }}>
          <Text style={styles.candidateName}>Ты — {me.name}</Text>
          <Text style={styles.candidateMeta}>Абоненты решают, впустить ли тебя. Писать уже можно.</Text>
        </View>
      </View>
      {vote ? <Tally vote={vote} /> : null}
    </GrapeCard>
  );
}

export function ResultCard({ result }: { result: VoteResult }) {
  const skin = useSkin();
  const { colors, plastic, fonts, chrome } = skin;
  const styles = useStyles();
  const { me, dismissResult } = useMessenger();
  const mine = result.candidateId === me.id;
  let text: string;
  if (mine) {
    text = result.accepted
      ? 'Добро пожаловать в ряды Олегов! Теперь можно сменить имя и аватар в «Абоненте».'
      : `Абоненты сказали «нет». Ты навсегда ${me.name}: писать можно, голосовать и менять имя — нет.`;
  } else {
    text = result.accepted
      ? `${result.user.name} впущен в Олега (${result.yes}:${result.no}).`
      : `${result.user.name} отключён навсегда (${result.yes}:${result.no}).`;
  }
  return (
    <Pressable onPress={() => dismissResult(result.candidateId)} style={[styles.result, !result.accepted && styles.resultNo]}>
      <Text style={styles.resultTitle}>{result.accepted ? 'ВПУЩЕН ✓' : 'ОТКЛЮЧЁН ✕'}</Text>
      <Text style={styles.resultText}>{text}</Text>
      <Text style={styles.resultHint}>нажми, чтобы стереть</Text>
    </Pressable>
  );
}

// «Выдать инвайт»: a one-time link to share.
export function InviteCard({ onClose }: { onClose: () => void }) {
  const skin = useSkin();
  const { colors, plastic, fonts, chrome } = skin;
  const styles = useStyles();
  const [link, setLink] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    api
      .createInvite()
      .then(({ code }) => setLink(inviteLink(code)))
      .catch((e) => setError(`${skin.copy.errorPrefix} ${(e as Error).message}`));
  }, []);

  async function copy() {
    if (!link) return;
    await Clipboard.setStringAsync(link);
    setCopied(true);
  }

  async function share() {
    if (!link) return;
    const message = `Подключайся к Олегу — Ненациональному мессенджеру: ${link}`;
    if (Platform.OS === 'web') {
      const nav = globalThis.navigator as Navigator | undefined;
      if (nav?.share) await nav.share({ text: message }).catch(() => {});
      else await copy();
    } else {
      await Share.share({ message });
    }
  }

  return (
    <GrapeCard>
      <View style={styles.titleRow}>
        <Text style={styles.title}>ИНВАЙТ ВЫДАН</Text>
        <Pressable onPress={onClose} hitSlop={10} accessibilityLabel="Закрыть">
          <Text style={styles.close}>✕</Text>
        </Pressable>
      </View>
      <Text style={styles.candidateMeta}>Ссылка одноразовая. Новичок станет «Олегом#N», пока абоненты не проголосуют.</Text>
      <View style={styles.linkBox}>
        <Text selectable numberOfLines={2} style={styles.link}>
          {link ?? error ?? 'Генерируем…'}
        </Text>
      </View>
      <View style={styles.buttons}>
        <Plastic colors={plastic.bondi} style={styles.button} onPress={share} disabled={!link} accessibilityLabel="Поделиться">
          <Text style={styles.buttonText}>Поделиться</Text>
        </Plastic>
        <ChromeButton label={copied ? 'Скопировано ✓' : 'Скопировать'} onPress={copy} disabled={!link} style={styles.button} />
      </View>
    </GrapeCard>
  );
}

const useStyles = makeStyles(({ colors, fonts, plastic }) => ({
  card: {
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 12,
    gap: 9,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.5)',
    boxShadow: '0 4px 12px rgba(80,40,160,0.35)',
  },
  cardClip: { borderRadius: 20, overflow: 'hidden' },
  cardShine: { position: 'absolute', left: 0, right: 0, top: 0, height: '40%' },
  titleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  title: { fontFamily: fonts.display, fontSize: 16, color: colors.white },
  close: { color: colors.white, fontFamily: fonts.bodyHeavy, fontSize: 16 },
  candidate: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  candidateName: { fontFamily: fonts.bodyHeavy, fontSize: 15, color: colors.white },
  candidateMeta: { fontFamily: fonts.body, fontSize: 12, color: 'rgba(255,255,255,0.85)' },
  bar: { height: 8, borderRadius: 4, flexDirection: 'row', overflow: 'hidden', backgroundColor: 'rgba(255,255,255,0.25)' },
  barYes: { backgroundColor: colors.neon, boxShadow: `0 0 6px ${colors.neonGlow}` },
  barNo: { backgroundColor: colors.voteNo },
  tally: { fontFamily: fonts.body, fontSize: 12, color: 'rgba(255,255,255,0.9)' },
  note: { fontFamily: fonts.bodyBold, fontSize: 12, color: 'rgba(255,255,255,0.85)' },
  buttons: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  button: { flex: 1, height: 38, alignItems: 'center', justifyContent: 'center' },
  buttonText: { fontFamily: fonts.bodyHeavy, fontSize: 14, color: colors.white },
  myVote: { flex: 1, fontFamily: fonts.bodyHeavy, fontSize: 14, color: colors.white },
  error: { fontFamily: fonts.bodyBold, fontSize: 12, color: '#FFC6F2' },
  linkBox: {
    backgroundColor: colors.lcdBg,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    boxShadow: 'inset 0 1px 3px rgba(30,42,16,0.45)',
  },
  link: { fontFamily: fonts.mono, fontSize: 13, color: colors.lcdText },
  result: {
    borderRadius: 18,
    padding: 12,
    gap: 3,
    backgroundColor: colors.okBg,
    borderWidth: 1,
    borderColor: colors.okBorder,
  },
  resultNo: { backgroundColor: colors.dangerBg, borderColor: colors.dangerBorder },
  resultTitle: { fontFamily: fonts.mono, fontSize: 12, color: colors.ink },
  resultText: { fontFamily: fonts.bodyBold, fontSize: 14, color: colors.ink },
  resultHint: { fontFamily: fonts.mono, fontSize: 10, color: colors.text4 },
}));
