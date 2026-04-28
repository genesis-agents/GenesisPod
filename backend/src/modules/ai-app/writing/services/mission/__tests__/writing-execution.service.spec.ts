/**
 * Unit tests for WritingMissionExecutionService
 */

import { Test, TestingModule } from "@nestjs/testing";
import { WritingMissionExecutionService } from "../writing-mission-execution.service";
import { PrismaService } from "../../../../../../common/prisma/prisma.service";
import { ChatFacade, AgentFacade } from "../../../../../ai-harness/facade";
import { WritingMissionLifecycleService } from "../writing-mission-lifecycle.service";
import { WritingPersistence } from "../writing-persistence.service";
import { WritingEventEmitterService } from "../../events/writing-event-emitter.service";
import { WritingTextProcessorService } from "../writing-text-processor.service";
import type { WritingMissionInput } from "../writing-mission.types";
import type {
  RoleModelAssignment,
  IWritingTaskExecutor,
  WritingTaskResult,
} from "../../task-executors/task-executor.interface";

function buildMockPrisma() {
  return {
    writingMission: {
      update: jest.fn().mockResolvedValue({}),
    },
    writingProject: {
      findUnique: jest.fn().mockResolvedValue({
        id: "project-1",
        name: "Test Project",
        description: "A test project",
        targetWords: 50000,
      }),
    },
  };
}

function buildMockLifecycleService() {
  return {
    setExecutionService: jest.fn(),
    updateMissionProgress: jest.fn().mockResolvedValue(undefined),
    updateMissionRecord: jest.fn().mockResolvedValue(undefined),
    completeKernelProcess: jest.fn(),
    failKernelProcess: jest.fn(),
    getKernelProcessId: jest.fn().mockReturnValue("kernel-process-1"),
  };
}

function buildMockChatFacade() {
  return {
    getDefaultTextModel: jest
      .fn()
      .mockResolvedValue({ modelId: "default-model" }),
  };
}

function buildMockAgentFacade() {
  return {
    startTrace: jest.fn().mockReturnValue("trace-1"),
    addSpan: jest.fn().mockReturnValue("span-1"),
    endSpan: jest.fn(),
    endTrace: jest.fn(),
  };
}

describe("WritingMissionExecutionService", () => {
  let service: WritingMissionExecutionService;
  let prisma: ReturnType<typeof buildMockPrisma>;
  let lifecycleService: ReturnType<typeof buildMockLifecycleService>;

  const mockMissionInput: WritingMissionInput = {
    projectId: "project-1",
    missionType: "chapter",
    chapterId: "chapter-1",
    userPrompt: "Write a chapter about a hero's journey",
    targetWordCount: 3000,
  };

  const mockModelAssignments: RoleModelAssignment[] = [
    { roleId: "story-architect", modelId: "model-o1", isActive: true },
    { roleId: "writer", modelId: "model-gpt4", isActive: true },
  ];

  beforeEach(async () => {
    prisma = buildMockPrisma();
    lifecycleService = buildMockLifecycleService();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WritingMissionExecutionService,
        { provide: PrismaService, useValue: prisma },
        {
          provide: ChatFacade,
          useValue: buildMockChatFacade(),
        },
        {
          provide: AgentFacade,
          useValue: buildMockAgentFacade(),
        },
        {
          provide: WritingMissionLifecycleService,
          useValue: lifecycleService,
        },
        {
          provide: WritingPersistence,
          useValue: {
            saveGeneratedContent: jest.fn().mockResolvedValue(undefined),
          },
        },
        {
          provide: WritingEventEmitterService,
          useValue: {
            emitMissionCompleted: jest.fn().mockResolvedValue(undefined),
          },
        },
        {
          provide: WritingTextProcessorService,
          useValue: { countWords: jest.fn().mockReturnValue(500) },
        },
      ],
    }).compile();

    service = module.get<WritingMissionExecutionService>(
      WritingMissionExecutionService,
    );
  });

  afterEach(() => {
    jest.clearAllMocks();
    jest.useRealTimers();
  });

  describe("registerExecutor", () => {
    it("should register a task executor", () => {
      const mockExecutor: IWritingTaskExecutor = {
        taskType: "chapter",
        execute: jest.fn(),
      };

      // Should not throw
      expect(() => service.registerExecutor(mockExecutor)).not.toThrow();
    });
  });

  describe("runMissionInBackground", () => {
    it("should fail when no executor is registered for mission type", async () => {
      // No executor registered — should call failKernelProcess
      await service.runMissionInBackground(
        "mission-1",
        mockMissionInput,
        "user-1",
        mockModelAssignments,
      );

      expect(lifecycleService.failKernelProcess).toHaveBeenCalledWith(
        "mission-1",
        expect.stringContaining("No executor registered"),
      );
    });

    it("should execute mission with registered executor and succeed", async () => {
      const longContent =
        "This is generated content that is long enough. ".repeat(50);
      const mockExecutor: IWritingTaskExecutor = {
        taskType: "chapter",
        execute: jest.fn().mockResolvedValue({
          content: longContent,
          wordCount: 500,
          shouldPersist: true,
          summary: "Chapter generated",
        } satisfies WritingTaskResult),
      };

      service.registerExecutor(mockExecutor);

      await service.runMissionInBackground(
        "mission-1",
        mockMissionInput,
        "user-1",
        mockModelAssignments,
      );

      expect(mockExecutor.execute).toHaveBeenCalled();
      expect(lifecycleService.updateMissionRecord).toHaveBeenCalledWith(
        "mission-1",
        expect.objectContaining({ success: true }),
      );
    });

    it("should update mission as failed when executor throws", async () => {
      const mockExecutor: IWritingTaskExecutor = {
        taskType: "chapter",
        execute: jest.fn().mockRejectedValue(new Error("LLM timeout")),
      };

      service.registerExecutor(mockExecutor);

      await service.runMissionInBackground(
        "mission-1",
        mockMissionInput,
        "user-1",
        mockModelAssignments,
      );

      expect(lifecycleService.failKernelProcess).toHaveBeenCalledWith(
        "mission-1",
        expect.stringContaining("LLM timeout"),
      );
    });

    it("should handle DELEGATE_FULL_STORY_INTERNAL marker", async () => {
      const chapterExecutor: IWritingTaskExecutor = {
        taskType: "chapter",
        execute: jest.fn().mockResolvedValue({
          content: "[DELEGATE_FULL_STORY_INTERNAL]",
          wordCount: 0,
          shouldPersist: false,
        }),
      };
      const fullStoryContent =
        "[ALL_CHAPTERS_COMPLETED] Full story done. ".repeat(30);
      const fullStoryExecutor: IWritingTaskExecutor = {
        taskType: "full_story",
        execute: jest.fn().mockResolvedValue({
          content: fullStoryContent,
          wordCount: 500,
          shouldPersist: true,
          summary: "Full story completed",
        }),
      };

      service.registerExecutor(chapterExecutor);
      service.registerExecutor(fullStoryExecutor);

      await service.runMissionInBackground(
        "mission-1",
        mockMissionInput,
        "user-1",
        mockModelAssignments,
      );

      expect(chapterExecutor.execute).toHaveBeenCalled();
      expect(fullStoryExecutor.execute).toHaveBeenCalled();
      expect(lifecycleService.updateMissionRecord).toHaveBeenCalledWith(
        "mission-1",
        expect.objectContaining({ success: true }),
      );
    });

    it("should fail when executor returns null content", async () => {
      const mockExecutor: IWritingTaskExecutor = {
        taskType: "chapter",
        execute: jest.fn().mockResolvedValue({
          content: null,
          wordCount: 0,
          shouldPersist: false,
        }),
      };

      service.registerExecutor(mockExecutor);

      await service.runMissionInBackground(
        "mission-1",
        mockMissionInput,
        "user-1",
        mockModelAssignments,
      );

      expect(lifecycleService.failKernelProcess).toHaveBeenCalled();
    });

    it("should use writer model when available in assignments", async () => {
      const longContent = "Content for testing model selection. ".repeat(50);
      const mockExecutor: IWritingTaskExecutor = {
        taskType: "chapter",
        execute: jest.fn().mockResolvedValue({
          content: longContent,
          wordCount: 500,
          shouldPersist: true,
        }),
      };

      service.registerExecutor(mockExecutor);

      await service.runMissionInBackground(
        "mission-1",
        mockMissionInput,
        "user-1",
        mockModelAssignments,
      );

      // The executor should have been called with writer model (model-gpt4)
      const callContext = (mockExecutor.execute as jest.Mock).mock.calls[0][0];
      expect(callContext.modelId).toBe("model-gpt4");
    });
  });
});
