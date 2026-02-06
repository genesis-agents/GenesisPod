import React, { useCallback } from 'react';
import { CitationBadge } from '@/components/ai-research/citations/CitationBadge';
import {
  splitTextIntoSegments,
  type Annotation as PreprocessorAnnotation,
} from '@/lib/annotation';
import { AnnotatedText } from '@/components/ai-research/annotations/AnnotatedText';

interface EvidenceItem {
  id: string;
  title?: string | null;
  url?: string | null;
  snippet?: string | null;
  domain?: string | null;
  citationIndex?: number | null;
}

interface UseReportTextProcessorOptions {
  evidence: EvidenceItem[] | undefined;
  preprocessorAnnotations: PreprocessorAnnotation[];
  highlightedAnnotationId: string | null;
  onAnnotationClick: (annotationId: string) => void;
}

export function useReportTextProcessor({
  evidence,
  preprocessorAnnotations,
  highlightedAnnotationId,
  onAnnotationClick,
}: UseReportTextProcessorOptions) {
  const processTextWithCitations = useCallback(
    (text: string): React.ReactNode => {
      if (!text || !evidence?.length) return text;

      const evidenceIdMap = new Map<string, number>();
      // ★ Build citationIndex → array-position map for numeric citation lookup
      // Evidence items have a citationIndex field (global, possibly non-contiguous)
      // Report text uses these global citationIndex values like [142]
      const citationIndexMap = new Map<number, number>();
      evidence.forEach((ev, idx) => {
        evidenceIdMap.set(ev.id, idx + 1);
        const ci = ev.citationIndex;
        if (ci != null) {
          citationIndexMap.set(ci, idx);
        }
      });

      const citationPattern =
        /\[(\d+(?:\s*,\s*\d+)*)\]|\[(temp-\d+-\d+)\]|\[([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\]/gi;
      const parts: React.ReactNode[] = [];
      let lastIndex = 0;
      let match: RegExpExecArray | null;

      citationPattern.lastIndex = 0;

      while ((match = citationPattern.exec(text)) !== null) {
        if (match.index > lastIndex) {
          parts.push(text.slice(lastIndex, match.index));
        }

        if (match[1]) {
          const indices = match[1].split(/\s*,\s*/).map((s) => parseInt(s, 10));
          indices.forEach((idx, i) => {
            // ★ First try citationIndex map (global indices), then fall back to array position
            const mappedPos = citationIndexMap.get(idx);
            const evidenceItem =
              mappedPos != null ? evidence[mappedPos] : evidence[idx - 1];
            if (evidenceItem) {
              parts.push(
                React.createElement(CitationBadge, {
                  key: `cite-${match!.index}-${idx}-${i}`,
                  index: idx,
                  evidence: evidenceItem,
                })
              );
            } else {
              parts.push(
                React.createElement(
                  'sup',
                  {
                    key: `cite-unknown-${match!.index}-${i}`,
                    className:
                      'rounded bg-gray-100 px-1 py-0.5 text-xs text-gray-500',
                  },
                  `[${idx}]`
                )
              );
            }
          });
        } else if (match[2] || match[3]) {
          const evidenceId = match[2] || match[3];
          const idx = evidenceIdMap.get(evidenceId);
          if (idx) {
            const evidenceItem = evidence[idx - 1];
            parts.push(
              React.createElement(CitationBadge, {
                key: `cite-${match.index}-${evidenceId}`,
                index: idx,
                evidence: evidenceItem,
              })
            );
          } else {
            parts.push(
              React.createElement(
                'sup',
                {
                  key: `cite-unknown-${match.index}`,
                  className:
                    'rounded bg-gray-100 px-1 py-0.5 text-xs text-gray-500',
                  title: evidenceId,
                },
                '[?]'
              )
            );
          }
        }

        lastIndex = match.index + match[0].length;
      }

      if (lastIndex < text.length) {
        parts.push(text.slice(lastIndex));
      }

      return parts.length === 1 ? parts[0] : parts;
    },
    [evidence]
  );

  const processText = useCallback(
    (text: string): React.ReactNode => {
      if (!text) return text;

      const segments = splitTextIntoSegments(text, preprocessorAnnotations);

      if (segments.length === 1 && !segments[0].annotationId) {
        return processTextWithCitations(text);
      }

      return React.createElement(AnnotatedText, {
        segments,
        highlightedId: highlightedAnnotationId,
        onAnnotationClick,
        renderText: processTextWithCitations,
      });
    },
    [
      preprocessorAnnotations,
      highlightedAnnotationId,
      onAnnotationClick,
      processTextWithCitations,
    ]
  );

  return { processText, processTextWithCitations };
}
