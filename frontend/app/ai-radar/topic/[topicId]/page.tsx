'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft, RefreshCw, Trash2 } from 'lucide-react';
import {
  deleteTopic,
  getTopic,
  listSources,
  triggerRefresh,
} from '@/services/ai-radar/api';
import type {
  RadarSource,
  RadarSourceType,
  RadarTopicWithCounts,
} from '@/services/ai-radar/types';
import { RadarSourceList } from '@/components/ai-radar/RadarSourceList';
import { RadarFeedList } from '@/components/ai-radar/RadarFeedList';
import { RadarInsightPanel } from '@/components/ai-radar/RadarInsightPanel';
import { RadarEntityPanel } from '@/components/ai-radar/RadarEntityPanel';
import {
  RadarFeedTabs,
  type RadarFeedTabKey,
} from '@/components/ai-radar/RadarFeedTabs';
import { RadarRunTimeline } from '@/components/ai-radar/RadarRunTimeline';
import { ConfirmDialog } from '@/components/ai-radar/ConfirmDialog';
import { useRadarSocket } from '@/hooks/domain/useRadarSocket';

export default function RadarTopicDetailPage() {
  const params = useParams<{ topicId: string }>();
  const router = useRouter();
  const topicId = params?.topicId;

  const [topic, setTopic] = useState<RadarTopicWithCounts | null>(null);
  const [sources, setSources] = useState<RadarSource[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [feedTab, setFeedTab] = useState<RadarFeedTabKey>('all');
  const [acceptedOnly, setAcceptedOnly] = useState(false);
  const [activeRunId, setActiveRunId] = useState<string | null>(null);
  const [stageStatus, setStageStatus] = useState<{
    stage: string;
    status: string;
  } | null>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // 订阅当前 active mission 的 ws 实时进度
  useRadarSocket(activeRunId, {
    onStage: (e) => setStageStatus({ stage: e.stage, status: e.status }),
    onCompleted: () => {
      setRefreshing(false);
      setActiveRunId(null);
      setStageStatus(null);
      void reloadTopicRef.current?.();
      setReloadKey((k) => k + 1);
    },
    onFailed: (e) => {
      setRefreshing(false);
      setActiveRunId(null);
      setStageStatus(null);
      // 不打扰：detail 页一会儿刷出来失败 run；timeline 会显示
      setError(`刷新失败：${e.error}`);
    },
    onCancelled: () => {
      setRefreshing(false);
      setActiveRunId(null);
      setStageStatus(null);
    },
  });

  // useRef 一份 reloadTopic 给 ws 闭包用，避免 stale closure。
  // 用 useRef 而非 plain object：plain object 每 render 都 new 一个，
  // 闭包持的是上一帧的 ref，丢更新；useRef 跨 render 同一个 mutable container。
  const reloadTopicRef = useRef<(() => Promise<void>) | undefined>(undefined);

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

  const handleRefresh = async () => {
    if (!topicId) return;
    setRefreshing(true);
    setError(null);
    try {
      // 后端走 dispatcher.runRefreshMission：controller 返回 { runId, status }；
      // 前端用 useRadarSocket 订阅 runId 的 ws 实时进度。完成/失败由 ws
      // onCompleted / onFailed 触发刷新。
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

  if (!topicId) return null;
  if (loading) {
    return (
      <div className="mx-auto max-w-7xl p-6">
        <div className="h-12 w-64 animate-pulse rounded bg-gray-100" />
      </div>
    );
  }
  if (error || !topic) {
    return (
      <div className="mx-auto max-w-7xl p-6">
        <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          加载失败：{error}
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl p-4 sm:p-6">
      <button
        type="button"
        onClick={() => router.push('/ai-radar')}
        className="mb-3 inline-flex items-center gap-1 text-xs text-gray-500 hover:text-gray-700"
      >
        <ArrowLeft className="h-3 w-3" />
        返回雷达列表
      </button>

      <header className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">{topic.name}</h1>
          {topic.description && (
            <p className="mt-1 max-w-2xl text-xs text-gray-500">
              {topic.description}
            </p>
          )}
          <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] text-gray-500">
            <span>关键词：{topic.keywords.join(' / ')}</span>
            <span>·</span>
            <span>
              数据源 {topic.counts.sources} / 条目 {topic.counts.items} / 刷新{' '}
              {topic.counts.runs}
            </span>
            <span>·</span>
            <span>cron {topic.refreshCron}</span>
          </div>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={handleRefresh}
            disabled={refreshing || topic.status !== 'ACTIVE'}
            className="inline-flex items-center gap-1.5 rounded-lg bg-cyan-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-cyan-700 disabled:opacity-60"
          >
            <RefreshCw
              className={`h-3 w-3 ${refreshing ? 'animate-spin' : ''}`}
            />
            {refreshing ? '采集中...' : '立即刷新'}
          </button>
          <button
            type="button"
            onClick={() => setDeleteOpen(true)}
            className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-1.5 text-xs text-gray-600 hover:bg-gray-50"
          >
            <Trash2 className="h-3 w-3" />
            删除
          </button>
        </div>
      </header>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-[260px_1fr_280px]">
        <aside className="space-y-3">
          <RadarSourceList
            topicId={topic.id}
            sources={sources}
            onReload={() => void reloadTopic()}
          />
        </aside>
        <main className="flex flex-col gap-2 md:max-h-[calc(100vh-12rem)] md:min-h-[400px]">
          {refreshing && (
            <div className="flex items-center gap-2 rounded-md border border-cyan-200 bg-cyan-50 px-3 py-2 text-xs text-cyan-700">
              <RefreshCw className="h-3 w-3 animate-spin" />
              {stageStatus
                ? `执行中：${stageStatus.stage} (${stageStatus.status})`
                : '采集中…'}
            </div>
          )}
          <RadarFeedTabs
            value={feedTab}
            onChange={setFeedTab}
            acceptedOnly={acceptedOnly}
            onAcceptedOnlyChange={setAcceptedOnly}
          />
          <div className="flex-1 md:overflow-hidden">
            <RadarFeedList
              topicId={topic.id}
              reloadKey={reloadKey}
              filterType={
                feedTab === 'all' ? undefined : (feedTab as RadarSourceType)
              }
              acceptedOnly={acceptedOnly}
            />
          </div>
        </main>
        <aside className="space-y-3">
          <RadarInsightPanel topicId={topic.id} reloadKey={reloadKey} />
          <RadarEntityPanel topicId={topic.id} reloadKey={reloadKey} />
          <RadarRunTimeline topicId={topic.id} reloadKey={reloadKey} />
        </aside>
      </div>

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
