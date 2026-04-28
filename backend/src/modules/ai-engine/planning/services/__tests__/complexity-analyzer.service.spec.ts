import { Test, TestingModule } from "@nestjs/testing";
import {
  ComplexityAnalyzerService,
  ComplexityLevel,
  TaskDescriptor,
} from "../complexity-analyzer.service";

describe("ComplexityAnalyzerService", () => {
  let service: ComplexityAnalyzerService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [ComplexityAnalyzerService],
    }).compile();

    service = module.get(ComplexityAnalyzerService);
  });

  describe("analyze()", () => {
    it("short text with no tools → minimal", () => {
      const result = service.analyze({ input: "Yes or No?" });
      expect(result.level).toBe<ComplexityLevel>("minimal");
      expect(result.score).toBeLessThanOrEqual(2);
      expect(result.recommendedProfile.creativity).toBe("deterministic");
      expect(result.recommendedProfile.outputLength).toBe("minimal");
    });

    it("medium text with 1 tool → simple", () => {
      // charBased = 10000/4 = 2500 tokens → scoreInput=2; toolCount=1 → 1; total=3 → simple
      const result = service.analyze({
        input: "a".repeat(10000),
        toolCount: 1,
      });
      expect(result.level).toBe<ComplexityLevel>("simple");
    });

    it("long text with 4 tools and 2 agents → medium or complex", () => {
      const result = service.analyze({
        input: "a".repeat(40000), // ~8000 tokens
        toolCount: 4,
        agentCount: 2,
      });
      expect(["medium", "complex"]).toContain(result.level);
    });

    it("expert domain + structured output + cross-module → complex or extreme", () => {
      const result = service.analyze({
        input: "a".repeat(100000), // >25k tokens
        toolCount: 6,
        agentCount: 5,
        requiresExpertDomain: true,
        structuredOutput: true,
        longOutput: true,
        crossModule: true,
      });
      expect(["complex", "extreme"]).toContain(result.level);
    });

    it("signals sum matches score", () => {
      const input: TaskDescriptor = {
        input: "short",
        toolCount: 2,
        agentCount: 3,
        requiresExpertDomain: true,
      };
      const result = service.analyze(input);
      const signalSum = Object.values(result.signals).reduce(
        (a, b) => a + b,
        0,
      );
      expect(result.score).toBe(signalSum);
    });

    it("score is within 0-15 for any input", () => {
      const extremeTask: TaskDescriptor = {
        input: "x".repeat(500000),
        toolCount: 100,
        agentCount: 100,
        requiresExpertDomain: true,
        structuredOutput: true,
        longOutput: true,
        crossModule: true,
      };
      const result = service.analyze(extremeTask);
      expect(result.score).toBeGreaterThanOrEqual(0);
      expect(result.score).toBeLessThanOrEqual(15);
    });
  });

  describe("getRecommendedProfile()", () => {
    it("returns profile matching analyze()", () => {
      const task: TaskDescriptor = { input: "Hello", toolCount: 0 };
      const profile = service.getRecommendedProfile(task);
      const full = service.analyze(task);
      expect(profile).toEqual(full.recommendedProfile);
    });
  });

  describe("level mapping", () => {
    const cases: Array<[string, TaskDescriptor, ComplexityLevel]> = [
      ["empty input no tools", { input: "" }, "minimal"],
      // Long input alone (score=4) falls into "simple" — complexity needs multi-signal
      ["very long input only", { input: "a".repeat(200000) }, "simple"],
      // Long input + many tools + many agents + expert domain → extreme (score=12)
      // inputScale(4) + toolComplexity(3) + agentComplexity(3) + domainDepth(2) = 12
      [
        "long input + high tool + high agent + expert domain",
        {
          input: "a".repeat(200000),
          toolCount: 8,
          agentCount: 7,
          requiresExpertDomain: true,
        },
        "extreme",
      ],
    ];

    test.each(cases)("%s", (_name, task, expectedLevel) => {
      const result = service.analyze(task);
      expect(result.level).toBe(expectedLevel);
    });
  });
});
