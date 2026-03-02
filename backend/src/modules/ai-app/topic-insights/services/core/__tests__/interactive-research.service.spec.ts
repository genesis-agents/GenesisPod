import { Test, TestingModule } from "@nestjs/testing";
import { InteractiveResearchService } from "../interactive-research.service";
import { PrismaService } from "@/common/prisma/prisma.service";
import { ChatFacade } from "@/modules/ai-engine/facade";
import {
  InteractionType,
  ResearchState,
  InteractionRequest,
  InteractionCheckpoint,
} from "../../../types/interactive-research.types";

const mockPrisma = {
  researchTopic: {
    findUnique: jest.fn(),
  },
  topicDimension: {
    create: jest.fn(),
  },
};

const mockFacade = {
  chat: jest.fn(),
};

const baseRequest = (
  type: InteractionType,
  payload: Record<string, unknown> = {},
): InteractionRequest => ({
  missionId: "mission-1",
  topicId: "topic-1",
  userId: "user-1",
  type,
  payload: payload as InteractionRequest["payload"],
  timestamp: new Date(),
});

describe("InteractiveResearchService", () => {
  let service: InteractiveResearchService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        InteractiveResearchService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: ChatFacade, useValue: mockFacade },
      ],
    }).compile();

    service = module.get<InteractiveResearchService>(
      InteractiveResearchService,
    );
    jest.clearAllMocks();
  });

  describe("handleInteraction - PAUSE", () => {
    it("should pause a researching mission", async () => {
      service.setState("mission-1", ResearchState.RESEARCHING);

      const result = await service.handleInteraction(
        baseRequest(InteractionType.PAUSE, { type: InteractionType.PAUSE }),
      );

      expect(result.success).toBe(true);
      expect(result.stateChange?.newState).toBe(ResearchState.PAUSED);
      expect(service.isPaused("mission-1")).toBe(true);
    });

    it("should not allow pause when already completed", async () => {
      service.setState("mission-1", ResearchState.COMPLETED);

      const result = await service.handleInteraction(
        baseRequest(InteractionType.PAUSE, { type: InteractionType.PAUSE }),
      );

      expect(result.success).toBe(false);
    });
  });

  describe("handleInteraction - RESUME", () => {
    it("should resume a paused mission", async () => {
      service.setState("mission-1", ResearchState.PAUSED);

      const result = await service.handleInteraction(
        baseRequest(InteractionType.RESUME, { type: InteractionType.RESUME }),
      );

      expect(result.success).toBe(true);
      expect(result.stateChange?.newState).toBe(ResearchState.RESEARCHING);
      expect(service.isPaused("mission-1")).toBe(false);
    });

    it("should not allow resume from RESEARCHING state", async () => {
      service.setState("mission-1", ResearchState.RESEARCHING);

      const result = await service.handleInteraction(
        baseRequest(InteractionType.RESUME, { type: InteractionType.RESUME }),
      );

      expect(result.success).toBe(false);
    });
  });

  describe("handleInteraction - REDIRECT", () => {
    it("should redirect research to new direction", async () => {
      service.setState("mission-1", ResearchState.RESEARCHING);
      mockFacade.chat.mockResolvedValue({
        content: JSON.stringify({
          affectedDimensions: ["dim-1"],
          newQueries: ["new query"],
          preserveDimensions: ["dim-2"],
        }),
        tokensUsed: 100,
        model: "gpt-4",
      });

      const result = await service.handleInteraction(
        baseRequest(InteractionType.REDIRECT, {
          type: InteractionType.REDIRECT,
          newDirection: "Focus on enterprise market",
          affectedDimensions: ["dim-1"],
        }),
      );

      expect(result.success).toBe(true);
      expect(result.message).toContain("Focus on enterprise market");
    });

    it("should restore previous state when redirect fails", async () => {
      service.setState("mission-1", ResearchState.RESEARCHING);
      mockFacade.chat.mockRejectedValue(new Error("API error"));

      const result = await service.handleInteraction(
        baseRequest(InteractionType.REDIRECT, {
          type: InteractionType.REDIRECT,
          newDirection: "New direction",
        }),
      );

      expect(result.success).toBe(false);
      expect(service.getState("mission-1")).toBe(ResearchState.RESEARCHING);
    });
  });

  describe("handleInteraction - FOLLOW_UP", () => {
    it("should answer follow-up question using AI", async () => {
      service.setState("mission-1", ResearchState.RESEARCHING);
      mockPrisma.researchTopic.findUnique.mockResolvedValue({
        id: "topic-1",
        name: "AI Market Research",
        dimensions: [{ id: "dim-1", name: "Market Size" }],
      });
      mockFacade.chat.mockResolvedValue({
        content: "The AI market is expected to reach $500B by 2025.",
        tokensUsed: 150,
        model: "gpt-4",
      });

      const result = await service.handleInteraction(
        baseRequest(InteractionType.FOLLOW_UP, {
          type: InteractionType.FOLLOW_UP,
          question: "What is the projected market size?",
        }),
      );

      expect(result.success).toBe(true);
      expect(result.message).toContain("$500B");
    });

    it("should return failure when topic not found", async () => {
      service.setState("mission-1", ResearchState.RESEARCHING);
      mockPrisma.researchTopic.findUnique.mockResolvedValue(null);

      const result = await service.handleInteraction(
        baseRequest(InteractionType.FOLLOW_UP, {
          type: InteractionType.FOLLOW_UP,
          question: "Any question?",
        }),
      );

      expect(result.success).toBe(false);
      expect(result.message).toContain("Topic not found");
    });
  });

  describe("handleInteraction - ADD_DIMENSION", () => {
    it("should add a new dimension to the topic", async () => {
      service.setState("mission-1", ResearchState.RESEARCHING);
      mockPrisma.topicDimension.create.mockResolvedValue({
        id: "dim-new",
        name: "New Dimension",
        topicId: "topic-1",
        status: "PENDING",
      });

      const result = await service.handleInteraction(
        baseRequest(InteractionType.ADD_DIMENSION, {
          type: InteractionType.ADD_DIMENSION,
          dimensionName: "New Dimension",
          dimensionDescription: "Description of new dimension",
          searchQueries: ["new query 1"],
        }),
      );

      expect(result.success).toBe(true);
      expect(result.stateChange?.addedDimensions).toContain("dim-new");
      expect(mockPrisma.topicDimension.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            name: "New Dimension",
            topicId: "topic-1",
          }),
        }),
      );
    });

    it("should return failure when dimension creation throws", async () => {
      service.setState("mission-1", ResearchState.RESEARCHING);
      mockPrisma.topicDimension.create.mockRejectedValue(new Error("DB error"));

      const result = await service.handleInteraction(
        baseRequest(InteractionType.ADD_DIMENSION, {
          type: InteractionType.ADD_DIMENSION,
          dimensionName: "Failing Dimension",
          dimensionDescription: "Will fail",
        }),
      );

      expect(result.success).toBe(false);
    });
  });

  describe("handleInteraction - ADJUST_DEPTH", () => {
    it("should adjust research depth globally", async () => {
      service.setState("mission-1", ResearchState.RESEARCHING);

      const result = await service.handleInteraction(
        baseRequest(InteractionType.ADJUST_DEPTH, {
          type: InteractionType.ADJUST_DEPTH,
          newDepth: "deep",
        }),
      );

      expect(result.success).toBe(true);
      expect(result.message).toContain("deep");
    });

    it("should adjust research depth for a specific dimension", async () => {
      service.setState("mission-1", ResearchState.RESEARCHING);

      const result = await service.handleInteraction(
        baseRequest(InteractionType.ADJUST_DEPTH, {
          type: InteractionType.ADJUST_DEPTH,
          newDepth: "comprehensive",
          dimensionId: "dim-1",
        }),
      );

      expect(result.success).toBe(true);
      expect(result.message).toContain("dim-1");
    });
  });

  describe("handleInteraction - APPROVE/REJECT", () => {
    it("should handle approval in REVIEWING state", async () => {
      service.setState("mission-1", ResearchState.REVIEWING);

      const result = await service.handleInteraction(
        baseRequest(InteractionType.APPROVE, {
          type: InteractionType.APPROVE,
          targetId: "checkpoint-1",
        }),
      );

      expect(result.success).toBe(true);
      expect(result.message).toContain("approved");
    });

    it("should handle rejection in REVIEWING state", async () => {
      service.setState("mission-1", ResearchState.REVIEWING);

      const result = await service.handleInteraction(
        baseRequest(InteractionType.REJECT, {
          type: InteractionType.REJECT,
          targetId: "checkpoint-1",
          reason: "Quality not acceptable",
        }),
      );

      expect(result.success).toBe(true);
      expect(result.message).toContain("rejected");
    });
  });

  describe("handleInteraction - invalid transitions", () => {
    it("should reject unsupported interaction type", async () => {
      service.setState("mission-1", ResearchState.RESEARCHING);

      const result = await service.handleInteraction(
        baseRequest("unsupported_type" as InteractionType),
      );

      expect(result.success).toBe(false);
    });
  });

  describe("state management", () => {
    it("should return default RESEARCHING state for unknown mission", () => {
      const state = service.getState("unknown-mission");

      expect(state).toBe(ResearchState.RESEARCHING);
    });

    it("should correctly set and get state", () => {
      service.setState("mission-x", ResearchState.REVIEWING);

      expect(service.getState("mission-x")).toBe(ResearchState.REVIEWING);
    });

    it("should report not paused when mission not in pausedMissions set", () => {
      expect(service.isPaused("unknown-mission")).toBe(false);
    });
  });

  describe("checkpoint management", () => {
    const testCheckpoint: InteractionCheckpoint = {
      missionId: "mission-1",
      checkpointId: "cp-1",
      phase: "researching",
      progress: 50,
      completedDimensions: ["dim-1"],
      pendingDimensions: ["dim-2"],
      interimFindings: ["Finding 1"],
      timestamp: new Date(),
    };

    it("should save and retrieve a checkpoint", () => {
      service.saveCheckpoint(testCheckpoint);

      const retrieved = service.getCheckpoint("mission-1");

      expect(retrieved).toBeDefined();
      expect(retrieved!.checkpointId).toBe("cp-1");
      expect(retrieved!.phase).toBe("researching");
    });

    it("should return undefined for missing checkpoint", () => {
      const cp = service.getCheckpoint("nonexistent-mission");

      expect(cp).toBeUndefined();
    });
  });

  describe("cleanup", () => {
    it("should remove all state for a completed mission", async () => {
      service.setState("mission-cleanup", ResearchState.PAUSED);
      service.saveCheckpoint({
        missionId: "mission-cleanup",
        checkpointId: "cp-1",
        phase: "paused",
        progress: 40,
        completedDimensions: [],
        pendingDimensions: [],
        interimFindings: [],
        timestamp: new Date(),
      });
      // Also mark as paused
      await service.handleInteraction({
        ...baseRequest(InteractionType.PAUSE, { type: InteractionType.PAUSE }),
        missionId: "mission-cleanup",
      });

      service.cleanup("mission-cleanup");

      expect(service.getState("mission-cleanup")).toBe(
        ResearchState.RESEARCHING,
      ); // default
      expect(service.getCheckpoint("mission-cleanup")).toBeUndefined();
      expect(service.isPaused("mission-cleanup")).toBe(false);
    });
  });
});
