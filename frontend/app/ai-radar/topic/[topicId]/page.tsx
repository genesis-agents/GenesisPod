'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import {
  ArrowLeft,
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
      const resp = await triggerRefresh(topicId);
      setActiveRunId(resp.runId);
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

  return (
    <div className="mx-auto max-w-3xl p-4 sm:p-6">
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
            <h1 className="text-xl font-semibold text-gray-900">
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
          <p className="mt-1 text-xs text-gray-500">
            {topic.counts.sources} 源 · 下次 {nextRefreshIn}
          </p>
        </div>
      </header>

      {/* Inline error banner */}
      {error && (
        <div className="mb-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
          {error}
        </div>
      )}

      {/* Refresh progress banner */}
      {refreshing && (
        <div className="mb-4 flex items-center gap-2 rounded-md border border-cyan-200 bg-cyan-50 px-3 py-2 text-xs text-cyan-700">
          <RefreshCw className="h-3 w-3 animate-spin" />
          {stageStatus
            ? `执行中：${stageStatus.stage} (${stageStatus.status})`
            : '采集中…'}
        </div>
      )}

      {/* Briefing toolbar */}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <DateSwitcher
          value={selectedDate}
          options={dateOptions}
          onChange={handleDateChange}
        />

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => void handleRefresh()}
            disabled={refreshing || topic.status !== 'ACTIVE'}
            className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-1.5 text-xs text-gray-600 hover:bg-gray-50 disabled:opacity-50"
          >
            <RefreshCw
              className={`h-3 w-3 ${refreshing ? 'animate-spin' : ''}`}
            />
            重新精选
          </button>
          <a
            href={rawUrl}
            className="inline-flex items-center gap-1 rounded-lg border border-gray-200 px-3 py-1.5 text-xs text-gray-600 hover:bg-gray-50"
          >
            <ExternalLink className="h-3 w-3" />
            全部原始
          </a>
        </div>
      </div>

      {/* Briefing panel */}
      <RadarBriefingPanel
        briefingDate={selectedDate}
        status={briefingStatus}
        signals={signals}
        topicId={topicId}
        topicName={topic.name}
        onRerun={() => void handleRefresh()}
        rerunCount={0}
      />

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
