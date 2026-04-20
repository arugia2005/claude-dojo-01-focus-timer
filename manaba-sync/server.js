require('dotenv').config();
const express = require('express');
const session = require('express-session');
const passport = require('passport');
const { Strategy: GoogleStrategy } = require('passport-google-oauth20');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const PgSession = require('connect-pg-simple')(session);
const cron = require('node-cron');
const path = require('path');

const db = require('./db');
const { encrypt } = require('./services/crypto');
const { syncAllUsers } = require('./services/sync');

const app = express();

// --- セキュリティ設定
app.set('trust proxy', 1);
app.use(helmet({ contentSecurityPolicy: false }));

// レート制限（同一IPから60秒に100リクエストまで）
app.use(rateLimit({ windowMs: 60 * 1000, max: 100, standardHeaders: true }));

// --- セッション（PostgreSQLに保存）
app.use(session({
  store: new PgSession({ pool: db.pool, tableName: 'session' }),
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: process.env.NODE_ENV === 'production',
    httpOnly: true,
    sameSite: 'lax',
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7日
  },
}));

// --- Passport設定
passport.use(new GoogleStrategy(
  {
    clientID: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    callbackURL: process.env.GOOGLE_CALLBACK_URL,
  },
  async (accessToken, refreshToken, profile, done) => {
    try {
      const email = profile.emails?.[0]?.value || '';

      // ユーザーを作成または更新
      const res = await db.query(
        `INSERT INTO users (google_id, email, name, avatar_url)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (google_id) DO UPDATE
         SET name = $3, avatar_url = $4
         RETURNING id`,
        [profile.id, email, profile.displayName, profile.photos?.[0]?.value]
      );
      const userId = res.rows[0].id;

      // Googleトークンを暗号化して保存（refresh_tokenは初回のみ取得できる）
      if (refreshToken) {
        const enc = encrypt(accessToken);
        const encR = encrypt(refreshToken);
        await db.query(
          `INSERT INTO google_tokens
            (user_id, encrypted_access_token, encrypted_refresh_token, iv, auth_tag)
           VALUES ($1, $2, $3, $4, $5)
           ON CONFLICT (user_id) DO UPDATE
           SET encrypted_access_token = $2, encrypted_refresh_token = $3,
               iv = $4, auth_tag = $5, updated_at = NOW()`,
          [userId, enc.encrypted, encR.encrypted, enc.iv, enc.authTag]
        );
      }

      done(null, { id: userId, email, name: profile.displayName, avatar: profile.photos?.[0]?.value });
    } catch (err) {
      done(err);
    }
  }
));

passport.serializeUser((user, done) => done(null, user.id));
passport.deserializeUser(async (id, done) => {
  try {
    const res = await db.query('SELECT id, email, name, avatar_url FROM users WHERE id = $1', [id]);
    done(null, res.rows[0] ? { ...res.rows[0], avatar: res.rows[0].avatar_url } : false);
  } catch (err) { done(err); }
});

app.use(passport.initialize());
app.use(passport.session());

// --- テンプレート・静的ファイル
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.urlencoded({ extended: false }));

// --- ルーター
app.use('/auth', require('./routes/auth'));
app.use('/dashboard', require('./routes/dashboard'));
app.use('/settings', require('./routes/settings'));

app.get('/', (req, res) => {
  if (req.isAuthenticated()) return res.redirect('/dashboard');
  res.render('index', { error: req.query.error });
});

// --- 毎晩20:30に自動同期（JST）
cron.schedule('30 20 * * *', syncAllUsers, { timezone: 'Asia/Tokyo' });

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`まなば同期アプリ起動: http://localhost:${PORT}`);
});
