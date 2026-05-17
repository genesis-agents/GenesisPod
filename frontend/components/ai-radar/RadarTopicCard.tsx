'use client';

/**
 * RadarTopicCard
 *
 * 基于 `AssetCard` 平台组件实现（2026-05-16 重构）。
 * 本文件只负责将 RadarTopicWithCounts 业务数据映射成 AssetCard props，
 * 与 TopicCard / WritingProjectCard / Playground MissionCard 保持视觉骨架一致。
 *
 * 字段策略（YAGNI）：
 *  - 不传 visibility/progress —— 雷达本质私有 + 持续运行无"完成度"概念
 *  - stats 用 items/sources/runs counts（list API 经 _count 单次拿到，不会 N+1）
 *  - customSection 显示关键词 chips（雷达独有信息，AssetCard 默认布局不覆盖）
 */

import { useRouter } from 'next/navigation';
import {
  Activity,
  Archive,
  Database,
  PauseCircle,
  PlayCircle,
  Radar as RadarIcon,
  Rss,
} from 'lucide-react';
import {
  AssetCard,
  type AssetCardAction,
  type AssetCardBadge,
} from '@/components/common/asset-card';
import type {
  RadarTopic,
  RadarTopicWithCounts,
} from '@/services/ai-radar/types';

interface Props {
  topic: RadarTopicWithCounts;
  onArchive?: (topic: RadarTopic) => void;
  onPause?: (topic: RadarTopic) => void;
  onResume?: (topic: RadarTopic) => void;
}

const STATUS_BADGE: Record<
  RadarTopic['status'],
  { label: string; className: string }
> = {
  ACTIVE: {
    label: '运行中',
    className: 'bg-cyan-50 text-cyan-700',
  },
  PAUSED: {
    label: '已暂停',
    className: 'bg-gray-100 text-gray-600',
  },
  ARCHIVED: {
    label: '已归档',
    className: 'bg-gray-100 text-gray-500',
  },
};

export function RadarTopicCard({ topic, onArchive, onPause, onResume }: Props) {
  const router = useRouter();
  const status = STATUS_BADGE[topic.status];

  const badges: AssetCardBadge[] = [
    {
      key: 'status',
      label: status.label,
      className: status.className,
    },
  ];

  const extraActions: AssetCardAction[] = [];
  if (topic.status === 'ACTIVE' && onPause) {
    extraActions.push({
      key: 'pause',
      title: '暂停',
      tone: 'warning',
      icon: <PauseCircle className="h-4 w-4" />,
      onClick: () => onPause(topic),
    });
  }
  if (topic.status === 'PAUSED' && onResume) {
    extraActions.push({
      key: 'resume',
      title: '恢复',
      tone: 'success',
      icon: <PlayCircle className="h-4 w-4" />,
      onClick: () => onResume(topic),
    });
  }
  if (topic.status !== 'ARCHIVED' && onArchive) {
    extraActions.push({
      key: 'archive',
      title: '归档',
      tone: 'default',
      icon: <Archive className="h-4 w-4" />,
      onClick: () => onArchive(topic),
    });
  }

  const keywordChips =
    topic.keywords.length > 0 ? (
      <div className="flex flex-wrap gap-1">
        {topic.keywords.slice(0, 5).map((kw) => (
          <span
            key={kw}
            className="rounded-md bg-gray-50 px-1.5 py-0.5 text-[11px] text-gray-600"
          >
            {kw}
          </span>
        ))}
        {topic.keywords.length > 5 && (
          <span className="text-[11px] text-gray-400">
            +{topic.keywords.length - 5}
          </span>
        )}
      </div>
    ) : null;

  return (
    <AssetCard
      title={topic.name}
      description={topic.description}
      icon={<RadarIcon className="h-6 w-6 text-white" />}
      gradient="from-cyan-500 to-sky-600"
      badges={badges}
      isOwner
      extraActions={extraActions}
      onClick={() => router.push(`/ai-radar/topic/${topic.id}`)}
      customSection={keywordChips}
      stats={[
        {
          key: 'items',
          icon: <Database className="h-3.5 w-3.5" />,
          text: `${topic.counts.items} 条`,
        },
        {
          key: 'sources',
          icon: <Rss className="h-3.5 w-3.5" />,
          text: `${topic.counts.sources} 源`,
        },
        {
          key: 'runs',
          icon: <Activity className="h-3.5 w-3.5" />,
          text: `${topic.counts.runs} 次刷新`,
        },
      ]}
      timestampLabel="上次"
      timestamp={topic.lastRunAt}
    />
  );
}
