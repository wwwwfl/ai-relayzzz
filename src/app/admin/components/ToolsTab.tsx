'use client';

import { useState, useMemo, useEffect } from 'react';

interface ToolsTabProps {
  apiKey: string;
  lang: 'zh' | 'en';
  t: any;
  providers: any[];
  onRefreshData?: () => Promise<void>;
}

export default function ToolsTab({ apiKey, lang, t, providers, onRefreshData }: ToolsTabProps) {
  // Temporary Key Generator States
  const [tempDuration, setTempDuration] = useState<number>(86400); // Default 1 day (86400 seconds)
  const [generatedKey, setGeneratedKey] = useState<string>('');
  const [generatedKeyExpires, setGeneratedKeyExpires] = useState<string>('');
  const [tempKeyLoading, setTempKeyLoading] = useState<boolean>(false);
  const [tempKeyMessage, setTempKeyMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);
  const [copied, setCopied] = useState<boolean>(false);

  // Model & Key Connectivity Test States
  const [selectedModel, setSelectedModel] = useState<string>('');
  const [useCustomKey, setUseCustomKey] = useState<boolean>(false);
  const [customKey, setCustomKey] = useState<string>('');
  const [testLoading, setTestLoading] = useState<boolean>(false);
  const [testResult, setTestResult] = useState<{ success: boolean; status?: number; error?: string } | null>(null);

  // New multi-key selection and management states
  const [providerKeys, setProviderKeys] = useState<Array<{ hash: string; masked: string; source: string }>>([]);
  const [selectedKeyHash, setSelectedKeyHash] = useState<string>('');
  const [keysLoading, setKeysLoading] = useState<boolean>(false);
  const [savingKey, setSavingKey] = useState<boolean>(false);
  const [deletingKey, setDeletingKey] = useState<boolean>(false);

  // Extract all models from configured providers (NO keyCount > 0 filter anymore)
  const testableModels = useMemo(() => {
    return providers.flatMap((p) => {
      return (p.models || []).map((m: any) => ({
        modelId: m.id,
        displayName: m.displayName,
        providerId: p.id,
        providerName: p.name,
        keyCount: p.keyCount || 0,
      }));
    });
  }, [providers]);

  // Set default model once models are loaded
  useEffect(() => {
    if (testableModels.length > 0 && !selectedModel) {
      setSelectedModel(testableModels[0].modelId);
    }
  }, [testableModels, selectedModel]);

  // Find currently selected model object
  const currentModelObj = useMemo(() => {
    return testableModels.find((m) => m.modelId === selectedModel);
  }, [testableModels, selectedModel]);

  // Fetch keys for the current provider
  const fetchKeys = async (providerId: string) => {
    setKeysLoading(true);
    try {
      const res = await fetch(`/api/admin/providers/${providerId}/keys`, {
        headers: { Authorization: `Bearer ${apiKey}` },
      });
      if (res.ok) {
        const data = await res.json();
        const keys = data.keys || [];
        setProviderKeys(keys);
        if (keys.length > 0) {
          const exists = keys.some((k: any) => k.hash === selectedKeyHash);
          if (!exists) {
            setSelectedKeyHash(keys[0].hash);
          }
        } else {
          setSelectedKeyHash('');
        }
      } else {
        setProviderKeys([]);
        setSelectedKeyHash('');
      }
    } catch {
      setProviderKeys([]);
      setSelectedKeyHash('');
    } finally {
      setKeysLoading(false);
    }
  };

  // Fetch keys when selected provider changes
  useEffect(() => {
    if (currentModelObj?.providerId) {
      fetchKeys(currentModelObj.providerId);
    } else {
      setProviderKeys([]);
      setSelectedKeyHash('');
    }
  }, [currentModelObj?.providerId]);

  const handleRunTest = async () => {
    if (!selectedModel || !currentModelObj) return;

    setTestLoading(true);
    setTestResult(null);

    try {
      const payload: any = { model: selectedModel };
      if (useCustomKey) {
        if (customKey.trim()) {
          payload.key = customKey.trim();
        }
      } else if (selectedKeyHash) {
        payload.hash = selectedKeyHash;
      }

      const res = await fetch(`/api/admin/providers/${currentModelObj.providerId}/keys/test`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (!res.ok) {
        setTestResult({
          success: false,
          status: res.status,
          error: data.error?.message || 'Verification request failed',
        });
      } else if (data.valid) {
        setTestResult({ success: true });
      } else {
        setTestResult({
          success: false,
          status: data.status || 400,
          error: data.error || 'Invalid API Key',
        });
      }
    } catch (e: any) {
      setTestResult({
        success: false,
        status: 500,
        error: e instanceof Error ? e.message : 'Unknown network/server error',
      });
    } finally {
      setTestLoading(false);
    }
  };

  const handleSaveKeyToProvider = async () => {
    if (!currentModelObj || !customKey.trim()) return;
    setSavingKey(true);
    try {
      const res = await fetch(`/api/admin/providers/${currentModelObj.providerId}/keys`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({ key: customKey.trim() }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error?.message || t.alertAddFromTestFailed);
      }
      alert(t.msgKeyAddedFromTest);
      setCustomKey('');
      setUseCustomKey(false);
      setTestResult(null);
      
      // Refresh global state & reload current provider keys
      if (onRefreshData) await onRefreshData();
      await fetchKeys(currentModelObj.providerId);
    } catch (e: any) {
      alert(e.message || t.alertAddFromTestFailed);
    } finally {
      setSavingKey(false);
    }
  };

  // Helper to hash key with djb2 algorithm
  const djb2Hash = (key: string): string => {
    let hash = 5381;
    for (let i = 0; i < key.length; i++) {
      hash = ((hash << 5) + hash + key.charCodeAt(i)) >>> 0;
    }
    return hash.toString(16).padStart(8, '0');
  };

  // Determine if the tested key is an existing key, and if so, get its hash
  const existingKeyHashForDelete = useMemo(() => {
    if (!useCustomKey) {
      return selectedKeyHash || null;
    }
    // If using custom key, check if it matches any existing key by hash
    const inputHash = djb2Hash(customKey.trim());
    const exists = providerKeys.some((k) => k.hash === inputHash);
    return exists ? inputHash : null;
  }, [useCustomKey, selectedKeyHash, customKey, providerKeys]);

  const handleDeleteKeyFromTest = async () => {
    const hashToDelete = existingKeyHashForDelete;
    if (!currentModelObj || !hashToDelete) return;
    if (!confirm(t.confirmDeleteFailedKey)) return;
    
    setDeletingKey(true);
    try {
      const res = await fetch(`/api/admin/providers/${currentModelObj.providerId}/keys`, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({ hash: hashToDelete }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error?.message || t.alertDeleteFromTestFailed);
      }
      alert(t.msgKeyDeletedFromTest);
      setTestResult(null);
      if (useCustomKey) {
        setCustomKey('');
      }
      
      // Refresh global state & reload current provider keys
      if (onRefreshData) await onRefreshData();
      await fetchKeys(currentModelObj.providerId);
    } catch (e: any) {
      alert(e.message || t.alertDeleteFromTestFailed);
    } finally {
      setDeletingKey(false);
    }
  };

  const handleGenerateTempKey = async () => {
    setTempKeyLoading(true);
    setTempKeyMessage(null);
    setGeneratedKey('');
    setGeneratedKeyExpires('');
    setCopied(false);
    try {
      const res = await fetch('/api/admin/temp-keys', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({ durationSeconds: tempDuration }),
      });
      const resData = await res.json();
      if (!res.ok) {
        throw new Error(resData.error?.message || 'Failed to generate temporary key');
      }
      setGeneratedKey(resData.key);
      setGeneratedKeyExpires(resData.expiresAt);
      setTempKeyMessage({ text: lang === 'zh' ? '生成成功！' : 'Key generated successfully!', type: 'success' });
    } catch (e) {
      setTempKeyMessage({
        text: e instanceof Error ? e.message : (lang === 'zh' ? '生成失败' : 'Failed to generate temporary key'),
        type: 'error',
      });
    } finally {
      setTempKeyLoading(false);
    }
  };

  const handleCopy = () => {
    if (!generatedKey) return;
    navigator.clipboard.writeText(generatedKey);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const isNoKeysWarning = !useCustomKey && currentModelObj && currentModelObj.keyCount === 0;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      <style dangerouslySetInnerHTML={{ __html: `
        .custom-select {
          appearance: none;
          background-image: url("data:image/svg+xml;utf8,<svg fill='none' height='24' stroke='%239ca3af' stroke-linecap='round' stroke-linejoin='round' stroke-width='2' viewBox='0 0 24 24' width='24' xmlns='http://www.w3.org/2000/svg'><polyline points='6 9 12 15 18 9'/></svg>");
          background-repeat: no-repeat;
          background-position: right 0.5rem center;
          background-size: 1rem;
          padding-right: 2rem !important;
        }
      `}} />

      {/* Temporary API Key Generator */}
      <section className="glass-panel">
        <h2 style={{ fontSize: '1.25rem', marginTop: 0, marginBottom: '0.5rem', color: '#fff', fontWeight: 600 }}>
          {t.tempKeyTitle}
        </h2>
        <p style={{ fontSize: '0.85rem', color: '#9ca3af', marginTop: 0, marginBottom: '1.5rem', lineHeight: '1.5' }}>
          {t.tempKeyDesc}
        </p>

        <div style={{ display: 'flex', gap: '1rem', alignItems: 'center', marginBottom: '1.25rem', flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <span style={{ color: '#d1d5db', fontSize: '0.9rem' }}>{t.tempDurationLabel}</span>
            <select
              value={tempDuration}
              onChange={(e) => setTempDuration(Number(e.target.value))}
              disabled={tempKeyLoading}
              className="custom-select"
              style={{
                padding: '0.5rem 1rem',
                borderRadius: '6px',
                border: '1px solid rgba(255, 255, 255, 0.08)',
                backgroundColor: 'rgba(0, 0, 0, 0.25)',
                color: '#fff',
                fontSize: '0.9rem',
                outline: 'none',
                cursor: 'pointer',
              }}
            >
              <option value={3600}>{t.duration1h}</option>
              <option value={86400}>{t.duration1d}</option>
              <option value={604800}>{t.duration7d}</option>
              <option value={2592000}>{t.duration30d}</option>
            </select>
          </div>

          <button
            onClick={handleGenerateTempKey}
            disabled={tempKeyLoading}
            style={{
              padding: '0.5rem 1.5rem',
              borderRadius: '6px',
              border: 'none',
              backgroundColor: '#10b981',
              color: 'white',
              fontWeight: 'bold',
              fontSize: '0.9rem',
              cursor: tempKeyLoading ? 'wait' : 'pointer',
              opacity: tempKeyLoading ? 0.6 : 1,
              transition: 'all 0.2s',
            }}
            onMouseEnter={(e) => { if (!e.currentTarget.disabled) e.currentTarget.style.backgroundColor = '#059669'; }}
            onMouseLeave={(e) => { if (!e.currentTarget.disabled) e.currentTarget.style.backgroundColor = '#10b981'; }}
          >
            {tempKeyLoading ? '...' : t.generateBtn}
          </button>
        </div>

        {tempKeyMessage && (
          <p style={{
            color: tempKeyMessage.type === 'error' ? '#ef4444' : '#10b981',
            fontSize: '0.9rem',
            margin: '0.5rem 0',
            fontWeight: 500
          }}>
            {tempKeyMessage.text}
          </p>
        )}

        {generatedKey && (
          <div style={{
            marginTop: '1.25rem',
            padding: '1.25rem',
            borderRadius: '8px',
            backgroundColor: 'rgba(0, 0, 0, 0.2)',
            border: '1px solid rgba(255, 255, 255, 0.05)',
            boxShadow: 'inset 0 2px 4px rgba(0, 0, 0, 0.2)',
          }} className="config-card">
            <div style={{ fontSize: '0.85rem', color: '#9ca3af', marginBottom: '0.5rem', fontWeight: 500 }}>
              {t.generatedKeyLabel}
            </div>
            <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
              <input
                type="text"
                readOnly
                value={generatedKey}
                onClick={(e) => (e.target as HTMLInputElement).select()}
                style={{
                  flex: 1,
                  padding: '0.6rem',
                  fontFamily: 'monospace',
                  fontSize: '0.85rem',
                  borderRadius: '6px',
                  border: '1px solid rgba(255, 255, 255, 0.08)',
                  backgroundColor: 'rgba(0, 0, 0, 0.3)',
                  color: '#10b981',
                  outline: 'none',
                }}
              />
              <button
                onClick={handleCopy}
                style={{
                  padding: '0.6rem 1rem',
                  borderRadius: '6px',
                  border: '1px solid rgba(16, 185, 129, 0.4)',
                  backgroundColor: 'rgba(16, 185, 129, 0.1)',
                  color: '#34d399',
                  fontSize: '0.85rem',
                  cursor: 'pointer',
                  fontWeight: 'bold',
                  whiteSpace: 'nowrap',
                  transition: 'all 0.2s',
                }}
                onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = 'rgba(16, 185, 129, 0.2)'; }}
                onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'rgba(16, 185, 129, 0.1)'; }}
              >
                {copied ? t.copied : t.copy}
              </button>
            </div>
            {generatedKeyExpires && (
              <div style={{ fontSize: '0.8rem', color: '#9ca3af', marginTop: '0.75rem' }}>
                {t.expiresAtLabel} <code style={{ fontFamily: 'monospace', color: '#f3f4f6' }}>{new Date(generatedKeyExpires).toLocaleString()}</code>
              </div>
            )}
          </div>
        )}

        <div style={{
          marginTop: '1.25rem',
          padding: '0.75rem 1rem',
          borderRadius: '8px',
          backgroundColor: 'rgba(239, 68, 68, 0.06)',
          border: '1px solid rgba(239, 68, 68, 0.15)',
          color: '#fca5a5',
          fontSize: '0.85rem',
          lineHeight: '1.4'
        }}>
          {t.tempKeyNotice}
        </div>
      </section>

      {/* Model & Key Connectivity Test */}
      <section className="glass-panel">
        <h2 style={{ fontSize: '1.25rem', marginTop: 0, marginBottom: '0.5rem', color: '#fff', fontWeight: 600 }}>
          {t.testToolTitle}
        </h2>
        <p style={{ fontSize: '0.85rem', color: '#9ca3af', marginTop: 0, marginBottom: '1.5rem', lineHeight: '1.5' }}>
          {t.testToolDesc}
        </p>

        {testableModels.length === 0 ? (
          <div style={{
            padding: '1rem',
            borderRadius: '8px',
            backgroundColor: 'rgba(239, 68, 68, 0.05)',
            border: '1px solid rgba(239, 68, 68, 0.15)',
            color: '#fca5a5',
            fontSize: '0.9rem',
          }}>
            {t.noConfiguredModels}
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
            {/* Model Selection */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              <label style={{ color: '#d1d5db', fontSize: '0.9rem', fontWeight: 500 }}>
                {t.testModelLabel}
              </label>
              <select
                value={selectedModel}
                onChange={(e) => {
                  setSelectedModel(e.target.value);
                  setTestResult(null);
                }}
                disabled={testLoading}
                className="custom-select"
                style={{
                  width: '100%',
                  maxWidth: '500px',
                  padding: '0.5rem 1rem',
                  borderRadius: '6px',
                  border: '1px solid rgba(255, 255, 255, 0.08)',
                  backgroundColor: 'rgba(0, 0, 0, 0.25)',
                  color: '#fff',
                  fontSize: '0.9rem',
                  outline: 'none',
                  cursor: 'pointer',
                }}
              >
                {testableModels.map((m) => {
                  const hasKey = m.keyCount > 0;
                  const prefix = hasKey ? '🟢 ' : '⚠️ ';
                  const suffix = hasKey ? '' : (lang === 'zh' ? ' (未配置密钥)' : ' (No Keys)');
                  return (
                    <option key={`${m.providerId}:${m.modelId}`} value={m.modelId}>
                      {prefix}[{m.providerName}] {m.displayName} ({m.modelId}){suffix}
                    </option>
                  );
                })}
              </select>
            </div>

            {/* Custom Key Toggle */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: '0.25rem' }}>
              <input
                type="checkbox"
                id="useCustomKey"
                checked={useCustomKey}
                onChange={(e) => {
                  setUseCustomKey(e.target.checked);
                  setTestResult(null);
                }}
                disabled={testLoading}
                style={{ cursor: 'pointer', width: '1.1rem', height: '1.1rem' }}
              />
              <label htmlFor="useCustomKey" style={{ color: '#d1d5db', fontSize: '0.9rem', cursor: 'pointer', userSelect: 'none' }}>
                {t.useCustomKeyLabel}
              </label>
            </div>

            {/* Key Selection and Action Row */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              <label style={{ color: '#d1d5db', fontSize: '0.9rem', fontWeight: 500 }}>
                {useCustomKey ? t.customKeyPlaceholder : t.testKeySelectLabel}
              </label>
              
              <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap', width: '100%', maxWidth: '800px' }}>
                {/* Input or Select Container */}
                <div style={{ flex: '0 1 300px', minWidth: '200px', width: '100%' }}>
                  {useCustomKey ? (
                    <input
                      type="password"
                      placeholder={t.customKeyPlaceholder}
                      value={customKey}
                      onChange={(e) => setCustomKey(e.target.value)}
                      disabled={testLoading}
                      style={{
                        width: '100%',
                        padding: '0.5rem 1rem',
                        borderRadius: '6px',
                        border: '1px solid rgba(255, 255, 255, 0.08)',
                        backgroundColor: 'rgba(0, 0, 0, 0.25)',
                        color: '#fff',
                        fontSize: '0.9rem',
                        fontFamily: 'monospace',
                        outline: 'none',
                        boxSizing: 'border-box',
                      }}
                    />
                  ) : (
                    currentModelObj && currentModelObj.keyCount > 0 ? (
                      <select
                        value={selectedKeyHash}
                        onChange={(e) => {
                          setSelectedKeyHash(e.target.value);
                          setTestResult(null);
                        }}
                        disabled={testLoading || keysLoading}
                        className="custom-select"
                        style={{
                          width: '100%',
                          padding: '0.5rem 1rem',
                          borderRadius: '6px',
                          border: '1px solid rgba(255, 255, 255, 0.08)',
                          backgroundColor: 'rgba(0, 0, 0, 0.25)',
                          color: '#fff',
                          fontSize: '0.9rem',
                          outline: 'none',
                          cursor: 'pointer',
                        }}
                      >
                        {providerKeys.map((k) => (
                          <option key={k.hash} value={k.hash}>
                            {k.masked} ({k.source === 'env' ? (lang === 'zh' ? '环境变量' : 'env') : (lang === 'zh' ? 'KV 存储' : 'kv')})
                          </option>
                        ))}
                      </select>
                    ) : (
                      <div style={{
                        padding: '0.5rem 1rem',
                        borderRadius: '6px',
                        border: '1px solid rgba(239, 68, 68, 0.15)',
                        backgroundColor: 'rgba(239, 68, 68, 0.05)',
                        color: '#fca5a5',
                        fontSize: '0.9rem',
                      }}>
                        {t.testToolNoKeysWarning}
                      </div>
                    )
                  )}
                </div>

                {/* Run Test Button */}
                <button
                  onClick={handleRunTest}
                  disabled={testLoading || !selectedModel || isNoKeysWarning || (useCustomKey && !customKey.trim())}
                  style={{
                    padding: '0.5rem 1rem',
                    borderRadius: '6px',
                    border: 'none',
                    backgroundColor: '#3b82f6',
                    color: 'white',
                    fontWeight: 'bold',
                    fontSize: '0.9rem',
                    cursor: (testLoading || isNoKeysWarning) ? 'not-allowed' : 'pointer',
                    opacity: (testLoading || !selectedModel || isNoKeysWarning || (useCustomKey && !customKey.trim())) ? 0.5 : 1,
                    transition: 'all 0.2s',
                    whiteSpace: 'nowrap',
                  }}
                  onMouseEnter={(e) => { if (!e.currentTarget.disabled) e.currentTarget.style.backgroundColor = '#2563eb'; }}
                  onMouseLeave={(e) => { if (!e.currentTarget.disabled) e.currentTarget.style.backgroundColor = '#3b82f6'; }}
                >
                  {testLoading ? t.btnTesting : t.btnRunTest}
                </button>

                {/* Success Action: Save key to provider */}
                {testResult && testResult.success && useCustomKey && (
                  <button
                    onClick={handleSaveKeyToProvider}
                    disabled={savingKey}
                    style={{
                      padding: '0.5rem 1rem',
                      borderRadius: '6px',
                      border: '1px solid rgba(16, 185, 129, 0.4)',
                      backgroundColor: 'rgba(16, 185, 129, 0.1)',
                      color: '#34d399',
                      fontSize: '0.85rem',
                      cursor: savingKey ? 'wait' : 'pointer',
                      fontWeight: 'bold',
                      transition: 'all 0.2s',
                      whiteSpace: 'nowrap',
                    }}
                    onMouseEnter={(e) => { if (!savingKey) e.currentTarget.style.backgroundColor = 'rgba(16, 185, 129, 0.2)'; }}
                    onMouseLeave={(e) => { if (!savingKey) e.currentTarget.style.backgroundColor = 'rgba(16, 185, 129, 0.1)'; }}
                  >
                    {savingKey ? '...' : (t.btnAddTestedKeyShort || t.btnAddTestedKey)}
                  </button>
                )}

                {/* Failure Action: Delete key */}
                {testResult && !testResult.success && existingKeyHashForDelete && (
                  <button
                    onClick={handleDeleteKeyFromTest}
                    disabled={deletingKey}
                    style={{
                      padding: '0.5rem 1rem',
                      borderRadius: '6px',
                      border: '1px solid rgba(239, 68, 68, 0.4)',
                      backgroundColor: 'rgba(239, 68, 68, 0.1)',
                      color: '#f87171',
                      fontSize: '0.85rem',
                      cursor: deletingKey ? 'wait' : 'pointer',
                      fontWeight: 'bold',
                      transition: 'all 0.2s',
                      whiteSpace: 'nowrap',
                    }}
                    onMouseEnter={(e) => { if (!deletingKey) e.currentTarget.style.backgroundColor = 'rgba(239, 68, 68, 0.2)'; }}
                    onMouseLeave={(e) => { if (!deletingKey) e.currentTarget.style.backgroundColor = 'rgba(239, 68, 68, 0.1)'; }}
                  >
                    {deletingKey ? '...' : (t.btnDeleteFailedKeyShort || t.btnDeleteFailedKey)}
                  </button>
                )}
              </div>
            </div>

            {/* Provider Key Count Warning Prompt (Fallback warning) */}
            {isNoKeysWarning && (
              <div style={{
                padding: '0.75rem 1rem',
                borderRadius: '8px',
                backgroundColor: 'rgba(239, 68, 68, 0.06)',
                border: '1px solid rgba(239, 68, 68, 0.15)',
                color: '#fca5a5',
                fontSize: '0.85rem',
                lineHeight: '1.4',
                maxWidth: '500px',
              }}>
                {t.testToolNoKeysWarning}
              </div>
            )}

            {/* Test Result Display */}
            {testResult && (
              <div style={{
                marginTop: '0.5rem',
                padding: '1.25rem',
                borderRadius: '8px',
                backgroundColor: testResult.success ? 'rgba(16, 185, 129, 0.06)' : 'rgba(239, 68, 68, 0.06)',
                border: testResult.success ? '1px solid rgba(16, 185, 129, 0.15)' : '1px solid rgba(239, 68, 68, 0.15)',
                color: testResult.success ? '#34d399' : '#fca5a5',
                fontSize: '0.9rem',
                lineHeight: '1.5',
                maxWidth: '500px',
              }}>
                {testResult.success ? (
                  <div>
                    <div style={{ fontWeight: 500 }}>{t.testResultSuccess}</div>
                  </div>
                ) : (
                  <div>
                    <div style={{ fontWeight: 'bold', marginBottom: '0.25rem' }}>{t.testResultFailed}</div>
                    <div style={{ fontFamily: 'monospace', fontSize: '0.85rem', color: '#f87171', wordBreak: 'break-all' }}>
                      {t.testResultFailedDetails
                        .replace('{status}', String(testResult.status || 'unknown'))
                        .replace('{error}', testResult.error || '')}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </section>
    </div>
  );
}
