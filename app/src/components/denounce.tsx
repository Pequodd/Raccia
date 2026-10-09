import { useEffect, useMemo, useState } from 'react';
import { Modal, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { makeStyles, useSkin } from '../skins';
import { Plastic } from './y2k';

// «Донос»: a parody form of the «Федеральная Служба Болтовни». A joke from start to
// finish — nothing is sent anywhere, the result is made up on the spot.

export type DenounceTarget = { name: string; quote?: string };

const CHARGES = [
  'Шутит смешнее меня',
  'Пишет «ок» без точки',
  'Не поставил реакцию на мой стикер',
  'Подозрительно часто бывает «в сети»',
  'Хранит ключи на гвоздике у двери',
  'Не установил МАКС',
  'Прочитал и не ответил',
  'Записывает кружки в пижаме',
];

const STEPS = [
  'Регистрируем донос в журнале входящих…',
  'Ставим печать «Секретно»…',
  'Согласовываем с МАКС…',
  'Ищем свободного майора…',
  'Майор ушёл на обед, ждём…',
];

const VERDICTS = [
  (n: string) => `Донос принят. На ${n} заведено дело №${Math.floor(1000 + Math.random() * 9000)}. Ответ придёт в течение 15 рабочих лет.`,
  (n: string) => `Ваш донос переслан абоненту ${n}. Шутка. Или нет.`,
  () => 'Проверка показала: вы сами под подозрением. Спите спокойно.',
  () => 'Олег уже выехал. Поставьте чайник и не делайте резких движений.',
  (n: string) => `Майор ознакомился, посмеялся и попросил добавить ${n} в друзья.`,
  () => 'Донос отклонён: в графе «подпись» нарисован котик. Попробуйте в следующем квартале.',
];

export function DenounceSheet({ target, onClose }: { target: DenounceTarget | null; onClose: () => void }) {
  const styles = useStyles();
  const skin = useSkin();
  const insets = useSafeAreaInsets();
  const [picked, setPicked] = useState<string[]>([]);
  const [details, setDetails] = useState('');
  const [step, setStep] = useState<number | null>(null); // null: the form; 0..: «sending»
  const verdict = useMemo(() => (target ? VERDICTS[Math.floor(Math.random() * VERDICTS.length)](target.name) : ''), [target, step === STEPS.length]);

  useEffect(() => {
    setPicked([]);
    setDetails('');
    setStep(null);
  }, [target]);

  useEffect(() => {
    if (step === null || step >= STEPS.length) return;
    const t = setTimeout(() => setStep(step + 1), 900);
    return () => clearTimeout(t);
  }, [step]);

  if (!target) return null;
  const toggle = (c: string) => setPicked((p) => (p.includes(c) ? p.filter((x) => x !== c) : [...p, c]));

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <View style={[styles.scrim, { paddingTop: insets.top + 20, paddingBottom: insets.bottom + 12 }]}>
        <View style={styles.paper}>
          <View style={styles.letterhead}>
            <Text style={styles.agency}>ФСБ</Text>
            <Text style={styles.agencyFull}>Федеральная Служба Болтовни{'\n'}Отдел по работе с доносами Олега</Text>
          </View>
          <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
            {step === null ? (
              <>
                <Text style={styles.formTitle}>ДОНОС</Text>
                <Text style={styles.label}>На кого</Text>
                <Text style={styles.field}>{target.name}</Text>
                {target.quote ? (
                  <>
                    <Text style={styles.label}>Улика</Text>
                    <Text style={[styles.field, styles.quote]} numberOfLines={4}>
                      «{target.quote}»
                    </Text>
                  </>
                ) : null}
                <Text style={styles.label}>Статья (можно несколько)</Text>
                {CHARGES.map((c) => {
                  const on = picked.includes(c);
                  return (
                    <Pressable key={c} onPress={() => toggle(c)} style={styles.charge} accessibilityRole="checkbox" accessibilityState={{ checked: on }}>
                      <View style={[styles.box, on && styles.boxOn]}>{on ? <Text style={styles.boxMark}>✓</Text> : null}</View>
                      <Text style={styles.chargeText}>{c}</Text>
                    </Pressable>
                  );
                })}
                <Text style={styles.label}>Подробности</Text>
                <TextInput
                  style={[styles.field, styles.input]}
                  value={details}
                  onChangeText={setDetails}
                  multiline
                  placeholder="Своими словами, без эмоций"
                  placeholderTextColor="#8C8676"
                  maxLength={300}
                />
                <Text style={styles.small}>Это шутка: Олег ничего никуда не отправляет.</Text>
              </>
            ) : step < STEPS.length ? (
              <View style={styles.progress}>
                {STEPS.slice(0, step + 1).map((s, i) => (
                  <Text key={s} style={[styles.stepText, i < step && styles.stepDone]}>
                    {i < step ? '✓ ' : '⏳ '}
                    {s}
                  </Text>
                ))}
              </View>
            ) : (
              <View style={styles.progress}>
                <Text style={styles.stamp}>ПРИНЯТО</Text>
                <Text style={styles.verdict}>{verdict}</Text>
              </View>
            )}
          </ScrollView>
          <View style={styles.buttons}>
            {step === null ? (
              <>
                <Pressable onPress={onClose} style={styles.cancel} accessibilityRole="button">
                  <Text style={styles.cancelText}>Передумал</Text>
                </Pressable>
                <Plastic colors={skin.roles.danger.grad} style={styles.send} onPress={() => setStep(0)} disabled={!picked.length} accessibilityLabel="Отправить куда следует">
                  <Text style={[styles.sendText, { color: skin.roles.danger.text }]}>Отправить куда следует</Text>
                </Plastic>
              </>
            ) : (
              <Plastic colors={skin.roles.negative.grad} style={styles.send} onPress={onClose} disabled={step < STEPS.length} accessibilityLabel="Закрыть">
                <Text style={[styles.sendText, { color: skin.roles.negative.text }]}>{step < STEPS.length ? 'Ждём…' : 'Служу Олегу!'}</Text>
              </Plastic>
            )}
          </View>
        </View>
      </View>
    </Modal>
  );
}

// Deliberately not the skin's look: an official paper form from another era.
const useStyles = makeStyles(({ fonts }) => ({
  scrim: { flex: 1, backgroundColor: 'rgba(10,8,20,0.6)', paddingHorizontal: 14, alignItems: 'center', justifyContent: 'center' },
  paper: { width: '100%', maxWidth: 440, maxHeight: '100%', backgroundColor: '#F4EFDF', borderRadius: 6, overflow: 'hidden', boxShadow: '0 20px 40px rgba(0,0,0,0.45)' },
  letterhead: { paddingVertical: 12, paddingHorizontal: 16, borderBottomWidth: 3, borderBottomColor: '#7A1F1F', alignItems: 'center', gap: 2 },
  agency: { fontFamily: fonts.mono, fontSize: 26, letterSpacing: 8, color: '#7A1F1F' },
  agencyFull: { fontFamily: fonts.mono, fontSize: 11, color: '#4A4436', textAlign: 'center' },
  body: { padding: 16, gap: 6 },
  formTitle: { fontFamily: fonts.mono, fontSize: 20, letterSpacing: 6, color: '#2A2620', textAlign: 'center', marginBottom: 4 },
  label: { fontFamily: fonts.mono, fontSize: 12, color: '#6A6352', marginTop: 6 },
  field: { fontFamily: fonts.mono, fontSize: 15, color: '#1A1712', borderBottomWidth: 1, borderBottomColor: '#8C8676', paddingVertical: 4 },
  quote: { fontStyle: 'italic' },
  input: { minHeight: 60, outlineWidth: 0, textAlignVertical: 'top' },
  charge: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 36 },
  box: { width: 20, height: 20, borderWidth: 2, borderColor: '#2A2620', alignItems: 'center', justifyContent: 'center' },
  boxOn: { backgroundColor: '#7A1F1F', borderColor: '#7A1F1F' },
  boxMark: { color: '#FFFFFF', fontSize: 13, fontFamily: fonts.bodyHeavy },
  chargeText: { flex: 1, fontFamily: fonts.mono, fontSize: 14, color: '#1A1712' },
  small: { fontFamily: fonts.mono, fontSize: 11, color: '#8C8676', marginTop: 8, textAlign: 'center' },
  progress: { gap: 10, paddingVertical: 20, alignItems: 'center' },
  stepText: { fontFamily: fonts.mono, fontSize: 14, color: '#1A1712', alignSelf: 'stretch' },
  stepDone: { color: '#6A6352' },
  stamp: {
    fontFamily: fonts.mono,
    fontSize: 30,
    letterSpacing: 6,
    color: '#B3261E',
    borderWidth: 4,
    borderColor: '#B3261E',
    paddingHorizontal: 14,
    paddingVertical: 4,
    transform: [{ rotate: '-8deg' }],
  },
  verdict: { fontFamily: fonts.mono, fontSize: 15, lineHeight: 22, color: '#1A1712', textAlign: 'center', marginTop: 10 },
  buttons: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 14, borderTopWidth: 1, borderTopColor: '#D6CFBA' },
  cancel: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 8 },
  cancelText: { fontFamily: fonts.bodyBold, fontSize: 15, color: '#4A4436' },
  send: { flex: 1, height: 46, alignItems: 'center', justifyContent: 'center' },
  sendText: { fontFamily: fonts.bodyHeavy, fontSize: 15 },
}));
