'use client';

/**
 * StorageInventoryPanel — 数据存储清单面板（Tier A + B 优化版）
 *
 * 改进：
 * - i18n via useTranslation
 * - 共享 ResponsiveCard 组件做布局（视觉风格对齐）
 * - 运行 Off-load 加 ConfirmDialog 确认
 * - 相对时间 ("5 分钟前") + 手动刷新
 * - R2 bucket 名可点击跳 Cloudflare dashboard
 * - 进度条颜色分段 (<50% 灰 / 50-90% 蓝 / >90% 绿) + aria-progressbar
 * - 防御性 null check，单字段失败不崩整个面板
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Cloud,
  Database,
  Download,
  ExternalLink,
  HardDrive,
  Play,
  RefreshCw,
} from 'lucide-react';
import { useTranslation } from '@/lib/i18n';
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

type TabKey = 'overview' | 'offload' | 'trend' | 'buckets' | 'tables';

export default function StorageInventoryPanel() {
  const { t } = useTranslation();
  const [data, setData] = useState<StorageInventory | null>(null);
  const [trend, setTrend] = useState<TrendPoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [triggering, setTriggering] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [now, setNow] = useState(Date.now());
  const [tab, setTab] = useState<TabKey>('overview');

  // 每 30 秒 tick 一次让 "X 分钟前" 自动更新（不重新 fetch）
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
        const trendPoints = Array.isArray(trendRaw)
          ? trendRaw
          : (trendRaw.data ?? []);
        setTrend(trendPoints);
      }
    } catch (e) {
      const msg = (e as Error).message;
      setError(
        msg === 'UNAUTHORIZED'
          ? t('admin.storageInventory.errorUnauthorized')
          : t('admin.storageInventory.errorGeneric')
      );
    } finally {
      setLoading(false);
    }
  }, [t]);

  const exportJson = useCallback(() => {
    if (!data) return;
    const blob = new Blob(
      [JSON.stringify({ inventory: data, trend }, null, 2)],
      { type: 'application/json' }
    );
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `storage-inventory-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }, [data, trend]);

  useEffect(() => {
    void load();
  }, [load]);

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
      // 后端是 fire-and-forget，POST 瞬间就返回 200；
      // UI 上：弹 toast 明确告诉用户"已触发"，按钮保持禁用 20 秒，
      // 期间每 5 秒 poll 一次 inventory 拉新进度。
      toast.success(
        t('admin.storageInventory.offload.runNow'),
        t('admin.storageInventory.offload.runTriggered')
      );
      const pollEvery = 5_000;
      const rounds = 4;
      for (let i = 0; i < rounds; i++) {
        await new Promise((r) => setTimeout(r, pollEvery));
        await load();
      }
    } catch (e) {
      const msg = (e as Error).message;
      setError(msg);
      toast.error(t('admin.storageInventory.offload.runNow'), msg);
    } finally {
      setTriggering(false);
    }
  }, [load, t]);

  const relative = useMemo(() => {
    if (!data?.generatedAt) return '';
    const diff = Math.max(0, now - new Date(data.generatedAt).getTime());
    if (diff < 60_000) return t('common.justNow', { default: 'just now' });
    const m = Math.round(diff / 60_000);
    if (m < 60) return `${m}m ago`;
    return `${Math.round(m / 60)}h ago`;
  }, [data, now, t]);

  if (loading && !data) {
    return (
      <ResponsiveCard>
        <ResponsiveCardContent>
          <div className="animate-pulse text-sm text-gray-500">
            {t('admin.storageInventory.loading')}
          </div>
        </ResponsiveCardContent>
      </ResponsiveCard>
    );
  }

  if (error && !data) {
    return (
      <ResponsiveCard>
        <ResponsiveCardContent>
          <div className="flex items-center justify-between">
            <div className="text-sm text-red-700 dark:text-red-400">
              {error}
            </div>
            <button
              onClick={() => void load()}
              aria-label={t('admin.storageInventory.errorRetry')}
              className="inline-flex items-center gap-1 rounded-md border border-gray-200 bg-white px-2 py-1 text-xs hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-800 dark:hover:bg-gray-700"
            >
              <RefreshCw className="h-3 w-3" />
              {t('admin.storageInventory.errorRetry')}
            </button>
          </div>
        </ResponsiveCardContent>
      </ResponsiveCard>
    );
  }

  if (!data) return null;

  const db = data.database ?? { totalBytes: 0, totalHuman: '0 B', tables: [] };
  const r2 = data.r2 ?? {
    configured: false,
    bucket: null,
    totalObjects: 0,
    totalBytes: 0,
    totalHuman: '0 B',
    byPrefix: [],
  };
  const offloadFields = data.offloadFields ?? [];

  const cloudflareUrl = r2.bucket
    ? `https://dash.cloudflare.com/?to=/:account/r2/default/buckets/${r2.bucket}`
    : null;

  return (
    <>
      <ResponsiveCard>
        <ResponsiveCardHeader>
          <div className="flex items-center justify-between">
            <div className="inline-flex items-center gap-2">
              <ResponsiveCardTitle>
                {t('admin.storageInventory.title')}
              </ResponsiveCardTitle>
              <span className="text-xs font-normal text-gray-500">
                DB {db.totalHuman} · R2 {r2.totalHuman}
              </span>
            </div>
            <div className="flex items-center gap-2 text-xs text-gray-500">
              {relative && (
                <span>
                  {t('admin.storageInventory.footer.generatedAt', {
                    ago: relative,
                  })}
                </span>
              )}
              <button
                onClick={exportJson}
                aria-label={t('admin.storageInventory.footer.export')}
                title={t('admin.storageInventory.footer.export')}
                className="inline-flex items-center gap-1 rounded px-1.5 py-1 hover:bg-gray-100 dark:hover:bg-gray-800"
              >
                <Download className="h-3.5 w-3.5" />
              </button>
              <button
                onClick={() => void load()}
                aria-label={t('admin.storageInventory.footer.refresh')}
                title={t('admin.storageInventory.footer.refresh')}
                className="inline-flex items-center gap-1 rounded px-1.5 py-1 hover:bg-gray-100 dark:hover:bg-gray-800"
              >
                <RefreshCw
                  className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`}
                />
              </button>
            </div>
          </div>
          <div className="mt-3 flex gap-1 overflow-x-auto border-b border-gray-200 dark:border-gray-700">
            {(
              [
                { k: 'overview', label: '概览' },
                { k: 'offload', label: 'Off-load 进度' },
                { k: 'trend', label: '趋势' },
                { k: 'buckets', label: 'R2 Bucket' },
                { k: 'tables', label: 'DB 表' },
              ] as const
            ).map((t) => (
              <button
                key={t.k}
                onClick={() => setTab(t.k)}
                className={`whitespace-nowrap border-b-2 px-3 py-1.5 text-xs font-medium transition-colors ${
                  tab === t.k
                    ? 'border-blue-500 text-blue-600 dark:text-blue-400'
                    : 'border-transparent text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
        </ResponsiveCardHeader>
        <ResponsiveCardContent>
          {tab === 'overview' && (
            <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
              <MiniStat
                icon={<Database className="h-4 w-4" />}
                label={t('admin.storageInventory.summary.db')}
                value={db.totalHuman}
                sub={t('admin.storageInventory.summary.tablesCount', {
                  count: String(db.tables.length),
                })}
                tone="blue"
              />
              <MiniStat
                icon={<Cloud className="h-4 w-4" />}
                label={
                  <span className="flex items-center gap-1">
                    {t('admin.storageInventory.summary.r2')}
                    {cloudflareUrl && (
                      <a
                        href={cloudflareUrl}
                        target="_blank"
                        rel="noreferrer"
                        aria-label={t(
                          'admin.storageInventory.bucket.openCloudflare'
                        )}
                        title={t(
                          'admin.storageInventory.bucket.openCloudflare'
                        )}
                        className="opacity-60 hover:opacity-100"
                      >
                        <ExternalLink className="h-3 w-3" />
                      </a>
                    )}
                    <span className="font-mono text-[10px] opacity-70">
                      {r2.bucket ??
                        t('admin.storageInventory.summary.r2Unconfigured')}
                    </span>
                  </span>
                }
                value={r2.totalHuman}
                sub={t('admin.storageInventory.summary.objectsCount', {
                  count: String(r2.totalObjects),
                })}
                tone={r2.configured ? 'green' : 'gray'}
              />
              <MiniStat
                icon={<HardDrive className="h-4 w-4" />}
                label={t('admin.storageInventory.summary.total')}
                value={humanBytes(db.totalBytes + r2.totalBytes)}
                sub={t('admin.storageInventory.summary.subTotal')}
                tone="purple"
              />
            </div>
          )}

          {tab === 'offload' && (
            <div>
              <div className="mb-2 flex items-start justify-between">
                <div>
                  <h4 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                    {t('admin.storageInventory.offload.title')}
                  </h4>
                  <p className="text-xs text-gray-500">
                    {t('admin.storageInventory.offload.subtitle')}
                  </p>
                </div>
                <button
                  onClick={() => setConfirmOpen(true)}
                  disabled={triggering || !r2.configured}
                  aria-label={t('admin.storageInventory.offload.runNow')}
                  className="inline-flex items-center gap-1.5 rounded-md bg-blue-600 px-3 py-1.5 text-xs text-white hover:bg-blue-700 disabled:opacity-50"
                >
                  <Play className="h-3 w-3" />
                  {triggering
                    ? t('admin.storageInventory.offload.running')
                    : t('admin.storageInventory.offload.runNow')}
                </button>
              </div>
              <OffloadTable rows={offloadFields} t={t} />
            </div>
          )}

          {tab === 'trend' && (
            <div>
              <div className="mb-2">
                <h4 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                  {t('admin.storageInventory.trend.title')}
                </h4>
                <p className="text-xs text-gray-500">
                  {t('admin.storageInventory.trend.subtitle')}
                </p>
              </div>
              <TrendChart points={trend} t={t} />
            </div>
          )}

          {tab === 'buckets' &&
            r2.configured &&
            (r2.byPrefix?.length ?? 0) > 0 && (
              <div>
                <div className="mb-2">
                  <h4 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                    {t('admin.storageInventory.bucket.title')} ({r2.bucket})
                  </h4>
                  <p className="text-xs text-gray-500">
                    {t('admin.storageInventory.bucket.subtitle')}
                  </p>
                </div>
                <BucketTable rows={r2.byPrefix} t={t} />
              </div>
            )}

          {tab === 'tables' && (
            <div>
              <div className="mb-2">
                <h4 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                  {t('admin.storageInventory.tables.title')}
                </h4>
                <p className="text-xs text-gray-500">
                  {t('admin.storageInventory.tables.subtitle')}
                </p>
              </div>
              <DbTopTable rows={db.tables.slice(0, 10)} t={t} />
            </div>
          )}
        </ResponsiveCardContent>
      </ResponsiveCard>

      <ConfirmDialog
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        onConfirm={confirmRun}
        title={t('admin.storageInventory.offload.confirmTitle')}
        description={t('admin.storageInventory.offload.confirmDesc')}
        type="info"
        confirmText={t('admin.storageInventory.offload.confirmOk')}
        loading={triggering}
      />
    </>
  );
}

function MiniStat({
  icon,
  label,
  value,
  sub,
  tone,
}: {
  icon: React.ReactNode;
  label: React.ReactNode;
  value: string;
  sub: string;
  tone: 'blue' | 'green' | 'purple' | 'gray';
}) {
  const tones: Record<string, string> = {
    blue: 'bg-blue-50 dark:bg-blue-950/30 text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-900',
    green:
      'bg-emerald-50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-900',
    purple:
      'bg-violet-50 dark:bg-violet-950/30 text-violet-700 dark:text-violet-300 border-violet-200 dark:border-violet-900',
    gray: 'bg-gray-50 dark:bg-gray-900/50 text-gray-700 dark:text-gray-300 border-gray-200 dark:border-gray-800',
  };
  return (
    <div className={`rounded-md border px-3 py-2 ${tones[tone]}`}>
      <div className="flex items-center gap-1.5 text-xs font-medium opacity-80">
        {icon}
        <span>{label}</span>
      </div>
      <div className="mt-1 text-xl font-semibold">{value}</div>
      <div className="text-[11px] opacity-70">{sub}</div>
    </div>
  );
}

function OffloadTable({
  rows,
  t,
}: {
  rows: OffloadFieldStat[];
  t: ReturnType<typeof useTranslation>['t'];
}) {
  if (rows.length === 0) return null;
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b border-gray-200 text-left uppercase text-gray-500 dark:border-gray-700">
            <th className="py-2 pr-4">
              {t('admin.storageInventory.offload.col.field')}
            </th>
            <th className="hidden py-2 pr-4 md:table-cell">
              {t('admin.storageInventory.offload.col.prefix')}
            </th>
            <th className="py-2 pr-4 text-right">
              {t('admin.storageInventory.offload.col.total')}
            </th>
            <th className="py-2 pr-4 text-right">
              {t('admin.storageInventory.offload.col.r2')}
            </th>
            <th className="hidden py-2 pr-4 text-right md:table-cell">
              {t('admin.storageInventory.offload.col.db')}
            </th>
            <th className="py-2">
              {t('admin.storageInventory.offload.col.progress')}
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((f) => {
            const pct =
              f.totalRows > 0
                ? Math.round((f.rowsWithUri * 100) / f.totalRows)
                : 0;
            const barColor =
              pct >= 90
                ? 'bg-emerald-500'
                : pct >= 50
                  ? 'bg-blue-500'
                  : 'bg-gray-400';
            return (
              <tr
                key={`${f.table}.${f.field}`}
                className="border-b border-gray-100 dark:border-gray-800"
              >
                <td className="font-mono py-2 pr-4">
                  {f.table}.{f.field}
                </td>
                <td className="font-mono hidden py-2 pr-4 text-gray-500 md:table-cell">
                  {f.r2Prefix}
                </td>
                <td className="py-2 pr-4 text-right">{f.totalRows}</td>
                <td className="py-2 pr-4 text-right font-medium text-emerald-600 dark:text-emerald-400">
                  {f.rowsWithUri}
                </td>
                <td className="hidden py-2 pr-4 text-right md:table-cell">
                  {f.rowsWithDbContent}
                </td>
                <td className="w-32 py-2 md:w-40">
                  <div
                    className="flex items-center gap-2"
                    role="progressbar"
                    aria-valuenow={pct}
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-label={`${f.table}.${f.field} ${pct}%`}
                  >
                    <div className="h-1.5 flex-1 overflow-hidden rounded bg-gray-200 dark:bg-gray-700">
                      <div
                        className={`h-full ${barColor} transition-all`}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                    <span className="w-8 text-right text-[10px] text-gray-500">
                      {pct}%
                    </span>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function BucketTable({
  rows,
  t,
}: {
  rows: R2PrefixStat[];
  t: ReturnType<typeof useTranslation>['t'];
}) {
  return (
    <table className="w-full text-xs">
      <thead>
        <tr className="border-b border-gray-200 text-left uppercase text-gray-500 dark:border-gray-700">
          <th className="py-2 pr-4">
            {t('admin.storageInventory.bucket.col.prefix')}
          </th>
          <th className="py-2 pr-4 text-right">
            {t('admin.storageInventory.bucket.col.objects')}
          </th>
          <th className="py-2 text-right">
            {t('admin.storageInventory.bucket.col.size')}
          </th>
        </tr>
      </thead>
      <tbody>
        {rows.map((p) => (
          <tr
            key={p.prefix}
            className="border-b border-gray-100 dark:border-gray-800"
          >
            <td className="font-mono py-2 pr-4">{p.prefix}</td>
            <td className="py-2 pr-4 text-right">{p.objects}</td>
            <td className="py-2 text-right">{p.bytesHuman}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function DbTopTable({
  rows,
  t,
}: {
  rows: TableStat[];
  t: ReturnType<typeof useTranslation>['t'];
}) {
  return (
    <table className="w-full text-xs">
      <thead>
        <tr className="border-b border-gray-200 text-left uppercase text-gray-500 dark:border-gray-700">
          <th className="py-2 pr-4">
            {t('admin.storageInventory.tables.col.table')}
          </th>
          <th className="py-2 pr-4 text-right">
            {t('admin.storageInventory.tables.col.rows')}
          </th>
          <th className="py-2 text-right">
            {t('admin.storageInventory.tables.col.size')}
          </th>
        </tr>
      </thead>
      <tbody>
        {rows.map((tbl) => (
          <tr
            key={tbl.table}
            className="border-b border-gray-100 dark:border-gray-800"
          >
            <td className="font-mono py-2 pr-4">{tbl.table}</td>
            <td className="py-2 pr-4 text-right">
              {tbl.rows.toLocaleString()}
            </td>
            <td className="py-2 text-right">{tbl.totalHuman}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function TrendChart({
  points,
  t,
}: {
  points: TrendPoint[];
  t: ReturnType<typeof useTranslation>['t'];
}) {
  if (points.length < 2) {
    return (
      <div className="rounded-md border border-dashed border-gray-300 bg-gray-50 p-4 text-center text-xs text-gray-500 dark:border-gray-700 dark:bg-gray-900">
        {t('admin.storageInventory.trend.empty')}
      </div>
    );
  }
  const W = 600;
  const H = 140;
  const pad = { l: 36, r: 8, t: 8, b: 20 };
  const iw = W - pad.l - pad.r;
  const ih = H - pad.t - pad.b;
  const max = Math.max(1, ...points.flatMap((p) => [p.dbMb, p.r2Mb]));
  const xFor = (i: number) => pad.l + (i * iw) / Math.max(1, points.length - 1);
  const yFor = (v: number) => pad.t + ih - (v * ih) / max;
  const path = (key: 'dbMb' | 'r2Mb') =>
    points
      .map((p, i) => `${i === 0 ? 'M' : 'L'}${xFor(i)},${yFor(p[key])}`)
      .join(' ');
  return (
    <div className="overflow-x-auto">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="w-full"
        aria-label="storage size trend chart"
      >
        {/* Y axis gridlines */}
        {[0.25, 0.5, 0.75, 1].map((r) => (
          <line
            key={r}
            x1={pad.l}
            x2={W - pad.r}
            y1={pad.t + ih * (1 - r)}
            y2={pad.t + ih * (1 - r)}
            stroke="currentColor"
            strokeOpacity={0.08}
          />
        ))}
        {[0, 0.5, 1].map((r) => (
          <text
            key={r}
            x={pad.l - 4}
            y={pad.t + ih * (1 - r) + 4}
            fontSize="10"
            textAnchor="end"
            fill="currentColor"
            opacity={0.5}
          >
            {Math.round(max * r)}
          </text>
        ))}
        {/* DB line */}
        <path
          d={path('dbMb')}
          fill="none"
          stroke="rgb(59 130 246)"
          strokeWidth="2"
        />
        {/* R2 line */}
        <path
          d={path('r2Mb')}
          fill="none"
          stroke="rgb(16 185 129)"
          strokeWidth="2"
        />
        {/* First & last x labels */}
        <text
          x={xFor(0)}
          y={H - 4}
          fontSize="10"
          fill="currentColor"
          opacity={0.5}
        >
          {new Date(points[0].at).toISOString().slice(5, 10)}
        </text>
        <text
          x={xFor(points.length - 1) - 32}
          y={H - 4}
          fontSize="10"
          fill="currentColor"
          opacity={0.5}
        >
          {new Date(points[points.length - 1].at).toISOString().slice(5, 10)}
        </text>
      </svg>
      <div className="mt-1 flex items-center gap-4 text-[11px] text-gray-500">
        <span className="inline-flex items-center gap-1">
          <span className="h-0.5 w-3 bg-blue-500" />
          {t('admin.storageInventory.trend.db')}
        </span>
        <span className="inline-flex items-center gap-1">
          <span className="h-0.5 w-3 bg-emerald-500" />
          {t('admin.storageInventory.trend.r2')}
        </span>
      </div>
    </div>
  );
}

function humanBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 ** 2) return `${(n / 1024).toFixed(1)} kB`;
  if (n < 1024 ** 3) return `${(n / 1024 ** 2).toFixed(1)} MB`;
  return `${(n / 1024 ** 3).toFixed(2)} GB`;
}
