/**
 * LeaderReviewService Unit Tests
 */

import { Test, TestingModule } from "@nestjs/testing";
import { LeaderReviewService } from "../leader-review.service";
import { MissionKernelBridgeService } from "../mission-kernel-bridge.service";
import { PrismaService } from "@/common/prisma/prisma.service";
import { ChatFacade } from "@/modules/ai-engine/facade";

// ─── Mocks ───────────────────────────────────────────────────────────────────

function buildMocks() {
  const mockPrisma = {
    leaderDecision: {
      create: jest.fn().mockResolvedValue({ id: "decision-1" }),
    },
  };

  const mockAiFacade = {
    getAvailableModelsExtended: jest.fn().mockResolvedValue([
      {
        id: "gpt-4o",
        name: "GPT-4o",
        provider: "openai",
        isReasoning: false,
      },
    ]),
    getReasoningModel: jest.fn().mockResolvedValue({
      id: "gpt-4o",
      name: "GPT-4o",
      provider: "openai",
      isReasoning: false,
    }),
    chat: jest.fn(),
    chatWithSkills: jest.fn(),
    chatStructured: jest.fn(),
  };

  const mockKernelBridge = {
    extractResearchConstraints: jest.fn().mockReturnValue([]),
    validateResearchOutput: jest
      .fn()
      .mockResolvedValue({ isValid: true, violations: [] }),
    formatConstraintsForPrompt: jest.fn().mockReturnValue(""),
  };

  return { mockPrisma, mockAiFacade, mockKernelBridge };
}

const mockSection = {
  id: "section-1",
  title: "Market Overview",
  description: "An overview of the market",
  keyPoints: ["Point 1", "Point 2"],
  targetWords: 1000,
  evidenceRequirements: { minReferences: 3 },
};

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("LeaderReviewService", () => {
  let service: LeaderReviewService;
  let prisma: ReturnType<typeof buildMocks>["mockPrisma"];
  let aiFacade: ReturnType<typeof buildMocks>["mockAiFacade"];

  beforeEach(async () => {
    const mocks = buildMocks();
    prisma = mocks.mockPrisma;
    aiFacade = mocks.mockAiFacade;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        LeaderReviewService,
        { provide: PrismaService, useValue: mocks.mockPrisma },
        { provide: ChatFacade, useValue: mocks.mockAiFacade },
        {
          provide: MissionKernelBridgeService,
          useValue: mocks.mockKernelBridge,
        },
      ],
    }).compile();

    service = module.get<LeaderReviewService>(LeaderReviewService);
  });

  afterEach(() => jest.clearAllMocks());

  // ─── getReasoningModel ──────────────────────────────────────────────────────

  describe("getReasoningModel", () => {
    it("should return model info when facade has model", async () => {
      const result = await service.getReasoningModel();
      expect(result).not.toBeNull();
      expect(result!.modelId).toBe("gpt-4o");
    });

    it("should return null when facade returns no model", async () => {
      aiFacade.getReasoningModel.mockResolvedValue(null);
      const result = await service.getReasoningModel();
      expect(result).toBeNull();
    });
  });

  // ─── reviewTaskResult ───────────────────────────────────────────────────────

  describe("reviewTaskResult", () => {
    it("should throw when no reasoning model available", async () => {
      aiFacade.getReasoningModel.mockResolvedValue(null);
      aiFacade.getAvailableModelsExtended.mockResolvedValue([]);

      await expect(
        service.reviewTaskResult("mission-1", "task-1", { summary: "Test" }),
      ).rejects.toThrow("No reasoning model available");
    });

    it("should return approved decision on successful AI review", async () => {
      aiFacade.chatStructured.mockResolvedValue({
        data: {
          status: "approved",
          feedback: "Good research",
          suggestions: [],
        },
        rawContent: "{}",
        model: "gpt-4o",
        tokensUsed: 100,
        retriedParse: false,
      });

      const result = await service.reviewTaskResult(
        "mission-1",
        "task-1",
        "Research content",
        "Market Analysis",
      );
      expect(result.taskId).toBe("task-1");
      expect(result.status).toBe("approved");
      expect(prisma.leaderDecision.create).toHaveBeenCalled();
    });

    it("should default to approved when AI response cannot be parsed", async () => {
      aiFacade.chatStructured.mockResolvedValue({
        data: {},
        rawContent: "invalid json",
        model: "gpt-4o",
        tokensUsed: 50,
        retriedParse: true,
      });

      const result = await service.reviewTaskResult(
        "mission-1",
        "task-1",
        "Research content",
      );
      expect(result.status).toBe("approved");
      expect(result.feedback).toContain("解析失败");
    });

    it("should return needs_revision when AI says revision needed", async () => {
      aiFacade.chatStructured.mockResolvedValue({
        data: {
          status: "needs_revision",
          feedback: "Missing data",
          revisionInstructions: "Add more evidence",
        },
        rawContent: "{}",
        model: "gpt-4o",
        tokensUsed: 100,
        retriedParse: false,
      });

      const result = await service.reviewTaskResult(
        "mission-1",
        "task-1",
        "Incomplete research",
      );
      expect(result.status).toBe("needs_revision");
      expect(result.revisionInstructions).toBe("Add more evidence");
    });
  });

  // ─── reviewSectionOutput ────────────────────────────────────────────────────

  describe("reviewSectionOutput", () => {
    it("should return approved by default when no reasoning model", async () => {
      aiFacade.getReasoningModel.mockResolvedValue(null);
      aiFacade.getAvailableModelsExtended.mockResolvedValue([]);

      const result = await service.reviewSectionOutput(
        mockSection,
        "Section content",
      );
      expect(result.approved).toBe(true);
      expect(result.score).toBe(70);
    });

    it("should return approved decision on good section", async () => {
      aiFacade.chatWithSkills.mockResolvedValue({
        content: JSON.stringify({
          approved: true,
          score: 85,
          feedback: "Well written",
        }),
      });

      const result = await service.reviewSectionOutput(
        mockSection,
        "Excellent content",
      );
      expect(result.approved).toBe(true);
      expect(result.score).toBe(85);
    });

    it("should force approval after max revisions", async () => {
      aiFacade.chatWithSkills.mockResolvedValue({
        content: JSON.stringify({
          approved: false,
          score: 55,
          feedback: "Needs improvement",
          revisionInstructions: "Revise completely",
        }),
      });

      // revisionCount >= 2 triggers force approval
      const result = await service.reviewSectionOutput(
        mockSection,
        "Content",
        2,
      );
      expect(result.approved).toBe(true);
      expect(result.feedback).toContain("强制通过");
    });

    it("should return rejection with instructions when review fails", async () => {
      aiFacade.chatWithSkills.mockResolvedValue({
        content: JSON.stringify({
          approved: false,
          score: 40,
          feedback: "Incomplete",
          revisionInstructions: "Add more data",
        }),
      });

      const result = await service.reviewSectionOutput(
        mockSection,
        "Incomplete content",
        0,
      );
      expect(result.approved).toBe(false);
      expect(result.revisionInstructions).toBe("Add more data");
    });

    it("should default to approved when AI response parsing fails", async () => {
      aiFacade.chatWithSkills.mockResolvedValue({ content: "not json" });

      const result = await service.reviewSectionOutput(mockSection, "Content");
      expect(result.approved).toBe(true);
    });
  });

  // ─── extractClaims ──────────────────────────────────────────────────────────

  describe("extractClaims", () => {
    it("should return empty array when AI fails", async () => {
      aiFacade.chatStructured.mockRejectedValue(new Error("API error"));

      const result = await service.extractClaims("section-1", "Some content");
      expect(result).toEqual([]);
    });

    it("should return claims when AI succeeds", async () => {
      aiFacade.chatStructured.mockResolvedValue({
        data: {
          claims: [
            {
              id: "c-1",
              text: "AI market is growing",
              type: "fact",
              confidence: 0.9,
              sectionId: "section-1",
            },
          ],
        },
        rawContent: "{}",
        model: "gpt-4o",
        tokensUsed: 100,
        retriedParse: false,
      });

      const result = await service.extractClaims(
        "section-1",
        "AI market is growing at 15% annually",
      );
      expect(result).toHaveLength(1);
    });
  });

  // ─── verifyHypotheses ───────────────────────────────────────────────────────

  describe("verifyHypotheses", () => {
    it("should return empty array for empty hypotheses input", async () => {
      const result = await service.verifyHypotheses([], "some evidence");
      expect(result).toEqual([]);
      expect(aiFacade.chatStructured).not.toHaveBeenCalled();
    });

    it("should return empty array when AI fails", async () => {
      aiFacade.chatStructured.mockRejectedValue(new Error("API error"));

      const hypotheses = [
        {
          id: "h-1",
          statement: "AI will replace jobs",
          confidence: 0.7,
          dimension: "Market",
        },
      ];
      const result = await service.verifyHypotheses(
        hypotheses as any,
        "evidence text",
      );
      expect(result).toEqual([]);
    });

    it("should return verification results when AI succeeds", async () => {
      aiFacade.chatStructured.mockResolvedValue({
        data: {
          results: [
            {
              hypothesisId: "h-1",
              verified: true,
              confidence: 0.8,
              evidence: "Supporting data",
            },
          ],
        },
        rawContent: "{}",
        model: "gpt-4o",
        tokensUsed: 100,
        retriedParse: false,
      });

      const hypotheses = [
        {
          id: "h-1",
          statement: "AI will replace jobs",
          confidence: 0.7,
          dimension: "Market",
        },
      ];
      const result = await service.verifyHypotheses(
        hypotheses as any,
        "evidence text",
      );
      expect(result).toHaveLength(1);
    });
  });
});
