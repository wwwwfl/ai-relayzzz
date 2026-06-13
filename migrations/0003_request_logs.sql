-- Migration: Add request_logs table for unified request logging
-- Supports on-demand capture across Postgres/KV/D1/Memory backends

CREATE TABLE IF NOT EXISTS request_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trace_id TEXT NOT NULL,
  timestamp TIMESTAMP WITH TIME ZONE NOT NULL,
  api_key_hash TEXT NOT NULL,
  model TEXT NOT NULL,
  provider TEXT NOT NULL,
  status TEXT NOT NULL, -- 'success' | 'error'
  http_status INTEGER NOT NULL,
  latency_ms INTEGER NOT NULL,
  prompt_tokens INTEGER,
  completion_tokens INTEGER,
  total_tokens INTEGER,
  is_stream INTEGER NOT NULL DEFAULT 0, -- boolean (0/1)
  error_type TEXT,
  error_message TEXT,
  diagnostic TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- Indexes for efficient queries (timestamp DESC, status, provider filters)
CREATE INDEX IF NOT EXISTS request_logs_timestamp_idx ON request_logs(timestamp);
CREATE INDEX IF NOT EXISTS request_logs_status_idx ON request_logs(status);
CREATE INDEX IF NOT EXISTS request_logs_provider_idx ON request_logs(provider);
