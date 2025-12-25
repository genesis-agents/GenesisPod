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
interface CitedMarkdownProps {
  content: string;
  sources: SourceReference[];
  className?: string;
}

export function CitedMarkdown({
  content,
  sources,
  className = '',
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

  // Custom component to render citation markers
  // Override all common markdown elements to ensure citations are processed everywhere
  const components = useMemo(
    () => ({
      // Block elements
      p: ({ children, ...props }: any) => {
        return <p {...props}>{processChildren(children, sources)}</p>;
      },
      li: ({ children, ...props }: any) => {
        return <li {...props}>{processChildren(children, sources)}</li>;
      },
      td: ({ children, ...props }: any) => {
        return <td {...props}>{processChildren(children, sources)}</td>;
      },
      th: ({ children, ...props }: any) => {
        return <th {...props}>{processChildren(children, sources)}</th>;
      },
      blockquote: ({ children, ...props }: any) => {
        return (
          <blockquote {...props}>
            {processChildren(children, sources)}
          </blockquote>
        );
      },
      // Headings
      h1: ({ children, ...props }: any) => {
        return <h1 {...props}>{processChildren(children, sources)}</h1>;
      },
      h2: ({ children, ...props }: any) => {
        return <h2 {...props}>{processChildren(children, sources)}</h2>;
      },
      h3: ({ children, ...props }: any) => {
        return <h3 {...props}>{processChildren(children, sources)}</h3>;
      },
      h4: ({ children, ...props }: any) => {
        return <h4 {...props}>{processChildren(children, sources)}</h4>;
      },
      h5: ({ children, ...props }: any) => {
        return <h5 {...props}>{processChildren(children, sources)}</h5>;
      },
      h6: ({ children, ...props }: any) => {
        return <h6 {...props}>{processChildren(children, sources)}</h6>;
      },
      // Inline elements
      strong: ({ children, ...props }: any) => {
        return <strong {...props}>{processChildren(children, sources)}</strong>;
      },
      em: ({ children, ...props }: any) => {
        return <em {...props}>{processChildren(children, sources)}</em>;
      },
      a: ({ children, ...props }: any) => {
        return <a {...props}>{processChildren(children, sources)}</a>;
      },
      span: ({ children, ...props }: any) => {
        return <span {...props}>{processChildren(children, sources)}</span>;
      },
      code: ({ children, inline, ...props }: any) => {
        // Don't process citations in code blocks
        if (!inline) {
          return <code {...props}>{children}</code>;
        }
        return <code {...props}>{processChildren(children, sources)}</code>;
      },
    }),
    [sources]
  );

  return (
    <div className={`prose prose-sm max-w-none ${className}`}>
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
        {processedContent}
      </ReactMarkdown>
    </div>
  );
}

/**
 * Process children to replace citation markers with CitationLink components
 * Recursively processes nested React elements to handle citations in any context
 */
function processChildren(
  children: React.ReactNode,
  sources: SourceReference[]
): React.ReactNode {
  if (!children) return children;

  if (typeof children === 'string') {
    return processText(children, sources);
  }

  if (typeof children === 'number') {
    return children;
  }

  if (Array.isArray(children)) {
    return children.map((child, index) => {
      if (typeof child === 'string') {
        return (
          <React.Fragment key={index}>
            {processText(child, sources)}
          </React.Fragment>
        );
      }
      // Recursively process nested elements
      if (React.isValidElement(child)) {
        const childProps = child.props as { children?: React.ReactNode };
        return React.cloneElement(
          child as React.ReactElement<{ children?: React.ReactNode }>,
          { key: index },
          processChildren(childProps.children, sources)
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
      processChildren(childProps.children, sources)
    );
  }

  return children;
}

/**
 * Process text to replace citation markers with CitationLink components
 * Supports multiple formats:
 * - [1], [2], [1, 2] - standard citation format
 * - __CITE_GROUP_1_2__ - internal marker format
 * - CITE_GROUP_6_8 - AI output format (without delimiters)
 */
function processText(
  text: string,
  sources: SourceReference[]
): React.ReactNode {
  // Match multiple citation formats:
  // 1. __CITE_GROUP_1_2__ - internal marker with delimiters
  // 2. CITE_GROUP_6_8 - AI output format without delimiters
  // 3. [1] or [1, 2] - standard citation format
  const pattern =
    /(__CITE_GROUP_[\d_]+__|CITE_GROUP_\d+(?:_\d+)*|\[(\d+(?:\s*,\s*\d+)*)\])/g;
  const parts: React.ReactNode[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  pattern.lastIndex = 0;

  while ((match = pattern.exec(text)) !== null) {
    // Add text before match
    if (match.index > lastIndex) {
      parts.push(text.slice(lastIndex, match.index));
    }

    // Parse indices based on format
    let indices: number[];
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
    } else {
      // Original [1] or [1, 2] format
      indices = match[2].split(/\s*,\s*/).map((s) => parseInt(s, 10));
    }

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
            }}
            className="mx-0.5"
          />
        );
      }
    }

    lastIndex = match.index + match[0].length;
  }

  // Add remaining text
  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex));
  }

  return parts.length === 1 ? parts[0] : parts;
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
