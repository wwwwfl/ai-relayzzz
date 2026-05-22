// ============================================================
// AI API Relay — Provider Resolver
// ============================================================

import type { ProviderConfig } from './types';
import { PROVIDERS } from './registry';

/**
 * Model alias mapping — lets users request common names that get
 * transparently rewritten to the actual upstream model ID.
 */
const MODEL_ALIASES: Record<string, string> = {
  'gpt-4': 'gpt-4-turbo',
  'gpt-3.5': 'gpt-3.5-turbo',
  'claude-3': 'claude-3-5-sonnet-20241022',
  'claude-3-opus': 'claude-3-opus-20240229',
  'claude-3-sonnet': 'claude-3-5-sonnet-20241022',
  'claude-3-haiku': 'claude-3-5-haiku-20241022',
};

/**
 * Resolve a model alias to its actual model name.
 * Returns the original name if no alias exists.
 */
export function resolveModelAlias(model: string): string {
  return MODEL_ALIASES[model.toLowerCase()] || model;
}

/**
 * Resolve which provider a model name belongs to.
 * Automatically resolves aliases before matching.
 * Returns null if no provider matches.
 */
export function resolveProvider(model: string): ProviderConfig | null {
  const resolved = resolveModelAlias(model);
  const lowerModel = resolved.toLowerCase();
  let bestProvider: ProviderConfig | null = null;
  let longestPrefixLength = 0;

  for (const provider of Object.values(PROVIDERS)) {
    for (const prefix of provider.modelPrefixes) {
      if (lowerModel.startsWith(prefix)) {
        if (prefix.length > longestPrefixLength) {
          longestPrefixLength = prefix.length;
          bestProvider = provider;
        }
      }
    }
  }
  return bestProvider;
}

/**
 * Get the upstream URL for a provider's chat completions endpoint.
 */
/**
 * Resolve the upstream model ID for a provider.
 * If the provider has a modelMapping, the user-facing model name is
 * translated to the real upstream model ID. Otherwise, returns as-is.
 */
export function resolveUpstreamModel(model: string, provider: ProviderConfig): string {
  if (provider.modelMapping) {
    const mapped = provider.modelMapping[model] || provider.modelMapping[model.toLowerCase()];
    if (mapped) return mapped;
  }
  return model;
}

export function getUpstreamUrl(provider: ProviderConfig): string {
  const customBase = provider.envBaseUrlField
    ? process.env[provider.envBaseUrlField]
    : undefined;
  const base = customBase || provider.baseUrl;

  if (provider.headerFormat === 'anthropic') {
    return `${base}/messages`;
  }
  return `${base}/chat/completions`;
}

/**
 * Resolves a model ID suitable for the fallback provider based on the original model ID.
 * Maps reasoning models to reasoning models, cheap models to cheap models, and standard models to standard models.
 */
export function resolveFallbackModel(originalModel: string, targetProviderName: string): string {
  const lowerModel = originalModel.toLowerCase();
  const targetProvider = PROVIDERS[targetProviderName];

  // 1. If the original model already starts with one of the target provider's prefixes,
  // we can use the original model directly.
  if (targetProvider) {
    for (const prefix of targetProvider.modelPrefixes) {
      if (lowerModel.startsWith(prefix)) {
        return originalModel;
      }
    }
  }

  // 2. Otherwise, map based on the target provider
  switch (targetProviderName) {
    case 'deepseek':
      // Map reasoning models to deepseek-reasoner, others to deepseek-chat
      if (
        lowerModel.startsWith('o1') ||
        lowerModel.startsWith('o3') ||
        lowerModel.includes('reasoner') ||
        lowerModel.includes('r1')
      ) {
        return 'deepseek-reasoner';
      }
      return 'deepseek-chat';

    case 'xiaomi_sgp_coding':
      // SGP has both mimo-v2.5-pro-sgp and mimo-v2.5-flash-sgp
      if (
        lowerModel.includes('mini') ||
        lowerModel.includes('haiku') ||
        lowerModel.includes('flash') ||
        lowerModel.includes('3.5-turbo')
      ) {
        return 'mimo-v2.5-flash-sgp';
      }
      return 'mimo-v2.5-pro-sgp';

    case 'xiaomi':
      return 'mimo-v2.5-pro';

    case 'xiaomi_coding':
      return 'mimo-v2.5-pro-coding';

    case 'xiaomi_tudo':
      return 'mimo-v2.5-pro';

    case 'openai':
      if (
        lowerModel.startsWith('o1') ||
        lowerModel.startsWith('o3') ||
        lowerModel.includes('reasoner')
      ) {
        return 'o3-mini';
      }
      if (
        lowerModel.includes('mini') ||
        lowerModel.includes('haiku') ||
        lowerModel.includes('flash') ||
        lowerModel.includes('3.5-turbo')
      ) {
        return 'gpt-4o-mini';
      }
      return 'gpt-4o';

    case 'anthropic':
      if (
        lowerModel.includes('mini') ||
        lowerModel.includes('haiku') ||
        lowerModel.includes('flash') ||
        lowerModel.includes('3.5-turbo')
      ) {
        return 'claude-3-5-haiku-20241022';
      }
      return 'claude-3-5-sonnet-20241022';

    case 'lpgpt':
      return 'gpt-5.3';

    default:
      // Fallback: use the first model ID in the provider's model list if available
      if (targetProvider && targetProvider.models && targetProvider.models.length > 0) {
        return targetProvider.models[0].id;
      }
      return originalModel;
  }
}

