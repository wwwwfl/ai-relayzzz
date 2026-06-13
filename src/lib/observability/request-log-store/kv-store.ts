// ============================================================
// AI API Relay — KV/D1 Request Log Store
// ============================================================
// Backs request logs with Vercel KV (on Vercel) or Cloudflare D1 via
// CFKVAdapter (on CF Pages). Reuses admin-config's getKV() for environment
// detection and unified access.

import type { RequestLogStore, RequestLogEntry, RequestLogFilters } from './types';
import { getKV } from '@/lib/admin/admin-config';

const PREFIX = 'request_log:';
const CAPTURE_FLAG_KEY = 'request_log_capture_enabled';
const DEFAULT_MAX_ENTRIES = 100;

export class KVRequestLogStore implements RequestLogStore {
  private maxEntries: number;

  constructor() {
    const userMax = parseInt(process.env.REQUEST_LOGS_MAX_ENTRIES || '', 10);
    this.maxEntries = isNaN(userMax) ? DEFAULT_MAX_ENTRIES : userMax;
  }

  async append(log: RequestLogEntry): Promise<void> {
    if (!(await this.isCaptureEnabled())) return;

    const kv = await getKV();
    if (!kv) return;

    try {
      // Key: request_log:<timestamp>:<traceId> for time-ordered listing
      const key = `${PREFIX}${Date.now()}:${log.traceId}`;
      // Store with 7-day TTL
      await kv.set(key, JSON.stringify(log), { ex: 7 * 24 * 60 * 60 });

      // Prune old entries if we exceed maxEntries
      await this.pruneIfNeeded(kv);
    } catch (err) {
      // Non-critical: log append failures don't block the request
      console.error('[RequestLogStore] append failed:', err);
    }
  }

  async list(filters?: RequestLogFilters): Promise<RequestLogEntry[]> {
    const kv = await getKV();
    if (!kv) return [];

    try {
      // Scan all request_log:* keys (CFKVAdapter and Vercel KV both support scan)
      const keys = await kv.scan(`${PREFIX}*`);
      if (!keys || keys.length === 0) return [];

      // Fetch all in parallel
      const values = await Promise.all(
        (keys as string[]).map((k: string) => kv.get(k).catch(() => null))
      );

      let logs: RequestLogEntry[] = values
        .filter((v) => v !== null)
        .map((v) => {
          try {
            return typeof v === 'string' ? JSON.parse(v) : v;
          } catch {
            return null;
          }
        })
        .filter((log): log is RequestLogEntry => log !== null);

      // Sort by timestamp DESC (newest first)
      logs.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

      // Apply filters
      if (filters?.status && filters.status !== 'all') {
        logs = logs.filter((log) => log.status === filters.status);
      }
      if (filters?.provider) {
        logs = logs.filter((log) => log.provider === filters.provider);
      }
      if (filters?.limit && filters.limit > 0) {
        logs = logs.slice(0, filters.limit);
      }

      return logs;
    } catch (err) {
      console.error('[RequestLogStore] list failed:', err);
      return [];
    }
  }

  async clear(): Promise<void> {
    const kv = await getKV();
    if (!kv) return;

    try {
      const keys = await kv.scan(`${PREFIX}*`);
      if (keys && keys.length > 0) {
        await Promise.all((keys as string[]).map((k: string) => kv.del(k)));
      }
    } catch (err) {
      console.error('[RequestLogStore] clear failed:', err);
    }
  }

  async isCaptureEnabled(): Promise<boolean> {
    const kv = await getKV();
    if (!kv) return false;

    try {
      const flag = await kv.get(CAPTURE_FLAG_KEY);
      return flag === '1';
    } catch {
      return false;
    }
  }

  async enableCapture(ttlSeconds: number): Promise<void> {
    const kv = await getKV();
    if (!kv) return;

    try {
      await kv.set(CAPTURE_FLAG_KEY, '1', { ex: ttlSeconds });
    } catch (err) {
      console.error('[RequestLogStore] enableCapture failed:', err);
    }
  }

  private async pruneIfNeeded(kv: any): Promise<void> {
    try {
      const keys = await kv.scan(`${PREFIX}*`);
      if (!keys || keys.length <= this.maxEntries) return;

      // Sort keys by timestamp (embedded in key) and delete oldest
      const sorted = keys.sort();
      const toDelete = sorted.slice(0, keys.length - this.maxEntries);
      await Promise.all(toDelete.map((k: string) => kv.del(k)));
    } catch {
      // Best-effort pruning
    }
  }
}
