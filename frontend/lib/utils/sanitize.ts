/**
 * HTML Sanitization Utilities
 *
 * Uses isomorphic-dompurify so the SAME DOMPurify sanitization runs on both the
 * server (SSR) and the client. Previously the server-side path used a hand-rolled
 * regex fallback that missed mixed-case / obfuscated vectors (e.g. `oNlOaD=`,
 * `<sCrIpT>`), so untrusted HTML rendered during SSR could still carry XSS.
 * Use these functions whenever rendering untrusted HTML content.
 */

import DOMPurify from 'isomorphic-dompurify';

/**
 * Sanitize HTML content for safe rendering
 * Removes malicious scripts, event handlers, and dangerous elements
 */
export function sanitizeHtml(html: string): string {
  return DOMPurify.sanitize(html, {
    USE_PROFILES: { html: true },
    FORBID_TAGS: ['style'], // Forbid style tags to prevent CSS injection
    FORBID_ATTR: ['style'],
  });
}

/**
 * Sanitize SVG content for safe rendering
 * Allows SVG-specific elements while preventing XSS
 */
export function sanitizeSvg(svg: string): string {
  return DOMPurify.sanitize(svg, {
    USE_PROFILES: { svg: true, svgFilters: true },
    ADD_TAGS: ['use'], // Allow SVG use elements
  });
}

/**
 * Sanitize slide/presentation HTML
 * Allows style tags for slide styling while preventing XSS
 */
export function sanitizeSlideHtml(html: string): string {
  return DOMPurify.sanitize(html, {
    USE_PROFILES: { html: true },
    ADD_TAGS: ['style'], // Allow style tags for slides
    ADD_ATTR: ['style', 'class'], // Allow styling attributes
  });
}

/**
 * Check if running in browser environment
 */
export function isBrowser(): boolean {
  return typeof window !== 'undefined';
}
