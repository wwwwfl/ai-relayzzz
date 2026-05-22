'use client';

import { useState, useEffect } from 'react';
import LogoIcon from './components/LogoIcon';
import OverviewTab from './components/OverviewTab';
import KeysTab from './components/KeysTab';
import ToolsTab from './components/ToolsTab';

interface ProviderInfo {
  name: string;
  id: string;
  keyCount: number;
  availableKeys: number;
  configured: boolean;
  modelPrefixes: string[];
  models?: Array<{ id: string; displayName: string }>;
  errors?: Record<string, number>;
  keyErrors?: Array<{
    keyHash: string;
    errors: Record<string, { count: number; reason: string }>;
  }>;
}

interface AdminData {
  status: string;
  timestamp: string;
  providers: ProviderInfo[];
  usage: {
    requests: number;
    tokens: number;
    promptTokens: number;
    completionTokens: number;
    providers: Record<string, { requests: number; tokens: number; promptTokens: number; completionTokens: number }>;
  };
  quota: {
    daily: { used: number; limit: number | string };
    monthly: { used: number; limit: number | string };
    allowed: boolean;
    isOverride: boolean;
  };
  config: {
    dailyLimit: number | null;
    monthlyLimit: number | null;
    customDailyLimit?: number | null;
    customMonthlyLimit?: number | null;
  };
}

const TRANSLATIONS = {
  zh: {
    // Login
    adminLogin: '🔐 后台登录',
    enterAdminKey: '请输入管理员密钥 (RELAY_ADMIN_KEY)',
    login: '登录',
    invalidKey: '无效的 API 密钥',
    failedFetch: '获取后台数据失败',

    // Header & Global
    title: 'AI Relay 后台管理',
    refresh: '刷新',
    refreshing: '正在刷新...',
    autoRefreshInfo: '每15秒自动刷新 · 数据截至',
    navHome: '首页',

    // Tab names
    tabOverview: '📊 运行概览',
    tabKeys: '🔑 密钥管理',
    tabTools: '🛡️ 辅助工具',

    // Quota Status
    quotaStatus: '📊 限额状态',
    dailyRequests: '今日已用请求次数',
    monthlyRequests: '当月已用请求次数',
    withinLimits: '✅ 正常运行中',
    rateLimited: '🚫 已触发限额限流',
    quotaConfigureBtn: '⚙️ 配置限额',
    quotaConfigureTitle: '⚙️ 配置全局请求限额',
    dailyLimitLabel: '日请求上限 (0 为无限制):',
    monthlyLimitLabel: '月请求上限 (0 为无限制):',
    btnSaveQuota: '保存限额',
    btnResetQuota: '重置为默认',
    kvQuotaWarningManaged: '⚠️ KV 限额已激活：自定义全局限额已在 KV 中启用，覆盖了环境变量配置。',
    kvQuotaWarningEnv: '💡 当前正在使用本地环境变量中定义的限额。在下方设置将存入 KV 并覆盖默认配置。',
    msgQuotaSaved: '全局限额配置保存成功',
    msgQuotaReset: '全局限额配置已成功重置为默认值',
    confirmResetQuota: '您确定要重置限额配置为环境变量默认值吗？',
    alertSaveQuotaFailed: '保存限额配置失败',
    alertResetQuotaFailed: '重置限额配置失败',

    // Today's Usage
    todaysUsage: '📈 今日消耗概览',
    requests: '请求次数',
    totalTokens: '总 Token',
    promptTokens: '输入 Token',
    completionTokens: '输出 Token',
    byProvider: '按服务商细分',
    providerCol: '服务商',
    requestsCol: '请求数',
    promptCol: '输入 Token',
    completionCol: '输出 Token',
    totalCol: '总计 Token',

    // API Errors
    apiErrorsTitle: '🚨 接口异常详情 (今日)',
    times: '次',

    // Temporary Request Key Generator
    tempKeyTitle: '🔑 生成临时 API 请求密钥',
    tempKeyDesc: '允许生成带有过期时间的、临时的 API 请求 Key。此 Key 可用于直接调用 chat/completions 等中转接口，但不支持登录此后台管理系统。',
    tempDurationLabel: '有效期：',
    duration1h: '1 小时',
    duration1d: '1 天',
    duration7d: '7 天',
    duration30d: '30 天',
    generateBtn: '生成临时密钥',
    copy: '复制',
    copied: '已复制！',
    generatedKeyLabel: '生成的临时密钥（点击可选择）：',
    expiresAtLabel: '过期时间：',
    tempKeyNotice: '⚠️ 注意：该临时 Key 使用 HMAC 签名进行无状态校验，一旦生成便无法在后台撤销或编辑，过期后会自动失效。请妥善保管。',

    // Model testing tool
    testToolTitle: '🧪 模型与密钥可用性测试',
    testToolDesc: '直接选择当前配置有 API Key 的模型，使用系统密钥池或输入自定义 API Key 发送 ping 请求，验证该模型在 Relay 后端及上游服务商的实际可用性。',
    testModelLabel: '测试模型：',
    useCustomKeyLabel: '使用自定义 API Key 进行测试',
    customKeyPlaceholder: '请输入待测试的自定义 API Key (例如 sk-...)',
    btnRunTest: '开始测试',
    btnTesting: '测试中...',
    testResultSuccess: '✅ 测试成功！此密钥/密钥池可以正常调用该模型。',
    testResultFailed: '❌ 测试失败！',
    testResultFailedDetails: '状态码: {status}，错误信息: {error}',
    noConfiguredModels: '当前系统没有可用模型，请先确认服务商配置。',
    testKeySelectLabel: '选择测试密钥：',
    btnAddTestedKey: '➕ 将此 Key 添加到密钥池',
    btnAddTestedKeyShort: '➕ 添加入库',
    msgKeyAddedFromTest: 'API 密钥已成功添加到该服务商的密钥池',
    testToolNoKeysWarning: '⚠️ 此服务商当前未配置任何内置密钥。请勾选“使用自定义 API Key”或去“密钥管理”添加密钥以进行测试。',
    btnDeleteFailedKey: '🗑️ 从密钥池删除此失效密钥',
    btnDeleteFailedKeyShort: '🗑️ 一键删除',
    msgKeyDeletedFromTest: '失效的 API 密钥已成功从密钥池中删除',
    alertDeleteFromTestFailed: '删除 API 密钥失败',
    confirmDeleteFailedKey: '您确定要从密钥池中删除此测试失败的密钥吗？',

    // Provider Key Pools
    providerKeyPools: '🔑 服务商密钥池',
    providerKeyPoolsDesc: '在下方列表中选择一个服务商以管理其 API 密钥和故障转移（回退）链配置。',
    tblProvider: '服务商',
    tblStatus: '配置状态',
    tblKeys: '密钥数',
    tblAvailable: '可用密钥',
    tblModelPrefixes: '支持模型前缀',
    statusOk: '配置正常',
    statusNoKeys: '无可用密钥',

    // Provider Config Editor
    configureTitle: '⚙️ 配置 {name}',
    providerIdLabel: '服务商 ID:',
    btnClose: '关闭',
    loadingConfig: '正在加载配置...',
    apiKeyPoolTitle: '🔑 API 密钥池',
    kvWarningManaged: '⚠️ KV 密钥池已激活：此处的密钥将覆盖本地环境变量 (.env.local) 中该服务商的密钥。',
    kvWarningEnv: '💡 当前正在使用本地环境变量 (.env.local) 中定义的密钥。在下方添加密钥将存入 KV 并覆盖环境变量密钥池。',
    addKeyPlaceholder: '请输入原始 API 密钥',
    btnAddKey: '添加',
    keyHashLabel: '哈希:',
    keySourceEnv: '环境变量',
    keySourceKv: 'KV 存储',
    btnDeleteKey: '删除',
    deleteEnvKeyTitle: '删除此密钥（删除后其他环境变量密钥将自动转存为 KV 托管）',
    deleteKvKeyTitle: '删除此密钥',
    noKeysConfigured: '未配置任何 API 密钥，对此服务商的请求将失败。',
    confirmDeleteKey: '您确定要删除此 API 密钥吗？',
    btnTestKey: '🧪 测试',
    btnTestingKey: '测试中...',
    btnTestSuccess: '验证成功',
    btnTestFailed: '验证失败',

    // Fallback Chain
    fallbackChainTitle: '🔗 故障转移（回退）链',
    kvFallbackActive: '🟢 KV 回退链已激活：自定义优先级链已存储在 KV 中。',
    kvFallbackStatic: '⚪ 正在使用静态默认值：在系统配置文件中定义。',
    modelSelectorAuto: '自动 (Auto)',
    noFallbacksConfigured: '未配置回退链，发生错误时将直接报错。',
    btnAddFallback: '+ 添加',
    noOtherProviders: '没有其他可添加的服务商。',
    btnResetFallbacks: '重置为默认',
    confirmResetFallbacks: '您确定要将回退链重置为系统静态默认值吗？',
    btnSaveFallbacks: '保存回退链',
    msgKeyAdded: 'API 密钥添加成功',
    msgKeyDeleted: 'API 密钥删除成功',
    msgFallbackSaved: '回退链保存成功',
    msgFallbackReset: '回退链已成功重置为默认值',
    msgLoadConfigFailed: '加载配置失败',

    // Additional interactive texts
    alertTestSuccess: '✅ 验证成功：API Key 有效！',
    alertTestFailed: '❌ 验证失败：API Key 无效',
    alertTestError: '测试失败',
    alertDeleteFailed: '删除密钥失败',
    alertAddFailed: '添加密钥失败',
    alertSaveFallbackFailed: '保存回退链失败',
    alertResetFallbackFailed: '重置回退链失败',
    alertVerificationRequestFailed: '验证请求失败',
    deployTime: '最近部署时间'
  },
  en: {
    // Login
    adminLogin: '🔐 Admin Login',
    enterAdminKey: 'Enter Admin Key (RELAY_ADMIN_KEY)',
    login: 'Login',
    invalidKey: 'Invalid API key',
    failedFetch: 'Failed to fetch admin data',

    // Header & Global
    title: 'AI Relay Admin',
    refresh: 'Refresh',
    refreshing: 'Refreshing...',
    autoRefreshInfo: 'Auto-refreshes every 15s · Data as of',
    navHome: 'Home',

    // Tab names
    tabOverview: '📊 Overview',
    tabKeys: '🔑 Keys',
    tabTools: '🛡️ Tools',

    // Quota Status
    quotaStatus: '📊 Quota Status',
    dailyRequests: 'Daily Requests',
    monthlyRequests: 'Monthly Requests',
    withinLimits: '✅ Within limits',
    rateLimited: '🚫 Rate limited',
    quotaConfigureBtn: '⚙️ Configure Limits',
    quotaConfigureTitle: '⚙️ Configure Global Quota Limits',
    dailyLimitLabel: 'Daily Limit (0 for unlimited):',
    monthlyLimitLabel: 'Monthly Limit (0 for unlimited):',
    btnSaveQuota: 'Save Limits',
    btnResetQuota: 'Reset to Default',
    kvQuotaWarningManaged: '⚠️ KV quota active: Custom limits are stored in KV and override environment variables.',
    kvQuotaWarningEnv: '💡 Currently using quota limits defined in environment variables. Setting limits below will save them in KV.',
    msgQuotaSaved: 'Global quota limits saved successfully',
    msgQuotaReset: 'Global quota limits reset to defaults successfully',
    confirmResetQuota: 'Are you sure you want to reset quota limits to environment variable defaults?',
    alertSaveQuotaFailed: 'Failed to save quota limits',
    alertResetQuotaFailed: 'Failed to reset quota limits',

    // Today's Usage
    todaysUsage: "📈 Today's Usage",
    requests: 'Requests',
    totalTokens: 'Total Tokens',
    promptTokens: 'Prompt Tokens',
    completionTokens: 'Completion Tokens',
    byProvider: 'By Provider',
    providerCol: 'Provider',
    requestsCol: 'Requests',
    promptCol: 'Prompt',
    completionCol: 'Completion',
    totalCol: 'Total',

    // API Errors
    apiErrorsTitle: '🚨 API Errors (Today)',
    times: 'times',

    // Temporary Request Key Generator
    tempKeyTitle: '🔑 Generate Temporary API Key',
    tempKeyDesc: 'Generate a temporary API key with an expiration date. This key can be used to request relay APIs (e.g. chat/completions) but cannot be used to log in to the admin panel.',
    tempDurationLabel: 'Duration:',
    duration1h: '1 Hour',
    duration1d: '1 Day',
    duration7d: '7 Days',
    duration30d: '30 Days',
    generateBtn: 'Generate Key',
    copy: 'Copy',
    copied: 'Copied!',
    generatedKeyLabel: 'Generated Key (Click to Copy):',
    expiresAtLabel: 'Expires At:',
    tempKeyNotice: '⚠️ Note: This temporary key is validated statelessly using HMAC. Once generated, it cannot be revoked or modified in this panel and will expire automatically.',

    // Model testing tool
    testToolTitle: '🧪 Model & Key Connectivity Test',
    testToolDesc: 'Directly select models with configured API keys, and send a ping request using either the system key pool or a custom API key, verifying the actual availability of the model on the Relay backend and upstream providers.',
    testModelLabel: 'Test Model:',
    useCustomKeyLabel: 'Use custom API key for testing',
    customKeyPlaceholder: 'Enter custom API key to test (e.g. sk-...)',
    btnRunTest: 'Run Test',
    btnTesting: 'Testing...',
    testResultSuccess: '✅ Test successful! The key/key pool can successfully call this model.',
    testResultFailed: '❌ Test failed!',
    testResultFailedDetails: 'Status: {status}, Error: {error}',
    noConfiguredModels: 'No models available. Please configure providers first.',
    testKeySelectLabel: 'Select Test Key:',
    btnAddTestedKey: '➕ Add this Key to Pool',
    btnAddTestedKeyShort: '➕ Add Key',
    msgKeyAddedFromTest: 'API Key successfully added to the provider\'s pool',
    testToolNoKeysWarning: '⚠️ This provider has no keys. Please check "Use custom API key" or add keys in "Keys" tab first.',
    btnDeleteFailedKey: '🗑️ Remove this failed Key from Pool',
    btnDeleteFailedKeyShort: '🗑️ Delete Key',
    msgKeyDeletedFromTest: 'The failed API Key has been successfully removed from the pool',
    alertDeleteFromTestFailed: 'Failed to remove API Key',
    confirmDeleteFailedKey: 'Are you sure you want to remove this failed API Key from the pool?',

    // Provider Key Pools
    providerKeyPools: '🔑 Provider Key Pools',
    providerKeyPoolsDesc: 'Select a provider from the list below to manage its API keys and fallback configuration.',
    tblProvider: 'Provider',
    tblStatus: 'Status',
    tblKeys: 'Keys',
    tblAvailable: 'Available',
    tblModelPrefixes: 'Model Prefixes',
    statusOk: 'OK',
    statusNoKeys: 'NO KEYS',

    // Provider Config Editor
    configureTitle: '⚙️ Configure {name}',
    providerIdLabel: 'Provider ID:',
    btnClose: 'Close',
    loadingConfig: 'Loading configuration...',
    apiKeyPoolTitle: '🔑 API Key Pool',
    kvWarningManaged: '⚠️ KV key pool active: These keys override local environment variables (.env.local) for this provider.',
    kvWarningEnv: '💡 Currently using keys defined in local environment variables (.env.local). Adding a key below will store it in KV and override the environment variable pool.',
    addKeyPlaceholder: 'Enter raw API key',
    btnAddKey: 'Add',
    keyHashLabel: 'Hash:',
    keySourceEnv: 'env',
    keySourceKv: 'kv',
    btnDeleteKey: 'Delete',
    deleteEnvKeyTitle: 'Remove key (remaining environment keys will be migrated to KV)',
    deleteKvKeyTitle: 'Remove key',
    noKeysConfigured: 'No API keys configured. Requests will fail.',
    confirmDeleteKey: 'Are you sure you want to delete this API Key?',
    btnTestKey: '🧪 Test',
    btnTestingKey: 'Testing...',
    btnTestSuccess: 'Success',
    btnTestFailed: 'Failed',

    // Fallback Chain
    fallbackChainTitle: '🔗 Fallback Chain',
    kvFallbackActive: '🟢 KV fallback chain active: Custom priority chain is stored in KV.',
    kvFallbackStatic: '⚪ Using static defaults: Defined in system config files.',
    modelSelectorAuto: 'Auto',
    noFallbacksConfigured: 'No fallbacks. Fails immediately on error.',
    btnAddFallback: '+ Add',
    noOtherProviders: 'No other providers available to add.',
    btnResetFallbacks: 'Reset to Default',
    confirmResetFallbacks: 'Are you sure you want to reset fallbacks to static defaults?',
    btnSaveFallbacks: 'Save Chain',
    msgKeyAdded: 'API Key added successfully',
    msgKeyDeleted: 'API Key removed successfully',
    msgFallbackSaved: 'Fallback chain saved successfully',
    msgFallbackReset: 'Fallback chain reset to default successfully',
    msgLoadConfigFailed: 'Failed to load configuration',

    // Additional interactive texts
    alertTestSuccess: '✅ Verification success: API Key is valid!',
    alertTestFailed: '❌ Verification failed: API Key is invalid',
    alertTestError: 'Failed to test key',
    alertDeleteFailed: 'Failed to delete key',
    alertAddFailed: 'Failed to add key',
    alertSaveFallbackFailed: 'Failed to save fallback chain',
    alertResetFallbackFailed: 'Failed to reset fallbacks',
    alertVerificationRequestFailed: 'Verification request failed',
    deployTime: 'Last Deployed'
  }
};

export default function AdminPage() {
  const [data, setData] = useState<AdminData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [apiKey, setApiKey] = useState('');
  const [authenticated, setAuthenticated] = useState(false);
  const [loading, setLoading] = useState(false);
  const [lang, setLang] = useState<'zh' | 'en'>('zh');
  const [activeTab, setActiveTab] = useState<'overview' | 'keys' | 'tools'>('overview');

  // Configuration management states
  const [selectedProvider, setSelectedProvider] = useState<string | null>(null);
  const [providerKeys, setProviderKeys] = useState<Array<{ hash: string; masked: string; source: string }> | null>(null);
  const [providerFallbacks, setProviderFallbacks] = useState<{ current: string[]; staticDefault: string | null; staticDefaults: string[]; isOverride: boolean; availableModels: Record<string, { id: string; displayName: string }[]> } | null>(null);
  const [newKeyInput, setNewKeyInput] = useState('');
  const [operationLoading, setOperationLoading] = useState(false);
  const [configMessage, setConfigMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);
  const [testingHash, setTestingHash] = useState<string | null>(null);
  const [testingInput, setTestingInput] = useState<boolean>(false);
  const [activeFallbacks, setActiveFallbacks] = useState<string[]>([]);
  const [selectedFallbackToAdd, setSelectedFallbackToAdd] = useState('');

  const t = TRANSLATIONS[lang];

  // Load language settings on mount
  useEffect(() => {
    const cachedLang = localStorage.getItem('airelay_lang');
    if (cachedLang === 'zh' || cachedLang === 'en') {
      setLang(cachedLang);
    } else {
      const userLang = navigator.language.toLowerCase();
      const preferred = userLang.startsWith('zh') ? 'zh' : 'en';
      setLang(preferred);
    }
  }, []);

  const handleSetLang = (newLang: 'zh' | 'en') => {
    setLang(newLang);
    localStorage.setItem('airelay_lang', newLang);
  };

  // Automatically select a default value for the fallback-to-add dropdown when options change
  useEffect(() => {
    const usedProviders = activeFallbacks.map(fb => {
      const colonIdx = fb.indexOf(':');
      return colonIdx >= 0 ? fb.slice(0, colonIdx) : fb;
    });
    if (selectedProvider && data) {
      const available = data.providers.filter(p => p.id !== selectedProvider && !usedProviders.includes(p.id));
      if (available.length > 0 && !available.some(p => p.id === selectedFallbackToAdd)) {
        setSelectedFallbackToAdd(available[0].id);
      }
    } else {
      setSelectedFallbackToAdd('');
    }
  }, [selectedProvider, activeFallbacks, data, selectedFallbackToAdd]);

  // Restore cached API key from localStorage on mount
  useEffect(() => {
    const cached = localStorage.getItem('airelay_admin_key');
    if (cached) {
      setApiKey(cached);
      setLoading(true);
      fetch('/api/admin', {
        headers: { Authorization: `Bearer ${cached}` },
      })
        .then((res) => {
          if (res.status === 401) {
            localStorage.removeItem('airelay_admin_key');
            return;
          }
          return res.json();
        })
        .then((json) => {
          if (json) {
            setData(json);
            setAuthenticated(true);
          }
        })
        .catch(() => {
          localStorage.removeItem('airelay_admin_key');
        })
        .finally(() => setLoading(false));
    }
  }, []);

  const fetchData = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/admin', {
        headers: { Authorization: `Bearer ${apiKey}` },
      });
      if (res.status === 401) {
        setError('unauthorized');
        setAuthenticated(false);
        return;
      }
      const json = await res.json();
      setData(json);
      setAuthenticated(true);
      localStorage.setItem('airelay_admin_key', apiKey);
    } catch (e) {
      setError('failed_fetch');
    } finally {
      setLoading(false);
    }
  };

  const fetchProviderConfig = async (providerId: string) => {
    setOperationLoading(true);
    setConfigMessage(null);
    try {
      const [keysRes, fallbacksRes] = await Promise.all([
        fetch(`/api/admin/providers/${providerId}/keys`, {
          headers: { Authorization: `Bearer ${apiKey}` },
        }),
        fetch(`/api/admin/providers/${providerId}/fallbacks`, {
          headers: { Authorization: `Bearer ${apiKey}` },
        }),
      ]);

      if (!keysRes.ok || !fallbacksRes.ok) {
        throw new Error('Failed to fetch provider configuration');
      }

      const keysData = await keysRes.json();
      const fallbacksData = await fallbacksRes.json();

      setProviderKeys(keysData.keys);
      setProviderFallbacks({
        current: fallbacksData.fallbacks,
        staticDefault: fallbacksData.staticDefault,
        staticDefaults: fallbacksData.staticDefaults || [],
        isOverride: fallbacksData.isOverride,
        availableModels: fallbacksData.availableModels || {},
      });
      setActiveFallbacks(fallbacksData.fallbacks || []);
    } catch (e) {
      setConfigMessage({ text: e instanceof Error ? e.message : t.msgLoadConfigFailed, type: 'error' });
    } finally {
      setOperationLoading(false);
    }
  };

  useEffect(() => {
    if (selectedProvider && authenticated) {
      fetchProviderConfig(selectedProvider);
    } else {
      setProviderKeys(null);
      setProviderFallbacks(null);
    }
  }, [selectedProvider, authenticated]);

  const handleAddKey = async () => {
    if (!selectedProvider || !newKeyInput.trim()) return;
    setOperationLoading(true);
    setConfigMessage(null);
    try {
      const res = await fetch(`/api/admin/providers/${selectedProvider}/keys`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({ key: newKeyInput.trim() }),
      });
      const resData = await res.json();
      if (!res.ok) {
        throw new Error(resData.error?.message || 'Failed to add key');
      }
      setNewKeyInput('');
      setConfigMessage({ text: t.msgKeyAdded, type: 'success' });
      await fetchProviderConfig(selectedProvider);
      await fetchData(); // refresh global key counts
    } catch (e) {
      setConfigMessage({ text: e instanceof Error ? e.message : t.alertAddFailed, type: 'error' });
    } finally {
      setOperationLoading(false);
    }
  };

  const handleDeleteKeyGeneral = async (providerId: string, hash: string) => {
    const confirmMsg = t.confirmDeleteKey;
    if (!confirm(confirmMsg)) return;
    setOperationLoading(true);
    setConfigMessage(null);
    try {
      const res = await fetch(`/api/admin/providers/${providerId}/keys`, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({ hash }),
      });
      const resData = await res.json();
      if (!res.ok) {
        throw new Error(resData.error?.message || 'Failed to delete key');
      }

      if (selectedProvider === providerId) {
        await fetchProviderConfig(providerId);
      }

      await fetchData();
      setConfigMessage({ text: t.msgKeyDeleted, type: 'success' });
    } catch (e) {
      const errMsg = e instanceof Error ? e.message : t.alertDeleteFailed;
      setConfigMessage({ text: errMsg, type: 'error' });
      alert(errMsg);
    } finally {
      setOperationLoading(false);
    }
  };

  const handleTestKeyGeneral = async (providerId: string, hash: string) => {
    setTestingHash(hash);
    try {
      const res = await fetch(`/api/admin/providers/${providerId}/keys/test`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({ hash }),
      });
      const resData = await res.json();
      if (!res.ok) {
        throw new Error(resData.error?.message || t.alertVerificationRequestFailed);
      }
      if (resData.valid) {
        alert(t.alertTestSuccess);
      } else {
        const details = resData.error ? `: ${resData.error}` : '';
        alert(`${t.alertTestFailed}${details} (Status: ${resData.status || 'unknown'})`);
      }
    } catch (e) {
      alert(e instanceof Error ? e.message : t.alertTestError);
    } finally {
      setTestingHash(null);
    }
  };

  const handleTestInputKey = async () => {
    if (!selectedProvider || !newKeyInput.trim()) return;
    setTestingInput(true);
    try {
      const res = await fetch(`/api/admin/providers/${selectedProvider}/keys/test`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({ key: newKeyInput.trim() }),
      });
      const resData = await res.json();
      if (!res.ok) {
        throw new Error(resData.error?.message || t.alertVerificationRequestFailed);
      }
      if (resData.valid) {
        alert(t.alertTestSuccess);
      } else {
        const details = resData.error ? `: ${resData.error}` : '';
        alert(`${t.alertTestFailed}${details} (Status: ${resData.status || 'unknown'})`);
      }
    } catch (e) {
      alert(e instanceof Error ? e.message : t.alertTestError);
    } finally {
      setTestingInput(false);
    }
  };

  const handleSaveFallbacks = async (newChain: string[]) => {
    if (!selectedProvider) return;
    setOperationLoading(true);
    setConfigMessage(null);
    try {
      const res = await fetch(`/api/admin/providers/${selectedProvider}/fallbacks`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({ fallbacks: newChain }),
      });
      const resData = await res.json();
      if (!res.ok) {
        throw new Error(resData.error?.message || 'Failed to save fallback chain');
      }
      setConfigMessage({ text: t.msgFallbackSaved, type: 'success' });
      await fetchProviderConfig(selectedProvider);
    } catch (e) {
      setConfigMessage({ text: e instanceof Error ? e.message : t.alertSaveFallbackFailed, type: 'error' });
    } finally {
      setOperationLoading(false);
    }
  };

  const handleResetFallbacks = async () => {
    if (!selectedProvider) return;
    const confirmMsg = t.confirmResetFallbacks;
    if (!confirm(confirmMsg)) return;
    setOperationLoading(true);
    setConfigMessage(null);
    try {
      const res = await fetch(`/api/admin/providers/${selectedProvider}/fallbacks`, {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${apiKey}`,
        },
      });
      const resData = await res.json();
      if (!res.ok) {
        throw new Error(resData.error?.message || 'Failed to reset fallbacks');
      }
      setConfigMessage({ text: t.msgFallbackReset, type: 'success' });
      await fetchProviderConfig(selectedProvider);
    } catch (e) {
      setConfigMessage({ text: e instanceof Error ? e.message : t.alertResetFallbackFailed, type: 'error' });
    } finally {
      setOperationLoading(false);
    }
  };

  const handleSaveQuota = async (dailyLimit: number | null, monthlyLimit: number | null) => {
    setOperationLoading(true);
    try {
      const res = await fetch('/api/admin/quota', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({ dailyLimit, monthlyLimit }),
      });
      const resData = await res.json();
      if (!res.ok) {
        throw new Error(resData.error?.message || 'Failed to save quota limits');
      }
      alert(t.msgQuotaSaved);
      await fetchData(); // refresh global data
    } catch (e) {
      alert(e instanceof Error ? e.message : t.alertSaveQuotaFailed);
    } finally {
      setOperationLoading(false);
    }
  };

  const handleResetQuota = async () => {
    if (!confirm(t.confirmResetQuota)) return;
    setOperationLoading(true);
    try {
      const res = await fetch('/api/admin/quota', {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${apiKey}`,
        },
      });
      const resData = await res.json();
      if (!res.ok) {
        throw new Error(resData.error?.message || 'Failed to reset quota limits');
      }
      alert(t.msgQuotaReset);
      await fetchData(); // refresh global data
    } catch (e) {
      alert(e instanceof Error ? e.message : t.alertResetQuotaFailed);
    } finally {
      setOperationLoading(false);
    }
  };

  useEffect(() => {
    if (authenticated) {
      const interval = setInterval(fetchData, 15000);
      return () => clearInterval(interval);
    }
  }, [authenticated, apiKey]);

  if (!authenticated) {
    return (
      <main style={{
        display: 'flex', flexDirection: 'column', alignItems: 'center',
        justifyContent: 'center', minHeight: '100vh', padding: '2rem',
        position: 'relative',
        boxSizing: 'border-box'
      }}>
        <style dangerouslySetInnerHTML={{ __html: `
          body {
            background: radial-gradient(circle at top, #1e293b, #09090b);
            background-attachment: fixed;
            color: #e5e7eb;
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
            margin: 0;
          }
          .glass-panel {
            background: rgba(30, 41, 59, 0.45);
            backdrop-filter: blur(12px);
            -webkit-backdrop-filter: blur(12px);
            border: 1px solid rgba(255, 255, 255, 0.08);
            border-radius: 16px;
            padding: 2rem;
            box-shadow: 0 4px 30px rgba(0, 0, 0, 0.4);
          }
        `}} />
        
        {/* Language switch on login screen */}
        <div style={{ position: 'absolute', top: '1.5rem', right: '1.5rem' }}>
          <button
            onClick={() => handleSetLang(lang === 'zh' ? 'en' : 'zh')}
            style={{
              padding: '0.4rem 0.8rem', borderRadius: '6px', border: '1px solid rgba(255, 255, 255, 0.08)',
              backgroundColor: 'rgba(255, 255, 255, 0.04)', color: '#ccc', cursor: 'pointer', fontSize: '0.85rem',
              transition: 'all 0.2s'
            }}
            onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.08)'; e.currentTarget.style.color = '#fff'; }}
            onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.04)'; e.currentTarget.style.color = '#ccc'; }}
          >
            {lang === 'zh' ? 'English' : '中文'}
          </button>
        </div>

        <div className="glass-panel" style={{ maxWidth: '400px', width: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1.5rem', boxShadow: '0 10px 40px rgba(0,0,0,0.5)' }}>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.75rem' }}>
            <LogoIcon size={48} />
            <h1 style={{ fontSize: '1.75rem', margin: 0, fontWeight: 700, color: '#fff' }}>{t.adminLogin}</h1>
          </div>
          <div style={{
            display: 'flex', flexDirection: 'column', gap: '0.75rem', width: '100%',
          }}>
            <input
              type="password"
              placeholder={t.enterAdminKey}
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && fetchData()}
              style={{
                width: '100%', padding: '0.75rem 1rem', borderRadius: '8px',
                border: '1px solid rgba(255, 255, 255, 0.08)', backgroundColor: 'rgba(0, 0, 0, 0.25)', color: '#e5e7eb',
                fontSize: '1rem', outline: 'none', transition: 'border-color 0.2s', boxSizing: 'border-box'
              }}
              onFocus={(e) => e.target.style.borderColor = 'rgba(59, 130, 246, 0.5)'}
              onBlur={(e) => e.target.style.borderColor = 'rgba(255, 255, 255, 0.08)'}
            />
            <button
              onClick={fetchData}
              disabled={loading || !apiKey}
              style={{
                width: '100%', padding: '0.75rem 1.5rem', borderRadius: '8px', border: 'none',
                backgroundColor: '#2563eb', color: 'white', fontSize: '1rem', fontWeight: 'bold',
                cursor: loading ? 'wait' : 'pointer', opacity: loading ? 0.6 : 1, transition: 'all 0.2s'
              }}
              onMouseEnter={(e) => { if (!e.currentTarget.disabled) e.currentTarget.style.backgroundColor = '#1d4ed8'; }}
              onMouseLeave={(e) => { if (!e.currentTarget.disabled) e.currentTarget.style.backgroundColor = '#2563eb'; }}
            >
              {loading ? '...' : t.login}
            </button>
          </div>
          {error && (
            <p style={{ color: '#f87171', margin: 0, fontSize: '0.9rem', fontWeight: 500 }}>
              {error === 'unauthorized' ? t.invalidKey : (error === 'failed_fetch' ? t.failedFetch : error)}
            </p>
          )}
        </div>
      </main>
    );
  }

  return (
    <main style={{
      maxWidth: '1000px', margin: '0 auto', padding: '2rem',
    }}>
      <style dangerouslySetInnerHTML={{ __html: `
        body {
          background: radial-gradient(circle at top, #1e293b, #09090b);
          background-attachment: fixed;
          color: #e5e7eb;
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
          margin: 0;
        }
        .glass-panel {
          background: rgba(30, 41, 59, 0.45);
          backdrop-filter: blur(12px);
          -webkit-backdrop-filter: blur(12px);
          border: 1px solid rgba(255, 255, 255, 0.08);
          border-radius: 16px;
          padding: 1.5rem;
          box-shadow: 0 4px 30px rgba(0, 0, 0, 0.4);
        }
        .stat-card {
          background: rgba(255, 255, 255, 0.02);
          border: 1px solid rgba(255, 255, 255, 0.04);
          border-radius: 12px;
          padding: 1rem 1.25rem;
          box-shadow: inset 0 2px 4px rgba(255, 255, 255, 0.02);
        }
        .tab-btn {
          padding: 0.6rem 1.2rem;
          border-radius: 8px;
          border: 1px solid rgba(255, 255, 255, 0.06);
          background-color: rgba(255, 255, 255, 0.02);
          color: #9ca3af;
          cursor: pointer;
          font-size: 0.9rem;
          font-weight: 500;
          transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
          display: flex;
          align-items: center;
          gap: 0.5rem;
        }
        .tab-btn:hover {
          background-color: rgba(255, 255, 255, 0.06);
          color: #fff;
          border-color: rgba(255, 255, 255, 0.12);
        }
        .tab-btn.active {
          background: linear-gradient(135deg, rgba(59, 130, 246, 0.15), rgba(139, 92, 246, 0.15));
          border-color: rgba(59, 130, 246, 0.4);
          color: #60a5fa;
          box-shadow: 0 0 10px rgba(59, 130, 246, 0.15);
        }
        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
        .spin {
          animation: spin 1s linear infinite;
          display: inline-block;
        }
        .content-area {
          /* Page content container */
        }
      `}} />

      {/* Header */}
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        marginBottom: '2rem', flexWrap: 'wrap', gap: '1rem'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <LogoIcon size={38} />
          <div>
            <h1 style={{ fontSize: '1.8rem', margin: 0, fontWeight: 700, color: '#fff' }}>{t.title}</h1>
            {process.env.NEXT_PUBLIC_DEPLOY_TIME && (
              <span style={{ fontSize: '0.72rem', color: '#9ca3af', display: 'block', marginTop: '0.15rem' }}>
                {t.deployTime}: {new Date(process.env.NEXT_PUBLIC_DEPLOY_TIME).toLocaleString(lang === 'zh' ? 'zh-CN' : 'en-US')}
              </span>
            )}
          </div>
        </div>
        <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
          <a
            href="/"
            style={{
              padding: '0.5rem 1rem', borderRadius: '8px', border: '1px solid rgba(255, 255, 255, 0.08)',
              backgroundColor: 'rgba(255, 255, 255, 0.04)', color: '#d1d5db', textDecoration: 'none',
              fontSize: '0.85rem', transition: 'all 0.2s'
            }}
            onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.08)'; e.currentTarget.style.color = '#fff'; }}
            onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.04)'; e.currentTarget.style.color = '#d1d5db'; }}
          >
            {t.navHome}
          </a>
          <button
            onClick={() => handleSetLang(lang === 'zh' ? 'en' : 'zh')}
            style={{
              padding: '0.5rem 1rem', borderRadius: '8px', border: '1px solid rgba(255, 255, 255, 0.08)',
              backgroundColor: 'rgba(255, 255, 255, 0.04)', color: '#d1d5db', cursor: 'pointer',
              fontSize: '0.85rem', transition: 'all 0.2s'
            }}
            onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.08)'; e.currentTarget.style.color = '#fff'; }}
            onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.04)'; e.currentTarget.style.color = '#d1d5db'; }}
          >
            {lang === 'zh' ? 'English' : '中文'}
          </button>
          <button
            onClick={fetchData}
            disabled={loading}
            style={{
              padding: '0.5rem 1rem', borderRadius: '8px', border: '1px solid rgba(255, 255, 255, 0.08)',
              backgroundColor: 'rgba(255, 255, 255, 0.04)', color: '#d1d5db', cursor: loading ? 'wait' : 'pointer',
              display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.85rem', transition: 'all 0.2s'
            }}
            onMouseEnter={(e) => { if (!loading) e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.08)'; }}
            onMouseLeave={(e) => { if (!loading) e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.04)'; }}
          >
            <span className={loading ? 'spin' : ''}>🔄</span>
            {loading ? t.refreshing : t.refresh}
          </button>
        </div>
      </div>

      {/* Tabs list */}
      <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '1.5rem', flexWrap: 'wrap' }}>
        <button
          className={`tab-btn ${activeTab === 'overview' ? 'active' : ''}`}
          onClick={() => setActiveTab('overview')}
        >
          {t.tabOverview}
        </button>
        <button
          className={`tab-btn ${activeTab === 'keys' ? 'active' : ''}`}
          onClick={() => setActiveTab('keys')}
        >
          {t.tabKeys}
        </button>
        <button
          className={`tab-btn ${activeTab === 'tools' ? 'active' : ''}`}
          onClick={() => setActiveTab('tools')}
        >
          {t.tabTools}
        </button>
      </div>

      {/* Page Body */}
      <div className="content-area">
        {activeTab === 'overview' && (
          <OverviewTab
            data={data!}
            apiKey={apiKey}
            lang={lang}
            t={t}
            testingHash={testingHash}
            operationLoading={operationLoading}
            onTestKey={handleTestKeyGeneral}
            onDeleteKey={handleDeleteKeyGeneral}
            onSaveQuota={handleSaveQuota}
            onResetQuota={handleResetQuota}
          />
        )}
        {activeTab === 'keys' && (
          <KeysTab
            data={data!}
            lang={lang}
            t={t}
            selectedProvider={selectedProvider}
            setSelectedProvider={setSelectedProvider}
            providerKeys={providerKeys}
            providerFallbacks={providerFallbacks}
            newKeyInput={newKeyInput}
            setNewKeyInput={setNewKeyInput}
            operationLoading={operationLoading}
            configMessage={configMessage}
            setConfigMessage={setConfigMessage}
            testingHash={testingHash}
            testingInput={testingInput}
            activeFallbacks={activeFallbacks}
            setActiveFallbacks={setActiveFallbacks}
            selectedFallbackToAdd={selectedFallbackToAdd}
            setSelectedFallbackToAdd={setSelectedFallbackToAdd}
            onAddKey={handleAddKey}
            onDeleteKey={handleDeleteKeyGeneral}
            onTestKey={handleTestKeyGeneral}
            onTestInputKey={handleTestInputKey}
            onSaveFallbacks={handleSaveFallbacks}
            onResetFallbacks={handleResetFallbacks}
          />
        )}
        {activeTab === 'tools' && (
          <ToolsTab
            apiKey={apiKey}
            lang={lang}
            t={t}
            providers={data?.providers || []}
            onRefreshData={fetchData}
          />
        )}
      </div>

      {data && (
        <p style={{
          color: '#6b7280', marginTop: '2.5rem', fontSize: '0.8rem', textAlign: 'center',
        }}>
          {t.autoRefreshInfo} {new Date(data.timestamp).toLocaleTimeString()}
        </p>
      )}
    </main>
  );
}
