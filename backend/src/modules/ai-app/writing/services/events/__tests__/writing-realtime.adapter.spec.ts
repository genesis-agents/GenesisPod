import { Test, TestingModule } from "@nestjs/testing";
import { AgentFacade } from "@/modules/ai-harness/facade";

// Break circular dependency: writing-realtime.adapter imports WritingEventType from
// writing-event-emitter.service, which in turn imports WritingRealtimeAdapter.
jest.mock("../writing-event-emitter.service", () => ({
  WritingEventType: {
    MISSION_STARTED: "mission:started",
    MISSION_PROGRESS: "mission:progress",
    MISSION_COMPLETED: "mission:completed",
    MISSION_FAILED: "mission:failed",
    LEADER_RESPONSE: "leader:response",
    AGENT_WORKING: "agent:working",
    AGENT_COMPLETED: "agent:completed",
    AGENT_FAILED: "agent:failed",
    CHAPTER_STARTED: "chapter:started",
    CHAPTER_CONTENT: "chapter:content",
    CHAPTER_COMPLETED: "chapter:completed",
    CONSISTENCY_CHECK_STARTED: "consistency:check_started",
    CONSISTENCY_ISSUES_FOUND: "consistency:issues_found",
    CONSISTENCY_FIX_STARTED: "consistency:fix_started",
    CONSISTENCY_FIX_COMPLETED: "consistency:fix_completed",
    WORLD_BUILDING_STARTED: "world:building_started",
    WORLD_BUILDING_COMPLETED: "world:building_completed",
    KEEPER_EXTRACTING_CONTEXT: "keeper:extracting_context",
    KEEPER_CONTEXT_READY: "keeper:context_ready",
    KEEPER_UPDATING_BIBLE: "keeper:updating_bible",
    KEEPER_BIBLE_UPDATED: "keeper:bible_updated",
  },
  WritingEventEmitterService: jest.fn(),
}));

import { WritingRealtimeAdapter } from "../writing-realtime.adapter";

describe("WritingRealtimeAdapter", () => {
  let adapter: WritingRealtimeAdapter;
  let mockAiFacade: jest.Mocked<AgentFacade>;
  let mockRealtimeProgress: {
    create: jest.Mock;
    start: jest.Mock;
    startPhase: jest.Mock;
    completePhase: jest.Mock;
    updatePhaseProgress: jest.Mock;
    getProgress: jest.Mock;
    complete: jest.Mock;
    fail: jest.Mock;
  };
  let mockRealtimeEmitter: {
    emitToRoom: jest.Mock;
    subscribe: jest.Mock;
  };

  beforeEach(async () => {
    mockRealtimeProgress = {
      create: jest.fn(),
      start: jest.fn(),
      startPhase: jest.fn(),
      completePhase: jest.fn(),
      updatePhaseProgress: jest.fn(),
      getProgress: jest.fn().mockReturnValue({ progress: 50 }),
      complete: jest.fn(),
      fail: jest.fn(),
    };

    mockRealtimeEmitter = {
      emitToRoom: jest.fn(),
      subscribe: jest.fn().mockReturnValue(() => {}),
    };

    mockAiFacade = {
      realtimeProgress: mockRealtimeProgress,
      realtimeEmitter: mockRealtimeEmitter,
    } as unknown as jest.Mocked<AgentFacade>;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WritingRealtimeAdapter,
        { provide: AgentFacade, useValue: mockAiFacade },
      ],
    }).compile();

    adapter = module.get<WritingRealtimeAdapter>(WritingRealtimeAdapter);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe("onModuleInit", () => {
    it("should initialize without errors", () => {
      expect(() => adapter.onModuleInit()).not.toThrow();
    });
  });

  describe("startMissionTracking", () => {
    it("should create and start a progress tracker for a mission", () => {
      adapter.startMissionTracking("proj-1", "mission-1");

      expect(mockRealtimeProgress.create).toHaveBeenCalledWith(
        expect.objectContaining({
          id: "mission-1",
          type: "writing_mission",
          metadata: expect.objectContaining({ projectId: "proj-1" }),
        }),
      );
      expect(mockRealtimeProgress.start).toHaveBeenCalledWith("mission-1");
    });

    it("should include writing phases in tracking config", () => {
      adapter.startMissionTracking("proj-1", "mission-1");

      const createCall = mockRealtimeProgress.create.mock.calls[0][0];
      expect(createCall.phases).toBeDefined();
      expect(Array.isArray(createCall.phases)).toBe(true);
      expect(createCall.phases.length).toBeGreaterThan(0);
    });

    it("should set correct room config", () => {
      adapter.startMissionTracking("proj-1", "mission-1");

      const createCall = mockRealtimeProgress.create.mock.calls[0][0];
      expect(createCall.roomConfig).toEqual(
        expect.objectContaining({
          roomId: "writing:mission:mission-1",
          roomType: "mission",
          entityId: "mission-1",
        }),
      );
    });
  });

  describe("startChapterTracking", () => {
    it("should create chapter-level progress tracking", () => {
      adapter.startChapterTracking("ch-1", "mission-1");

      expect(mockRealtimeProgress.create).toHaveBeenCalledWith(
        expect.objectContaining({
          id: "chapter:ch-1",
          type: "chapter_writing",
          metadata: expect.objectContaining({
            chapterId: "ch-1",
            missionId: "mission-1",
          }),
        }),
      );
    });
  });

  describe("startPhase / completePhase", () => {
    it("should start a phase via realtimeProgress", () => {
      adapter.startPhase("mission-1", "preparation", "Starting prep");

      expect(mockRealtimeProgress.startPhase).toHaveBeenCalledWith(
        "mission-1",
        "preparation",
        "Starting prep",
      );
    });

    it("should complete a phase via realtimeProgress", () => {
      adapter.completePhase("mission-1", "writing", "Writing done");

      expect(mockRealtimeProgress.completePhase).toHaveBeenCalledWith(
        "mission-1",
        "writing",
        "Writing done",
      );
    });
  });

  describe("updateMissionProgress", () => {
    it("should update phase progress and return overall progress", () => {
      const result = adapter.updateMissionProgress(
        "mission-1",
        "writing",
        60,
        "Writing chapter 3",
      );

      expect(mockRealtimeProgress.updatePhaseProgress).toHaveBeenCalledWith(
        "mission-1",
        "writing",
        60,
        "Writing chapter 3",
      );
      expect(result).toBe(50); // from mock getProgress
    });

    it("should return 0 when getProgress returns null", () => {
      mockRealtimeProgress.getProgress.mockReturnValue(null);

      const result = adapter.updateMissionProgress("mission-1", "writing", 50);
      expect(result).toBe(0);
    });
  });

  describe("updateChapterProgress", () => {
    it("should update chapter phase progress using chapter: prefix", () => {
      adapter.updateChapterProgress("ch-1", "drafting", 75, "First draft");

      expect(mockRealtimeProgress.updatePhaseProgress).toHaveBeenCalledWith(
        "chapter:ch-1",
        "drafting",
        75,
        "First draft",
      );
    });
  });

  describe("completeMissionTracking", () => {
    it("should complete mission tracking", () => {
      adapter.completeMissionTracking("mission-1", "Done");

      expect(mockRealtimeProgress.complete).toHaveBeenCalledWith(
        "mission-1",
        "Done",
      );
    });
  });

  describe("failMissionTracking", () => {
    it("should mark mission tracking as failed", () => {
      adapter.failMissionTracking("mission-1", "Error occurred");

      expect(mockRealtimeProgress.fail).toHaveBeenCalledWith(
        "mission-1",
        "Error occurred",
      );
    });
  });

  describe("emitToProject", () => {
    it("should emit event to project room", () => {
      adapter.emitToProject("proj-1", "test:event", { data: "value" });

      expect(mockRealtimeEmitter.emitToRoom).toHaveBeenCalledWith(
        expect.objectContaining({
          roomId: "writing:project:proj-1",
          roomType: "project",
          entityId: "proj-1",
        }),
        expect.objectContaining({
          type: "test:event",
          payload: { data: "value" },
        }),
      );
    });
  });

  describe("emitToMission", () => {
    it("should emit event to mission room", () => {
      adapter.emitToMission("mission-1", "test:event", { status: "ok" });

      expect(mockRealtimeEmitter.emitToRoom).toHaveBeenCalledWith(
        expect.objectContaining({
          roomId: "writing:mission:mission-1",
          roomType: "mission",
          entityId: "mission-1",
        }),
        expect.objectContaining({
          type: "test:event",
        }),
      );
    });
  });

  describe("emitToBoth", () => {
    it("should emit event to both project and mission rooms", () => {
      adapter.emitToBoth("proj-1", "mission-1", "test:event", { key: "val" });

      expect(mockRealtimeEmitter.emitToRoom).toHaveBeenCalledTimes(2);
    });
  });

  describe("emitMissionStarted convenience method", () => {
    it("should start tracking and emit event", () => {
      adapter.emitMissionStarted("proj-1", "mission-1", "CHAPTER", 5000);

      expect(mockRealtimeProgress.create).toHaveBeenCalled();
      expect(mockRealtimeEmitter.emitToRoom).toHaveBeenCalled();
    });
  });

  describe("subscribeToProject", () => {
    it("should subscribe to all writing event types", () => {
      const callback = jest.fn();
      const unsubscribe = adapter.subscribeToProject("proj-1", callback);

      expect(mockRealtimeEmitter.subscribe).toHaveBeenCalled();
      expect(typeof unsubscribe).toBe("function");
    });

    it("should return an unsubscribe function that calls all unsub fns", () => {
      const unsubFn = jest.fn();
      mockRealtimeEmitter.subscribe.mockReturnValue(unsubFn);

      const callback = jest.fn();
      const unsubscribe = adapter.subscribeToProject("proj-1", callback);
      unsubscribe();

      expect(unsubFn).toHaveBeenCalled();
    });
  });

  describe("without aiFacade", () => {
    let adapterWithoutFacade: WritingRealtimeAdapter;

    beforeEach(async () => {
      const module: TestingModule = await Test.createTestingModule({
        providers: [WritingRealtimeAdapter],
      }).compile();

      adapterWithoutFacade = module.get<WritingRealtimeAdapter>(
        WritingRealtimeAdapter,
      );
    });

    it("should not throw when aiFacade is not provided", () => {
      expect(() =>
        adapterWithoutFacade.startMissionTracking("proj-1", "mission-1"),
      ).not.toThrow();
      expect(() =>
        adapterWithoutFacade.emitToProject("proj-1", "event", {}),
      ).not.toThrow();
    });
  });
});
