-- Per-key upstream error details for Cloudflare D1.
-- Provider-level totals remain in error_stats; this table powers admin key diagnostics.

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
