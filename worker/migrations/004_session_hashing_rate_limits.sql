-- 004: hash session tokens at rest + persistent rate limiting

ALTER TABLE sessions ADD COLUMN token_id TEXT;
CREATE INDEX IF NOT EXISTS idx_sessions_token_id ON sessions(token_id);

-- Existing rows hold raw tokens, which cannot be re-hashed in SQL.
-- Force a one-time re-login so every session is stored as a SHA-256 hash.
DELETE FROM sessions;

CREATE TABLE IF NOT EXISTS rate_limits (
  key      TEXT PRIMARY KEY,
  count    INTEGER NOT NULL,
  reset_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_rate_limits_reset ON rate_limits(reset_at);
