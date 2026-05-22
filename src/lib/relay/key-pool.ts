// ============================================================
// AI API Relay — Key Pool Management & Rotation
// ============================================================

import type { ApiKey, KeyPool, ProviderConfig } from '../providers/types';

/** In-memory key pools (cold start init, refreshed periodically) */
const keyPools = new Map<string, KeyPool>();

/** Cooldown tracking: key hash → expiry timestamp */
const cooldowns = new Map<string, number>();

const COOLDOWN_MS = 60_000; // 60s cooldown after 429/5xx

/** Last-resort refresh interval for managed keys (5 min) */
const MANAGED_KEY_REFRESH_MS = 300_000;
const lastManagedRefresh = new Map<string, number>();

/**
 * Hash a key to a short identifier (for KV storage / logging).
 * Uses djb2 — fast, no crypto dependency.
 */
export function hashKey(key: string): string {
  let hash = 5381;
  for (let i = 0; i < key.length; i++) {
    hash = ((hash << 5) + hash + key.charCodeAt(i)) >>> 0;
  }
  return hash.toString(16).padStart(8, '0');
}

/**
 * Parse comma-separated API keys from environment variable.
 */
function parseKeys(envValue: string | undefined, provider: string): ApiKey[] {
  if (!envValue) return [];
  return envValue
    .split(',')
    .map((k) => k.trim())
    .filter((k) => k.length > 0)
    .map((key) => ({
      key,
      hash: hashKey(key),
      provider,
    }));
}

/**
 * Try to load managed keys from admin KV config.
 * Returns null if KV is not configured or no managed keys exist.
 */
async function loadManagedKeys(providerName: string): Promise<ApiKey[] | null> {
  try {
    const { getManagedKeys } = await import('../admin/admin-config');
    const managed = await getManagedKeys(providerName);
    if (managed && managed.length > 0) {
      return managed.map((key) => ({
        key,
        hash: hashKey(key),
        provider: providerName,
      }));
    }
  } catch {
    // admin-config not available or KV not configured
  }
  return null;
}

/**
 * Initialize or refresh key pools from environment variables.
 */
function initKeyPool(config: ProviderConfig): KeyPool {
  const keys = parseKeys(process.env[config.envKeyField], config.name);
  const pool: KeyPool = {
    provider: config.name,
    keys,
    counter: 0,
  };
  keyPools.set(config.name, pool);
  return pool;
}

/**
 * Get the key pool for a provider, initializing if needed.
 * Checks KV for managed keys first; falls back to env vars.
 */
export async function getKeyPool(config: ProviderConfig): Promise<KeyPool> {
  const existing = keyPools.get(config.name);
  if (existing) {
    // Periodically refresh managed keys (every 5 min)
    const lastRefresh = lastManagedRefresh.get(config.name) || 0;
    if (Date.now() - lastRefresh > MANAGED_KEY_REFRESH_MS) {
      const managed = await loadManagedKeys(config.name);
      if (managed) {
        existing.keys = managed;
        lastManagedRefresh.set(config.name, Date.now());
      }
    }
    return existing;
  }
  // First call — try managed keys, then env vars
  const managed = await loadManagedKeys(config.name);
  if (managed) {
    const pool: KeyPool = { provider: config.name, keys: managed, counter: 0 };
    keyPools.set(config.name, pool);
    lastManagedRefresh.set(config.name, Date.now());
    return pool;
  }
  return initKeyPool(config);
}

/**
 * Select the next available key using round-robin with cooldown skip.
 * Returns null if all keys are on cooldown.
 */
export async function selectKey(config: ProviderConfig): Promise<ApiKey | null> {
  const pool = await getKeyPool(config);
  if (pool.keys.length === 0) return null;

  const now = Date.now();
  const totalKeys = pool.keys.length;

  for (let i = 0; i < totalKeys; i++) {
    const idx = (pool.counter + i) % totalKeys;
    const candidate = pool.keys[idx];
    const cooldownUntil = cooldowns.get(candidate.hash);

    if (!cooldownUntil || now >= cooldownUntil) {
      pool.counter = (idx + 1) % totalKeys;
      return candidate;
    }
  }

  // All keys on cooldown — return the one with earliest expiry
  let earliest = pool.keys[0];
  let earliestTime = cooldowns.get(earliest.hash) || Infinity;
  for (const key of pool.keys) {
    const cd = cooldowns.get(key.hash) || Infinity;
    if (cd < earliestTime) {
      earliest = key;
      earliestTime = cd;
    }
  }
  pool.counter = (pool.keys.indexOf(earliest) + 1) % totalKeys;
  return earliest;
}

/**
 * Mark a key as on cooldown (called after 429 or 5xx).
 */
export function markCooldown(key: ApiKey): void {
  cooldowns.set(key.hash, Date.now() + COOLDOWN_MS);
}

/**
 * Eagerly initialize all provider key pools from environment variables.
 * Call this in admin/status endpoints so stats reflect all configured providers,
 * not just ones that have handled a request in this invocation.
 */
export async function initAllKeyPools(configs: Record<string, { envKeyField: string; name: string }>): Promise<void> {
  for (const config of Object.values(configs)) {
    if (!keyPools.has(config.name)) {
      await getKeyPool(config as ProviderConfig);
    }
  }
}

/**
 * Get key pool stats for admin/status page.
 */
export function getKeyPoolStats(): Record<string, { total: number; available: number; keyHashes: string[] }> {
  const now = Date.now();
  const stats: Record<string, { total: number; available: number; keyHashes: string[] }> = {};

  for (const [name, pool] of keyPools) {
    const available = pool.keys.filter(
      (k) => !cooldowns.has(k.hash) || now >= cooldowns.get(k.hash)!
    ).length;
    stats[name] = {
      total: pool.keys.length,
      available,
      keyHashes: pool.keys.map((k) => k.hash),
    };
  }

  return stats;
}

/**
 * Update the memory key pool directly (called when admin modifies keys via KV).
 */
export function updateMemoryKeyPool(providerName: string, rawKeys: string[]): void {
  const existing = keyPools.get(providerName);
  const keys = rawKeys.map((key) => ({
    key,
    hash: hashKey(key),
    provider: providerName,
  }));
  if (existing) {
    existing.keys = keys;
  } else {
    keyPools.set(providerName, {
      provider: providerName,
      keys,
      counter: 0,
    });
  }
  lastManagedRefresh.set(providerName, Date.now());
}
