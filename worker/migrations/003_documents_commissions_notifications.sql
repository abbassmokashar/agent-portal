-- AUS Agent Portal — migration 003
-- Adds: agent address, email-notification preferences, per-file ownership/visibility,
-- and commission (invoice) requests.

ALTER TABLE users ADD COLUMN address_line1 TEXT;
ALTER TABLE users ADD COLUMN address_line2 TEXT;
ALTER TABLE users ADD COLUMN city        TEXT;
ALTER TABLE users ADD COLUMN postal_code TEXT;
ALTER TABLE users ADD COLUMN region      TEXT;

ALTER TABLE users ADD COLUMN notify_email    INTEGER NOT NULL DEFAULT 0;
ALTER TABLE users ADD COLUMN notified_asked  INTEGER NOT NULL DEFAULT 0;
ALTER TABLE users ADD COLUMN unsub_token     TEXT;

ALTER TABLE files ADD COLUMN assigned_to TEXT;

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

CREATE INDEX IF NOT EXISTS idx_commissions_agent ON commission_requests(agent);
CREATE INDEX IF NOT EXISTS idx_files_assigned ON files(assigned_to);
