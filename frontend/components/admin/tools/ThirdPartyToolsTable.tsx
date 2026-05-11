'use client';

/**
 * ThirdPartyToolsTable —— 工具管理 Tab 3: 第三方工具
 *
 * 涵盖：
 *   - API 服务 (sub-tab 1): implemented=false 的 DB-only 工具配置（API key 持有者）
 *     如 firecrawl / jina / elevenlabs / supadata 等外部服务，行点击 → 抽屉看
 *     secretKey / config / hasApiKey / test。
 *   - 抓取源 (sub-tab 2): industry-report 工具 config.sources 子表
 *     name / domain / category / credibility / topicTypes / enabled。
 *     行点击 → 抽屉编辑 / 删除。顶部"添加来源"按钮 → 抽屉新建。
 *
 * 数据来源：
 *   - GET /admin/ai/tools（过滤 implemented=false 给 API 服务；找 industry-report 给抓取源）
 *   - PATCH /admin/ai/tools/:toolId 更新 config（持久化 sources 数组）
 *   - PATCH /admin/ai/tools/:toolId { enabled } 切换启用
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Loader2,
  RefreshCw,
  Search,
  Plus,
  Trash2,
  PlayCircle,
  Globe,
} from 'lucide-react';
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

interface IndustryReportSource {
  id: string;
  name: string;
  domain: string;
  category: string;
  credibilityScore: number;
  enabled: boolean;
  topicTypes: string[];
}

interface ToolsResponse {
  tools: ToolRow[];
}

const TOOL_ID_INDUSTRY_REPORT = 'industry-report';

const SOURCE_CATEGORIES = [
  '科技报告',
  '金融研究',
  '行业分析',
  '咨询机构',
  '政策研究',
  '学术研究',
  '新闻媒体',
  '其他',
];

const TOPIC_TYPES = [
  { value: 'TECHNOLOGY', label: '科技' },
  { value: 'COMPANY', label: '公司' },
  { value: 'MACRO', label: '宏观' },
  { value: 'EVENT', label: '事件' },
];

const PAGE_SIZE = 50;
type SubTab = 'api' | 'sources';

export function ThirdPartyToolsTable() {
  const [subTab, setSubTab] = useState<SubTab>('api');
  const [allTools, setAllTools] = useState<ToolRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
      setAllTools(Array.isArray(data.tools) ? data.tools : []);
    } catch (e) {
      setError((e as Error).message);
      logger.error('[ThirdPartyToolsTable] load failed', e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const apiTools = useMemo(
    () => allTools.filter((t) => t.implemented === false),
    [allTools]
  );

  const industryReportTool = useMemo(
    () => allTools.find((t) => t.toolId === TOOL_ID_INDUSTRY_REPORT),
    [allTools]
  );

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-1 border-b border-gray-200">
        <button
          type="button"
          onClick={() => setSubTab('api')}
          className={`border-b-2 px-3 py-2 text-sm font-medium transition-colors ${
            subTab === 'api'
              ? 'border-blue-500 text-blue-600'
              : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          API 服务
          <span className="ml-1.5 inline-flex rounded-full bg-gray-100 px-1.5 py-0.5 text-[10px] text-gray-600">
            {apiTools.length}
          </span>
        </button>
        <button
          type="button"
          onClick={() => setSubTab('sources')}
          className={`border-b-2 px-3 py-2 text-sm font-medium transition-colors ${
            subTab === 'sources'
              ? 'border-blue-500 text-blue-600'
              : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          抓取源
          <span className="ml-1.5 inline-flex rounded-full bg-gray-100 px-1.5 py-0.5 text-[10px] text-gray-600">
            {Array.isArray(industryReportTool?.config?.sources)
              ? (industryReportTool.config.sources as IndustryReportSource[])
                  .length
              : 0}
          </span>
        </button>
        <div className="ml-auto pb-1">
          <button
            type="button"
            onClick={() => void load()}
            disabled={loading}
            className="inline-flex items-center gap-1 rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-xs text-gray-700 hover:bg-gray-50 disabled:opacity-50"
          >
            <RefreshCw
              className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`}
            />
            刷新
          </button>
        </div>
      </div>

      {error && (
        <div className="rounded-lg bg-red-50 p-3 text-sm text-red-600">
          加载失败：{error}
        </div>
      )}

      {subTab === 'api' && (
        <APIServiceTable tools={apiTools} loading={loading} onReload={load} />
      )}
      {subTab === 'sources' && (
        <ScrapingSourcesTable
          tool={industryReportTool ?? null}
          loading={loading}
          onReload={load}
        />
      )}
    </div>
  );
}

// ──────────────── Sub-tab: API 服务 ────────────────

function APIServiceTable({
  tools,
  loading,
  onReload,
}: {
  tools: ToolRow[];
  loading: boolean;
  onReload: () => Promise<void>;
}) {
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<string>('');
  const [page, setPage] = useState(1);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const categories = useMemo(() => {
    const set = new Set<string>();
    for (const t of tools) set.add(t.category);
    return Array.from(set).sort();
  }, [tools]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return tools.filter((t) => {
      if (categoryFilter && t.category !== categoryFilter) return false;
      if (
        q &&
        !t.toolId.toLowerCase().includes(q) &&
        !t.name.toLowerCase().includes(q) &&
        !(t.displayName ?? '').toLowerCase().includes(q)
      )
        return false;
      return true;
    });
  }, [tools, search, categoryFilter]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const pageItems = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  useEffect(() => {
    if (page > totalPages) setPage(1);
  }, [page, totalPages]);

  const hasConfigured = (t: ToolRow): boolean => {
    if (t.secretKey) return true;
    if (t.config && typeof t.config === 'object') {
      const cfg = t.config;
      if (typeof cfg.apiKey === 'string' && cfg.apiKey.length > 0) return true;
    }
    return false;
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[240px] flex-1">
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
        </div>
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
        <span className="text-xs text-gray-500">
          {filtered.length} / {tools.length} 个 API 服务
        </span>
      </div>

      <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <Th>名称</Th>
              <Th>toolId</Th>
              <Th>分类</Th>
              <Th>已配置</Th>
              <Th>启用</Th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 bg-white">
            {pageItems.length === 0 && !loading ? (
              <tr>
                <td
                  colSpan={5}
                  className="px-4 py-12 text-center text-sm text-gray-500"
                >
                  暂无 API 服务
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
                  <td className="whitespace-nowrap px-4 py-3 text-xs">
                    {hasConfigured(t) ? (
                      <span className="inline-flex rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700">
                        已配置
                      </span>
                    ) : (
                      <span className="inline-flex rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-600">
                        未配置
                      </span>
                    )}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-xs">
                    {t.enabled ? (
                      <span className="inline-flex rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-700">
                        启用
                      </span>
                    ) : (
                      <span className="text-gray-400">禁用</span>
                    )}
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
        <APIServiceDrawer
          toolId={selectedId}
          tools={tools}
          onClose={() => setSelectedId(null)}
          onReload={onReload}
        />
      )}
    </div>
  );
}

function APIServiceDrawer({
  toolId,
  tools,
  onClose,
  onReload,
}: {
  toolId: string;
  tools: ToolRow[];
  onClose: () => void;
  onReload: () => Promise<void>;
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

  const toggle = async (next: boolean) => {
    if (!tool) return;
    try {
      const res = await fetch(
        `${config.apiUrl}/admin/ai/tools/${tool.toolId}`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
          body: JSON.stringify({ enabled: next }),
        }
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      await onReload();
    } catch (e) {
      logger.error('[APIServiceDrawer] toggle failed', e);
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
            <Row label="分类" value={tool.category} />
            <Row
              label="secretKey"
              value={
                tool.secretKey ? (
                  <code className="font-mono text-xs">{tool.secretKey}</code>
                ) : (
                  '—'
                )
              }
            />
          </Section>

          {tool.config && Object.keys(tool.config).length > 0 && (
            <Section title="配置">
              <pre className="max-h-[240px] overflow-y-auto whitespace-pre-wrap rounded-md bg-gray-50 p-3 text-xs leading-relaxed text-gray-700">
                {JSON.stringify(maskSecrets(tool.config), null, 2)}
              </pre>
            </Section>
          )}

          <Section title="启用">
            <button
              type="button"
              onClick={() => void toggle(!tool.enabled)}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                tool.enabled ? 'bg-blue-600' : 'bg-gray-300'
              }`}
            >
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
                  tool.enabled ? 'translate-x-6' : 'translate-x-1'
                }`}
              />
            </button>
            <span className="ml-2 text-xs text-gray-600">
              {tool.enabled ? '已启用' : '已禁用'}
            </span>
          </Section>

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

function maskSecrets(cfg: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(cfg)) {
    if (
      typeof v === 'string' &&
      /api[_-]?key|secret|password|token/i.test(k) &&
      v.length > 6
    ) {
      out[k] = `${v.slice(0, 3)}…${v.slice(-3)}`;
    } else {
      out[k] = v;
    }
  }
  return out;
}

// ──────────────── Sub-tab: 抓取源 ────────────────

function ScrapingSourcesTable({
  tool,
  loading,
  onReload,
}: {
  tool: ToolRow | null;
  loading: boolean;
  onReload: () => Promise<void>;
}) {
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<string>('');
  const [page, setPage] = useState(1);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const sources = useMemo(() => {
    if (!tool?.config) return [] as IndustryReportSource[];
    const arr = tool.config.sources;
    return Array.isArray(arr) ? (arr as IndustryReportSource[]) : [];
  }, [tool]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return sources.filter((s) => {
      if (categoryFilter && s.category !== categoryFilter) return false;
      if (
        q &&
        !s.name.toLowerCase().includes(q) &&
        !s.domain.toLowerCase().includes(q)
      )
        return false;
      return true;
    });
  }, [sources, search, categoryFilter]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const pageItems = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  useEffect(() => {
    if (page > totalPages) setPage(1);
  }, [page, totalPages]);

  const persistSources = async (updated: IndustryReportSource[]) => {
    if (!tool) return false;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(
        `${config.apiUrl}/admin/ai/tools/${TOOL_ID_INDUSTRY_REPORT}`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
          body: JSON.stringify({
            config: { ...tool.config, sources: updated },
          }),
        }
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      await onReload();
      return true;
    } catch (e) {
      setError((e as Error).message);
      logger.error('[ScrapingSourcesTable] persist failed', e);
      return false;
    } finally {
      setSaving(false);
    }
  };

  const handleSave = async (data: IndustryReportSource) => {
    const exists = sources.some((s) => s.id === data.id);
    const updated = exists
      ? sources.map((s) => (s.id === data.id ? data : s))
      : [...sources, data];
    const ok = await persistSources(updated);
    if (ok) {
      setShowCreate(false);
      setSelectedId(null);
    }
  };

  const handleDelete = async (id: string) => {
    const source = sources.find((s) => s.id === id);
    if (!source) return;
    if (!confirm(`确认删除来源「${source.name}」？`)) return;
    const updated = sources.filter((s) => s.id !== id);
    const ok = await persistSources(updated);
    if (ok && selectedId === id) setSelectedId(null);
  };

  const handleToggle = async (id: string, enabled: boolean) => {
    const updated = sources.map((s) => (s.id === id ? { ...s, enabled } : s));
    await persistSources(updated);
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[240px] flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            placeholder="搜索 name / domain..."
            className="w-full rounded-lg border border-gray-300 bg-white py-2 pl-10 pr-3 text-sm text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
        </div>
        <select
          value={categoryFilter}
          onChange={(e) => {
            setCategoryFilter(e.target.value);
            setPage(1);
          }}
          className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
        >
          <option value="">全部分类</option>
          {SOURCE_CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={() => setShowCreate(true)}
          disabled={saving || !tool}
          className="inline-flex items-center gap-1 rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
        >
          <Plus className="h-4 w-4" />
          添加来源
        </button>
        <span className="text-xs text-gray-500">
          {filtered.length} / {sources.length}
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
              <Th>域名</Th>
              <Th>分类</Th>
              <Th>可信度</Th>
              <Th>话题类型</Th>
              <Th>启用</Th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 bg-white">
            {pageItems.length === 0 && !loading ? (
              <tr>
                <td
                  colSpan={6}
                  className="px-4 py-12 text-center text-sm text-gray-500"
                >
                  暂无抓取源
                </td>
              </tr>
            ) : (
              pageItems.map((s) => (
                <tr
                  key={s.id}
                  onClick={() => setSelectedId(s.id)}
                  className="cursor-pointer hover:bg-gray-50"
                >
                  <td
                    className="max-w-[200px] truncate whitespace-nowrap px-4 py-3 text-sm font-medium text-gray-900"
                    title={s.name}
                  >
                    {s.name}
                  </td>
                  <td
                    className="font-mono max-w-[200px] truncate whitespace-nowrap px-4 py-3 text-xs text-gray-600"
                    title={s.domain}
                  >
                    {s.domain}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-xs text-gray-600">
                    {s.category}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-xs tabular-nums text-gray-700">
                    {s.credibilityScore.toFixed(2)}
                  </td>
                  <td
                    className="max-w-[200px] truncate whitespace-nowrap px-4 py-3 text-xs text-gray-500"
                    title={s.topicTypes.join(', ')}
                  >
                    {s.topicTypes.length === 0 ? '—' : s.topicTypes.join(', ')}
                  </td>
                  <td
                    className="whitespace-nowrap px-4 py-3 text-xs"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <button
                      type="button"
                      onClick={() => void handleToggle(s.id, !s.enabled)}
                      disabled={saving}
                      className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
                        s.enabled ? 'bg-blue-600' : 'bg-gray-300'
                      } disabled:opacity-50`}
                      aria-label={s.enabled ? '禁用' : '启用'}
                    >
                      <span
                        className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform ${
                          s.enabled ? 'translate-x-5' : 'translate-x-1'
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

      {(showCreate || selectedId) && (
        <SourceEditorDrawer
          initial={
            selectedId
              ? (sources.find((s) => s.id === selectedId) ?? null)
              : null
          }
          saving={saving}
          onClose={() => {
            setShowCreate(false);
            setSelectedId(null);
          }}
          onSave={handleSave}
          onDelete={selectedId ? () => handleDelete(selectedId) : undefined}
        />
      )}
    </div>
  );
}

function generateSourceId(name: string): string {
  const slug = name
    .toLowerCase()
    .trim()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
  return slug || `source-${Date.now()}`;
}

function SourceEditorDrawer({
  initial,
  saving,
  onClose,
  onSave,
  onDelete,
}: {
  initial: IndustryReportSource | null;
  saving: boolean;
  onClose: () => void;
  onSave: (data: IndustryReportSource) => Promise<void>;
  onDelete?: () => Promise<void>;
}) {
  const [form, setForm] = useState<IndustryReportSource>(
    initial ?? {
      id: '',
      name: '',
      domain: '',
      category: '',
      credibilityScore: 0.8,
      enabled: true,
      topicTypes: [],
    }
  );

  const toggleTopic = (t: string) => {
    setForm((prev) => ({
      ...prev,
      topicTypes: prev.topicTypes.includes(t)
        ? prev.topicTypes.filter((x) => x !== t)
        : [...prev.topicTypes, t],
    }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const finalId = form.id || generateSourceId(form.name);
    void onSave({ ...form, id: finalId });
  };

  return (
    <DrawerShell
      title={initial ? `编辑：${initial.name}` : '添加抓取源'}
      subtitle={initial ? initial.domain : '配置新的行业报告抓取来源'}
      onClose={onClose}
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-gray-700">
            名称 <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            required
            value={form.name}
            onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
            placeholder="例如 SemiAnalysis"
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
        </div>

        <div className="space-y-1.5">
          <label className="text-xs font-medium text-gray-700">
            域名 <span className="text-red-500">*</span>
          </label>
          <div className="relative">
            <Globe className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              required
              value={form.domain}
              onChange={(e) =>
                setForm((p) => ({ ...p, domain: e.target.value }))
              }
              placeholder="例如 semianalysis.com"
              className="w-full rounded-lg border border-gray-300 py-2 pl-10 pr-3 text-sm text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>
        </div>

        <div className="space-y-1.5">
          <label className="text-xs font-medium text-gray-700">
            分类 <span className="text-red-500">*</span>
          </label>
          <select
            required
            value={form.category}
            onChange={(e) =>
              setForm((p) => ({ ...p, category: e.target.value }))
            }
            className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          >
            <option value="">选择分类</option>
            {SOURCE_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-1.5">
          <label className="text-xs font-medium text-gray-700">
            可信度（0.0 - 1.0）
          </label>
          <input
            type="number"
            min="0"
            max="1"
            step="0.05"
            value={form.credibilityScore}
            onChange={(e) =>
              setForm((p) => ({
                ...p,
                credibilityScore: Math.max(
                  0,
                  Math.min(1, parseFloat(e.target.value) || 0)
                ),
              }))
            }
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
        </div>

        <div className="space-y-1.5">
          <label className="text-xs font-medium text-gray-700">话题类型</label>
          <div className="flex flex-wrap gap-2">
            {TOPIC_TYPES.map((tt) => {
              const on = form.topicTypes.includes(tt.value);
              return (
                <button
                  type="button"
                  key={tt.value}
                  onClick={() => toggleTopic(tt.value)}
                  className={`rounded-md border px-2.5 py-1 text-xs ${
                    on
                      ? 'border-blue-500 bg-blue-50 text-blue-700'
                      : 'border-gray-300 bg-white text-gray-600 hover:bg-gray-50'
                  }`}
                >
                  {tt.label}
                </button>
              );
            })}
          </div>
        </div>

        <div className="flex items-center gap-2">
          <input
            type="checkbox"
            id="source-enabled"
            checked={form.enabled}
            onChange={(e) =>
              setForm((p) => ({ ...p, enabled: e.target.checked }))
            }
            className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
          />
          <label htmlFor="source-enabled" className="text-sm text-gray-700">
            启用
          </label>
        </div>

        <div className="flex items-center justify-between pt-4">
          {onDelete ? (
            <button
              type="button"
              onClick={() => void onDelete()}
              disabled={saving}
              className="inline-flex items-center gap-1 rounded-lg border border-red-300 bg-white px-3 py-2 text-sm text-red-600 hover:bg-red-50 disabled:opacity-50"
            >
              <Trash2 className="h-4 w-4" />
              删除
            </button>
          ) : (
            <span />
          )}
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              disabled={saving}
              className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-50"
            >
              取消
            </button>
            <button
              type="submit"
              disabled={saving}
              className="inline-flex items-center gap-1 rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              保存
            </button>
          </div>
        </div>
      </form>
    </DrawerShell>
  );
}
