'use client';

import { useState, useCallback } from 'react';
import {
  Key,
  Shield,
  TestTube2,
  Check,
  X,
  ChevronDown,
  ChevronUp,
  Heart,
  Lock,
  Trash2,
  Loader2,
  Info,
} from 'lucide-react';
import { useTranslation } from '@/lib/i18n';
import {
  useUserApiKeys,
  type UserApiKeyInfo,
  type ProviderInfo,
} from '@/hooks/features/useUserApiKeys';

const PROVIDER_ICONS: Record<string, { color: string; icon: string }> = {
  openai: {
    color: 'bg-green-100 text-green-700',
    icon: '/icons/ai/openai.svg',
  },
  anthropic: {
    color: 'bg-orange-100 text-orange-700',
    icon: '/icons/ai/claude.svg',
  },
  deepseek: {
    color: 'bg-blue-100 text-blue-700',
    icon: '/icons/ai/deepseek.svg',
  },
  google: { color: 'bg-blue-100 text-blue-600', icon: '/icons/ai/gemini.svg' },
  xai: { color: 'bg-gray-100 text-gray-700', icon: '/icons/ai/grok.svg' },
  qwen: { color: 'bg-purple-100 text-purple-700', icon: '/icons/ai/qwen.svg' },
  cohere: { color: 'bg-indigo-100 text-indigo-700', icon: '' },
  groq: { color: 'bg-red-100 text-red-600', icon: '/icons/ai/groq.svg' },
  openrouter: {
    color: 'bg-violet-100 text-violet-700',
    icon: '/icons/ai/openrouter.svg',
  },
  minimax: {
    color: 'bg-slate-100 text-slate-700',
    icon: '/icons/ai/minimax.svg',
  },
  voyage: { color: 'bg-teal-100 text-teal-700', icon: '' },
};

function ProviderKeyCard({
  provider,
  existingKey,
  onSave,
  onDelete,
  onTest,
  onWithdrawDonation,
  saving,
  testing,
}: {
  provider: ProviderInfo;
  existingKey?: UserApiKeyInfo;
  onSave: (
    provider: string,
    apiKey: string,
    mode: 'personal' | 'donated',
    preferredModelId?: string,
    apiEndpoint?: string
  ) => Promise<boolean>;
  onDelete: (provider: string) => Promise<boolean>;
  onTest: (
    provider: string,
    apiKey: string,
    apiEndpoint?: string
  ) => Promise<{ success: boolean; message: string }>;
  onWithdrawDonation: (provider: string) => Promise<boolean>;
  saving: boolean;
  testing: boolean;
}) {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(false);
  const [apiKey, setApiKey] = useState('');
  const [mode, setMode] = useState<'personal' | 'donated'>('personal');
  const [apiEndpoint, setApiEndpoint] = useState('');
  const [preferredModelId, setPreferredModelId] = useState(
    existingKey?.preferredModelId || ''
  );
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [testResult, setTestResult] = useState<{
    success: boolean;
    message: string;
  } | null>(null);
  const [showKey, setShowKey] = useState(false);

  const iconInfo = PROVIDER_ICONS[provider.id] || {
    color: 'bg-gray-100 text-gray-700',
    icon: '',
  };

  const statusLabel = existingKey
    ? existingKey.mode === 'donated'
      ? t('profile.apiKeys.statusDonated')
      : t('profile.apiKeys.statusPersonal')
    : t('profile.apiKeys.statusNotConfigured');

  const statusColor = existingKey
    ? existingKey.mode === 'donated'
      ? 'text-pink-600'
      : 'text-green-600'
    : 'text-gray-400';

  const statusIcon = existingKey ? (
    existingKey.mode === 'donated' ? (
      <Heart className="h-3.5 w-3.5" />
    ) : (
      <Lock className="h-3.5 w-3.5" />
    )
  ) : null;

  const handleTest = useCallback(async () => {
    if (!apiKey.trim() || testing) return;
    const result = await onTest(provider.id, apiKey, apiEndpoint || undefined);
    setTestResult(result);
  }, [apiKey, apiEndpoint, provider.id, onTest, testing]);

  const handleSave = useCallback(async () => {
    if (!apiKey.trim() || saving) return;
    const success = await onSave(
      provider.id,
      apiKey,
      mode,
      preferredModelId.trim() || undefined,
      apiEndpoint || undefined
    );
    if (success) {
      setApiKey('');
      setExpanded(false);
      setTestResult(null);
    }
  }, [
    apiKey,
    mode,
    preferredModelId,
    apiEndpoint,
    provider.id,
    onSave,
    saving,
  ]);

  const handleDelete = useCallback(async () => {
    if (saving) return;
    await onDelete(provider.id);
  }, [provider.id, onDelete, saving]);

  const handleWithdraw = useCallback(async () => {
    if (saving) return;
    await onWithdrawDonation(provider.id);
  }, [provider.id, onWithdrawDonation, saving]);

  return (
    <div className="rounded-lg border border-gray-200 bg-white">
      <div
        className="flex cursor-pointer items-center justify-between px-4 py-3"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex items-center gap-3">
          <div
            className={`flex h-9 w-9 items-center justify-center rounded-lg ${iconInfo.color}`}
          >
            {iconInfo.icon ? (
              <img
                src={iconInfo.icon}
                alt={provider.name}
                className="h-5 w-5"
              />
            ) : (
              <Key className="h-4 w-4" />
            )}
          </div>
          <span className="font-medium text-gray-900">{provider.name}</span>
        </div>

        <div className="flex items-center gap-3">
          <span className={`flex items-center gap-1 text-sm ${statusColor}`}>
            {statusIcon}
            {statusLabel}
          </span>
          <button className="text-sm text-blue-600 hover:text-blue-800">
            {existingKey
              ? t('profile.apiKeys.manage')
              : t('profile.apiKeys.configure')}
          </button>
          {expanded ? (
            <ChevronUp className="h-4 w-4 text-gray-400" />
          ) : (
            <ChevronDown className="h-4 w-4 text-gray-400" />
          )}
        </div>
      </div>

      {existingKey && !expanded && (
        <div className="border-t border-gray-100 px-4 py-2 text-sm text-gray-500">
          <span>{existingKey.keyHint}</span>
          {existingKey.mode === 'donated' && existingKey.usageCount > 0 && (
            <span className="ml-3">
              {t('profile.apiKeys.callsContributed', {
                count: existingKey.usageCount,
              })}
            </span>
          )}
        </div>
      )}

      {expanded && (
        <div className="space-y-4 border-t border-gray-100 px-4 py-4">
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">
              API Key *
            </label>
            <div className="relative">
              <input
                type={showKey ? 'text' : 'password'}
                value={apiKey}
                onChange={(e) => {
                  setApiKey(e.target.value);
                  setTestResult(null);
                }}
                placeholder={
                  existingKey
                    ? t('profile.apiKeys.enterNewKey')
                    : t('profile.apiKeys.enterKey')
                }
                className="w-full rounded-md border border-gray-300 px-3 py-2 pr-10 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
              <button
                type="button"
                onClick={() => setShowKey(!showKey)}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
              >
                {showKey ? (
                  <X className="h-4 w-4" />
                ) : (
                  <Shield className="h-4 w-4" />
                )}
              </button>
            </div>
          </div>

          {existingKey && (
            <div className="rounded-md border border-blue-200 bg-blue-50 p-3 text-xs text-blue-800">
              下一步：前往「我的模型」Tab，为这个 Key 添加自定义模型
              （界面和字段与管理员的「模型管理」完全一致）。
            </div>
          )}

          <div>
            <label className="mb-2 block text-sm font-medium text-gray-700">
              {t('profile.apiKeys.usageMode')}
            </label>
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setMode('personal')}
                className={`rounded-lg border-2 p-3 text-left transition-colors ${
                  mode === 'personal'
                    ? 'border-blue-500 bg-blue-50'
                    : 'border-gray-200 hover:border-gray-300'
                }`}
              >
                <div className="flex items-center gap-2">
                  <Lock className="h-4 w-4 text-blue-600" />
                  <span className="text-sm font-medium">
                    {t('profile.apiKeys.modePersonal')}
                  </span>
                </div>
                <p className="mt-1 text-xs text-gray-500">
                  {t('profile.apiKeys.modePersonalDesc')}
                </p>
              </button>
              <button
                type="button"
                onClick={() => setMode('donated')}
                className={`rounded-lg border-2 p-3 text-left transition-colors ${
                  mode === 'donated'
                    ? 'border-pink-500 bg-pink-50'
                    : 'border-gray-200 hover:border-gray-300'
                }`}
              >
                <div className="flex items-center gap-2">
                  <Heart className="h-4 w-4 text-pink-600" />
                  <span className="text-sm font-medium">
                    {t('profile.apiKeys.modeDonated')}
                  </span>
                </div>
                <p className="mt-1 text-xs text-gray-500">
                  {t('profile.apiKeys.modeDonatedDesc')}
                </p>
              </button>
            </div>
          </div>

          {mode === 'donated' && (
            <div className="flex items-start gap-2 rounded-md bg-pink-50 p-3 text-sm text-pink-800">
              <Info className="mt-0.5 h-4 w-4 shrink-0" />
              <p>{t('profile.apiKeys.donationNote')}</p>
            </div>
          )}

          <div>
            <button
              type="button"
              onClick={() => setShowAdvanced(!showAdvanced)}
              className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700"
            >
              {showAdvanced ? (
                <ChevronUp className="h-3 w-3" />
              ) : (
                <ChevronDown className="h-3 w-3" />
              )}
              {t('profile.apiKeys.advancedSettings')}
            </button>
            {showAdvanced && (
              <div className="mt-2">
                <label className="mb-1 block text-xs text-gray-500">
                  {t('profile.apiKeys.customEndpoint')}
                </label>
                <input
                  type="text"
                  value={apiEndpoint}
                  onChange={(e) => setApiEndpoint(e.target.value)}
                  placeholder={provider.endpoint}
                  className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>
            )}
          </div>

          {testResult && (
            <div
              className={`flex items-center gap-2 rounded-md p-2 text-sm ${
                testResult.success
                  ? 'bg-green-50 text-green-700'
                  : 'bg-red-50 text-red-700'
              }`}
            >
              {testResult.success ? (
                <Check className="h-4 w-4" />
              ) : (
                <X className="h-4 w-4" />
              )}
              {testResult.message}
            </div>
          )}

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleTest}
              disabled={!apiKey.trim() || testing}
              className="inline-flex items-center gap-1.5 rounded-md border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
            >
              {testing ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <TestTube2 className="h-3.5 w-3.5" />
              )}
              {t('profile.apiKeys.testConnection')}
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={!apiKey.trim() || saving}
              className="inline-flex items-center gap-1.5 rounded-md bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {saving ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Check className="h-3.5 w-3.5" />
              )}
              {t('profile.apiKeys.save')}
            </button>

            {existingKey && (
              <>
                {existingKey.mode === 'donated' ? (
                  <button
                    type="button"
                    onClick={handleWithdraw}
                    disabled={saving}
                    className="ml-auto inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm text-orange-600 hover:bg-orange-50"
                  >
                    {t('profile.apiKeys.withdrawDonation')}
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={handleDelete}
                    disabled={saving}
                    className="ml-auto inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm text-red-600 hover:bg-red-50"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    {t('profile.apiKeys.delete')}
                  </button>
                )}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export function UserApiKeysTab() {
  const { t } = useTranslation();
  const {
    keys,
    providers,
    loading,
    saving,
    testing,
    saveKey,
    deleteKey,
    testKey,
    withdrawDonation,
    getKeyForProvider,
  } = useUserApiKeys();

  const donatedCount = keys.filter((k) => k.mode === 'donated').length;

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="rounded-lg border border-blue-200 bg-blue-50 p-4">
        <p className="text-sm text-blue-800">
          {t('profile.apiKeys.infoBanner')}
        </p>
      </div>

      <div className="flex items-center gap-4 rounded-lg border border-gray-200 bg-white px-4 py-3 text-sm">
        <span className="text-gray-500">
          {t('profile.apiKeys.configured')}: <strong>{keys.length}</strong>
        </span>
        <span className="text-gray-300">|</span>
        <span className="text-gray-500">
          {t('profile.apiKeys.donated')}: <strong>{donatedCount}</strong>
        </span>
      </div>

      <div className="space-y-3">
        {providers.map((provider) => (
          <ProviderKeyCard
            key={provider.id}
            provider={provider}
            existingKey={getKeyForProvider(provider.id)}
            onSave={saveKey}
            onDelete={deleteKey}
            onTest={testKey}
            onWithdrawDonation={withdrawDonation}
            saving={saving}
            testing={testing}
          />
        ))}
      </div>
    </div>
  );
}
