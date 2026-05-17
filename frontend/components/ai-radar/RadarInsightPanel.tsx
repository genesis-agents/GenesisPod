'use client';

/**
 * RadarInsightPanel
 *
 * 2026-05-17 R3 评审整改：
 *  - P0：补 topEntities 渲染（之前 LLM 烧 token / DB 存 / API 返但 UI 0 像素显示）
 *  - P1：error state 区分"无洞察"与"API 500"（之前 .catch 静默 setInsight(null)
 *        让 500 与 empty 视觉一致，用户看不到真实失败）
 *  - P1：highlights / signals / topEntities raw Json 加 Array.isArray 守
 *        防 DB legacy 数据或 LLM hallucinate shape 让整面板崩
 */

import { useEffect, useState } from 'react';
import { Sparkles, TrendingUp, AlertCircle, TrendingDown } from 'lucide-react';
import { getLatestInsight } from '@/services/ai-radar/api';
import type {
  RadarInsight,
  RadarInsightHighlight,
  RadarInsightSignal,
  RadarInsightTopEntity,
} from '@/services/ai-radar/types';

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

/**
 * 2026-05-17 R4-B 整改：`as T[]` 是 lying assertion（无元素 shape 校验）。
 * 改为接收 per-element 谓词，过滤掉 null / 非对象 / 缺关键字段的脏元素，
 * 让下游 .map 渲染安全。返回值与谓词收窄类型保持一致。
 */
function safeArray<T>(value: unknown, isItem: (v: unknown) => v is T): T[] {
  if (!Array.isArray(value)) return [];
  return value.filter(isItem);
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === 'object';
}

function isHighlight(v: unknown): v is RadarInsightHighlight {
  return (
    isRecord(v) && typeof v.type === 'string' && typeof v.title === 'string'
  );
}

function isSignal(v: unknown): v is RadarInsightSignal {
  return (
    isRecord(v) &&
    typeof v.kind === 'string' &&
    typeof v.magnitude === 'number' &&
    typeof v.evidence === 'string'
  );
}

function isTopEntity(v: unknown): v is RadarInsightTopEntity {
  return (
    isRecord(v) &&
    typeof v.type === 'string' &&
    typeof v.name === 'string' &&
    typeof v.mentions === 'number'
  );
}

export function RadarInsightPanel({ topicId, reloadKey = 0 }: Props) {
  const [insight, setInsight] = useState<RadarInsight | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    getLatestInsight(topicId)
      .then((res) => {
        if (!cancelled) setInsight(res.insight);
      })
      .catch((e) => {
        if (!cancelled) {
          setInsight(null);
          setError(e instanceof Error ? e.message : String(e));
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [topicId, reloadKey]);

  const highlights = safeArray(insight?.highlights, isHighlight);
  const signals = safeArray(insight?.signals, isSignal);
  const topEntities = safeArray(insight?.topEntities, isTopEntity);

  return (
    <div className="rounded-lg border border-gray-200 bg-white">
      <div className="flex items-center gap-2 border-b border-gray-100 px-3 py-2">
        <Sparkles className="h-4 w-4 text-cyan-600" />
        <h3 className="text-sm font-medium text-gray-700">AI 洞察</h3>
      </div>
      <div className="px-3 py-3">
        {loading ? (
          <div className="h-20 animate-pulse rounded bg-gray-50" />
        ) : error ? (
          <div className="flex items-start gap-2 rounded-md border border-red-200 bg-red-50 px-2 py-1.5 text-xs text-red-700">
            <AlertCircle className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" />
            <span>加载洞察失败：{error}</span>
          </div>
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

            {highlights.length > 0 && (
              <div>
                <div className="mb-1.5 text-[10px] font-medium uppercase tracking-wider text-gray-400">
                  亮点
                </div>
                <ul className="space-y-1.5">
                  {highlights.map((h, i) => (
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

            {signals.length > 0 && (
              <div>
                <div className="mb-1.5 text-[10px] font-medium uppercase tracking-wider text-gray-400">
                  信号
                </div>
                <ul className="space-y-1">
                  {signals.map((s, i) => (
                    <li
                      key={i}
                      className="flex items-start gap-2 text-[11px] text-gray-600"
                    >
                      <TrendingUp className="mt-0.5 h-3 w-3 flex-shrink-0 text-cyan-600" />
                      <span>
                        <strong className="text-gray-800">{s.kind}</strong>{' '}
                        <span className="text-cyan-700">
                          {/* 后端 magnitude 0-10 整数（signal-analyst SKILL.md + s7 clamp） */}
                          强度 {s.magnitude}/10
                        </span>
                        ：{s.evidence}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {topEntities.length > 0 && (
              <div>
                <div className="mb-1.5 text-[10px] font-medium uppercase tracking-wider text-gray-400">
                  高频实体
                </div>
                <ul className="space-y-1">
                  {topEntities.map((e, i) => {
                    const delta = e.delta ?? 0;
                    return (
                      <li
                        key={`${e.type}:${e.name}:${i}`}
                        className="flex items-center justify-between gap-2 text-[11px] text-gray-600"
                      >
                        <span className="flex items-center gap-1.5 truncate">
                          <span className="rounded bg-gray-100 px-1.5 py-0.5 text-[9px] uppercase text-gray-500">
                            {e.type}
                          </span>
                          <span className="truncate text-gray-800">
                            {e.name}
                          </span>
                        </span>
                        <span className="flex flex-shrink-0 items-center gap-1.5">
                          <span className="text-gray-500">{e.mentions} 次</span>
                          {delta !== 0 && (
                            <span
                              className={`flex items-center gap-0.5 text-[10px] ${
                                delta > 0 ? 'text-emerald-600' : 'text-rose-600'
                              }`}
                            >
                              {delta > 0 ? (
                                <TrendingUp className="h-3 w-3" />
                              ) : (
                                <TrendingDown className="h-3 w-3" />
                              )}
                              {delta > 0 ? `+${delta}` : delta}
                            </span>
                          )}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
