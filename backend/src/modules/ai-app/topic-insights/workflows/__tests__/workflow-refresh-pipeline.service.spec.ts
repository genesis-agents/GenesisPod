/**
 * WorkflowRefreshPipelineService unit tests
 *
 * Verifies: happy-path result mapping, rejected fallback, empty-results exception,
 * search input preparation, and step event logging.
 */

import { ServiceUnavailableException } from "@nestjs/common";
import { WorkflowRefreshPipelineService } from "../workflow-refresh-pipeline.service";
import type { ExecutionContext } from "@/modules/ai-engine/facade";
import type { ResearchTopic, TopicDimension } from "@prisma/client";
import type { AgentAssignment } from "../../types/leader.types";
import type { DimensionAnalysisResult } from "../../types/research.types";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeTopic(overrides: Partial<ResearchTopic> = {}): ResearchTopic {
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
    ...overrides,
  } as ResearchTopic;
}

function makeDimension(
  id: string,
  name: string,
  overrides: Partial<TopicDimension> = {},
): TopicDimension {
  return {
    id,
    topicId: "topic-1",
    name,
    description: null,
    status: "PENDING" as any,
    searchQueries: [],
    searchSources: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
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
    evidenceUsed: 2,
    confidenceLevel: "medium",
    detailedContent: "Detailed analysis",
  };
}

function makeAbortSignal(): AbortSignal {
  return new AbortController().signal;
}

/** Build a mock async generator from events array */
async function* makeEventStream(events: Array<{ type: string; stepId?: string }>) {
  for (const event of events) {
    yield event;
  }
}

// ---------------------------------------------------------------------------
// Mock DAGExecutor
// ---------------------------------------------------------------------------

const mockDagExecutor = {
  execute: jest.fn(),
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("WorkflowRefreshPipelineService", () => {
  let service: WorkflowRefreshPipelineService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new WorkflowRefreshPipelineService(mockDagExecutor as any);
  });

  // -------------------------------------------------------------------------
  // Happy path
  // -------------------------------------------------------------------------

  describe("happy path", () => {
    it("returns fulfilled results for dimensions with writeResults", async () => {
      const dim1 = makeDimension("dim-1", "技术趋势");
      const dim2 = makeDimension("dim-2", "市场分析");
      const analysis1 = makeAnalysisResult("dim-1");
      const analysis2 = makeAnalysisResult("dim-2");

      mockDagExecutor.execute.mockImplementation(
        (_workflow: unknown, ctx: ExecutionContext) => {
          // Simulate DAG completing and writing results to state
          (ctx.state as any).searchResults = [
            { dimensionId: "dim-1", dimensionName: "技术趋势" },
            { dimensionId: "dim-2", dimensionName: "市场分析" },
          ];
          (ctx.state as any).writeResults = [
            { dimensionId: "dim-1", analysisResult: analysis1, evidenceIds: ["e1"] },
            { dimensionId: "dim-2", analysisResult: analysis2, evidenceIds: ["e2", "e3"] },
          ];

          return makeEventStream([
            { type: "step_completed", stepId: "parallel-search" },
            { type: "step_completed", stepId: "global-outline" },
            { type: "step_completed", stepId: "parallel-write" },
          ]);
        },
      );

      const result = await service.execute(
        makeTopic(),
        [dim1, dim2],
        "report-1",
        makeAbortSignal(),
      );

      expect(result.results).toHaveLength(2);

      const r1 = result.results[0];
      expect(r1.status).toBe("fulfilled");
      if (r1.status === "fulfilled") {
        expect(r1.value.dimensionId).toBe("dim-1");
        expect(r1.value.analysisResult).toBe(analysis1);
        expect(r1.value.evidenceIds).toEqual(["e1"]);
      }

      const r2 = result.results[1];
      expect(r2.status).toBe("fulfilled");
      if (r2.status === "fulfilled") {
        expect(r2.value.dimensionId).toBe("dim-2");
      }
    });

    it("returns rejected results for dimensions without writeResults", async () => {
      const dim1 = makeDimension("dim-1", "技术趋势");
      const dim2 = makeDimension("dim-2", "市场分析");
      const analysis1 = makeAnalysisResult("dim-1");

      mockDagExecutor.execute.mockImplementation(
        (_workflow: unknown, ctx: ExecutionContext) => {
          (ctx.state as any).searchResults = [
            { dimensionId: "dim-1", dimensionName: "技术趋势" },
          ];
          // Only dim-1 has a write result; dim-2 failed/was skipped
          (ctx.state as any).writeResults = [
            { dimensionId: "dim-1", analysisResult: analysis1, evidenceIds: [] },
          ];

          return makeEventStream([
            { type: "step_completed", stepId: "parallel-search" },
            { type: "step_failed", stepId: "parallel-write" },
          ]);
        },
      );

      const result = await service.execute(
        makeTopic(),
        [dim1, dim2],
        "report-1",
        makeAbortSignal(),
      );

      const r1 = result.results[0];
      expect(r1.status).toBe("fulfilled");

      const r2 = result.results[1];
      expect(r2.status).toBe("rejected");
      if (r2.status === "rejected") {
        expect(r2.reason).toBeInstanceOf(Error);
        expect((r2.reason as Error).message).toContain("市场分析");
      }
    });
  });

  // -------------------------------------------------------------------------
  // Exception when all dimensions fail
  // -------------------------------------------------------------------------

  describe("when all dimensions fail", () => {
    it("throws ServiceUnavailableException when both searchResults and writeResults are empty", async () => {
      mockDagExecutor.execute.mockImplementation(
        (_workflow: unknown, ctx: ExecutionContext) => {
          (ctx.state as any).searchResults = [];
          (ctx.state as any).writeResults = [];

          return makeEventStream([
            { type: "step_failed", stepId: "parallel-search" },
          ]);
        },
      );

      const dim1 = makeDimension("dim-1", "技术趋势");

      await expect(
        service.execute(makeTopic(), [dim1], "report-1", makeAbortSignal()),
      ).rejects.toThrow(ServiceUnavailableException);
    });

    it("throws with the correct message", async () => {
      mockDagExecutor.execute.mockImplementation(
        (_workflow: unknown, ctx: ExecutionContext) => {
          // state.searchResults and state.writeResults default to undefined → treated as []
          return makeEventStream([]);
        },
      );

      const dim1 = makeDimension("dim-1", "技术趋势");

      await expect(
        service.execute(makeTopic(), [dim1], "report-1", makeAbortSignal()),
      ).rejects.toThrow("All dimension processing failed");
    });
  });

  // -------------------------------------------------------------------------
  // Search input preparation
  // -------------------------------------------------------------------------

  describe("search input preparation", () => {
    it("maps agentAssignments to searchInputs by dimension id", async () => {
      const dim1 = makeDimension("dim-1", "技术趋势");

      const assignments: AgentAssignment[] = [
        {
          agentId: "agent-1",
          agentType: "dimension_researcher",
          role: "researcher",
          assignedDimensions: ["dim-1"],
          modelId: "gpt-4o",
          tools: ["web-search"],
          skills: ["trend_analysis"],
        },
      ];

      let capturedContext: ExecutionContext | null = null;

      mockDagExecutor.execute.mockImplementation(
        (_workflow: unknown, ctx: ExecutionContext) => {
          capturedContext = ctx;
          (ctx.state as any).searchResults = [{ dimensionId: "dim-1", dimensionName: "技术趋势" }];
          (ctx.state as any).writeResults = [
            { dimensionId: "dim-1", analysisResult: makeAnalysisResult("dim-1"), evidenceIds: [] },
          ];
          return makeEventStream([{ type: "step_completed", stepId: "parallel-search" }]);
        },
      );

      await service.execute(
        makeTopic(),
        [dim1],
        "report-1",
        makeAbortSignal(),
        assignments,
      );

      expect(capturedContext).not.toBeNull();
      const state = capturedContext!.state as any;
      const searchInputs = state.searchInputs as Array<{
        dimension: TopicDimension;
        modelId?: string;
        assignedTools?: string[];
        assignedSkills?: string[];
      }>;

      expect(searchInputs).toHaveLength(1);
      expect(searchInputs[0].dimension.id).toBe("dim-1");
      expect(searchInputs[0].modelId).toBe("gpt-4o");
      expect(searchInputs[0].assignedTools).toEqual(["web-search"]);
      expect(searchInputs[0].assignedSkills).toEqual(["trend_analysis"]);
    });

    it("maps agentAssignments to searchInputs by dimension name", async () => {
      const dim1 = makeDimension("dim-1", "技术趋势");

      const assignments: AgentAssignment[] = [
        {
          agentId: "agent-1",
          agentType: "dimension_researcher",
          role: "researcher",
          assignedDimensions: ["技术趋势"], // matched by name
          modelId: "claude-3",
          tools: [],
          skills: [],
        },
      ];

      let capturedContext: ExecutionContext | null = null;

      mockDagExecutor.execute.mockImplementation(
        (_workflow: unknown, ctx: ExecutionContext) => {
          capturedContext = ctx;
          (ctx.state as any).searchResults = [{ dimensionId: "dim-1", dimensionName: "技术趋势" }];
          (ctx.state as any).writeResults = [
            { dimensionId: "dim-1", analysisResult: makeAnalysisResult("dim-1"), evidenceIds: [] },
          ];
          return makeEventStream([]);
        },
      );

      await service.execute(
        makeTopic(),
        [dim1],
        "report-1",
        makeAbortSignal(),
        assignments,
      );

      const state = capturedContext!.state as any;
      const searchInputs = state.searchInputs as Array<{ modelId?: string }>;
      expect(searchInputs[0].modelId).toBe("claude-3");
    });

    it("falls back to dimension.searchSources as assignedTools when assignment has no tools", async () => {
      const dim1 = makeDimension("dim-1", "技术趋势", {
        searchSources: ["web", "academic"] as any,
      });

      // Assignment with no tools
      const assignments: AgentAssignment[] = [
        {
          agentId: "agent-1",
          agentType: "dimension_researcher",
          role: "researcher",
          assignedDimensions: ["dim-1"],
          tools: [], // empty tools
        },
      ];

      let capturedContext: ExecutionContext | null = null;

      mockDagExecutor.execute.mockImplementation(
        (_workflow: unknown, ctx: ExecutionContext) => {
          capturedContext = ctx;
          (ctx.state as any).searchResults = [{ dimensionId: "dim-1", dimensionName: "技术趋势" }];
          (ctx.state as any).writeResults = [
            { dimensionId: "dim-1", analysisResult: makeAnalysisResult("dim-1"), evidenceIds: [] },
          ];
          return makeEventStream([]);
        },
      );

      await service.execute(
        makeTopic(),
        [dim1],
        "report-1",
        makeAbortSignal(),
        assignments,
      );

      const state = capturedContext!.state as any;
      const searchInputs = state.searchInputs as Array<{ assignedTools?: string[] }>;
      expect(searchInputs[0].assignedTools).toEqual(["web", "academic"]);
    });

    it("includes topic, dimensions, reportId, agentAssignments, depthConfig in state", async () => {
      const dim1 = makeDimension("dim-1", "技术趋势");
      const topic = makeTopic();
      const depthConfig = { maxRounds: 3, searchDepth: "deep" as any };

      let capturedContext: ExecutionContext | null = null;

      mockDagExecutor.execute.mockImplementation(
        (_workflow: unknown, ctx: ExecutionContext) => {
          capturedContext = ctx;
          (ctx.state as any).searchResults = [{ dimensionId: "dim-1" }];
          (ctx.state as any).writeResults = [
            { dimensionId: "dim-1", analysisResult: makeAnalysisResult("dim-1"), evidenceIds: [] },
          ];
          return makeEventStream([]);
        },
      );

      await service.execute(
        topic,
        [dim1],
        "report-99",
        makeAbortSignal(),
        [],
        depthConfig,
      );

      const state = capturedContext!.state as any;
      expect(state.topic).toBeDefined();
      expect(state.reportId).toBe("report-99");
      expect(state.dimensions).toHaveLength(1);
      expect(state.depthConfig).toBe(depthConfig);
    });
  });

  // -------------------------------------------------------------------------
  // Event logging
  // -------------------------------------------------------------------------

  describe("event logging", () => {
    it("consumes all events from the generator without throwing", async () => {
      const dim1 = makeDimension("dim-1", "技术趋势");

      mockDagExecutor.execute.mockImplementation(
        (_workflow: unknown, ctx: ExecutionContext) => {
          (ctx.state as any).searchResults = [{ dimensionId: "dim-1" }];
          (ctx.state as any).writeResults = [
            { dimensionId: "dim-1", analysisResult: makeAnalysisResult("dim-1"), evidenceIds: [] },
          ];

          return makeEventStream([
            { type: "step_completed", stepId: "parallel-search" },
            { type: "step_completed", stepId: "global-outline" },
            { type: "step_failed", stepId: "quality-review" },
            { type: "step_completed", stepId: "parallel-write" },
            { type: "unknown-event-type" }, // should not throw
          ]);
        },
      );

      // Should complete without error
      await expect(
        service.execute(makeTopic(), [dim1], "report-1", makeAbortSignal()),
      ).resolves.toBeDefined();
    });

    it("passes AbortSignal to execution context", async () => {
      const dim1 = makeDimension("dim-1", "技术趋势");
      const controller = new AbortController();
      let capturedContext: ExecutionContext | null = null;

      mockDagExecutor.execute.mockImplementation(
        (_workflow: unknown, ctx: ExecutionContext) => {
          capturedContext = ctx;
          (ctx.state as any).searchResults = [{ dimensionId: "dim-1" }];
          (ctx.state as any).writeResults = [
            { dimensionId: "dim-1", analysisResult: makeAnalysisResult("dim-1"), evidenceIds: [] },
          ];
          return makeEventStream([]);
        },
      );

      await service.execute(
        makeTopic(),
        [dim1],
        "report-1",
        controller.signal,
      );

      expect(capturedContext?.signal).toBe(controller.signal);
    });

    it("uses the REFRESH_PIPELINE_WORKFLOW id in executionContext", async () => {
      const dim1 = makeDimension("dim-1", "技术趋势");
      let capturedContext: ExecutionContext | null = null;

      mockDagExecutor.execute.mockImplementation(
        (_workflow: unknown, ctx: ExecutionContext) => {
          capturedContext = ctx;
          (ctx.state as any).searchResults = [{ dimensionId: "dim-1" }];
          (ctx.state as any).writeResults = [
            { dimensionId: "dim-1", analysisResult: makeAnalysisResult("dim-1"), evidenceIds: [] },
          ];
          return makeEventStream([]);
        },
      );

      await service.execute(makeTopic(), [dim1], "report-1", makeAbortSignal());

      expect(capturedContext?.workflowId).toBe("ti:refresh-pipeline");
    });
  });
});
