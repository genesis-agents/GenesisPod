// Mock ai-engine facade to prevent loading of cache-manager / ioredis
jest.mock("@/modules/ai-engine/facade", () => ({
  AgentFacade: class MockAgentFacade {},
}));
jest.mock("@/modules/ai-harness/facade", () => ({
  AgentFacade: class MockAgentFacade {},
}));

// Break circular dependency
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

import { Test, TestingModule } from "@nestjs/testing";
import { Logger } from "@nestjs/common";
import { AgentFacade } from "@/modules/ai-harness/facade";
import { WritingRealtimeAdapter } from "../writing-realtime.adapter";

describe("WritingRealtimeAdapter (supplemental)", () => {
  let adapter: WritingRealtimeAdapter;
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
  let mockAiFacade: jest.Mocked<AgentFacade>;

  beforeAll(async () => {
    mockRealtimeProgress = {
      create: jest.fn(),
      start: jest.fn(),
      startPhase: jest.fn(),
      completePhase: jest.fn(),
      updatePhaseProgress: jest.fn(),
      getProgress: jest.fn().mockReturnValue({ progress: 30 }),
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

    jest.spyOn(Logger.prototype, "log").mockImplementation();
    jest.spyOn(Logger.prototype, "debug").mockImplementation();
  });

  afterAll(() => {
    jest.restoreAllMocks();
  });

  beforeEach(() => {
    jest.clearAllMocks();
    // Reset getProgress default
    mockRealtimeProgress.getProgress.mockReturnValue({ progress: 30 });
    mockRealtimeEmitter.subscribe.mockReturnValue(() => {});
  });

  // ==================== completeChapterTracking ====================

  describe("completeChapterTracking", () => {
    it("should complete chapter tracking using chapter: prefix", () => {
      adapter.completeChapterTracking("ch-5", "Writing finished");

      expect(mockRealtimeProgress.complete).toHaveBeenCalledWith(
        "chapter:ch-5",
        "Writing finished",
      );
    });

    it("should work without a message", () => {
      adapter.completeChapterTracking("ch-6");

      expect(mockRealtimeProgress.complete).toHaveBeenCalledWith(
        "chapter:ch-6",
        undefined,
      );
    });
  });

  // ==================== updateChapterProgress ====================

  describe("updateChapterProgress", () => {
    it("should return overall progress from getProgress", () => {
      mockRealtimeProgress.getProgress.mockReturnValue({ progress: 75 });

      const result = adapter.updateChapterProgress("ch-1", "drafting", 80);

      expect(result).toBe(75);
    });

    it("should return 0 when getProgress returns null", () => {
      mockRealtimeProgress.getProgress.mockReturnValue(null);

      const result = adapter.updateChapterProgress("ch-1", "drafting", 50);

      expect(result).toBe(0);
    });

    it("should call updatePhaseProgress with chapter: prefix", () => {
      adapter.updateChapterProgress("ch-2", "consistency", 40, "Checking");

      expect(mockRealtimeProgress.updatePhaseProgress).toHaveBeenCalledWith(
        "chapter:ch-2",
        "consistency",
        40,
        "Checking",
      );
    });
  });

  // ==================== emitMissionProgress ====================

  describe("emitMissionProgress", () => {
    it("should update progress and emit to both rooms", () => {
      mockRealtimeProgress.getProgress.mockReturnValue({ progress: 45 });

      adapter.emitMissionProgress(
        "proj-1",
        "mission-1",
        "writing",
        60,
        "Writing chapter 5",
        ["writer", "keeper"],
      );

      expect(mockRealtimeProgress.updatePhaseProgress).toHaveBeenCalledWith(
        "mission-1",
        "writing",
        60,
        "Writing chapter 5",
      );
      expect(mockRealtimeEmitter.emitToRoom).toHaveBeenCalledTimes(2);
    });

    it("should include overall progress from updateMissionProgress in payload", () => {
      mockRealtimeProgress.getProgress.mockReturnValue({ progress: 55 });

      adapter.emitMissionProgress(
        "proj-1",
        "mission-1",
        "planning",
        80,
        "Planning done",
        [],
      );

      const calls = mockRealtimeEmitter.emitToRoom.mock.calls;
      // Both calls should contain the same event with progress=55
      const event = calls[0][1];
      expect(event.payload.progress).toBe(55);
    });

    it("should include activeAgents in payload", () => {
      adapter.emitMissionProgress(
        "proj-1",
        "mission-1",
        "writing",
        50,
        "Working",
        ["writer", "checker"],
      );

      const event = mockRealtimeEmitter.emitToRoom.mock.calls[0][1];
      expect(event.payload.activeAgents).toEqual(["writer", "checker"]);
    });
  });

  // ==================== emitMissionCompleted ====================

  describe("emitMissionCompleted", () => {
    it("should complete mission tracking and emit completed event", () => {
      adapter.emitMissionCompleted("proj-1", "mission-1", 50000, 20, 3);

      expect(mockRealtimeProgress.complete).toHaveBeenCalledWith(
        "mission-1",
        "写作完成",
      );
      expect(mockRealtimeEmitter.emitToRoom).toHaveBeenCalledTimes(2);
    });

    it("should include totalWords, totalChapters, totalVolumes in payload", () => {
      adapter.emitMissionCompleted("proj-1", "mission-1", 75000, 30, 4);

      const event = mockRealtimeEmitter.emitToRoom.mock.calls[0][1];
      expect(event.payload.totalWords).toBe(75000);
      expect(event.payload.totalChapters).toBe(30);
      expect(event.payload.totalVolumes).toBe(4);
    });
  });

  // ==================== emitMissionFailed ====================

  describe("emitMissionFailed", () => {
    it("should fail tracking and emit failed event to both rooms", () => {
      adapter.emitMissionFailed("proj-1", "mission-1", "Out of tokens");

      expect(mockRealtimeProgress.fail).toHaveBeenCalledWith(
        "mission-1",
        "Out of tokens",
      );
      expect(mockRealtimeEmitter.emitToRoom).toHaveBeenCalledTimes(2);
    });

    it("should include error message in payload", () => {
      adapter.emitMissionFailed("proj-1", "mission-1", "Network timeout");

      const event = mockRealtimeEmitter.emitToRoom.mock.calls[0][1];
      expect(event.payload.error).toBe("Network timeout");
    });
  });

  // ==================== emitChapterStarted ====================

  describe("emitChapterStarted", () => {
    it("should start chapter tracking and emit chapter started event", () => {
      adapter.emitChapterStarted(
        "proj-1",
        "mission-1",
        "ch-1",
        1,
        "The Beginning",
        0,
      );

      expect(mockRealtimeProgress.create).toHaveBeenCalledWith(
        expect.objectContaining({
          id: "chapter:ch-1",
          type: "chapter_writing",
        }),
      );
      expect(mockRealtimeProgress.startPhase).toHaveBeenCalledWith(
        "chapter:ch-1",
        "context",
        "提取上下文",
      );
      expect(mockRealtimeEmitter.emitToRoom).toHaveBeenCalledTimes(2);
    });

    it("should include chapterNumber and title in payload", () => {
      adapter.emitChapterStarted(
        "proj-1",
        "mission-1",
        "ch-2",
        5,
        "Dark Storm",
        1,
      );

      const event = mockRealtimeEmitter.emitToRoom.mock.calls[0][1];
      expect(event.payload.chapterNumber).toBe(5);
      expect(event.payload.title).toBe("Dark Storm");
      expect(event.payload.volumeIndex).toBe(1);
    });
  });

  // ==================== emitChapterContent ====================

  describe("emitChapterContent", () => {
    it("should complete drafting phase and emit chapter content", () => {
      adapter.emitChapterContent(
        "proj-1",
        "mission-1",
        "ch-1",
        1,
        "Chapter One",
        "The quick brown fox...",
        2000,
        0,
      );

      expect(mockRealtimeProgress.completePhase).toHaveBeenCalledWith(
        "chapter:ch-1",
        "drafting",
        "初稿完成",
      );
      expect(mockRealtimeEmitter.emitToRoom).toHaveBeenCalledTimes(2);
    });

    it("should include content and wordCount in payload", () => {
      adapter.emitChapterContent(
        "proj-1",
        "mission-1",
        "ch-1",
        1,
        "Chapter 1",
        "Content here",
        1500,
        0,
      );

      const event = mockRealtimeEmitter.emitToRoom.mock.calls[0][1];
      expect(event.payload.content).toBe("Content here");
      expect(event.payload.wordCount).toBe(1500);
    });
  });

  // ==================== emitChapterCompleted ====================

  describe("emitChapterCompleted", () => {
    it("should complete chapter tracking and emit completed event", () => {
      adapter.emitChapterCompleted("proj-1", "mission-1", "ch-1", 1, 3000);

      expect(mockRealtimeProgress.complete).toHaveBeenCalledWith(
        "chapter:ch-1",
        "章节完成",
      );
      expect(mockRealtimeEmitter.emitToRoom).toHaveBeenCalledTimes(2);
    });

    it("should include wordCount in payload", () => {
      adapter.emitChapterCompleted("proj-1", "mission-1", "ch-3", 3, 4500);

      const event = mockRealtimeEmitter.emitToRoom.mock.calls[0][1];
      expect(event.payload.wordCount).toBe(4500);
      expect(event.payload.chapterNumber).toBe(3);
    });
  });

  // ==================== emitAgentWorking ====================

  describe("emitAgentWorking", () => {
    it("should emit agent working event to both rooms", () => {
      adapter.emitAgentWorking("proj-1", "mission-1", {
        agentId: "agent-1",
        agentName: "Writer Agent",
        agentRole: "writer",
        status: "working",
        taskDescription: "Writing chapter 3",
        progress: 50,
      });

      expect(mockRealtimeEmitter.emitToRoom).toHaveBeenCalledTimes(2);
    });

    it("should include agent data in payload", () => {
      const agentData = {
        agentId: "agent-1",
        agentName: "Editor Agent",
        agentRole: "editor" as const,
        status: "completed" as const,
      };

      adapter.emitAgentWorking("proj-1", "mission-1", agentData);

      const event = mockRealtimeEmitter.emitToRoom.mock.calls[0][1];
      expect(event.payload.agentId).toBe("agent-1");
      expect(event.payload.agentRole).toBe("editor");
      expect(event.payload.status).toBe("completed");
    });
  });

  // ==================== emitConsistencyCheck ====================

  describe("emitConsistencyCheck", () => {
    it("should emit CONSISTENCY_CHECK_STARTED when passed=true", () => {
      adapter.emitConsistencyCheck("proj-1", "mission-1", "ch-1", 1, true, []);

      const event = mockRealtimeEmitter.emitToRoom.mock.calls[0][1];
      expect(event.type).toBe("consistency:check_started");
    });

    it("should emit CONSISTENCY_ISSUES_FOUND when passed=false", () => {
      adapter.emitConsistencyCheck("proj-1", "mission-1", "ch-1", 1, false, [
        {
          type: "character",
          severity: "error",
          description: "Character inconsistency",
        },
      ]);

      const event = mockRealtimeEmitter.emitToRoom.mock.calls[0][1];
      expect(event.type).toBe("consistency:issues_found");
    });

    it("should complete the consistency phase", () => {
      adapter.emitConsistencyCheck("proj-1", "mission-1", "ch-2", 2, true, []);

      expect(mockRealtimeProgress.completePhase).toHaveBeenCalledWith(
        "chapter:ch-2",
        "consistency",
        "一致性检查完成",
      );
    });

    it("should include issues in payload when not passed", () => {
      const issues = [
        {
          type: "timeline",
          severity: "warning" as const,
          description: "Timeline conflict",
          suggestion: "Review chapter 3",
        },
      ];

      adapter.emitConsistencyCheck(
        "proj-1",
        "mission-1",
        "ch-1",
        1,
        false,
        issues,
      );

      const event = mockRealtimeEmitter.emitToRoom.mock.calls[0][1];
      expect(event.payload.issues).toEqual(issues);
    });
  });

  // ==================== emitLeaderResponse ====================

  describe("emitLeaderResponse", () => {
    it("should emit leader response to both rooms", () => {
      adapter.emitLeaderResponse(
        "proj-1",
        "mission-1",
        "Proceeding to chapter 5",
      );

      expect(mockRealtimeEmitter.emitToRoom).toHaveBeenCalledTimes(2);
    });

    it("should include the response text in payload", () => {
      adapter.emitLeaderResponse("proj-1", "mission-1", "Plan approved");

      const event = mockRealtimeEmitter.emitToRoom.mock.calls[0][1];
      expect(event.payload.response).toBe("Plan approved");
    });
  });

  // ==================== emitKeeperContextReady ====================

  describe("emitKeeperContextReady", () => {
    const context = {
      relevantCharacters: ["Alice", "Bob"],
      relevantLocations: ["Forest", "Castle"],
      previousEvents: ["Battle happened"],
      warnings: ["Character Alice was injured"],
    };

    it("should complete context phase and emit keeper context ready event", () => {
      adapter.emitKeeperContextReady("proj-1", "mission-1", "ch-1", 1, context);

      expect(mockRealtimeProgress.completePhase).toHaveBeenCalledWith(
        "chapter:ch-1",
        "context",
        "上下文准备就绪",
      );
      expect(mockRealtimeEmitter.emitToRoom).toHaveBeenCalledTimes(2);
    });

    it("should include context data in payload", () => {
      adapter.emitKeeperContextReady("proj-1", "mission-1", "ch-1", 1, context);

      const event = mockRealtimeEmitter.emitToRoom.mock.calls[0][1];
      expect(event.payload.context.relevantCharacters).toEqual([
        "Alice",
        "Bob",
      ]);
      expect(event.payload.context.warnings).toEqual([
        "Character Alice was injured",
      ]);
    });
  });

  // ==================== subscribeToMission ====================

  describe("subscribeToMission", () => {
    it("should subscribe to all writing event types for mission", () => {
      const callback = jest.fn();
      const unsubscribe = adapter.subscribeToMission("mission-1", callback);

      expect(mockRealtimeEmitter.subscribe).toHaveBeenCalled();
      expect(typeof unsubscribe).toBe("function");
    });

    it("should filter events by correlationId matching missionId", () => {
      const callback = jest.fn();
      let capturedSubscriber: ((event: unknown) => void) | null = null;

      mockRealtimeEmitter.subscribe.mockImplementation(
        (_type: string, handler: (event: unknown) => void) => {
          capturedSubscriber = handler;
          return () => {};
        },
      );

      adapter.subscribeToMission("mission-1", callback);

      // Simulate event with matching correlationId
      if (capturedSubscriber) {
        (capturedSubscriber as (event: unknown) => void)({
          type: "mission:started",
          payload: { data: "value" },
          metadata: { correlationId: "mission-1" },
        });
      }

      expect(callback).toHaveBeenCalledWith("mission:started", {
        data: "value",
      });
    });

    it("should not call callback when correlationId does not match", () => {
      const callback = jest.fn();
      let capturedSubscriber: ((event: unknown) => void) | null = null;

      mockRealtimeEmitter.subscribe.mockImplementation(
        (_type: string, handler: (event: unknown) => void) => {
          capturedSubscriber = handler;
          return () => {};
        },
      );

      adapter.subscribeToMission("mission-1", callback);

      // Simulate event with different correlationId
      if (capturedSubscriber) {
        (capturedSubscriber as (event: unknown) => void)({
          type: "mission:started",
          payload: { data: "value" },
          metadata: { correlationId: "other-mission" },
        });
      }

      expect(callback).not.toHaveBeenCalled();
    });

    it("should return unsubscribe function that calls all unsubscribers", () => {
      const unsubFn = jest.fn();
      mockRealtimeEmitter.subscribe.mockReturnValue(unsubFn);

      const unsubscribe = adapter.subscribeToMission("mission-1", jest.fn());
      unsubscribe();

      expect(unsubFn).toHaveBeenCalled();
    });
  });

  // ==================== subscribeToProject - filter logic ====================

  describe("subscribeToProject - filter by sessionId", () => {
    it("should call callback when sessionId matches projectId", () => {
      const callback = jest.fn();
      let capturedSubscriber: ((event: unknown) => void) | null = null;

      mockRealtimeEmitter.subscribe.mockImplementation(
        (_type: string, handler: (event: unknown) => void) => {
          capturedSubscriber = handler;
          return () => {};
        },
      );

      adapter.subscribeToProject("proj-1", callback);

      if (capturedSubscriber) {
        (capturedSubscriber as (event: unknown) => void)({
          type: "mission:started",
          payload: { data: "value" },
          metadata: { sessionId: "proj-1" },
        });
      }

      expect(callback).toHaveBeenCalledWith("mission:started", {
        data: "value",
      });
    });

    it("should not call callback when sessionId does not match", () => {
      const callback = jest.fn();
      let capturedSubscriber: ((event: unknown) => void) | null = null;

      mockRealtimeEmitter.subscribe.mockImplementation(
        (_type: string, handler: (event: unknown) => void) => {
          capturedSubscriber = handler;
          return () => {};
        },
      );

      adapter.subscribeToProject("proj-1", callback);

      if (capturedSubscriber) {
        (capturedSubscriber as (event: unknown) => void)({
          type: "mission:started",
          payload: { data: "value" },
          metadata: { sessionId: "other-proj" },
        });
      }

      expect(callback).not.toHaveBeenCalled();
    });
  });

  // ==================== createEvent metadata ====================

  describe("event metadata structure", () => {
    it("should include source=writing in event metadata", () => {
      adapter.emitToProject("proj-1", "test:event", {});

      const event = mockRealtimeEmitter.emitToRoom.mock.calls[0][1];
      expect(event.metadata?.source).toBe("writing");
    });

    it("should include timestamp in event metadata", () => {
      adapter.emitToProject("proj-1", "test:event", {});

      const event = mockRealtimeEmitter.emitToRoom.mock.calls[0][1];
      expect(event.metadata?.timestamp).toBeInstanceOf(Date);
    });

    it("should include sessionId=projectId in emitToProject", () => {
      adapter.emitToProject("proj-1", "test:event", {});

      const event = mockRealtimeEmitter.emitToRoom.mock.calls[0][1];
      expect(event.metadata?.sessionId).toBe("proj-1");
    });

    it("should include correlationId=missionId in emitToMission", () => {
      adapter.emitToMission("mission-1", "test:event", {});

      const event = mockRealtimeEmitter.emitToRoom.mock.calls[0][1];
      expect(event.metadata?.correlationId).toBe("mission-1");
    });
  });
});
