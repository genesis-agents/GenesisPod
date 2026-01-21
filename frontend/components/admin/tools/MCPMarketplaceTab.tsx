'use client';

import { useState } from 'react';
import { useTranslation } from '@/lib/i18n';
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
} from 'lucide-react';

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
}

interface MCPMarketplaceTabProps {
  servers: MCPServer[];
  onAdd: (
    server: Omit<MCPServer, 'connected' | 'toolCount' | 'tools'>
  ) => Promise<void>;
  onConnect: (serverId: string) => Promise<void>;
  onDisconnect: (serverId: string) => Promise<void>;
  onDelete: (serverId: string) => Promise<void>;
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
  connectingServer,
  deletingServer,
  loading = false,
}: MCPMarketplaceTabProps) {
  const { t } = useTranslation();
  const [showAddDialog, setShowAddDialog] = useState(false);

  if (loading) {
    return (
      <div className="flex items-center justify-center p-12">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-blue-600 border-t-transparent"></div>
      </div>
    );
  }

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

      {/* Server List */}
      {servers.length === 0 ? (
        <div className="rounded-xl border-2 border-dashed border-gray-300 bg-gray-50 p-12 text-center">
          <Server className="mx-auto h-12 w-12 text-gray-400" />
          <p className="mt-3 text-sm font-medium text-gray-700">
            No MCP servers configured
          </p>
          <p className="mt-1 text-xs text-gray-500">
            Add a server to get started
          </p>
          <button
            onClick={() => setShowAddDialog(true)}
            className="mt-4 inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700"
          >
            <Plus className="h-4 w-4" />
            {t('admin.tools.mcp.addServer')}
          </button>
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
              connecting={connectingServer === server.serverId}
              deleting={deletingServer === server.serverId}
            />
          ))}
        </div>
      )}

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
    </div>
  );
}

function MCPServerRow({
  server,
  onConnect,
  onDisconnect,
  onDelete,
  connecting,
  deleting,
}: {
  server: MCPServer;
  onConnect: (serverId: string) => void;
  onDisconnect: (serverId: string) => void;
  onDelete: (serverId: string) => void;
  connecting: boolean;
  deleting: boolean;
}) {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(false);

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
