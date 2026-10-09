// «Сходка»: someone in a chat proposes a bar and a time, friends answer «Иду» / «Не иду»,
// and the card has buttons to call the bar or open it in Yandex Maps (many Chelyabinsk
// bars take bookings there). The bar list is kept by the super-admin.

const MAX_TEXT = 120;
const PHONE_RE = /^[+\d][\d\s()\-]{4,24}$/;
const DAY = 24 * 3600_000;
// Yandex Maps search in Chelyabinsk (region 56) when a bar has no link of its own.
const mapSearch = (name, address) =>
  `https://yandex.ru/maps/56/chelyabinsk/?text=${encodeURIComponent([name, address].filter(Boolean).join(', '))}`;

export class MeetupError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.status = status;
  }
}

function text(v, field, required = false) {
  if (v === undefined || v === null || v === '') {
    if (required) throw new MeetupError(`${field}: обязательно`);
    return null;
  }
  if (typeof v !== 'string') throw new MeetupError(`${field}: текст`);
  const t = v.trim();
  if (required && !t) throw new MeetupError(`${field}: обязательно`);
  if (t.length > MAX_TEXT) throw new MeetupError(`${field}: до ${MAX_TEXT} символов`);
  return t || null;
}

function cleanBar(body) {
  const phone = text(body?.phone, 'Телефон');
  if (phone && !PHONE_RE.test(phone)) throw new MeetupError('Телефон: цифры, пробелы, +, скобки и дефисы');
  const mapUrl = typeof body?.mapUrl === 'string' && body.mapUrl.trim() ? body.mapUrl.trim() : null;
  if (mapUrl && (!/^https:\/\//.test(mapUrl) || mapUrl.length > 500)) throw new MeetupError('Ссылка: должна начинаться с https://');
  return {
    name: text(body?.name, 'Название', true),
    address: text(body?.address, 'Адрес'),
    phone,
    mapUrl,
    note: text(body?.note, 'Заметка'),
  };
}

export function createMeetups(db) {
  const q = {
    bars: db.prepare('SELECT * FROM bars ORDER BY name COLLATE NOCASE'),
    bar: db.prepare('SELECT * FROM bars WHERE id = ?'),
    insertBar: db.prepare('INSERT INTO bars (name, address, phone, map_url, note, created_at) VALUES (?, ?, ?, ?, ?, ?)'),
    updateBar: db.prepare('UPDATE bars SET name = ?, address = ?, phone = ?, map_url = ?, note = ? WHERE id = ?'),
    deleteBar: db.prepare('DELETE FROM bars WHERE id = ?'),
    meetup: db.prepare('SELECT * FROM meetups WHERE id = ?'),
    insertMeetup: db.prepare(
      'INSERT INTO meetups (chat_id, bar_id, place, starts_at, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?)'
    ),
    setMessage: db.prepare('UPDATE meetups SET message_id = ? WHERE id = ?'),
    answers: db.prepare('SELECT a.user_id, a.answer FROM meetup_answers a WHERE a.meetup_id = ?'),
    answer: db.prepare(
      'INSERT INTO meetup_answers (meetup_id, user_id, answer) VALUES (?1, ?2, ?3) ON CONFLICT (meetup_id, user_id) DO UPDATE SET answer = ?3'
    ),
    clearAnswer: db.prepare('DELETE FROM meetup_answers WHERE meetup_id = ? AND user_id = ?'),
  };

  const barView = (row) => ({
    id: row.id,
    name: row.name,
    address: row.address,
    phone: row.phone,
    mapUrl: row.map_url ?? mapSearch(row.name, row.address),
    note: row.note,
  });

  return {
    bars: () => q.bars.all().map(barView),

    addBar(body) {
      const b = cleanBar(body);
      const id = Number(q.insertBar.run(b.name, b.address, b.phone, b.mapUrl, b.note, Date.now()).lastInsertRowid);
      return barView(q.bar.get(id));
    },

    updateBar(id, body) {
      if (!q.bar.get(id)) throw new MeetupError('Бар не найден', 404);
      const b = cleanBar(body);
      q.updateBar.run(b.name, b.address, b.phone, b.mapUrl, b.note, id);
      return barView(q.bar.get(id));
    },

    deleteBar(id) {
      q.deleteBar.run(id);
    },

    // Returns the meetup id; the caller posts the chat message and calls attach().
    create(chatId, userId, body) {
      let place;
      let barId = null;
      if (body?.barId != null) {
        const bar = q.bar.get(Number(body.barId));
        if (!bar) throw new MeetupError('Бар не найден', 404);
        barId = bar.id;
        place = barView(bar);
      } else {
        const name = text(body?.place?.name, 'Куда идём', true);
        const address = text(body?.place?.address, 'Адрес');
        place = { name, address, phone: null, mapUrl: mapSearch(name, address), note: null };
      }
      const startsAt = Number(body?.startsAt);
      const now = Date.now();
      if (!Number.isFinite(startsAt) || startsAt < now - 3600_000 || startsAt > now + 90 * DAY) {
        throw new MeetupError('Время: от сейчас до трёх месяцев вперёд');
      }
      const { id: _id, ...placeData } = place;
      const id = Number(
        q.insertMeetup.run(chatId, barId, JSON.stringify(placeData), startsAt, userId, now).lastInsertRowid
      );
      return { id, place: placeData, startsAt };
    },

    attach: (meetupId, messageId) => q.setMessage.run(messageId, meetupId),

    get: (id) => q.meetup.get(id),

    setAnswer(meetupId, userId, answer) {
      if (answer === null) q.clearAnswer.run(meetupId, userId);
      else if (answer === 'yes' || answer === 'no') q.answer.run(meetupId, userId, answer);
      else throw new MeetupError('answer: yes, no или null');
    },

    // nameOf(userId) → shown name; members: how many are in the chat.
    view(id, nameOf, members) {
      const m = q.meetup.get(id);
      if (!m) return null;
      const answers = q.answers.all(id);
      const pick = (a) => answers.filter((x) => x.answer === a).map((x) => ({ id: x.user_id, name: nameOf(x.user_id) }));
      const going = pick('yes');
      const notGoing = pick('no');
      return {
        id: m.id,
        place: JSON.parse(m.place),
        startsAt: m.starts_at,
        createdBy: { id: m.created_by, name: nameOf(m.created_by) },
        going,
        notGoing,
        undecided: Math.max(0, members - going.length - notGoing.length),
      };
    },
  };
}
