-- BDBV backend schema (PostgreSQL 14+). Idempotent: safe to run at every start.
--
-- Records are stored as JSON documents (the same shape as the offline app), with the
-- columns needed for access control and synchronisation pulled out. Every change keeps
-- the previous version in record_history. The audit log is append-only (trigger).

CREATE TABLE IF NOT EXISTS users (
  id            SERIAL PRIMARY KEY,
  username      TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  role          TEXT NOT NULL,
  display_name  TEXT NOT NULL,
  facility      TEXT,             -- facility-scoped roles
  zone          TEXT,             -- zone-scoped roles
  active        BOOLEAN NOT NULL DEFAULT TRUE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS records (
  collection  TEXT NOT NULL,      -- assessments | reports | alerts | queue | contacts | samples | rumours | history
  id          TEXT NOT NULL,
  data        JSONB NOT NULL,
  zone        TEXT,               -- health zone (access scoping)
  facility    TEXT,               -- facility (access scoping)
  owner       TEXT,               -- username that created the record
  version     INTEGER NOT NULL DEFAULT 1,
  synthetic   BOOLEAN NOT NULL DEFAULT TRUE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  updated_by  TEXT,
  PRIMARY KEY (collection, id)
);
CREATE INDEX IF NOT EXISTS records_updated_idx ON records (updated_at);
CREATE INDEX IF NOT EXISTS records_scope_idx ON records (collection, zone, facility);
CREATE INDEX IF NOT EXISTS records_owner_idx ON records (owner);

CREATE TABLE IF NOT EXISTS record_history (
  hid         BIGSERIAL PRIMARY KEY,
  collection  TEXT NOT NULL,
  id          TEXT NOT NULL,
  version     INTEGER NOT NULL,
  data        JSONB NOT NULL,
  changed_at  TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  changed_by  TEXT
);
CREATE INDEX IF NOT EXISTS record_history_idx ON record_history (collection, id);

CREATE TABLE IF NOT EXISTS audit_log (
  seq        BIGSERIAL PRIMARY KEY,
  at         TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  username   TEXT,
  role       TEXT,
  action     TEXT NOT NULL,
  entity     TEXT,
  entity_id  TEXT,
  detail     TEXT,
  ip         TEXT,
  source     TEXT NOT NULL DEFAULT 'server'   -- server | client (entries uploaded from the app)
);
CREATE INDEX IF NOT EXISTS audit_at_idx ON audit_log (at);

CREATE OR REPLACE FUNCTION bdbv_audit_append_only() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'audit_log is append-only';
END;
$$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS audit_append_only ON audit_log;
CREATE TRIGGER audit_append_only BEFORE UPDATE OR DELETE ON audit_log
  FOR EACH ROW EXECUTE FUNCTION bdbv_audit_append_only();
DROP TRIGGER IF EXISTS audit_no_truncate ON audit_log;
CREATE TRIGGER audit_no_truncate BEFORE TRUNCATE ON audit_log
  FOR EACH STATEMENT EXECUTE FUNCTION bdbv_audit_append_only();

CREATE TABLE IF NOT EXISTS config (
  key         TEXT PRIMARY KEY,
  value       JSONB NOT NULL,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by  TEXT
);

CREATE TABLE IF NOT EXISTS meta (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
