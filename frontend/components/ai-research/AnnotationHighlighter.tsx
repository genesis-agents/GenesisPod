'use client';

/**
 * AnnotationHighlighter Component
 *
 * A React component that applies annotation highlights to DOM content
 * after it has been rendered. This approach solves the problem of
 * annotations spanning multiple paragraphs/elements.
 *
 * Features:
 * - Applies highlights after content renders (DOM-based approach)
 * - Handles cross-paragraph selections
 * - Supports scroll-to-annotation functionality
 * - Updates highlight state when selected annotation changes
 */

import { useEffect, useRef, type RefObject } from 'react';
import {
  findTextRange,
  highlightRange,
  clearHighlights,
  scrollToAnnotation,
  updateHighlightedAnnotation,
} from '@/lib/annotation';

export interface Annotation {
  id: string;
  selectedText: string;
  startOffset: number;
  endOffset: number;
  selectorPrefix?: string;
  selectorSuffix?: string;
  color: 'yellow' | 'green' | 'blue' | 'pink' | 'purple';
  status?: 'active' | 'resolved' | 'archived';
}

interface AnnotationHighlighterProps {
  /** Ref to the container element containing the content to annotate */
  containerRef: RefObject<HTMLElement>;
  /** List of annotations to apply */
  annotations: Annotation[];
  /** ID of the currently highlighted annotation (for scroll/focus) */
  highlightedAnnotationId?: string | null;
  /** Content string - used to trigger re-highlighting when content changes */
  content?: string;
  /** Whether to only show active annotations */
  activeOnly?: boolean;
  /** Callback when user clicks on an annotation highlight */
  onAnnotationClick?: (annotationId: string) => void;
}

/**
 * CSS for pulse animation - should be added to global styles
 *
 * @keyframes annotation-pulse {
 *   0%, 100% { box-shadow: 0 0 0 0 rgba(59, 130, 246, 0.5); }
 *   50% { box-shadow: 0 0 0 4px rgba(59, 130, 246, 0.5); }
 * }
 * .annotation-pulse {
 *   animation: annotation-pulse 0.5s ease-in-out 3;
 * }
 */

export function AnnotationHighlighter({
  containerRef,
  annotations,
  highlightedAnnotationId,
  content,
  activeOnly = true,
  onAnnotationClick,
}: AnnotationHighlighterProps) {
  const lastHighlightedRef = useRef<string | null>(null);
  const isApplyingRef = useRef(false);

  // Apply highlights when annotations or content changes
  useEffect(() => {
    const container = containerRef.current;
    if (!container || isApplyingRef.current) return;

    isApplyingRef.current = true;

    // Use requestAnimationFrame to ensure DOM is ready
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        if (!containerRef.current) {
          isApplyingRef.current = false;
          return;
        }

        // Clear existing highlights
        clearHighlights(containerRef.current);

        // Filter annotations
        const annotationsToApply = activeOnly
          ? annotations.filter(
              (a) => a.status !== 'resolved' && a.status !== 'archived'
            )
          : annotations;

        // Apply each annotation
        annotationsToApply.forEach((annotation) => {
          const range = findTextRange(containerRef.current!, {
            exact: annotation.selectedText,
            prefix: annotation.selectorPrefix,
            suffix: annotation.selectorSuffix,
          });

          if (range) {
            highlightRange(range, {
              id: annotation.id,
              color: annotation.color,
              isHighlighted: annotation.id === highlightedAnnotationId,
            });
          }
        });

        isApplyingRef.current = false;
      });
    });
  }, [annotations, content, containerRef, activeOnly, highlightedAnnotationId]);

  // Handle click events on annotation marks
  useEffect(() => {
    const container = containerRef.current;
    if (!container || !onAnnotationClick) return;

    const handleClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      // Check if clicked element is an annotation mark or inside one
      const mark = target.closest('[data-annotation-id]');
      if (mark) {
        const annotationId = mark.getAttribute('data-annotation-id');
        if (annotationId) {
          e.preventDefault();
          e.stopPropagation();
          onAnnotationClick(annotationId);
        }
      }
    };

    container.addEventListener('click', handleClick);
    return () => {
      container.removeEventListener('click', handleClick);
    };
  }, [containerRef, onAnnotationClick]);

  // Handle highlighted annotation changes (scroll to annotation)
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const currentHighlightedId = highlightedAnnotationId ?? null;

    // Only process if highlighted ID changed
    if (currentHighlightedId === lastHighlightedRef.current) return;
    lastHighlightedRef.current = currentHighlightedId;

    if (!highlightedAnnotationId) {
      // Clear highlight state
      updateHighlightedAnnotation(container, null);
      return;
    }

    // Wait for highlights to be applied, then scroll
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        if (!containerRef.current) return;

        // Update highlight state
        updateHighlightedAnnotation(
          containerRef.current,
          highlightedAnnotationId
        );

        // Scroll to the annotation
        scrollToAnnotation(containerRef.current, highlightedAnnotationId);
      });
    });
  }, [highlightedAnnotationId, containerRef]);

  // This component doesn't render anything - it only applies side effects
  return null;
}

export default AnnotationHighlighter;
