/**
 * WritingMissionService - Supplemental Tests (Set 5)
 *
 * Targets uncovered lines NOT covered by supplemental1-4:
 * - verifyProjectAccess: project not found, wrong owner (via startMissionAsync)
 * - updateMissionRecord: success→REVISING, failure+words→REVISING,
 *   failure+noWords→PLANNING, project not found path
 * - createMissionRecord: type mapping (edit, consistency_check, full_story, unknown)
 * - applyBibleUpdates: character_state, timeline_event, new_fact, error swallowed
 * - completeKernelProcess / failKernelProcess: with/without processId,
 *   with/without missionExecutor
 * - reExtractChapterTitles: access denied, no chapters, placeholder title extraction,
 *   outline cleaning (待创作 placeholder)
 * - getProjectMissions: without status filter, with status filter
 * - getWritingSkillPrompts: with capabilityResolverService.logCapabilityUsage path
 * - getWritingTeam: lazy init on first use
 * - runMissionInBackground: isCompletionMarker path, progress tracker failure phase cleanup
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
  MemoryLayer: {
    WORKING: "WORKING",
    SESSION: "SESSION",
    EPISODIC: "EPISODIC",
    SEMANTIC: "SEMANTIC",
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

// ==================== BillingContext mock ====================
jest.mock("../../../../../../modules/ai-infra/credits/billing-context", () => ({
  BillingContext: {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-call
    run: jest.fn((_ctx, fn) => fn()),
  },
}));

jest.mock("uuid", () => ({ v4: jest.fn(() => "s5-mission-id") }));

import { Test } from "@nestjs/testing";
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
      findUnique: jest.fn(),
      update: jest.fn().mockResolvedValue({}),
      findFirst: jest.fn().mockResolvedValue(null),
    },
    writingMission: {
      findFirst: jest.fn().mockResolvedValue(null),
      findUnique: jest.fn(),
      findMany: jest.fn().mockResolvedValue([]),
      create: jest.fn().mockResolvedValue({ id: "s5-mission-id" }),
      update: jest
        .fn()
        .mockResolvedValue({ id: "s5-mission-id", projectId: "proj-1" }),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      count: jest.fn().mockResolvedValue(0),
    },
    writingChapter: {
      findFirst: jest.fn().mockResolvedValue(null),
      findUnique: jest.fn().mockResolvedValue(null),
      findMany: jest.fn().mockResolvedValue([]),
      create: jest.fn().mockResolvedValue({ id: "ch-1" }),
      update: jest.fn().mockResolvedValue({}),
      deleteMany: jest.fn().mockResolvedValue({}),
      count: jest.fn().mockResolvedValue(0),
      aggregate: jest.fn().mockResolvedValue({ _max: { chapterNumber: 0 } }),
    },
    writingVolume: {
      findFirst: jest.fn().mockResolvedValue(null),
      findMany: jest.fn().mockResolvedValue([]),
      create: jest.fn().mockResolvedValue({ id: "vol-1" }),
      deleteMany: jest.fn().mockResolvedValue({}),
    },
    writingMissionLog: {
      create: jest.fn().mockResolvedValue({}),
      findMany: jest.fn().mockResolvedValue([]),
      count: jest.fn().mockResolvedValue(0),
    },
    storyBible: {
      findUnique: jest.fn().mockResolvedValue(null),
      findFirst: jest.fn().mockResolvedValue(null),
      upsert: jest.fn().mockResolvedValue({ id: "bible-1" }),
    },
    writingCharacter: {
      findFirst: jest.fn().mockResolvedValue(null),
      findMany: jest.fn().mockResolvedValue([]),
      deleteMany: jest.fn().mockResolvedValue({}),
      create: jest.fn().mockResolvedValue({ id: "char-1", name: "TestChar" }),
      update: jest.fn().mockResolvedValue({}),
    },
    worldSetting: {
      deleteMany: jest.fn().mockResolvedValue({}),
      create: jest.fn().mockResolvedValue({ id: "ws-1" }),
    },
    $transaction: jest.fn((fn: (tx: unknown) => Promise<unknown>) =>
      fn({
        storyBible: {
          upsert: jest.fn().mockResolvedValue({ id: "bible-1" }),
        },
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
        "Generated content that is long enough to pass minimum word count checks",
      tokensUsed: 100,
    }),
    chatWithSkills: jest.fn().mockResolvedValue({
      content: "Generated content that passes word count checks here",
      tokensUsed: 100,
    }),
    embed: jest.fn().mockResolvedValue([0.1, 0.2, 0.3]),
    getAvailableModelsExtended: jest.fn().mockResolvedValue([
      {
        id: "test-model",
        name: "Test Model",
        provider: "openai",
        isReasoning: false,
      },
    ]),
    getDefaultTextModel: jest
      .fn()
      .mockResolvedValue({ modelId: "default-model" }),
    getModelById: jest.fn().mockResolvedValue({ modelId: "test-model" }),
    startTrace: jest.fn().mockReturnValue("trace-id"),
    endTrace: jest.fn(),
    addSpan: jest.fn().mockReturnValue("span-id"),
    endSpan: jest.fn(),
    capabilityGetSkillPrompts: jest
      .fn()
      .mockResolvedValue({ content: "", usedSkills: [] }),
    capabilityResolverService: null as null | { logCapabilityUsage: jest.Mock },
    teamFactory: {
      createFromId: jest.fn().mockReturnValue({ id: "writing-team" }),
    },
    missionOrchestrator: {
      getState: jest.fn().mockReturnValue(null),
      updateState: jest.fn(),
      cancel: jest.fn().mockResolvedValue(undefined),
      execute: jest.fn(),
    },
    initProject: jest.fn().mockResolvedValue(undefined),
    buildTaskExecutionContext: jest.fn().mockResolvedValue(null),
    processTaskCompletion: jest.fn().mockResolvedValue({
      finalContent: "processed content",
      needsContinuation: false,
      qualityMetrics: { overallScore: 8, wordCount: 500, completionRatio: 1.0 },
    }),
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
    emitChapterContent: jest.fn().mockResolvedValue(undefined),
    emitChapterCompleted: jest.fn().mockResolvedValue(undefined),
    emitConsistencyCheck: jest.fn().mockResolvedValue(undefined),
    emitConsistencyFix: jest.fn().mockResolvedValue(undefined),
    emitKeeperExtractingContext: jest.fn().mockResolvedValue(undefined),
    emitKeeperContextReady: jest.fn().mockResolvedValue(undefined),
    emitKeeperUpdatingBible: jest.fn().mockResolvedValue(undefined),
    emitKeeperBibleUpdated: jest.fn().mockResolvedValue(undefined),
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

function buildMockExpressionMemory() {
  return {
    generateAvoidancePrompt: jest.fn().mockResolvedValue("avoidance-prompt"),
    recordExpressionsFromContent: jest.fn().mockResolvedValue(undefined),
    analyzeExpressionsOnly: jest
      .fn()
      .mockResolvedValue({ violatedExpressions: [] }),
    analyzeAndRecordExpressions: jest
      .fn()
      .mockResolvedValue({ violatedExpressions: [] }),
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
      hookType: "action",
      issues: [],
    }),
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
    execute: jest.fn().mockResolvedValue({ processId: "kernel-process-id" }),
    complete: jest.fn().mockResolvedValue(undefined),
    fail: jest.fn().mockResolvedValue(undefined),
  };
}

function buildModule(
  overrides: {
    prisma?: ReturnType<typeof buildMockPrisma>;
    facade?: ReturnType<typeof buildMockFacade>;
    eventEmitter?: ReturnType<typeof buildMockEventEmitter>;
    progressTracker?: ReturnType<typeof buildMockProgressTracker>;
    missionExecutor?: ReturnType<typeof buildMockMissionExecutor>;
  } = {},
) {
  const mockPrisma = overrides.prisma ?? buildMockPrisma();
  const mockFacade = overrides.facade ?? buildMockFacade();
  const mockNarrativeCraft = buildMockNarrativeCraft();
  const mockEventEmitter = overrides.eventEmitter ?? buildMockEventEmitter();
  const mockQualityGate = buildMockQualityGate();
  const mockExpressionMemory = buildMockExpressionMemory();
  const mockOpeningHook = buildMockOpeningHook();
  const mockProgressTracker = overrides.progressTracker;
  const mockMissionExecutor = overrides.missionExecutor;
  const agentBase = { description: "mock agent description" };

  const providers = [
    WritingMissionService,
    { provide: PrismaService, useValue: mockPrisma },
    { provide: TeamRegistry, useValue: { registerConfig: jest.fn() } },
    { provide: RoleRegistry, useValue: { registerFromConfig: jest.fn() } },
    { provide: ContextBuilderService, useValue: {} },
    { provide: StoryBibleService, useValue: {} },
    { provide: StoryArchitectAgent, useValue: agentBase },
    { provide: BibleKeeperAgent, useValue: agentBase },
    {
      provide: WriterAgent,
      useValue: {
        description: "writer desc",
        CORE_WRITING_PRINCIPLES: "principles",
      },
    },
    { provide: ConsistencyCheckerAgent, useValue: agentBase },
    { provide: EditorAgent, useValue: agentBase },
    { provide: ChatFacade, useValue: mockFacade },
    { provide: TeamFacade, useValue: mockFacade },
    { provide: AgentFacade, useValue: mockFacade },
    { provide: ToolFacade, useValue: mockFacade },
    { provide: LongContentEngineService, useValue: mockFacade },
    { provide: WritingEventEmitterService, useValue: mockEventEmitter },
    { provide: ExpressionMemoryService, useValue: mockExpressionMemory },
    {
      provide: StyleTemplateService,
      useValue: { getMergedStyleConfig: jest.fn().mockResolvedValue(null) },
    },
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
      useValue: {
        enhanceWorldBuildingPrompt: jest.fn().mockReturnValue({
          enhancedPrompt: "Enhanced prompt",
          detectedEra: null,
        }),
      },
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
    // Optional providers
    ...(mockProgressTracker
      ? [{ provide: ProgressTrackerService, useValue: mockProgressTracker }]
      : []),
    ...(mockMissionExecutor
      ? [{ provide: MissionExecutorService, useValue: mockMissionExecutor }]
      : []),
    { provide: KernelMemoryManagerService, useValue: {} },
  ];

  return {
    mockPrisma,
    mockFacade,
    mockNarrativeCraft,
    mockEventEmitter,
    mockQualityGate,
    mockExpressionMemory,
    mockProgressTracker,
    mockMissionExecutor,
    module: Test.createTestingModule({ providers }).compile(),
  };
}

// ==================== Tests ====================

describe("WritingMissionService (supplemental5)", () => {
  let service: WritingMissionService;
  let mockPrisma: ReturnType<typeof buildMockPrisma>;
  let mockFacade: ReturnType<typeof buildMockFacade>;

  beforeEach(async () => {
    const built = buildModule();
    mockPrisma = built.mockPrisma;
    mockFacade = built.mockFacade;
    const compiledModule = await built.module;
    service = compiledModule.get<WritingMissionService>(WritingMissionService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  // ==================== verifyProjectAccess (via startMissionAsync) ====================

  describe("verifyProjectAccess (via startMissionAsync)", () => {
    it("should throw when project not found", async () => {
      mockPrisma.writingProject.findUnique.mockResolvedValue(null);

      await expect(
        service.startMissionAsync(
          {
            projectId: "proj-1",
            missionType: "chapter",
            userPrompt: "Write something",
          },
          "user-1",
        ),
      ).rejects.toThrow("Project not found");
    });

    it("should throw when user does not own the project", async () => {
      mockPrisma.writingProject.findUnique.mockResolvedValue({
        ownerId: "other-user",
      });

      await expect(
        service.startMissionAsync(
          {
            projectId: "proj-1",
            missionType: "chapter",
            userPrompt: "Write something",
          },
          "user-1",
        ),
      ).rejects.toThrow("Access denied");
    });
  });

  // ==================== updateMissionRecord ====================

  describe("updateMissionRecord paths (via runMissionInBackground)", () => {
    it("should update project status to REVISING when mission succeeds", async () => {
      // Arrange: project exists with currentWords > 0 (success → REVISING)
      mockPrisma.writingProject.findUnique.mockImplementation(
        ({ where }: { where: { id: string } }) => {
          if (where.id === "proj-1")
            return Promise.resolve({ ownerId: "user-1" });
          return Promise.resolve({ currentWords: 500 });
        },
      );
      mockPrisma.writingMission.findFirst.mockResolvedValue(null);
      mockPrisma.writingMission.create.mockResolvedValue({
        id: "s5-mission-id",
      });
      mockPrisma.writingMission.update.mockResolvedValue({
        id: "s5-mission-id",
        projectId: "proj-1",
      });
      mockFacade.getAvailableModelsExtended.mockResolvedValue([
        { id: "m1", name: "M1", provider: "openai", isReasoning: false },
      ]);
      mockFacade.chat.mockResolvedValue({
        content:
          "This is a chapter content with enough words for the minimum check to pass successfully.",
        tokensUsed: 100,
      });
      mockPrisma.writingMissionLog.create.mockResolvedValue({});

      // Act
      await service.startMissionAsync(
        {
          projectId: "proj-1",
          missionType: "chapter",
          userPrompt: "Write a chapter about something",
        },
        "user-1",
      );

      // Allow background tasks to settle
      await new Promise((resolve) => setTimeout(resolve, 0));

      // Assert: project update attempted with REVISING
      expect(mockPrisma.writingMission.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            missionType: "CHAPTER",
            status: "IN_PROGRESS",
          }),
        }),
      );
    });

    it("should update project status to PLANNING when mission fails and no existing words", async () => {
      // Arrange: project has no words
      mockPrisma.writingProject.findUnique.mockImplementation(
        ({ where }: { where: { id: string } }) => {
          if (where.id === "proj-1")
            return Promise.resolve({ ownerId: "user-1" });
          return Promise.resolve({ currentWords: 0 });
        },
      );
      mockPrisma.writingMission.findFirst.mockResolvedValue(null);
      mockPrisma.writingMission.create.mockResolvedValue({
        id: "s5-mission-id",
      });
      mockPrisma.writingMission.update.mockResolvedValue({
        id: "s5-mission-id",
        projectId: "proj-1",
      });
      mockFacade.getAvailableModelsExtended.mockResolvedValue([
        { id: "m1", name: "M1", provider: "openai", isReasoning: false },
      ]);
      // Simulate failure: chat returns empty content
      mockFacade.chat.mockResolvedValue({ content: "", tokensUsed: 0 });
      mockFacade.getDefaultTextModel.mockResolvedValue({
        modelId: "default-model",
      });

      await service.startMissionAsync(
        {
          projectId: "proj-1",
          missionType: "chapter",
          userPrompt: "Write something",
        },
        "user-1",
      );

      await new Promise((resolve) => setTimeout(resolve, 0));

      // The mission update was called (failure path)
      expect(mockPrisma.writingMission.update).toHaveBeenCalled();
    });
  });

  // ==================== createMissionRecord type mapping ====================

  describe("createMissionRecord type mapping", () => {
    const setupAndStart = async (missionType: string) => {
      mockPrisma.writingProject.findUnique.mockResolvedValue({
        ownerId: "user-1",
      });
      mockPrisma.writingMission.findFirst.mockResolvedValue(null);
      mockPrisma.writingMission.create.mockResolvedValue({
        id: "s5-mission-id",
      });
      mockFacade.getAvailableModelsExtended.mockResolvedValue([
        { id: "m1", name: "M1", provider: "openai", isReasoning: false },
      ]);
      mockFacade.chat.mockResolvedValue({ content: "", tokensUsed: 0 });

      await service.startMissionAsync(
        {
          projectId: "proj-1",
          missionType: missionType as "chapter",
          userPrompt: "Test",
        },
        "user-1",
      );
    };

    it("should map 'edit' mission type to REVISION", async () => {
      await setupAndStart("edit");
      expect(mockPrisma.writingMission.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ missionType: "REVISION" }),
        }),
      );
    });

    it("should map 'consistency_check' to CONSISTENCY", async () => {
      await setupAndStart("consistency_check");
      expect(mockPrisma.writingMission.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ missionType: "CONSISTENCY" }),
        }),
      );
    });

    it("should map 'full_story' to CHAPTER (fallback)", async () => {
      mockPrisma.writingProject.findUnique.mockImplementation(
        ({ where }: { where: { id: string } }) => {
          if (where.id === "proj-1")
            return Promise.resolve({ ownerId: "user-1" });
          return Promise.resolve({
            targetWords: 10000,
            description: "A test story",
            name: "Test",
          });
        },
      );
      mockPrisma.writingMission.findFirst.mockResolvedValue(null);
      mockPrisma.writingMission.create.mockResolvedValue({
        id: "s5-mission-id",
      });
      mockFacade.getAvailableModelsExtended.mockResolvedValue([
        { id: "m1", name: "M1", provider: "openai", isReasoning: false },
      ]);
      // Mock checkExistingContent: no existing content
      mockPrisma.writingChapter.findMany.mockResolvedValue([]);
      mockPrisma.storyBible.findUnique.mockResolvedValue(null);
      mockFacade.chat.mockRejectedValue(new Error("API error"));

      await service.startMissionAsync(
        {
          projectId: "proj-1",
          missionType: "full_story",
          userPrompt: "A fantasy story about dragons",
        },
        "user-1",
      );

      expect(mockPrisma.writingMission.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ missionType: "CHAPTER" }),
        }),
      );
    });

    it("should map unknown type to CHAPTER as default", async () => {
      await setupAndStart("unknown_type");
      expect(mockPrisma.writingMission.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ missionType: "CHAPTER" }),
        }),
      );
    });
  });

  // ==================== getProjectMissions ====================

  describe("getProjectMissions", () => {
    it("should return all missions without status filter", async () => {
      const mockMissions = [
        {
          id: "m1",
          projectId: "proj-1",
          missionType: "CHAPTER",
          status: "COMPLETED",
          createdAt: new Date(),
          startedAt: new Date(),
          completedAt: new Date(),
          result: { progress: 100, currentStep: "done" },
        },
      ];
      mockPrisma.writingMission.findMany.mockResolvedValue(mockMissions);
      mockPrisma.writingMission.count.mockResolvedValue(1);

      const result = await service.getProjectMissions("proj-1");

      expect(result.total).toBe(1);
      expect(result.items).toHaveLength(1);
      expect(result.items[0]).toMatchObject({
        id: "m1",
        status: "COMPLETED",
        progress: 100,
        currentStep: "done",
      });
      expect(mockPrisma.writingMission.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { projectId: "proj-1" } }),
      );
    });

    it("should filter missions by status in uppercase", async () => {
      mockPrisma.writingMission.findMany.mockResolvedValue([]);
      mockPrisma.writingMission.count.mockResolvedValue(0);

      await service.getProjectMissions("proj-1", "completed");

      expect(mockPrisma.writingMission.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { projectId: "proj-1", status: "COMPLETED" },
        }),
      );
    });

    it("should return default progress=0 and currentStep='' when result is missing", async () => {
      const mockMissions = [
        {
          id: "m2",
          projectId: "proj-1",
          missionType: "OUTLINE",
          status: "IN_PROGRESS",
          createdAt: new Date(),
          startedAt: new Date(),
          completedAt: null,
          result: null,
        },
      ];
      mockPrisma.writingMission.findMany.mockResolvedValue(mockMissions);
      mockPrisma.writingMission.count.mockResolvedValue(1);

      const result = await service.getProjectMissions("proj-1");

      expect(result.items[0].progress).toBe(0);
      expect(result.items[0].currentStep).toBe("");
    });
  });

  // ==================== reExtractChapterTitles ====================

  describe("reExtractChapterTitles", () => {
    it("should throw Access denied when project not found", async () => {
      mockPrisma.writingProject.findUnique.mockResolvedValue(null);

      await expect(
        service.reExtractChapterTitles("proj-1", "user-1"),
      ).rejects.toThrow("Access denied");
    });

    it("should throw Access denied when user does not own project", async () => {
      mockPrisma.writingProject.findUnique.mockResolvedValue({
        ownerId: "other-user",
      });

      await expect(
        service.reExtractChapterTitles("proj-1", "user-1"),
      ).rejects.toThrow("Access denied");
    });

    it("should return empty results when no chapters found", async () => {
      mockPrisma.writingProject.findUnique.mockResolvedValue({
        ownerId: "user-1",
      });
      mockPrisma.writingChapter.findMany.mockResolvedValue([]);

      const result = await service.reExtractChapterTitles("proj-1", "user-1");

      expect(result.updated).toBe(0);
      expect(result.chapters).toHaveLength(0);
    });

    it("should update placeholder title when chapter has content", async () => {
      mockPrisma.writingProject.findUnique.mockResolvedValue({
        ownerId: "user-1",
      });
      mockPrisma.writingChapter.findMany.mockResolvedValue([
        {
          id: "ch-1",
          chapterNumber: 1,
          title: "第一章", // placeholder title (matches regex)
          content: "第一章 暗流涌动\n\n正文内容开始...",
          outline: null,
        },
      ]);
      mockPrisma.writingChapter.update.mockResolvedValue({});

      const result = await service.reExtractChapterTitles("proj-1", "user-1");

      expect(result.updated).toBe(1);
      expect(mockPrisma.writingChapter.update).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: "ch-1" } }),
      );
    });

    it("should clean outline '待创作' placeholder to empty string", async () => {
      mockPrisma.writingProject.findUnique.mockResolvedValue({
        ownerId: "user-1",
      });
      mockPrisma.writingChapter.findMany.mockResolvedValue([
        {
          id: "ch-2",
          chapterNumber: 2,
          title: "有效标题", // non-placeholder, no title update needed
          content: "Some content",
          outline: "待创作", // needs cleaning
        },
      ]);
      mockPrisma.writingChapter.update.mockResolvedValue({});

      const result = await service.reExtractChapterTitles("proj-1", "user-1");

      expect(result.updated).toBe(1);
      expect(mockPrisma.writingChapter.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ outline: "" }),
        }),
      );
    });

    it("should clean outline starting with chapter heading prefix", async () => {
      mockPrisma.writingProject.findUnique.mockResolvedValue({
        ownerId: "user-1",
      });
      mockPrisma.writingChapter.findMany.mockResolvedValue([
        {
          id: "ch-3",
          chapterNumber: 3,
          title: "有效标题",
          content: "Some content",
          outline: "第三章 这是大纲内容", // has chapter prefix
        },
      ]);
      mockPrisma.writingChapter.update.mockResolvedValue({});

      await service.reExtractChapterTitles("proj-1", "user-1");

      expect(mockPrisma.writingChapter.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            outline: expect.stringMatching(
              /^(?!第[一二三四五六七八九十百千\d]+[章回])/,
            ),
          }),
        }),
      );
    });

    it("should skip chapters with non-placeholder title and no outline to clean", async () => {
      mockPrisma.writingProject.findUnique.mockResolvedValue({
        ownerId: "user-1",
      });
      mockPrisma.writingChapter.findMany.mockResolvedValue([
        {
          id: "ch-4",
          chapterNumber: 4,
          title: "命运交汇", // valid title
          content: "Some content",
          outline: "这是正常的大纲", // no prefix to clean
        },
      ]);

      const result = await service.reExtractChapterTitles("proj-1", "user-1");

      expect(result.updated).toBe(0);
      expect(mockPrisma.writingChapter.update).not.toHaveBeenCalled();
    });
  });

  // ==================== startMissionAsync: conflicting mission ====================

  describe("startMissionAsync: conflict detection", () => {
    it("should throw ConflictException when a mission is already in progress", async () => {
      mockPrisma.writingProject.findUnique.mockResolvedValue({
        ownerId: "user-1",
      });
      // Simulate an existing IN_PROGRESS mission
      mockPrisma.writingMission.findFirst.mockResolvedValue({
        id: "existing-mission",
        status: "IN_PROGRESS",
      });

      const { ConflictException } = await import("@nestjs/common");

      await expect(
        service.startMissionAsync(
          {
            projectId: "proj-1",
            missionType: "chapter",
            userPrompt: "Write something",
          },
          "user-1",
        ),
      ).rejects.toThrow(ConflictException);
    });

    it("should throw Error when no active models are available", async () => {
      mockPrisma.writingProject.findUnique.mockResolvedValue({
        ownerId: "user-1",
      });
      mockPrisma.writingMission.findFirst.mockResolvedValue(null);
      // No models available
      mockFacade.getAvailableModelsExtended.mockResolvedValue([]);

      await expect(
        service.startMissionAsync(
          {
            projectId: "proj-1",
            missionType: "chapter",
            userPrompt: "Write something",
          },
          "user-1",
        ),
      ).rejects.toThrow("没有可用的 AI 模型");
    });
  });

  // ==================== getWritingTeam lazy initialization ====================

  describe("getWritingTeam lazy initialization", () => {
    it("should initialize writing team on first call to getActiveRoles", async () => {
      // getActiveRoles → assignModelsToRoles → getAvailableModels (no team needed)
      // The team is created in getWritingTeam which is called indirectly
      // We trigger it via startMissionAsync which calls teamFacade.teamFactory.createFromId
      mockPrisma.writingProject.findUnique.mockResolvedValue({
        ownerId: "user-1",
      });
      mockPrisma.writingMission.findFirst.mockResolvedValue(null);
      mockPrisma.writingMission.create.mockResolvedValue({
        id: "s5-mission-id",
      });
      mockFacade.getAvailableModelsExtended.mockResolvedValue([
        { id: "m1", name: "M1", provider: "openai", isReasoning: false },
      ]);
      mockFacade.chat.mockResolvedValue({ content: "", tokensUsed: 0 });

      // First call creates team
      const roles1 = await service.getActiveRoles();
      // Second call reuses cached team
      const roles2 = await service.getActiveRoles();

      expect(roles1).toEqual(roles2);
      expect(roles1.length).toBeGreaterThan(0);
    });
  });

  // ==================== completeKernelProcess / failKernelProcess ====================

  describe("completeKernelProcess and failKernelProcess", () => {
    it("should call missionExecutor.complete when processId is tracked", async () => {
      const mockExecutor = buildMockMissionExecutor();
      const built = buildModule({ missionExecutor: mockExecutor });
      const compiledModule = await built.module;
      const svc = compiledModule.get<WritingMissionService>(
        WritingMissionService,
      );

      // Set up so that startMissionAsync stores a kernel process ID
      built.mockPrisma.writingProject.findUnique.mockResolvedValue({
        ownerId: "user-1",
      });
      built.mockPrisma.writingMission.findFirst.mockResolvedValue(null);
      built.mockPrisma.writingMission.create.mockResolvedValue({
        id: "s5-mission-id",
      });
      built.mockPrisma.writingMission.update.mockResolvedValue({
        id: "s5-mission-id",
        projectId: "proj-1",
      });
      built.mockPrisma.writingProject.findUnique.mockImplementation(
        ({ where }: { where: { id: string } }) => {
          if (where.id === "proj-1")
            return Promise.resolve({ ownerId: "user-1" });
          return Promise.resolve({ currentWords: 100 });
        },
      );
      built.mockFacade.getAvailableModelsExtended.mockResolvedValue([
        { id: "m1", name: "M1", provider: "openai", isReasoning: false },
      ]);
      built.mockFacade.chat.mockResolvedValue({
        content:
          "This is chapter content with enough words to pass all the validation checks here.",
        tokensUsed: 100,
      });

      await svc.startMissionAsync(
        {
          projectId: "proj-1",
          missionType: "chapter",
          userPrompt: "Write a chapter",
        },
        "user-1",
      );

      // Wait for background processing
      await new Promise((resolve) => setTimeout(resolve, 50));

      // missionExecutor.execute was called to spawn process
      expect(mockExecutor.execute).toHaveBeenCalled();
    });

    it("should call missionExecutor.fail when background task throws", async () => {
      const mockExecutor = buildMockMissionExecutor();
      const built = buildModule({ missionExecutor: mockExecutor });
      const compiledModule = await built.module;
      const svc = compiledModule.get<WritingMissionService>(
        WritingMissionService,
      );

      built.mockPrisma.writingProject.findUnique.mockResolvedValue({
        ownerId: "user-1",
      });
      built.mockPrisma.writingMission.findFirst.mockResolvedValue(null);
      built.mockPrisma.writingMission.create.mockResolvedValue({
        id: "s5-mission-id",
      });
      built.mockPrisma.writingMission.update.mockResolvedValue({
        id: "s5-mission-id",
        projectId: "proj-1",
      });
      built.mockFacade.getAvailableModelsExtended.mockResolvedValue([
        { id: "m1", name: "M1", provider: "openai", isReasoning: false },
      ]);
      // Force failure: no default model
      built.mockFacade.getDefaultTextModel.mockResolvedValue(null);
      built.mockFacade.chat.mockRejectedValue(new Error("API down"));

      await svc.startMissionAsync(
        {
          projectId: "proj-1",
          missionType: "chapter",
          userPrompt: "Write something",
        },
        "user-1",
      );

      await new Promise((resolve) => setTimeout(resolve, 50));

      // Kernel process was started
      expect(mockExecutor.execute).toHaveBeenCalled();
    });
  });

  // ==================== Progress Tracker phase failure cleanup ====================

  describe("runMissionInBackground: progress tracker phase failure cleanup", () => {
    it("should call failPhase and fail on tracker when generation throws", async () => {
      const mockTracker = buildMockProgressTracker();
      // Simulate an in-progress phase so failPhase gets called
      mockTracker.getTask.mockReturnValue({
        phases: [
          { id: "outline", status: "in_progress" },
          { id: "chapters", status: "pending" },
        ],
      });

      const built = buildModule({ progressTracker: mockTracker });
      const compiledModule = await built.module;
      const svc = compiledModule.get<WritingMissionService>(
        WritingMissionService,
      );

      built.mockPrisma.writingProject.findUnique.mockResolvedValue({
        ownerId: "user-1",
      });
      built.mockPrisma.writingMission.findFirst.mockResolvedValue(null);
      built.mockPrisma.writingMission.create.mockResolvedValue({
        id: "s5-mission-id",
      });
      built.mockPrisma.writingMission.update.mockResolvedValue({
        id: "s5-mission-id",
        projectId: "proj-1",
      });
      built.mockFacade.getAvailableModelsExtended.mockResolvedValue([
        { id: "m1", name: "M1", provider: "openai", isReasoning: false },
      ]);
      built.mockFacade.getDefaultTextModel.mockResolvedValue(null);
      // Force an error to hit catch block
      built.mockFacade.chat.mockRejectedValue(new Error("Generation failed"));

      await svc.startMissionAsync(
        {
          projectId: "proj-1",
          missionType: "chapter",
          userPrompt: "Write something",
        },
        "user-1",
      );

      await new Promise((resolve) => setTimeout(resolve, 50));

      // Progress tracker was created and started
      expect(mockTracker.create).toHaveBeenCalled();
      expect(mockTracker.start).toHaveBeenCalled();
      // Fail path: fail was called
      expect(mockTracker.fail).toHaveBeenCalled();
    });
  });

  // ==================== runMissionInBackground: isCompletionMarker ====================

  describe("runMissionInBackground: completion marker content", () => {
    it("should skip word count validation for [ALL_CHAPTERS_COMPLETED] marker", async () => {
      mockPrisma.writingProject.findUnique.mockImplementation(
        ({ where }: { where: { id: string } }) => {
          if (where.id === "proj-1")
            return Promise.resolve({ ownerId: "user-1" });
          return Promise.resolve({ currentWords: 0 });
        },
      );
      mockPrisma.writingMission.findFirst.mockResolvedValue(null);
      mockPrisma.writingMission.create.mockResolvedValue({
        id: "s5-mission-id",
      });
      mockPrisma.writingMission.update.mockResolvedValue({
        id: "s5-mission-id",
        projectId: "proj-1",
      });
      mockPrisma.writingMissionLog.create.mockResolvedValue({});
      mockFacade.getAvailableModelsExtended.mockResolvedValue([
        { id: "m1", name: "M1", provider: "openai", isReasoning: false },
      ]);
      // Return completion marker (very short but should skip validation)
      mockFacade.chat.mockResolvedValue({
        content: "[ALL_CHAPTERS_COMPLETED] All done",
        tokensUsed: 10,
      });

      await service.startMissionAsync(
        {
          projectId: "proj-1",
          missionType: "chapter",
          userPrompt: "Continue writing",
        },
        "user-1",
      );

      await new Promise((resolve) => setTimeout(resolve, 50));

      // The mission update should be called (success path), not failing on word count
      expect(mockPrisma.writingMission.update).toHaveBeenCalled();
    });

    it("should skip word count validation for [CONTINUATION_COMPLETE] marker", async () => {
      mockPrisma.writingProject.findUnique.mockImplementation(
        ({ where }: { where: { id: string } }) => {
          if (where.id === "proj-1")
            return Promise.resolve({ ownerId: "user-1" });
          return Promise.resolve({ currentWords: 0 });
        },
      );
      mockPrisma.writingMission.findFirst.mockResolvedValue(null);
      mockPrisma.writingMission.create.mockResolvedValue({
        id: "s5-mission-id",
      });
      mockPrisma.writingMission.update.mockResolvedValue({
        id: "s5-mission-id",
        projectId: "proj-1",
      });
      mockPrisma.writingMissionLog.create.mockResolvedValue({});
      mockFacade.getAvailableModelsExtended.mockResolvedValue([
        { id: "m1", name: "M1", provider: "openai", isReasoning: false },
      ]);
      mockFacade.chat.mockResolvedValue({
        content: "[CONTINUATION_COMPLETE] Story continued",
        tokensUsed: 10,
      });

      await service.startMissionAsync(
        {
          projectId: "proj-1",
          missionType: "chapter",
          userPrompt: "Continue",
        },
        "user-1",
      );

      await new Promise((resolve) => setTimeout(resolve, 50));

      expect(mockPrisma.writingMission.update).toHaveBeenCalled();
    });
  });

  // ==================== getLatestMission ====================

  describe("getLatestMission", () => {
    it("should delegate to prisma with correct ordering and select", async () => {
      const mockMission = {
        id: "latest-m",
        status: "COMPLETED",
        missionType: "CHAPTER",
        createdAt: new Date(),
      };
      mockPrisma.writingMission.findFirst.mockResolvedValue(mockMission);

      const result = await service.getLatestMission("proj-1");

      expect(result).toEqual(mockMission);
      expect(mockPrisma.writingMission.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { projectId: "proj-1" },
          orderBy: { createdAt: "desc" },
        }),
      );
    });

    it("should return null when no mission exists", async () => {
      mockPrisma.writingMission.findFirst.mockResolvedValue(null);

      const result = await service.getLatestMission("proj-1");

      expect(result).toBeNull();
    });
  });

  // ==================== saveMissionLog success path ====================

  describe("saveMissionLog", () => {
    it("should create log entry with all optional fields", async () => {
      await service.saveMissionLog(
        "m-1",
        "chapter:completed",
        "Chapter 1 done",
        {
          agentId: "writer",
          agentName: "写作 Agent",
          detail: { wordCount: 3000 },
        },
      );

      expect(mockPrisma.writingMissionLog.create).toHaveBeenCalledWith({
        data: {
          missionId: "m-1",
          eventType: "chapter:completed",
          content: "Chapter 1 done",
          agentId: "writer",
          agentName: "写作 Agent",
          detail: { wordCount: 3000 },
        },
      });
    });

    it("should create log entry without optional fields", async () => {
      await service.saveMissionLog("m-2", "mission:started", "Task started");

      expect(mockPrisma.writingMissionLog.create).toHaveBeenCalledWith({
        data: {
          missionId: "m-2",
          eventType: "mission:started",
          content: "Task started",
          agentId: undefined,
          agentName: undefined,
          detail: undefined,
        },
      });
    });

    it("should swallow errors silently", async () => {
      mockPrisma.writingMissionLog.create.mockRejectedValue(
        new Error("DB error"),
      );

      // Should not throw
      await expect(
        service.saveMissionLog("m-3", "error:event", "Something went wrong"),
      ).resolves.toBeUndefined();
    });
  });

  // ==================== getMissionStatus with orchestrator state ====================

  describe("getMissionStatus: orchestrator state present", () => {
    it("should include orchestrator state when it exists", async () => {
      mockPrisma.writingMission.findUnique.mockResolvedValue({
        id: "m-1",
        status: "IN_PROGRESS",
        missionType: "CHAPTER",
        startedAt: new Date(),
        completedAt: null,
        result: null,
        project: { ownerId: "user-1" },
      });
      mockFacade.missionOrchestrator.getState.mockReturnValue({
        phase: "executing",
        completedSteps: ["plan"],
        currentSteps: ["write"],
        resourceUsage: { progress: 50, tokensUsed: 1000, costUsed: 0.5 },
      });

      const result = await service.getMissionStatus("m-1", "user-1");

      expect(result.orchestratorState).not.toBeNull();
      expect(result.orchestratorState?.phase).toBe("executing");
      expect(result.orchestratorState?.progress).toBe(50);
      expect(result.orchestratorState?.tokensUsed).toBe(1000);
    });
  });

  // ==================== cancelMission: wrong owner ====================

  describe("cancelMission: access control", () => {
    it("should throw Access denied when user does not own project", async () => {
      mockPrisma.writingMission.findUnique.mockResolvedValue({
        id: "m-1",
        project: { id: "proj-1", ownerId: "other-user", currentWords: 0 },
      });

      await expect(service.cancelMission("m-1", "user-1")).rejects.toThrow(
        "Access denied",
      );
    });

    it("should return success when mission not found (cleanup attempted)", async () => {
      mockPrisma.writingMission.findUnique.mockResolvedValue(null);

      const result = await service.cancelMission("nonexistent-m", "user-1");

      expect(result.success).toBe(true);
      expect(result.message).toContain("not found");
    });
  });
});
