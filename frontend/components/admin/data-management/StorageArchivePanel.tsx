'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  CloudUpload,
  Clock,
  Info,
  Play,
} from 'lucide-react';
import { config } from '@/lib/utils/config';
import { getAuthHeader } from '@/lib/utils/auth';
import { toast } from '@/stores';

/** 千分位分组（不依赖 locale，避免 SSR/CSR 水合不一致） */
function groupThousands(n: number): string {
  return n.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

/** ISO → "YYYY-MM-DD HH:mm:ss UTC" */
function fmtIso(iso: string): string {
  return `${iso.replace('T', ' ').slice(0, 19)} UTC`;
}

function humanBytes(n: number): string {
  if (n <= 0) return '0 B';
  if (n < 1024) return `${n} B`;
  if (n < 1024 ** 2) return `${(n / 1024).toFixed(1)} K`;
  if (n < 1024 ** 3) return `${(n / 1024 ** 2).toFixed(1)} M`;
  return `${(n / 1024 ** 3).toFixed(2)} G`;
}

interface ArchiveTarget {
  table: string;
  retentionDays: number;
  envKey: string;
  note: string;
}

interface ArchiveResult {
  table: string;
  retentionDays: number;
  rows: number;
  bytesArchived: number;
  objects: number;
  dryRun: boolean;
  error?: string;
}

interface ArchiveStatus {
  enabled: boolean;
  r2Configured: boolean;
  schedule: string;
  targets: ArchiveTarget[];
  lastRun: { at: string; dryRun: boolean; results: ArchiveResult[] } | null;
}

/**
 * 事件大表「无损卸载（归档到 R2 再删）」面板。
 *
 * 这些高行数大表没有大 blob 列、不能列级 offload；本机制把整行归档进 R2 再从 DB 删——
 * DB 释放、数据一行不丢（冷备在 R2）。面板把它从隐性变可见，并提供安全 dry-run 预演
 * （只统计会归档多少行，不传不删）。
 */
export default function StorageArchivePanel() {
  const [status, setStatus] = useState<ArchiveStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [previewing, setPreviewing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `${config.apiUrl}/admin/storage-inventory/archive`,
        { headers: getAuthHeader() }
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const raw = (await res.json()) as
        | ArchiveStatus
        | { data?: ArchiveStatus };
      setStatus(
        (raw as { data?: ArchiveStatus }).data !== undefined
          ? (raw as { data: ArchiveStatus }).data
          : (raw as ArchiveStatus)
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const runPreview = useCallback(async () => {
    setPreviewing(true);
    try {
      const res = await fetch(
        `${config.apiUrl}/admin/storage-inventory/run-archive`,
        {
          method: 'POST',
          headers: { ...getAuthHeader(), 'Content-Type': 'application/json' },
          body: '{}',
        }
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const raw = (await res.json()) as
        | { results?: ArchiveResult[] }
        | { data?: { results?: ArchiveResult[] } };
      // 后端响应可能被全局拦截器包一层 { data: ... }，与 load() 同样解包
      const payload =
        (raw as { data?: { results?: ArchiveResult[] } }).data !== undefined
          ? (raw as { data: { results?: ArchiveResult[] } }).data
          : (raw as { results?: ArchiveResult[] });
      const results = payload.results ?? [];
      const total = results.reduce((s, r) => s + (r.rows || 0), 0);
      toast.success(
        '预演完成（未归档、未删除任何数据）',
        `按当前保留策略，共有 ${groupThousands(total)} 行可无损归档到 R2。详见下方表格。`
      );
      await load();
    } catch (e) {
      const msg = (e as Error).message;
      setError(msg);
      toast.error('预演失败', msg);
    } finally {
      setPreviewing(false);
    }
  }, [load]);

  if (loading && !status) {
    return (
      <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        <div className="animate-pulse text-sm text-gray-500">
          正在加载归档状态...
        </div>
      </div>
    );
  }

  if (error && !status) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
        <div className="flex items-center justify-between gap-4">
          <span>归档状态获取失败：{error}</span>
          <button
            onClick={() => void load()}
            className="rounded-lg border border-red-300 bg-white px-3 py-1.5 text-sm font-medium text-red-700 hover:bg-red-100"
          >
            重新加载
          </button>
        </div>
      </div>
    );
  }

  if (!status) return null;

  const lastRunMap = new Map(
    (status.lastRun?.results ?? []).map((r) => [r.table, r])
  );

  return (
    <div className="space-y-3">
      <div className="flex items-start gap-2 rounded-lg border border-blue-100 bg-blue-50/60 px-4 py-3 text-xs leading-5 text-gray-600">
        <Info className="mt-0.5 h-4 w-4 flex-shrink-0 text-blue-600" />
        <div className="space-y-1">
          <div>
            <span className="font-medium text-gray-700">无损卸载</span>
            ：下列高行数大表（事件 / checkpoint / metrics / trace）没有大 blob
            列、不能列级 offload。本机制把<b>整行归档成 gzip 压缩档存进 R2</b>
            ，确认上传成功后才从 DB 删——<b>DB 释放、数据一行不丢</b>（冷备在 R2
            可审计/回放）。
          </div>
          <div>
            <span className="font-medium text-gray-700">调度</span>：每天{' '}
            <span className="font-mono">{status.schedule}</span> 自动执行；受{' '}
            <span className="font-mono">ENABLE_EVENT_ARCHIVE</span> 开关控制。
            点"预演"安全统计"会归档多少行"（不传不删）。
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-gray-200 bg-white px-4 py-3 shadow-sm">
        <div className="flex flex-wrap items-center gap-3 text-sm">
          {status.enabled ? (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-100 px-3 py-1 font-medium text-emerald-700">
              <CheckCircle2 className="h-4 w-4" />
              归档已启用
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-100 px-3 py-1 font-medium text-amber-700">
              <AlertTriangle className="h-4 w-4" />
              归档未启用（这些表不会卸载）
            </span>
          )}
          {!status.r2Configured && (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-red-100 px-3 py-1 font-medium text-red-700">
              R2 未配置（无处归档）
            </span>
          )}
          {status.lastRun && (
            <span className="inline-flex items-center gap-1.5 text-xs text-gray-500">
              <Clock className="h-3.5 w-3.5" />
              最近执行 {fmtIso(status.lastRun.at)}（
              {status.lastRun.dryRun ? '预演' : '实归档'}）
            </span>
          )}
        </div>
        <button
          type="button"
          onClick={() => void runPreview()}
          disabled={previewing}
          className="inline-flex items-center gap-1.5 rounded-lg border border-blue-200 bg-blue-50 px-3 py-1.5 text-sm font-medium text-blue-700 hover:bg-blue-100 disabled:cursor-not-allowed disabled:opacity-60"
        >
          <Play className="h-3.5 w-3.5" />
          {previewing ? '预演中...' : '预演（不传不删）'}
        </button>
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-2.5 text-sm text-red-700">
          操作失败：{error}
        </div>
      )}

      {!status.enabled && (
        <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-xs leading-5 text-amber-800">
          <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0" />
          <div>
            当前 <span className="font-mono">ENABLE_EVENT_ARCHIVE</span> 未设为{' '}
            <span className="font-mono">true</span>
            ，下列大表不会卸载到 R2，DB
            会持续膨胀。建议先点"预演"确认归档量，再到 Railway 补齐 R2 配置 +{' '}
            <span className="font-mono">ENABLE_EVENT_ARCHIVE=true</span>。
          </div>
        </div>
      )}

      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full table-fixed divide-y divide-gray-200">
            <colgroup>
              <col className="w-[28%]" />
              <col className="w-[12%]" />
              <col className="w-[34%]" />
              <col className="w-[26%]" />
            </colgroup>
            <thead className="bg-gray-50">
              <tr>
                {['表', '保留天数', '说明', '上次归档/可归档'].map((h, i) => (
                  <th
                    key={h}
                    className={`px-4 py-3 text-xs font-semibold uppercase tracking-wider text-gray-600 ${
                      i === 3 ? 'text-right' : 'text-left'
                    }`}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 bg-white">
              {status.targets.map((t) => {
                const lr = lastRunMap.get(t.table);
                return (
                  <tr key={t.table} className="hover:bg-gray-50">
                    <td className="font-mono px-4 py-2.5 text-sm font-medium text-gray-900">
                      {t.table}
                    </td>
                    <td className="px-4 py-2.5 text-sm text-gray-600">
                      {t.retentionDays} 天
                    </td>
                    <td className="px-4 py-2.5 text-xs text-gray-500">
                      {t.note}
                    </td>
                    <td className="px-4 py-2.5 text-right text-sm">
                      {lr ? (
                        lr.error ? (
                          <span className="text-red-600">出错</span>
                        ) : (
                          <span
                            className={
                              lr.rows > 0
                                ? 'font-medium text-blue-600'
                                : 'text-gray-400'
                            }
                          >
                            {groupThousands(lr.rows)} 行
                            {lr.dryRun
                              ? '（可归档）'
                              : `（${humanBytes(lr.bytesArchived)}→R2）`}
                          </span>
                        )
                      ) : (
                        <span className="text-gray-300">—</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <div className="flex items-center gap-1.5 px-1 text-xs text-gray-400">
        <CloudUpload className="h-3.5 w-3.5" />
        R2 key 规则：
        <span className="font-mono">
          event-archive/&lt;表&gt;/&lt;起&gt;_&lt;止&gt;_&lt;hash&gt;.ndjson.gz
        </span>
      </div>
    </div>
  );
}
