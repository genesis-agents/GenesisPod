'use client';

import { useEffect, useState } from 'react';
import { ExternalLink } from 'lucide-react';
import { listFeed } from '@/services/ai-radar/api';
import type { RadarItem, RadarSourceType } from '@/services/ai-radar/types';

interface Props {
  topicId: string;
  reloadKey?: number;
}

const TYPE_LABEL: Record<RadarSourceType, string> = {
  X: 'X',
  YOUTUBE: 'YT',
  RSS: 'RSS',
  CUSTOM: 'Web',
};

const TYPE_COLOR: Record<RadarSourceType, string> = {
  X: 'bg-gray-100 text-gray-700',
  YOUTUBE: 'bg-red-50 text-red-700',
  RSS: 'bg-orange-50 text-orange-700',
  CUSTOM: 'bg-indigo-50 text-indigo-700',
};

function fmtDate(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  if (d.toDateString() === now.toDateString()) {
    return d.toLocaleTimeString('zh-CN', {
      hour: '2-digit',
      minute: '2-digit',
    });
  }
  return d.toLocaleDateString('zh-CN', { month: '2-digit', day: '2-digit' });
}

export function RadarFeedList({ topicId, reloadKey = 0 }: Props) {
  const [items, setItems] = useState<RadarItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<RadarSourceType | 'ALL'>('ALL');
  const [acceptedOnly, setAcceptedOnly] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    listFeed(topicId, {
      type: tab === 'ALL' ? undefined : tab,
      acceptedOnly,
      limit: 60,
    })
      .then((res) => {
        if (!cancelled) setItems(res.items);
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [topicId, tab, acceptedOnly, reloadKey]);

  return (
    <div className="flex h-full flex-col rounded-lg border border-gray-200 bg-white">
      <div className="flex flex-wrap items-center gap-2 border-b border-gray-100 px-3 py-2">
        {(['ALL', 'X', 'YOUTUBE', 'RSS', 'CUSTOM'] as const).map((t) => (
          <button
            key={t}
            type="button"
            className={`rounded-md px-2 py-0.5 text-xs ${
              tab === t
                ? 'bg-cyan-50 text-cyan-700'
                : 'text-gray-600 hover:bg-gray-50'
            }`}
            onClick={() => setTab(t)}
          >
            {t === 'ALL' ? '全部' : TYPE_LABEL[t]}
          </button>
        ))}
        <div className="ml-auto flex items-center gap-1">
          <input
            type="checkbox"
            id="acceptedOnly"
            className="h-3 w-3"
            checked={acceptedOnly}
            onChange={(e) => setAcceptedOnly(e.target.checked)}
          />
          <label htmlFor="acceptedOnly" className="text-[11px] text-gray-500">
            仅显示通过评分
          </label>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto">
        {error && (
          <div className="m-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
            {error}
          </div>
        )}
        {loading ? (
          <div className="space-y-2 p-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="h-16 animate-pulse rounded bg-gray-50" />
            ))}
          </div>
        ) : items.length === 0 ? (
          <div className="py-12 text-center text-xs text-gray-400">
            还没有信号。点右上角「立即刷新」开始首次采集。
          </div>
        ) : (
          <ul className="divide-y divide-gray-100">
            {items.map((item) => (
              <li
                key={item.id}
                className="px-3 py-2.5 transition hover:bg-cyan-50/30"
              >
                <div className="flex items-start gap-2">
                  <span
                    className={`flex-shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium ${
                      item.source
                        ? TYPE_COLOR[item.source.type]
                        : 'bg-gray-100 text-gray-700'
                    }`}
                  >
                    {item.source ? TYPE_LABEL[item.source.type] : '?'}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] text-gray-400">
                        {fmtDate(item.publishedAt)}
                      </span>
                      {item.author && (
                        <span className="text-[10px] text-gray-500">
                          {item.author}
                        </span>
                      )}
                      {item.relevanceScore != null && (
                        <span className="rounded-full bg-cyan-50 px-1.5 py-0.5 text-[10px] text-cyan-700">
                          相关 {item.relevanceScore}
                        </span>
                      )}
                      {item.qualityScore != null && (
                        <span className="rounded-full bg-indigo-50 px-1.5 py-0.5 text-[10px] text-indigo-700">
                          质量 {item.qualityScore}
                        </span>
                      )}
                      {item.accepted && (
                        <span className="rounded-full bg-emerald-50 px-1.5 py-0.5 text-[10px] text-emerald-700">
                          ✓ 入选
                        </span>
                      )}
                    </div>
                    {item.url ? (
                      <a
                        href={item.url}
                        target="_blank"
                        rel="noreferrer"
                        className="mt-1 block text-sm font-medium text-gray-900 hover:text-cyan-700"
                      >
                        {item.title || '(无标题)'}
                        <ExternalLink className="ml-1 inline h-3 w-3 opacity-50" />
                      </a>
                    ) : (
                      <h4 className="mt-1 text-sm font-medium text-gray-900">
                        {item.title || '(无标题)'}
                      </h4>
                    )}
                    {item.aiSummary ? (
                      <p className="mt-1 text-xs text-gray-600">
                        {item.aiSummary}
                      </p>
                    ) : item.content ? (
                      <p className="mt-1 line-clamp-2 text-xs text-gray-500">
                        {item.content}
                      </p>
                    ) : null}
                    {item.entities && item.entities.length > 0 && (
                      <div className="mt-1.5 flex flex-wrap gap-1">
                        {item.entities.slice(0, 5).map((e, idx) => (
                          <span
                            key={`${e.type}-${e.name}-${idx}`}
                            className="rounded bg-gray-50 px-1.5 py-0.5 text-[10px] text-gray-600"
                          >
                            {e.normalizedName}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
