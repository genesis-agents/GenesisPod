'use client';

/**
 * KnowledgeBaseTable —— 知识管理 Tab 1: 知识库
 *
 * 跨用户 KB 列表（admin 全局视角）。行点击 → 右侧抽屉展示 KB 详情：
 *   - 拥有者 / 类型 / 状态
 *   - 文档/成员/Wiki 页计数
 *   - 文档状态分桶
 *   - Wiki 启用配置（debounce / dailyBudget / autoIngest）
 *
 * 数据来源：GET /admin/knowledge/kbs（分页 + filter）
 * 详情：GET /admin/knowledge/kbs/:id
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Loader2, RefreshCw, Search, X } from 'lucide-react';
import { config } from '@/lib/utils/config';
import { getAuthHeader } from '@/lib/utils/auth';
import { logger } from '@/lib/utils/logger';

interface KBRow {
  id: string;
  name: string;
  description: string | null;
  type: string;
  status: string;
  sourceType: string;
  ownerUserId: string;
  ownerEmail: string | null;
  ownerName: string | null;
  wikiEnabled: boolean;
  documentCount: number;
  memberCount: number;
  createdAt: string;
  updatedAt: string;
  lastSyncedAt: string | null;
}

interface KBDetail {
  id: string;
  name: string;
  description: string | null;
  type: string;
  status: string;
  sourceType: string;
  sourceTypes: unknown;
  owner: { id: string; email: string; fullName: string | null } | null;
  wikiEnabled: boolean;
  wikiConfig: {
    autoIngestEnabled?: boolean;
    autoIngestDailyBudgetCalls?: number;
    autoIngestDebounceSeconds?: number;
  } | null;
  counts: { documents: number; members: number; wikiPages: number };
  docStatusBuckets: Array<{ status: string; count: number }>;
  members: Array<{
    userId: string;
    role: string;
    joinedAt: string;
    email: string | null;
    fullName: string | null;
  }>;
  createdAt: string;
  updatedAt: string;
  lastSyncedAt: string | null;
  lastError: string | null;
}

interface ListResponse {
  items: KBRow[];
  pagination: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
}

function fmtTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleString();
}

function statusBadgeClass(status: string): string {
  switch (status) {
    case 'READY':
      return 'bg-green-100 text-green-700';
    case 'PROCESSING':
      return 'bg-blue-100 text-blue-700';
    case 'PENDING':
      return 'bg-amber-100 text-amber-700';
    case 'ERROR':
      return 'bg-red-100 text-red-700';
    default:
      return 'bg-gray-100 text-gray-700';
  }
}

export function KnowledgeBaseTable() {
  const [items, setItems] = useState<KBRow[]>([]);
  const [pagination, setPagination] = useState<ListResponse['pagination']>({
    page: 1,
    pageSize: 50,
    total: 0,
    totalPages: 0,
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const load = useCallback(
    async (page = 1) => {
      setLoading(true);
      setError(null);
      try {
        const params = new URLSearchParams({
          page: String(page),
          pageSize: String(pagination.pageSize),
        });
        if (search.trim()) params.set('search', search.trim());
        if (statusFilter) params.set('status', statusFilter);
        const res = await fetch(
          `${config.apiUrl}/admin/knowledge/kbs?${params}`,
          {
            headers: getAuthHeader(),
          }
        );
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const raw = await res.json();
        const data: ListResponse = raw?.data ?? raw;
        setItems(Array.isArray(data.items) ? data.items : []);
        setPagination(
          data.pagination ?? { page: 1, pageSize: 50, total: 0, totalPages: 0 }
        );
      } catch (e) {
        setError((e as Error).message);
        logger.error('[KnowledgeBaseTable] load failed', e);
      } finally {
        setLoading(false);
      }
    },
    [search, statusFilter, pagination.pageSize]
  );

  useEffect(() => {
    void load(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    void load(1);
  };

  return (
    <div className="space-y-3">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2">
        <form
          onSubmit={onSearchSubmit}
          className="relative min-w-[240px] flex-1"
        >
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="搜索 KB 名称或描述..."
            className="w-full rounded-lg border border-gray-300 bg-white py-2 pl-10 pr-3 text-sm text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
        </form>
        <select
          value={statusFilter}
          onChange={(e) => {
            setStatusFilter(e.target.value);
            void load(1);
          }}
          className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
        >
          <option value="">全部状态</option>
          <option value="READY">READY</option>
          <option value="PROCESSING">PROCESSING</option>
          <option value="PENDING">PENDING</option>
          <option value="ERROR">ERROR</option>
        </select>
        <button
          type="button"
          onClick={() => void load(pagination.page)}
          disabled={loading}
          className="inline-flex items-center gap-1 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-50"
        >
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          刷新
        </button>
        <span className="text-xs text-gray-500">
          {pagination.total} 个 KB · 第 {pagination.page}/
          {pagination.totalPages || 1} 页
        </span>
      </div>

      {error && (
        <div className="rounded-lg bg-red-50 p-3 text-sm text-red-600">
          加载失败：{error}
        </div>
      )}

      {/* Table */}
      <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <Th>名称</Th>
              <Th>拥有者</Th>
              <Th>类型</Th>
              <Th>状态</Th>
              <Th className="text-right">文档</Th>
              <Th className="text-right">成员</Th>
              <Th>Wiki</Th>
              <Th>上次同步</Th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 bg-white">
            {items.length === 0 && !loading ? (
              <tr>
                <td
                  colSpan={8}
                  className="px-4 py-12 text-center text-sm text-gray-500"
                >
                  暂无 KB
                </td>
              </tr>
            ) : (
              items.map((kb) => (
                <tr
                  key={kb.id}
                  onClick={() => setSelectedId(kb.id)}
                  className="cursor-pointer hover:bg-gray-50"
                >
                  <td
                    className="max-w-[280px] truncate whitespace-nowrap px-4 py-3 text-sm font-medium text-gray-900"
                    title={kb.name}
                  >
                    {kb.name}
                  </td>
                  <td
                    className="max-w-[200px] truncate whitespace-nowrap px-4 py-3 text-xs text-gray-600"
                    title={kb.ownerEmail ?? kb.ownerUserId}
                  >
                    {kb.ownerEmail ?? kb.ownerUserId.slice(0, 8)}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-xs text-gray-600">
                    {kb.type}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-xs">
                    <span
                      className={`inline-flex whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ${statusBadgeClass(kb.status)}`}
                    >
                      {kb.status}
                    </span>
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-right text-sm tabular-nums text-gray-700">
                    {kb.documentCount}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-right text-sm tabular-nums text-gray-700">
                    {kb.memberCount}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-xs">
                    {kb.wikiEnabled ? (
                      <span className="inline-flex whitespace-nowrap rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-700">
                        启用
                      </span>
                    ) : (
                      <span className="text-gray-400">—</span>
                    )}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-xs text-gray-500">
                    {fmtTime(kb.lastSyncedAt)}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {pagination.totalPages > 1 && (
        <div className="flex items-center justify-end gap-2 text-sm text-gray-600">
          <button
            type="button"
            onClick={() => void load(pagination.page - 1)}
            disabled={pagination.page <= 1 || loading}
            className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-xs hover:bg-gray-50 disabled:opacity-40"
          >
            上一页
          </button>
          <button
            type="button"
            onClick={() => void load(pagination.page + 1)}
            disabled={pagination.page >= pagination.totalPages || loading}
            className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-xs hover:bg-gray-50 disabled:opacity-40"
          >
            下一页
          </button>
        </div>
      )}

      {/* Detail drawer */}
      {selectedId && (
        <KnowledgeBaseDrawer
          id={selectedId}
          onClose={() => setSelectedId(null)}
        />
      )}
    </div>
  );
}

function Th({
  children,
  className = '',
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <th
      className={`whitespace-nowrap px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 ${className}`}
    >
      {children}
    </th>
  );
}

// ──────────────── Drawer ────────────────

function KnowledgeBaseDrawer({
  id,
  onClose,
}: {
  id: string;
  onClose: () => void;
}) {
  const [detail, setDetail] = useState<KBDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    void (async () => {
      try {
        const res = await fetch(`${config.apiUrl}/admin/knowledge/kbs/${id}`, {
          headers: getAuthHeader(),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const raw = await res.json();
        const data: KBDetail | null = raw?.data ?? raw;
        if (!cancelled) setDetail(data);
      } catch (e) {
        if (!cancelled) setError((e as Error).message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [id]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const docStatusMap = useMemo(() => {
    const m = new Map<string, number>();
    for (const b of detail?.docStatusBuckets ?? []) m.set(b.status, b.count);
    return m;
  }, [detail]);

  return (
    <>
      <div
        className="fixed inset-y-0 left-0 right-0 z-40 bg-black/30 md:left-52"
        onClick={onClose}
      />
      <div className="fixed inset-y-0 right-0 z-50 flex w-full flex-col bg-white shadow-2xl md:w-[calc(100vw-13rem-2rem)] md:max-w-[720px]">
        {/* Header */}
        <div className="flex flex-shrink-0 items-center justify-between border-b border-gray-200 px-6 py-4">
          <div className="min-w-0 flex-1">
            <h2 className="truncate text-base font-semibold text-gray-900">
              {loading ? '加载中...' : (detail?.name ?? '—')}
            </h2>
            <p className="mt-0.5 truncate text-xs text-gray-500">
              {detail?.description ?? ''}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="ml-3 rounded-lg p-1.5 text-gray-500 hover:bg-gray-100"
            aria-label="关闭"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-6">
          {loading && (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-blue-600" />
            </div>
          )}
          {error && (
            <div className="rounded-lg bg-red-50 p-3 text-sm text-red-600">
              加载失败：{error}
            </div>
          )}
          {detail && !loading && (
            <div className="space-y-5">
              {/* 基本信息 */}
              <Section title="基本信息">
                <Row
                  label="ID"
                  value={<code className="font-mono text-xs">{detail.id}</code>}
                />
                <Row
                  label="拥有者"
                  value={
                    detail.owner
                      ? `${detail.owner.email}${detail.owner.fullName ? ` (${detail.owner.fullName})` : ''}`
                      : '—'
                  }
                />
                <Row label="类型" value={detail.type} />
                <Row
                  label="状态"
                  value={
                    <span
                      className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${statusBadgeClass(detail.status)}`}
                    >
                      {detail.status}
                    </span>
                  }
                />
                <Row label="主源" value={detail.sourceType} />
                <Row label="创建时间" value={fmtTime(detail.createdAt)} />
                <Row label="更新时间" value={fmtTime(detail.updatedAt)} />
                <Row label="上次同步" value={fmtTime(detail.lastSyncedAt)} />
              </Section>

              {/* 计数 */}
              <Section title="资产计数">
                <StatGrid
                  items={[
                    { label: '文档', value: detail.counts.documents },
                    { label: '成员', value: detail.counts.members },
                    { label: 'Wiki 页', value: detail.counts.wikiPages },
                  ]}
                />
              </Section>

              {/* 文档状态分桶 */}
              {detail.docStatusBuckets.length > 0 && (
                <Section title="文档状态分布">
                  <div className="flex flex-wrap gap-2">
                    {[
                      'PENDING',
                      'PROCESSING',
                      'COMPLETED',
                      'READY',
                      'ERROR',
                    ].map((s) => {
                      const n = docStatusMap.get(s) ?? 0;
                      if (n === 0) return null;
                      return (
                        <span
                          key={s}
                          className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-medium ${statusBadgeClass(s)}`}
                        >
                          {s}
                          <span className="rounded-full bg-white/70 px-1.5 py-0.5 text-[10px] font-semibold">
                            {n}
                          </span>
                        </span>
                      );
                    })}
                  </div>
                </Section>
              )}

              {/* Wiki 配置 */}
              <Section title="Wiki 配置">
                <Row
                  label="Wiki 启用"
                  value={detail.wikiEnabled ? '是' : '否'}
                />
                {detail.wikiConfig && (
                  <>
                    <Row
                      label="自动同步"
                      value={
                        detail.wikiConfig.autoIngestEnabled === false
                          ? '禁用'
                          : '启用'
                      }
                    />
                    <Row
                      label="去抖秒数"
                      value={String(
                        detail.wikiConfig.autoIngestDebounceSeconds ??
                          '默认 300'
                      )}
                    />
                    <Row
                      label="每日预算"
                      value={String(
                        detail.wikiConfig.autoIngestDailyBudgetCalls ??
                          '默认 20'
                      )}
                    />
                  </>
                )}
              </Section>

              {/* 成员 */}
              {detail.members.length > 0 && (
                <Section title={`成员 (${detail.members.length})`}>
                  <div className="overflow-x-auto rounded-md border border-gray-200">
                    <table className="min-w-full text-xs">
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="whitespace-nowrap px-3 py-2 text-left font-medium text-gray-500">
                            邮箱
                          </th>
                          <th className="whitespace-nowrap px-3 py-2 text-left font-medium text-gray-500">
                            角色
                          </th>
                          <th className="whitespace-nowrap px-3 py-2 text-left font-medium text-gray-500">
                            加入时间
                          </th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {detail.members.map((m) => (
                          <tr key={m.userId}>
                            <td
                              className="max-w-[200px] truncate whitespace-nowrap px-3 py-1.5 text-gray-700"
                              title={m.email ?? m.userId}
                            >
                              {m.email ?? m.userId.slice(0, 8)}
                            </td>
                            <td className="whitespace-nowrap px-3 py-1.5 text-gray-700">
                              {m.role}
                            </td>
                            <td className="whitespace-nowrap px-3 py-1.5 text-gray-500">
                              {fmtTime(m.joinedAt)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </Section>
              )}

              {detail.lastError && (
                <Section title="最近错误">
                  <pre className="overflow-x-auto whitespace-pre-wrap rounded-md bg-red-50 p-3 text-xs text-red-700">
                    {detail.lastError}
                  </pre>
                </Section>
              )}
            </div>
          )}
        </div>
      </div>
    </>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section>
      <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-gray-500">
        {title}
      </h3>
      <div className="space-y-1.5">{children}</div>
    </section>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-baseline gap-3 text-sm">
      <span className="w-24 flex-shrink-0 text-xs text-gray-500">{label}</span>
      <span className="min-w-0 flex-1 truncate text-gray-900">{value}</span>
    </div>
  );
}

function StatGrid({
  items,
}: {
  items: Array<{ label: string; value: number | string }>;
}) {
  return (
    <div className="grid grid-cols-3 gap-2">
      {items.map((it) => (
        <div
          key={it.label}
          className="rounded-md border border-gray-200 bg-gray-50 px-3 py-2"
        >
          <div className="text-[10px] uppercase tracking-wider text-gray-500">
            {it.label}
          </div>
          <div className="mt-0.5 text-base font-semibold tabular-nums text-gray-900">
            {it.value}
          </div>
        </div>
      ))}
    </div>
  );
}
