/**
 * DimensionWriteHandler unit tests
 *
 * Covers: prepare passthrough, execute outline resolution logic,
 * validate, onError DB update and skip.
 */

import { DimensionWriteHandler } from "../dimension-write.handler";
import type {
  DimensionWriteInput,
  DimensionWriteOutput,
} from "../dimension-write.handler";
import type { ExecutionContext } from "@/modules/ai-engine/facade";
import type { GlobalOutline } from "../../services/core/research/research-leader.service";
import type { SearchPhaseResult } from "../../services/dimension/dimension-mission.service";
import type { DimensionOutline } from "../../types/leader.types";
import type { DimensionAnalysisResult } from "../../types/research.types";
import type { ResearchTopic, TopicDimension } from "@prisma/client";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeContext(
  input: Partial<DimensionWriteInput> = {},
): ExecutionContext {
  return {
    executionId: "exec-test",
    workflowId: "wf-test",
    input: input as any,
    state: {} as any,
    stepResults: new Map(),
    startTime: new Date(),
  };
}

function makeTopic(overrides: Partial<ResearchTopic> = {}): ResearchTopic {
  return {
    id: "topic-1",
    name: "AI Healthcare",
    type: "technology",
    description: "Healthcare AI",
    language: "zh",
    userId: "user-1",
    status: "ACTIVE" as any,
    topicConfig: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  } as ResearchTopic;
}

function makeDimension(
  overrides: Partial<TopicDimension> = {},
): TopicDimension {
  return {
    id: "dim-1",
    topicId: "topic-1",
    name: "技术趋势",
    description: "Technology trends",
    status: "PENDING" as any,
    searchQueries: [],
    searchSources: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  } as unknown as TopicDimension;
}

function makeSearchResult(): SearchPhaseResult {
  return {
    dimensionId: "dim-1",
    dimensionName: "技术趋势",
    enrichedResults: [{ id: "e1" }],
    evidenceSummary: "summary text",
    figuresSummary: "figures text",
    searchQueries: ["query1"],
  } as unknown as SearchPhaseResult;
}

function makeDimensionOutline(): DimensionOutline {
  return {
    intentUnderstanding: {
      coreQuestion: "Trends?",
      scope: { included: [], excluded: [] },
      expectedDepth: "detailed",
      targetAudience: "researchers",
      keyFocusAreas: [],
    },
    sections: [],
    executionPlan: { parallelGroups: [], estimatedTotalWords: 2000 },
  };
}

function makeGlobalOutline(
  dimensionId: string,
  dimensionName: string,
): GlobalOutline {
  return {
    dimensions: [
      {
        dimensionId,
        dimensionName,
        outline: makeDimensionOutline(),
        crossDimensionNotes: "",
      },
    ],
    globalThemes: [],
    deduplicationRules: [],
  };
}

function makeAnalysisResult(): DimensionAnalysisResult {
  return {
    dimensionId: "dim-1",
    summary: "AI is growing rapidly",
    keyFindings: [],
    trends: [],
    challenges: [],
    opportunities: [],
    evidenceUsed: 5,
    confidenceLevel: "high",
    detailedContent: "## Full analysis\n\nDetailed content here.",
  };
}

function makeWriteInput(
  overrides: Partial<DimensionWriteInput> = {},
): DimensionWriteInput {
  return {
    topic: makeTopic(),
    dimension: makeDimension(),
    searchResult: makeSearchResult(),
    globalOutline: null,
    allDimensions: [{ name: "技术趋势", description: "Technology trends" }],
    reportId: "report-123",
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Mock services
// ---------------------------------------------------------------------------

const mockDimensionMissionService = {
  executeWritingPhase: jest.fn(),
};

const mockResearchLeaderService = {
  planDimensionOutline: jest.fn(),
};

const mockPrisma = {
  topicDimension: {
    update: jest.fn(),
  },
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("DimensionWriteHandler", () => {
  let handler: DimensionWriteHandler;

  beforeEach(() => {
    jest.clearAllMocks();
    handler = new DimensionWriteHandler(
      mockDimensionMissionService as any,
      mockResearchLeaderService as any,
      mockPrisma as any,
    );
  });

  it("has the correct handlerId", () => {
    expect(handler.handlerId).toBe("ti:dimension-write");
  });

  // -------------------------------------------------------------------------
  // prepare
  // -------------------------------------------------------------------------

  describe("prepare", () => {
    it("returns the input unchanged", async () => {
      const input = makeWriteInput();
      const result = await handler.prepare(input, makeContext());
      expect(result).toBe(input);
    });
  });

  // -------------------------------------------------------------------------
  // execute – outline resolution
  // -------------------------------------------------------------------------

  describe("execute", () => {
    it("uses global outline when available and matching by dimensionId", async () => {
      const coordinatedOutline = makeDimensionOutline();
      const globalOutline: GlobalOutline = {
        dimensions: [
          {
            dimensionId: "dim-1",
            dimensionName: "技术趋势",
            outline: coordinatedOutline,
            crossDimensionNotes: "",
          },
        ],
        globalThemes: [],
        deduplicationRules: [],
      };

      const analysisResult = makeAnalysisResult();
      mockDimensionMissionService.executeWritingPhase.mockResolvedValue({
        success: true,
        analysisResult,
        evidenceIds: ["e1", "e2"],
        extractedClaims: [],
      });

      const input = makeWriteInput({ globalOutline });
      await handler.execute(input, makeContext());

      // planDimensionOutline should NOT have been called
      expect(
        mockResearchLeaderService.planDimensionOutline,
      ).not.toHaveBeenCalled();

      // executeWritingPhase called with the coordinated outline
      expect(
        mockDimensionMissionService.executeWritingPhase,
      ).toHaveBeenCalledWith(
        expect.anything(), // topic
        expect.anything(), // dimension
        expect.anything(), // searchResult
        coordinatedOutline, // the global outline
        "report-123",
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
      );
    });

    it("uses global outline when matched by dimensionName", async () => {
      const coordinatedOutline = makeDimensionOutline();
      // dimensionId does not match but name does
      const globalOutline: GlobalOutline = {
        dimensions: [
          {
            dimensionId: "dim-OTHER",
            dimensionName: "技术趋势", // matches by name
            outline: coordinatedOutline,
            crossDimensionNotes: "",
          },
        ],
        globalThemes: [],
        deduplicationRules: [],
      };

      mockDimensionMissionService.executeWritingPhase.mockResolvedValue({
        success: true,
        analysisResult: makeAnalysisResult(),
        evidenceIds: [],
        extractedClaims: [],
      });

      const input = makeWriteInput({ globalOutline });
      await handler.execute(input, makeContext());

      expect(
        mockResearchLeaderService.planDimensionOutline,
      ).not.toHaveBeenCalled();
    });

    it("falls back to local planning when globalOutline is null", async () => {
      const localOutline = makeDimensionOutline();
      mockResearchLeaderService.planDimensionOutline.mockResolvedValue(
        localOutline,
      );
      mockDimensionMissionService.executeWritingPhase.mockResolvedValue({
        success: true,
        analysisResult: makeAnalysisResult(),
        evidenceIds: [],
        extractedClaims: [],
      });

      const input = makeWriteInput({ globalOutline: null });
      await handler.execute(input, makeContext());

      expect(
        mockResearchLeaderService.planDimensionOutline,
      ).toHaveBeenCalledTimes(1);
    });

    it("falls back to local planning when no matching dimension in global outline", async () => {
      const globalOutline: GlobalOutline = {
        dimensions: [
          {
            dimensionId: "dim-OTHER",
            dimensionName: "竞争格局", // different name
            outline: makeDimensionOutline(),
            crossDimensionNotes: "",
          },
        ],
        globalThemes: [],
        deduplicationRules: [],
      };

      const localOutline = makeDimensionOutline();
      mockResearchLeaderService.planDimensionOutline.mockResolvedValue(
        localOutline,
      );
      mockDimensionMissionService.executeWritingPhase.mockResolvedValue({
        success: true,
        analysisResult: makeAnalysisResult(),
        evidenceIds: [],
        extractedClaims: [],
      });

      const input = makeWriteInput({ globalOutline });
      await handler.execute(input, makeContext());

      expect(
        mockResearchLeaderService.planDimensionOutline,
      ).toHaveBeenCalledTimes(1);
    });

    it("returns correct output shape on success", async () => {
      mockResearchLeaderService.planDimensionOutline.mockResolvedValue(
        makeDimensionOutline(),
      );
      const analysisResult = makeAnalysisResult();
      mockDimensionMissionService.executeWritingPhase.mockResolvedValue({
        success: true,
        analysisResult,
        evidenceIds: ["e1", "e2"],
        extractedClaims: [{ claim: "AI grows" }],
      });

      const input = makeWriteInput();
      const result = await handler.execute(input, makeContext());

      expect(result).toEqual({
        dimensionId: "dim-1",
        analysisResult,
        evidenceIds: ["e1", "e2"],
        extractedClaims: [{ claim: "AI grows" }],
      });
    });

    it("throws when executeWritingPhase returns success: false", async () => {
      mockResearchLeaderService.planDimensionOutline.mockResolvedValue(
        makeDimensionOutline(),
      );
      mockDimensionMissionService.executeWritingPhase.mockResolvedValue({
        success: false,
        error: "Section writer failed",
        evidenceIds: [],
      });

      const input = makeWriteInput();
      await expect(handler.execute(input, makeContext())).rejects.toThrow(
        "Section writer failed",
      );
    });

    it("throws with fallback message when success: false and no error message", async () => {
      mockResearchLeaderService.planDimensionOutline.mockResolvedValue(
        makeDimensionOutline(),
      );
      mockDimensionMissionService.executeWritingPhase.mockResolvedValue({
        success: false,
        evidenceIds: [],
      });

      const input = makeWriteInput();
      await expect(handler.execute(input, makeContext())).rejects.toThrow(
        "Writing failed for dimension: 技术趋势",
      );
    });

    it("passes assignment model and tools to executeWritingPhase", async () => {
      const globalOutline = makeGlobalOutline("dim-1", "技术趋势");
      mockDimensionMissionService.executeWritingPhase.mockResolvedValue({
        success: true,
        analysisResult: makeAnalysisResult(),
        evidenceIds: [],
        extractedClaims: [],
      });

      const input = makeWriteInput({
        globalOutline,
        assignment: {
          modelId: "gpt-4o",
          tools: ["rag-search"],
          skills: ["synthesis"],
        },
        maxRevisionRounds: 2,
      });
      await handler.execute(input, makeContext());

      expect(
        mockDimensionMissionService.executeWritingPhase,
      ).toHaveBeenCalledWith(
        expect.anything(),
        expect.anything(),
        expect.anything(),
        expect.anything(),
        "report-123",
        undefined,
        "gpt-4o",
        undefined,
        ["rag-search"],
        ["synthesis"],
        undefined,
        2,
      );
    });
  });

  // -------------------------------------------------------------------------
  // validate
  // -------------------------------------------------------------------------

  describe("validate", () => {
    it("returns true when analysisResult is present", async () => {
      const output: DimensionWriteOutput = {
        dimensionId: "dim-1",
        analysisResult: makeAnalysisResult(),
        evidenceIds: [],
      };
      expect(await handler.validate(output, makeContext())).toBe(true);
    });

    it("returns false when analysisResult is null", async () => {
      const output = {
        dimensionId: "dim-1",
        analysisResult: null,
        evidenceIds: [],
      } as any;
      expect(await handler.validate(output, makeContext())).toBe(false);
    });

    it("returns false when analysisResult is undefined", async () => {
      const output = {
        dimensionId: "dim-1",
        analysisResult: undefined,
        evidenceIds: [],
      } as any;
      expect(await handler.validate(output, makeContext())).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // onError
  // -------------------------------------------------------------------------

  describe("onError", () => {
    it("marks dimension as FAILED in DB and returns 'skip'", async () => {
      mockPrisma.topicDimension.update.mockResolvedValue({});

      const context = makeContext({
        dimension: makeDimension({ id: "dim-1" }),
      });
      const result = await handler.onError(new Error("write failed"), context);

      expect(mockPrisma.topicDimension.update).toHaveBeenCalledWith({
        where: { id: "dim-1" },
        data: { status: "FAILED" },
      });
      expect(result).toBe("skip");
    });

    it("still returns 'skip' when Prisma update throws", async () => {
      mockPrisma.topicDimension.update.mockRejectedValue(
        new Error("DB connection lost"),
      );

      const context = makeContext({
        dimension: makeDimension({ id: "dim-1" }),
      });
      const result = await handler.onError(new Error("write failed"), context);

      expect(result).toBe("skip");
    });

    it("returns 'skip' when context has no dimension", async () => {
      const context = makeContext({});
      const result = await handler.onError(new Error("write failed"), context);

      expect(mockPrisma.topicDimension.update).not.toHaveBeenCalled();
      expect(result).toBe("skip");
    });
  });
});
