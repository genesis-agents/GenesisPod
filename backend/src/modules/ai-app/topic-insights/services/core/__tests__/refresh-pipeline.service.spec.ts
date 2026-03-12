import { Test, TestingModule } from "@nestjs/testing";
import { ServiceUnavailableException } from "@nestjs/common";
import { EventEmitter2 } from "@nestjs/event-emitter";
import { RefreshPipelineService } from "../refresh-pipeline.service";
import { PrismaService } from "@/common/prisma/prisma.service";
import { DimensionMissionService } from "../../dimension/dimension-mission.service";
import { ResearchReviewerService } from "../../collaboration/research-reviewer.service";
import { ResearchCheckpointService } from "../../monitoring/research-checkpoint.service";
import { CritiqueRefineService } from "../../quality/critique-refine.service";
import { ResearchLeaderService } from "../research-leader.service";
import { RESEARCH_INTERNAL_EVENTS } from "../research-event-emitter.service";
import type { ResearchTopic, TopicDimension } from "@prisma/client";
import type { DimensionAnalysisResult } from "../../../types/research.types";
import type { OverallReviewResult } from "../../../types/collaboration.types";

// ---------------------------------------------------------------------------
// Mock factories
// ---------------------------------------------------------------------------

const mockPrisma = {
  topicDimension: {
    update: jest.fn(),
  },
  dimensionAnalysis: {
    findFirst: jest.fn(),
    update: jest.fn(),
  },
};

const mockEventEmitter = {
  emit: jest.fn(),
};

const mockDimensionMissionService = {
  executeSearchPhase: jest.fn(),
  executeWritingPhase: jest.fn(),
};

const mockResearchReviewerService = {
  reviewDimension: jest.fn(),
  reviewOverall: jest.fn(),
};

const mockResearchCheckpointService = {
  saveCheckpoint: jest.fn(),
};

const mockCritiqueRefineService = {
  runCritiqueRefineLoop: jest.fn(),
};

const mockResearchLeaderService = {
  planGlobalOutline: jest.fn(),
  planDimensionOutline: jest.fn(),
};

// ---------------------------------------------------------------------------
// Test fixtures
// ---------------------------------------------------------------------------

const makeTopic = (overrides: Partial<ResearchTopic> = {}): ResearchTopic =>
  ({
    id: "topic-1",
    name: "AI Test Topic",
    type: "TECHNOLOGY",
    description: "A test topic",
    language: "en",
    userId: "user-1",
    status: "ACTIVE",
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  }) as unknown as ResearchTopic;

const makeDimension = (
  id: string,
  name: string,
  overrides: Partial<TopicDimension> = {},
): TopicDimension =>
  ({
    id,
    name,
    description: `Description for ${name}`,
    topicId: "topic-1",
    sortOrder: 0,
    status: "PENDING",
    searchQueries: ["query1", "query2"],
    searchSources: ["web"],
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  }) as unknown as TopicDimension;

const makeSearchPhaseResult = (dimensionId: string, dimensionName: string) => ({
  dimensionId,
  dimensionName,
  enrichedResults: [],
  evidenceData: [],
  evidenceSummary: `Evidence for ${dimensionName}`,
  searchResultsRecord: {},
  temporalContext: {},
  figuresSummary: "",
  leaderContextSummary: "",
});

const makeOutline = () => ({
  intentUnderstanding: { summary: "test" },
  sections: [{ id: "s1", title: "Section 1" }],
  executionPlan: { parallelGroups: [], estimatedTotalWords: 1000 },
});

const makeAnalysisResult = (dimensionId: string): DimensionAnalysisResult => ({
  dimensionId,
  summary: "Test summary",
  keyFindings: [],
  trends: [],
  challenges: [],
  opportunities: [],
  evidenceUsed: 3,
  confidenceLevel: "medium",
  detailedContent: "Initial detailed content",
});

const makeDimensionMissionResult = (dimensionId: string, success = true) => ({
  success,
  dimensionId,
  analysisResult: success ? makeAnalysisResult(dimensionId) : undefined,
  evidenceIds: ["ev-1", "ev-2"],
  error: success ? undefined : "Writing failed",
  extractedClaims: [],
});

const makeAbortSignal = (aborted = false): AbortSignal =>
  ({ aborted } as AbortSignal);

// ---------------------------------------------------------------------------
// Suite
// ---------------------------------------------------------------------------

describe("RefreshPipelineService", () => {
  let service: RefreshPipelineService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RefreshPipelineService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: EventEmitter2, useValue: mockEventEmitter },
        { provide: DimensionMissionService, useValue: mockDimensionMissionService },
        { provide: ResearchReviewerService, useValue: mockResearchReviewerService },
        { provide: ResearchCheckpointService, useValue: mockResearchCheckpointService },
        { provide: CritiqueRefineService, useValue: mockCritiqueRefineService },
        { provide: ResearchLeaderService, useValue: mockResearchLeaderService },
      ],
    }).compile();

    service = module.get<RefreshPipelineService>(RefreshPipelineService);
  });

  afterEach(() => jest.clearAllMocks());

  // =========================================================================
  // researchDimensionsInParallel
  // =========================================================================

  describe("researchDimensionsInParallel", () => {
    const topic = makeTopic();
    const reportId = "report-1";

    describe("happy path – single dimension", () => {
      it("returns fulfilled result when both phases succeed", async () => {
        const dim = makeDimension("dim-1", "Market Size");
        const searchResult = makeSearchPhaseResult("dim-1", "Market Size");
        const outline = makeOutline();
        const missionResult = makeDimensionMissionResult("dim-1");

        mockDimensionMissionService.executeSearchPhase.mockResolvedValue(searchResult);
        mockResearchLeaderService.planGlobalOutline.mockResolvedValue({
          dimensions: [
            { dimensionId: "dim-1", dimensionName: "Market Size", outline, crossDimensionNotes: "" },
          ],
          globalThemes: [],
          deduplicationRules: [],
        });
        mockDimensionMissionService.executeWritingPhase.mockResolvedValue(missionResult);
        mockResearchCheckpointService.saveCheckpoint.mockResolvedValue(undefined);

        const signal = makeAbortSignal(false);
        const { results } = await service.researchDimensionsInParallel(
          topic,
          [dim],
          reportId,
          signal,
        );

        expect(results).toHaveLength(1);
        expect(results[0].status).toBe("fulfilled");
        if (results[0].status === "fulfilled") {
          expect(results[0].value.dimensionId).toBe("dim-1");
          expect(results[0].value.evidenceIds).toEqual(["ev-1", "ev-2"]);
        }
      });

      it("emits progress events at each phase transition", async () => {
        const dim = makeDimension("dim-1", "Market Size");
        const searchResult = makeSearchPhaseResult("dim-1", "Market Size");
        const outline = makeOutline();
        const missionResult = makeDimensionMissionResult("dim-1");

        mockDimensionMissionService.executeSearchPhase.mockResolvedValue(searchResult);
        mockResearchLeaderService.planGlobalOutline.mockResolvedValue({
          dimensions: [{ dimensionId: "dim-1", dimensionName: "Market Size", outline, crossDimensionNotes: "" }],
          globalThemes: [],
          deduplicationRules: [],
        });
        mockDimensionMissionService.executeWritingPhase.mockResolvedValue(missionResult);
        mockResearchCheckpointService.saveCheckpoint.mockResolvedValue(undefined);

        const signal = makeAbortSignal(false);
        await service.researchDimensionsInParallel(topic, [dim], reportId, signal);

        expect(mockEventEmitter.emit).toHaveBeenCalledWith(
          RESEARCH_INTERNAL_EVENTS.TOPIC_RESEARCH_PROGRESS,
          expect.objectContaining({ topicId: topic.id, reportId, phase: "researching" }),
        );
        // At least the initial progress and post-writing progress should have been emitted
        expect(mockEventEmitter.emit.mock.calls.length).toBeGreaterThanOrEqual(3);
      });

      it("saves Phase 1 and Phase 3 checkpoints on success", async () => {
        const dim = makeDimension("dim-1", "Market Size");
        const searchResult = makeSearchPhaseResult("dim-1", "Market Size");
        const outline = makeOutline();
        const missionResult = makeDimensionMissionResult("dim-1");

        mockDimensionMissionService.executeSearchPhase.mockResolvedValue(searchResult);
        mockResearchLeaderService.planGlobalOutline.mockResolvedValue({
          dimensions: [{ dimensionId: "dim-1", dimensionName: "Market Size", outline, crossDimensionNotes: "" }],
          globalThemes: [],
          deduplicationRules: [],
        });
        mockDimensionMissionService.executeWritingPhase.mockResolvedValue(missionResult);
        mockResearchCheckpointService.saveCheckpoint.mockResolvedValue(undefined);

        const signal = makeAbortSignal(false);
        await service.researchDimensionsInParallel(topic, [dim], reportId, signal);

        expect(mockResearchCheckpointService.saveCheckpoint).toHaveBeenCalledWith(
          topic.id,
          expect.objectContaining({ phase: "L2_knowledge" }),
        );
        expect(mockResearchCheckpointService.saveCheckpoint).toHaveBeenCalledWith(
          topic.id,
          expect.objectContaining({ phase: "L4_writing" }),
        );
      });

      it("uses global outline when planGlobalOutline returns matching dimension", async () => {
        const dim = makeDimension("dim-1", "Market Size");
        const searchResult = makeSearchPhaseResult("dim-1", "Market Size");
        const globalOutline = makeOutline();
        const missionResult = makeDimensionMissionResult("dim-1");

        mockDimensionMissionService.executeSearchPhase.mockResolvedValue(searchResult);
        mockResearchLeaderService.planGlobalOutline.mockResolvedValue({
          dimensions: [{ dimensionId: "dim-1", dimensionName: "Market Size", outline: globalOutline, crossDimensionNotes: "" }],
          globalThemes: [],
          deduplicationRules: [],
        });
        mockDimensionMissionService.executeWritingPhase.mockResolvedValue(missionResult);
        mockResearchCheckpointService.saveCheckpoint.mockResolvedValue(undefined);

        const signal = makeAbortSignal(false);
        await service.researchDimensionsInParallel(topic, [dim], reportId, signal);

        // planDimensionOutline should NOT be called because global outline matched
        expect(mockResearchLeaderService.planDimensionOutline).not.toHaveBeenCalled();
        expect(mockDimensionMissionService.executeWritingPhase).toHaveBeenCalledWith(
          expect.anything(),
          expect.anything(),
          expect.anything(),
          globalOutline,
          reportId,
          undefined,
          undefined,
          undefined,
          undefined,
          undefined,
          undefined,
          undefined,
        );
      });

      it("falls back to planDimensionOutline when global outline has no match", async () => {
        const dim = makeDimension("dim-1", "Market Size");
        const searchResult = makeSearchPhaseResult("dim-1", "Market Size");
        const fallbackOutline = makeOutline();
        const missionResult = makeDimensionMissionResult("dim-1");

        mockDimensionMissionService.executeSearchPhase.mockResolvedValue(searchResult);
        // Global outline returns dimensions for a different id
        mockResearchLeaderService.planGlobalOutline.mockResolvedValue({
          dimensions: [{ dimensionId: "dim-other", dimensionName: "Other", outline: makeOutline(), crossDimensionNotes: "" }],
          globalThemes: [],
          deduplicationRules: [],
        });
        mockResearchLeaderService.planDimensionOutline.mockResolvedValue(fallbackOutline);
        mockDimensionMissionService.executeWritingPhase.mockResolvedValue(missionResult);
        mockResearchCheckpointService.saveCheckpoint.mockResolvedValue(undefined);

        const signal = makeAbortSignal(false);
        await service.researchDimensionsInParallel(topic, [dim], reportId, signal);

        expect(mockResearchLeaderService.planDimensionOutline).toHaveBeenCalledTimes(1);
        // Verify the fallback outline is passed as the 4th argument to executeWritingPhase
        const writeCall = mockDimensionMissionService.executeWritingPhase.mock.calls[0];
        expect(writeCall[3]).toBe(fallbackOutline);
      });
    });

    describe("happy path – multiple dimensions", () => {
      it("executes all dimensions in parallel and returns all results", async () => {
        const dims = [
          makeDimension("dim-1", "Market Size"),
          makeDimension("dim-2", "Competition"),
          makeDimension("dim-3", "Technology"),
        ];

        mockDimensionMissionService.executeSearchPhase.mockImplementation(
          (_topic, dimension) =>
            Promise.resolve(makeSearchPhaseResult(dimension.id, dimension.name)),
        );
        mockResearchLeaderService.planGlobalOutline.mockResolvedValue({
          dimensions: dims.map((d) => ({
            dimensionId: d.id,
            dimensionName: d.name,
            outline: makeOutline(),
            crossDimensionNotes: "",
          })),
          globalThemes: [],
          deduplicationRules: [],
        });
        mockDimensionMissionService.executeWritingPhase.mockImplementation(
          (_topic, dimension) =>
            Promise.resolve(makeDimensionMissionResult(dimension.id)),
        );
        mockResearchCheckpointService.saveCheckpoint.mockResolvedValue(undefined);

        const signal = makeAbortSignal(false);
        const { results } = await service.researchDimensionsInParallel(
          topic,
          dims,
          reportId,
          signal,
          [],
          undefined,
          3,
        );

        expect(results).toHaveLength(3);
        const fulfilled = results.filter((r) => r.status === "fulfilled");
        expect(fulfilled).toHaveLength(3);
      });

      it("respects custom parallelism limit", async () => {
        const dims = [
          makeDimension("dim-1", "A"),
          makeDimension("dim-2", "B"),
          makeDimension("dim-3", "C"),
          makeDimension("dim-4", "D"),
        ];

        const callOrder: string[] = [];
        mockDimensionMissionService.executeSearchPhase.mockImplementation(
          async (_topic, dimension) => {
            callOrder.push(dimension.id);
            return makeSearchPhaseResult(dimension.id, dimension.name);
          },
        );
        mockResearchLeaderService.planGlobalOutline.mockResolvedValue({
          dimensions: dims.map((d) => ({
            dimensionId: d.id,
            dimensionName: d.name,
            outline: makeOutline(),
            crossDimensionNotes: "",
          })),
          globalThemes: [],
          deduplicationRules: [],
        });
        mockDimensionMissionService.executeWritingPhase.mockImplementation(
          (_topic, dimension) =>
            Promise.resolve(makeDimensionMissionResult(dimension.id)),
        );
        mockResearchCheckpointService.saveCheckpoint.mockResolvedValue(undefined);

        const signal = makeAbortSignal(false);
        await service.researchDimensionsInParallel(
          topic,
          dims,
          reportId,
          signal,
          [],
          undefined,
          2, // parallelism = 2
        );

        // All 4 dimensions eventually processed
        expect(callOrder).toHaveLength(4);
      });

      it("returns researchDesign from global outline", async () => {
        const dim = makeDimension("dim-1", "Market Size");
        const researchDesign = { approach: "mixed-methods", rationale: "test" };

        mockDimensionMissionService.executeSearchPhase.mockResolvedValue(
          makeSearchPhaseResult("dim-1", "Market Size"),
        );
        mockResearchLeaderService.planGlobalOutline.mockResolvedValue({
          dimensions: [{ dimensionId: "dim-1", dimensionName: "Market Size", outline: makeOutline(), crossDimensionNotes: "" }],
          globalThemes: [],
          deduplicationRules: [],
          researchDesign,
        });
        mockDimensionMissionService.executeWritingPhase.mockResolvedValue(
          makeDimensionMissionResult("dim-1"),
        );
        mockResearchCheckpointService.saveCheckpoint.mockResolvedValue(undefined);

        const signal = makeAbortSignal(false);
        const { researchDesign: extracted } =
          await service.researchDimensionsInParallel(topic, [dim], reportId, signal);

        expect(extracted).toEqual(researchDesign);
      });
    });

    describe("AbortSignal cancellation", () => {
      it("throws when signal is already aborted before search starts", async () => {
        const dim = makeDimension("dim-1", "Market Size");
        const signal = makeAbortSignal(true);

        await expect(
          service.researchDimensionsInParallel(topic, [dim], reportId, signal),
        ).rejects.toThrow();

        // executeSearchPhase should not be called because the abort check is first
        expect(mockDimensionMissionService.executeSearchPhase).not.toHaveBeenCalled();
      });
    });

    describe("dimension failure – non-fatal", () => {
      it("marks failed search dimension as FAILED and continues with remaining", async () => {
        const dim1 = makeDimension("dim-1", "Market Size");
        const dim2 = makeDimension("dim-2", "Competition");

        mockDimensionMissionService.executeSearchPhase.mockImplementation(
          (_topic, dimension) => {
            if (dimension.id === "dim-1") {
              return Promise.reject(new Error("Search network error"));
            }
            return Promise.resolve(makeSearchPhaseResult(dimension.id, dimension.name));
          },
        );
        mockPrisma.topicDimension.update.mockResolvedValue({});
        mockResearchLeaderService.planGlobalOutline.mockResolvedValue({
          dimensions: [{ dimensionId: "dim-2", dimensionName: "Competition", outline: makeOutline(), crossDimensionNotes: "" }],
          globalThemes: [],
          deduplicationRules: [],
        });
        mockDimensionMissionService.executeWritingPhase.mockResolvedValue(
          makeDimensionMissionResult("dim-2"),
        );
        mockResearchCheckpointService.saveCheckpoint.mockResolvedValue(undefined);

        const signal = makeAbortSignal(false);
        const { results } = await service.researchDimensionsInParallel(
          topic,
          [dim1, dim2],
          reportId,
          signal,
        );

        // Only dim-2 writing result
        expect(results).toHaveLength(1);
        expect(results[0].status).toBe("fulfilled");
        if (results[0].status === "fulfilled") {
          expect(results[0].value.dimensionId).toBe("dim-2");
        }

        // dim-1 should be marked FAILED via prisma
        expect(mockPrisma.topicDimension.update).toHaveBeenCalledWith({
          where: { id: "dim-1" },
          data: { status: "FAILED" },
        });
      });

      it("marks failed writing dimension as FAILED and returns partial results", async () => {
        const dim1 = makeDimension("dim-1", "Market Size");
        const dim2 = makeDimension("dim-2", "Competition");

        mockDimensionMissionService.executeSearchPhase.mockImplementation(
          (_topic, dimension) =>
            Promise.resolve(makeSearchPhaseResult(dimension.id, dimension.name)),
        );
        mockResearchLeaderService.planGlobalOutline.mockResolvedValue({
          dimensions: [
            { dimensionId: "dim-1", dimensionName: "Market Size", outline: makeOutline(), crossDimensionNotes: "" },
            { dimensionId: "dim-2", dimensionName: "Competition", outline: makeOutline(), crossDimensionNotes: "" },
          ],
          globalThemes: [],
          deduplicationRules: [],
        });
        mockDimensionMissionService.executeWritingPhase.mockImplementation(
          (_topic, dimension) => {
            if (dimension.id === "dim-1") {
              return Promise.reject(new Error("Writing LLM timeout"));
            }
            return Promise.resolve(makeDimensionMissionResult(dimension.id));
          },
        );
        mockPrisma.topicDimension.update.mockResolvedValue({});
        mockResearchCheckpointService.saveCheckpoint.mockResolvedValue(undefined);

        const signal = makeAbortSignal(false);
        const { results } = await service.researchDimensionsInParallel(
          topic,
          [dim1, dim2],
          reportId,
          signal,
        );

        expect(results).toHaveLength(2);

        const rejected = results.find((r) => r.status === "rejected");
        const fulfilled = results.find((r) => r.status === "fulfilled");
        expect(rejected).toBeDefined();
        expect(fulfilled).toBeDefined();
        if (fulfilled?.status === "fulfilled") {
          expect(fulfilled.value.dimensionId).toBe("dim-2");
        }

        // dim-1 marked FAILED
        expect(mockPrisma.topicDimension.update).toHaveBeenCalledWith({
          where: { id: "dim-1" },
          data: { status: "FAILED" },
        });
      });

      it("throws ServiceUnavailableException when ALL searches fail", async () => {
        const dim1 = makeDimension("dim-1", "Market Size");
        const dim2 = makeDimension("dim-2", "Competition");

        mockDimensionMissionService.executeSearchPhase.mockRejectedValue(
          new Error("All searches down"),
        );
        mockPrisma.topicDimension.update.mockResolvedValue({});

        const signal = makeAbortSignal(false);
        await expect(
          service.researchDimensionsInParallel(topic, [dim1, dim2], reportId, signal),
        ).rejects.toThrow(ServiceUnavailableException);
      });

      it("checkpoint save failure is non-fatal", async () => {
        const dim = makeDimension("dim-1", "Market Size");

        mockDimensionMissionService.executeSearchPhase.mockResolvedValue(
          makeSearchPhaseResult("dim-1", "Market Size"),
        );
        mockResearchLeaderService.planGlobalOutline.mockResolvedValue({
          dimensions: [{ dimensionId: "dim-1", dimensionName: "Market Size", outline: makeOutline(), crossDimensionNotes: "" }],
          globalThemes: [],
          deduplicationRules: [],
        });
        mockDimensionMissionService.executeWritingPhase.mockResolvedValue(
          makeDimensionMissionResult("dim-1"),
        );
        mockResearchCheckpointService.saveCheckpoint.mockRejectedValue(
          new Error("Checkpoint store unavailable"),
        );

        const signal = makeAbortSignal(false);
        // Should not throw
        await expect(
          service.researchDimensionsInParallel(topic, [dim], reportId, signal),
        ).resolves.toBeDefined();
      });

      it("prisma update failure when marking FAILED is non-fatal", async () => {
        const dim1 = makeDimension("dim-1", "Market Size");
        const dim2 = makeDimension("dim-2", "Competition");

        mockDimensionMissionService.executeSearchPhase.mockImplementation(
          (_topic, dimension) => {
            if (dimension.id === "dim-1") {
              return Promise.reject(new Error("Search error"));
            }
            return Promise.resolve(makeSearchPhaseResult(dimension.id, dimension.name));
          },
        );
        // prisma update also fails
        mockPrisma.topicDimension.update.mockRejectedValue(new Error("DB error"));
        mockResearchLeaderService.planGlobalOutline.mockResolvedValue({
          dimensions: [{ dimensionId: "dim-2", dimensionName: "Competition", outline: makeOutline(), crossDimensionNotes: "" }],
          globalThemes: [],
          deduplicationRules: [],
        });
        mockDimensionMissionService.executeWritingPhase.mockResolvedValue(
          makeDimensionMissionResult("dim-2"),
        );
        mockResearchCheckpointService.saveCheckpoint.mockResolvedValue(undefined);

        const signal = makeAbortSignal(false);
        // Should not throw despite prisma failure
        await expect(
          service.researchDimensionsInParallel(topic, [dim1, dim2], reportId, signal),
        ).resolves.toBeDefined();
      });
    });

    describe("Phase 2 fallback", () => {
      it("continues to Phase 3 without global outline when planGlobalOutline fails", async () => {
        const dim = makeDimension("dim-1", "Market Size");
        const fallbackOutline = makeOutline();

        mockDimensionMissionService.executeSearchPhase.mockResolvedValue(
          makeSearchPhaseResult("dim-1", "Market Size"),
        );
        mockResearchLeaderService.planGlobalOutline.mockRejectedValue(
          new Error("LLM rate limit"),
        );
        mockResearchLeaderService.planDimensionOutline.mockResolvedValue(fallbackOutline);
        mockDimensionMissionService.executeWritingPhase.mockResolvedValue(
          makeDimensionMissionResult("dim-1"),
        );
        mockResearchCheckpointService.saveCheckpoint.mockResolvedValue(undefined);

        const signal = makeAbortSignal(false);
        const { results } = await service.researchDimensionsInParallel(
          topic,
          [dim],
          reportId,
          signal,
        );

        expect(results).toHaveLength(1);
        expect(results[0].status).toBe("fulfilled");
        // Fallback local outline was used
        expect(mockResearchLeaderService.planDimensionOutline).toHaveBeenCalledTimes(1);
      });
    });

    describe("agentAssignments usage", () => {
      it("passes assigned tools from agentAssignments to executeSearchPhase", async () => {
        const dim = makeDimension("dim-1", "Market Size");
        const assignments = [
          {
            assignedDimensions: ["dim-1"],
            tools: ["web-search", "news"],
            skills: [],
            modelId: "model-xyz",
          },
        ];

        mockDimensionMissionService.executeSearchPhase.mockResolvedValue(
          makeSearchPhaseResult("dim-1", "Market Size"),
        );
        mockResearchLeaderService.planGlobalOutline.mockResolvedValue({
          dimensions: [{ dimensionId: "dim-1", dimensionName: "Market Size", outline: makeOutline(), crossDimensionNotes: "" }],
          globalThemes: [],
          deduplicationRules: [],
        });
        mockDimensionMissionService.executeWritingPhase.mockResolvedValue(
          makeDimensionMissionResult("dim-1"),
        );
        mockResearchCheckpointService.saveCheckpoint.mockResolvedValue(undefined);

        const signal = makeAbortSignal(false);
        await service.researchDimensionsInParallel(
          topic,
          [dim],
          reportId,
          signal,
          assignments,
        );

        expect(mockDimensionMissionService.executeSearchPhase).toHaveBeenCalledWith(
          topic,
          dim,
          undefined,
          "model-xyz",
          undefined,
          ["web-search", "news"],
          [],
        );
      });

      it("falls back to dimension.searchSources when agentAssignments has no tools", async () => {
        const dim = makeDimension("dim-1", "Market Size", {
          searchSources: ["academic", "news"] as unknown as TopicDimension["searchSources"],
        });

        mockDimensionMissionService.executeSearchPhase.mockResolvedValue(
          makeSearchPhaseResult("dim-1", "Market Size"),
        );
        mockResearchLeaderService.planGlobalOutline.mockResolvedValue({
          dimensions: [{ dimensionId: "dim-1", dimensionName: "Market Size", outline: makeOutline(), crossDimensionNotes: "" }],
          globalThemes: [],
          deduplicationRules: [],
        });
        mockDimensionMissionService.executeWritingPhase.mockResolvedValue(
          makeDimensionMissionResult("dim-1"),
        );
        mockResearchCheckpointService.saveCheckpoint.mockResolvedValue(undefined);

        const signal = makeAbortSignal(false);
        await service.researchDimensionsInParallel(
          topic,
          [dim],
          reportId,
          signal,
          [], // no assignments
        );

        expect(mockDimensionMissionService.executeSearchPhase).toHaveBeenCalledWith(
          topic,
          dim,
          undefined,
          undefined,
          undefined,
          ["academic", "news"],
          [],
        );
      });
    });
  });

  // =========================================================================
  // reviewResearchQuality
  // =========================================================================

  describe("reviewResearchQuality", () => {
    const topic = makeTopic();

    it("reviews each successful dimension and returns overall result", async () => {
      const dim1 = makeDimension("dim-1", "Market Size");
      const dim2 = makeDimension("dim-2", "Competition");

      const analysisResult1 = makeAnalysisResult("dim-1");
      const analysisResult2 = makeAnalysisResult("dim-2");

      const analysisResults: PromiseSettledResult<{
        dimensionId: string;
        analysisResult: DimensionAnalysisResult;
        evidenceIds: string[];
      }>[] = [
        { status: "fulfilled", value: { dimensionId: "dim-1", analysisResult: analysisResult1, evidenceIds: ["ev-1"] } },
        { status: "fulfilled", value: { dimensionId: "dim-2", analysisResult: analysisResult2, evidenceIds: ["ev-2", "ev-3"] } },
      ];

      const dimReview1 = { dimensionId: "dim-1", overallScore: 85 };
      const dimReview2 = { dimensionId: "dim-2", overallScore: 90 };
      const overallReview: OverallReviewResult = {
        topicId: "topic-1",
        topicName: "AI Test Topic",
        qualityLevel: "GOOD",
        overallScore: 87,
        dimensionReviews: [dimReview1, dimReview2] as OverallReviewResult["dimensionReviews"],
        crossDimensionIssues: [],
        coverageAnalysis: { coveredAspects: [], missingAspects: [], coverageScore: 90 },
        recommendations: [],
        needsReresearch: false,
        dimensionsToReresearch: [],
      };

      mockResearchReviewerService.reviewDimension
        .mockResolvedValueOnce(dimReview1)
        .mockResolvedValueOnce(dimReview2);
      mockResearchReviewerService.reviewOverall.mockResolvedValue(overallReview);

      const result = await service.reviewResearchQuality(
        topic,
        [dim1, dim2],
        analysisResults,
      );

      expect(mockResearchReviewerService.reviewDimension).toHaveBeenCalledTimes(2);
      expect(mockResearchReviewerService.reviewDimension).toHaveBeenCalledWith(
        topic,
        dim1,
        analysisResult1,
        1,
      );
      expect(mockResearchReviewerService.reviewDimension).toHaveBeenCalledWith(
        topic,
        dim2,
        analysisResult2,
        2,
      );
      expect(mockResearchReviewerService.reviewOverall).toHaveBeenCalledWith(
        topic,
        [dim1, dim2],
        [dimReview1, dimReview2],
      );
      expect(result).toBe(overallReview);
    });

    it("skips rejected analysis results when collecting for review", async () => {
      const dim1 = makeDimension("dim-1", "Market Size");
      const dim2 = makeDimension("dim-2", "Competition");

      const analysisResult2 = makeAnalysisResult("dim-2");

      const analysisResults: PromiseSettledResult<{
        dimensionId: string;
        analysisResult: DimensionAnalysisResult;
        evidenceIds: string[];
      }>[] = [
        { status: "rejected", reason: new Error("dim-1 failed") },
        { status: "fulfilled", value: { dimensionId: "dim-2", analysisResult: analysisResult2, evidenceIds: [] } },
      ];

      const dimReview2 = { dimensionId: "dim-2", overallScore: 80 };
      const overallReview: OverallReviewResult = {
        topicId: "topic-1",
        topicName: "AI Test Topic",
        qualityLevel: "ACCEPTABLE",
        overallScore: 80,
        dimensionReviews: [dimReview2] as OverallReviewResult["dimensionReviews"],
        crossDimensionIssues: [],
        coverageAnalysis: { coveredAspects: [], missingAspects: [], coverageScore: 70 },
        recommendations: [],
        needsReresearch: false,
        dimensionsToReresearch: [],
      };

      mockResearchReviewerService.reviewDimension.mockResolvedValue(dimReview2);
      mockResearchReviewerService.reviewOverall.mockResolvedValue(overallReview);

      const result = await service.reviewResearchQuality(
        topic,
        [dim1, dim2],
        analysisResults,
      );

      // Only dim-2 was reviewed (dim-1 was rejected)
      expect(mockResearchReviewerService.reviewDimension).toHaveBeenCalledTimes(1);
      expect(mockResearchReviewerService.reviewDimension).toHaveBeenCalledWith(
        topic,
        dim2,
        analysisResult2,
        0,
      );
      expect(result).toBe(overallReview);
    });

    it("handles empty analysis results array", async () => {
      const overallReview: OverallReviewResult = {
        topicId: "topic-1",
        topicName: "AI Test Topic",
        qualityLevel: "POOR",
        overallScore: 0,
        dimensionReviews: [],
        crossDimensionIssues: [],
        coverageAnalysis: { coveredAspects: [], missingAspects: [], coverageScore: 0 },
        recommendations: ["No data to review"],
        needsReresearch: true,
        dimensionsToReresearch: [],
      };

      mockResearchReviewerService.reviewOverall.mockResolvedValue(overallReview);

      const result = await service.reviewResearchQuality(topic, [], []);

      expect(mockResearchReviewerService.reviewDimension).not.toHaveBeenCalled();
      expect(result).toBe(overallReview);
    });

    it("skips analysis result when matching dimension is not in the dimensions list", async () => {
      const dim1 = makeDimension("dim-1", "Market Size");

      const analysisResults: PromiseSettledResult<{
        dimensionId: string;
        analysisResult: DimensionAnalysisResult;
        evidenceIds: string[];
      }>[] = [
        {
          status: "fulfilled",
          value: { dimensionId: "dim-orphan", analysisResult: makeAnalysisResult("dim-orphan"), evidenceIds: [] },
        },
      ];

      const overallReview: OverallReviewResult = {
        topicId: "topic-1",
        topicName: "AI Test Topic",
        qualityLevel: "ACCEPTABLE",
        overallScore: 70,
        dimensionReviews: [],
        crossDimensionIssues: [],
        coverageAnalysis: { coveredAspects: [], missingAspects: [], coverageScore: 60 },
        recommendations: [],
        needsReresearch: false,
        dimensionsToReresearch: [],
      };

      mockResearchReviewerService.reviewOverall.mockResolvedValue(overallReview);

      await service.reviewResearchQuality(topic, [dim1], analysisResults);

      // dim-orphan not in dimensions list, so reviewDimension not called
      expect(mockResearchReviewerService.reviewDimension).not.toHaveBeenCalled();
    });
  });

  // =========================================================================
  // reviseFailedDimensions
  // =========================================================================

  describe("reviseFailedDimensions", () => {
    const topic = makeTopic();
    const topicId = "topic-1";
    const reportId = "report-1";

    const makeReviewResult = (
      dimensionsToReresearch: string[],
      overrides: Partial<OverallReviewResult> = {},
    ): OverallReviewResult => ({
      topicId,
      topicName: "AI Test Topic",
      qualityLevel: "ACCEPTABLE",
      overallScore: 65,
      dimensionReviews: dimensionsToReresearch.map((id) => ({
        dimensionId: id,
        overallScore: 55,
        issues: [{ description: "Missing data" }],
        suggestions: ["Add more evidence"],
      })) as OverallReviewResult["dimensionReviews"],
      crossDimensionIssues: [],
      coverageAnalysis: { coveredAspects: [], missingAspects: [], coverageScore: 60 },
      recommendations: ["Improve coverage"],
      needsReresearch: dimensionsToReresearch.length > 0,
      dimensionsToReresearch,
      ...overrides,
    });

    it("does nothing when dimensionsToReresearch is empty", async () => {
      const dim = makeDimension("dim-1", "Market Size");
      const analysisResult = makeAnalysisResult("dim-1");
      const analysisResults: PromiseSettledResult<{
        dimensionId: string;
        analysisResult: DimensionAnalysisResult;
        evidenceIds: string[];
      }>[] = [
        { status: "fulfilled", value: { dimensionId: "dim-1", analysisResult, evidenceIds: [] } },
      ];

      await service.reviseFailedDimensions(
        topic,
        [dim],
        analysisResults,
        makeReviewResult([]),
        topicId,
        reportId,
      );

      expect(mockCritiqueRefineService.runCritiqueRefineLoop).not.toHaveBeenCalled();
    });

    it("runs critique-refine loop for each dimension in dimensionsToReresearch", async () => {
      const dim1 = makeDimension("dim-1", "Market Size");
      const dim2 = makeDimension("dim-2", "Competition");
      const analysisResult1 = makeAnalysisResult("dim-1");
      const analysisResult2 = makeAnalysisResult("dim-2");

      const analysisResults: PromiseSettledResult<{
        dimensionId: string;
        analysisResult: DimensionAnalysisResult;
        evidenceIds: string[];
      }>[] = [
        { status: "fulfilled", value: { dimensionId: "dim-1", analysisResult: analysisResult1, evidenceIds: [] } },
        { status: "fulfilled", value: { dimensionId: "dim-2", analysisResult: analysisResult2, evidenceIds: [] } },
      ];

      mockCritiqueRefineService.runCritiqueRefineLoop.mockResolvedValue({
        finalContent: "Revised content for dimension",
        totalChanges: 2,
        iterations: [{ iteration: 1 }],
      });

      mockPrisma.dimensionAnalysis.findFirst.mockResolvedValue({
        id: "analysis-1",
        dataPoints: {},
      });
      mockPrisma.dimensionAnalysis.update.mockResolvedValue({});

      await service.reviseFailedDimensions(
        topic,
        [dim1, dim2],
        analysisResults,
        makeReviewResult(["dim-1", "dim-2"]),
        topicId,
        reportId,
      );

      expect(mockCritiqueRefineService.runCritiqueRefineLoop).toHaveBeenCalledTimes(2);
    });

    it("updates analysisResult.detailedContent in memory when content changes", async () => {
      const dim = makeDimension("dim-1", "Market Size");
      const analysisResult = makeAnalysisResult("dim-1");
      analysisResult.detailedContent = "Old content";

      const analysisResults: PromiseSettledResult<{
        dimensionId: string;
        analysisResult: DimensionAnalysisResult;
        evidenceIds: string[];
      }>[] = [
        { status: "fulfilled", value: { dimensionId: "dim-1", analysisResult, evidenceIds: [] } },
      ];

      mockCritiqueRefineService.runCritiqueRefineLoop.mockResolvedValue({
        finalContent: "New revised content",
        totalChanges: 1,
        iterations: [{ iteration: 1 }],
      });
      mockPrisma.dimensionAnalysis.findFirst.mockResolvedValue({
        id: "analysis-1",
        dataPoints: { existingKey: "value" },
      });
      mockPrisma.dimensionAnalysis.update.mockResolvedValue({});

      await service.reviseFailedDimensions(
        topic,
        [dim],
        analysisResults,
        makeReviewResult(["dim-1"]),
        topicId,
        reportId,
      );

      // In-memory object should be mutated
      expect(analysisResult.detailedContent).toBe("New revised content");

      // DB should be updated with new content
      expect(mockPrisma.dimensionAnalysis.update).toHaveBeenCalledWith({
        where: { id: "analysis-1" },
        data: {
          dataPoints: expect.objectContaining({ detailedContent: "New revised content" }),
        },
      });
    });

    it("does not update DB when finalContent is unchanged", async () => {
      const dim = makeDimension("dim-1", "Market Size");
      const originalContent = "Unchanged content";
      const analysisResult = makeAnalysisResult("dim-1");
      analysisResult.detailedContent = originalContent;

      const analysisResults: PromiseSettledResult<{
        dimensionId: string;
        analysisResult: DimensionAnalysisResult;
        evidenceIds: string[];
      }>[] = [
        { status: "fulfilled", value: { dimensionId: "dim-1", analysisResult, evidenceIds: [] } },
      ];

      mockCritiqueRefineService.runCritiqueRefineLoop.mockResolvedValue({
        finalContent: originalContent, // Same as original
        totalChanges: 0,
        iterations: [{ iteration: 1 }],
      });

      await service.reviseFailedDimensions(
        topic,
        [dim],
        analysisResults,
        makeReviewResult(["dim-1"]),
        topicId,
        reportId,
      );

      expect(mockPrisma.dimensionAnalysis.update).not.toHaveBeenCalled();
    });

    it("skips dimension when analysisResult.detailedContent is missing", async () => {
      const dim = makeDimension("dim-1", "Market Size");
      const analysisResult = makeAnalysisResult("dim-1");
      analysisResult.detailedContent = ""; // falsy

      const analysisResults: PromiseSettledResult<{
        dimensionId: string;
        analysisResult: DimensionAnalysisResult;
        evidenceIds: string[];
      }>[] = [
        { status: "fulfilled", value: { dimensionId: "dim-1", analysisResult, evidenceIds: [] } },
      ];

      await service.reviseFailedDimensions(
        topic,
        [dim],
        analysisResults,
        makeReviewResult(["dim-1"]),
        topicId,
        reportId,
      );

      expect(mockCritiqueRefineService.runCritiqueRefineLoop).not.toHaveBeenCalled();
    });

    it("skips rejected analysis results", async () => {
      const dim = makeDimension("dim-1", "Market Size");

      const analysisResults: PromiseSettledResult<{
        dimensionId: string;
        analysisResult: DimensionAnalysisResult;
        evidenceIds: string[];
      }>[] = [
        { status: "rejected", reason: new Error("failed") },
      ];

      await service.reviseFailedDimensions(
        topic,
        [dim],
        analysisResults,
        makeReviewResult(["dim-1"]),
        topicId,
        reportId,
      );

      expect(mockCritiqueRefineService.runCritiqueRefineLoop).not.toHaveBeenCalled();
    });

    it("is non-fatal when critique-refine loop throws", async () => {
      const dim1 = makeDimension("dim-1", "Market Size");
      const dim2 = makeDimension("dim-2", "Competition");
      const analysisResult1 = makeAnalysisResult("dim-1");
      const analysisResult2 = makeAnalysisResult("dim-2");

      const analysisResults: PromiseSettledResult<{
        dimensionId: string;
        analysisResult: DimensionAnalysisResult;
        evidenceIds: string[];
      }>[] = [
        { status: "fulfilled", value: { dimensionId: "dim-1", analysisResult: analysisResult1, evidenceIds: [] } },
        { status: "fulfilled", value: { dimensionId: "dim-2", analysisResult: analysisResult2, evidenceIds: [] } },
      ];

      mockCritiqueRefineService.runCritiqueRefineLoop
        .mockRejectedValueOnce(new Error("LLM unavailable"))
        .mockResolvedValueOnce({
          finalContent: "Revised dim-2 content",
          totalChanges: 1,
          iterations: [{ iteration: 1 }],
        });

      mockPrisma.dimensionAnalysis.findFirst.mockResolvedValue({
        id: "analysis-2",
        dataPoints: {},
      });
      mockPrisma.dimensionAnalysis.update.mockResolvedValue({});

      // Should not throw
      await expect(
        service.reviseFailedDimensions(
          topic,
          [dim1, dim2],
          analysisResults,
          makeReviewResult(["dim-1", "dim-2"]),
          topicId,
          reportId,
        ),
      ).resolves.toBeUndefined();

      // dim-2 should still be revised despite dim-1 failure
      expect(mockPrisma.dimensionAnalysis.update).toHaveBeenCalledTimes(1);
    });

    it("uses fallback recommendations when no dimension-specific review found", async () => {
      const dim = makeDimension("dim-1", "Market Size");
      const analysisResult = makeAnalysisResult("dim-1");

      const analysisResults: PromiseSettledResult<{
        dimensionId: string;
        analysisResult: DimensionAnalysisResult;
        evidenceIds: string[];
      }>[] = [
        { status: "fulfilled", value: { dimensionId: "dim-1", analysisResult, evidenceIds: [] } },
      ];

      const reviewResult = makeReviewResult(["dim-1"]);
      // Override to have no dimension-specific reviews
      reviewResult.dimensionReviews = [];
      reviewResult.recommendations = ["General recommendation 1", "General recommendation 2"];

      mockCritiqueRefineService.runCritiqueRefineLoop.mockResolvedValue({
        finalContent: "Revised content",
        totalChanges: 1,
        iterations: [{ iteration: 1 }],
      });
      mockPrisma.dimensionAnalysis.findFirst.mockResolvedValue({
        id: "analysis-1",
        dataPoints: {},
      });
      mockPrisma.dimensionAnalysis.update.mockResolvedValue({});

      await service.reviseFailedDimensions(
        topic,
        [dim],
        analysisResults,
        reviewResult,
        topicId,
        reportId,
      );

      expect(mockCritiqueRefineService.runCritiqueRefineLoop).toHaveBeenCalledWith(
        expect.objectContaining({
          context: expect.objectContaining({
            qualityExpectation: expect.stringContaining("General recommendation 1"),
          }),
        }),
      );
    });

    it("emits reviewing progress event at start", async () => {
      const dim = makeDimension("dim-1", "Market Size");
      const analysisResult = makeAnalysisResult("dim-1");
      analysisResult.detailedContent = "";

      const analysisResults: PromiseSettledResult<{
        dimensionId: string;
        analysisResult: DimensionAnalysisResult;
        evidenceIds: string[];
      }>[] = [
        { status: "fulfilled", value: { dimensionId: "dim-1", analysisResult, evidenceIds: [] } },
      ];

      await service.reviseFailedDimensions(
        topic,
        [dim],
        analysisResults,
        makeReviewResult(["dim-1"]),
        topicId,
        reportId,
      );

      expect(mockEventEmitter.emit).toHaveBeenCalledWith(
        RESEARCH_INTERNAL_EVENTS.TOPIC_RESEARCH_PROGRESS,
        expect.objectContaining({
          topicId,
          reportId,
          phase: "reviewing",
          progress: 78,
        }),
      );
    });
  });
});
