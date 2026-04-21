const db = require('../db');
const { decrypt } = require('./crypto');
const { scrapeManaba, parseJapaneseDate } = require('./manaba');
const { buildOAuthClient, addEvent } = require('./calendar');

async function syncUser(userId) {
  // まなば認証情報を取得・復号
  const credRes = await db.query(
    'SELECT manaba_id, encrypted_password, iv, auth_tag FROM manaba_credentials WHERE user_id = $1',
    [userId]
  );
  if (!credRes.rows.length) throw new Error('まなば認証情報が未設定');

  const cred = credRes.rows[0];
  const manabaPass = decrypt(cred.encrypted_password, cred.iv, cred.auth_tag);

  // Googleトークンを取得・復号
  const tokenRes = await db.query(
    'SELECT encrypted_access_token, access_iv, access_auth_tag, encrypted_refresh_token, refresh_iv, refresh_auth_tag FROM google_tokens WHERE user_id = $1',
    [userId]
  );
  if (!tokenRes.rows.length) throw new Error('Googleトークンが未設定');

  const tok = tokenRes.rows[0];
  const accessToken = decrypt(tok.encrypted_access_token, tok.access_iv, tok.access_auth_tag);
  const refreshToken = decrypt(tok.encrypted_refresh_token, tok.refresh_iv, tok.refresh_auth_tag);

  // 同期設定を取得
  const settingsRes = await db.query(
    'SELECT * FROM sync_settings WHERE user_id = $1',
    [userId]
  );
  const settings = settingsRes.rows[0] || {
    enabled: true,
    include_assignments: true,
    include_quizzes: true,
    include_announcements: false,
    include_surveys: false,
    calendar_id: 'primary',
  };

  if (!settings.enabled) return { skipped: true };

  // まなばをスクレイプ
  const deadlines = await scrapeManaba(cred.manaba_id, manabaPass, settings);

  const authClient = buildOAuthClient(accessToken, refreshToken);
  let added = 0;
  let skipped = 0;

  for (const item of deadlines) {
    const eventKey = `${item.type}__${item.title}__${item.deadline}`;

    // 登録済みチェック
    const exists = await db.query(
      'SELECT 1 FROM synced_events WHERE user_id = $1 AND event_key = $2',
      [userId, eventKey]
    );
    if (exists.rows.length) { skipped++; continue; }

    const deadlineDate = parseJapaneseDate(item.deadline);
    if (!deadlineDate) { skipped++; continue; }

    // 期限切れはスキップ
    if (deadlineDate < new Date()) { skipped++; continue; }

    try {
      const eventId = await addEvent(authClient, settings.calendar_id, item, deadlineDate);
      await db.query(
        'INSERT INTO synced_events (user_id, event_key, google_event_id) VALUES ($1, $2, $3)',
        [userId, eventKey, eventId]
      );
      added++;
    } catch (err) {
      console.warn(`[sync] カレンダー登録失敗 user=${userId} ${item.title}:`, err.message);
    }
  }

  return { added, skipped, total: deadlines.length };
}

async function syncAllUsers() {
  console.log(new Date().toISOString(), '[cron] 全ユーザー同期開始');
  const res = await db.query(
    `SELECT u.id FROM users u
     JOIN sync_settings s ON s.user_id = u.id
     WHERE s.enabled = TRUE`
  );

  for (const row of res.rows) {
    try {
      const result = await syncUser(row.id);
      console.log(`[cron] user=${row.id}`, result);
    } catch (err) {
      console.error(`[cron] user=${row.id} エラー:`, err.message);
    }
  }
}

module.exports = { syncUser, syncAllUsers };
