'use client';

import { useState, useEffect } from 'react';
import { useTranslation } from '@/lib/i18n';
import { config } from '@/lib/utils/config';
import { getAuthHeader } from '@/lib/utils/auth';
import {
  CheckCircle,
  XCircle,
  AlertTriangle,
  Loader2,
  Plus,
  Settings,
  Trash2,
  Power,
  PowerOff,
  Server,
  X,
  ChevronDown,
  Globe,
  Github,
  FileText,
  Database,
  Search,
  Code,
  Mail,
  MessageSquare,
  Zap,
  Cloud,
  Key,
  Link2,
} from 'lucide-react';

// ============ 预置 MCP 服务器列表 ============
// 这些是知名的、常用的 MCP 服务器，用户可以一键添加

interface EnvVarRequirement {
  name: string;
  description: string;
  required: boolean;
  secretCategory?: string; // Secret Manager 中的分类，便于用户选择
}

interface PresetMCPServer {
  serverId: string;
  name: string;
  description: string;
  transport: 'stdio' | 'sse';
  command: string;
  args: string[];
  icon: React.ComponentType<{ className?: string }>;
  category: 'search' | 'dev' | 'productivity' | 'data' | 'communication';
  officialUrl?: string;
  requiredEnvVars?: EnvVarRequirement[]; // 需要的环境变量
}

const PRESET_MCP_SERVERS: PresetMCPServer[] = [
  // 搜索类
  {
    serverId: 'brave-search',
    name: 'Brave Search',
    description:
      'Web search using Brave Search API - privacy-focused search engine',
    transport: 'stdio',
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-brave-search'],
    icon: Search,
    category: 'search',
    officialUrl: 'https://github.com/anthropics/mcp-servers',
    requiredEnvVars: [
      {
        name: 'BRAVE_API_KEY',
        description: 'Brave Search API Key',
        required: true,
        secretCategory: 'SEARCH',
      },
    ],
  },
  {
    serverId: 'duckduckgo-search',
    name: 'DuckDuckGo Search',
    description: 'Free web search using DuckDuckGo - no API key required',
    transport: 'stdio',
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-ddg-search'],
    icon: Globe,
    category: 'search',
    officialUrl: 'https://github.com/anthropics/mcp-servers',
    // 无需环境变量
  },
  {
    serverId: 'google-search',
    name: 'Google Search',
    description: 'Web search using Google Custom Search API',
    transport: 'stdio',
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-google-search'],
    icon: Search,
    category: 'search',
    officialUrl: 'https://github.com/anthropics/mcp-servers',
    requiredEnvVars: [
      {
        name: 'GOOGLE_API_KEY',
        description: 'Google API Key',
        required: true,
        secretCategory: 'SEARCH',
      },
      {
        name: 'GOOGLE_CSE_ID',
        description: 'Google Custom Search Engine ID',
        required: true,
        secretCategory: 'SEARCH',
      },
    ],
  },
  // 开发工具类
  {
    serverId: 'github',
    name: 'GitHub',
    description: 'GitHub repository access - issues, PRs, code search',
    transport: 'stdio',
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-github'],
    icon: Github,
    category: 'dev',
    officialUrl: 'https://github.com/anthropics/mcp-servers',
    requiredEnvVars: [
      {
        name: 'GITHUB_TOKEN',
        description: 'GitHub Personal Access Token',
        required: true,
        secretCategory: 'DEV_TOOLS',
      },
    ],
  },
  {
    serverId: 'gitlab',
    name: 'GitLab',
    description: 'GitLab repository access and management',
    transport: 'stdio',
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-gitlab'],
    icon: Code,
    category: 'dev',
    requiredEnvVars: [
      {
        name: 'GITLAB_TOKEN',
        description: 'GitLab Personal Access Token',
        required: true,
        secretCategory: 'DEV_TOOLS',
      },
      {
        name: 'GITLAB_URL',
        description: 'GitLab Instance URL (optional for gitlab.com)',
        required: false,
        secretCategory: 'DEV_TOOLS',
      },
    ],
  },
  {
    serverId: 'filesystem',
    name: 'Filesystem',
    description: 'Local filesystem access - read, write, search files',
    transport: 'stdio',
    command: 'npx',
    args: [
      '-y',
      '@modelcontextprotocol/server-filesystem',
      '--allow-write',
      '.',
    ],
    icon: FileText,
    category: 'dev',
    officialUrl: 'https://github.com/anthropics/mcp-servers',
    // 无需环境变量
  },
  // 数据类
  {
    serverId: 'sqlite',
    name: 'SQLite',
    description: 'SQLite database queries and management',
    transport: 'stdio',
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-sqlite'],
    icon: Database,
    category: 'data',
    officialUrl: 'https://github.com/anthropics/mcp-servers',
    requiredEnvVars: [
      {
        name: 'SQLITE_DB_PATH',
        description: 'Path to SQLite database file',
        required: true,
      },
    ],
  },
  {
    serverId: 'postgres',
    name: 'PostgreSQL',
    description: 'PostgreSQL database queries and management',
    transport: 'stdio',
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-postgres'],
    icon: Database,
    category: 'data',
    officialUrl: 'https://github.com/anthropics/mcp-servers',
    requiredEnvVars: [
      {
        name: 'POSTGRES_URL',
        description: 'PostgreSQL connection URL',
        required: true,
        secretCategory: 'DATA',
      },
    ],
  },
  // 生产力工具
  {
    serverId: 'memory',
    name: 'Memory',
    description: 'Persistent memory storage for AI context',
    transport: 'stdio',
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-memory'],
    icon: Zap,
    category: 'productivity',
    officialUrl: 'https://github.com/anthropics/mcp-servers',
    // 无需环境变量
  },
  {
    serverId: 'puppeteer',
    name: 'Puppeteer',
    description: 'Browser automation and web scraping',
    transport: 'stdio',
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-puppeteer'],
    icon: Globe,
    category: 'productivity',
    officialUrl: 'https://github.com/anthropics/mcp-servers',
    // 无需环境变量
  },
  {
    serverId: 'fetch',
    name: 'Fetch',
    description: 'HTTP requests and web content fetching',
    transport: 'stdio',
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-fetch'],
    icon: Cloud,
    category: 'productivity',
    officialUrl: 'https://github.com/anthropics/mcp-servers',
    // 无需环境变量
  },
  // 通信工具
  {
    serverId: 'slack',
    name: 'Slack',
    description: 'Slack workspace integration - messages, channels, users',
    transport: 'stdio',
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-slack'],
    icon: MessageSquare,
    category: 'communication',
    officialUrl: 'https://github.com/anthropics/mcp-servers',
    requiredEnvVars: [
      {
        name: 'SLACK_BOT_TOKEN',
        description: 'Slack Bot OAuth Token (xoxb-...)',
        required: true,
        secretCategory: 'COMMUNICATION',
      },
      {
        name: 'SLACK_TEAM_ID',
        description: 'Slack Workspace/Team ID',
        required: false,
        secretCategory: 'COMMUNICATION',
      },
    ],
  },
  {
    serverId: 'google-drive',
    name: 'Google Drive',
    description: 'Google Drive file access and management',
    transport: 'stdio',
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-google-drive'],
    icon: Cloud,
    category: 'productivity',
    requiredEnvVars: [
      {
        name: 'GOOGLE_CLIENT_ID',
        description: 'Google OAuth Client ID',
        required: true,
        secretCategory: 'GOOGLE',
      },
      {
        name: 'GOOGLE_CLIENT_SECRET',
        description: 'Google OAuth Client Secret',
        required: true,
        secretCategory: 'GOOGLE',
      },
    ],
  },
];

// 获取预置服务器的环境变量需求
export function getPresetEnvVars(serverId: string): EnvVarRequirement[] {
  const preset = PRESET_MCP_SERVERS.find((p) => p.serverId === serverId);
  return preset?.requiredEnvVars || [];
}

const CATEGORY_LABELS: Record<string, string> = {
  search: 'Search Engines',
  dev: 'Developer Tools',
  productivity: 'Productivity',
  data: 'Data & Database',
  communication: 'Communication',
};

export interface MCPServer {
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
  env?: Record<string, string>; // Environment variables configuration
}

interface MCPMarketplaceTabProps {
  servers: MCPServer[];
  onAdd: (
    server: Omit<MCPServer, 'connected' | 'toolCount' | 'tools'>
  ) => Promise<void>;
  onConnect: (serverId: string) => Promise<void>;
  onDisconnect: (serverId: string) => Promise<void>;
  onDelete: (serverId: string) => Promise<void>;
  onConfigure?: (
    serverId: string,
    env: Record<string, string>
  ) => Promise<void>;
  connectingServer: string | null;
  deletingServer: string | null;
  loading?: boolean;
}

export default function MCPMarketplaceTab({
  servers,
  onAdd,
  onConnect,
  onDisconnect,
  onDelete,
  onConfigure,
  connectingServer,
  deletingServer,
  loading = false,
}: MCPMarketplaceTabProps) {
  const { t } = useTranslation();
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [configuringServer, setConfiguringServer] = useState<MCPServer | null>(
    null
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center p-12">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-blue-600 border-t-transparent"></div>
      </div>
    );
  }

  // 检查预置服务器是否已添加
  const isPresetAdded = (presetId: string) => {
    return servers.some((s) => s.serverId === presetId);
  };

  // 一键添加预置服务器
  const handleAddPreset = async (preset: PresetMCPServer) => {
    await onAdd({
      serverId: preset.serverId,
      name: preset.name,
      description: preset.description,
      transport: preset.transport,
      command: preset.command,
      args: preset.args,
      enabled: true,
      autoConnect: false,
    });
  };

  // 按分类分组预置服务器
  const groupedPresets = PRESET_MCP_SERVERS.reduce(
    (acc, preset) => {
      if (!acc[preset.category]) {
        acc[preset.category] = [];
      }
      acc[preset.category].push(preset);
      return acc;
    },
    {} as Record<string, PresetMCPServer[]>
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-gray-600">
            Manage MCP (Model Context Protocol) servers and their tools
          </p>
        </div>
        <button
          onClick={() => setShowAddDialog(true)}
          className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700"
        >
          <Plus className="h-4 w-4" />
          {t('admin.tools.mcp.addServer')}
        </button>
      </div>

      {/* 预置服务器列表 - 总是显示 */}
      <div className="rounded-xl border border-gray-200 bg-gradient-to-br from-blue-50 to-indigo-50 p-6">
        <div className="mb-4 flex items-center gap-2">
          <Zap className="h-5 w-5 text-blue-600" />
          <h3 className="font-semibold text-gray-900">
            {t('admin.tools.mcp.presetServers') || 'Popular MCP Servers'}
          </h3>
          <span className="rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-700">
            {PRESET_MCP_SERVERS.length} available
          </span>
        </div>
        <p className="mb-4 text-sm text-gray-600">
          {t('admin.tools.mcp.presetDescription') ||
            'One-click add popular MCP servers from the official Anthropic MCP collection'}
        </p>

        {/* 分类展示 */}
        <div className="space-y-4">
          {Object.entries(groupedPresets).map(([category, presets]) => (
            <div key={category}>
              <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-gray-500">
                {CATEGORY_LABELS[category] || category}
              </h4>
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {presets.map((preset) => {
                  const Icon = preset.icon;
                  const added = isPresetAdded(preset.serverId);
                  return (
                    <div
                      key={preset.serverId}
                      className={`flex items-center gap-3 rounded-lg border bg-white p-3 transition-all ${
                        added
                          ? 'border-green-200 bg-green-50'
                          : 'border-gray-200 hover:border-blue-300 hover:shadow-sm'
                      }`}
                    >
                      <div
                        className={`flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg ${
                          added ? 'bg-green-100' : 'bg-blue-100'
                        }`}
                      >
                        <Icon
                          className={`h-4 w-4 ${added ? 'text-green-600' : 'text-blue-600'}`}
                        />
                      </div>
                      <div className="min-w-0 flex-1">
                        <h5 className="truncate text-sm font-medium text-gray-900">
                          {preset.name}
                        </h5>
                        <p className="truncate text-xs text-gray-500">
                          {preset.description}
                        </p>
                      </div>
                      {added ? (
                        <span className="flex items-center gap-1 text-xs font-medium text-green-600">
                          <CheckCircle className="h-4 w-4" />
                          Added
                        </span>
                      ) : (
                        <button
                          onClick={() => handleAddPreset(preset)}
                          className="flex-shrink-0 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-blue-700"
                        >
                          Add
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* 已配置的服务器列表 */}
      <div>
        <h3 className="mb-3 flex items-center gap-2 font-semibold text-gray-900">
          <Server className="h-5 w-5 text-gray-600" />
          {t('admin.tools.mcp.configuredServers') || 'Configured Servers'}
          <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-600">
            {servers.length}
          </span>
        </h3>

        {servers.length === 0 ? (
          <div className="rounded-xl border-2 border-dashed border-gray-300 bg-gray-50 p-8 text-center">
            <Server className="mx-auto h-10 w-10 text-gray-400" />
            <p className="mt-2 text-sm font-medium text-gray-700">
              No MCP servers configured yet
            </p>
            <p className="mt-1 text-xs text-gray-500">
              Add a preset server above or create a custom one
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {servers.map((server) => (
              <MCPServerRow
                key={server.serverId}
                server={server}
                onConnect={onConnect}
                onDisconnect={onDisconnect}
                onDelete={onDelete}
                onConfigure={() => setConfiguringServer(server)}
                connecting={connectingServer === server.serverId}
                deleting={deletingServer === server.serverId}
              />
            ))}
          </div>
        )}
      </div>

      {/* Add Server Dialog */}
      {showAddDialog && (
        <AddMCPServerDialog
          onClose={() => setShowAddDialog(false)}
          onSave={async (server) => {
            await onAdd(server);
            setShowAddDialog(false);
          }}
        />
      )}

      {/* Configure Environment Variables Dialog */}
      {configuringServer && onConfigure && (
        <ConfigureEnvDialog
          server={configuringServer}
          onClose={() => setConfiguringServer(null)}
          onSave={async (env) => {
            await onConfigure(configuringServer.serverId, env);
            setConfiguringServer(null);
          }}
        />
      )}
    </div>
  );
}

function MCPServerRow({
  server,
  onConnect,
  onDisconnect,
  onDelete,
  onConfigure,
  connecting,
  deleting,
}: {
  server: MCPServer;
  onConnect: (serverId: string) => void;
  onDisconnect: (serverId: string) => void;
  onDelete: (serverId: string) => void;
  onConfigure: () => void;
  connecting: boolean;
  deleting: boolean;
}) {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(false);

  // Get required env vars for this server
  const requiredEnvVars = getPresetEnvVars(server.serverId);
  const hasEnvVars = requiredEnvVars.length > 0;
  const isConfigured =
    hasEnvVars &&
    requiredEnvVars.every((env) => server.env?.[env.name] || !env.required);

  const statusColor = server.connected
    ? 'bg-green-100 text-green-700'
    : server.enabled
      ? 'bg-yellow-100 text-yellow-700'
      : 'bg-gray-100 text-gray-700';

  const statusText = server.connected
    ? t('admin.tools.mcp.connected')
    : server.enabled
      ? t('admin.tools.mcp.disconnected')
      : 'Disabled';

  return (
    <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
      <div className="flex items-center gap-4 p-4">
        {/* Status Indicator */}
        <div className="flex-shrink-0">
          {server.connected ? (
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-green-100">
              <CheckCircle className="h-5 w-5 text-green-600" />
            </div>
          ) : server.enabled ? (
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-yellow-100">
              <AlertTriangle className="h-5 w-5 text-yellow-600" />
            </div>
          ) : (
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-gray-100">
              <XCircle className="h-5 w-5 text-gray-400" />
            </div>
          )}
        </div>

        {/* Server Info */}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h3 className="font-medium text-gray-900">{server.name}</h3>
            <span
              className={`rounded-full px-2 py-0.5 text-xs font-medium ${statusColor}`}
            >
              {statusText}
            </span>
            <span className="rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-700">
              {server.transport.toUpperCase()}
            </span>
          </div>
          <p className="mt-0.5 text-sm text-gray-500">
            {server.description || server.serverId}
          </p>
          {server.toolCount !== undefined && server.toolCount > 0 && (
            <p className="mt-1 text-xs text-gray-400">
              {server.toolCount} tools available
            </p>
          )}
        </div>

        {/* Actions */}
        <div className="flex flex-shrink-0 items-center gap-2">
          {server.connected ? (
            <button
              onClick={() => onDisconnect(server.serverId)}
              disabled={connecting}
              className="flex items-center gap-1 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {connecting ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <PowerOff className="h-4 w-4" />
              )}
              <span className="hidden sm:inline">
                {t('admin.tools.mcp.disconnect')}
              </span>
            </button>
          ) : (
            <button
              onClick={() => onConnect(server.serverId)}
              disabled={connecting || !server.enabled}
              className="flex items-center gap-1 rounded-lg bg-blue-600 px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {connecting ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Power className="h-4 w-4" />
              )}
              <span className="hidden sm:inline">
                {t('admin.tools.mcp.connect')}
              </span>
            </button>
          )}
          {/* Configure button - show for servers with env vars */}
          {hasEnvVars && (
            <button
              onClick={onConfigure}
              className={`flex items-center gap-1 rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors ${
                isConfigured
                  ? 'border-gray-200 bg-white text-gray-700 hover:bg-gray-50'
                  : 'border-amber-300 bg-amber-50 text-amber-700 hover:bg-amber-100'
              }`}
              title={
                isConfigured
                  ? 'Configure environment variables'
                  : 'Configuration required'
              }
            >
              {isConfigured ? (
                <Settings className="h-4 w-4" />
              ) : (
                <AlertTriangle className="h-4 w-4" />
              )}
              <span className="hidden sm:inline">
                {isConfigured ? 'Configure' : 'Setup Required'}
              </span>
            </button>
          )}
          <button
            onClick={() => onDelete(server.serverId)}
            disabled={deleting}
            className="rounded-lg border border-gray-200 p-1.5 text-gray-400 transition-colors hover:border-red-200 hover:bg-red-50 hover:text-red-600 disabled:cursor-not-allowed disabled:opacity-50"
            title={t('common.delete')}
          >
            {deleting ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Trash2 className="h-4 w-4" />
            )}
          </button>
          {server.tools && server.tools.length > 0 && (
            <button
              onClick={() => setExpanded(!expanded)}
              className="rounded-lg border border-gray-200 p-1.5 text-gray-400 transition-colors hover:bg-gray-50"
            >
              <ChevronDown
                className={`h-4 w-4 transition-transform ${expanded ? 'rotate-180' : ''}`}
              />
            </button>
          )}
        </div>
      </div>

      {/* Expanded Tool List */}
      {expanded && server.tools && server.tools.length > 0 && (
        <div className="border-t border-gray-100 bg-gray-50 p-4">
          <h4 className="mb-2 text-xs font-semibold uppercase text-gray-500">
            Discovered Tools
          </h4>
          <div className="space-y-1">
            {server.tools.map((tool, idx) => (
              <div key={idx} className="rounded bg-white p-2 text-sm">
                <span className="font-medium text-gray-900">{tool.name}</span>
                {tool.description && (
                  <p className="mt-0.5 text-xs text-gray-500">
                    {tool.description}
                  </p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function AddMCPServerDialog({
  onClose,
  onSave,
}: {
  onClose: () => void;
  onSave: (
    server: Omit<MCPServer, 'connected' | 'toolCount' | 'tools'>
  ) => Promise<void>;
}) {
  const { t } = useTranslation();
  const [saving, setSaving] = useState(false);
  const [serverId, setServerId] = useState('');
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [transport, setTransport] = useState<'stdio' | 'sse'>('stdio');
  const [command, setCommand] = useState('npx');
  const [argsText, setArgsText] = useState('');
  const [url, setUrl] = useState('');
  const [autoConnect, setAutoConnect] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await onSave({
        serverId,
        name,
        description: description || undefined,
        transport,
        command: transport === 'stdio' ? command : undefined,
        args:
          transport === 'stdio'
            ? argsText
                .split(',')
                .map((s) => s.trim())
                .filter(Boolean)
            : undefined,
        url: transport === 'sse' ? url : undefined,
        enabled: true,
        autoConnect,
      });
    } finally {
      setSaving(false);
    }
  };

  const canSubmit = serverId && name && (transport === 'stdio' ? command : url);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-lg rounded-xl bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4">
          <h3 className="text-lg font-semibold text-gray-900">
            {t('admin.tools.mcp.addServer')}
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
              <label className="mb-1.5 block text-sm font-medium text-gray-700">
                Server ID
              </label>
              <input
                type="text"
                value={serverId}
                onChange={(e) => setServerId(e.target.value)}
                placeholder="my-mcp-server"
                className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                required
              />
            </div>

            <div>
              <label className="mb-1.5 block text-sm font-medium text-gray-700">
                Name
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="My MCP Server"
                className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                required
              />
            </div>

            <div>
              <label className="mb-1.5 block text-sm font-medium text-gray-700">
                Description (Optional)
              </label>
              <input
                type="text"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Server description"
                className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
              />
            </div>

            <div>
              <label className="mb-1.5 block text-sm font-medium text-gray-700">
                {t('admin.tools.mcp.transport')}
              </label>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setTransport('stdio')}
                  className={`flex-1 rounded-lg border px-4 py-2 text-sm font-medium transition-colors ${
                    transport === 'stdio'
                      ? 'border-blue-500 bg-blue-50 text-blue-700'
                      : 'border-gray-300 bg-white text-gray-700 hover:bg-gray-50'
                  }`}
                >
                  STDIO
                </button>
                <button
                  type="button"
                  onClick={() => setTransport('sse')}
                  className={`flex-1 rounded-lg border px-4 py-2 text-sm font-medium transition-colors ${
                    transport === 'sse'
                      ? 'border-blue-500 bg-blue-50 text-blue-700'
                      : 'border-gray-300 bg-white text-gray-700 hover:bg-gray-50'
                  }`}
                >
                  SSE
                </button>
              </div>
            </div>

            {transport === 'stdio' ? (
              <>
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-gray-700">
                    {t('admin.tools.mcp.command')}
                  </label>
                  <input
                    type="text"
                    value={command}
                    onChange={(e) => setCommand(e.target.value)}
                    placeholder="npx"
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                    required
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-gray-700">
                    {t('admin.tools.mcp.args')}
                  </label>
                  <input
                    type="text"
                    value={argsText}
                    onChange={(e) => setArgsText(e.target.value)}
                    placeholder="-y, @modelcontextprotocol/server-example"
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                  />
                  <p className="mt-1 text-xs text-gray-500">
                    Comma-separated arguments
                  </p>
                </div>
              </>
            ) : (
              <div>
                <label className="mb-1.5 block text-sm font-medium text-gray-700">
                  {t('admin.tools.mcp.url')}
                </label>
                <input
                  type="url"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  placeholder="https://mcp-server.example.com"
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                  required={transport === 'sse'}
                />
              </div>
            )}

            <div>
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={autoConnect}
                  onChange={(e) => setAutoConnect(e.target.checked)}
                  className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                />
                <span className="text-sm text-gray-700">
                  {t('admin.tools.mcp.autoConnect')}
                </span>
              </label>
            </div>
          </div>

          <div className="mt-6 flex justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              {t('common.cancel')}
            </button>
            <button
              type="submit"
              disabled={saving || !canSubmit}
              className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {saving && <Loader2 className="h-4 w-4 animate-spin" />}
              {t('admin.tools.mcp.addServer')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ============ 环境变量配置对话框 ============
interface SecretOption {
  name: string;
  displayName: string;
  category: string;
}

function ConfigureEnvDialog({
  server,
  onClose,
  onSave,
}: {
  server: MCPServer;
  onClose: () => void;
  onSave: (env: Record<string, string>) => Promise<void>;
}) {
  const { t } = useTranslation();
  const [saving, setSaving] = useState(false);
  const [secrets, setSecrets] = useState<SecretOption[]>([]);
  const [loadingSecrets, setLoadingSecrets] = useState(true);

  // Get required env vars for this server
  const requiredEnvVars = getPresetEnvVars(server.serverId);

  // Initialize env values from server config
  const [envValues, setEnvValues] = useState<
    Record<string, { type: 'secret' | 'manual'; value: string }>
  >(() => {
    const initial: Record<
      string,
      { type: 'secret' | 'manual'; value: string }
    > = {};
    requiredEnvVars.forEach((env) => {
      const currentValue = server.env?.[env.name] || '';
      // Check if current value looks like a secret reference (starts with $secret:)
      if (currentValue.startsWith('$secret:')) {
        initial[env.name] = {
          type: 'secret',
          value: currentValue.replace('$secret:', ''),
        };
      } else {
        initial[env.name] = { type: 'manual', value: currentValue };
      }
    });
    return initial;
  });

  // Fetch available secrets from backend
  useEffect(() => {
    const fetchSecrets = async () => {
      try {
        const response = await fetch(`${config.apiUrl}/admin/secrets`, {
          headers: getAuthHeader(),
        });
        if (response.ok) {
          const data = await response.json();
          setSecrets(
            data.map(
              (s: { name: string; displayName: string; category: string }) => ({
                name: s.name,
                displayName: s.displayName,
                category: s.category,
              })
            )
          );
        }
      } catch (error) {
        console.error('Failed to fetch secrets:', error);
      } finally {
        setLoadingSecrets(false);
      }
    };
    fetchSecrets();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      // Convert to final env format
      const env: Record<string, string> = {};
      Object.entries(envValues).forEach(([key, envConfig]) => {
        if (envConfig.value) {
          env[key] =
            envConfig.type === 'secret'
              ? `$secret:${envConfig.value}`
              : envConfig.value;
        }
      });
      await onSave(env);
    } finally {
      setSaving(false);
    }
  };

  const updateEnvValue = (
    envName: string,
    type: 'secret' | 'manual',
    value: string
  ) => {
    setEnvValues((prev) => ({
      ...prev,
      [envName]: { type, value },
    }));
  };

  // Filter secrets by category for better UX
  const getSecretsForEnv = (envVar: EnvVarRequirement) => {
    if (envVar.secretCategory) {
      const filtered = secrets.filter(
        (s) => s.category === envVar.secretCategory
      );
      if (filtered.length > 0) return filtered;
    }
    return secrets;
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-lg rounded-xl bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4">
          <div>
            <h3 className="text-lg font-semibold text-gray-900">
              Configure {server.name}
            </h3>
            <p className="mt-0.5 text-sm text-gray-500">
              Set environment variables required by this MCP server
            </p>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6">
          <div className="space-y-4">
            {requiredEnvVars.map((envVar) => {
              const currentConfig = envValues[envVar.name] || {
                type: 'manual',
                value: '',
              };
              const availableSecrets = getSecretsForEnv(envVar);

              return (
                <div
                  key={envVar.name}
                  className="rounded-lg border border-gray-200 p-4"
                >
                  <div className="mb-2 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Key className="h-4 w-4 text-gray-500" />
                      <span className="font-medium text-gray-900">
                        {envVar.name}
                      </span>
                      {envVar.required && (
                        <span className="text-xs text-red-500">*</span>
                      )}
                    </div>
                    {!envVar.required && (
                      <span className="text-xs text-gray-400">Optional</span>
                    )}
                  </div>
                  <p className="mb-3 text-sm text-gray-500">
                    {envVar.description}
                  </p>

                  {/* Type selector */}
                  <div className="mb-2 flex gap-2">
                    <button
                      type="button"
                      onClick={() => updateEnvValue(envVar.name, 'secret', '')}
                      className={`flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                        currentConfig.type === 'secret'
                          ? 'bg-blue-100 text-blue-700'
                          : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                      }`}
                    >
                      <Link2 className="h-3 w-3" />
                      Use Secret
                    </button>
                    <button
                      type="button"
                      onClick={() => updateEnvValue(envVar.name, 'manual', '')}
                      className={`flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                        currentConfig.type === 'manual'
                          ? 'bg-blue-100 text-blue-700'
                          : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                      }`}
                    >
                      <Key className="h-3 w-3" />
                      Manual Input
                    </button>
                  </div>

                  {/* Value input */}
                  {currentConfig.type === 'secret' ? (
                    <select
                      value={currentConfig.value}
                      onChange={(e) =>
                        updateEnvValue(envVar.name, 'secret', e.target.value)
                      }
                      className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                      disabled={loadingSecrets}
                    >
                      <option value="">
                        {loadingSecrets
                          ? 'Loading secrets...'
                          : 'Select a secret'}
                      </option>
                      {availableSecrets.map((secret) => (
                        <option key={secret.name} value={secret.name}>
                          {secret.displayName} ({secret.name})
                        </option>
                      ))}
                    </select>
                  ) : (
                    <input
                      type="password"
                      value={currentConfig.value}
                      onChange={(e) =>
                        updateEnvValue(envVar.name, 'manual', e.target.value)
                      }
                      placeholder={`Enter ${envVar.name}`}
                      className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                    />
                  )}
                </div>
              );
            })}
          </div>

          {requiredEnvVars.length === 0 && (
            <p className="py-8 text-center text-sm text-gray-500">
              This server does not require any environment variables.
            </p>
          )}

          <div className="mt-6 flex justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              {t('common.cancel')}
            </button>
            <button
              type="submit"
              disabled={saving}
              className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {saving && <Loader2 className="h-4 w-4 animate-spin" />}
              Save Configuration
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
