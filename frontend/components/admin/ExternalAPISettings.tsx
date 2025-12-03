'use client';

import { useState, useEffect, useCallback } from 'react';
import { config } from '@/lib/config';
import { getAuthHeader } from '@/lib/auth';
import {
  Search,
  CheckCircle,
  XCircle,
  Loader2,
  Save,
  ExternalLink,
  Zap,
  Globe,
  Sparkles,
  AlertTriangle,
  RefreshCw,
} from 'lucide-react';

interface SearchConfig {
  provider: string;
  enabled: boolean;
  perplexity: { apiKey: string | null; hasApiKey: boolean };
  tavily: { apiKey: string | null; hasApiKey: boolean };
  serper: { apiKey: string | null; hasApiKey: boolean };
}

// Search provider configurations
const SEARCH_PROVIDERS = [
  {
    id: 'perplexity',
    name: 'Perplexity',
    description: 'AI驱动的研究搜索引擎',
    features: ['AI生成答案', '实时信息', '深度研究'],
    icon: '/icons/search/perplexity.svg',
    color: 'from-blue-500 to-cyan-500',
    bgColor: 'bg-blue-50',
    textColor: 'text-blue-600',
    url: 'https://perplexity.ai',
    placeholder: 'pplx-...',
  },
  {
    id: 'tavily',
    name: 'Tavily',
    description: 'AI Agent优化的搜索API',
    features: ['Agent优化', '结构化数据', '快速响应'],
    icon: '/icons/search/tavily.svg',
    color: 'from-purple-500 to-indigo-500',
    bgColor: 'bg-purple-50',
    textColor: 'text-purple-600',
    url: 'https://tavily.com',
    placeholder: 'tvly-...',
  },
  {
    id: 'serper',
    name: 'Serper',
    description: 'Google搜索结果API',
    features: ['Google结果', '高准确率', '丰富元数据'],
    icon: '/icons/search/serper.svg',
    color: 'from-green-500 to-emerald-500',
    bgColor: 'bg-green-50',
    textColor: 'text-green-600',
    url: 'https://serper.dev',
    placeholder: 'Enter API key',
  },
] as const;

export default function ExternalAPISettings() {
  const [searchConfig, setSearchConfig] = useState<SearchConfig>({
    provider: 'tavily',
    enabled: true,
    perplexity: { apiKey: null, hasApiKey: false },
    tavily: { apiKey: null, hasApiKey: false },
    serper: { apiKey: null, hasApiKey: false },
  });
  const [apiKeys, setApiKeys] = useState<Record<string, string>>({
    perplexity: '',
    tavily: '',
    serper: '',
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState<string | null>(null);
  const [testResults, setTestResults] = useState<
    Record<string, { success: boolean; message: string }>
  >({});
  const [message, setMessage] = useState<{
    type: 'success' | 'error';
    text: string;
  } | null>(null);

  const loadSearchConfig = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`${config.apiUrl}/admin/search-config`, {
        headers: { ...getAuthHeader() },
        credentials: 'include',
      });
      if (res.ok) {
        const data = await res.json();
        setSearchConfig(data);
      }
    } catch (err) {
      console.error('Failed to load search config:', err);
      setMessage({ type: 'error', text: '加载配置失败' });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadSearchConfig();
  }, [loadSearchConfig]);

  const handleSave = async () => {
    setSaving(true);
    setMessage(null);

    try {
      const res = await fetch(`${config.apiUrl}/admin/search-config`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          ...getAuthHeader(),
        },
        credentials: 'include',
        body: JSON.stringify({
          provider: searchConfig.provider,
          enabled: searchConfig.enabled,
          perplexityApiKey: apiKeys.perplexity || undefined,
          tavilyApiKey: apiKeys.tavily || undefined,
          serperApiKey: apiKeys.serper || undefined,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        setSearchConfig(data);
        setApiKeys({ perplexity: '', tavily: '', serper: '' });
        setMessage({ type: 'success', text: '配置保存成功' });
        setTimeout(() => setMessage(null), 3000);
      } else {
        setMessage({ type: 'error', text: '保存配置失败' });
      }
    } catch (err) {
      console.error('Failed to save search config:', err);
      setMessage({ type: 'error', text: '保存配置失败' });
    } finally {
      setSaving(false);
    }
  };

  const handleTest = async (providerId: string) => {
    setTesting(providerId);
    setTestResults((prev) => ({
      ...prev,
      [providerId]: { success: false, message: '' },
    }));

    try {
      const providerConfig = searchConfig[providerId as keyof SearchConfig] as {
        hasApiKey: boolean;
      };
      const apiKey =
        apiKeys[providerId] ||
        (providerConfig?.hasApiKey ? '***use-saved***' : '');

      if (!apiKey) {
        setTestResults((prev) => ({
          ...prev,
          [providerId]: { success: false, message: '请先输入API Key' },
        }));
        setTesting(null);
        return;
      }

      if (apiKey === '***use-saved***') {
        setTestResults((prev) => ({
          ...prev,
          [providerId]: { success: true, message: 'API Key已配置（已保存）' },
        }));
        setTesting(null);
        return;
      }

      const res = await fetch(`${config.apiUrl}/admin/search-config/test`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...getAuthHeader(),
        },
        credentials: 'include',
        body: JSON.stringify({ provider: providerId, apiKey }),
      });

      const data = await res.json();
      setTestResults((prev) => ({ ...prev, [providerId]: data }));
    } catch (err: any) {
      setTestResults((prev) => ({
        ...prev,
        [providerId]: { success: false, message: err.message || '测试失败' },
      }));
    } finally {
      setTesting(null);
    }
  };

  const setAsDefault = (providerId: string) => {
    setSearchConfig((prev) => ({ ...prev, provider: providerId }));
  };

  const getProviderStatus = (providerId: string) => {
    const providerConfig = searchConfig[providerId as keyof SearchConfig] as
      | { hasApiKey: boolean }
      | undefined;
    return providerConfig?.hasApiKey || false;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-12">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-purple-600 border-t-transparent"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-gray-900">
            External API Configuration
          </h2>
          <p className="mt-1 text-sm text-gray-500">
            配置第三方搜索API，为AI提供实时信息检索能力
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={loadSearchConfig}
            disabled={loading}
            className="flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            刷新
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-2 rounded-lg bg-gradient-to-r from-purple-600 to-indigo-600 px-4 py-2 text-sm font-medium text-white shadow-lg shadow-purple-500/25 hover:from-purple-700 hover:to-indigo-700 disabled:opacity-50"
          >
            {saving ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Save className="h-4 w-4" />
            )}
            保存配置
          </button>
        </div>
      </div>

      {/* Message */}
      {message && (
        <div
          className={`flex items-center gap-3 rounded-lg p-4 ${
            message.type === 'success'
              ? 'bg-green-50 text-green-700'
              : 'bg-red-50 text-red-700'
          }`}
        >
          {message.type === 'success' ? (
            <CheckCircle className="h-5 w-5" />
          ) : (
            <AlertTriangle className="h-5 w-5" />
          )}
          <span>{message.text}</span>
          <button
            onClick={() => setMessage(null)}
            className="ml-auto opacity-50 hover:opacity-100"
          >
            &times;
          </button>
        </div>
      )}

      {/* Global Search Toggle */}
      <div className="rounded-xl border border-purple-200 bg-gradient-to-r from-purple-50 to-indigo-50 p-5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-purple-500 to-indigo-600 shadow-lg">
              <Search className="h-6 w-6 text-white" />
            </div>
            <div>
              <h3 className="font-semibold text-gray-900">Web Search</h3>
              <p className="text-sm text-gray-600">
                允许AI模型进行网络搜索获取实时信息
              </p>
            </div>
          </div>
          <button
            onClick={() =>
              setSearchConfig((prev) => ({ ...prev, enabled: !prev.enabled }))
            }
            className={`relative inline-flex h-7 w-14 items-center rounded-full transition-colors ${
              searchConfig.enabled ? 'bg-purple-600' : 'bg-gray-300'
            }`}
          >
            <span
              className={`inline-block h-5 w-5 transform rounded-full bg-white shadow-md transition-transform ${
                searchConfig.enabled ? 'translate-x-8' : 'translate-x-1'
              }`}
            />
          </button>
        </div>
      </div>

      {/* Provider Cards Grid */}
      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        {SEARCH_PROVIDERS.map((provider) => {
          const isConfigured = getProviderStatus(provider.id);
          const isDefault = searchConfig.provider === provider.id;
          const testResult = testResults[provider.id];

          return (
            <div
              key={provider.id}
              className={`relative overflow-hidden rounded-xl border-2 bg-white shadow-sm transition-all hover:shadow-md ${
                isDefault
                  ? 'border-purple-400 ring-2 ring-purple-100'
                  : 'border-gray-200'
              }`}
            >
              {/* Header */}
              <div className={`bg-gradient-to-r ${provider.color} p-4`}>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-white/20 backdrop-blur">
                      <Globe className="h-5 w-5 text-white" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="font-bold text-white">
                          {provider.name}
                        </h3>
                        {isDefault && (
                          <span className="rounded-full bg-white/30 px-2 py-0.5 text-xs font-medium text-white">
                            Default
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-white/80">
                        {provider.description}
                      </p>
                    </div>
                  </div>
                  <a
                    href={provider.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="rounded-lg bg-white/20 p-2 text-white hover:bg-white/30"
                  >
                    <ExternalLink className="h-4 w-4" />
                  </a>
                </div>
              </div>

              {/* Body */}
              <div className="space-y-4 p-4">
                {/* Features */}
                <div className="flex flex-wrap gap-2">
                  {provider.features.map((feature) => (
                    <span
                      key={feature}
                      className={`rounded-full px-2.5 py-1 text-xs font-medium ${provider.bgColor} ${provider.textColor}`}
                    >
                      {feature}
                    </span>
                  ))}
                </div>

                {/* Status */}
                <div className="flex items-center justify-between rounded-lg bg-gray-50 p-3">
                  <span className="text-sm text-gray-600">API Key:</span>
                  {isConfigured ? (
                    <span className="flex items-center gap-1.5 text-sm font-medium text-green-600">
                      <CheckCircle className="h-4 w-4" />
                      已配置
                    </span>
                  ) : (
                    <span className="flex items-center gap-1.5 text-sm font-medium text-gray-400">
                      <XCircle className="h-4 w-4" />
                      未配置
                    </span>
                  )}
                </div>

                {/* API Key Input */}
                <div className="space-y-2">
                  <input
                    type="password"
                    value={apiKeys[provider.id]}
                    onChange={(e) =>
                      setApiKeys((prev) => ({
                        ...prev,
                        [provider.id]: e.target.value,
                      }))
                    }
                    placeholder={
                      isConfigured ? '••••••••••••••••' : provider.placeholder
                    }
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 font-mono text-sm focus:border-purple-500 focus:outline-none focus:ring-1 focus:ring-purple-500"
                  />
                </div>

                {/* Test Result */}
                {testResult && (
                  <div
                    className={`flex items-center gap-2 rounded-lg p-2 text-sm ${
                      testResult.success
                        ? 'bg-green-50 text-green-700'
                        : 'bg-red-50 text-red-700'
                    }`}
                  >
                    {testResult.success ? (
                      <CheckCircle className="h-4 w-4 flex-shrink-0" />
                    ) : (
                      <XCircle className="h-4 w-4 flex-shrink-0" />
                    )}
                    <span className="truncate">{testResult.message}</span>
                  </div>
                )}

                {/* Actions */}
                <div className="flex gap-2">
                  <button
                    onClick={() => handleTest(provider.id)}
                    disabled={
                      testing === provider.id ||
                      (!apiKeys[provider.id] && !isConfigured)
                    }
                    className="flex flex-1 items-center justify-center gap-2 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {testing === provider.id ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Zap className="h-4 w-4" />
                    )}
                    测试
                  </button>
                  {!isDefault && (
                    <button
                      onClick={() => setAsDefault(provider.id)}
                      className={`flex flex-1 items-center justify-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                        isConfigured
                          ? 'bg-purple-100 text-purple-700 hover:bg-purple-200'
                          : 'cursor-not-allowed bg-gray-100 text-gray-400'
                      }`}
                      disabled={!isConfigured}
                    >
                      <Sparkles className="h-4 w-4" />
                      设为默认
                    </button>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Current Default Info */}
      <div className="rounded-xl border border-gray-200 bg-gray-50 p-4">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-purple-100">
            <Sparkles className="h-5 w-5 text-purple-600" />
          </div>
          <div>
            <p className="text-sm font-medium text-gray-900">
              当前默认搜索引擎:{' '}
              <span className="text-purple-600">
                {SEARCH_PROVIDERS.find((p) => p.id === searchConfig.provider)
                  ?.name || searchConfig.provider}
              </span>
            </p>
            <p className="text-xs text-gray-500">
              AI模型将使用此搜索引擎进行网络搜索
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
