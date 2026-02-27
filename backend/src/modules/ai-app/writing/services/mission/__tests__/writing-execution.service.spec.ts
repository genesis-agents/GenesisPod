/**
 * Unit tests for WritingExecutionService
 */

import { Test, TestingModule } from "@nestjs/testing";
import { WritingExecutionService } from "../writing-execution.service";
import { PrismaService } from "../../../../../../common/prisma/prisma.service";
import type { WritingMissionInput } from "../writing-mission.service";

function buildMockPrisma() {
  return {
    writingMission: {
      update: jest.fn().mockResolvedValue({}),
    },
  };
}

describe("WritingExecutionService", () => {
  let service: WritingExecutionService;
  let prisma: ReturnType<typeof buildMockPrisma>;

  const mockMissionInput: WritingMissionInput = {
    projectId: "project-1",
    missionType: "chapter",
    chapterId: "chapter-1",
    userPrompt: "Write a chapter about a hero's journey",
    targetWordCount: 3000,
  };

  const mockModelAssignments = [
    { roleId: "story-architect", modelId: "model-o1", isActive: true },
    { roleId: "writer", modelId: "model-gpt4", isActive: true },
  ];

  beforeEach(async () => {
    prisma = buildMockPrisma();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WritingExecutionService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    service = module.get<WritingExecutionService>(WritingExecutionService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe("updateMissionProgress", () => {
    it("should update progress in database", async () => {
      await service.updateMissionProgress("mission-1", 50, "Writing chapter");

      expect(prisma.writingMission.update).toHaveBeenCalledWith({
        where: { id: "mission-1" },
        data: {
          result: { progress: 50, currentStep: "Writing chapter" },
        },
      });
    });

    it("should not throw when database update fails", async () => {
      prisma.writingMission.update.mockRejectedValue(new Error("DB error"));

      await expect(
        service.updateMissionProgress("mission-1", 50, "step"),
      ).resolves.not.toThrow();
    });
  });

  describe("runMissionInBackground", () => {
    it("should use writer model when available", async () => {
      const generateContentDirectly = jest
        .fn()
        .mockResolvedValue(
          "This is a very long chapter content that definitely exceeds the minimum word count requirement and contains much more text to satisfy the validator check in the service. ".repeat(
            20,
          ),
        );
      const saveGeneratedContent = jest.fn().mockResolvedValue(undefined);
      const updateMissionRecord = jest.fn().mockResolvedValue(undefined);
      const countWords = jest.fn().mockReturnValue(500);

      await service.runMissionInBackground(
        "mission-1",
        mockMissionInput,
        "user-1",
        mockModelAssignments,
        jest.fn(),
        generateContentDirectly,
        saveGeneratedContent,
        updateMissionRecord,
        countWords,
      );

      expect(generateContentDirectly).toHaveBeenCalledWith(
        expect.anything(),
        "model-gpt4",
        "mission-1",
      );
    });

    it("should call generateFullStory for full_story mission type", async () => {
      const fullStoryInput = {
        ...mockMissionInput,
        missionType: "full_story" as const,
      };
      const generateFullStory = jest
        .fn()
        .mockResolvedValue("[ALL_CHAPTERS_COMPLETED] All done");
      const saveGeneratedContent = jest.fn().mockResolvedValue(undefined);
      const updateMissionRecord = jest.fn().mockResolvedValue(undefined);
      const countWords = jest.fn().mockReturnValue(10);

      await service.runMissionInBackground(
        "mission-1",
        fullStoryInput,
        "user-1",
        mockModelAssignments,
        generateFullStory,
        jest.fn(),
        saveGeneratedContent,
        updateMissionRecord,
        countWords,
      );

      expect(generateFullStory).toHaveBeenCalled();
    });

    it("should update mission record as failed when content generation returns null", async () => {
      const generateContentDirectly = jest.fn().mockResolvedValue(null);
      const updateMissionRecord = jest.fn().mockResolvedValue(undefined);
      const countWords = jest.fn().mockReturnValue(0);

      await service.runMissionInBackground(
        "mission-1",
        mockMissionInput,
        "user-1",
        mockModelAssignments,
        jest.fn(),
        generateContentDirectly,
        jest.fn(),
        updateMissionRecord,
        countWords,
      );

      expect(updateMissionRecord).toHaveBeenCalledWith(
        "mission-1",
        expect.objectContaining({ success: false }),
      );
    });

    it("should update mission record as failed when content is too short", async () => {
      const generateContentDirectly = jest
        .fn()
        .mockResolvedValue("Short content");
      const updateMissionRecord = jest.fn().mockResolvedValue(undefined);
      const countWords = jest.fn().mockReturnValue(2);

      await service.runMissionInBackground(
        "mission-1",
        mockMissionInput,
        "user-1",
        mockModelAssignments,
        jest.fn(),
        generateContentDirectly,
        jest.fn(),
        updateMissionRecord,
        countWords,
      );

      expect(updateMissionRecord).toHaveBeenCalledWith(
        "mission-1",
        expect.objectContaining({ success: false }),
      );
    });

    it("should skip word count check for edit mission type", async () => {
      const editInput = { ...mockMissionInput, missionType: "edit" as const };
      const editContent = "Short edited content.";
      const generateContentDirectly = jest.fn().mockResolvedValue(editContent);
      const saveGeneratedContent = jest.fn().mockResolvedValue(undefined);
      const updateMissionRecord = jest.fn().mockResolvedValue(undefined);
      const countWords = jest.fn().mockReturnValue(3);

      await service.runMissionInBackground(
        "mission-1",
        editInput,
        "user-1",
        mockModelAssignments,
        jest.fn(),
        generateContentDirectly,
        saveGeneratedContent,
        updateMissionRecord,
        countWords,
      );

      expect(updateMissionRecord).toHaveBeenCalledWith(
        "mission-1",
        expect.objectContaining({ success: true }),
      );
    });

    it("should handle DELEGATE_FULL_STORY_INTERNAL marker", async () => {
      const generateContentDirectly = jest
        .fn()
        .mockResolvedValue("[DELEGATE_FULL_STORY_INTERNAL]");
      const generateFullStory = jest
        .fn()
        .mockResolvedValue("[ALL_CHAPTERS_COMPLETED] Done");
      const saveGeneratedContent = jest.fn().mockResolvedValue(undefined);
      const updateMissionRecord = jest.fn().mockResolvedValue(undefined);
      const countWords = jest.fn().mockReturnValue(5);

      await service.runMissionInBackground(
        "mission-1",
        mockMissionInput,
        "user-1",
        mockModelAssignments,
        generateFullStory,
        generateContentDirectly,
        saveGeneratedContent,
        updateMissionRecord,
        countWords,
      );

      expect(generateFullStory).toHaveBeenCalled();
    });

    it("should update mission as failed when exception thrown", async () => {
      const generateContentDirectly = jest
        .fn()
        .mockRejectedValue(new Error("LLM timeout"));
      const updateMissionRecord = jest.fn().mockResolvedValue(undefined);
      const countWords = jest.fn().mockReturnValue(0);

      await service.runMissionInBackground(
        "mission-1",
        mockMissionInput,
        "user-1",
        mockModelAssignments,
        jest.fn(),
        generateContentDirectly,
        jest.fn(),
        updateMissionRecord,
        countWords,
      );

      expect(updateMissionRecord).toHaveBeenCalledWith(
        "mission-1",
        expect.objectContaining({
          success: false,
          error: expect.objectContaining({
            code: "WRITING_ERROR",
          }),
        }),
      );
    });
  });
});
