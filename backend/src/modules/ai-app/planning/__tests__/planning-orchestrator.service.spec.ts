/**
 * Tests for PlanningOrchestratorService
 *
 * The service imports AiTeamsService which has a deep circular dependency chain.
 * We mock those entire modules at the factory level to prevent circular import issues.
 */

// Mock the deep import chains before any imports are resolved
jest.mock('../../teams/ai-teams.service', () => ({
  AiTeamsService: jest.fn().mockImplementation(() => ({
    createTopic: jest.fn(),
    getTopicMessages: jest.fn(),
  })),
}));

jest.mock('../../teams/services/ai/ai-response.service', () => ({
  AiResponseService: jest.fn().mockImplementation(() => ({
    generateStreamResponse: jest.fn(),
  })),
}));

jest.mock('../../../credits/billing-context', () => ({
  BillingContext: {
    run: jest.fn().mockImplementation((_ctx: unknown, fn: () => unknown) => fn()),
  },
}));

import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { PlanningOrchestratorService } from '../services/planning-orchestrator.service';
import { PlanningTemplateService } from '../services/planning-template.service';
import { PrismaService } from '../../../../common/prisma/prisma.service';
import { AiTeamsService } from '../../teams/ai-teams.service';
import { AiResponseService } from '../../teams/services/ai/ai-response.service';
import { AIEngineFacade } from '../../../ai-engine/facade';
import { PlanningDepth } from '../dto/create-plan.dto';
import { TopicType } from '@prisma/client';

describe('PlanningOrchestratorService', () => {
  let service: PlanningOrchestratorService;
  let prisma: jest.Mocked<PrismaService>;
  let aiTeamsService: jest.Mocked<AiTeamsService>;
  let templateService: jest.Mocked<PlanningTemplateService>;
  let aiFacade: jest.Mocked<AIEngineFacade>;

  const mockTemplate = {
    id: 'general',
    name: '通用策划',
    description: '通用模板',
    icon: 'target',
    defaultGoalPrompt: '请分析以下策划目标：',
    phasePrompts: {
      1: '目标分析',
      2: '调研',
      3: '头脑风暴',
      4: '辩论',
      5: '综合',
      6: '输出',
    },
  };

  const mockTopic = {
    id: 'topic-123',
    name: 'Test Plan',
    description: 'Test goal',
    type: TopicType.PRIVATE,
    metadata: {
      planningMode: true,
      templateId: 'general',
      currentPhase: 0,
      phaseStatus: {
        1: { status: 'pending' },
        2: { status: 'pending' },
        3: { status: 'pending' },
        4: { status: 'pending' },
        5: { status: 'pending' },
        6: { status: 'pending' },
      },
      planConfig: { goal: 'Test goal', depth: PlanningDepth.STANDARD, autoAdvance: true },
    },
    createdAt: new Date('2024-01-01'),
    updatedAt: new Date('2024-01-01'),
    aiMembers: [],
    _count: { aiMembers: 0 },
  };

  beforeEach(async () => {
    const mockPrisma = {
      topic: {
        findFirst: jest.fn(),
        findMany: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
      },
      message: {
        findMany: jest.fn(),
      },
      $transaction: jest.fn(),
    };

    const mockTemplateService = {
      getTemplates: jest.fn().mockReturnValue([mockTemplate]),
      getTemplate: jest.fn().mockReturnValue(mockTemplate),
      getDefaultTemplate: jest.fn().mockReturnValue(mockTemplate),
    };

    const mockModel = { id: 'model-1', name: 'Test Model', modelId: 'test-model', apiKey: 'test-key', provider: 'openai' };
    const mockAiFacade = {
      chat: jest.fn().mockResolvedValue({ content: 'AI response', tokensUsed: 100 }),
      getAvailableModels: jest.fn().mockResolvedValue([mockModel]),
      getAvailableModelsExtended: jest.fn().mockResolvedValue([mockModel]),
      getReasoningModel: jest.fn().mockResolvedValue(mockModel),
      getChatModelConfig: jest.fn().mockResolvedValue({
        modelId: 'claude-sonnet-4-20250514',
        apiKey: 'test-key',
        provider: 'anthropic',
        baseUrl: undefined,
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PlanningOrchestratorService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: AiTeamsService, useValue: { createTopic: jest.fn(), getTopicMessages: jest.fn() } },
        { provide: AiResponseService, useValue: { generateStreamResponse: jest.fn() } },
        { provide: PlanningTemplateService, useValue: mockTemplateService },
        { provide: AIEngineFacade, useValue: mockAiFacade },
      ],
    }).compile();

    service = module.get<PlanningOrchestratorService>(PlanningOrchestratorService);
    prisma = module.get(PrismaService);
    aiTeamsService = module.get(AiTeamsService);
    templateService = module.get(PlanningTemplateService);
    aiFacade = module.get(AIEngineFacade);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('createPlan', () => {
    it('should create a plan with default template', async () => {
      (aiTeamsService.createTopic as jest.Mock).mockResolvedValue(mockTopic);
      (prisma.topic.update as jest.Mock).mockResolvedValue(mockTopic);

      const result = await service.createPlan('user-1', {
        name: 'Test Plan',
        goal: 'Test goal',
      });

      expect(result).toHaveProperty('planId');
      expect(aiTeamsService.createTopic).toHaveBeenCalled();
      expect(prisma.topic.update).toHaveBeenCalled();
    });

    it('should use specified template when templateId is provided', async () => {
      (aiTeamsService.createTopic as jest.Mock).mockResolvedValue(mockTopic);
      (prisma.topic.update as jest.Mock).mockResolvedValue(mockTopic);

      await service.createPlan('user-1', {
        name: 'Test Plan',
        goal: 'Test goal',
        templateId: 'general',
      });

      expect(templateService.getTemplate).toHaveBeenCalledWith('general');
    });

    it('should throw NotFoundException when template not found', async () => {
      (templateService.getTemplate as jest.Mock).mockReturnValue(undefined);

      await expect(
        service.createPlan('user-1', {
          name: 'Test Plan',
          goal: 'Test goal',
          templateId: 'non-existent',
        }),
      ).rejects.toThrow(NotFoundException);
    });

    it('should use STANDARD depth by default', async () => {
      (aiTeamsService.createTopic as jest.Mock).mockResolvedValue(mockTopic);
      (prisma.topic.update as jest.Mock).mockResolvedValue(mockTopic);

      await service.createPlan('user-1', {
        name: 'Test Plan',
        goal: 'Test goal',
      });

      const updateCall = (prisma.topic.update as jest.Mock).mock.calls[0][0];
      expect(updateCall.data.metadata.planConfig.depth).toBe(PlanningDepth.STANDARD);
    });

    it('should use template default when no templateId provided', async () => {
      (aiTeamsService.createTopic as jest.Mock).mockResolvedValue(mockTopic);
      (prisma.topic.update as jest.Mock).mockResolvedValue(mockTopic);

      await service.createPlan('user-1', { name: 'Plan', goal: 'Goal' });

      expect(templateService.getDefaultTemplate).toHaveBeenCalled();
    });
  });

  describe('getPlans', () => {
    it('should return list of plans for user', async () => {
      const topics = [
        {
          ...mockTopic,
          metadata: {
            planningMode: true,
            templateId: 'general',
            currentPhase: 2,
            phaseStatus: {},
            planConfig: { goal: 'Test goal', depth: PlanningDepth.STANDARD, autoAdvance: true },
          },
        },
      ];
      (prisma.topic.findMany as jest.Mock).mockResolvedValue(topics);

      const result = await service.getPlans('user-1');

      expect(Array.isArray(result)).toBe(true);
      expect(result.length).toBe(1);
      expect(result[0]).toHaveProperty('id');
      expect(result[0]).toHaveProperty('name');
      expect(result[0]).toHaveProperty('totalPhases', 6);
    });

    it('should filter plans by search query', async () => {
      (prisma.topic.findMany as jest.Mock).mockResolvedValue([]);

      await service.getPlans('user-1', 'search term');

      const findManyCall = (prisma.topic.findMany as jest.Mock).mock.calls[0][0];
      expect(findManyCall.where.name).toBeDefined();
    });

    it('should return empty array when no plans found', async () => {
      (prisma.topic.findMany as jest.Mock).mockResolvedValue([]);

      const result = await service.getPlans('user-1');

      expect(result).toEqual([]);
    });

    it('should handle topics with missing metadata gracefully', async () => {
      const topicsWithNoMeta = [{ ...mockTopic, metadata: null }];
      (prisma.topic.findMany as jest.Mock).mockResolvedValue(topicsWithNoMeta);

      const result = await service.getPlans('user-1');

      expect(result.length).toBe(1);
      expect(result[0].goal).toBe(mockTopic.description);
    });
  });

  describe('getPlanDetail', () => {
    it('should return plan detail', async () => {
      const topicWithMembers = {
        ...mockTopic,
        aiMembers: [{ id: 'member-1', displayName: 'Test Agent', aiModel: 'gpt-4' }],
      };
      (prisma.topic.findFirst as jest.Mock).mockResolvedValue(topicWithMembers);

      const result = await service.getPlanDetail('topic-123', 'user-1');

      expect(result).toHaveProperty('id', 'topic-123');
      expect(result).toHaveProperty('members');
      expect(result).toHaveProperty('references');
      expect(result.members).toHaveLength(1);
    });

    it('should throw NotFoundException when plan not found', async () => {
      (prisma.topic.findFirst as jest.Mock).mockResolvedValue(null);

      await expect(service.getPlanDetail('not-found', 'user-1')).rejects.toThrow(NotFoundException);
    });

    it('should return default depth when metadata missing', async () => {
      (prisma.topic.findFirst as jest.Mock).mockResolvedValue({
        ...mockTopic,
        metadata: null,
        aiMembers: [],
      });

      const result = await service.getPlanDetail('topic-123', 'user-1');

      expect(result.depth).toBe(PlanningDepth.STANDARD);
    });
  });

  describe('updatePlan', () => {
    it('should update plan name and goal', async () => {
      const topicWithNoActivePhase = { ...mockTopic, aiMembers: [] };
      (prisma.topic.findFirst as jest.Mock)
        .mockResolvedValueOnce(topicWithNoActivePhase)
        .mockResolvedValueOnce({ ...topicWithNoActivePhase });
      (prisma.topic.update as jest.Mock).mockResolvedValue(topicWithNoActivePhase);

      await service.updatePlan('topic-123', 'user-1', {
        name: 'Updated Name',
        goal: 'Updated goal',
      });

      expect(prisma.topic.update).toHaveBeenCalled();
    });

    it('should throw NotFoundException when plan not found', async () => {
      (prisma.topic.findFirst as jest.Mock).mockResolvedValue(null);

      await expect(
        service.updatePlan('not-found', 'user-1', { name: 'New Name' }),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw when a phase is active', async () => {
      const topicWithActivePhase = {
        ...mockTopic,
        metadata: {
          ...mockTopic.metadata,
          phaseStatus: {
            1: { status: 'active' },
            2: { status: 'pending' },
          },
        },
      };
      (prisma.topic.findFirst as jest.Mock).mockResolvedValue(topicWithActivePhase);

      await expect(
        service.updatePlan('topic-123', 'user-1', { name: 'New Name' }),
      ).rejects.toThrow();
    });

    it('should update depth if provided', async () => {
      const topicWithNoActivePhase = { ...mockTopic, aiMembers: [] };
      (prisma.topic.findFirst as jest.Mock)
        .mockResolvedValueOnce(topicWithNoActivePhase)
        .mockResolvedValueOnce({ ...topicWithNoActivePhase });
      (prisma.topic.update as jest.Mock).mockResolvedValue(topicWithNoActivePhase);

      await service.updatePlan('topic-123', 'user-1', {
        depth: PlanningDepth.COMPREHENSIVE,
      });

      const updateCall = (prisma.topic.update as jest.Mock).mock.calls[0][0];
      expect(updateCall.data.metadata.planConfig.depth).toBe(PlanningDepth.COMPREHENSIVE);
    });
  });

  describe('deletePlan', () => {
    it('should archive plan (set archivedAt)', async () => {
      (prisma.topic.findFirst as jest.Mock).mockResolvedValue(mockTopic);
      (prisma.topic.update as jest.Mock).mockResolvedValue({ ...mockTopic, archivedAt: new Date() });

      await service.deletePlan('topic-123', 'user-1');

      expect(prisma.topic.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'topic-123' },
          data: expect.objectContaining({ archivedAt: expect.any(Date) }),
        }),
      );
    });

    it('should throw NotFoundException when plan not found', async () => {
      (prisma.topic.findFirst as jest.Mock).mockResolvedValue(null);

      await expect(service.deletePlan('not-found', 'user-1')).rejects.toThrow(NotFoundException);
    });
  });

  describe('advancePhase', () => {
    it('should activate phase 1 when plan not started', async () => {
      const notStartedTopic = {
        ...mockTopic,
        metadata: {
          planningMode: true,
          templateId: 'general',
          currentPhase: 0,
          phaseStatus: {
            1: { status: 'pending' },
            2: { status: 'pending' },
            3: { status: 'pending' },
            4: { status: 'pending' },
            5: { status: 'pending' },
            6: { status: 'pending' },
          },
          planConfig: { goal: 'Test goal', depth: PlanningDepth.STANDARD, autoAdvance: true },
        },
      };
      (prisma.topic.findFirst as jest.Mock).mockResolvedValue(notStartedTopic);
      (prisma.topic.update as jest.Mock).mockResolvedValue(notStartedTopic);
      (prisma.message.findMany as jest.Mock).mockResolvedValue([]);

      const result = await service.advancePhase('topic-123', 'user-1');

      expect(result).toHaveProperty('currentPhase');
      expect(result.currentPhase).toBe(1);
    });

    it('should throw NotFoundException when plan not found', async () => {
      (prisma.topic.findFirst as jest.Mock).mockResolvedValue(null);

      await expect(service.advancePhase('not-found', 'user-1')).rejects.toThrow(NotFoundException);
    });

    it('should ignore advance when phase is already active', async () => {
      const activeTopic = {
        ...mockTopic,
        metadata: {
          ...mockTopic.metadata,
          currentPhase: 2,
          phaseStatus: {
            2: { status: 'active' },
          },
        },
      };
      (prisma.topic.findFirst as jest.Mock).mockResolvedValue(activeTopic);

      const result = await service.advancePhase('topic-123', 'user-1');

      // Should return current phase without throwing
      expect(result).toEqual({ currentPhase: 2 });
    });

    it('should re-activate a pending phase (cancelled scenario)', async () => {
      const pendingTopic = {
        ...mockTopic,
        metadata: {
          ...mockTopic.metadata,
          currentPhase: 3,
          phaseStatus: {
            3: { status: 'pending' },
          },
        },
      };
      // advancePhase calls findFirst twice: once for guard, once inside activatePhase
      (prisma.topic.findFirst as jest.Mock)
        .mockResolvedValueOnce(pendingTopic)
        .mockResolvedValueOnce(pendingTopic);
      (prisma.topic.update as jest.Mock).mockResolvedValue(pendingTopic);
      (prisma.message.findMany as jest.Mock).mockResolvedValue([]);

      const result = await service.advancePhase('topic-123', 'user-1');

      expect(result.currentPhase).toBe(3);
    });

    it('should re-activate a failed phase (retry scenario)', async () => {
      const failedTopic = {
        ...mockTopic,
        metadata: {
          ...mockTopic.metadata,
          currentPhase: 2,
          phaseStatus: {
            2: { status: 'failed', error: 'Timeout' },
          },
        },
      };
      (prisma.topic.findFirst as jest.Mock)
        .mockResolvedValueOnce(failedTopic)
        .mockResolvedValueOnce(failedTopic);
      (prisma.topic.update as jest.Mock).mockResolvedValue(failedTopic);
      (prisma.message.findMany as jest.Mock).mockResolvedValue([]);

      const result = await service.advancePhase('topic-123', 'user-1');

      expect(result.currentPhase).toBe(2);
    });

    it('should advance to next phase when current phase is completed', async () => {
      const completedTopic = {
        ...mockTopic,
        metadata: {
          ...mockTopic.metadata,
          currentPhase: 1,
          phaseStatus: {
            1: { status: 'completed', summary: 'Phase 1 done' },
            2: { status: 'pending' },
          },
        },
      };
      (prisma.topic.findFirst as jest.Mock)
        .mockResolvedValueOnce(completedTopic)
        .mockResolvedValueOnce(completedTopic);
      (prisma.topic.update as jest.Mock).mockResolvedValue(completedTopic);
      (prisma.message.findMany as jest.Mock).mockResolvedValue([]);

      const result = await service.advancePhase('topic-123', 'user-1');

      expect(result.currentPhase).toBe(2);
    });

    it('should return current phase when all phases complete (no next phase)', async () => {
      const allDoneTopic = {
        ...mockTopic,
        metadata: {
          ...mockTopic.metadata,
          currentPhase: 6,
          phaseStatus: {
            6: { status: 'completed' },
          },
        },
      };
      (prisma.topic.findFirst as jest.Mock).mockResolvedValue(allDoneTopic);

      const result = await service.advancePhase('topic-123', 'user-1');

      expect(result.currentPhase).toBe(6);
      // Should not try to activate a phase beyond TOTAL_PHASES
      expect(prisma.topic.update).not.toHaveBeenCalled();
    });
  });

  describe('retryPhase', () => {
    it('should retry a specific phase by index', async () => {
      (prisma.topic.findFirst as jest.Mock).mockResolvedValue(mockTopic);
      (prisma.topic.update as jest.Mock).mockResolvedValue(mockTopic);
      (prisma.message.findMany as jest.Mock).mockResolvedValue([]);

      await service.retryPhase('topic-123', 2, 'user-1');

      expect(prisma.topic.update).toHaveBeenCalled();
      const updateCall = (prisma.topic.update as jest.Mock).mock.calls[0][0];
      expect(updateCall.data.metadata.currentPhase).toBe(2);
      expect(updateCall.data.metadata.phaseStatus[2].status).toBe('active');
    });

    it('should throw NotFoundException for invalid phase number (0)', async () => {
      await expect(service.retryPhase('topic-123', 0, 'user-1')).rejects.toThrow(NotFoundException);
    });

    it('should throw NotFoundException for phase > TOTAL_PHASES', async () => {
      await expect(service.retryPhase('topic-123', 7, 'user-1')).rejects.toThrow(NotFoundException);
    });

    it('should throw NotFoundException when plan not found', async () => {
      (prisma.topic.findFirst as jest.Mock).mockResolvedValue(null);

      await expect(service.retryPhase('not-found', 2, 'user-1')).rejects.toThrow(NotFoundException);
    });
  });

  describe('replanFromPhase', () => {
    it('should reset phases from startPhase onward and activate startPhase', async () => {
      const topic = {
        ...mockTopic,
        metadata: {
          planningMode: true,
          templateId: 'general',
          currentPhase: 3,
          phaseStatus: {
            1: { status: 'completed', summary: 'Phase 1 done' },
            2: { status: 'completed', summary: 'Phase 2 done' },
            3: { status: 'failed', error: 'Error' },
            4: { status: 'pending' },
            5: { status: 'pending' },
            6: { status: 'pending' },
          },
          planConfig: { goal: 'Test goal', depth: PlanningDepth.STANDARD, autoAdvance: true },
        },
      };
      (prisma.topic.findFirst as jest.Mock).mockResolvedValue(topic);
      (prisma.topic.update as jest.Mock).mockResolvedValue(topic);
      (prisma.message.findMany as jest.Mock).mockResolvedValue([]);

      const result = await service.replanFromPhase('topic-123', 3, 'user-1');

      expect(result.currentPhase).toBe(3);
      expect(prisma.topic.update).toHaveBeenCalled();
    });

    it('should throw BadRequestException for invalid startPhase (0)', async () => {
      const { BadRequestException } = require('@nestjs/common');
      await expect(service.replanFromPhase('topic-123', 0, 'user-1')).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException for startPhase > TOTAL_PHASES', async () => {
      const { BadRequestException } = require('@nestjs/common');
      await expect(service.replanFromPhase('topic-123', 7, 'user-1')).rejects.toThrow(BadRequestException);
    });

    it('should throw NotFoundException when plan not found', async () => {
      (prisma.topic.findFirst as jest.Mock).mockResolvedValue(null);
      await expect(service.replanFromPhase('not-found', 3, 'user-1')).rejects.toThrow(NotFoundException);
    });

    it('should throw BadRequestException when a phase is currently active', async () => {
      const { BadRequestException } = require('@nestjs/common');
      const activeTopicForReplan = {
        ...mockTopic,
        metadata: {
          ...mockTopic.metadata,
          currentPhase: 2,
          phaseStatus: {
            2: { status: 'active' },
          },
        },
      };
      (prisma.topic.findFirst as jest.Mock).mockResolvedValue(activeTopicForReplan);

      await expect(service.replanFromPhase('topic-123', 2, 'user-1')).rejects.toThrow(BadRequestException);
    });

    it('should clear references when replanning from phase <= 2', async () => {
      const topic = {
        ...mockTopic,
        metadata: {
          ...mockTopic.metadata,
          currentPhase: 1,
          phaseStatus: { 1: { status: 'completed' }, 2: { status: 'pending' } },
          references: [{ id: 'ref-1', title: 'Old ref', url: 'http://example.com', domain: 'example.com', snippet: 'snippet', sourcePhase: 2 }],
        },
      };
      (prisma.topic.findFirst as jest.Mock).mockResolvedValue(topic);
      (prisma.topic.update as jest.Mock).mockResolvedValue(topic);
      (prisma.message.findMany as jest.Mock).mockResolvedValue([]);

      await service.replanFromPhase('topic-123', 1, 'user-1');

      const updateCall = (prisma.topic.update as jest.Mock).mock.calls[0][0];
      expect(updateCall.data.metadata.references).toEqual([]);
    });
  });

  describe('cancelPhase', () => {
    it('should cancel an active phase (set to pending)', async () => {
      const activeTopic = {
        ...mockTopic,
        metadata: {
          ...mockTopic.metadata,
          currentPhase: 2,
          phaseStatus: {
            2: { status: 'active' },
          },
        },
      };
      (prisma.topic.findFirst as jest.Mock).mockResolvedValue(activeTopic);
      (prisma.topic.update as jest.Mock).mockResolvedValue(activeTopic);

      await service.cancelPhase('topic-123', 'user-1');

      const updateCall = (prisma.topic.update as jest.Mock).mock.calls[0][0];
      expect(updateCall.data.metadata.phaseStatus[2].status).toBe('pending');
    });

    it('should do nothing when currentPhase is 0 (not started)', async () => {
      const notStartedTopic = {
        ...mockTopic,
        metadata: { ...mockTopic.metadata, currentPhase: 0 },
      };
      (prisma.topic.findFirst as jest.Mock).mockResolvedValue(notStartedTopic);

      await service.cancelPhase('topic-123', 'user-1');

      expect(prisma.topic.update).not.toHaveBeenCalled();
    });

    it('should do nothing when current phase status is not active', async () => {
      const completedTopic = {
        ...mockTopic,
        metadata: {
          ...mockTopic.metadata,
          currentPhase: 1,
          phaseStatus: { 1: { status: 'completed' } },
        },
      };
      (prisma.topic.findFirst as jest.Mock).mockResolvedValue(completedTopic);

      await service.cancelPhase('topic-123', 'user-1');

      expect(prisma.topic.update).not.toHaveBeenCalled();
    });

    it('should throw NotFoundException when plan not found', async () => {
      (prisma.topic.findFirst as jest.Mock).mockResolvedValue(null);

      await expect(service.cancelPhase('not-found', 'user-1')).rejects.toThrow(NotFoundException);
    });
  });

  describe('exportPlan', () => {
    const fullDetailedTopic = {
      ...mockTopic,
      description: 'Test goal description',
      metadata: {
        planningMode: true,
        templateId: 'general',
        currentPhase: 6,
        phaseStatus: {
          1: { status: 'completed', summary: 'Phase 1 analysis complete', completedAt: '2024-01-02T10:00:00Z' },
          2: { status: 'completed', summary: 'Phase 2 research complete' },
          3: { status: 'pending' },
          4: { status: 'pending' },
          5: { status: 'pending' },
          6: { status: 'completed', summary: '# Final Delivery Document\n\nThis is the final plan.' },
        },
        planConfig: { goal: 'Test goal', depth: PlanningDepth.STANDARD, autoAdvance: true },
        references: [
          { id: 'ref-1', title: 'Reference 1', url: 'http://example.com/1', domain: 'example.com', snippet: 'snippet 1', sourcePhase: 2, sourceType: 'news' },
        ],
      },
      aiMembers: [{ id: 'member-1', displayName: '策划总监', aiModel: 'gpt-4' }],
      _count: { aiMembers: 1 },
    };

    it('should export report mode (phase 6 summary only)', async () => {
      (prisma.topic.findFirst as jest.Mock).mockResolvedValue(fullDetailedTopic);

      const result = await service.exportPlan('topic-123', 'user-1', 'report');

      expect(result).toContain('Test Plan');
      expect(result).toContain('Final Delivery Document');
    });

    it('should return placeholder when phase 6 not completed in report mode', async () => {
      const incompleteTopic = {
        ...fullDetailedTopic,
        metadata: {
          ...fullDetailedTopic.metadata,
          phaseStatus: { 6: { status: 'pending' } },
        },
      };
      (prisma.topic.findFirst as jest.Mock).mockResolvedValue(incompleteTopic);

      const result = await service.exportPlan('topic-123', 'user-1', 'report');

      expect(result).toContain('Report not yet available');
    });

    it('should export full mode with all completed phases and references', async () => {
      (prisma.topic.findFirst as jest.Mock).mockResolvedValue(fullDetailedTopic);

      const result = await service.exportPlan('topic-123', 'user-1', 'full');

      expect(result).toContain('参考文献');
      expect(result).toContain('Reference 1');
      expect(result).toContain('Phase 1 analysis complete');
    });

    it('should default to report mode when no mode specified', async () => {
      (prisma.topic.findFirst as jest.Mock).mockResolvedValue(fullDetailedTopic);

      const result = await service.exportPlan('topic-123', 'user-1');

      expect(result).toContain('Final Delivery Document');
    });

    it('should throw NotFoundException when plan not found for export', async () => {
      (prisma.topic.findFirst as jest.Mock).mockResolvedValue(null);

      await expect(service.exportPlan('not-found', 'user-1', 'report')).rejects.toThrow(NotFoundException);
    });
  });

  describe('getPlanDetail - depth and autoAdvance handling', () => {
    it('should return autoAdvance as true when metadata has it as true', async () => {
      const topic = {
        ...mockTopic,
        aiMembers: [],
        metadata: {
          ...mockTopic.metadata,
          planConfig: { goal: 'Goal', depth: PlanningDepth.COMPREHENSIVE, autoAdvance: true },
        },
      };
      (prisma.topic.findFirst as jest.Mock).mockResolvedValue(topic);

      const result = await service.getPlanDetail('topic-123', 'user-1');

      expect(result.autoAdvance).toBe(true);
      expect(result.depth).toBe(PlanningDepth.COMPREHENSIVE);
    });

    it('should return empty references array when metadata.references is undefined', async () => {
      const topic = {
        ...mockTopic,
        aiMembers: [],
        metadata: {
          ...mockTopic.metadata,
          // No references field
        },
      };
      (prisma.topic.findFirst as jest.Mock).mockResolvedValue(topic);

      const result = await service.getPlanDetail('topic-123', 'user-1');

      expect(result.references).toEqual([]);
    });
  });

  describe('createPlan - COMPREHENSIVE depth', () => {
    it('should create plan with COMPREHENSIVE depth and 6 AI members', async () => {
      (aiTeamsService.createTopic as jest.Mock).mockResolvedValue(mockTopic);
      (prisma.topic.update as jest.Mock).mockResolvedValue(mockTopic);

      // Mock model for comprehensive depth (adds debaters)
      const mockReasoningModel = { id: 'reasoning-model-1', name: 'Reasoning Model' };
      (aiFacade.getReasoningModel as jest.Mock).mockResolvedValue(mockReasoningModel);
      (aiFacade.getAvailableModelsExtended as jest.Mock).mockResolvedValue([
        { id: 'chat-model-1', isAvailable: true },
      ]);

      await service.createPlan('user-1', {
        name: 'Comprehensive Plan',
        goal: 'Test goal',
        depth: PlanningDepth.COMPREHENSIVE,
      });

      const createTopicCall = (aiTeamsService.createTopic as jest.Mock).mock.calls[0][1];
      // COMPREHENSIVE mode should include debaters (6 members total)
      expect(createTopicCall.aiMembers.length).toBe(6);
    });

    it('should use fallback model when no reasoning model available', async () => {
      (aiTeamsService.createTopic as jest.Mock).mockResolvedValue(mockTopic);
      (prisma.topic.update as jest.Mock).mockResolvedValue(mockTopic);
      (aiFacade.getReasoningModel as jest.Mock).mockResolvedValue(null);
      (aiFacade.getAvailableModelsExtended as jest.Mock).mockResolvedValue([]);

      await service.createPlan('user-1', {
        name: 'Fallback Model Plan',
        goal: 'Test goal',
        depth: PlanningDepth.STANDARD,
      });

      const createTopicCall = (aiTeamsService.createTopic as jest.Mock).mock.calls[0][1];
      // Fallback model should be used
      expect(createTopicCall.aiMembers[0].aiModel).toBe('claude-sonnet-4-20250514');
    });
  });

  describe('getPlans - additional edge cases', () => {
    it('should use topic description when metadata planConfig.goal is missing', async () => {
      const topicWithNoGoal = [{
        ...mockTopic,
        description: 'Topic description as goal',
        metadata: {
          planningMode: true,
          templateId: 'general',
          currentPhase: 0,
          phaseStatus: {},
          // no planConfig
        },
      }];
      (prisma.topic.findMany as jest.Mock).mockResolvedValue(topicWithNoGoal);

      const result = await service.getPlans('user-1');

      expect(result[0].goal).toBe('Topic description as goal');
    });

    it('should return memberCount from _count.aiMembers', async () => {
      const topicWithMembers = [{
        ...mockTopic,
        _count: { aiMembers: 5 },
      }];
      (prisma.topic.findMany as jest.Mock).mockResolvedValue(topicWithMembers);

      const result = await service.getPlans('user-1');

      expect(result[0].memberCount).toBe(5);
    });
  });
});
