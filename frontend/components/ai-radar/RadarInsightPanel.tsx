'use client';

import { useEffect, useState } from 'react';
import { Sparkles, TrendingUp } from 'lucide-react';
import { getLatestInsight } from '@/services/ai-radar/api';
import type { RadarInsight } from '@/services/ai-radar/types';

interface Props {
  topicId: string;
  reloadKey?: number;
}

const HIGHLIGHT_TYPE_LABEL: Record<string, string> = {
  trend: '趋势',
  'new-entity': '新实体',
  anomaly: '异常',
  'key-event': '关键事件',
};

const HIGHLIGHT_TYPE_COLOR: Record<string, string> = {
  trend: 'bg-indigo-50 text-indigo-700 border-indigo-200',
  'new-entity': 'bg-emerald-50 text-emerald-700 border-emerald-200',
  anomaly: 'bg-amber-50 text-amber-700 border-amber-200',
  'key-event': 'bg-rose-50 text-rose-700 border-rose-200',
};

export function RadarInsightPanel({ topicId, reloadKey = 0 }: Props) {
  const [insight, setInsight] = useState<RadarInsight | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    getLatestInsight(topicId)
      .then((res) => {
        if (!cancelled) setInsight(res.insight);
      })
      .catch(() => {
        if (!cancelled) setInsight(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [topicId, reloadKey]);

  return (
    <div className="rounded-lg border border-gray-200 bg-white">
      <div className="flex items-center gap-2 border-b border-gray-100 px-3 py-2">
        <Sparkles className="h-4 w-4 text-cyan-600" />
        <h3 className="text-sm font-medium text-gray-700">AI 洞察</h3>
      </div>
      <div className="px-3 py-3">
        {loading ? (
          <div className="h-20 animate-pulse rounded bg-gray-50" />
        ) : !insight ? (
          <p className="text-xs text-gray-400">
            还没有洞察。等首次刷新完成后 AI 会自动生成。
          </p>
        ) : (
          <div className="space-y-3">
            <p className="text-xs leading-relaxed text-gray-700">
              {insight.summary}
            </p>
            <div className="text-[10px] text-gray-400">
              周期：{new Date(insight.periodFrom).toLocaleDateString('zh-CN')} —{' '}
              {new Date(insight.periodTo).toLocaleDateString('zh-CN')}
            </div>

            {insight.highlights.length > 0 && (
              <div>
                <div className="mb-1.5 text-[10px] font-medium uppercase tracking-wider text-gray-400">
                  亮点
                </div>
                <ul className="space-y-1.5">
                  {insight.highlights.map((h, i) => (
                    <li key={i} className="flex gap-2">
                      <span
                        className={`flex-shrink-0 rounded-full border px-1.5 py-0.5 text-[9px] ${
                          HIGHLIGHT_TYPE_COLOR[h.type] ?? ''
                        }`}
                      >
                        {HIGHLIGHT_TYPE_LABEL[h.type] ?? h.type}
                      </span>
                      <span className="text-xs text-gray-700">{h.title}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {insight.signals.length > 0 && (
              <div>
                <div className="mb-1.5 text-[10px] font-medium uppercase tracking-wider text-gray-400">
                  信号
                </div>
                <ul className="space-y-1">
                  {insight.signals.map((s, i) => (
                    <li
                      key={i}
                      className="flex items-start gap-2 text-[11px] text-gray-600"
                    >
                      <TrendingUp className="mt-0.5 h-3 w-3 flex-shrink-0 text-cyan-600" />
                      <span>
                        <strong className="text-gray-800">{s.kind}</strong>{' '}
                        <span className="text-cyan-700">+{s.magnitude}</span>：
                        {s.evidence}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
