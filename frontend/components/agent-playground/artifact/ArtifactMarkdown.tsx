'use client';

import React, { useMemo } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import rehypeSanitize from 'rehype-sanitize';
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
// ★ PR-A6 (2026-05-07): rehype-sanitize + KaTeX-aware schema
//   防御 LLM 产出的 markdown 含 <script> / onerror / onclick 等 XSS 向量；
//   KaTeX 渲染所需的 <math>/<semantics>/<mrow>... 元素由 katexAwareSchema 显式放行。
import { katexAwareSchema } from './artifact-markdown.utils';

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
  // 4. 覆盖 h2：给"维度" H2（非 supplementary 标题）自动加 N. 编号
  //    （后端 markdown 不带前缀，前端按渲染顺序自动加，避免破坏 buildSectionTree
  //    的 dim name 匹配）。
  const components = useMemo(() => {
    // ★ 2026-05-07 维度编号（学 TI hierarchical numbering）：
    //   不依赖 sections 元数据，直接按 H2 标题文本判断 supplementary。
    //   维度 H2 → "1. 标题" / "2. 标题"；supplementary H2 不加编号。
    const SUPPLEMENTARY_H2 = new Set([
      // 中文 supplementary
      '执行摘要',
      '前言',
      '目录',
      '跨维度分析',
      '风险评估',
      '战略建议',
      '结论',
      '参考文献',
      '参考资料',
      // 英文 supplementary
      'executive summary',
      'preface',
      'table of contents',
      'cross-dimension analysis',
      'risk assessment',
      'strategic recommendations',
      'conclusion',
      'references',
    ]);
    const isSupplementaryH2 = (text: string): boolean => {
      const t = text.trim().toLowerCase();
      for (const s of SUPPLEMENTARY_H2) {
        if (t === s.toLowerCase()) return true;
        if (t.startsWith(s.toLowerCase())) return true;
      }
      return false;
    };
    // closure-scoped counter（同一次渲染共享）
    let dimOrdinal = 0;
    let lastSeenH2: string | null = null;

    return {
      ...baseComponents,
      h2: ({
        children,
        ...props
      }: React.HTMLAttributes<HTMLHeadingElement> & {
        children?: React.ReactNode;
      }) => {
        // 提取纯文本判断 supplementary
        const text =
          typeof children === 'string'
            ? children
            : Array.isArray(children)
              ? children.map((c) => (typeof c === 'string' ? c : '')).join('')
              : '';
        // 同一 H2 在 React 渲染过程中可能被多次调用（Reconciler、StrictMode）
        // 用 lastSeenH2 dedupe
        if (text !== lastSeenH2) {
          lastSeenH2 = text;
          if (!isSupplementaryH2(text)) {
            dimOrdinal++;
          }
        }
        const isDim = !isSupplementaryH2(text);
        const ordinalForRender = isDim ? dimOrdinal : null;
        // 委托公共 H2 渲染（保留 anchor / 滚动等行为）
        const delegatedH2 = baseComponents.h2 as (
          props: React.HTMLAttributes<HTMLHeadingElement> & {
            children?: React.ReactNode;
          }
        ) => React.ReactElement;
        const rendered = delegatedH2({
          ...props,
          children: ordinalForRender
            ? [`${ordinalForRender}. `, children]
            : children,
        });
        return rendered;
      },
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
    };
  }, [baseComponents, figures, citations]);

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
        // ★ PR-A6 R2 共识 P0 (2026-05-07): rehypeSanitize 必须放在 rehypeKatex
        //   之后（rehype-sanitize 官方 README："put it last in the list"）。
        //   pipeline 是串行变换：先跑 rehypeKatex 把 $...$ 渲染成 MathML/SVG
        //   节点，再由 rehypeSanitize 按 katexAwareSchema 白名单过滤
        //   KaTeX 输出 + 原始 markdown，让两者都受 sanitize 保护。
        //   反过来（sanitize 在前）会让 KaTeX 后续输出的 SVG path / svg 节点
        //   完全绕过 sanitize（一旦 KaTeX 有 CVE 漏洞 → 直接 XSS 落地）。
        rehypePlugins={[
          [rehypeKatex, KATEX_OPTIONS],
          [rehypeSanitize, katexAwareSchema],
        ]}
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
