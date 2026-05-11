'use client';

/**
 * MCPServersTable —— 工具管理 Tab 2: MCP 工具
 *
 * 管理 MCP 服务器列表（表格视图）。行点击 → 右侧抽屉展示服务器详情：
 *   - serverId / transport / command / args / url
 *   - 启用状态 / 连接状态 / autoConnect
 *   - 工具列表（数量 + 详情）
 *   - 环境变量配置（敏感值脱敏）
 *
 * 数据来源：GET /admin/ai/mcp-servers（admin/ai/all-configs 中的 mcpServers）
 * 增删连断：POST/DELETE/PATCH 相关 endpoint
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Loader2,
  RefreshCw,
  Search,
  Power,
  PowerOff,
  Trash2,
} from 'lucide-react';
import { config } from '@/lib/utils/config';
import { getAuthHeader } from '@/lib/utils/auth';
import { logger } from '@/lib/utils/logger';
import {
  DrawerShell,
  PaginationBar,
  Row,
  Section,
  StatGrid,
  Th,
} from '../_shared/admin-tables';

interface MCPServer {
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
  tools?: Array<{ name: string; description?: string }>;
  env?: Record<string, string>;
}

const PAGE_SIZE = 50;

export function MCPServersTable() {
  const [servers, setServers] = useState<MCPServer[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [transportFilter, setTransportFilter] = useState<string>('');
  const [connectedFilter, setConnectedFilter] = useState<'' | 'true' | 'false'>(
    ''
  );
  const [page, setPage] = useState(1);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [actingId, setActingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${config.apiUrl}/admin/ai/mcp-servers`, {
        headers: getAuthHeader(),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const raw = await res.json();
      const data = raw?.data ?? raw;
      const list: MCPServer[] = Array.isArray(data?.servers)
        ? data.servers
        : [];
      setServers(list);
    } catch (e) {
      setError((e as Error).message);
      logger.error('[MCPServersTable] load failed', e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return servers.filter((s) => {
      if (transportFilter && s.transport !== transportFilter) return false;
      if (connectedFilter && String(!!s.connected) !== connectedFilter)
        return false;
      if (
        q &&
        !s.serverId.toLowerCase().includes(q) &&
        !s.name.toLowerCase().includes(q)
      )
        return false;
      return true;
    });
  }, [servers, search, transportFilter, connectedFilter]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const pageItems = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  useEffect(() => {
    if (page > totalPages) setPage(1);
  }, [page, totalPages]);

  const connectServer = async (serverId: string) => {
    setActingId(serverId);
    try {
      const res = await fetch(
        `${config.apiUrl}/admin/ai/mcp-servers/${serverId}/connect`,
        { method: 'POST', headers: { ...getAuthHeader() } }
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      await load();
    } catch (e) {
      setError((e as Error).message);
      logger.error('[MCPServersTable] connect failed', e);
    } finally {
      setActingId(null);
    }
  };

  const disconnectServer = async (serverId: string) => {
    setActingId(serverId);
    try {
      const res = await fetch(
        `${config.apiUrl}/admin/ai/mcp-servers/${serverId}/disconnect`,
        { method: 'POST', headers: { ...getAuthHeader() } }
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      await load();
    } catch (e) {
      setError((e as Error).message);
      logger.error('[MCPServersTable] disconnect failed', e);
    } finally {
      setActingId(null);
    }
  };

  const deleteServer = async (serverId: string) => {
    if (!confirm(`删除 MCP 服务器 ${serverId}？`)) return;
    setActingId(serverId);
    try {
      const res = await fetch(
        `${config.apiUrl}/admin/ai/mcp-servers/${serverId}`,
        { method: 'DELETE', headers: { ...getAuthHeader() } }
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      if (selectedId === serverId) setSelectedId(null);
      await load();
    } catch (e) {
      setError((e as Error).message);
      logger.error('[MCPServersTable] delete failed', e);
    } finally {
      setActingId(null);
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            setPage(1);
          }}
          className="relative min-w-[240px] flex-1"
        >
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            placeholder="搜索 serverId / name..."
            className="w-full rounded-lg border border-gray-300 bg-white py-2 pl-10 pr-3 text-sm text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
        </form>
        <select
          value={transportFilter}
          onChange={(e) => {
            setTransportFilter(e.target.value);
            setPage(1);
          }}
          className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
        >
          <option value="">全部传输</option>
          <option value="stdio">stdio</option>
          <option value="sse">sse</option>
        </select>
        <select
          value={connectedFilter}
          onChange={(e) => {
            setConnectedFilter(e.target.value as '' | 'true' | 'false');
            setPage(1);
          }}
          className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
        >
          <option value="">全部连接</option>
          <option value="true">已连接</option>
          <option value="false">未连接</option>
        </select>
        <button
          type="button"
          onClick={() => void load()}
          disabled={loading}
          className="inline-flex items-center gap-1 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-50"
        >
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          刷新
        </button>
        <span className="text-xs text-gray-500">
          {filtered.length} / {servers.length} 个服务器
        </span>
      </div>

      {error && (
        <div className="rounded-lg bg-red-50 p-3 text-sm text-red-600">
          错误：{error}
        </div>
      )}

      <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <Th>名称</Th>
              <Th>serverId</Th>
              <Th>传输</Th>
              <Th>启用</Th>
              <Th>连接</Th>
              <Th className="text-right">工具</Th>
              <Th>操作</Th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 bg-white">
            {pageItems.length === 0 && !loading ? (
              <tr>
                <td
                  colSpan={7}
                  className="px-4 py-12 text-center text-sm text-gray-500"
                >
                  暂无 MCP 服务器
                </td>
              </tr>
            ) : (
              pageItems.map((s) => (
                <tr
                  key={s.serverId}
                  onClick={() => setSelectedId(s.serverId)}
                  className="cursor-pointer hover:bg-gray-50"
                >
                  <td
                    className="max-w-[240px] truncate whitespace-nowrap px-4 py-3 text-sm font-medium text-gray-900"
                    title={s.name}
                  >
                    {s.name}
                  </td>
                  <td
                    className="font-mono max-w-[200px] truncate whitespace-nowrap px-4 py-3 text-xs text-gray-600"
                    title={s.serverId}
                  >
                    {s.serverId}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-xs">
                    <span className="font-mono inline-flex rounded-md bg-gray-100 px-2 py-0.5 text-xs text-gray-700">
                      {s.transport}
                    </span>
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-xs">
                    {s.enabled ? (
                      <span className="inline-flex rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700">
                        启用
                      </span>
                    ) : (
                      <span className="inline-flex rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-600">
                        禁用
                      </span>
                    )}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-xs">
                    {s.connected ? (
                      <span className="inline-flex rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-700">
                        已连接
                      </span>
                    ) : (
                      <span className="inline-flex rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-600">
                        未连接
                      </span>
                    )}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-right text-sm tabular-nums text-gray-700">
                    {s.toolCount ?? 0}
                  </td>
                  <td
                    className="whitespace-nowrap px-4 py-3 text-xs"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <div className="flex items-center gap-1">
                      {s.connected ? (
                        <button
                          type="button"
                          onClick={() => void disconnectServer(s.serverId)}
                          disabled={actingId === s.serverId}
                          title="断开连接"
                          className="rounded p-1 text-gray-600 hover:bg-gray-100 disabled:opacity-50"
                        >
                          <PowerOff className="h-3.5 w-3.5" />
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => void connectServer(s.serverId)}
                          disabled={actingId === s.serverId}
                          title="连接"
                          className="rounded p-1 text-blue-600 hover:bg-blue-50 disabled:opacity-50"
                        >
                          <Power className="h-3.5 w-3.5" />
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => void deleteServer(s.serverId)}
                        disabled={actingId === s.serverId}
                        title="删除"
                        className="rounded p-1 text-red-600 hover:bg-red-50 disabled:opacity-50"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <PaginationBar
        page={page}
        totalPages={totalPages}
        loading={loading}
        onChange={(p) => setPage(p)}
      />

      {selectedId && (
        <MCPServerDrawer
          serverId={selectedId}
          servers={servers}
          onClose={() => setSelectedId(null)}
        />
      )}
    </div>
  );
}

function MCPServerDrawer({
  serverId,
  servers,
  onClose,
}: {
  serverId: string;
  servers: MCPServer[];
  onClose: () => void;
}) {
  const server = servers.find((s) => s.serverId === serverId);

  const maskedEnv = useMemo(() => {
    if (!server?.env) return null;
    const out: Record<string, string> = {};
    for (const [k, v] of Object.entries(server.env)) {
      out[k] = v && v.length > 6 ? `${v.slice(0, 3)}…${v.slice(-3)}` : v;
    }
    return out;
  }, [server]);

  return (
    <DrawerShell
      title={server?.name ?? serverId}
      subtitle={server?.description ?? ''}
      onClose={onClose}
    >
      {!server ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-blue-600" />
        </div>
      ) : (
        <div className="space-y-5">
          <Section title="基本信息">
            <Row
              label="serverId"
              value={
                <code className="font-mono text-xs">{server.serverId}</code>
              }
            />
            <Row label="名称" value={server.name} />
            <Row label="传输" value={server.transport} />
            {server.command && (
              <Row
                label="command"
                value={
                  <code className="font-mono text-xs">{server.command}</code>
                }
              />
            )}
            {server.args && server.args.length > 0 && (
              <Row
                label="args"
                value={
                  <code className="font-mono break-all text-xs">
                    {server.args.join(' ')}
                  </code>
                }
              />
            )}
            {server.url && (
              <Row
                label="URL"
                value={
                  <code className="font-mono break-all text-xs">
                    {server.url}
                  </code>
                }
              />
            )}
          </Section>

          <Section title="状态">
            <StatGrid
              items={[
                { label: '启用', value: server.enabled ? '是' : '否' },
                { label: '已连接', value: server.connected ? '是' : '否' },
                { label: '自动连接', value: server.autoConnect ? '是' : '否' },
                { label: '工具数', value: server.toolCount ?? 0 },
              ]}
            />
          </Section>

          {server.tools && server.tools.length > 0 && (
            <Section title={`工具列表 (${server.tools.length})`}>
              <div className="space-y-1.5">
                {server.tools.map((t) => (
                  <div
                    key={t.name}
                    className="rounded-md border border-gray-200 bg-white px-3 py-2"
                  >
                    <div className="font-mono text-xs font-medium text-gray-900">
                      {t.name}
                    </div>
                    {t.description && (
                      <div className="mt-0.5 line-clamp-2 text-xs text-gray-600">
                        {t.description}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </Section>
          )}

          {maskedEnv && Object.keys(maskedEnv).length > 0 && (
            <Section title="环境变量（已脱敏）">
              <pre className="overflow-x-auto whitespace-pre-wrap rounded-md bg-gray-50 p-3 text-xs leading-relaxed text-gray-700">
                {Object.entries(maskedEnv)
                  .map(([k, v]) => `${k}=${v}`)
                  .join('\n')}
              </pre>
            </Section>
          )}
        </div>
      )}
    </DrawerShell>
  );
}
