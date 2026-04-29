'use client';

import React from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import rehypeRaw from 'rehype-raw';
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
 * 把 ArtifactCitation 适配为公共 CitationBadge 的 evidence shape
 */
function toEvidence(c: ArtifactCitation) {
  return {
    id: c.uuid || `cite-${c.index}`,
    title: c.title ?? null,
    url: c.url ?? null,
    snippet: c.snippet ?? null,
    domain: c.domain ?? null,
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
export function ArtifactMarkdown({ markdown, citations, figures }: Props) {
  // 1. processText：拆分 [N] → 公共 CitationBadge
  const processText = (text: string): React.ReactNode => {
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

  // 2. 公共 components（含 KaTeX / Mermaid / 标题锚点 / hash 链接 / 图片）
  const baseComponents = createMarkdownComponents(processText, {
    applyTextProcessingToHeadings: true,
    applyTextProcessingToBlockquote: true,
  });

  // 3. 覆盖 img：拦截 #fig-* 占位符 → 公共 FigureRenderer
  const components = {
    ...baseComponents,
    img: ({ src, alt }: { src?: string; alt?: string }) => {
      if (src?.startsWith('#fig-')) {
        const figId = src.slice(1);
        const figure = figures.find((f) => f.id === figId);
        if (figure) {
          const cite = citations.find(
            (c) => c.index === figure.evidenceCitationIndex
          );
          return (
            <div className="my-4">
              <PublicFigureRenderer
                chart={toRenderableChart(figure)}
                showSource
                allowZoom
                evidenceInfo={cite ? toEvidence(cite) : null}
              />
            </div>
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
  };

  // 与 TI 报告管线对齐：同样过 preprocessLatex + stripProseBullets + KaTeX
  const cleaned = stripProseBullets(preprocessLatex(markdown));

  return (
    <article
      className={[
        'prose prose-gray max-w-none',
        // 标题层级（参考 TI ReportEditor + AI Writing 长文）
        'prose-headings:font-semibold prose-headings:tracking-tight',
        'prose-h1:mb-4 prose-h1:mt-0 prose-h1:text-3xl prose-h1:leading-tight',
        'prose-h2:mb-3 prose-h2:mt-8 prose-h2:text-2xl prose-h2:leading-snug prose-h2:border-b prose-h2:border-gray-200 prose-h2:pb-2',
        'prose-h3:mb-2 prose-h3:mt-6 prose-h3:text-xl prose-h3:leading-snug',
        'prose-h4:mb-1.5 prose-h4:mt-5 prose-h4:text-lg',
        // 段落（增大行高 + 中文友好的可读密度）
        'prose-p:my-3 prose-p:leading-[1.85] prose-p:text-[15px] prose-p:text-gray-800',
        // 重点（TI 风格：加粗用品牌蓝突出）
        'prose-strong:font-semibold prose-strong:text-violet-700',
        // 列表
        'prose-ul:my-3 prose-ul:pl-6 prose-ol:my-3 prose-ol:pl-6',
        'prose-li:my-1 prose-li:text-[15px] prose-li:leading-[1.8]',
        // blockquote（章节首段「核心判断」要醒目）
        'prose-blockquote:my-4 prose-blockquote:rounded-r-lg prose-blockquote:border-l-4 prose-blockquote:border-violet-400 prose-blockquote:bg-violet-50/60 prose-blockquote:py-1.5 prose-blockquote:px-4 prose-blockquote:not-italic prose-blockquote:text-gray-800',
        // 链接
        'prose-a:text-violet-600 prose-a:no-underline hover:prose-a:underline',
        // 行内 code / 表格
        'prose-code:rounded prose-code:bg-gray-100 prose-code:px-1 prose-code:py-0.5 prose-code:text-[13px] prose-code:text-gray-800 prose-code:before:content-[""] prose-code:after:content-[""]',
        'prose-table:my-4 prose-table:border-collapse',
        'prose-th:border prose-th:border-gray-200 prose-th:bg-gray-50 prose-th:px-3 prose-th:py-2 prose-th:text-left prose-th:text-sm prose-th:font-semibold prose-th:text-gray-700',
        'prose-td:border prose-td:border-gray-200 prose-td:px-3 prose-td:py-2 prose-td:text-sm prose-td:text-gray-700',
      ].join(' ')}
    >
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkMath]}
        rehypePlugins={[rehypeRaw, [rehypeKatex, KATEX_OPTIONS]]}
        components={components as never}
      >
        {cleaned}
      </ReactMarkdown>
    </article>
  );
}
