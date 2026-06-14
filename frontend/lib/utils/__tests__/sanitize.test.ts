import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock DOMPurify before importing the module under test.
// We control what DOMPurify.sanitize returns per test.
const mockSanitize = vi.fn((html: string) => `SANITIZED:${html}`);

vi.mock('isomorphic-dompurify', () => ({
  default: {
    sanitize: mockSanitize,
  },
}));

describe('sanitize utilities (browser environment)', () => {
  let sanitizeHtml: typeof import('../sanitize').sanitizeHtml;
  let sanitizeSvg: typeof import('../sanitize').sanitizeSvg;
  let sanitizeSlideHtml: typeof import('../sanitize').sanitizeSlideHtml;
  let isBrowser: typeof import('../sanitize').isBrowser;

  beforeEach(async () => {
    vi.resetModules();
    // Ensure window is defined (jsdom provides this)
    // Re-import fresh module after resetting
    const mod = await import('../sanitize');
    sanitizeHtml = mod.sanitizeHtml;
    sanitizeSvg = mod.sanitizeSvg;
    sanitizeSlideHtml = mod.sanitizeSlideHtml;
    isBrowser = mod.isBrowser;
    mockSanitize.mockImplementation((html: string) => `SANITIZED:${html}`);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('isBrowser', () => {
    it('should return true when window is defined (jsdom)', () => {
      expect(isBrowser()).toBe(true);
    });
  });

  describe('sanitizeHtml (browser)', () => {
    it('should call DOMPurify.sanitize with html profile', () => {
      sanitizeHtml('<p>hello</p>');
      expect(mockSanitize).toHaveBeenCalledWith('<p>hello</p>', {
        USE_PROFILES: { html: true },
        FORBID_TAGS: ['style'],
        FORBID_ATTR: ['style'],
      });
    });

    it('should return the value from DOMPurify.sanitize', () => {
      mockSanitize.mockReturnValueOnce('<p>hello</p>');
      const result = sanitizeHtml('<p>hello</p>');
      expect(result).toBe('<p>hello</p>');
    });

    it('should pass through XSS input to DOMPurify for sanitization', () => {
      const xss = '<script>alert("xss")</script>';
      mockSanitize.mockReturnValueOnce('');
      const result = sanitizeHtml(xss);
      expect(result).toBe('');
      expect(mockSanitize).toHaveBeenCalledOnce();
    });

    it('should forbid style tags via DOMPurify config', () => {
      sanitizeHtml('<style>body{}</style>');
      const call = mockSanitize.mock.calls[0] as unknown[];
      expect(call[1]).toMatchObject({ FORBID_TAGS: ['style'] });
    });
  });

  describe('sanitizeSvg (browser)', () => {
    it('should call DOMPurify.sanitize with svg profile', () => {
      sanitizeSvg('<svg><circle/></svg>');
      expect(mockSanitize).toHaveBeenCalledWith('<svg><circle/></svg>', {
        USE_PROFILES: { svg: true, svgFilters: true },
        ADD_TAGS: ['use'],
      });
    });

    it('should return sanitized SVG content', () => {
      mockSanitize.mockReturnValueOnce('<svg></svg>');
      expect(sanitizeSvg('<svg><script/></svg>')).toBe('<svg></svg>');
    });

    it('should allow use tags in SVG profile config', () => {
      sanitizeSvg('<svg/>');
      const call = mockSanitize.mock.calls[0] as unknown[];
      expect(call[1]).toMatchObject({ ADD_TAGS: ['use'] });
    });
  });

  describe('sanitizeSlideHtml (browser)', () => {
    it('should call DOMPurify.sanitize with style tags allowed', () => {
      sanitizeSlideHtml('<div><style>h1{}</style></div>');
      expect(mockSanitize).toHaveBeenCalledWith(
        '<div><style>h1{}</style></div>',
        {
          USE_PROFILES: { html: true },
          ADD_TAGS: ['style'],
          ADD_ATTR: ['style', 'class'],
        }
      );
    });

    it('should return the sanitized slide HTML', () => {
      mockSanitize.mockReturnValueOnce('<div class="slide"></div>');
      const result = sanitizeSlideHtml('<div class="slide"></div>');
      expect(result).toBe('<div class="slide"></div>');
    });

    it('should allow style attribute in slide config', () => {
      sanitizeSlideHtml('<p style="color:red"/>');
      const call = mockSanitize.mock.calls[0] as unknown[];
      expect(call[1]).toMatchObject({ ADD_ATTR: ['style', 'class'] });
    });
  });
});
