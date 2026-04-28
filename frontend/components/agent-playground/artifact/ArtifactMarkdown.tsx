'use client';

import React from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type {
  ArtifactCitation,
  ArtifactFigure,
} from '@/lib/agent-playground/report-artifact.types';
import { CitationTooltip } from './CitationTooltip';
import { FigureRenderer } from './FigureRenderer';
import { createMarkdownComponents } from '@/lib/markdown/createMarkdownComponents';

interface Props {
  markdown: string;
  citations: ArtifactCitation[];
  figures: ArtifactFigure[];
  onCitationClick?: (index: number) => void;
}

/**
 * Markdown 渲染器（基于公共 createMarkdownComponents，叠加：
 *   - [N] 角标 → CitationTooltip（hover 卡 + 点击跨面板跳转）
 *   - ![alt](#fig-id) 图占位符 → FigureRenderer
 *
 * 公共 createMarkdownComponents 已含 KaTeX / Mermaid / 标题锚点 / hash 链接平滑跳转，
 * 这里只在它的基础上做 [N] / 图占位的拦截。
 */
export function ArtifactMarkdown({
  markdown,
  citations,
  figures,
  onCitationClick,
}: Props) {
  // 1. processText：拆分 [N] → CitationTooltip
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
      parts.push(
        <CitationTooltip
          key={`cite-${key++}-${num}`}
          index={num}
          citation={cite}
          onCitationClick={onCitationClick}
        />
      );
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

  // 3. 覆盖 img：拦截 #fig-* 占位符 → FigureRenderer
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
            <FigureRenderer
              figure={figure}
              citationIndex={figure.evidenceCitationIndex}
              citationUrl={cite?.url}
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

  return (
    <div className="prose prose-sm max-w-none text-sm">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={components as never}
      >
        {markdown}
      </ReactMarkdown>
    </div>
  );
}
