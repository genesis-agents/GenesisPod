// @ts-nocheck
import { describe, it, expect, beforeEach, jest } from "@jest/globals";
import { ResearchLeaderService } from "../../services/core/research-leader.service";
import { createMockAiEngineFacade } from "../mocks";

describe("ResearchLeaderService - V5 Methods", () => {
  let service: ResearchLeaderService;
  let mockAiFacade: ReturnType<typeof createMockAiEngineFacade>;

  beforeEach(() => {
    mockAiFacade = createMockAiEngineFacade();
    service = new ResearchLeaderService(
      {} as any, // prisma
      mockAiFacade as any, // aiFacade
      {} as any, // intentDetectionService
      {} as any, // eventEmitter
      {} as any, // leaderToolService
      {} as any, // researchMissionService
    );
  });

  describe("extractClaims", () => {
    it("should extract claims successfully using CHAT_FAST", async () => {
      const mockClaims = [
        {
          id: "c1",
          statement: "Market grew 15%",
          sectionId: "s1",
          sourceEvidenceIndices: [0],
          importance: "high",
        },
        {
          id: "c2",
          statement: "Revenue doubled",
          sectionId: "s1",
          sourceEvidenceIndices: [1],
          importance: "medium",
        },
      ];
      mockAiFacade.chat.mockResolvedValue({
        content: JSON.stringify({ claims: mockClaims }),
      });

      const result = await service.extractClaims(
        "s1",
        "Some section content about market growth",
      );

      expect(result).toHaveLength(2);
      expect(result[0].id).toBe("c1");
      expect(mockAiFacade.chat).toHaveBeenCalledWith(
        expect.objectContaining({ modelType: "CHAT_FAST" }),
      );
    });

    it("should return empty array on invalid JSON", async () => {
      mockAiFacade.chat.mockResolvedValue({ content: "not json at all" });
      const result = await service.extractClaims("s1", "content");
      expect(result).toEqual([]);
    });

    it("should return empty array on AI exception", async () => {
      mockAiFacade.chat.mockRejectedValue(new Error("API timeout"));
      const result = await service.extractClaims("s1", "content");
      expect(result).toEqual([]);
    });
  });

  describe("verifyHypotheses", () => {
    it("should verify hypotheses using CHAT_FAST", async () => {
      const hypotheses = [
        {
          id: "h1",
          statement: "AI adoption increases",
          type: "causal",
          evidenceNeeded: "data",
        },
        {
          id: "h2",
          statement: "Cost reduces",
          type: "correlational",
          evidenceNeeded: "stats",
        },
        {
          id: "h3",
          statement: "Demand grows",
          type: "descriptive",
          evidenceNeeded: "reports",
        },
      ];
      const mockResults = [
        {
          hypothesisId: "h1",
          status: "supported",
          supportingEvidence: "yes",
          contradictingEvidence: "",
          confidence: 85,
        },
        {
          hypothesisId: "h2",
          status: "refuted",
          supportingEvidence: "",
          contradictingEvidence: "no",
          confidence: 30,
        },
        {
          hypothesisId: "h3",
          status: "inconclusive",
          supportingEvidence: "some",
          contradictingEvidence: "some",
          confidence: 50,
        },
      ];
      mockAiFacade.chat.mockResolvedValue({
        content: JSON.stringify({ results: mockResults }),
      });

      const result = await service.verifyHypotheses(
        hypotheses,
        "evidence summary",
      );

      expect(result).toHaveLength(3);
      expect(result[0].hypothesisId).toBe("h1");
      expect(mockAiFacade.chat).toHaveBeenCalledWith(
        expect.objectContaining({ modelType: "CHAT_FAST" }),
      );
    });

    it("should return empty array for empty hypotheses without calling AI", async () => {
      const result = await service.verifyHypotheses([], "evidence");
      expect(result).toEqual([]);
      expect(mockAiFacade.chat).not.toHaveBeenCalled();
    });
  });
});
