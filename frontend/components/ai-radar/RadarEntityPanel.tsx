'use client';

import { useEffect, useState } from 'react';
import {
  ArrowUp,
  Building2,
  Calendar,
  Package,
  Tag,
  Users,
} from 'lucide-react';
import { getLatestInsight } from '@/services/ai-radar/api';
import type { RadarInsightTopEntity } from '@/services/ai-radar/types';

interface Props {
  topicId: string;
  reloadKey?: number;
}

const ENTITY_ICON: Record<
  string,
  React.ComponentType<{ className?: string }>
> = {
  person: Users,
  company: Building2,
  product: Package,
  event: Calendar,
};

const ENTITY_LABEL: Record<string, string> = {
  person: '人物',
  company: '公司',
  product: '产品',
  event: '事件',
  location: '地点',
  other: '其他',
};

export function RadarEntityPanel({ topicId, reloadKey = 0 }: Props) {
  const [entities, setEntities] = useState<RadarInsightTopEntity[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    getLatestInsight(topicId)
      .then((res) => {
        if (!cancelled) setEntities(res.insight?.topEntities ?? []);
      })
      .catch(() => {
        if (!cancelled) setEntities([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [topicId, reloadKey]);

  const grouped = entities.reduce<Record<string, RadarInsightTopEntity[]>>(
    (acc, e) => {
      const key = e.type || 'other';
      if (!acc[key]) acc[key] = [];
      acc[key].push(e);
      return acc;
    },
    {}
  );

  return (
    <div className="rounded-lg border border-gray-200 bg-white">
      <div className="flex items-center gap-2 border-b border-gray-100 px-3 py-2">
        <Tag className="h-4 w-4 text-cyan-600" />
        <h3 className="text-sm font-medium text-gray-700">热门实体</h3>
      </div>
      <div className="px-3 py-3">
        {loading ? (
          <div className="h-20 animate-pulse rounded bg-gray-50" />
        ) : entities.length === 0 ? (
          <p className="text-xs text-gray-400">还没有实体数据。</p>
        ) : (
          <div className="space-y-3">
            {Object.entries(grouped).map(([type, list]) => {
              const Icon = ENTITY_ICON[type] ?? Tag;
              return (
                <div key={type}>
                  <div className="mb-1 flex items-center gap-1 text-[10px] uppercase text-gray-400">
                    <Icon className="h-3 w-3" />
                    <span>{ENTITY_LABEL[type] ?? type}</span>
                  </div>
                  <ul className="space-y-1">
                    {list.map((e, i) => (
                      <li
                        key={`${type}-${e.name}-${i}`}
                        className="flex items-center justify-between text-xs"
                      >
                        <span className="truncate text-gray-700">{e.name}</span>
                        <span className="flex flex-shrink-0 items-center gap-0.5 text-[10px] text-gray-400">
                          <span>{e.mentions}</span>
                          {(e.delta ?? 0) > 0 && (
                            <span className="inline-flex items-center text-emerald-600">
                              <ArrowUp className="h-2.5 w-2.5" />
                              {e.delta}
                            </span>
                          )}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
