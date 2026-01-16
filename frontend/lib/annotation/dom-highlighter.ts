/**
 * DOM Highlighter - Utilities for applying and managing DOM highlights
 *
 * This module provides functions to apply annotation highlights to DOM elements,
 * handling the complexity of ranges that span multiple elements.
 */

export interface AnnotationData {
  id: string;
  color: 'yellow' | 'green' | 'blue' | 'pink' | 'purple';
  isHighlighted?: boolean;
}

// Color mapping for annotation backgrounds
const colorClasses: Record<string, string> = {
  yellow: 'bg-yellow-200',
  green: 'bg-green-200',
  blue: 'bg-blue-200',
  pink: 'bg-pink-200',
  purple: 'bg-purple-200',
};

// Highlighted state class (when annotation is selected in panel)
const highlightedClass = 'ring-2 ring-blue-500 ring-offset-1';

// Data attribute for identifying annotation marks
const ANNOTATION_ATTR = 'data-annotation-id';
const ANNOTATION_MARK_CLASS = 'annotation-mark';

/**
 * Clear all annotation highlights from a container
 */
export function clearHighlights(container: HTMLElement): void {
  const marks = container.querySelectorAll(`mark.${ANNOTATION_MARK_CLASS}`);

  marks.forEach((mark) => {
    // Replace mark with its text content
    const parent = mark.parentNode;
    if (parent) {
      const textNode = document.createTextNode(mark.textContent || '');
      parent.replaceChild(textNode, mark);
      // Normalize to merge adjacent text nodes
      parent.normalize();
    }
  });
}

/**
 * Create a mark element for annotation highlighting
 */
function createMarkElement(annotation: AnnotationData): HTMLElement {
  const mark = document.createElement('mark');
  mark.setAttribute(ANNOTATION_ATTR, annotation.id);
  mark.className = `${ANNOTATION_MARK_CLASS} ${colorClasses[annotation.color] || colorClasses.yellow} rounded px-0.5 cursor-pointer transition-all`;

  if (annotation.isHighlighted) {
    mark.className += ` ${highlightedClass}`;
  }

  mark.title = '点击查看批注';

  return mark;
}

/**
 * Highlight a range that is contained within a single text node
 */
function highlightSingleNodeRange(
  range: Range,
  annotation: AnnotationData
): HTMLElement | null {
  try {
    const mark = createMarkElement(annotation);
    range.surroundContents(mark);
    return mark;
  } catch {
    // surroundContents can fail if range partially selects non-text nodes
    return null;
  }
}

/**
 * Highlight a range that spans multiple nodes
 * This is more complex and requires splitting text nodes
 */
function highlightMultiNodeRange(
  range: Range,
  annotation: AnnotationData
): HTMLElement[] {
  const marks: HTMLElement[] = [];

  // Get all text nodes in the range
  const textNodes: Text[] = [];
  const treeWalker = document.createTreeWalker(
    range.commonAncestorContainer,
    NodeFilter.SHOW_TEXT,
    {
      acceptNode: (node) => {
        // Check if node is within the range
        const nodeRange = document.createRange();
        nodeRange.selectNode(node);

        // Node is in range if it's not completely before or after
        const comparison1 = range.compareBoundaryPoints(
          Range.START_TO_END,
          nodeRange
        );
        const comparison2 = range.compareBoundaryPoints(
          Range.END_TO_START,
          nodeRange
        );

        if (comparison1 > 0 && comparison2 < 0) {
          return NodeFilter.FILTER_ACCEPT;
        }
        return NodeFilter.FILTER_REJECT;
      },
    }
  );

  let node: Text | null;
  while ((node = treeWalker.nextNode() as Text | null)) {
    textNodes.push(node);
  }

  // Process each text node
  for (const textNode of textNodes) {
    const isStartNode = textNode === range.startContainer;
    const isEndNode = textNode === range.endContainer;
    const textLength = textNode.textContent?.length || 0;

    let startOffset = 0;
    let endOffset = textLength;

    if (isStartNode) {
      startOffset = range.startOffset;
    }
    if (isEndNode) {
      endOffset = range.endOffset;
    }

    // Skip if nothing to highlight
    if (startOffset >= endOffset) continue;

    // Create a range for just this portion
    const nodeRange = document.createRange();
    nodeRange.setStart(textNode, startOffset);
    nodeRange.setEnd(textNode, endOffset);

    // Try to wrap this portion
    try {
      const mark = createMarkElement(annotation);
      nodeRange.surroundContents(mark);
      marks.push(mark);
    } catch {
      // If surroundContents fails, try manual wrapping
      const fragment = nodeRange.extractContents();
      const mark = createMarkElement(annotation);
      mark.appendChild(fragment);
      nodeRange.insertNode(mark);
      marks.push(mark);
    }
  }

  return marks;
}

/**
 * Apply a highlight to a DOM Range
 *
 * @param range The DOM Range to highlight
 * @param annotation The annotation data
 * @returns Array of mark elements created
 */
export function highlightRange(
  range: Range,
  annotation: AnnotationData
): HTMLElement[] {
  if (range.collapsed) return [];

  // Check if range is within a single text node
  if (
    range.startContainer === range.endContainer &&
    range.startContainer.nodeType === Node.TEXT_NODE
  ) {
    const mark = highlightSingleNodeRange(range, annotation);
    return mark ? [mark] : [];
  }

  // Range spans multiple nodes
  return highlightMultiNodeRange(range, annotation);
}

/**
 * Scroll to an annotation mark with animation
 */
export function scrollToAnnotation(
  container: HTMLElement,
  annotationId: string
): boolean {
  const mark = container.querySelector(
    `[${ANNOTATION_ATTR}="${annotationId}"]`
  );

  if (!mark) return false;

  // Scroll into view
  mark.scrollIntoView({ behavior: 'smooth', block: 'center' });

  // Add pulse animation
  mark.classList.add('annotation-pulse');
  setTimeout(() => {
    mark.classList.remove('annotation-pulse');
  }, 2000);

  return true;
}

/**
 * Update the highlighted state of all annotations
 */
export function updateHighlightedAnnotation(
  container: HTMLElement,
  highlightedId: string | null
): void {
  const allMarks = container.querySelectorAll(`mark.${ANNOTATION_MARK_CLASS}`);

  allMarks.forEach((mark) => {
    const markId = mark.getAttribute(ANNOTATION_ATTR);
    const isHighlighted = markId === highlightedId;

    if (isHighlighted) {
      mark.classList.add(...highlightedClass.split(' '));
    } else {
      highlightedClass.split(' ').forEach((cls) => {
        mark.classList.remove(cls);
      });
    }
  });
}

/**
 * Get all annotation IDs present in a container
 */
export function getAnnotationIds(container: HTMLElement): string[] {
  const marks = container.querySelectorAll(`[${ANNOTATION_ATTR}]`);
  const ids: string[] = [];

  marks.forEach((mark) => {
    const id = mark.getAttribute(ANNOTATION_ATTR);
    if (id && !ids.includes(id)) {
      ids.push(id);
    }
  });

  return ids;
}
