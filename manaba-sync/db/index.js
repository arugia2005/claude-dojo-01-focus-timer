const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
  max: 10,
  idleTimeoutMillis: 30000,
});

// 常にパラメータ化クエリを使う（SQLインジェクション防止）
const query = (text, params) => pool.query(text, params);

module.exports = { query, pool };
