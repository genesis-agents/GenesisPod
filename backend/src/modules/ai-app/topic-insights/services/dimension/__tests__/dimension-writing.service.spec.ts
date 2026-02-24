/**
 * DimensionWritingService Unit Tests
 *
 * Tests for the dimension writing phase (Phase 2 & 3):
 * - executeWritingPhase
 * - section writing with dependency tracking
 * - leader review and integration
 */

import { Test, TestingModule } from '@nestjs/testing';
import { DimensionWritingService } from '../dimension-writing.service';
import { PrismaService } from '@/common/prisma/prisma.service';
import { ResearchLeaderService } from '../../core/research-leader.service';
import { SectionWriterService } from '../section-writer.service';
import { ResearchEventEmitterService } from '../../core/research-event-emitter.service';
import { AgentActivityService } from '../../monitoring/agent-activity.service';
import { DimensionStatus } from '@prisma/client';

// ============================================================
// Helpers
// ============================================================

const makeResearchTopic = (overrides: Record<string, unknown> = {}) => ({
  id: 'topic-1',
  name: 'AI Technology Trends',
  description: 'Research on AI trends',
  userId: 'user-1',
  language: 'zh',
  reportStyle: 'COMPREHENSIVE',
  config: null,
  createdAt: new Date(),
  updatedAt: new Date(),
  ...overrides,
});

const makeTopicDimension = (overrides: Record<string, unknown> = {}) => ({
  id: 'dim-1',
  name: '技术发展',
  description: 'Technological development dimension',
  topicId: 'topic-1',
  status: DimensionStatus.PENDING,
  searchSources: ['WEB'],
  searchKeywords: ['AI', 'technology'],
  priority: 1,
  order: 1,
  estimatedTime: 30,
  createdAt: new Date(),
  updatedAt: new Date(),
  ...overrides,
});

const makeSectionPlan = (overrides: Record<string, unknown> = {}) => ({
  id: `section-${Math.random().toString(36).slice(2)}`,
  title: 'AI Development History',
  description: 'Historical overview',
  targetWords: 600,
  keyPoints: ['1950s origins', '1980s expert systems', '2010s deep learning'],
  evidenceRequirements: { minReferences: 2, preferredTypes: ['academic'] },
  agentConfig: null,
  order: 1,
  dependsOn: [],
  ...overrides,
});

const makeOutline = (sections: unknown[] = [makeSectionPlan()]) => {
  const secs = sections as Array<{ id: string }>;
  return {
    sections,
    totalWords: 3000,
    estimatedTime: 60,
    intentUnderstanding: {
      coreQuestion: 'What are the AI development trends?',
      scope: {
        included: ['machine learning', 'deep learning'],
        excluded: ['robotics'],
      },
      expectedDepth: 'comprehensive',
    },
    allocatedFigures: [],
    executionPlan: {
      parallelGroups: [secs.map((s) => s.id)],
    },
  };
};

const makeSearchPhaseResult = (overrides: Record<string, unknown> = {}) => ({
  dimensionId: 'dim-1',
  dimensionName: '技术发展',
  enrichedResults: [],
  evidenceData: [
    {
      id: 'ev-1',
      title: 'AI 2024 Report',
      content: 'Comprehensive AI analysis for 2024.',
      url: 'https://ai-report.com/2024',
      source: 'WEB',
      credibilityScore: 0.85,
      relevanceScore: 0.9,
    },
  ],
  evidenceSummary: 'Evidence collected from web sources.',
  searchResultsRecord: {},
  temporalContext: {
    currentDate: '2025年1月19日',
    freshnessRequirement: '优先使用2024年数据',
  },
  figuresSummary: '',
  leaderContextSummary: '',
  ...overrides,
});

const makeSectionWriteResult = (overrides: Record<string, unknown> = {}) => ({
  sectionId: 'section-1',
  title: 'AI Development History',
  content: '# AI历史\n\n' + 'A'.repeat(600),
  wordCount: 650,
  referencesUsed: ['ev-1'],
  generatedCharts: [],
  figureReferences: [],
  actualModelId: 'gpt-4o',
  ...overrides,
});

const makeIntegratedResult = () => ({
  title: 'Integrated Analysis',
  content: '## Analysis\n\nThis is the integrated result content.',
  metadata: {
    summary: 'Summary of AI development trends.',
    keyFindings: ['Finding 1', 'Finding 2'],
    confidence: 0.85,
  },
  wordCount: 2000,
});

// ============================================================
// Mocks
// ============================================================

const mockPrisma = {
  topicDimension: {
    update: jest.fn(),
  },
  researchEvidence: {
    create: jest.fn(),
    createMany: jest.fn(),
  },
  researchTopic: {
    findUnique: jest.fn().mockResolvedValue({ language: 'zh' }),
  },
};

const mockLeaderService = {
  reviewSection: jest.fn(),
  reviewSectionOutput: jest.fn(),
  integrateResults: jest.fn(),
  integrateDimensionResults: jest.fn(),
  extractClaims: jest.fn().mockResolvedValue([]),
};

const mockSectionWriter = {
  writeSection: jest.fn(),
  reviseSection: jest.fn(),
  writeSectionsParallel: jest.fn(),
};

const mockEventEmitter = {
  emitLeaderPlanReady: jest.fn().mockResolvedValue(undefined),
  emitLeaderThinking: jest.fn().mockResolvedValue(undefined),
  emitSectionCompleted: jest.fn().mockResolvedValue(undefined),
  emitDimensionCompleted: jest.fn().mockResolvedValue(undefined),
  emitAgentWriting: jest.fn().mockResolvedValue(undefined),
  emitAgentReviewing: jest.fn().mockResolvedValue(undefined),
  emitAgentWorking: jest.fn().mockResolvedValue(undefined),
};

const mockAgentActivity = {
  startThinkingPhase: jest.fn().mockResolvedValue(undefined),
  endThinkingPhase: jest.fn().mockResolvedValue(undefined),
  recordActivity: jest.fn().mockResolvedValue(undefined),
  recordReviewActivity: jest.fn().mockResolvedValue(undefined),
};

// ============================================================
// Test suite
// ============================================================

describe('DimensionWritingService', () => {
  let service: DimensionWritingService;

  beforeEach(async () => {
    jest.clearAllMocks();

    mockSectionWriter.writeSection.mockResolvedValue(makeSectionWriteResult());
    mockSectionWriter.writeSectionsParallel.mockResolvedValue([makeSectionWriteResult()]);
    mockLeaderService.reviewSection.mockResolvedValue({
      approved: true,
      feedback: 'Looks good',
      revisionInstructions: null,
    });
    mockLeaderService.reviewSectionOutput.mockResolvedValue({
      approved: true,
      score: 90,
      feedback: 'Looks good',
      revisionInstructions: null,
    });
    mockLeaderService.integrateResults.mockResolvedValue(makeIntegratedResult());
    mockLeaderService.integrateDimensionResults.mockResolvedValue(makeIntegratedResult());
    mockPrisma.topicDimension.update.mockResolvedValue({});
    mockPrisma.researchEvidence.createMany = jest.fn().mockResolvedValue({ count: 0 });

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DimensionWritingService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: ResearchLeaderService, useValue: mockLeaderService },
        { provide: SectionWriterService, useValue: mockSectionWriter },
        { provide: ResearchEventEmitterService, useValue: mockEventEmitter },
        { provide: AgentActivityService, useValue: mockAgentActivity },
      ],
    }).compile();

    service = module.get<DimensionWritingService>(DimensionWritingService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  // ============================================================
  // executeWritingPhase
  // ============================================================

  describe('executeWritingPhase', () => {
    it('should execute writing phase and return success result', async () => {
      const topic = makeResearchTopic();
      const dimension = makeTopicDimension();
      const searchResult = makeSearchPhaseResult();
      const outline = makeOutline();

      const result = await service.executeWritingPhase(
        topic,
        dimension,
        searchResult,
        outline,
      );

      expect(result.success).toBe(true);
      expect(result.dimensionId).toBe('dim-1');
    });

    it('should call sectionWriter.writeSectionsParallel for each parallel group', async () => {
      const topic = makeResearchTopic();
      const dimension = makeTopicDimension();
      const searchResult = makeSearchPhaseResult();
      const outline = makeOutline([
        makeSectionPlan({ id: 'sec-1', title: 'Section 1', order: 1 }),
        makeSectionPlan({ id: 'sec-2', title: 'Section 2', order: 2 }),
      ]);

      mockSectionWriter.writeSectionsParallel.mockResolvedValueOnce([
        makeSectionWriteResult({ sectionId: 'sec-1', title: 'Section 1' }),
        makeSectionWriteResult({ sectionId: 'sec-2', title: 'Section 2' }),
      ]);

      await service.executeWritingPhase(topic, dimension, searchResult, outline);

      expect(mockSectionWriter.writeSectionsParallel).toHaveBeenCalledTimes(1);
    });

    it('should call leaderService.reviewSectionOutput for each written section', async () => {
      const topic = makeResearchTopic();
      const dimension = makeTopicDimension();
      const searchResult = makeSearchPhaseResult();
      const outline = makeOutline([makeSectionPlan()]);

      await service.executeWritingPhase(topic, dimension, searchResult, outline);

      expect(mockLeaderService.reviewSectionOutput).toHaveBeenCalled();
    });

    it('should call leaderService.integrateDimensionResults after all sections are written', async () => {
      const topic = makeResearchTopic();
      const dimension = makeTopicDimension();
      const searchResult = makeSearchPhaseResult();
      const outline = makeOutline([makeSectionPlan()]);

      await service.executeWritingPhase(topic, dimension, searchResult, outline);

      expect(mockLeaderService.integrateDimensionResults).toHaveBeenCalled();
    });

    it('should emit agent activity events during writing', async () => {
      const topic = makeResearchTopic();
      const dimension = makeTopicDimension();
      const searchResult = makeSearchPhaseResult();
      const outline = makeOutline([makeSectionPlan()]);

      await service.executeWritingPhase(topic, dimension, searchResult, outline);

      expect(mockAgentActivity.endThinkingPhase).toHaveBeenCalled();
    });

    it('should trigger section revision when leader rejects content', async () => {
      const topic = makeResearchTopic();
      const dimension = makeTopicDimension();
      const searchResult = makeSearchPhaseResult();
      const outline = makeOutline([makeSectionPlan()]);

      // First review: reject; second review: approve
      mockLeaderService.reviewSectionOutput
        .mockResolvedValueOnce({
          approved: false,
          score: 60,
          feedback: 'Need more depth',
          revisionInstructions: 'Add more academic references',
        })
        .mockResolvedValueOnce({
          approved: true,
          score: 90,
          feedback: 'Now looks good',
          revisionInstructions: null,
        });

      mockSectionWriter.reviseSection.mockResolvedValueOnce(
        makeSectionWriteResult({ content: '# Revised Content\n\n' + 'B'.repeat(600) }),
      );

      const result = await service.executeWritingPhase(topic, dimension, searchResult, outline);

      expect(mockSectionWriter.reviseSection).toHaveBeenCalled();
      expect(result.success).toBe(true);
    });

    it('should call emitProgressFn when provided', async () => {
      const topic = makeResearchTopic();
      const dimension = makeTopicDimension();
      const searchResult = makeSearchPhaseResult();
      const outline = makeOutline([makeSectionPlan()]);

      const emitProgressFn = jest.fn().mockResolvedValue(undefined);

      await service.executeWritingPhase(
        topic,
        dimension,
        searchResult,
        outline,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        emitProgressFn,
      );

      expect(emitProgressFn).toHaveBeenCalled();
    });

    it('should return error result when writing fails completely', async () => {
      const topic = makeResearchTopic();
      const dimension = makeTopicDimension();
      const searchResult = makeSearchPhaseResult();
      const outline = makeOutline([makeSectionPlan()]);

      // Reject at the integration stage which is guaranteed to be called
      // after the writing phase completes
      mockLeaderService.integrateDimensionResults.mockRejectedValue(
        new Error('Integration failed completely'),
      );

      const result = await service.executeWritingPhase(topic, dimension, searchResult, outline);

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });

    it('should pass modelId to sectionWriter when provided', async () => {
      const topic = makeResearchTopic();
      const dimension = makeTopicDimension();
      const searchResult = makeSearchPhaseResult();
      const outline = makeOutline([makeSectionPlan()]);

      await service.executeWritingPhase(
        topic,
        dimension,
        searchResult,
        outline,
        undefined,
        'mission-1',
        'claude-3-opus',
      );

      expect(mockSectionWriter.writeSectionsParallel).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({ modelId: 'claude-3-opus' }),
        ]),
      );
    });

    it('should emit leader plan ready event at start', async () => {
      const topic = makeResearchTopic();
      const dimension = makeTopicDimension();
      const searchResult = makeSearchPhaseResult();
      const outline = makeOutline([makeSectionPlan()]);

      await service.executeWritingPhase(topic, dimension, searchResult, outline);

      expect(mockEventEmitter.emitLeaderPlanReady).toHaveBeenCalledWith(
        'topic-1',
        'dim-1',
        expect.any(Number),
        expect.any(Number),
      );
    });
  });
});
