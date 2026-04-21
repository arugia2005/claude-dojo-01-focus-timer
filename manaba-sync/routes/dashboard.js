const express = require('express');
const db = require('../db');
const { syncUser } = require('../services/sync');
const { scrapeManaba } = require('../services/manaba');
const { decrypt } = require('../services/crypto');
const router = express.Router();

function requireAuth(req, res, next) {
  if (req.isAuthenticated()) return next();
  res.redirect('/');
}

router.get('/', requireAuth, async (req, res) => {
  const userId = req.user.id;

  const [credRes, settingsRes, eventsRes] = await Promise.all([
    db.query('SELECT manaba_id FROM manaba_credentials WHERE user_id = $1', [userId]),
    db.query('SELECT * FROM sync_settings WHERE user_id = $1', [userId]),
    db.query(
      'SELECT COUNT(*) as count FROM synced_events WHERE user_id = $1',
      [userId]
    ),
  ]);

  res.render('dashboard', {
    user: req.user,
    hasManabaCredentials: credRes.rows.length > 0,
    manabaId: credRes.rows[0]?.manaba_id || '',
    settings: settingsRes.rows[0] || null,
    syncedCount: eventsRes.rows[0].count,
    flash: req.session.flash || null,
  });
  delete req.session.flash;
});

// 手動同期
router.post('/sync', requireAuth, async (req, res) => {
  try {
    const result = await syncUser(req.user.id);
    req.session.flash = { type: 'success', message: `同期完了：${result.added}件追加、${result.skipped}件スキップ` };
  } catch (err) {
    req.session.flash = { type: 'error', message: `同期失敗：${err.message}` };
  }
  res.redirect('/dashboard');
});

// デバッグ用：カレンダーAPI疎通確認
router.get('/debug-calendar', requireAuth, async (req, res) => {
  try {
    const { buildOAuthClient } = require('../services/calendar');
    const { google } = require('googleapis');
    const tok = await db.query(
      'SELECT encrypted_access_token, access_iv, access_auth_tag, encrypted_refresh_token, refresh_iv, refresh_auth_tag FROM google_tokens WHERE user_id = $1',
      [req.user.id]
    );
    if (!tok.rows.length) return res.json({ error: 'Googleトークン未設定' });
    const t = tok.rows[0];
    const accessToken = decrypt(t.encrypted_access_token, t.access_iv, t.access_auth_tag);
    const refreshToken = decrypt(t.encrypted_refresh_token, t.refresh_iv, t.refresh_auth_tag);
    const auth = buildOAuthClient(accessToken, refreshToken);
    const calendar = google.calendar({ version: 'v3', auth });
    const list = await calendar.calendarList.list();
    res.json({ ok: true, calendars: list.data.items.map(c => ({ id: c.id, name: c.summary })) });
  } catch (err) {
    res.json({ error: err.message, code: err.code, status: err.status });
  }
});

// デバッグ用：スクレイピング生データを返す
router.get('/debug-scrape', requireAuth, async (req, res) => {
  try {
    const credRes = await db.query(
      'SELECT manaba_id, encrypted_password, iv, auth_tag FROM manaba_credentials WHERE user_id = $1',
      [req.user.id]
    );
    if (!credRes.rows.length) return res.json({ error: 'まなば認証情報が未設定' });
    const cred = credRes.rows[0];
    const manabaPass = decrypt(cred.encrypted_password, cred.iv, cred.auth_tag);
    const items = await scrapeManaba(cred.manaba_id, manabaPass, {
      include_assignments: true,
      include_quizzes: true,
      include_announcements: false,
      include_surveys: false,
    });
    res.json({ count: items.length, items });
  } catch (err) {
    res.json({ error: err.message, stack: err.stack });
  }
});

module.exports = router;
