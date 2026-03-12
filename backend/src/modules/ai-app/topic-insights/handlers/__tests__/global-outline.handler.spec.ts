/**
 * GlobalOutlineHandler unit tests
 *
 * Verifies: execute delegates to planGlobalOutline and returns null on error,
 * onError always returns "skip".
 */

import { GlobalOutlineHandler } from "../global-outline.handler";
import type { GlobalOutlineInput } from "../global-outline.handler";
import type { ExecutionContext } from "@/modules/ai-engine/facade";
import type { GlobalOutline } from "../../services/core/research/research-leader.service";

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

function makeInput(
  overrides: Partial<GlobalOutlineInput> = {},
): GlobalOutlineInput {
  return {
    topic: {
      name: "AI Healthcare",
      type: "technology",
      description: "AI in healthcare",
      language: "zh",
    },
    dimensionSearchSummaries: [
      {
        dimensionId: "dim-1",
        dimensionName: "技术趋势",
        dimensionDescription: "Technology trends",
        evidenceSummary: "Evidence A",
        figuresSummary: "",
        searchQueries: [],
      },
    ],
    ...overrides,
  };
}

function makeGlobalOutline(): GlobalOutline {
  return {
    dimensions: [
      {
        dimensionId: "dim-1",
        dimensionName: "技术趋势",
        outline: {
          intentUnderstanding: {
            coreQuestion: "What are the trends?",
            scope: { included: [], excluded: [] },
            expectedDepth: "detailed",
            targetAudience: "researchers",
            keyFocusAreas: [],
          },
          sections: [],
          executionPlan: { parallelGroups: [], estimatedTotalWords: 1000 },
        },
        crossDimensionNotes: "",
      },
    ],
    globalThemes: ["AI adoption"],
    deduplicationRules: [],
  };
}

// ---------------------------------------------------------------------------
// Mock service
// ---------------------------------------------------------------------------

const mockResearchLeaderService = {
  planGlobalOutline: jest.fn(),
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("GlobalOutlineHandler", () => {
  let handler: GlobalOutlineHandler;

  beforeEach(() => {
    jest.clearAllMocks();
    handler = new GlobalOutlineHandler(mockResearchLeaderService as any);
  });

  it("has the correct handlerId", () => {
    expect(handler.handlerId).toBe("ti:global-outline");
  });

  // -------------------------------------------------------------------------
  // execute
  // -------------------------------------------------------------------------

  describe("execute", () => {
    it("delegates to planGlobalOutline with topic and summaries", async () => {
      const outline = makeGlobalOutline();
      mockResearchLeaderService.planGlobalOutline.mockResolvedValue(outline);

      const input = makeInput();
      const result = await handler.execute(input, makeContext());

      expect(mockResearchLeaderService.planGlobalOutline).toHaveBeenCalledWith(
        input.topic,
        input.dimensionSearchSummaries,
      );
      expect(result).toBe(outline);
    });

    it("returns null when planGlobalOutline throws (non-fatal fallback)", async () => {
      mockResearchLeaderService.planGlobalOutline.mockRejectedValue(
        new Error("LLM quota exceeded"),
      );

      const result = await handler.execute(makeInput(), makeContext());

      expect(result).toBeNull();
    });

    it("returns null when planGlobalOutline rejects with non-Error", async () => {
      mockResearchLeaderService.planGlobalOutline.mockRejectedValue(
        "string error",
      );

      const result = await handler.execute(makeInput(), makeContext());

      expect(result).toBeNull();
    });
  });

  // -------------------------------------------------------------------------
  // onError
  // -------------------------------------------------------------------------

  describe("onError", () => {
    it("returns 'skip' for any error", async () => {
      const result = await handler.onError(
        new Error("unexpected failure"),
        makeContext(),
      );
      expect(result).toBe("skip");
    });
  });
});
