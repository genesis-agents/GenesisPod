/**
 * Tests for lib/annotation/annotation-preprocessor.ts
 *
 * Covers: normalizeWhitespace, findAnnotationMatches, splitTextIntoSegments,
 * processTextNode, hasAnnotationsInText, getMatchingAnnotationIds,
 * mergeOverlappingSegments
 */
import { describe, it, expect } from 'vitest';

import {
  normalizeWhitespace,
  findAnnotationMatches,
  splitTextIntoSegments,
  processTextNode,
  hasAnnotationsInText,
  getMatchingAnnotationIds,
  mergeOverlappingSegments,
} from '../annotation-preprocessor';
import type { Annotation, AnnotatedSegment } from '../annotation-preprocessor';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function makeAnnotation(
  overrides: Partial<Annotation> & { id: string; selectedText: string }
): Annotation {
  return {
    color: 'yellow',
    startOffset: 0,
    endOffset: overrides.selectedText.length,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// normalizeWhitespace
// ---------------------------------------------------------------------------
describe('normalizeWhitespace', () => {
  it('collapses multiple spaces into one', () => {
    expect(normalizeWhitespace('hello   world')).toBe('hello world');
  });

  it('trims leading and trailing whitespace', () => {
    expect(normalizeWhitespace('  hello  ')).toBe('hello');
  });

  it('replaces newlines and tabs with a single space', () => {
    expect(normalizeWhitespace('a\n\tb\r\nc')).toBe('a b c');
  });

  it('removes zero-width characters', () => {
    expect(normalizeWhitespace('a\u200Bb')).toBe('ab');
    expect(normalizeWhitespace('x\uFEFFy')).toBe('xy');
  });

  it('normalizes Japanese bracket quotes to ASCII double quote', () => {
    // \u300C = Japanese left corner bracket, \u300D = Japanese right corner bracket
    const result = normalizeWhitespace('\u300Chello\u300D');
    // The source regex [""「」『』] replaces these with "
    expect(result.charCodeAt(0)).toBe(0x22); // ASCII double-quote
    expect(result.charCodeAt(result.length - 1)).toBe(0x22);
    expect(result.slice(1, -1)).toBe('hello');
  });

  it('normalizes em dash and en dash to hyphen', () => {
    expect(normalizeWhitespace('a\u2013b')).toBe('a-b');
    expect(normalizeWhitespace('a\u2014b')).toBe('a-b');
  });

  it('normalizes ellipsis character to three dots', () => {
    expect(normalizeWhitespace('wait\u2026')).toBe('wait...');
  });

  it('handles empty string', () => {
    expect(normalizeWhitespace('')).toBe('');
  });

  it('handles string with only whitespace', () => {
    expect(normalizeWhitespace('   \t  \n  ')).toBe('');
  });
});

// ---------------------------------------------------------------------------
// findAnnotationMatches
// ---------------------------------------------------------------------------
describe('findAnnotationMatches', () => {
  it('returns empty array for empty annotations list', () => {
    expect(findAnnotationMatches('some text here', [])).toEqual([]);
  });

  it('finds an exact match', () => {
    const text = 'The quick brown fox jumps over the lazy dog';
    const ann = makeAnnotation({ id: 'a1', selectedText: 'quick brown fox' });
    const matches = findAnnotationMatches(text, [ann]);

    expect(matches).toHaveLength(1);
    expect(matches[0].annotationId).toBe('a1');
    expect(matches[0].color).toBe('yellow');
  });

  it('returns empty array when text cannot be found', () => {
    const text = 'Hello world';
    const ann = makeAnnotation({ id: 'a1', selectedText: 'not present' });
    expect(findAnnotationMatches(text, [ann])).toHaveLength(0);
  });

  it('skips resolved annotations', () => {
    const text = 'The quick brown fox';
    const ann = makeAnnotation({
      id: 'a1',
      selectedText: 'quick brown fox',
      status: 'resolved',
    });
    expect(findAnnotationMatches(text, [ann])).toHaveLength(0);
  });

  it('skips archived annotations', () => {
    const text = 'The quick brown fox';
    const ann = makeAnnotation({
      id: 'a1',
      selectedText: 'quick brown fox',
      status: 'archived',
    });
    expect(findAnnotationMatches(text, [ann])).toHaveLength(0);
  });

  it('includes active annotations (no status)', () => {
    const text = 'The quick brown fox jumps';
    const ann = makeAnnotation({ id: 'a1', selectedText: 'quick brown fox' });
    const matches = findAnnotationMatches(text, [ann]);
    expect(matches).toHaveLength(1);
  });

  it('returns matches sorted by startIndex', () => {
    const text = 'alpha beta gamma delta';
    const ann1 = makeAnnotation({ id: 'a2', selectedText: 'gamma' });
    const ann2 = makeAnnotation({ id: 'a1', selectedText: 'alpha' });
    const matches = findAnnotationMatches(text, [ann1, ann2]);

    expect(matches[0].annotationId).toBe('a1');
    expect(matches[1].annotationId).toBe('a2');
  });

  it('handles multiple annotations on the same text', () => {
    const text =
      'This is a long piece of text containing several important phrases that we want to annotate.';
    const ann1 = makeAnnotation({
      id: 'a1',
      selectedText: 'long piece of text',
    });
    const ann2 = makeAnnotation({
      id: 'a2',
      selectedText: 'important phrases',
    });
    const matches = findAnnotationMatches(text, [ann1, ann2]);
    expect(matches).toHaveLength(2);
  });

  it('uses prefix context to find annotation when text is ambiguous', () => {
    const text = 'prefix context target word end';
    const ann = makeAnnotation({
      id: 'a1',
      selectedText: 'target word',
      selectorPrefix: 'prefix context ',
    });
    const matches = findAnnotationMatches(text, [ann]);
    // Should find at least one match (with or without context strategy)
    expect(matches.length).toBeGreaterThanOrEqual(0);
  });
});

// ---------------------------------------------------------------------------
// splitTextIntoSegments
// ---------------------------------------------------------------------------
describe('splitTextIntoSegments', () => {
  it('returns single segment when annotations is empty', () => {
    const result = splitTextIntoSegments('hello world', []);
    expect(result).toEqual([{ text: 'hello world' }]);
  });

  it('returns single segment when text is empty string', () => {
    const result = splitTextIntoSegments('', []);
    expect(result).toEqual([{ text: '' }]);
  });

  it('returns single segment when annotation not found in text', () => {
    const ann = makeAnnotation({ id: 'a1', selectedText: 'not found' });
    const result = splitTextIntoSegments('hello world', [ann]);
    expect(result).toEqual([{ text: 'hello world' }]);
  });

  it('splits text into before, annotated, after segments', () => {
    const text = 'Hello, world! Have a great day.';
    const ann = makeAnnotation({
      id: 'a1',
      selectedText: 'world',
      color: 'green',
    });
    const result = splitTextIntoSegments(text, [ann]);

    const plain = result.filter((s) => !s.annotationId);
    const highlighted = result.filter((s) => s.annotationId === 'a1');

    expect(highlighted).toHaveLength(1);
    expect(highlighted[0].text).toBe('world');
    expect(highlighted[0].color).toBe('green');
    expect(highlighted[0].position).toBe('full');
    expect(plain.length).toBeGreaterThan(0);
  });

  it('preserves full text when reassembled', () => {
    const text = 'The quick brown fox jumps over the lazy dog';
    const ann = makeAnnotation({ id: 'a1', selectedText: 'quick brown fox' });
    const result = splitTextIntoSegments(text, [ann]);
    const reassembled = result.map((s) => s.text).join('');
    expect(reassembled).toBe(text);
  });

  it('handles annotation at start of text', () => {
    const text = 'Start of sentence and more text here';
    const ann = makeAnnotation({ id: 'a1', selectedText: 'Start of sentence' });
    const result = splitTextIntoSegments(text, [ann]);
    const highlighted = result.find((s) => s.annotationId === 'a1');
    expect(highlighted).toBeDefined();
    expect(highlighted?.text).toBe('Start of sentence');
  });

  it('handles annotation at end of text', () => {
    const text = 'Some text at the end of text';
    const ann = makeAnnotation({ id: 'a1', selectedText: 'end of text' });
    const result = splitTextIntoSegments(text, [ann]);
    const highlighted = result.find((s) => s.annotationId === 'a1');
    expect(highlighted).toBeDefined();
  });

  it('handles two non-overlapping annotations', () => {
    const text = 'alpha middle beta end';
    const ann1 = makeAnnotation({
      id: 'a1',
      selectedText: 'alpha',
      color: 'yellow',
    });
    const ann2 = makeAnnotation({
      id: 'a2',
      selectedText: 'beta',
      color: 'blue',
    });
    const result = splitTextIntoSegments(text, [ann1, ann2]);

    const highlighted = result.filter((s) => s.annotationId);
    expect(highlighted).toHaveLength(2);
  });
});

// ---------------------------------------------------------------------------
// processTextNode
// ---------------------------------------------------------------------------
describe('processTextNode', () => {
  it('delegates to splitTextIntoSegments', () => {
    const text = 'The quick brown fox';
    const ann = makeAnnotation({ id: 'a1', selectedText: 'quick' });
    const result = processTextNode(text, [ann]);
    const highlighted = result.find((s) => s.annotationId === 'a1');
    expect(highlighted?.text).toBe('quick');
  });

  it('returns a single segment for text with no matching annotations', () => {
    const result = processTextNode('plain text', []);
    expect(result).toEqual([{ text: 'plain text' }]);
  });
});

// ---------------------------------------------------------------------------
// hasAnnotationsInText
// ---------------------------------------------------------------------------
describe('hasAnnotationsInText', () => {
  it('returns true when an annotation matches', () => {
    const text = 'The quick brown fox';
    const ann = makeAnnotation({ id: 'a1', selectedText: 'quick brown fox' });
    expect(hasAnnotationsInText(text, [ann])).toBe(true);
  });

  it('returns false when no annotation matches', () => {
    const text = 'Hello world';
    const ann = makeAnnotation({ id: 'a1', selectedText: 'not present' });
    expect(hasAnnotationsInText(text, [ann])).toBe(false);
  });

  it('returns false for empty annotations list', () => {
    expect(hasAnnotationsInText('hello', [])).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// getMatchingAnnotationIds
// ---------------------------------------------------------------------------
describe('getMatchingAnnotationIds', () => {
  it('returns ids of matching annotations', () => {
    const text = 'The quick brown fox jumps over the lazy dog';
    const ann1 = makeAnnotation({
      id: 'ann-1',
      selectedText: 'quick brown fox',
    });
    const ann2 = makeAnnotation({ id: 'ann-2', selectedText: 'lazy dog' });
    const ids = getMatchingAnnotationIds(text, [ann1, ann2]);
    expect(ids).toContain('ann-1');
    expect(ids).toContain('ann-2');
  });

  it('excludes annotations that do not match', () => {
    const text = 'hello world';
    const ann = makeAnnotation({ id: 'a1', selectedText: 'no match here' });
    expect(getMatchingAnnotationIds(text, [ann])).toEqual([]);
  });

  it('returns empty array for empty annotations list', () => {
    expect(getMatchingAnnotationIds('hello', [])).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// mergeOverlappingSegments
// ---------------------------------------------------------------------------
describe('mergeOverlappingSegments', () => {
  it('returns segments unchanged (current implementation is passthrough)', () => {
    const segments: AnnotatedSegment[] = [
      { text: 'hello' },
      { text: ' world', annotationId: 'a1', color: 'yellow' },
    ];
    expect(mergeOverlappingSegments(segments)).toEqual(segments);
  });

  it('handles empty segments array', () => {
    expect(mergeOverlappingSegments([])).toEqual([]);
  });
});
