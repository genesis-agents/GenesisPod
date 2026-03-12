/**
 * RevisionHandler unit tests
 *
 * Covers: short-circuit on empty targets, critique-refine loop, DB update
 * when content changes, error resilience, onError.
 */

import { RevisionHandler } from "../revision.handler";
import type { RevisionInput, RevisionOutput } from "../revision.handler";
import type { ExecutionContext } from "@/modules/ai-engine/facade";
import type { OverallReviewResult, DimensionReviewResult } from "../../types/collaboration.types";
import { ReviewQualityLevel } from "../../types/collaboration.types";
import type { DimensionAnalysisResult } from "../../types/research.types";
import type { ResearchTopic, TopicDimension } from "@prisma/client";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeContext(): ExecutionContext {
  return {
    executionId: "exec-test",
    workflowId: "wf-test",
    input: {} as any,
    state: {} as any,
    stepResults: new Map(),
    startTime: new Date(),
  };
}

function makeTopic(): ResearchTopic {
  return {
    id: "topic-1",
    name: "AI Healthcare",
    type: "technology",
    description: null,
    language: "zh",
    userId: "user-1",
    status: "ACTIVE" as any,
    topicConfig: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  } as ResearchTopic;
}

function makeDimension(id: string, name: string): TopicDimension {
  return {
    id,
    topicId: "topic-1",
    name,
    description: null,
    status: "COMPLETED" as any,
    searchQueries: [],
    searchSources: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  } as unknown as TopicDimension;
}

function makeAnalysisResult(
  dimensionId: string,
  detailedContent = "Original content",
): DimensionAnalysisResult {
  return {
    dimensionId,
    summary: "Summary",
    keyFindings: [],
    trends: [],
    challenges: [],
    opportunities: [],
    evidenceUsed: 3,
    confidenceLevel: "medium",
    detailedContent,
  };
}

function makeDimReview(
  dimensionId: string,
  score = 60,
): DimensionReviewResult {
  return {
    dimensionId,
    dimensionName: "技术趋势",
    qualityLevel: ReviewQualityLevel.NEEDS_REVISION,
    overallScore: score,
    scores: { breadth: 60, depth: 55, evidence: 65, coherence: 60, currency: 58 },
    issues: [{ type: "shallow_analysis", severity: "major", description: "Too shallow" }],
    suggestions: ["Expand key sections"],
    needsReresearch: true,
  };
}

function makeOverallResult(
  dimensionsToReresearch: string[],
  extraDimReviews: DimensionReviewResult[] = [],
): OverallReviewResult {
  return {
    topicId: "topic-1",
    topicName: "AI Healthcare",
    qualityLevel: ReviewQualityLevel.NEEDS_REVISION,
    overallScore: 65,
    dimensionReviews: extraDimReviews,
    crossDimensionIssues: [],
    coverageAnalysis: {
      coveredAspects: [],
      missingAspects: [],
      coverageScore: 70,
    },
    recommendations: ["Improve depth"],
    needsReresearch: dimensionsToReresearch.length > 0,
    dimensionsToReresearch,
  };
}

// ---------------------------------------------------------------------------
// Mock services
// ---------------------------------------------------------------------------

const mockCritiqueRefineService = {
  runCritiqueRefineLoop: jest.fn(),
};

const mockPrisma = {
  dimensionAnalysis: {
    findFirst: jest.fn(),
    update: jest.fn(),
  },
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("RevisionHandler", () => {
  let handler: RevisionHandler;

  beforeEach(() => {
    jest.clearAllMocks();
    handler = new RevisionHandler(
      mockCritiqueRefineService as any,
      mockPrisma as any,
    );
  });

  it("has the correct handlerId", () => {
    expect(handler.handlerId).toBe("ti:revision");
  });

  // -------------------------------------------------------------------------
  // execute
  // -------------------------------------------------------------------------

  describe("execute", () => {
    it("returns {0,0} immediately when dimensionsToReresearch is empty", async () => {
      const input: RevisionInput = {
        topic: makeTopic(),
        dimensions: [makeDimension("dim-1", "技术趋势")],
        analysisResults: [
          {
            status: "fulfilled",
            value: {
              dimensionId: "dim-1",
              analysisResult: makeAnalysisResult("dim-1"),
              evidenceIds: [],
            },
          },
        ],
        reviewResult: makeOverallResult([]), // empty
        reportId: "report-1",
      };

      const result = await handler.execute(input, makeContext());

      expect(result).toEqual({ revisedCount: 0, totalTargeted: 0 });
      expect(mockCritiqueRefineService.runCritiqueRefineLoop).not.toHaveBeenCalled();
    });

    it("runs critique-refine only for targeted dimensions", async () => {
      const dim1 = makeDimension("dim-1", "技术趋势");
      const dim2 = makeDimension("dim-2", "市场分析");

      const analysis1 = makeAnalysisResult("dim-1", "Original dim1 content");
      const analysis2 = makeAnalysisResult("dim-2", "Original dim2 content");

      mockCritiqueRefineService.runCritiqueRefineLoop.mockResolvedValue({
        finalContent: "Improved dim1 content",
        totalChanges: 3,
        iterations: [],
        wasImproved: true,
      });

      mockPrisma.dimensionAnalysis.findFirst.mockResolvedValue({
        id: "analysis-1",
        dataPoints: {},
      });
      mockPrisma.dimensionAnalysis.update.mockResolvedValue({});

      const input: RevisionInput = {
        topic: makeTopic(),
        dimensions: [dim1, dim2],
        analysisResults: [
          { status: "fulfilled", value: { dimensionId: "dim-1", analysisResult: analysis1, evidenceIds: [] } },
          { status: "fulfilled", value: { dimensionId: "dim-2", analysisResult: analysis2, evidenceIds: [] } },
        ],
        reviewResult: makeOverallResult(["dim-1"], [makeDimReview("dim-1")]), // only dim-1 targeted
        reportId: "report-1",
      };

      const result = await handler.execute(input, makeContext());

      // Only dim-1 processed
      expect(mockCritiqueRefineService.runCritiqueRefineLoop).toHaveBeenCalledTimes(1);
      expect(mockCritiqueRefineService.runCritiqueRefineLoop).toHaveBeenCalledWith(
        expect.objectContaining({
          content: "Original dim1 content",
          context: expect.objectContaining({
            topicName: "AI Healthcare",
            dimensionName: "技术趋势",
          }),
          config: { maxIterations: 1 },
        }),
      );

      expect(result).toEqual({ revisedCount: 1, totalTargeted: 1 });
    });

    it("updates DB when content is improved", async () => {
      const dim1 = makeDimension("dim-1", "技术趋势");
      const analysis1 = makeAnalysisResult("dim-1", "Old content");

      mockCritiqueRefineService.runCritiqueRefineLoop.mockResolvedValue({
        finalContent: "New improved content", // different from original
        totalChanges: 2,
        iterations: [],
        wasImproved: true,
      });

      const existingAnalysis = { id: "db-analysis-1", dataPoints: { someField: "value" } };
      mockPrisma.dimensionAnalysis.findFirst.mockResolvedValue(existingAnalysis);
      mockPrisma.dimensionAnalysis.update.mockResolvedValue({});

      const input: RevisionInput = {
        topic: makeTopic(),
        dimensions: [dim1],
        analysisResults: [
          { status: "fulfilled", value: { dimensionId: "dim-1", analysisResult: analysis1, evidenceIds: [] } },
        ],
        reviewResult: makeOverallResult(["dim-1"]),
        reportId: "report-42",
      };

      await handler.execute(input, makeContext());

      expect(mockPrisma.dimensionAnalysis.findFirst).toHaveBeenCalledWith({
        where: { dimensionId: "dim-1", reportId: "report-42" },
        orderBy: { createdAt: "desc" },
      });

      expect(mockPrisma.dimensionAnalysis.update).toHaveBeenCalledWith({
        where: { id: "db-analysis-1" },
        data: {
          dataPoints: expect.objectContaining({
            detailedContent: "New improved content",
          }),
        },
      });

      // analysisResult.detailedContent mutated in-place
      expect(analysis1.detailedContent).toBe("New improved content");
    });

    it("does not update DB when content is unchanged", async () => {
      const dim1 = makeDimension("dim-1", "技术趋势");
      const originalContent = "Same content";
      const analysis1 = makeAnalysisResult("dim-1", originalContent);

      mockCritiqueRefineService.runCritiqueRefineLoop.mockResolvedValue({
        finalContent: originalContent, // same as original — no change
        totalChanges: 0,
        iterations: [],
        wasImproved: false,
      });

      const input: RevisionInput = {
        topic: makeTopic(),
        dimensions: [dim1],
        analysisResults: [
          { status: "fulfilled", value: { dimensionId: "dim-1", analysisResult: analysis1, evidenceIds: [] } },
        ],
        reviewResult: makeOverallResult(["dim-1"]),
        reportId: "report-1",
      };

      const result = await handler.execute(input, makeContext());

      expect(mockPrisma.dimensionAnalysis.findFirst).not.toHaveBeenCalled();
      expect(mockPrisma.dimensionAnalysis.update).not.toHaveBeenCalled();
      expect(result).toEqual({ revisedCount: 0, totalTargeted: 1 });
    });

    it("handles revision error gracefully (does not throw)", async () => {
      const dim1 = makeDimension("dim-1", "技术趋势");
      const analysis1 = makeAnalysisResult("dim-1", "Content");

      mockCritiqueRefineService.runCritiqueRefineLoop.mockRejectedValue(
        new Error("LLM timeout"),
      );

      const input: RevisionInput = {
        topic: makeTopic(),
        dimensions: [dim1],
        analysisResults: [
          { status: "fulfilled", value: { dimensionId: "dim-1", analysisResult: analysis1, evidenceIds: [] } },
        ],
        reviewResult: makeOverallResult(["dim-1"]),
        reportId: "report-1",
      };

      // Should not throw
      const result = await handler.execute(input, makeContext());

      expect(result).toEqual({ revisedCount: 0, totalTargeted: 1 });
    });

    it("skips rejected analysisResults even if dimension is targeted", async () => {
      const dim1 = makeDimension("dim-1", "技术趋势");

      const input: RevisionInput = {
        topic: makeTopic(),
        dimensions: [dim1],
        analysisResults: [
          { status: "rejected", reason: new Error("earlier failure") },
        ],
        reviewResult: makeOverallResult(["dim-1"]),
        reportId: "report-1",
      };

      const result = await handler.execute(input, makeContext());

      expect(mockCritiqueRefineService.runCritiqueRefineLoop).not.toHaveBeenCalled();
      expect(result).toEqual({ revisedCount: 0, totalTargeted: 1 });
    });

    it("skips when dimension not in dimensions array", async () => {
      // dimensionId in analysisResults but not in dimensions list
      const input: RevisionInput = {
        topic: makeTopic(),
        dimensions: [], // empty
        analysisResults: [
          {
            status: "fulfilled",
            value: {
              dimensionId: "dim-1",
              analysisResult: makeAnalysisResult("dim-1"),
              evidenceIds: [],
            },
          },
        ],
        reviewResult: makeOverallResult(["dim-1"]),
        reportId: "report-1",
      };

      const result = await handler.execute(input, makeContext());

      expect(mockCritiqueRefineService.runCritiqueRefineLoop).not.toHaveBeenCalled();
      expect(result).toEqual({ revisedCount: 0, totalTargeted: 1 });
    });

    it("skips when analysisResult.detailedContent is falsy", async () => {
      const dim1 = makeDimension("dim-1", "技术趋势");
      const analysis1 = makeAnalysisResult("dim-1", "");

      const input: RevisionInput = {
        topic: makeTopic(),
        dimensions: [dim1],
        analysisResults: [
          { status: "fulfilled", value: { dimensionId: "dim-1", analysisResult: analysis1, evidenceIds: [] } },
        ],
        reviewResult: makeOverallResult(["dim-1"]),
        reportId: "report-1",
      };

      const result = await handler.execute(input, makeContext());

      expect(mockCritiqueRefineService.runCritiqueRefineLoop).not.toHaveBeenCalled();
      expect(result).toEqual({ revisedCount: 0, totalTargeted: 1 });
    });

    it("uses recommendations as fallback quality feedback when no dimReview found", async () => {
      const dim1 = makeDimension("dim-1", "技术趋势");
      const analysis1 = makeAnalysisResult("dim-1", "Content to improve");

      mockCritiqueRefineService.runCritiqueRefineLoop.mockResolvedValue({
        finalContent: "Improved content",
        totalChanges: 1,
        iterations: [],
        wasImproved: true,
      });

      mockPrisma.dimensionAnalysis.findFirst.mockResolvedValue(null); // no DB record

      const reviewResult = makeOverallResult(["dim-1"]);
      // dimensionReviews is empty — no match for dim-1 → falls back to recommendations

      const input: RevisionInput = {
        topic: makeTopic(),
        dimensions: [dim1],
        analysisResults: [
          { status: "fulfilled", value: { dimensionId: "dim-1", analysisResult: analysis1, evidenceIds: [] } },
        ],
        reviewResult,
        reportId: "report-1",
      };

      await handler.execute(input, makeContext());

      expect(mockCritiqueRefineService.runCritiqueRefineLoop).toHaveBeenCalledWith(
        expect.objectContaining({
          context: expect.objectContaining({
            qualityExpectation: "Improve depth", // from recommendations
          }),
        }),
      );
    });
  });

  // -------------------------------------------------------------------------
  // onError
  // -------------------------------------------------------------------------

  describe("onError", () => {
    it("returns 'skip' for any error", async () => {
      const result = await handler.onError(
        new Error("unexpected exception"),
        makeContext(),
      );
      expect(result).toBe("skip");
    });
  });
});
