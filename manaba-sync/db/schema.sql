CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  google_id TEXT UNIQUE NOT NULL,
  email TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  avatar_url TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- まなばの認証情報（パスワードはAES-256-GCMで暗号化）
CREATE TABLE IF NOT EXISTS manaba_credentials (
  user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  manaba_id TEXT NOT NULL,
  encrypted_password TEXT NOT NULL,
  iv TEXT NOT NULL,
  auth_tag TEXT NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- GoogleカレンダーのOAuthトークン（暗号化して保存）
CREATE TABLE IF NOT EXISTS google_tokens (
  user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  encrypted_access_token TEXT NOT NULL,
  encrypted_refresh_token TEXT NOT NULL,
  iv TEXT NOT NULL,
  auth_tag TEXT NOT NULL,
  expires_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ユーザーの同期設定
CREATE TABLE IF NOT EXISTS sync_settings (
  user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  include_assignments BOOLEAN DEFAULT TRUE,
  include_quizzes BOOLEAN DEFAULT TRUE,
  include_announcements BOOLEAN DEFAULT FALSE,
  include_surveys BOOLEAN DEFAULT FALSE,
  calendar_id TEXT DEFAULT 'primary',
  enabled BOOLEAN DEFAULT TRUE,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 登録済みイベント（重複防止）
CREATE TABLE IF NOT EXISTS synced_events (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  event_key TEXT NOT NULL,
  google_event_id TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, event_key)
);

-- セッション管理テーブル（connect-pg-simple用）
CREATE TABLE IF NOT EXISTS "session" (
  "sid" VARCHAR NOT NULL COLLATE "default",
  "sess" JSON NOT NULL,
  "expire" TIMESTAMP(6) NOT NULL,
  CONSTRAINT "session_pkey" PRIMARY KEY ("sid")
);
CREATE INDEX IF NOT EXISTS "IDX_session_expire" ON "session" ("expire");
