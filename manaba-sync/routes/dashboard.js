const express = require('express');
const db = require('../db');
const { syncUser } = require('../services/sync');
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

module.exports = router;
