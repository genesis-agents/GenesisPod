/**
 * PredictionCalibrationService unit tests
 *
 * Coverage targets (95%+ lines/statements/functions/branches):
 *   - recordPredictions: empty baseCase, existing records (idempotent), new records,
 *     all horizon variants, unknown horizon (fallback), topic slice >500 chars
 *   - getDuePredictions: delegates to prisma
 *   - judgeOutcome: search success (various outcome branches), search error,
 *     LLM parse variants (true/false/unknown/null), LLM error, low confidence needsReview
 *   - resolvePrediction: outcome=true, outcome=false, outcome=null (no Brier)
 *   - getTopicCalibration: no records, with records
 *
 * Internal helpers exercised via public API:
 *   - clamp01: finite in-range, >1, <0, non-finite (NaN/Infinity)
 *   - parseJudgment: valid JSON true/false/unknown, non-JSON, JSON without outcome
 */

import { Test, TestingModule } from "@nestjs/testing";
import { AIModelType } from "@prisma/client";
import {
  PredictionCalibrationService,
  ForesightBaseCaseInput,
} from "../prediction-calibration.service";
import { PrismaService } from "@/common/prisma/prisma.service";
import { AiChatService, SearchService } from "@/modules/ai-engine/facade";

// ---------------------------------------------------------------------------
// Mock factories
// ---------------------------------------------------------------------------

function makePrisma() {
  return {
    agentPlaygroundPredictionRecord: {
      count: jest.fn(),
      createMany: jest.fn(),
      findMany: jest.fn(),
      update: jest.fn(),
    },
  };
}

function makeChat() {
  return {
    chat: jest.fn(),
  };
}

function makeSearch() {
  return {
    search: jest.fn(),
  };
}

// ---------------------------------------------------------------------------
// Shared base-case fixture
// ---------------------------------------------------------------------------

const BASE_CASE: ForesightBaseCaseInput = {
  judgment: "AI will surpass human-level reasoning",
  probability: 0.6,
  confidence: "moderate",
  horizon: "6-18m",
  resolutionCriteria: "Published benchmark exceeds GPT-4",
};

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

describe("PredictionCalibrationService", () => {
  let service: PredictionCalibrationService;
  let prisma: ReturnType<typeof makePrisma>;
  let chat: ReturnType<typeof makeChat>;
  let search: ReturnType<typeof makeSearch>;

  beforeEach(async () => {
    prisma = makePrisma();
    chat = makeChat();
    search = makeSearch();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PredictionCalibrationService,
        { provide: PrismaService, useValue: prisma },
        { provide: AiChatService, useValue: chat },
        { provide: SearchService, useValue: search },
      ],
    }).compile();

    service = module.get<PredictionCalibrationService>(
      PredictionCalibrationService,
    );
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  // =========================================================================
  // recordPredictions
  // =========================================================================

  describe("recordPredictions()", () => {
    it("returns 0 immediately when baseCase is empty", async () => {
      const result = await service.recordPredictions({
        missionId: "m1",
        userId: "u1",
        topic: "AI",
        baseCase: [],
      });
      expect(result).toBe(0);
      expect(
        prisma.agentPlaygroundPredictionRecord.count,
      ).not.toHaveBeenCalled();
    });

    it("returns 0 (idempotent) when records already exist for the mission", async () => {
      prisma.agentPlaygroundPredictionRecord.count.mockResolvedValue(2);

      const result = await service.recordPredictions({
        missionId: "m1",
        userId: "u1",
        topic: "AI",
        baseCase: [BASE_CASE],
      });

      expect(result).toBe(0);
      expect(
        prisma.agentPlaygroundPredictionRecord.createMany,
      ).not.toHaveBeenCalled();
    });

    it("creates rows and returns count when no existing records", async () => {
      prisma.agentPlaygroundPredictionRecord.count.mockResolvedValue(0);
      prisma.agentPlaygroundPredictionRecord.createMany.mockResolvedValue({
        count: 1,
      });

      const result = await service.recordPredictions({
        missionId: "m1",
        userId: "u1",
        topic: "AI",
        baseCase: [BASE_CASE],
      });

      expect(result).toBe(1);
      expect(
        prisma.agentPlaygroundPredictionRecord.createMany,
      ).toHaveBeenCalledWith({
        data: expect.arrayContaining([
          expect.objectContaining({
            missionId: "m1",
            userId: "u1",
            topic: "AI",
            predictionText: BASE_CASE.judgment,
            probability: BASE_CASE.probability,
            confidence: BASE_CASE.confidence,
            horizon: BASE_CASE.horizon,
            resolutionCriteria: BASE_CASE.resolutionCriteria,
            targetDate: expect.any(Date),
          }),
        ]),
      });
    });

    it("creates multiple rows when baseCase has multiple entries", async () => {
      prisma.agentPlaygroundPredictionRecord.count.mockResolvedValue(0);
      prisma.agentPlaygroundPredictionRecord.createMany.mockResolvedValue({
        count: 2,
      });

      const result = await service.recordPredictions({
        missionId: "m1",
        userId: "u1",
        topic: "AI",
        baseCase: [
          BASE_CASE,
          {
            ...BASE_CASE,
            judgment: "Second prediction",
            horizon: "0-6m",
          },
        ],
      });

      expect(result).toBe(2);
      const { data } =
        prisma.agentPlaygroundPredictionRecord.createMany.mock.calls[0][0];
      expect(data).toHaveLength(2);
    });

    it("slices topic string to 500 chars", async () => {
      prisma.agentPlaygroundPredictionRecord.count.mockResolvedValue(0);
      prisma.agentPlaygroundPredictionRecord.createMany.mockResolvedValue({
        count: 1,
      });

      const longTopic = "x".repeat(600);
      await service.recordPredictions({
        missionId: "m1",
        userId: "u1",
        topic: longTopic,
        baseCase: [BASE_CASE],
      });

      const { data } =
        prisma.agentPlaygroundPredictionRecord.createMany.mock.calls[0][0];
      expect(data[0].topic).toHaveLength(500);
    });

    it("clamps probability > 1 to 1", async () => {
      prisma.agentPlaygroundPredictionRecord.count.mockResolvedValue(0);
      prisma.agentPlaygroundPredictionRecord.createMany.mockResolvedValue({
        count: 1,
      });

      await service.recordPredictions({
        missionId: "m1",
        userId: "u1",
        topic: "AI",
        baseCase: [{ ...BASE_CASE, probability: 1.5 }],
      });

      const { data } =
        prisma.agentPlaygroundPredictionRecord.createMany.mock.calls[0][0];
      expect(data[0].probability).toBe(1);
    });

    it("clamps probability < 0 to 0", async () => {
      prisma.agentPlaygroundPredictionRecord.count.mockResolvedValue(0);
      prisma.agentPlaygroundPredictionRecord.createMany.mockResolvedValue({
        count: 1,
      });

      await service.recordPredictions({
        missionId: "m1",
        userId: "u1",
        topic: "AI",
        baseCase: [{ ...BASE_CASE, probability: -0.5 }],
      });

      const { data } =
        prisma.agentPlaygroundPredictionRecord.createMany.mock.calls[0][0];
      expect(data[0].probability).toBe(0);
    });

    it("clamps NaN probability to 0", async () => {
      prisma.agentPlaygroundPredictionRecord.count.mockResolvedValue(0);
      prisma.agentPlaygroundPredictionRecord.createMany.mockResolvedValue({
        count: 1,
      });

      await service.recordPredictions({
        missionId: "m1",
        userId: "u1",
        topic: "AI",
        baseCase: [{ ...BASE_CASE, probability: NaN }],
      });

      const { data } =
        prisma.agentPlaygroundPredictionRecord.createMany.mock.calls[0][0];
      expect(data[0].probability).toBe(0);
    });

    describe("horizon offset mapping", () => {
      const horizons: Array<ForesightBaseCaseInput["horizon"]> = [
        "0-6m",
        "6-18m",
        "18m-3y",
        "3y+",
      ];

      for (const horizon of horizons) {
        it(`sets targetDate in the future for horizon=${horizon}`, async () => {
          prisma.agentPlaygroundPredictionRecord.count.mockResolvedValue(0);
          prisma.agentPlaygroundPredictionRecord.createMany.mockResolvedValue({
            count: 1,
          });

          const before = Date.now();
          await service.recordPredictions({
            missionId: "m1",
            userId: "u1",
            topic: "AI",
            baseCase: [{ ...BASE_CASE, horizon }],
          });

          const { data } =
            prisma.agentPlaygroundPredictionRecord.createMany.mock.calls[0][0];
          expect(data[0].targetDate.getTime()).toBeGreaterThan(before);
        });
      }

      it("falls back to 6-18m offset for unknown horizon", async () => {
        prisma.agentPlaygroundPredictionRecord.count.mockResolvedValue(0);
        prisma.agentPlaygroundPredictionRecord.createMany.mockResolvedValue({
          count: 1,
        });

        const sixteenMonthsMs = 12 * 30 * 24 * 60 * 60 * 1000;
        const before = Date.now();

        await service.recordPredictions({
          missionId: "m1",
          userId: "u1",
          topic: "AI",
          baseCase: [{ ...BASE_CASE, horizon: "unknown-horizon" as "6-18m" }],
        });

        const { data } =
          prisma.agentPlaygroundPredictionRecord.createMany.mock.calls[0][0];
        const targetTime = data[0].targetDate.getTime();
        // Should be approximately 12 months out (±1 second tolerance)
        expect(targetTime).toBeGreaterThan(before + sixteenMonthsMs - 1000);
        expect(targetTime).toBeLessThan(before + sixteenMonthsMs + 5000);
      });
    });
  });

  // =========================================================================
  // getDuePredictions
  // =========================================================================

  describe("getDuePredictions()", () => {
    it("delegates to prisma with correct query and returns results", async () => {
      const mockRows = [
        {
          id: "pred-1",
          predictionText: "AI surpasses human",
          resolutionCriteria: "Benchmark",
          topic: "AI",
          probability: 0.7,
        },
      ];
      prisma.agentPlaygroundPredictionRecord.findMany.mockResolvedValue(
        mockRows,
      );

      const result = await service.getDuePredictions(10);

      expect(result).toEqual(mockRows);
      expect(
        prisma.agentPlaygroundPredictionRecord.findMany,
      ).toHaveBeenCalledWith({
        where: { actualOutcome: null, targetDate: { lte: expect.any(Date) } },
        orderBy: { targetDate: "asc" },
        take: 10,
        select: {
          id: true,
          predictionText: true,
          resolutionCriteria: true,
          topic: true,
          probability: true,
        },
      });
    });

    it("returns empty array when no due predictions exist", async () => {
      prisma.agentPlaygroundPredictionRecord.findMany.mockResolvedValue([]);

      const result = await service.getDuePredictions(50);
      expect(result).toEqual([]);
    });
  });

  // =========================================================================
  // judgeOutcome
  // =========================================================================

  describe("judgeOutcome()", () => {
    const prediction = {
      predictionText: "AI will reach AGI by 2026",
      resolutionCriteria: "Major AI lab announces AGI",
      topic: "Artificial Intelligence",
    };

    describe("search success branch", () => {
      it("returns outcome=true when LLM says true with high confidence", async () => {
        search.search.mockResolvedValue({
          success: true,
          results: [
            {
              url: "https://example.com/news",
              title: "AGI Announcement",
              content: "OpenAI declares AGI achieved",
            },
          ],
        });
        chat.chat.mockResolvedValue({
          content:
            '{"outcome":"true","evidenceUrl":"https://example.com/news","confidence":0.9}',
        });

        const result = await service.judgeOutcome(prediction);

        expect(result.outcome).toBe(true);
        expect(result.evidenceUrl).toBe("https://example.com/news");
        expect(result.confidence).toBe(0.9);
        expect(result.needsReview).toBe(false);
      });

      it("returns outcome=false when LLM says false with high confidence", async () => {
        search.search.mockResolvedValue({
          success: true,
          results: [
            {
              url: "https://example.com/debunk",
              title: "No AGI",
              content: "No evidence of AGI",
            },
          ],
        });
        chat.chat.mockResolvedValue({
          content:
            '{"outcome":"false","evidenceUrl":"https://example.com/debunk","confidence":0.85}',
        });

        const result = await service.judgeOutcome(prediction);

        expect(result.outcome).toBe(false);
        expect(result.needsReview).toBe(false);
      });

      it("marks needsReview=true when confidence < 0.6", async () => {
        search.search.mockResolvedValue({
          success: true,
          results: [
            {
              url: "https://example.com/ambiguous",
              title: "Ambiguous",
              content: "Mixed signals",
            },
          ],
        });
        chat.chat.mockResolvedValue({
          content:
            '{"outcome":"true","evidenceUrl":"https://example.com/ambiguous","confidence":0.4}',
        });

        const result = await service.judgeOutcome(prediction);

        expect(result.outcome).toBe(true);
        expect(result.confidence).toBe(0.4);
        expect(result.needsReview).toBe(true);
      });

      it("uses topUrl fallback when LLM evidenceUrl is empty string", async () => {
        search.search.mockResolvedValue({
          success: true,
          results: [
            {
              url: "https://top.example.com",
              title: "Top result",
              content: "Content",
            },
          ],
        });
        chat.chat.mockResolvedValue({
          content: '{"outcome":"true","evidenceUrl":"","confidence":0.8}',
        });

        const result = await service.judgeOutcome(prediction);

        expect(result.evidenceUrl).toBe("https://top.example.com");
      });

      it("handles multiple search results — slices and formats evidenceBlock", async () => {
        search.search.mockResolvedValue({
          success: true,
          results: Array.from({ length: 7 }, (_, i) => ({
            url: `https://example.com/${i}`,
            title: `Result ${i}`,
            content: `Content ${i}`,
          })),
        });
        chat.chat.mockResolvedValue({
          content: '{"outcome":"true","evidenceUrl":"","confidence":0.95}',
        });

        const result = await service.judgeOutcome(prediction);
        expect(result.outcome).toBe(true);
        // Verify chat was called with prompt containing evidence from only 5 results
        const callArg = chat.chat.mock.calls[0][0];
        const prompt = callArg.messages[0].content as string;
        expect(prompt).toContain("[5]");
        expect(prompt).not.toContain("[6]");
      });

      it("handles result with null content gracefully", async () => {
        search.search.mockResolvedValue({
          success: true,
          results: [{ url: "https://example.com", title: "T", content: null }],
        });
        chat.chat.mockResolvedValue({
          content: '{"outcome":"false","evidenceUrl":"","confidence":0.7}',
        });

        const result = await service.judgeOutcome(prediction);
        expect(result.outcome).toBe(false);
      });
    });

    describe("search failure branch", () => {
      it("proceeds with no-evidence block when search throws an Error instance", async () => {
        search.search.mockRejectedValue(new Error("Search API down"));
        chat.chat.mockResolvedValue({
          content: '{"outcome":"true","evidenceUrl":"","confidence":0.75}',
        });

        const result = await service.judgeOutcome(prediction);

        expect(result.outcome).toBe(true);
        expect(result.evidenceUrl).toBeNull();
        const callArg = chat.chat.mock.calls[0][0];
        expect(callArg.messages[0].content).toContain("（无搜索结果）");
      });

      it("proceeds with no-evidence block when search throws a non-Error (string)", async () => {
        // Covers line 151: err instanceof Error ? ... : String(err) — the false branch
        search.search.mockRejectedValue("plain string error from search");
        chat.chat.mockResolvedValue({
          content: '{"outcome":"false","evidenceUrl":"","confidence":0.7}',
        });

        const result = await service.judgeOutcome(prediction);

        expect(result.outcome).toBe(false);
        const callArg = chat.chat.mock.calls[0][0];
        expect(callArg.messages[0].content).toContain("（无搜索结果）");
      });

      it("proceeds when search returns success=false", async () => {
        search.search.mockResolvedValue({ success: false, results: [] });
        chat.chat.mockResolvedValue({
          content: '{"outcome":"unknown","confidence":0.3}',
        });

        const result = await service.judgeOutcome(prediction);

        expect(result.outcome).toBeNull();
        expect(result.needsReview).toBe(true);
      });

      it("proceeds when search returns empty results array", async () => {
        search.search.mockResolvedValue({ success: true, results: [] });
        chat.chat.mockResolvedValue({
          content: '{"outcome":"unknown","confidence":0}',
        });

        const result = await service.judgeOutcome(prediction);

        expect(result.outcome).toBeNull();
        expect(result.needsReview).toBe(true);
      });
    });

    describe("LLM outcome=unknown branch", () => {
      it("returns outcome=null with needsReview=true when LLM says unknown", async () => {
        search.search.mockResolvedValue({ success: true, results: [] });
        chat.chat.mockResolvedValue({
          content:
            '{"outcome":"unknown","evidenceUrl":"https://example.com","confidence":0.2}',
        });

        const result = await service.judgeOutcome(prediction);

        expect(result.outcome).toBeNull();
        expect(result.needsReview).toBe(true);
        expect(result.evidenceUrl).toBe("https://example.com");
        expect(result.confidence).toBe(0.2);
      });

      it("uses topUrl when parsed evidenceUrl is missing for unknown outcome", async () => {
        search.search.mockResolvedValue({
          success: true,
          results: [{ url: "https://top.com", title: "T", content: "C" }],
        });
        chat.chat.mockResolvedValue({
          content: '{"outcome":"unknown","confidence":0.1}',
        });

        const result = await service.judgeOutcome(prediction);
        expect(result.evidenceUrl).toBe("https://top.com");
      });
    });

    describe("LLM parse=null branch (no JSON in response)", () => {
      it("returns outcome=null with needsReview=true when LLM returns non-JSON", async () => {
        search.search.mockResolvedValue({ success: true, results: [] });
        chat.chat.mockResolvedValue({
          content: "I cannot determine the outcome",
        });

        const result = await service.judgeOutcome(prediction);

        expect(result.outcome).toBeNull();
        expect(result.needsReview).toBe(true);
        expect(result.confidence).toBe(0);
      });

      it("returns outcome=null when LLM JSON has invalid outcome value", async () => {
        search.search.mockResolvedValue({ success: true, results: [] });
        chat.chat.mockResolvedValue({
          content: '{"outcome":"maybe","confidence":0.5}',
        });

        const result = await service.judgeOutcome(prediction);

        // "maybe" is not "true"/"false" so parseJudgment returns "unknown"
        expect(result.outcome).toBeNull();
        expect(result.needsReview).toBe(true);
      });

      it("returns outcome=null when LLM response contains malformed JSON (parse error → catch branch)", async () => {
        search.search.mockResolvedValue({ success: true, results: [] });
        // Contains braces but JSON.parse will fail on the inner content
        chat.chat.mockResolvedValue({
          content: '{ this is: not valid "json" }',
        });

        const result = await service.judgeOutcome(prediction);

        // parseJudgment catch branch returns null → treated as null/unknown
        expect(result.outcome).toBeNull();
        expect(result.needsReview).toBe(true);
        expect(result.confidence).toBe(0);
      });

      it("returns outcome=null when LLM response evidenceUrl is non-string type", async () => {
        search.search.mockResolvedValue({ success: true, results: [] });
        // evidenceUrl is a number — parsed but treated as undefined
        chat.chat.mockResolvedValue({
          content: '{"outcome":"true","evidenceUrl":42,"confidence":0.8}',
        });

        const result = await service.judgeOutcome(prediction);

        // LLM returned non-string evidenceUrl → topUrl used as fallback (null here)
        expect(result.outcome).toBe(true);
        expect(result.evidenceUrl).toBeNull();
      });
    });

    describe("LLM error branch", () => {
      it("returns outcome=null with needsReview=true when chat.chat throws an Error instance", async () => {
        search.search.mockResolvedValue({ success: true, results: [] });
        chat.chat.mockRejectedValue(new Error("LLM API timeout"));

        const result = await service.judgeOutcome(prediction);

        expect(result.outcome).toBeNull();
        expect(result.needsReview).toBe(true);
        expect(result.confidence).toBe(0);
      });

      it("returns outcome=null when chat.chat throws a non-Error value (string)", async () => {
        // Covers line 194: err instanceof Error ? ... : String(err) — the false branch
        search.search.mockResolvedValue({ success: true, results: [] });
        chat.chat.mockRejectedValue("string rejection from LLM");

        const result = await service.judgeOutcome(prediction);

        expect(result.outcome).toBeNull();
        expect(result.needsReview).toBe(true);
        expect(result.confidence).toBe(0);
      });

      it("preserves topUrl in error case when search succeeded", async () => {
        search.search.mockResolvedValue({
          success: true,
          results: [{ url: "https://top.com", title: "T", content: "C" }],
        });
        chat.chat.mockRejectedValue(new Error("boom"));

        const result = await service.judgeOutcome(prediction);

        expect(result.evidenceUrl).toBe("https://top.com");
      });

      it("has null evidenceUrl in error case when search also failed", async () => {
        search.search.mockRejectedValue(new Error("search down"));
        chat.chat.mockRejectedValue(new Error("llm down"));

        const result = await service.judgeOutcome(prediction);

        expect(result.evidenceUrl).toBeNull();
        expect(result.outcome).toBeNull();
      });
    });

    it("passes correct AIModelType and taskProfile to chat", async () => {
      search.search.mockResolvedValue({ success: true, results: [] });
      chat.chat.mockResolvedValue({
        content: '{"outcome":"true","confidence":0.9}',
      });

      await service.judgeOutcome(prediction);

      expect(chat.chat).toHaveBeenCalledWith({
        messages: [{ role: "system", content: expect.any(String) }],
        modelType: AIModelType.CHAT,
        taskProfile: { creativity: "deterministic", outputLength: "short" },
      });
    });

    it("query is sliced to 380 chars", async () => {
      const longPrediction = {
        predictionText: "a".repeat(200),
        resolutionCriteria: "b".repeat(200),
        topic: "c".repeat(200),
      };
      search.search.mockResolvedValue({ success: true, results: [] });
      chat.chat.mockResolvedValue({
        content: '{"outcome":"unknown","confidence":0}',
      });

      await service.judgeOutcome(longPrediction);

      expect(search.search).toHaveBeenCalledWith(
        expect.stringMatching(/^.{1,380}$/),
        5,
      );
    });

    it("clamps LLM confidence > 1 to 1", async () => {
      search.search.mockResolvedValue({ success: true, results: [] });
      chat.chat.mockResolvedValue({
        content: '{"outcome":"false","confidence":1.5}',
      });

      const result = await service.judgeOutcome(prediction);
      expect(result.confidence).toBe(1);
    });

    it("clamps LLM confidence NaN to 0", async () => {
      search.search.mockResolvedValue({ success: true, results: [] });
      // confidence is undefined here — triggers clamp01(undefined ?? 0) path
      chat.chat.mockResolvedValue({
        content: '{"outcome":"true"}',
      });

      const result = await service.judgeOutcome(prediction);
      expect(result.confidence).toBe(0);
    });
  });

  // =========================================================================
  // resolvePrediction
  // =========================================================================

  describe("resolvePrediction()", () => {
    it("computes Brier score correctly when outcome=true", async () => {
      prisma.agentPlaygroundPredictionRecord.update.mockResolvedValue({});

      await service.resolvePrediction(
        "pred-1",
        {
          outcome: true,
          evidenceUrl: "https://ex.com",
          confidence: 0.9,
          needsReview: false,
        },
        0.8,
      );

      expect(
        prisma.agentPlaygroundPredictionRecord.update,
      ).toHaveBeenCalledWith({
        where: { id: "pred-1" },
        data: {
          actualOutcome: true,
          outcomeEvidenceUrl: "https://ex.com",
          needsReview: false,
          brierScore: expect.closeTo((0.8 - 1) ** 2, 5),
          judgmentAt: expect.any(Date),
        },
      });
    });

    it("computes Brier score correctly when outcome=false", async () => {
      prisma.agentPlaygroundPredictionRecord.update.mockResolvedValue({});

      await service.resolvePrediction(
        "pred-1",
        {
          outcome: false,
          evidenceUrl: null,
          confidence: 0.85,
          needsReview: false,
        },
        0.3,
      );

      const { data } =
        prisma.agentPlaygroundPredictionRecord.update.mock.calls[0][0];
      expect(data.brierScore).toBeCloseTo((0.3 - 0) ** 2, 5);
    });

    it("sets brierScore=null when outcome=null (cannot judge)", async () => {
      prisma.agentPlaygroundPredictionRecord.update.mockResolvedValue({});

      await service.resolvePrediction(
        "pred-1",
        { outcome: null, evidenceUrl: null, confidence: 0, needsReview: true },
        0.5,
      );

      const { data } =
        prisma.agentPlaygroundPredictionRecord.update.mock.calls[0][0];
      expect(data.brierScore).toBeNull();
      expect(data.actualOutcome).toBeNull();
      expect(data.needsReview).toBe(true);
    });

    it("maps null evidenceUrl to undefined (Prisma omit field)", async () => {
      prisma.agentPlaygroundPredictionRecord.update.mockResolvedValue({});

      await service.resolvePrediction(
        "pred-1",
        {
          outcome: true,
          evidenceUrl: null,
          confidence: 0.7,
          needsReview: false,
        },
        0.7,
      );

      const { data } =
        prisma.agentPlaygroundPredictionRecord.update.mock.calls[0][0];
      expect(data.outcomeEvidenceUrl).toBeUndefined();
    });

    it("clamps probability outside [0,1] when computing Brier", async () => {
      prisma.agentPlaygroundPredictionRecord.update.mockResolvedValue({});

      await service.resolvePrediction(
        "pred-1",
        {
          outcome: true,
          evidenceUrl: null,
          confidence: 0.9,
          needsReview: false,
        },
        1.5, // > 1 → clamped to 1 → brierScore = (1-1)^2 = 0
      );

      const { data } =
        prisma.agentPlaygroundPredictionRecord.update.mock.calls[0][0];
      expect(data.brierScore).toBeCloseTo(0, 5);
    });
  });

  // =========================================================================
  // getTopicCalibration
  // =========================================================================

  describe("getTopicCalibration()", () => {
    it("returns null when no resolved predictions exist", async () => {
      prisma.agentPlaygroundPredictionRecord.findMany.mockResolvedValue([]);

      const result = await service.getTopicCalibration("u1", "AI");

      expect(result).toBeNull();
    });

    it("returns avgBrier and sampleSize when resolved records exist", async () => {
      prisma.agentPlaygroundPredictionRecord.findMany.mockResolvedValue([
        { brierScore: 0.1 },
        { brierScore: 0.3 },
      ]);

      const result = await service.getTopicCalibration("u1", "AI");

      expect(result).not.toBeNull();
      expect(result!.sampleSize).toBe(2);
      expect(result!.avgBrier).toBeCloseTo(0.2, 5);
    });

    it("handles brierScore=null gracefully (treated as 0 in sum)", async () => {
      prisma.agentPlaygroundPredictionRecord.findMany.mockResolvedValue([
        { brierScore: null },
        { brierScore: 0.4 },
      ]);

      const result = await service.getTopicCalibration("u1", "AI");

      expect(result!.avgBrier).toBeCloseTo(0.2, 5);
      expect(result!.sampleSize).toBe(2);
    });

    it("slices topic to 500 chars when querying", async () => {
      prisma.agentPlaygroundPredictionRecord.findMany.mockResolvedValue([]);

      const longTopic = "y".repeat(600);
      await service.getTopicCalibration("u1", longTopic);

      const callArg =
        prisma.agentPlaygroundPredictionRecord.findMany.mock.calls[0][0];
      expect(callArg.where.topic).toHaveLength(500);
    });

    it("queries with correct userId and brierScore not-null filter", async () => {
      prisma.agentPlaygroundPredictionRecord.findMany.mockResolvedValue([]);

      await service.getTopicCalibration("user-42", "Quantum");

      expect(
        prisma.agentPlaygroundPredictionRecord.findMany,
      ).toHaveBeenCalledWith({
        where: {
          userId: "user-42",
          topic: "Quantum",
          brierScore: { not: null },
        },
        select: { brierScore: true },
        take: 200,
      });
    });
  });
});
