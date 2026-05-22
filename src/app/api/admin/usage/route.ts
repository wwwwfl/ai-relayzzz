// ============================================================
// AI API Relay — Admin: Usage Overview
// GET /api/admin/usage
// ============================================================

import { NextRequest } from 'next/server';
import { requireAdminAuth } from '@/lib/admin';
import { getKeyPoolStats, initAllKeyPools } from '@/lib/relay';
import { KVUsageStorage } from '@/lib/usage';
import { PROVIDERS } from '@/lib/providers';

export const runtime = 'nodejs';
export const maxDuration = 30;

const usageStorage = new KVUsageStorage();

/**
 * GET /api/admin/usage
 *
 * Returns usage stats per provider (today) with key pool info.
 */
export async function GET(request: NextRequest) {
  const authErr = requireAdminAuth(request);
  if (authErr) return authErr;

  // Eagerly init all provider pools
  initAllKeyPools(PROVIDERS);
  const poolStats = getKeyPoolStats();

  // Fetch global usage and per-provider usage in parallel
  const [globalUsage, quota, errorStats] = await Promise.all([
    usageStorage.getGlobalUsage(),
    usageStorage.checkQuota(),
    usageStorage.getErrorStats(),
  ]);

  // Build per-provider summary
  const providers = Object.entries(PROVIDERS).map(([name, config]) => {
    const usage = globalUsage?.providers?.[name] || { requests: 0, tokens: 0, promptTokens: 0, completionTokens: 0 };
    const pool = poolStats[name] || { total: 0, available: 0, keyHashes: [] };
    const errors = errorStats[name] || {};

    return {
      name,
      displayName: config.displayName,
      usage: {
        requests: usage.requests,
        tokens: usage.tokens,
        promptTokens: usage.promptTokens,
        completionTokens: usage.completionTokens,
      },
      keyPool: {
        total: pool.total,
        available: pool.available,
      },
      errors,
      hasFallback: !!config.fallbackProvider,
      fallbackProvider: config.fallbackProvider || null,
    };
  });

  return Response.json({
    timestamp: new Date().toISOString(),
    global: {
      requests: globalUsage?.requests || 0,
      tokens: globalUsage?.tokens || 0,
      promptTokens: globalUsage?.promptTokens || 0,
      completionTokens: globalUsage?.completionTokens || 0,
    },
    quota: {
      daily: { used: quota.dailyUsed, limit: quota.dailyLimit || 'unlimited' },
      monthly: { used: quota.monthlyUsed, limit: quota.monthlyLimit || 'unlimited' },
      allowed: quota.allowed,
    },
    providers,
  });
}
