'use client';

import React, { useMemo } from 'react';
import { CitationLink } from './CitationLink';
import { parseCitations } from './citationParser';
import type { SourceReference, ParsedMessage } from './types';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

interface CitedContentProps {
  content: string;
  sources: SourceReference[];
  className?: string;
  // If true, render as markdown
  markdown?: boolean;
}

/**
 * Renders content with embedded citation links
 * Parses [1], [2], [1, 2] patterns and replaces with clickable links
 */
export function CitedContent({
  content,
  sources,
  className = '',
  markdown = false,
}: CitedContentProps) {
  const parsed = useMemo(() => {
    return parseCitations(content, { sources });
  }, [content, sources]);

  if (markdown) {
    return (
      <CitedMarkdown
        content={content}
        sources={sources}
        className={className}
      />
    );
  }

  return (
    <div className={className}>
      {parsed.segments.map((segment, index) => {
        if (segment.type === 'text') {
          return <span key={index}>{segment.content}</span>;
        }
        return (
          <CitationLink
            key={index}
            citation={segment.citation}
            className="mx-0.5"
          />
        );
      })}
    </div>
  );
}

/**
 * Renders markdown content with embedded citations
 */
// Annotation type for highlighting
interface Annotation {
  id: string;
  selectedText: string;
  color: 'yellow' | 'green' | 'blue' | 'pink' | 'purple';
}

interface CitedMarkdownProps {
  content: string;
  sources: SourceReference[];
  className?: string;
  /** Annotations for highlighting text */
  annotations?: Annotation[];
  /** Currently highlighted annotation ID (for navigation) */
  highlightedAnnotationId?: string | null;
}

export function CitedMarkdown({
  content,
  sources,
  className = '',
  annotations = [],
  highlightedAnnotationId,
}: CitedMarkdownProps) {
  // Pre-process content to replace citation patterns with placeholder markers
  // that won't be affected by markdown parsing
  // Supports: [1], [1, 2], CITE_GROUP_6_8
  const { processedContent, citationMap } = useMemo(() => {
    const map = new Map<
      string,
      { sourceIndex: number; sourceId: string; sourceTitle: string }
    >();
    let processed = content;

    // First, handle CITE_GROUP_x_y format (AI output without delimiters)
    // Convert to internal __CITE_GROUP_x_y__ marker format directly
    const citeGroupPattern = /CITE_GROUP_(\d+(?:_\d+)*)/g;
    processed = processed.replace(citeGroupPattern, (match, indicesStr) => {
      const indices = indicesStr.split('_').map((s: string) => parseInt(s, 10));
      // Store citation info
      for (const sourceIndex of indices) {
        const source = sources[sourceIndex - 1];
        if (source) {
          map.set(`__CITE_GROUP_${indices.join('_')}___${sourceIndex}`, {
            sourceIndex,
            sourceId: source.id,
            sourceTitle: source.title,
          });
        }
      }
      // Convert CITE_GROUP_6_8 to __CITE_GROUP_6_8__ marker format
      return `__CITE_GROUP_${indices.join('_')}__`;
    });

    // Now handle standard [1], [1, 2] patterns - convert to marker format in one pass
    const bracketPattern = /\[(\d+(?:\s*,\s*\d+)*)\]/g;
    processed = processed.replace(bracketPattern, (match, indicesStr) => {
      const indices = indicesStr
        .split(/\s*,\s*/)
        .map((s: string) => parseInt(s, 10));
      // Store citation info
      for (const sourceIndex of indices) {
        const source = sources[sourceIndex - 1];
        if (source) {
          map.set(`__CITE_GROUP_${indices.join('_')}___${sourceIndex}`, {
            sourceIndex,
            sourceId: source.id,
            sourceTitle: source.title,
          });
        }
      }
      // Convert [1, 2] to __CITE_GROUP_1_2__ marker format
      return `__CITE_GROUP_${indices.join('_')}__`;
    });

    return { processedContent: processed, citationMap: map };
  }, [content, sources]);

  // Custom component to render citation markers and annotation highlights
  // Override all common markdown elements to ensure citations/annotations are processed everywhere
  const components = useMemo(
    () => ({
      // Block elements
      p: ({ children, ...props }: any) => {
        return (
          <p {...props}>
            {processChildren(
              children,
              sources,
              annotations,
              highlightedAnnotationId
            )}
          </p>
        );
      },
      li: ({ children, ...props }: any) => {
        return (
          <li {...props}>
            {processChildren(
              children,
              sources,
              annotations,
              highlightedAnnotationId
            )}
          </li>
        );
      },
      td: ({ children, ...props }: any) => {
        return (
          <td {...props}>
            {processChildren(
              children,
              sources,
              annotations,
              highlightedAnnotationId
            )}
          </td>
        );
      },
      th: ({ children, ...props }: any) => {
        return (
          <th {...props}>
            {processChildren(
              children,
              sources,
              annotations,
              highlightedAnnotationId
            )}
          </th>
        );
      },
      blockquote: ({ children, ...props }: any) => {
        return (
          <blockquote {...props}>
            {processChildren(
              children,
              sources,
              annotations,
              highlightedAnnotationId
            )}
          </blockquote>
        );
      },
      // Headings
      h1: ({ children, ...props }: any) => {
        return (
          <h1 {...props}>
            {processChildren(
              children,
              sources,
              annotations,
              highlightedAnnotationId
            )}
          </h1>
        );
      },
      h2: ({ children, ...props }: any) => {
        return (
          <h2 {...props}>
            {processChildren(
              children,
              sources,
              annotations,
              highlightedAnnotationId
            )}
          </h2>
        );
      },
      h3: ({ children, ...props }: any) => {
        return (
          <h3 {...props}>
            {processChildren(
              children,
              sources,
              annotations,
              highlightedAnnotationId
            )}
          </h3>
        );
      },
      h4: ({ children, ...props }: any) => {
        return (
          <h4 {...props}>
            {processChildren(
              children,
              sources,
              annotations,
              highlightedAnnotationId
            )}
          </h4>
        );
      },
      h5: ({ children, ...props }: any) => {
        return (
          <h5 {...props}>
            {processChildren(
              children,
              sources,
              annotations,
              highlightedAnnotationId
            )}
          </h5>
        );
      },
      h6: ({ children, ...props }: any) => {
        return (
          <h6 {...props}>
            {processChildren(
              children,
              sources,
              annotations,
              highlightedAnnotationId
            )}
          </h6>
        );
      },
      // Inline elements
      strong: ({ children, ...props }: any) => {
        return (
          <strong {...props}>
            {processChildren(
              children,
              sources,
              annotations,
              highlightedAnnotationId
            )}
          </strong>
        );
      },
      em: ({ children, ...props }: any) => {
        return (
          <em {...props}>
            {processChildren(
              children,
              sources,
              annotations,
              highlightedAnnotationId
            )}
          </em>
        );
      },
      a: ({ children, ...props }: any) => {
        return (
          <a {...props}>
            {processChildren(
              children,
              sources,
              annotations,
              highlightedAnnotationId
            )}
          </a>
        );
      },
      span: ({ children, ...props }: any) => {
        return (
          <span {...props}>
            {processChildren(
              children,
              sources,
              annotations,
              highlightedAnnotationId
            )}
          </span>
        );
      },
      code: ({ children, className, ...props }: any) => {
        // Detect inline code: no language class and no newlines
        const codeString = String(children).replace(/\n$/, '');
        const hasLanguage = /language-(\w+)/.test(className || '');
        const hasNewlines = codeString.includes('\n');
        const isInline = !hasLanguage && !hasNewlines;

        // Don't process citations in code blocks
        if (!isInline) {
          return (
            <code className={className} {...props}>
              {children}
            </code>
          );
        }
        return (
          <code className={className} {...props}>
            {processChildren(
              children,
              sources,
              annotations,
              highlightedAnnotationId
            )}
          </code>
        );
      },
    }),
    [sources, annotations, highlightedAnnotationId]
  );

  return (
    <div
      className={`
        prose prose-sm prose-headings:font-semibold
        prose-headings:text-gray-900 prose-h1:text-lg
        prose-h1:mt-4 prose-h1:mb-2 prose-h2:text-base
        prose-h2:mt-3 prose-h2:mb-2 prose-h3:text-sm
        prose-h3:mt-2 prose-h3:mb-1 prose-p:text-gray-700
        prose-p:leading-relaxed prose-p:my-2 prose-ul:my-2
        prose-ul:pl-4 prose-ol:my-2
        prose-ol:pl-4 prose-li:my-1
        prose-li:text-gray-700 prose-strong:text-gray-900
        prose-strong:font-semibold prose-blockquote:border-l-purple-400
        prose-blockquote:bg-purple-50 prose-blockquote:py-1
        prose-blockquote:px-3 prose-blockquote:my-2 prose-blockquote:rounded-r
        prose-blockquote:text-gray-700 prose-code:text-purple-600
        prose-code:bg-purple-50 prose-code:px-1 prose-code:rounded max-w-none
        ${className}
      `}
    >
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
        {processedContent}
      </ReactMarkdown>
    </div>
  );
}

/**
 * Process children to replace citation markers with CitationLink components
 * and apply annotation highlights
 * Recursively processes nested React elements to handle citations/annotations in any context
 */
function processChildren(
  children: React.ReactNode,
  sources: SourceReference[],
  annotations: Annotation[] = [],
  highlightedAnnotationId?: string | null
): React.ReactNode {
  if (!children) return children;

  if (typeof children === 'string') {
    return processText(children, sources, annotations, highlightedAnnotationId);
  }

  if (typeof children === 'number') {
    return children;
  }

  if (Array.isArray(children)) {
    return children.map((child, index) => {
      if (typeof child === 'string') {
        return (
          <React.Fragment key={index}>
            {processText(child, sources, annotations, highlightedAnnotationId)}
          </React.Fragment>
        );
      }
      // Recursively process nested elements
      if (React.isValidElement(child)) {
        const childProps = child.props as { children?: React.ReactNode };
        return React.cloneElement(
          child as React.ReactElement<{ children?: React.ReactNode }>,
          { key: index },
          processChildren(
            childProps.children,
            sources,
            annotations,
            highlightedAnnotationId
          )
        );
      }
      return child;
    });
  }

  // Handle single React element - recursively process its children
  if (React.isValidElement(children)) {
    const childProps = children.props as { children?: React.ReactNode };
    return React.cloneElement(
      children as React.ReactElement<{ children?: React.ReactNode }>,
      {},
      processChildren(
        childProps.children,
        sources,
        annotations,
        highlightedAnnotationId
      )
    );
  }

  return children;
}

// Annotation color map for background highlights
const annotationColorMap: Record<string, string> = {
  yellow: 'bg-yellow-200',
  green: 'bg-green-200',
  blue: 'bg-blue-200',
  pink: 'bg-pink-200',
  purple: 'bg-purple-200',
};

/**
 * Process text to replace citation markers with CitationLink components
 * and apply annotation highlights
 * Supports multiple formats:
 * - [1], [2], [1, 2] - standard citation format
 * - [资料 1], [资料 1, 2] - Chinese "资料" format
 * - __CITE_GROUP_1_2__ - internal marker format
 * - CITE_GROUP_6_8 - AI output format (without delimiters)
 * - [temp-X-Y] - evidence ID format from research reports
 * - [uuid] - UUID format from older research reports
 */
function processText(
  text: string,
  sources: SourceReference[],
  annotations: Annotation[] = [],
  highlightedAnnotationId?: string | null
): React.ReactNode {
  // ★ 预处理：清理引用相关的孤立下划线
  // AI 有时会生成 [32]____[39] 或 [33]__[38] 或 [33] [35]__ 这样的格式
  let cleanedText = text
    .replace(/\]_+\[/g, '][') // 清理 ]____[ 任意数量下划线
    .replace(/\]_+\s*\[/g, '][') // 清理 ]____ [ 带空格的情况
    .replace(/\]\s*_+\[/g, '][') // 清理 ] ____[ 带空格的情况
    .replace(/(\[\d+(?:\s*,\s*\d+)*\])\s*_+(?=\s|[。.!?！？,，;；]|$)/g, '$1') // 清理引用后的孤立下划线 [33]__
    .replace(/_+\s*([。.!?！？])/g, '$1') // 清理标点前的孤立下划线
    .replace(/_+$/g, ''); // 清理行尾的孤立下划线

  // Build a map from evidence IDs to source indices for UUID and temp-X-Y formats
  const evidenceIdMap = new Map<string, number>();
  sources.forEach((source, index) => {
    evidenceIdMap.set(source.id, index + 1);
  });

  // Match multiple citation formats:
  // 1. __CITE_GROUP_1_2__ - internal marker with delimiters
  // 2. CITE_GROUP_6_8 - AI output format without delimiters
  // 3. [资料 1] or [资料 1, 2] - Chinese reference format
  // 4. [1] or [1, 2] - standard citation format
  // 5. [temp-X-Y] - evidence ID format
  // 6. [uuid] - UUID format (xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx)
  const pattern =
    /(__CITE_GROUP_[\d_]+__|CITE_GROUP_\d+(?:_\d+)*|\[资料\s*(\d+(?:\s*[,、]\s*\d+)*)\]|\[(temp-\d+-\d+)\]|\[([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\]|\[(\d+(?:\s*,\s*\d+)*)\])/gi;
  const parts: React.ReactNode[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  pattern.lastIndex = 0;

  while ((match = pattern.exec(cleanedText)) !== null) {
    // Add text before match
    if (match.index > lastIndex) {
      parts.push(cleanedText.slice(lastIndex, match.index));
    }

    // Parse indices based on format
    let indices: number[] = [];
    let evidenceId: string | null = null;

    if (match[0].startsWith('__CITE_GROUP_')) {
      // Extract indices from __CITE_GROUP_1_2__ marker
      const indicesStr = match[0]
        .replace('__CITE_GROUP_', '')
        .replace('__', '');
      indices = indicesStr.split('_').map((s) => parseInt(s, 10));
    } else if (match[0].startsWith('CITE_GROUP_')) {
      // Extract indices from CITE_GROUP_6_8 format (AI output)
      const indicesStr = match[0].replace('CITE_GROUP_', '');
      indices = indicesStr.split('_').map((s) => parseInt(s, 10));
    } else if (match[2]) {
      // [资料 1] or [资料 1, 2] format - Chinese reference style
      // Split by comma (,) or Chinese comma (、)
      indices = match[2].split(/\s*[,、]\s*/).map((s) => parseInt(s, 10));
    } else if (match[3]) {
      // [temp-X-Y] format - evidence ID from research reports
      evidenceId = match[3];
      const sourceIndex = evidenceIdMap.get(evidenceId);
      if (sourceIndex) {
        indices = [sourceIndex];
      }
    } else if (match[4]) {
      // [uuid] format - UUID evidence ID from older research reports
      evidenceId = match[4];
      const sourceIndex = evidenceIdMap.get(evidenceId);
      if (sourceIndex) {
        indices = [sourceIndex];
      }
    } else if (match[5]) {
      // Original [1] or [1, 2] format
      indices = match[5].split(/\s*,\s*/).map((s) => parseInt(s, 10));
    } else {
      // Fallback - should not happen
      continue;
    }

    // Extract surrounding context for quote-based highlighting
    // Get the sentence or phrase around the citation for better matching
    const contextStart = Math.max(0, match.index - 100);
    const contextEnd = Math.min(
      cleanedText.length,
      match.index + match[0].length + 100
    );
    let surroundingContext = cleanedText.slice(contextStart, contextEnd);

    // Clean the context - remove citation markers and trim to sentence boundaries
    surroundingContext = surroundingContext
      .replace(/\[[\d,\s]+\]/g, '') // Remove [1], [1, 2] patterns
      .replace(/\[资料\s*[\d,、\s]+\]/g, '') // Remove Chinese patterns
      .replace(/__CITE_GROUP_[\d_]+__/g, '') // Remove internal markers
      .replace(/CITE_GROUP_\d+(?:_\d+)*/g, '') // Remove AI markers
      .replace(/\[temp-\d+-\d+\]/g, '') // Remove evidence ID patterns
      .replace(
        /\[[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\]/gi,
        ''
      ) // Remove UUID patterns
      .trim();

    // Try to extract a meaningful phrase (between punctuation)
    const sentenceMatch = surroundingContext.match(/[^。！？.!?]*[^。！？.!?]/);
    const quote = sentenceMatch
      ? sentenceMatch[0].trim()
      : surroundingContext.slice(0, 80);

    // Create citation links
    for (let i = 0; i < indices.length; i++) {
      const sourceIndex = indices[i];
      const source = sources[sourceIndex - 1];
      if (source) {
        parts.push(
          <CitationLink
            key={`${match.index}-${sourceIndex}`}
            citation={{
              id: `cite-${match.index}-${sourceIndex}`,
              sourceIndex,
              sourceId: source.id,
              sourceTitle: source.title,
              quote: quote.length > 10 ? quote : undefined, // Only use if meaningful
            }}
            className="mx-0.5"
          />
        );
      }
    }

    lastIndex = match.index + match[0].length;
  }

  // Add remaining text
  if (lastIndex < cleanedText.length) {
    parts.push(cleanedText.slice(lastIndex));
  }

  // ★ Apply annotation highlights to text parts
  if (annotations.length > 0) {
    const annotatedParts = parts.map((part, partIndex) => {
      if (typeof part !== 'string') return part;
      return applyAnnotations(
        part,
        annotations,
        highlightedAnnotationId,
        partIndex
      );
    });
    return annotatedParts.length === 1 ? annotatedParts[0] : annotatedParts;
  }

  return parts.length === 1 ? parts[0] : parts;
}

/**
 * Apply annotation highlights to a text string
 */
function applyAnnotations(
  text: string,
  annotations: Annotation[],
  highlightedAnnotationId?: string | null,
  keyPrefix: number = 0
): React.ReactNode {
  if (!text || annotations.length === 0) return text;

  // Find all annotation matches in the text
  const matches: {
    start: number;
    end: number;
    annotation: Annotation;
  }[] = [];

  annotations.forEach((annotation) => {
    // Find all occurrences of the selected text
    let searchStart = 0;
    while (searchStart < text.length) {
      const index = text.indexOf(annotation.selectedText, searchStart);
      if (index === -1) break;

      matches.push({
        start: index,
        end: index + annotation.selectedText.length,
        annotation,
      });
      searchStart = index + 1;
    }
  });

  if (matches.length === 0) return text;

  // Sort by start position
  matches.sort((a, b) => a.start - b.start);

  // Build result with highlighted spans
  const result: React.ReactNode[] = [];
  let lastEnd = 0;

  matches.forEach((match, index) => {
    // Add text before this match
    if (match.start > lastEnd) {
      result.push(text.slice(lastEnd, match.start));
    }

    // Skip overlapping matches
    if (match.start < lastEnd) return;

    const isHighlighted = match.annotation.id === highlightedAnnotationId;
    const colorClass =
      annotationColorMap[match.annotation.color] || 'bg-yellow-200';

    result.push(
      <mark
        key={`ann-${keyPrefix}-${match.annotation.id}-${index}`}
        data-annotation-id={match.annotation.id}
        className={`${colorClass} ${isHighlighted ? 'ring-2 ring-blue-500 ring-offset-1' : ''} cursor-pointer rounded px-0.5 transition-all`}
        title="点击查看批注"
      >
        {text.slice(match.start, match.end)}
      </mark>
    );

    lastEnd = match.end;
  });

  // Add remaining text
  if (lastEnd < text.length) {
    result.push(text.slice(lastEnd));
  }

  return result.length === 1 ? result[0] : result;
}

/**
 * Inline citation that can be used anywhere
 */
interface InlineCitationProps {
  sourceIndex: number;
  sources: SourceReference[];
}

export function InlineCitation({ sourceIndex, sources }: InlineCitationProps) {
  const source = sources[sourceIndex - 1];
  if (!source) return null;

  return (
    <CitationLink
      citation={{
        id: `inline-cite-${sourceIndex}`,
        sourceIndex,
        sourceId: source.id,
        sourceTitle: source.title,
      }}
    />
  );
}
