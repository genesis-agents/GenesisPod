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
  const { processedContent, citationMap } = useMemo(() => {
    const map = new Map<
      string,
      { sourceIndex: number; sourceId: string; sourceTitle: string }
    >();
    const pattern = /\[(\d+(?:\s*,\s*\d+)*)\]/g;
    let processed = content;
    let match: RegExpExecArray | null;

    // Reset pattern
    pattern.lastIndex = 0;

    while ((match = pattern.exec(content)) !== null) {
      const indicesStr = match[1];
      const indices = indicesStr.split(/\s*,\s*/).map((s) => parseInt(s, 10));

      // Create a unique marker for each citation group
      const marker = `__CITE_${match.index}__`;

      // Store citation info
      for (const sourceIndex of indices) {
        const source = sources[sourceIndex - 1];
        if (source) {
          map.set(`${marker}_${sourceIndex}`, {
            sourceIndex,
            sourceId: source.id,
            sourceTitle: source.title,
          });
        }
      }

      // Replace with marker that includes all indices
      const markerWithIndices = `__CITE_GROUP_${indices.join('_')}__`;
      map.set(markerWithIndices, {
        sourceIndex: indices[0],
        sourceId: sources[indices[0] - 1]?.id || '',
        sourceTitle: sources[indices[0] - 1]?.title || '',
      });

      processed = processed.replace(match[0], markerWithIndices);
    }

    return { processedContent: processed, citationMap: map };
  }, [content, sources]);

  // Custom component to render citation markers
  const components = useMemo(
    () => ({
      // Override text rendering to handle citation markers
      p: ({ children, ...props }: any) => {
        return <p {...props}>{processChildren(children, sources)}</p>;
      },
      li: ({ children, ...props }: any) => {
        return <li {...props}>{processChildren(children, sources)}</li>;
      },
      td: ({ children, ...props }: any) => {
        return <td {...props}>{processChildren(children, sources)}</td>;
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
 */
function processChildren(
  children: React.ReactNode,
  sources: SourceReference[]
): React.ReactNode {
  if (!children) return children;

  if (typeof children === 'string') {
    return processText(children, sources);
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
      return child;
    });
  }

  return children;
}

/**
 * Process text to replace citation markers with CitationLink components
 */
function processText(
  text: string,
  sources: SourceReference[]
): React.ReactNode {
  // Match both original [1] pattern and __CITE_GROUP_1_2__ markers
  const pattern = /(__CITE_GROUP_[\d_]+__|\[(\d+(?:\s*,\s*\d+)*)\])/g;
  const parts: React.ReactNode[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  pattern.lastIndex = 0;

  while ((match = pattern.exec(text)) !== null) {
    // Add text before match
    if (match.index > lastIndex) {
      parts.push(text.slice(lastIndex, match.index));
    }

    // Parse indices
    let indices: number[];
    if (match[0].startsWith('__CITE_GROUP_')) {
      // Extract indices from marker
      const indicesStr = match[0]
        .replace('__CITE_GROUP_', '')
        .replace('__', '');
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
