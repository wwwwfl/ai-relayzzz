// ============================================================
// AI API Relay — KV-backed Usage Storage (Vercel KV)
// ============================================================

import type {
  UsageStorage,
  UsageEvent,
  TrendPoint,
  ProviderTrendPoint,
  QuotaStatus,
} from '../sdk';
import { withTimeout } from '@/lib/utils/timeout';

/** Known provider names for trend queries */
const PROVIDER_NAMES = ['openai', 'anthropic', 'deepseek', 'xiaomimimo', 'xiaomi', 'lpgpt'];

/**
 * Get today's date string in YYYY-MM-DD format.
 */
function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function thisMonth(): string {
  return new Date().toISOString().slice(0, 7);
}

function dateRange(days: number): string[] {
  const dates: string[] = [];
  const now = new Date();
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    dates.push(d.toISOString().slice(0, 10));
  }
  return dates;
}

function getWeekLabel(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00');
  const jan4 = new Date(d.getFullYear(), 0, 4);
  const dayOfYear = Math.floor((d.getTime() - new Date(d.getFullYear(), 0, 1).getTime()) / 86400000) + 1;
  const weekNum = Math.ceil((dayOfYear + jan4.getDay()) / 7);
  return `${d.getFullYear()}-W${String(weekNum).padStart(2, '0')}`;
}

function getMonthLabel(dateStr: string): string {
  return dateStr.slice(0, 7);
}

function aggregatePoints(points: TrendPoint[], labelFn: (date: string) => string): TrendPoint[] {
  const buckets = new Map<string, TrendPoint>();
  for (const p of points) {
    const label = labelFn(p.date);
    const existing = buckets.get(label);
    if (existing) {
      existing.requests += p.requests;
      existing.promptTokens += p.promptTokens;
      existing.completionTokens += p.completionTokens;
      existing.totalTokens += p.totalTokens;
    } else {
      buckets.set(label, {
        date: label,
        requests: p.requests,
        promptTokens: p.promptTokens,
        completionTokens: p.completionTokens,
        totalTokens: p.totalTokens,
      });
    }
  }
  return Array.from(buckets.values());
}

function parseDailyPoint(date: string, raw: Record<string, unknown> | null): TrendPoint {
  return {
    date,
    requests: Number(raw?.requests || 0),
    promptTokens: Number(raw?.promptTokens || 0),
    completionTokens: Number(raw?.completionTokens || 0),
    totalTokens: Number(raw?.tokens || 0),
  };
}

/**
 * Lazy KV client loader.
 * Returns null if KV is not configured.
 */
let _kv: any = null;
let _kvChecked = false;

async function getKV() {
  if (_kvChecked) return _kv;
  _kvChecked = true;
  if (!process.env.KV_REST_API_URL || !process.env.KV_REST_API_TOKEN) {
    return null;
  }
  try {
    const mod = await import('@vercel/kv');
    _kv = mod.kv || mod.createClient({
      url: process.env.KV_REST_API_URL,
      token: process.env.KV_REST_API_TOKEN,
    });
    return _kv;
  } catch {
    return null;
  }
}

/**
 * Simple TTL cache for admin dashboard data.
 * Serverless containers reuse module-level state across warm invocations.
 */
interface AdminCacheEntry {
  data: unknown;
  expiresAt: number;
}
const _adminCache = new Map<string, AdminCacheEntry>();
const ADMIN_CACHE_TTL_MS = 30_000; // 30 seconds

function getCached<T>(key: string): T | null {
  const entry = _adminCache.get(key);
  if (entry && Date.now() < entry.expiresAt) return entry.data as T;
  return null;
}

function setCache(key: string, data: unknown, ttlMs = ADMIN_CACHE_TTL_MS): void {
  _adminCache.set(key, { data, expiresAt: Date.now() + ttlMs });
}

/**
 * KV-backed implementation of UsageStorage.
 */
export class KVUsageStorage implements UsageStorage {
  async record(event: UsageEvent): Promise<void> {
    try {
      const kv = await getKV();
      if (!kv) return;

      const date = today();
      const month = thisMonth();
      const totalTokens = event.totalTokens;

      const promises: Promise<unknown>[] = [];

      // Per-key daily usage
      const keyDailyKey = `usage:${event.apiKeyHash}:daily:${date}`;
      promises.push(
        kv.hincrby(keyDailyKey, 'requests', 1),
        kv.hincrby(keyDailyKey, 'tokens', totalTokens),
        kv.expire(keyDailyKey, 86400 * 7)
      );

      // Per-key total usage
      const keyTotalKey = `usage:${event.apiKeyHash}:total`;
      promises.push(
        kv.hincrby(keyTotalKey, 'requests', 1),
        kv.hincrby(keyTotalKey, 'tokens', totalTokens)
      );

      // Global daily usage (with prompt/completion split)
      const globalDailyKey = `usage:daily:${date}`;
      promises.push(
        kv.hincrby(globalDailyKey, 'requests', 1),
        kv.hincrby(globalDailyKey, 'tokens', totalTokens),
        kv.hincrby(globalDailyKey, 'promptTokens', event.promptTokens),
        kv.hincrby(globalDailyKey, 'completionTokens', event.completionTokens),
        kv.expire(globalDailyKey, 86400 * 30)
      );

      // Per-provider daily usage
      if (event.provider) {
        const providerDailyKey = `usage:provider:${event.provider}:daily:${date}`;
        promises.push(
          kv.hincrby(providerDailyKey, 'requests', 1),
          kv.hincrby(providerDailyKey, 'tokens', totalTokens),
          kv.hincrby(providerDailyKey, 'promptTokens', event.promptTokens),
          kv.hincrby(providerDailyKey, 'completionTokens', event.completionTokens),
          kv.expire(providerDailyKey, 86400 * 30)
        );
      }

      // Increment quota counters
      promises.push(...this.incrementQuotaPromises(kv, date, month));

      await withTimeout(Promise.all(promises), 1000, [], 'recordUsage');
    } catch {
      // Non-critical — never break the request
    }
  }

  /**
   * Record an API error for tracking.
   * KV keys:
   *   error:{provider}:{date} → hash {status:count, ...}
   *   error:key:{keyHash}:{date} → hash {status:count, reason:...}
   */
  async recordError(event: {
    provider: string;
    keyHash: string;
    statusCode: number;
    reason: string;
  }): Promise<void> {
    try {
      const kv = await getKV();
      if (!kv) return;

      const date = today();
      const status = String(event.statusCode);

      const promises: Promise<unknown>[] = [];

      // Per-provider daily error counts
      const providerKey = `error:${event.provider}:${date}`;
      promises.push(
        kv.hincrby(providerKey, status, 1),
        kv.expire(providerKey, 86400 * 7)
      );

      // Per-key daily error details
      const keyErrorKey = `error:key:${event.keyHash}:${date}`;
      promises.push(
        kv.hincrby(keyErrorKey, status, 1),
        // Store latest reason for this status code
        kv.hset(keyErrorKey, `reason:${status}`, event.reason.slice(0, 200)),
        kv.expire(keyErrorKey, 86400 * 7)
      );

      // Track which key hashes had errors today (for efficient lookup)
      const indexKey = `error:keys:${date}`;
      promises.push(
        kv.sadd(indexKey, event.keyHash),
        kv.expire(indexKey, 86400 * 7)
      );

      await withTimeout(Promise.all(promises), 1000, [], 'recordError');
    } catch {
      // Non-critical
    }
  }

  /**
   * Get error stats for all providers (today).
   */
  async getErrorStats(): Promise<Record<string, Record<string, number>>> {
    const cacheKey = `errorStats:${today()}`;
    const cached = getCached<Record<string, Record<string, number>>>(cacheKey);
    if (cached) return cached;

    try {
      const kv = await getKV();
      if (!kv) return {};

      const date = today();
      const result: Record<string, Record<string, number>> = {};

      // Fetch all provider error stats in parallel
      const providerResults = await withTimeout(
        Promise.all(
          PROVIDER_NAMES.map(async (provider) => {
            const raw = await kv.hgetall(`error:${provider}:${date}`);
            return { provider, raw };
          })
        ),
        1000,
        [],
        'getErrorStats:hgetall'
      );

      for (const { provider, raw } of providerResults) {
        if (raw && Object.keys(raw).length > 0) {
          result[provider] = {};
          for (const [code, count] of Object.entries(raw)) {
            result[provider][code] = Number(count);
          }
        }
      }
      setCache(cacheKey, result);
      return result;
    } catch {
      return {};
    }
  }

  /**
   * Get per-key error details (today).
   */
  async getKeyErrors(): Promise<Array<{
    keyHash: string;
    errors: Record<string, { count: number; reason: string }>;
  }>> {
    const cacheKey = `keyErrors:${today()}`;
    const cached = getCached<Array<{ keyHash: string; errors: Record<string, { count: number; reason: string }> }>>(cacheKey);
    if (cached) return cached;

    try {
      const kv = await getKV();
      if (!kv) return [];

      const date = today();
      const results: Array<{
        keyHash: string;
        errors: Record<string, { count: number; reason: string }>;
      }> = [];

      // Get all key hashes that had errors today from the SET
      const indexKey = `error:keys:${date}`;
      const keyHashes: string[] = await withTimeout(
        kv.smembers(indexKey),
        1000,
        [],
        'getKeyErrors:smembers'
      );
      if (!keyHashes || keyHashes.length === 0) return [];

      // Fetch all key errors in parallel
      const keyResults = await withTimeout(
        Promise.all(
          keyHashes.map(async (keyHash: string) => {
            const redisKey = `error:key:${keyHash}:${date}`;
            const raw = await kv.hgetall(redisKey);
            return { keyHash, raw };
          })
        ),
        1000,
        [],
        'getKeyErrors:hgetall'
      );

      for (const { keyHash, raw } of keyResults) {
        if (!raw) continue;

        const errors: Record<string, { count: number; reason: string }> = {};
        for (const [field, value] of Object.entries(raw)) {
          if (String(field).startsWith('reason:')) continue;
          errors[String(field)] = {
            count: Number(value),
            reason: String(raw[`reason:${String(field)}`] || ''),
          };
        }

        if (Object.keys(errors).length > 0) {
          results.push({ keyHash: String(keyHash), errors });
        }
      }

      setCache(cacheKey, results);
      return results;
    } catch {
      return [];
    }
  }

  async getKeyUsage(keyHash: string): Promise<{
    daily: { requests: number; tokens: number };
    total: { requests: number; tokens: number };
  } | null> {
    const cacheKey = `keyUsage:${keyHash}:${today()}`;
    const cached = getCached<{ daily: { requests: number; tokens: number }; total: { requests: number; tokens: number } }>(cacheKey);
    if (cached) return cached;

    try {
      const kv = await getKV();
      if (!kv) return null;

      const date = today();
      const [dailyRaw, totalRaw] = await withTimeout(
        Promise.all([
          kv.hgetall(`usage:${keyHash}:daily:${date}`),
          kv.hgetall(`usage:${keyHash}:total`),
        ]),
        1000,
        [null, null] as [Record<string, unknown> | null, Record<string, unknown> | null],
        `getKeyUsage:${keyHash}`
      );

      const result = {
        daily: {
          requests: Number(dailyRaw?.requests || 0),
          tokens: Number(dailyRaw?.tokens || 0),
        },
        total: {
          requests: Number(totalRaw?.requests || 0),
          tokens: Number(totalRaw?.tokens || 0),
        },
      };
      setCache(cacheKey, result);
      return result;
    } catch {
      return null;
    }
  }

  async getGlobalUsage(): Promise<{
    requests: number;
    tokens: number;
    promptTokens: number;
    completionTokens: number;
    providers: Record<string, { requests: number; tokens: number; promptTokens: number; completionTokens: number }>;
  } | null> {
    const cacheKey = `globalUsage:${today()}`;
    const cached = getCached<{
      requests: number;
      tokens: number;
      promptTokens: number;
      completionTokens: number;
      providers: Record<string, { requests: number; tokens: number; promptTokens: number; completionTokens: number }>;
    }>(cacheKey);
    if (cached) return cached;

    try {
      const kv = await getKV();
      if (!kv) return null;

      const date = today();
      const [raw, providerResults] = await withTimeout(
        Promise.all([
          kv.hgetall(`usage:daily:${date}`) as Promise<Record<string, unknown> | null>,
          Promise.all(
            PROVIDER_NAMES.map(async (provider) => {
              const pRaw = await kv.hgetall(`usage:provider:${provider}:daily:${date}`);
              return { provider, raw: pRaw };
            })
          ),
        ]),
        1000,
        [null, []] as [Record<string, unknown> | null, Array<{ provider: string; raw: Record<string, unknown> | null }>],
        'getGlobalUsage'
      );

      const providers: Record<string, { requests: number; tokens: number; promptTokens: number; completionTokens: number }> = {};
      for (const { provider, raw: pRaw } of providerResults) {
        const req = Number(pRaw?.requests || 0);
        if (req > 0) {
          providers[provider] = {
            requests: req,
            tokens: Number(pRaw?.tokens || 0),
            promptTokens: Number(pRaw?.promptTokens || 0),
            completionTokens: Number(pRaw?.completionTokens || 0),
          };
        }
      }

      const result = {
        requests: Number(raw?.requests || 0),
        tokens: Number(raw?.tokens || 0),
        promptTokens: Number(raw?.promptTokens || 0),
        completionTokens: Number(raw?.completionTokens || 0),
        providers,
      };
      setCache(cacheKey, result);
      return result;
    } catch {
      return null;
    }
  }

  async getUsageTrend(
    range: string,
    granularity: 'day' | 'week' | 'month' = 'day'
  ): Promise<{ global: TrendPoint[]; providers: ProviderTrendPoint[] }> {
    const cacheKey = `usageTrend:${range}:${granularity}:${today()}`;
    const cached = getCached<{ global: TrendPoint[]; providers: ProviderTrendPoint[] }>(cacheKey);
    if (cached) return cached;

    const kv = await getKV();
    if (!kv) {
      return { global: [], providers: [] };
    }

    let days: number;
    if (granularity === 'day') {
      days = range === '30d' ? 30 : 7;
    } else if (granularity === 'week') {
      days = range === '12w' ? 84 : 28;
    } else {
      days = range === '12m' ? 365 : 180;
    }

    const dates = dateRange(days);

    try {
      const globalPromises = dates.map(async (date) => {
        const raw = await kv.hgetall(`usage:daily:${date}`);
        return parseDailyPoint(date, raw as Record<string, unknown> | null);
      });

      const providerPromises = PROVIDER_NAMES.map(async (provider) => {
        const dataPromises = dates.map(async (date) => {
          const raw = await kv.hgetall(`usage:provider:${provider}:daily:${date}`);
          return parseDailyPoint(date, raw as Record<string, unknown> | null);
        });
        const data = await Promise.all(dataPromises);
        return { provider, data };
      });

      const [globalDaily, providersDaily] = await withTimeout(
        Promise.all([
          Promise.all(globalPromises),
          Promise.all(providerPromises),
        ]),
        2000,
        [[], []] as [TrendPoint[], Array<{ provider: string; data: TrendPoint[] }>],
        'getUsageTrend'
      );

      if (granularity === 'day') {
        const activeProviders = providersDaily.filter((p) =>
          p.data.some((d) => d.totalTokens > 0)
        );
        const result = { global: globalDaily, providers: activeProviders };
        setCache(cacheKey, result);
        return result;
      }

      const labelFn = granularity === 'week' ? getWeekLabel : getMonthLabel;
      const global = aggregatePoints(globalDaily, labelFn);
      const providers = providersDaily
        .map((p) => ({
          provider: p.provider,
          data: aggregatePoints(p.data, labelFn),
        }))
        .filter((p) => p.data.some((d) => d.totalTokens > 0));

      const result = { global, providers };
      setCache(cacheKey, result);
      return result;
    } catch {
      return { global: [], providers: [] };
    }
  }

  async checkQuota(): Promise<QuotaStatus> {
    const cacheKey = `quota:${today()}`;
    const cached = getCached<QuotaStatus>(cacheKey);
    if (cached) return cached;

    const dailyLimit = parseInt(process.env.RELAY_DAILY_LIMIT || '0', 10) || 0;
    const monthlyLimit = parseInt(process.env.RELAY_MONTHLY_LIMIT || '0', 10) || 0;
    const kv = await getKV();

    if (!kv || (!dailyLimit && !monthlyLimit)) {
      return { allowed: true, dailyUsed: 0, dailyLimit, monthlyUsed: 0, monthlyLimit };
    }

    const date = today();
    const month = thisMonth();

    try {
      const [dailyUsed, monthlyUsed] = await withTimeout(
        Promise.all([
          (kv.get(`quota:daily:${date}`) as Promise<number | null>).then((v) => v || 0),
          (kv.get(`quota:monthly:${month}`) as Promise<number | null>).then((v) => v || 0),
        ]),
        1000,
        [0, 0] as [number, number],
        'checkQuota'
      );

      let result: QuotaStatus;
      if (dailyLimit > 0 && dailyUsed >= dailyLimit) {
        const now = new Date();
        const midnight = new Date(now);
        midnight.setUTCHours(24, 0, 0, 0);
        const retryAfter = Math.ceil((midnight.getTime() - now.getTime()) / 1000);
        result = { allowed: false, dailyUsed, dailyLimit, monthlyUsed, monthlyLimit, retryAfter };
      } else if (monthlyLimit > 0 && monthlyUsed >= monthlyLimit) {
        const now = new Date();
        const nextMonth = new Date(now.getUTCFullYear(), now.getUTCMonth() + 1, 1);
        const retryAfter = Math.ceil((nextMonth.getTime() - now.getTime()) / 1000);
        result = { allowed: false, dailyUsed, dailyLimit, monthlyUsed, monthlyLimit, retryAfter };
      } else {
        result = { allowed: true, dailyUsed, dailyLimit, monthlyUsed, monthlyLimit };
      }

      // Only cache "allowed" results to avoid stale blocks
      if (result.allowed) {
        setCache(cacheKey, result, 15_000); // 15s for quota (shorter than admin cache)
      }
      return result;
    } catch {
      return { allowed: true, dailyUsed: 0, dailyLimit, monthlyUsed: 0, monthlyLimit };
    }
  }

  private incrementQuotaPromises(kv: any, date: string, month: string): Promise<unknown>[] {
    if (!kv) return [];
    const dailyKey = `quota:daily:${date}`;
    const monthlyKey = `quota:monthly:${month}`;
    return [
      kv.incr(dailyKey).then(() => kv.expire(dailyKey, 86400 * 2)),
      kv.incr(monthlyKey).then(() => kv.expire(monthlyKey, 86400 * 35)),
    ];
  }
}
