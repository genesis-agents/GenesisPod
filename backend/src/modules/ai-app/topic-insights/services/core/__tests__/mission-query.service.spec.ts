/**
 * MissionQueryService Unit Tests
 */

import { Test, TestingModule } from "@nestjs/testing";
import { MissionQueryService } from "../mission-query.service";
import { PrismaService } from "@/common/prisma/prisma.service";
import { EventEmitter2 } from "@nestjs/event-emitter";
import { ResearchEventEmitterService } from "../research-event-emitter.service";
import { AIEngineFacade } from "@/modules/ai-engine/facade";
import { ResearchLeaderService } from "../research-leader.service";
import { NotFoundException } from "@nestjs/common";
import { ResearchMissionStatus, ResearchTaskStatus, AIModelType } from "@prisma/client";

// ─── Mocks ───────────────────────────────────────────────────────────────────

function buildMocks() {
  const mockPrisma = {
    researchMission: {
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      update: jest.fn(),
    },
    researchTask: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
    },
    researchAgentActivity: {
      findMany: jest.fn(),
    },
    aIModel: {
      findFirst: jest.fn(),
      findMany: jest.fn().mockResolvedValue([
        { modelId: "gpt-4o", displayName: "GPT-4o" },
      ]),
    },
  };

  const mockEventEmitter = { emit: jest.fn(), on: jest.fn() };

  const mockResearchEventEmitter = {
    emitMissionProgress: jest.fn(),
  };

  const mockAiFacade = {
    getDefaultModelByType: jest.fn().mockResolvedValue({ displayName: "GPT-4o", modelId: "gpt-4o" }),
    getReasoningModel: jest.fn().mockResolvedValue({ id: "gpt-4o", name: "GPT-4o", provider: "openai", isReasoning: false }),
  };

  const mockLeaderService = {
    getReasoningModel: jest.fn().mockResolvedValue(null),
  };

  return { mockPrisma, mockEventEmitter, mockResearchEventEmitter, mockAiFacade, mockLeaderService };
}

const mockTask = {
  id: "task-1",
  title: "Research Task",
  description: "Test task",
  taskType: "dimension_research",
  dimensionName: "Market Analysis",
  assignedAgent: "researcher-1",
  modelId: "gpt-4o",
  status: ResearchTaskStatus.PENDING,
  progress: 0,
  reviewStatus: null,
  result: null,
  resultSummary: null,
  startedAt: null,
  completedAt: null,
  dependencies: [],
  priority: 1,
  assignedAgentType: "dimension_researcher",
  missionId: "mission-1",
  mission: { topicId: "topic-1" },
  dimensionId: "dim-1",
};

const mockMission = {
  id: "mission-1",
  status: ResearchMissionStatus.EXECUTING,
  progressPercent: 50,
  totalTasks: 4,
  completedTasks: 2,
  leaderPlan: null,
  researchDepth: "standard",
  leaderModelId: "gpt-4o",
  leaderModelName: "GPT-4o",
  topicId: "topic-1",
  tasks: [mockTask],
};

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("MissionQueryService", () => {
  let service: MissionQueryService;
  let prisma: ReturnType<typeof buildMocks>["mockPrisma"];
  let eventEmitter: ReturnType<typeof buildMocks>["mockEventEmitter"];
  let researchEventEmitter: ReturnType<typeof buildMocks>["mockResearchEventEmitter"];

  beforeEach(async () => {
    const { mockPrisma, mockEventEmitter, mockResearchEventEmitter, mockAiFacade, mockLeaderService } = buildMocks();
    prisma = mockPrisma;
    eventEmitter = mockEventEmitter;
    researchEventEmitter = mockResearchEventEmitter;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MissionQueryService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: EventEmitter2, useValue: mockEventEmitter },
        { provide: ResearchEventEmitterService, useValue: mockResearchEventEmitter },
        { provide: AIEngineFacade, useValue: mockAiFacade },
        { provide: ResearchLeaderService, useValue: mockLeaderService },
      ],
    }).compile();

    service = module.get<MissionQueryService>(MissionQueryService);
  });

  afterEach(() => jest.clearAllMocks());

  // ─── getMissionStatus ───────────────────────────────────────────────────────

  describe("getMissionStatus", () => {
    it("should return mission status with tasks", async () => {
      prisma.researchMission.findUnique.mockResolvedValue(mockMission);

      const result = await service.getMissionStatus("mission-1");

      expect(result.id).toBe("mission-1");
      expect(result.status).toBe(ResearchMissionStatus.EXECUTING);
      expect(result.tasks).toHaveLength(1);
      expect(result.tasks[0].id).toBe("task-1");
    });

    it("should throw NotFoundException when mission not found", async () => {
      prisma.researchMission.findUnique.mockResolvedValue(null);

      await expect(service.getMissionStatus("nonexistent")).rejects.toThrow(NotFoundException);
    });

    it("should return correct phase from status", async () => {
      prisma.researchMission.findUnique.mockResolvedValue({
        ...mockMission,
        status: ResearchMissionStatus.PLANNING,
      });

      const result = await service.getMissionStatus("mission-1");
      expect(result.currentPhase).toBe("planning");
    });
  });

  // ─── getMissionByTopicId ────────────────────────────────────────────────────

  describe("getMissionByTopicId", () => {
    it("should return null when no mission found", async () => {
      prisma.researchMission.findFirst.mockResolvedValue(null);

      const result = await service.getMissionByTopicId("topic-1");
      expect(result).toBeNull();
    });

    it("should return mission status when found", async () => {
      prisma.researchMission.findFirst.mockResolvedValue(mockMission);

      const result = await service.getMissionByTopicId("topic-1");
      expect(result).not.toBeNull();
      expect(result!.id).toBe("mission-1");
    });
  });

  // ─── getTaskActivities ──────────────────────────────────────────────────────

  describe("getTaskActivities", () => {
    it("should throw NotFoundException when task not found", async () => {
      prisma.researchTask.findUnique.mockResolvedValue(null);

      await expect(service.getTaskActivities("nonexistent")).rejects.toThrow(NotFoundException);
    });

    it("should return task and activities for dimension task", async () => {
      prisma.researchTask.findUnique.mockResolvedValue(mockTask);
      prisma.researchAgentActivity.findMany.mockResolvedValue([]);

      const result = await service.getTaskActivities("task-1");

      expect(result.task.id).toBe("task-1");
      expect(result.activities).toEqual([]);
    });

    it("should use leader role filter for leader_planning tasks", async () => {
      const leaderTask = { ...mockTask, taskType: "leader_planning", dimensionId: null };
      prisma.researchTask.findUnique.mockResolvedValue(leaderTask);
      prisma.researchAgentActivity.findMany.mockResolvedValue([]);

      await service.getTaskActivities("task-1");

      expect(prisma.researchAgentActivity.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ agentRole: "leader" }),
        }),
      );
    });
  });

  // ─── updateTaskStatus ───────────────────────────────────────────────────────

  describe("updateTaskStatus", () => {
    it("should use conditional update for terminal COMPLETED status", async () => {
      prisma.researchTask.updateMany.mockResolvedValue({ count: 1 });
      prisma.researchTask.findUnique.mockResolvedValue({ ...mockTask, status: ResearchTaskStatus.COMPLETED, missionId: "mission-1" });
      prisma.researchTask.findMany.mockResolvedValue([{ ...mockTask, status: ResearchTaskStatus.COMPLETED }]);
      prisma.researchMission.update.mockResolvedValue({});

      const result = await service.updateTaskStatus("task-1", ResearchTaskStatus.COMPLETED);
      expect(result.status).toBe(ResearchTaskStatus.COMPLETED);
      expect(prisma.researchTask.updateMany).toHaveBeenCalled();
    });

    it("should use regular update for non-terminal status", async () => {
      prisma.researchTask.update.mockResolvedValue({ ...mockTask, status: ResearchTaskStatus.EXECUTING, missionId: "mission-1" });
      prisma.researchTask.findMany.mockResolvedValue([]);
      prisma.researchMission.update.mockResolvedValue({});

      await service.updateTaskStatus("task-1", ResearchTaskStatus.EXECUTING);
      expect(prisma.researchTask.update).toHaveBeenCalled();
    });

    it("should throw NotFoundException if task not found after terminal update", async () => {
      prisma.researchTask.updateMany.mockResolvedValue({ count: 0 });
      prisma.researchTask.findUnique.mockResolvedValue(null);

      await expect(
        service.updateTaskStatus("task-1", ResearchTaskStatus.COMPLETED),
      ).rejects.toThrow(NotFoundException);
    });
  });

  // ─── getExecutableTasks ─────────────────────────────────────────────────────

  describe("getExecutableTasks", () => {
    it("should return pending tasks with no dependencies", async () => {
      const pendingTask = { ...mockTask, status: ResearchTaskStatus.PENDING, dependencies: [] };
      prisma.researchTask.findMany.mockResolvedValue([pendingTask]);

      const result = await service.getExecutableTasks("mission-1");
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe("task-1");
    });

    it("should exclude tasks with incomplete dependencies", async () => {
      const completedTask = { ...mockTask, id: "task-0", status: ResearchTaskStatus.COMPLETED };
      const pendingTaskWithDep = {
        ...mockTask,
        id: "task-dep",
        status: ResearchTaskStatus.PENDING,
        dependencies: ["task-missing"],
      };
      prisma.researchTask.findMany.mockResolvedValue([completedTask, pendingTaskWithDep]);

      const result = await service.getExecutableTasks("mission-1");
      expect(result).toHaveLength(0);
    });

    it("should sort tasks by priority", async () => {
      const highPriority = { ...mockTask, id: "task-high", priority: 1, status: ResearchTaskStatus.PENDING, dependencies: [] };
      const lowPriority = { ...mockTask, id: "task-low", priority: 10, status: ResearchTaskStatus.PENDING, dependencies: [] };
      prisma.researchTask.findMany.mockResolvedValue([lowPriority, highPriority]);

      const result = await service.getExecutableTasks("mission-1");
      expect(result[0].id).toBe("task-high");
    });
  });

  // ─── emitProgress ──────────────────────────────────────────────────────────

  describe("emitProgress", () => {
    it("should emit both internal and websocket events", () => {
      service.emitProgress({
        missionId: "mission-1",
        topicId: "topic-1",
        status: ResearchMissionStatus.EXECUTING,
        progress: 50,
        phase: "executing",
        message: "Running",
        completedTasks: 2,
        totalTasks: 4,
      });

      expect(eventEmitter.emit).toHaveBeenCalled();
      expect(researchEventEmitter.emitMissionProgress).toHaveBeenCalledWith(
        "topic-1",
        expect.objectContaining({ missionId: "mission-1", progress: 50 }),
      );
    });
  });

  // ─── Helper methods ─────────────────────────────────────────────────────────

  describe("getAgentRole", () => {
    it("should return correct role for dimension_researcher", () => {
      expect(service.getAgentRole("dimension_researcher")).toBe("维度研究员");
    });

    it("should return default role for unknown type", () => {
      expect(service.getAgentRole("unknown")).toBe("研究员");
    });
  });

  describe("getPhaseFromStatus", () => {
    it("should return correct phases for each status", () => {
      expect(service.getPhaseFromStatus(ResearchMissionStatus.PLANNING)).toBe("planning");
      expect(service.getPhaseFromStatus(ResearchMissionStatus.EXECUTING)).toBe("researching");
      expect(service.getPhaseFromStatus(ResearchMissionStatus.COMPLETED)).toBe("completed");
      expect(service.getPhaseFromStatus(ResearchMissionStatus.FAILED)).toBe("failed");
    });
  });
});
