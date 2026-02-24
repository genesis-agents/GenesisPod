/**
 * Tests for DiscussionOrchestratorService
 */

import { Test, TestingModule } from '@nestjs/testing';
import { DiscussionOrchestratorService } from '../discussion/discussion-orchestrator.service';
import { PrismaService } from '../../../../common/prisma/prisma.service';
import { DiscussionAgentService } from '../discussion/discussion-agent.service';
import { IterativeSearchService } from '../discussion/iterative-search.service';
import { ReportSynthesizerService } from '../discussion/report-synthesizer.service';
import { AIEngineFacade } from '@/modules/ai-engine/facade';
import { ResearchReplannerService } from '../discussion/research-replanner.service';

jest.mock('@prisma/client', () => ({
  AIModelType: {
    CHAT: 'CHAT',
    CHAT_FAST: 'CHAT_FAST',
  },
  DeepResearchStatus: {
    IDEATION: 'IDEATION',
    PLANNING: 'PLANNING',
    SEARCHING: 'SEARCHING',
    FINDINGS: 'FINDINGS',
    REFLECTING: 'REFLECTING',
    SYNTHESIZING: 'SYNTHESIZING',
    COMPLETED: 'COMPLETED',
    FAILED: 'FAILED',
  },
  PrismaClient: class MockPrismaClient {},
}));

jest.mock('@/modules/ai-engine/facade', () => ({
  AIEngineFacade: jest.fn().mockImplementation(() => ({
    chat: jest.fn(),
    startTrace: jest.fn(),
    endTrace: jest.fn(),
    addSpan: jest.fn(),
    endSpan: jest.fn(),
    a2aPublish: jest.fn(),
    a2aClearSession: jest.fn(),
    coordinatorStore: jest.fn(),
  })),
}));

jest.mock('../../../../common/prisma/prisma.service', () => ({
  PrismaService: jest.fn().mockImplementation(() => ({
    researchProject: {
      findUnique: jest.fn(),
    },
    deepResearchSession: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      deleteMany: jest.fn(),
    },
  })),
}));
jest.mock('../discussion/discussion-agent.service');
jest.mock('../discussion/iterative-search.service');
jest.mock('../discussion/report-synthesizer.service');
jest.mock('../discussion/research-replanner.service');

jest.mock('../../../credits/credits.service', () => ({
  CreditsService: jest.fn(),
}));

jest.mock('../idea/research-idea.service', () => ({
  ResearchIdeaService: jest.fn(),
}));

jest.mock('rxjs', () => ({
  ...jest.requireActual('rxjs'),
  Subject: jest.fn().mockImplementation(() => ({
    next: jest.fn(),
    complete: jest.fn(),
    asObservable: jest.fn().mockReturnValue({ subscribe: jest.fn() }),
  })),
  Observable: jest.fn(),
}));

jest.mock('../../../credits/billing-context', () => ({
  BillingContext: {
    run: jest.fn((_ctx: unknown, fn: () => unknown) => fn()),
  },
}));

describe('DiscussionOrchestratorService', () => {
  let service: DiscussionOrchestratorService;
  let prisma: jest.Mocked<PrismaService>;

  const projectId = 'project-123';
  const sessionId = 'session-456';

  const mockSession = {
    id: sessionId,
    projectId,
    status: 'COMPLETED',
    discussion: [{ id: 'msg1', content: 'Test' }],
    updatedAt: new Date(),
    createdAt: new Date(),
  };

  beforeEach(async () => {
    const mockPrismaService = {
      researchProject: {
        findUnique: jest.fn().mockResolvedValue({ id: projectId, userId: 'user-123' }),
      },
      deepResearchSession: {
        findUnique: jest.fn().mockResolvedValue(mockSession),
        findMany: jest.fn().mockResolvedValue([mockSession]),
        create: jest.fn().mockResolvedValue(mockSession),
        update: jest.fn().mockResolvedValue(mockSession),
        delete: jest.fn().mockResolvedValue(mockSession),
        deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
    };

    const mockAgentService = {
      initializeTeam: jest.fn().mockReturnValue(new Map()),
      speak: jest.fn().mockResolvedValue('Agent response'),
      createMessage: jest.fn().mockReturnValue({
        id: 'msg1',
        agentRole: 'director',
        agentName: 'Research Director',
        content: 'Message content',
        phase: 'ideation',
        messageType: 'proposal',
        timestamp: new Date().toISOString(),
      }),
      parseDirections: jest.fn().mockReturnValue([
        {
          title: 'Direction 1',
          description: 'Research direction 1',
          searchQueries: ['Query 1', 'Query 2'],
        },
        {
          title: 'Direction 2',
          description: 'Research direction 2',
          searchQueries: ['Query 3'],
        },
      ]),
    };

    const mockSearchService = {
      executeStep: jest.fn().mockResolvedValue({
        round: 1,
        stepId: 'step_1',
        query: 'test',
        resultsCount: 5,
        sources: [],
        timestamp: new Date(),
      }),
    };

    const mockReportService = {
      generateReport: jest.fn().mockResolvedValue({
        executiveSummary: 'Test summary',
        sections: [{ title: 'Section 1', content: 'Content', citations: [] }],
        conclusion: 'Test conclusion',
        references: [{ id: 1, title: 'Ref 1', url: 'https://example.com', snippet: '', accessedAt: new Date() }],
        metadata: { totalSources: 5, totalTokens: 1000, duration: 60, searchRounds: 3 },
      }),
    };

    const mockFacadeInstance = {
      chat: jest.fn(),
      startTrace: jest.fn().mockReturnValue('trace-123'),
      endTrace: jest.fn(),
      addSpan: jest.fn().mockReturnValue('span-123'),
      endSpan: jest.fn(),
      a2aPublish: jest.fn().mockReturnValue(Promise.resolve()),
      a2aClearSession: jest.fn(),
      coordinatorStore: jest.fn().mockReturnValue(Promise.resolve()),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DiscussionOrchestratorService,
        { provide: PrismaService, useValue: mockPrismaService },
        { provide: DiscussionAgentService, useValue: mockAgentService },
        { provide: IterativeSearchService, useValue: mockSearchService },
        { provide: ReportSynthesizerService, useValue: mockReportService },
        { provide: AIEngineFacade, useValue: mockFacadeInstance },
        { provide: ResearchReplannerService, useValue: null },
      ],
    }).compile();

    service = module.get<DiscussionOrchestratorService>(
      DiscussionOrchestratorService,
    );
    prisma = module.get(PrismaService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('getSession', () => {
    it('should return session by id', async () => {
      const result = await service.getSession(sessionId);

      expect(result).toBe(mockSession);
      expect(prisma.deepResearchSession.findUnique).toHaveBeenCalledWith({
        where: { id: sessionId },
      });
    });
  });

  describe('getProjectSessions', () => {
    it('should return sessions for a project', async () => {
      const result = await service.getProjectSessions(projectId);

      expect(Array.isArray(result)).toBe(true);
      expect(prisma.deepResearchSession.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { projectId },
          take: 10,
        }),
      );
    });

    it('should auto-correct stale sessions', async () => {
      const staleCutoff = Date.now() - 20 * 60 * 1000; // 20 minutes ago
      const staleSession = {
        ...mockSession,
        status: 'IDEATION',
        updatedAt: new Date(staleCutoff),
        discussion: [{ content: 'Some content' }], // has discussion = COMPLETED
      };

      (prisma.deepResearchSession.findMany as jest.Mock).mockResolvedValue([
        staleSession,
      ]);
      (prisma.deepResearchSession.update as jest.Mock).mockResolvedValue({
        ...staleSession,
        status: 'COMPLETED',
      });

      await service.getProjectSessions(projectId);

      expect(prisma.deepResearchSession.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: sessionId },
          data: expect.objectContaining({
            status: 'COMPLETED',
          }),
        }),
      );
    });

    it('should mark stale sessions without content as FAILED', async () => {
      const staleCutoff = Date.now() - 20 * 60 * 1000;
      const staleSessionNoContent = {
        ...mockSession,
        status: 'SEARCHING',
        updatedAt: new Date(staleCutoff),
        discussion: null, // no discussion = FAILED
      };

      (prisma.deepResearchSession.findMany as jest.Mock).mockResolvedValue([
        staleSessionNoContent,
      ]);
      (prisma.deepResearchSession.update as jest.Mock).mockResolvedValue({
        ...staleSessionNoContent,
        status: 'FAILED',
      });

      await service.getProjectSessions(projectId);

      expect(prisma.deepResearchSession.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: 'FAILED',
          }),
        }),
      );
    });

    it('should not update recently active sessions', async () => {
      const recentSession = {
        ...mockSession,
        status: 'SEARCHING',
        updatedAt: new Date(), // just now
      };

      (prisma.deepResearchSession.findMany as jest.Mock).mockResolvedValue([
        recentSession,
      ]);

      await service.getProjectSessions(projectId);

      expect(prisma.deepResearchSession.update).not.toHaveBeenCalled();
    });
  });

  describe('deleteSession', () => {
    it('should delete a session', async () => {
      await service.deleteSession(sessionId);

      expect(prisma.deepResearchSession.delete).toHaveBeenCalledWith({
        where: { id: sessionId },
      });
    });
  });

  describe('deleteSessions', () => {
    it('should delete multiple sessions', async () => {
      const sessionIds = ['session-1', 'session-2'];
      await service.deleteSessions(sessionIds);

      expect(prisma.deepResearchSession.deleteMany).toHaveBeenCalledWith({
        where: { id: { in: sessionIds } },
      });
    });
  });
});
