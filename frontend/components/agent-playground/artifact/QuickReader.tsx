'use client';

import {
  Sparkles,
  TrendingUp,
  AlertCircle,
  Lightbulb,
  Star,
  Clock,
  ExternalLink,
} from 'lucide-react';
import type { ReportArtifact } from '@/lib/agent-playground/report-artifact.types';
import { FigureRenderer } from './FigureRenderer';

interface Props {
  artifact: ReportArtifact;
  onSwitchToFull?: () => void;
}

/**
 * 快速视图：3-5 分钟读完
 * 卡片化布局：摘要 → Highlight 卡 → 关键图 → Top Citations + 阅读全文 CTA
 */
export function QuickReader({ artifact, onSwitchToFull }: Props) {
  const qv = artifact.quickView;
  const keyCites = qv.keyCitations
    .map((idx) => artifact.citations.find((c) => c.index === idx))
    .filter((c): c is NonNullable<typeof c> => Boolean(c));
  const keyFigures = qv.keyFigures
    .map((id) => artifact.figures.find((f) => f.id === id))
    .filter((f): f is NonNullable<typeof f> => Boolean(f));

  return (
    <div className="space-y-4">
      {/* Phase P19-6: hardGate 警示 */}
      {artifact.quality.hardGateViolations.length > 0 && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-2.5 text-xs text-red-700">
          ⚠️ {artifact.quality.hardGateViolations.length}{' '}
          项硬卡违规，请展开"质量评分"查看详情
        </div>
      )}
      {/* 标题 + 阅读时长 */}
      <div className="rounded-2xl border border-violet-100 bg-gradient-to-br from-violet-50 to-purple-50 p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-wider text-violet-600">
              快速阅读
            </p>
            <h2 className="mt-1 text-lg font-bold text-gray-900">
              {artifact.metadata.topic}
            </h2>
            <p className="mt-1.5 flex items-center gap-1.5 text-xs text-gray-600">
              <Clock className="h-3 w-3" />约 {qv.estimatedReadingTime} 分钟读完
              · {artifact.metadata.dimensionCount} 维度 ·{' '}
              {artifact.metadata.sourceCount} 条引用 ·{' '}
              <span
                className={
                  artifact.quality.overall >= 80
                    ? 'text-emerald-600'
                    : artifact.quality.overall >= 60
                      ? 'text-amber-600'
                      : 'text-red-600'
                }
              >
                质量 {artifact.quality.overall}/100
              </span>
            </p>
          </div>
          {onSwitchToFull && (
            <button
              type="button"
              onClick={onSwitchToFull}
              className="rounded-lg border border-violet-200 bg-white px-3 py-1.5 text-xs font-medium text-violet-700 hover:bg-violet-50"
            >
              阅读全文
            </button>
          )}
        </div>
        {qv.whatYouWillLearn.length > 0 && (
          <div className="mt-3 grid gap-1.5 text-xs text-gray-700">
            {qv.whatYouWillLearn.map((it, i) => (
              <div key={i} className="flex items-start gap-1.5">
                <span className="mt-1 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-violet-500" />
                <span>{it}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 执行摘要 */}
      {qv.executiveSummary.markdown && (
        <section className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
          <h3 className="mb-2 flex items-center gap-1.5 text-sm font-bold text-gray-900">
            <Sparkles className="h-4 w-4 text-violet-500" />
            执行摘要
          </h3>
          <p className="whitespace-pre-line text-sm leading-7 text-gray-700">
            {qv.executiveSummary.markdown}
          </p>
        </section>
      )}

      {/* Top Highlights */}
      {qv.topHighlights.length > 0 && (
        <section className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
          <h3 className="mb-3 flex items-center gap-1.5 text-sm font-bold text-gray-900">
            <Star className="h-4 w-4 text-amber-500" />
            核心要点
          </h3>
          <div className="grid gap-2.5 md:grid-cols-2">
            {qv.topHighlights.map((h, i) => (
              <div
                key={i}
                className="rounded-lg border border-gray-100 bg-gray-50/50 p-3"
              >
                <p className="text-xs font-medium text-gray-900">{h.title}</p>
                {h.oneLineSummary && (
                  <p className="mt-1 text-[11px] text-gray-600">
                    {h.oneLineSummary}
                  </p>
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      {/* 关键图 */}
      {keyFigures.length > 0 && (
        <section className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
          <h3 className="mb-3 flex items-center gap-1.5 text-sm font-bold text-gray-900">
            <Sparkles className="h-4 w-4 text-violet-500" />
            关键图表
          </h3>
          <div className="grid gap-3 md:grid-cols-2">
            {keyFigures.map((f) => {
              const cite = artifact.citations.find(
                (c) => c.index === f.evidenceCitationIndex
              );
              return (
                <FigureRenderer
                  key={f.id}
                  figure={f}
                  citationIndex={f.evidenceCitationIndex}
                  citationUrl={cite?.url}
                />
              );
            })}
          </div>
        </section>
      )}

      {/* Top Trends */}
      {qv.topTrends.length > 0 && (
        <section className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
          <h3 className="mb-3 flex items-center gap-1.5 text-sm font-bold text-gray-900">
            <TrendingUp className="h-4 w-4 text-emerald-500" />
            关键趋势
          </h3>
          <ul className="space-y-1.5 text-sm">
            {qv.topTrends.map((t, i) => (
              <li key={i} className="flex items-start gap-2 text-gray-700">
                <span className="mt-1 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-emerald-500" />
                <div>
                  <span className="font-medium">{t.title}</span>
                  {t.description && (
                    <span className="ml-1 text-gray-600">
                      — {t.description}
                    </span>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Top Risks */}
      {qv.keyRisks.length > 0 && (
        <section className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
          <h3 className="mb-3 flex items-center gap-1.5 text-sm font-bold text-gray-900">
            <AlertCircle className="h-4 w-4 text-red-500" />
            关键风险
          </h3>
          <ul className="space-y-1.5 text-sm">
            {qv.keyRisks.map((r, i) => (
              <li key={i} className="flex items-start gap-2 text-gray-700">
                <span className="mt-1 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-red-500" />
                <div>
                  <span className="font-medium">{r.title}</span>
                  {r.description && (
                    <span className="ml-1 text-gray-600">
                      — {r.description}
                    </span>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Top Recommendations */}
      {qv.topRecommendations.length > 0 && (
        <section className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
          <h3 className="mb-3 flex items-center gap-1.5 text-sm font-bold text-gray-900">
            <Lightbulb className="h-4 w-4 text-amber-500" />
            战略建议
          </h3>
          <ul className="space-y-1.5 text-sm">
            {qv.topRecommendations.map((r, i) => (
              <li key={i} className="flex items-start gap-2 text-gray-700">
                <span className="mt-1 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-amber-500" />
                <div>
                  <span className="font-medium">{r.title}</span>
                  {r.description && (
                    <span className="ml-1 text-gray-600">
                      — {r.description}
                    </span>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Top Citations */}
      {keyCites.length > 0 && (
        <section className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
          <h3 className="mb-3 flex items-center gap-1.5 text-sm font-bold text-gray-900">
            <ExternalLink className="h-4 w-4 text-violet-500" />
            重点引用
          </h3>
          <ol className="space-y-2 text-sm">
            {keyCites.map((c) => (
              <li
                key={c.index}
                className="flex items-start gap-2 text-gray-700"
              >
                <span className="rounded bg-violet-100 px-1.5 py-0.5 text-[10px] font-bold text-violet-700">
                  [{c.index}]
                </span>
                <a
                  href={c.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="line-clamp-1 text-violet-700 hover:underline"
                >
                  {c.title}
                </a>
                <span className="ml-auto text-[11px] text-gray-500">
                  {c.credibilityScore}/100
                </span>
              </li>
            ))}
          </ol>
        </section>
      )}
    </div>
  );
}
