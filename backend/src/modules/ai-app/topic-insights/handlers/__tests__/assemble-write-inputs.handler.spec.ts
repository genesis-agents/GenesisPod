/**
 * AssembleWriteInputsHandler unit tests
 *
 * Verifies: correct handlerId, execute assembles DimensionWriteInput[] from
 * context, handles empty dimensions, respects agentAssignments, validate
 * rejects empty output, onError returns "abort".
 */

import { AssembleWriteInputsHandler } from "../assemble-write-inputs.handler";
import type { AssembleWriteInputsInput } from "../assemble-write-inputs.handler";
import type { ExecutionContext } from "@/modules/ai-engine/facade";
import type { ResearchTopic, TopicDimension } from "@prisma/client";
import type { SearchPhaseResult } from "../../services/dimension/dimension-mission.service";

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

function makeSearchResult(
  overrides: Partial<SearchPhaseResult> = {},
): SearchPhaseResult {
  return {
    dimensionId: "dim-1",
    dimensionName: "技术趋势",
    enrichedResults: [{ id: "e1" }] as any,
    evidenceSummary: "Some evidence",
    figuresSummary: "",
    searchQueries: [],
    ...overrides,
  } as unknown as SearchPhaseResult;
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

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("AssembleWriteInputsHandler", () => {
  let handler: AssembleWriteInputsHandler;

  beforeEach(() => {
    handler = new AssembleWriteInputsHandler();
  });

  it("has the correct handlerId", () => {
    expect(handler.handlerId).toBe("ti:assemble-write-inputs");
  });

  // -------------------------------------------------------------------------
  // execute
  // -------------------------------------------------------------------------

  describe("execute", () => {
    it("assembles one DimensionWriteInput per dimension", async () => {
      const topic = makeTopic();
      const dim = makeDimension();
      const searchResult = makeSearchResult();

      const input: AssembleWriteInputsInput = {
        topic,
        dimensions: [dim],
        searchResults: [searchResult],
        reportId: "report-abc",
      };

      const result = await handler.execute(input, makeContext());

      expect(result).toHaveLength(1);
      expect(result[0].topic).toBe(topic);
      expect(result[0].dimension).toBe(dim);
      expect(result[0].searchResult).toBe(searchResult);
      expect(result[0].reportId).toBe("report-abc");
    });

    it("returns correct allDimensions list including all dimensions", async () => {
      const topic = makeTopic();
      const dim1 = makeDimension({ id: "dim-1", name: "市场分析" });
      const dim2 = makeDimension({ id: "dim-2", name: "技术趋势" });

      const input: AssembleWriteInputsInput = {
        topic,
        dimensions: [dim1, dim2],
        searchResults: [makeSearchResult(), makeSearchResult()],
        reportId: "report-xyz",
      };

      const result = await handler.execute(input, makeContext());

      expect(result).toHaveLength(2);
      // allDimensions should contain both dimensions in each write input
      expect(result[0].allDimensions).toHaveLength(2);
      expect(result[0].allDimensions.map((d) => d.name)).toContain("市场分析");
      expect(result[0].allDimensions.map((d) => d.name)).toContain("技术趋势");
    });

    it("handles empty dimensions gracefully — returns empty array", async () => {
      const input: AssembleWriteInputsInput = {
        topic: makeTopic(),
        dimensions: [],
        searchResults: [],
        reportId: "report-empty",
      };

      const result = await handler.execute(input, makeContext());

      expect(result).toEqual([]);
    });

    it("uses empty SearchPhaseResult when searchResults is shorter than dimensions", async () => {
      const topic = makeTopic();
      const dim1 = makeDimension({ id: "dim-1", name: "维度1" });
      const dim2 = makeDimension({ id: "dim-2", name: "维度2" });

      const input: AssembleWriteInputsInput = {
        topic,
        dimensions: [dim1, dim2],
        searchResults: [makeSearchResult()], // only 1 result for 2 dimensions
        reportId: "report-short",
      };

      // Should not throw — second dimension gets {} as fallback
      const result = await handler.execute(input, makeContext());

      expect(result).toHaveLength(2);
      expect(result[1].searchResult).toEqual({});
    });

    it("matches agentAssignments by dimension id", async () => {
      const topic = makeTopic();
      const dim = makeDimension({ id: "dim-assigned" });

      const input: AssembleWriteInputsInput = {
        topic,
        dimensions: [dim],
        searchResults: [makeSearchResult()],
        reportId: "report-assigned",
        agentAssignments: [
          {
            assignedDimensions: ["dim-assigned"],
            modelId: "gpt-custom",
            tools: ["web-search"],
            skills: ["analysis"],
          },
        ],
      };

      const result = await handler.execute(input, makeContext());

      expect(result[0].assignment).toBeDefined();
      expect(result[0].assignment?.modelId).toBe("gpt-custom");
      expect(result[0].assignment?.tools).toEqual(["web-search"]);
      expect(result[0].assignment?.skills).toEqual(["analysis"]);
    });

    it("matches agentAssignments by dimension name when id not in list", async () => {
      const topic = makeTopic();
      const dim = makeDimension({ id: "dim-99", name: "市场分析" });

      const input: AssembleWriteInputsInput = {
        topic,
        dimensions: [dim],
        searchResults: [makeSearchResult()],
        reportId: "report-byname",
        agentAssignments: [
          {
            assignedDimensions: ["市场分析"], // matched by name
            modelId: "claude-custom",
          },
        ],
      };

      const result = await handler.execute(input, makeContext());

      expect(result[0].assignment?.modelId).toBe("claude-custom");
    });

    it("leaves assignment undefined when no agentAssignments match", async () => {
      const input: AssembleWriteInputsInput = {
        topic: makeTopic(),
        dimensions: [makeDimension({ id: "dim-unmatched" })],
        searchResults: [makeSearchResult()],
        reportId: "report-no-assign",
        agentAssignments: [
          { assignedDimensions: ["other-dim"], modelId: "some-model" },
        ],
      };

      const result = await handler.execute(input, makeContext());

      expect(result[0].assignment).toBeUndefined();
    });

    it("propagates globalOutline to every write input", async () => {
      const globalOutline = {
        sections: [{ title: "Introduction", dimensionIds: ["dim-1"] }],
      } as any;

      const input: AssembleWriteInputsInput = {
        topic: makeTopic(),
        dimensions: [makeDimension()],
        searchResults: [makeSearchResult()],
        reportId: "report-outline",
        globalOutline,
      };

      const result = await handler.execute(input, makeContext());

      expect(result[0].globalOutline).toBe(globalOutline);
    });

    it("sets globalOutline to null when not provided", async () => {
      const input: AssembleWriteInputsInput = {
        topic: makeTopic(),
        dimensions: [makeDimension()],
        searchResults: [makeSearchResult()],
        reportId: "report-no-outline",
      };

      const result = await handler.execute(input, makeContext());

      expect(result[0].globalOutline).toBeNull();
    });
  });

  // -------------------------------------------------------------------------
  // validate
  // -------------------------------------------------------------------------

  describe("validate", () => {
    it("returns true for a valid non-empty output", async () => {
      const topic = makeTopic();
      const dim = makeDimension();
      const output = [
        {
          topic,
          dimension: dim,
          searchResult: makeSearchResult(),
          globalOutline: null,
          allDimensions: [{ name: dim.name, description: dim.description }],
          reportId: "report-123",
        },
      ];

      const valid = await handler.validate(output, makeContext());

      expect(valid).toBe(true);
    });

    it("returns false for empty array", async () => {
      const valid = await handler.validate([], makeContext());
      expect(valid).toBe(false);
    });

    it("returns false for non-array input", async () => {
      const valid = await handler.validate(null as any, makeContext());
      expect(valid).toBe(false);
    });

    it("returns false when any item is missing topic", async () => {
      const output = [
        {
          topic: undefined,
          dimension: makeDimension(),
          searchResult: makeSearchResult(),
          globalOutline: null,
          allDimensions: [],
          reportId: "report-123",
        },
      ] as any;

      const valid = await handler.validate(output, makeContext());
      expect(valid).toBe(false);
    });

    it("returns false when any item is missing reportId", async () => {
      const output = [
        {
          topic: makeTopic(),
          dimension: makeDimension(),
          searchResult: makeSearchResult(),
          globalOutline: null,
          allDimensions: [],
          reportId: "",
        },
      ] as any;

      const valid = await handler.validate(output, makeContext());
      expect(valid).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // onError
  // -------------------------------------------------------------------------

  describe("onError", () => {
    it("returns 'abort' for any error", async () => {
      const result = await handler.onError(
        new Error("unexpected failure"),
        makeContext(),
      );
      expect(result).toBe("abort");
    });
  });
});
