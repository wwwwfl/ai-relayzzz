-- ============================================================
-- AI API Relay — Cloudflare D1 Schema
-- ============================================================

CREATE TABLE IF NOT EXISTS daily_usage (
  date TEXT NOT NULL,
  provider TEXT NOT NULL DEFAULT '',
  requests INTEGER NOT NULL DEFAULT 0,
  tokens INTEGER NOT NULL DEFAULT 0,
  prompt_tokens INTEGER NOT NULL DEFAULT 0,
  completion_tokens INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (date, provider)
);

CREATE INDEX IF NOT EXISTS idx_daily_usage_date ON daily_usage(date);

CREATE TABLE IF NOT EXISTS quota_counters (
  period TEXT NOT NULL,
  period_type TEXT NOT NULL,
  requests INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (period, period_type)
);

CREATE TABLE IF NOT EXISTS error_stats (
  date TEXT NOT NULL,
  provider TEXT NOT NULL,
  status_code TEXT NOT NULL,
  count INTEGER NOT NULL DEFAULT 0,
  reason TEXT NOT NULL DEFAULT '',
  PRIMARY KEY (date, provider, status_code)
);

CREATE INDEX IF NOT EXISTS idx_error_stats_date ON error_stats(date);

CREATE TABLE IF NOT EXISTS error_key_stats (
  date TEXT NOT NULL,
  key_hash TEXT NOT NULL,
  provider TEXT NOT NULL,
  status_code TEXT NOT NULL,
  count INTEGER NOT NULL DEFAULT 0,
  reason TEXT NOT NULL DEFAULT '',
  PRIMARY KEY (date, key_hash, status_code)
);

CREATE INDEX IF NOT EXISTS idx_error_key_stats_date ON error_key_stats(date);
CREATE INDEX IF NOT EXISTS idx_error_key_stats_key_hash ON error_key_stats(key_hash);
