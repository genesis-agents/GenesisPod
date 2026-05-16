'use client';

import { useCallback, useEffect, useState } from 'react';
import { Radar, Plus } from 'lucide-react';
import {
  archiveTopic,
  listTopics,
  pauseTopic,
  resumeTopic,
} from '@/services/ai-radar/api';
import type { RadarTopic } from '@/services/ai-radar/types';
import { RadarTopicCard } from '@/components/ai-radar/RadarTopicCard';
import { CreateRadarTopicModal } from '@/components/ai-radar/CreateRadarTopicModal';

export default function AiRadarIndexPage() {
  const [topics, setTopics] = useState<RadarTopic[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await listTopics({ limit: 60 });
      setTopics(res.items);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  const handlePause = async (t: RadarTopic) => {
    await pauseTopic(t.id);
    void reload();
  };
  const handleResume = async (t: RadarTopic) => {
    await resumeTopic(t.id);
    void reload();
  };
  const handleArchive = async (t: RadarTopic) => {
    if (!confirm(`确定归档主题「${t.name}」？归档后将停止自动刷新。`)) return;
    await archiveTopic(t.id);
    void reload();
  };

  return (
    <div className="mx-auto max-w-7xl p-4 sm:p-6">
      <header className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-cyan-50 text-cyan-600">
            <Radar className="h-6 w-6" />
          </div>
          <div>
            <h1 className="text-xl font-semibold text-gray-900">AI 雷达</h1>
            <p className="mt-0.5 text-xs text-gray-500">
              持续监控你关心的主题，AI 多 Agent 自动汇聚 X / YouTube / RSS /
              自定义源
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => setCreateOpen(true)}
          className="inline-flex items-center gap-1.5 rounded-lg bg-cyan-600 px-3 py-2 text-sm font-medium text-white hover:bg-cyan-700"
        >
          <Plus className="h-4 w-4" />
          创建雷达
        </button>
      </header>

      {error && (
        <div className="mb-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          加载失败：{error}
        </div>
      )}

      {loading ? (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div
              key={i}
              className="h-36 animate-pulse rounded-xl border border-gray-100 bg-gray-50"
            />
          ))}
        </div>
      ) : topics.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-gray-300 bg-gray-50/50 p-12 text-center">
          <Radar className="h-12 w-12 text-gray-300" />
          <h2 className="mt-4 text-base font-medium text-gray-700">
            还没有雷达主题
          </h2>
          <p className="mt-1 max-w-sm text-xs text-gray-500">
            创建第一个雷达，配置数据源后系统会自动定期采集 + AI 评分 +
            信号洞察。
          </p>
          <button
            type="button"
            onClick={() => setCreateOpen(true)}
            className="mt-4 inline-flex items-center gap-1.5 rounded-lg bg-cyan-600 px-3 py-2 text-sm font-medium text-white hover:bg-cyan-700"
          >
            <Plus className="h-4 w-4" />
            创建第一个雷达
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {topics.map((topic) => (
            <RadarTopicCard
              key={topic.id}
              topic={topic}
              onPause={handlePause}
              onResume={handleResume}
              onArchive={handleArchive}
            />
          ))}
        </div>
      )}

      <CreateRadarTopicModal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onCreated={() => {
          setCreateOpen(false);
          void reload();
        }}
      />
    </div>
  );
}
