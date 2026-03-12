/**
 * QualityReviewHandler unit tests
 *
 * Covers: execute processes only fulfilled results, calls reviewDimension
 * for each success, calls reviewOverall, handles empty results, onError.
 */

import { QualityReviewHandler } from "../quality-review.handler";
import type { QualityReviewInput } from "../quality-review.handler";
import type { ExecutionContext } from "@/modules/ai-engine/facade";
import type {
  OverallReviewResult,
  DimensionReviewResult,
} from "../../types/collaboration.types";
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
  id: string,
  name: string,
): TopicDimension {
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

function makeAnalysisResult(dimensionId: string): DimensionAnalysisResult {
  return {
    dimensionId,
    summary: "Summary",
    keyFindings: [],
    trends: [],
    challenges: [],
    opportunities: [],
    evidenceUsed: 3,
    confidenceLevel: "medium",
    detailedContent: "Content here",
  };
}

function makeDimReviewResult(dimensionId: string, name: string): DimensionReviewResult {
  return {
    dimensionId,
    dimensionName: name,
    qualityLevel: ReviewQualityLevel.GOOD,
    overallScore: 80,
    scores: {
      breadth: 80,
      depth: 75,
      evidence: 85,
      coherence: 78,
      currency: 82,
    },
    issues: [],
    suggestions: ["Add more references"],
    needsReresearch: false,
  };
}

function makeOverallResult(
  dimensionReviews: DimensionReviewResult[],
): OverallReviewResult {
  return {
    topicId: "topic-1",
    topicName: "AI Healthcare",
    qualityLevel: ReviewQualityLevel.GOOD,
    overallScore: 80,
    dimensionReviews,
    crossDimensionIssues: [],
    coverageAnalysis: {
      coveredAspects: ["trends"],
      missingAspects: [],
      coverageScore: 90,
    },
    recommendations: [],
    needsReresearch: false,
    dimensionsToReresearch: [],
  };
}

// ---------------------------------------------------------------------------
// Mock service
// ---------------------------------------------------------------------------

const mockResearchReviewerService = {
  reviewDimension: jest.fn(),
  reviewOverall: jest.fn(),
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("QualityReviewHandler", () => {
  let handler: QualityReviewHandler;

  beforeEach(() => {
    jest.clearAllMocks();
    handler = new QualityReviewHandler(mockResearchReviewerService as any);
  });

  it("has the correct handlerId", () => {
    expect(handler.handlerId).toBe("ti:quality-review");
  });

  // -------------------------------------------------------------------------
  // execute
  // -------------------------------------------------------------------------

  describe("execute", () => {
    it("calls reviewDimension for each fulfilled result", async () => {
      const dim1 = makeDimension("dim-1", "技术趋势");
      const dim2 = makeDimension("dim-2", "市场分析");

      const analysis1 = makeAnalysisResult("dim-1");
      const analysis2 = makeAnalysisResult("dim-2");

      const review1 = makeDimReviewResult("dim-1", "技术趋势");
      const review2 = makeDimReviewResult("dim-2", "市场分析");

      mockResearchReviewerService.reviewDimension
        .mockResolvedValueOnce(review1)
        .mockResolvedValueOnce(review2);

      const overallResult = makeOverallResult([review1, review2]);
      mockResearchReviewerService.reviewOverall.mockResolvedValue(overallResult);

      const input: QualityReviewInput = {
        topic: makeTopic(),
        dimensions: [dim1, dim2],
        analysisResults: [
          { status: "fulfilled", value: { dimensionId: "dim-1", analysisResult: analysis1, evidenceIds: ["e1"] } },
          { status: "fulfilled", value: { dimensionId: "dim-2", analysisResult: analysis2, evidenceIds: ["e2", "e3"] } },
        ],
      };

      const result = await handler.execute(input, makeContext());

      expect(mockResearchReviewerService.reviewDimension).toHaveBeenCalledTimes(2);
      expect(mockResearchReviewerService.reviewDimension).toHaveBeenCalledWith(
        input.topic,
        dim1,
        analysis1,
        1, // evidenceIds.length
      );
      expect(mockResearchReviewerService.reviewDimension).toHaveBeenCalledWith(
        input.topic,
        dim2,
        analysis2,
        2,
      );
      expect(result).toBe(overallResult);
    });

    it("skips rejected results and only processes fulfilled ones", async () => {
      const dim1 = makeDimension("dim-1", "技术趋势");
      const dim2 = makeDimension("dim-2", "市场分析");

      const analysis1 = makeAnalysisResult("dim-1");
      const review1 = makeDimReviewResult("dim-1", "技术趋势");

      mockResearchReviewerService.reviewDimension.mockResolvedValue(review1);

      const overallResult = makeOverallResult([review1]);
      mockResearchReviewerService.reviewOverall.mockResolvedValue(overallResult);

      const input: QualityReviewInput = {
        topic: makeTopic(),
        dimensions: [dim1, dim2],
        analysisResults: [
          { status: "fulfilled", value: { dimensionId: "dim-1", analysisResult: analysis1, evidenceIds: [] } },
          { status: "rejected", reason: new Error("dim-2 failed") },
        ],
      };

      const result = await handler.execute(input, makeContext());

      // Only 1 reviewDimension call — dim-2 was rejected
      expect(mockResearchReviewerService.reviewDimension).toHaveBeenCalledTimes(1);
      expect(result).toBe(overallResult);
    });

    it("calls reviewOverall with all dimension reviews and all dimensions", async () => {
      const dim1 = makeDimension("dim-1", "技术趋势");
      const review1 = makeDimReviewResult("dim-1", "技术趋势");

      mockResearchReviewerService.reviewDimension.mockResolvedValue(review1);
      const overallResult = makeOverallResult([review1]);
      mockResearchReviewerService.reviewOverall.mockResolvedValue(overallResult);

      const input: QualityReviewInput = {
        topic: makeTopic(),
        dimensions: [dim1],
        analysisResults: [
          { status: "fulfilled", value: { dimensionId: "dim-1", analysisResult: makeAnalysisResult("dim-1"), evidenceIds: [] } },
        ],
      };

      await handler.execute(input, makeContext());

      expect(mockResearchReviewerService.reviewOverall).toHaveBeenCalledWith(
        input.topic,
        [dim1], // all dimensions (not just successful ones)
        [review1],
      );
    });

    it("handles empty analysisResults (all rejected or empty)", async () => {
      const dim1 = makeDimension("dim-1", "技术趋势");
      const overallResult = makeOverallResult([]);
      mockResearchReviewerService.reviewOverall.mockResolvedValue(overallResult);

      const input: QualityReviewInput = {
        topic: makeTopic(),
        dimensions: [dim1],
        analysisResults: [
          { status: "rejected", reason: new Error("failed") },
        ],
      };

      const result = await handler.execute(input, makeContext());

      expect(mockResearchReviewerService.reviewDimension).not.toHaveBeenCalled();
      expect(mockResearchReviewerService.reviewOverall).toHaveBeenCalledWith(
        input.topic,
        [dim1],
        [], // no dimension reviews
      );
      expect(result).toBe(overallResult);
    });

    it("skips fulfilled result when dimension id not found in dimensions array", async () => {
      const dim1 = makeDimension("dim-1", "技术趋势");
      const overallResult = makeOverallResult([]);
      mockResearchReviewerService.reviewOverall.mockResolvedValue(overallResult);

      const input: QualityReviewInput = {
        topic: makeTopic(),
        dimensions: [dim1],
        analysisResults: [
          {
            status: "fulfilled",
            value: {
              dimensionId: "dim-UNKNOWN", // not in dimensions
              analysisResult: makeAnalysisResult("dim-UNKNOWN"),
              evidenceIds: [],
            },
          },
        ],
      };

      await handler.execute(input, makeContext());

      // No reviewDimension call because dimension not found
      expect(mockResearchReviewerService.reviewDimension).not.toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // onError
  // -------------------------------------------------------------------------

  describe("onError", () => {
    it("returns 'skip' for any error", async () => {
      const result = await handler.onError(
        new Error("reviewer service down"),
        makeContext(),
      );
      expect(result).toBe("skip");
    });
  });
});
