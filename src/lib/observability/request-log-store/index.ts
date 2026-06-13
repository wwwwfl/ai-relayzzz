// ============================================================
// AI API Relay — Request Log Store Factory
// ============================================================

import type { RequestLogStore } from './types';
import { MemoryRequestLogStore } from './memory-store';
import { KVRequestLogStore } from './kv-store';
import { PostgresRequestLogStore } from './postgres-store';

let _defaultStore: RequestLogStore | null = null;

/**
 * Get the default request log store based on environment.
 *
 * - VPS/Server (DATABASE_URL set, not Vercel/CF): Postgres
 * - Cloud (Vercel/CF): KV/D1 (via admin-config's unified getKV)
 * - Fallback (dev/test, no backend): In-memory
 *
 * Mirrors config-store's environment detection logic.
 */
export function getDefaultRequestLogStore(): RequestLogStore {
  if (!_defaultStore) {
    // VPS/Server: Postgres
    if (process.env.DATABASE_URL && !process.env.VERCEL && !process.env.CF_PAGES) {
      _defaultStore = new PostgresRequestLogStore();
    }
    // Cloud (Vercel/CF): KV/D1
    else if (process.env.VERCEL || process.env.CF_PAGES || process.env.KV_REST_API_URL) {
      _defaultStore = new KVRequestLogStore();
    }
    // Fallback: in-memory (dev/test)
    else {
      _defaultStore = new MemoryRequestLogStore();
    }
  }
  return _defaultStore;
}

/**
 * Override the default store (useful for testing).
 */
export function setDefaultRequestLogStore(store: RequestLogStore): void {
  _defaultStore = store;
}

/**
 * Reset the default store (test helper).
 */
export function __resetDefaultRequestLogStore(): void {
  _defaultStore = null;
}

export * from './types';
export { MemoryRequestLogStore } from './memory-store';
export { KVRequestLogStore } from './kv-store';
export { PostgresRequestLogStore } from './postgres-store';
