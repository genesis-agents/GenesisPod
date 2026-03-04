/**
 * AdaptivePlanningService Unit Tests
 */

import { Test, TestingModule } from "@nestjs/testing";
import {
  AdaptivePlanningService,
  TaskEvaluation,
  PlanAdjustments,
} from "../adaptive-planning.service";
import { PrismaService } from "@/common/prisma/prisma.service";
import { ChatFacade } from "@/modules/ai-engine/facade";
import { ResearchEventEmitterService } from "../research-event-emitter.service";

// ─── Mocks ───────────────────────────────────────────────────────────────────

function buildMocks() {
  const mockPrisma = {
    researchTask: {
      findUnique: jest.fn(),
      create: jest.fn(),
      updateMany: jest.fn(),
    },
    researchMission: {
      findUnique: jest.fn(),
      update: jest.fn(),
    },
  };

  const mockAiFacade = {
    chatWithSkills: jest.fn().mockResolvedValue({
      content: JSON.stringify({
        taskId: "task-1",
        dimensionName: "Market Analysis",
        qualityScore: 85,
        gaps: [],
        contradictions: [],
        newAngles: [],
        overallAssessment: "Good quality research",
      }),
      tokensUsed: 100,
    }),
  };

  const mockEventEmitter = {
    emitLeaderThinking: jest.fn().mockResolvedValue(undefined),
  };

  return { mockPrisma, mockAiFacade, mockEventEmitter };
}

const mockTask = {
  id: "task-1",
  missionId: "mission-1",
  dimensionName: "Market Analysis",
  result: {
    summary: "Market is growing",
    keyFindings: ["Growth at 15%"],
  },
  resultSummary: "Market growing",
  mission: { topicId: "topic-1" },
};

const mockEvaluation: TaskEvaluation = {
  taskId: "task-1",
  dimensionName: "Market Analysis",
  qualityScore: 85,
  gaps: [],
  contradictions: [],
  newAngles: [],
  overallAssessment: "Good research",
};

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("AdaptivePlanningService", () => {
  let service: AdaptivePlanningService;
  let prisma: ReturnType<typeof buildMocks>["mockPrisma"];
  let aiFacade: ReturnType<typeof buildMocks>["mockAiFacade"];

  beforeEach(async () => {
    const mocks = buildMocks();
    prisma = mocks.mockPrisma;
    aiFacade = mocks.mockAiFacade;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AdaptivePlanningService,
        { provide: PrismaService, useValue: mocks.mockPrisma },
        { provide: ChatFacade, useValue: mocks.mockAiFacade },
        {
          provide: ResearchEventEmitterService,
          useValue: mocks.mockEventEmitter,
        },
      ],
    }).compile();

    service = module.get<AdaptivePlanningService>(AdaptivePlanningService);
  });

  afterEach(() => jest.clearAllMocks());

  // ─── shouldAdaptPlan ────────────────────────────────────────────────────────

  describe("shouldAdaptPlan", () => {
    it("should return true when quality score is below 60", () => {
      const evaluation: TaskEvaluation = {
        ...mockEvaluation,
        qualityScore: 55,
      };
      expect(service.shouldAdaptPlan(evaluation)).toBe(true);
    });

    it("should return true when there are high severity gaps", () => {
      const evaluation: TaskEvaluation = {
        ...mockEvaluation,
        qualityScore: 75,
        gaps: [{ description: "Missing data", severity: "high" }],
      };
      expect(service.shouldAdaptPlan(evaluation)).toBe(true);
    });

    it("should return true when there are contradictions", () => {
      const evaluation: TaskEvaluation = {
        ...mockEvaluation,
        qualityScore: 75,
        contradictions: [
          { description: "Conflicting stats", conflictingPoints: ["A", "B"] },
        ],
      };
      expect(service.shouldAdaptPlan(evaluation)).toBe(true);
    });

    it("should return true when there are high potential new angles", () => {
      const evaluation: TaskEvaluation = {
        ...mockEvaluation,
        qualityScore: 75,
        newAngles: [{ description: "New trend", potential: "high" }],
      };
      expect(service.shouldAdaptPlan(evaluation)).toBe(true);
    });

    it("should return false when quality is good with no issues", () => {
      expect(service.shouldAdaptPlan(mockEvaluation)).toBe(false);
    });

    it("should return false when gaps are only low severity", () => {
      const evaluation: TaskEvaluation = {
        ...mockEvaluation,
        qualityScore: 80,
        gaps: [{ description: "Minor gap", severity: "low" }],
      };
      expect(service.shouldAdaptPlan(evaluation)).toBe(false);
    });
  });

  // ─── evaluateTaskCompletion ─────────────────────────────────────────────────

  describe("evaluateTaskCompletion", () => {
    it("should throw error when task not found", async () => {
      prisma.researchTask.findUnique.mockResolvedValue(null);

      await expect(
        service.evaluateTaskCompletion("mission-1", "nonexistent", "topic-1"),
      ).rejects.toThrow("Task nonexistent not found");
    });

    it("should return evaluation with AI response parsed correctly", async () => {
      prisma.researchTask.findUnique.mockResolvedValue(mockTask);
      aiFacade.chatWithSkills.mockResolvedValue({
        content: JSON.stringify({
          taskId: "task-1",
          dimensionName: "Market Analysis",
          qualityScore: 90,
          gaps: [],
          contradictions: [],
          newAngles: [],
          overallAssessment: "Excellent",
        }),
      });

      const result = await service.evaluateTaskCompletion(
        "mission-1",
        "task-1",
        "topic-1",
      );
      expect(result.qualityScore).toBe(90);
      expect(result.dimensionName).toBe("Market Analysis");
    });

    it("should return default evaluation when AI fails", async () => {
      prisma.researchTask.findUnique.mockResolvedValue(mockTask);
      aiFacade.chatWithSkills.mockRejectedValue(new Error("AI service error"));

      const result = await service.evaluateTaskCompletion(
        "mission-1",
        "task-1",
        "topic-1",
      );
      // Default evaluation has qualityScore of 70
      expect(result.qualityScore).toBe(70);
    });

    it("should return default evaluation when AI returns invalid JSON", async () => {
      prisma.researchTask.findUnique.mockResolvedValue(mockTask);
      aiFacade.chatWithSkills.mockResolvedValue({ content: "not valid json" });

      const result = await service.evaluateTaskCompletion(
        "mission-1",
        "task-1",
        "topic-1",
      );
      expect(result.qualityScore).toBe(70);
    });
  });

  // ─── generatePlanAdjustments ────────────────────────────────────────────────

  describe("generatePlanAdjustments", () => {
    it("should return empty adjustments when AI fails", async () => {
      prisma.researchMission.findUnique.mockResolvedValue({
        id: "mission-1",
        leaderPlan: null,
        tasks: [],
      });
      aiFacade.chatWithSkills.mockRejectedValue(new Error("API error"));

      const result = await service.generatePlanAdjustments(
        "mission-1",
        "topic-1",
        mockEvaluation,
      );
      expect(result.addTasks).toEqual([]);
      expect(result.removeTasks).toEqual([]);
      expect(result.reorderTasks).toEqual([]);
    });

    it("should throw when mission not found", async () => {
      prisma.researchMission.findUnique.mockResolvedValue(null);

      await expect(
        service.generatePlanAdjustments(
          "nonexistent",
          "topic-1",
          mockEvaluation,
        ),
      ).rejects.toThrow("Mission nonexistent not found");
    });

    it("should return parsed adjustments on success", async () => {
      const mockAdjustments: PlanAdjustments = {
        addTasks: [
          {
            title: "Extra research",
            description: "Fill the gap",
            priority: 2,
            reasoning: "Gap found",
          },
        ],
        removeTasks: [],
        reorderTasks: [],
        adjustmentRationale: "Adding supplementary research",
      };

      prisma.researchMission.findUnique.mockResolvedValue({
        id: "mission-1",
        leaderPlan: null,
        tasks: [],
      });
      aiFacade.chatWithSkills.mockResolvedValue({
        content: JSON.stringify(mockAdjustments),
      });

      const result = await service.generatePlanAdjustments(
        "mission-1",
        "topic-1",
        mockEvaluation,
      );
      expect(result.addTasks).toHaveLength(1);
    });
  });

  // ─── applyPlanAdjustments ───────────────────────────────────────────────────

  describe("applyPlanAdjustments", () => {
    it("should throw when mission not found", async () => {
      prisma.researchMission.findUnique.mockResolvedValue(null);

      const emptyAdjustments: PlanAdjustments = {
        addTasks: [],
        removeTasks: [],
        reorderTasks: [],
        adjustmentRationale: "No changes",
      };

      await expect(
        service.applyPlanAdjustments("nonexistent", emptyAdjustments),
      ).rejects.toThrow("Mission nonexistent not found");
    });

    it("should create new tasks when adjustments include addTasks", async () => {
      prisma.researchMission.findUnique.mockResolvedValue({
        id: "mission-1",
        leaderPlan: null,
        topicId: "topic-1",
      });
      prisma.researchTask.create.mockResolvedValue({ id: "new-task" });
      prisma.researchMission.update.mockResolvedValue({});

      const adjustments: PlanAdjustments = {
        addTasks: [
          {
            title: "New Task",
            description: "Additional research",
            priority: 3,
            reasoning: "Gap found",
          },
        ],
        removeTasks: [],
        reorderTasks: [],
        adjustmentRationale: "Gap found",
      };

      await service.applyPlanAdjustments("mission-1", adjustments);
      expect(prisma.researchTask.create).toHaveBeenCalled();
      expect(prisma.researchMission.update).toHaveBeenCalled();
    });

    it("should mark tasks as failed when adjustments include removeTasks", async () => {
      prisma.researchMission.findUnique.mockResolvedValue({
        id: "mission-1",
        leaderPlan: null,
        topicId: "topic-1",
      });
      prisma.researchTask.updateMany.mockResolvedValue({ count: 1 });
      prisma.researchMission.update.mockResolvedValue({});

      const adjustments: PlanAdjustments = {
        addTasks: [],
        removeTasks: [{ taskId: "task-old", reasoning: "Redundant" }],
        reorderTasks: [],
        adjustmentRationale: "Removing redundant",
      };

      await service.applyPlanAdjustments("mission-1", adjustments);
      expect(prisma.researchTask.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ id: "task-old", status: "PENDING" }),
          data: expect.objectContaining({ status: "FAILED" }),
        }),
      );
    });
  });

  // ─── handleTaskCompleted (event handler) ────────────────────────────────────

  describe("handleTaskCompleted", () => {
    it("should skip non-dimension_research tasks", async () => {
      await service.handleTaskCompleted({
        taskId: "task-1",
        taskType: "quality_review",
        topicId: "topic-1",
      });

      expect(prisma.researchTask.findUnique).not.toHaveBeenCalled();
    });

    it("should gracefully handle missing task", async () => {
      prisma.researchTask.findUnique
        .mockResolvedValueOnce({ missionId: "mission-1" }) // first call for missionId
        .mockResolvedValueOnce(null); // second call for full task

      // Should not throw
      await expect(
        service.handleTaskCompleted({
          taskId: "task-1",
          taskType: "dimension_research",
        }),
      ).resolves.toBeUndefined();
    });
  });

  // ─── onModuleDestroy ────────────────────────────────────────────────────────

  describe("onModuleDestroy", () => {
    it("should clear mission locks", () => {
      // Just verify it doesn't throw
      expect(() => service.onModuleDestroy()).not.toThrow();
    });
  });
});
