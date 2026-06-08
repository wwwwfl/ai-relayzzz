'use client';

import type { DraftProviderPayload } from './components/provider-templates';

export interface ProviderImportPayload {
  id: string;
  baseUrl: string;
  apiKey: string;
  userAgent?: string | null;
}

export interface ProviderIdentity {
  id: string;
  isCustom?: boolean;
}

export const DEFAULT_NEWAPI_MODEL_PREFIXES = [
  'gpt-',
  'claude-',
  'gemini-',
  'deepseek-',
  'qwen-',
  'doubao-',
  'glm-',
  'yi-',
  'moonshot-',
  'mistral-',
  'llama-',
  'ernie-',
  'text-embedding-',
];

export const DEFAULT_NEWAPI_IMPORT_USER_AGENT = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36';

function decodeBase64Json(data: string): any {
  const normalized = data.replace(/-/g, '+').replace(/_/g, '/');
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=');

  if (typeof atob === 'function') {
    const binary = atob(padded);
    const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
    return JSON.parse(new TextDecoder().decode(bytes));
  }

  return JSON.parse(Buffer.from(padded, 'base64').toString('utf8'));
}

export function normalizeProviderId(id: string): string {
  const normalized = id
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '');

  return normalized || 'newapi';
}

export function deriveProviderIdFromBaseUrl(baseUrl: string): string {
  try {
    const url = new URL(baseUrl);
    const hostname = url.hostname.toLowerCase();
    const parts = hostname.split('.');
    const commonPrefixes = new Set(['api', 'relay', 'openkey', 'gateway', 'gw']);
    if (parts.length > 2 && commonPrefixes.has(parts[0])) {
      parts.shift();
    }
    return normalizeProviderId(parts.join('_'));
  } catch {
    return 'newapi';
  }
}

export function normalizeImportedBaseUrl(baseUrl: string): string {
  const trimmed = baseUrl.trim().replace(/\/+$/, '');
  try {
    const url = new URL(trimmed);
    if (!url.pathname || url.pathname === '/') {
      url.pathname = '/v1';
      return url.toString().replace(/\/+$/, '');
    }
  } catch {
    return trimmed;
  }
  return trimmed;
}

export function buildEnvKeyField(providerId: string): string {
  return `${providerId.toUpperCase()}_KEYS`;
}

export function formatProviderDisplayName(id: string): string {
  const words = id.trim().split(/[\s_-]+/).filter(Boolean);
  if (words.length === 0) return 'NewAPI';
  return words
    .map((word) => {
      if (/^api$/i.test(word)) return 'API';
      return word.charAt(0).toUpperCase() + word.slice(1);
    })
    .join(' ');
}

export function resolveImportedProviderId(rawId: string, providers: ProviderIdentity[]): string {
  const baseId = normalizeProviderId(rawId);
  const existing = providers.find((provider) => provider.id === baseId);
  if (!existing || existing.isCustom) return baseId;

  const existingIds = new Set(providers.map((provider) => provider.id));
  let index = 2;
  let candidate = `${baseId}_import`;
  while (existingIds.has(candidate)) {
    candidate = `${baseId}_import_${index}`;
    index += 1;
  }
  return candidate;
}

export function parseProviderImportLink(input: string): ProviderImportPayload {
  const value = input.trim();
  if (!value) {
    throw new Error('missing-import-link');
  }

  if (value.startsWith('{')) {
    let payload: any;
    try {
      payload = JSON.parse(value);
    } catch {
      throw new Error('invalid-import-data');
    }

    const id = typeof payload?.id === 'string' ? payload.id.trim() : '';
    const baseUrl = typeof payload?.url === 'string'
      ? payload.url.trim().replace(/\/+$/, '')
      : typeof payload?.baseUrl === 'string'
        ? payload.baseUrl.trim().replace(/\/+$/, '')
        : '';
    const apiKey = typeof payload?.key === 'string'
      ? payload.key.trim()
      : typeof payload?.apiKey === 'string'
        ? payload.apiKey.trim()
        : '';

    if (!baseUrl || !baseUrl.startsWith('https://')) throw new Error('invalid-base-url');
    if (!apiKey) throw new Error('missing-api-key');

    return {
      id: id || deriveProviderIdFromBaseUrl(baseUrl),
      baseUrl,
      apiKey,
    };
  }

  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error('invalid-import-link');
  }

  if (url.protocol !== 'cherrystudio:' || url.hostname !== 'providers' || url.pathname !== '/api-keys') {
    throw new Error('unsupported-import-link');
  }

  const encodedData = url.searchParams.get('data');
  if (!encodedData) {
    throw new Error('missing-import-data');
  }

  let payload: any;
  try {
    payload = decodeBase64Json(encodedData);
  } catch {
    throw new Error('invalid-import-data');
  }

  const id = typeof payload?.id === 'string' ? payload.id.trim() : '';
  const baseUrl = typeof payload?.baseUrl === 'string' ? payload.baseUrl.trim().replace(/\/+$/, '') : '';
  const apiKey = typeof payload?.apiKey === 'string' ? payload.apiKey.trim() : '';

  if (!id) throw new Error('missing-provider-id');
  if (!baseUrl || !baseUrl.startsWith('https://')) throw new Error('invalid-base-url');
  if (!apiKey) throw new Error('missing-api-key');

  return { id, baseUrl, apiKey };
}

export function deriveModelPrefixesFromModels(models: Array<{ id?: string }>): string[] {
  const seen = new Set<string>();
  const prefixes: string[] = [];

  for (const model of models) {
    const id = typeof model.id === 'string' ? model.id.trim().toLowerCase() : '';
    if (!id || seen.has(id)) continue;
    seen.add(id);
    prefixes.push(id);
  }

  return prefixes;
}

export function buildImportedProviderConfig(input: {
  payload: ProviderImportPayload;
  providers: ProviderIdentity[];
  models?: DraftProviderPayload['models'];
}): DraftProviderPayload {
  const baseUrl = normalizeImportedBaseUrl(input.payload.baseUrl);
  const derivedId = deriveProviderIdFromBaseUrl(baseUrl);
  const name = resolveImportedProviderId(derivedId, input.providers);
  const modelPrefixes = deriveModelPrefixesFromModels(input.models || []);

  return {
    name,
    displayName: formatProviderDisplayName(derivedId),
    baseUrl,
    headerFormat: 'openai',
    modelPrefixes: modelPrefixes.length > 0 ? modelPrefixes : DEFAULT_NEWAPI_MODEL_PREFIXES,
    envKeyField: buildEnvKeyField(name),
    userAgent: input.payload.userAgent === null ? undefined : (input.payload.userAgent || DEFAULT_NEWAPI_IMPORT_USER_AGENT),
    models: input.models || [],
  };
}
