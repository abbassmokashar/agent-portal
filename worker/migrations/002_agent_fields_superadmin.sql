-- Migration 002 — agent name/phone + superadmin role
-- Apply with:
--   npx wrangler d1 execute aus-agent-portal --remote --file migrations/002_agent_fields_superadmin.sql

ALTER TABLE users ADD COLUMN name TEXT;
ALTER TABLE users ADD COLUMN phone TEXT;
ALTER TABLE users ADD COLUMN is_superadmin INTEGER NOT NULL DEFAULT 0;
