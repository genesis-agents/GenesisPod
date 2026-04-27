'use client';

import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type {
  ArtifactCitation,
  ArtifactFigure,
} from '@/lib/agent-playground/report-artifact.types';
import { CitationTooltip } from './CitationTooltip';
import { FigureRenderer } from './FigureRenderer';

interface Props {
  markdown: string;
  citations: ArtifactCitation[];
  figures: ArtifactFigure[];
  onCitationClick?: (index: number) => void;
}

/**
 * Markdown 渲染器（拦截 [N] 角标 + ![alt](#fig-id) 图占位符）
 *
 * - 角标：[N] 文本 → CitationTooltip（hover 卡 + 点击溯源）
 * - 图：src 以 #fig- 开头的 <img> → FigureRenderer 查 figures 表渲染
 */
export function ArtifactMarkdown({
  markdown,
  citations,
  figures,
  onCitationClick,
}: Props) {
  // 正则切分包含 [N] 的文本节点 → 升级为 CitationTooltip
  const renderTextWithCitations = (text: string): React.ReactNode => {
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
    return parts;
  };

  const components = {
    a: ({ href, children }: { href?: string; children?: React.ReactNode }) => {
      const safe = href && /^https?:\/\//i.test(href) ? href : undefined;
      return safe ? (
        <a
          href={safe}
          target="_blank"
          rel="noopener noreferrer"
          className="break-words text-violet-600 underline decoration-violet-300 underline-offset-2 hover:text-violet-700"
        >
          {children}
        </a>
      ) : (
        <span className="text-gray-500">{children}</span>
      );
    },
    img: ({ src, alt }: { src?: string; alt?: string }) => {
      // ★ 图占位符拦截：src 以 #fig- 开头 → 查 figures 表
      if (src?.startsWith('#fig-')) {
        const figId = src.slice(1); // strip leading #
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
        // figure 未找到 → 占位提示
        return (
          <span className="my-2 block rounded border border-dashed border-amber-300 bg-amber-50 p-2 text-xs text-amber-700">
            [图占位 {figId} 未找到]
          </span>
        );
      }
      // 普通外链图片直接渲染（极少出现，因为后端只用 #fig- 占位）
      return src ? (
        <img src={src} alt={alt ?? ''} className="my-3 rounded" />
      ) : null;
    },
    p: ({ children }: { children?: React.ReactNode }) => (
      <p className="mb-3 leading-7 text-gray-700">
        {childrenWithCitations(children, renderTextWithCitations)}
      </p>
    ),
    li: ({ children }: { children?: React.ReactNode }) => (
      <li>{childrenWithCitations(children, renderTextWithCitations)}</li>
    ),
    strong: ({ children }: { children?: React.ReactNode }) => (
      <strong className="font-semibold text-gray-900">
        {childrenWithCitations(children, renderTextWithCitations)}
      </strong>
    ),
    h1: ({ children }: { children?: React.ReactNode }) => (
      <h1 className="mb-3 mt-5 text-xl font-bold text-gray-900">{children}</h1>
    ),
    h2: ({ children, id }: { children?: React.ReactNode; id?: string }) => {
      const text = typeof children === 'string' ? children : '';
      const anchor =
        id ??
        text
          .toLowerCase()
          .replace(/[^\w一-龥]+/g, '-')
          .replace(/^-+|-+$/g, '')
          .slice(0, 60);
      return (
        <h2
          id={anchor}
          className="mb-2 mt-6 scroll-mt-4 text-lg font-semibold text-gray-900"
        >
          {children}
        </h2>
      );
    },
    h3: ({ children }: { children?: React.ReactNode }) => {
      const text = typeof children === 'string' ? children : '';
      const anchor = text
        .toLowerCase()
        .replace(/[^\w一-龥]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 60);
      return (
        <h3
          id={anchor}
          className="mb-2 mt-4 scroll-mt-4 text-base font-medium text-gray-900"
        >
          {children}
        </h3>
      );
    },
    blockquote: ({ children }: { children?: React.ReactNode }) => (
      <blockquote className="my-3 border-l-4 border-violet-200 bg-violet-50/30 px-4 py-2 text-gray-700">
        {children}
      </blockquote>
    ),
    code: ({ children }: { children?: React.ReactNode }) => (
      <code className="font-mono rounded bg-gray-100 px-1.5 py-0.5 text-[12px] text-gray-800">
        {children}
      </code>
    ),
    ul: ({ children }: { children?: React.ReactNode }) => (
      <ul className="mb-3 ml-5 list-disc space-y-1 text-gray-700">
        {children}
      </ul>
    ),
    ol: ({ children }: { children?: React.ReactNode }) => (
      <ol className="mb-3 ml-5 list-decimal space-y-1 text-gray-700">
        {children}
      </ol>
    ),
  };

  return (
    <div className="text-sm">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={components as never}
      >
        {markdown}
      </ReactMarkdown>
    </div>
  );
}

/** 递归升级文本节点（不破坏 ReactMarkdown 嵌套结构） */
function childrenWithCitations(
  children: React.ReactNode,
  upgrade: (s: string) => React.ReactNode
): React.ReactNode {
  if (typeof children === 'string') return upgrade(children);
  if (Array.isArray(children)) {
    return children.map((c, i) =>
      typeof c === 'string' ? <span key={i}>{upgrade(c)}</span> : c
    );
  }
  return children;
}
