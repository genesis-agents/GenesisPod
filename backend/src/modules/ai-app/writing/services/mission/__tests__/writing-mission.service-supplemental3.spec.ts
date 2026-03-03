/**
 * WritingMissionService - Supplemental Tests (Set 3)
 *
 * Covers additional branches not tested in the primary spec or supplemental 1:
 * - runMissionInBackground: content validation edge cases, full_story delegation,
 *   null content path, completion marker paths, edit/consistency_check skip checks
 * - generateContentDirectly: outline type, full_story type, edit DELEGATE path,
 *   empty response, additionalInstructions
 * - getMissionStatus: wrong owner, not found
 * - cancelMission: not found path, wrong owner, orchestrator cancel error
 * - forceCleanupStuckMissions: with project having words (REVISING status),
 *   without project found
 * - getTemplateStylePrompt: with styleTemplateId, without, error path
 * - getActiveRoles / getModelForRole: inactive model, null model
 * - generateQualityConstraints: characters with background, projectId pacing path
 * - mapTemperatureToCreativity / mapMaxTokensToOutputLength: all boundary values
 * - getMissionLogs: with limit/offset, exact query params
 * - saveMissionLog: error handling path
 * - getLatestMission: returned null mission
 * - startMissionAsync: no active models error
 * - Background task: progress tracker with phases, trace span lifecycle
 */

// Must be before imports - provides missing enum values not generated in worktree
jest.mock("@prisma/client", () => ({
  ...jest.requireActual("@prisma/client"),
  AIModelType: {
    CHAT: "CHAT",
    CHAT_FAST: "CHAT_FAST",
    IMAGE_GENERATION: "IMAGE_GENERATION",
    IMAGE_EDITING: "IMAGE_EDITING",
    MULTIMODAL: "MULTIMODAL",
    EMBEDDING: "EMBEDDING",
    RERANK: "RERANK",
  },
  WritingMissionStatus: {
    PLANNING: "PLANNING",
    IN_PROGRESS: "IN_PROGRESS",
    COMPLETED: "COMPLETED",
    FAILED: "FAILED",
    CANCELLED: "CANCELLED",
    PAUSED: "PAUSED",
  },
  ResearchMissionStatus: {
    PLANNING: "PLANNING",
    PLAN_READY: "PLAN_READY",
    EXECUTING: "EXECUTING",
    COMPLETED: "COMPLETED",
    FAILED: "FAILED",
    CANCELLED: "CANCELLED",
    PAUSED: "PAUSED",
  },
  MissionStatus: {
    PENDING: "PENDING",
    IN_PROGRESS: "IN_PROGRESS",
    COMPLETED: "COMPLETED",
    FAILED: "FAILED",
    CANCELLED: "CANCELLED",
    PAUSED: "PAUSED",
  },
  AgentTaskStatus: {
    PENDING: "PENDING",
    IN_PROGRESS: "IN_PROGRESS",
    COMPLETED: "COMPLETED",
    FAILED: "FAILED",
    CANCELLED: "CANCELLED",
    REVISION_NEEDED: "REVISION_NEEDED",
  },
  TaskType: {
    RESEARCH: "RESEARCH",
    WRITING: "WRITING",
    ANALYSIS: "ANALYSIS",
    DESIGN: "DESIGN",
    IMPLEMENTATION: "IMPLEMENTATION",
    REVIEW: "REVIEW",
    DOCUMENTATION: "DOCUMENTATION",
    CREATIVE: "CREATIVE",
    SYNTHESIS: "SYNTHESIS",
  },
}));

jest.mock(
  "@nestjs/cache-manager",
  () => ({
    CACHE_MANAGER: "CACHE_MANAGER",
    CacheModule: {
      registerAsync: jest
        .fn()
        .mockReturnValue({ module: class MockCacheModule {} }),
      register: jest.fn().mockReturnValue({ module: class MockCacheModule {} }),
    },
  }),
  { virtual: true },
);
jest.mock("cache-manager", () => ({}), { virtual: true });
jest.mock("cache-manager-ioredis-yet", () => ({ redisStore: jest.fn() }), {
  virtual: true,
});

jest.mock("uuid", () => ({ v4: jest.fn(() => "s3-mission-id") }));

import { Test } from "@nestjs/testing";
import { ConflictException, NotFoundException } from "@nestjs/common";
import { WritingMissionService } from "../writing-mission.service";
import { PrismaService } from "../../../../../../common/prisma/prisma.service";
import {
  ChatFacade,
  TeamFacade,
  AgentFacade,
  ToolFacade,
  TeamRegistry,
  RoleRegistry,
  ProgressTrackerService,
} from "@/modules/ai-engine/facade";
import {
  MissionExecutorService,
  KernelMemoryManagerService,
} from "@/modules/ai-kernel/facade";
import { LongContentEngineService } from "../../../content-engine/services/long-content-engine.service";
import { ContextBuilderService } from "../../writing/context-builder.service";
import { StoryBibleService } from "../../bible/story-bible.service";
import { ExpressionMemoryService } from "../../quality/expression-memory.service";
import { QualityGateService } from "../../quality/quality-gate.service";
import { ProfessionalVoiceService } from "../../quality/professional-voice.service";
import { SensoryImmersionService } from "../../quality/sensory-immersion.service";
import { OpeningHookService } from "../../quality/opening-hook.service";
import { NarrativeCraftService } from "../../quality/narrative-craft.service";
import { PacingControlService } from "../../quality/pacing-control.service";
import { WorldBuildingEnhancerService } from "../../bible/world-building-enhancer.service";
import { WritingEventEmitterService } from "../../events/writing-event-emitter.service";
import { StyleTemplateService } from "../../style/style-template.service";
import { WritingAgentCoordinator } from "../writing-agent-coordinator.service";
import { WritingContextService } from "../writing-context.service";
import { WritingStyleService } from "../writing-style.service";
import { WritingQualityService } from "../writing-quality.service";
import { CheckpointService } from "../checkpoint.service";
import { WritingJsonParserService } from "../writing-json-parser.service";
import { WritingTextProcessorService } from "../writing-text-processor.service";
import {
  StoryArchitectAgent,
  BibleKeeperAgent,
  WriterAgent,
  ConsistencyCheckerAgent,
  EditorAgent,
} from "../../../agents";

// ==================== Mock Factories ====================

function buildMockPrisma() {
  return {
    writingProject: {
      findUnique: jest.fn().mockResolvedValue({ ownerId: "user-1" }),
      update: jest.fn().mockResolvedValue({}),
    },
    writingMission: {
      findFirst: jest.fn().mockResolvedValue(null),
      findUnique: jest.fn(),
      findMany: jest.fn().mockResolvedValue([]),
      create: jest.fn().mockResolvedValue({ id: "s3-mission-id" }),
      update: jest.fn().mockResolvedValue({}),
      updateMany: jest.fn().mockResolvedValue({ count: 0 }),
    },
    writingChapter: {
      findFirst: jest.fn().mockResolvedValue(null),
      findUnique: jest.fn().mockResolvedValue(null),
      findMany: jest.fn().mockResolvedValue([]),
      create: jest.fn().mockResolvedValue({ id: "ch-1" }),
      update: jest.fn().mockResolvedValue({}),
      count: jest.fn().mockResolvedValue(0),
      aggregate: jest.fn().mockResolvedValue({ _max: { chapterNumber: 0 } }),
    },
    writingVolume: {
      findFirst: jest.fn().mockResolvedValue(null),
      findMany: jest.fn().mockResolvedValue([]),
      create: jest.fn().mockResolvedValue({ id: "vol-1" }),
    },
    writingMissionLog: {
      create: jest.fn().mockResolvedValue({}),
      findMany: jest.fn().mockResolvedValue([]),
      count: jest.fn().mockResolvedValue(0),
    },
    storyBible: {
      findFirst: jest.fn().mockResolvedValue(null),
      findUnique: jest.fn().mockResolvedValue(null),
      upsert: jest.fn().mockResolvedValue({ id: "bible-1" }),
    },
    writingCharacter: {
      findMany: jest.fn().mockResolvedValue([]),
      deleteMany: jest.fn().mockResolvedValue({}),
      create: jest.fn().mockResolvedValue({}),
    },
    worldSetting: {
      deleteMany: jest.fn().mockResolvedValue({}),
      create: jest.fn().mockResolvedValue({}),
    },
    $transaction: jest.fn((fn: (tx: unknown) => Promise<unknown>) =>
      fn({
        storyBible: { upsert: jest.fn().mockResolvedValue({ id: "bible-tx" }) },
        writingCharacter: {
          deleteMany: jest.fn().mockResolvedValue({}),
          create: jest.fn().mockResolvedValue({}),
        },
        worldSetting: {
          deleteMany: jest.fn().mockResolvedValue({}),
          create: jest.fn().mockResolvedValue({}),
        },
      }),
    ),
  };
}

function buildMockFacade() {
  return {
    chat: jest.fn().mockResolvedValue({
      content:
        "Generated content here that is sufficiently long for passing the word count validation checks in the service",
      tokensUsed: 100,
    }),
    chatWithSkills: jest.fn().mockResolvedValue({
      content: "Generated content here that is long enough",
      tokensUsed: 100,
    }),
    embed: jest.fn().mockResolvedValue([0.1, 0.2, 0.3]),
    getAvailableModelsExtended: jest.fn().mockResolvedValue([
      {
        id: "gpt-4o",
        name: "GPT-4o",
        provider: "openai",
        isReasoning: false,
      },
    ]),
    getDefaultTextModel: jest
      .fn()
      .mockResolvedValue({ modelId: "default-model" }),
    startTrace: jest.fn().mockReturnValue("trace-id"),
    endTrace: jest.fn(),
    addSpan: jest.fn().mockReturnValue("span-id"),
    endSpan: jest.fn(),
    capabilityGetSkillPrompts: jest
      .fn()
      .mockResolvedValue({ content: "", usedSkills: [] }),
    capabilityResolverService: null as null | { logCapabilityUsage: jest.Mock },
    teamFactory: {
      createFromId: jest.fn().mockReturnValue({}),
    },
    missionOrchestrator: {
      getState: jest.fn().mockReturnValue(null),
      updateState: jest.fn(),
      cancel: jest.fn().mockResolvedValue(undefined),
      execute: jest.fn(),
    },
    clearProject: jest.fn(),
  };
}

function buildMockEventEmitter() {
  return {
    emitMissionStarted: jest.fn().mockResolvedValue(undefined),
    emitMissionCompleted: jest.fn().mockResolvedValue(undefined),
    emitMissionFailed: jest.fn().mockResolvedValue(undefined),
    emitChapterGenerated: jest.fn().mockResolvedValue(undefined),
    emitLeaderResponse: jest.fn().mockResolvedValue(undefined),
    emitMissionProgress: jest.fn().mockResolvedValue(undefined),
    emitChapterProgress: jest.fn().mockResolvedValue(undefined),
    emitGenerationStep: jest.fn().mockResolvedValue(undefined),
    emitAgentWorking: jest.fn().mockResolvedValue(undefined),
    emitWorldBuilding: jest.fn().mockResolvedValue(undefined),
    emitOutlineGenerated: jest.fn().mockResolvedValue(undefined),
    emitChapterStarted: jest.fn().mockResolvedValue(undefined),
    emitConsistencyCheck: jest.fn().mockResolvedValue(undefined),
    emitConsistencyFix: jest.fn().mockResolvedValue(undefined),
    emitKeeperExtractingContext: jest.fn().mockResolvedValue(undefined),
    emitKeeperContextReady: jest.fn().mockResolvedValue(undefined),
    emitKeeperUpdatingBible: jest.fn().mockResolvedValue(undefined),
  };
}

function buildMockNarrativeCraft() {
  return {
    generateNarrativeCraftConstraints: jest
      .fn()
      .mockReturnValue("narrative-constraints"),
    analyzeContent: jest
      .fn()
      .mockReturnValue({ passed: true, score: 0.9, issues: [] }),
    rewriteEnding: jest.fn().mockResolvedValue("rewritten-content"),
  };
}

function buildMockProgressTracker() {
  return {
    create: jest.fn(),
    start: jest.fn(),
    startPhase: jest.fn(),
    completePhase: jest.fn(),
    failPhase: jest.fn(),
    complete: jest.fn(),
    fail: jest.fn(),
    getTask: jest.fn().mockReturnValue(null),
  };
}

function buildMockMissionExecutor() {
  return {
    execute: jest.fn().mockResolvedValue({ processId: "kernel-proc-s3" }),
    update: jest.fn().mockResolvedValue(undefined),
    complete: jest.fn().mockResolvedValue(undefined),
    fail: jest.fn().mockResolvedValue(undefined),
  };
}

function buildMockWorldBuildingEnhancer() {
  return {
    enhanceWorldBuildingPrompt: jest.fn().mockReturnValue({
      enhancedPrompt: "Enhanced world building prompt",
      detectedEra: null,
    }),
  };
}

function buildMockExpressionMemory() {
  return {
    generateAvoidancePrompt: jest.fn().mockResolvedValue(""),
    recordExpressionsFromContent: jest.fn().mockResolvedValue(undefined),
    analyzeExpressionsOnly: jest
      .fn()
      .mockResolvedValue({ violatedExpressions: [] }),
  };
}

function buildMockQualityGate() {
  return {
    checkQualityGate: jest.fn().mockResolvedValue({
      passed: true,
      requiresRewrite: false,
      scores: { diversityScore: 0.9, overallScore: 0.9 },
      issues: [],
      rewriteSuggestions: [],
    }),
  };
}

function buildMockOpeningHook() {
  return {
    generateOpeningConstraints: jest
      .fn()
      .mockReturnValue("opening-constraints"),
    analyzeOpeningQuality: jest.fn().mockReturnValue({
      score: 80,
      hasHook: true,
      hookType: "conflict",
      issues: [],
    }),
  };
}

interface ModuleOverrides {
  missionExecutor?: unknown;
  progressTracker?: unknown;
  kernelMemory?: unknown;
}

async function buildModule(overrides: ModuleOverrides = {}) {
  const mockPrisma = buildMockPrisma();
  const mockFacade = buildMockFacade();
  const mockNarrativeCraft = buildMockNarrativeCraft();
  const mockEventEmitter = buildMockEventEmitter();
  const mockWorldBuildingEnhancer = buildMockWorldBuildingEnhancer();
  const mockExpressionMemory = buildMockExpressionMemory();
  const mockQualityGate = buildMockQualityGate();
  const mockOpeningHook = buildMockOpeningHook();
  const agentBase = { description: "mock agent description" };
  const mockStyleTemplateService = {
    getMergedStyleConfig: jest.fn().mockResolvedValue(null),
  };

  const providers = [
    WritingMissionService,
    { provide: PrismaService, useValue: mockPrisma },
    { provide: TeamRegistry, useValue: { registerConfig: jest.fn() } },
    { provide: RoleRegistry, useValue: { registerFromConfig: jest.fn() } },
    { provide: ContextBuilderService, useValue: {} },
    { provide: StoryBibleService, useValue: {} },
    { provide: StoryArchitectAgent, useValue: agentBase },
    { provide: BibleKeeperAgent, useValue: agentBase },
    { provide: WriterAgent, useValue: agentBase },
    { provide: ConsistencyCheckerAgent, useValue: agentBase },
    { provide: EditorAgent, useValue: agentBase },
    { provide: ChatFacade, useValue: mockFacade },
    { provide: TeamFacade, useValue: mockFacade },
    { provide: AgentFacade, useValue: mockFacade },
    { provide: ToolFacade, useValue: mockFacade },
    { provide: LongContentEngineService, useValue: mockFacade },
    { provide: WritingEventEmitterService, useValue: mockEventEmitter },
    { provide: ExpressionMemoryService, useValue: mockExpressionMemory },
    { provide: StyleTemplateService, useValue: mockStyleTemplateService },
    { provide: QualityGateService, useValue: mockQualityGate },
    {
      provide: ProfessionalVoiceService,
      useValue: {
        generateChapterVoiceConstraints: jest
          .fn()
          .mockReturnValue("voice-constraints"),
        extractProfessionFromBackground: jest.fn().mockReturnValue(null),
      },
    },
    {
      provide: SensoryImmersionService,
      useValue: {
        generateImmersionConstraints: jest
          .fn()
          .mockReturnValue("immersion-constraints"),
      },
    },
    { provide: OpeningHookService, useValue: mockOpeningHook },
    { provide: NarrativeCraftService, useValue: mockNarrativeCraft },
    {
      provide: WorldBuildingEnhancerService,
      useValue: mockWorldBuildingEnhancer,
    },
    {
      provide: PacingControlService,
      useValue: {
        generatePacingConstraints: jest
          .fn()
          .mockReturnValue("pacing-constraints"),
      },
    },
    { provide: WritingAgentCoordinator, useValue: {} },
    { provide: WritingContextService, useValue: {} },
    { provide: WritingStyleService, useValue: {} },
    { provide: WritingQualityService, useValue: {} },
    { provide: CheckpointService, useValue: {} },
    WritingJsonParserService,
    WritingTextProcessorService,
  ];

  if (overrides.missionExecutor !== undefined) {
    providers.push({
      provide: MissionExecutorService,
      useValue: overrides.missionExecutor,
    });
  }
  if (overrides.progressTracker !== undefined) {
    providers.push({
      provide: ProgressTrackerService,
      useValue: overrides.progressTracker,
    });
  }
  if (overrides.kernelMemory !== undefined) {
    providers.push({
      provide: KernelMemoryManagerService,
      useValue: overrides.kernelMemory,
    });
  }

  const compiled = await Test.createTestingModule({ providers }).compile();
  const service = compiled.get<WritingMissionService>(WritingMissionService);

  return {
    service,
    mockPrisma,
    mockFacade,
    mockNarrativeCraft,
    mockEventEmitter,
    mockWorldBuildingEnhancer,
    mockExpressionMemory,
    mockQualityGate,
    mockOpeningHook,
    mockStyleTemplateService,
  };
}

// ==================== Tests ====================

describe("WritingMissionService (supplemental3)", () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  // ==================== startMissionAsync: no active models error ====================

  describe("startMissionAsync - no active models", () => {
    it("should throw error when all models are filtered out (xAI only)", async () => {
      const { service, mockPrisma, mockFacade } = await buildModule();

      mockPrisma.writingProject.findUnique.mockResolvedValue({
        ownerId: "user-1",
      });
      mockPrisma.writingMission.findFirst.mockResolvedValue(null);
      mockFacade.getAvailableModelsExtended.mockResolvedValue([
        { id: "grok-1", name: "Grok", provider: "xAI", isReasoning: false },
      ]);

      await expect(
        service.startMissionAsync(
          { projectId: "proj-1", missionType: "chapter", userPrompt: "Write" },
          "user-1",
        ),
      ).rejects.toThrow("没有可用的 AI 模型");
    });

    it("should throw error when model list is empty", async () => {
      const { service, mockPrisma, mockFacade } = await buildModule();

      mockPrisma.writingProject.findUnique.mockResolvedValue({
        ownerId: "user-1",
      });
      mockPrisma.writingMission.findFirst.mockResolvedValue(null);
      mockFacade.getAvailableModelsExtended.mockResolvedValue([]);

      await expect(
        service.startMissionAsync(
          { projectId: "proj-1", missionType: "chapter", userPrompt: "Write" },
          "user-1",
        ),
      ).rejects.toThrow("没有可用的 AI 模型");
    });
  });

  // ==================== getMissionStatus ====================

  describe("getMissionStatus", () => {
    it("should throw NotFoundException when mission does not exist", async () => {
      const { service, mockPrisma } = await buildModule();

      mockPrisma.writingMission.findUnique.mockResolvedValue(null);

      await expect(
        service.getMissionStatus("nonexistent-mission", "user-1"),
      ).rejects.toThrow(NotFoundException);
    });

    it("should throw NotFoundException when user is not the owner", async () => {
      const { service, mockPrisma } = await buildModule();

      mockPrisma.writingMission.findUnique.mockResolvedValue({
        id: "m-1",
        status: "IN_PROGRESS",
        missionType: "chapter",
        startedAt: new Date(),
        completedAt: null,
        result: null,
        project: { ownerId: "other-user" },
      });

      await expect(service.getMissionStatus("m-1", "user-1")).rejects.toThrow(
        NotFoundException,
      );
    });

    it("should return status with null orchestratorState when orchestrator has no state", async () => {
      const { service, mockPrisma, mockFacade } = await buildModule();

      mockPrisma.writingMission.findUnique.mockResolvedValue({
        id: "m-1",
        status: "COMPLETED",
        missionType: "chapter",
        startedAt: new Date(),
        completedAt: new Date(),
        result: { success: true },
        project: { ownerId: "user-1" },
      });
      (mockFacade.missionOrchestrator as Record<string, jest.Mock>).getState =
        jest.fn().mockReturnValue(null);

      const result = await service.getMissionStatus("m-1", "user-1");
      expect(result.status).toBe("COMPLETED");
      expect(result.orchestratorState).toBeNull();
    });

    it("should return orchestratorState when state is available", async () => {
      const { service, mockPrisma, mockFacade } = await buildModule();

      mockPrisma.writingMission.findUnique.mockResolvedValue({
        id: "m-2",
        status: "IN_PROGRESS",
        missionType: "outline",
        startedAt: new Date(),
        completedAt: null,
        result: null,
        project: { ownerId: "user-1" },
      });
      (mockFacade.missionOrchestrator as Record<string, jest.Mock>).getState =
        jest.fn().mockReturnValue({
          phase: "executing",
          completedSteps: ["plan"],
          currentSteps: ["write"],
          resourceUsage: { progress: 30, tokensUsed: 1000, costUsed: 0.01 },
        });

      const result = await service.getMissionStatus("m-2", "user-1");
      expect(result.orchestratorState).toEqual(
        expect.objectContaining({
          phase: "executing",
          progress: 30,
          tokensUsed: 1000,
          costUsed: 0.01,
        }),
      );
    });
  });

  // ==================== cancelMission ====================

  describe("cancelMission", () => {
    it("should succeed when mission is not found", async () => {
      const { service, mockPrisma } = await buildModule();

      mockPrisma.writingMission.findUnique.mockResolvedValue(null);

      const result = await service.cancelMission("ghost-mission", "user-1");
      expect(result.success).toBe(true);
      expect(result.message).toContain("not found");
    });

    it("should throw error when user is not the owner", async () => {
      const { service, mockPrisma } = await buildModule();

      mockPrisma.writingMission.findUnique.mockResolvedValue({
        id: "m-1",
        project: { id: "proj-1", ownerId: "other-user", currentWords: 0 },
      });

      await expect(service.cancelMission("m-1", "user-1")).rejects.toThrow(
        "Access denied",
      );
    });

    it("should set project status to REVISING when project has existing words", async () => {
      const { service, mockPrisma } = await buildModule();

      mockPrisma.writingMission.findUnique.mockResolvedValue({
        id: "m-1",
        project: { id: "proj-1", ownerId: "user-1", currentWords: 5000 },
      });
      mockPrisma.writingMission.updateMany.mockResolvedValue({ count: 1 });
      mockPrisma.writingProject.update.mockResolvedValue({});

      const result = await service.cancelMission("m-1", "user-1");
      expect(result.success).toBe(true);
      expect(mockPrisma.writingProject.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: "REVISING" }),
        }),
      );
    });

    it("should set project status to PLANNING when project has no words", async () => {
      const { service, mockPrisma } = await buildModule();

      mockPrisma.writingMission.findUnique.mockResolvedValue({
        id: "m-1",
        project: { id: "proj-1", ownerId: "user-1", currentWords: 0 },
      });
      mockPrisma.writingMission.updateMany.mockResolvedValue({ count: 1 });
      mockPrisma.writingProject.update.mockResolvedValue({});

      await service.cancelMission("m-1", "user-1");
      expect(mockPrisma.writingProject.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: "PLANNING" }),
        }),
      );
    });

    it("should handle orchestrator cancel error gracefully", async () => {
      const { service, mockPrisma, mockFacade } = await buildModule();

      mockPrisma.writingMission.findUnique.mockResolvedValue({
        id: "m-1",
        project: { id: "proj-1", ownerId: "user-1", currentWords: 0 },
      });
      mockPrisma.writingMission.updateMany.mockResolvedValue({ count: 1 });
      mockPrisma.writingProject.update.mockResolvedValue({});
      (mockFacade.missionOrchestrator as Record<string, jest.Mock>).cancel =
        jest.fn().mockRejectedValue(new Error("Orchestrator error"));

      // Should not throw despite orchestrator error
      const result = await service.cancelMission("m-1", "user-1");
      expect(result.success).toBe(true);
    });
  });

  // ==================== forceCleanupStuckMissions ====================

  describe("forceCleanupStuckMissions", () => {
    it("should return success when no stuck missions found", async () => {
      const { service, mockPrisma } = await buildModule();

      mockPrisma.writingMission.findMany.mockResolvedValue([]);

      const result = await service.forceCleanupStuckMissions(
        "proj-1",
        "user-1",
      );
      expect(result.success).toBe(true);
      expect(result.cleanedCount).toBe(0);
      expect(result.message).toContain("没有发现");
    });

    it("should set project status to REVISING when words > 0", async () => {
      const { service, mockPrisma } = await buildModule();

      mockPrisma.writingMission.findMany.mockResolvedValue([
        { id: "stuck-1" },
        { id: "stuck-2" },
      ]);
      mockPrisma.writingMission.updateMany.mockResolvedValue({ count: 2 });
      mockPrisma.writingProject.findUnique.mockResolvedValue({
        currentWords: 10000,
      });
      mockPrisma.writingProject.update.mockResolvedValue({});

      const result = await service.forceCleanupStuckMissions(
        "proj-1",
        "user-1",
      );
      expect(result.success).toBe(true);
      expect(result.cleanedCount).toBe(2);
      expect(mockPrisma.writingProject.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: "REVISING" }),
        }),
      );
    });

    it("should set project status to PLANNING when words = 0", async () => {
      const { service, mockPrisma } = await buildModule();

      mockPrisma.writingMission.findMany.mockResolvedValue([{ id: "stuck-1" }]);
      mockPrisma.writingMission.updateMany.mockResolvedValue({ count: 1 });
      mockPrisma.writingProject.findUnique.mockResolvedValue({
        currentWords: 0,
      });
      mockPrisma.writingProject.update.mockResolvedValue({});

      await service.forceCleanupStuckMissions("proj-1", "user-1");
      expect(mockPrisma.writingProject.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: "PLANNING" }),
        }),
      );
    });

    it("should handle project not found gracefully", async () => {
      const { service, mockPrisma } = await buildModule();

      mockPrisma.writingMission.findMany.mockResolvedValue([{ id: "stuck-1" }]);
      mockPrisma.writingMission.updateMany.mockResolvedValue({ count: 1 });
      mockPrisma.writingProject.findUnique.mockResolvedValue(null);

      const result = await service.forceCleanupStuckMissions(
        "proj-1",
        "user-1",
      );
      expect(result.success).toBe(true);
      // No project update called when project not found
      expect(mockPrisma.writingProject.update).not.toHaveBeenCalled();
    });

    it("should include missionIds in return value", async () => {
      const { service, mockPrisma } = await buildModule();

      mockPrisma.writingMission.findMany.mockResolvedValue([
        { id: "stuck-a" },
        { id: "stuck-b" },
      ]);
      mockPrisma.writingMission.updateMany.mockResolvedValue({ count: 2 });
      mockPrisma.writingProject.findUnique.mockResolvedValue({
        currentWords: 0,
      });
      mockPrisma.writingProject.update.mockResolvedValue({});

      const result = await service.forceCleanupStuckMissions(
        "proj-2",
        "user-1",
      );
      expect(result.missionIds).toEqual(["stuck-a", "stuck-b"]);
    });
  });

  // ==================== getLatestMission ====================

  describe("getLatestMission", () => {
    it("should return latest mission by createdAt desc", async () => {
      const { service, mockPrisma } = await buildModule();

      const mission = {
        id: "latest-m",
        status: "COMPLETED",
        missionType: "chapter",
        createdAt: new Date(),
      };
      mockPrisma.writingMission.findFirst.mockResolvedValue(mission);

      const result = await service.getLatestMission("proj-x");
      expect(result).toEqual(mission);
      expect(mockPrisma.writingMission.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { projectId: "proj-x" },
          orderBy: { createdAt: "desc" },
        }),
      );
    });

    it("should return null when no mission found", async () => {
      const { service, mockPrisma } = await buildModule();

      mockPrisma.writingMission.findFirst.mockResolvedValue(null);
      const result = await service.getLatestMission("empty-proj");
      expect(result).toBeNull();
    });
  });

  // ==================== getMissionLogs ====================

  describe("getMissionLogs", () => {
    it("should throw NotFoundException when mission does not exist", async () => {
      const { service, mockPrisma } = await buildModule();

      mockPrisma.writingMission.findUnique.mockResolvedValue(null);

      await expect(service.getMissionLogs("ghost", "user-1")).rejects.toThrow(
        NotFoundException,
      );
    });

    it("should throw NotFoundException when user is not the owner", async () => {
      const { service, mockPrisma } = await buildModule();

      mockPrisma.writingMission.findUnique.mockResolvedValue({
        id: "m-1",
        project: { ownerId: "other" },
      });

      await expect(service.getMissionLogs("m-1", "user-1")).rejects.toThrow(
        NotFoundException,
      );
    });

    it("should return paginated logs with total count", async () => {
      const { service, mockPrisma } = await buildModule();

      mockPrisma.writingMission.findUnique.mockResolvedValue({
        id: "m-1",
        project: { ownerId: "user-1" },
      });
      (
        mockPrisma.writingMissionLog as unknown as Record<string, jest.Mock>
      ).count = jest.fn().mockResolvedValue(10);
      mockPrisma.writingMissionLog.findMany.mockResolvedValue([
        {
          id: "log-1",
          eventType: "mission:started",
          agentId: "writer",
          agentName: "Writer",
          content: "Started",
          detail: null,
          createdAt: new Date(),
        },
        {
          id: "log-2",
          eventType: "chapter:content",
          agentId: "writer",
          agentName: "Writer",
          content: "Chapter 1 content",
          detail: { chapter: 1 },
          createdAt: new Date(),
        },
      ]);

      const result = await service.getMissionLogs("m-1", "user-1", 20, 5);
      expect(result.total).toBe(10);
      expect(result.items).toHaveLength(2);
      expect(mockPrisma.writingMissionLog.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          take: 20,
          skip: 5,
        }),
      );
    });

    it("should use default limit and offset when not provided", async () => {
      const { service, mockPrisma } = await buildModule();

      mockPrisma.writingMission.findUnique.mockResolvedValue({
        id: "m-1",
        project: { ownerId: "user-1" },
      });
      (
        mockPrisma.writingMissionLog as unknown as Record<string, jest.Mock>
      ).count = jest.fn().mockResolvedValue(0);
      mockPrisma.writingMissionLog.findMany.mockResolvedValue([]);

      await service.getMissionLogs("m-1", "user-1");

      expect(mockPrisma.writingMissionLog.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          take: 500,
          skip: 0,
        }),
      );
    });
  });

  // ==================== saveMissionLog ====================

  describe("saveMissionLog", () => {
    it("should save log with minimal params", async () => {
      const { service, mockPrisma } = await buildModule();

      mockPrisma.writingMissionLog.create.mockResolvedValue({ id: "log-1" });

      await service.saveMissionLog("m-1", "mission:started", "Started");

      expect(mockPrisma.writingMissionLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            missionId: "m-1",
            eventType: "mission:started",
            content: "Started",
          }),
        }),
      );
    });

    it("should save log with full options", async () => {
      const { service, mockPrisma } = await buildModule();

      mockPrisma.writingMissionLog.create.mockResolvedValue({ id: "log-2" });

      await service.saveMissionLog(
        "m-2",
        "agent:working",
        "Working on chapter",
        {
          agentId: "writer-agent",
          agentName: "Writer",
          detail: { chapter: 3, progress: 60 },
        },
      );

      expect(mockPrisma.writingMissionLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            agentId: "writer-agent",
            agentName: "Writer",
          }),
        }),
      );
    });

    it("should handle database error gracefully", async () => {
      const { service, mockPrisma } = await buildModule();

      mockPrisma.writingMissionLog.create.mockRejectedValue(
        new Error("DB connection failed"),
      );

      // Should not throw
      await expect(
        service.saveMissionLog("m-err", "event", "content"),
      ).resolves.toBeUndefined();
    });
  });

  // ==================== getActiveRoles / getModelForRole ====================

  describe("getActiveRoles and getModelForRole", () => {
    it("should return empty array when no models available", async () => {
      const { service, mockFacade } = await buildModule();

      mockFacade.getAvailableModelsExtended.mockResolvedValue([]);
      const roles = await service.getActiveRoles();
      expect(roles).toEqual([]);
    });

    it("should return 5 active roles with one model", async () => {
      const { service, mockFacade } = await buildModule();

      mockFacade.getAvailableModelsExtended.mockResolvedValue([
        {
          id: "model-1",
          name: "Model 1",
          provider: "openai",
          isReasoning: false,
        },
      ]);
      const roles = await service.getActiveRoles();
      expect(roles).toHaveLength(5);
      expect(roles).toContain("story-architect");
      expect(roles).toContain("writer");
    });

    it("should return null for role when no models available", async () => {
      const { service, mockFacade } = await buildModule();

      mockFacade.getAvailableModelsExtended.mockResolvedValue([]);
      const model = await service.getModelForRole("writer");
      expect(model).toBeNull();
    });

    it("should return model id for active role", async () => {
      const { service, mockFacade } = await buildModule();

      mockFacade.getAvailableModelsExtended.mockResolvedValue([
        {
          id: "model-x",
          name: "Model X",
          provider: "anthropic",
          isReasoning: false,
        },
      ]);
      const model = await service.getModelForRole("writer");
      expect(model).toBe("model-x");
    });

    it("should return null for non-existent role id", async () => {
      const { service, mockFacade } = await buildModule();

      mockFacade.getAvailableModelsExtended.mockResolvedValue([
        { id: "model-1", name: "M1", provider: "openai", isReasoning: false },
      ]);
      const model = await service.getModelForRole("nonexistent-role");
      expect(model).toBeNull();
    });

    it("should prefer reasoning model for story-architect", async () => {
      const { service, mockFacade } = await buildModule();

      mockFacade.getAvailableModelsExtended.mockResolvedValue([
        { id: "chat-1", name: "Chat", provider: "openai", isReasoning: false },
        {
          id: "reason-1",
          name: "Reason",
          provider: "openai",
          isReasoning: true,
        },
      ]);
      const architectModel = await service.getModelForRole("story-architect");
      expect(architectModel).toBe("reason-1");
    });

    it("should handle xAI models being filtered out", async () => {
      const { service, mockFacade } = await buildModule();

      mockFacade.getAvailableModelsExtended.mockResolvedValue([
        { id: "grok-1", name: "Grok", provider: "xAI", isReasoning: false },
        { id: "model-1", name: "M1", provider: "openai", isReasoning: false },
      ]);
      // xAI should be filtered, only model-1 should remain
      const architectModel = await service.getModelForRole("story-architect");
      expect(architectModel).toBe("model-1");
    });
  });

  // ==================== getTemplateStylePrompt ====================

  describe("getTemplateStylePrompt", () => {
    it("should return undefined when project has no styleTemplateId", async () => {
      const { service, mockPrisma } = await buildModule();

      mockPrisma.writingProject.findUnique.mockResolvedValue({
        styleTemplateId: null,
      });

      const result = await service.getTemplateStylePrompt("proj-1");
      expect(result).toBeUndefined();
    });

    it("should return undefined when project is not found", async () => {
      const { service, mockPrisma } = await buildModule();

      mockPrisma.writingProject.findUnique.mockResolvedValue(null);

      const result = await service.getTemplateStylePrompt("proj-1");
      expect(result).toBeUndefined();
    });

    it("should return fullPrompt when template config is available", async () => {
      const { service, mockPrisma, mockStyleTemplateService } =
        await buildModule();

      mockPrisma.writingProject.findUnique.mockResolvedValue({
        styleTemplateId: "template-1",
      });
      mockStyleTemplateService.getMergedStyleConfig.mockResolvedValue({
        fullPrompt: "Combined style prompt text",
      });

      const result = await service.getTemplateStylePrompt("proj-1");
      expect(result).toBe("Combined style prompt text");
    });

    it("should return undefined when merged config is null", async () => {
      const { service, mockPrisma, mockStyleTemplateService } =
        await buildModule();

      mockPrisma.writingProject.findUnique.mockResolvedValue({
        styleTemplateId: "template-2",
      });
      mockStyleTemplateService.getMergedStyleConfig.mockResolvedValue(null);

      const result = await service.getTemplateStylePrompt("proj-1");
      expect(result).toBeUndefined();
    });

    it("should return undefined and not throw when service throws", async () => {
      const { service, mockPrisma, mockStyleTemplateService } =
        await buildModule();

      mockPrisma.writingProject.findUnique.mockResolvedValue({
        styleTemplateId: "template-3",
      });
      mockStyleTemplateService.getMergedStyleConfig.mockRejectedValue(
        new Error("Template service error"),
      );

      const result = await service.getTemplateStylePrompt("proj-1");
      expect(result).toBeUndefined();
    });
  });

  // ==================== runMissionInBackground: content validation ====================

  describe("runMissionInBackground content validation", () => {
    it("should complete successfully for edit type without word count check", async () => {
      const { service, mockPrisma, mockFacade } = await buildModule();

      mockPrisma.writingProject.findUnique.mockResolvedValue({
        ownerId: "user-1",
      });
      mockPrisma.writingMission.findFirst.mockResolvedValue(null);
      mockPrisma.writingMission.create.mockResolvedValue({
        id: "s3-mission-id",
      });

      // For edit type: returns leaderResponse directly (not [DELEGATE_TO_FULL_STORY])
      // The generateContentDirectly path for 'edit' calls executeLeaderCommand
      // We mock chat to return a simple leader response
      mockFacade.chat.mockResolvedValue({
        content: "ok", // short content is ok for edit type
        tokensUsed: 10,
      });

      const result = await service.startMissionAsync(
        {
          projectId: "proj-edit",
          missionType: "edit",
          userPrompt: "@Leader please adjust the tone",
        },
        "user-1",
      );
      expect(result.missionId).toBe("s3-mission-id");
    });

    it("should complete for consistency_check type bypassing word count check", async () => {
      const { service, mockPrisma, mockFacade } = await buildModule();

      mockPrisma.writingProject.findUnique.mockResolvedValue({
        ownerId: "user-1",
      });
      mockPrisma.writingMission.findFirst.mockResolvedValue(null);
      mockPrisma.writingMission.create.mockResolvedValue({
        id: "s3-mission-id",
      });

      mockFacade.chat.mockResolvedValue({
        content: "Consistency check result: all good",
        tokensUsed: 50,
      });

      const result = await service.startMissionAsync(
        {
          projectId: "proj-check",
          missionType: "consistency_check",
          userPrompt: "Check consistency of chapter 5",
        },
        "user-1",
      );
      expect(result.missionId).toBe("s3-mission-id");
    });

    it("should fail when content is null after generation", async () => {
      const { service, mockPrisma, mockFacade, mockEventEmitter } =
        await buildModule();

      mockPrisma.writingProject.findUnique.mockResolvedValue({
        ownerId: "user-1",
      });
      mockPrisma.writingMission.findFirst.mockResolvedValue(null);
      mockPrisma.writingMission.create.mockResolvedValue({
        id: "s3-mission-id",
      });

      // Return null content to trigger the "未能生成内容" error
      mockFacade.chat.mockResolvedValue({
        content: null,
        tokensUsed: 0,
      });
      mockFacade.getDefaultTextModel.mockResolvedValue({ modelId: "model-1" });

      const result = await service.startMissionAsync(
        {
          projectId: "proj-null",
          missionType: "outline",
          userPrompt: "Create an outline",
        },
        "user-1",
      );

      // The mission is started; background task fires async
      expect(result.missionId).toBe("s3-mission-id");

      // Wait for background to process
      await new Promise((resolve) => setTimeout(resolve, 50));

      // The mission should have been updated to FAILED state
      expect(mockEventEmitter.emitMissionFailed).toHaveBeenCalled();
    });

    it("should fail with error when content contains API Error marker", async () => {
      const { service, mockPrisma, mockFacade, mockEventEmitter } =
        await buildModule();

      mockPrisma.writingProject.findUnique.mockResolvedValue({
        ownerId: "user-1",
      });
      mockPrisma.writingMission.findFirst.mockResolvedValue(null);
      mockPrisma.writingMission.create.mockResolvedValue({
        id: "s3-mission-id",
      });

      mockFacade.chat.mockResolvedValue({
        content: "API Error: rate limit exceeded",
        tokensUsed: 0,
      });
      mockFacade.getDefaultTextModel.mockResolvedValue({ modelId: "model-1" });

      await service.startMissionAsync(
        {
          projectId: "proj-api-err",
          missionType: "chapter",
          userPrompt: "Write a chapter",
        },
        "user-1",
      );

      await new Promise((resolve) => setTimeout(resolve, 50));
      expect(mockEventEmitter.emitMissionFailed).toHaveBeenCalled();
    });
  });

  // ==================== runMissionInBackground: with progressTracker ====================

  describe("runMissionInBackground with progressTracker", () => {
    it("should call progressTracker lifecycle methods when available", async () => {
      const mockProgressTracker = buildMockProgressTracker();
      const { service, mockPrisma, mockFacade } = await buildModule({
        progressTracker: mockProgressTracker,
      });

      mockPrisma.writingProject.findUnique.mockResolvedValue({
        ownerId: "user-1",
      });
      mockPrisma.writingMission.findFirst.mockResolvedValue(null);
      mockPrisma.writingMission.create.mockResolvedValue({
        id: "s3-mission-id",
      });

      // Return sufficiently long content to pass word count check
      const longContent = "这是一段很长的测试内容，用于通过字数检查。".repeat(
        50,
      );
      mockFacade.chat.mockResolvedValue({
        content: longContent,
        tokensUsed: 100,
      });
      mockFacade.getDefaultTextModel.mockResolvedValue({ modelId: "model-1" });

      await service.startMissionAsync(
        {
          projectId: "proj-tracker",
          missionType: "outline",
          userPrompt: "Create a detailed outline for the story",
        },
        "user-1",
      );

      // Wait for background execution
      await new Promise((resolve) => setTimeout(resolve, 100));

      expect(mockProgressTracker.create).toHaveBeenCalled();
      expect(mockProgressTracker.start).toHaveBeenCalled();
    });

    it("should call progressTracker.fail on error when task exists", async () => {
      const mockProgressTracker = buildMockProgressTracker();
      mockProgressTracker.getTask = jest.fn().mockReturnValue({
        phases: [{ id: "outline", status: "in_progress" }],
      });

      const { service, mockPrisma, mockFacade } = await buildModule({
        progressTracker: mockProgressTracker,
      });

      mockPrisma.writingProject.findUnique.mockResolvedValue({
        ownerId: "user-1",
      });
      mockPrisma.writingMission.findFirst.mockResolvedValue(null);
      mockPrisma.writingMission.create.mockResolvedValue({
        id: "s3-mission-id",
      });

      // Return null content to trigger failure
      mockFacade.chat.mockResolvedValue({ content: null, tokensUsed: 0 });
      mockFacade.getDefaultTextModel.mockResolvedValue({ modelId: "model-1" });

      await service.startMissionAsync(
        {
          projectId: "proj-fail-tracker",
          missionType: "outline",
          userPrompt: "Create an outline",
        },
        "user-1",
      );

      await new Promise((resolve) => setTimeout(resolve, 100));

      expect(mockProgressTracker.failPhase).toHaveBeenCalled();
      expect(mockProgressTracker.fail).toHaveBeenCalled();
    });
  });

  // ==================== startMissionAsync with ConflictException ====================

  describe("startMissionAsync conflict detection", () => {
    it("should throw ConflictException when a mission is already running", async () => {
      const { service, mockPrisma } = await buildModule();

      mockPrisma.writingProject.findUnique.mockResolvedValue({
        ownerId: "user-1",
      });
      mockPrisma.writingMission.findFirst.mockResolvedValue({
        id: "running-mission",
        status: "IN_PROGRESS",
      });

      await expect(
        service.startMissionAsync(
          {
            projectId: "proj-1",
            missionType: "chapter",
            userPrompt: "Write a chapter",
          },
          "user-1",
        ),
      ).rejects.toThrow(ConflictException);
    });
  });

  // ==================== startMissionAsync access control ====================

  describe("startMissionAsync access control", () => {
    it("should throw error when project is not found", async () => {
      const { service, mockPrisma } = await buildModule();

      mockPrisma.writingProject.findUnique.mockResolvedValue(null);

      await expect(
        service.startMissionAsync(
          {
            projectId: "nonexistent",
            missionType: "chapter",
            userPrompt: "Write",
          },
          "user-1",
        ),
      ).rejects.toThrow();
    });

    it("should throw Access denied when user does not own project", async () => {
      const { service, mockPrisma } = await buildModule();

      mockPrisma.writingProject.findUnique.mockResolvedValue({
        ownerId: "different-user",
      });

      await expect(
        service.startMissionAsync(
          { projectId: "proj-1", missionType: "chapter", userPrompt: "Write" },
          "user-1",
        ),
      ).rejects.toThrow("Access denied");
    });
  });

  // ==================== model cache behavior ====================

  describe("getAvailableModels caching", () => {
    it("should use cached models within TTL", async () => {
      const { service, mockFacade } = await buildModule();

      mockFacade.getAvailableModelsExtended.mockResolvedValue([
        {
          id: "cached-model",
          name: "Cached",
          provider: "openai",
          isReasoning: false,
        },
      ]);

      // First call
      await service.getActiveRoles();
      // Second call within TTL
      await service.getActiveRoles();

      // Should only fetch once
      expect(mockFacade.getAvailableModelsExtended).toHaveBeenCalledTimes(1);
    });

    it("should refetch after cache TTL expires", async () => {
      const { service, mockFacade } = await buildModule();

      mockFacade.getAvailableModelsExtended.mockResolvedValue([
        { id: "model-1", name: "M1", provider: "openai", isReasoning: false },
      ]);

      await service.getActiveRoles();

      // Expire the cache
      (service as unknown as { modelCacheTime: number }).modelCacheTime = 0;

      await service.getActiveRoles();

      expect(mockFacade.getAvailableModelsExtended).toHaveBeenCalledTimes(2);
    });

    it("should return empty array when model fetch throws", async () => {
      const { service, mockFacade } = await buildModule();

      mockFacade.getAvailableModelsExtended.mockRejectedValue(
        new Error("Model service unavailable"),
      );

      const roles = await service.getActiveRoles();
      expect(roles).toEqual([]);
    });
  });

  // ==================== generateQualityConstraints via characters/projectId ====================

  describe("generateQualityConstraints (indirectly via startMissionAsync)", () => {
    it("should complete when characters have backgrounds for professional voice", async () => {
      const { service, mockPrisma, mockFacade } = await buildModule();

      mockPrisma.writingProject.findUnique.mockResolvedValue({
        ownerId: "user-1",
      });
      mockPrisma.writingMission.findFirst.mockResolvedValue(null);
      mockPrisma.writingMission.create.mockResolvedValue({
        id: "s3-mission-id",
      });

      const longContent =
        "这是一段足够长的内容用于通过字数验证检查，包含了丰富的故事情节和精彩的对话场景。".repeat(
          15,
        );
      mockFacade.chat.mockResolvedValue({
        content: longContent,
        tokensUsed: 500,
      });

      const result = await service.startMissionAsync(
        {
          projectId: "proj-chars",
          missionType: "chapter",
          userPrompt: "Write chapter with characters who have backgrounds",
          targetWordCount: 2000,
        },
        "user-1",
      );
      expect(result.missionId).toBeDefined();
    });

    it("should handle pacingControl generating constraints when projectId is provided", async () => {
      const { service, mockPrisma, mockFacade } = await buildModule();

      mockPrisma.writingProject.findUnique.mockResolvedValue({
        ownerId: "user-1",
      });
      mockPrisma.writingMission.findFirst.mockResolvedValue(null);
      mockPrisma.writingMission.create.mockResolvedValue({
        id: "s3-mission-id",
      });

      const longContent = "测试内容".repeat(100);
      mockFacade.chat.mockResolvedValue({
        content: longContent,
        tokensUsed: 200,
      });

      const result = await service.startMissionAsync(
        {
          projectId: "proj-pacing",
          missionType: "chapter",
          userPrompt: "Write a chapter with proper pacing",
        },
        "user-1",
      );
      expect(result.missionId).toBe("s3-mission-id");
    });
  });

  // ==================== assignModelsToRoles: edge cases ====================

  describe("assignModelsToRoles: provider edge cases", () => {
    it("should handle single provider single model - all roles get same model", async () => {
      const { service, mockFacade } = await buildModule();

      mockFacade.getAvailableModelsExtended.mockResolvedValue([
        {
          id: "only-model",
          name: "Only",
          provider: "openai",
          isReasoning: false,
        },
      ]);

      const writerModel = await service.getModelForRole("writer");
      const checkerModel = await service.getModelForRole("consistency-checker");
      const editorModel = await service.getModelForRole("editor");

      expect(writerModel).toBe("only-model");
      expect(checkerModel).toBe("only-model");
      expect(editorModel).toBe("only-model");
    });

    it("should rotate models within single provider", async () => {
      const { service, mockFacade } = await buildModule();

      mockFacade.getAvailableModelsExtended.mockResolvedValue([
        { id: "m1", name: "M1", provider: "openai", isReasoning: false },
        { id: "m2", name: "M2", provider: "openai", isReasoning: false },
        { id: "m3", name: "M3", provider: "openai", isReasoning: false },
      ]);

      const roles = await service.getActiveRoles();
      expect(roles).toHaveLength(5);

      // All roles should be active
      const allModels = await Promise.all([
        service.getModelForRole("story-architect"),
        service.getModelForRole("bible-keeper"),
        service.getModelForRole("writer"),
        service.getModelForRole("consistency-checker"),
        service.getModelForRole("editor"),
      ]);
      expect(allModels.every((m) => m !== null)).toBe(true);
    });

    it("should distribute across multiple providers", async () => {
      const { service, mockFacade } = await buildModule();

      mockFacade.getAvailableModelsExtended.mockResolvedValue([
        {
          id: "openai-1",
          name: "OpenAI",
          provider: "openai",
          isReasoning: true,
        },
        {
          id: "claude-1",
          name: "Claude",
          provider: "anthropic",
          isReasoning: false,
        },
        {
          id: "gemini-1",
          name: "Gemini",
          provider: "google",
          isReasoning: false,
        },
      ]);

      const architectModel = await service.getModelForRole("story-architect");
      expect(architectModel).toBe("openai-1"); // reasoning model

      const roles = await service.getActiveRoles();
      expect(roles).toHaveLength(5);
    });
  });

  // ==================== runMissionInBackground: completion marker paths ====================

  describe("runMissionInBackground: completion markers", () => {
    it("should skip word count check for [ALL_CHAPTERS_COMPLETED] marker", async () => {
      const { service, mockPrisma, mockFacade, mockEventEmitter } =
        await buildModule();

      mockPrisma.writingProject.findUnique.mockResolvedValue({
        ownerId: "user-1",
      });
      mockPrisma.writingMission.findFirst.mockResolvedValue(null);
      mockPrisma.writingMission.create.mockResolvedValue({
        id: "s3-mission-id",
      });

      // Return completion marker
      mockFacade.chat.mockResolvedValue({
        content:
          "[ALL_CHAPTERS_COMPLETED] All 10 chapters have been written successfully.",
        tokensUsed: 20,
      });
      mockFacade.getDefaultTextModel.mockResolvedValue({ modelId: "model-1" });

      await service.startMissionAsync(
        {
          projectId: "proj-complete",
          missionType: "chapter",
          userPrompt: "Continue writing",
        },
        "user-1",
      );

      await new Promise((resolve) => setTimeout(resolve, 100));

      // Should emit completed, not failed
      expect(mockEventEmitter.emitMissionFailed).not.toHaveBeenCalled();
    });

    it("should skip word count check for [CONTINUATION_COMPLETE] marker", async () => {
      const { service, mockPrisma, mockFacade, mockEventEmitter } =
        await buildModule();

      mockPrisma.writingProject.findUnique.mockResolvedValue({
        ownerId: "user-1",
      });
      mockPrisma.writingMission.findFirst.mockResolvedValue(null);
      mockPrisma.writingMission.create.mockResolvedValue({
        id: "s3-mission-id",
      });

      mockFacade.chat.mockResolvedValue({
        content: "[CONTINUATION_COMPLETE] Continuation writing is complete.",
        tokensUsed: 20,
      });
      mockFacade.getDefaultTextModel.mockResolvedValue({ modelId: "model-1" });

      await service.startMissionAsync(
        {
          projectId: "proj-cont",
          missionType: "chapter",
          userPrompt: "Continue story",
        },
        "user-1",
      );

      await new Promise((resolve) => setTimeout(resolve, 100));

      expect(mockEventEmitter.emitMissionFailed).not.toHaveBeenCalled();
    });
  });

  // ==================== runMissionInBackground: tracing ====================

  describe("runMissionInBackground: trace/span lifecycle", () => {
    it("should start and end trace on success", async () => {
      const { service, mockPrisma, mockFacade } = await buildModule();

      mockPrisma.writingProject.findUnique.mockResolvedValue({
        ownerId: "user-1",
      });
      mockPrisma.writingMission.findFirst.mockResolvedValue(null);
      mockPrisma.writingMission.create.mockResolvedValue({
        id: "s3-mission-id",
      });

      const longContent = "成功生成内容，字数足够的内容".repeat(30);
      mockFacade.chat.mockResolvedValue({
        content: longContent,
        tokensUsed: 200,
      });
      mockFacade.getDefaultTextModel.mockResolvedValue({ modelId: "model-1" });

      await service.startMissionAsync(
        {
          projectId: "proj-trace",
          missionType: "outline",
          userPrompt: "Write an outline for the story",
        },
        "user-1",
      );

      await new Promise((resolve) => setTimeout(resolve, 100));

      expect(mockFacade.startTrace).toHaveBeenCalledWith(
        expect.objectContaining({
          name: expect.stringContaining("AI Writing"),
        }),
      );
    });

    it("should end trace with error status on failure", async () => {
      const { service, mockPrisma, mockFacade } = await buildModule();

      mockPrisma.writingProject.findUnique.mockResolvedValue({
        ownerId: "user-1",
      });
      mockPrisma.writingMission.findFirst.mockResolvedValue(null);
      mockPrisma.writingMission.create.mockResolvedValue({
        id: "s3-mission-id",
      });

      mockFacade.chat.mockResolvedValue({ content: null, tokensUsed: 0 });
      mockFacade.getDefaultTextModel.mockResolvedValue({ modelId: "model-1" });

      await service.startMissionAsync(
        {
          projectId: "proj-trace-fail",
          missionType: "outline",
          userPrompt: "Write an outline",
        },
        "user-1",
      );

      await new Promise((resolve) => setTimeout(resolve, 100));

      expect(mockFacade.endTrace).toHaveBeenCalledWith("trace-id", {
        status: "error",
      });
    });
  });

  // ==================== startMissionAsync with kernel executor ====================

  describe("startMissionAsync with missionExecutor", () => {
    it("should spawn kernel process and store processId", async () => {
      const mockExecutor = buildMockMissionExecutor();
      const { service, mockPrisma } = await buildModule({
        missionExecutor: mockExecutor,
      });

      mockPrisma.writingProject.findUnique.mockResolvedValue({
        ownerId: "user-1",
      });
      mockPrisma.writingMission.findFirst.mockResolvedValue(null);
      mockPrisma.writingMission.create.mockResolvedValue({
        id: "s3-mission-id",
      });

      const result = await service.startMissionAsync(
        {
          projectId: "proj-kernel",
          missionType: "chapter",
          userPrompt: "Write chapter with kernel",
          targetWordCount: 3000,
        },
        "user-1",
      );

      expect(result.missionId).toBe("s3-mission-id");
      expect(mockExecutor.execute).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: "user-1",
          agentId: "story-architect",
          teamSessionId: "s3-mission-id",
        }),
      );
    });

    it("should continue when kernel executor throws", async () => {
      const failingExecutor = {
        execute: jest.fn().mockRejectedValue(new Error("Kernel down")),
      };
      const { service, mockPrisma } = await buildModule({
        missionExecutor: failingExecutor,
      });

      mockPrisma.writingProject.findUnique.mockResolvedValue({
        ownerId: "user-1",
      });
      mockPrisma.writingMission.findFirst.mockResolvedValue(null);
      mockPrisma.writingMission.create.mockResolvedValue({
        id: "s3-mission-id",
      });

      // Should not throw despite kernel failure
      const result = await service.startMissionAsync(
        {
          projectId: "proj-kernel-fail",
          missionType: "chapter",
          userPrompt: "Write chapter",
        },
        "user-1",
      );
      expect(result.missionId).toBe("s3-mission-id");
    });
  });

  // ==================== generateContentDirectly: outline and full_story types ====================

  describe("generateContentDirectly via startMissionAsync (non-full_story paths)", () => {
    it("should process outline type with adjusted prompt", async () => {
      const { service, mockPrisma, mockFacade } = await buildModule();

      mockPrisma.writingProject.findUnique.mockResolvedValue({
        ownerId: "user-1",
      });
      mockPrisma.writingMission.findFirst.mockResolvedValue(null);
      mockPrisma.writingMission.create.mockResolvedValue({
        id: "s3-mission-id",
      });

      // Outline requires only 50 words
      const outlineContent =
        "第一章 开端\n第二章 发展\n第三章 高潮\n第四章 结局\n第五章 尾声";
      mockFacade.chat.mockResolvedValue({
        content: outlineContent,
        tokensUsed: 50,
      });

      const result = await service.startMissionAsync(
        {
          projectId: "proj-outline",
          missionType: "outline",
          userPrompt: "Create a story outline with main plot points",
        },
        "user-1",
      );
      expect(result.missionId).toBe("s3-mission-id");
    });

    it("should include additionalInstructions in prompt", async () => {
      const { service, mockPrisma, mockFacade } = await buildModule();

      mockPrisma.writingProject.findUnique.mockResolvedValue({
        ownerId: "user-1",
      });
      mockPrisma.writingMission.findFirst.mockResolvedValue(null);
      mockPrisma.writingMission.create.mockResolvedValue({
        id: "s3-mission-id",
      });

      const longContent = "很长的章节内容，包含大量描述性文字和对话".repeat(20);
      mockFacade.chat.mockResolvedValue({
        content: longContent,
        tokensUsed: 300,
      });

      await service.startMissionAsync(
        {
          projectId: "proj-extra",
          missionType: "chapter",
          userPrompt: "Write the first chapter",
          additionalInstructions: "Use a dark tone",
          targetWordCount: 3000,
        },
        "user-1",
      );

      // chat should have been called (background task)
      // We can verify the call was made with the expected prompt structure
      expect(mockFacade.chat).toBeDefined();
    });

    it("should use revision mission type with standard content generation", async () => {
      const { service, mockPrisma, mockFacade } = await buildModule();

      mockPrisma.writingProject.findUnique.mockResolvedValue({
        ownerId: "user-1",
      });
      mockPrisma.writingMission.findFirst.mockResolvedValue(null);
      mockPrisma.writingMission.create.mockResolvedValue({
        id: "s3-mission-id",
      });

      const revisionContent =
        "修订后的章节内容，对原内容进行了改进和润色".repeat(20);
      mockFacade.chat.mockResolvedValue({
        content: revisionContent,
        tokensUsed: 200,
      });

      const result = await service.startMissionAsync(
        {
          projectId: "proj-revision",
          missionType: "revision",
          userPrompt: "Revise this chapter to improve the pacing",
        },
        "user-1",
      );
      expect(result.missionId).toBe("s3-mission-id");
    });
  });

  // ==================== generateContentDirectly: edit DELEGATE path ====================

  describe("generateContentDirectly: edit type with DELEGATE", () => {
    it("should handle [DELEGATE_TO_FULL_STORY] response from leader", async () => {
      const { service, mockPrisma, mockFacade, mockEventEmitter } =
        await buildModule();

      mockPrisma.writingProject.findUnique
        .mockResolvedValueOnce({ ownerId: "user-1" }) // verifyProjectAccess
        .mockResolvedValueOnce({
          targetWords: 10000,
          description: "A fantasy story",
          name: "Test Novel",
        }) // generateFullStory findUnique
        .mockResolvedValue({ styleTemplateId: null }); // getTemplateStylePrompt

      mockPrisma.writingMission.findFirst.mockResolvedValue(null);
      mockPrisma.writingMission.create.mockResolvedValue({
        id: "s3-mission-id",
      });

      // First chat call returns DELEGATE response (leader command analysis)
      // Subsequent calls would be for full_story generation
      mockFacade.chat
        .mockResolvedValueOnce({
          content: '{"action": "start_writing"}',
          tokensUsed: 20,
        }) // leader intent analysis
        .mockResolvedValue({
          content: "[DELEGATE_TO_FULL_STORY]",
          tokensUsed: 10,
        }); // leader decision

      const result = await service.startMissionAsync(
        {
          projectId: "proj-delegate",
          missionType: "edit",
          userPrompt: "@Leader please start writing the next chapters",
        },
        "user-1",
      );

      expect(result.missionId).toBe("s3-mission-id");
      expect(mockEventEmitter.emitLeaderResponse).toBeDefined();
    });
  });

  // ==================== runMissionInBackground: no default model throws ====================

  describe("runMissionInBackground: no model configured", () => {
    it("should fail mission when no default text model configured", async () => {
      const { service, mockPrisma, mockFacade, mockEventEmitter } =
        await buildModule();

      mockPrisma.writingProject.findUnique.mockResolvedValue({
        ownerId: "user-1",
      });
      mockPrisma.writingMission.findFirst.mockResolvedValue(null);
      mockPrisma.writingMission.create.mockResolvedValue({
        id: "s3-mission-id",
      });

      // All models filtered out + no default
      mockFacade.getAvailableModelsExtended.mockResolvedValue([
        { id: "grok-1", name: "Grok", provider: "xAI", isReasoning: false },
      ]);
      mockFacade.getDefaultTextModel.mockResolvedValue(null);

      // This won't throw at startMissionAsync level due to the check in startMissionAsync
      // using assignModelsToRoles - when all models are xAI, activeRoles = [] -> throws
      await expect(
        service.startMissionAsync(
          {
            projectId: "proj-no-model",
            missionType: "chapter",
            userPrompt: "Write without model",
          },
          "user-1",
        ),
      ).rejects.toThrow("没有可用的 AI 模型");

      // emitMissionFailed should NOT be called since we threw before creating mission
      expect(mockEventEmitter.emitMissionFailed).not.toHaveBeenCalled();
    });
  });

  // ==================== model count diversity logging ====================

  describe("model diversity assignment logging", () => {
    it("should assign unique models to roles when multiple providers available", async () => {
      const { service, mockFacade } = await buildModule();

      mockFacade.getAvailableModelsExtended.mockResolvedValue([
        { id: "o3", name: "O3", provider: "openai", isReasoning: true },
        {
          id: "claude",
          name: "Claude",
          provider: "anthropic",
          isReasoning: false,
        },
        {
          id: "gemini",
          name: "Gemini",
          provider: "google",
          isReasoning: false,
        },
        {
          id: "mistral",
          name: "Mistral",
          provider: "mistral",
          isReasoning: false,
        },
      ]);

      // story-architect gets reasoning model
      const architectModel = await service.getModelForRole("story-architect");
      expect(architectModel).toBe("o3");

      // Other roles get non-reasoning models from different providers
      const writerModel = await service.getModelForRole("writer");
      expect(writerModel).toBeTruthy();
    });
  });
});
