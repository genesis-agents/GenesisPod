'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { config } from '@/lib/utils/config';
import { getAuthHeader } from '@/lib/utils/auth';
import { useTranslation } from '@/lib/i18n';
import { createLogger } from '@/lib/utils/logger';
import { useAdminSecrets } from '@/hooks/domain/useAdminSecrets';
import {
  CheckCircle,
  AlertTriangle,
  RefreshCw,
  Zap,
  Server,
  BookOpen,
} from 'lucide-react';

import type { BuiltinTool, ExternalTool } from './tools/types';
import MCPMarketplaceTab, { MCPServer } from './tools/MCPMarketplaceTab';
import ConfigureModal from './tools/ConfigureModal';
import CapabilitiesTab from './tools/CapabilitiesTab';
import IndustryReportSourcesTab from './tools/IndustryReportSourcesTab';
import {
  CAPABILITY_DEFINITIONS,
  getIndependentProviderIds,
  type ProviderDefinition,
} from './tools/capability-mapping';
import { useToolAliases } from '@/hooks/domain/useToolAliases';

const logger = createLogger('ToolsManagement');

// External tool definition type
interface ExternalToolDefinition {
  id: string;
  name: string;
  category: string;
  url: string;
  noKeyRequired?: boolean;
  freeQuota?: string;
  pricing?: string;
}

// External tool definitions (from original file)
const EXTERNAL_TOOL_DEFINITIONS: ExternalToolDefinition[] = [
  // Search Tools
  {
    id: 'perplexity',
    name: 'Perplexity',
    category: 'external-search',
    url: 'https://perplexity.ai',
  },
  {
    id: 'tavily',
    name: 'Tavily',
    category: 'external-search',
    url: 'https://tavily.com',
  },
  {
    id: 'serper',
    name: 'Serper',
    category: 'external-search',
    url: 'https://serper.dev',
  },
  {
    id: 'duckduckgo',
    name: 'DuckDuckGo',
    category: 'external-search',
    url: 'https://duckduckgo.com',
    noKeyRequired: true,
  },
  // Extraction Tools
  {
    id: 'jina',
    name: 'Jina AI Reader',
    category: 'external-extraction',
    url: 'https://jina.ai/reader',
    freeQuota: '1M tokens/month',
  },
  {
    id: 'firecrawl',
    name: 'Firecrawl',
    category: 'external-extraction',
    url: 'https://firecrawl.dev',
  },
  {
    id: 'tavilyExtract',
    name: 'Tavily Extract',
    category: 'external-extraction',
    url: 'https://tavily.com',
  },
  // YouTube Tools
  {
    id: 'supadata',
    name: 'Supadata',
    category: 'external-youtube',
    url: 'https://supadata.ai/youtube-transcript-api',
    freeQuota: '100/month',
    pricing: '$9/month (1000)',
  },
  // TTS Tools
  {
    id: 'elevenlabs',
    name: 'ElevenLabs',
    category: 'external-tts',
    url: 'https://elevenlabs.io',
    freeQuota: '10,000 chars/month',
    pricing: '$5/month+',
  },
  {
    id: 'googleTts',
    name: 'Google Cloud TTS',
    category: 'external-tts',
    url: 'https://cloud.google.com/text-to-speech',
    freeQuota: '4M chars/month',
    pricing: 'Usage-based',
  },
  // SkillsMP
  {
    id: 'skillsmp',
    name: 'SkillsMP',
    category: 'external-skills',
    url: 'https://skillsmp.com',
    freeQuota: 'Basic search free',
    pricing: 'Free/Paid',
  },
  // Community
  {
    id: 'hackernews',
    name: 'Hacker News',
    category: 'external-search',
    url: 'https://hn.algolia.com/api',
    noKeyRequired: true,
  },
  // Academic Research
  {
    id: 'semantic-scholar',
    name: 'Semantic Scholar',
    category: 'external-academic',
    url: 'https://www.semanticscholar.org',
    freeQuota: '100 requests/5 min (free)',
    pricing: 'Free API key for higher limits',
  },
  {
    id: 'pubmed',
    name: 'PubMed (NCBI)',
    category: 'external-academic',
    url: 'https://pubmed.ncbi.nlm.nih.gov',
    freeQuota: '3 req/s (free), 10 req/s (with key)',
  },
  {
    id: 'openalex',
    name: 'OpenAlex',
    category: 'external-academic',
    url: 'https://openalex.org',
    freeQuota: '10 req/s (no mailto), unlimited (polite pool)',
  },
  {
    id: 'arxiv',
    name: 'arXiv',
    category: 'external-academic',
    url: 'https://arxiv.org',
    noKeyRequired: true,
  },
  // Finance Data
  {
    id: 'alpha-vantage',
    name: 'Alpha Vantage',
    category: 'external-finance',
    url: 'https://www.alphavantage.co',
    freeQuota: '25 requests/day',
  },
  // Weather Data
  {
    id: 'weather-api',
    name: 'OpenWeatherMap',
    category: 'external-weather',
    url: 'https://openweathermap.org',
    freeQuota: '60 req/min, 1,000 req/day',
  },
  // Policy Research Tools
  {
    id: 'federal-register',
    name: 'Federal Register',
    category: 'policy-research',
    url: 'https://www.federalregister.gov/developers/documentation/api/v1',
    noKeyRequired: true,
  },
  {
    id: 'congress-gov',
    name: 'Congress.gov',
    category: 'policy-research',
    url: 'https://api.congress.gov/',
    freeQuota: '5,000 requests/hour',
  },
  {
    id: 'whitehouse-news',
    name: 'White House News',
    category: 'policy-research',
    url: 'https://www.whitehouse.gov/news/',
    noKeyRequired: true,
  },
  // Dev Tools
  {
    id: 'github-search',
    name: 'GitHub',
    category: 'external-devtools',
    url: 'https://github.com',
    freeQuota: '60 requests/hour (unauthenticated)',
    pricing: '5,000 requests/hour (authenticated)',
  },
  // Image Search Tools
  {
    id: 'serpapi-image-search',
    name: 'SerpAPI',
    category: 'external-image-search',
    url: 'https://serpapi.com',
    freeQuota: '100 searches/month',
    pricing: '$50/month (5000)',
  },
  {
    id: 'bing-image-search',
    name: 'Bing Image Search',
    category: 'external-image-search',
    url: 'https://www.microsoft.com/en-us/bing/apis/bing-image-search-api',
    pricing: '$3/1000 transactions',
  },
  {
    id: 'google-image-search',
    name: 'Google Custom Search',
    category: 'external-image-search',
    url: 'https://developers.google.com/custom-search',
    freeQuota: '100 queries/day',
    pricing: '$5/1000 queries',
  },
];

type TabType = 'ai-tools' | 'mcp' | 'report-sources';

export default function ToolsManagement() {
  const { t } = useTranslation();
  const { secrets: availableSecrets } = useAdminSecrets();
  // ★ 2026-05-07 (PR-S0a): alias map 从 backend 单源拉取，消除前端硬编码漂移
  const {
    aliasToRegistry,
    multiProviderRegistryIds,
    loading: aliasesLoading,
  } = useToolAliases();

  const [activeTab, setActiveTab] = useState<TabType>('ai-tools');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Builtin tools state
  const [builtinTools, setBuiltinTools] = useState<BuiltinTool[]>([]);

  // External tools state
  const [externalTools, setExternalTools] = useState<ExternalTool[]>([]);
  const [configuringTool, setConfiguringTool] = useState<ExternalTool | null>(
    null
  );
  const [testingTool, setTestingTool] = useState<string | null>(null);
  const [deletingTool, setDeletingTool] = useState<string | null>(null);
  const [testResults, setTestResults] = useState<
    Record<string, { success: boolean; message: string }>
  >({});

  // MCP servers state
  const [mcpServers, setMcpServers] = useState<MCPServer[]>([]);
  const [connectingServer, setConnectingServer] = useState<string | null>(null);
  const [deletingServer, setDeletingServer] = useState<string | null>(null);

  const [message, setMessage] = useState<{
    type: 'success' | 'error';
    text: string;
  } | null>(null);

  // Load all configurations
  const loadConfigs = useCallback(async () => {
    setLoading(true);
    try {
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
        fetch(`${config.apiUrl}/admin/ai/all-configs`, {
          headers: { ...getAuthHeader() },
        }),
      ]);

      const [
        searchRes,
        extractionRes,
        youtubeRes,
        ttsRes,
        skillsmpRes,
        allConfigsRes,
      ] = results.map((result) => {
        if (result.status === 'rejected') return null;
        return result.value;
      });

      // Helper to unwrap API response { success: true, data: T }
      const unwrapResponse = async (res: Response | null) => {
        if (!res?.ok) return null;
        const json = await res.json();
        return json?.data ?? json;
      };

      const searchData = await unwrapResponse(searchRes);
      const extractionData = await unwrapResponse(extractionRes);
      const youtubeData = await unwrapResponse(youtubeRes);
      const ttsData = await unwrapResponse(ttsRes);
      const skillsmpData = await unwrapResponse(skillsmpRes);

      const allConfigsRaw = await unwrapResponse(allConfigsRes);
      const allConfigsData = allConfigsRaw || {
        tools: null,
        mcpServers: { servers: [] },
      };
      const capabilitiesData = allConfigsData.tools;
      const mcpServersData = allConfigsData.mcpServers || { servers: [] };

      // Build secret key map + config apiKey map
      const secretKeyMap = new Map<string, string | null>();
      const configApiKeyMap = new Set<string>();
      if (capabilitiesData?.tools) {
        capabilitiesData.tools.forEach(
          (tool: {
            toolId: string;
            secretKey?: string | null;
            config?: Record<string, unknown> | null;
          }) => {
            if (tool.secretKey) {
              secretKeyMap.set(tool.toolId, tool.secretKey);
            }
            // Also track tools with apiKey stored in config (no legacy endpoint)
            if (
              tool.config &&
              typeof tool.config === 'object' &&
              tool.config.apiKey
            ) {
              configApiKeyMap.add(tool.toolId);
            }
          }
        );
      }

      // ★ Bridge provider ID ↔ registry ID gap
      // Frontend uses provider IDs (e.g. "openalex"), backend ToolRegistry uses
      // registry IDs (e.g. "openalex-search"). After restart, DB may only have
      // the registry ID row. Propagate secretKey/configApiKey across both IDs.
      //
      // ★ 2026-05-07 (Screenshot_5 修): N:1 映射（多 provider → 同一 registry，
      // 例 web-search ← {tavily,perplexity,serper,duckduckgo}）下，registry 行
      // 的 secretKey 是被任一 sibling 配置时 last-write-wins 写入的垃圾值，**绝不**
      // 能继承给其他 sibling provider —— 那会让 Tavily 的 key 显示在 Perplexity 的
      // dialog 里。1:1 映射（arxiv→arxiv-search 等）继续走 bridge。
      //
      // ★ 2026-05-07 (PR-S0a): aliasToRegistry / multiProviderRegistryIds 从
      // backend 单源 hook 来；hook loading 期间 map 是空 → 此循环零次迭代 →
      // bridge 跳过，admin 看到的 secret/tool 关联仍直读 ToolConfig 不会出现
      // 幻觉链接（接受短暂"无 inferred 关联"的状态优于双源漂移）。
      for (const [providerId, registryId] of Object.entries(aliasToRegistry)) {
        if (providerId === registryId) continue;
        const isMultiProviderParent = multiProviderRegistryIds.has(registryId);

        const providerSecret = secretKeyMap.get(providerId);
        const registrySecret = secretKeyMap.get(registryId);
        if (!isMultiProviderParent) {
          if (registrySecret && !providerSecret) {
            secretKeyMap.set(providerId, registrySecret);
          } else if (providerSecret && !registrySecret) {
            secretKeyMap.set(registryId, providerSecret);
          }
        }
        if (!isMultiProviderParent) {
          if (
            configApiKeyMap.has(registryId) &&
            !configApiKeyMap.has(providerId)
          ) {
            configApiKeyMap.add(providerId);
          } else if (
            configApiKeyMap.has(providerId) &&
            !configApiKeyMap.has(registryId)
          ) {
            configApiKeyMap.add(registryId);
          }
        }
      }

      // Map builtin tools
      // 获取所有 CAPABILITY_DEFINITIONS 中定义的工具 ID（包括独立 providers）
      const capabilityToolIds = new Set<string>(
        CAPABILITY_DEFINITIONS.map((cap) => cap.id)
      );
      // 添加独立 provider IDs（如政策研究的各个工具）
      const independentProviderIds = getIndependentProviderIds();
      independentProviderIds.forEach((id) => capabilityToolIds.add(id));

      const builtinToolsData: BuiltinTool[] = (capabilitiesData?.tools || [])
        .filter((tool: { toolId: string }) =>
          capabilityToolIds.has(tool.toolId)
        )
        .map(
          (tool: {
            toolId: string;
            name: string;
            displayName?: string;
            description?: string;
            category: string;
            enabled: boolean;
            implemented: boolean;
          }) => ({
            id: tool.toolId,
            name: tool.name,
            displayName: tool.displayName,
            category: tool.category,
            enabled: tool.enabled,
            implemented: tool.implemented,
            description: tool.description,
          })
        );
      setBuiltinTools(builtinToolsData);

      // Map external tools
      const externalToolsData: ExternalTool[] = EXTERNAL_TOOL_DEFINITIONS.map(
        (def) => {
          let hasApiKey = false;
          let status: 'configured' | 'not_configured' | 'error' =
            'not_configured';

          if (def.category === 'external-search' && searchData) {
            const providerData = searchData[def.id];
            if (providerData?.hasApiKey || def.noKeyRequired) {
              hasApiKey = providerData?.hasApiKey || false;
              status = 'configured';
            }
          }

          if (def.category === 'external-extraction' && extractionData) {
            const providerId = def.id === 'tavilyExtract' ? 'tavily' : def.id;
            const providerData = extractionData[providerId];
            if (providerData?.hasApiKey) {
              hasApiKey = true;
              status = 'configured';
            }
          }

          if (def.category === 'external-youtube' && youtubeData) {
            const providerData = youtubeData[def.id];
            if (providerData?.hasApiKey) {
              hasApiKey = true;
              status = 'configured';
            }
          }

          if (def.category === 'external-tts' && ttsData) {
            const providerId = def.id === 'googleTts' ? 'google' : def.id;
            const providerData = ttsData[providerId];
            if (providerData?.hasApiKey) {
              hasApiKey = true;
              status = 'configured';
            }
          }

          if (def.category === 'external-skills' && skillsmpData) {
            if (skillsmpData.hasApiKey) {
              hasApiKey = true;
              status = 'configured';
            }
          }

          if (def.noKeyRequired) {
            status = 'configured';
          }

          const secretKey = secretKeyMap.get(def.id) || null;
          if (secretKey) {
            status = 'configured';
            hasApiKey = true;
          }

          // Check for apiKey stored in tool config (categories without legacy endpoints)
          if (configApiKeyMap.has(def.id)) {
            status = 'configured';
            hasApiKey = true;
          }

          return {
            ...def,
            hasApiKey,
            status,
            secretKey,
          };
        }
      );
      setExternalTools(externalToolsData);

      // Map MCP servers
      interface BackendMCPServer {
        serverId: string;
        name: string;
        description?: string;
        transport: 'stdio' | 'sse';
        command?: string;
        args?: string[];
        url?: string;
        enabled: boolean;
        connected?: boolean;
        autoConnect?: boolean;
        toolCount?: number;
        tools?: Array<{
          name: string;
          description?: string;
        }>;
        env?: Record<string, string>;
      }
      const mcpServersDataMapped: MCPServer[] = (
        (mcpServersData.servers || []) as BackendMCPServer[]
      ).map((server) => ({
        serverId: server.serverId,
        name: server.name,
        description: server.description,
        transport: server.transport,
        command: server.command,
        args: server.args,
        url: server.url,
        enabled: server.enabled,
        connected: server.connected,
        autoConnect: server.autoConnect,
        toolCount: server.toolCount,
        tools: server.tools,
        env: server.env,
      }));
      setMcpServers(mcpServersDataMapped);
    } catch (err) {
      logger.error('Failed to load configs:', err);
      setMessage({ type: 'error', text: t('admin.tools.loadFailed') });
    } finally {
      setLoading(false);
    }
    // ★ aliasToRegistry / multiProviderRegistryIds: hook 拉取后变化时 bridge
    // 重算（首次拉取从 {} → 真值会触发一次重 load，把链接补齐）
  }, [t, aliasToRegistry, multiProviderRegistryIds]);

  useEffect(() => {
    // ★ 2026-05-07 (PR-S0a Round 2 SRE fix): hook loading 期间跳过 first load，
    // 避免双触发浪费 5 个 backend 请求。alias 拉到（loading=false）后单次 load
    // 把 bridge 关联 + tool config 一起取齐。useToolAliases 失败时 hook
    // 立即把 loading 切为 false（fallback 到 EMPTY），仍然会触发 load。
    if (aliasesLoading) return;
    loadConfigs();
  }, [loadConfigs, aliasesLoading]);

  // Builtin tools handlers
  const handleToggleBuiltinTool = async (toolId: string, enabled: boolean) => {
    try {
      const res = await fetch(`${config.apiUrl}/admin/ai/tools/${toolId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          ...getAuthHeader(),
        },
        body: JSON.stringify({ enabled }),
      });

      if (res.ok) {
        setMessage({
          type: 'success',
          text: `Tool ${enabled ? 'enabled' : 'disabled'}`,
        });
        await loadConfigs();
        setTimeout(() => setMessage(null), 3000);
      } else {
        setMessage({ type: 'error', text: 'Failed to update tool' });
      }
    } catch (err) {
      logger.error('Failed to toggle tool:', err);
      setMessage({ type: 'error', text: 'Failed to update tool' });
    }
  };

  // External tools handlers
  const handleSaveExternalToolConfig = async (
    toolId: string,
    apiKey: string,
    secretKey?: string | null
  ) => {
    setSaving(true);
    setMessage(null);

    try {
      const tool =
        externalTools.find((t) => t.id === toolId) || configuringTool;
      if (!tool) {
        setMessage({ type: 'error', text: t('admin.tools.saveFailed') });
        setSaving(false);
        return;
      }

      // Handle Secret Manager mode - save reference to Secret Manager
      if (secretKey) {
        const res = await fetch(`${config.apiUrl}/admin/ai/tools/${toolId}`, {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            ...getAuthHeader(),
          },
          body: JSON.stringify({ secretKey }),
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
        return;
      }

      // Clear secretKey reference when switching to direct input or unlinking
      if (tool.secretKey && secretKey === null) {
        const clearRes = await fetch(
          `${config.apiUrl}/admin/ai/tools/${toolId}`,
          {
            method: 'PATCH',
            headers: {
              'Content-Type': 'application/json',
              ...getAuthHeader(),
            },
            body: JSON.stringify({ secretKey: null }),
          }
        );

        // If apiKey is empty, this is an "unlink only" action — don't proceed to legacy endpoints
        if (!apiKey) {
          if (clearRes.ok) {
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
          return;
        }
      }

      // Legacy config endpoints for direct API key
      let endpoint = '';
      let body: Record<string, unknown> = {};
      let useLegacyEndpoint = true;

      switch (tool.category) {
        case 'external-search':
          endpoint = '/admin/search-config';
          if (toolId === 'tavily') {
            body = { tavilyApiKeys: [apiKey] };
          } else if (toolId === 'serper') {
            body = { serperApiKeys: [apiKey] };
          } else {
            body = { [`${toolId}ApiKey`]: apiKey };
          }
          break;
        case 'external-extraction':
          endpoint = '/admin/extraction-config';
          {
            const extractId = toolId === 'tavilyExtract' ? 'tavily' : toolId;
            body = { [`${extractId}ApiKey`]: apiKey };
          }
          break;
        case 'external-youtube':
          endpoint = '/admin/youtube-config';
          body = { [`${toolId}ApiKey`]: apiKey };
          break;
        case 'external-tts':
          endpoint = '/admin/tts-config';
          {
            const ttsId = toolId === 'googleTts' ? 'google' : toolId;
            body = { [`${ttsId}ApiKey`]: apiKey };
          }
          break;
        case 'external-skills':
          endpoint = '/admin/skillsmp-config';
          body = { apiKey };
          break;
        default:
          // Categories without legacy endpoints (academic, finance, weather, devtools, policy)
          // Save API key as tool config via unified endpoint
          useLegacyEndpoint = false;
          break;
      }

      let res: Response;
      if (useLegacyEndpoint) {
        res = await fetch(`${config.apiUrl}${endpoint}`, {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            ...getAuthHeader(),
          },
          body: JSON.stringify(body),
        });
      } else {
        // For categories without legacy endpoints, store apiKey in tool config
        res = await fetch(`${config.apiUrl}/admin/ai/tools/${toolId}`, {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            ...getAuthHeader(),
          },
          body: JSON.stringify({ config: { apiKey } }),
        });
      }

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

  const handleTestExternalTool = async (tool: ExternalTool) => {
    setTestingTool(tool.id);
    setTestResults((prev) => ({
      ...prev,
      [tool.id]: { success: false, message: '' },
    }));

    try {
      // Use unified test endpoint: POST /admin/ai/tools/:toolId/test
      const res = await fetch(
        `${config.apiUrl}/admin/ai/tools/${tool.id}/test`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...getAuthHeader(),
          },
          body: JSON.stringify({}),
        }
      );

      const result = await res.json();
      // Handle wrapped API response { success: true, data: T }
      const data = result?.data ?? result;
      setTestResults((prev) => ({
        ...prev,
        [tool.id]: {
          success: data.success ?? res.ok,
          message:
            data.message ||
            data.error ||
            (res.ok
              ? t('admin.tools.testSuccess')
              : t('admin.tools.testFailed')),
        },
      }));
    } catch (err) {
      setTestResults((prev) => ({
        ...prev,
        [tool.id]: {
          success: false,
          message: (err as Error).message || t('admin.tools.testFailed'),
        },
      }));
    } finally {
      setTestingTool(null);
    }
  };

  const handleDeleteExternalTool = async (tool: ExternalTool) => {
    if (!confirm(t('admin.tools.confirmDelete', { name: tool.name }))) {
      return;
    }

    setDeletingTool(tool.id);
    setMessage(null);

    try {
      const res = await fetch(`${config.apiUrl}/admin/ai/tools/${tool.id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          ...getAuthHeader(),
        },
        body: JSON.stringify({ secretKey: null }),
      });

      if (res.ok) {
        setMessage({
          type: 'success',
          text: t('admin.tools.deleteSuccess', { name: tool.name }),
        });
        if (configuringTool?.id === tool.id) {
          setConfiguringTool(null);
        }
        setTestResults((prev) => {
          const newResults = { ...prev };
          delete newResults[tool.id];
          return newResults;
        });
        await loadConfigs();
        setTimeout(() => setMessage(null), 3000);
      } else {
        setMessage({ type: 'error', text: t('admin.tools.deleteFailed') });
      }
    } catch (err) {
      logger.error('Failed to delete tool config:', err);
      setMessage({ type: 'error', text: t('admin.tools.deleteFailed') });
    } finally {
      setDeletingTool(null);
    }
  };

  // MCP servers handlers
  const handleAddMCPServer = async (
    server: Omit<MCPServer, 'connected' | 'toolCount' | 'tools'>
  ) => {
    try {
      const res = await fetch(`${config.apiUrl}/admin/ai/mcp-servers`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...getAuthHeader(),
        },
        body: JSON.stringify(server),
      });

      if (res.ok) {
        setMessage({
          type: 'success',
          text: `Server ${server.name} added successfully`,
        });
        await loadConfigs();
        setTimeout(() => setMessage(null), 3000);
      } else {
        setMessage({ type: 'error', text: 'Failed to add server' });
      }
    } catch (err) {
      logger.error('Failed to add MCP server:', err);
      setMessage({ type: 'error', text: 'Failed to add server' });
    }
  };

  const handleConnectMCPServer = async (serverId: string) => {
    setConnectingServer(serverId);
    try {
      const res = await fetch(
        `${config.apiUrl}/admin/ai/mcp-servers/${serverId}/connect`,
        {
          method: 'POST',
          headers: { ...getAuthHeader() },
        }
      );

      if (res.ok) {
        setMessage({
          type: 'success',
          text: 'Server connected successfully',
        });
        await loadConfigs();
        setTimeout(() => setMessage(null), 3000);
      } else {
        setMessage({ type: 'error', text: 'Failed to connect server' });
      }
    } catch (err) {
      logger.error('Failed to connect MCP server:', err);
      setMessage({ type: 'error', text: 'Failed to connect server' });
    } finally {
      setConnectingServer(null);
    }
  };

  const handleDisconnectMCPServer = async (serverId: string) => {
    setConnectingServer(serverId);
    try {
      const res = await fetch(
        `${config.apiUrl}/admin/ai/mcp-servers/${serverId}/disconnect`,
        {
          method: 'POST',
          headers: { ...getAuthHeader() },
        }
      );

      if (res.ok) {
        setMessage({
          type: 'success',
          text: 'Server disconnected successfully',
        });
        await loadConfigs();
        setTimeout(() => setMessage(null), 3000);
      } else {
        setMessage({ type: 'error', text: 'Failed to disconnect server' });
      }
    } catch (err) {
      logger.error('Failed to disconnect MCP server:', err);
      setMessage({ type: 'error', text: 'Failed to disconnect server' });
    } finally {
      setConnectingServer(null);
    }
  };

  const handleDeleteMCPServer = async (serverId: string) => {
    if (!confirm('Are you sure you want to delete this server?')) {
      return;
    }

    setDeletingServer(serverId);
    try {
      const res = await fetch(
        `${config.apiUrl}/admin/ai/mcp-servers/${serverId}`,
        {
          method: 'DELETE',
          headers: { ...getAuthHeader() },
        }
      );

      if (res.ok) {
        setMessage({
          type: 'success',
          text: 'Server deleted successfully',
        });
        await loadConfigs();
        setTimeout(() => setMessage(null), 3000);
      } else {
        setMessage({ type: 'error', text: 'Failed to delete server' });
      }
    } catch (err) {
      logger.error('Failed to delete MCP server:', err);
      setMessage({ type: 'error', text: 'Failed to delete server' });
    } finally {
      setDeletingServer(null);
    }
  };

  const handleConfigureMCPServer = async (
    serverId: string,
    env: Record<string, string>
  ) => {
    try {
      const res = await fetch(
        `${config.apiUrl}/admin/ai/mcp-servers/${serverId}/env`,
        {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            ...getAuthHeader(),
          },
          body: JSON.stringify({ env }),
        }
      );

      if (res.ok) {
        setMessage({
          type: 'success',
          text: 'Environment variables configured successfully',
        });
        // Update local state
        setMcpServers((prev) =>
          prev.map((s) => (s.serverId === serverId ? { ...s, env } : s))
        );
        setTimeout(() => setMessage(null), 3000);
      } else {
        const error = await res.json().catch(() => ({}));
        setMessage({
          type: 'error',
          text: error.message || 'Failed to configure server',
        });
      }
    } catch (err) {
      logger.error('Failed to configure MCP server:', err);
      setMessage({ type: 'error', text: 'Failed to configure server' });
    }
  };

  // Statistics
  const stats = useMemo(() => {
    const builtinConfigured = builtinTools.filter((t) => t.enabled).length;
    const externalConfigured = externalTools.filter(
      (t) => t.status === 'configured'
    ).length;
    const mcpConnected = mcpServers.filter((s) => s.connected).length;

    return {
      builtin: { total: builtinTools.length, configured: builtinConfigured },
      external: { total: externalTools.length, configured: externalConfigured },
      mcp: { total: mcpServers.length, connected: mcpConnected },
    };
  }, [builtinTools, externalTools, mcpServers]);

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
              <span className="font-semibold">
                {stats.builtin.configured +
                  stats.external.configured +
                  stats.mcp.connected}
              </span>{' '}
              / {stats.builtin.total + stats.external.total + stats.mcp.total}{' '}
              {t('admin.tools.configured')}
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

      {/* Tab Navigation */}
      <div className="border-b border-gray-200">
        <nav className="-mb-px flex space-x-8">
          <button
            onClick={() => setActiveTab('ai-tools')}
            className={`flex items-center gap-2 whitespace-nowrap border-b-2 px-1 py-4 text-sm font-medium transition-colors ${
              activeTab === 'ai-tools'
                ? 'border-blue-500 text-blue-600'
                : 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700'
            }`}
          >
            <Zap className="h-5 w-5" />
            {t('admin.tools.tabs.aiTools')}
            <span
              className={`rounded-full px-2 py-0.5 text-xs ${
                activeTab === 'ai-tools'
                  ? 'bg-blue-100 text-blue-600'
                  : 'bg-gray-100 text-gray-600'
              }`}
            >
              {CAPABILITY_DEFINITIONS.length}
            </span>
          </button>

          <button
            onClick={() => setActiveTab('mcp')}
            className={`flex items-center gap-2 whitespace-nowrap border-b-2 px-1 py-4 text-sm font-medium transition-colors ${
              activeTab === 'mcp'
                ? 'border-blue-500 text-blue-600'
                : 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700'
            }`}
          >
            <Server className="h-5 w-5" />
            {t('admin.tools.tabs.mcp')}
            <span
              className={`rounded-full px-2 py-0.5 text-xs ${
                activeTab === 'mcp'
                  ? 'bg-blue-100 text-blue-600'
                  : 'bg-gray-100 text-gray-600'
              }`}
            >
              {stats.mcp.total}
            </span>
          </button>

          <button
            onClick={() => setActiveTab('report-sources')}
            className={`flex items-center gap-2 whitespace-nowrap border-b-2 px-1 py-4 text-sm font-medium transition-colors ${
              activeTab === 'report-sources'
                ? 'border-blue-500 text-blue-600'
                : 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700'
            }`}
          >
            <BookOpen className="h-5 w-5" />
            {t('admin.tools.tabs.reportSources')}
          </button>
        </nav>
      </div>

      {/* Tab Content */}
      {activeTab === 'ai-tools' && (
        <CapabilitiesTab
          builtinTools={builtinTools}
          externalToolStatuses={externalTools.map((t) => ({
            id: t.id,
            hasApiKey: t.hasApiKey,
            status: t.status,
            secretKey: t.secretKey,
          }))}
          onToggleCapability={handleToggleBuiltinTool}
          onConfigureProvider={(provider, category) => {
            // 转换 ProviderDefinition 为 ExternalTool 格式以便复用 ConfigureModal
            const externalTool = externalTools.find(
              (t) => t.id === provider.id
            );
            if (externalTool) {
              setConfiguringTool(externalTool);
            } else {
              // 创建一个临时的 ExternalTool 对象
              setConfiguringTool({
                id: provider.id,
                name: provider.name,
                category: `external-${category}`,
                url: provider.url,
                hasApiKey: false,
                status: 'not_configured',
                noKeyRequired: provider.noKeyRequired,
                freeQuota: provider.freeQuota,
              } as ExternalTool);
            }
          }}
          onTestProvider={(providerId, category) => {
            // First try to find in externalTools (has full status info)
            const tool = externalTools.find((t) => t.id === providerId);
            if (tool) {
              handleTestExternalTool(tool);
              return;
            }
            // Fallback: construct minimal tool object for providers not in EXTERNAL_TOOLS
            // (e.g., arXiv, HN Algolia, and other noKeyRequired tools)
            handleTestExternalTool({
              id: providerId,
              name: providerId,
              category: category,
              hasApiKey: false,
              noKeyRequired: true,
              status: 'configured',
            } as ExternalTool);
          }}
          testingProvider={testingTool}
          testResults={testResults}
          loading={loading}
        />
      )}

      {activeTab === 'mcp' && (
        <MCPMarketplaceTab
          servers={mcpServers}
          onAdd={handleAddMCPServer}
          onConnect={handleConnectMCPServer}
          onDisconnect={handleDisconnectMCPServer}
          onDelete={handleDeleteMCPServer}
          onConfigure={handleConfigureMCPServer}
          connectingServer={connectingServer}
          deletingServer={deletingServer}
          loading={loading}
        />
      )}

      {activeTab === 'report-sources' && (
        <IndustryReportSourcesTab loading={loading} />
      )}

      {/* Configure Modal for External Tools */}
      {configuringTool && (
        <ConfigureModal
          tool={configuringTool}
          onClose={() => setConfiguringTool(null)}
          onSave={handleSaveExternalToolConfig}
          saving={saving}
          availableSecrets={availableSecrets || []}
        />
      )}
    </div>
  );
}
