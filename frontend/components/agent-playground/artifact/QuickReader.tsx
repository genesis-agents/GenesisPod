'use client';

import { useMemo } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import {
  Sparkles,
  TrendingUp,
  AlertCircle,
  Lightbulb,
  Star,
  Clock,
  ExternalLink,
  Target,
} from 'lucide-react';
import type {
  ReportArtifact,
  ArtifactHighlight,
} from '@/lib/agent-playground/report-artifact.types';
import { FigureRenderer as PublicFigureRenderer } from '@/components/common/chart-viewer/FigureRenderer';
import type { RenderableChart } from '@/components/common/chart-viewer/types';
import type { ArtifactFigure } from '@/lib/agent-playground/report-artifact.types';

function toRenderableChart(f: ArtifactFigure): RenderableChart {
  return {
    id: f.id,
    chartType:
      f.type === 'extracted_chart' || f.type === 'reference'
        ? 'reference'
        : 'generated',
    type: f.chartType,
    title: f.title,
    description: f.caption,
    imageUrl: f.imageUrl,
    evidenceCitationIndex: f.evidenceCitationIndex,
    sectionId: f.sectionId,
    position: f.position,
  };
}

/**
 * 清洗快速视图纯文本字段（按 TI cleanQuickViewText）：
 * 移除 [N] 引用 / 字数计数 / markdown 加粗符号 等噪声。
 */
function cleanText(text: string): string {
  if (!text) return text;
  let cleaned = text;
  cleaned = cleaned.replace(/(?:\[\d+\])+/g, ''); // [N] / [N][M]
  cleaned = cleaned.replace(/[（(][^）)]*约?\d+字[）)]/g, ''); // (约 N 字)
  cleaned = cleaned.replace(/\*\*([^*]+)\*\*/g, '$1'); // bold
  cleaned = cleaned.replace(/\*([^*]+)\*/g, '$1'); // italic
  cleaned = cleaned.replace(/^[-*]\s+/gm, ''); // bullets
  cleaned = cleaned.replace(/\s{2,}/g, ' ');
  return cleaned.trim();
}

/** 保留 markdown 结构（执行摘要专用），仅清 [N] / 字数 */
function stripCitationsAndWordCount(text: string): string {
  if (!text) return text;
  return text
    .replace(/(?:\[\d+\])+/g, '')
    .replace(/[（(][^）)]*约?\d+字[）)]/g, '')
    .replace(/ {2,}/g, ' ');
}

interface Props {
  artifact: ReportArtifact;
  onSwitchToFull?: () => void;
}

/**
 * ★ 2026-05-07 重构：参考 Topic Insight QuickViewReport 布局
 *
 * 关键差异（vs 旧版）：
 * 1. 执行摘要用 ReactMarkdown + remarkGfm 渲染（旧版 whitespace-pre-line 不渲染 markdown）
 * 2. 全局 topHighlights 按 sourceDimensionId 分组 → "维度 keyFindings"卡片
 * 3. 风险机遇红绿对比卡（risk vs opportunity）— TI 同款"风险与机遇速览"
 * 4. 战略建议保留 topRecommendations（无受众细分时不强加）
 * 5. 关键图保留独立板块（playground 独有，TI 没有）
 *
 * 数据来源：artifact.quickView.{executiveSummary / topHighlights / topTrends /
 * keyRisks / topRecommendations / keyFigures / keyCitations} —— 不依赖新字段。
 */
export function QuickReader({ artifact, onSwitchToFull }: Props) {
  const qv = artifact.quickView;

  // 按 sourceDimensionId 分组 topHighlights（type='finding' 优先）
  const dimensionFindings = useMemo(() => {
    type Group = {
      dimId: string;
      dimName: string;
      findings: ArtifactHighlight[];
    };
    const map = new Map<string, Group>();
    for (const h of qv.topHighlights) {
      // 跳过非 finding 类型（risk / opportunity 单独走红绿卡）
      if (h.type !== 'finding' && h.type !== 'trend') continue;
      const dimId = h.sourceDimensionId;
      // dim 名从 sections 反查（type=dimension）
      const dimSec = artifact.sections.find(
        (s) => s.sourceDimensionId === dimId
      );
      const dimName = dimSec?.title ?? dimId ?? '未分类';
      if (!map.has(dimId)) {
        map.set(dimId, { dimId, dimName, findings: [] });
      }
      map.get(dimId)!.findings.push(h);
    }
    return Array.from(map.values()).map((g) => ({
      ...g,
      findings: g.findings.slice(0, 3), // 每维度 Top 3
    }));
  }, [qv.topHighlights, artifact.sections]);

  // 风险机遇分组：keyRisks（红） + topHighlights type=opportunity（绿）
  const opportunities = useMemo(
    () => qv.topHighlights.filter((h) => h.type === 'opportunity').slice(0, 5),
    [qv.topHighlights]
  );

  const keyCites = qv.keyCitations
    .map((idx) => artifact.citations.find((c) => c.index === idx))
    .filter((c): c is NonNullable<typeof c> => Boolean(c));
  const keyFigures = qv.keyFigures
    .map((id) => artifact.figures.find((f) => f.id === id))
    .filter((f): f is NonNullable<typeof f> => Boolean(f));

  return (
    <div className="space-y-4">
      {/* Critic 复审标记（保留原行为） */}
      {artifact.quality.hardGateViolations.length > 0 && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-700">
          <div className="mb-1.5 flex items-center gap-1.5 font-semibold">
            <AlertCircle className="h-3.5 w-3.5" />
            <span>
              Critic 复审标记 {artifact.quality.hardGateViolations.length} 项
            </span>
          </div>
          <ul className="space-y-1 pl-4">
            {artifact.quality.hardGateViolations.slice(0, 3).map((v, i) => {
              const tag =
                v.dimension === 'l4-critic' || v.dimension === 'l4-fail'
                  ? '总体评判'
                  : v.dimension === 'l4-blindspot'
                    ? '盲点'
                    : v.dimension === 'l4-bias'
                      ? '偏见'
                      : v.dimension === 'l4-suggestion'
                        ? '建议'
                        : v.dimension;
              return (
                <li key={i} className="leading-snug">
                  <span className="mr-2 inline-block min-w-[3em] rounded bg-red-100 px-1.5 py-0.5 text-[10px] font-medium text-red-800">
                    {tag}
                  </span>
                  <span>{v.message}</span>
                </li>
              );
            })}
            {artifact.quality.hardGateViolations.length > 3 && (
              <li className="text-red-600/70">
                …还有 {artifact.quality.hardGateViolations.length - 3} 项见
                「质量评分」详情
              </li>
            )}
          </ul>
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
                <span>{cleanText(it)}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 执行摘要（ReactMarkdown 渲染，参考 TI QuickViewReport） */}
      {qv.executiveSummary.markdown && (
        <section>
          <h3 className="mb-2 flex items-center gap-1.5 text-sm font-bold text-gray-900">
            <Sparkles className="h-4 w-4 text-violet-500" />
            执行摘要
          </h3>
          <div className="rounded-xl border border-violet-100 bg-violet-50/40 p-5">
            <article className="prose prose-sm prose-gray prose-strong:text-violet-700 max-w-none leading-relaxed">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>
                {stripCitationsAndWordCount(qv.executiveSummary.markdown)}
              </ReactMarkdown>
            </article>
          </div>
        </section>
      )}

      {/* 维度 keyFindings —— 参考 TI QuickViewReport "Key Findings by Dimension" */}
      {dimensionFindings.length > 0 && (
        <section>
          <h3 className="mb-3 flex items-center gap-1.5 text-sm font-bold text-gray-900">
            <Target className="h-4 w-4 text-blue-500" />
            维度核心发现
          </h3>
          <div className="space-y-2.5">
            {dimensionFindings.map((dim) => (
              <div
                key={dim.dimId}
                className="rounded-xl border border-gray-100 bg-white p-3"
              >
                <h4 className="mb-2 text-base font-bold text-gray-800">
                  {dim.dimName}
                </h4>
                <ul className="space-y-1.5">
                  {dim.findings.map((h, idx) => (
                    <li
                      key={idx}
                      className="flex items-start gap-2 text-sm leading-relaxed text-gray-600"
                    >
                      <span
                        className={`mt-1 inline-block h-1.5 w-1.5 flex-shrink-0 rounded-full ${
                          h.type === 'finding'
                            ? 'bg-blue-400'
                            : 'bg-emerald-400'
                        }`}
                      />
                      <div className="min-w-0 flex-1">
                        <p className="font-medium text-gray-800">{h.title}</p>
                        {h.oneLineSummary && (
                          <p className="mt-0.5 text-xs text-gray-500">
                            {cleanText(h.oneLineSummary)}
                          </p>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* 关键图 —— playground 独有（TI 没图） */}
      {keyFigures.length > 0 && (
        <section>
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
                <PublicFigureRenderer
                  key={f.id}
                  chart={toRenderableChart(f)}
                  showSource
                  allowZoom
                  evidenceInfo={
                    cite
                      ? {
                          id: cite.uuid || `cite-${cite.index}`,
                          title: cite.title,
                          url: cite.url,
                          snippet: cite.snippet,
                          domain: cite.domain,
                        }
                      : null
                  }
                />
              );
            })}
          </div>
        </section>
      )}

      {/* 关键趋势 */}
      {qv.topTrends.length > 0 && (
        <section>
          <h3 className="mb-3 flex items-center gap-1.5 text-sm font-bold text-gray-900">
            <TrendingUp className="h-4 w-4 text-emerald-500" />
            关键趋势
          </h3>
          <div className="rounded-xl border border-gray-100 bg-white p-4">
            <ul className="space-y-1.5 text-sm">
              {qv.topTrends.map((t, i) => (
                <li key={i} className="flex items-start gap-2 text-gray-700">
                  <span className="mt-1 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-emerald-500" />
                  <div className="min-w-0 flex-1">
                    <span className="font-medium">{t.title}</span>
                    {t.description && (
                      <span className="ml-1 text-gray-600">
                        — {cleanText(t.description)}
                      </span>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </section>
      )}

      {/* 风险与机遇速览 —— TI 同款 红绿对比卡 */}
      {(qv.keyRisks.length > 0 || opportunities.length > 0) && (
        <section>
          <h3 className="mb-3 flex items-center gap-1.5 text-sm font-bold text-gray-900">
            <Star className="h-4 w-4 text-amber-500" />
            风险与机遇速览
          </h3>
          <div className="grid gap-3 md:grid-cols-2">
            {/* 风险 */}
            {qv.keyRisks.length > 0 && (
              <div className="rounded-xl border border-red-100 bg-red-50/50 p-4">
                <h4 className="mb-2 flex items-center gap-1.5 text-sm font-bold text-red-700">
                  <AlertCircle className="h-3.5 w-3.5" />
                  关键风险
                </h4>
                <ol className="list-decimal space-y-2 pl-5">
                  {qv.keyRisks.slice(0, 5).map((r, i) => (
                    <li
                      key={i}
                      className="text-sm leading-relaxed text-red-700/85"
                    >
                      <span className="font-bold text-red-700">{r.title}</span>
                      {r.description && (
                        <span className="ml-1 text-red-700/70">
                          — {cleanText(r.description)}
                        </span>
                      )}
                    </li>
                  ))}
                </ol>
              </div>
            )}
            {/* 机遇（来源 topHighlights type=opportunity） */}
            {opportunities.length > 0 && (
              <div className="rounded-xl border border-emerald-100 bg-emerald-50/50 p-4">
                <h4 className="mb-2 flex items-center gap-1.5 text-sm font-bold text-emerald-700">
                  <Sparkles className="h-3.5 w-3.5" />
                  机遇方向
                </h4>
                <ol className="list-decimal space-y-2 pl-5">
                  {opportunities.map((h, i) => (
                    <li
                      key={i}
                      className="text-sm leading-relaxed text-emerald-700/85"
                    >
                      <span className="font-bold text-emerald-700">
                        {h.title}
                      </span>
                      {h.oneLineSummary && (
                        <span className="ml-1 text-emerald-700/70">
                          — {cleanText(h.oneLineSummary)}
                        </span>
                      )}
                    </li>
                  ))}
                </ol>
              </div>
            )}
          </div>
        </section>
      )}

      {/* 战略建议 */}
      {qv.topRecommendations.length > 0 && (
        <section>
          <h3 className="mb-3 flex items-center gap-1.5 text-sm font-bold text-gray-900">
            <Lightbulb className="h-4 w-4 text-amber-500" />
            战略建议
          </h3>
          <ul className="space-y-1.5 rounded-xl border border-gray-100 bg-white p-4 text-sm">
            {qv.topRecommendations.map((r, i) => (
              <li key={i} className="flex items-start gap-2 text-gray-700">
                <span className="mt-1 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-amber-500" />
                <div className="min-w-0 flex-1">
                  <span className="font-medium">{r.title}</span>
                  {r.description && (
                    <span className="ml-1 text-gray-600">
                      — {cleanText(r.description)}
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
        <section>
          <h3 className="mb-3 flex items-center gap-1.5 text-sm font-bold text-gray-900">
            <ExternalLink className="h-4 w-4 text-violet-500" />
            重点引用
          </h3>
          <ol className="space-y-2 rounded-xl border border-gray-100 bg-white p-4 text-sm">
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
