'use client';

/**
 * StorageInventoryPanel — 数据存储清单面板
 *
 * 显示"哪些数据在哪"：
 * - DB 整体尺寸 + 按表 top 10
 * - 已 off-load 字段迁移进度（topic_reports / dimension_analyses / research_tasks）
 * - R2 bucket 清单（按 prefix 分组）
 * - 手动触发 off-load 调度
 */

import { useCallback, useEffect, useState } from 'react';
import { Database, Cloud, HardDrive, RefreshCw, Play } from 'lucide-react';
import { config } from '@/lib/utils/config';
import { getAuthHeader } from '@/lib/utils/auth';

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

export default function StorageInventoryPanel() {
  const [data, setData] = useState<StorageInventory | null>(null);
  const [loading, setLoading] = useState(true);
  const [triggering, setTriggering] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`${config.apiUrl}/admin/storage-inventory`, {
        headers: getAuthHeader(),
      });
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      const raw = (await response.json()) as
        | StorageInventory
        | { success?: boolean; data?: StorageInventory };
      const payload =
        (raw as { data?: StorageInventory }).data !== undefined
          ? (raw as { data: StorageInventory }).data
          : (raw as StorageInventory);
      setData(payload);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const triggerOffload = useCallback(async () => {
    setTriggering(true);
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
      setTimeout(() => void load(), 3000);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setTriggering(false);
    }
  }, [load]);

  if (loading && !data) {
    return (
      <div className="rounded-lg border border-gray-200 bg-gray-50 p-6 dark:border-gray-800 dark:bg-gray-900">
        <div className="animate-pulse text-gray-500">加载存储清单...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 p-6 text-red-700">
        <div className="font-medium">加载失败</div>
        <div className="mt-1 text-sm">{error}</div>
      </div>
    );
  }

  if (!data) return null;

  // 防御性默认值：后端可能漏字段，不至于让整个页面崩
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

  return (
    <div className="space-y-6">
      {/* 顶部总览 */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <Summary
          icon={<Database className="h-5 w-5" />}
          label="PostgreSQL 数据库"
          value={db.totalHuman}
          sub={`${db.tables.length} 张表`}
          tone="blue"
        />
        <Summary
          icon={<Cloud className="h-5 w-5" />}
          label={`Cloudflare R2 (${r2.bucket ?? '未配置'})`}
          value={r2.totalHuman}
          sub={`${r2.totalObjects} 个对象`}
          tone={r2.configured ? 'green' : 'gray'}
        />
        <Summary
          icon={<HardDrive className="h-5 w-5" />}
          label="总计"
          value={human(db.totalBytes + r2.totalBytes)}
          sub={`DB + 对象存储`}
          tone="purple"
        />
      </div>

      {/* Off-load 迁移进度 */}
      <Section
        title="Off-load 字段迁移进度"
        subtitle="大文本/JSON 字段从 PostgreSQL 外迁到 R2 的状态。URI 非空表示正文已在 R2；DB content 非空表示尚未迁移或尺寸过小不迁。"
        extra={
          <button
            onClick={triggerOffload}
            disabled={triggering || !r2.configured}
            className="inline-flex items-center gap-1.5 rounded-md bg-blue-600 px-3 py-1.5 text-sm text-white hover:bg-blue-700 disabled:opacity-50"
          >
            <Play className="h-3.5 w-3.5" />
            {triggering ? '运行中...' : '立即运行 Off-load'}
          </button>
        }
      >
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 text-left text-xs uppercase text-gray-500 dark:border-gray-700">
                <th className="py-2 pr-4">表 . 字段</th>
                <th className="py-2 pr-4">R2 Prefix</th>
                <th className="py-2 pr-4 text-right">总行</th>
                <th className="py-2 pr-4 text-right">已上传 R2</th>
                <th className="py-2 pr-4 text-right">DB 仍有内容</th>
                <th className="py-2">进度</th>
              </tr>
            </thead>
            <tbody>
              {offloadFields.map((f) => {
                const pct =
                  f.totalRows > 0
                    ? Math.round((f.rowsWithUri * 100) / f.totalRows)
                    : 0;
                return (
                  <tr
                    key={f.table + '.' + f.field}
                    className="border-b border-gray-100 dark:border-gray-800"
                  >
                    <td className="font-mono py-2 pr-4 text-xs">
                      {f.table}.{f.field}
                    </td>
                    <td className="font-mono py-2 pr-4 text-xs text-gray-500">
                      {f.r2Prefix}
                    </td>
                    <td className="py-2 pr-4 text-right">{f.totalRows}</td>
                    <td className="py-2 pr-4 text-right font-medium text-green-600">
                      {f.rowsWithUri}
                    </td>
                    <td className="py-2 pr-4 text-right">
                      {f.rowsWithDbContent}
                    </td>
                    <td className="w-40 py-2">
                      <div className="flex items-center gap-2">
                        <div className="h-1.5 flex-1 overflow-hidden rounded bg-gray-200 dark:bg-gray-700">
                          <div
                            className="h-full bg-green-500"
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                        <span className="w-8 text-right text-xs text-gray-500">
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
      </Section>

      {/* R2 Bucket 清单 */}
      {r2.configured && (r2.byPrefix?.length ?? 0) > 0 && (
        <Section
          title={`R2 Bucket 清单 (${r2.bucket ?? ''})`}
          subtitle="按顶层 prefix 分组"
        >
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 text-left text-xs uppercase text-gray-500 dark:border-gray-700">
                <th className="py-2 pr-4">Prefix</th>
                <th className="py-2 pr-4 text-right">对象数</th>
                <th className="py-2 text-right">尺寸</th>
              </tr>
            </thead>
            <tbody>
              {r2.byPrefix.map((p) => (
                <tr
                  key={p.prefix}
                  className="border-b border-gray-100 dark:border-gray-800"
                >
                  <td className="font-mono py-2 pr-4 text-xs">{p.prefix}</td>
                  <td className="py-2 pr-4 text-right">{p.objects}</td>
                  <td className="py-2 text-right">{p.bytesHuman}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Section>
      )}

      {/* DB 表 top 10 */}
      <Section
        title="PostgreSQL 表尺寸 Top 10"
        subtitle="含 heap + index + TOAST"
      >
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-200 text-left text-xs uppercase text-gray-500 dark:border-gray-700">
              <th className="py-2 pr-4">表</th>
              <th className="py-2 pr-4 text-right">行数</th>
              <th className="py-2 text-right">尺寸</th>
            </tr>
          </thead>
          <tbody>
            {db.tables.slice(0, 10).map((t) => (
              <tr
                key={t.table}
                className="border-b border-gray-100 dark:border-gray-800"
              >
                <td className="font-mono py-2 pr-4 text-xs">{t.table}</td>
                <td className="py-2 pr-4 text-right">
                  {t.rows.toLocaleString()}
                </td>
                <td className="py-2 text-right">{t.totalHuman}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Section>

      {/* 底部刷新 */}
      <div className="flex items-center justify-between text-xs text-gray-500">
        <span>生成时间: {new Date(data.generatedAt).toLocaleString()}</span>
        <button
          onClick={load}
          className="inline-flex items-center gap-1 rounded px-2 py-1 hover:bg-gray-100 dark:hover:bg-gray-800"
        >
          <RefreshCw className="h-3.5 w-3.5" />
          刷新
        </button>
      </div>
    </div>
  );
}

function Summary({
  icon,
  label,
  value,
  sub,
  tone,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  sub: string;
  tone: 'blue' | 'green' | 'purple' | 'gray';
}) {
  const tones = {
    blue: 'bg-blue-50 dark:bg-blue-950/30 text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-900',
    green:
      'bg-green-50 dark:bg-green-950/30 text-green-700 dark:text-green-300 border-green-200 dark:border-green-900',
    purple:
      'bg-purple-50 dark:bg-purple-950/30 text-purple-700 dark:text-purple-300 border-purple-200 dark:border-purple-900',
    gray: 'bg-gray-50 dark:bg-gray-900/50 text-gray-700 dark:text-gray-300 border-gray-200 dark:border-gray-800',
  };
  return (
    <div className={`rounded-lg border p-4 ${tones[tone]}`}>
      <div className="flex items-center gap-2 text-xs font-medium opacity-80">
        {icon}
        <span>{label}</span>
      </div>
      <div className="mt-2 text-2xl font-semibold">{value}</div>
      <div className="mt-0.5 text-xs opacity-70">{sub}</div>
    </div>
  );
}

function Section({
  title,
  subtitle,
  extra,
  children,
}: {
  title: string;
  subtitle?: string;
  extra?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-gray-900">
      <div className="mb-3 flex items-start justify-between">
        <div>
          <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100">
            {title}
          </h3>
          {subtitle && (
            <p className="mt-0.5 text-xs text-gray-500">{subtitle}</p>
          )}
        </div>
        {extra}
      </div>
      {children}
    </div>
  );
}

function human(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 ** 2) return `${(n / 1024).toFixed(1)} kB`;
  if (n < 1024 ** 3) return `${(n / 1024 ** 2).toFixed(1)} MB`;
  return `${(n / 1024 ** 3).toFixed(2)} GB`;
}
