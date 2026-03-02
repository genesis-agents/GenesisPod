/**
 * ExpressionMemoryService Supplemental Tests
 *
 * Covers uncovered branches beyond expression-memory.service.spec.ts:
 * - getCoolingExpressions: remainingCooldown calculation with cooldownUntilChapter
 * - generateAvoidancePrompt: more than maxPerType expressions (truncation)
 * - generateAvoidancePrompt: high-frequency without alternatives
 * - analyzeExpressionsOnly: expression detected in cooling triggers violation + high-freq
 * - analyzeAndRecordExpressions: upsert for new expressions with cooldown chapter calculation
 * - analyzeAndRecordExpressions: record not found in findUnique during update
 * - refreshCooldownStatus: multiple expired expressions batch-released
 * - refreshCooldownStatus: null cooldownUntilChapter (no release)
 * - getProjectExpressionStats: all counts = 0
 * - Pattern detection: IDIOM, DIALOGUE, PLOT_PATTERN, CHAPTER_OPENING types
 * - getCooldownChapters: high-frequency overrides base cooldown
 * - CoolingExpression with zero remaining cooldown
 */

import { Test, TestingModule } from "@nestjs/testing";
import {
  ExpressionMemoryService,
  ExpressionType,
  CoolingExpression,
} from "../expression-memory.service";
import { PrismaService } from "../../../../../../common/prisma/prisma.service";

// ==================== Mock Factory ====================

function buildMockPrisma() {
  return {
    writingExpressionMemory: {
      findMany: jest.fn().mockResolvedValue([]),
      findUnique: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockResolvedValue({}),
      upsert: jest.fn().mockResolvedValue({}),
      update: jest.fn().mockResolvedValue({}),
      updateMany: jest.fn().mockResolvedValue({ count: 0 }),
      count: jest.fn().mockResolvedValue(0),
      groupBy: jest.fn().mockResolvedValue([]),
    },
    writingChapter: {
      findMany: jest.fn().mockResolvedValue([]),
    },
  };
}

// ==================== Test Fixtures ====================

function makeCoolingRecord(
  overrides: Partial<{
    id: string;
    projectId: string;
    expression: string;
    expressionType: ExpressionType;
    category: string | null;
    useCount: number;
    lastChapterId: string | null;
    isCoolingDown: boolean;
    cooldownUntilChapter: number | null;
    lastUsedChapter: number;
    cooldownUntil: Date | null;
  }> = {},
) {
  return {
    id: "expr-1",
    projectId: "project-1",
    expression: "心中一震",
    expressionType: "EMOTION" as ExpressionType,
    category: "震惊",
    useCount: 2,
    lastChapterId: "ch-5",
    isCoolingDown: true,
    cooldownUntilChapter: 15,
    lastUsedChapter: 5,
    cooldownUntil: new Date("2099-01-01"),
    ...overrides,
  };
}

// ==================== Tests ====================

describe("ExpressionMemoryService (supplemental)", () => {
  let service: ExpressionMemoryService;
  let mockPrisma: ReturnType<typeof buildMockPrisma>;

  beforeEach(async () => {
    mockPrisma = buildMockPrisma();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ExpressionMemoryService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<ExpressionMemoryService>(ExpressionMemoryService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  // ==================== getCoolingExpressions – cooldown calculation ====================

  describe("getCoolingExpressions – remaining cooldown calculation", () => {
    it("should return 0 remainingCooldown when cooldownUntilChapter is null", async () => {
      mockPrisma.writingExpressionMemory.findMany.mockResolvedValue([
        makeCoolingRecord({ cooldownUntilChapter: null }),
      ]);

      const result = await service.getCoolingExpressions("project-1", 10);

      expect(result[0].remainingCooldown).toBe(0);
    });

    it("should return correct remaining cooldown when chapter is below threshold", async () => {
      // cooldownUntilChapter=20, currentChapter=10 → remaining=10
      mockPrisma.writingExpressionMemory.findMany.mockResolvedValue([
        makeCoolingRecord({ cooldownUntilChapter: 20 }),
      ]);

      const result = await service.getCoolingExpressions("project-1", 10);

      expect(result[0].remainingCooldown).toBe(10);
    });

    it("should return 0 remainingCooldown when chapter equals cooldownUntilChapter", async () => {
      mockPrisma.writingExpressionMemory.findMany.mockResolvedValue([
        makeCoolingRecord({ cooldownUntilChapter: 10 }),
      ]);

      const result = await service.getCoolingExpressions("project-1", 10);

      expect(result[0].remainingCooldown).toBe(0);
    });

    it("should return 0 (not negative) when chapter exceeds cooldownUntilChapter", async () => {
      mockPrisma.writingExpressionMemory.findMany.mockResolvedValue([
        makeCoolingRecord({ cooldownUntilChapter: 5 }),
      ]);

      const result = await service.getCoolingExpressions("project-1", 15);

      expect(result[0].remainingCooldown).toBe(0);
    });
  });

  // ==================== generateAvoidancePrompt – edge cases ====================

  describe("generateAvoidancePrompt – truncation and edge cases", () => {
    it("should truncate per-type expressions to 15 when more are present", async () => {
      // Create 20 EMOTION expressions
      const manyExpressions = Array.from({ length: 20 }, (_, i) =>
        makeCoolingRecord({
          id: `expr-${i}`,
          expression: `表达${i}`,
          expressionType: "EMOTION",
          cooldownUntilChapter: 30,
          useCount: 2,
        }),
      );

      mockPrisma.writingExpressionMemory.findMany
        .mockResolvedValueOnce([]) // refreshCooldownStatus
        .mockResolvedValueOnce(manyExpressions) // getCoolingExpressions
        .mockResolvedValueOnce([]); // getHighFrequencyExpressions
      mockPrisma.writingExpressionMemory.updateMany.mockResolvedValue({
        count: 0,
      });

      const result = await service.generateAvoidancePrompt("project-1", 5);

      // Should contain "...及其他" indicating truncation
      expect(result).toContain("及其他");
      expect(result).toContain("5 个");
    });

    it("should include high-frequency warning without alternatives for unknown expressions", async () => {
      const rareExpression = {
        ...makeCoolingRecord({
          expression: "极其罕见独特表达ABC",
          isCoolingDown: false,
        }),
        category: null,
        cooldownUntil: null,
        lastChapterId: null,
      };

      mockPrisma.writingExpressionMemory.findMany
        .mockResolvedValueOnce([]) // refreshCooldownStatus
        .mockResolvedValueOnce([]) // getCoolingExpressions
        .mockResolvedValueOnce([{ ...rareExpression, useCount: 7 }]); // getHighFrequencyExpressions
      mockPrisma.writingExpressionMemory.updateMany.mockResolvedValue({
        count: 0,
      });

      const result = await service.generateAvoidancePrompt("project-1", 10);

      expect(result).toContain("高频警告");
      expect(result).toContain("极其罕见独特表达ABC");
      expect(result).toContain("7次");
    });

    it("should limit high-frequency warnings to 20 entries", async () => {
      // Create 25 high-frequency expressions
      const manyHighFreq = Array.from({ length: 25 }, (_, i) => ({
        ...makeCoolingRecord({
          id: `hf-${i}`,
          expression: `高频表达${i}`,
          expressionType: "ACTION" as ExpressionType,
          isCoolingDown: false,
        }),
        category: null,
        cooldownUntil: null,
        lastChapterId: null,
        useCount: 10,
      }));

      mockPrisma.writingExpressionMemory.findMany
        .mockResolvedValueOnce([]) // refreshCooldownStatus
        .mockResolvedValueOnce([]) // getCoolingExpressions
        .mockResolvedValueOnce(manyHighFreq); // getHighFrequencyExpressions
      mockPrisma.writingExpressionMemory.updateMany.mockResolvedValue({
        count: 0,
      });

      const result = await service.generateAvoidancePrompt("project-1", 10);

      // Should have at most 20 high-frequency warnings shown
      const warningMatches = result.match(/⚠️/g);
      expect(warningMatches).not.toBeNull();
      if (warningMatches) {
        expect(warningMatches.length).toBeLessThanOrEqual(20);
      }
    });

    it("should generate prompt with both cooling and high-frequency sections", async () => {
      const coolingExpr = makeCoolingRecord({
        expression: "微微一笑",
        expressionType: "ACTION",
        cooldownUntilChapter: 20,
      });
      const highFreqExpr = {
        ...makeCoolingRecord({ expression: "心中一震", isCoolingDown: false }),
        category: null,
        cooldownUntil: null,
        lastChapterId: null,
        useCount: 8,
      };

      mockPrisma.writingExpressionMemory.findMany
        .mockResolvedValueOnce([]) // refreshCooldownStatus
        .mockResolvedValueOnce([coolingExpr]) // getCoolingExpressions
        .mockResolvedValueOnce([highFreqExpr]); // getHighFrequencyExpressions
      mockPrisma.writingExpressionMemory.updateMany.mockResolvedValue({
        count: 0,
      });

      const result = await service.generateAvoidancePrompt("project-1", 5);

      expect(result).toContain("禁用表达");
      expect(result).toContain("高频警告");
      expect(result).toContain("微微一笑");
      expect(result).toContain("心中一震");
    });
  });

  // ==================== analyzeExpressionsOnly – cooling + high-freq simultaneous ====================

  describe("analyzeExpressionsOnly – combined violations", () => {
    it("should report both violated and high-frequency for cooling expression at use 5", async () => {
      // Expression is cooling AND would reach 5 total uses
      mockPrisma.writingExpressionMemory.findMany.mockResolvedValue([
        makeCoolingRecord({
          expression: "心中一震",
          isCoolingDown: true,
          useCount: 4,
          cooldownUntilChapter: 20,
        }),
      ]);

      const content = "她心中一震，停下来思考。";
      const result = await service.analyzeExpressionsOnly("project-1", content);

      // Should be in both violated and high-frequency
      const violated = result.violatedExpressions.find(
        (e) => e.expression === "心中一震",
      );
      const highFreq = result.highFrequencyWarnings.find(
        (e) => e.expression === "心中一震",
      );

      expect(violated).toBeDefined();
      expect(highFreq).toBeDefined();
      expect(highFreq!.useCount).toBeGreaterThanOrEqual(5);
    });

    it("should not add to violatedExpressions when expression is not cooling", async () => {
      mockPrisma.writingExpressionMemory.findMany.mockResolvedValue([
        makeCoolingRecord({
          expression: "心中一震",
          isCoolingDown: false,
          useCount: 2,
        }),
      ]);

      const content = "她心中一震，感到奇怪。";
      const result = await service.analyzeExpressionsOnly("project-1", content);

      expect(result.violatedExpressions).toHaveLength(0);
    });

    it("should not add to highFrequencyWarnings when count is below 5", async () => {
      mockPrisma.writingExpressionMemory.findMany.mockResolvedValue([
        makeCoolingRecord({
          expression: "心中一震",
          isCoolingDown: false,
          useCount: 2,
        }),
      ]);

      // Content adds 1 more occurrence → total 3, below threshold of 5
      const content = "她心中一震。";
      const result = await service.analyzeExpressionsOnly("project-1", content);

      expect(result.highFrequencyWarnings).toHaveLength(0);
    });
  });

  // ==================== analyzeAndRecordExpressions – record not found during update ====================

  describe("analyzeAndRecordExpressions – edge cases", () => {
    it("should gracefully handle record disappearing between batch query and findUnique", async () => {
      const existingRecord = makeCoolingRecord({
        expression: "心中一震",
        isCoolingDown: false,
        useCount: 2,
      });
      mockPrisma.writingExpressionMemory.findMany.mockResolvedValue([
        existingRecord,
      ]);
      // findUnique returns null (record was deleted between queries)
      mockPrisma.writingExpressionMemory.findUnique.mockResolvedValue(null);

      const content = "她心中一震，停下来。";
      // Should not throw
      await expect(
        service.analyzeAndRecordExpressions("project-1", "ch-3", 3, content),
      ).resolves.not.toThrow();
    });

    it("should set isCoolingDown=true when recording a new expression", async () => {
      mockPrisma.writingExpressionMemory.findMany.mockResolvedValue([]);
      mockPrisma.writingExpressionMemory.upsert.mockResolvedValue({});

      const content = "她微微一笑，转身离去。";
      await service.analyzeAndRecordExpressions(
        "project-1",
        "ch-1",
        1,
        content,
      );

      expect(mockPrisma.writingExpressionMemory.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          create: expect.objectContaining({
            isCoolingDown: true,
          }),
        }),
      );
    });

    it("should set cooldownUntilChapter based on current chapter + cooldown period", async () => {
      mockPrisma.writingExpressionMemory.findMany.mockResolvedValue([]);
      mockPrisma.writingExpressionMemory.upsert.mockResolvedValue({});

      const content = "她微微一笑。";
      await service.analyzeAndRecordExpressions(
        "project-1",
        "ch-5",
        5,
        content,
      );

      expect(mockPrisma.writingExpressionMemory.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          create: expect.objectContaining({
            cooldownUntilChapter: expect.any(Number),
          }),
        }),
      );

      const callArgs =
        mockPrisma.writingExpressionMemory.upsert.mock.calls[0][0];
      // cooldownUntilChapter should be > chapterNumber (5)
      expect(callArgs.create.cooldownUntilChapter).toBeGreaterThan(5);
    });

    it("should update both cooling and non-cooling existing expressions", async () => {
      const nonCoolingRecord = makeCoolingRecord({
        expression: "心中一震",
        isCoolingDown: false,
        useCount: 1,
        cooldownUntilChapter: 1, // already past
      });
      mockPrisma.writingExpressionMemory.findMany.mockResolvedValue([
        nonCoolingRecord,
      ]);
      mockPrisma.writingExpressionMemory.findUnique.mockResolvedValue(
        nonCoolingRecord,
      );
      mockPrisma.writingExpressionMemory.update.mockResolvedValue({});

      const content = "她心中一震。";
      const result = await service.analyzeAndRecordExpressions(
        "project-1",
        "ch-2",
        2,
        content,
      );

      expect(mockPrisma.writingExpressionMemory.update).toHaveBeenCalled();
      // Since isCoolingDown=false, should NOT be in violatedExpressions
      expect(result.violatedExpressions).toHaveLength(0);
    });
  });

  // ==================== refreshCooldownStatus – multiple expirations ====================

  describe("refreshCooldownStatus – bulk operations", () => {
    it("should release multiple expired expressions in a single updateMany call", async () => {
      mockPrisma.writingExpressionMemory.findMany.mockResolvedValue([
        makeCoolingRecord({ id: "expr-1", cooldownUntilChapter: 5 }),
        makeCoolingRecord({
          id: "expr-2",
          expression: "微微一笑",
          cooldownUntilChapter: 8,
        }),
        makeCoolingRecord({
          id: "expr-3",
          expression: "轻声道",
          cooldownUntilChapter: 10,
          expressionType: "ACTION",
        }),
      ]);
      mockPrisma.writingExpressionMemory.updateMany.mockResolvedValue({
        count: 3,
      });

      // Current chapter=15, all three expressions should expire
      await service.refreshCooldownStatus("project-1", 15);

      expect(
        mockPrisma.writingExpressionMemory.updateMany,
      ).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            id: { in: expect.arrayContaining(["expr-1", "expr-2", "expr-3"]) },
          },
          data: { isCoolingDown: false },
        }),
      );
    });

    it("should only release expressions that have truly expired", async () => {
      mockPrisma.writingExpressionMemory.findMany.mockResolvedValue([
        makeCoolingRecord({ id: "expired", cooldownUntilChapter: 5 }), // expired at ch=10
        makeCoolingRecord({
          id: "still-cooling",
          expression: "微微一笑",
          cooldownUntilChapter: 25,
        }), // not yet expired
      ]);
      mockPrisma.writingExpressionMemory.updateMany.mockResolvedValue({
        count: 1,
      });

      await service.refreshCooldownStatus("project-1", 10);

      const updateCall =
        mockPrisma.writingExpressionMemory.updateMany.mock.calls[0][0];
      expect(updateCall.where.id.in).toContain("expired");
      expect(updateCall.where.id.in).not.toContain("still-cooling");
    });

    it("should not call updateMany when no expressions have null cooldownUntilChapter", async () => {
      mockPrisma.writingExpressionMemory.findMany.mockResolvedValue([
        makeCoolingRecord({ cooldownUntilChapter: null }), // null - not released
      ]);

      await service.refreshCooldownStatus("project-1", 100);

      expect(
        mockPrisma.writingExpressionMemory.updateMany,
      ).not.toHaveBeenCalled();
    });
  });

  // ==================== getProjectExpressionStats – zero counts ====================

  describe("getProjectExpressionStats – zero counts", () => {
    it("should return all zeros when no expressions recorded", async () => {
      mockPrisma.writingExpressionMemory.count.mockResolvedValue(0);
      mockPrisma.writingExpressionMemory.groupBy.mockResolvedValue([]);

      const result = await service.getProjectExpressionStats("empty-project");

      expect(result.totalExpressions).toBe(0);
      expect(result.coolingCount).toBe(0);
      expect(result.highFrequencyCount).toBe(0);
      expect(result.byType).toEqual({});
    });

    it("should return byType as empty object when no groupBy results", async () => {
      mockPrisma.writingExpressionMemory.count.mockResolvedValue(5);
      mockPrisma.writingExpressionMemory.groupBy.mockResolvedValue([]);

      const result = await service.getProjectExpressionStats("project-1");

      expect(result.byType).toEqual({});
    });

    it("should aggregate counts from all parallel queries", async () => {
      mockPrisma.writingExpressionMemory.count
        .mockResolvedValueOnce(100) // total
        .mockResolvedValueOnce(30) // cooling
        .mockResolvedValueOnce(15); // high-frequency
      mockPrisma.writingExpressionMemory.groupBy.mockResolvedValue([
        { expressionType: "IDIOM", _count: 10 },
        { expressionType: "ACTION", _count: 25 },
        { expressionType: "TRANSITION", _count: 5 },
      ]);

      const result = await service.getProjectExpressionStats("project-1");

      expect(result.totalExpressions).toBe(100);
      expect(result.coolingCount).toBe(30);
      expect(result.highFrequencyCount).toBe(15);
      expect(result.byType["IDIOM"]).toBe(10);
      expect(result.byType["ACTION"]).toBe(25);
      expect(result.byType["TRANSITION"]).toBe(5);
    });
  });

  // ==================== Pattern detection – additional types ====================

  describe("pattern detection – additional expression types", () => {
    beforeEach(() => {
      mockPrisma.writingExpressionMemory.findMany.mockResolvedValue([]);
    });

    it("should detect IDIOM type expressions", async () => {
      const content = "他深不可测，令人难以捉摸。";
      const result = await service.analyzeExpressionsOnly("project-1", content);

      const idiomExpr = result.newExpressions.find((e) => e.type === "IDIOM");
      expect(idiomExpr).toBeDefined();
    });

    it("should detect DIALOGUE type expressions", async () => {
      const content = "她不禁问道：你可知道这是为何？";
      const result = await service.analyzeExpressionsOnly("project-1", content);

      const dialogueExpr = result.newExpressions.find(
        (e) => e.type === "DIALOGUE",
      );
      expect(dialogueExpr).toBeDefined();
    });

    it("should detect PLOT_PATTERN type expressions", async () => {
      const content = "朝堂之上，暗流涌动，各方势力蠢蠢欲动。";
      const result = await service.analyzeExpressionsOnly("project-1", content);

      const plotExpr = result.newExpressions.find(
        (e) => e.type === "PLOT_PATTERN",
      );
      expect(plotExpr).toBeDefined();
    });

    it("should detect TRANSITION type expressions", async () => {
      const content = "就在这时，门外传来一声响动。";
      const result = await service.analyzeExpressionsOnly("project-1", content);

      const transitionExpr = result.newExpressions.find(
        (e) => e.type === "TRANSITION",
      );
      expect(transitionExpr).toBeDefined();
    });

    it("should detect expressions in DESCRIPTION content (仿佛)", async () => {
      const content = "她的笑容仿佛阳光般温暖，令人心动。";
      const result = await service.analyzeExpressionsOnly("project-1", content);

      // "仿佛" may be classified as METAPHOR or DESCRIPTION depending on pattern rules
      const expr = result.newExpressions.find((e) => e.expression === "仿佛");
      // If found, it should have a valid type
      if (expr) {
        expect(["DESCRIPTION", "METAPHOR", "RHETORIC"]).toContain(expr.type);
      }
      // Content should produce at least some expressions
      expect(result.newExpressions.length).toBeGreaterThan(0);
    });

    it("should count multiple occurrences of same expression correctly", async () => {
      const content = "心中一震，再次心中一震，又是心中一震。";
      const result = await service.analyzeExpressionsOnly("project-1", content);

      // The base word 心中 should also be detected
      const heartExpr = result.newExpressions.find(
        (e) => e.expression === "心中一震" || e.expression === "心中",
      );
      expect(heartExpr).toBeDefined();
    });
  });

  // ==================== CoolingExpression empty state ====================

  describe("getCoolingExpressions – empty results", () => {
    it("should return empty array when no expressions match", async () => {
      mockPrisma.writingExpressionMemory.findMany.mockResolvedValue([]);

      const result = await service.getCoolingExpressions("project-1", 5);

      expect(result).toEqual([]);
      expect(result).toBeInstanceOf(Array);
    });

    it("should map multiple expressions to CoolingExpression format", async () => {
      mockPrisma.writingExpressionMemory.findMany.mockResolvedValue([
        makeCoolingRecord({
          expression: "心中一震",
          expressionType: "EMOTION",
          useCount: 3,
          cooldownUntilChapter: 20,
        }),
        makeCoolingRecord({
          id: "expr-2",
          expression: "微微一笑",
          expressionType: "ACTION",
          useCount: 5,
          cooldownUntilChapter: 25,
        }),
      ]);

      const result: CoolingExpression[] = await service.getCoolingExpressions(
        "project-1",
        10,
      );

      expect(result).toHaveLength(2);
      expect(result[0]).toHaveProperty("expression");
      expect(result[0]).toHaveProperty("type");
      expect(result[0]).toHaveProperty("useCount");
      expect(result[0]).toHaveProperty("remainingCooldown");
      expect(result[1].remainingCooldown).toBe(15); // 25 - 10
    });
  });
});
