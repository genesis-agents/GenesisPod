'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { config } from '@/lib/utils/config';
import { getAuthHeader } from '@/lib/utils/auth';
import { useTranslation } from '@/lib/i18n';
import { createLogger } from '@/lib/utils/logger';
import { useAdminSecrets } from '@/hooks/domain/useAdminSecrets';
import {
  Search,
  CheckCircle,
  XCircle,
  Loader2,
  Save,
  ExternalLink,
  AlertTriangle,
  RefreshCw,
  Wallet,
  Eye,
  EyeOff,
  Settings,
  Play,
  Filter,
  Globe,
  FileText,
  Youtube,
  Volume2,
  Sparkles,
  Database,
  Tag,
  MoreHorizontal,
  ChevronDown,
  X,
  Key,
  Lock,
} from 'lucide-react';

const logger = createLogger('ToolsManagement');

// Tool category types
type ToolCategory =
  | 'all'
  | 'search'
  | 'extraction'
  | 'youtube'
  | 'tts'
  | 'skillsmp'
  | 'simulation';

// Tool interface - description, tags, features are obtained via i18n
interface Tool {
  id: string;
  name: string;
  category: ToolCategory;
  status: 'configured' | 'not_configured' | 'error';
  hasApiKey: boolean;
  noKeyRequired?: boolean;
  secretKey?: string | null; // Reference to Secret Manager secret name
  url?: string;
  freeQuota?: string;
  pricing?: string;
  balance?: {
    hasBalance: boolean;
    balance?: string;
    quota?: { used: number; limit: number };
    error?: string;
  };
}

// Map tool categories to secret categories
const CATEGORY_TO_SECRET_CATEGORY: Record<ToolCategory, string | null> = {
  all: null,
  search: 'SEARCH',
  extraction: 'EXTRACTION',
  youtube: 'YOUTUBE',
  tts: 'TTS',
  skillsmp: 'SKILLSMP',
  simulation: 'OTHER',
};

// Category configuration
const CATEGORIES: {
  id: ToolCategory;
  labelKey: string;
  icon: typeof Search;
}[] = [
  { id: 'all', labelKey: 'admin.tools.categories.all', icon: Filter },
  { id: 'search', labelKey: 'admin.tools.categories.search', icon: Search },
  {
    id: 'extraction',
    labelKey: 'admin.tools.categories.extraction',
    icon: FileText,
  },
  { id: 'youtube', labelKey: 'admin.tools.categories.youtube', icon: Youtube },
  { id: 'tts', labelKey: 'admin.tools.categories.tts', icon: Volume2 },
  {
    id: 'skillsmp',
    labelKey: 'admin.tools.categories.skillsmp',
    icon: Sparkles,
  },
  {
    id: 'simulation',
    labelKey: 'admin.tools.categories.simulation',
    icon: Database,
  },
];

// Tool definitions - description, tags, and features use translation keys
// Format: admin.tools.providers.{id}.{description|tags|features}
interface ToolDefinition {
  id: string;
  name: string;
  category: ToolCategory;
  url?: string;
  noKeyRequired?: boolean;
  freeQuota?: string;
  pricing?: string;
}

const TOOL_DEFINITIONS: ToolDefinition[] = [
  // Search Tools
  {
    id: 'perplexity',
    name: 'Perplexity',
    category: 'search',
    url: 'https://perplexity.ai',
  },
  {
    id: 'tavily',
    name: 'Tavily',
    category: 'search',
    url: 'https://tavily.com',
  },
  {
    id: 'serper',
    name: 'Serper',
    category: 'search',
    url: 'https://serper.dev',
  },
  {
    id: 'duckduckgo',
    name: 'DuckDuckGo',
    category: 'search',
    url: 'https://duckduckgo.com',
    noKeyRequired: true,
  },
  // Extraction Tools
  {
    id: 'jina',
    name: 'Jina AI Reader',
    category: 'extraction',
    url: 'https://jina.ai/reader',
    freeQuota: '1M tokens/month',
  },
  {
    id: 'firecrawl',
    name: 'Firecrawl',
    category: 'extraction',
    url: 'https://firecrawl.dev',
  },
  {
    id: 'tavilyExtract',
    name: 'Tavily Extract',
    category: 'extraction',
    url: 'https://tavily.com',
  },
  // YouTube Tools
  {
    id: 'supadata',
    name: 'Supadata',
    category: 'youtube',
    url: 'https://supadata.ai/youtube-transcript-api',
    freeQuota: '100/month',
    pricing: '$9/month (1000)',
  },
  // TTS Tools
  {
    id: 'elevenlabs',
    name: 'ElevenLabs',
    category: 'tts',
    url: 'https://elevenlabs.io',
    freeQuota: '10,000 chars/month',
    pricing: '$5/month+',
  },
  {
    id: 'googleTts',
    name: 'Google Cloud TTS',
    category: 'tts',
    url: 'https://cloud.google.com/text-to-speech',
    freeQuota: '4M chars/month',
    pricing: 'Usage-based',
  },
  // SkillsMP
  {
    id: 'skillsmp',
    name: 'SkillsMP',
    category: 'skillsmp',
    url: 'https://skillsmp.com',
    freeQuota: 'Basic search free',
    pricing: 'Free/Paid',
  },
  // Simulation Data Sources
  { id: 'marketData', name: 'Market & Pricing', category: 'simulation' },
  { id: 'financeData', name: 'Finance & Filings', category: 'simulation' },
  { id: 'newsData', name: 'News & Sentiment', category: 'simulation' },
  { id: 'regulationData', name: 'Regulation & Policy', category: 'simulation' },
];

// Category color mapping
const CATEGORY_COLORS: Record<
  ToolCategory,
  { bg: string; text: string; badge: string }
> = {
  all: {
    bg: 'bg-gray-100',
    text: 'text-gray-700',
    badge: 'bg-gray-100 text-gray-700',
  },
  search: {
    bg: 'bg-blue-50',
    text: 'text-blue-700',
    badge: 'bg-blue-100 text-blue-700',
  },
  extraction: {
    bg: 'bg-orange-50',
    text: 'text-orange-700',
    badge: 'bg-orange-100 text-orange-700',
  },
  youtube: {
    bg: 'bg-red-50',
    text: 'text-red-700',
    badge: 'bg-red-100 text-red-700',
  },
  tts: {
    bg: 'bg-purple-50',
    text: 'text-purple-700',
    badge: 'bg-purple-100 text-purple-700',
  },
  skillsmp: {
    bg: 'bg-violet-50',
    text: 'text-violet-700',
    badge: 'bg-violet-100 text-violet-700',
  },
  simulation: {
    bg: 'bg-emerald-50',
    text: 'text-emerald-700',
    badge: 'bg-emerald-100 text-emerald-700',
  },
};

// Tool Row Component
function ToolRow({
  tool,
  onConfigure,
  onTest,
  testing,
  testResult,
}: {
  tool: Tool;
  onConfigure: (tool: Tool) => void;
  onTest: (tool: Tool) => void;
  testing: boolean;
  testResult?: { success: boolean; message: string };
}) {
  const { t } = useTranslation();
  const categoryColor = CATEGORY_COLORS[tool.category];
  const categoryInfo = CATEGORIES.find((c) => c.id === tool.category);
  const CategoryIcon = categoryInfo?.icon || Globe;

  return (
    <div className="group flex items-center gap-4 border-b border-gray-100 px-4 py-4 transition-colors hover:bg-gray-50">
      {/* Status Indicator */}
      <div className="flex-shrink-0">
        {tool.noKeyRequired ? (
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-green-100">
            <CheckCircle className="h-5 w-5 text-green-600" />
          </div>
        ) : tool.status === 'configured' ? (
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-green-100">
            <CheckCircle className="h-5 w-5 text-green-600" />
          </div>
        ) : tool.status === 'error' ? (
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-red-100">
            <AlertTriangle className="h-5 w-5 text-red-600" />
          </div>
        ) : (
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-gray-100">
            <XCircle className="h-5 w-5 text-gray-400" />
          </div>
        )}
      </div>

      {/* Tool Info */}
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <h3 className="font-medium text-gray-900">{tool.name}</h3>
          <span
            className={`rounded-full px-2 py-0.5 text-xs font-medium ${categoryColor.badge}`}
          >
            {categoryInfo ? t(categoryInfo.labelKey) : tool.category}
          </span>
          {tool.noKeyRequired && (
            <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700">
              {t('admin.tools.free')}
            </span>
          )}
        </div>
        <p className="mt-0.5 truncate text-sm text-gray-500">
          {t(`admin.tools.providers.${tool.id}.description`)}
        </p>
        <div className="mt-1 flex flex-wrap gap-1">
          {t(`admin.tools.providers.${tool.id}.tags`)
            .split(', ')
            .map((tag) => (
              <span
                key={tag}
                className="inline-flex items-center rounded bg-gray-100 px-1.5 py-0.5 text-xs text-gray-600"
              >
                <Tag className="mr-0.5 h-3 w-3" />
                {tag}
              </span>
            ))}
        </div>
      </div>

      {/* Status & Quota */}
      <div className="hidden flex-shrink-0 flex-col items-end gap-1 sm:flex">
        {tool.balance?.hasBalance && (
          <div className="flex items-center gap-1 text-xs text-gray-500">
            <Wallet className="h-3 w-3" />
            <span>{tool.balance.balance || 'Available'}</span>
            {tool.balance.quota && (
              <span className="text-gray-400">
                ({tool.balance.quota.used}/{tool.balance.quota.limit})
              </span>
            )}
          </div>
        )}
        {tool.freeQuota && (
          <span className="text-xs text-gray-400">{tool.freeQuota}</span>
        )}
        {testResult && (
          <span
            className={`text-xs ${testResult.success ? 'text-green-600' : 'text-red-600'}`}
          >
            {testResult.message}
          </span>
        )}
      </div>

      {/* Actions */}
      <div className="flex flex-shrink-0 items-center gap-2">
        {!tool.noKeyRequired && (
          <button
            onClick={() => onTest(tool)}
            disabled={testing || !tool.hasApiKey}
            className="flex items-center gap-1 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {testing ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Play className="h-4 w-4" />
            )}
            <span className="hidden sm:inline">{t('admin.tools.test')}</span>
          </button>
        )}
        <button
          onClick={() => onConfigure(tool)}
          className="flex items-center gap-1 rounded-lg bg-blue-600 px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-blue-700"
        >
          <Settings className="h-4 w-4" />
          <span className="hidden sm:inline">{t('admin.tools.configure')}</span>
        </button>
        {tool.url && (
          <a
            href={tool.url}
            target="_blank"
            rel="noopener noreferrer"
            className="rounded-lg border border-gray-200 p-1.5 text-gray-500 transition-colors hover:bg-gray-50 hover:text-gray-700"
          >
            <ExternalLink className="h-4 w-4" />
          </a>
        )}
      </div>
    </div>
  );
}

// Configure Modal Component
function ConfigureModal({
  tool,
  onClose,
  onSave,
  saving,
  availableSecrets,
}: {
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
}) {
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

// Main Component
export default function ToolsManagement() {
  const { t } = useTranslation();
  const { secrets: availableSecrets, loading: secretsLoading } =
    useAdminSecrets();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [tools, setTools] = useState<Tool[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<ToolCategory>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [configuringTool, setConfiguringTool] = useState<Tool | null>(null);
  const [testingTool, setTestingTool] = useState<string | null>(null);
  const [testResults, setTestResults] = useState<
    Record<string, { success: boolean; message: string }>
  >({});
  const [message, setMessage] = useState<{
    type: 'success' | 'error';
    text: string;
  } | null>(null);

  // Load tool configurations
  const loadConfigs = useCallback(async () => {
    setLoading(true);
    try {
      // Use Promise.allSettled to handle partial failures gracefully
      const results = await Promise.allSettled([
        fetch(`${config.apiUrl}/admin/search-config`, {
          headers: { ...getAuthHeader() },
        }),
        fetch(`${config.apiUrl}/admin/extraction-config`, {
          headers: { ...getAuthHeader() },
        }),
        fetch(`${config.apiUrl}/admin/youtube-config`, {
          headers: { ...getAuthHeader() },
        }),
        fetch(`${config.apiUrl}/admin/tts-config`, {
          headers: { ...getAuthHeader() },
        }),
        fetch(`${config.apiUrl}/admin/skillsmp-config`, {
          headers: { ...getAuthHeader() },
        }),
        fetch(`${config.apiUrl}/admin/external-providers`, {
          headers: { ...getAuthHeader() },
        }),
      ]);

      // Extract responses, handling rejected promises
      const [
        searchRes,
        extractionRes,
        youtubeRes,
        ttsRes,
        skillsmpRes,
        providersRes,
      ] = results.map((result, idx) => {
        if (result.status === 'rejected') {
          logger.warn(`Config fetch failed at index ${idx}`, result.reason);
          return null;
        }
        return result.value;
      });

      const searchData = searchRes?.ok ? await searchRes.json() : null;
      const extractionData = extractionRes?.ok
        ? await extractionRes.json()
        : null;
      const youtubeData = youtubeRes?.ok ? await youtubeRes.json() : null;
      const ttsData = ttsRes?.ok ? await ttsRes.json() : null;
      const skillsmpData = skillsmpRes?.ok ? await skillsmpRes.json() : null;
      const providersData = providersRes?.ok ? await providersRes.json() : [];

      // Map tool definitions to tools with status
      const mappedTools: Tool[] = TOOL_DEFINITIONS.map((def) => {
        let hasApiKey = false;
        let status: Tool['status'] = 'not_configured';

        // Check search tools
        if (def.category === 'search' && searchData) {
          const providerData = searchData[def.id];
          if (providerData?.hasApiKey || def.noKeyRequired) {
            hasApiKey = providerData?.hasApiKey || false;
            status = 'configured';
          }
        }

        // Check extraction tools
        if (def.category === 'extraction' && extractionData) {
          const providerId = def.id === 'tavily-extract' ? 'tavily' : def.id;
          const providerData = extractionData[providerId];
          if (providerData?.hasApiKey) {
            hasApiKey = true;
            status = 'configured';
          }
        }

        // Check youtube tools
        if (def.category === 'youtube' && youtubeData) {
          const providerData = youtubeData[def.id];
          if (providerData?.hasApiKey) {
            hasApiKey = true;
            status = 'configured';
          }
        }

        // Check TTS tools
        if (def.category === 'tts' && ttsData) {
          const providerId = def.id === 'google-tts' ? 'google' : def.id;
          const providerData = ttsData[providerId];
          if (providerData?.hasApiKey) {
            hasApiKey = true;
            status = 'configured';
          }
        }

        // Check SkillsMP
        if (def.category === 'skillsmp' && skillsmpData) {
          if (skillsmpData.hasApiKey) {
            hasApiKey = true;
            status = 'configured';
          }
        }

        // Check simulation providers
        if (def.category === 'simulation' && Array.isArray(providersData)) {
          const categoryId = def.id.replace('-data', '');
          const hasProviders = providersData.some(
            (p: any) => p.category === categoryId && p.enabled
          );
          if (hasProviders) {
            hasApiKey = true;
            status = 'configured';
          }
        }

        // Handle no-key-required tools
        if (def.noKeyRequired) {
          status = 'configured';
        }

        return {
          ...def,
          hasApiKey,
          status,
        };
      });

      setTools(mappedTools);
    } catch (err) {
      logger.error('Failed to load configs:', err);
      setMessage({ type: 'error', text: t('admin.tools.loadFailed') });
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    loadConfigs();
  }, [loadConfigs]);

  // Filter tools
  const filteredTools = useMemo(() => {
    return tools.filter((tool) => {
      const matchesCategory =
        selectedCategory === 'all' || tool.category === selectedCategory;
      const description = t(`admin.tools.providers.${tool.id}.description`);
      const tags = t(`admin.tools.providers.${tool.id}.tags`);
      const matchesSearch =
        !searchQuery ||
        tool.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        description.toLowerCase().includes(searchQuery.toLowerCase()) ||
        tags.toLowerCase().includes(searchQuery.toLowerCase());
      return matchesCategory && matchesSearch;
    });
  }, [tools, selectedCategory, searchQuery, t]);

  // Statistics
  const stats = useMemo(() => {
    const total = tools.length;
    const configured = tools.filter((t) => t.status === 'configured').length;
    return { total, configured };
  }, [tools]);

  // Handle save configuration
  const handleSaveConfig = async (
    toolId: string,
    apiKey: string,
    secretKey?: string | null
  ) => {
    setSaving(true);
    setMessage(null);

    try {
      const tool = tools.find((t) => t.id === toolId);
      if (!tool) return;

      let endpoint = '';
      let body: Record<string, any> = {};

      switch (tool.category) {
        case 'search':
          endpoint = '/admin/search-config';
          if (toolId === 'tavily') {
            body = { tavilyApiKeys: [apiKey] };
          } else if (toolId === 'serper') {
            body = { serperApiKeys: [apiKey] };
          } else {
            body = { [`${toolId}ApiKey`]: apiKey };
          }
          break;
        case 'extraction':
          endpoint = '/admin/extraction-config';
          const extractId = toolId === 'tavily-extract' ? 'tavily' : toolId;
          body = { [`${extractId}ApiKey`]: apiKey };
          break;
        case 'youtube':
          endpoint = '/admin/youtube-config';
          body = { [`${toolId}ApiKey`]: apiKey };
          break;
        case 'tts':
          endpoint = '/admin/tts-config';
          const ttsId = toolId === 'google-tts' ? 'google' : toolId;
          body = { [`${ttsId}ApiKey`]: apiKey };
          break;
        case 'skillsmp':
          endpoint = '/admin/skillsmp-config';
          body = { apiKey };
          break;
        default:
          throw new Error('Unsupported tool category');
      }

      const res = await fetch(`${config.apiUrl}${endpoint}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          ...getAuthHeader(),
        },
        body: JSON.stringify(body),
      });

      if (res.ok) {
        setMessage({
          type: 'success',
          text: t('admin.tools.saveSuccess', { name: tool.name }),
        });
        setConfiguringTool(null);
        await loadConfigs();
        setTimeout(() => setMessage(null), 3000);
      } else {
        setMessage({ type: 'error', text: t('admin.tools.saveFailed') });
      }
    } catch (err) {
      logger.error('Failed to save config:', err);
      setMessage({ type: 'error', text: t('admin.tools.saveFailed') });
    } finally {
      setSaving(false);
    }
  };

  // Handle test tool
  const handleTestTool = async (tool: Tool) => {
    if (!tool.hasApiKey) return;

    setTestingTool(tool.id);
    setTestResults((prev) => ({
      ...prev,
      [tool.id]: { success: false, message: '' },
    }));

    try {
      let endpoint = '';
      const providerId = tool.id;

      switch (tool.category) {
        case 'search':
          endpoint = `/admin/search-config/test`;
          break;
        case 'extraction':
          endpoint = `/admin/extraction-config/test`;
          break;
        case 'youtube':
          endpoint = `/admin/youtube-config/test`;
          break;
        case 'tts':
          endpoint = `/admin/tts-config/test`;
          break;
        case 'skillsmp':
          endpoint = `/admin/skillsmp-config/test`;
          break;
        default:
          setTestResults((prev) => ({
            ...prev,
            [tool.id]: {
              success: false,
              message: t('admin.tools.notSupported'),
            },
          }));
          setTestingTool(null);
          return;
      }

      const res = await fetch(`${config.apiUrl}${endpoint}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...getAuthHeader(),
        },
        body: JSON.stringify({ provider: providerId }),
      });

      const data = await res.json();
      setTestResults((prev) => ({
        ...prev,
        [tool.id]: {
          success: data.success ?? res.ok,
          message:
            data.message ||
            (res.ok
              ? t('admin.tools.testSuccess')
              : t('admin.tools.testFailed')),
        },
      }));
    } catch (err: any) {
      setTestResults((prev) => ({
        ...prev,
        [tool.id]: {
          success: false,
          message: err.message || t('admin.tools.testFailed'),
        },
      }));
    } finally {
      setTestingTool(null);
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
    <div className="space-y-6">
      {/* Header Stats */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div className="rounded-lg bg-blue-50 px-3 py-1.5">
            <span className="text-sm text-blue-700">
              <span className="font-semibold">{stats.configured}</span> /{' '}
              {stats.total} {t('admin.tools.configured')}
            </span>
          </div>
        </div>
        <button
          onClick={loadConfigs}
          disabled={loading}
          className="flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50"
        >
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          {t('admin.tools.refresh')}
        </button>
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

      {/* Filters */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        {/* Category Filter */}
        <div className="flex flex-wrap gap-2">
          {CATEGORIES.map((category) => {
            const Icon = category.icon;
            const isActive = selectedCategory === category.id;
            const count =
              category.id === 'all'
                ? tools.length
                : tools.filter((t) => t.category === category.id).length;

            return (
              <button
                key={category.id}
                onClick={() => setSelectedCategory(category.id)}
                className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
                  isActive
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                <Icon className="h-4 w-4" />
                <span>{t(category.labelKey)}</span>
                <span
                  className={`rounded-full px-1.5 py-0.5 text-xs ${
                    isActive
                      ? 'bg-blue-500 text-white'
                      : 'bg-gray-200 text-gray-600'
                  }`}
                >
                  {count}
                </span>
              </button>
            );
          })}
        </div>

        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={t('admin.tools.searchPlaceholder')}
            className="w-full rounded-lg border border-gray-200 bg-white py-2 pl-10 pr-4 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 sm:w-64"
          />
        </div>
      </div>

      {/* Tools List */}
      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
        {filteredTools.length === 0 ? (
          <div className="p-8 text-center text-gray-500">
            <Globe className="mx-auto h-12 w-12 text-gray-300" />
            <p className="mt-2">{t('admin.tools.noToolsFound')}</p>
          </div>
        ) : (
          filteredTools.map((tool) => (
            <ToolRow
              key={tool.id}
              tool={tool}
              onConfigure={setConfiguringTool}
              onTest={handleTestTool}
              testing={testingTool === tool.id}
              testResult={testResults[tool.id]}
            />
          ))
        )}
      </div>

      {/* Configure Modal */}
      {configuringTool && (
        <ConfigureModal
          tool={configuringTool}
          onClose={() => setConfiguringTool(null)}
          onSave={handleSaveConfig}
          saving={saving}
          availableSecrets={availableSecrets || []}
        />
      )}
    </div>
  );
}
