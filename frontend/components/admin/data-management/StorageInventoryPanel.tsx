'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ArrowRight,
  ChartColumn,
  Cloud,
  Database,
  Download,
  ExternalLink,
  HardDrive,
  Play,
  RefreshCw,
  Rows3,
  ShieldCheck,
} from 'lucide-react';
import { config } from '@/lib/utils/config';
import { getAuthHeader } from '@/lib/utils/auth';
import { toast } from '@/stores';
import { ConfirmDialog } from '@/components/ui/dialogs/ConfirmDialog';
import ResponsiveCard, {
  ResponsiveCardContent,
  ResponsiveCardHeader,
  ResponsiveCardTitle,
} from '@/components/ui/ResponsiveCard';

interface TableStat {
  table: string;
  rows: number;
  totalBytes: number;
  totalHuman: string;
}

interface OffloadFieldStat {
  table: string;
  field: string;
  uriField: string;
  r2Prefix: string;
  totalRows: number;
  rowsWithUri: number;
  rowsWithDbContent: number;
}

interface R2PrefixStat {
  prefix: string;
  objects: number;
  bytes: number;
  bytesHuman: string;
}

interface StorageInventory {
  database: {
    totalBytes: number;
    totalHuman: string;
    tables: TableStat[];
  };
  offloadFields: OffloadFieldStat[];
  r2: {
    configured: boolean;
    bucket: string | null;
    totalObjects: number;
    totalBytes: number;
    totalHuman: string;
    byPrefix: R2PrefixStat[];
  };
  generatedAt: string;
}

interface TrendPoint {
  at: string;
  dbMb: number;
  r2Mb: number;
  r2Objects: number;
}

type TabKey = 'overview' | 'pipeline' | 'catalog' | 'database' | 'trend';

const TABS: Array<{ key: TabKey; label: string; hint: string }> = [
  {
    key: 'overview',
    label: '概览',
    hint: '管理层总览',
  },
  {
    key: 'pipeline',
    label: 'Offload Pipeline',
    hint: 'DB 到 R2 迁移能力',
  },
  {
    key: 'catalog',
    label: 'R2 Catalog',
    hint: 'R2 实际对象目录',
  },
  {
    key: 'database',
    label: 'DB Footprint',
    hint: '数据库占用明细',
  },
  {
    key: 'trend',
    label: 'Trend',
    hint: '30 天体量走势',
  },
];

export default function StorageInventoryPanel() {
  const [data, setData] = useState<StorageInventory | null>(null);
  const [trend, setTrend] = useState<TrendPoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [triggering, setTriggering] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [now, setNow] = useState(Date.now());
  const [tab, setTab] = useState<TabKey>('overview');

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(id);
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [invRes, trendRes] = await Promise.all([
        fetch(`${config.apiUrl}/admin/storage-inventory`, {
          headers: getAuthHeader(),
        }),
        fetch(`${config.apiUrl}/admin/storage-inventory/trend?days=30`, {
          headers: getAuthHeader(),
        }),
      ]);
      if (!invRes.ok) {
        if (invRes.status === 401) throw new Error('UNAUTHORIZED');
        throw new Error(`HTTP ${invRes.status}`);
      }
      const invRaw = (await invRes.json()) as
        | StorageInventory
        | { success?: boolean; data?: StorageInventory };
      const payload =
        (invRaw as { data?: StorageInventory }).data !== undefined
          ? (invRaw as { data: StorageInventory }).data
          : (invRaw as StorageInventory);
      setData(payload);

      if (trendRes.ok) {
        const trendRaw = (await trendRes.json()) as
          | TrendPoint[]
          | { data?: TrendPoint[] };
        setTrend(Array.isArray(trendRaw) ? trendRaw : (trendRaw.data ?? []));
      }
    } catch (e) {
      const msg = (e as Error).message;
      setError(
        msg === 'UNAUTHORIZED'
          ? '未授权访问存储管理接口。'
          : '存储管理数据获取失败。'
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const exportJson = useCallback(() => {
    if (!data) return;
    const blob = new Blob(
      [JSON.stringify({ inventory: data, trend }, null, 2)],
      {
        type: 'application/json',
      }
    );
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `storage-inventory-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }, [data, trend]);

  const confirmRun = useCallback(async () => {
    setTriggering(true);
    setConfirmOpen(false);
    try {
      const response = await fetch(
        `${config.apiUrl}/admin/storage-inventory/run-offload`,
        {
          method: 'POST',
          headers: { ...getAuthHeader(), 'Content-Type': 'application/json' },
          body: '{}',
        }
      );
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      toast.success('Offload 已触发', '后台已经开始执行 DB 到 R2 的迁移批次。');
      for (let i = 0; i < 4; i += 1) {
        await new Promise((resolve) => setTimeout(resolve, 5000));
        await load();
      }
    } catch (e) {
      const msg = (e as Error).message;
      setError(msg);
      toast.error('Offload 触发失败', msg);
    } finally {
      setTriggering(false);
    }
  }, [load]);

  const relative = useMemo(() => {
    if (!data?.generatedAt) return '';
    const diff = Math.max(0, now - new Date(data.generatedAt).getTime());
    if (diff < 60_000) return '刚刚';
    const minutes = Math.round(diff / 60_000);
    if (minutes < 60) return `${minutes} 分钟前`;
    const hours = Math.round(minutes / 60);
    if (hours < 24) return `${hours} 小时前`;
    return `${Math.round(hours / 24)} 天前`;
  }, [data, now]);

  if (loading && !data) {
    return (
      <ResponsiveCard>
        <ResponsiveCardContent>
          <div className="animate-pulse py-10 text-base text-slate-500">
            正在加载存储管理视图...
          </div>
        </ResponsiveCardContent>
      </ResponsiveCard>
    );
  }

  if (error && !data) {
    return (
      <ResponsiveCard>
        <ResponsiveCardContent>
          <div className="flex items-center justify-between gap-4 py-6">
            <div className="text-base text-rose-700">{error}</div>
            <button
              onClick={() => void load()}
              className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition hover:border-slate-300 hover:bg-slate-50"
            >
              <RefreshCw className="h-4 w-4" />
              重新加载
            </button>
          </div>
        </ResponsiveCardContent>
      </ResponsiveCard>
    );
  }

  if (!data) return null;

  const db = data.database;
  const r2 = data.r2;
  const offloadFields = [...data.offloadFields].sort((a, b) =>
    `${a.table}.${a.field}`.localeCompare(`${b.table}.${b.field}`)
  );
  const registeredPrefixMap = new Map<
    string,
    {
      targetCount: number;
      dbRows: number;
      migratedRows: number;
      remainingRows: number;
    }
  >();
  for (const row of offloadFields) {
    const entry = registeredPrefixMap.get(row.r2Prefix) ?? {
      targetCount: 0,
      dbRows: 0,
      migratedRows: 0,
      remainingRows: 0,
    };
    entry.targetCount += 1;
    entry.dbRows += row.totalRows;
    entry.migratedRows += row.rowsWithUri;
    entry.remainingRows += row.rowsWithDbContent;
    registeredPrefixMap.set(row.r2Prefix, entry);
  }

  const catalogRows = Array.from(
    new Set([
      ...Array.from(registeredPrefixMap.keys()),
      ...(r2.byPrefix ?? []).map((row) => row.prefix),
    ])
  )
    .map((prefix) => {
      const live = r2.byPrefix.find((row) => row.prefix === prefix);
      const registered = registeredPrefixMap.get(prefix);
      return {
        prefix,
        objects: live?.objects ?? 0,
        bytes: live?.bytes ?? 0,
        bytesHuman: live?.bytesHuman ?? '0 B',
        targetCount: registered?.targetCount ?? 0,
        managed: Boolean(registered),
        dbRows: registered?.dbRows ?? 0,
        migratedRows: registered?.migratedRows ?? 0,
        remainingRows: registered?.remainingRows ?? 0,
      };
    })
    .sort(
      (a, b) =>
        b.bytes - a.bytes ||
        b.objects - a.objects ||
        a.prefix.localeCompare(b.prefix)
    );

  const totalManagedTargets = offloadFields.length;
  const totalMigratedRows = offloadFields.reduce(
    (sum, row) => sum + row.rowsWithUri,
    0
  );
  const totalRemainingRows = offloadFields.reduce(
    (sum, row) => sum + row.rowsWithDbContent,
    0
  );
  const managedPrefixCount = registeredPrefixMap.size;
  const observedPrefixCount = r2.byPrefix.length;
  const bucketUrl = r2.bucket
    ? `https://dash.cloudflare.com/?to=/:account/r2/default/buckets/${r2.bucket}`
    : null;

  return (
    <>
      <ResponsiveCard>
        <ResponsiveCardHeader>
          <div className="flex flex-col gap-6">
            <div className="flex flex-col justify-between gap-4 xl:flex-row xl:items-start">
              <div className="space-y-3">
                <div className="inline-flex items-center gap-2 rounded-full border border-sky-200 bg-sky-50 px-3 py-1 text-xs font-semibold uppercase tracking-[0.22em] text-sky-700">
                  Storage Governance
                </div>
                <div className="flex flex-col gap-2 xl:flex-row xl:items-end">
                  <ResponsiveCardTitle className="text-3xl font-semibold tracking-tight text-slate-950">
                    存储治理控制台
                  </ResponsiveCardTitle>
                  <div className="text-sm text-slate-500">
                    DB {db.totalHuman} · R2 {r2.totalHuman} · {relative}
                  </div>
                </div>
                <p className="max-w-4xl text-base leading-7 text-slate-600">
                  统一审视数据库冷数据迁移、R2
                  实际对象分布、各业务前缀的落盘情况。未来新增 offload
                  目标只要接入统一注册表，就会自动进入本页展示。
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-3">
                <button
                  onClick={exportJson}
                  className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 transition hover:border-slate-300 hover:bg-slate-50"
                >
                  <Download className="h-4 w-4" />
                  导出快照
                </button>
                <button
                  onClick={() => void load()}
                  className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 transition hover:border-slate-300 hover:bg-slate-50"
                >
                  <RefreshCw
                    className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`}
                  />
                  刷新
                </button>
                <button
                  onClick={() => setConfirmOpen(true)}
                  disabled={!r2.configured || triggering}
                  className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <Play className="h-4 w-4" />
                  {triggering ? '执行中' : '立即运行 Offload'}
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 xl:grid-cols-4">
              <HeadlineStat
                icon={<Database className="h-5 w-5" />}
                label="Database Footprint"
                value={db.totalHuman}
                detail={`${db.tables.length} 张表纳入统计`}
                tone="slate"
              />
              <HeadlineStat
                icon={<Cloud className="h-5 w-5" />}
                label="R2 Object Footprint"
                value={r2.totalHuman}
                detail={
                  r2.configured
                    ? `${r2.totalObjects.toLocaleString()} 个对象 · ${r2.bucket ?? 'bucket'}`
                    : 'R2 未配置'
                }
                tone={r2.configured ? 'blue' : 'amber'}
              />
              <HeadlineStat
                icon={<ShieldCheck className="h-5 w-5" />}
                label="Managed Offload Targets"
                value={String(totalManagedTargets)}
                detail={`${managedPrefixCount} 个注册前缀 · ${totalMigratedRows.toLocaleString()} 行已迁移`}
                tone="emerald"
              />
              <HeadlineStat
                icon={<Rows3 className="h-5 w-5" />}
                label="Observed R2 Prefixes"
                value={String(observedPrefixCount)}
                detail={`${catalogRows.filter((row) => !row.managed).length} 个仅观测前缀`}
                tone="violet"
              />
            </div>

            <div className="flex flex-wrap gap-3">
              {TABS.map((item) => {
                const active = tab === item.key;
                return (
                  <button
                    key={item.key}
                    onClick={() => setTab(item.key)}
                    className={`rounded-2xl border px-4 py-3 text-left transition ${
                      active
                        ? 'border-blue-200 bg-blue-50 text-blue-700 shadow-sm'
                        : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-50'
                    }`}
                  >
                    <div className="text-sm font-semibold">{item.label}</div>
                    <div className="mt-1 text-xs uppercase tracking-[0.16em] opacity-70">
                      {item.hint}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </ResponsiveCardHeader>

        <ResponsiveCardContent>
          {error && (
            <div className="mb-6 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
              {error}
            </div>
          )}

          {tab === 'overview' && (
            <div className="space-y-6">
              <section className="grid grid-cols-1 gap-4 xl:grid-cols-3">
                <SummaryCard
                  title="Offload 覆盖面"
                  description="统一注册表覆盖所有当前已接入的 DB 到 R2 冷迁移目标。"
                  rows={[
                    ['注册目标', `${totalManagedTargets} 个字段`],
                    ['已迁移行数', totalMigratedRows.toLocaleString()],
                    ['仍在 DB', totalRemainingRows.toLocaleString()],
                  ]}
                />
                <SummaryCard
                  title="R2 目录生态"
                  description="R2 Catalog 展示实际 bucket 内的全部顶级前缀，不依赖手工枚举。"
                  rows={[
                    ['活跃前缀', `${observedPrefixCount} 个`],
                    ['注册前缀', `${managedPrefixCount} 个`],
                    [
                      '仅观测前缀',
                      `${catalogRows.filter((row) => !row.managed).length} 个`,
                    ],
                  ]}
                />
                <SummaryCard
                  title="执行状态"
                  description="可手动触发一次 offload 批次，后台按统一注册表调度。"
                  rows={[
                    ['R2 配置', r2.configured ? '已启用' : '未启用'],
                    ['Bucket', r2.bucket ?? '未配置'],
                    ['最近快照', relative || '刚刚'],
                  ]}
                  action={
                    bucketUrl ? (
                      <a
                        href={bucketUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-2 text-sm font-medium text-blue-600 hover:text-blue-700"
                      >
                        打开 Cloudflare R2
                        <ExternalLink className="h-4 w-4" />
                      </a>
                    ) : null
                  }
                />
              </section>

              <section className="grid grid-cols-1 gap-4 xl:grid-cols-2">
                <PanelFrame
                  title="前缀全景"
                  subtitle="注册前缀与实际 bucket 前缀统一对照。"
                >
                  <div className="space-y-3">
                    {catalogRows.slice(0, 6).map((row) => (
                      <CatalogRow key={row.prefix} row={row} />
                    ))}
                  </div>
                </PanelFrame>

                <PanelFrame
                  title="重点大表"
                  subtitle="按数据库体量排序，帮助识别主要存储压力来源。"
                >
                  <div className="space-y-3">
                    {db.tables.slice(0, 6).map((row) => (
                      <div
                        key={row.table}
                        className="flex items-center justify-between rounded-2xl border border-slate-200 bg-white px-4 py-3"
                      >
                        <div>
                          <div className="font-mono text-sm font-semibold text-slate-900">
                            {row.table}
                          </div>
                          <div className="mt-1 text-sm text-slate-500">
                            {row.rows.toLocaleString()} rows
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="text-lg font-semibold text-slate-900">
                            {row.totalHuman}
                          </div>
                          <div className="mt-1 text-xs uppercase tracking-[0.16em] text-slate-400">
                            table size
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </PanelFrame>
              </section>
            </div>
          )}

          {tab === 'pipeline' && (
            <div className="space-y-6">
              <section className="grid grid-cols-1 gap-4 xl:grid-cols-3">
                <SummaryCard
                  title="Pipeline 状态"
                  description="一个目标对应一个 DB 字段，统一从注册表派生。"
                  rows={[
                    ['字段目标', `${totalManagedTargets} 个`],
                    ['已迁移', totalMigratedRows.toLocaleString()],
                    ['待迁移', totalRemainingRows.toLocaleString()],
                  ]}
                />
                <SummaryCard
                  title="Playground 覆盖"
                  description="主 mission 和 report version 已纳入统一 offload 能力。"
                  rows={[
                    [
                      'Mission 字段',
                      String(
                        offloadFields.filter((row) =>
                          row.table.startsWith('agent_playground_missions')
                        ).length
                      ),
                    ],
                    [
                      'Version 字段',
                      String(
                        offloadFields.filter((row) =>
                          row.table.startsWith('mission_report_versions')
                        ).length
                      ),
                    ],
                    ['主前缀', 'playground-missions/'],
                  ]}
                />
                <SummaryCard
                  title="执行原则"
                  description="小于阈值的内容只记录 size，不搬运；大字段才会进入 R2。"
                  rows={[
                    ['迁移方向', 'DB → R2'],
                    ['Orphan 清理', '已纳入 prefix registry'],
                    ['透明回填', 'Prisma hydration'],
                  ]}
                />
              </section>

              <section className="grid grid-cols-1 gap-4">
                {offloadFields.map((row) => (
                  <OffloadTargetCard
                    key={`${row.table}.${row.field}`}
                    row={row}
                  />
                ))}
              </section>
            </div>
          )}

          {tab === 'catalog' && (
            <PanelFrame
              title="R2 Catalog"
              subtitle="展示 bucket 中当前实际存在的全部顶级 prefix，并标记哪些属于受管 offload 前缀。"
            >
              <div className="overflow-hidden rounded-3xl border border-slate-200">
                <table className="w-full min-w-[980px] text-left">
                  <thead className="bg-slate-50 text-xs uppercase tracking-[0.16em] text-slate-500">
                    <tr>
                      <th className="px-5 py-4">Prefix</th>
                      <th className="px-5 py-4">Status</th>
                      <th className="px-5 py-4 text-right">Objects</th>
                      <th className="px-5 py-4 text-right">R2 Size</th>
                      <th className="px-5 py-4 text-right">
                        Registered Targets
                      </th>
                      <th className="px-5 py-4 text-right">DB Rows</th>
                      <th className="px-5 py-4 text-right">Migrated</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 bg-white text-sm text-slate-700">
                    {catalogRows.map((row) => (
                      <tr key={row.prefix}>
                        <td className="font-mono px-5 py-4 font-semibold text-slate-900">
                          {row.prefix}
                        </td>
                        <td className="px-5 py-4">
                          <span
                            className={`rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-[0.14em] ${
                              row.managed
                                ? 'bg-emerald-50 text-emerald-700'
                                : 'bg-slate-100 text-slate-600'
                            }`}
                          >
                            {row.managed ? 'Managed' : 'Observed'}
                          </span>
                        </td>
                        <td className="px-5 py-4 text-right">
                          {row.objects.toLocaleString()}
                        </td>
                        <td className="px-5 py-4 text-right">
                          {row.bytesHuman}
                        </td>
                        <td className="px-5 py-4 text-right">
                          {row.targetCount}
                        </td>
                        <td className="px-5 py-4 text-right">
                          {row.dbRows.toLocaleString()}
                        </td>
                        <td className="px-5 py-4 text-right text-emerald-700">
                          {row.migratedRows.toLocaleString()}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </PanelFrame>
          )}

          {tab === 'database' && (
            <PanelFrame
              title="Database Footprint"
              subtitle="按体量查看表级占用，便于识别存储热点与 offload 优先级。"
            >
              <div className="overflow-hidden rounded-3xl border border-slate-200">
                <table className="w-full min-w-[860px] text-left">
                  <thead className="bg-slate-50 text-xs uppercase tracking-[0.16em] text-slate-500">
                    <tr>
                      <th className="px-5 py-4">Table</th>
                      <th className="px-5 py-4 text-right">Rows</th>
                      <th className="px-5 py-4 text-right">Size</th>
                      <th className="px-5 py-4 text-right">Share</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 bg-white text-sm text-slate-700">
                    {db.tables.map((row) => {
                      const pct =
                        db.totalBytes > 0
                          ? (row.totalBytes / db.totalBytes) * 100
                          : 0;
                      return (
                        <tr key={row.table}>
                          <td className="font-mono px-5 py-4 font-semibold text-slate-900">
                            {row.table}
                          </td>
                          <td className="px-5 py-4 text-right">
                            {row.rows.toLocaleString()}
                          </td>
                          <td className="px-5 py-4 text-right">
                            {row.totalHuman}
                          </td>
                          <td className="px-5 py-4 text-right">
                            <div className="inline-flex min-w-[180px] items-center gap-3">
                              <div className="h-2 flex-1 overflow-hidden rounded-full bg-slate-200">
                                <div
                                  className="h-full rounded-full bg-slate-800"
                                  style={{ width: `${Math.min(100, pct)}%` }}
                                />
                              </div>
                              <span className="w-12 text-right text-xs font-semibold text-slate-500">
                                {pct.toFixed(1)}%
                              </span>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </PanelFrame>
          )}

          {tab === 'trend' && (
            <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1.2fr_0.8fr]">
              <PanelFrame
                title="Storage Trend"
                subtitle="过去 30 天 DB 与 R2 总量变化。"
              >
                <TrendChart points={trend} />
              </PanelFrame>
              <PanelFrame
                title="趋势解读"
                subtitle="帮助判断 offload 是否在把冷数据逐步移出 DB。"
              >
                <div className="space-y-4 text-sm leading-7 text-slate-600">
                  <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                    <div className="font-semibold text-slate-900">
                      看 DB 曲线
                    </div>
                    <div className="mt-1">
                      如果 DB 长期陡增，但 R2 不增长，说明新增大字段尚未纳入
                      offload。
                    </div>
                  </div>
                  <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                    <div className="font-semibold text-slate-900">
                      看 R2 曲线
                    </div>
                    <div className="mt-1">
                      R2 增长而 DB 放缓，通常说明冷数据迁移路径正常工作。
                    </div>
                  </div>
                  <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                    <div className="font-semibold text-slate-900">
                      看 Prefix Catalog
                    </div>
                    <div className="mt-1">
                      如果 bucket 出现新 prefix，但 Pipeline
                      没有对应受管目标，说明还有业务写入未接入治理。
                    </div>
                  </div>
                </div>
              </PanelFrame>
            </div>
          )}
        </ResponsiveCardContent>
      </ResponsiveCard>

      <ConfirmDialog
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        onConfirm={confirmRun}
        title="确认立即运行 Offload"
        description="这会触发一次后台 DB 到 R2 的迁移扫描，适合在新增能力接入后做一次手工验证。"
        type="info"
        confirmText="立即执行"
        loading={triggering}
      />
    </>
  );
}

function HeadlineStat({
  icon,
  label,
  value,
  detail,
  tone,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  detail: string;
  tone: 'slate' | 'blue' | 'emerald' | 'violet' | 'amber';
}) {
  const tones: Record<typeof tone, string> = {
    slate: 'border-slate-200 bg-white text-slate-900',
    blue: 'border-blue-200 bg-blue-50/60 text-blue-900',
    emerald: 'border-emerald-200 bg-emerald-50/60 text-emerald-900',
    violet: 'border-violet-200 bg-violet-50/70 text-violet-900',
    amber: 'border-amber-200 bg-amber-50 text-amber-900',
  };

  return (
    <div className={`rounded-3xl border px-5 py-5 shadow-sm ${tones[tone]}`}>
      <div className="flex items-center gap-2 text-sm font-semibold uppercase tracking-[0.16em] opacity-75">
        {icon}
        {label}
      </div>
      <div className="mt-4 text-3xl font-semibold tracking-tight">{value}</div>
      <div className="mt-2 text-sm opacity-75">{detail}</div>
    </div>
  );
}

function PanelFrame({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-[28px] border border-slate-200 bg-slate-50/70 p-5">
      <div className="mb-5 flex flex-col gap-2">
        <div className="text-2xl font-semibold tracking-tight text-slate-950">
          {title}
        </div>
        <div className="text-sm leading-6 text-slate-500">{subtitle}</div>
      </div>
      {children}
    </section>
  );
}

function SummaryCard({
  title,
  description,
  rows,
  action,
}: {
  title: string;
  description: string;
  rows: Array<[string, string]>;
  action?: React.ReactNode;
}) {
  return (
    <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="text-xl font-semibold tracking-tight text-slate-950">
        {title}
      </div>
      <div className="mt-2 text-sm leading-6 text-slate-500">{description}</div>
      <div className="mt-5 space-y-3">
        {rows.map(([label, value]) => (
          <div key={label} className="flex items-center justify-between gap-4">
            <div className="text-sm text-slate-500">{label}</div>
            <div className="text-sm font-semibold text-slate-900">{value}</div>
          </div>
        ))}
      </div>
      {action ? <div className="mt-5">{action}</div> : null}
    </div>
  );
}

function OffloadTargetCard({ row }: { row: OffloadFieldStat }) {
  const progress =
    row.totalRows > 0 ? (row.rowsWithUri / row.totalRows) * 100 : 0;
  const state =
    row.rowsWithDbContent === 0
      ? 'Complete'
      : row.rowsWithUri === 0
        ? 'Pending'
        : 'Active';

  return (
    <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-3">
            <div className="font-mono text-lg font-semibold text-slate-950">
              {row.table}.{row.field}
            </div>
            <span
              className={`rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] ${
                state === 'Complete'
                  ? 'bg-emerald-50 text-emerald-700'
                  : state === 'Active'
                    ? 'bg-blue-50 text-blue-700'
                    : 'bg-amber-50 text-amber-700'
              }`}
            >
              {state}
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-sm text-slate-500">
            <span className="font-mono rounded-full bg-slate-100 px-3 py-1 text-slate-700">
              {row.r2Prefix}
            </span>
            <ArrowRight className="h-4 w-4" />
            <span className="font-mono rounded-full bg-slate-100 px-3 py-1 text-slate-700">
              {row.uriField}
            </span>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
          <MetricPill
            label="Total Rows"
            value={row.totalRows.toLocaleString()}
          />
          <MetricPill
            label="Migrated"
            value={row.rowsWithUri.toLocaleString()}
          />
          <MetricPill
            label="Still In DB"
            value={row.rowsWithDbContent.toLocaleString()}
          />
          <MetricPill label="Coverage" value={`${progress.toFixed(0)}%`} />
        </div>
      </div>

      <div className="mt-5">
        <div className="mb-2 flex items-center justify-between text-sm text-slate-500">
          <span>迁移进度</span>
          <span className="font-semibold text-slate-700">
            {progress.toFixed(1)}%
          </span>
        </div>
        <div className="h-3 overflow-hidden rounded-full bg-slate-200">
          <div
            className={`h-full rounded-full ${
              progress >= 95
                ? 'bg-emerald-500'
                : progress >= 50
                  ? 'bg-blue-600'
                  : 'bg-amber-500'
            }`}
            style={{ width: `${Math.min(100, progress)}%` }}
          />
        </div>
      </div>
    </div>
  );
}

function MetricPill({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
      <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">
        {label}
      </div>
      <div className="mt-2 text-lg font-semibold text-slate-900">{value}</div>
    </div>
  );
}

function CatalogRow({
  row,
}: {
  row: {
    prefix: string;
    objects: number;
    bytesHuman: string;
    targetCount: number;
    managed: boolean;
    remainingRows: number;
  };
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3">
      <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
        <div>
          <div className="font-mono text-sm font-semibold text-slate-900">
            {row.prefix}
          </div>
          <div className="mt-1 text-sm text-slate-500">
            {row.managed ? '受管前缀' : '仅观测到对象前缀'}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-4 text-sm text-slate-600">
          <span>{row.objects.toLocaleString()} objects</span>
          <span>{row.bytesHuman}</span>
          <span>{row.targetCount} targets</span>
          <span>{row.remainingRows.toLocaleString()} rows in DB</span>
        </div>
      </div>
    </div>
  );
}

function TrendChart({ points }: { points: TrendPoint[] }) {
  if (points.length < 2) {
    return (
      <div className="rounded-3xl border border-dashed border-slate-300 bg-white px-5 py-10 text-center text-sm text-slate-500">
        还没有足够的趋势数据，请等待定时快照累积。
      </div>
    );
  }

  const width = 900;
  const height = 260;
  const pad = { left: 56, right: 18, top: 18, bottom: 28 };
  const innerWidth = width - pad.left - pad.right;
  const innerHeight = height - pad.top - pad.bottom;
  const max = Math.max(
    1,
    ...points.flatMap((point) => [point.dbMb, point.r2Mb])
  );
  const xFor = (index: number) =>
    pad.left + (index * innerWidth) / Math.max(1, points.length - 1);
  const yFor = (value: number) =>
    pad.top + innerHeight - (value * innerHeight) / max;
  const path = (key: 'dbMb' | 'r2Mb') =>
    points
      .map(
        (point, index) =>
          `${index === 0 ? 'M' : 'L'}${xFor(index)},${yFor(point[key])}`
      )
      .join(' ');

  return (
    <div className="overflow-x-auto rounded-3xl border border-slate-200 bg-white p-4">
      <svg viewBox={`0 0 ${width} ${height}`} className="w-full min-w-[720px]">
        {[0.25, 0.5, 0.75, 1].map((ratio) => (
          <line
            key={ratio}
            x1={pad.left}
            x2={width - pad.right}
            y1={pad.top + innerHeight * (1 - ratio)}
            y2={pad.top + innerHeight * (1 - ratio)}
            stroke="rgb(148 163 184)"
            strokeOpacity="0.18"
          />
        ))}
        {[0, 0.5, 1].map((ratio) => (
          <text
            key={ratio}
            x={pad.left - 8}
            y={pad.top + innerHeight * (1 - ratio) + 4}
            fontSize="11"
            textAnchor="end"
            fill="rgb(100 116 139)"
          >
            {Math.round(max * ratio)}
          </text>
        ))}

        <path
          d={path('dbMb')}
          fill="none"
          stroke="rgb(15 23 42)"
          strokeWidth="3"
        />
        <path
          d={path('r2Mb')}
          fill="none"
          stroke="rgb(37 99 235)"
          strokeWidth="3"
        />

        {points.map((point, index) => (
          <g key={point.at}>
            <circle
              cx={xFor(index)}
              cy={yFor(point.dbMb)}
              r="3"
              fill="rgb(15 23 42)"
            />
            <circle
              cx={xFor(index)}
              cy={yFor(point.r2Mb)}
              r="3"
              fill="rgb(37 99 235)"
            />
          </g>
        ))}

        <text x={xFor(0)} y={height - 6} fontSize="11" fill="rgb(100 116 139)">
          {new Date(points[0].at).toISOString().slice(5, 10)}
        </text>
        <text
          x={xFor(points.length - 1) - 36}
          y={height - 6}
          fontSize="11"
          fill="rgb(100 116 139)"
        >
          {new Date(points[points.length - 1].at).toISOString().slice(5, 10)}
        </text>
      </svg>

      <div className="mt-4 flex flex-wrap items-center gap-5 text-sm text-slate-600">
        <span className="inline-flex items-center gap-2">
          <span className="h-1.5 w-6 rounded-full bg-slate-900" />
          DB total MB
        </span>
        <span className="inline-flex items-center gap-2">
          <span className="h-1.5 w-6 rounded-full bg-blue-600" />
          R2 total MB
        </span>
        <span className="inline-flex items-center gap-2">
          <ChartColumn className="h-4 w-4 text-slate-400" />
          采样来自 storage_snapshots
        </span>
      </div>
    </div>
  );
}
