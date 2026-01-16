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
  const rafIdRef = useRef<number | null>(null);
  const isMountedRef = useRef(true);

  // Apply highlights when annotations or content changes
  useEffect(() => {
    isMountedRef.current = true;
    const container = containerRef.current;
    if (!container || isApplyingRef.current) return;

    isApplyingRef.current = true;

    // Debug: Log container info
    console.log('[AnnotationHighlighter] Starting highlight application', {
      containerExists: !!container,
      containerTagName: container?.tagName,
      containerTextLength: container?.textContent?.length,
      annotationsCount: annotations.length,
      contentLength: content?.length,
    });

    // Use requestAnimationFrame to ensure DOM is ready
    rafIdRef.current = requestAnimationFrame(() => {
      rafIdRef.current = requestAnimationFrame(() => {
        // Check if still mounted and container exists
        if (!isMountedRef.current || !containerRef.current) {
          console.warn(
            '[AnnotationHighlighter] Container ref became null or unmounted'
          );
          isApplyingRef.current = false;
          return;
        }

        try {
          // Clear existing highlights
          clearHighlights(containerRef.current);

          // Filter annotations
          const annotationsToApply = activeOnly
            ? annotations.filter(
                (a) => a.status !== 'resolved' && a.status !== 'archived'
              )
            : annotations;

          console.log('[AnnotationHighlighter] Annotations to apply:', {
            total: annotations.length,
            filtered: annotationsToApply.length,
            activeOnly,
          });

          // Apply each annotation
          let successCount = 0;
          let failCount = 0;

          annotationsToApply.forEach((annotation, index) => {
            // Check if still mounted before each operation
            if (!isMountedRef.current || !containerRef.current) return;

            // Debug: Log each annotation attempt
            console.log(
              `[AnnotationHighlighter] Processing annotation ${index + 1}/${annotationsToApply.length}:`,
              {
                id: annotation.id,
                selectedText:
                  annotation.selectedText?.slice(0, 50) +
                  (annotation.selectedText?.length > 50 ? '...' : ''),
                selectedTextLength: annotation.selectedText?.length,
                color: annotation.color,
                hasPrefix: !!annotation.selectorPrefix,
                hasSuffix: !!annotation.selectorSuffix,
              }
            );

            try {
              const range = findTextRange(containerRef.current!, {
                exact: annotation.selectedText,
                prefix: annotation.selectorPrefix,
                suffix: annotation.selectorSuffix,
              });

              if (range) {
                console.log(
                  `[AnnotationHighlighter] ✓ Found range for annotation ${annotation.id}`
                );
                highlightRange(range, {
                  id: annotation.id,
                  color: annotation.color,
                  isHighlighted: annotation.id === highlightedAnnotationId,
                });
                successCount++;
              } else {
                console.warn(
                  `[AnnotationHighlighter] ✗ Could NOT find range for annotation ${annotation.id}`,
                  {
                    searchedText: annotation.selectedText?.slice(0, 100),
                    containerTextPreview:
                      containerRef.current?.textContent?.slice(0, 200),
                  }
                );
                failCount++;
              }
            } catch (err) {
              console.warn(
                `[AnnotationHighlighter] Error processing annotation ${annotation.id}:`,
                err
              );
              failCount++;
            }
          });

          console.log(
            '[AnnotationHighlighter] Highlight application complete:',
            {
              success: successCount,
              failed: failCount,
              total: annotationsToApply.length,
            }
          );
        } catch (err) {
          console.error(
            '[AnnotationHighlighter] Error applying highlights:',
            err
          );
        } finally {
          isApplyingRef.current = false;
        }
      });
    });

    // Cleanup function: cancel RAF and clear highlights when dependencies change or unmount
    return () => {
      isMountedRef.current = false;
      if (rafIdRef.current) {
        cancelAnimationFrame(rafIdRef.current);
        rafIdRef.current = null;
      }
      // Clear highlights when unmounting or before re-applying
      // Use try-catch to handle cases where container might be in inconsistent state
      try {
        if (containerRef.current) {
          clearHighlights(containerRef.current);
        }
      } catch (err) {
        console.warn(
          '[AnnotationHighlighter] Error clearing highlights on cleanup:',
          err
        );
      }
      isApplyingRef.current = false;
    };
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
      try {
        updateHighlightedAnnotation(container, null);
      } catch (err) {
        console.warn(
          '[AnnotationHighlighter] Error clearing highlight state:',
          err
        );
      }
      return;
    }

    // Wait for highlights to be applied, then scroll
    let scrollRafId: number | null = null;
    scrollRafId = requestAnimationFrame(() => {
      scrollRafId = requestAnimationFrame(() => {
        if (!containerRef.current) return;

        try {
          // Update highlight state
          updateHighlightedAnnotation(
            containerRef.current,
            highlightedAnnotationId
          );

          // Scroll to the annotation
          scrollToAnnotation(containerRef.current, highlightedAnnotationId);
        } catch (err) {
          console.warn(
            '[AnnotationHighlighter] Error scrolling to annotation:',
            err
          );
        }
      });
    });

    return () => {
      if (scrollRafId) {
        cancelAnimationFrame(scrollRafId);
      }
    };
  }, [highlightedAnnotationId, containerRef]);

  // This component doesn't render anything - it only applies side effects
  return null;
}

export default AnnotationHighlighter;
