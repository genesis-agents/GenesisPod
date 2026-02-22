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
