'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import {
  ArrowLeft,
  Check,
  ChevronRight,
  ExternalLink,
  RefreshCw,
  Settings,
  Trash2,
} from 'lucide-react';
import {
  deleteTopic,
  getTopic,
  listSources,
  triggerRefresh,
  updateTopic,
} from '@/services/ai-radar/api';
import type {
  RadarSource,
  RadarTopicWithCounts,
} from '@/services/ai-radar/types';
import { RadarBriefingPanel } from '@/components/ai-radar/RadarBriefingPanel';
import { RadarTopicConfigDrawer } from '@/components/ai-radar/RadarTopicConfigDrawer';
import type { RadarTopicConfigDrawerTopic } from '@/components/ai-radar/RadarTopicConfigDrawer';
import { ConfirmDialog } from '@/components/ai-radar/ConfirmDialog';
import { DateSwitcher } from '@/components/common/switchers/DateSwitcher';
import { useDailyBriefing } from '@/hooks/domain/useDailyBriefing';
import { useRadarSocket } from '@/hooks/domain/useRadarSocket';
import type { DailySignalView } from '@/components/ai-radar/RadarBriefingCard';

// ------------------------------------------------------------------
// Helpers
// ------------------------------------------------------------------

function todayDate(): string {
  return new Date().toISOString().slice(0, 10);
}

/** Build last-N-days date options for DateSwitcher */
function buildDateOptions(days = 7) {
  const opts = [];
  for (let i = 0; i < days; i++) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const dateStr = d.toISOString().slice(0, 10);
    const month = d.getMonth() + 1;
    const day = d.getDate();
    opts.push({
      date: dateStr,
      label: i === 0 ? '今天' : `${month}月${day}日`,
    });
  }
  return opts;
}

/** Format time until nextDueAt as "Xh" / "Xd" / "刚刚" */
function formatNextRefreshIn(nextDueAt: string | null): string {
  if (!nextDueAt) return '—';
  const diff = new Date(nextDueAt).getTime() - Date.now();
  if (diff <= 0) return '即将开始';
  const mins = Math.floor(diff / 60_000);
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(diff / 3_600_000);
  if (hours < 24) return `${hours}h`;
  return `${Math.floor(diff / 86_400_000)}d`;
}

// ------------------------------------------------------------------
// Page
// ------------------------------------------------------------------

export default function RadarTopicDetailPage() {
  const params = useParams<{ topicId: string }>();
  const router = useRouter();
  const searchParams = useSearchParams();
  const topicId = params?.topicId;

  // URL-synced selected date
  const urlDate = searchParams?.get('date') ?? todayDate();
  const [selectedDate, setSelectedDate] = useState<string>(urlDate);

  const handleDateChange = (d: string) => {
    setSelectedDate(d);
    const url = new URL(window.location.href);
    if (d === todayDate()) {
      url.searchParams.delete('date');
    } else {
      url.searchParams.set('date', d);
    }
    router.replace(url.pathname + url.search);
  };

  const [topic, setTopic] = useState<RadarTopicWithCounts | null>(null);
  const [sources, setSources] = useState<RadarSource[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeRunId, setActiveRunId] = useState<string | null>(null);
  const [stageStatus, setStageStatus] = useState<{
    stage: string;
    status: string;
  } | null>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [configOpen, setConfigOpen] = useState(false);

  // Subscribe to active run WS progress
  useRadarSocket(activeRunId, {
    onStage: (e) => setStageStatus({ stage: e.stage, status: e.status }),
    onCompleted: () => {
      setRefreshing(false);
      setActiveRunId(null);
      setStageStatus(null);
      void reloadTopicRef.current?.();
      void briefingRefreshRef.current?.();
    },
    onFailed: (e) => {
      setRefreshing(false);
      setActiveRunId(null);
      setStageStatus(null);
      setError(`刷新失败：${e.error}`);
    },
    onCancelled: () => {
      setRefreshing(false);
      setActiveRunId(null);
      setStageStatus(null);
    },
  });

  const reloadTopicRef = useRef<(() => Promise<void>) | undefined>(undefined);
  const briefingRefreshRef = useRef<(() => Promise<void>) | undefined>(
    undefined
  );

  const reloadTopic = useCallback(async () => {
    if (!topicId) return;
    try {
      const [t, s] = await Promise.all([
        getTopic(topicId),
        listSources(topicId),
      ]);
      setTopic(t);
      setSources(s);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [topicId]);

  useEffect(() => {
    reloadTopicRef.current = reloadTopic;
  }, [reloadTopic]);

  useEffect(() => {
    void reloadTopic();
  }, [reloadTopic]);

  // Daily briefing
  const {
    data: briefing,
    loading: briefingLoading,
    refresh: briefingRefresh,
  } = useDailyBriefing(topicId ?? null, selectedDate);

  useEffect(() => {
    briefingRefreshRef.current = briefingRefresh;
  }, [briefingRefresh]);

  const handleRefresh = async () => {
    if (!topicId) return;
    setRefreshing(true);
    setError(null);
    try {
      // 后端 fire-and-forget：立即返回 runId，mission 异步跑 + WS 实时 emit
      // stage 进度。前端拿 runId 立即 setActiveRunId → useRadarSocket 订阅
      // → 渲染 stepper。onCompleted/onFailed 由 WS 回调 reset state。
      const resp = await triggerRefresh(topicId);
      setActiveRunId(resp.runId);
      // 安全网：mission 极少数情况 WS 漏完成事件（pod 重启 / 网络抖动）
      // → 5 分钟硬超时强制 reset state，避免 spinner 永远转
      window.setTimeout(
        () => {
          setRefreshing((cur) => {
            if (!cur) return cur;
            void reloadTopic();
            void briefingRefresh();
            setActiveRunId(null);
            setStageStatus(null);
            return false;
          });
        },
        5 * 60 * 1000
      );
    } catch (e) {
      setRefreshing(false);
      setError(`刷新失败：${e instanceof Error ? e.message : String(e)}`);
    }
  };

  const handleDeleteConfirm = async () => {
    if (!topic) return;
    setDeleting(true);
    try {
      await deleteTopic(topic.id);
      router.push('/ai-radar');
    } catch (e) {
      setDeleting(false);
      setDeleteOpen(false);
      setError(`删除失败：${e instanceof Error ? e.message : String(e)}`);
    }
  };

  const handleConfigUpdate = async (
    patch: Partial<RadarTopicConfigDrawerTopic>
  ) => {
    if (!topic) return;
    // UpdateRadarTopicInput frontend type only defines base fields, but the
    // backend UpdateRadarTopicDto accepts briefingTime / signalsTarget etc.
    // Cast to allow passing extended fields through to the API.
    const payload = {
      ...(patch.briefingTime !== undefined && {
        briefingTime: patch.briefingTime,
      }),
      ...(patch.signalsTarget !== undefined && {
        signalsTarget: patch.signalsTarget,
      }),
      ...(patch.signalTypes !== undefined && {
        signalTypes: patch.signalTypes,
      }),
      ...(patch.weekendSkip !== undefined && {
        weekendSkip: patch.weekendSkip,
      }),
      ...(patch.outputLanguage !== undefined && {
        outputLanguage: patch.outputLanguage,
      }),
      ...(patch.pushConfig !== undefined && {
        pushConfig: patch.pushConfig as Record<string, unknown>,
      }),
      ...(patch.refreshCron !== undefined && {
        refreshCron: patch.refreshCron,
      }),
    } as Parameters<typeof updateTopic>[1];
    await updateTopic(topic.id, payload);
    await reloadTopic();
  };

  const dateOptions = useMemo(() => buildDateOptions(14), []);

  // ------------------------------------------------------------------
  // Loading / error states
  // ------------------------------------------------------------------

  if (!topicId) return null;

  if (loading) {
    return (
      <div className="mx-auto max-w-3xl p-6">
        <div className="h-12 w-64 animate-pulse rounded bg-gray-100" />
      </div>
    );
  }

  if (error && !topic) {
    return (
      <div className="mx-auto max-w-3xl p-6">
        <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          加载失败：{error}
        </div>
      </div>
    );
  }

  if (!topic) return null;

  // Extract config drawer topic from topic (fields are in the Prisma model response)
  const topicAsRecord = topic as RadarTopicWithCounts & Record<string, unknown>;
  const configTopic: RadarTopicConfigDrawerTopic = {
    id: topic.id,
    name: topic.name,
    description: topic.description,
    keywords: topic.keywords,
    briefingTime: (topicAsRecord.briefingTime as string) ?? '08:00',
    signalsTarget: ((topicAsRecord.signalsTarget as number) === 5 ? 5 : 3) as
      | 3
      | 5,
    signalTypes: Array.isArray(topicAsRecord.signalTypes)
      ? (topicAsRecord.signalTypes as string[])
      : ['turning_point', 'trend_acceleration', 'new_entity', 'key_event'],
    weekendSkip: (topicAsRecord.weekendSkip as boolean) ?? false,
    outputLanguage:
      (topicAsRecord.outputLanguage as 'zh-CN' | 'en-US') ?? 'zh-CN',
    pushConfig:
      (topicAsRecord.pushConfig as RadarTopicConfigDrawerTopic['pushConfig']) ??
      null,
    refreshCron: topic.refreshCron,
    entityType: topic.entityType,
  };

  // Map briefing signals — hook 已返回 4 层完整字段（P0-11 修复后）
  const signals: DailySignalView[] = briefing?.signals ?? [];

  const briefingStatus = briefingLoading
    ? 'generating'
    : (briefing?.status ?? 'no_signals');

  const nextRefreshIn = formatNextRefreshIn(topic.nextDueAt);
  const rawUrl = `/ai-radar/topic/${topicId}/raw?date=${selectedDate}`;

  // 数据源健康度统计（侧边栏用）
  const healthStats = sources.reduce(
    (acc, s) => {
      const h = (s as RadarSource & { healthStatus?: string }).healthStatus;
      if (h === 'OK') acc.ok += 1;
      else if (h === 'DEGRADED') acc.degraded += 1;
      else if (h === 'DOWN' || h === 'FAILED') acc.down += 1;
      return acc;
    },
    { ok: 0, degraded: 0, down: 0 }
  );

  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-4 sm:px-6 sm:py-6">
      {/* Back link */}
      <button
        type="button"
        onClick={() => router.push('/ai-radar')}
        className="mb-3 inline-flex items-center gap-1 text-xs text-gray-500 hover:text-gray-700"
      >
        <ArrowLeft className="h-3 w-3" />
        返回雷达列表
      </button>

      {/* Page header */}
      <header className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-xl font-semibold text-gray-900 md:text-2xl">
              {topic.name}
            </h1>
            <button
              type="button"
              onClick={() => setConfigOpen(true)}
              className="inline-flex items-center gap-1 rounded-md border border-gray-200 px-2 py-1 text-xs text-gray-600 hover:bg-gray-50"
              aria-label="配置"
            >
              <Settings className="h-3 w-3" />
              配置
            </button>
            <button
              type="button"
              onClick={() => setDeleteOpen(true)}
              className="inline-flex items-center gap-1 rounded-md border border-gray-200 px-2 py-1 text-xs text-gray-600 hover:bg-gray-50"
              aria-label="删除"
            >
              <Trash2 className="h-3 w-3" />
              删除
            </button>
          </div>
          {topic.description && (
            <p className="mt-1.5 text-sm text-gray-600">{topic.description}</p>
          )}
          <p className="mt-1 text-xs text-gray-500">
            {topic.counts.sources} 源 · 下次刷新 {nextRefreshIn}
          </p>
        </div>
      </header>

      {/* Inline error banner */}
      {error && (
        <div className="mb-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
          {error}
        </div>
      )}

      {/* Refresh progress stepper（mission S1-S8 实时进度） */}
      {refreshing && (
        <RefreshProgressStepper currentStage={stageStatus?.stage ?? null} />
      )}

      {/* 双栏：左侧 briefing（主），右侧 sidebar（信息）；≥lg 才双栏，≤md 单栏 */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_320px]">
        {/* 左主区 — Briefing toolbar + Panel */}
        <div className="min-w-0">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <DateSwitcher
              value={selectedDate}
              options={dateOptions}
              onChange={handleDateChange}
            />

            <div className="flex items-center gap-2">
              {/* "重新精选"按钮收敛到 RadarBriefingPanel 内（PR-DR2-FU2 修
                  双按钮重复 bug）。顶栏只保留"全部原始"次级动作 */}
              <a
                href={rawUrl}
                className="inline-flex items-center gap-1 rounded-lg border border-gray-200 px-3 py-1.5 text-xs text-gray-600 hover:bg-gray-50"
              >
                <ExternalLink className="h-3 w-3" />
                全部原始
              </a>
            </div>
          </div>

          <RadarBriefingPanel
            briefingDate={selectedDate}
            status={briefingStatus}
            signals={signals}
            topicId={topicId}
            topicName={topic.name}
            onRerun={() => void handleRefresh()}
            rerunCount={briefing?.rerunCount ?? 0}
          />
        </div>

        {/* 右侧 sidebar — 数据源 / 配置摘要 / 行动 */}
        <aside className="flex flex-col gap-4">
          {/* 数据源状态卡 */}
          <div className="rounded-xl border border-gray-200 bg-white p-4">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-gray-800">数据源</h3>
              <button
                type="button"
                onClick={() => setConfigOpen(true)}
                className="text-xs text-violet-600 hover:underline"
              >
                管理
              </button>
            </div>
            <div className="flex flex-wrap items-center gap-3 text-xs">
              <span className="inline-flex items-center gap-1">
                <span className="inline-block h-2 w-2 rounded-full bg-emerald-500" />
                正常 {healthStats.ok}
              </span>
              {healthStats.degraded > 0 && (
                <span className="inline-flex items-center gap-1">
                  <span className="inline-block h-2 w-2 rounded-full bg-amber-500" />
                  降级 {healthStats.degraded}
                </span>
              )}
              {healthStats.down > 0 && (
                <span className="inline-flex items-center gap-1">
                  <span className="inline-block h-2 w-2 rounded-full bg-red-500" />
                  故障 {healthStats.down}
                </span>
              )}
              {sources.length === 0 && (
                <span className="text-gray-400">尚未添加</span>
              )}
            </div>
            {sources.length > 0 && (
              <ul className="mt-3 flex flex-col gap-1.5 text-xs text-gray-600">
                {sources.slice(0, 5).map((s) => (
                  <li key={s.id} className="flex items-center gap-2 truncate">
                    <span className="inline-block h-1.5 w-1.5 flex-shrink-0 rounded-full bg-violet-500" />
                    <span className="truncate">{s.label ?? s.identifier}</span>
                  </li>
                ))}
                {sources.length > 5 && (
                  <li className="text-gray-400">+ {sources.length - 5} 个</li>
                )}
              </ul>
            )}
          </div>

          {/* 配置摘要卡 */}
          <div className="rounded-xl border border-gray-200 bg-white p-4">
            <h3 className="mb-3 text-sm font-semibold text-gray-800">
              精选偏好
            </h3>
            <dl className="flex flex-col gap-2 text-xs text-gray-600">
              <div className="flex justify-between">
                <dt className="text-gray-500">推送时间</dt>
                <dd>{configTopic.briefingTime}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-gray-500">目标条数</dt>
                <dd>{configTopic.signalsTarget}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-gray-500">语言</dt>
                <dd>
                  {configTopic.outputLanguage === 'en-US' ? 'English' : '中文'}
                </dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-gray-500">周末</dt>
                <dd>{configTopic.weekendSkip ? '跳过' : '正常推送'}</dd>
              </div>
            </dl>
          </div>

          {/* 快速行动卡（空数据时主推用户加源） */}
          {sources.length === 0 && (
            <div className="rounded-xl border border-violet-200 bg-violet-50 p-4 text-xs text-violet-700">
              <p className="font-semibold">还没添加数据源</p>
              <p className="mt-1">
                添加 RSS / YouTube / X / 自定义 URL 让雷达开始监控。
              </p>
              <button
                type="button"
                onClick={() => setConfigOpen(true)}
                className="mt-2 inline-flex items-center gap-1 rounded-md bg-violet-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-violet-700"
              >
                添加数据源 →
              </button>
            </div>
          )}
        </aside>
      </div>

      {/* Config drawer */}
      <RadarTopicConfigDrawer
        open={configOpen}
        onClose={() => setConfigOpen(false)}
        topic={configTopic}
        sources={sources}
        onSourceReload={() => void reloadTopic()}
        onUpdate={handleConfigUpdate}
      />

      {/* Delete confirm */}
      <ConfirmDialog
        open={deleteOpen}
        title={`确定删除主题「${topic.name}」？`}
        description="所有数据源、采集记录、洞察将一并删除，不可恢复。"
        confirmLabel="删除"
        danger
        busy={deleting}
        onConfirm={() => void handleDeleteConfirm()}
        onCancel={() => setDeleteOpen(false)}
      />
    </div>
  );
}

// ------------------------------------------------------------------
// RefreshProgressStepper — mission S1-S8 实时可视化（5 步聚合，避免过密）
// ------------------------------------------------------------------

/** mission stage 名 → 用户可读 5 步分组 + 顺序 index */
const STAGE_STEPS: Array<{
  id: string;
  label: string;
  stages: ReadonlyArray<string>;
}> = [
  {
    id: 'collect',
    label: '采集源数据',
    stages: ['s1-source-resolve', 's2-collect'],
  },
  { id: 'dedupe', label: '去重', stages: ['s3-dedupe'] },
  {
    id: 'score',
    label: '评分（相关性 + 质量）',
    stages: ['s4-relevance', 's5-quality'],
  },
  {
    id: 'enrich',
    label: '实体抽取 + 洞察',
    stages: ['s6-entity', 's7-insight'],
  },
  { id: 'finalize', label: '生成精选 + 持久化', stages: ['s8-persist'] },
];

function findStepIndex(currentStage: string | null): number {
  if (!currentStage) return -1;
  return STAGE_STEPS.findIndex((step) =>
    step.stages.some((s) => currentStage.startsWith(s))
  );
}

function RefreshProgressStepper({
  currentStage,
}: {
  currentStage: string | null;
}) {
  const activeIdx = findStepIndex(currentStage);

  return (
    <div className="mb-4 rounded-lg border border-violet-200 bg-violet-50 px-4 py-3">
      <div className="mb-2 flex items-center gap-2 text-xs font-medium text-violet-700">
        <RefreshCw className="h-3 w-3 animate-spin" />
        正在重新精选 · {currentStage ? `当前 ${currentStage}` : '准备中…'}
      </div>
      <ol className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
        {STAGE_STEPS.map((step, idx) => {
          const isDone = activeIdx > idx;
          const isActive = activeIdx === idx;
          return (
            <li key={step.id} className="flex items-center gap-1.5">
              <span
                className={`inline-flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-semibold ${
                  isDone
                    ? 'bg-violet-600 text-white'
                    : isActive
                      ? 'bg-violet-100 text-violet-700 ring-2 ring-violet-400'
                      : 'bg-slate-100 text-slate-400'
                }`}
                aria-current={isActive ? 'step' : undefined}
              >
                {isDone ? <Check className="h-3 w-3" /> : idx + 1}
              </span>
              <span
                className={
                  isActive
                    ? 'font-medium text-violet-700'
                    : isDone
                      ? 'text-slate-600'
                      : ''
                }
              >
                {step.label}
              </span>
              {idx < STAGE_STEPS.length - 1 && (
                <ChevronRight
                  className="ml-1 h-3 w-3 text-slate-300"
                  aria-hidden="true"
                />
              )}
            </li>
          );
        })}
      </ol>
    </div>
  );
}
