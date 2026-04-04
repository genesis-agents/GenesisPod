import { Test, TestingModule } from "@nestjs/testing";
import {
  WritingEventEmitterService,
  WritingEventType,
} from "../writing-event-emitter.service";
import { WritingRealtimeAdapter } from "../writing-realtime.adapter";

describe("WritingEventEmitterService", () => {
  let service: WritingEventEmitterService;
  let mockRealtimeAdapter: jest.Mocked<WritingRealtimeAdapter>;

  beforeEach(async () => {
    mockRealtimeAdapter = {
      emitToProject: jest.fn(),
      startMissionTracking: jest.fn(),
      startPhase: jest.fn(),
      completePhase: jest.fn(),
      completeMissionTracking: jest.fn(),
      failMissionTracking: jest.fn(),
    } as unknown as jest.Mocked<WritingRealtimeAdapter>;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WritingEventEmitterService,
        { provide: WritingRealtimeAdapter, useValue: mockRealtimeAdapter },
      ],
    }).compile();

    service = module.get<WritingEventEmitterService>(
      WritingEventEmitterService,
    );
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe("registerEmitHandler", () => {
    it("should register an emit handler", async () => {
      const handler = jest.fn().mockResolvedValue(undefined);
      service.registerEmitHandler(handler);

      await service.emitToProject("proj-1", WritingEventType.MISSION_STARTED, {
        test: true,
      });

      expect(handler).toHaveBeenCalledWith(
        "proj-1",
        WritingEventType.MISSION_STARTED,
        expect.objectContaining({ test: true }),
      );
    });
  });

  describe("emitToProject", () => {
    it("should call realtimeAdapter.emitToProject when adapter is available", async () => {
      await service.emitToProject("proj-1", WritingEventType.MISSION_STARTED, {
        missionId: "m-1",
      });

      expect(mockRealtimeAdapter.emitToProject).toHaveBeenCalledWith(
        "proj-1",
        WritingEventType.MISSION_STARTED,
        expect.objectContaining({ missionId: "m-1" }),
      );
    });

    it("should include timestamp in emitted data", async () => {
      const capturedData: unknown[] = [];
      mockRealtimeAdapter.emitToProject.mockImplementation(
        (_projectId, _event, data) => {
          capturedData.push(data);
        },
      );

      await service.emitToProject("proj-1", WritingEventType.CHAPTER_STARTED, {
        chapterNumber: 1,
      });

      expect(capturedData[0]).toHaveProperty("timestamp");
    });

    it("should not throw when no adapter and no handler registered", async () => {
      const moduleWithoutAdapter: TestingModule =
        await Test.createTestingModule({
          providers: [WritingEventEmitterService],
        }).compile();

      const serviceWithoutAdapter =
        moduleWithoutAdapter.get<WritingEventEmitterService>(
          WritingEventEmitterService,
        );

      await expect(
        serviceWithoutAdapter.emitToProject(
          "proj-1",
          WritingEventType.MISSION_FAILED,
          { error: "test" },
        ),
      ).resolves.not.toThrow();
    });

    it("should call both realtimeAdapter and handler when both registered", async () => {
      const handler = jest.fn().mockResolvedValue(undefined);
      service.registerEmitHandler(handler);

      await service.emitToProject("proj-1", WritingEventType.AGENT_WORKING, {
        agentId: "agent-1",
      });

      expect(mockRealtimeAdapter.emitToProject).toHaveBeenCalled();
      expect(handler).toHaveBeenCalled();
    });
  });

  describe("emitMissionStarted", () => {
    it("should emit MISSION_STARTED event with correct data", async () => {
      await service.emitMissionStarted("proj-1", "mission-1", "CHAPTER", 5000);

      expect(mockRealtimeAdapter.emitToProject).toHaveBeenCalledWith(
        "proj-1",
        WritingEventType.MISSION_STARTED,
        expect.objectContaining({
          missionId: "mission-1",
          missionType: "CHAPTER",
          targetWordCount: 5000,
        }),
      );
    });

    it("should call startMissionTracking on realtimeAdapter", async () => {
      await service.emitMissionStarted("proj-1", "mission-1", "CHAPTER", 5000);

      expect(mockRealtimeAdapter.startMissionTracking).toHaveBeenCalledWith(
        "proj-1",
        "mission-1",
      );
    });
  });

  describe("emitMissionCompleted", () => {
    it("should emit MISSION_COMPLETED event with stats", async () => {
      await service.emitMissionCompleted("proj-1", "mission-1", 10000, 5, 1);

      expect(mockRealtimeAdapter.emitToProject).toHaveBeenCalledWith(
        "proj-1",
        WritingEventType.MISSION_COMPLETED,
        expect.objectContaining({
          missionId: "mission-1",
          totalWords: 10000,
          totalChapters: 5,
          totalVolumes: 1,
        }),
      );
    });

    it("should call completeMissionTracking on realtimeAdapter", async () => {
      await service.emitMissionCompleted("proj-1", "mission-1", 10000, 5, 1);

      expect(mockRealtimeAdapter.completeMissionTracking).toHaveBeenCalledWith(
        "mission-1",
        "写作完成",
      );
    });
  });

  describe("emitMissionFailed", () => {
    it("should emit MISSION_FAILED event with error info", async () => {
      await service.emitMissionFailed(
        "proj-1",
        "mission-1",
        "AI service error",
      );

      expect(mockRealtimeAdapter.emitToProject).toHaveBeenCalledWith(
        "proj-1",
        WritingEventType.MISSION_FAILED,
        expect.objectContaining({
          missionId: "mission-1",
          error: "AI service error",
        }),
      );
    });

    it("should call failMissionTracking on realtimeAdapter", async () => {
      await service.emitMissionFailed("proj-1", "mission-1", "timeout");

      expect(mockRealtimeAdapter.failMissionTracking).toHaveBeenCalledWith(
        "mission-1",
        "timeout",
      );
    });
  });

  describe("emitChapterStarted", () => {
    it("should emit CHAPTER_STARTED event", async () => {
      await service.emitChapterStarted(
        "proj-1",
        1,
        "Chapter 1",
        0,
        "mission-1",
      );

      expect(mockRealtimeAdapter.emitToProject).toHaveBeenCalledWith(
        "proj-1",
        WritingEventType.CHAPTER_STARTED,
        expect.objectContaining({
          chapterNumber: 1,
          title: "Chapter 1",
          volumeIndex: 0,
        }),
      );
    });

    it("should trigger planning->writing phase transition for chapter 1", async () => {
      await service.emitChapterStarted(
        "proj-1",
        1,
        "Chapter 1",
        0,
        "mission-1",
      );

      expect(mockRealtimeAdapter.completePhase).toHaveBeenCalledWith(
        "mission-1",
        "planning",
        "大纲规划完成",
      );
      expect(mockRealtimeAdapter.startPhase).toHaveBeenCalledWith(
        "mission-1",
        "writing",
        "开始章节写作",
      );
    });

    it("should NOT trigger phase transition for chapters after first", async () => {
      await service.emitChapterStarted(
        "proj-1",
        2,
        "Chapter 2",
        0,
        "mission-1",
      );

      expect(mockRealtimeAdapter.completePhase).not.toHaveBeenCalled();
    });
  });

  describe("emitConsistencyCheck", () => {
    it("should emit CONSISTENCY_CHECK_STARTED when passed is true", async () => {
      await service.emitConsistencyCheck("proj-1", {
        chapterNumber: 1,
        passed: true,
        issues: [],
      });

      expect(mockRealtimeAdapter.emitToProject).toHaveBeenCalledWith(
        "proj-1",
        WritingEventType.CONSISTENCY_CHECK_STARTED,
        expect.anything(),
      );
    });

    it("should emit CONSISTENCY_ISSUES_FOUND when passed is false", async () => {
      await service.emitConsistencyCheck("proj-1", {
        chapterNumber: 1,
        passed: false,
        issues: [
          {
            type: "CHARACTER",
            severity: "warning",
            description: "Character inconsistency",
          },
        ],
      });

      expect(mockRealtimeAdapter.emitToProject).toHaveBeenCalledWith(
        "proj-1",
        WritingEventType.CONSISTENCY_ISSUES_FOUND,
        expect.anything(),
      );
    });
  });

  describe("emitWorldBuilding", () => {
    it("should emit WORLD_BUILDING_STARTED when status is started", async () => {
      await service.emitWorldBuilding("proj-1", "started");

      expect(mockRealtimeAdapter.emitToProject).toHaveBeenCalledWith(
        "proj-1",
        WritingEventType.WORLD_BUILDING_STARTED,
        expect.anything(),
      );
    });

    it("should emit WORLD_BUILDING_COMPLETED when status is completed", async () => {
      await service.emitWorldBuilding("proj-1", "completed", {}, "mission-1");

      expect(mockRealtimeAdapter.emitToProject).toHaveBeenCalledWith(
        "proj-1",
        WritingEventType.WORLD_BUILDING_COMPLETED,
        expect.anything(),
      );
    });

    it("should trigger preparation->planning phase transition on completion", async () => {
      await service.emitWorldBuilding("proj-1", "completed", {}, "mission-1");

      expect(mockRealtimeAdapter.completePhase).toHaveBeenCalledWith(
        "mission-1",
        "preparation",
        "世界观建设完成",
      );
      expect(mockRealtimeAdapter.startPhase).toHaveBeenCalledWith(
        "mission-1",
        "planning",
        "开始大纲规划",
      );
    });
  });

  describe("emitKeeperContextReady", () => {
    it("should emit KEEPER_CONTEXT_READY event with context data", async () => {
      const context = {
        relevantCharacters: ["张三"],
        relevantLocations: ["天龙山"],
        previousEvents: ["大战"],
        warnings: [],
      };

      await service.emitKeeperContextReady("proj-1", 3, context);

      expect(mockRealtimeAdapter.emitToProject).toHaveBeenCalledWith(
        "proj-1",
        WritingEventType.KEEPER_CONTEXT_READY,
        expect.objectContaining({
          chapterNumber: 3,
          context,
        }),
      );
    });
  });
});
