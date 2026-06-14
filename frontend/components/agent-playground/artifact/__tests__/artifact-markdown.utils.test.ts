/**
 * Tests for artifact-markdown.utils.ts
 *
 * The module re-exports katexAwareSchema from lib/markdown/katexAwareSchema.
 * We verify it exports the expected schema shape.
 */

import { describe, it, expect } from 'vitest';
import { katexAwareSchema } from '../artifact-markdown.utils';

describe('katexAwareSchema', () => {
  it('is an object', () => {
    expect(typeof katexAwareSchema).toBe('object');
    expect(katexAwareSchema).not.toBeNull();
  });

  it('has tagNames array', () => {
    expect(Array.isArray(katexAwareSchema.tagNames)).toBe(true);
  });

  it('includes math in tagNames', () => {
    expect(katexAwareSchema.tagNames).toContain('math');
  });

  it('includes mrow in tagNames', () => {
    expect(katexAwareSchema.tagNames).toContain('mrow');
  });

  it('includes semantics in tagNames', () => {
    expect(katexAwareSchema.tagNames).toContain('semantics');
  });

  it('includes msup in tagNames', () => {
    expect(katexAwareSchema.tagNames).toContain('msup');
  });

  it('has attributes object', () => {
    expect(typeof katexAwareSchema.attributes).toBe('object');
    expect(katexAwareSchema.attributes).not.toBeNull();
  });

  it('has wildcard attributes array', () => {
    const attrs = katexAwareSchema.attributes as Record<string, unknown>;
    expect(Array.isArray(attrs['*'])).toBe(true);
  });

  it('wildcard attributes include className', () => {
    const attrs = katexAwareSchema.attributes as Record<string, string[]>;
    expect(attrs['*']).toContain('className');
  });

  it('wildcard attributes include aria-hidden', () => {
    const attrs = katexAwareSchema.attributes as Record<string, string[]>;
    expect(attrs['*']).toContain('aria-hidden');
  });

  it('svg element has style in attributes', () => {
    const attrs = katexAwareSchema.attributes as Record<string, string[]>;
    expect(attrs['svg']).toContain('style');
  });

  it('path element has d in attributes', () => {
    const attrs = katexAwareSchema.attributes as Record<string, string[]>;
    expect(attrs['path']).toContain('d');
  });

  it('math element has style in attributes', () => {
    const attrs = katexAwareSchema.attributes as Record<string, string[]>;
    expect(attrs['math']).toContain('style');
  });

  it('includes all standard KaTeX elements', () => {
    const expected = [
      'mn',
      'mo',
      'mi',
      'mfrac',
      'msqrt',
      'mtable',
      'mtr',
      'mtd',
    ];
    for (const tag of expected) {
      expect(katexAwareSchema.tagNames).toContain(tag);
    }
  });
});
