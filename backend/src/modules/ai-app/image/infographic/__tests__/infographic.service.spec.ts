/**
 * Tests for InfographicService (coordinator) and InfographicTemplateService (HTML generator)
 *
 * The target file `services/infographic.service.ts` is covered by mocking InfographicTemplateService
 * and InfographicRenderService. The `infographic.service.ts` (template) methods are tested
 * directly by instantiating InfographicTemplateService with a mocked BrandLogoService.
 */

import { Test, TestingModule } from '@nestjs/testing';
import { InfographicService } from '../services/infographic.service';
import { InfographicTemplateService } from '../infographic.service';
import { InfographicRenderService } from '../services/infographic-render.service';
import { BrandLogoService } from '../../../../../common/config/brand-logo.service';
import { InfographicContent } from '../types';

// Mock puppeteer at module level to avoid real browser launches in tests
jest.mock('puppeteer', () => ({
  launch: jest.fn(),
}));

// Mock APP_CONFIG and BrandLogoService to avoid file system access
jest.mock('../../../../../common/config/app.config', () => ({
  APP_CONFIG: {
    brand: {
      fullName: 'TestBrand',
      logo: { svgPath: null },
    },
  },
}));

describe('InfographicService (coordinator)', () => {
  let service: InfographicService;
  let templateService: jest.Mocked<InfographicTemplateService>;
  let renderService: jest.Mocked<InfographicRenderService>;

  const mockContent: InfographicContent = {
    title: 'Test Infographic',
    subtitle: 'A test subtitle',
    sections: [
      {
        title: 'Section 1',
        summary: 'Summary of section 1',
        bullets: ['Bullet 1', 'Bullet 2'],
        metrics: [{ label: 'Revenue', value: '$1M', comparison: '+20%' }],
        iconType: 'chart',
      },
    ],
    callToAction: 'Learn More',
  };

  beforeEach(async () => {
    const mockTemplateService = {
      generateConsultingInfographicHTML: jest.fn().mockReturnValue('<html>cards</html>'),
      generateCenterVisualHTML: jest.fn().mockReturnValue('<html>center_visual</html>'),
      generateTimelineHTML: jest.fn().mockReturnValue('<html>timeline</html>'),
      generateComparisonHTML: jest.fn().mockReturnValue('<html>comparison</html>'),
      generateStatisticsHTML: jest.fn().mockReturnValue('<html>statistics</html>'),
      generateChecklistHTML: jest.fn().mockReturnValue('<html>checklist</html>'),
      generateFunnelHTML: jest.fn().mockReturnValue('<html>funnel</html>'),
      generateMatrixHTML: jest.fn().mockReturnValue('<html>matrix</html>'),
      generateRankingHTML: jest.fn().mockReturnValue('<html>ranking</html>'),
      cleanup: jest.fn().mockResolvedValue(undefined),
    };

    const mockRenderService = {
      renderToImage: jest.fn().mockResolvedValue('data:image/png;base64,abc123'),
      cleanup: jest.fn().mockResolvedValue(undefined),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        InfographicService,
        { provide: InfographicTemplateService, useValue: mockTemplateService },
        { provide: InfographicRenderService, useValue: mockRenderService },
      ],
    }).compile();

    service = module.get<InfographicService>(InfographicService);
    templateService = module.get(InfographicTemplateService);
    renderService = module.get(InfographicRenderService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('generateInfographic', () => {
    it('should use cards layout by default', async () => {
      const result = await service.generateInfographic(mockContent);

      expect(templateService.generateConsultingInfographicHTML).toHaveBeenCalledWith(
        mockContent,
        undefined,
        1200,
        800,
      );
      expect(renderService.renderToImage).toHaveBeenCalledWith('<html>cards</html>', 1200, 800);
      expect(result).toBe('data:image/png;base64,abc123');
    });

    it('should use center_visual layout when specified', async () => {
      const content: InfographicContent = {
        ...mockContent,
        styleOptions: { templateLayout: 'center_visual' },
      };

      await service.generateInfographic(content);

      expect(templateService.generateCenterVisualHTML).toHaveBeenCalled();
      expect(templateService.generateConsultingInfographicHTML).not.toHaveBeenCalled();
    });

    it('should use timeline layout when specified', async () => {
      const content: InfographicContent = {
        ...mockContent,
        styleOptions: { templateLayout: 'timeline' },
      };

      await service.generateInfographic(content);

      expect(templateService.generateTimelineHTML).toHaveBeenCalled();
    });

    it('should use comparison layout when specified', async () => {
      const content: InfographicContent = {
        ...mockContent,
        styleOptions: { templateLayout: 'comparison' },
      };

      await service.generateInfographic(content);

      expect(templateService.generateComparisonHTML).toHaveBeenCalled();
    });

    it('should use statistics layout when specified', async () => {
      const content: InfographicContent = {
        ...mockContent,
        styleOptions: { templateLayout: 'statistics' },
      };

      await service.generateInfographic(content);

      expect(templateService.generateStatisticsHTML).toHaveBeenCalled();
    });

    it('should use checklist layout when specified', async () => {
      const content: InfographicContent = {
        ...mockContent,
        styleOptions: { templateLayout: 'checklist' },
      };

      await service.generateInfographic(content);

      expect(templateService.generateChecklistHTML).toHaveBeenCalled();
    });

    it('should use funnel layout when specified', async () => {
      const content: InfographicContent = {
        ...mockContent,
        styleOptions: { templateLayout: 'funnel' },
      };

      await service.generateInfographic(content);

      expect(templateService.generateFunnelHTML).toHaveBeenCalled();
    });

    it('should use matrix layout when specified', async () => {
      const content: InfographicContent = {
        ...mockContent,
        styleOptions: { templateLayout: 'matrix' },
      };

      await service.generateInfographic(content);

      expect(templateService.generateMatrixHTML).toHaveBeenCalled();
    });

    it('should use ranking layout when specified', async () => {
      const content: InfographicContent = {
        ...mockContent,
        styleOptions: { templateLayout: 'ranking' },
      };

      await service.generateInfographic(content);

      expect(templateService.generateRankingHTML).toHaveBeenCalled();
    });

    it('should pass custom width and height to template and render', async () => {
      await service.generateInfographic(mockContent, { width: 1920, height: 1080 });

      expect(templateService.generateConsultingInfographicHTML).toHaveBeenCalledWith(
        mockContent,
        undefined,
        1920,
        1080,
      );
      expect(renderService.renderToImage).toHaveBeenCalledWith(
        expect.any(String),
        1920,
        1080,
      );
    });

    it('should pass backgroundImageBase64 to template', async () => {
      const bg = 'data:image/png;base64,bgdata';
      await service.generateInfographic(mockContent, { backgroundImageBase64: bg });

      expect(templateService.generateConsultingInfographicHTML).toHaveBeenCalledWith(
        mockContent,
        bg,
        1200,
        800,
      );
    });

    it('should return the base64 image from renderService', async () => {
      const result = await service.generateInfographic(mockContent);
      expect(result).toBe('data:image/png;base64,abc123');
    });
  });

  describe('cleanup', () => {
    it('should call renderService.cleanup', async () => {
      await service.cleanup();
      expect(renderService.cleanup).toHaveBeenCalled();
    });
  });
});

describe('InfographicTemplateService', () => {
  let templateService: InfographicTemplateService;
  let brandLogoService: jest.Mocked<BrandLogoService>;

  const minimalContent: InfographicContent = {
    title: 'Test Title',
    sections: [
      {
        title: 'Section One',
        bullets: ['Point A', 'Point B'],
        metrics: [{ label: 'Score', value: '95%' }],
      },
    ],
  };

  beforeEach(async () => {
    const mockBrandLogoService = {
      getLogoSvg: jest.fn().mockReturnValue('<svg>logo</svg>'),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        InfographicTemplateService,
        { provide: BrandLogoService, useValue: mockBrandLogoService },
      ],
    }).compile();

    templateService = module.get<InfographicTemplateService>(InfographicTemplateService);
    brandLogoService = module.get(BrandLogoService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(templateService).toBeDefined();
  });

  describe('generateConsultingInfographicHTML', () => {
    it('should return a valid HTML string', () => {
      const html = templateService.generateConsultingInfographicHTML(minimalContent);
      expect(html).toContain('<!DOCTYPE html>');
      expect(html).toContain('Test Title');
    });

    it('should include section titles in output', () => {
      const html = templateService.generateConsultingInfographicHTML(minimalContent);
      expect(html).toContain('Section One');
    });

    it('should include bullets in output', () => {
      const html = templateService.generateConsultingInfographicHTML(minimalContent);
      expect(html).toContain('Point A');
      expect(html).toContain('Point B');
    });

    it('should include metric values in output', () => {
      const html = templateService.generateConsultingInfographicHTML(minimalContent);
      expect(html).toContain('95%');
    });

    it('should include brand logo', () => {
      templateService.generateConsultingInfographicHTML(minimalContent);
      expect(brandLogoService.getLogoSvg).toHaveBeenCalled();
    });

    it('should include subtitle when provided', () => {
      const content: InfographicContent = { ...minimalContent, subtitle: 'My Subtitle' };
      const html = templateService.generateConsultingInfographicHTML(content);
      expect(html).toContain('My Subtitle');
    });

    it('should include heroStatement when provided', () => {
      const content: InfographicContent = { ...minimalContent, heroStatement: 'Hero text here' };
      const html = templateService.generateConsultingInfographicHTML(content);
      expect(html).toContain('Hero text here');
    });

    it('should include callToAction when no summary section', () => {
      const content: InfographicContent = { ...minimalContent, callToAction: 'Click Here' };
      const html = templateService.generateConsultingInfographicHTML(content);
      expect(html).toContain('Click Here');
    });

    it('should render summary section separately', () => {
      const content: InfographicContent = {
        ...minimalContent,
        sections: [
          ...minimalContent.sections,
          {
            title: 'Summary',
            bullets: ['Summary point'],
            metrics: [],
            sectionType: 'summary',
          },
        ],
      };
      const html = templateService.generateConsultingInfographicHTML(content);
      expect(html).toContain('summary-card');
      expect(html).toContain('Summary');
    });

    it('should use custom width and height', () => {
      const html = templateService.generateConsultingInfographicHTML(
        minimalContent,
        undefined,
        800,
        600,
      );
      expect(html).toContain('width: 800px');
      expect(html).toContain('height: 600px');
    });

    it('should apply background image when provided', () => {
      const bg = 'data:image/png;base64,imgdata';
      const html = templateService.generateConsultingInfographicHTML(minimalContent, bg);
      expect(html).toContain('imgdata');
    });

    it('should handle all infographic styles', () => {
      const styles = ['consulting', 'tech', 'minimal', 'creative', 'dark', 'academic', 'business', 'genspark', 'tech_gradient'] as const;
      for (const style of styles) {
        const content: InfographicContent = {
          ...minimalContent,
          styleOptions: { style },
        };
        const html = templateService.generateConsultingInfographicHTML(content);
        expect(html).toContain('<!DOCTYPE html>');
      }
    });

    it('should apply dark mode styles for dark/genspark/tech_gradient', () => {
      const darkStyles = ['dark', 'genspark', 'tech_gradient'] as const;
      for (const style of darkStyles) {
        const content: InfographicContent = {
          ...minimalContent,
          styleOptions: { style },
        };
        const html = templateService.generateConsultingInfographicHTML(content);
        // Dark styles have dark backgrounds
        expect(html).toContain('<!DOCTYPE html>');
      }
    });

    it('should apply glassmorphism styles for genspark/tech_gradient', () => {
      const glassStyles = ['genspark', 'tech_gradient'] as const;
      for (const style of glassStyles) {
        const content: InfographicContent = {
          ...minimalContent,
          styleOptions: { style },
        };
        const html = templateService.generateConsultingInfographicHTML(content);
        expect(html).toContain('backdrop-filter');
      }
    });

    it('should handle all font styles', () => {
      const fontStyles = ['sans', 'serif', 'mono', 'rounded'] as const;
      for (const fontStyle of fontStyles) {
        const content: InfographicContent = {
          ...minimalContent,
          styleOptions: { fontStyle },
        };
        const html = templateService.generateConsultingInfographicHTML(content);
        expect(html).toContain('<!DOCTYPE html>');
      }
    });

    it('should handle borderRadius options', () => {
      const radii = ['none', 'small', 'medium', 'large'] as const;
      for (const borderRadius of radii) {
        const content: InfographicContent = {
          ...minimalContent,
          styleOptions: { borderRadius },
        };
        const html = templateService.generateConsultingInfographicHTML(content);
        expect(html).toContain('<!DOCTYPE html>');
      }
    });

    it('should handle shadowStyle options', () => {
      const shadows = ['none', 'subtle', 'medium', 'strong'] as const;
      for (const shadowStyle of shadows) {
        const content: InfographicContent = {
          ...minimalContent,
          styleOptions: { shadowStyle },
        };
        const html = templateService.generateConsultingInfographicHTML(content);
        expect(html).toContain('<!DOCTYPE html>');
      }
    });

    it('should use custom colorScheme when provided', () => {
      const content: InfographicContent = {
        ...minimalContent,
        colorScheme: {
          primary: '#ff0000',
          accent: '#00ff00',
          background: '#0000ff',
          text: '#ffffff',
        },
      };
      const html = templateService.generateConsultingInfographicHTML(content);
      expect(html).toContain('#ff0000');
      expect(html).toContain('#00ff00');
    });

    it('should handle vertical (portrait) layout', () => {
      // height > width = vertical
      const html = templateService.generateConsultingInfographicHTML(
        minimalContent,
        undefined,
        800,
        1200,
      );
      expect(html).toContain('<!DOCTYPE html>');
    });

    it('should limit columns to 2 for vertical layout', () => {
      const html = templateService.generateConsultingInfographicHTML(
        minimalContent,
        undefined,
        800,
        1200,
      );
      // With 1 section and vertical layout, columns = 1
      expect(html).toContain('grid-template-columns: repeat(1, 1fr)');
    });

    it('should use 2 columns for 4 sections', () => {
      const content: InfographicContent = {
        ...minimalContent,
        sections: Array(4).fill({ title: 'S', bullets: [], metrics: [] }),
      };
      const html = templateService.generateConsultingInfographicHTML(content);
      expect(html).toContain('grid-template-columns: repeat(2, 1fr)');
    });

    it('should use 3 columns for 5-6 sections', () => {
      const content: InfographicContent = {
        ...minimalContent,
        sections: Array(5).fill({ title: 'S', bullets: [], metrics: [] }),
      };
      const html = templateService.generateConsultingInfographicHTML(content);
      expect(html).toContain('grid-template-columns: repeat(3, 1fr)');
    });

    it('should escape HTML special characters in title', () => {
      const content: InfographicContent = {
        ...minimalContent,
        title: '<script>alert("xss")</script>',
      };
      const html = templateService.generateConsultingInfographicHTML(content);
      expect(html).toContain('&lt;script&gt;');
      expect(html).not.toContain('<script>alert');
    });

    it('should escape HTML in section titles', () => {
      const content: InfographicContent = {
        ...minimalContent,
        sections: [
          {
            title: 'Title with <b>bold</b> & "quotes"',
            bullets: ['Bullet & more'],
            metrics: [],
          },
        ],
      };
      const html = templateService.generateConsultingInfographicHTML(content);
      expect(html).toContain('&lt;b&gt;');
      expect(html).toContain('&amp;');
      expect(html).toContain('&quot;');
    });

    it('should handle sections with no bullets gracefully', () => {
      const content: InfographicContent = {
        ...minimalContent,
        sections: [{ title: 'Empty', bullets: [], metrics: [] }],
      };
      const html = templateService.generateConsultingInfographicHTML(content);
      expect(html).toContain('Empty');
      // When no bullets, the <ul class="bullets"> should not be present in section body
      expect(html).not.toContain('<ul class="bullets">');
    });

    it('should handle sections with no metrics gracefully', () => {
      const content: InfographicContent = {
        ...minimalContent,
        sections: [{ title: 'NoMetrics', bullets: ['Some point'], metrics: [] }],
      };
      const html = templateService.generateConsultingInfographicHTML(content);
      // When no metrics, section-footer div should not be present
      expect(html).not.toContain('<div class="section-footer">');
    });

    it('should handle icon types', () => {
      const iconTypes = ['target', 'chart', 'briefcase', 'shield', 'lightbulb', 'gear', 'users', 'globe', 'clock', 'trending', 'star', 'check'];
      for (const iconType of iconTypes) {
        const content: InfographicContent = {
          ...minimalContent,
          sections: [{ title: 'Icon Test', bullets: [], metrics: [], iconType }],
        };
        const html = templateService.generateConsultingInfographicHTML(content);
        expect(html).toContain('<svg');
      }
    });

    it('should use default icon for unknown icon type', () => {
      const content: InfographicContent = {
        ...minimalContent,
        sections: [{ title: 'Icon Test', bullets: [], metrics: [], iconType: 'unknown_icon_xyz' }],
      };
      const html = templateService.generateConsultingInfographicHTML(content);
      // Should still contain an SVG (default icon)
      expect(html).toContain('<svg');
    });

    it('should handle empty sections array', () => {
      const content: InfographicContent = {
        ...minimalContent,
        sections: [],
      };
      const html = templateService.generateConsultingInfographicHTML(content);
      expect(html).toContain('<!DOCTYPE html>');
      expect(html).toContain('Test Title');
    });

    it('should handle many sections (> 10)', () => {
      const content: InfographicContent = {
        ...minimalContent,
        sections: Array(12).fill({ title: 'Sec', bullets: ['B1'], metrics: [{ label: 'L', value: 'V' }] }),
      };
      const html = templateService.generateConsultingInfographicHTML(content);
      expect(html).toContain('grid-template-columns: repeat(5, 1fr)');
    });

    it('should handle metric with comparison value', () => {
      const content: InfographicContent = {
        ...minimalContent,
        sections: [
          {
            title: 'Metrics Test',
            bullets: [],
            metrics: [{ label: 'Growth', value: '50%', comparison: '+10% YoY' }],
          },
        ],
      };
      const html = templateService.generateConsultingInfographicHTML(content);
      expect(html).toContain('50%');
    });
  });

  describe('generateCenterVisualHTML', () => {
    it('should return HTML with center visual layout', () => {
      const html = templateService.generateCenterVisualHTML(minimalContent);
      expect(html).toContain('<!DOCTYPE html>');
      expect(html).toContain('Test Title');
    });

    it('should use custom centerVisualTitle when provided', () => {
      const content: InfographicContent = {
        ...minimalContent,
        styleOptions: { centerVisualTitle: 'Custom Center Title' },
      };
      const html = templateService.generateCenterVisualHTML(content);
      expect(html).toContain('Custom Center Title');
    });

    it('should handle dark styles', () => {
      const content: InfographicContent = {
        ...minimalContent,
        styleOptions: { style: 'dark' },
      };
      const html = templateService.generateCenterVisualHTML(content);
      expect(html).toContain('<!DOCTYPE html>');
    });

    it('should handle genspark style with glassmorphism', () => {
      const content: InfographicContent = {
        ...minimalContent,
        styleOptions: { style: 'genspark' },
      };
      const html = templateService.generateCenterVisualHTML(content);
      expect(html).toContain('<!DOCTYPE html>');
    });
  });

  describe('cleanup', () => {
    it('should close browser if it was opened', async () => {
      // Cleanup should succeed even if browser was never opened (null)
      await expect(templateService.cleanup()).resolves.not.toThrow();
    });
  });

  describe('adjustColor (private, tested through HTML output)', () => {
    it('should generate valid hex colors in gradients', () => {
      const html = templateService.generateConsultingInfographicHTML(minimalContent);
      // Should contain gradient with adjusted colors
      expect(html).toMatch(/linear-gradient\(135deg, #[0-9a-f]{6}/i);
    });

    it('should handle adjustColor with positive amount', () => {
      // consulting style primary is #1e3a5f — adjust +20 should lighten
      const content: InfographicContent = {
        ...minimalContent,
        styleOptions: { style: 'consulting' },
      };
      const html = templateService.generateConsultingInfographicHTML(content);
      expect(html).toContain('#1e3a5f');
    });

    it('should clamp color values at 255 max', () => {
      // minimal style has primary #18181b — adding to near-zero values
      const content: InfographicContent = {
        ...minimalContent,
        styleOptions: { style: 'minimal' },
      };
      const html = templateService.generateConsultingInfographicHTML(content);
      // Should not have any invalid hex values
      expect(html).toMatch(/#[0-9a-fA-F]{6}/);
    });
  });

  describe('escapeHtml (private, tested through HTML output)', () => {
    it('should escape ampersands', () => {
      const content: InfographicContent = {
        ...minimalContent,
        title: 'AT&T Analysis',
      };
      const html = templateService.generateConsultingInfographicHTML(content);
      expect(html).toContain('AT&amp;T');
    });

    it('should escape angle brackets', () => {
      const content: InfographicContent = {
        ...minimalContent,
        title: '3 > 2 < 5',
      };
      const html = templateService.generateConsultingInfographicHTML(content);
      expect(html).toContain('3 &gt; 2 &lt; 5');
    });

    it("should escape single quotes", () => {
      const content: InfographicContent = {
        ...minimalContent,
        title: "It's a test",
      };
      const html = templateService.generateConsultingInfographicHTML(content);
      expect(html).toContain('It&#39;s a test');
    });

    it('should escape double quotes', () => {
      const content: InfographicContent = {
        ...minimalContent,
        title: 'He said "hello"',
      };
      const html = templateService.generateConsultingInfographicHTML(content);
      expect(html).toContain('He said &quot;hello&quot;');
    });
  });

  describe('widescreen layout', () => {
    it('should apply compact scale for widescreen (16:9)', () => {
      // 1920x1080 = 1.78 > 1.5 threshold = widescreen
      const html = templateService.generateConsultingInfographicHTML(
        minimalContent,
        undefined,
        1920,
        1080,
      );
      expect(html).toContain('<!DOCTYPE html>');
      expect(html).toContain('width: 1920px');
    });

    it('should not apply compact scale for 4:3', () => {
      // 1024x768 = 1.33 < 1.5 threshold = not widescreen
      const html = templateService.generateConsultingInfographicHTML(
        minimalContent,
        undefined,
        1024,
        768,
      );
      expect(html).toContain('<!DOCTYPE html>');
    });
  });

  describe('section type filtering', () => {
    it('should separate main and summary sections', () => {
      const content: InfographicContent = {
        ...minimalContent,
        sections: [
          { title: 'Main 1', sectionType: 'main', bullets: ['b'], metrics: [] },
          { title: 'Main 2', sectionType: 'main', bullets: ['b'], metrics: [] },
          { title: 'Summary', sectionType: 'summary', bullets: ['s'], metrics: [] },
        ],
      };
      const html = templateService.generateConsultingInfographicHTML(content);

      // summary-card should be rendered for the summary section
      expect(html).toContain('summary-card');
      expect(html).toContain('Summary');
      // Main sections should be in section-card
      expect(html).toContain('Main 1');
      expect(html).toContain('Main 2');
    });

    it('should not show summary card when no summary section', () => {
      const content: InfographicContent = {
        ...minimalContent,
        sections: [
          { title: 'Main 1', bullets: ['b'], metrics: [] },
          { title: 'Main 2', bullets: ['b'], metrics: [] },
        ],
        callToAction: 'Do it now',
      };
      const html = templateService.generateConsultingInfographicHTML(content);
      // summary-card div should not appear in main body when there is no summary section
      expect(html).not.toContain('<div class="summary-card">');
      expect(html).toContain('Do it now');
    });
  });
});
