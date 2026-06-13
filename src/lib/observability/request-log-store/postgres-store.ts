// ============================================================
// AI API Relay — Postgres Request Log Store
// ============================================================
// Backs request logs with Postgres via Drizzle ORM. Used for VPS/self-hosted
// deployments where DATABASE_URL is set.

import type { RequestLogStore, RequestLogEntry, RequestLogFilters } from './types';
import { getDbOrNull } from '@/lib/db/client';
import { requestLogs } from '@/lib/db/schema';
import { desc, eq, and, sql } from 'drizzle-orm';

const DEFAULT_MAX_ENTRIES = 500;
const CAPTURE_FLAG_KEY = 'request_log_capture_enabled';

export class PostgresRequestLogStore implements RequestLogStore {
  private maxEntries: number;

  constructor() {
    const userMax = parseInt(process.env.REQUEST_LOGS_MAX_ENTRIES || '', 10);
    this.maxEntries = isNaN(userMax) ? DEFAULT_MAX_ENTRIES : userMax;
  }

  async append(log: RequestLogEntry): Promise<void> {
    if (!(await this.isCaptureEnabled())) return;

    const db = getDbOrNull();
    if (!db) return;

    try {
      await db.insert(requestLogs).values({
        traceId: log.traceId,
        timestamp: new Date(log.timestamp),
        apiKeyHash: log.apiKeyHash,
        model: log.model,
        provider: log.provider,
        status: log.status,
        httpStatus: log.httpStatus,
        latencyMs: log.latencyMs,
        promptTokens: log.promptTokens ?? null,
        completionTokens: log.completionTokens ?? null,
        totalTokens: log.totalTokens ?? null,
        isStream: log.isStream ? 1 : 0,
        errorType: log.errorType ?? null,
        errorMessage: log.errorMessage ?? null,
        diagnostic: log.diagnostic ?? null,
      });

      // Prune old entries if we exceed maxEntries
      await this.pruneIfNeeded(db);
    } catch (err) {
      // Non-critical: log append failures don't block the request
      console.error('[PostgresRequestLogStore] append failed:', err);
    }
  }

  async list(filters?: RequestLogFilters): Promise<RequestLogEntry[]> {
    const db = getDbOrNull();
    if (!db) return [];

    try {
      const conditions = [];
      if (filters?.status && filters.status !== 'all') {
        conditions.push(eq(requestLogs.status, filters.status));
      }
      if (filters?.provider) {
        conditions.push(eq(requestLogs.provider, filters.provider));
      }

      const limit = filters?.limit && filters.limit > 0 ? filters.limit : 100;

      const rows = await db
        .select()
        .from(requestLogs)
        .where(conditions.length > 0 ? and(...conditions) : undefined)
        .orderBy(desc(requestLogs.timestamp))
        .limit(limit);

      return rows.map((row) => ({
        traceId: row.traceId,
        timestamp: row.timestamp.toISOString(),
        apiKeyHash: row.apiKeyHash,
        model: row.model,
        provider: row.provider,
        status: row.status as 'success' | 'error',
        httpStatus: row.httpStatus,
        latencyMs: row.latencyMs,
        promptTokens: row.promptTokens ?? undefined,
        completionTokens: row.completionTokens ?? undefined,
        totalTokens: row.totalTokens ?? undefined,
        isStream: row.isStream === 1,
        errorType: row.errorType ?? undefined,
        errorMessage: row.errorMessage ?? undefined,
        diagnostic: row.diagnostic ?? undefined,
      }));
    } catch (err) {
      console.error('[PostgresRequestLogStore] list failed:', err);
      return [];
    }
  }

  async clear(): Promise<void> {
    const db = getDbOrNull();
    if (!db) return;

    try {
      await db.delete(requestLogs);
    } catch (err) {
      console.error('[PostgresRequestLogStore] clear failed:', err);
    }
  }

  async isCaptureEnabled(): Promise<boolean> {
    const db = getDbOrNull();
    if (!db) return false;

    try {
      // Use a simple key-value table or just check an env variable
      // For simplicity, we'll use an env variable approach for now
      // In production, this could be a dedicated config table
      const envFlag = process.env.REQUEST_LOGS_CAPTURE_ENABLED;
      return envFlag === '1' || envFlag === 'true';
    } catch {
      return false;
    }
  }

  async enableCapture(ttlSeconds: number): Promise<void> {
    // For Postgres, we'd need a key-value config table to store TTL-based flags.
    // For now, this is a no-op. In production, implement a config_flags table
    // with (key, value, expires_at) columns.
    console.warn('[PostgresRequestLogStore] enableCapture not yet implemented for Postgres');
  }

  private async pruneIfNeeded(db: any): Promise<void> {
    try {
      // Count total entries
      const [{ count }] = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(requestLogs);

      if (count <= this.maxEntries) return;

      // Delete oldest entries beyond maxEntries
      const toDelete = count - this.maxEntries;
      await db.execute(sql`
        DELETE FROM ${requestLogs}
        WHERE id IN (
          SELECT id FROM ${requestLogs}
          ORDER BY timestamp ASC
          LIMIT ${toDelete}
        )
      `);
    } catch {
      // Best-effort pruning
    }
  }
}
