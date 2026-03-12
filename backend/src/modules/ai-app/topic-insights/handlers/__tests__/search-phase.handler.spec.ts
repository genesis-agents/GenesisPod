/**
 * SearchPhaseHandler unit tests
 *
 * Verifies: execute delegates correctly, validate checks enrichedResults,
 * onError always returns "skip".
 */

import { SearchPhaseHandler } from "../search-phase.handler";
import type { SearchPhaseInput } from "../search-phase.handler";
import type { ExecutionContext } from "@/modules/ai-engine/facade";
import type { SearchPhaseResult } from "../../services/dimension/dimension-mission.service";
import type { ResearchTopic, TopicDimension } from "@prisma/client";

// ---------------------------------------------------------------------------
// Helpers / shared fixtures
// ---------------------------------------------------------------------------

function makeTopic(overrides: Partial<ResearchTopic> = {}): ResearchTopic {
  return {
    id: "topic-1",
    name: "AI Healthcare",
    type: "technology",
    description: "AI in healthcare",
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
    description: "Technology trends dimension",
    status: "PENDING" as any,
    searchQueries: [],
    searchSources: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  } as unknown as TopicDimension;
}

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

function makeSearchResult(
  enrichedResults: unknown[] = [{ id: "e1" }],
): SearchPhaseResult {
  return {
    dimensionId: "dim-1",
    dimensionName: "技术趋势",
    enrichedResults: enrichedResults as any,
    evidenceSummary: "Some evidence",
    figuresSummary: "",
    searchQueries: [],
  } as unknown as SearchPhaseResult;
}

// ---------------------------------------------------------------------------
// Mock service
// ---------------------------------------------------------------------------

const mockDimensionMissionService = {
  executeSearchPhase: jest.fn(),
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("SearchPhaseHandler", () => {
  let handler: SearchPhaseHandler;

  beforeEach(() => {
    jest.clearAllMocks();
    handler = new SearchPhaseHandler(mockDimensionMissionService as any);
  });

  it("has the correct handlerId", () => {
    expect(handler.handlerId).toBe("ti:search-phase");
  });

  // -------------------------------------------------------------------------
  // execute
  // -------------------------------------------------------------------------

  describe("execute", () => {
    it("delegates to dimensionMissionService.executeSearchPhase with correct args", async () => {
      const topic = makeTopic();
      const dimension = makeDimension();
      const searchResult = makeSearchResult();
      mockDimensionMissionService.executeSearchPhase.mockResolvedValue(
        searchResult,
      );

      const input: SearchPhaseInput = {
        topic,
        dimension,
        modelId: "model-abc",
        assignedTools: ["web-search"],
        assignedSkills: ["trend_analysis"],
      };

      const result = await handler.execute(input, makeContext());

      expect(
        mockDimensionMissionService.executeSearchPhase,
      ).toHaveBeenCalledWith(
        topic,
        dimension,
        undefined, // missionId
        "model-abc",
        undefined, // taskId
        ["web-search"],
        ["trend_analysis"],
      );
      expect(result).toBe(searchResult);
    });

    it("passes undefined for optional fields when not provided", async () => {
      const topic = makeTopic();
      const dimension = makeDimension();
      const searchResult = makeSearchResult();
      mockDimensionMissionService.executeSearchPhase.mockResolvedValue(
        searchResult,
      );

      const input: SearchPhaseInput = { topic, dimension };
      await handler.execute(input, makeContext());

      expect(
        mockDimensionMissionService.executeSearchPhase,
      ).toHaveBeenCalledWith(
        topic,
        dimension,
        undefined,
        undefined, // modelId not provided
        undefined,
        undefined, // assignedTools not provided
        undefined, // assignedSkills not provided
      );
    });

    it("propagates rejection from executeSearchPhase", async () => {
      mockDimensionMissionService.executeSearchPhase.mockRejectedValue(
        new Error("search API error"),
      );

      await expect(
        handler.execute({ topic: makeTopic(), dimension: makeDimension() }, makeContext()),
      ).rejects.toThrow("search API error");
    });
  });

  // -------------------------------------------------------------------------
  // validate
  // -------------------------------------------------------------------------

  describe("validate", () => {
    it("returns true when enrichedResults has items", async () => {
      const output = makeSearchResult([{ id: "e1" }, { id: "e2" }]);
      const valid = await handler.validate(output, makeContext());
      expect(valid).toBe(true);
    });

    it("returns false when enrichedResults is empty array", async () => {
      const output = makeSearchResult([]);
      const valid = await handler.validate(output, makeContext());
      expect(valid).toBe(false);
    });

    it("returns false when enrichedResults is undefined", async () => {
      const output = { dimensionName: "test", enrichedResults: undefined } as any;
      const valid = await handler.validate(output, makeContext());
      expect(valid).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // onError
  // -------------------------------------------------------------------------

  describe("onError", () => {
    it("returns 'skip' for any error", async () => {
      const result = await handler.onError(
        new Error("network timeout"),
        makeContext(),
      );
      expect(result).toBe("skip");
    });
  });
});
