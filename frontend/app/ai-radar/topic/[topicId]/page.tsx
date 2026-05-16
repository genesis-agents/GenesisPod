'use client';

import { useCallback, useEffect, useState } from 'react';
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
  RadarTopicWithCounts,
} from '@/services/ai-radar/types';
import { RadarSourceList } from '@/components/ai-radar/RadarSourceList';
import { RadarFeedList } from '@/components/ai-radar/RadarFeedList';
import { RadarInsightPanel } from '@/components/ai-radar/RadarInsightPanel';
import { RadarEntityPanel } from '@/components/ai-radar/RadarEntityPanel';

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
    void reloadTopic();
  }, [reloadTopic]);

  const handleRefresh = async () => {
    if (!topicId) return;
    setRefreshing(true);
    try {
      const summary = await triggerRefresh(topicId);
      // 等待 2s 后重新拉数据（AI pipeline 异步执行，但当前是同步等完成）
      void reloadTopic();
      setReloadKey((k) => k + 1);
      alert(
        `刷新完成：抓取 ${summary.itemsFetched} 条 / 入库 ${summary.itemsInserted} / 失败 source ${summary.sourcesFailed}`
      );
    } catch (e) {
      alert(`刷新失败：${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setRefreshing(false);
    }
  };

  const handleDelete = async () => {
    if (!topic) return;
    if (!confirm(`确定删除主题「${topic.name}」？所有数据将不可恢复。`)) return;
    await deleteTopic(topic.id);
    router.push('/ai-radar');
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
            onClick={handleDelete}
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
        <main className="md:max-h-[calc(100vh-12rem)] md:min-h-[400px] md:overflow-hidden">
          <RadarFeedList topicId={topic.id} reloadKey={reloadKey} />
        </main>
        <aside className="space-y-3">
          <RadarInsightPanel topicId={topic.id} reloadKey={reloadKey} />
          <RadarEntityPanel topicId={topic.id} reloadKey={reloadKey} />
        </aside>
      </div>
    </div>
  );
}
