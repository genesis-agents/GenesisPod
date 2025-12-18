'use client';

import React, { useState } from 'react';
import { ExternalLink } from 'lucide-react';
import type { Citation } from './types';
import { useCitationOptional } from './CitationContext';

interface CitationLinkProps {
  citation: Citation;
  className?: string;
}

/**
 * Clickable citation link that highlights the source when clicked
 * Displays as [1], [2], etc. with hover tooltip
 */
export function CitationLink({ citation, className = '' }: CitationLinkProps) {
  const citationContext = useCitationOptional();
  const [showTooltip, setShowTooltip] = useState(false);

  const handleClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    if (citationContext) {
      // Set highlight and scroll to source
      citationContext.setHighlightedSource({
        sourceId: citation.sourceId,
        quote: citation.quote,
        startOffset: citation.startOffset,
        endOffset: citation.endOffset,
      });
      citationContext.scrollToSource(citation.sourceId);
    }
  };

  const isHighlighted =
    citationContext?.highlightedSource?.sourceId === citation.sourceId;

  return (
    <span className="relative inline-block">
      <button
        onClick={handleClick}
        onMouseEnter={() => setShowTooltip(true)}
        onMouseLeave={() => setShowTooltip(false)}
        className={`
          inline-flex min-w-[1.5rem] items-center
          justify-center rounded px-1
          py-0.5 text-xs
          font-medium
          transition-all duration-200
          ${
            isHighlighted
              ? 'bg-purple-600 text-white'
              : 'bg-purple-100 text-purple-700 hover:bg-purple-200'
          }
          cursor-pointer
          ${className}
        `}
        title={`Source: ${citation.sourceTitle}`}
      >
        {citation.sourceIndex}
      </button>

      {/* Tooltip */}
      {showTooltip && (
        <div
          className="
            absolute bottom-full left-1/2 z-50 mb-2 max-w-xs
            -translate-x-1/2 whitespace-normal rounded-lg
            bg-gray-900 px-3 py-2 text-xs text-white
            shadow-lg
          "
        >
          <div className="mb-1 flex items-center gap-1 font-medium">
            <span className="text-purple-300">[{citation.sourceIndex}]</span>
            <span className="truncate">{citation.sourceTitle}</span>
          </div>
          {citation.quote && (
            <p className="line-clamp-3 text-xs italic text-gray-300">
              "{citation.quote}"
            </p>
          )}
          <div className="mt-1 flex items-center gap-1 text-[10px] text-gray-400">
            <ExternalLink className="h-3 w-3" />
            Click to view source
          </div>
          {/* Tooltip arrow */}
          <div className="absolute left-1/2 top-full -mt-1 -translate-x-1/2">
            <div className="h-2 w-2 rotate-45 bg-gray-900" />
          </div>
        </div>
      )}
    </span>
  );
}

/**
 * Multiple citation links grouped together
 * Displays as [1, 2, 3] style
 */
interface CitationGroupProps {
  citations: Citation[];
  className?: string;
}

export function CitationGroup({
  citations,
  className = '',
}: CitationGroupProps) {
  if (citations.length === 0) return null;

  if (citations.length === 1) {
    return <CitationLink citation={citations[0]} className={className} />;
  }

  return (
    <span className={`inline-flex items-center gap-0.5 ${className}`}>
      <span className="text-purple-600">[</span>
      {citations.map((citation, index) => (
        <span key={citation.id} className="inline-flex items-center">
          <CitationLink citation={citation} />
          {index < citations.length - 1 && (
            <span className="mx-0.5 text-purple-600">,</span>
          )}
        </span>
      ))}
      <span className="text-purple-600">]</span>
    </span>
  );
}
