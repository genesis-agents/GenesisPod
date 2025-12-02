'use client';

import { useState, useEffect } from 'react';
import { config } from '@/lib/config';
import { getAuthHeader } from '@/lib/auth';
import {
  Search,
  CheckCircle,
  XCircle,
  Loader2,
  Save,
  ExternalLink,
} from 'lucide-react';

interface SearchConfig {
  provider: string;
  enabled: boolean;
  perplexity: { apiKey: string | null; hasApiKey: boolean };
  tavily: { apiKey: string | null; hasApiKey: boolean };
  serper: { apiKey: string | null; hasApiKey: boolean };
}

export default function ExternalAPISettings() {
  // Search API config
  const [searchConfig, setSearchConfig] = useState<SearchConfig>({
    provider: 'tavily',
    enabled: true,
    perplexity: { apiKey: null, hasApiKey: false },
    tavily: { apiKey: null, hasApiKey: false },
    serper: { apiKey: null, hasApiKey: false },
  });
  const [perplexityApiKey, setPerplexityApiKey] = useState('');
  const [tavilyApiKey, setTavilyApiKey] = useState('');
  const [serperApiKey, setSerperApiKey] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<{
    provider: string;
    success: boolean;
    message: string;
  } | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Load config on mount
  useEffect(() => {
    loadSearchConfig();
  }, []);

  const loadSearchConfig = async () => {
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
      setError('Failed to load search configuration');
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    setSuccess(null);

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
          perplexityApiKey: perplexityApiKey || undefined,
          tavilyApiKey: tavilyApiKey || undefined,
          serperApiKey: serperApiKey || undefined,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        setSearchConfig(data);
        setPerplexityApiKey('');
        setTavilyApiKey('');
        setSerperApiKey('');
        setSuccess('Configuration saved successfully');
        setTimeout(() => setSuccess(null), 3000);
      } else {
        setError('Failed to save configuration');
      }
    } catch (err) {
      console.error('Failed to save search config:', err);
      setError('Failed to save configuration');
    } finally {
      setSaving(false);
    }
  };

  const handleTest = async (provider: string) => {
    setTesting(provider);
    setTestResult(null);

    try {
      let apiKey = '';
      if (provider === 'perplexity') {
        apiKey =
          perplexityApiKey ||
          (searchConfig.perplexity?.hasApiKey ? '***use-saved***' : '');
      } else if (provider === 'tavily') {
        apiKey =
          tavilyApiKey ||
          (searchConfig.tavily?.hasApiKey ? '***use-saved***' : '');
      } else if (provider === 'serper') {
        apiKey =
          serperApiKey ||
          (searchConfig.serper?.hasApiKey ? '***use-saved***' : '');
      }

      if (!apiKey) {
        setTestResult({
          provider,
          success: false,
          message: 'Please enter an API key first',
        });
        setTesting(null);
        return;
      }

      if (apiKey === '***use-saved***') {
        setTestResult({
          provider,
          success: true,
          message: 'API key is configured (saved in database)',
        });
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
        body: JSON.stringify({ provider, apiKey }),
      });

      const data = await res.json();
      setTestResult({ provider, ...data });
    } catch (err: any) {
      setTestResult({
        provider,
        success: false,
        message: err.message || 'Test failed',
      });
    } finally {
      setTesting(null);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-12">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-blue-600 border-t-transparent"></div>
      </div>
    );
  }

  return (
    <div className="p-8">
      {/* Header */}
      <div className="mb-6">
        <h2 className="text-lg font-semibold text-gray-900">
          External API Configuration
        </h2>
        <p className="text-sm text-gray-500">
          Configure third-party APIs for search and other services
        </p>
      </div>

      {/* Notifications */}
      {error && (
        <div className="mb-4 rounded-lg bg-red-50 p-4 text-sm text-red-600">
          {error}
        </div>
      )}
      {success && (
        <div className="mb-4 rounded-lg bg-green-50 p-4 text-sm text-green-600">
          {success}
        </div>
      )}

      {/* Search API Section */}
      <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        <div className="mb-6 flex items-center gap-3">
          <div className="rounded-lg bg-purple-100 p-2">
            <Search className="h-5 w-5 text-purple-600" />
          </div>
          <div>
            <h3 className="font-semibold text-gray-900">Web Search API</h3>
            <p className="text-sm text-gray-500">
              Enable AI to search the web for real-time information
            </p>
          </div>
        </div>

        <div className="space-y-6">
          {/* Enable/Disable Search */}
          <div className="flex items-center justify-between rounded-lg bg-gray-50 p-4">
            <div>
              <label className="font-medium text-gray-700">Enable Search</label>
              <p className="text-sm text-gray-500">
                Allow AI models to perform web searches
              </p>
            </div>
            <button
              onClick={() =>
                setSearchConfig({
                  ...searchConfig,
                  enabled: !searchConfig.enabled,
                })
              }
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                searchConfig.enabled ? 'bg-purple-600' : 'bg-gray-300'
              }`}
            >
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                  searchConfig.enabled ? 'translate-x-6' : 'translate-x-1'
                }`}
              />
            </button>
          </div>

          {/* Provider Selection */}
          <div>
            <label className="mb-2 block text-sm font-medium text-gray-700">
              Search Provider
            </label>
            <select
              value={searchConfig.provider}
              onChange={(e) =>
                setSearchConfig({ ...searchConfig, provider: e.target.value })
              }
              className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:border-purple-500 focus:outline-none focus:ring-1 focus:ring-purple-500"
            >
              <option value="perplexity">
                Perplexity (AI-Powered Research)
              </option>
              <option value="tavily">Tavily (AI Agent Optimized)</option>
              <option value="serper">Serper (Google Search)</option>
            </select>
            <p className="mt-1 text-xs text-gray-500">
              Perplexity provides AI-powered answers. Tavily is optimized for AI
              agents. Serper provides Google results.
            </p>
          </div>

          {/* API Keys */}
          <div className="grid gap-6 md:grid-cols-3">
            {/* Perplexity */}
            <div className="rounded-lg border border-gray-200 p-4">
              <div className="mb-3 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-gray-900">Perplexity</span>
                  <a
                    href="https://perplexity.ai"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-purple-600 hover:text-purple-700"
                  >
                    <ExternalLink className="h-3.5 w-3.5" />
                  </a>
                </div>
                {searchConfig.perplexity?.hasApiKey && (
                  <span className="flex items-center gap-1 text-xs text-green-600">
                    <CheckCircle className="h-3 w-3" />
                    Configured
                  </span>
                )}
              </div>
              <div className="space-y-2">
                <input
                  type="password"
                  value={perplexityApiKey}
                  onChange={(e) => setPerplexityApiKey(e.target.value)}
                  placeholder={
                    searchConfig.perplexity?.hasApiKey
                      ? '••••••••••••••••'
                      : 'pplx-...'
                  }
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 font-mono text-sm focus:border-purple-500 focus:outline-none focus:ring-1 focus:ring-purple-500"
                />
                <button
                  onClick={() => handleTest('perplexity')}
                  disabled={
                    testing === 'perplexity' ||
                    (!perplexityApiKey && !searchConfig.perplexity?.hasApiKey)
                  }
                  className="flex w-full items-center justify-center gap-2 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {testing === 'perplexity' ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    'Test Connection'
                  )}
                </button>
                {testResult?.provider === 'perplexity' && (
                  <div
                    className={`flex items-center gap-1 text-xs ${
                      testResult.success ? 'text-green-600' : 'text-red-600'
                    }`}
                  >
                    {testResult.success ? (
                      <CheckCircle className="h-3 w-3" />
                    ) : (
                      <XCircle className="h-3 w-3" />
                    )}
                    {testResult.message}
                  </div>
                )}
              </div>
            </div>

            {/* Tavily */}
            <div className="rounded-lg border border-gray-200 p-4">
              <div className="mb-3 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-gray-900">Tavily</span>
                  <a
                    href="https://tavily.com"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-purple-600 hover:text-purple-700"
                  >
                    <ExternalLink className="h-3.5 w-3.5" />
                  </a>
                </div>
                {searchConfig.tavily?.hasApiKey && (
                  <span className="flex items-center gap-1 text-xs text-green-600">
                    <CheckCircle className="h-3 w-3" />
                    Configured
                  </span>
                )}
              </div>
              <div className="space-y-2">
                <input
                  type="password"
                  value={tavilyApiKey}
                  onChange={(e) => setTavilyApiKey(e.target.value)}
                  placeholder={
                    searchConfig.tavily?.hasApiKey
                      ? '••••••••••••••••'
                      : 'tvly-...'
                  }
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 font-mono text-sm focus:border-purple-500 focus:outline-none focus:ring-1 focus:ring-purple-500"
                />
                <button
                  onClick={() => handleTest('tavily')}
                  disabled={
                    testing === 'tavily' ||
                    (!tavilyApiKey && !searchConfig.tavily?.hasApiKey)
                  }
                  className="flex w-full items-center justify-center gap-2 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {testing === 'tavily' ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    'Test Connection'
                  )}
                </button>
                {testResult?.provider === 'tavily' && (
                  <div
                    className={`flex items-center gap-1 text-xs ${
                      testResult.success ? 'text-green-600' : 'text-red-600'
                    }`}
                  >
                    {testResult.success ? (
                      <CheckCircle className="h-3 w-3" />
                    ) : (
                      <XCircle className="h-3 w-3" />
                    )}
                    {testResult.message}
                  </div>
                )}
              </div>
            </div>

            {/* Serper */}
            <div className="rounded-lg border border-gray-200 p-4">
              <div className="mb-3 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-gray-900">Serper</span>
                  <a
                    href="https://serper.dev"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-purple-600 hover:text-purple-700"
                  >
                    <ExternalLink className="h-3.5 w-3.5" />
                  </a>
                </div>
                {searchConfig.serper?.hasApiKey && (
                  <span className="flex items-center gap-1 text-xs text-green-600">
                    <CheckCircle className="h-3 w-3" />
                    Configured
                  </span>
                )}
              </div>
              <div className="space-y-2">
                <input
                  type="password"
                  value={serperApiKey}
                  onChange={(e) => setSerperApiKey(e.target.value)}
                  placeholder={
                    searchConfig.serper?.hasApiKey
                      ? '••••••••••••••••'
                      : 'Enter API key'
                  }
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 font-mono text-sm focus:border-purple-500 focus:outline-none focus:ring-1 focus:ring-purple-500"
                />
                <button
                  onClick={() => handleTest('serper')}
                  disabled={
                    testing === 'serper' ||
                    (!serperApiKey && !searchConfig.serper?.hasApiKey)
                  }
                  className="flex w-full items-center justify-center gap-2 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {testing === 'serper' ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    'Test Connection'
                  )}
                </button>
                {testResult?.provider === 'serper' && (
                  <div
                    className={`flex items-center gap-1 text-xs ${
                      testResult.success ? 'text-green-600' : 'text-red-600'
                    }`}
                  >
                    {testResult.success ? (
                      <CheckCircle className="h-3 w-3" />
                    ) : (
                      <XCircle className="h-3 w-3" />
                    )}
                    {testResult.message}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Save Button */}
          <div className="flex justify-end border-t border-gray-100 pt-4">
            <button
              onClick={handleSave}
              disabled={saving}
              className="flex items-center gap-2 rounded-lg bg-purple-600 px-6 py-2.5 text-sm font-semibold text-white shadow-lg shadow-purple-500/25 transition-all hover:bg-purple-700 disabled:opacity-50"
            >
              {saving ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Save className="h-4 w-4" />
              )}
              Save Configuration
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
