import { useEffect, useMemo, useState } from 'react';
import { KeyboardAvoidingView, Linking, Modal, Platform, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { api } from '../api';
import { makeStyles, useSkin } from '../skins';
import { useMessenger } from '../store';
import type { Bar, Message } from '../types';
import { ChromeButton, Plastic } from './y2k';

export function meetupWhen(ts: number) {
  const d = new Date(ts);
  const day = d.toLocaleDateString('ru-RU', { weekday: 'short', day: 'numeric', month: 'long' });
  const time = d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
  return `${day} · ${time}`;
}

// The card in the chat: where, when, who is going, and buttons to answer, call, find on the map.
export function MeetupCard({ message }: { message: Message }) {
  const styles = useStyles();
  const skin = useSkin();
  const { roles, colors } = skin;
  const { me, replaceMessage } = useMessenger();
  const [busy, setBusy] = useState(false);
  const m = message.meetup;
  if (!m) return null;
  const mine = m.going.some((u) => u.id === me.id) ? 'yes' : m.notGoing.some((u) => u.id === me.id) ? 'no' : null;
  const past = m.startsAt < Date.now() - 3 * 3600_000;

  async function answer(a: 'yes' | 'no') {
    setBusy(true);
    try {
      const { message: updated } = await api.answerMeetup(m!.id, mine === a ? null : a);
      replaceMessage(updated);
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={styles.card}>
      <Text style={styles.kicker}>🍺 Сходка · предложил(а) {m.createdBy.name}</Text>
      <Text style={styles.when}>{meetupWhen(m.startsAt)}</Text>
      <Text style={styles.place}>{m.place.name}</Text>
      {m.place.address ? <Text style={styles.address}>{m.place.address}</Text> : null}
      {m.place.note ? <Text style={styles.note}>{m.place.note}</Text> : null}

      <View style={styles.people}>
        <Text style={styles.peopleLine}>
          <Text style={styles.peopleLabel}>Идут: </Text>
          {m.going.length ? m.going.map((u) => u.name).join(', ') : 'пока никто'}
        </Text>
        <Text style={styles.peopleMeta}>
          Не идут: {m.notGoing.length} · Думают: {m.undecided}
        </Text>
      </View>

      {past ? null : (
        <View style={styles.row}>
          <Plastic
            colors={mine === 'yes' ? roles.positive.grad : roles.negative.grad}
            style={styles.button}
            onPress={() => answer('yes')}
            disabled={busy}
            accessibilityLabel={mine === 'yes' ? 'Иду (отменить)' : 'Иду'}
          >
            <Text style={[styles.buttonText, { color: mine === 'yes' ? roles.positive.text : roles.negative.text }]}>
              {mine === 'yes' ? '✓ Иду' : 'Иду'}
            </Text>
          </Plastic>
          <Plastic
            colors={mine === 'no' ? roles.danger.grad : roles.negative.grad}
            style={styles.button}
            onPress={() => answer('no')}
            disabled={busy}
            accessibilityLabel={mine === 'no' ? 'Не иду (отменить)' : 'Не иду'}
          >
            <Text style={[styles.buttonText, { color: mine === 'no' ? roles.danger.text : roles.negative.text }]}>
              {mine === 'no' ? '✕ Не иду' : 'Не иду'}
            </Text>
          </Plastic>
        </View>
      )}
      <View style={styles.row}>
        {m.place.phone ? (
          <ChromeButton label="📞 Позвонить" onPress={() => Linking.openURL(`tel:${m.place.phone!.replace(/[^\d+]/g, '')}`)} style={styles.button} />
        ) : null}
        <ChromeButton label="🗺 На карте и бронь" onPress={() => Linking.openURL(m.place.mapUrl)} style={styles.button} />
      </View>
      <Text style={[styles.stamp, { color: colors.text3 }]}>
        Заявка №{m.number} передана в Министерство Пятничного Отдыха
      </Text>
    </View>
  );
}

const QUICK_TIMES = ['18:00', '19:00', '20:00', '21:00', '22:00'];

function dayOptions() {
  const out: { label: string; date: Date }[] = [];
  const now = new Date();
  for (let i = 0; i < 8; i++) {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() + i);
    const label = i === 0 ? 'Сегодня' : i === 1 ? 'Завтра' : d.toLocaleDateString('ru-RU', { weekday: 'short', day: 'numeric' });
    out.push({ label, date: d });
  }
  return out;
}

// «Сходка в бар»: pick a bar (or type any place), a day and a time.
export function MeetupSheet({ chatId, visible, onClose }: { chatId: number; visible: boolean; onClose: () => void }) {
  const styles = useStyles();
  const skin = useSkin();
  const { roles, colors } = skin;
  const insets = useSafeAreaInsets();
  const [bars, setBars] = useState<Bar[] | null>(null);
  const [barId, setBarId] = useState<number | null>(null);
  const [custom, setCustom] = useState('');
  const [address, setAddress] = useState('');
  const days = useMemo(dayOptions, [visible]);
  const [day, setDay] = useState(0);
  const [time, setTime] = useState('20:00');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!visible) return;
    setError(null);
    api
      .bars()
      .then(({ bars }) => setBars(bars))
      .catch(() => setBars([]));
  }, [visible]);

  async function create() {
    setError(null);
    const [h, min] = time.split(':').map(Number);
    if (!Number.isInteger(h) || !Number.isInteger(min) || h > 23 || min > 59) return setError('Время в виде 20:30');
    const d = days[day].date;
    const startsAt = new Date(d.getFullYear(), d.getMonth(), d.getDate(), h, min).getTime();
    if (barId == null && !custom.trim()) return setError('Выберите бар или напишите, куда идём');
    setBusy(true);
    try {
      await api.createMeetup(chatId, barId != null ? { barId, startsAt } : { place: { name: custom.trim(), address: address.trim() || undefined }, startsAt });
      onClose();
      setBarId(null);
      setCustom('');
      setAddress('');
    } catch (e) {
      setError(`${skin.copy.errorPrefix} ${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.scrim} onPress={onClose} accessibilityLabel="Закрыть" />
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={[styles.sheet, { paddingBottom: insets.bottom + 12 }]}>
        <ScrollView contentContainerStyle={{ gap: 12 }} keyboardShouldPersistTaps="handled">
          <Text style={styles.sheetTitle}>Сходка в бар</Text>
          <Text style={styles.sheetText}>Друзья ответят «Иду» или «Не иду», а в карточке будут кнопки позвонить в бар и открыть его в Яндекс Картах для брони.</Text>

          <Text style={styles.label}>Куда</Text>
          {bars === null ? (
            <Text style={styles.sheetText}>Загружаем бары…</Text>
          ) : bars.length ? (
            <View style={styles.chips}>
              {bars.map((b) => (
                <Pressable key={b.id} onPress={() => setBarId(barId === b.id ? null : b.id)} style={[styles.chip, barId === b.id && styles.chipOn]} accessibilityRole="radio" accessibilityState={{ selected: barId === b.id }}>
                  <Text style={[styles.chipText, barId === b.id && styles.chipTextOn]}>{b.name}</Text>
                </Pressable>
              ))}
            </View>
          ) : (
            <Text style={styles.sheetText}>Список баров пока пуст: его ведёт супер-админ в настройках. Напишите место сами.</Text>
          )}
          {barId == null ? (
            <>
              <TextInput style={styles.input} value={custom} onChangeText={setCustom} placeholder="Или своё место: бар, кафе, дача" placeholderTextColor={colors.placeholder} maxLength={120} />
              <TextInput style={styles.input} value={address} onChangeText={setAddress} placeholder="Адрес (необязательно)" placeholderTextColor={colors.placeholder} maxLength={120} />
            </>
          ) : null}

          <Text style={styles.label}>Когда</Text>
          <View style={styles.chips}>
            {days.map((d, i) => (
              <Pressable key={d.label} onPress={() => setDay(i)} style={[styles.chip, day === i && styles.chipOn]} accessibilityRole="radio" accessibilityState={{ selected: day === i }}>
                <Text style={[styles.chipText, day === i && styles.chipTextOn]}>{d.label}</Text>
              </Pressable>
            ))}
          </View>
          <View style={styles.chips}>
            {QUICK_TIMES.map((t) => (
              <Pressable key={t} onPress={() => setTime(t)} style={[styles.chip, time === t && styles.chipOn]} accessibilityRole="radio" accessibilityState={{ selected: time === t }}>
                <Text style={[styles.chipText, time === t && styles.chipTextOn]}>{t}</Text>
              </Pressable>
            ))}
            <TextInput style={[styles.input, styles.timeInput]} value={time} onChangeText={setTime} maxLength={5} accessibilityLabel="Время" />
          </View>

          {error ? <Text style={styles.error}>{error}</Text> : null}
          <Plastic colors={roles.cta.grad} style={styles.create} onPress={create} disabled={busy} accessibilityLabel="Позвать на сходку">
            <Text style={[styles.createText, { color: roles.cta.text }]}>Позвать на сходку</Text>
          </Plastic>
        </ScrollView>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// Settings card for the super-admin: the list of Chelyabinsk bars.
export function BarsAdmin() {
  const styles = useStyles();
  const skin = useSkin();
  const { roles, colors } = skin;
  const [bars, setBars] = useState<Bar[]>([]);
  const [form, setForm] = useState({ name: '', address: '', phone: '', mapUrl: '' });
  const [error, setError] = useState<string | null>(null);
  const load = () => api.bars().then(({ bars }) => setBars(bars)).catch(() => {});
  useEffect(() => {
    load();
  }, []);

  async function add() {
    setError(null);
    try {
      await api.addBar({ name: form.name, address: form.address || null, phone: form.phone || null, mapUrl: form.mapUrl || undefined } as never);
      setForm({ name: '', address: '', phone: '', mapUrl: '' });
      load();
    } catch (e) {
      setError(`${skin.copy.errorPrefix} ${(e as Error).message}`);
    }
  }

  return (
    <View style={{ gap: 10, alignSelf: 'stretch' }}>
      <Text style={styles.sheetTitle}>Бары для сходок</Text>
      <Text style={styles.sheetText}>Видят все. Телефон даёт кнопку «Позвонить», ссылка — на страницу бара в Яндекс Картах (без неё ищем по названию в Челябинске).</Text>
      {bars.map((b) => (
        <View key={b.id} style={styles.barRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.chipText}>{b.name}</Text>
            <Text style={styles.address}>{[b.address, b.phone].filter(Boolean).join(' · ') || '—'}</Text>
          </View>
          <Pressable onPress={() => api.deleteBar(b.id).then(load)} accessibilityRole="button" accessibilityLabel={`Удалить ${b.name}`} style={styles.delete}>
            <Text style={[styles.chipText, { color: colors.dangerText }]}>Удалить</Text>
          </Pressable>
        </View>
      ))}
      {(['name', 'address', 'phone', 'mapUrl'] as const).map((k) => (
        <TextInput
          key={k}
          style={styles.input}
          value={form[k]}
          onChangeText={(v) => setForm({ ...form, [k]: v })}
          placeholder={{ name: 'Название', address: 'Адрес', phone: 'Телефон', mapUrl: 'Ссылка на Яндекс Карты (https://…)' }[k]}
          placeholderTextColor={colors.placeholder}
          autoCapitalize={k === 'mapUrl' ? 'none' : 'sentences'}
          keyboardType={k === 'phone' ? 'phone-pad' : k === 'mapUrl' ? 'url' : 'default'}
        />
      ))}
      {error ? <Text style={styles.error}>{error}</Text> : null}
      <Plastic colors={roles.action.grad} style={styles.create} onPress={add} disabled={!form.name.trim()} accessibilityLabel="Добавить бар">
        <Text style={[styles.createText, { color: roles.action.text }]}>Добавить бар</Text>
      </Plastic>
    </View>
  );
}

const useStyles = makeStyles(({ colors, fonts, frames }) => ({
  card: {
    width: '92%',
    maxWidth: 420,
    alignSelf: 'center',
    padding: 14,
    gap: 6,
    borderRadius: 18,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
    boxShadow: '0 3px 10px rgba(0,0,0,0.15)',
    ...frames.card,
  },
  kicker: { fontFamily: fonts.bodyBold, fontSize: 13, color: colors.labelText },
  when: { fontFamily: fonts.display, fontSize: 20, color: colors.ink },
  place: { fontFamily: fonts.bodyHeavy, fontSize: 17, color: colors.ink },
  address: { fontFamily: fonts.body, fontSize: 13, color: colors.text3 },
  note: { fontFamily: fonts.body, fontSize: 14, color: colors.text2 },
  people: { gap: 2, marginTop: 4 },
  peopleLine: { fontFamily: fonts.body, fontSize: 14, color: colors.ink },
  peopleLabel: { fontFamily: fonts.bodyBold },
  peopleMeta: { fontFamily: fonts.body, fontSize: 13, color: colors.text3 },
  row: { flexDirection: 'row', gap: 8, marginTop: 4 },
  button: { flex: 1, height: 42, alignItems: 'center', justifyContent: 'center' },
  buttonText: { fontFamily: fonts.bodyHeavy, fontSize: 15 },
  stamp: { fontFamily: fonts.mono, fontSize: 10, marginTop: 6, textAlign: 'center' },
  scrim: { flex: 1, backgroundColor: 'rgba(10,8,20,0.45)' },
  sheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    maxHeight: '88%',
    padding: 18,
    backgroundColor: colors.screen,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    boxShadow: '0 -8px 30px rgba(0,0,0,0.3)',
    ...frames.card,
  },
  sheetTitle: { fontFamily: fonts.display, fontSize: 22, color: colors.ink },
  sheetText: { fontFamily: fonts.body, fontSize: 14, lineHeight: 20, color: colors.text2 },
  label: { fontFamily: fonts.bodyBold, fontSize: 14, color: colors.labelText },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, alignItems: 'center' },
  chip: { paddingHorizontal: 12, minHeight: 36, justifyContent: 'center', borderRadius: 18, borderWidth: 1, borderColor: colors.fieldBorder, backgroundColor: colors.field },
  chipOn: { backgroundColor: colors.focus, borderColor: colors.focus },
  chipText: { fontFamily: fonts.bodyBold, fontSize: 14, color: colors.ink },
  chipTextOn: { color: '#FFFFFF' },
  input: {
    height: 44,
    borderRadius: 22,
    paddingHorizontal: 16,
    backgroundColor: colors.field,
    borderWidth: 1,
    borderColor: colors.fieldBorder,
    fontFamily: fonts.body,
    fontSize: 16,
    color: colors.fieldText,
    outlineWidth: 0,
    ...frames.field,
  },
  timeInput: { width: 84, height: 36, textAlign: 'center' },
  error: { fontFamily: fonts.bodyBold, fontSize: 14, color: colors.dangerText },
  create: { height: 48, alignItems: 'center', justifyContent: 'center' },
  createText: { fontFamily: fonts.display, fontSize: 17 },
  barRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: colors.divider },
  delete: { minHeight: 40, justifyContent: 'center', paddingHorizontal: 6 },
}));
