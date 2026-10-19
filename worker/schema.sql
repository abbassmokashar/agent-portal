-- AUS Agent Portal — D1 schema
-- Apply with:  npx wrangler d1 execute aus-agent-portal --remote --file schema.sql

CREATE TABLE IF NOT EXISTS users (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  username      TEXT UNIQUE NOT NULL,
  name          TEXT,
  email         TEXT UNIQUE,
  phone         TEXT,
  pass_hash     TEXT NOT NULL,
  salt          TEXT NOT NULL,
  is_admin      INTEGER NOT NULL DEFAULT 0,
  is_superadmin INTEGER NOT NULL DEFAULT 0,
  status        TEXT NOT NULL DEFAULT 'active',
  agency        TEXT,
  country       TEXT,
  address_line1 TEXT,
  address_line2 TEXT,
  city          TEXT,
  postal_code   TEXT,
  region        TEXT,
  notify_email  INTEGER NOT NULL DEFAULT 0,
  notified_asked INTEGER NOT NULL DEFAULT 0,
  unsub_token   TEXT,
  totp_secret   TEXT,
  totp_enabled  INTEGER NOT NULL DEFAULT 0,
  last_login    TEXT,
  created_at    TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS sessions (
  token      TEXT PRIMARY KEY,
  user_id    INTEGER NOT NULL,
  device     TEXT,
  created_at TEXT NOT NULL,
  last_seen  TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS content (
  key        TEXT PRIMARY KEY,
  value      TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  updated_by TEXT
);

CREATE TABLE IF NOT EXISTS files (
  id           TEXT PRIMARY KEY,
  name         TEXT NOT NULL,
  category     TEXT NOT NULL,
  content_type TEXT NOT NULL,
  size         INTEGER NOT NULL,
  uploaded_by  TEXT,
  assigned_to  TEXT,
  created_at   TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS commission_requests (
  id          TEXT PRIMARY KEY,
  agent       TEXT NOT NULL,
  amount      TEXT,
  currency    TEXT NOT NULL DEFAULT 'CHF',
  period      TEXT,
  student_ref TEXT,
  invoice_no  TEXT,
  notes       TEXT,
  status      TEXT NOT NULL DEFAULT 'new',
  created_at  TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS applications (
  id            TEXT PRIMARY KEY,
  agent         TEXT NOT NULL,
  student_name  TEXT NOT NULL,
  student_email TEXT,
  student_phone TEXT,
  programme     TEXT,
  intake        TEXT,
  nationality   TEXT,
  notes         TEXT,
  status        TEXT NOT NULL DEFAULT 'new',
  created_at    TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_files_category ON files(category);
CREATE INDEX IF NOT EXISTS idx_files_assigned ON files(assigned_to);
CREATE INDEX IF NOT EXISTS idx_apps_agent ON applications(agent);
CREATE INDEX IF NOT EXISTS idx_commissions_agent ON commission_requests(agent);
