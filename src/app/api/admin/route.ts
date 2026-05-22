// ============================================================
// AI API Relay — Admin API (/api/admin)
// ============================================================

import { NextRequest } from 'next/server';
import { getKeyPoolStats, initAllKeyPools } from '@/lib/relay';
import { requireAdminAuth } from '@/lib/admin';
import { KVUsageStorage } from '@/lib/usage';
import { PROVIDERS } from '@/lib/providers';

export const runtime = 'nodejs';
export const maxDuration = 30;

const usageStorage = new KVUsageStorage();

/**
 * GET /api/admin
 *
 * Returns comprehensive admin data:
 * - Provider key pool status
 * - Global usage stats
 * - Quota status
 * - Model aliases
 */
export async function GET(request: NextRequest) {
  // Auth check — require RELAY_ADMIN_KEY (falls back to RELAY_API_KEY)
  const authResponse = requireAdminAuth(request);
  if (authResponse) return authResponse;

  // Eagerly init all provider pools so stats reflect all configured providers
  await initAllKeyPools(PROVIDERS);
  const providerStats = getKeyPoolStats();

  // Fire all 4 KV queries in parallel instead of sequential awaits
  const [globalUsage, quota, errorStats, keyErrors] = await Promise.all([
    usageStorage.getGlobalUsage(),
    usageStorage.checkQuota(),
    usageStorage.getErrorStats(),
    usageStorage.getKeyErrors(),
  ]);

  const providers = Object.entries(PROVIDERS).map(([name, config]) => {
    const stats = providerStats[name];
    return {
      name: config.displayName,
      id: name,
      keyCount: stats?.total || 0,
      availableKeys: stats?.available || 0,
      configured: !!process.env[config.envKeyField],
      modelPrefixes: config.modelPrefixes,
      models: (config.models || []).map(m => ({ id: m.id, displayName: m.displayName })),
    };
  });

  // Build keyHash → provider mapping from key pool stats
  const keyHashToProvider: Record<string, string> = {};
  for (const [provider, stat] of Object.entries(providerStats)) {
    for (const hash of (stat as any).keyHashes || []) {
      keyHashToProvider[hash] = provider;
    }
  }

  // Attach per-key errors to providers
  const providersWithErrors = providers.map((p) => {
    const providerErrors = errorStats[p.id] || {};
    const providerKeyErrors: Array<{ keyHash: string; errors: Record<string, { count: number; reason: string }> }> = [];
    for (const ke of keyErrors) {
      if (keyHashToProvider[ke.keyHash] === p.id) {
        providerKeyErrors.push({ keyHash: ke.keyHash, errors: ke.errors });
      }
    }
    return {
      ...p,
      errors: providerErrors,
      keyErrors: providerKeyErrors,
    };
  });

  return Response.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    providers: providersWithErrors,
    usage: globalUsage || { requests: 0, tokens: 0, promptTokens: 0, completionTokens: 0, providers: {} },
    quota: {
      daily: { used: quota.dailyUsed, limit: quota.dailyLimit || 'unlimited' },
      monthly: { used: quota.monthlyUsed, limit: quota.monthlyLimit || 'unlimited' },
      allowed: quota.allowed,
      isOverride: quota.isOverride || false,
    },
    config: {
      dailyLimit: parseInt(process.env.RELAY_DAILY_LIMIT || '0', 10) || null,
      monthlyLimit: parseInt(process.env.RELAY_MONTHLY_LIMIT || '0', 10) || null,
      customDailyLimit: quota.isOverride ? quota.dailyLimit : null,
      customMonthlyLimit: quota.isOverride ? quota.monthlyLimit : null,
    },
  });
}
