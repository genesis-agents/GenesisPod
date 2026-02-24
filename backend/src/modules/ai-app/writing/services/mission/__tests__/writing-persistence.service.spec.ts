import { Test, TestingModule } from "@nestjs/testing";
import { NotFoundException } from "@nestjs/common";
import { WritingPersistence } from "../writing-persistence.service";
import { PrismaService } from "../../../../../../common/prisma/prisma.service";

describe("WritingPersistence", () => {
  let service: WritingPersistence;
  let mockPrisma: jest.Mocked<PrismaService>;

  beforeEach(async () => {
    mockPrisma = {
      writingProject: {
        findUnique: jest.fn(),
        update: jest.fn(),
      },
      writingMission: {
        create: jest.fn(),
        update: jest.fn(),
        findUnique: jest.fn(),
        findMany: jest.fn(),
        updateMany: jest.fn(),
        count: jest.fn(),
      },
      writingChapter: {
        findUnique: jest.fn(),
        findMany: jest.fn(),
        findFirst: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        count: jest.fn(),
        deleteMany: jest.fn(),
      },
      writingVolume: {
        findFirst: jest.fn(),
        findMany: jest.fn(),
        create: jest.fn(),
        deleteMany: jest.fn(),
      },
      writingMissionLog: {
        create: jest.fn(),
        findMany: jest.fn(),
      },
    } as unknown as jest.Mocked<PrismaService>;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WritingPersistence,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<WritingPersistence>(WritingPersistence);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe("verifyProjectAccess", () => {
    it("should resolve when user owns the project", async () => {
      (mockPrisma.writingProject.findUnique as jest.Mock).mockResolvedValue({
        ownerId: "user-1",
      });

      await expect(
        service.verifyProjectAccess("project-1", "user-1"),
      ).resolves.toBeUndefined();
    });

    it("should throw when project not found", async () => {
      (mockPrisma.writingProject.findUnique as jest.Mock).mockResolvedValue(null);

      await expect(
        service.verifyProjectAccess("nonexistent", "user-1"),
      ).rejects.toThrow("Project not found");
    });

    it("should throw when user does not own the project", async () => {
      (mockPrisma.writingProject.findUnique as jest.Mock).mockResolvedValue({
        ownerId: "other-user",
      });

      await expect(
        service.verifyProjectAccess("project-1", "user-1"),
      ).rejects.toThrow("Access denied");
    });
  });

  describe("createMissionRecord", () => {
    it("should create a mission record with correct type mapping", async () => {
      const mockMission = { id: "mission-1", projectId: "project-1" };
      (mockPrisma.writingMission.create as jest.Mock).mockResolvedValue(mockMission);

      const input = {
        projectId: "project-1",
        missionType: "chapter" as const,
        chapterId: "chapter-1",
      } as any;

      await service.createMissionRecord("mission-1", input, "user-1");

      expect(mockPrisma.writingMission.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            id: "mission-1",
            missionType: "CHAPTER",
            status: "IN_PROGRESS",
          }),
        }),
      );
    });

    it("should map outline mission type correctly", async () => {
      (mockPrisma.writingMission.create as jest.Mock).mockResolvedValue({});

      const input = { projectId: "project-1", missionType: "outline" } as any;
      await service.createMissionRecord("m-1", input, "user-1");

      expect(mockPrisma.writingMission.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ missionType: "OUTLINE" }),
        }),
      );
    });

    it("should map consistency_check to CONSISTENCY", async () => {
      (mockPrisma.writingMission.create as jest.Mock).mockResolvedValue({});

      const input = {
        projectId: "project-1",
        missionType: "consistency_check",
      } as any;
      await service.createMissionRecord("m-1", input, "user-1");

      expect(mockPrisma.writingMission.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ missionType: "CONSISTENCY" }),
        }),
      );
    });

    it("should use projectId as targetId when no chapterId or volumeId", async () => {
      (mockPrisma.writingMission.create as jest.Mock).mockResolvedValue({});

      const input = { projectId: "project-1", missionType: "outline" } as any;
      await service.createMissionRecord("m-1", input, "user-1");

      expect(mockPrisma.writingMission.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ targetId: "project-1" }),
        }),
      );
    });
  });

  describe("updateMissionRecord", () => {
    it("should update mission to COMPLETED when result is success", async () => {
      const mockMission = { projectId: "project-1" };
      (mockPrisma.writingMission.update as jest.Mock).mockResolvedValue(mockMission);
      (mockPrisma.writingProject.findUnique as jest.Mock).mockResolvedValue({
        currentWords: 5000,
      });
      (mockPrisma.writingProject.update as jest.Mock).mockResolvedValue({});

      const result = { success: true, tokensUsed: 100 } as any;
      await service.updateMissionRecord("mission-1", result);

      expect(mockPrisma.writingMission.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: "COMPLETED" }),
        }),
      );
    });

    it("should update mission to FAILED when result is not success", async () => {
      const mockMission = { projectId: "project-1" };
      (mockPrisma.writingMission.update as jest.Mock).mockResolvedValue(mockMission);
      (mockPrisma.writingProject.findUnique as jest.Mock).mockResolvedValue({
        currentWords: 0,
      });
      (mockPrisma.writingProject.update as jest.Mock).mockResolvedValue({});

      const result = {
        success: false,
        error: { code: "ERR", message: "Failed", retryable: false },
      } as any;
      await service.updateMissionRecord("mission-1", result);

      expect(mockPrisma.writingMission.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: "FAILED" }),
        }),
      );
    });

    it("should update project status based on word count", async () => {
      const mockMission = { projectId: "project-1" };
      (mockPrisma.writingMission.update as jest.Mock).mockResolvedValue(mockMission);
      (mockPrisma.writingProject.findUnique as jest.Mock).mockResolvedValue({
        currentWords: 0,
      });
      (mockPrisma.writingProject.update as jest.Mock).mockResolvedValue({});

      const result = { success: false } as any;
      await service.updateMissionRecord("mission-1", result);

      expect(mockPrisma.writingProject.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: "PLANNING" }),
        }),
      );
    });
  });

  describe("updateChapterContent", () => {
    it("should update chapter content and word count", async () => {
      (mockPrisma.writingChapter.update as jest.Mock).mockResolvedValue({});

      await service.updateChapterContent("chapter-1", "新内容", 500);

      expect(mockPrisma.writingChapter.update).toHaveBeenCalledWith({
        where: { id: "chapter-1" },
        data: expect.objectContaining({
          content: "新内容",
          wordCount: 500,
          status: "DRAFT",
        }),
      });
    });
  });

  describe("createNewChapter", () => {
    it("should create a new chapter with correct chapter number", async () => {
      (mockPrisma.writingChapter.count as jest.Mock).mockResolvedValue(2);
      (mockPrisma.writingChapter.create as jest.Mock).mockResolvedValue({});

      await service.createNewChapter("volume-1", "内容", 300);

      expect(mockPrisma.writingChapter.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            volumeId: "volume-1",
            chapterNumber: 3,
            content: "内容",
            wordCount: 300,
          }),
        }),
      );
    });
  });

  describe("updateProjectWordCount", () => {
    it("should calculate and update total word count", async () => {
      (mockPrisma.writingVolume.findMany as jest.Mock).mockResolvedValue([
        {
          id: "vol-1",
          chapters: [{ wordCount: 2000 }, { wordCount: 3000 }],
        },
        {
          id: "vol-2",
          chapters: [{ wordCount: 1000 }],
        },
      ]);
      (mockPrisma.writingProject.update as jest.Mock).mockResolvedValue({});

      await service.updateProjectWordCount("project-1");

      expect(mockPrisma.writingProject.update).toHaveBeenCalledWith({
        where: { id: "project-1" },
        data: { currentWords: 6000 },
      });
    });
  });

  describe("getProjectMissions", () => {
    it("should return missions for a project", async () => {
      const mockMissions = [
        {
          id: "m-1",
          projectId: "project-1",
          missionType: "CHAPTER",
          status: "COMPLETED",
          createdAt: new Date(),
          startedAt: new Date(),
          completedAt: new Date(),
          result: null,
        },
      ];
      (mockPrisma.writingMission.findMany as jest.Mock).mockResolvedValue(mockMissions);
      (mockPrisma.writingMission.count as jest.Mock).mockResolvedValue(1);

      const result = await service.getProjectMissions("project-1");

      expect(result.items).toHaveLength(1);
      expect(result.total).toBe(1);
    });

    it("should filter by status when provided", async () => {
      (mockPrisma.writingMission.findMany as jest.Mock).mockResolvedValue([]);
      (mockPrisma.writingMission.count as jest.Mock).mockResolvedValue(0);

      await service.getProjectMissions("project-1", "completed");

      expect(mockPrisma.writingMission.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { projectId: "project-1", status: "COMPLETED" },
        }),
      );
    });
  });

  describe("getMissionStatus", () => {
    it("should return mission status for authorized user", async () => {
      const mockMission = {
        id: "mission-1",
        project: { ownerId: "user-1" },
      };
      (mockPrisma.writingMission.findUnique as jest.Mock).mockResolvedValue(mockMission);

      const result = await service.getMissionStatus("mission-1", "user-1");

      expect(result.id).toBe("mission-1");
    });

    it("should throw NotFoundException when mission not found", async () => {
      (mockPrisma.writingMission.findUnique as jest.Mock).mockResolvedValue(null);

      await expect(
        service.getMissionStatus("nonexistent", "user-1"),
      ).rejects.toThrow(NotFoundException);
    });

    it("should throw NotFoundException when user does not own the project", async () => {
      (mockPrisma.writingMission.findUnique as jest.Mock).mockResolvedValue({
        id: "mission-1",
        project: { ownerId: "other-user" },
      });

      await expect(
        service.getMissionStatus("mission-1", "user-1"),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe("forceCleanupStuckMissions", () => {
    it("should return message when no stuck missions found", async () => {
      (mockPrisma.writingMission.findMany as jest.Mock).mockResolvedValue([]);

      const result = await service.forceCleanupStuckMissions(
        "project-1",
        "user-1",
      );

      expect(result.cleanedCount).toBe(0);
      expect(result.message).toContain("没有发现");
    });

    it("should clean stuck missions and return count", async () => {
      (mockPrisma.writingMission.findMany as jest.Mock).mockResolvedValue([
        { id: "m-1" },
        { id: "m-2" },
      ]);
      (mockPrisma.writingMission.updateMany as jest.Mock).mockResolvedValue({});

      const result = await service.forceCleanupStuckMissions(
        "project-1",
        "user-1",
      );

      expect(result.cleanedCount).toBe(2);
      expect(mockPrisma.writingMission.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: "FAILED" }),
        }),
      );
    });
  });

  describe("cancelMission", () => {
    it("should cancel an in-progress mission", async () => {
      const mockMission = {
        id: "mission-1",
        status: "IN_PROGRESS",
        project: { ownerId: "user-1" },
      };
      (mockPrisma.writingMission.findUnique as jest.Mock).mockResolvedValue(mockMission);
      (mockPrisma.writingMission.update as jest.Mock).mockResolvedValue({});

      const result = await service.cancelMission("mission-1", "user-1");

      expect(result.success).toBe(true);
      expect(mockPrisma.writingMission.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: "FAILED",
          }),
        }),
      );
    });

    it("should throw when trying to cancel a non-in-progress mission", async () => {
      const mockMission = {
        id: "mission-1",
        status: "COMPLETED",
        project: { ownerId: "user-1" },
      };
      (mockPrisma.writingMission.findUnique as jest.Mock).mockResolvedValue(mockMission);

      await expect(
        service.cancelMission("mission-1", "user-1"),
      ).rejects.toThrow("只能取消进行中的任务");
    });
  });

  describe("getMissionLogs", () => {
    it("should return mission logs", async () => {
      const mockMission = {
        id: "mission-1",
        project: { ownerId: "user-1" },
      };
      (mockPrisma.writingMission.findUnique as jest.Mock).mockResolvedValue(mockMission);

      const mockLogs = [
        { id: "log-1", missionId: "mission-1", eventType: "START", content: "开始" },
      ];
      (mockPrisma.writingMissionLog.findMany as jest.Mock).mockResolvedValue(mockLogs);

      const result = await service.getMissionLogs("mission-1", "user-1");

      expect(result).toHaveLength(1);
    });
  });

  describe("saveMissionLog", () => {
    it("should save a mission log entry", async () => {
      (mockPrisma.writingMissionLog.create as jest.Mock).mockResolvedValue({});

      await service.saveMissionLog("mission-1", "INFO", "测试日志", {
        agentId: "agent-1",
        agentName: "TestAgent",
      });

      expect(mockPrisma.writingMissionLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            missionId: "mission-1",
            eventType: "INFO",
            content: "测试日志",
            agentId: "agent-1",
          }),
        }),
      );
    });

    it("should not throw when log creation fails", async () => {
      (mockPrisma.writingMissionLog.create as jest.Mock).mockRejectedValue(
        new Error("DB Error"),
      );

      await expect(
        service.saveMissionLog("mission-1", "INFO", "日志"),
      ).resolves.toBeUndefined();
    });
  });

  describe("saveGeneratedContent", () => {
    it("should skip content that starts with completion marker", async () => {
      await service.saveGeneratedContent(
        { projectId: "project-1", missionType: "chapter" } as any,
        "[ALL_CHAPTERS_COMPLETED]",
        0,
      );

      expect(mockPrisma.writingChapter.update).not.toHaveBeenCalled();
    });

    it("should update chapter content for chapter mission with chapterId", async () => {
      (mockPrisma.writingChapter.update as jest.Mock).mockResolvedValue({});
      (mockPrisma.writingVolume.findMany as jest.Mock).mockResolvedValue([
        { id: "vol-1", chapters: [{ wordCount: 500 }] },
      ]);
      (mockPrisma.writingProject.update as jest.Mock).mockResolvedValue({});

      await service.saveGeneratedContent(
        {
          projectId: "project-1",
          missionType: "chapter",
          chapterId: "chapter-1",
        } as any,
        "章节内容",
        500,
      );

      expect(mockPrisma.writingChapter.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: "chapter-1" },
        }),
      );
    });

    it("should create new chapter for chapter mission with volumeId", async () => {
      (mockPrisma.writingChapter.count as jest.Mock).mockResolvedValue(1);
      (mockPrisma.writingChapter.create as jest.Mock).mockResolvedValue({});
      (mockPrisma.writingVolume.findMany as jest.Mock).mockResolvedValue([
        { id: "vol-1", chapters: [{ wordCount: 500 }] },
      ]);
      (mockPrisma.writingProject.update as jest.Mock).mockResolvedValue({});

      await service.saveGeneratedContent(
        {
          projectId: "project-1",
          missionType: "chapter",
          volumeId: "volume-1",
        } as any,
        "章节内容",
        500,
      );

      expect(mockPrisma.writingChapter.create).toHaveBeenCalled();
    });
  });

  describe("createOutlineStructure", () => {
    it("should create volumes and chapters from outline", async () => {
      (mockPrisma.writingVolume.findMany as jest.Mock).mockResolvedValue([]);
      (mockPrisma.writingVolume.create as jest.Mock).mockResolvedValue({
        id: "vol-1",
      });
      (mockPrisma.writingChapter.count as jest.Mock).mockResolvedValue(0);
      (mockPrisma.writingChapter.create as jest.Mock).mockResolvedValue({});

      const outline = {
        core: { summary: "测试故事", genre: "fantasy", theme: "成长" },
        volumes: [{ title: "第一卷", conflict: "主角困境", plot: "开始", emotion: "希望" }],
        chapters: [
          { volumeIndex: 0, title: "第一章", plot: "相遇", keyPoint: "主角登场" },
        ],
      };

      await service.createOutlineStructure("project-1", outline);

      expect(mockPrisma.writingVolume.create).toHaveBeenCalledTimes(1);
      expect(mockPrisma.writingChapter.create).toHaveBeenCalledTimes(1);
    });

    it("should delete existing volumes and chapters before creating new ones", async () => {
      (mockPrisma.writingVolume.findMany as jest.Mock).mockResolvedValue([
        { id: "old-vol-1" },
      ]);
      (mockPrisma.writingChapter.deleteMany as jest.Mock).mockResolvedValue({});
      (mockPrisma.writingVolume.deleteMany as jest.Mock).mockResolvedValue({});
      (mockPrisma.writingVolume.create as jest.Mock).mockResolvedValue({ id: "vol-1" });
      (mockPrisma.writingChapter.count as jest.Mock).mockResolvedValue(0);
      (mockPrisma.writingChapter.create as jest.Mock).mockResolvedValue({});

      const outline = {
        core: { summary: "测试", genre: "fantasy", theme: "成长" },
        volumes: [{ title: "第一卷", conflict: "", plot: "", emotion: "" }],
        chapters: [],
      };

      await service.createOutlineStructure("project-1", outline);

      expect(mockPrisma.writingChapter.deleteMany).toHaveBeenCalled();
      expect(mockPrisma.writingVolume.deleteMany).toHaveBeenCalled();
    });
  });
});
