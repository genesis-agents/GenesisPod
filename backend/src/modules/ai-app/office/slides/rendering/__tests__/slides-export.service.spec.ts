/**
 * Unit tests for SlidesExportService
 *
 * Heavy use of mocks for: puppeteer, pptxgenjs, ParameterizedRendererService, HttpService
 *
 * NOTE: jest.mock factories are hoisted before variable declarations, so all mock
 * setup inside factories must be self-contained (no references to outer variables).
 * Shared mock state is accessed via `require()` inside tests.
 */

import { Test, TestingModule } from '@nestjs/testing';
import { HttpService } from '@nestjs/axios';
import { SlidesExportService } from '../slides-export.service';
import { ParameterizedRendererService } from '../parameterized-renderer.service';
import { LayoutOptimizerSkill } from '../../skills/layout-optimizer.skill';
import { PageContent } from '../../checkpoint/checkpoint.types';
import { PPTDocument, GeneratedSlide, PPTTheme } from '../../types/slides.types';

// ============================================================
// Mock pptxgenjs - self-contained factory (no outer variable refs)
// ============================================================

jest.mock('pptxgenjs', () => {
  const mockSlide = {
    background: undefined as any,
    addText: jest.fn(),
    addShape: jest.fn(),
  };
  const mockInstance = {
    title: '',
    subject: '',
    author: '',
    company: '',
    layout: '',
    addSlide: jest.fn(() => ({ ...mockSlide })),
    defineLayout: jest.fn(),
    write: jest.fn().mockResolvedValue(Buffer.from('mock-pptx-bytes')),
  };
  return jest.fn().mockImplementation(() => mockInstance);
});

// ============================================================
// Mock puppeteer - self-contained factory
// ============================================================

jest.mock('puppeteer', () => {
  const mockPage = {
    setViewport: jest.fn().mockResolvedValue(undefined),
    setContent: jest.fn().mockResolvedValue(undefined),
    screenshot: jest.fn().mockResolvedValue(Buffer.from('mock-screenshot')),
    pdf: jest.fn().mockResolvedValue(Buffer.from('mock-pdf')),
    evaluate: jest.fn().mockResolvedValue(undefined),
  };
  const mockBrowser = {
    newPage: jest.fn().mockResolvedValue(mockPage),
    close: jest.fn().mockResolvedValue(undefined),
  };
  return {
    launch: jest.fn().mockResolvedValue(mockBrowser),
  };
});

// ============================================================
// Mock archiver - self-contained factory
//
// archiver is a CJS module. When dynamically imported via `await import('archiver')`,
// the module's main export becomes `.default`. So the mock must provide a callable
// default that returns an archive-like object.
// ============================================================

jest.mock('archiver', () => {
  // The archive object that will be returned by each archiver() call
  const archive = {
    _dataCallback: null as any,
    on(event: string, cb: (...args: any[]) => void) {
      if (event === 'data') {
        archive._dataCallback = cb;
      }
      return archive;
    },
    append() { return archive; },
    async finalize() {
      // Emit one data chunk so Buffer.concat works
      if (archive._dataCallback) {
        archive._dataCallback(Buffer.from('zip-chunk'));
      }
    },
  };

  // The archiver factory function (becomes `.default` on dynamic import of CJS module)
  const archiverFactory = function() { return archive; };

  // Export as a CJS module with both the factory as default and as module.exports
  archiverFactory.default = archiverFactory;
  return archiverFactory;
});

// ============================================================
// Test data helpers
// ============================================================

const buildPPTTheme = (): PPTTheme => ({
  id: 'dark-professional',
  name: 'Dark Professional',
  fonts: {
    heading: 'Inter',
    body: 'Inter',
  },
  colors: {
    primary: '#6366F1',
    secondary: '#8B5CF6',
    background: '#0F172A',
    backgroundSecondary: '#1E293B',
    text: '#F1F5F9',
    textLight: '#94A3B8',
    textMuted: '#64748B',
    accent: '#818CF8',
    border: '#1E293B',
  },
  slideBackground: '#0F172A',
} as unknown as PPTTheme);

const buildGeneratedSlide = (index: number, withHtml = false): GeneratedSlide => ({
  id: `slide-${index}`,
  index,
  spec: {
    purpose: index === 0 ? 'title' : 'content',
    title: `Slide ${index + 1}`,
    backgroundDecision: {
      type: 'solid',
      colors: { primary: '#0F172A' },
    },
  } as any,
  content: {
    title: `Slide ${index + 1} Title`,
    subtitle: index === 0 ? 'Subtitle' : undefined,
    bulletPoints: ['Point A', 'Point B'],
    bodyText: 'Some body text',
  } as any,
  images: [],
  html: withHtml ? `<div>Slide ${index + 1} HTML</div>` : undefined,
  isEdited: false,
  editHistory: [],
  generationMetadata: {
    textModelUsed: 'gpt-4',
    contentGeneratedAt: new Date().toISOString(),
  },
});

const buildPPTDocument = (slideCount = 2, withHtml = false): PPTDocument => ({
  id: 'doc-1',
  userId: 'user-1',
  title: 'Test Presentation',
  subtitle: 'Test Subtitle',
  theme: buildPPTTheme(),
  aspectRatio: '16:9',
  language: 'en',
  originalInput: { prompt: 'Test prompt' },
  outline: { title: 'Test', slides: [] } as any,
  slides: Array.from({ length: slideCount }, (_, i) => buildGeneratedSlide(i, withHtml)),
  generationConfig: {
    textModelId: 'model-1',
    textModelName: 'GPT-4',
  } as any,
  status: 'completed' as any,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
});

const buildPageContent = (title: string): PageContent => ({
  title,
  sections: [{ type: 'text', position: 'full', content: 'Content text' }],
});

// ============================================================
// Tests
// ============================================================

describe('SlidesExportService', () => {
  let service: SlidesExportService;
  let parameterizedRenderer: jest.Mocked<ParameterizedRendererService>;
  let layoutOptimizer: jest.Mocked<LayoutOptimizerSkill>;

  beforeEach(async () => {
    jest.clearAllMocks();

    const mockParameterizedRenderer = {
      render: jest.fn().mockResolvedValue({
        success: true,
        renderedSections: 1,
        truncatedSections: [],
        errors: [],
      }),
      renderWithLayout: jest.fn().mockResolvedValue({
        success: true,
        renderedSections: 1,
        truncatedSections: [],
        errors: [],
      }),
    };

    const mockLayoutOptimizer = {
      optimize: jest.fn().mockReturnValue({
        layoutType: 'standard',
        gridConfig: { columns: 1, rows: 1, columnWidths: [1.0], rowHeights: [1.0], gap: 0.1 },
        titleArea: { show: true, heightRatio: 0.2, alignment: 'left' },
        footerArea: { show: false, heightRatio: 0.05 },
        sectionPlacements: [],
        visualHierarchy: { primaryIndex: 0, secondaryIndices: [], tertiaryIndices: [] },
        confidence: 0.9,
        reason: 'test',
      }),
      execute: jest.fn(),
    };

    const mockHttpService = {
      get: jest.fn(),
      post: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SlidesExportService,
        { provide: HttpService, useValue: mockHttpService },
        { provide: ParameterizedRendererService, useValue: mockParameterizedRenderer },
        { provide: LayoutOptimizerSkill, useValue: mockLayoutOptimizer },
      ],
    }).compile();

    service = module.get<SlidesExportService>(SlidesExportService);
    parameterizedRenderer = module.get(ParameterizedRendererService);
    layoutOptimizer = module.get(LayoutOptimizerSkill);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  // ============================================================
  // exportToPPTX
  // ============================================================

  describe('exportToPPTX', () => {
    it('should export document without HTML slides as PPTX', async () => {
      const document = buildPPTDocument(2, false);

      const result = await service.exportToPPTX(document);

      expect(result).toBeDefined();
      expect(result.filename).toContain('Test Presentation');
      expect(result.filename).toContain('.pptx');
      expect(result.mimeType).toContain('presentationml');
      expect(result.slideCount).toBe(2);
    });

    it('should use HTML screenshot path for non-editable export with HTML slides', async () => {
      const document = buildPPTDocument(2, true);

      const result = await service.exportToPPTX(document, { editable: false });

      expect(result).toBeDefined();
      expect(result.slideCount).toBe(2);
    });

    it('should use native rendering for editable=true export', async () => {
      const document = buildPPTDocument(2, true);

      const result = await service.exportToPPTX(document, { editable: true });

      expect(result).toBeDefined();
      expect(result.filename).toContain('_editable');
    });

    it('should fallback to native rendering when no HTML slides present', async () => {
      const document = buildPPTDocument(2, false);

      const result = await service.exportToPPTX(document, { editable: false });

      expect(result).toBeDefined();
      expect(result.slideCount).toBe(2);
    });

    it('should set correct MIME type for PPTX', async () => {
      const document = buildPPTDocument(1, false);

      const result = await service.exportToPPTX(document);

      expect(result.mimeType).toBe(
        'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      );
    });

    it('should return buffer instance with data', async () => {
      const document = buildPPTDocument(1, false);

      const result = await service.exportToPPTX(document);

      expect(result.buffer).toBeDefined();
      expect(result.fileSize).toBeGreaterThan(0);
    });

    it('should handle single slide document', async () => {
      const document = buildPPTDocument(1, false);

      const result = await service.exportToPPTX(document);

      expect(result.slideCount).toBe(1);
    });

    it('should handle document with mixed HTML and non-HTML slides in non-editable mode', async () => {
      const document = buildPPTDocument(3, false);
      document.slides[0].html = '<div>HTML content</div>';

      const result = await service.exportToPPTX(document, { editable: false });

      expect(result).toBeDefined();
      expect(result.slideCount).toBe(3);
    });

    it('should include _editable suffix for editable export', async () => {
      const document = buildPPTDocument(1, false);

      const result = await service.exportToPPTX(document, { editable: true });

      expect(result.filename).toMatch(/_editable\.pptx$/);
    });

    it('should not include _editable suffix for default export', async () => {
      const document = buildPPTDocument(1, false);

      const result = await service.exportToPPTX(document);

      expect(result.filename).not.toContain('_editable');
    });

    it('should handle document with no slides', async () => {
      const document = buildPPTDocument(0, false);

      const result = await service.exportToPPTX(document);

      expect(result).toBeDefined();
      expect(result.slideCount).toBe(0);
    });
  });

  // ============================================================
  // exportFromPageContentEditable
  // ============================================================

  describe('exportFromPageContentEditable', () => {
    it('should export PageContent array to editable PPTX', async () => {
      const pages = [buildPageContent('Page 1'), buildPageContent('Page 2')];

      const result = await service.exportFromPageContentEditable(pages, {
        title: 'Content Export',
      });

      expect(result).toBeDefined();
      expect(result.filename).toContain('Content Export');
      expect(result.filename).toContain('_v4.pptx');
      expect(result.slideCount).toBe(2);
    });

    it('should call parameterizedRenderer.render for each page', async () => {
      const pages = [buildPageContent('P1'), buildPageContent('P2'), buildPageContent('P3')];

      await service.exportFromPageContentEditable(pages, { title: 'Test' });

      expect(parameterizedRenderer.render).toHaveBeenCalledTimes(3);
    });

    it('should pass page number correctly to renderer', async () => {
      const pages = [buildPageContent('Page 1'), buildPageContent('Page 2')];

      await service.exportFromPageContentEditable(pages, { title: 'Numbered' });

      expect(parameterizedRenderer.render).toHaveBeenNthCalledWith(
        1,
        expect.anything(),
        pages[0],
        expect.objectContaining({ pageNumber: 1 }),
      );
      expect(parameterizedRenderer.render).toHaveBeenNthCalledWith(
        2,
        expect.anything(),
        pages[1],
        expect.objectContaining({ pageNumber: 2 }),
      );
    });

    it('should use custom theme when provided', async () => {
      const pages = [buildPageContent('Themed Page')];
      const customTheme = {
        backgroundColor: '#FFFFFF',
        textPrimary: '#000000',
      } as any;

      await service.exportFromPageContentEditable(pages, {
        title: 'Custom Theme',
        theme: customTheme,
      });

      expect(parameterizedRenderer.render).toHaveBeenCalledWith(
        expect.anything(),
        pages[0],
        expect.objectContaining({ theme: customTheme }),
      );
    });

    it('should continue rendering remaining pages when one page fails', async () => {
      const pages = [buildPageContent('P1'), buildPageContent('P2'), buildPageContent('P3')];
      parameterizedRenderer.render
        .mockResolvedValueOnce({ success: true, renderedSections: 1, truncatedSections: [], errors: [] })
        .mockRejectedValueOnce(new Error('Page 2 render error'))
        .mockResolvedValueOnce({ success: true, renderedSections: 1, truncatedSections: [], errors: [] });

      const result = await service.exportFromPageContentEditable(pages, { title: 'Partial' });

      expect(result).toBeDefined();
      expect(result.slideCount).toBe(3);
    });

    it('should return correct MIME type for v4 export', async () => {
      const pages = [buildPageContent('Page')];

      const result = await service.exportFromPageContentEditable(pages, { title: 'Test' });

      expect(result.mimeType).toBe(
        'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      );
    });

    it('should handle empty pages array', async () => {
      const result = await service.exportFromPageContentEditable([], { title: 'Empty' });

      expect(result).toBeDefined();
      expect(result.slideCount).toBe(0);
      expect(parameterizedRenderer.render).not.toHaveBeenCalled();
    });

    it('should set document subtitle from options', async () => {
      const pages = [buildPageContent('Page 1')];

      const result = await service.exportFromPageContentEditable(pages, {
        title: 'With Subtitle',
        subtitle: 'The subtitle',
      });

      expect(result).toBeDefined();
    });
  });

  // ============================================================
  // getLayoutDecision
  // ============================================================

  describe('getLayoutDecision', () => {
    it('should return layout decision for page content', () => {
      const content = buildPageContent('Test Page');

      const result = service.getLayoutDecision(content);

      expect(result).toBeDefined();
      expect(layoutOptimizer.optimize).toHaveBeenCalledWith(content);
    });

    it('should return the layout from optimizer', () => {
      const content = buildPageContent('Test');
      const expectedLayout = {
        layoutType: 'comparison',
        gridConfig: { columns: 2, rows: 1, columnWidths: [0.5, 0.5], rowHeights: [1.0], gap: 0.1 },
        titleArea: { show: true, heightRatio: 0.2, alignment: 'left' },
        footerArea: { show: false, heightRatio: 0.05 },
        sectionPlacements: [],
        visualHierarchy: { primaryIndex: 0, secondaryIndices: [], tertiaryIndices: [] },
        confidence: 0.85,
        reason: 'comparison layout',
      };
      layoutOptimizer.optimize.mockReturnValueOnce(expectedLayout as any);

      const result = service.getLayoutDecision(content);

      expect(result.layoutType).toBe('comparison');
      expect(result.confidence).toBe(0.85);
    });
  });

  // ============================================================
  // exportFromHtmlSlides
  // ============================================================

  describe('exportFromHtmlSlides', () => {
    it('should export HTML slides to PPTX', async () => {
      const htmlSlides = [
        '<div>Slide 1 content</div>',
        '<div>Slide 2 content</div>',
      ];

      const result = await service.exportFromHtmlSlides(htmlSlides, {
        title: 'HTML Export',
      });

      expect(result).toBeDefined();
      expect(result.filename).toContain('HTML Export');
      expect(result.slideCount).toBe(2);
    });

    it('should return correct MIME type', async () => {
      const htmlSlides = ['<div>Content</div>'];

      const result = await service.exportFromHtmlSlides(htmlSlides, { title: 'Test' });

      expect(result.mimeType).toBe(
        'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      );
    });

    it('should handle empty HTML slides array', async () => {
      const result = await service.exportFromHtmlSlides([], { title: 'Empty HTML' });

      expect(result).toBeDefined();
      expect(result.slideCount).toBe(0);
    });

    it('should use puppeteer to screenshot each HTML slide', async () => {
      const htmlSlides = ['<div>Slide 1</div>', '<div>Slide 2</div>'];
      const puppeteer = require('puppeteer');

      await service.exportFromHtmlSlides(htmlSlides, { title: 'Screenshot Test' });

      expect(puppeteer.launch).toHaveBeenCalled();
    });

    it('should wrap partial HTML for screenshot', async () => {
      const partialHtml = '<div class="slide">Slide content</div>';
      const puppeteer = require('puppeteer');
      const launchResult = await puppeteer.launch();
      const page = await launchResult.newPage();

      // Reset call count before test
      page.setContent.mockClear();

      await service.exportFromHtmlSlides([partialHtml], { title: 'Wrapped' });

      expect(page.setContent).toHaveBeenCalledWith(
        expect.stringContaining('<!DOCTYPE html>'),
        expect.any(Object),
      );
    });

    it('should not wrap complete HTML documents', async () => {
      const fullHtml = '<!DOCTYPE html><html><body>Complete</body></html>';
      const puppeteer = require('puppeteer');
      const launchResult = await puppeteer.launch();
      const page = await launchResult.newPage();

      page.setContent.mockClear();

      await service.exportFromHtmlSlides([fullHtml], { title: 'Full HTML' });

      expect(page.setContent).toHaveBeenCalledWith(
        fullHtml,
        expect.any(Object),
      );
    });
  });

  // ============================================================
  // exportToPDF
  // ============================================================

  describe('exportToPDF', () => {
    it('should export document to PDF', async () => {
      const document = buildPPTDocument(2, false);

      const result = await service.exportToPDF(document);

      expect(result).toBeDefined();
      expect(result.filename).toBe('Test Presentation.pdf');
      expect(result.mimeType).toBe('application/pdf');
      expect(result.slideCount).toBe(2);
    });

    it('should return PDF buffer', async () => {
      const document = buildPPTDocument(1, false);

      const result = await service.exportToPDF(document);

      expect(result.buffer).toBeDefined();
    });

    it('should use puppeteer for PDF generation', async () => {
      const document = buildPPTDocument(1, false);
      const puppeteer = require('puppeteer');

      await service.exportToPDF(document);

      expect(puppeteer.launch).toHaveBeenCalled();
    });

    it('should use HTML slides for same-source PDF export when HTML is available', async () => {
      const document = buildPPTDocument(2, true);
      const puppeteer = require('puppeteer');
      const launchResult = await puppeteer.launch();
      const page = await launchResult.newPage();
      page.setContent.mockClear();

      await service.exportToPDF(document);

      expect(page.setContent).toHaveBeenCalled();
    });

    it('should fallback to legacy HTML when no HTML slides present', async () => {
      const document = buildPPTDocument(2, false);
      const puppeteer = require('puppeteer');
      const launchResult = await puppeteer.launch();
      const page = await launchResult.newPage();
      page.setContent.mockClear();

      await service.exportToPDF(document);

      expect(page.setContent).toHaveBeenCalled();
    });

    it('should call pdf() on puppeteer page', async () => {
      const document = buildPPTDocument(1, false);
      const puppeteer = require('puppeteer');
      const launchResult = await puppeteer.launch();
      const page = await launchResult.newPage();
      page.pdf.mockClear();

      await service.exportToPDF(document);

      expect(page.pdf).toHaveBeenCalled();
    });

    it('should set correct PDF page dimensions (landscape)', async () => {
      const document = buildPPTDocument(1, false);
      const puppeteer = require('puppeteer');
      const launchResult = await puppeteer.launch();
      const page = await launchResult.newPage();
      page.pdf.mockClear();

      await service.exportToPDF(document);

      expect(page.pdf).toHaveBeenCalledWith(
        expect.objectContaining({
          landscape: true,
          printBackground: true,
        }),
      );
    });
  });

  // ============================================================
  // exportToPNG
  // ============================================================

  describe('exportToPNG', () => {
    it('should export slides to PNG ZIP package', async () => {
      const document = buildPPTDocument(2, false);

      const result = await service.exportToPNG(document);

      expect(result).toBeDefined();
      expect(result.filename).toContain('Test Presentation');
      expect(result.filename).toContain('_slides.zip');
      expect(result.mimeType).toBe('application/zip');
      expect(result.slideCount).toBe(2);
    });

    it('should use puppeteer for PNG screenshots', async () => {
      const document = buildPPTDocument(1, false);
      const puppeteer = require('puppeteer');

      await service.exportToPNG(document);

      expect(puppeteer.launch).toHaveBeenCalled();
    });

    it('should screenshot each slide separately', async () => {
      const document = buildPPTDocument(3, false);
      const puppeteer = require('puppeteer');
      const launchResult = await puppeteer.launch();
      const page = await launchResult.newPage();
      page.screenshot.mockClear();

      await service.exportToPNG(document);

      expect(page.screenshot).toHaveBeenCalledTimes(3);
    });

    it('should use HTML for slides that have HTML content', async () => {
      const document = buildPPTDocument(2, true);
      const puppeteer = require('puppeteer');
      const launchResult = await puppeteer.launch();
      const page = await launchResult.newPage();
      page.setContent.mockClear();

      await service.exportToPNG(document);

      expect(page.setContent).toHaveBeenCalled();
    });

    it('should return buffer', async () => {
      const document = buildPPTDocument(1, false);

      const result = await service.exportToPNG(document);

      expect(result.buffer).toBeDefined();
    });
  });

  // ============================================================
  // Edge cases
  // ============================================================

  describe('edge cases', () => {
    it('should handle document title with special characters', async () => {
      const document = buildPPTDocument(1, false);
      document.title = 'Test & Report: "Q1 2024"';

      const result = await service.exportToPPTX(document);

      expect(result.filename).toContain('Test & Report');
    });

    it('should handle PageContent with empty sections for editable export', async () => {
      const pages: PageContent[] = [
        { title: 'Empty Slide', sections: [] },
      ];

      const result = await service.exportFromPageContentEditable(pages, { title: 'Empty' });

      expect(result).toBeDefined();
      expect(result.slideCount).toBe(1);
    });
  });
});
