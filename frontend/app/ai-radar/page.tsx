'use client';

/**
 * AI Radar Index Page
 *
 * 2026-05-16 R-Hero: 重构对齐 AI Insights / Playground 主页骨架。
 *  - 头部：复用 PageHeaderHero 公共组件（icon gradient + title + subtitle + actions）
 *  - 卡片：RadarTopicCard 基于 AssetCard 公共组件渲染
 *  - 创建弹窗：CreateRadarTopicModal 走 MissionDialogShell 公共壳
 *  - 列表：sticky header + bg-gray-50 容器 + 搜索框 + 网格 + dashed 占位卡（对齐 Playground）
 *
 * 公共能力复用清单：PageHeaderHero / AssetCard / MissionDialogShell —— 雷达不自造轮子。
 */

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { Loader2, Plus, Radar } from 'lucide-react';
import {
  archiveTopic,
  listTopics,
  pauseTopic,
  resumeTopic,
} from '@/services/ai-radar/api';
import type {
  RadarTopic,
  RadarTopicWithCounts,
} from '@/services/ai-radar/types';
import { RadarTopicCard } from '@/components/ai-radar/RadarTopicCard';
import { CreateRadarTopicModal } from '@/components/ai-radar/CreateRadarTopicModal';
import { ConfirmDialog } from '@/components/ai-radar/ConfirmDialog';
import { PageHeaderHero } from '@/components/common/page-header-hero';

const SearchIcon = ({ className }: { className?: string }) => (
  <svg
    className={className}
    fill="none"
    stroke="currentColor"
    viewBox="0 0 24 24"
  >
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2}
      d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
    />
  </svg>
);

export default function AiRadarIndexPage() {
  const [topics, setTopics] = useState<RadarTopicWithCounts[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const [archiveTarget, setArchiveTarget] = useState<RadarTopic | null>(null);
  const [archiving, setArchiving] = useState(false);

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

  const filtered = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return topics;
    return topics.filter(
      (t) =>
        t.name.toLowerCase().includes(q) ||
        (t.description?.toLowerCase().includes(q) ?? false) ||
        t.keywords.some((kw) => kw.toLowerCase().includes(q))
    );
  }, [topics, searchQuery]);

  const handlePause = async (t: RadarTopic) => {
    await pauseTopic(t.id);
    void reload();
  };
  const handleResume = async (t: RadarTopic) => {
    await resumeTopic(t.id);
    void reload();
  };
  const handleArchive = (t: RadarTopic) => {
    setArchiveTarget(t);
  };
  const handleArchiveConfirm = async () => {
    if (!archiveTarget) return;
    setArchiving(true);
    try {
      await archiveTopic(archiveTarget.id);
      setArchiveTarget(null);
      void reload();
    } catch (e) {
      setError(`归档失败：${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setArchiving(false);
    }
  };

  let body: ReactNode;
  if (loading) {
    body = (
      <div className="rounded-xl border border-dashed border-gray-200 bg-white p-12 text-center">
        <Loader2 className="mx-auto mb-3 h-7 w-7 animate-spin text-gray-400" />
        <p className="text-sm text-gray-500">加载雷达主题…</p>
      </div>
    );
  } else if (error) {
    body = (
      <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
        加载失败：{error}
      </div>
    );
  } else if (filtered.length === 0) {
    const isInitialEmpty = topics.length === 0;
    body = (
      <div className="rounded-xl border border-dashed border-gray-200 bg-white p-12 text-center">
        <Radar className="mx-auto mb-3 h-10 w-10 text-cyan-300" />
        <h3 className="text-lg font-semibold text-gray-900">
          {isInitialEmpty ? '还没有雷达主题' : '没有匹配项'}
        </h3>
        <p className="mt-1 text-sm text-gray-500">
          {isInitialEmpty
            ? '创建第一个雷达，配置数据源后系统会自动定期采集 + AI 评分 + 信号洞察'
            : '换个关键词试试'}
        </p>
        {isInitialEmpty && (
          <button
            type="button"
            onClick={() => setCreateOpen(true)}
            className="mt-4 inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-cyan-500 to-sky-600 px-5 py-2.5 text-sm font-medium text-white shadow-lg shadow-cyan-500/25"
          >
            <Plus className="h-5 w-5" />
            创建第一个雷达
          </button>
        )}
      </div>
    );
  } else {
    body = (
      <>
        <div className="mb-4 flex items-baseline justify-between">
          <h2 className="text-base font-semibold text-gray-900">
            {searchQuery ? '搜索结果' : '我的雷达'}
          </h2>
          <span className="text-xs text-gray-500">共 {filtered.length} 个</span>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {filtered.map((topic) => (
            <RadarTopicCard
              key={topic.id}
              topic={topic}
              onPause={(t) => void handlePause(t)}
              onResume={(t) => void handleResume(t)}
              onArchive={handleArchive}
            />
          ))}
          <button
            type="button"
            onClick={() => setCreateOpen(true)}
            className="flex min-h-[220px] flex-col items-center justify-center rounded-xl border-2 border-dashed border-gray-300 bg-white p-6 transition-colors hover:border-cyan-400 hover:bg-cyan-50"
          >
            <Plus className="h-10 w-10 text-gray-400" />
            <span className="mt-2 text-sm font-medium text-gray-600">
              新建雷达
            </span>
          </button>
        </div>
      </>
    );
  }

  return (
    <div className="h-full overflow-auto bg-gray-50">
      <div className="sticky top-0 z-10 border-b border-gray-100 bg-white/50 backdrop-blur-sm">
        <PageHeaderHero
          title="AI 雷达"
          subtitle="持续监控你关心的主题，AI 自动汇聚官博 / YouTube / RSS 一手信源 + 评分去噪 + 信号洞察"
          icon={<Radar className="h-7 w-7 text-white" />}
          iconGradient="from-cyan-500 to-sky-600"
          iconShadowClass="shadow-cyan-500/25"
          actions={
            <button
              type="button"
              onClick={() => setCreateOpen(true)}
              className="flex items-center gap-2 rounded-xl bg-gradient-to-r from-cyan-500 to-sky-600 px-5 py-2.5 text-sm font-medium text-white shadow-lg shadow-cyan-500/25 transition-all hover:shadow-xl hover:shadow-cyan-500/30"
            >
              <Plus className="h-5 w-5" />
              新建雷达
            </button>
          }
        >
          <div className="relative">
            <SearchIcon className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="按主题名 / 描述 / 关键词搜索…"
              className="w-full rounded-xl border border-gray-200 bg-white py-3 pl-12 pr-4 text-sm outline-none transition-all focus:border-cyan-500 focus:ring-2 focus:ring-cyan-500/20"
            />
          </div>
        </PageHeaderHero>
      </div>

      <div className="px-8 py-6">{body}</div>

      <CreateRadarTopicModal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onCreated={() => {
          setCreateOpen(false);
          void reload();
        }}
      />

      <ConfirmDialog
        open={archiveTarget !== null}
        title={`归档主题「${archiveTarget?.name ?? ''}」？`}
        description="归档后将停止自动刷新；数据保留可随时 resume。"
        confirmLabel="归档"
        busy={archiving}
        onConfirm={() => void handleArchiveConfirm()}
        onCancel={() => setArchiveTarget(null)}
      />
    </div>
  );
}
