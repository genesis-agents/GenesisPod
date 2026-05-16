'use client';

import { useRouter } from 'next/navigation';
import { Radar, Clock, Activity, PauseCircle, Archive } from 'lucide-react';
import type { RadarTopic } from '@/services/ai-radar/types';

interface Props {
  topic: RadarTopic;
  onArchive?: (topic: RadarTopic) => void;
  onPause?: (topic: RadarTopic) => void;
  onResume?: (topic: RadarTopic) => void;
}

const STATUS_BADGE: Record<
  RadarTopic['status'],
  { label: string; cls: string }
> = {
  ACTIVE: {
    label: '运行中',
    cls: 'bg-cyan-50 text-cyan-700 border-cyan-200',
  },
  PAUSED: {
    label: '已暂停',
    cls: 'bg-gray-50 text-gray-600 border-gray-200',
  },
  ARCHIVED: {
    label: '已归档',
    cls: 'bg-gray-100 text-gray-500 border-gray-200',
  },
};

function relTime(iso: string | null): string {
  if (!iso) return '从未';
  const diff = Date.now() - new Date(iso).getTime();
  if (diff < 60_000) return '刚刚';
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)} 分钟前`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)} 小时前`;
  return `${Math.floor(diff / 86_400_000)} 天前`;
}

export function RadarTopicCard({ topic, onArchive, onPause, onResume }: Props) {
  const router = useRouter();
  const status = STATUS_BADGE[topic.status];

  return (
    <div
      className="group flex cursor-pointer flex-col rounded-xl border border-gray-200 bg-white p-4 transition hover:border-cyan-300 hover:shadow-md"
      onClick={() => router.push(`/ai-radar/topic/${topic.id}`)}
    >
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg bg-cyan-50 text-cyan-600">
          <Radar className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h3 className="truncate text-sm font-semibold text-gray-900">
              {topic.name}
            </h3>
            <span
              className={`whitespace-nowrap rounded-full border px-2 py-0.5 text-[10px] font-medium ${status.cls}`}
            >
              {status.label}
            </span>
          </div>
          {topic.description && (
            <p className="mt-1 line-clamp-2 text-xs text-gray-500">
              {topic.description}
            </p>
          )}
        </div>
      </div>

      {topic.keywords.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1">
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
      )}

      <div className="mt-3 grid grid-cols-2 gap-2 text-[11px] text-gray-500">
        <div className="flex items-center gap-1">
          <Clock className="h-3 w-3" />
          <span>上次：{relTime(topic.lastRunAt)}</span>
        </div>
        <div className="flex items-center gap-1">
          <Activity className="h-3 w-3" />
          <span>cron：{topic.refreshCron}</span>
        </div>
      </div>

      <div
        className="mt-3 flex gap-2 opacity-0 transition group-hover:opacity-100"
        onClick={(e) => e.stopPropagation()}
      >
        {topic.status === 'ACTIVE' && onPause && (
          <button
            type="button"
            className="inline-flex items-center gap-1 rounded-md border border-gray-200 px-2 py-1 text-[11px] text-gray-600 hover:bg-gray-50"
            onClick={() => onPause(topic)}
          >
            <PauseCircle className="h-3 w-3" />
            暂停
          </button>
        )}
        {topic.status === 'PAUSED' && onResume && (
          <button
            type="button"
            className="inline-flex items-center gap-1 rounded-md border border-cyan-200 bg-cyan-50 px-2 py-1 text-[11px] text-cyan-700 hover:bg-cyan-100"
            onClick={() => onResume(topic)}
          >
            <Activity className="h-3 w-3" />
            恢复
          </button>
        )}
        {topic.status !== 'ARCHIVED' && onArchive && (
          <button
            type="button"
            className="inline-flex items-center gap-1 rounded-md border border-gray-200 px-2 py-1 text-[11px] text-gray-600 hover:bg-gray-50"
            onClick={() => onArchive(topic)}
          >
            <Archive className="h-3 w-3" />
            归档
          </button>
        )}
      </div>
    </div>
  );
}
