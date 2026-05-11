'use client';

/**
 * BuiltinToolsTable —— 工具管理 Tab 1: 内置工具
 *
 * 2026-05-11 W3r: 按 category 分组排序 + 合并第三方 API 服务到内置工具
 *
 * 数据：GET /admin/ai/tools 返回 builtin (implemented:true) + external
 *   (implemented:false) 全集；不再过滤 —— 第三方 API 服务（如 firecrawl /
 *   jina / elevenlabs）和内置工具（如 web-search / web-extraction）合并展
 *   示，按 category 分组，每行带启用 / 测试 / 配置 API Key 操作。
 *
 * 操作：
 *   - 启用 toggle: PATCH /admin/ai/tools/:toolId { enabled }
 *   - 测试: POST /admin/ai/tools/:toolId/test
 *   - 配置 API Key（在抽屉内编辑）: PATCH { config: { apiKey } } 或
 *     PATCH { secretKey } (Secret Manager 引用)
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Loader2,
  RefreshCw,
  Search,
  PlayCircle,
  KeyRound,
  CheckCircle2,
  XCircle,
} from 'lucide-react';
import { config } from '@/lib/utils/config';
import { getAuthHeader } from '@/lib/utils/auth';
import { logger } from '@/lib/utils/logger';
import { DrawerShell, Row, Section, Th } from '../_shared/admin-tables';

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

// industry-report 是抓取源专用工具，不在 builtin tab 展示（独立于 third-party tab）
const EXCLUDED_TOOL_IDS = new Set(['industry-report']);

// category 显示顺序（其余按字母序）
const CATEGORY_ORDER = [
  'web-search',
  'web-extraction',
  'youtube-transcript',
  'tts',
  'image-search',
  'academic-research',
  'finance-data',
  'weather-data',
  'devtools',
  'policy-research',
  'skills-marketplace',
];

export function BuiltinToolsTable() {
  const [allTools, setAllTools] = useState<ToolRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [enabledFilter, setEnabledFilter] = useState<'' | 'true' | 'false'>('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [testingId, setTestingId] = useState<string | null>(null);
  const [testResults, setTestResults] = useState<
    Record<string, { success: boolean; message: string }>
  >({});

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
      const list = Array.isArray(data.tools) ? data.tools : [];
      setAllTools(list.filter((t) => !EXCLUDED_TOOL_IDS.has(t.toolId)));
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

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return allTools.filter((t) => {
      if (enabledFilter && String(t.enabled) !== enabledFilter) return false;
      if (q) {
        const hit =
          t.toolId.toLowerCase().includes(q) ||
          t.name.toLowerCase().includes(q) ||
          (t.displayName ?? '').toLowerCase().includes(q) ||
          (t.description ?? '').toLowerCase().includes(q) ||
          t.tags.some((tag) => tag.toLowerCase().includes(q));
        if (!hit) return false;
      }
      return true;
    });
  }, [allTools, search, enabledFilter]);

  const grouped = useMemo(() => {
    const map = new Map<string, ToolRow[]>();
    for (const t of filtered) {
      const cat = t.category || 'other';
      const arr = map.get(cat) ?? [];
      arr.push(t);
      map.set(cat, arr);
    }
    for (const arr of map.values()) {
      arr.sort((a, b) =>
        (a.displayName || a.name).localeCompare(b.displayName || b.name)
      );
    }
    const orderIndex = (cat: string) => {
      const idx = CATEGORY_ORDER.indexOf(cat);
      return idx === -1 ? CATEGORY_ORDER.length : idx;
    };
    return Array.from(map.entries()).sort(([a], [b]) => {
      const ai = orderIndex(a);
      const bi = orderIndex(b);
      if (ai !== bi) return ai - bi;
      return a.localeCompare(b);
    });
  }, [filtered]);

  const hasConfiguredKey = (t: ToolRow): boolean => {
    if (t.secretKey) return true;
    if (t.config && typeof t.config === 'object') {
      const cfg = t.config;
      if (typeof cfg.apiKey === 'string' && cfg.apiKey.length > 0) return true;
    }
    return false;
  };

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

  const runTest = async (toolId: string) => {
    setTestingId(toolId);
    try {
      const res = await fetch(
        `${config.apiUrl}/admin/ai/tools/${toolId}/test`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
          body: JSON.stringify({}),
        }
      );
      const raw = await res.json();
      const data = raw?.data ?? raw;
      setTestResults((prev) => ({
        ...prev,
        [toolId]: {
          success: !!data.success,
          message: data.message || data.error || (res.ok ? '通过' : '失败'),
        },
      }));
    } catch (e) {
      setTestResults((prev) => ({
        ...prev,
        [toolId]: { success: false, message: (e as Error).message },
      }));
    } finally {
      setTestingId(null);
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[240px] flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="搜索 toolId / name / tags..."
            className="w-full rounded-lg border border-gray-300 bg-white py-2 pl-10 pr-3 text-sm text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
        </div>
        <select
          value={enabledFilter}
          onChange={(e) =>
            setEnabledFilter(e.target.value as '' | 'true' | 'false')
          }
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
          {filtered.length} / {allTools.length} 个工具 · {grouped.length} 类
        </span>
      </div>

      {error && (
        <div className="rounded-lg bg-red-50 p-3 text-sm text-red-600">
          加载失败：{error}
        </div>
      )}

      <div className="space-y-4">
        {grouped.length === 0 && !loading ? (
          <div className="rounded-lg border border-gray-200 bg-white py-12 text-center text-sm text-gray-500">
            暂无内置工具
          </div>
        ) : (
          grouped.map(([category, tools]) => (
            <div
              key={category}
              className="overflow-hidden rounded-lg border border-gray-200 bg-white"
            >
              <div className="flex items-center justify-between bg-gray-50 px-4 py-2">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-700">
                  {category}
                </h3>
                <span className="text-xs text-gray-500">
                  {tools.length} 个 · {tools.filter((t) => t.enabled).length}{' '}
                  已启用
                </span>
              </div>
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-white">
                  <tr>
                    <Th>名称</Th>
                    <Th>toolId</Th>
                    <Th>密钥</Th>
                    <Th>启用</Th>
                    <Th className="text-right">测试</Th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {tools.map((t) => {
                    const result = testResults[t.toolId];
                    const configured = hasConfiguredKey(t);
                    return (
                      <tr
                        key={t.toolId}
                        onClick={() => setSelectedId(t.toolId)}
                        className="cursor-pointer hover:bg-gray-50"
                      >
                        <td
                          className="max-w-[280px] truncate whitespace-nowrap px-4 py-2.5 text-sm font-medium text-gray-900"
                          title={t.displayName || t.name}
                        >
                          {t.displayName || t.name}
                          {!t.implemented && (
                            <span
                              className="ml-2 inline-flex rounded-md bg-amber-50 px-1.5 py-0.5 text-[10px] font-medium text-amber-700"
                              title="DB-only 配置，无 Registry 实现"
                            >
                              配置
                            </span>
                          )}
                        </td>
                        <td
                          className="font-mono max-w-[200px] truncate whitespace-nowrap px-4 py-2.5 text-xs text-gray-600"
                          title={t.toolId}
                        >
                          {t.toolId}
                        </td>
                        <td className="whitespace-nowrap px-4 py-2.5 text-xs">
                          {configured ? (
                            <span className="inline-flex items-center gap-1 rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700">
                              <KeyRound className="h-3 w-3" />
                              已配置
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-500">
                              <KeyRound className="h-3 w-3" />
                              未配置
                            </span>
                          )}
                        </td>
                        <td
                          className="whitespace-nowrap px-4 py-2.5"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <button
                            type="button"
                            onClick={() =>
                              void toggleEnabled(t.toolId, !t.enabled)
                            }
                            disabled={togglingId === t.toolId}
                            className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
                              t.enabled ? 'bg-blue-600' : 'bg-gray-300'
                            } ${togglingId === t.toolId ? 'opacity-50' : ''}`}
                            aria-label={t.enabled ? '已启用' : '已禁用'}
                          >
                            <span
                              className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform ${
                                t.enabled ? 'translate-x-5' : 'translate-x-1'
                              }`}
                            />
                          </button>
                        </td>
                        <td
                          className="whitespace-nowrap px-4 py-2.5 text-right text-xs"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <div className="inline-flex items-center gap-2">
                            {result && (
                              <span
                                className={`inline-flex items-center gap-1 ${
                                  result.success
                                    ? 'text-green-700'
                                    : 'text-red-700'
                                }`}
                                title={result.message}
                              >
                                {result.success ? (
                                  <CheckCircle2 className="h-3.5 w-3.5" />
                                ) : (
                                  <XCircle className="h-3.5 w-3.5" />
                                )}
                              </span>
                            )}
                            <button
                              type="button"
                              onClick={() => void runTest(t.toolId)}
                              disabled={testingId === t.toolId}
                              className="inline-flex items-center gap-1 rounded-md border border-gray-300 bg-white px-2 py-1 text-xs text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                            >
                              {testingId === t.toolId ? (
                                <Loader2 className="h-3 w-3 animate-spin" />
                              ) : (
                                <PlayCircle className="h-3 w-3" />
                              )}
                              测试
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ))
        )}
      </div>

      {selectedId && (
        <BuiltinToolDrawer
          toolId={selectedId}
          tools={allTools}
          onClose={() => setSelectedId(null)}
          onReload={load}
        />
      )}
    </div>
  );
}

function BuiltinToolDrawer({
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
  const [apiKeyDraft, setApiKeyDraft] = useState('');
  const [secretKeyDraft, setSecretKeyDraft] = useState(tool?.secretKey ?? '');
  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);

  useEffect(() => {
    setApiKeyDraft('');
    setSecretKeyDraft(tool?.secretKey ?? '');
    setSaveMessage(null);
  }, [tool]);

  if (!tool) {
    return (
      <DrawerShell title="加载中..." onClose={onClose}>
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-blue-600" />
        </div>
      </DrawerShell>
    );
  }

  const saveApiKey = async (mode: 'apiKey' | 'secretKey' | 'clear') => {
    setSaving(true);
    setSaveMessage(null);
    try {
      const body: Record<string, unknown> =
        mode === 'apiKey'
          ? { config: { ...(tool.config ?? {}), apiKey: apiKeyDraft } }
          : mode === 'secretKey'
            ? { secretKey: secretKeyDraft || null }
            : {
                secretKey: null,
                config: { ...(tool.config ?? {}), apiKey: '' },
              };
      const res = await fetch(
        `${config.apiUrl}/admin/ai/tools/${tool.toolId}`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
          body: JSON.stringify(body),
        }
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setSaveMessage('保存成功');
      setApiKeyDraft('');
      await onReload();
    } catch (e) {
      setSaveMessage(`保存失败：${(e as Error).message}`);
      logger.error('[BuiltinToolDrawer] save failed', e);
    } finally {
      setSaving(false);
    }
  };

  return (
    <DrawerShell
      title={tool.displayName || tool.name}
      subtitle={tool.description ?? ''}
      onClose={onClose}
    >
      <div className="space-y-5">
        <Section title="基本信息">
          <Row
            label="toolId"
            value={<code className="font-mono text-xs">{tool.toolId}</code>}
          />
          <Row label="分类" value={tool.category} />
          <Row
            label="实现"
            value={
              tool.implemented ? (
                <span className="inline-flex rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-700">
                  Registry
                </span>
              ) : (
                <span className="inline-flex rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700">
                  DB-only 配置
                </span>
              )
            }
          />
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
                  className="inline-flex rounded-md bg-gray-100 px-2 py-0.5 text-xs text-gray-700"
                >
                  {tag}
                </span>
              ))}
            </div>
          </Section>
        )}

        <Section title="API Key 配置">
          <div className="space-y-3">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-gray-700">
                方式 1：直接输入 API Key
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="password"
                  value={apiKeyDraft}
                  onChange={(e) => setApiKeyDraft(e.target.value)}
                  placeholder={
                    tool.config &&
                    typeof tool.config === 'object' &&
                    typeof tool.config.apiKey === 'string' &&
                    tool.config.apiKey.length > 0
                      ? '已配置，留空保持不变'
                      : '粘贴 API Key'
                  }
                  className="font-mono flex-1 rounded-lg border border-gray-300 px-3 py-1.5 text-xs text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
                <button
                  type="button"
                  onClick={() => void saveApiKey('apiKey')}
                  disabled={saving || !apiKeyDraft}
                  className="inline-flex items-center gap-1 rounded-md bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-50"
                >
                  {saving ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : null}
                  保存
                </button>
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-gray-700">
                方式 2：引用 Secret Manager（推荐）
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={secretKeyDraft}
                  onChange={(e) => setSecretKeyDraft(e.target.value)}
                  placeholder="secret key name (如 perplexity_api_key)"
                  className="font-mono flex-1 rounded-lg border border-gray-300 px-3 py-1.5 text-xs text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
                <button
                  type="button"
                  onClick={() => void saveApiKey('secretKey')}
                  disabled={saving || secretKeyDraft === (tool.secretKey ?? '')}
                  className="inline-flex items-center gap-1 rounded-md border border-gray-300 bg-white px-3 py-1.5 text-xs text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                >
                  保存引用
                </button>
              </div>
            </div>

            {(tool.secretKey ||
              (tool.config &&
                typeof tool.config === 'object' &&
                typeof tool.config.apiKey === 'string' &&
                tool.config.apiKey.length > 0)) && (
              <button
                type="button"
                onClick={() => void saveApiKey('clear')}
                disabled={saving}
                className="text-xs text-red-600 hover:text-red-700 disabled:opacity-50"
              >
                清除当前 API Key 配置
              </button>
            )}

            {saveMessage && (
              <div
                className={`rounded-md p-2 text-xs ${
                  saveMessage.startsWith('保存成功')
                    ? 'bg-green-50 text-green-700'
                    : 'bg-red-50 text-red-700'
                }`}
              >
                {saveMessage}
              </div>
            )}
          </div>
        </Section>

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
          <Section title="原始配置">
            <pre className="max-h-[240px] overflow-y-auto whitespace-pre-wrap rounded-md bg-gray-50 p-3 text-xs leading-relaxed text-gray-700">
              {JSON.stringify(maskSecrets(tool.config), null, 2)}
            </pre>
          </Section>
        )}

        {tool.inputSchema != null && (
          <Section title="输入 Schema">
            <pre className="max-h-[200px] overflow-y-auto whitespace-pre-wrap rounded-md bg-gray-50 p-3 text-xs leading-relaxed text-gray-700">
              {JSON.stringify(tool.inputSchema, null, 2)}
            </pre>
          </Section>
        )}

        {tool.outputSchema != null && (
          <Section title="输出 Schema">
            <pre className="max-h-[200px] overflow-y-auto whitespace-pre-wrap rounded-md bg-gray-50 p-3 text-xs leading-relaxed text-gray-700">
              {JSON.stringify(tool.outputSchema, null, 2)}
            </pre>
          </Section>
        )}
      </div>
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
