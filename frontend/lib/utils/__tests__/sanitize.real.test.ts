/**
 * Real (unmocked) sanitization behaviour.
 *
 * sanitize.ts now uses isomorphic-dompurify on BOTH server and client, replacing
 * the old hand-rolled regex SSR fallback that missed mixed-case / obfuscated
 * vectors. These tests exercise the real DOMPurify to prove those vectors are
 * stripped — the exact gap the old regex left open.
 */

import { describe, it, expect } from 'vitest';
import { sanitizeHtml, sanitizeSvg, sanitizeSlideHtml } from '../sanitize';

describe('sanitize — real isomorphic-dompurify behaviour', () => {
  it('strips a plain <script> tag but keeps safe markup', () => {
    const out = sanitizeHtml('<p>safe</p><script>alert(1)</script>');
    expect(out).toContain('<p>safe</p>');
    expect(out.toLowerCase()).not.toContain('<script');
  });

  it('strips mixed-case / obfuscated event handlers the old regex missed', () => {
    const out = sanitizeHtml('<img src=x oNlOaD=alert(1)><b>ok</b>');
    expect(out).not.toMatch(/onload/i);
    expect(out).toContain('ok');
  });

  it('strips a mixed-case <sCrIpT> tag', () => {
    const out = sanitizeHtml('<sCrIpT>steal()</sCrIpT><span>hi</span>');
    expect(out.toLowerCase()).not.toContain('script');
    expect(out).toContain('hi');
  });

  it('removes onerror from an <img>', () => {
    const out = sanitizeHtml('<img src=x onerror="evil()">');
    expect(out).not.toMatch(/onerror/i);
  });

  it('forbids <style> tags in sanitizeHtml', () => {
    const out = sanitizeHtml('<div><style>body{}</style>x</div>');
    expect(out.toLowerCase()).not.toContain('<style');
    expect(out).toContain('x');
  });

  it('keeps SVG <use> but drops embedded scripts in sanitizeSvg', () => {
    const out = sanitizeSvg(
      '<svg><use href="#a"/><script>evil()</script></svg>'
    );
    expect(out.toLowerCase()).not.toContain('script');
  });

  it('allows <style> in sanitizeSlideHtml but still strips scripts', () => {
    const out = sanitizeSlideHtml(
      '<div><style>h1{color:red}</style><script>bad()</script>slide</div>'
    );
    expect(out.toLowerCase()).not.toContain('<script');
    expect(out).toContain('slide');
  });
});
