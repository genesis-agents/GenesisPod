// @ts-nocheck
import {
  describe,
  it,
  expect,
  beforeEach,
  afterEach,
  jest,
} from "@jest/globals";
import { TopicTeamOrchestratorService } from "../../services/topic-team-orchestrator.service";

function createMockServices() {
  const mockDimension = {
    id: "dim-1",
    name: "Market",
    description: "Market analysis",
    topicId: "t1",
    searchQueries: ["market"],
    searchSources: ["web"],
    sortOrder: 1,
    isEnabled: true,
    status: "PENDING",
    minSources: 5,
  };

  const mockAnalysisResult = {
    summary: "Market analysis summary",
    keyFindings: [{ finding: "f1", significance: "high", evidenceIds: ["e1"] }],
    trends: [],
    challenges: [],
    opportunities: [],
    confidenceLevel: "high",
    evidenceUsed: 5,
    detailedContent: "Detailed content...",
  };

  const prisma = {
    topicRefreshLog: {
      create: jest.fn().mockResolvedValue({ id: "log1" }),
      update: jest.fn().mockResolvedValue({}),
    },
    researchTopic: {
      update: jest.fn().mockResolvedValue({}),
    },
    topicDimension: {
      findMany: jest.fn().mockResolvedValue([mockDimension]),
      update: jest.fn().mockResolvedValue({}),
    },
    topicEvidence: {
      findMany: jest
        .fn()
        .mockResolvedValue([
          { id: "e1", title: "Evidence 1", snippet: "data" },
        ]),
    },
  };

  const eventEmitter = { emit: jest.fn() };

  const dimensionMissionService = {
    executeSearchPhase: jest.fn().mockResolvedValue({
      success: true,
      evidenceSummary: "summary",
      evidenceIds: ["e1"],
      figuresSummary: "",
    }),
    executeWritingPhase: jest.fn().mockResolvedValue({
      success: true,
      analysisResult: mockAnalysisResult,
      evidenceIds: ["e1"],
      extractedClaims: [],
    }),
  };

  const reportSynthesisService = {
    createDraftReport: jest.fn().mockResolvedValue({ id: "r1" }),
    saveDimensionAnalysis: jest.fn().mockResolvedValue({ id: "a1" }),
    linkEvidenceToReport: jest.fn().mockResolvedValue(undefined),
    synthesizeReport: jest.fn().mockResolvedValue({
      id: "r1",
      content: "Report content with [1] citation.",
      totalSources: 5,
    }),
  };

  const researchReviewerService = {
    reviewDimension: jest.fn().mockResolvedValue({
      qualityLevel: "good",
      overallScore: 80,
      scores: {
        breadth: 80,
        depth: 80,
        evidence: 80,
        coherence: 80,
        currency: 80,
      },
      issues: [],
      suggestions: [],
      needsReresearch: false,
    }),
    reviewOverall: jest.fn().mockResolvedValue({
      qualityLevel: "good",
      overallScore: 80,
      dimensionReviews: [],
      crossDimensionIssues: [],
      coverageAnalysis: {
        coveredAspects: [],
        missingAspects: [],
        coverageScore: 80,
      },
      recommendations: [],
      needsReresearch: false,
      dimensionsToReresearch: [],
    }),
    validateClaims: jest.fn().mockResolvedValue({
      results: [],
      stats: { verified: 0, unverified: 0, disputed: 0, total: 0 },
    }),
    factCheckReport: jest.fn().mockResolvedValue({
      citations: [],
      accuracyScore: 90,
      issues: [],
    }),
  };

  const researchLeaderService = {
    planResearch: jest.fn().mockResolvedValue({
      dimensions: [
        {
          id: "dim-1",
          name: "Market",
          description: "desc",
          searchQueries: ["q1"],
          dataSources: ["web"],
          priority: 1,
        },
      ],
      agentAssignments: [],
      executionStrategy: { parallelism: 1, priorityOrder: ["dim-1"] },
      taskUnderstanding: {
        topic: "Test",
        scope: "broad",
        objectives: ["analyze"],
      },
    }),
    planGlobalOutline: jest.fn().mockResolvedValue({
      dimensions: [
        {
          dimensionId: "dim-1",
          dimensionName: "Market",
          outline: { title: "Market", sections: [], totalWordCount: 1000 },
        },
      ],
    }),
    planDimensionOutline: jest.fn().mockResolvedValue({
      title: "Market",
      sections: [],
      totalWordCount: 1000,
    }),
    verifyHypotheses: jest.fn().mockResolvedValue([]),
    extractClaims: jest.fn().mockResolvedValue([]),
  };

  const researchCheckpointService = {
    saveCheckpoint: jest.fn().mockResolvedValue(undefined),
  };

  const dataSourceRouterService = {
    scanLiteratureBaseline: jest.fn().mockResolvedValue([]),
    searchForHypothesis: jest
      .fn()
      .mockResolvedValue({ supportResults: [], counterResults: [] }),
    fetchDataForDimension: jest.fn().mockResolvedValue({
      items: [],
      totalCount: 0,
      sources: ["web"],
      metadata: { searchQuery: "q", executionTimeMs: 100, sourceResults: {} },
    }),
  };

  return {
    prisma,
    eventEmitter,
    dimensionMissionService,
    reportSynthesisService,
    researchReviewerService,
    researchLeaderService,
    researchCheckpointService,
    dataSourceRouterService,
    mockDimension,
  };
}

describe("TopicTeamOrchestratorService - V5 Depth Gating", () => {
  let mocks: ReturnType<typeof createMockServices>;
  let service: TopicTeamOrchestratorService;
  const topic = {
    id: "t1",
    name: "Test Topic",
    type: "MACRO",
    description: "Test",
    status: "ACTIVE",
    topicConfig: {},
  } as any;

  beforeEach(() => {
    mocks = createMockServices();
    service = new TopicTeamOrchestratorService(
      mocks.prisma as any,
      mocks.eventEmitter as any,
      mocks.dimensionMissionService as any,
      mocks.reportSynthesisService as any,
      mocks.researchReviewerService as any,
      mocks.researchLeaderService as any,
      mocks.researchCheckpointService as any,
      mocks.dataSourceRouterService as any,
    );
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it("quick → skips cognitive loop, literature baseline, and fact check", async () => {
    await service.executeRefresh(topic, { researchDepth: "quick" });

    expect(
      mocks.dataSourceRouterService.scanLiteratureBaseline,
    ).not.toHaveBeenCalled();
    expect(mocks.researchReviewerService.validateClaims).not.toHaveBeenCalled();
    expect(
      mocks.researchReviewerService.factCheckReport,
    ).not.toHaveBeenCalled();
  });

  it("standard → runs literature baseline and cognitive loop, skips fact check", async () => {
    // Make cognitive loop have claims to process
    mocks.dimensionMissionService.executeWritingPhase.mockResolvedValue({
      success: true,
      analysisResult: {
        summary: "summary",
        keyFindings: [],
        trends: [],
        challenges: [],
        opportunities: [],
        confidenceLevel: "high",
        evidenceUsed: 5,
        detailedContent: "content",
      },
      evidenceIds: ["e1"],
      extractedClaims: [
        {
          id: "c1",
          statement: "claim",
          sectionId: "s1",
          sourceEvidenceIndices: [0],
          importance: "high",
        },
      ],
    });

    await service.executeRefresh(topic, { researchDepth: "standard" });

    expect(
      mocks.dataSourceRouterService.scanLiteratureBaseline,
    ).toHaveBeenCalled();
    expect(mocks.researchReviewerService.validateClaims).toHaveBeenCalled();
    expect(
      mocks.researchReviewerService.factCheckReport,
    ).not.toHaveBeenCalled();
  });

  it("thorough → runs all V5 features including fact check", async () => {
    mocks.dimensionMissionService.executeWritingPhase.mockResolvedValue({
      success: true,
      analysisResult: {
        summary: "summary",
        keyFindings: [],
        trends: [],
        challenges: [],
        opportunities: [],
        confidenceLevel: "high",
        evidenceUsed: 5,
        detailedContent: "content",
      },
      evidenceIds: ["e1"],
      extractedClaims: [
        {
          id: "c1",
          statement: "claim",
          sectionId: "s1",
          sourceEvidenceIndices: [0],
          importance: "high",
        },
      ],
    });

    await service.executeRefresh(topic, { researchDepth: "thorough" });

    expect(
      mocks.dataSourceRouterService.scanLiteratureBaseline,
    ).toHaveBeenCalled();
    expect(mocks.researchReviewerService.validateClaims).toHaveBeenCalled();
    expect(mocks.researchReviewerService.factCheckReport).toHaveBeenCalled();
  });

  it("should save checkpoints at key phases", async () => {
    await service.executeRefresh(topic, { researchDepth: "standard" });

    const checkpointCalls =
      mocks.researchCheckpointService.saveCheckpoint.mock.calls;
    // Should have checkpoints for: L2_knowledge (after search), L2_knowledge (after Phase 2), L4_writing (per dimension)
    expect(checkpointCalls.length).toBeGreaterThanOrEqual(2);

    // Verify checkpoint phases
    const phases = checkpointCalls.map((c) => c[1]?.phase);
    expect(phases).toContain("L2_knowledge");
  });

  it("should not block flow when saveCheckpoint fails", async () => {
    mocks.researchCheckpointService.saveCheckpoint.mockRejectedValue(
      new Error("DB error"),
    );

    // Should not throw
    await expect(
      service.executeRefresh(topic, { researchDepth: "standard" }),
    ).resolves.toBeDefined();
  });

  it("should pass maxRevisionRounds to executeWritingPhase", async () => {
    await service.executeRefresh(topic, { researchDepth: "standard" });

    // standard config has maxRevisionRounds=1
    const writingCalls =
      mocks.dimensionMissionService.executeWritingPhase.mock.calls;
    expect(writingCalls.length).toBeGreaterThan(0);
    // The last argument should be maxRevisionRounds (index 11 based on the source)
    const lastArg = writingCalls[0][writingCalls[0].length - 1];
    expect(lastArg).toBe(1);
  });

  it("thorough fact check queries evidence from DB", async () => {
    mocks.reportSynthesisService.synthesizeReport.mockResolvedValue({
      id: "r1",
      content: "Report with [1] citation.",
      totalSources: 5,
    });

    await service.executeRefresh(topic, { researchDepth: "thorough" });

    expect(mocks.prisma.topicEvidence.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ reportId: "r1" }),
      }),
    );
    expect(mocks.researchReviewerService.factCheckReport).toHaveBeenCalled();
  });
});
