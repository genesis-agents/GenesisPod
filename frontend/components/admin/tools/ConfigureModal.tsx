'use client';

import { useState, useEffect } from 'react';
import { useTranslation } from '@/lib/i18n';
import {
  CheckCircle,
  Loader2,
  Save,
  ExternalLink,
  Eye,
  EyeOff,
  Lock,
  Key,
  X,
} from 'lucide-react';

interface Tool {
  id: string;
  name: string;
  category: string;
  secretKey?: string | null;
  hasApiKey?: boolean;
  noKeyRequired?: boolean;
  url?: string;
  freeQuota?: string;
  pricing?: string;
}

// Map tool categories to secret categories
const CATEGORY_TO_SECRET_CATEGORY: Record<string, string | null> = {
  'external-search': 'SEARCH',
  'external-extraction': 'EXTRACTION',
  'external-youtube': 'YOUTUBE',
  'external-tts': 'TTS',
  'external-skills': 'SKILLSMP',
  'external-finance': 'FINANCE',
  'policy-research': 'POLICY',
  'external-devtools': 'DEV_TOOLS',
  mcp: 'MCP',
};

interface ConfigureModalProps {
  tool: Tool;
  onClose: () => void;
  onSave: (
    toolId: string,
    apiKey: string,
    secretKey?: string | null
  ) => Promise<void>;
  saving: boolean;
  availableSecrets: Array<{
    name: string;
    displayName: string;
    category: string;
  }>;
}

export default function ConfigureModal({
  tool,
  onClose,
  onSave,
  saving,
  availableSecrets,
}: ConfigureModalProps) {
  const { t } = useTranslation();
  const [apiKey, setApiKey] = useState('');
  const [showKey, setShowKey] = useState(false);
  const [keySourceMode, setKeySourceMode] = useState<'direct' | 'secret'>(
    tool.secretKey ? 'secret' : 'direct'
  );
  const [selectedSecretKey, setSelectedSecretKey] = useState<string | null>(
    tool.secretKey || null
  );

  // Filter secrets by tool category
  const secretCategory = CATEGORY_TO_SECRET_CATEGORY[tool.category];
  const filteredSecrets = availableSecrets.filter(
    (s) => s.category === secretCategory
  );

  // Keyboard support - Escape to close
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (keySourceMode === 'secret') {
      await onSave(tool.id, '', selectedSecretKey);
    } else {
      await onSave(tool.id, apiKey, null);
    }
    setApiKey('');
  };

  const canSubmit = keySourceMode === 'secret' ? !!selectedSecretKey : !!apiKey;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="configure-modal-title"
    >
      <div className="w-full max-w-md rounded-xl bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4">
          <h3
            id="configure-modal-title"
            className="text-lg font-semibold text-gray-900"
          >
            {t('admin.tools.modal.configure', { name: tool.name })}
          </h3>
          <button
            onClick={onClose}
            className="rounded-lg p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="p-6">
          <div className="space-y-4">
            <div>
              <p className="text-sm text-gray-600">
                {t(`admin.tools.providers.${tool.id}.description`)}
              </p>
              <div className="mt-2 flex flex-wrap gap-1">
                {t(`admin.tools.providers.${tool.id}.features`)
                  .split(', ')
                  .map((feature: string) => (
                    <span
                      key={feature}
                      className="rounded-full bg-blue-50 px-2 py-0.5 text-xs text-blue-700"
                    >
                      {feature}
                    </span>
                  ))}
              </div>
            </div>

            {tool.noKeyRequired ? (
              <div className="rounded-lg bg-green-50 p-4 text-center">
                <CheckCircle className="mx-auto h-8 w-8 text-green-600" />
                <p className="mt-2 font-medium text-green-700">
                  {t('admin.tools.modal.noKeyRequired')}
                </p>
                <p className="text-sm text-green-600">
                  {t('admin.tools.modal.canUseDirectly')}
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                {/* Key Source Mode Toggle */}
                <div>
                  <label className="mb-2 block text-sm font-medium text-gray-700">
                    {t('admin.tools.modal.keySource')}
                  </label>
                  <div className="flex rounded-lg border border-gray-200 bg-gray-50 p-1">
                    <button
                      type="button"
                      onClick={() => setKeySourceMode('secret')}
                      className={`flex flex-1 items-center justify-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-all ${
                        keySourceMode === 'secret'
                          ? 'bg-white text-blue-600 shadow-sm'
                          : 'text-gray-600 hover:text-gray-900'
                      }`}
                    >
                      <Lock className="h-4 w-4" />
                      {t('admin.tools.modal.secretManager')}
                    </button>
                    <button
                      type="button"
                      onClick={() => setKeySourceMode('direct')}
                      className={`flex flex-1 items-center justify-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-all ${
                        keySourceMode === 'direct'
                          ? 'bg-white text-blue-600 shadow-sm'
                          : 'text-gray-600 hover:text-gray-900'
                      }`}
                    >
                      <Key className="h-4 w-4" />
                      {t('admin.tools.modal.directInput')}
                    </button>
                  </div>
                </div>

                {/* Secret Manager Selection */}
                {keySourceMode === 'secret' && (
                  <div>
                    <label className="mb-1.5 block text-sm font-medium text-gray-700">
                      {t('admin.tools.modal.selectSecret')}
                    </label>
                    {filteredSecrets.length > 0 ? (
                      <div className="space-y-2">
                        {filteredSecrets.map((secret) => (
                          <label
                            key={secret.name}
                            className={`flex cursor-pointer items-center gap-3 rounded-lg border p-3 transition-all ${
                              selectedSecretKey === secret.name
                                ? 'border-blue-500 bg-blue-50 ring-1 ring-blue-500'
                                : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                            }`}
                          >
                            <input
                              type="radio"
                              name="secretKey"
                              value={secret.name}
                              checked={selectedSecretKey === secret.name}
                              onChange={(e) =>
                                setSelectedSecretKey(e.target.value)
                              }
                              className="h-4 w-4 border-gray-300 text-blue-600 focus:ring-blue-500"
                            />
                            <div className="flex-1">
                              <div className="flex items-center gap-2">
                                <Lock className="h-4 w-4 text-gray-400" />
                                <span className="font-medium text-gray-900">
                                  {secret.displayName || secret.name}
                                </span>
                              </div>
                              <span className="text-xs text-gray-500">
                                {secret.name}
                              </span>
                            </div>
                            {selectedSecretKey === secret.name && (
                              <CheckCircle className="h-5 w-5 text-blue-600" />
                            )}
                          </label>
                        ))}
                      </div>
                    ) : (
                      <div className="rounded-lg border border-dashed border-gray-300 bg-gray-50 p-4 text-center">
                        <Lock className="mx-auto h-8 w-8 text-gray-400" />
                        <p className="mt-2 text-sm text-gray-600">
                          {t('admin.tools.modal.noSecretsAvailable')}
                        </p>
                        <p className="mt-1 text-xs text-gray-500">
                          {t('admin.tools.modal.addSecretsHint')}
                        </p>
                      </div>
                    )}
                    {tool.secretKey && (
                      <p className="mt-2 text-xs text-green-600">
                        <CheckCircle className="mr-1 inline h-3 w-3" />
                        {t('admin.tools.modal.currentSecret')}: {tool.secretKey}
                      </p>
                    )}
                  </div>
                )}

                {/* Direct API Key Input */}
                {keySourceMode === 'direct' && (
                  <div>
                    <label className="mb-1.5 block text-sm font-medium text-gray-700">
                      {t('admin.tools.modal.apiKey')}
                    </label>
                    <div className="relative">
                      <input
                        type={showKey ? 'text' : 'password'}
                        value={apiKey}
                        onChange={(e) => setApiKey(e.target.value)}
                        placeholder={
                          tool.hasApiKey ? '••••••••••••••••' : 'Enter API Key'
                        }
                        autoComplete="new-password"
                        spellCheck="false"
                        aria-label="API Key"
                        className="w-full rounded-lg border border-gray-300 px-3 py-2 pr-10 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                      />
                      <button
                        type="button"
                        onClick={() => setShowKey(!showKey)}
                        className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-gray-400 hover:text-gray-600"
                      >
                        {showKey ? (
                          <EyeOff className="h-4 w-4" />
                        ) : (
                          <Eye className="h-4 w-4" />
                        )}
                      </button>
                    </div>
                    {tool.hasApiKey && !tool.secretKey && (
                      <p className="mt-1 text-xs text-green-600">
                        <CheckCircle className="mr-1 inline h-3 w-3" />
                        {t('admin.tools.modal.apiKeyConfigured')}
                      </p>
                    )}
                    {tool.url && (
                      <a
                        href={tool.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="mt-2 inline-flex items-center gap-1 text-xs text-blue-600 hover:underline"
                      >
                        <ExternalLink className="h-3 w-3" />
                        {t('admin.tools.modal.getApiKey')}
                      </a>
                    )}
                  </div>
                )}
              </div>
            )}

            {(tool.freeQuota || tool.pricing) && (
              <div className="rounded-lg bg-gray-50 p-3">
                {tool.freeQuota && (
                  <p className="text-sm text-gray-600">
                    <span className="font-medium">
                      {t('admin.tools.modal.freeQuota')}:
                    </span>{' '}
                    {tool.freeQuota}
                  </p>
                )}
                {tool.pricing && (
                  <p className="text-sm text-gray-600">
                    <span className="font-medium">
                      {t('admin.tools.modal.pricing')}:
                    </span>{' '}
                    {tool.pricing}
                  </p>
                )}
              </div>
            )}
          </div>

          <div className="mt-6 flex justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              {t('admin.tools.modal.cancel')}
            </button>
            {!tool.noKeyRequired && (
              <button
                type="submit"
                disabled={saving || !canSubmit}
                className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {saving ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Save className="h-4 w-4" />
                )}
                {t('admin.tools.modal.save')}
              </button>
            )}
          </div>
        </form>
      </div>
    </div>
  );
}
