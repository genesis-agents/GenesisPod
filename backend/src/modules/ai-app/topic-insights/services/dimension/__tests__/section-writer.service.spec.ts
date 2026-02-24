/**
 * SectionWriterService Unit Tests
 *
 * Tests for section writing and revision:
 * - writeSection: write a single section
 * - reviseSection: revise a section based on feedback
 * - Content quality checking
 * - Error handling for API errors and short content
 */

import { Test, TestingModule } from '@nestjs/testing';
import { SectionWriterService } from '../section-writer.service';
import { AIEngineFacade } from '@/modules/ai-engine/facade';
import { AIModelType } from '@prisma/client';

// ============================================================
// Helpers
// ============================================================

const makeSection = (overrides: Record<string, unknown> = {}) => ({
  id: 'section-1',
  title: '人工智能的发展历史',
  description: 'Cover the history and evolution of AI',
  targetWords: 800,
  keyPoints: ['Early AI research', 'Machine learning revolution', 'Deep learning era'],
  evidenceRequirements: {
    minReferences: 3,
    preferredTypes: ['academic', 'industry_report'],
  },
  agentConfig: null,
  order: 1,
  dependsOn: [],
  ...overrides,
});

const makeEvidenceData = (overrides: Record<string, unknown> = {}) => ({
  id: `evidence-${Math.random().toString(36).slice(2)}`,
  title: 'AI Research Paper 2024',
  content: 'This paper presents findings on deep learning advances in 2024.',
  url: 'https://arxiv.org/abs/2024.00001',
  source: 'WEB',
  publishedAt: '2024-01-01',
  credibilityScore: 0.9,
  relevanceScore: 0.85,
  author: 'John Doe',
  snippet: 'Key finding: deep learning outperforms...',
  ...overrides,
});

// ============================================================
// Mocks
// ============================================================

const mockAiFacade = {
  chat: jest.fn(),
};

// ============================================================
// Test suite
// ============================================================

describe('SectionWriterService', () => {
  let service: SectionWriterService;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SectionWriterService,
        { provide: AIEngineFacade, useValue: mockAiFacade },
      ],
    }).compile();

    service = module.get<SectionWriterService>(SectionWriterService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  // ============================================================
  // writeSection
  // ============================================================

  describe('writeSection', () => {
    const validContent = '# AI历史\n\n' + 'A'.repeat(500); // 500+ chars, well above minimum

    it('should write a section successfully', async () => {
      mockAiFacade.chat.mockResolvedValueOnce({
        content: validContent,
        model: 'gpt-4o',
        isError: false,
        tokensUsed: 300,
      });

      const result = await service.writeSection({
        section: makeSection(),
        evidenceData: [makeEvidenceData()],
      });

      expect(result.sectionId).toBe('section-1');
      expect(result.title).toBe('人工智能的发展历史');
      expect(result.content).toBeTruthy();
      expect(result.wordCount).toBeGreaterThan(0);
    });

    it('should call aiFacade.chat with CHAT model type', async () => {
      mockAiFacade.chat.mockResolvedValueOnce({
        content: validContent,
        model: 'gpt-4o',
        isError: false,
        tokensUsed: 300,
      });

      await service.writeSection({
        section: makeSection(),
        evidenceData: [],
      });

      expect(mockAiFacade.chat).toHaveBeenCalledWith(
        expect.objectContaining({
          modelType: AIModelType.CHAT,
        }),
      );
    });

    it('should use specified modelId when provided', async () => {
      mockAiFacade.chat.mockResolvedValueOnce({
        content: validContent,
        model: 'claude-3-sonnet',
        isError: false,
        tokensUsed: 400,
      });

      await service.writeSection({
        section: makeSection(),
        evidenceData: [],
        modelId: 'claude-3-sonnet',
      });

      expect(mockAiFacade.chat).toHaveBeenCalledWith(
        expect.objectContaining({
          model: 'claude-3-sonnet',
        }),
      );
    });

    it('should throw error when API returns error status', async () => {
      mockAiFacade.chat.mockResolvedValueOnce({
        content: 'Error: Rate limit exceeded',
        model: 'gpt-4o',
        isError: true,
        tokensUsed: 0,
      });

      await expect(
        service.writeSection({
          section: makeSection(),
          evidenceData: [],
        }),
      ).rejects.toThrow('API error while writing section');
    });

    it('should throw error when content is too short', async () => {
      mockAiFacade.chat.mockResolvedValueOnce({
        content: 'Too short', // Only 9 chars, way below minimum
        model: 'gpt-4o',
        isError: false,
        tokensUsed: 10,
      });

      await expect(
        service.writeSection({
          section: makeSection({ targetWords: 800 }),
          evidenceData: [],
        }),
      ).rejects.toThrow('Content too short');
    });

    it('should include temporal context in prompts when provided', async () => {
      mockAiFacade.chat.mockResolvedValueOnce({
        content: validContent,
        model: 'gpt-4o',
        isError: false,
        tokensUsed: 300,
      });

      const temporalContext = {
        currentDate: '2025年1月19日',
        freshnessRequirement: '需要2024年以内的最新数据',
      };

      await service.writeSection({
        section: makeSection(),
        evidenceData: [],
        temporalContext,
      });

      const chatCall = mockAiFacade.chat.mock.calls[0][0];
      const userMsg = chatCall.messages.find((m: { role: string }) => m.role === 'user');
      expect(userMsg?.content).toContain('2025年1月19日');
    });

    it('should include previous sections context when provided', async () => {
      mockAiFacade.chat.mockResolvedValueOnce({
        content: validContent,
        model: 'gpt-4o',
        isError: false,
        tokensUsed: 300,
      });

      const previousSections = [
        { title: '第一章', content: 'Content of chapter 1'.repeat(20) },
      ];

      await service.writeSection({
        section: makeSection(),
        evidenceData: [],
        previousSections,
      });

      const chatCall = mockAiFacade.chat.mock.calls[0][0];
      const userMsg = chatCall.messages.find((m: { role: string }) => m.role === 'user');
      expect(userMsg?.content).toContain('第一章');
    });

    it('should inject validation context when provided', async () => {
      mockAiFacade.chat.mockResolvedValueOnce({
        content: validContent,
        model: 'gpt-4o',
        isError: false,
        tokensUsed: 300,
      });

      await service.writeSection({
        section: makeSection(),
        evidenceData: [],
        validationContext: 'V5 VALIDATION: Ensure accuracy of all claims',
      });

      const chatCall = mockAiFacade.chat.mock.calls[0][0];
      const userMsg = chatCall.messages.find((m: { role: string }) => m.role === 'user');
      expect(userMsg?.content).toContain('V5 VALIDATION');
    });

    it('should record the actual model used in the result', async () => {
      mockAiFacade.chat.mockResolvedValueOnce({
        content: validContent,
        model: 'claude-3-opus',
        isError: false,
        tokensUsed: 500,
      });

      const result = await service.writeSection({
        section: makeSection(),
        evidenceData: [],
      });

      expect(result.actualModelId).toBe('claude-3-opus');
    });

    it('should use "long" outputLength task profile for section writing', async () => {
      mockAiFacade.chat.mockResolvedValueOnce({
        content: validContent,
        model: 'gpt-4o',
        isError: false,
        tokensUsed: 300,
      });

      await service.writeSection({
        section: makeSection(),
        evidenceData: [],
      });

      expect(mockAiFacade.chat).toHaveBeenCalledWith(
        expect.objectContaining({
          taskProfile: expect.objectContaining({ outputLength: 'long' }),
        }),
      );
    });

    it('should use English language instruction when topicLanguage is en', async () => {
      mockAiFacade.chat.mockResolvedValueOnce({
        content: validContent,
        model: 'gpt-4o',
        isError: false,
        tokensUsed: 300,
      });

      await service.writeSection({
        section: makeSection(),
        evidenceData: [],
        topicLanguage: 'en',
      });

      const chatCall = mockAiFacade.chat.mock.calls[0][0];
      const sysMsg = chatCall.messages.find((m: { role: string }) => m.role === 'system');
      expect(sysMsg?.content).toContain('English');
    });
  });

  // ============================================================
  // reviseSection
  // ============================================================

  describe('reviseSection', () => {
    const validRevisedContent = '# Revised AI History\n\n' + 'B'.repeat(500);

    it('should revise a section based on feedback', async () => {
      mockAiFacade.chat.mockResolvedValueOnce({
        content: validRevisedContent,
        model: 'gpt-4o',
        isError: false,
        tokensUsed: 400,
      });

      const result = await service.reviseSection({
        section: makeSection(),
        originalContent: 'Original content here',
        reviewFeedback: 'Need more depth and citations',
        revisionInstructions: 'Add at least 3 more references',
        evidenceData: [makeEvidenceData()],
      });

      expect(result.sectionId).toBe('section-1');
      expect(result.content).not.toBe('Original content here');
      expect(mockAiFacade.chat).toHaveBeenCalled();
    });

    it('should throw error when revised content is too short', async () => {
      mockAiFacade.chat.mockResolvedValueOnce({
        content: 'Too short revised',
        model: 'gpt-4o',
        isError: false,
        tokensUsed: 20,
      });

      await expect(
        service.reviseSection({
          section: makeSection({ targetWords: 800 }),
          originalContent: 'Original content',
          reviewFeedback: 'Expand this',
          revisionInstructions: 'Write more',
          evidenceData: [],
        }),
      ).rejects.toThrow('too short');
    });

    it('should use specified modelId for revision', async () => {
      mockAiFacade.chat.mockResolvedValueOnce({
        content: validRevisedContent,
        model: 'gemini-pro',
        isError: false,
        tokensUsed: 300,
      });

      await service.reviseSection({
        section: makeSection(),
        originalContent: 'Original',
        reviewFeedback: 'Fix this',
        revisionInstructions: 'Improve quality',
        evidenceData: [],
        modelId: 'gemini-pro',
      });

      expect(mockAiFacade.chat).toHaveBeenCalledWith(
        expect.objectContaining({
          model: 'gemini-pro',
        }),
      );
    });

    it('should include original content and feedback in revision prompt', async () => {
      mockAiFacade.chat.mockResolvedValueOnce({
        content: validRevisedContent,
        model: 'gpt-4o',
        isError: false,
        tokensUsed: 300,
      });

      await service.reviseSection({
        section: makeSection(),
        originalContent: 'This is the original draft',
        reviewFeedback: 'Needs improvement',
        revisionInstructions: 'Add more details',
        evidenceData: [],
      });

      const chatCall = mockAiFacade.chat.mock.calls[0][0];
      const userMsg = chatCall.messages.find((m: { role: string }) => m.role === 'user');
      expect(userMsg?.content).toContain('This is the original draft');
      expect(userMsg?.content).toContain('Needs improvement');
    });
  });
});
