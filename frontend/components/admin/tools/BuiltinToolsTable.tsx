'use client';

/**
 * BuiltinToolsTable —— 工具管理 Tab 1: 内置工具
 *
 * 跨 Registry 的内置工具列表（admin 全局视角）。行点击 → 右侧抽屉展示工具详情：
 *   - id / name / displayName / description / category / tags
 *   - inputSchema / outputSchema (JSON view)
 *   - config（JSON 配置）
 *   - 权限：requiresAuth / allowedRoles
 *
 * 数据来源：GET /admin/ai/tools（包含 builtin + external；前端按 implemented === true 过滤）
 * 切换：PATCH /admin/ai/tools/:toolId { enabled }
 * 测试：POST /admin/ai/tools/:toolId/test
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Loader2, RefreshCw, Search, PlayCircle } from 'lucide-react';
import { config } from '@/lib/utils/config';
import { getAuthHeader } from '@/lib/utils/auth';
import { logger } from '@/lib/utils/logger';
import {
  DrawerShell,
  PaginationBar,
  Row,
  Section,
  Th,
} from '../_shared/admin-tables';

interface ToolRow {
  id: string;
  toolId: string;
  name: string;
  displayName: string;
  description: string | null;
  category: string;
  enabled: boolean;
  implemented: boolean;
  tags: string[];
  config: Record<string, unknown> | null;
  secretKey: string | null;
  requiresAuth: boolean;
  allowedRoles: string[];
  inputSchema: unknown;
  outputSchema: unknown;
}

interface ToolsResponse {
  tools: ToolRow[];
  stats: {
    total: number;
    enabled: number;
    implemented: number;
    external: number;
    byCategory: Record<string, number>;
  };
}

const PAGE_SIZE = 50;

export function BuiltinToolsTable() {
  const [allTools, setAllTools] = useState<ToolRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<string>('');
  const [enabledFilter, setEnabledFilter] = useState<'' | 'true' | 'false'>('');
  const [page, setPage] = useState(1);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [togglingId, setTogglingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${config.apiUrl}/admin/ai/tools`, {
        headers: getAuthHeader(),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const raw = await res.json();
      const data: ToolsResponse = raw?.data ?? raw;
      const builtins = Array.isArray(data.tools)
        ? data.tools.filter((t) => t.implemented === true)
        : [];
      setAllTools(builtins);
    } catch (e) {
      setError((e as Error).message);
      logger.error('[BuiltinToolsTable] load failed', e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const categories = useMemo(() => {
    const set = new Set<string>();
    for (const t of allTools) set.add(t.category);
    return Array.from(set).sort();
  }, [allTools]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return allTools.filter((t) => {
      if (categoryFilter && t.category !== categoryFilter) return false;
      if (enabledFilter && String(t.enabled) !== enabledFilter) return false;
      if (
        q &&
        !t.toolId.toLowerCase().includes(q) &&
        !t.name.toLowerCase().includes(q) &&
        !(t.displayName ?? '').toLowerCase().includes(q)
      )
        return false;
      return true;
    });
  }, [allTools, search, categoryFilter, enabledFilter]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const pageItems = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  useEffect(() => {
    if (page > totalPages) setPage(1);
  }, [page, totalPages]);

  const toggleEnabled = async (toolId: string, next: boolean) => {
    setTogglingId(toolId);
    try {
      const res = await fetch(`${config.apiUrl}/admin/ai/tools/${toolId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
        body: JSON.stringify({ enabled: next }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setAllTools((prev) =>
        prev.map((t) => (t.toolId === toolId ? { ...t, enabled: next } : t))
      );
    } catch (e) {
      logger.error('[BuiltinToolsTable] toggle failed', e);
      setError((e as Error).message);
    } finally {
      setTogglingId(null);
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
            placeholder="搜索 toolId / name..."
            className="w-full rounded-lg border border-gray-300 bg-white py-2 pl-10 pr-3 text-sm text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
        </form>
        <select
          value={categoryFilter}
          onChange={(e) => {
            setCategoryFilter(e.target.value);
            setPage(1);
          }}
          className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
        >
          <option value="">全部分类</option>
          {categories.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
        <select
          value={enabledFilter}
          onChange={(e) => {
            setEnabledFilter(e.target.value as '' | 'true' | 'false');
            setPage(1);
          }}
          className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
        >
          <option value="">全部状态</option>
          <option value="true">已启用</option>
          <option value="false">已禁用</option>
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
          {filtered.length} / {allTools.length} 个工具
        </span>
      </div>

      {error && (
        <div className="rounded-lg bg-red-50 p-3 text-sm text-red-600">
          加载失败：{error}
        </div>
      )}

      <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <Th>名称</Th>
              <Th>toolId</Th>
              <Th>分类</Th>
              <Th>标签</Th>
              <Th>权限</Th>
              <Th>状态</Th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 bg-white">
            {pageItems.length === 0 && !loading ? (
              <tr>
                <td
                  colSpan={6}
                  className="px-4 py-12 text-center text-sm text-gray-500"
                >
                  暂无内置工具
                </td>
              </tr>
            ) : (
              pageItems.map((t) => (
                <tr
                  key={t.toolId}
                  onClick={() => setSelectedId(t.toolId)}
                  className="cursor-pointer hover:bg-gray-50"
                >
                  <td
                    className="max-w-[280px] truncate whitespace-nowrap px-4 py-3 text-sm font-medium text-gray-900"
                    title={t.displayName || t.name}
                  >
                    {t.displayName || t.name}
                  </td>
                  <td
                    className="font-mono max-w-[200px] truncate whitespace-nowrap px-4 py-3 text-xs text-gray-600"
                    title={t.toolId}
                  >
                    {t.toolId}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-xs text-gray-600">
                    {t.category}
                  </td>
                  <td
                    className="max-w-[200px] truncate whitespace-nowrap px-4 py-3 text-xs text-gray-500"
                    title={t.tags.join(', ')}
                  >
                    {t.tags.length === 0
                      ? '—'
                      : t.tags.slice(0, 3).join(', ') +
                        (t.tags.length > 3 ? `, +${t.tags.length - 3}` : '')}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-xs text-gray-500">
                    {t.requiresAuth ? (
                      <span className="inline-flex rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700">
                        需认证
                      </span>
                    ) : (
                      <span className="text-gray-400">—</span>
                    )}
                  </td>
                  <td
                    className="whitespace-nowrap px-4 py-3 text-xs"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <button
                      type="button"
                      onClick={() => void toggleEnabled(t.toolId, !t.enabled)}
                      disabled={togglingId === t.toolId}
                      className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
                        t.enabled ? 'bg-blue-600' : 'bg-gray-300'
                      } ${togglingId === t.toolId ? 'opacity-50' : ''}`}
                      aria-label={
                        t.enabled ? '已启用，点击禁用' : '已禁用，点击启用'
                      }
                    >
                      <span
                        className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform ${
                          t.enabled ? 'translate-x-5' : 'translate-x-1'
                        }`}
                      />
                    </button>
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
        <BuiltinToolDrawer
          toolId={selectedId}
          tools={allTools}
          onClose={() => setSelectedId(null)}
        />
      )}
    </div>
  );
}

function BuiltinToolDrawer({
  toolId,
  tools,
  onClose,
}: {
  toolId: string;
  tools: ToolRow[];
  onClose: () => void;
}) {
  const tool = tools.find((t) => t.toolId === toolId);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{
    success: boolean;
    message: string;
  } | null>(null);

  const runTest = async () => {
    if (!tool) return;
    setTesting(true);
    setTestResult(null);
    try {
      const res = await fetch(
        `${config.apiUrl}/admin/ai/tools/${tool.toolId}/test`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
          body: JSON.stringify({}),
        }
      );
      const raw = await res.json();
      const data = raw?.data ?? raw;
      setTestResult({
        success: !!data.success,
        message: data.message || data.error || (res.ok ? '通过' : '失败'),
      });
    } catch (e) {
      setTestResult({ success: false, message: (e as Error).message });
    } finally {
      setTesting(false);
    }
  };

  return (
    <DrawerShell
      title={tool?.displayName || tool?.name || toolId}
      subtitle={tool?.description ?? ''}
      onClose={onClose}
    >
      {!tool ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-blue-600" />
        </div>
      ) : (
        <div className="space-y-5">
          <Section title="基本信息">
            <Row
              label="toolId"
              value={<code className="font-mono text-xs">{tool.toolId}</code>}
            />
            <Row label="名称" value={tool.name} />
            <Row label="显示名" value={tool.displayName} />
            <Row label="分类" value={tool.category} />
            <Row
              label="状态"
              value={
                tool.enabled ? (
                  <span className="inline-flex rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700">
                    已启用
                  </span>
                ) : (
                  <span className="inline-flex rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-600">
                    已禁用
                  </span>
                )
              }
            />
          </Section>

          {tool.tags.length > 0 && (
            <Section title="标签">
              <div className="flex flex-wrap gap-1.5">
                {tool.tags.map((tag) => (
                  <span
                    key={tag}
                    className="inline-flex whitespace-nowrap rounded-md bg-gray-100 px-2 py-0.5 text-xs text-gray-700"
                  >
                    {tag}
                  </span>
                ))}
              </div>
            </Section>
          )}

          <Section title="权限">
            <Row label="需要认证" value={tool.requiresAuth ? '是' : '否'} />
            <Row
              label="允许角色"
              value={
                tool.allowedRoles.length === 0
                  ? '所有用户'
                  : tool.allowedRoles.join(', ')
              }
            />
          </Section>

          {tool.config && Object.keys(tool.config).length > 0 && (
            <Section title="配置">
              <pre className="max-h-[240px] overflow-y-auto whitespace-pre-wrap rounded-md bg-gray-50 p-3 text-xs leading-relaxed text-gray-700">
                {JSON.stringify(tool.config, null, 2)}
              </pre>
            </Section>
          )}

          {tool.inputSchema != null && (
            <Section title="输入 Schema">
              <pre className="max-h-[240px] overflow-y-auto whitespace-pre-wrap rounded-md bg-gray-50 p-3 text-xs leading-relaxed text-gray-700">
                {JSON.stringify(tool.inputSchema, null, 2)}
              </pre>
            </Section>
          )}

          {tool.outputSchema != null && (
            <Section title="输出 Schema">
              <pre className="max-h-[240px] overflow-y-auto whitespace-pre-wrap rounded-md bg-gray-50 p-3 text-xs leading-relaxed text-gray-700">
                {JSON.stringify(tool.outputSchema, null, 2)}
              </pre>
            </Section>
          )}

          <Section title="健康测试">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => void runTest()}
                disabled={testing}
                className="inline-flex items-center gap-1.5 rounded-md border border-gray-300 bg-white px-3 py-1.5 text-xs text-gray-700 hover:bg-gray-50 disabled:opacity-50"
              >
                {testing ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <PlayCircle className="h-3.5 w-3.5" />
                )}
                运行测试
              </button>
              {testResult && (
                <span
                  className={`inline-flex rounded-md px-2 py-1 text-xs ${
                    testResult.success
                      ? 'bg-green-50 text-green-700'
                      : 'bg-red-50 text-red-700'
                  }`}
                >
                  {testResult.message}
                </span>
              )}
            </div>
          </Section>
        </div>
      )}
    </DrawerShell>
  );
}
