import { Test, TestingModule } from "@nestjs/testing";
import { IntelligentModelRouterService } from "../intelligent-model-router.service";
import { ComplexityAnalyzerService } from "../complexity-analyzer.service";

describe("IntelligentModelRouterService", () => {
  let service: IntelligentModelRouterService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [ComplexityAnalyzerService, IntelligentModelRouterService],
    }).compile();

    service = module.get(IntelligentModelRouterService);
  });

  describe("route()", () => {
    it("trivial task → deterministic + minimal profile", () => {
      const result = service.route({ input: "yes?" });
      expect(result.complexity.level).toBe("minimal");
      expect(result.profile.creativity).toBe("deterministic");
      expect(result.profile.outputLength).toBe("minimal");
      expect(result.adjusted).toBe(false);
    });

    it("forceMinLevel raises level when natural level is below", () => {
      const result = service.route(
        { input: "Hi" }, // would be minimal
        { forceMinLevel: "medium" },
      );
      expect(result.adjusted).toBe(true);
      expect(result.adjustReason).toContain("raised");
      expect(result.profile.creativity).toBe("medium");
    });

    it("forceMaxLevel caps level when natural level exceeds", () => {
      // extreme task: inputScale(4) + tools(3) + agents(3) + domain(2) = 12 → extreme
      const result = service.route(
        {
          input: "a".repeat(200000),
          toolCount: 8,
          agentCount: 8,
          requiresExpertDomain: true,
        },
        { forceMaxLevel: "complex" },
      );
      expect(result.adjusted).toBe(true);
      expect(result.adjustReason).toContain("capped");
      expect(result.profile.creativity).toBe("medium"); // complex maps to medium
    });

    it("allowHighCreativity: false prevents high creativity", () => {
      // extreme task → naturally maps to high creativity
      const result = service.route(
        {
          input: "a".repeat(200000),
          toolCount: 8,
          agentCount: 8,
          requiresExpertDomain: true,
        },
        { allowHighCreativity: false },
      );
      expect(result.profile.creativity).not.toBe("high");
      expect(result.profile.creativity).toBe("medium");
    });

    it("no strategy adjustment → adjusted=false", () => {
      const result = service.route({ input: "analyze this document briefly" });
      expect(result.adjusted).toBe(false);
      expect(result.adjustReason).toBeUndefined();
    });
  });

  describe("getProfile()", () => {
    it("returns same profile as route()", () => {
      const task = { input: "Hello", toolCount: 2 };
      const profile = service.getProfile(task);
      const routeResult = service.route(task);
      expect(profile).toEqual(routeResult.profile);
    });
  });

  describe("recordQualityFeedback() + quality-driven upgrade", () => {
    it("no feedback → no upgrade (adjusted=false)", () => {
      const result = service.route({
        input: "short task",
        taskType: "research",
      });
      expect(result.adjusted).toBe(false);
    });

    it("3+ low-score samples trigger level upgrade", () => {
      // Feed 3 failing scores for research:minimal
      service.recordQualityFeedback("research", "minimal", 40);
      service.recordQualityFeedback("research", "minimal", 35);
      service.recordQualityFeedback("research", "minimal", 45);

      // A minimal research task should now upgrade to simple
      const result = service.route({
        input: "short task", // analyzer scores minimal
        taskType: "research",
      });
      expect(result.adjusted).toBe(true);
      expect(result.adjustReason).toContain("quality history");
    });

    it("high-score samples do NOT trigger upgrade", () => {
      service.recordQualityFeedback("ask", "minimal", 80);
      service.recordQualityFeedback("ask", "minimal", 85);
      service.recordQualityFeedback("ask", "minimal", 90);

      const result = service.route({ input: "Hi", taskType: "ask" });
      expect(result.adjusted).toBe(false);
    });

    it("fewer than MIN_SAMPLES samples skip upgrade", () => {
      service.recordQualityFeedback("writing", "minimal", 20);
      service.recordQualityFeedback("writing", "minimal", 25);
      // only 2 samples, below MIN_SAMPLES=3

      const result = service.route({ input: "Hi", taskType: "writing" });
      expect(result.adjusted).toBe(false);
    });
  });

  describe("getQualityStats()", () => {
    it("returns empty array with no feedback", () => {
      expect(service.getQualityStats()).toEqual([]);
    });

    it("returns stats sorted by avgScore ascending", () => {
      service.recordQualityFeedback("a", "minimal", 30);
      service.recordQualityFeedback("b", "simple", 80);

      const stats = service.getQualityStats();
      expect(stats[0].taskType).toBe("a");
      expect(stats[0].avgScore).toBe(30);
      expect(stats[1].taskType).toBe("b");
      expect(stats[1].avgScore).toBe(80);
    });

    it("upgraded flag set when low average", () => {
      service.recordQualityFeedback("x", "medium", 40);
      service.recordQualityFeedback("x", "medium", 45);
      service.recordQualityFeedback("x", "medium", 50);

      const stats = service.getQualityStats();
      const entry = stats.find((s) => s.taskType === "x");
      expect(entry?.upgraded).toBe(true);
    });
  });

  describe("cost savings validation", () => {
    it("short classification task uses cheap model profile", () => {
      const profile = service.getProfile({
        input: "Is this positive or negative?",
      });
      // Should use deterministic or low creativity → maps to mini-class models
      expect(["deterministic", "low"]).toContain(profile.creativity);
      expect(["minimal", "short"]).toContain(profile.outputLength);
    });

    it("deep research task uses powerful model profile", () => {
      const profile = service.getProfile({
        input: "a".repeat(50000),
        toolCount: 8,
        agentCount: 5,
        requiresExpertDomain: true,
        longOutput: true,
      });
      expect(["medium", "high"]).toContain(profile.creativity);
      expect(["long", "extended"]).toContain(profile.outputLength);
    });
  });
});
