// ============================================================
// AI API Relay — Status API (/api/status)
// ============================================================

import { NextRequest } from 'next/server';
import { getKeyPoolStats, initAllKeyPools, getConcurrencyStats } from '@/lib/relay';
import { getRateLimiterStats } from '@/lib/relay/rate-limiter';
import { KVUsageStorage } from '@/lib/usage';
import { PROVIDERS } from '@/lib/providers';

export const runtime = 'edge';

const usageStorage = new KVUsageStorage();

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const showDetails = url.searchParams.get('detail') === '1';

  await initAllKeyPools(PROVIDERS);
  const providerStats = getKeyPoolStats();
  const rateLimiterStats = getRateLimiterStats();
  const globalUsage = await usageStorage.getGlobalUsage();

  const providers = Object.entries(PROVIDERS).map(([name, config]) => {
    const stats = providerStats[name];
    const rl = rateLimiterStats[name];
    return {
      name: config.displayName,
      keyCount: stats?.total || 0,
      availableKeys: stats?.available || 0,
      configured: !!process.env[config.envKeyField],
      circuit: rl?.circuit || { state: 'closed', consecutiveFailures: 0, cooldownRemainingMs: 0 },
      tokenBucket: rl?.tokenBucket || { tokens: 60, capacity: 60 },
    };
  });

  return Response.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    providers,
    usage: globalUsage || { requests: 0, tokens: 0 },
  });
}
