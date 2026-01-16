/**
 * Annotation Library
 *
 * Provides utilities for finding, highlighting, and managing text annotations
 * in DOM-rendered content.
 */

export {
  findTextRange,
  extractContext,
  calculateOffsets,
  normalizeWhitespace,
  type TextSelector,
} from './text-finder';

export {
  highlightRange,
  clearHighlights,
  scrollToAnnotation,
  updateHighlightedAnnotation,
  getAnnotationIds,
  type AnnotationData,
} from './dom-highlighter';
