// Where host accounts live. Postgres when DATABASE_URL is set (Render), or an
// in-memory store for local testing (ACCOUNTS=memory), which forgets everything on restart.

const FIELDS = ['email', 'email_key', 'pass_hash', 'verified_at', 'trial_ends_at', 'pass_until',
  'stripe_customer_id', 'sub_id', 'sub_status', 'sub_plan', 'sub_period_end', 'session_ver', 'comp'];

function memoryStore() {
  const users = new Map();
  const payments = new Set();
  let nextId = 1;
  const copy = (u) => (u ? { ...u } : null);
  const find = (fn) => copy([...users.values()].find(fn));
  return {
    kind: 'memory',
    async init() {},
    async getUser(id) { return copy(users.get(Number(id))); },
    async getUserByKey(key) { return find((u) => u.email_key === key); },
    async getUserByCustomer(cid) { return find((u) => u.stripe_customer_id === cid); },
    async createUser({ email, email_key, pass_hash }) {
      if ([...users.values()].some((u) => u.email_key === email_key)) return null;
      const u = { id: nextId++, email, email_key, pass_hash, created_at: new Date(), session_ver: 0 };
      for (const f of FIELDS) if (!(f in u)) u[f] = null;
      u.session_ver = 0;
      users.set(u.id, u);
      return copy(u);
    },
    async updateUser(id, patch) {
      const u = users.get(Number(id));
      if (!u) return null;
      for (const [k, v] of Object.entries(patch)) if (FIELDS.includes(k)) u[k] = v;
      return copy(u);
    },
    async recordPayment(sessionId) {
      if (payments.has(sessionId)) return false;
      payments.add(sessionId);
      return true;
    },
    _users: users,
  };
}

function pgStore(url) {
  const { Pool } = require('pg');
  // Render's internal database address (no dots in the host) doesn't need SSL; its external one does.
  const host = new URL(url).hostname;
  const ssl = !/sslmode=disable/.test(url) && host.includes('.') && !/^(localhost|127\.0\.0\.1)$/.test(host);
  const pool = new Pool({ connectionString: url, ssl: ssl ? { rejectUnauthorized: false } : false, max: 5 });
  const one = async (sql, args) => (await pool.query(sql, args)).rows[0] || null;
  return {
    kind: 'postgres',
    async init() {
      await pool.query(`
        CREATE TABLE IF NOT EXISTS users (
          id SERIAL PRIMARY KEY,
          email TEXT NOT NULL,
          email_key TEXT NOT NULL UNIQUE,
          pass_hash TEXT NOT NULL,
          created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
          verified_at TIMESTAMPTZ,
          trial_ends_at TIMESTAMPTZ,
          pass_until TIMESTAMPTZ,
          stripe_customer_id TEXT,
          sub_id TEXT,
          sub_status TEXT,
          sub_plan TEXT,
          sub_period_end TIMESTAMPTZ,
          session_ver INTEGER NOT NULL DEFAULT 0,
          comp BOOLEAN
        );
        CREATE INDEX IF NOT EXISTS users_customer ON users (stripe_customer_id);
        CREATE TABLE IF NOT EXISTS payments (
          session_id TEXT PRIMARY KEY,
          user_id INTEGER,
          plan TEXT,
          created_at TIMESTAMPTZ NOT NULL DEFAULT now()
        );`);
    },
    getUser: (id) => one('SELECT * FROM users WHERE id = $1', [Number(id)]),
    getUserByKey: (key) => one('SELECT * FROM users WHERE email_key = $1', [key]),
    getUserByCustomer: (cid) => one('SELECT * FROM users WHERE stripe_customer_id = $1', [cid]),
    createUser: ({ email, email_key, pass_hash }) => one(
      'INSERT INTO users (email, email_key, pass_hash) VALUES ($1, $2, $3) ON CONFLICT (email_key) DO NOTHING RETURNING *',
      [email, email_key, pass_hash]),
    async updateUser(id, patch) {
      const keys = Object.keys(patch).filter((k) => FIELDS.includes(k));
      if (!keys.length) return this.getUser(id);
      const set = keys.map((k, i) => `${k} = $${i + 2}`).join(', ');
      return one(`UPDATE users SET ${set} WHERE id = $1 RETURNING *`, [Number(id), ...keys.map((k) => patch[k])]);
    },
    async recordPayment(sessionId, userId, plan) {
      const r = await pool.query('INSERT INTO payments (session_id, user_id, plan) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING',
        [sessionId, userId, plan]);
      return r.rowCount === 1;
    },
  };
}

module.exports = { memoryStore, pgStore };
