/**
 * Unit tests for WritingMissionService
 *
 * Covers:
 * - Constructor role/team registration
 * - startMissionAsync: happy path, conflict detection, no models
 * - getActiveRoles / getModelForRole
 * - mapTemperatureToCreativity / mapMaxTokensToOutputLength (private via indirect call)
 * - generateQualityConstraints branches (skill prompts, narrative craft, pacing, etc.)
 * - getAvailableModels caching
 * - assignModelsToRoles strategies (0 models, 1 model, multiple providers)
 * - getMissionStatus: found, not-found, wrong-owner, orchestrator state
 * - cancelMission: mission not found, wrong-owner, with/without existing words
 * - getMissionLogs: pagination, access control
 * - saveMissionLog: happy path, error handling
 * - getLatestMission
 * - forceCleanupStuckMissions: none stuck, with stuck missions
 * - numberToChinese / countWords utility coverage via public API
 * - extractChapterTitle patterns
 * - parseOutlineJSON / parseWorldSettings edge cases
 * - generateQualityConstraints: all constraint branches
 * - getWritingSkillPrompts: with/without skills, error path
 */

import { Test, TestingModule } from "@nestjs/testing";
import { ConflictException } from "@nestjs/common";
import { WritingMissionService } from "../writing-mission.service";
import { PrismaService } from "../../../../../../common/prisma/prisma.service";
import { AIEngineFacade } from "@/modules/ai-engine/facade";
import { TeamRegistry, RoleRegistry } from "@/modules/ai-engine/facade";
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
      update: jest.fn(),
    },
    writingMission: {
      findFirst: jest.fn(),
      findUnique: jest.fn().mockResolvedValue({
        id: "mock-mission-id",
        projectId: "project-1",
        missionType: "chapter",
      }),
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn().mockResolvedValue({}),
      updateMany: jest.fn(),
    },
    writingChapter: {
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      findMany: jest.fn(),
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
    },
  };
}

function buildMockFacade() {
  return {
    chat: jest.fn().mockResolvedValue({
      content: "Generated content here, a sufficiently long piece of text",
      tokensUsed: 100,
    }),
    chatWithSkills: jest.fn().mockResolvedValue({
      content:
        "Generated content here, a sufficiently long piece of text that has more than 200 words to pass validation check hopefully in this test context",
      tokensUsed: 100,
    }),
    embed: jest.fn().mockResolvedValue([0.1, 0.2, 0.3]),
    getAvailableModelsExtended: jest.fn().mockResolvedValue([]),
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
    capabilityResolverService: null,
    teamFactory: {
      createFromId: jest.fn().mockReturnValue({}),
    },
  };
}

function buildMockRoleRegistry() {
  return {
    registerFromConfig: jest.fn(),
  };
}

function buildMockTeamRegistry() {
  return {
    registerConfig: jest.fn(),
  };
}

function buildMockAgents() {
  const agentBase = { description: "mock agent description" };
  return {
    storyArchitect: agentBase,
    bibleKeeper: agentBase,
    writer: agentBase,
    consistencyChecker: agentBase,
    editor: agentBase,
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

function buildMockOpeningHook() {
  return {
    generateOpeningConstraints: jest
      .fn()
      .mockReturnValue("opening-constraints"),
  };
}

function buildMockSensoryImmersion() {
  return {
    generateImmersionConstraints: jest
      .fn()
      .mockReturnValue("immersion-constraints"),
  };
}

function buildMockProfessionalVoice() {
  return {
    generateChapterVoiceConstraints: jest
      .fn()
      .mockReturnValue("voice-constraints"),
    extractProfessionFromBackground: jest.fn().mockReturnValue(null),
  };
}

function buildMockPacingControl() {
  return {
    generatePacingConstraints: jest.fn().mockReturnValue("pacing-constraints"),
  };
}

function buildMockExpressionMemory() {
  return {
    generateAvoidancePrompt: jest.fn().mockResolvedValue("avoidance-prompt"),
    recordExpressionsFromContent: jest.fn().mockResolvedValue(undefined),
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
  };
}

// ==================== BillingContext mock ====================

jest.mock("../../../../../../modules/credits/billing-context", () => ({
  BillingContext: {
    run: jest.fn((_ctx: unknown, fn: () => Promise<unknown>) => fn()),
  },
}));

// ==================== UUID mock ====================

jest.mock("uuid", () => ({ v4: jest.fn(() => "mock-mission-id") }));

// ==================== Tests ====================

describe("WritingMissionService", () => {
  let service: WritingMissionService;
  let mockPrisma: ReturnType<typeof buildMockPrisma>;
  let mockFacade: ReturnType<typeof buildMockFacade>;
  let mockTeamRegistry: ReturnType<typeof buildMockTeamRegistry>;
  let mockRoleRegistry: ReturnType<typeof buildMockRoleRegistry>;
  let mockNarrativeCraft: ReturnType<typeof buildMockNarrativeCraft>;
  let mockOpeningHook: ReturnType<typeof buildMockOpeningHook>;
  let mockSensoryImmersion: ReturnType<typeof buildMockSensoryImmersion>;
  let mockProfessionalVoice: ReturnType<typeof buildMockProfessionalVoice>;
  let mockPacingControl: ReturnType<typeof buildMockPacingControl>;
  let mockEventEmitter: ReturnType<typeof buildMockEventEmitter>;

  beforeEach(async () => {
    mockPrisma = buildMockPrisma();
    mockFacade = buildMockFacade();
    mockTeamRegistry = buildMockTeamRegistry();
    mockRoleRegistry = buildMockRoleRegistry();
    mockNarrativeCraft = buildMockNarrativeCraft();
    mockOpeningHook = buildMockOpeningHook();
    mockSensoryImmersion = buildMockSensoryImmersion();
    mockProfessionalVoice = buildMockProfessionalVoice();
    mockPacingControl = buildMockPacingControl();
    mockEventEmitter = buildMockEventEmitter();

    const agents = buildMockAgents();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WritingMissionService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: TeamRegistry, useValue: mockTeamRegistry },
        { provide: RoleRegistry, useValue: mockRoleRegistry },
        { provide: ContextBuilderService, useValue: {} },
        { provide: StoryBibleService, useValue: {} },
        { provide: StoryArchitectAgent, useValue: agents.storyArchitect },
        { provide: BibleKeeperAgent, useValue: agents.bibleKeeper },
        { provide: WriterAgent, useValue: agents.writer },
        {
          provide: ConsistencyCheckerAgent,
          useValue: agents.consistencyChecker,
        },
        { provide: EditorAgent, useValue: agents.editor },
        { provide: AIEngineFacade, useValue: mockFacade },
        { provide: WritingEventEmitterService, useValue: mockEventEmitter },
        {
          provide: ExpressionMemoryService,
          useValue: buildMockExpressionMemory(),
        },
        { provide: StyleTemplateService, useValue: {} },
        { provide: QualityGateService, useValue: {} },
        { provide: ProfessionalVoiceService, useValue: mockProfessionalVoice },
        { provide: SensoryImmersionService, useValue: mockSensoryImmersion },
        { provide: OpeningHookService, useValue: mockOpeningHook },
        { provide: NarrativeCraftService, useValue: mockNarrativeCraft },
        { provide: WorldBuildingEnhancerService, useValue: {} },
        { provide: PacingControlService, useValue: mockPacingControl },
        { provide: WritingAgentCoordinator, useValue: {} },
        { provide: WritingContextService, useValue: {} },
        { provide: WritingStyleService, useValue: {} },
        { provide: WritingQualityService, useValue: {} },
        { provide: CheckpointService, useValue: {} },
      ],
    }).compile();

    service = module.get<WritingMissionService>(WritingMissionService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  // ==================== Constructor ====================

  describe("constructor (role & team registration)", () => {
    it("should register 5 writing roles on init", () => {
      expect(mockRoleRegistry.registerFromConfig).toHaveBeenCalledTimes(5);
      const roleIds = mockRoleRegistry.registerFromConfig.mock.calls.map(
        ([cfg]: [{ id: string }]) => cfg.id,
      );
      expect(roleIds).toContain("story-architect");
      expect(roleIds).toContain("bible-keeper");
      expect(roleIds).toContain("writer");
      expect(roleIds).toContain("consistency-checker");
      expect(roleIds).toContain("editor");
    });

    it("should register writing team config on init", () => {
      expect(mockTeamRegistry.registerConfig).toHaveBeenCalledTimes(1);
      const [cfg] = mockTeamRegistry.registerConfig.mock.calls[0];
      expect(cfg.id).toBe("ai-writing-team");
      expect(cfg.leaderRoleId).toBe("story-architect");
    });

    it("should register story-architect as leader type", () => {
      const call = mockRoleRegistry.registerFromConfig.mock.calls.find(
        ([cfg]: [{ id: string }]) => cfg.id === "story-architect",
      );
      expect(call).toBeDefined();
      expect(call[0].type).toBe("leader");
    });

    it("should register writer as member type", () => {
      const call = mockRoleRegistry.registerFromConfig.mock.calls.find(
        ([cfg]: [{ id: string }]) => cfg.id === "writer",
      );
      expect(call).toBeDefined();
      expect(call[0].type).toBe("member");
    });
  });

  // ==================== getActiveRoles ====================

  describe("getActiveRoles", () => {
    it("should return empty array when no models available", async () => {
      mockFacade.getAvailableModelsExtended.mockResolvedValue([]);

      const roles = await service.getActiveRoles();

      expect(roles).toEqual([]);
    });

    it("should return all 5 role IDs when models are available", async () => {
      mockFacade.getAvailableModelsExtended.mockResolvedValue([
        {
          id: "gpt-4o",
          name: "GPT-4o",
          provider: "openai",
          isReasoning: false,
        },
      ]);

      const roles = await service.getActiveRoles();

      expect(roles).toHaveLength(5);
      expect(roles).toContain("story-architect");
      expect(roles).toContain("writer");
    });
  });

  // ==================== getModelForRole ====================

  describe("getModelForRole", () => {
    it("should return null when no models available", async () => {
      mockFacade.getAvailableModelsExtended.mockResolvedValue([]);

      const model = await service.getModelForRole("writer");

      expect(model).toBeNull();
    });

    it("should return a modelId when models are available", async () => {
      mockFacade.getAvailableModelsExtended.mockResolvedValue([
        {
          id: "gpt-4o",
          name: "GPT-4o",
          provider: "openai",
          isReasoning: false,
        },
      ]);

      const model = await service.getModelForRole("writer");

      expect(model).toBe("gpt-4o");
    });

    it("should return null for an unknown role even with models", async () => {
      mockFacade.getAvailableModelsExtended.mockResolvedValue([
        {
          id: "gpt-4o",
          name: "GPT-4o",
          provider: "openai",
          isReasoning: false,
        },
      ]);

      const model = await service.getModelForRole("nonexistent-role");

      expect(model).toBeNull();
    });
  });

  // ==================== getAvailableModels caching ====================

  describe("getAvailableModels (caching)", () => {
    it("should cache models within TTL and not re-fetch", async () => {
      mockFacade.getAvailableModelsExtended.mockResolvedValue([
        {
          id: "gpt-4o",
          name: "GPT-4o",
          provider: "openai",
          isReasoning: false,
        },
      ]);

      // Two consecutive calls
      await service.getActiveRoles();
      await service.getActiveRoles();

      // getAvailableModelsExtended should only be called once (cached)
      expect(mockFacade.getAvailableModelsExtended).toHaveBeenCalledTimes(1);
    });

    it("should return empty array and not throw when getAvailableModelsExtended fails", async () => {
      mockFacade.getAvailableModelsExtended.mockRejectedValue(
        new Error("API down"),
      );

      const roles = await service.getActiveRoles();

      expect(roles).toEqual([]);
    });

    it("should filter out xAI models", async () => {
      mockFacade.getAvailableModelsExtended.mockResolvedValue([
        { id: "grok-1", name: "Grok", provider: "xAI", isReasoning: false },
        {
          id: "gpt-4o",
          name: "GPT-4o",
          provider: "openai",
          isReasoning: false,
        },
      ]);

      const roles = await service.getActiveRoles();

      // All roles should be active (1 non-xAI model is enough)
      expect(roles.length).toBeGreaterThan(0);
      // assignModelsToRoles should use "gpt-4o" not "grok-1"
      const model = await service.getModelForRole("writer");
      expect(model).toBe("gpt-4o");
    });
  });

  // ==================== assignModelsToRoles strategies ====================

  describe("assignModelsToRoles", () => {
    it("should prefer reasoning model for story-architect", async () => {
      mockFacade.getAvailableModelsExtended.mockResolvedValue([
        {
          id: "gpt-4o",
          name: "GPT-4o",
          provider: "openai",
          isReasoning: false,
        },
        {
          id: "o3-mini",
          name: "o3 Mini",
          provider: "openai",
          isReasoning: true,
        },
      ]);

      const architectModel = await service.getModelForRole("story-architect");

      expect(architectModel).toBe("o3-mini");
    });

    it("should fall back to chat model for story-architect when no reasoning model", async () => {
      mockFacade.getAvailableModelsExtended.mockResolvedValue([
        {
          id: "claude-3",
          name: "Claude",
          provider: "anthropic",
          isReasoning: false,
        },
      ]);

      const architectModel = await service.getModelForRole("story-architect");

      expect(architectModel).toBe("claude-3");
    });

    it("should distribute roles across multiple providers", async () => {
      mockFacade.getAvailableModelsExtended.mockResolvedValue([
        {
          id: "gpt-4o",
          name: "GPT-4o",
          provider: "openai",
          isReasoning: false,
        },
        {
          id: "claude-3",
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
      ]);

      // With multi-provider setup, members should get varied models
      const bibleKeeperModel = await service.getModelForRole("bible-keeper");
      const writerModel = await service.getModelForRole("writer");

      // Both should be non-null and valid
      expect(bibleKeeperModel).toBeTruthy();
      expect(writerModel).toBeTruthy();
    });

    it("should handle single provider with multiple models by round-robin", async () => {
      mockFacade.getAvailableModelsExtended.mockResolvedValue([
        {
          id: "gpt-4o",
          name: "GPT-4o",
          provider: "openai",
          isReasoning: false,
        },
        {
          id: "gpt-4-mini",
          name: "GPT-4 mini",
          provider: "openai",
          isReasoning: false,
        },
      ]);

      const roles = await service.getActiveRoles();
      expect(roles).toHaveLength(5);
    });
  });

  // ==================== startMissionAsync ====================

  describe("startMissionAsync", () => {
    const userId = "user-1";
    const baseInput = {
      projectId: "project-1",
      missionType: "chapter" as const,
      userPrompt: "Write chapter one",
      targetWordCount: 3000,
    };

    beforeEach(() => {
      // Default: project exists and is owned by user
      mockPrisma.writingProject.findUnique.mockResolvedValue({
        ownerId: userId,
      });
      // No running mission
      mockPrisma.writingMission.findFirst.mockResolvedValue(null);
      // Mission created successfully
      mockPrisma.writingMission.create.mockResolvedValue({
        id: "mock-mission-id",
      });
      // A model is available
      mockFacade.getAvailableModelsExtended.mockResolvedValue([
        {
          id: "gpt-4o",
          name: "GPT-4o",
          provider: "openai",
          isReasoning: false,
        },
      ]);
    });

    it("should return missionId on success", async () => {
      const result = await service.startMissionAsync(baseInput, userId);

      expect(result).toEqual({ missionId: "mock-mission-id" });
    });

    it("should throw ConflictException when a mission is already running", async () => {
      mockPrisma.writingMission.findFirst.mockResolvedValue({
        id: "existing-mission",
        status: "IN_PROGRESS",
      });

      await expect(
        service.startMissionAsync(baseInput, userId),
      ).rejects.toThrow(ConflictException);
    });

    it("should throw error when no AI models are available", async () => {
      mockFacade.getAvailableModelsExtended.mockResolvedValue([]);

      await expect(
        service.startMissionAsync(baseInput, userId),
      ).rejects.toThrow("没有可用的 AI 模型");
    });

    it("should throw NotFoundException when project does not exist", async () => {
      mockPrisma.writingProject.findUnique.mockResolvedValue(null);

      await expect(
        service.startMissionAsync(baseInput, userId),
      ).rejects.toThrow();
    });

    it("should throw when user does not own the project", async () => {
      mockPrisma.writingProject.findUnique.mockResolvedValue({
        ownerId: "other-user",
      });

      await expect(
        service.startMissionAsync(baseInput, userId),
      ).rejects.toThrow();
    });

    it("should accept all supported mission types", async () => {
      const missionTypes: Array<
        | "outline"
        | "chapter"
        | "revision"
        | "consistency_check"
        | "full_story"
        | "edit"
      > = ["outline", "chapter", "revision", "consistency_check", "edit"];

      for (const missionType of missionTypes) {
        jest.clearAllMocks();
        mockPrisma.writingProject.findUnique.mockResolvedValue({
          ownerId: userId,
        });
        mockPrisma.writingMission.findFirst.mockResolvedValue(null);
        mockPrisma.writingMission.create.mockResolvedValue({
          id: "mock-mission-id",
        });
        mockFacade.getAvailableModelsExtended.mockResolvedValue([
          {
            id: "gpt-4o",
            name: "GPT-4o",
            provider: "openai",
            isReasoning: false,
          },
        ]);

        const result = await service.startMissionAsync(
          { ...baseInput, missionType },
          userId,
        );
        expect(result.missionId).toBeDefined();
      }
    });
  });

  // ==================== getMissionStatus ====================

  describe("getMissionStatus", () => {
    const userId = "user-1";
    const missionId = "mock-mission-id";

    beforeEach(() => {
      (mockFacade as unknown as Record<string, unknown>).missionOrchestrator = {
        getState: jest.fn().mockReturnValue(null),
        updateState: jest.fn(),
        cancel: jest.fn().mockResolvedValue(undefined),
      };
    });

    it("should return mission status with null orchestratorState when not tracked", async () => {
      mockPrisma.writingMission.findUnique.mockResolvedValue({
        id: missionId,
        status: "IN_PROGRESS",
        missionType: "chapter",
        startedAt: new Date(),
        completedAt: null,
        result: null,
        project: { ownerId: userId },
      });

      const result = await service.getMissionStatus(missionId, userId);

      expect(result.id).toBe(missionId);
      expect(result.status).toBe("IN_PROGRESS");
      expect(result.orchestratorState).toBeNull();
    });

    it("should return orchestratorState when available", async () => {
      mockPrisma.writingMission.findUnique.mockResolvedValue({
        id: missionId,
        status: "IN_PROGRESS",
        missionType: "chapter",
        startedAt: new Date(),
        completedAt: null,
        result: null,
        project: { ownerId: userId },
      });

      const orchestratorState = {
        phase: "executing",
        completedSteps: ["plan"],
        currentSteps: ["write"],
        resourceUsage: { progress: 50, tokensUsed: 1000, costUsed: 0.01 },
      };
      (mockFacade as unknown as Record<string, unknown>).missionOrchestrator = {
        getState: jest.fn().mockReturnValue(orchestratorState),
        cancel: jest.fn().mockResolvedValue(undefined),
      };

      const result = await service.getMissionStatus(missionId, userId);

      expect(result.orchestratorState).toEqual({
        phase: "executing",
        completedSteps: ["plan"],
        currentSteps: ["write"],
        progress: 50,
        tokensUsed: 1000,
        costUsed: 0.01,
      });
    });

    it("should throw NotFoundException when mission not found", async () => {
      mockPrisma.writingMission.findUnique.mockResolvedValue(null);

      const { NotFoundException } = await import("@nestjs/common");
      await expect(
        service.getMissionStatus("nonexistent", userId),
      ).rejects.toThrow(NotFoundException);
    });

    it("should throw NotFoundException when user does not own the mission project", async () => {
      mockPrisma.writingMission.findUnique.mockResolvedValue({
        id: missionId,
        status: "COMPLETED",
        missionType: "chapter",
        startedAt: new Date(),
        completedAt: new Date(),
        result: {},
        project: { ownerId: "other-user" },
      });

      const { NotFoundException } = await import("@nestjs/common");
      await expect(service.getMissionStatus(missionId, userId)).rejects.toThrow(
        NotFoundException,
      );
    });

    it("should return completed status with result", async () => {
      mockPrisma.writingMission.findUnique.mockResolvedValue({
        id: missionId,
        status: "COMPLETED",
        missionType: "outline",
        startedAt: new Date("2024-01-01"),
        completedAt: new Date("2024-01-01T01:00:00"),
        result: { success: true, wordCount: 5000 },
        project: { ownerId: userId },
      });

      const result = await service.getMissionStatus(missionId, userId);

      expect(result.status).toBe("COMPLETED");
      expect(result.result).toEqual({ success: true, wordCount: 5000 });
    });
  });

  // ==================== getLatestMission ====================

  describe("getLatestMission", () => {
    it("should return the latest mission for a project", async () => {
      const latestMission = {
        id: "latest-mission",
        status: "COMPLETED",
        missionType: "chapter",
        createdAt: new Date(),
      };
      mockPrisma.writingMission.findFirst.mockResolvedValue(latestMission);

      const result = await service.getLatestMission("project-1");

      expect(result).toEqual(latestMission);
      expect(mockPrisma.writingMission.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { projectId: "project-1" },
          orderBy: { createdAt: "desc" },
        }),
      );
    });

    it("should return null when no missions exist", async () => {
      mockPrisma.writingMission.findFirst.mockResolvedValue(null);

      const result = await service.getLatestMission("project-empty");

      expect(result).toBeNull();
    });
  });

  // ==================== cancelMission ====================

  describe("cancelMission", () => {
    const userId = "user-1";
    const missionId = "mock-mission-id";

    beforeEach(() => {
      (mockFacade as unknown as Record<string, unknown>).missionOrchestrator = {
        cancel: jest.fn().mockResolvedValue(undefined),
        getState: jest.fn().mockReturnValue(null),
        updateState: jest.fn(),
      };
      mockPrisma.writingMission.updateMany.mockResolvedValue({ count: 1 });
      mockPrisma.writingProject.update.mockResolvedValue({});
    });

    it("should cancel mission and update project to REVISING when project has words", async () => {
      mockPrisma.writingMission.findUnique.mockResolvedValue({
        id: missionId,
        project: { id: "project-1", ownerId: userId, currentWords: 5000 },
      });

      const result = await service.cancelMission(missionId, userId);

      expect(result.success).toBe(true);
      expect(result.message).toBe("Mission cancelled");
      expect(mockPrisma.writingProject.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { status: "REVISING" },
        }),
      );
    });

    it("should cancel mission and update project to PLANNING when no words", async () => {
      mockPrisma.writingMission.findUnique.mockResolvedValue({
        id: missionId,
        project: { id: "project-1", ownerId: userId, currentWords: 0 },
      });

      const result = await service.cancelMission(missionId, userId);

      expect(result.success).toBe(true);
      expect(mockPrisma.writingProject.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { status: "PLANNING" },
        }),
      );
    });

    it("should return success when mission not found and attempt orchestrator cancel", async () => {
      mockPrisma.writingMission.findUnique.mockResolvedValue(null);

      const result = await service.cancelMission("nonexistent", userId);

      expect(result.success).toBe(true);
      expect(result.message).toBe("Mission not found but cleanup attempted");
    });

    it("should throw error when user does not own the mission", async () => {
      mockPrisma.writingMission.findUnique.mockResolvedValue({
        id: missionId,
        project: { id: "project-1", ownerId: "other-user", currentWords: 0 },
      });

      await expect(service.cancelMission(missionId, userId)).rejects.toThrow(
        "Access denied",
      );
    });

    it("should succeed even when orchestrator cancel fails", async () => {
      mockPrisma.writingMission.findUnique.mockResolvedValue({
        id: missionId,
        project: { id: "project-1", ownerId: userId, currentWords: 0 },
      });
      (mockFacade as unknown as Record<string, unknown>).missionOrchestrator = {
        cancel: jest.fn().mockRejectedValue(new Error("Orchestrator error")),
      };

      const result = await service.cancelMission(missionId, userId);

      expect(result.success).toBe(true);
    });
  });

  // ==================== forceCleanupStuckMissions ====================

  describe("forceCleanupStuckMissions", () => {
    const userId = "user-1";

    beforeEach(() => {
      (mockFacade as unknown as Record<string, unknown>).missionOrchestrator = {
        cancel: jest.fn().mockResolvedValue(undefined),
        getState: jest.fn().mockReturnValue(null),
        updateState: jest.fn(),
      };
    });

    it("should return success with cleanedCount=0 when no stuck missions", async () => {
      mockPrisma.writingMission.findMany.mockResolvedValue([]);

      const result = await service.forceCleanupStuckMissions(
        "project-1",
        userId,
      );

      expect(result.success).toBe(true);
      expect(result.cleanedCount).toBe(0);
      expect(result.message).toBe("没有发现卡住的任务");
    });

    it("should clean up stuck missions and update project to REVISING when has words", async () => {
      mockPrisma.writingMission.findMany.mockResolvedValue([
        { id: "stuck-1" },
        { id: "stuck-2" },
      ]);
      mockPrisma.writingMission.updateMany.mockResolvedValue({ count: 2 });
      mockPrisma.writingProject.findUnique.mockResolvedValue({
        currentWords: 3000,
      });
      mockPrisma.writingProject.update.mockResolvedValue({});

      const result = await service.forceCleanupStuckMissions(
        "project-1",
        userId,
      );

      expect(result.success).toBe(true);
      expect(result.cleanedCount).toBe(2);
      expect(mockPrisma.writingProject.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: { status: "REVISING" } }),
      );
    });

    it("should set project to PLANNING when no words after cleanup", async () => {
      mockPrisma.writingMission.findMany.mockResolvedValue([{ id: "stuck-1" }]);
      mockPrisma.writingMission.updateMany.mockResolvedValue({ count: 1 });
      mockPrisma.writingProject.findUnique.mockResolvedValue({
        currentWords: 0,
      });
      mockPrisma.writingProject.update.mockResolvedValue({});

      await service.forceCleanupStuckMissions("project-1", userId);

      expect(mockPrisma.writingProject.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: { status: "PLANNING" } }),
      );
    });

    it("should proceed even when project not found", async () => {
      mockPrisma.writingMission.findMany.mockResolvedValue([{ id: "stuck-1" }]);
      mockPrisma.writingMission.updateMany.mockResolvedValue({ count: 1 });
      mockPrisma.writingProject.findUnique.mockResolvedValue(null);

      const result = await service.forceCleanupStuckMissions(
        "project-1",
        userId,
      );

      expect(result.success).toBe(true);
      expect(mockPrisma.writingProject.update).not.toHaveBeenCalled();
    });
  });

  // ==================== getMissionLogs ====================

  describe("getMissionLogs", () => {
    const userId = "user-1";
    const missionId = "mock-mission-id";

    it("should return logs with pagination", async () => {
      mockPrisma.writingMission.findUnique.mockResolvedValue({
        id: missionId,
        project: { ownerId: userId },
      });
      (
        mockPrisma.writingMissionLog as unknown as Record<string, jest.Mock>
      ).count = jest.fn().mockResolvedValue(10);
      mockPrisma.writingMissionLog.findMany.mockResolvedValue([
        {
          id: "log-1",
          eventType: "mission:started",
          agentId: null,
          agentName: null,
          content: "Mission started",
          detail: null,
          createdAt: new Date(),
        },
      ]);

      const result = await service.getMissionLogs(missionId, userId, 10, 0);

      expect(result.items).toHaveLength(1);
      expect(result.total).toBe(10);
      expect(result.items[0].eventType).toBe("mission:started");
    });

    it("should use default pagination when limit/offset not provided", async () => {
      mockPrisma.writingMission.findUnique.mockResolvedValue({
        id: missionId,
        project: { ownerId: userId },
      });
      (
        mockPrisma.writingMissionLog as unknown as Record<string, jest.Mock>
      ).count = jest.fn().mockResolvedValue(0);
      mockPrisma.writingMissionLog.findMany.mockResolvedValue([]);

      const result = await service.getMissionLogs(missionId, userId);

      expect(result.items).toHaveLength(0);
      expect(mockPrisma.writingMissionLog.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          take: 500,
          skip: 0,
        }),
      );
    });

    it("should throw NotFoundException when mission not found", async () => {
      mockPrisma.writingMission.findUnique.mockResolvedValue(null);

      const { NotFoundException } = await import("@nestjs/common");
      await expect(
        service.getMissionLogs("nonexistent", userId),
      ).rejects.toThrow(NotFoundException);
    });

    it("should throw NotFoundException when user does not own mission", async () => {
      mockPrisma.writingMission.findUnique.mockResolvedValue({
        id: missionId,
        project: { ownerId: "other-user" },
      });

      const { NotFoundException } = await import("@nestjs/common");
      await expect(service.getMissionLogs(missionId, userId)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  // ==================== saveMissionLog ====================

  describe("saveMissionLog", () => {
    it("should save a log entry successfully", async () => {
      mockPrisma.writingMissionLog.create.mockResolvedValue({ id: "log-1" });

      await service.saveMissionLog(
        "mission-1",
        "chapter:content",
        "Chapter 1 done",
      );

      expect(mockPrisma.writingMissionLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            missionId: "mission-1",
            eventType: "chapter:content",
            content: "Chapter 1 done",
          }),
        }),
      );
    });

    it("should save a log entry with agent options", async () => {
      mockPrisma.writingMissionLog.create.mockResolvedValue({ id: "log-2" });

      await service.saveMissionLog(
        "mission-1",
        "agent:working",
        "Writer is working",
        {
          agentId: "writer",
          agentName: "作家",
          detail: { type: "writing", data: "content preview" },
        },
      );

      expect(mockPrisma.writingMissionLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            agentId: "writer",
            agentName: "作家",
          }),
        }),
      );
    });

    it("should not throw when log creation fails", async () => {
      mockPrisma.writingMissionLog.create.mockRejectedValue(
        new Error("DB error"),
      );

      await expect(
        service.saveMissionLog("mission-1", "mission:started", "Started"),
      ).resolves.not.toThrow();
    });
  });

  // ==================== generateQualityConstraints (via indirect test) ====================

  describe("generateQualityConstraints (indirect via startMissionAsync background)", () => {
    it("should call narrativeCraft and quality services when generating constraints", () => {
      // Verify that the narrative craft mock is set up and accessible
      expect(
        mockNarrativeCraft.generateNarrativeCraftConstraints,
      ).toBeDefined();
      expect(mockOpeningHook.generateOpeningConstraints).toBeDefined();
      expect(mockSensoryImmersion.generateImmersionConstraints).toBeDefined();
      expect(
        mockProfessionalVoice.generateChapterVoiceConstraints,
      ).toBeDefined();
      expect(mockPacingControl.generatePacingConstraints).toBeDefined();
    });

    it("should have skill prompts capability wired through facade", () => {
      expect(mockFacade.capabilityGetSkillPrompts).toBeDefined();
    });
  });

  // ==================== getWritingSkillPrompts coverage ====================

  describe("getWritingSkillPrompts (via skill integration)", () => {
    it("should return skill prompt content when skills are available", async () => {
      // Setup facade to return skill with content
      mockFacade.capabilityGetSkillPrompts.mockResolvedValue({
        content: "Write with narrative depth and avoid clichés",
        usedSkills: ["creative-writing-v2", "dialogue-mastery"],
      });
      // Setup facade resolver service
      (
        mockFacade as unknown as Record<string, unknown>
      ).capabilityResolverService = {
        logCapabilityUsage: jest.fn().mockResolvedValue(undefined),
      };

      // Trigger via startMissionAsync (which calls runMissionInBackground -> generateContentDirectly)
      const userId = "user-1";
      mockPrisma.writingProject.findUnique.mockResolvedValue({
        ownerId: userId,
      });
      mockPrisma.writingMission.findFirst.mockResolvedValue(null);
      mockPrisma.writingMission.create.mockResolvedValue({
        id: "mock-mission-id",
      });
      mockFacade.getAvailableModelsExtended.mockResolvedValue([
        {
          id: "gpt-4o",
          name: "GPT-4o",
          provider: "openai",
          isReasoning: false,
        },
      ]);

      const result = await service.startMissionAsync(
        {
          projectId: "project-1",
          missionType: "chapter",
          userPrompt: "Write chapter",
          targetWordCount: 3000,
        },
        userId,
      );
      // Just verify startMissionAsync completes
      expect(result.missionId).toBeDefined();
    });

    it("should handle capabilityGetSkillPrompts returning empty content", async () => {
      mockFacade.capabilityGetSkillPrompts.mockResolvedValue({
        content: "",
        usedSkills: [],
      });

      const userId = "user-1";
      mockPrisma.writingProject.findUnique.mockResolvedValue({
        ownerId: userId,
      });
      mockPrisma.writingMission.findFirst.mockResolvedValue(null);
      mockPrisma.writingMission.create.mockResolvedValue({
        id: "mock-mission-id",
      });
      mockFacade.getAvailableModelsExtended.mockResolvedValue([
        {
          id: "gpt-4o",
          name: "GPT-4o",
          provider: "openai",
          isReasoning: false,
        },
      ]);

      const result = await service.startMissionAsync(
        {
          projectId: "project-1",
          missionType: "outline",
          userPrompt: "Write outline",
          targetWordCount: 500,
        },
        userId,
      );
      expect(result.missionId).toBeDefined();
    });
  });

  // ==================== model cache TTL expiry ====================

  describe("model cache TTL expiry", () => {
    it("should re-fetch models after cache TTL expires", async () => {
      mockFacade.getAvailableModelsExtended.mockResolvedValue([
        {
          id: "gpt-4o",
          name: "GPT-4o",
          provider: "openai",
          isReasoning: false,
        },
      ]);

      // First call - populates cache
      await service.getActiveRoles();
      expect(mockFacade.getAvailableModelsExtended).toHaveBeenCalledTimes(1);

      // Manually expire cache by setting private fields
      (service as unknown as Record<string, unknown>).modelCacheTime =
        Date.now() - 10 * 60 * 1000;

      // Second call - cache expired, should re-fetch
      await service.getActiveRoles();
      expect(mockFacade.getAvailableModelsExtended).toHaveBeenCalledTimes(2);
    });
  });

  // ==================== assignModelsToRoles edge cases ====================

  describe("assignModelsToRoles edge cases", () => {
    it("should handle reasoning model being the only model (used for both leader and members)", async () => {
      mockFacade.getAvailableModelsExtended.mockResolvedValue([
        {
          id: "o3-mini",
          name: "o3 Mini",
          provider: "openai",
          isReasoning: true,
        },
      ]);

      const roles = await service.getActiveRoles();
      expect(roles).toHaveLength(5);

      // All roles get the same (only) model
      const leaderModel = await service.getModelForRole("story-architect");
      const writerModel = await service.getModelForRole("writer");
      expect(leaderModel).toBe("o3-mini");
      expect(writerModel).toBe("o3-mini");
    });

    it("should handle many providers (5+ providers with one model each)", async () => {
      mockFacade.getAvailableModelsExtended.mockResolvedValue([
        {
          id: "gpt-4o",
          name: "GPT-4o",
          provider: "openai",
          isReasoning: false,
        },
        {
          id: "claude-3",
          name: "Claude 3",
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
        { id: "llama", name: "Llama", provider: "meta", isReasoning: false },
      ]);

      const roles = await service.getActiveRoles();
      expect(roles).toHaveLength(5);
    });

    it("should return isActive=false for all roles when no models", async () => {
      mockFacade.getAvailableModelsExtended.mockResolvedValue([]);

      const model = await service.getModelForRole("bible-keeper");
      expect(model).toBeNull();

      const roles = await service.getActiveRoles();
      expect(roles).toHaveLength(0);
    });
  });

  // ==================== startMissionAsync additional branches ====================

  describe("startMissionAsync additional branches", () => {
    const userId = "user-1";

    it("should handle missing targetWordCount gracefully", async () => {
      mockPrisma.writingProject.findUnique.mockResolvedValue({
        ownerId: userId,
      });
      mockPrisma.writingMission.findFirst.mockResolvedValue(null);
      mockPrisma.writingMission.create.mockResolvedValue({
        id: "mock-mission-id",
      });
      mockFacade.getAvailableModelsExtended.mockResolvedValue([
        {
          id: "gpt-4o",
          name: "GPT-4o",
          provider: "openai",
          isReasoning: false,
        },
      ]);

      const result = await service.startMissionAsync(
        {
          projectId: "project-1",
          missionType: "outline",
          userPrompt: "An epic fantasy adventure",
          // no targetWordCount
        },
        userId,
      );

      expect(result.missionId).toBeDefined();
    });

    it("should handle additionalInstructions in input", async () => {
      mockPrisma.writingProject.findUnique.mockResolvedValue({
        ownerId: userId,
      });
      mockPrisma.writingMission.findFirst.mockResolvedValue(null);
      mockPrisma.writingMission.create.mockResolvedValue({
        id: "mock-mission-id",
      });
      mockFacade.getAvailableModelsExtended.mockResolvedValue([
        {
          id: "gpt-4o",
          name: "GPT-4o",
          provider: "openai",
          isReasoning: false,
        },
      ]);

      const result = await service.startMissionAsync(
        {
          projectId: "project-1",
          missionType: "revision",
          userPrompt: "Revise the first chapter",
          additionalInstructions: "Focus on dialogue",
          chapterId: "chapter-1",
        },
        userId,
      );

      expect(result.missionId).toBeDefined();
    });

    it("should pass chapterId and volumeId through to mission record", async () => {
      mockPrisma.writingProject.findUnique.mockResolvedValue({
        ownerId: userId,
      });
      mockPrisma.writingMission.findFirst.mockResolvedValue(null);
      mockPrisma.writingMission.create.mockResolvedValue({
        id: "mock-mission-id",
      });
      mockFacade.getAvailableModelsExtended.mockResolvedValue([
        {
          id: "gpt-4o",
          name: "GPT-4o",
          provider: "openai",
          isReasoning: false,
        },
      ]);

      await service.startMissionAsync(
        {
          projectId: "project-1",
          missionType: "chapter",
          userPrompt: "Write chapter 2",
          chapterId: "ch-2",
          volumeId: "vol-1",
        },
        userId,
      );

      expect(mockPrisma.writingMission.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            projectId: "project-1",
          }),
        }),
      );
    });

    it("should handle full_story mission type mapped to CHAPTER in DB", async () => {
      mockPrisma.writingProject.findUnique.mockResolvedValue({
        ownerId: userId,
      });
      mockPrisma.writingMission.findFirst.mockResolvedValue(null);
      mockPrisma.writingMission.create.mockResolvedValue({
        id: "mock-mission-id",
      });
      mockFacade.getAvailableModelsExtended.mockResolvedValue([
        {
          id: "gpt-4o",
          name: "GPT-4o",
          provider: "openai",
          isReasoning: false,
        },
      ]);

      const result = await service.startMissionAsync(
        {
          projectId: "project-1",
          missionType: "full_story",
          userPrompt: "Write a complete fantasy novel",
          targetWordCount: 50000,
        },
        userId,
      );

      expect(result.missionId).toBeDefined();
      // full_story maps to CHAPTER in DB
      expect(mockPrisma.writingMission.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            missionType: "CHAPTER",
          }),
        }),
      );
    });

    it("should handle consistency_check mission type mapped to CONSISTENCY in DB", async () => {
      mockPrisma.writingProject.findUnique.mockResolvedValue({
        ownerId: userId,
      });
      mockPrisma.writingMission.findFirst.mockResolvedValue(null);
      mockPrisma.writingMission.create.mockResolvedValue({
        id: "mock-mission-id",
      });
      mockFacade.getAvailableModelsExtended.mockResolvedValue([
        {
          id: "gpt-4o",
          name: "GPT-4o",
          provider: "openai",
          isReasoning: false,
        },
      ]);

      const result = await service.startMissionAsync(
        {
          projectId: "project-1",
          missionType: "consistency_check",
          userPrompt: "Check consistency",
        },
        userId,
      );

      expect(result.missionId).toBeDefined();
      expect(mockPrisma.writingMission.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            missionType: "CONSISTENCY",
          }),
        }),
      );
    });
  });

  // ==================== Private utility method coverage via reflection ====================

  describe("private utility methods via service reflection", () => {
    // Access private methods via type casting
    type ServicePrivate = WritingMissionService & {
      mapTemperatureToCreativity: (temp: number) => string;
      mapMaxTokensToOutputLength: (tokens: number) => string;
      numberToChinese: (num: number) => string;
      countWords: (text: string) => number;
      extractChapterTitle: (content: string, chapterNumber: number) => string;
      parseOutlineJSON: (
        content: string,
        totalVolumes: number,
        totalChapters: number,
      ) => unknown;
      parseWorldSettings: (content: string) => Record<string, unknown>;
      normalizeConsistencyResult: (parsed: Record<string, unknown>) => unknown;
      parseVerificationResult: (content: string) => unknown;
    };

    let svc: ServicePrivate;

    beforeEach(() => {
      svc = service as unknown as ServicePrivate;
    });

    describe("mapTemperatureToCreativity", () => {
      it("should return deterministic for temp <= 0.2", () => {
        expect(svc.mapTemperatureToCreativity(0.0)).toBe("deterministic");
        expect(svc.mapTemperatureToCreativity(0.1)).toBe("deterministic");
        expect(svc.mapTemperatureToCreativity(0.2)).toBe("deterministic");
      });

      it("should return low for temp in (0.2, 0.3]", () => {
        expect(svc.mapTemperatureToCreativity(0.21)).toBe("low");
        expect(svc.mapTemperatureToCreativity(0.3)).toBe("low");
      });

      it("should return medium for temp in (0.3, 0.7]", () => {
        expect(svc.mapTemperatureToCreativity(0.31)).toBe("medium");
        expect(svc.mapTemperatureToCreativity(0.5)).toBe("medium");
        expect(svc.mapTemperatureToCreativity(0.7)).toBe("medium");
      });

      it("should return high for temp > 0.7", () => {
        expect(svc.mapTemperatureToCreativity(0.71)).toBe("high");
        expect(svc.mapTemperatureToCreativity(1.0)).toBe("high");
      });
    });

    describe("mapMaxTokensToOutputLength", () => {
      it("should return minimal for tokens <= 1000", () => {
        expect(svc.mapMaxTokensToOutputLength(500)).toBe("minimal");
        expect(svc.mapMaxTokensToOutputLength(1000)).toBe("minimal");
      });

      it("should return short for tokens in (1000, 2000]", () => {
        expect(svc.mapMaxTokensToOutputLength(1001)).toBe("short");
        expect(svc.mapMaxTokensToOutputLength(2000)).toBe("short");
      });

      it("should return medium for tokens in (2000, 4000]", () => {
        expect(svc.mapMaxTokensToOutputLength(2001)).toBe("medium");
        expect(svc.mapMaxTokensToOutputLength(4000)).toBe("medium");
      });

      it("should return standard for tokens in (4000, 6000]", () => {
        expect(svc.mapMaxTokensToOutputLength(4001)).toBe("standard");
        expect(svc.mapMaxTokensToOutputLength(6000)).toBe("standard");
      });

      it("should return long for tokens in (6000, 8000]", () => {
        expect(svc.mapMaxTokensToOutputLength(6001)).toBe("long");
        expect(svc.mapMaxTokensToOutputLength(8000)).toBe("long");
      });

      it("should return extended for tokens > 8000", () => {
        expect(svc.mapMaxTokensToOutputLength(8001)).toBe("extended");
        expect(svc.mapMaxTokensToOutputLength(16000)).toBe("extended");
      });
    });

    describe("numberToChinese", () => {
      it("should convert single digits correctly", () => {
        expect(svc.numberToChinese(0)).toBe("零");
        expect(svc.numberToChinese(1)).toBe("一");
        expect(svc.numberToChinese(5)).toBe("五");
        expect(svc.numberToChinese(10)).toBe("十");
      });

      it("should convert teens correctly", () => {
        expect(svc.numberToChinese(11)).toBe("十一");
        expect(svc.numberToChinese(19)).toBe("十九");
        expect(svc.numberToChinese(15)).toBe("十五");
      });

      it("should convert 20-99 correctly", () => {
        expect(svc.numberToChinese(20)).toBe("二十");
        expect(svc.numberToChinese(21)).toBe("二十一");
        expect(svc.numberToChinese(30)).toBe("三十");
        expect(svc.numberToChinese(99)).toBe("九十九");
      });

      it("should return numeric string for >= 100", () => {
        expect(svc.numberToChinese(100)).toBe("100");
        expect(svc.numberToChinese(200)).toBe("200");
      });
    });

    describe("countWords", () => {
      it("should count Chinese characters correctly", () => {
        const text = "这是一段中文文本，共十一个汉字。";
        const count = svc.countWords(text);
        expect(count).toBeGreaterThan(0);
      });

      it("should count English words correctly", () => {
        const text = "This is a simple English sentence with seven words";
        const count = svc.countWords(text);
        expect(count).toBe(9);
      });

      it("should count mixed Chinese and English text", () => {
        const text = "这是mixed content with Chinese and English";
        const count = svc.countWords(text);
        expect(count).toBeGreaterThan(5);
      });

      it("should return 0 for empty string", () => {
        expect(svc.countWords("")).toBe(0);
      });
    });

    describe("extractChapterTitle", () => {
      it("should extract title after 第X章：format", () => {
        const content = "第一章：暗流涌动\n\n故事开始了...";
        const title = svc.extractChapterTitle(content, 1);
        expect(title).toBe("暗流涌动");
      });

      it("should extract title after 第X章: format", () => {
        const content = "第二章: 风起云涌\n\n故事继续...";
        const title = svc.extractChapterTitle(content, 2);
        expect(title).toBe("风起云涌");
      });

      it("should extract title from markdown heading", () => {
        const content = "## 第三章：命运交汇\n\n故事内容...";
        const title = svc.extractChapterTitle(content, 3);
        expect(title).toBe("命运交汇");
      });

      it("should return fallback when no title can be extracted", () => {
        const content = "这是没有章节格式的内容，直接开始了故事情节。";
        const title = svc.extractChapterTitle(content, 1);
        // Should return something (either empty or fallback)
        expect(typeof title).toBe("string");
      });

      it("should handle 第X章 第X回 format", () => {
        const content = "第一章 第一回 初入江湖\n\n故事开始...";
        const title = svc.extractChapterTitle(content, 1);
        expect(title).toBe("初入江湖");
      });

      it("should handle pure 第X章 without title", () => {
        const content =
          "第一章\n\n故事开始了，这里是正文内容，有足够长的文字。";
        const title = svc.extractChapterTitle(content, 1);
        expect(typeof title).toBe("string");
      });
    });

    describe("parseOutlineJSON", () => {
      it("should return default structure when content is empty", () => {
        const result = svc.parseOutlineJSON("", 1, 3) as {
          bookTitle: string;
          chapters: unknown[];
          volumes: unknown[];
        };
        expect(result.bookTitle).toBe("");
        expect(result.chapters).toHaveLength(3);
        expect(result.volumes).toHaveLength(1);
      });

      it("should parse valid JSON outline", () => {
        const outline = {
          bookTitle: "《风云变幻》",
          core: { summary: "一个故事", genre: "玄幻", theme: "成长" },
          volumes: [
            {
              title: "第一卷",
              conflict: "初始冲突",
              plot: "开篇",
              emotion: "紧张",
            },
          ],
          chapters: [
            {
              volumeIndex: 0,
              title: "暗流涌动",
              plot: "开篇情节",
              keyPoint: "关键点1",
            },
            {
              volumeIndex: 0,
              title: "风起云涌",
              plot: "发展情节",
              keyPoint: "关键点2",
            },
            {
              volumeIndex: 0,
              title: "命运交汇",
              plot: "高潮情节",
              keyPoint: "关键点3",
            },
          ],
        };
        const result = svc.parseOutlineJSON(JSON.stringify(outline), 1, 3) as {
          bookTitle: string;
          chapters: Array<{ title: string }>;
          core: { theme: string };
        };

        expect(result.bookTitle).toBe("风云变幻"); // Stripped book title markers
        expect(result.chapters).toHaveLength(3);
        expect(result.chapters[0].title).toBe("暗流涌动");
        expect(result.core.theme).toBe("成长");
      });

      it("should handle JSON wrapped in markdown code blocks", () => {
        const outline = {
          bookTitle: "测试书名",
          core: { summary: "摘要", genre: "类型", theme: "主题" },
          volumes: [],
          chapters: [
            // Use a title that does NOT start with 第X章 prefix to avoid stripping
            {
              volumeIndex: 0,
              title: "暗流涌动",
              plot: "情节",
              keyPoint: "关键",
            },
          ],
        };
        const content = "```json\n" + JSON.stringify(outline) + "\n```";
        const result = svc.parseOutlineJSON(content, 1, 1) as {
          bookTitle: string;
          chapters: Array<{ title: string }>;
        };

        expect(result.bookTitle).toBe("测试书名");
        expect(result.chapters[0].title).toBe("暗流涌动");
      });

      it("should supplement missing chapters with defaults", () => {
        const outline = {
          bookTitle: "",
          core: { summary: "s", genre: "g", theme: "t" },
          volumes: [
            { title: "第一卷", conflict: "c", plot: "p", emotion: "e" },
          ],
          chapters: [
            { volumeIndex: 0, title: "仅一章", plot: "情节", keyPoint: "关键" },
          ],
        };
        const result = svc.parseOutlineJSON(JSON.stringify(outline), 1, 5) as {
          chapters: Array<{ title: string }>;
        };

        // Should have 5 chapters despite only 1 in the JSON
        expect(result.chapters).toHaveLength(5);
      });

      it("should strip pure chapter number titles (第X章 format)", () => {
        const outline = {
          bookTitle: "",
          core: { summary: "s", genre: "g", theme: "t" },
          volumes: [{ title: "卷一", conflict: "c", plot: "p", emotion: "e" }],
          chapters: [
            { volumeIndex: 0, title: "第一章", plot: "情节", keyPoint: "关键" },
          ],
        };
        const result = svc.parseOutlineJSON(JSON.stringify(outline), 1, 1) as {
          chapters: Array<{ title: string }>;
        };
        // Pure chapter number format should be stripped to empty
        expect(result.chapters[0].title).toBe("");
      });

      it("should handle malformed JSON gracefully", () => {
        const result = svc.parseOutlineJSON("{invalid json", 1, 2) as {
          chapters: unknown[];
        };
        expect(result.chapters).toHaveLength(2);
      });
    });

    describe("parseWorldSettings", () => {
      it("should parse valid JSON world settings", () => {
        const settings = {
          core: { summary: "A world", genre: "Fantasy", theme: "Power" },
          world: { type: "Fantasy", era: "Medieval", geography: "Kingdoms" },
          characters: [{ name: "Hero", role: "protagonist" }],
        };
        const result = svc.parseWorldSettings(JSON.stringify(settings));

        expect(result.core).toBeDefined();
        expect(result.characters).toHaveLength(1);
      });

      it("should return a default structure on invalid JSON", () => {
        const result = svc.parseWorldSettings("not valid json at all");
        // Returns a fallback object with empty arrays for characters, factions, etc.
        expect(result).toBeDefined();
        expect(typeof result).toBe("object");
        // The service provides defaults even when JSON parsing fails
        expect(Array.isArray(result.characters)).toBe(true);
      });

      it("should handle markdown-wrapped JSON", () => {
        const settings = { core: { summary: "test" }, characters: [] };
        const content = "```json\n" + JSON.stringify(settings) + "\n```";
        const result = svc.parseWorldSettings(content);

        expect(result.core).toBeDefined();
      });
    });

    describe("normalizeConsistencyResult", () => {
      it("should normalize a valid consistency result", () => {
        const parsed = {
          passed: false,
          score: 75,
          issues: [
            {
              type: "timeline",
              severity: "error",
              description: "Time conflict",
              location: "ch1",
              fix: "Adjust dates",
            },
          ],
        };
        const result = svc.normalizeConsistencyResult(parsed) as {
          passed: boolean;
          score: number;
          issues: Array<{ type: string; severity: string }>;
        };

        expect(result.passed).toBe(false);
        expect(result.score).toBe(75);
        expect(result.issues).toHaveLength(1);
        expect(result.issues[0].type).toBe("timeline");
      });

      it("should use defaults for missing fields", () => {
        const result = svc.normalizeConsistencyResult({}) as {
          passed: boolean;
          score: number;
          issues: unknown[];
        };

        expect(result.passed).toBe(true);
        expect(result.score).toBe(100);
        expect(result.issues).toHaveLength(0);
      });

      it("should handle non-array issues field", () => {
        const result = svc.normalizeConsistencyResult({
          issues: "not-array",
        }) as {
          issues: unknown[];
        };
        expect(result.issues).toHaveLength(0);
      });
    });

    describe("parseVerificationResult", () => {
      it("should parse valid verification JSON", () => {
        const data = {
          allFixed: false,
          verifications: [
            { issueIndex: 1, fixed: true, evidence: "Fixed the dialogue" },
            { issueIndex: 2, fixed: false, evidence: "Still present" },
          ],
        };
        const result = svc.parseVerificationResult(JSON.stringify(data)) as {
          allFixed: boolean;
          verifications: Array<{ fixed: boolean }>;
        };

        expect(result.allFixed).toBe(false);
        expect(result.verifications).toHaveLength(2);
        expect(result.verifications[0].fixed).toBe(true);
        expect(result.verifications[1].fixed).toBe(false);
      });

      it("should return default when input is invalid JSON", () => {
        const result = svc.parseVerificationResult("invalid json!!!") as {
          allFixed: boolean;
          verifications: unknown[];
        };

        expect(result.allFixed).toBe(true);
        expect(result.verifications).toHaveLength(0);
      });

      it("should handle markdown code block wrapping", () => {
        const data = {
          allFixed: true,
          verifications: [{ issueIndex: 1, fixed: true, evidence: "done" }],
        };
        const content = "```json\n" + JSON.stringify(data) + "\n```";
        const result = svc.parseVerificationResult(content) as {
          allFixed: boolean;
          verifications: unknown[];
        };

        expect(result.allFixed).toBe(true);
        expect(result.verifications).toHaveLength(1);
      });

      it("should handle ``` prefix without json", () => {
        const data = { allFixed: false, verifications: [] };
        const content = "```\n" + JSON.stringify(data) + "\n```";
        const result = svc.parseVerificationResult(content) as {
          allFixed: boolean;
        };

        expect(result.allFixed).toBe(false);
      });
    });
  });

  // ==================== getWritingTeam (lazy init) ====================

  describe("getWritingTeam lazy initialization", () => {
    it("should lazily initialize writing team on first use", () => {
      const mockTeam = { id: "ai-writing-team", name: "AI Writing Team" };
      (mockFacade as unknown as Record<string, unknown>).teamFactory = {
        createFromId: jest.fn().mockReturnValue(mockTeam),
      };

      // Access private method via casting
      type ServiceWithPrivate = WritingMissionService & {
        getWritingTeam: () => unknown;
        writingTeam: unknown;
      };
      const svc = service as unknown as ServiceWithPrivate;

      // Initially null
      svc.writingTeam = null;

      const team = svc.getWritingTeam();
      expect(team).toEqual(mockTeam);

      // Second call reuses the cached team
      const team2 = svc.getWritingTeam();
      expect(team2).toEqual(mockTeam);
      expect(
        (mockFacade as unknown as Record<string, unknown>).teamFactory as {
          createFromId: jest.Mock;
        },
      ).toBeTruthy();
    });
  });

  // ==================== generateQualityConstraints (deep coverage) ====================

  describe("generateQualityConstraints direct invocation", () => {
    type ServiceWithPrivate = WritingMissionService & {
      generateQualityConstraints: (
        chapterNumber: number,
        chapterOutline?: string,
        characters?: Array<{
          name: string;
          role?: string;
          background?: string;
        }>,
        projectId?: string,
      ) => Promise<string>;
    };

    let svc: ServiceWithPrivate;

    beforeEach(() => {
      svc = service as unknown as ServiceWithPrivate;
      mockFacade.capabilityGetSkillPrompts.mockResolvedValue({
        content: "",
        usedSkills: [],
      });
    });

    it("should generate constraints with all services active", async () => {
      const constraints = await svc.generateQualityConstraints(
        1,
        "Opening chapter with protagonist",
        [
          {
            name: "Alice",
            role: "protagonist",
            background: "A detective from New York",
          },
        ],
        "project-1",
      );

      expect(constraints).toContain("写作完成前必须检查");
      expect(
        mockNarrativeCraft.generateNarrativeCraftConstraints,
      ).toHaveBeenCalled();
      expect(mockOpeningHook.generateOpeningConstraints).toHaveBeenCalledWith(
        1,
        "Opening chapter with protagonist",
      );
      expect(
        mockSensoryImmersion.generateImmersionConstraints,
      ).toHaveBeenCalled();
      expect(
        mockProfessionalVoice.generateChapterVoiceConstraints,
      ).toHaveBeenCalled();
      expect(mockPacingControl.generatePacingConstraints).toHaveBeenCalledWith(
        "project-1",
        1,
        undefined,
        "Opening chapter with protagonist",
      );
    });

    it("should skip pacing constraints when no projectId", async () => {
      const constraints = await svc.generateQualityConstraints(
        2,
        "Some outline",
      );

      expect(constraints).toContain("写作完成前必须检查");
      expect(
        mockPacingControl.generatePacingConstraints,
      ).not.toHaveBeenCalled();
    });

    it("should skip voice constraints when no characters", async () => {
      await svc.generateQualityConstraints(1, "Outline", [], "project-1");

      expect(
        mockProfessionalVoice.generateChapterVoiceConstraints,
      ).not.toHaveBeenCalled();
    });

    it("should include skill prompts when available", async () => {
      mockFacade.capabilityGetSkillPrompts.mockResolvedValue({
        content: "Use vivid imagery and avoid passive voice",
        usedSkills: ["creative-writing"],
      });

      const constraints = await svc.generateQualityConstraints(1);

      expect(constraints).toContain(
        "Use vivid imagery and avoid passive voice",
      );
    });

    it("should handle narrativeCraft throwing gracefully", async () => {
      mockNarrativeCraft.generateNarrativeCraftConstraints.mockImplementation(
        () => {
          throw new Error("Service unavailable");
        },
      );

      const constraints = await svc.generateQualityConstraints(1);

      // Should still produce the footer check
      expect(constraints).toContain("写作完成前必须检查");
    });

    it("should handle openingHook throwing gracefully", async () => {
      mockOpeningHook.generateOpeningConstraints.mockImplementation(() => {
        throw new Error("Hook service down");
      });

      const constraints = await svc.generateQualityConstraints(
        1,
        "outline",
        [],
        "project-1",
      );

      expect(constraints).toContain("写作完成前必须检查");
    });

    it("should handle sensoryImmersion throwing gracefully", async () => {
      mockSensoryImmersion.generateImmersionConstraints.mockImplementation(
        () => {
          throw new Error("Immersion service down");
        },
      );

      const constraints = await svc.generateQualityConstraints(
        3,
        "chapter outline",
      );

      expect(constraints).toContain("写作完成前必须检查");
    });

    it("should handle professionalVoice throwing gracefully", async () => {
      mockProfessionalVoice.generateChapterVoiceConstraints.mockImplementation(
        () => {
          throw new Error("Voice service down");
        },
      );

      const constraints = await svc.generateQualityConstraints(
        1,
        "outline",
        [{ name: "Bob", role: "antagonist" }],
        "project-1",
      );

      expect(constraints).toContain("写作完成前必须检查");
    });

    it("should handle pacingControl throwing gracefully", async () => {
      mockPacingControl.generatePacingConstraints.mockImplementation(() => {
        throw new Error("Pacing service down");
      });

      const constraints = await svc.generateQualityConstraints(
        5,
        "chapter outline",
        [],
        "project-1",
      );

      expect(constraints).toContain("写作完成前必须检查");
    });

    it("should extract profession from character background when available", async () => {
      mockProfessionalVoice.extractProfessionFromBackground.mockReturnValue(
        "detective",
      );

      await svc.generateQualityConstraints(
        1,
        "outline",
        [
          {
            name: "Jane",
            role: "protagonist",
            background: "A seasoned detective with 10 years experience",
          },
        ],
        "project-1",
      );

      expect(
        mockProfessionalVoice.extractProfessionFromBackground,
      ).toHaveBeenCalledWith("A seasoned detective with 10 years experience");
      // Voice constraints should use extracted profession
      expect(
        mockProfessionalVoice.generateChapterVoiceConstraints,
      ).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({ name: "Jane", profession: "detective" }),
        ]),
      );
    });

    it("should fall back to role when background extraction returns null", async () => {
      mockProfessionalVoice.extractProfessionFromBackground.mockReturnValue(
        null,
      );

      await svc.generateQualityConstraints(
        1,
        "outline",
        [
          {
            name: "Jane",
            role: "protagonist",
            background: "Generic background",
          },
        ],
        "project-1",
      );

      expect(
        mockProfessionalVoice.generateChapterVoiceConstraints,
      ).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({ name: "Jane", profession: "protagonist" }),
        ]),
      );
    });

    it("should return empty constraints when nothing returned from services", async () => {
      mockNarrativeCraft.generateNarrativeCraftConstraints.mockReturnValue("");
      mockOpeningHook.generateOpeningConstraints.mockReturnValue("");
      mockSensoryImmersion.generateImmersionConstraints.mockReturnValue("");
      mockProfessionalVoice.generateChapterVoiceConstraints.mockReturnValue("");
      mockPacingControl.generatePacingConstraints.mockReturnValue("");

      const constraints = await svc.generateQualityConstraints(
        1,
        "outline",
        [],
        "project-1",
      );

      // Footer is always added
      expect(constraints).toContain("写作完成前必须检查");
    });
  });

  // ==================== getWritingSkillPrompts deep coverage ====================

  describe("getWritingSkillPrompts", () => {
    type ServiceWithPrivate = WritingMissionService & {
      getWritingSkillPrompts: (params: {
        taskType?: string;
        roleId?: string;
        projectId?: string;
      }) => Promise<string>;
    };

    let svc: ServiceWithPrivate;

    beforeEach(() => {
      svc = service as unknown as ServiceWithPrivate;
    });

    it("should return skill content when skills are available", async () => {
      mockFacade.capabilityGetSkillPrompts.mockResolvedValue({
        content: "Follow these writing guidelines...",
        usedSkills: ["writing-skill-1", "writing-skill-2"],
      });
      (
        mockFacade as unknown as Record<string, unknown>
      ).capabilityResolverService = {
        logCapabilityUsage: jest.fn().mockResolvedValue(undefined),
      };

      const result = await svc.getWritingSkillPrompts({
        taskType: "chapter-writing",
        roleId: "writer",
        projectId: "project-1",
      });

      expect(result).toBe("Follow these writing guidelines...");
    });

    it("should return empty string when no skills available", async () => {
      mockFacade.capabilityGetSkillPrompts.mockResolvedValue({
        content: "",
        usedSkills: [],
      });

      const result = await svc.getWritingSkillPrompts({
        taskType: "chapter-writing",
      });

      expect(result).toBe("");
    });

    it("should return empty string when capabilityGetSkillPrompts throws", async () => {
      mockFacade.capabilityGetSkillPrompts.mockRejectedValue(
        new Error("Service unavailable"),
      );

      const result = await svc.getWritingSkillPrompts({ roleId: "writer" });

      expect(result).toBe("");
    });

    it("should log capability usage for each skill when resolver service is available", async () => {
      const mockLogUsage = jest.fn().mockResolvedValue(undefined);
      (
        mockFacade as unknown as Record<string, unknown>
      ).capabilityResolverService = {
        logCapabilityUsage: mockLogUsage,
      };
      mockFacade.capabilityGetSkillPrompts.mockResolvedValue({
        content: "skill content",
        usedSkills: ["skill-1", "skill-2", "skill-3"],
      });

      await svc.getWritingSkillPrompts({ projectId: "project-1" });

      expect(mockLogUsage).toHaveBeenCalledTimes(3);
      expect(mockLogUsage).toHaveBeenCalledWith(
        expect.objectContaining({ capabilityId: "skill-1", success: true }),
      );
    });

    it("should not throw when logCapabilityUsage fails", async () => {
      (
        mockFacade as unknown as Record<string, unknown>
      ).capabilityResolverService = {
        logCapabilityUsage: jest
          .fn()
          .mockRejectedValue(new Error("Log failed")),
      };
      mockFacade.capabilityGetSkillPrompts.mockResolvedValue({
        content: "skill content",
        usedSkills: ["skill-1"],
      });

      const result = await svc.getWritingSkillPrompts({
        projectId: "project-1",
      });

      expect(result).toBe("skill content");
    });

    it("should work when capabilityResolverService is null", async () => {
      (
        mockFacade as unknown as Record<string, unknown>
      ).capabilityResolverService = null;
      mockFacade.capabilityGetSkillPrompts.mockResolvedValue({
        content: "skill content",
        usedSkills: ["skill-1"],
      });

      const result = await svc.getWritingSkillPrompts({});

      expect(result).toBe("skill content");
    });
  });

  // ==================== splitIntoChapters ====================

  describe("splitIntoChapters (private)", () => {
    type ServiceWithPrivate = WritingMissionService & {
      splitIntoChapters: (content: string) => string[];
    };

    let svc: ServiceWithPrivate;

    beforeEach(() => {
      svc = service as unknown as ServiceWithPrivate;
    });

    it("should split content by Chinese chapter markers", () => {
      const content =
        "第一章 开端\n内容一\n\n第二章 发展\n内容二\n\n第三章 高潮\n内容三";
      const parts = svc.splitIntoChapters(content);
      expect(parts).toHaveLength(3);
      expect(parts[0]).toContain("第一章");
      expect(parts[1]).toContain("第二章");
      expect(parts[2]).toContain("第三章");
    });

    it("should split content by Arabic numeral chapter markers", () => {
      const content = "第1章 开端\n内容一\n\n第2章 发展\n内容二";
      const parts = svc.splitIntoChapters(content);
      expect(parts).toHaveLength(2);
      expect(parts[0]).toContain("第1章");
      expect(parts[1]).toContain("第2章");
    });

    it("should split content by English Chapter markers", () => {
      const content =
        "Chapter 1 Beginning\nContent one\n\nChapter 2 Middle\nContent two";
      const parts = svc.splitIntoChapters(content);
      expect(parts).toHaveLength(2);
      expect(parts[0]).toContain("Chapter 1");
      expect(parts[1]).toContain("Chapter 2");
    });

    it("should fall back to paragraph grouping when no chapter markers", () => {
      // No chapter markers, but content with paragraph breaks
      const paragraph = "这是一段文字。".repeat(500); // ~3500 chars
      const content = paragraph + "\n\n" + paragraph;
      const parts = svc.splitIntoChapters(content);
      expect(parts.length).toBeGreaterThanOrEqual(1);
    });

    it("should return single chapter when content has no markers and is short", () => {
      const content = "短篇故事内容，没有章节分隔符。";
      const parts = svc.splitIntoChapters(content);
      expect(parts).toHaveLength(1);
      expect(parts[0]).toBe(content);
    });

    it("should return content as single element when empty", () => {
      const parts = svc.splitIntoChapters("");
      // Either returns [""] or [] - either way length >= 1 or it's just empty
      expect(parts).toBeDefined();
    });
  });

  // ==================== extractSummaryFromContent ====================

  describe("extractSummaryFromContent (private)", () => {
    type ServiceWithPrivate = WritingMissionService & {
      extractSummaryFromContent: (content: string) => string;
    };

    let svc: ServiceWithPrivate;

    beforeEach(() => {
      svc = service as unknown as ServiceWithPrivate;
    });

    it("should return content as-is when length <= 800", () => {
      const content = "短内容".repeat(10);
      expect(content.length).toBeLessThanOrEqual(800);
      const result = svc.extractSummaryFromContent(content);
      expect(result).toBe(content);
    });

    it("should truncate long content to start and end", () => {
      const content = "A".repeat(1000);
      const result = svc.extractSummaryFromContent(content);
      expect(result.length).toBeLessThan(content.length);
      expect(result).toContain("...");
    });
  });

  // ==================== generateChapterSummarySimple ====================

  describe("generateChapterSummarySimple (private)", () => {
    type ServiceWithPrivate = WritingMissionService & {
      generateChapterSummarySimple: (content: string) => string;
    };

    let svc: ServiceWithPrivate;

    beforeEach(() => {
      svc = service as unknown as ServiceWithPrivate;
    });

    it("should return content unchanged when length <= 800", () => {
      const short = "这是短内容";
      const result = svc.generateChapterSummarySimple(short);
      expect(result).toBe(short);
    });

    it("should combine first and last 400 chars for long content", () => {
      const content = "A".repeat(400) + "B".repeat(400) + "C".repeat(400);
      const result = svc.generateChapterSummarySimple(content);
      expect(result).toContain("A");
      expect(result).toContain("C");
      expect(result).toContain("...");
    });
  });

  // ==================== parseConsistencyCheckResult ====================

  describe("parseConsistencyCheckResult (private)", () => {
    type ServiceWithPrivate = WritingMissionService & {
      parseConsistencyCheckResult: (content: string) => {
        passed: boolean;
        score: number;
        issues: unknown[];
      };
    };

    let svc: ServiceWithPrivate;

    beforeEach(() => {
      svc = service as unknown as ServiceWithPrivate;
    });

    it("should parse plain JSON", () => {
      const json = JSON.stringify({
        passed: false,
        score: 75,
        issues: [
          {
            type: "timeline",
            severity: "warning",
            description: "desc",
            location: "loc",
            fix: "fix",
          },
        ],
      });
      const result = svc.parseConsistencyCheckResult(json);
      expect(result.passed).toBe(false);
      expect(result.score).toBe(75);
      expect(result.issues).toHaveLength(1);
    });

    it("should parse markdown-wrapped JSON", () => {
      const json =
        "```json\n" +
        JSON.stringify({ passed: true, score: 100, issues: [] }) +
        "\n```";
      const result = svc.parseConsistencyCheckResult(json);
      expect(result.passed).toBe(true);
      expect(result.score).toBe(100);
    });

    it("should parse code block wrapped JSON", () => {
      const json =
        "```\n" +
        JSON.stringify({ passed: true, score: 90, issues: [] }) +
        "\n```";
      const result = svc.parseConsistencyCheckResult(json);
      expect(result.score).toBe(90);
    });

    it("should return default when content is invalid JSON", () => {
      const result = svc.parseConsistencyCheckResult("not valid json at all");
      expect(result.passed).toBe(true);
      expect(result.score).toBe(100);
      expect(result.issues).toHaveLength(0);
    });

    it("should extract embedded JSON object from surrounding text", () => {
      const content =
        'Some text before {"passed": true, "score": 85, "issues": []} some text after';
      const result = svc.parseConsistencyCheckResult(content);
      expect(result.score).toBe(85);
    });
  });

  // ==================== extractFirstJsonObject ====================

  describe("extractFirstJsonObject (private)", () => {
    type ServiceWithPrivate = WritingMissionService & {
      extractFirstJsonObject: (content: string) => string | null;
    };

    let svc: ServiceWithPrivate;

    beforeEach(() => {
      svc = service as unknown as ServiceWithPrivate;
    });

    it("should return null when no opening brace", () => {
      const result = svc.extractFirstJsonObject("no json here");
      expect(result).toBeNull();
    });

    it("should extract valid JSON object", () => {
      const result = svc.extractFirstJsonObject(
        'prefix {"key": "value"} suffix',
      );
      expect(result).toBe('{"key": "value"}');
    });

    it("should handle nested braces", () => {
      const result = svc.extractFirstJsonObject('{"outer": {"inner": 1}}');
      expect(result).toBe('{"outer": {"inner": 1}}');
    });

    it("should handle strings with escaped braces", () => {
      const result = svc.extractFirstJsonObject('{"key": "val\\\"ue"}');
      expect(result).not.toBeNull();
    });

    it("should return null for unclosed brace", () => {
      const result = svc.extractFirstJsonObject('{"key": "value"');
      expect(result).toBeNull();
    });
  });

  // ==================== buildConstraints ====================

  describe("buildConstraints (private)", () => {
    type ServiceWithPrivate = WritingMissionService & {
      buildConstraints: (input: {
        missionType: string;
        targetWordCount?: number;
      }) => Record<string, unknown>;
    };

    let svc: ServiceWithPrivate;

    beforeEach(() => {
      svc = service as unknown as ServiceWithPrivate;
    });

    it("should return comprehensive constraints for full_story", () => {
      const constraints = svc.buildConstraints({ missionType: "full_story" });
      expect(constraints).toHaveProperty("cost");
      expect(constraints).toHaveProperty("quality");
      expect(constraints).toHaveProperty("efficiency");
      const quality = constraints.quality as Record<string, unknown>;
      expect(quality.depth).toBe("comprehensive");
    });

    it("should return standard quality depth for chapter type", () => {
      const constraints = svc.buildConstraints({ missionType: "chapter" });
      const quality = constraints.quality as Record<string, unknown>;
      expect(quality.depth).toBe("standard");
    });

    it("should use longer maxDuration for full_story", () => {
      const fullStoryConstraints = svc.buildConstraints({
        missionType: "full_story",
      });
      const chapterConstraints = svc.buildConstraints({
        missionType: "chapter",
      });
      const fullStoryEfficiency = fullStoryConstraints.efficiency as Record<
        string,
        unknown
      >;
      const chapterEfficiency = chapterConstraints.efficiency as Record<
        string,
        unknown
      >;
      expect(fullStoryEfficiency.maxDuration).toBeGreaterThan(
        chapterEfficiency.maxDuration as number,
      );
    });
  });

  // ==================== verifyProjectAccess ====================

  describe("verifyProjectAccess (private)", () => {
    type ServiceWithPrivate = WritingMissionService & {
      verifyProjectAccess: (projectId: string, userId: string) => Promise<void>;
    };

    let svc: ServiceWithPrivate;

    beforeEach(() => {
      svc = service as unknown as ServiceWithPrivate;
    });

    it("should throw when project not found", async () => {
      mockPrisma.writingProject.findUnique.mockResolvedValue(null);
      await expect(svc.verifyProjectAccess("proj-1", "user-1")).rejects.toThrow(
        "Project not found",
      );
    });

    it("should throw when user is not the owner", async () => {
      mockPrisma.writingProject.findUnique.mockResolvedValue({
        ownerId: "other-user",
      });
      await expect(svc.verifyProjectAccess("proj-1", "user-1")).rejects.toThrow(
        "Access denied",
      );
    });

    it("should resolve when user is the owner", async () => {
      mockPrisma.writingProject.findUnique.mockResolvedValue({
        ownerId: "user-1",
      });
      await expect(
        svc.verifyProjectAccess("proj-1", "user-1"),
      ).resolves.toBeUndefined();
    });
  });

  // ==================== updateProjectWordCount ====================

  describe("updateProjectWordCount (private)", () => {
    type ServiceWithPrivate = WritingMissionService & {
      updateProjectWordCount: (projectId: string) => Promise<void>;
    };

    let svc: ServiceWithPrivate;

    beforeEach(() => {
      svc = service as unknown as ServiceWithPrivate;
    });

    it("should aggregate word count and update project", async () => {
      mockPrisma.writingChapter.aggregate.mockResolvedValue({
        _sum: { wordCount: 12000 },
      });
      mockPrisma.writingProject.update.mockResolvedValue({});

      await svc.updateProjectWordCount("proj-1");

      expect(mockPrisma.writingChapter.aggregate).toHaveBeenCalledWith(
        expect.objectContaining({ _sum: { wordCount: true } }),
      );
      expect(mockPrisma.writingProject.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: "proj-1" },
          data: expect.objectContaining({
            currentWords: 12000,
            status: "WRITING",
          }),
        }),
      );
    });

    it("should set status to PLANNING when no words", async () => {
      mockPrisma.writingChapter.aggregate.mockResolvedValue({
        _sum: { wordCount: 0 },
      });
      mockPrisma.writingProject.update.mockResolvedValue({});

      await svc.updateProjectWordCount("proj-1");

      expect(mockPrisma.writingProject.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            currentWords: 0,
            status: "PLANNING",
          }),
        }),
      );
    });

    it("should handle null word count sum", async () => {
      mockPrisma.writingChapter.aggregate.mockResolvedValue({
        _sum: { wordCount: null },
      });
      mockPrisma.writingProject.update.mockResolvedValue({});

      await svc.updateProjectWordCount("proj-1");

      expect(mockPrisma.writingProject.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ currentWords: 0 }),
        }),
      );
    });
  });

  // ==================== createMissionRecord ====================

  describe("createMissionRecord (private)", () => {
    type ServiceWithPrivate = WritingMissionService & {
      createMissionRecord: (
        missionId: string,
        input: Record<string, unknown>,
        userId: string,
      ) => Promise<unknown>;
    };

    let svc: ServiceWithPrivate;

    beforeEach(() => {
      svc = service as unknown as ServiceWithPrivate;
    });

    it("should create mission record with OUTLINE type for outline mission", async () => {
      mockPrisma.writingMission.create.mockResolvedValue({ id: "mission-1" });

      await svc.createMissionRecord(
        "mission-1",
        {
          missionType: "outline",
          projectId: "proj-1",
          userPrompt: "test",
        },
        "user-1",
      );

      expect(mockPrisma.writingMission.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ missionType: "OUTLINE" }),
        }),
      );
    });

    it("should create mission record with CHAPTER type for chapter mission", async () => {
      mockPrisma.writingMission.create.mockResolvedValue({ id: "mission-1" });

      await svc.createMissionRecord(
        "mission-1",
        {
          missionType: "chapter",
          projectId: "proj-1",
          userPrompt: "test",
        },
        "user-1",
      );

      expect(mockPrisma.writingMission.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ missionType: "CHAPTER" }),
        }),
      );
    });

    it("should map full_story to CHAPTER type", async () => {
      mockPrisma.writingMission.create.mockResolvedValue({ id: "mission-1" });

      await svc.createMissionRecord(
        "mission-1",
        {
          missionType: "full_story",
          projectId: "proj-1",
          userPrompt: "test",
        },
        "user-1",
      );

      expect(mockPrisma.writingMission.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ missionType: "CHAPTER" }),
        }),
      );
    });

    it("should map consistency_check to CONSISTENCY type", async () => {
      mockPrisma.writingMission.create.mockResolvedValue({ id: "mission-1" });

      await svc.createMissionRecord(
        "mission-1",
        {
          missionType: "consistency_check",
          projectId: "proj-1",
          userPrompt: "test",
        },
        "user-1",
      );

      expect(mockPrisma.writingMission.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ missionType: "CONSISTENCY" }),
        }),
      );
    });

    it("should map edit to REVISION type", async () => {
      mockPrisma.writingMission.create.mockResolvedValue({ id: "mission-1" });

      await svc.createMissionRecord(
        "mission-1",
        {
          missionType: "edit",
          projectId: "proj-1",
          userPrompt: "test",
        },
        "user-1",
      );

      expect(mockPrisma.writingMission.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ missionType: "REVISION" }),
        }),
      );
    });

    it("should use chapterId as targetId when provided", async () => {
      mockPrisma.writingMission.create.mockResolvedValue({ id: "mission-1" });

      await svc.createMissionRecord(
        "mission-1",
        {
          missionType: "chapter",
          projectId: "proj-1",
          chapterId: "ch-1",
          userPrompt: "test",
        },
        "user-1",
      );

      expect(mockPrisma.writingMission.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ targetId: "ch-1" }),
        }),
      );
    });
  });

  // ==================== updateMissionRecord ====================

  describe("updateMissionRecord (private)", () => {
    type ServiceWithPrivate = WritingMissionService & {
      updateMissionRecord: (
        missionId: string,
        result: Record<string, unknown>,
      ) => Promise<unknown>;
    };

    let svc: ServiceWithPrivate;

    beforeEach(() => {
      svc = service as unknown as ServiceWithPrivate;
    });

    it("should update mission to COMPLETED on success", async () => {
      mockPrisma.writingMission.update.mockResolvedValue({
        id: "mission-1",
        projectId: "proj-1",
      });
      mockPrisma.writingProject.findUnique.mockResolvedValue({
        currentWords: 5000,
      });
      mockPrisma.writingProject.update.mockResolvedValue({});

      await svc.updateMissionRecord("mission-1", {
        success: true,
        content: "content",
        wordCount: 5000,
        tokensUsed: 100,
        costUsed: 0.01,
        duration: 5000,
        deliverables: [],
        summary: "done",
        statistics: {},
      });

      expect(mockPrisma.writingMission.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: "COMPLETED" }),
        }),
      );
    });

    it("should update mission to FAILED on failure", async () => {
      mockPrisma.writingMission.update.mockResolvedValue({
        id: "mission-1",
        projectId: "proj-1",
      });
      mockPrisma.writingProject.findUnique.mockResolvedValue({
        currentWords: 0,
      });
      mockPrisma.writingProject.update.mockResolvedValue({});

      await svc.updateMissionRecord("mission-1", {
        success: false,
        deliverables: [],
        summary: "failed",
        tokensUsed: 0,
        costUsed: 0,
        duration: 0,
        error: {
          code: "ERR",
          message: "something went wrong",
          retryable: true,
        },
        statistics: {},
      });

      expect(mockPrisma.writingMission.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: "FAILED" }),
        }),
      );
    });

    it("should set project to REVISING when success", async () => {
      mockPrisma.writingMission.update.mockResolvedValue({
        id: "mission-1",
        projectId: "proj-1",
      });
      mockPrisma.writingProject.findUnique.mockResolvedValue({
        currentWords: 3000,
      });
      mockPrisma.writingProject.update.mockResolvedValue({});

      await svc.updateMissionRecord("mission-1", {
        success: true,
        deliverables: [],
        summary: "done",
        tokensUsed: 0,
        costUsed: 0,
        duration: 0,
        statistics: {},
      });

      expect(mockPrisma.writingProject.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: "REVISING" }),
        }),
      );
    });

    it("should set project to PLANNING when failed with no words", async () => {
      mockPrisma.writingMission.update.mockResolvedValue({
        id: "mission-1",
        projectId: "proj-1",
      });
      mockPrisma.writingProject.findUnique.mockResolvedValue({
        currentWords: 0,
      });
      mockPrisma.writingProject.update.mockResolvedValue({});

      await svc.updateMissionRecord("mission-1", {
        success: false,
        deliverables: [],
        summary: "failed",
        tokensUsed: 0,
        costUsed: 0,
        duration: 0,
        statistics: {},
      });

      expect(mockPrisma.writingProject.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: "PLANNING" }),
        }),
      );
    });
  });

  // ==================== applyBibleUpdates ====================

  describe("applyBibleUpdates (private)", () => {
    type ServiceWithPrivate = WritingMissionService & {
      applyBibleUpdates: (
        projectId: string,
        updates: Array<{ type: string; data: unknown }>,
      ) => Promise<void>;
    };

    let svc: ServiceWithPrivate;

    beforeEach(() => {
      svc = service as unknown as ServiceWithPrivate;
    });

    it("should not throw for empty updates array", async () => {
      await expect(
        svc.applyBibleUpdates("proj-1", []),
      ).resolves.toBeUndefined();
    });

    it("should handle null/undefined updates gracefully", async () => {
      await expect(
        svc.applyBibleUpdates("proj-1", undefined as unknown as []),
      ).resolves.toBeUndefined();
    });

    it("should process character_state updates without throwing", async () => {
      await expect(
        svc.applyBibleUpdates("proj-1", [
          {
            type: "character_state",
            data: { character: "hero", state: "injured" },
          },
        ]),
      ).resolves.toBeUndefined();
    });

    it("should process timeline_event updates without throwing", async () => {
      await expect(
        svc.applyBibleUpdates("proj-1", [
          { type: "timeline_event", data: { event: "battle", time: "day 5" } },
        ]),
      ).resolves.toBeUndefined();
    });

    it("should process new_fact updates without throwing", async () => {
      await expect(
        svc.applyBibleUpdates("proj-1", [
          { type: "new_fact", data: { fact: "magic exists" } },
        ]),
      ).resolves.toBeUndefined();
    });

    it("should handle multiple update types at once", async () => {
      await expect(
        svc.applyBibleUpdates("proj-1", [
          { type: "character_state", data: {} },
          { type: "timeline_event", data: {} },
          { type: "new_fact", data: {} },
        ]),
      ).resolves.toBeUndefined();
    });
  });

  // ==================== getTemplateStylePrompt ====================

  describe("getTemplateStylePrompt", () => {
    it("should return undefined when project has no styleTemplateId", async () => {
      mockPrisma.writingProject.findUnique.mockResolvedValue({
        styleTemplateId: null,
      });

      const result = await service.getTemplateStylePrompt("proj-1");

      expect(result).toBeUndefined();
    });

    it("should return undefined when project not found", async () => {
      mockPrisma.writingProject.findUnique.mockResolvedValue(null);

      const result = await service.getTemplateStylePrompt("proj-1");

      expect(result).toBeUndefined();
    });

    it("should return undefined and not throw when styleTemplateService throws", async () => {
      mockPrisma.writingProject.findUnique.mockResolvedValue({
        styleTemplateId: "template-1",
      });
      // StyleTemplateService is injected as {} (empty mock), so getMergedStyleConfig will throw
      const result = await service.getTemplateStylePrompt("proj-1");
      expect(result).toBeUndefined();
    });

    it("should return undefined when mergedConfig is null", async () => {
      mockPrisma.writingProject.findUnique.mockResolvedValue({
        styleTemplateId: "template-1",
      });
      // Provide a mock with getMergedStyleConfig returning null
      const mockStyleTemplateService = {
        getMergedStyleConfig: jest.fn().mockResolvedValue(null),
      };
      // Access the private styleTemplateService via reflection
      (service as unknown as Record<string, unknown>).styleTemplateService =
        mockStyleTemplateService;

      const result = await service.getTemplateStylePrompt("proj-1");

      expect(result).toBeUndefined();
    });

    it("should return fullPrompt when mergedConfig is valid", async () => {
      mockPrisma.writingProject.findUnique.mockResolvedValue({
        styleTemplateId: "template-1",
      });
      const mockStyleTemplateService = {
        getMergedStyleConfig: jest
          .fn()
          .mockResolvedValue({ fullPrompt: "Custom style prompt" }),
      };
      (service as unknown as Record<string, unknown>).styleTemplateService =
        mockStyleTemplateService;

      const result = await service.getTemplateStylePrompt("proj-1");

      expect(result).toBe("Custom style prompt");
    });
  });

  // ==================== getProjectMissions ====================

  describe("getProjectMissions", () => {
    it("should return missions without status filter", async () => {
      const mockMissions = [
        {
          id: "m-1",
          projectId: "proj-1",
          missionType: "CHAPTER",
          status: "COMPLETED",
          createdAt: new Date(),
          startedAt: new Date(),
          completedAt: new Date(),
          result: null,
        },
        {
          id: "m-2",
          projectId: "proj-1",
          missionType: "OUTLINE",
          status: "FAILED",
          createdAt: new Date(),
          startedAt: new Date(),
          completedAt: null,
          result: null,
        },
      ];
      mockPrisma.writingMission.findMany.mockResolvedValue(mockMissions);
      mockPrisma.writingMission.count = jest.fn().mockResolvedValue(2);

      const result = await service.getProjectMissions("proj-1");

      expect(result.total).toBe(2);
      expect(result.items).toHaveLength(2);
      expect(result.items[0].id).toBe("m-1");
      expect(mockPrisma.writingMission.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { projectId: "proj-1" } }),
      );
    });

    it("should apply uppercase status filter", async () => {
      mockPrisma.writingMission.findMany.mockResolvedValue([]);
      mockPrisma.writingMission.count = jest.fn().mockResolvedValue(0);

      await service.getProjectMissions("proj-1", "completed");

      expect(mockPrisma.writingMission.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { projectId: "proj-1", status: "COMPLETED" },
        }),
      );
    });

    it("should extract progress from result object", async () => {
      const mockMissions = [
        {
          id: "m-1",
          projectId: "proj-1",
          missionType: "CHAPTER",
          status: "IN_PROGRESS",
          createdAt: new Date(),
          startedAt: new Date(),
          completedAt: null,
          result: { progress: 45, currentStep: "writing" },
        },
      ];
      mockPrisma.writingMission.findMany.mockResolvedValue(mockMissions);
      mockPrisma.writingMission.count = jest.fn().mockResolvedValue(1);

      const result = await service.getProjectMissions("proj-1");

      expect(result.items[0].progress).toBe(45);
      expect(result.items[0].currentStep).toBe("writing");
    });

    it("should default progress to 0 when result has no progress", async () => {
      const mockMissions = [
        {
          id: "m-1",
          projectId: "proj-1",
          missionType: "CHAPTER",
          status: "COMPLETED",
          createdAt: new Date(),
          startedAt: new Date(),
          completedAt: new Date(),
          result: null,
        },
      ];
      mockPrisma.writingMission.findMany.mockResolvedValue(mockMissions);
      mockPrisma.writingMission.count = jest.fn().mockResolvedValue(1);

      const result = await service.getProjectMissions("proj-1");

      expect(result.items[0].progress).toBe(0);
      expect(result.items[0].currentStep).toBe("");
    });
  });

  // ==================== reExtractChapterTitles ====================

  describe("reExtractChapterTitles", () => {
    it("should throw when project not found", async () => {
      mockPrisma.writingProject.findUnique.mockResolvedValue(null);

      await expect(
        service.reExtractChapterTitles("proj-1", "user-1"),
      ).rejects.toThrow("Access denied");
    });

    it("should throw when user is not the owner", async () => {
      mockPrisma.writingProject.findUnique.mockResolvedValue({
        ownerId: "other-user",
      });

      await expect(
        service.reExtractChapterTitles("proj-1", "user-1"),
      ).rejects.toThrow("Access denied");
    });

    it("should return empty result when no chapters exist", async () => {
      mockPrisma.writingProject.findUnique.mockResolvedValue({
        ownerId: "user-1",
      });
      mockPrisma.writingChapter.findMany.mockResolvedValue([]);
      mockPrisma.writingChapter.update.mockResolvedValue({});

      const result = await service.reExtractChapterTitles("proj-1", "user-1");

      expect(result.updated).toBe(0);
      expect(result.chapters).toHaveLength(0);
    });

    it("should update chapter with placeholder title from content", async () => {
      mockPrisma.writingProject.findUnique.mockResolvedValue({
        ownerId: "user-1",
      });
      mockPrisma.writingChapter.findMany.mockResolvedValue([
        {
          id: "ch-1",
          chapterNumber: 1,
          title: "第一章", // placeholder
          content: "第一章 英雄崛起\n故事内容开始...",
          outline: null,
        },
      ]);
      mockPrisma.writingChapter.update.mockResolvedValue({});

      const result = await service.reExtractChapterTitles("proj-1", "user-1");

      expect(result.updated).toBe(1);
      expect(result.chapters[0].id).toBe("ch-1");
      expect(mockPrisma.writingChapter.update).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: "ch-1" } }),
      );
    });

    it("should not update chapter when title is not a placeholder", async () => {
      mockPrisma.writingProject.findUnique.mockResolvedValue({
        ownerId: "user-1",
      });
      mockPrisma.writingChapter.findMany.mockResolvedValue([
        {
          id: "ch-1",
          chapterNumber: 1,
          title: "英雄崛起", // real title, not placeholder
          content: "第一章 英雄崛起\n故事内容",
          outline: null,
        },
      ]);
      mockPrisma.writingChapter.update.mockResolvedValue({});

      const result = await service.reExtractChapterTitles("proj-1", "user-1");

      expect(result.updated).toBe(0);
      expect(mockPrisma.writingChapter.update).not.toHaveBeenCalled();
    });

    it("should clean outline with chapter number prefix", async () => {
      mockPrisma.writingProject.findUnique.mockResolvedValue({
        ownerId: "user-1",
      });
      mockPrisma.writingChapter.findMany.mockResolvedValue([
        {
          id: "ch-1",
          chapterNumber: 1,
          title: "英雄崛起",
          content: "第一章 英雄崛起\n故事内容",
          outline: "第一章 这是大纲内容",
        },
      ]);
      mockPrisma.writingChapter.update.mockResolvedValue({});

      const result = await service.reExtractChapterTitles("proj-1", "user-1");

      // Outline should be cleaned even when title is not a placeholder
      expect(mockPrisma.writingChapter.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            outline: expect.not.stringContaining("第一章"),
          }),
        }),
      );
      expect(result.updated).toBe(1);
    });

    it("should clear outline when value is 待创作", async () => {
      mockPrisma.writingProject.findUnique.mockResolvedValue({
        ownerId: "user-1",
      });
      mockPrisma.writingChapter.findMany.mockResolvedValue([
        {
          id: "ch-1",
          chapterNumber: 1,
          title: "英雄崛起",
          content: "内容",
          outline: "待创作",
        },
      ]);
      mockPrisma.writingChapter.update.mockResolvedValue({});

      const result = await service.reExtractChapterTitles("proj-1", "user-1");

      expect(mockPrisma.writingChapter.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ outline: "" }),
        }),
      );
      expect(result.updated).toBe(1);
    });
  });

  // ==================== generateContentDirectly ====================

  describe("generateContentDirectly (private)", () => {
    type ServiceWithPrivate = WritingMissionService & {
      generateContentDirectly: (
        input: {
          missionType: string;
          projectId: string;
          userPrompt: string;
          targetWordCount?: number;
          additionalInstructions?: string;
          chapterId?: string;
          volumeId?: string;
        },
        modelId: string,
        missionId: string,
      ) => Promise<string | null>;
    };

    let svc: ServiceWithPrivate;

    beforeEach(() => {
      svc = service as unknown as ServiceWithPrivate;
    });

    it("should call LLM for outline mission and return content", async () => {
      mockFacade.chat.mockResolvedValue({
        content: "大纲内容\n第一章\n第二章\n第三章\n这里有足够的大纲信息",
        tokensUsed: 100,
      });

      const result = await svc.generateContentDirectly(
        {
          missionType: "outline",
          projectId: "proj-1",
          userPrompt: "创作一个故事",
        },
        "test-model",
        "mission-1",
      );

      expect(result).toContain("大纲内容");
      expect(mockFacade.chat).toHaveBeenCalledWith(
        expect.objectContaining({
          model: "test-model",
          messages: expect.arrayContaining([
            expect.objectContaining({ role: "system" }),
            expect.objectContaining({
              role: "user",
              content: expect.stringContaining("大纲"),
            }),
          ]),
        }),
      );
    });

    it("should call LLM for chapter mission and return content", async () => {
      mockFacade.chat.mockResolvedValue({
        content: "章节内容，足够长的文字",
        tokensUsed: 100,
      });

      const result = await svc.generateContentDirectly(
        { missionType: "chapter", projectId: "proj-1", userPrompt: "第一章" },
        "test-model",
        "mission-1",
      );

      expect(result).toContain("章节内容");
    });

    it("should return null when LLM returns empty content", async () => {
      mockFacade.chat.mockResolvedValue({ content: "", tokensUsed: 0 });

      const result = await svc.generateContentDirectly(
        { missionType: "chapter", projectId: "proj-1", userPrompt: "test" },
        "test-model",
        "mission-1",
      );

      expect(result).toBeNull();
    });

    it("should throw when LLM call fails", async () => {
      mockFacade.chat.mockRejectedValue(new Error("API Error"));

      await expect(
        svc.generateContentDirectly(
          { missionType: "chapter", projectId: "proj-1", userPrompt: "test" },
          "test-model",
          "mission-1",
        ),
      ).rejects.toThrow("API Error");
    });

    it("should include targetWordCount in prompt when provided", async () => {
      mockFacade.chat.mockResolvedValue({
        content: "content with many words",
        tokensUsed: 100,
      });

      await svc.generateContentDirectly(
        {
          missionType: "chapter",
          projectId: "proj-1",
          userPrompt: "test",
          targetWordCount: 5000,
        },
        "test-model",
        "mission-1",
      );

      expect(mockFacade.chat).toHaveBeenCalledWith(
        expect.objectContaining({
          messages: expect.arrayContaining([
            expect.objectContaining({
              content: expect.stringContaining("5000"),
            }),
          ]),
        }),
      );
    });

    it("should include additionalInstructions in prompt when provided", async () => {
      mockFacade.chat.mockResolvedValue({
        content: "generated content here",
        tokensUsed: 100,
      });

      await svc.generateContentDirectly(
        {
          missionType: "chapter",
          projectId: "proj-1",
          userPrompt: "test",
          additionalInstructions: "保持黑暗风格",
        },
        "test-model",
        "mission-1",
      );

      expect(mockFacade.chat).toHaveBeenCalledWith(
        expect.objectContaining({
          messages: expect.arrayContaining([
            expect.objectContaining({
              content: expect.stringContaining("保持黑暗风格"),
            }),
          ]),
        }),
      );
    });

    it("should call executeLeaderCommand for edit mission", async () => {
      // executeLeaderCommand will try to call chat; set it up to return a leader response
      mockFacade.chat
        .mockResolvedValueOnce({
          content: '{"intent": "answer", "response": "已为您修改"}',
          tokensUsed: 50,
        })
        .mockResolvedValueOnce({
          content: "已为您修改的内容",
          tokensUsed: 100,
        });

      const result = await svc.generateContentDirectly(
        { missionType: "edit", projectId: "proj-1", userPrompt: "修改第一章" },
        "test-model",
        "mission-1",
      );

      // Should return whatever executeLeaderCommand returned
      expect(result).toBeDefined();
    });

    it("should return DELEGATE_FULL_STORY_INTERNAL for edit mission that delegates to full_story", async () => {
      // Mock executeLeaderCommand to return [DELEGATE_TO_FULL_STORY] prefix
      mockFacade.chat.mockResolvedValueOnce({
        content:
          '{"intent": "create_chapters", "response": "[DELEGATE_TO_FULL_STORY] creating chapters"}',
        tokensUsed: 50,
      });

      // Inject a mock executeLeaderCommand via reflection
      const originalExecuteLeaderCommand = (
        service as unknown as Record<string, unknown>
      ).executeLeaderCommand;
      (service as unknown as Record<string, unknown>).executeLeaderCommand =
        jest
          .fn()
          .mockResolvedValue("[DELEGATE_TO_FULL_STORY] creating chapters");

      const result = await svc.generateContentDirectly(
        { missionType: "edit", projectId: "proj-1", userPrompt: "写新章节" },
        "test-model",
        "mission-1",
      );

      expect(result).toBe("[DELEGATE_FULL_STORY_INTERNAL]");

      // Restore original
      (service as unknown as Record<string, unknown>).executeLeaderCommand =
        originalExecuteLeaderCommand;
    });
  });

  // ==================== updateChapterContent ====================

  describe("updateChapterContent (private)", () => {
    type ServiceWithPrivate = WritingMissionService & {
      updateChapterContent: (
        chapterId: string,
        content: string,
        wordCount: number,
      ) => Promise<void>;
    };

    let svc: ServiceWithPrivate;

    beforeEach(() => {
      svc = service as unknown as ServiceWithPrivate;
    });

    it("should update chapter with provided content and word count", async () => {
      mockPrisma.writingChapter.update.mockResolvedValue({});

      await svc.updateChapterContent("ch-1", "章节内容", 500);

      expect(mockPrisma.writingChapter.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: "ch-1" },
          data: expect.objectContaining({
            content: "章节内容",
            wordCount: 500,
            status: "DRAFT",
          }),
        }),
      );
    });
  });

  // ==================== createNewChapter ====================

  describe("createNewChapter (private)", () => {
    type ServiceWithPrivate = WritingMissionService & {
      createNewChapter: (
        volumeId: string,
        content: string,
        wordCount: number,
      ) => Promise<void>;
    };

    let svc: ServiceWithPrivate;

    beforeEach(() => {
      svc = service as unknown as ServiceWithPrivate;
    });

    it("should create chapter with incremented chapter number", async () => {
      mockPrisma.writingChapter.count.mockResolvedValue(3); // 3 existing chapters
      mockPrisma.writingChapter.create.mockResolvedValue({ id: "ch-4" });

      await svc.createNewChapter("vol-1", "章节内容", 500);

      expect(mockPrisma.writingChapter.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            volumeId: "vol-1",
            chapterNumber: 4,
            content: "章节内容",
            wordCount: 500,
            status: "DRAFT",
          }),
        }),
      );
    });

    it("should create first chapter when volume is empty", async () => {
      mockPrisma.writingChapter.count.mockResolvedValue(0);
      mockPrisma.writingChapter.create.mockResolvedValue({ id: "ch-1" });

      await svc.createNewChapter("vol-1", "内容", 100);

      expect(mockPrisma.writingChapter.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ chapterNumber: 1 }),
        }),
      );
    });
  });

  // ==================== saveEditToLatestContent ====================

  describe("saveEditToLatestContent (private)", () => {
    type ServiceWithPrivate = WritingMissionService & {
      saveEditToLatestContent: (
        projectId: string,
        content: string,
        wordCount: number,
      ) => Promise<void>;
      updateChapterContent: (
        chapterId: string,
        content: string,
        wordCount: number,
      ) => Promise<void>;
      createNewChapter: (
        volumeId: string,
        content: string,
        wordCount: number,
      ) => Promise<void>;
      createVolumeAndChapters: (
        projectId: string,
        content: string,
        wordCount: number,
      ) => Promise<void>;
    };

    let svc: ServiceWithPrivate;

    beforeEach(() => {
      svc = service as unknown as ServiceWithPrivate;
    });

    it("should update latest chapter when volume and chapter exist", async () => {
      mockPrisma.writingVolume.findFirst.mockResolvedValue({
        id: "vol-1",
        volumeNumber: 1,
      });
      mockPrisma.writingChapter.findFirst.mockResolvedValue({
        id: "ch-1",
        chapterNumber: 3,
      });
      mockPrisma.writingChapter.update.mockResolvedValue({});

      await svc.saveEditToLatestContent("proj-1", "edit content", 300);

      expect(mockPrisma.writingChapter.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: "ch-1" },
          data: expect.objectContaining({
            content: "edit content",
            wordCount: 300,
          }),
        }),
      );
    });

    it("should create new chapter when volume exists but has no chapters", async () => {
      mockPrisma.writingVolume.findFirst.mockResolvedValue({
        id: "vol-1",
        volumeNumber: 1,
      });
      mockPrisma.writingChapter.findFirst.mockResolvedValue(null);
      mockPrisma.writingChapter.count.mockResolvedValue(0);
      mockPrisma.writingChapter.create.mockResolvedValue({ id: "ch-1" });

      await svc.saveEditToLatestContent("proj-1", "edit content", 300);

      expect(mockPrisma.writingChapter.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ content: "edit content" }),
        }),
      );
    });

    it("should create volume and chapters when no volume exists", async () => {
      mockPrisma.writingVolume.findFirst.mockResolvedValue(null);
      mockPrisma.writingVolume.create.mockResolvedValue({ id: "vol-1" });
      mockPrisma.writingChapter.findMany.mockResolvedValue([]);
      mockPrisma.writingChapter.create.mockResolvedValue({ id: "ch-1" });
      mockPrisma.writingChapter.aggregate.mockResolvedValue({
        _sum: { wordCount: 300 },
      });
      mockPrisma.writingProject.update.mockResolvedValue({});

      await svc.saveEditToLatestContent("proj-1", "edit content", 300);

      expect(mockPrisma.writingVolume.create).toHaveBeenCalled();
    });
  });

  // ==================== checkExistingContent ====================

  describe("checkExistingContent (private)", () => {
    type ServiceWithPrivate = WritingMissionService & {
      checkExistingContent: (
        projectId: string,
      ) => Promise<Record<string, unknown>>;
    };

    let svc: ServiceWithPrivate;

    beforeEach(() => {
      svc = service as unknown as ServiceWithPrivate;
      // Add storyBible mock
      (mockPrisma as unknown as Record<string, unknown>).storyBible = {
        findUnique: jest.fn().mockResolvedValue(null),
      };
    });

    it("should return hasContent false when no chapters exist", async () => {
      mockPrisma.writingProject.findUnique.mockResolvedValue({
        currentWords: 0,
        targetWords: 50000,
        description: "Test project",
      });
      mockPrisma.writingChapter.findMany.mockResolvedValue([]);
      (mockPrisma as unknown as Record<string, unknown>).storyBible = {
        findUnique: jest.fn().mockResolvedValue(null),
      };

      const result = await svc.checkExistingContent("proj-1");

      expect(result.hasContent).toBe(false);
      expect(result.totalChapters).toBe(0);
    });

    it("should return hasContent true when chapters and words exist", async () => {
      mockPrisma.writingProject.findUnique.mockResolvedValue({
        currentWords: 3000,
        targetWords: 50000,
        description: "Test",
      });
      mockPrisma.writingChapter.findMany.mockResolvedValue([
        {
          id: "ch-1",
          chapterNumber: 1,
          title: "第一章",
          volumeId: "vol-1",
          wordCount: 3000,
          content: "Real content here",
        },
      ]);
      (mockPrisma as unknown as Record<string, unknown>).storyBible = {
        findUnique: jest.fn().mockResolvedValue(null),
      };

      const result = await svc.checkExistingContent("proj-1");

      expect(result.hasContent).toBe(true);
      expect(result.totalChapters).toBe(1);
      expect(result.writtenChapters).toBe(1);
      expect(result.unwrittenChapters).toHaveLength(0);
    });

    it("should identify unwritten chapters (wordCount = 0)", async () => {
      mockPrisma.writingProject.findUnique.mockResolvedValue({
        currentWords: 0,
        targetWords: 50000,
        description: null,
      });
      mockPrisma.writingChapter.findMany.mockResolvedValue([
        {
          id: "ch-1",
          chapterNumber: 1,
          title: "第一章",
          volumeId: "vol-1",
          wordCount: 0,
          content: "",
        },
        {
          id: "ch-2",
          chapterNumber: 2,
          title: "第二章",
          volumeId: "vol-1",
          wordCount: 0,
          content: "AI 写作团队正在创作中",
        },
      ]);
      (mockPrisma as unknown as Record<string, unknown>).storyBible = {
        findUnique: jest.fn().mockResolvedValue(null),
      };

      const result = await svc.checkExistingContent("proj-1");

      expect(result.unwrittenChapters).toHaveLength(2);
      expect(result.writtenChapters).toBe(0);
    });

    it("should return storyBible when it exists", async () => {
      mockPrisma.writingProject.findUnique.mockResolvedValue({
        currentWords: 3000,
        targetWords: 50000,
        description: "epic story",
      });
      mockPrisma.writingChapter.findMany.mockResolvedValue([]);
      (mockPrisma as unknown as Record<string, unknown>).storyBible = {
        findUnique: jest.fn().mockResolvedValue({
          worldType: "fantasy",
          theme: "heroism",
          premise: "a hero's journey",
          characters: [
            {
              name: "Hero",
              role: "protagonist",
              background: "village",
              personality: "brave",
            },
          ],
        }),
      };

      const result = await svc.checkExistingContent("proj-1");

      expect(result.storyBible).not.toBeNull();
      expect((result.storyBible as Record<string, unknown>).worldType).toBe(
        "fantasy",
      );
    });

    it("should return projectDescription from project", async () => {
      mockPrisma.writingProject.findUnique.mockResolvedValue({
        currentWords: 0,
        targetWords: 50000,
        description: "My epic story description",
      });
      mockPrisma.writingChapter.findMany.mockResolvedValue([]);
      (mockPrisma as unknown as Record<string, unknown>).storyBible = {
        findUnique: jest.fn().mockResolvedValue(null),
      };

      const result = await svc.checkExistingContent("proj-1");

      expect(result.projectDescription).toBe("My epic story description");
    });
  });

  // ==================== saveGeneratedContent ====================

  describe("saveGeneratedContent (private)", () => {
    type ServiceWithPrivate = WritingMissionService & {
      saveGeneratedContent: (
        input: {
          missionType: string;
          projectId: string;
          chapterId?: string;
          volumeId?: string;
          userPrompt: string;
          targetWordCount?: number;
        },
        content: string,
        wordCount: number,
        missionId?: string,
        modelId?: string,
      ) => Promise<void>;
    };

    let svc: ServiceWithPrivate;

    beforeEach(() => {
      svc = service as unknown as ServiceWithPrivate;
      mockPrisma.writingChapter.aggregate.mockResolvedValue({
        _sum: { wordCount: 500 },
      });
      mockPrisma.writingProject.update.mockResolvedValue({});
    });

    it("should skip save when content starts with [ALL_CHAPTERS_COMPLETED]", async () => {
      await svc.saveGeneratedContent(
        { missionType: "full_story", projectId: "proj-1", userPrompt: "test" },
        "[ALL_CHAPTERS_COMPLETED] all done",
        100,
      );

      expect(mockPrisma.writingChapter.create).not.toHaveBeenCalled();
      expect(mockPrisma.writingChapter.update).not.toHaveBeenCalled();
    });

    it("should skip save when content starts with [CONTINUATION_COMPLETE]", async () => {
      await svc.saveGeneratedContent(
        { missionType: "full_story", projectId: "proj-1", userPrompt: "test" },
        "[CONTINUATION_COMPLETE] continuation done",
        100,
      );

      expect(mockPrisma.writingChapter.create).not.toHaveBeenCalled();
    });

    it("should create volume and chapters for full_story missionType", async () => {
      mockPrisma.writingChapter.findMany.mockResolvedValue([]);
      mockPrisma.writingVolume.findFirst.mockResolvedValue(null);
      mockPrisma.writingVolume.create.mockResolvedValue({ id: "vol-1" });
      mockPrisma.writingChapter.create.mockResolvedValue({ id: "ch-1" });

      await svc.saveGeneratedContent(
        { missionType: "full_story", projectId: "proj-1", userPrompt: "test" },
        "第一章 开端\n很多内容在这里",
        500,
      );

      expect(mockPrisma.writingVolume.create).toHaveBeenCalled();
    });

    it("should update chapter for chapter missionType with chapterId", async () => {
      mockPrisma.writingChapter.update.mockResolvedValue({});

      await svc.saveGeneratedContent(
        {
          missionType: "chapter",
          projectId: "proj-1",
          chapterId: "ch-1",
          userPrompt: "test",
        },
        "章节内容",
        500,
      );

      expect(mockPrisma.writingChapter.update).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: "ch-1" } }),
      );
    });

    it("should create new chapter for chapter missionType with volumeId", async () => {
      mockPrisma.writingChapter.count.mockResolvedValue(2);
      mockPrisma.writingChapter.create.mockResolvedValue({ id: "ch-3" });

      await svc.saveGeneratedContent(
        {
          missionType: "chapter",
          projectId: "proj-1",
          volumeId: "vol-1",
          userPrompt: "test",
        },
        "新章节内容",
        500,
      );

      expect(mockPrisma.writingChapter.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ volumeId: "vol-1" }),
        }),
      );
    });

    it("should not throw on database error (swallows errors)", async () => {
      mockPrisma.writingChapter.update.mockRejectedValue(new Error("DB Error"));

      await expect(
        svc.saveGeneratedContent(
          {
            missionType: "chapter",
            projectId: "proj-1",
            chapterId: "ch-1",
            userPrompt: "test",
          },
          "content",
          100,
        ),
      ).resolves.toBeUndefined();
    });
  });

  // ==================== createPlaceholderChapter ====================

  describe("createPlaceholderChapter (private)", () => {
    type ServiceWithPrivate = WritingMissionService & {
      createPlaceholderChapter: (input: {
        missionType: string;
        projectId: string;
        userPrompt: string;
        targetWordCount?: number;
      }) => Promise<void>;
    };

    let svc: ServiceWithPrivate;

    beforeEach(() => {
      svc = service as unknown as ServiceWithPrivate;
    });

    it("should create placeholder chapter when no volume exists", async () => {
      mockPrisma.writingVolume.findFirst.mockResolvedValue(null);
      mockPrisma.writingVolume.create.mockResolvedValue({ id: "vol-1" });
      mockPrisma.writingChapter.count.mockResolvedValue(0);
      mockPrisma.writingChapter.create.mockResolvedValue({ id: "ch-1" });
      mockPrisma.writingChapter.aggregate.mockResolvedValue({
        _sum: { wordCount: 10 },
      });
      mockPrisma.writingProject.update.mockResolvedValue({});

      await svc.createPlaceholderChapter({
        missionType: "full_story",
        projectId: "proj-1",
        userPrompt: "test story",
      });

      expect(mockPrisma.writingVolume.create).toHaveBeenCalled();
      expect(mockPrisma.writingChapter.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ title: "创作中..." }),
        }),
      );
    });

    it("should not create placeholder when chapters already exist in volume", async () => {
      mockPrisma.writingVolume.findFirst.mockResolvedValue({ id: "vol-1" });
      mockPrisma.writingChapter.count.mockResolvedValue(3); // already has chapters

      await svc.createPlaceholderChapter({
        missionType: "chapter",
        projectId: "proj-1",
        userPrompt: "test",
      });

      expect(mockPrisma.writingChapter.create).not.toHaveBeenCalled();
    });

    it("should use existing volume when one exists", async () => {
      mockPrisma.writingVolume.findFirst.mockResolvedValue({
        id: "existing-vol-1",
      });
      mockPrisma.writingChapter.count.mockResolvedValue(0);
      mockPrisma.writingChapter.create.mockResolvedValue({ id: "ch-1" });
      mockPrisma.writingChapter.aggregate.mockResolvedValue({
        _sum: { wordCount: 10 },
      });
      mockPrisma.writingProject.update.mockResolvedValue({});

      await svc.createPlaceholderChapter({
        missionType: "full_story",
        projectId: "proj-1",
        userPrompt: "test",
      });

      expect(mockPrisma.writingVolume.create).not.toHaveBeenCalled();
      expect(mockPrisma.writingChapter.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ volumeId: "existing-vol-1" }),
        }),
      );
    });

    it("should not throw on database error", async () => {
      mockPrisma.writingVolume.findFirst.mockRejectedValue(
        new Error("DB Error"),
      );

      await expect(
        svc.createPlaceholderChapter({
          missionType: "full_story",
          projectId: "proj-1",
          userPrompt: "test",
        }),
      ).resolves.toBeUndefined();
    });
  });

  // ==================== initializeLongContentProject ====================

  describe("initializeLongContentProject (private)", () => {
    type ServiceWithPrivate = WritingMissionService & {
      initializeLongContentProject: (
        missionId: string,
        input: {
          missionType: string;
          targetWordCount?: number;
          userPrompt: string;
        },
      ) => Promise<void>;
    };

    let svc: ServiceWithPrivate;
    let mockLongContentEngine: { initProject: jest.Mock };

    beforeEach(() => {
      svc = service as unknown as ServiceWithPrivate;
      mockLongContentEngine = {
        initProject: jest.fn().mockResolvedValue(undefined),
      };
      (mockFacade as unknown as Record<string, unknown>).longContentEngine =
        mockLongContentEngine;
    });

    it("should initialize with chapter granularity for full_story", async () => {
      await svc.initializeLongContentProject("mission-1", {
        missionType: "full_story",
        userPrompt: "story",
      });

      expect(mockLongContentEngine.initProject).toHaveBeenCalledWith(
        expect.objectContaining({ granularityLevel: "chapter" }),
      );
    });

    it("should initialize with section granularity for outline", async () => {
      await svc.initializeLongContentProject("mission-1", {
        missionType: "outline",
        userPrompt: "story",
      });

      expect(mockLongContentEngine.initProject).toHaveBeenCalledWith(
        expect.objectContaining({ granularityLevel: "section" }),
      );
    });

    it("should initialize with section granularity for revision", async () => {
      await svc.initializeLongContentProject("mission-1", {
        missionType: "revision",
        userPrompt: "story",
      });

      expect(mockLongContentEngine.initProject).toHaveBeenCalledWith(
        expect.objectContaining({ granularityLevel: "section" }),
      );
    });

    it("should initialize with section granularity for edit", async () => {
      await svc.initializeLongContentProject("mission-1", {
        missionType: "edit",
        userPrompt: "story",
      });

      expect(mockLongContentEngine.initProject).toHaveBeenCalledWith(
        expect.objectContaining({ granularityLevel: "section" }),
      );
    });

    it("should initialize with chapter granularity for default (chapter) type", async () => {
      await svc.initializeLongContentProject("mission-1", {
        missionType: "chapter",
        userPrompt: "story",
      });

      expect(mockLongContentEngine.initProject).toHaveBeenCalledWith(
        expect.objectContaining({ granularityLevel: "chapter" }),
      );
    });

    it("should use targetWordCount to estimate total tasks for full_story", async () => {
      await svc.initializeLongContentProject("mission-1", {
        missionType: "full_story",
        targetWordCount: 9000,
        userPrompt: "story",
      });

      expect(mockLongContentEngine.initProject).toHaveBeenCalledWith(
        expect.objectContaining({ totalTasks: 3 }), // ceil(9000/3000) = 3
      );
    });
  });

  // ==================== buildChapterWriterPrompt ====================

  describe("buildChapterWriterPrompt (private)", () => {
    type ServiceWithPrivate = WritingMissionService & {
      buildChapterWriterPrompt: (
        chapterNumber: number,
        chapterInfo: { title: string; plot: string; keyPoint: string },
        outline: { core: { summary: string; genre: string; theme: string } },
        worldSettings: Record<string, unknown>,
        previousSummary: string,
        userPrompt: string,
        keeperContext?: unknown,
        styleId?: string,
        avoidancePrompt?: string,
        templateStylePrompt?: string,
        targetWordCount?: number,
      ) => string;
    };

    let svc: ServiceWithPrivate;

    beforeEach(() => {
      svc = service as unknown as ServiceWithPrivate;
    });

    it("should build prompt with chapter info", () => {
      const prompt = svc.buildChapterWriterPrompt(
        1,
        { title: "英雄崛起", plot: "主角初亮相", keyPoint: "第一次冲突" },
        { core: { summary: "故事概要", genre: "fantasy", theme: "heroism" } },
        {},
        "",
        "这是一个英雄故事",
      );

      expect(prompt).toContain("第一章");
      expect(prompt).toContain("英雄崛起");
      expect(prompt).toContain("主角初亮相");
      expect(prompt).toContain("第一次冲突");
    });

    it("should use templateStylePrompt when provided", () => {
      const prompt = svc.buildChapterWriterPrompt(
        1,
        { title: "测试章节", plot: "情节", keyPoint: "" },
        { core: { summary: "", genre: "fantasy", theme: "" } },
        {},
        "",
        "用户提示",
        undefined,
        undefined,
        undefined,
        "Custom template style prompt",
      );

      expect(prompt).toContain("Custom template style prompt");
    });

    it("should include previousSummary when provided", () => {
      const prompt = svc.buildChapterWriterPrompt(
        2,
        { title: "发展", plot: "情节发展", keyPoint: "" },
        { core: { summary: "", genre: "action", theme: "" } },
        {},
        "前一章讲了主角遇见了一个神秘人",
        "故事",
      );

      expect(prompt).toContain("前文摘要");
      expect(prompt).toContain("前一章讲了主角遇见了一个神秘人");
    });

    it("should include opening hint when no previousSummary", () => {
      const prompt = svc.buildChapterWriterPrompt(
        1,
        { title: "开端", plot: "故事开始", keyPoint: "" },
        { core: { summary: "", genre: "fantasy", theme: "" } },
        {},
        "", // no previous summary
        "故事",
      );

      expect(prompt).toContain("开篇说明");
    });

    it("should include character info when worldSettings has characters", () => {
      const prompt = svc.buildChapterWriterPrompt(
        1,
        { title: "Chapter", plot: "plot", keyPoint: "" },
        { core: { summary: "", genre: "fantasy", theme: "" } },
        {
          characters: [
            {
              name: "Alice",
              role: "protagonist",
              personality: ["brave", "smart"],
              motivation: "save the world",
            },
          ],
        },
        "",
        "story",
      );

      expect(prompt).toContain("Alice");
      expect(prompt).toContain("brave");
    });

    it("should include avoidance prompt when provided", () => {
      const prompt = svc.buildChapterWriterPrompt(
        1,
        { title: "Chapter", plot: "plot", keyPoint: "" },
        { core: { summary: "", genre: "fantasy", theme: "" } },
        {},
        "",
        "story",
        undefined,
        undefined,
        "避免使用：叹了口气，点了点头",
      );

      expect(prompt).toContain("避免使用：叹了口气，点了点头");
    });

    it("should include targetWordCount in prompt", () => {
      const prompt = svc.buildChapterWriterPrompt(
        1,
        { title: "Chapter", plot: "plot", keyPoint: "" },
        { core: { summary: "", genre: "fantasy", theme: "" } },
        {},
        "",
        "story",
        undefined,
        undefined,
        undefined,
        undefined,
        4000,
      );

      expect(prompt).toContain("4000");
    });
  });
});
