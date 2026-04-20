const express = require('express');
const db = require('../db');
const { encrypt } = require('../services/crypto');
const router = express.Router();

function requireAuth(req, res, next) {
  if (req.isAuthenticated()) return next();
  res.redirect('/');
}

// まなば認証情報の保存
router.post('/manaba', requireAuth, async (req, res) => {
  const { manaba_id, manaba_pass } = req.body;
  const userId = req.user.id;

  if (!manaba_id || !manaba_pass) {
    req.session.flash = { type: 'error', message: '学籍番号とパスワードを入力してください' };
    return res.redirect('/dashboard');
  }

  const { encrypted, iv, authTag } = encrypt(manaba_pass);

  await db.query(
    `INSERT INTO manaba_credentials (user_id, manaba_id, encrypted_password, iv, auth_tag)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (user_id) DO UPDATE
     SET manaba_id = $2, encrypted_password = $3, iv = $4, auth_tag = $5, updated_at = NOW()`,
    [userId, manaba_id, encrypted, iv, authTag]
  );

  req.session.flash = { type: 'success', message: 'まなばの認証情報を保存しました' };
  res.redirect('/dashboard');
});

// 同期設定の保存
router.post('/sync-settings', requireAuth, async (req, res) => {
  const userId = req.user.id;
  const {
    include_assignments,
    include_quizzes,
    include_announcements,
    include_surveys,
    calendar_id,
    enabled,
  } = req.body;

  await db.query(
    `INSERT INTO sync_settings
      (user_id, include_assignments, include_quizzes, include_announcements, include_surveys, calendar_id, enabled)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     ON CONFLICT (user_id) DO UPDATE SET
      include_assignments = $2, include_quizzes = $3,
      include_announcements = $4, include_surveys = $5,
      calendar_id = $6, enabled = $7, updated_at = NOW()`,
    [
      userId,
      !!include_assignments,
      !!include_quizzes,
      !!include_announcements,
      !!include_surveys,
      calendar_id || 'primary',
      enabled !== 'false',
    ]
  );

  req.session.flash = { type: 'success', message: '設定を保存しました' };
  res.redirect('/dashboard');
});

// アカウント削除
router.post('/delete-account', requireAuth, async (req, res) => {
  await db.query('DELETE FROM users WHERE id = $1', [req.user.id]);
  req.logout(() => {
    req.session.destroy(() => res.redirect('/'));
  });
});

module.exports = router;
