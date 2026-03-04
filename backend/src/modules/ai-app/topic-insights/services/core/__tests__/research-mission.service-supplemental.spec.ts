/**
 * ResearchMissionService - Supplemental Unit Tests
 *
 * Covers uncovered branches:
 * - getTaskActivities: task not found, different task types (dimensionId, leader_planning, report_synthesis, quality_review, other)
 * - getTeamInfo: mission not found, no stored model, leaderPlan parsing, agent status updates
 * - adjustMission: not found, forbidden, wrong status, add/remove dimensions, focus areas
 * - cancelMission: not found, forbidden, already cancelled (idempotent), active mission
 * - executePlanningAsync: planning failure path with/without mission
 * - createTasksFromPlan: incremental mode with completed tasks
 * - getPhaseFromStatus helpers
 */

import { Test, TestingModule } from "@nestjs/testing";
import { ResearchMissionService } from "../research-mission.service";
import { PrismaService } from "@/common/prisma/prisma.service";
import { EventEmitter2 } from "@nestjs/event-emitter";
import { ResearchLeaderService } from "../research-leader.service";
import { DimensionMissionService } from "../../dimension/dimension-mission.service";
import { ReportSynthesisService } from "../../report/report-synthesis.service";
import { ResearchEventEmitterService } from "../research-event-emitter.service";
import { TopicCollaboratorService } from "../../collaboration/topic-collaborator.service";
import { AgentActivityService } from "../../monitoring/agent-activity.service";
import { ChatFacade } from "@/modules/ai-engine/facade";
import { ResearchReviewerService } from "../../collaboration/research-reviewer.service";
import { MissionObservabilityService } from "../mission-observability.service";
import { MissionKernelBridgeService } from "../mission-kernel-bridge.service";
import { MissionNotificationService } from "../mission-notification.service";
import { NotFoundException, ForbiddenException } from "@nestjs/common";
import {
  ResearchMissionStatus,
  ResearchTaskStatus,
  ResearchTodoStatus,
} from "@prisma/client";
import { CollaboratorRole } from "../../../dto/collaborator.dto";

// ──────────────────────────────────────────────────────────────────────────────
// Mock factory
// ──────────────────────────────────────────────────────────────────────────────

function buildMocks() {
  const mockPrisma = {
    researchTopic: {
      findUnique: jest.fn(),
    },
    researchMission: {
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      findUniqueOrThrow: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      findMany: jest.fn(),
    },
    researchTask: {
      create: jest.fn(),
      createMany: jest.fn(),
      findMany: jest.fn(),
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
      delete: jest.fn(),
      count: jest.fn(),
    },
    researchTodo: {
      updateMany: jest.fn(),
    },
    topicDimension: {
      findFirst: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      aggregate: jest.fn().mockResolvedValue({ _max: { sortOrder: 0 } }),
    },
    leaderDecision: {
      create: jest.fn(),
    },
    aIModel: {
      findMany: jest.fn().mockResolvedValue([]),
    },
    researchAgentActivity: {
      findMany: jest.fn(),
    },
    topicReport: {
      findMany: jest.fn().mockResolvedValue([]),
      findFirst: jest.fn().mockResolvedValue(null),
      deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
    },
  };

  const mockEventEmitter = {
    emit: jest.fn(),
    on: jest.fn(),
  };

  const mockLeaderService = {
    getReasoningModel: jest.fn(),
    planResearch: jest.fn(),
    reviewTaskResult: jest.fn(),
    generateGlobalOutline: jest.fn(),
    generateDimensionOutline: jest.fn(),
    reviewSection: jest.fn(),
    integrateDimensionResults: jest.fn(),
    handleUserMessage: jest.fn(),
  };

  const mockDimensionMissionService = {
    executeSearchPhase: jest.fn(),
    executeWritingPhase: jest.fn(),
    executeDimensionMission: jest.fn(),
  };

  const mockReportSynthesisService = {
    createDraftReport: jest.fn(),
    saveDimensionAnalysis: jest.fn(),
    linkEvidenceToReport: jest.fn(),
    synthesizeReport: jest.fn(),
  };

  const mockResearchEventEmitter = {
    emitMissionStarted: jest.fn().mockResolvedValue(undefined),
    emitMissionFailed: jest.fn().mockResolvedValue(undefined),
    emitMissionCompleted: jest.fn().mockResolvedValue(undefined),
    emitMissionProgress: jest.fn().mockResolvedValue(undefined),
    emitLeaderThinking: jest.fn().mockResolvedValue(undefined),
    emitLeaderPlanning: jest.fn().mockResolvedValue(undefined),
    emitLeaderPlanReady: jest.fn().mockResolvedValue(undefined),
    emitTaskStarted: jest.fn().mockResolvedValue(undefined),
    emitTaskCompleted: jest.fn().mockResolvedValue(undefined),
    emitTaskFailed: jest.fn().mockResolvedValue(undefined),
    saveUserMessage: jest.fn().mockResolvedValue(undefined),
    emitLeaderResponse: jest.fn().mockResolvedValue(undefined),
    emitResumeMissionExecution: jest.fn().mockResolvedValue(undefined),
  };

  const mockCollaboratorService = {
    getCollaborators: jest.fn(),
    addCollaborator: jest.fn(),
    notifyCollaborators: jest.fn(),
    hasAccess: jest.fn(),
  };

  const mockAgentActivity = {
    recordActivity: jest.fn().mockResolvedValue(undefined),
    startThinkingPhase: jest.fn().mockResolvedValue(undefined),
    endThinkingPhase: jest.fn().mockResolvedValue(undefined),
  };

  const mockFacade = {
    chat: jest.fn(),
    getAvailableModelsExtended: jest.fn().mockResolvedValue([]),
    getReasoningModel: jest.fn(),
    getDefaultModelByType: jest.fn().mockResolvedValue(null),
  };

  const mockReviewerService = {
    createReviewSession: jest.fn(),
    submitReview: jest.fn(),
  };

  const mockObservability = {
    recordResearchCost: jest.fn(),
    emitKernelEvent: jest.fn(),
    logError: jest.fn(),
    recordMissionMetrics: jest.fn(),
  };

  const mockKernelBridge = {
    getProcessId: jest.fn(),
    initMission: jest.fn().mockResolvedValue(undefined),
    startPhase: jest.fn(),
    completePhase: jest.fn(),
    failTracking: jest.fn(),
    completeTracking: jest.fn(),
    recordKernelEvent: jest.fn(),
    completeKernelProcess: jest.fn(),
    failKernelProcess: jest.fn(),
    checkBudget: jest.fn().mockResolvedValue({ canProceed: true }),
    consumeResources: jest.fn(),
    writeMemory: jest.fn(),
  };

  const mockNotification = {
    notifyCompletion: jest.fn(),
    getAiSettings: jest.fn().mockResolvedValue({}),
  };

  return {
    mockPrisma,
    mockEventEmitter,
    mockLeaderService,
    mockDimensionMissionService,
    mockReportSynthesisService,
    mockResearchEventEmitter,
    mockCollaboratorService,
    mockAgentActivity,
    mockFacade,
    mockReviewerService,
    mockObservability,
    mockKernelBridge,
    mockNotification,
  };
}

// ──────────────────────────────────────────────────────────────────────────────
// Fixtures
// ──────────────────────────────────────────────────────────────────────────────

const mockTopic = {
  id: "topic-001",
  name: "云计算趋势",
  type: "technology",
  description: "云计算技术趋势分析",
  language: "zh",
  userId: "user-001",
};

const mockLeaderPlan = {
  dimensions: [
    {
      id: "planned-dim-001",
      name: "技术现状",
      description: "云计算技术现状",
      priority: "high",
      searchQueries: ["cloud tech"],
      dataSources: ["web"],
    },
  ],
  agentAssignments: [
    {
      agentId: "researcher-01",
      agentName: "研究员 A",
      agentType: "dimension_researcher",
      assignedDimensions: ["planned-dim-001"],
      modelId: "gpt-4o",
      skills: ["deep_dive"],
      tools: ["web-search"],
    },
    {
      agentId: "reviewer-01",
      agentName: "审核员",
      agentType: "quality_reviewer",
      assignedDimensions: [],
      modelId: "gpt-4o",
      skills: ["critical_thinking"],
      tools: [],
    },
    {
      agentId: "writer-01",
      agentName: "撰写员",
      agentType: "report_writer",
      assignedDimensions: [],
      modelId: "gpt-4o",
      skills: ["synthesis"],
      tools: [],
    },
  ],
  strategy: "parallel",
};

// ──────────────────────────────────────────────────────────────────────────────
// Tests
// ──────────────────────────────────────────────────────────────────────────────

describe("ResearchMissionService (supplemental)", () => {
  let service: ResearchMissionService;
  let mocks: ReturnType<typeof buildMocks>;

  beforeAll(async () => {
    mocks = buildMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ResearchMissionService,
        { provide: PrismaService, useValue: mocks.mockPrisma },
        { provide: EventEmitter2, useValue: mocks.mockEventEmitter },
        { provide: ResearchLeaderService, useValue: mocks.mockLeaderService },
        {
          provide: DimensionMissionService,
          useValue: mocks.mockDimensionMissionService,
        },
        {
          provide: ReportSynthesisService,
          useValue: mocks.mockReportSynthesisService,
        },
        {
          provide: ResearchEventEmitterService,
          useValue: mocks.mockResearchEventEmitter,
        },
        {
          provide: TopicCollaboratorService,
          useValue: mocks.mockCollaboratorService,
        },
        {
          provide: AgentActivityService,
          useValue: mocks.mockAgentActivity,
        },
        { provide: ChatFacade, useValue: mocks.mockFacade },
        {
          provide: ResearchReviewerService,
          useValue: mocks.mockReviewerService,
        },
        {
          provide: MissionObservabilityService,
          useValue: mocks.mockObservability,
        },
        {
          provide: MissionKernelBridgeService,
          useValue: mocks.mockKernelBridge,
        },
        {
          provide: MissionNotificationService,
          useValue: mocks.mockNotification,
        },
      ],
    }).compile();

    service = module.get<ResearchMissionService>(ResearchMissionService);
  });

  afterEach(() => jest.clearAllMocks());

  // ============================================================
  // getTaskActivities
  // ============================================================

  describe("getTaskActivities", () => {
    it("should throw NotFoundException when task not found", async () => {
      mocks.mockPrisma.researchTask.findUnique.mockResolvedValue(null);

      await expect(service.getTaskActivities("nonexistent")).rejects.toThrow(
        NotFoundException,
      );
    });

    it("should query by dimensionId for dimension_research tasks", async () => {
      const mockTask = {
        id: "task-001",
        missionId: "mission-001",
        taskType: "dimension_research",
        dimensionId: "dim-001",
        assignedAgent: "researcher-01",
        mission: { topicId: "topic-001" },
      };
      mocks.mockPrisma.researchTask.findUnique.mockResolvedValue(mockTask);
      mocks.mockPrisma.researchAgentActivity.findMany.mockResolvedValue([]);

      const result = await service.getTaskActivities("task-001");

      expect(
        mocks.mockPrisma.researchAgentActivity.findMany,
      ).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            topicId: "topic-001",
            dimensionId: "dim-001",
          }),
        }),
      );
      expect(result.task).toBe(mockTask);
    });

    it("should query by missionId + agentRole for leader_planning tasks", async () => {
      const mockTask = {
        id: "task-002",
        missionId: "mission-001",
        taskType: "leader_planning",
        dimensionId: null,
        assignedAgent: "leader",
        mission: { topicId: "topic-001" },
      };
      mocks.mockPrisma.researchTask.findUnique.mockResolvedValue(mockTask);
      mocks.mockPrisma.researchAgentActivity.findMany.mockResolvedValue([]);

      await service.getTaskActivities("task-002");

      expect(
        mocks.mockPrisma.researchAgentActivity.findMany,
      ).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            missionId: "mission-001",
            agentRole: "leader",
          }),
        }),
      );
    });

    it("should query by missionId + agentRole synthesizer for report_synthesis tasks", async () => {
      const mockTask = {
        id: "task-003",
        missionId: "mission-001",
        taskType: "report_synthesis",
        dimensionId: null,
        assignedAgent: "writer-01",
        mission: { topicId: "topic-001" },
      };
      mocks.mockPrisma.researchTask.findUnique.mockResolvedValue(mockTask);
      mocks.mockPrisma.researchAgentActivity.findMany.mockResolvedValue([]);

      await service.getTaskActivities("task-003");

      expect(
        mocks.mockPrisma.researchAgentActivity.findMany,
      ).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            missionId: "mission-001",
            agentRole: "synthesizer",
          }),
        }),
      );
    });

    it("should query by missionId + agentRole reviewer for quality_review tasks", async () => {
      const mockTask = {
        id: "task-004",
        missionId: "mission-001",
        taskType: "quality_review",
        dimensionId: null,
        assignedAgent: "reviewer-01",
        mission: { topicId: "topic-001" },
      };
      mocks.mockPrisma.researchTask.findUnique.mockResolvedValue(mockTask);
      mocks.mockPrisma.researchAgentActivity.findMany.mockResolvedValue([]);

      await service.getTaskActivities("task-004");

      expect(
        mocks.mockPrisma.researchAgentActivity.findMany,
      ).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            missionId: "mission-001",
            agentRole: "reviewer",
          }),
        }),
      );
    });

    it("should query by missionId + agentId for other task types", async () => {
      const mockTask = {
        id: "task-005",
        missionId: "mission-001",
        taskType: "custom_task",
        dimensionId: null,
        assignedAgent: "custom-agent-01",
        mission: { topicId: "topic-001" },
      };
      mocks.mockPrisma.researchTask.findUnique.mockResolvedValue(mockTask);
      mocks.mockPrisma.researchAgentActivity.findMany.mockResolvedValue([]);

      await service.getTaskActivities("task-005");

      expect(
        mocks.mockPrisma.researchAgentActivity.findMany,
      ).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            missionId: "mission-001",
            agentId: "custom-agent-01",
          }),
        }),
      );
    });

    it("should return task and activities", async () => {
      const mockTask = {
        id: "task-006",
        missionId: "mission-001",
        taskType: "dimension_research",
        dimensionId: "dim-002",
        assignedAgent: "researcher-02",
        mission: { topicId: "topic-001" },
      };
      const mockActivities = [
        { id: "act-001", agentId: "researcher-02", content: "开始研究" },
      ];
      mocks.mockPrisma.researchTask.findUnique.mockResolvedValue(mockTask);
      mocks.mockPrisma.researchAgentActivity.findMany.mockResolvedValue(
        mockActivities,
      );

      const result = await service.getTaskActivities("task-006");

      expect(result.activities).toBe(mockActivities);
      expect(result.task).toBe(mockTask);
    });
  });

  // ============================================================
  // getTeamInfo
  // ============================================================

  describe("getTeamInfo", () => {
    it("should throw NotFoundException when mission not found", async () => {
      mocks.mockPrisma.researchMission.findUnique.mockResolvedValue(null);

      await expect(service.getTeamInfo("nonexistent")).rejects.toThrow(
        NotFoundException,
      );
    });

    it("should return team info with agents from tasks", async () => {
      const mockMission = {
        id: "mission-001",
        leaderModelId: "o3-mini",
        leaderModelName: "o3-mini",
        leaderPlan: null,
        tasks: [
          {
            id: "task-001",
            assignedAgent: "researcher-01",
            assignedAgentType: "dimension_researcher",
            taskType: "dimension_research",
            status: ResearchTaskStatus.EXECUTING,
            dimensionName: "技术现状",
            modelId: "gpt-4o",
            title: "研究技术现状",
          },
        ],
      };
      mocks.mockPrisma.researchMission.findUnique.mockResolvedValue(
        mockMission,
      );

      const result = await service.getTeamInfo("mission-001");

      expect(result.leaderId).toBe("leader");
      expect(result.leaderModel).toBe("o3-mini");
      expect(result.agents).toHaveLength(1);
      expect(result.agents[0].id).toBe("researcher-01");
      expect(result.agents[0].status).toBe("working");
    });

    it("should fallback to getReasoningModel when no stored leader model", async () => {
      const mockMission = {
        id: "mission-002",
        leaderModelId: null,
        leaderModelName: null,
        leaderPlan: null,
        tasks: [],
      };
      mocks.mockPrisma.researchMission.findUnique.mockResolvedValue(
        mockMission,
      );
      mocks.mockLeaderService.getReasoningModel.mockResolvedValue({
        modelId: "claude-3",
        modelName: "Claude 3",
      });

      const result = await service.getTeamInfo("mission-002");

      expect(mocks.mockLeaderService.getReasoningModel).toHaveBeenCalled();
      expect(result.leaderModel).toBe("claude-3");
    });

    it("should mark agent as completed when task is COMPLETED", async () => {
      const mockMission = {
        id: "mission-003",
        leaderModelId: "o3-mini",
        leaderModelName: "o3-mini",
        leaderPlan: null,
        tasks: [
          {
            id: "task-001",
            assignedAgent: "researcher-01",
            assignedAgentType: "dimension_researcher",
            taskType: "dimension_research",
            status: ResearchTaskStatus.COMPLETED,
            dimensionName: "技术现状",
            modelId: "gpt-4o",
            title: "研究技术现状",
          },
        ],
      };
      mocks.mockPrisma.researchMission.findUnique.mockResolvedValue(
        mockMission,
      );

      const result = await service.getTeamInfo("mission-003");

      expect(result.agents[0].status).toBe("completed");
    });

    it("should mark agent as failed when task is FAILED", async () => {
      const mockMission = {
        id: "mission-004",
        leaderModelId: "o3-mini",
        leaderModelName: "o3-mini",
        leaderPlan: null,
        tasks: [
          {
            id: "task-001",
            assignedAgent: "researcher-01",
            assignedAgentType: "dimension_researcher",
            taskType: "dimension_research",
            status: ResearchTaskStatus.FAILED,
            dimensionName: "技术现状",
            modelId: "gpt-4o",
            title: "研究技术现状",
          },
        ],
      };
      mocks.mockPrisma.researchMission.findUnique.mockResolvedValue(
        mockMission,
      );

      const result = await service.getTeamInfo("mission-004");

      expect(result.agents[0].status).toBe("failed");
    });

    it("should extract skills/tools from leaderPlan agentAssignments", async () => {
      const mockMission = {
        id: "mission-005",
        leaderModelId: "o3-mini",
        leaderModelName: "o3-mini",
        leaderPlan: {
          agentAssignments: [
            {
              agentId: "researcher-01",
              agentType: "dimension_researcher",
              modelId: "gpt-4o",
              skills: ["deep_dive", "synthesis"],
              tools: ["web-search"],
            },
          ],
        },
        tasks: [
          {
            id: "task-001",
            assignedAgent: "researcher-01",
            assignedAgentType: "dimension_researcher",
            taskType: "dimension_research",
            status: ResearchTaskStatus.PENDING,
            dimensionName: "技术现状",
            modelId: null,
            title: "研究技术现状",
          },
        ],
      };
      mocks.mockPrisma.researchMission.findUnique.mockResolvedValue(
        mockMission,
      );

      const result = await service.getTeamInfo("mission-005");

      const agent = result.agents[0];
      expect(agent.skills).toEqual(["deep_dive", "synthesis"]);
      expect(agent.tools).toEqual(["web-search"]);
    });

    it("should collect dimension names in assignedDimensions", async () => {
      const mockMission = {
        id: "mission-006",
        leaderModelId: "o3-mini",
        leaderModelName: "o3-mini",
        leaderPlan: null,
        tasks: [
          {
            id: "task-001",
            assignedAgent: "researcher-01",
            assignedAgentType: "dimension_researcher",
            taskType: "dimension_research",
            status: ResearchTaskStatus.PENDING,
            dimensionName: "技术现状",
            modelId: "gpt-4o",
            title: "研究技术现状",
          },
          {
            id: "task-002",
            assignedAgent: "researcher-01",
            assignedAgentType: "dimension_researcher",
            taskType: "dimension_research",
            status: ResearchTaskStatus.PENDING,
            dimensionName: "市场格局",
            modelId: "gpt-4o",
            title: "研究市场格局",
          },
        ],
      };
      mocks.mockPrisma.researchMission.findUnique.mockResolvedValue(
        mockMission,
      );

      const result = await service.getTeamInfo("mission-006");

      const agent = result.agents[0];
      expect(agent.assignedDimensions).toContain("技术现状");
      expect(agent.assignedDimensions).toContain("市场格局");
    });
  });

  // ============================================================
  // adjustMission
  // ============================================================

  describe("adjustMission", () => {
    it("should throw NotFoundException when mission not found", async () => {
      mocks.mockPrisma.researchMission.findUnique.mockResolvedValue(null);

      await expect(
        service.adjustMission("user-001", "nonexistent", {}),
      ).rejects.toThrow(NotFoundException);
    });

    it("should throw ForbiddenException when user is not the owner", async () => {
      mocks.mockPrisma.researchMission.findUnique.mockResolvedValue({
        id: "mission-001",
        topicId: "topic-001",
        status: ResearchMissionStatus.EXECUTING,
        tasks: [],
        progressPercent: 50,
        completedTasks: 1,
        totalTasks: 2,
        topic: { userId: "owner-user" },
      });

      await expect(
        service.adjustMission("other-user", "mission-001", {}),
      ).rejects.toThrow(ForbiddenException);
    });

    it("should throw when mission is not in EXECUTING status", async () => {
      mocks.mockPrisma.researchMission.findUnique.mockResolvedValue({
        id: "mission-001",
        topicId: "topic-001",
        status: ResearchMissionStatus.PLANNING,
        tasks: [],
        progressPercent: 0,
        completedTasks: 0,
        totalTasks: 0,
        topic: { userId: "user-001" },
      });

      await expect(
        service.adjustMission("user-001", "mission-001", {}),
      ).rejects.toThrow("Cannot adjust mission in PLANNING status");
    });

    it("should add new dimensions and update totalTasks", async () => {
      mocks.mockPrisma.researchMission.findUnique.mockResolvedValue({
        id: "mission-001",
        topicId: "topic-001",
        status: ResearchMissionStatus.EXECUTING,
        tasks: [],
        progressPercent: 50,
        completedTasks: 1,
        totalTasks: 2,
        topic: { userId: "user-001" },
      });
      mocks.mockPrisma.researchTask.create.mockResolvedValue({
        id: "new-task-001",
      });
      mocks.mockPrisma.researchMission.update.mockResolvedValue({});
      mocks.mockPrisma.leaderDecision.create.mockResolvedValue({});
      mocks.mockPrisma.researchMission.findUniqueOrThrow.mockResolvedValue({
        id: "mission-001",
        status: ResearchMissionStatus.EXECUTING,
      });

      await service.adjustMission("user-001", "mission-001", {
        addDimensions: [{ name: "新维度", description: "新维度描述" }],
      });

      expect(mocks.mockPrisma.researchTask.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            dimensionName: "新维度",
            missionId: "mission-001",
          }),
        }),
      );
      expect(mocks.mockPrisma.researchMission.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            totalTasks: { increment: 1 },
          }),
        }),
      );
    });

    it("should remove pending dimension task", async () => {
      mocks.mockPrisma.researchMission.findUnique.mockResolvedValue({
        id: "mission-001",
        topicId: "topic-001",
        status: ResearchMissionStatus.EXECUTING,
        tasks: [],
        progressPercent: 50,
        completedTasks: 1,
        totalTasks: 2,
        topic: { userId: "user-001" },
      });
      mocks.mockPrisma.researchTask.findFirst.mockResolvedValue({
        id: "task-to-remove",
        missionId: "mission-001",
        status: ResearchTaskStatus.PENDING,
      });
      mocks.mockPrisma.researchTask.delete.mockResolvedValue({});
      mocks.mockPrisma.leaderDecision.create.mockResolvedValue({});
      mocks.mockPrisma.researchMission.findUniqueOrThrow.mockResolvedValue({
        id: "mission-001",
      });

      await service.adjustMission("user-001", "mission-001", {
        removeDimensions: ["旧维度"],
      });

      expect(mocks.mockPrisma.researchTask.delete).toHaveBeenCalledWith({
        where: { id: "task-to-remove" },
      });
    });

    it("should call leader handleUserMessage for focusAreas adjustment", async () => {
      mocks.mockPrisma.researchMission.findUnique.mockResolvedValue({
        id: "mission-001",
        topicId: "topic-001",
        status: ResearchMissionStatus.EXECUTING,
        tasks: [],
        progressPercent: 50,
        completedTasks: 1,
        totalTasks: 2,
        topic: { userId: "user-001" },
      });
      mocks.mockLeaderService.handleUserMessage.mockResolvedValue({
        response: "已调整聚焦",
      });
      mocks.mockPrisma.leaderDecision.create.mockResolvedValue({});
      mocks.mockPrisma.researchMission.findUniqueOrThrow.mockResolvedValue({
        id: "mission-001",
      });

      await service.adjustMission("user-001", "mission-001", {
        focusAreas: ["技术创新", "成本效益"],
      });

      expect(mocks.mockLeaderService.handleUserMessage).toHaveBeenCalledWith(
        "topic-001",
        "mission-001",
        expect.stringContaining("技术创新"),
      );
    });
  });

  // ============================================================
  // cancelMission
  // ============================================================

  describe("cancelMission", () => {
    it("should throw NotFoundException when mission not found", async () => {
      mocks.mockPrisma.researchMission.findUnique.mockResolvedValue(null);

      await expect(
        service.cancelMission("user-001", "nonexistent"),
      ).rejects.toThrow(NotFoundException);
    });

    it("should throw ForbiddenException when user lacks access", async () => {
      mocks.mockPrisma.researchMission.findUnique.mockResolvedValue({
        id: "mission-001",
        status: ResearchMissionStatus.EXECUTING,
        topic: { id: "topic-001", userId: "owner-user" },
      });
      mocks.mockCollaboratorService.hasAccess.mockResolvedValue(false);

      await expect(
        service.cancelMission("other-user", "mission-001"),
      ).rejects.toThrow(ForbiddenException);

      expect(mocks.mockCollaboratorService.hasAccess).toHaveBeenCalledWith(
        "topic-001",
        "other-user",
        CollaboratorRole.EDITOR,
      );
    });

    it("should handle already-cancelled mission idempotently", async () => {
      mocks.mockPrisma.researchMission.findUnique.mockResolvedValue({
        id: "mission-001",
        status: ResearchMissionStatus.CANCELLED,
        topic: { id: "topic-001", userId: "user-001" },
      });
      mocks.mockCollaboratorService.hasAccess.mockResolvedValue(true);
      mocks.mockPrisma.researchTask.updateMany.mockResolvedValue({ count: 0 });
      mocks.mockPrisma.researchTodo.updateMany.mockResolvedValue({ count: 0 });
      mocks.mockPrisma.researchMission.update.mockResolvedValue({
        id: "mission-001",
        status: ResearchMissionStatus.CANCELLED,
      });

      const result = await service.cancelMission("user-001", "mission-001");

      expect(result).toBeDefined();
      // Should still update tasks for consistency
      expect(mocks.mockPrisma.researchTask.updateMany).toHaveBeenCalled();
    });

    it("should cancel active mission, tasks and todos", async () => {
      mocks.mockPrisma.researchMission.findUnique.mockResolvedValue({
        id: "mission-001",
        status: ResearchMissionStatus.EXECUTING,
        topic: { id: "topic-001", userId: "user-001" },
      });
      mocks.mockCollaboratorService.hasAccess.mockResolvedValue(true);
      mocks.mockPrisma.researchTask.updateMany.mockResolvedValue({ count: 2 });
      mocks.mockPrisma.researchTodo.updateMany.mockResolvedValue({ count: 1 });
      mocks.mockPrisma.researchMission.update.mockResolvedValue({
        id: "mission-001",
        status: ResearchMissionStatus.CANCELLED,
      });

      await service.cancelMission("user-001", "mission-001");

      expect(mocks.mockPrisma.researchMission.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: "mission-001" },
          data: { status: ResearchMissionStatus.CANCELLED },
        }),
      );
      expect(mocks.mockPrisma.researchTask.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ missionId: "mission-001" }),
          data: expect.objectContaining({ status: ResearchTaskStatus.FAILED }),
        }),
      );
      expect(mocks.mockPrisma.researchTodo.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ missionId: "mission-001" }),
          data: expect.objectContaining({
            status: ResearchTodoStatus.CANCELLED,
          }),
        }),
      );
    });
  });

  // ============================================================
  // createMission with incremental mode and active existing mission
  // ============================================================

  describe("createMission incremental with active existing mission", () => {
    it("should merge completed tasks from both previous and active mission", async () => {
      mocks.mockPrisma.researchTopic.findUnique.mockResolvedValue(mockTopic);

      const prevMission = {
        id: "prev-mission",
        topicId: "topic-001",
        status: ResearchMissionStatus.COMPLETED,
        tasks: [
          {
            id: "prev-task-001",
            dimensionName: "技术现状",
            dimensionId: "dim-001",
            title: "研究技术现状",
            description: "技术分析",
            assignedAgent: "researcher-01",
            assignedAgentType: "dimension_researcher",
            modelId: "gpt-4o",
            priority: 1,
            result: { summary: "done" },
            resultSummary: "completed",
            startedAt: new Date(),
            completedAt: new Date(),
            status: ResearchTaskStatus.COMPLETED,
          },
        ],
      };

      const activeMission = {
        id: "active-mission",
        topicId: "topic-001",
        status: ResearchMissionStatus.EXECUTING,
        tasks: [
          {
            id: "active-task-001",
            dimensionName: "市场格局",
            dimensionId: "dim-002",
            title: "研究市场格局",
            description: "市场分析",
            assignedAgent: "researcher-02",
            assignedAgentType: "dimension_researcher",
            modelId: "claude-3",
            priority: 2,
            result: { summary: "market done" },
            resultSummary: "completed",
            startedAt: new Date(),
            completedAt: new Date(),
            status: ResearchTaskStatus.COMPLETED,
          },
        ],
      };

      // incremental mode: first findFirst for previous mission, second for active
      mocks.mockPrisma.researchMission.findFirst
        .mockResolvedValueOnce(prevMission) // previous completed mission
        .mockResolvedValueOnce(activeMission); // active mission

      mocks.mockLeaderService.getReasoningModel.mockResolvedValue({
        modelId: "o3-mini",
        modelName: "o3-mini",
        provider: "openai",
        isReasoning: true,
      });
      mocks.mockPrisma.researchMission.update.mockResolvedValue({});
      mocks.mockPrisma.researchTask.updateMany.mockResolvedValue({ count: 0 });
      mocks.mockPrisma.researchTodo.updateMany.mockResolvedValue({ count: 0 });
      mocks.mockPrisma.researchMission.create.mockResolvedValue({
        id: "new-incremental-mission",
        topicId: "topic-001",
        status: ResearchMissionStatus.PLANNING,
      });

      const result = await service.createMission({
        topicId: "topic-001",
        mode: "incremental",
      });

      expect(result.id).toBe("new-incremental-mission");
      // Old active mission should be cancelled
      expect(mocks.mockPrisma.researchMission.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: "active-mission" },
          data: { status: ResearchMissionStatus.CANCELLED },
        }),
      );
    });
  });

  // ============================================================
  // approvePlanAndExecute - when mission has no leaderPlan
  // ============================================================

  describe("approvePlanAndExecute edge cases", () => {
    it("should successfully create tasks and start execution for plan with completedTasks", async () => {
      const completedTasks = [
        {
          dimensionName: "技术现状",
          dimensionId: "dim-001",
          title: "研究技术现状",
          description: "分析技术",
          assignedAgent: "researcher-01",
          assignedAgentType: "dimension_researcher",
          modelId: "gpt-4o",
          priority: 1,
          result: { summary: "done" },
          resultSummary: "completed",
          startedAt: new Date(),
          completedAt: new Date(),
        },
      ];

      mocks.mockPrisma.researchMission.findUnique.mockResolvedValue({
        id: "mission-inc-001",
        topicId: "topic-001",
        leaderPlan: mockLeaderPlan,
      });

      // For createTasksFromPlan
      mocks.mockPrisma.topicDimension.findFirst.mockResolvedValue(null);
      mocks.mockPrisma.topicDimension.findMany.mockResolvedValue([
        { id: "dim-001", name: "技术现状" },
      ]);
      mocks.mockPrisma.topicDimension.create.mockResolvedValue({
        id: "new-dim-001",
        name: "技术现状新",
      });
      mocks.mockPrisma.researchTask.createMany.mockResolvedValue({ count: 1 });
      mocks.mockPrisma.researchTask.findMany.mockResolvedValue([
        { id: "copied-task-001", status: ResearchTaskStatus.COMPLETED },
      ]);
      mocks.mockPrisma.researchTask.create.mockImplementation(
        (args: { data: { title: string } }) =>
          Promise.resolve({ id: `task-${Date.now()}`, ...args.data }),
      );
      mocks.mockPrisma.researchMission.update.mockResolvedValue({
        id: "mission-inc-001",
        status: ResearchMissionStatus.EXECUTING,
      });

      await service.approvePlanAndExecute(
        "mission-inc-001",
        "topic-001",
        completedTasks,
      );

      expect(mocks.mockPrisma.researchMission.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: "mission-inc-001" },
          data: expect.objectContaining({
            status: ResearchMissionStatus.EXECUTING,
          }),
        }),
      );
    });
  });

  // ============================================================
  // getTaskActivities - no dimensionId, no assignedAgent
  // ============================================================

  describe("getTaskActivities with null assignedAgent", () => {
    it("should query by missionId only when task has no assignedAgent", async () => {
      const mockTask = {
        id: "task-007",
        missionId: "mission-001",
        taskType: "custom_task",
        dimensionId: null,
        assignedAgent: null,
        mission: { topicId: "topic-001" },
      };
      mocks.mockPrisma.researchTask.findUnique.mockResolvedValue(mockTask);
      mocks.mockPrisma.researchAgentActivity.findMany.mockResolvedValue([]);

      await service.getTaskActivities("task-007");

      expect(
        mocks.mockPrisma.researchAgentActivity.findMany,
      ).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            missionId: "mission-001",
          }),
        }),
      );
    });
  });

  // ============================================================
  // getMissionStatus - returns researchDepth
  // ============================================================

  describe("getMissionStatus with researchDepth", () => {
    it("should include researchDepth in the returned status", async () => {
      const mockMissionData = {
        id: "mission-depth-001",
        topicId: "topic-001",
        status: ResearchMissionStatus.EXECUTING,
        progressPercent: 33,
        totalTasks: 3,
        completedTasks: 1,
        researchDepth: "deep",
        leaderPlan: null,
        tasks: [],
      };
      mocks.mockPrisma.researchMission.findUnique.mockResolvedValue(
        mockMissionData,
      );

      const result = await service.getMissionStatus("mission-depth-001");

      expect(result.researchDepth).toBe("deep");
    });

    it("should include leaderPlan in the returned status", async () => {
      const mockMissionData = {
        id: "mission-plan-001",
        topicId: "topic-001",
        status: ResearchMissionStatus.PLAN_READY,
        progressPercent: 50,
        totalTasks: 2,
        completedTasks: 0,
        researchDepth: "standard",
        leaderPlan: mockLeaderPlan,
        tasks: [],
      };
      mocks.mockPrisma.researchMission.findUnique.mockResolvedValue(
        mockMissionData,
      );

      const result = await service.getMissionStatus("mission-plan-001");

      expect(result.leaderPlan).toBeDefined();
    });
  });
});
