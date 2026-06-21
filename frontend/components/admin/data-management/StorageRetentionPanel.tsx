'use client';

import { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, CheckCircle2, Clock, Info, Play } from 'lucide-react';
import { config } from '@/lib/utils/config';
import { getAuthHeader } from '@/lib/utils/auth';
import { toast } from '@/stores';

/** 千分位分组（不依赖 locale，避免 SSR/CSR toLocaleString 水合不一致） */
function groupThousands(n: number): string {
  return n.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

/** ISO → "YYYY-MM-DD HH:mm:ss UTC"（确定性，避免水合不一致） */
function fmtIso(iso: string): string {
  return `${iso.replace('T', ' ').slice(0, 19)} UTC`;
}

interface RetentionPolicy {
  table: string;
  retentionDays: number;
  envKey: string;
  note: string;
}

interface RetentionResult {
  table: string;
  retentionDays: number;
  affected: number;
  dryRun: boolean;
  error?: string;
}

interface RetentionStatus {
  enabled: boolean;
  dryRunDefault: boolean;
  schedule: string;
  policies: RetentionPolicy[];
  lastRun: {
    at: string;
    dryRun: boolean;
    results: RetentionResult[];
  } | null;
}

/**
 * 高增长表老化（retention）面板。
 *
 * 这几张表（harness_agent_events / checkpoints / mission_events / ai_engine_metrics /
 * secret_access_logs）不归 R2 offload 管，靠"按龄删除"控制体积。此面板把它从隐性故障
 * 变成可见状态：开关是否开、各表保留多少天、最近删了多少行；并提供安全的 dry-run 预演
 * （只统计不删除），供运维在开启 ENABLE_DATA_RETENTION 前先量化"会删多少"。
 */
export default function StorageRetentionPanel() {
  const [status, setStatus] = useState<RetentionStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [previewing, setPreviewing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `${config.apiUrl}/admin/storage-inventory/retention`,
        { headers: getAuthHeader() }
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const raw = (await res.json()) as
        | RetentionStatus
        | { data?: RetentionStatus };
      setStatus(
        (raw as { data?: RetentionStatus }).data !== undefined
          ? (raw as { data: RetentionStatus }).data
          : (raw as RetentionStatus)
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
      // 默认 dry-run：只统计不删除
      const res = await fetch(
        `${config.apiUrl}/admin/storage-inventory/run-retention`,
        {
          method: 'POST',
          headers: { ...getAuthHeader(), 'Content-Type': 'application/json' },
          body: '{}',
        }
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const raw = (await res.json()) as
        | { results?: RetentionResult[] }
        | { data?: { results?: RetentionResult[] } };
      // 后端响应可能被全局拦截器包一层 { data: ... }，与 load() 同样解包
      const payload =
        (raw as { data?: { results?: RetentionResult[] } }).data !== undefined
          ? (raw as { data: { results?: RetentionResult[] } }).data
          : (raw as { results?: RetentionResult[] });
      const results = payload.results ?? [];
      const total = results.reduce((s, r) => s + (r.affected || 0), 0);
      toast.success(
        '预演完成（未删除任何数据）',
        `按当前保留策略，共有 ${groupThousands(total)} 行可清理。详见下方"最近一次执行"。`
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
          正在加载老化策略状态...
        </div>
      </div>
    );
  }

  if (error && !status) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
        <div className="flex items-center justify-between gap-4">
          <span>老化策略状态获取失败：{error}</span>
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
      {/* 说明 */}
      <div className="flex items-start gap-2 rounded-lg border border-blue-100 bg-blue-50/60 px-4 py-3 text-xs leading-5 text-gray-600">
        <Info className="mt-0.5 h-4 w-4 flex-shrink-0 text-blue-600" />
        <div className="space-y-1">
          <div>
            <span className="font-medium text-gray-700">这是什么</span>
            ：下列高增长表（事件 / 指标 / 审计日志）<b>不走 R2 offload</b>
            ，靠"按龄删除"控制体积。它们才是 DB 月增的主因。
          </div>
          <div>
            <span className="font-medium text-gray-700">调度</span>：每天{' '}
            <span className="font-mono">{status.schedule}</span> 自动执行；受{' '}
            <span className="font-mono">ENABLE_DATA_RETENTION</span> 开关控制。
            点"预演"可安全统计"会删多少行"（不删除任何数据）。
          </div>
        </div>
      </div>

      {/* 状态条 + 预演按钮 */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-gray-200 bg-white px-4 py-3 shadow-sm">
        <div className="flex flex-wrap items-center gap-3 text-sm">
          {status.enabled ? (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-100 px-3 py-1 font-medium text-emerald-700">
              <CheckCircle2 className="h-4 w-4" />
              老化已启用
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-100 px-3 py-1 font-medium text-amber-700">
              <AlertTriangle className="h-4 w-4" />
              老化未启用（这些表永不收缩）
            </span>
          )}
          {status.enabled && status.dryRunDefault && (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-blue-100 px-3 py-1 font-medium text-blue-700">
              定时仅预演（DATA_RETENTION_DRY_RUN=true）
            </span>
          )}
          {status.lastRun && (
            <span className="inline-flex items-center gap-1.5 text-xs text-gray-500">
              <Clock className="h-3.5 w-3.5" />
              最近执行 {fmtIso(status.lastRun.at)}（
              {status.lastRun.dryRun ? '预演' : '实删'}）
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
          {previewing ? '预演中...' : '预演（不删除）'}
        </button>
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-2.5 text-sm text-red-700">
          操作失败：{error}
        </div>
      )}

      {/* 未启用提醒 */}
      {!status.enabled && (
        <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-xs leading-5 text-amber-800">
          <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0" />
          <div>
            当前 <span className="font-mono">ENABLE_DATA_RETENTION</span> 未设为{' '}
            <span className="font-mono">true</span>
            ，下列表的老行永远不会被清理，DB
            会持续膨胀。建议先点"预演"确认删除量， 再到 Railway 设{' '}
            <span className="font-mono">ENABLE_DATA_RETENTION=true</span>。
          </div>
        </div>
      )}

      {/* 策略表 */}
      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full table-fixed divide-y divide-gray-200">
            <colgroup>
              <col className="w-[26%]" />
              <col className="w-[12%]" />
              <col className="w-[40%]" />
              <col className="w-[22%]" />
            </colgroup>
            <thead className="bg-gray-50">
              <tr>
                {['表', '保留天数', '策略', '上次预演/删除'].map((h, i) => (
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
              {status.policies.map((p) => {
                const lr = lastRunMap.get(p.table);
                return (
                  <tr key={p.table} className="hover:bg-gray-50">
                    <td className="font-mono px-4 py-2.5 text-sm font-medium text-gray-900">
                      {p.table}
                    </td>
                    <td className="px-4 py-2.5 text-sm text-gray-600">
                      {p.retentionDays} 天
                    </td>
                    <td className="px-4 py-2.5 text-xs text-gray-500">
                      {p.note}
                    </td>
                    <td className="px-4 py-2.5 text-right text-sm">
                      {lr ? (
                        lr.error ? (
                          <span className="text-red-600">出错</span>
                        ) : (
                          <span
                            className={
                              lr.affected > 0
                                ? 'font-medium text-amber-600'
                                : 'text-gray-400'
                            }
                          >
                            {groupThousands(lr.affected)} 行
                            {lr.dryRun ? '（可删）' : '（已删）'}
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
    </div>
  );
}
