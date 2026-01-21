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
} from 'lucide-react';

import type { BuiltinTool, ExternalTool } from './tools/types';
import MCPMarketplaceTab, { MCPServer } from './tools/MCPMarketplaceTab';
import ConfigureModal from './tools/ConfigureModal';
import CapabilitiesTab from './tools/CapabilitiesTab';
import {
  CAPABILITY_DEFINITIONS,
  type ProviderDefinition,
} from './tools/capability-mapping';

const logger = createLogger('ToolsManagement');

// External tool definitions (from original file)
const EXTERNAL_TOOL_DEFINITIONS = [
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
];

type TabType = 'ai-tools' | 'mcp';

export default function ToolsManagement() {
  const { t } = useTranslation();
  const { secrets: availableSecrets } = useAdminSecrets();

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

      const searchData = searchRes?.ok ? await searchRes.json() : null;
      const extractionData = extractionRes?.ok
        ? await extractionRes.json()
        : null;
      const youtubeData = youtubeRes?.ok ? await youtubeRes.json() : null;
      const ttsData = ttsRes?.ok ? await ttsRes.json() : null;
      const skillsmpData = skillsmpRes?.ok ? await skillsmpRes.json() : null;

      const allConfigsData = allConfigsRes?.ok
        ? await allConfigsRes.json()
        : { tools: null, mcpServers: { servers: [] } };
      const capabilitiesData = allConfigsData.tools;
      const mcpServersData = allConfigsData.mcpServers || { servers: [] };

      // Build secret key map
      const secretKeyMap = new Map<string, string | null>();
      if (capabilitiesData?.tools) {
        capabilitiesData.tools.forEach(
          (tool: { toolId: string; secretKey?: string | null }) => {
            if (tool.secretKey) {
              secretKeyMap.set(tool.toolId, tool.secretKey);
            }
          }
        );
      }

      // Map builtin tools
      const builtinCategories = [
        'information',
        'content',
        'data',
        'code',
        'integration',
        'memory',
        'export',
        'collaboration',
      ];

      const builtinToolsData: BuiltinTool[] = (capabilitiesData?.tools || [])
        .filter((tool: { category: string }) =>
          builtinCategories.includes(tool.category)
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
        (def: any) => {
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
      const mcpServersDataMapped: MCPServer[] = (
        mcpServersData.servers || []
      ).map((server: any) => ({
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
  }, [t]);

  useEffect(() => {
    loadConfigs();
  }, [loadConfigs]);

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
      const tool = externalTools.find((t) => t.id === toolId);
      if (!tool) return;

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

      // When switching to direct input, clear the secretKey reference first
      if (tool.secretKey && secretKey === null) {
        await fetch(`${config.apiUrl}/admin/ai/tools/${toolId}`, {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            ...getAuthHeader(),
          },
          body: JSON.stringify({ secretKey: null }),
        });
      }

      // Legacy config endpoints for direct API key
      let endpoint = '';
      let body: Record<string, any> = {};

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
          const extractId = toolId === 'tavilyExtract' ? 'tavily' : toolId;
          body = { [`${extractId}ApiKey`]: apiKey };
          break;
        case 'external-youtube':
          endpoint = '/admin/youtube-config';
          body = { [`${toolId}ApiKey`]: apiKey };
          break;
        case 'external-tts':
          endpoint = '/admin/tts-config';
          const ttsId = toolId === 'googleTts' ? 'google' : toolId;
          body = { [`${ttsId}ApiKey`]: apiKey };
          break;
        case 'external-skills':
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

  const handleTestExternalTool = async (tool: ExternalTool) => {
    if (!tool.hasApiKey) return;

    setTestingTool(tool.id);
    setTestResults((prev) => ({
      ...prev,
      [tool.id]: { success: false, message: '' },
    }));

    try {
      let endpoint = '';

      switch (tool.category) {
        case 'external-search':
          endpoint = `/admin/search-config/test`;
          break;
        case 'external-extraction':
          endpoint = `/admin/extraction-config/test`;
          break;
        case 'external-youtube':
          endpoint = `/admin/youtube-config/test`;
          break;
        case 'external-tts':
          endpoint = `/admin/tts-config/test`;
          break;
        case 'external-skills':
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

      const requestBody: { provider: string; secretKey?: string } = {
        provider: tool.id,
      };
      if (tool.secretKey) {
        requestBody.secretKey = tool.secretKey;
      }

      const res = await fetch(`${config.apiUrl}${endpoint}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...getAuthHeader(),
        },
        body: JSON.stringify(requestBody),
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
            const tool = externalTools.find((t) => t.id === providerId);
            if (tool) {
              handleTestExternalTool(tool);
            }
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

      {/* Configure Modal for External Tools */}
      {configuringTool && (
        <ConfigureModal
          tool={configuringTool as any}
          onClose={() => setConfiguringTool(null)}
          onSave={handleSaveExternalToolConfig}
          saving={saving}
          availableSecrets={availableSecrets || []}
        />
      )}
    </div>
  );
}
