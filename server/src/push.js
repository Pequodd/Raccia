import webpush from 'web-push';

// Web Push (VAPID): notifications for the web version and the iPhone/Android PWA.
// Keys are made on first start and kept in the database, so subscriptions survive restarts.
export function createPush(db, { subject = 'mailto:oleg@example.com', send = webpush.sendNotification } = {}) {
  const getSetting = db.prepare('SELECT value FROM settings WHERE key = ?');
  const setSetting = db.prepare('INSERT INTO settings (key, value) VALUES (?, ?)');
  let keys = getSetting.get('vapid')?.value;
  if (keys) {
    keys = JSON.parse(keys);
  } else {
    keys = webpush.generateVAPIDKeys();
    setSetting.run('vapid', JSON.stringify(keys));
  }
  const vapidDetails = { subject, publicKey: keys.publicKey, privateKey: keys.privateKey };

  const q = {
    upsert: db.prepare(`
      INSERT INTO push_subscriptions (endpoint, user_id, p256dh, auth, created_at) VALUES (?, ?, ?, ?, ?)
      ON CONFLICT (endpoint) DO UPDATE SET user_id = excluded.user_id, p256dh = excluded.p256dh, auth = excluded.auth
    `),
    remove: db.prepare('DELETE FROM push_subscriptions WHERE endpoint = ?'),
    removeForUser: db.prepare('DELETE FROM push_subscriptions WHERE endpoint = ? AND user_id = ?'),
    forUser: db.prepare('SELECT endpoint, p256dh, auth FROM push_subscriptions WHERE user_id = ?'),
    count: db.prepare('SELECT COUNT(*) AS n FROM push_subscriptions WHERE user_id = ?'),
  };

  return {
    publicKey: keys.publicKey,

    subscribe(userId, sub) {
      const endpoint = sub?.endpoint;
      const { p256dh, auth } = sub?.keys ?? {};
      if (typeof endpoint !== 'string' || !/^https:\/\//.test(endpoint) || endpoint.length > 1000) return false;
      if (typeof p256dh !== 'string' || typeof auth !== 'string' || p256dh.length > 200 || auth.length > 100) return false;
      q.upsert.run(endpoint, userId, p256dh, auth, Date.now());
      return true;
    },

    unsubscribe(userId, endpoint) {
      q.removeForUser.run(String(endpoint ?? ''), userId);
    },

    count: (userId) => q.count.get(userId).n,

    // payload: { title, body, tag, url } — shown by app/public/sw.js.
    notify(userId, payload) {
      const data = JSON.stringify(payload);
      for (const row of q.forUser.all(userId)) {
        const sub = { endpoint: row.endpoint, keys: { p256dh: row.p256dh, auth: row.auth } };
        Promise.resolve()
          .then(() => send(sub, data, { vapidDetails, TTL: 6 * 3600, urgency: 'high' }))
          .catch((err) => {
            // The browser dropped the subscription (app removed, permission revoked).
            if (err?.statusCode === 404 || err?.statusCode === 410) q.remove.run(row.endpoint);
            else console.warn('push failed:', err?.statusCode ?? err?.message ?? err);
          });
      }
    },
  };
}
