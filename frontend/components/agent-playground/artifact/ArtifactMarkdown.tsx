'use client';

import React, { useMemo } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import type {
  ArtifactCitation,
  ArtifactFigure,
} from '@/lib/agent-playground/report-artifact.types';
import { CitationBadge } from '@/components/common/citations/CitationBadge';
import { FigureRenderer as PublicFigureRenderer } from '@/components/common/chart-viewer/FigureRenderer';
import type { RenderableChart } from '@/components/common/chart-viewer/types';
import {
  createMarkdownComponents,
  preprocessLatex,
  stripProseBullets,
  KATEX_OPTIONS,
} from '@/components/common/markdown-viewer';

interface Props {
  markdown: string;
  citations: readonly ArtifactCitation[];
  figures: readonly ArtifactFigure[];
}

/**
 * ★ 2026-04-30 (#64 图片仍闪烁): 把"#fig-id 占位 → FigureRenderer"包成 React.memo
 * 组件，外部父级 re-render（如 LeadJournal poll、events 流入引发的 view 重算）
 * 不会再让 figure 内部 next/Image 走 unmount → loading=true 的初始态，避免视觉闪烁。
 */
const StableFigureBlock = React.memo(
  function StableFigureBlock({
    figure,
    citation,
  }: {
    figure: ArtifactFigure;
    citation: ArtifactCitation | null;
  }) {
    return (
      <div className="my-4">
        <PublicFigureRenderer
          chart={toRenderableChart(figure)}
          showSource
          allowZoom
          evidenceInfo={citation ? toEvidence(citation) : null}
        />
      </div>
    );
  },
  (prev, next) =>
    prev.figure.id === next.figure.id &&
    prev.figure.imageUrl === next.figure.imageUrl &&
    prev.figure.title === next.figure.title &&
    prev.figure.caption === next.figure.caption &&
    (prev.citation?.uuid ?? null) === (next.citation?.uuid ?? null)
);

/**
 * 把 ArtifactCitation 适配为公共 CitationBadge 的 evidence shape
 */
function toEvidence(c: ArtifactCitation) {
  return {
    id: c.uuid || `cite-${c.index}`,
    title: c.title ?? null,
    url: c.url ?? null,
    snippet: c.snippet ?? null,
    domain: c.domain ?? null,
    sourceType: c.sourceType ?? null,
    credibilityScore: c.credibilityScore ?? null,
    publishedAt: c.publishedAt ?? null,
    accessedAt: c.accessedAt ?? null,
  };
}

/**
 * 把 ArtifactFigure 适配为公共 FigureRenderer 的 RenderableChart
 */
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
    data: undefined,
  };
}

/**
 * Markdown 渲染器（基于公共能力，agent-playground 层只做适配）：
 *   - createMarkdownComponents：KaTeX / Mermaid / 标题锚点 / hash 链接平滑跳转
 *   - CitationBadge：[N] 角标 hover 卡 + 跨面板跳 references
 *   - PublicFigureRenderer：![alt](#fig-id) 图占位符 → 图片/Recharts 通用渲染
 */
function ArtifactMarkdownInner({ markdown, citations, figures }: Props) {
  // ★ 2026-04-30 (#64): 全部稳定化 —— 父级 re-render（events 流入 / setNow 500ms tick）
  //   不再触发 ReactMarkdown 整树重建，<img>/figure 不再 unmount-remount。

  // 1. processText：拆分 [N] → 公共 CitationBadge（依赖 citations，引用稳定即稳定）
  const processText = useMemo(() => {
    return (text: string): React.ReactNode => {
      const parts: React.ReactNode[] = [];
      const re = /\[(\d+)\]/g;
      let lastIdx = 0;
      let m: RegExpExecArray | null;
      let key = 0;
      while ((m = re.exec(text)) !== null) {
        if (m.index > lastIdx) parts.push(text.slice(lastIdx, m.index));
        const num = parseInt(m[1], 10);
        const cite = citations.find((c) => c.index === num);
        if (cite) {
          parts.push(
            <CitationBadge
              key={`cite-${key++}-${num}`}
              index={num}
              evidence={toEvidence(cite)}
            />
          );
        } else {
          parts.push(
            <sup
              key={`cite-missing-${key++}-${num}`}
              className="mx-0.5 inline-block cursor-not-allowed rounded px-0.5 align-super text-[10px] text-gray-400"
              title="引用元数据缺失"
            >
              [{num}]
            </sup>
          );
        }
        lastIdx = re.lastIndex;
      }
      if (lastIdx < text.length) parts.push(text.slice(lastIdx));
      return parts.length > 0 ? parts : text;
    };
  }, [citations]);

  // 2. 公共 components（含 KaTeX / Mermaid / 标题锚点 / hash 链接 / 图片）
  const baseComponents = useMemo(
    () =>
      createMarkdownComponents(processText, {
        applyTextProcessingToHeadings: true,
        applyTextProcessingToBlockquote: true,
      }),
    [processText]
  );

  // 3. 覆盖 img：拦截 #fig-* 占位符 → StableFigureBlock（memo 化避免闪烁）
  const components = useMemo(
    () => ({
      ...baseComponents,
      img: ({ src, alt }: { src?: string; alt?: string }) => {
        if (src?.startsWith('#fig-')) {
          const figId = src.slice(1);
          const figure = figures.find((f) => f.id === figId);
          if (figure) {
            const cite =
              citations.find((c) => c.index === figure.evidenceCitationIndex) ??
              null;
            return (
              <StableFigureBlock
                key={figure.id}
                figure={figure}
                citation={cite}
              />
            );
          }
          return (
            <span className="my-2 block rounded border border-dashed border-amber-300 bg-amber-50 p-2 text-xs text-amber-700">
              [图占位 {figId} 未找到]
            </span>
          );
        }
        // 普通图片：交给公共 MarkdownImage
        return baseComponents.img({ src, alt });
      },
    }),
    [baseComponents, figures, citations]
  );

  // 与 TI 报告管线对齐：同样过 preprocessLatex + stripProseBullets + KaTeX
  const cleaned = useMemo(
    () => stripProseBullets(preprocessLatex(markdown)),
    [markdown]
  );

  // ★ TI 对齐：与 ChapterizedReportView preview / ReportEditor preview 完全相同的 prose 类
  //   不引入新的颜色 / 字号 / 间距，确保两条产品线视觉同款。
  return (
    <article className="prose prose-gray prose-strong:text-blue-600 dark:prose-strong:text-blue-400 prose-headings:font-semibold prose-h1:text-2xl prose-h2:text-xl prose-h3:text-lg prose-h4:text-base prose-h5:text-sm prose-h6:text-sm prose-p:my-2 prose-ul:my-2 prose-ol:my-2 prose-li:my-1 prose-a:text-blue-600 prose-a:no-underline hover:prose-a:underline prose-code:text-purple-600 prose-code:bg-purple-50 prose-code:px-1 prose-code:rounded max-w-none">
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkMath]}
        rehypePlugins={[[rehypeKatex, KATEX_OPTIONS]]}
        components={components as never}
      >
        {cleaned}
      </ReactMarkdown>
    </article>
  );
}

/**
 * ★ 2026-04-30 (#64): 用 React.memo 包一层。父级（page.tsx setNow 500ms）re-render
 * 时，只要 markdown / citations / figures 引用没变（已被 useMemo 稳定），
 * ArtifactMarkdown 内部不再重跑 ReactMarkdown 解析，<img> DOM 完全稳定不闪烁。
 */
export const ArtifactMarkdown = React.memo(
  ArtifactMarkdownInner,
  (prev, next) =>
    prev.markdown === next.markdown &&
    prev.citations === next.citations &&
    prev.figures === next.figures
);
