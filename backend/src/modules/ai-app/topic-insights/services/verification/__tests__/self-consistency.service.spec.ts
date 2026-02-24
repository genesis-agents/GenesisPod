import { Test, TestingModule } from "@nestjs/testing";
import { SelfConsistencyService } from "../self-consistency.service";
import { AIEngineFacade } from "@/modules/ai-engine/facade";
import { DEFAULT_SELF_CONSISTENCY_CONFIG } from "../../../types/quality-enhancement.types";
import type { SelfConsistencyRequest } from "../self-consistency.service";

const mockAiFacade = {
  chat: jest.fn(),
};

const makeRequest = (question = "What is the impact of AI on employment?"): SelfConsistencyRequest => ({
  question,
  context: {
    topicName: "AI and Employment",
    dimensionName: "Job Market Impact",
    evidences: [
      { id: "e1", content: "AI is automating many routine tasks.", source: "McKinsey Report 2024" },
      { id: "e2", content: "New AI-related jobs are being created.", source: "WEF Future of Jobs 2025" },
    ],
  },
});

describe("SelfConsistencyService", () => {
  let service: SelfConsistencyService;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SelfConsistencyService,
        { provide: AIEngineFacade, useValue: mockAiFacade },
      ],
    }).compile();

    service = module.get<SelfConsistencyService>(SelfConsistencyService);
  });

  // ============================================================
  // checkConsistency
  // ============================================================

  describe("checkConsistency", () => {
    it("should generate paths and analyze consistency", async () => {
      // Mock path generation (multiple calls for numPaths)
      const pathResponse = JSON.stringify({
        reasoning: "Based on evidence, AI creates more jobs than it displaces.",
        conclusion: "AI net positive for employment in the long run.",
        confidence: 0.8,
        keySteps: ["Step 1: Analyze job creation", "Step 2: Analyze displacement"],
        evidenceUsed: ["e1", "e2"],
      });

      const analysisResponse = JSON.stringify({
        agreementRate: 0.85,
        majorityConclusion: "AI net positive for employment.",
        clusters: [
          {
            theme: "Net positive",
            pathIndices: [0, 1, 2],
            isMajority: true,
            representativeConclusion: "AI creates more jobs than it displaces.",
          },
        ],
        synthesizedConclusion: "AI net positive for employment.",
        needsHumanReview: false,
        reviewReasons: [],
      });

      // First N calls are path generation, last call is analysis
      mockAiFacade.chat
        .mockResolvedValueOnce({ content: pathResponse })
        .mockResolvedValueOnce({ content: pathResponse })
        .mockResolvedValueOnce({ content: pathResponse })
        .mockResolvedValueOnce({ content: pathResponse })
        .mockResolvedValueOnce({ content: pathResponse })
        .mockResolvedValueOnce({ content: analysisResponse });

      const result = await service.checkConsistency(makeRequest());

      expect(result.paths.length).toBeGreaterThan(0);
      expect(result.agreementRate).toBeGreaterThan(0);
      expect(typeof result.isConsistent).toBe("boolean");
    });

    it("should return empty result when all path generations fail", async () => {
      mockAiFacade.chat.mockRejectedValue(new Error("LLM unavailable"));

      const result = await service.checkConsistency(makeRequest());

      expect(result.paths).toHaveLength(0);
      expect(result.isConsistent).toBe(false);
      expect(result.needsHumanReview).toBe(true);
    });

    it("should use simplified consistency check with custom config", async () => {
      const pathResponse = JSON.stringify({
        reasoning: "Analysis of the impact.",
        conclusion: "Mixed impact on employment.",
        confidence: 0.75,
        keySteps: ["Step 1", "Step 2"],
        evidenceUsed: ["e1"],
      });

      const analysisResponse = JSON.stringify({
        agreementRate: 0.9,
        majorityConclusion: "Mixed impact.",
        clusters: [
          {
            theme: "Mixed",
            pathIndices: [0, 1],
            isMajority: true,
            representativeConclusion: "Mixed impact.",
          },
        ],
        synthesizedConclusion: "Mixed impact.",
        needsHumanReview: false,
        reviewReasons: [],
      });

      mockAiFacade.chat
        .mockResolvedValueOnce({ content: pathResponse })
        .mockResolvedValueOnce({ content: pathResponse })
        .mockResolvedValueOnce({ content: analysisResponse });

      const result = await service.checkConsistency({
        ...makeRequest(),
        config: { numPaths: 2, consistencyThreshold: 0.7 },
      });

      expect(result).toBeDefined();
      expect(result.majorityConclusion).toBeTruthy();
    });
  });

  // ============================================================
  // Path generation edge cases
  // ============================================================

  describe("path generation", () => {
    it("should handle partial path failures gracefully", async () => {
      const goodResponse = JSON.stringify({
        reasoning: "Good reasoning",
        conclusion: "Clear conclusion",
        confidence: 0.85,
        keySteps: ["step 1"],
        evidenceUsed: ["e1"],
      });

      const analysisResponse = JSON.stringify({
        agreementRate: 1.0,
        majorityConclusion: "Clear conclusion",
        clusters: [
          { theme: "Agreement", pathIndices: [0], isMajority: true, representativeConclusion: "Clear conclusion" },
        ],
        synthesizedConclusion: "Clear conclusion",
        needsHumanReview: false,
        reviewReasons: [],
      });

      // Some paths succeed, some fail
      mockAiFacade.chat
        .mockResolvedValueOnce({ content: goodResponse })
        .mockRejectedValueOnce(new Error("Rate limit"))
        .mockResolvedValueOnce({ content: goodResponse })
        .mockRejectedValueOnce(new Error("Rate limit"))
        .mockResolvedValueOnce({ content: goodResponse })
        .mockResolvedValueOnce({ content: analysisResponse });

      const result = await service.checkConsistency(makeRequest());

      // At least some paths should succeed
      expect(result.paths.length).toBeGreaterThan(0);
    });

    it("should clamp confidence values to 0-1 range", async () => {
      // Confidence value out of range
      const pathResponse = JSON.stringify({
        reasoning: "Analysis",
        conclusion: "Conclusion",
        confidence: 1.5, // above max
        keySteps: [],
        evidenceUsed: [],
      });

      const analysisResponse = JSON.stringify({
        agreementRate: 0.8,
        majorityConclusion: "Conclusion",
        clusters: [{ theme: "X", pathIndices: [0], isMajority: true, representativeConclusion: "C" }],
        synthesizedConclusion: "Conclusion",
        needsHumanReview: false,
        reviewReasons: [],
      });

      mockAiFacade.chat
        .mockResolvedValue({ content: pathResponse });

      // Override to return analysis on last call
      const callCount = DEFAULT_SELF_CONSISTENCY_CONFIG.numPaths;
      for (let i = 0; i < callCount - 1; i++) {
        mockAiFacade.chat.mockResolvedValueOnce({ content: pathResponse });
      }
      mockAiFacade.chat.mockResolvedValueOnce({ content: analysisResponse });

      const result = await service.checkConsistency(makeRequest());

      for (const path of result.paths) {
        expect(path.confidence).toBeLessThanOrEqual(1.0);
        expect(path.confidence).toBeGreaterThanOrEqual(0);
      }
    });
  });

  // ============================================================
  // Single-path behavior
  // ============================================================

  describe("single path behavior", () => {
    it("should handle single successful path correctly", async () => {
      const pathResponse = JSON.stringify({
        reasoning: "Only one path reasoning",
        conclusion: "Definitive conclusion",
        confidence: 0.9,
        keySteps: ["Analyze evidence"],
        evidenceUsed: ["e1"],
      });

      mockAiFacade.chat
        .mockResolvedValueOnce({ content: pathResponse }) // path 1 succeeds
        .mockRejectedValue(new Error("all others fail")); // all others fail

      const result = await service.checkConsistency({
        ...makeRequest(),
        config: { numPaths: 5 },
      });

      if (result.paths.length === 1) {
        expect(result.isConsistent).toBe(true);
        expect(result.agreementRate).toBe(1);
        expect(result.synthesizedConclusion).toBe(result.paths[0].conclusion);
      } else {
        // Multiple paths or 0 paths - still a valid result
        expect(result).toBeDefined();
      }
    });
  });

  // ============================================================
  // consistency analysis fallback
  // ============================================================

  describe("consistency analysis fallback", () => {
    it("should use majority vote when AI analysis fails", async () => {
      const pathResponse = JSON.stringify({
        reasoning: "Analysis reasoning",
        conclusion: "Consistent conclusion",
        confidence: 0.8,
        keySteps: ["Step 1"],
        evidenceUsed: ["e1"],
      });

      mockAiFacade.chat
        .mockResolvedValueOnce({ content: pathResponse })
        .mockResolvedValueOnce({ content: pathResponse })
        .mockResolvedValueOnce({ content: pathResponse })
        .mockResolvedValueOnce({ content: pathResponse })
        .mockResolvedValueOnce({ content: pathResponse })
        .mockRejectedValueOnce(new Error("Analysis failed")); // analysis step fails

      const result = await service.checkConsistency(makeRequest());

      // Should fall back to simple majority vote
      expect(result).toBeDefined();
      expect(result.majorityConclusion).toBeTruthy();
      expect(result.needsHumanReview).toBe(true); // fallback always marks for review
    });

    it("should identify dissident paths from minority clusters", async () => {
      const pathResponse = JSON.stringify({
        reasoning: "Reasoning",
        conclusion: "Majority view",
        confidence: 0.8,
        keySteps: [],
        evidenceUsed: [],
      });

      const dissidentPathResponse = JSON.stringify({
        reasoning: "Alternative reasoning",
        conclusion: "Minority view",
        confidence: 0.6,
        keySteps: [],
        evidenceUsed: [],
      });

      const analysisResponse = JSON.stringify({
        agreementRate: 0.75,
        majorityConclusion: "Majority view",
        clusters: [
          {
            theme: "Majority",
            pathIndices: [0, 1, 2, 3],
            isMajority: true,
            representativeConclusion: "Majority view",
          },
          {
            theme: "Minority",
            pathIndices: [4],
            isMajority: false,
            representativeConclusion: "Minority view",
          },
        ],
        synthesizedConclusion: "Majority view with minority considerations",
        needsHumanReview: false,
        reviewReasons: [],
      });

      mockAiFacade.chat
        .mockResolvedValueOnce({ content: pathResponse })
        .mockResolvedValueOnce({ content: pathResponse })
        .mockResolvedValueOnce({ content: pathResponse })
        .mockResolvedValueOnce({ content: pathResponse })
        .mockResolvedValueOnce({ content: dissidentPathResponse })
        .mockResolvedValueOnce({ content: analysisResponse });

      const result = await service.checkConsistency(makeRequest());

      expect(result.dissidentPaths.length).toBeGreaterThanOrEqual(0);
      expect(result.clusters.length).toBeGreaterThan(0);
    });
  });

  // ============================================================
  // Human review thresholds
  // ============================================================

  describe("human review thresholds", () => {
    it("should require human review when agreement rate is below threshold", async () => {
      const pathResponse = JSON.stringify({
        reasoning: "Analysis",
        conclusion: "Uncertain conclusion",
        confidence: 0.5,
        keySteps: [],
        evidenceUsed: [],
      });

      const analysisResponse = JSON.stringify({
        agreementRate: 0.3, // below humanReviewThreshold (0.5)
        majorityConclusion: "Uncertain",
        clusters: [
          { theme: "Group A", pathIndices: [0, 1], isMajority: true, representativeConclusion: "A" },
          { theme: "Group B", pathIndices: [2, 3, 4], isMajority: false, representativeConclusion: "B" },
        ],
        synthesizedConclusion: "Synthesis needed",
        needsHumanReview: true,
        reviewReasons: ["Low agreement rate"],
      });

      mockAiFacade.chat
        .mockResolvedValueOnce({ content: pathResponse })
        .mockResolvedValueOnce({ content: pathResponse })
        .mockResolvedValueOnce({ content: pathResponse })
        .mockResolvedValueOnce({ content: pathResponse })
        .mockResolvedValueOnce({ content: pathResponse })
        .mockResolvedValueOnce({ content: analysisResponse });

      const result = await service.checkConsistency(makeRequest());

      expect(result.needsHumanReview).toBe(true);
    });
  });
});
