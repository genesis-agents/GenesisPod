/**
 * MissionController Unit Tests
 *
 * Covers: Leader API (plan, getMissionPlan, approveMissionPlan, leaderMessage,
 * leaderChat, getLeaderDecisions), Mission API (getMission, retryMission,
 * getTeam, getTeamMessages, getAgentActivities, getAgentActivitiesByDimension,
 * getAgentActivityStats, adjustMission, cancelMission), Mission Detail Routes,
 * Health Check & Recovery routes.
 */

import { Test, TestingModule } from "@nestjs/testing";
import { NotFoundException, UnauthorizedException } from "@nestjs/common";
import { MissionController } from "../mission.controller";
import { PrismaService } from "@/common/prisma/prisma.service";
import { TopicInsightsService } from "@/modules/ai-app/topic-insights/topic-insights.service";
import {
  MissionLifecycleService,
  MissionQueryService,
  MissionExecutionService,
  ResearchEventEmitterService,
  ResearchTodoService,
  ResearchMissionHealthService,
  ResearchCheckpointService,
} from "@/modules/ai-app/topic-insights/services";
import { JwtAuthGuard } from "@/common/guards/jwt-auth.guard";
import { AdminGuard } from "@/common/guards/admin.guard";
import { TopicAccessGuard } from "@/modules/ai-app/topic-insights/api/guards";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

interface MockRequest {
  user: { id: string; role?: string };
}

function makeReq(userId = "user-1"): MockRequest {
  return { user: { id: userId } };
}

function makeAnonReq(): Partial<MockRequest> {
  return { user: undefined } as never;
}

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockTopicResearchService = {
  getAgentActivities: jest.fn(),
  getAgentActivityStats: jest.fn(),
};

const mockLifecycleService = {
  createMission: jest.fn(),
  approvePlanAndExecute: jest.fn(),
  retryTask: jest.fn(),
  retryMission: jest.fn(),
  adjustMission: jest.fn(),
  cancelMission: jest.fn(),
};

const mockQueryService = {
  getMissionByTopicId: jest.fn(),
  getMissionStatus: jest.fn(),
  getTeamInfo: jest.fn(),
  getTaskActivities: jest.fn(),
};

const mockExecutionService = {
  addAgentToLeaderPlan: jest.fn(),
  startExecution: jest.fn(),
  resumeExecution: jest.fn().mockResolvedValue(undefined),
  resumeExecutionForNewTask: jest.fn().mockResolvedValue(undefined),
  resumeWithHarness: jest.fn().mockResolvedValue(undefined),
};

const mockLeaderService = {
  handleUserMessage: jest.fn(),
  decodeUserInput: jest.fn(),
  selectAgentForTask: jest.fn(),
  getDecisionHistory: jest.fn(),
};

const mockEventEmitterService = {
  saveUserMessage: jest.fn(),
  emitLeaderResponse: jest.fn(),
  getTeamMessages: jest.fn(),
  getAgentActivities: jest.fn(),
};

const mockTodoService = {
  createTodo: jest.fn(),
  scheduleTodo: jest.fn(),
};

const mockHealthService = {
  getMissionHealthStatus: jest.fn(),
  forceHealthCheck: jest.fn(),
};

const mockCheckpointService = {
  canResume: jest.fn(),
  resumeMission: jest.fn(),
  getResumableMissions: jest.fn(),
};

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

describe("MissionController", () => {
  let controller: MissionController;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [MissionController],
      providers: [
        { provide: TopicInsightsService, useValue: mockTopicResearchService },
        { provide: MissionLifecycleService, useValue: mockLifecycleService },
        { provide: MissionQueryService, useValue: mockQueryService },
        { provide: MissionExecutionService, useValue: mockExecutionService },
        {
          provide: PrismaService,
          useValue: { leaderDecision: { findMany: jest.fn().mockResolvedValue([]) } },
        },
        {
          provide: ResearchEventEmitterService,
          useValue: mockEventEmitterService,
        },
        { provide: ResearchTodoService, useValue: mockTodoService },
        { provide: ResearchMissionHealthService, useValue: mockHealthService },
        { provide: ResearchCheckpointService, useValue: mockCheckpointService },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(TopicAccessGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(AdminGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get(MissionController);
  });

  // ==================== Leader API ====================

  describe("leaderPlan", () => {
    it("creates a mission with provided dto", async () => {
      const dto = {
        userPrompt: "Research AI trends",
        userContext: "2024 focus",
        mode: "fresh" as never,
        researchDepth: 3,
      };
      const mission = { id: "mission-1", status: "PLAN_READY" };
      mockLifecycleService.createMission.mockResolvedValue(mission);

      const result = await controller.leaderPlan("topic-1", dto);

      expect(mockLifecycleService.createMission).toHaveBeenCalledWith({
        topicId: "topic-1",
        userPrompt: "Research AI trends",
        userContext: "2024 focus",
        mode: "fresh",
        researchDepth: 3,
      });
      expect(result).toBe(mission);
    });

    it("defaults mode to 'fresh' when not provided", async () => {
      const dto = { userPrompt: "Research AI" } as never;
      mockLifecycleService.createMission.mockResolvedValue({ id: "m-1" });

      await controller.leaderPlan("topic-1", dto);

      expect(mockLifecycleService.createMission).toHaveBeenCalledWith(
        expect.objectContaining({ mode: "fresh" }),
      );
    });
  });

  describe("getMissionPlan", () => {
    it("returns mission plan when mission exists", async () => {
      const mission = {
        id: "m-1",
        status: "PLAN_READY",
        leaderPlan: { dimensions: [] },
      };
      mockQueryService.getMissionByTopicId.mockResolvedValue(mission);

      const result = await controller.getMissionPlan("topic-1");

      expect(mockQueryService.getMissionByTopicId).toHaveBeenCalledWith(
        "topic-1",
      );
      expect(result).toEqual({
        missionId: "m-1",
        status: "PLAN_READY",
        leaderPlan: { dimensions: [] },
      });
    });

    it("throws NotFoundException when no mission exists", async () => {
      mockQueryService.getMissionByTopicId.mockResolvedValue(null);

      await expect(controller.getMissionPlan("topic-1")).rejects.toThrow(
        NotFoundException,
      );
      await expect(controller.getMissionPlan("topic-1")).rejects.toThrow(
        "No active mission for this topic",
      );
    });
  });

  describe("approveMissionPlan", () => {
    it("approves PLAN_READY mission and starts execution", async () => {
      const mission = { id: "m-1", status: "PLAN_READY" };
      mockQueryService.getMissionByTopicId.mockResolvedValue(mission);
      mockLifecycleService.approvePlanAndExecute.mockResolvedValue(undefined);

      const result = await controller.approveMissionPlan("topic-1");

      expect(mockLifecycleService.approvePlanAndExecute).toHaveBeenCalledWith(
        "m-1",
        "topic-1",
      );
      expect(result).toEqual({
        success: true,
        message: "Plan approved, execution started",
      });
    });

    it("throws NotFoundException when no mission exists", async () => {
      mockQueryService.getMissionByTopicId.mockResolvedValue(null);

      await expect(controller.approveMissionPlan("topic-1")).rejects.toThrow(
        NotFoundException,
      );
    });

    it("throws NotFoundException when mission is not in PLAN_READY status", async () => {
      const mission = { id: "m-1", status: "EXECUTING" };
      mockQueryService.getMissionByTopicId.mockResolvedValue(mission);

      await expect(controller.approveMissionPlan("topic-1")).rejects.toThrow(
        NotFoundException,
      );
      await expect(controller.approveMissionPlan("topic-1")).rejects.toThrow(
        "Mission is in EXECUTING status, expected PLAN_READY",
      );
    });
  });

  describe("leaderMessage", () => {
    it("saves user message and returns ack (H6: read-only leader chat)", async () => {
      const dto = { content: "Focus on quantum computing" };
      const mission = { id: "m-1" };
      mockQueryService.getMissionByTopicId.mockResolvedValue(mission);

      const result = await controller.leaderMessage(makeReq(), "topic-1", dto);

      expect(mockEventEmitterService.saveUserMessage).toHaveBeenCalledWith(
        "topic-1",
        "m-1",
        "Focus on quantum computing",
      );
      expect(result).toMatchObject({
        missionId: "m-1",
        message: "Focus on quantum computing",
        acknowledged: true,
      });
    });

    it("throws UnauthorizedException when user is not authenticated", async () => {
      await expect(
        controller.leaderMessage(makeAnonReq() as never, "topic-1", {
          content: "hello",
        }),
      ).rejects.toThrow(UnauthorizedException);
    });

    it("throws NotFoundException when no active mission exists", async () => {
      mockQueryService.getMissionByTopicId.mockResolvedValue(null);

      await expect(
        controller.leaderMessage(makeReq(), "topic-1", { content: "hello" }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe("leaderChat", () => {
    it("returns ACK decision and saves user message (H6: no side effects)", async () => {
      const dto = { message: "What is AI?" };
      const mission = { id: "m-1" };
      mockQueryService.getMissionByTopicId.mockResolvedValue(mission);
      mockEventEmitterService.saveUserMessage.mockResolvedValue(undefined);

      const result = await controller.leaderChat(makeReq(), "topic-1", dto);

      expect(mockEventEmitterService.saveUserMessage).toHaveBeenCalledWith(
        "topic-1",
        "m-1",
        "What is AI?",
      );
      expect(result).toMatchObject({
        decisionType: "ACK",
        todo: null,
      });
    });

    it("throws UnauthorizedException when user is not authenticated", async () => {
      await expect(
        controller.leaderChat(makeAnonReq() as never, "topic-1", {
          message: "test",
        }),
      ).rejects.toThrow(UnauthorizedException);
    });

    it("uses provided missionId when given in dto", async () => {
      const dto = { message: "Continue", missionId: "explicit-mission-1" };
      mockEventEmitterService.saveUserMessage.mockResolvedValue(undefined);

      const result = await controller.leaderChat(makeReq(), "topic-1", dto);

      // Should not call getMissionByTopicId since missionId is provided
      expect(mockQueryService.getMissionByTopicId).not.toHaveBeenCalled();
      expect(mockEventEmitterService.saveUserMessage).toHaveBeenCalledWith(
        "topic-1",
        "explicit-mission-1",
        "Continue",
      );
      expect(result.decisionType).toBe("ACK");
    });

    it("does not save messages when no mission exists", async () => {
      const dto = { message: "hello" };
      mockQueryService.getMissionByTopicId.mockResolvedValue(null);

      const result = await controller.leaderChat(makeReq(), "topic-1", dto);

      expect(mockEventEmitterService.saveUserMessage).not.toHaveBeenCalled();
      expect(result.decisionType).toBe("ACK");
    });
  });

  describe("getLeaderDecisions", () => {
    it("returns decision history from prisma.leaderDecision (H6: no legacy service)", async () => {
      const mission = { id: "m-1" };
      mockQueryService.getMissionByTopicId.mockResolvedValue(mission);

      const result = await controller.getLeaderDecisions(makeReq(), "topic-1");

      // prisma mock resolves to [] — assert no throw + empty array shape
      expect(Array.isArray(result)).toBe(true);
    });

    it("returns empty array when no mission exists", async () => {
      mockQueryService.getMissionByTopicId.mockResolvedValue(null);

      const result = await controller.getLeaderDecisions(makeReq(), "topic-1");

      expect(result).toEqual([]);
    });

    it("throws UnauthorizedException when user not authenticated", async () => {
      await expect(
        controller.getLeaderDecisions(makeAnonReq() as never, "topic-1"),
      ).rejects.toThrow(UnauthorizedException);
    });
  });

  // ==================== Mission API ====================

  describe("getMission", () => {
    it("returns mission for authenticated user", async () => {
      const mission = { id: "m-1", status: "EXECUTING" };
      mockQueryService.getMissionByTopicId.mockResolvedValue(mission);

      const result = await controller.getMission(makeReq(), "topic-1");

      expect(mockQueryService.getMissionByTopicId).toHaveBeenCalledWith(
        "topic-1",
      );
      expect(result).toBe(mission);
    });

    it("throws UnauthorizedException when user not authenticated", async () => {
      await expect(
        controller.getMission(makeAnonReq() as never, "topic-1"),
      ).rejects.toThrow(UnauthorizedException);
    });
  });

  describe("retryMission", () => {
    it("retries specific tasks when taskIds are provided", async () => {
      const mission = { id: "m-1" };
      const dto = { taskIds: ["task-1", "task-2"] };
      mockQueryService.getMissionByTopicId.mockResolvedValue(mission);
      mockLifecycleService.retryTask.mockResolvedValue({ retried: true });

      const result = await controller.retryMission("topic-1", dto);

      expect(mockLifecycleService.retryTask).toHaveBeenCalledTimes(2);
      expect(mockLifecycleService.retryTask).toHaveBeenCalledWith("task-1");
      expect(mockLifecycleService.retryTask).toHaveBeenCalledWith("task-2");
      expect(result).toEqual({ retriedTasks: 2 });
    });

    it("retries entire mission when no taskIds provided", async () => {
      const mission = { id: "m-1" };
      const dto = {};
      mockQueryService.getMissionByTopicId.mockResolvedValue(mission);
      mockLifecycleService.retryMission.mockResolvedValue({
        status: "EXECUTING",
      });

      const result = await controller.retryMission("topic-1", dto as never);

      expect(mockLifecycleService.retryMission).toHaveBeenCalledWith("m-1");
      expect(result).toEqual({ status: "EXECUTING" });
    });

    it("throws NotFoundException when no mission found", async () => {
      mockQueryService.getMissionByTopicId.mockResolvedValue(null);

      await expect(
        controller.retryMission("topic-1", {} as never),
      ).rejects.toThrow(NotFoundException);
      await expect(
        controller.retryMission("topic-1", {} as never),
      ).rejects.toThrow("No mission found for this topic");
    });
  });

  describe("getTeam", () => {
    it("returns team info when mission exists", async () => {
      const mission = { id: "m-1" };
      const teamInfo = {
        leaderId: "agent-1",
        leaderModel: "gpt-4",
        agents: [],
      };
      mockQueryService.getMissionByTopicId.mockResolvedValue(mission);
      mockQueryService.getTeamInfo.mockResolvedValue(teamInfo);

      const result = await controller.getTeam(makeReq(), "topic-1");

      expect(mockQueryService.getTeamInfo).toHaveBeenCalledWith("m-1");
      expect(result).toBe(teamInfo);
    });

    it("returns empty team structure when no mission", async () => {
      mockQueryService.getMissionByTopicId.mockResolvedValue(null);

      const result = await controller.getTeam(makeReq(), "topic-1");

      expect(result).toEqual({ leaderId: null, leaderModel: null, agents: [] });
    });

    it("throws UnauthorizedException when user not authenticated", async () => {
      await expect(
        controller.getTeam(makeAnonReq() as never, "topic-1"),
      ).rejects.toThrow(UnauthorizedException);
    });
  });

  describe("getTeamMessages", () => {
    it("returns team messages with filters", async () => {
      const messages = [{ id: "tm-1" }];
      mockEventEmitterService.getTeamMessages.mockResolvedValue(messages);

      const result = await controller.getTeamMessages(
        makeReq(),
        "topic-1",
        "20",
        "m-1",
      );

      expect(mockEventEmitterService.getTeamMessages).toHaveBeenCalledWith(
        "topic-1",
        {
          limit: 20,
          missionId: "m-1",
        },
      );
      expect(result).toBe(messages);
    });

    it("passes undefined limit when not provided", async () => {
      mockEventEmitterService.getTeamMessages.mockResolvedValue([]);

      await controller.getTeamMessages(
        makeReq(),
        "topic-1",
        undefined,
        undefined,
      );

      expect(mockEventEmitterService.getTeamMessages).toHaveBeenCalledWith(
        "topic-1",
        {
          limit: undefined,
          missionId: undefined,
        },
      );
    });

    it("throws UnauthorizedException when user not authenticated", async () => {
      await expect(
        controller.getTeamMessages(makeAnonReq() as never, "topic-1"),
      ).rejects.toThrow(UnauthorizedException);
    });
  });

  describe("getAgentActivities", () => {
    it("returns agent activities with all filters", async () => {
      const activities = [{ id: "act-1" }];
      mockEventEmitterService.getAgentActivities.mockResolvedValue(activities);

      const result = await controller.getAgentActivities(
        makeReq(),
        "topic-1",
        "10",
        "m-1",
        "RESEARCHER",
      );

      expect(mockEventEmitterService.getAgentActivities).toHaveBeenCalledWith(
        "topic-1",
        {
          limit: 10,
          missionId: "m-1",
          agentRole: "RESEARCHER",
        },
      );
      expect(result).toBe(activities);
    });

    it("throws UnauthorizedException when user not authenticated", async () => {
      await expect(
        controller.getAgentActivities(makeAnonReq() as never, "topic-1"),
      ).rejects.toThrow(UnauthorizedException);
    });
  });

  describe("getAgentActivitiesByDimension", () => {
    it("returns activities grouped by dimension", async () => {
      const grouped = [{ dimension: "Technology", activities: [] }];
      mockTopicResearchService.getAgentActivities.mockResolvedValue(grouped);

      const result = await controller.getAgentActivitiesByDimension(
        makeReq(),
        "topic-1",
        "m-1",
      );

      expect(mockTopicResearchService.getAgentActivities).toHaveBeenCalledWith(
        "user-1",
        "topic-1",
        "m-1",
      );
      expect(result).toBe(grouped);
    });

    it("throws UnauthorizedException when user not authenticated", async () => {
      await expect(
        controller.getAgentActivitiesByDimension(
          makeAnonReq() as never,
          "topic-1",
        ),
      ).rejects.toThrow(UnauthorizedException);
    });
  });

  describe("getAgentActivityStats", () => {
    it("returns activity statistics", async () => {
      const stats = { totalTasks: 10, completed: 8, failed: 2 };
      mockTopicResearchService.getAgentActivityStats.mockResolvedValue(stats);

      const result = await controller.getAgentActivityStats(
        makeReq(),
        "topic-1",
        "m-1",
      );

      expect(
        mockTopicResearchService.getAgentActivityStats,
      ).toHaveBeenCalledWith("user-1", "topic-1", "m-1");
      expect(result).toBe(stats);
    });

    it("throws UnauthorizedException when user not authenticated", async () => {
      await expect(
        controller.getAgentActivityStats(makeAnonReq() as never, "topic-1"),
      ).rejects.toThrow(UnauthorizedException);
    });
  });

  describe("adjustMission", () => {
    it("adjusts an active mission", async () => {
      const dto = { addDimensions: ["Technology"], removeDimensions: [] };
      const mission = { id: "m-1" };
      const adjusted = { id: "m-1", dimensions: ["Technology"] };
      mockQueryService.getMissionByTopicId.mockResolvedValue(mission);
      mockLifecycleService.adjustMission.mockResolvedValue(adjusted);

      const result = await controller.adjustMission(
        makeReq(),
        "topic-1",
        dto as never,
      );

      expect(mockLifecycleService.adjustMission).toHaveBeenCalledWith(
        "user-1",
        "m-1",
        dto,
      );
      expect(result).toBe(adjusted);
    });

    it("throws NotFoundException when no active mission", async () => {
      mockQueryService.getMissionByTopicId.mockResolvedValue(null);

      await expect(
        controller.adjustMission(makeReq(), "topic-1", {} as never),
      ).rejects.toThrow(NotFoundException);
    });

    it("throws UnauthorizedException when user not authenticated", async () => {
      await expect(
        controller.adjustMission(
          makeAnonReq() as never,
          "topic-1",
          {} as never,
        ),
      ).rejects.toThrow(UnauthorizedException);
    });
  });

  describe("cancelMission", () => {
    it("cancels an active mission", async () => {
      const mission = { id: "m-1" };
      mockQueryService.getMissionByTopicId.mockResolvedValue(mission);
      mockLifecycleService.cancelMission.mockResolvedValue({
        status: "CANCELLED",
      });

      const result = await controller.cancelMission(makeReq(), "topic-1");

      expect(mockLifecycleService.cancelMission).toHaveBeenCalledWith(
        "user-1",
        "m-1",
      );
      expect(result).toEqual({ status: "CANCELLED" });
    });

    it("throws NotFoundException when no active mission", async () => {
      mockQueryService.getMissionByTopicId.mockResolvedValue(null);

      await expect(
        controller.cancelMission(makeReq(), "topic-1"),
      ).rejects.toThrow(NotFoundException);
    });

    it("throws UnauthorizedException when user not authenticated", async () => {
      await expect(
        controller.cancelMission(makeAnonReq() as never, "topic-1"),
      ).rejects.toThrow(UnauthorizedException);
    });
  });

  // ==================== Mission Detail Routes ====================

  describe("getMissionDetail", () => {
    it("returns mission status by missionId", async () => {
      const missionStatus = { id: "m-1", status: "COMPLETED", progress: 100 };
      mockQueryService.getMissionStatus.mockResolvedValue(missionStatus);

      const result = await controller.getMissionDetail("topic-1", "m-1");

      expect(mockQueryService.getMissionStatus).toHaveBeenCalledWith("m-1");
      expect(result).toBe(missionStatus);
    });
  });

  describe("getMissionMessages", () => {
    it("returns messages for a specific mission", async () => {
      const messages = [{ id: "tm-1" }];
      mockEventEmitterService.getTeamMessages.mockResolvedValue(messages);

      const result = await controller.getMissionMessages("topic-1", "m-1");

      expect(mockEventEmitterService.getTeamMessages).toHaveBeenCalledWith(
        "topic-1",
        {
          missionId: "m-1",
        },
      );
      expect(result).toBe(messages);
    });
  });

  describe("getMissionActivities", () => {
    it("returns agent activities for a specific mission", async () => {
      const activities = [{ id: "act-1" }];
      mockEventEmitterService.getAgentActivities.mockResolvedValue(activities);

      const result = await controller.getMissionActivities("topic-1", "m-1");

      expect(mockEventEmitterService.getAgentActivities).toHaveBeenCalledWith(
        "topic-1",
        {
          missionId: "m-1",
        },
      );
      expect(result).toBe(activities);
    });
  });

  // ==================== Health Check & Recovery ====================

  describe("getMissionHealth", () => {
    it("returns health status for a mission", async () => {
      const health = { isStuck: false, executionTimeMs: 5000 };
      mockHealthService.getMissionHealthStatus.mockResolvedValue(health);

      const result = await controller.getMissionHealth(
        makeReq(),
        "topic-1",
        "m-1",
      );

      expect(mockHealthService.getMissionHealthStatus).toHaveBeenCalledWith(
        "m-1",
      );
      expect(result).toBe(health);
    });

    it("throws UnauthorizedException when user not authenticated", async () => {
      await expect(
        controller.getMissionHealth(makeAnonReq() as never, "topic-1", "m-1"),
      ).rejects.toThrow(UnauthorizedException);
    });
  });

  describe("getTopicMissionHealth", () => {
    it("returns health status for the active mission of a topic", async () => {
      const mission = { id: "m-1" };
      const health = { isStuck: false };
      mockQueryService.getMissionByTopicId.mockResolvedValue(mission);
      mockHealthService.getMissionHealthStatus.mockResolvedValue(health);

      const result = await controller.getTopicMissionHealth(
        makeReq(),
        "topic-1",
      );

      expect(mockHealthService.getMissionHealthStatus).toHaveBeenCalledWith(
        "m-1",
      );
      expect(result).toBe(health);
    });

    it("returns null health message when no active mission", async () => {
      mockQueryService.getMissionByTopicId.mockResolvedValue(null);

      const result = await controller.getTopicMissionHealth(
        makeReq(),
        "topic-1",
      );

      expect(result).toEqual({
        health: null,
        message: "没有正在进行的研究任务",
      });
    });

    it("throws UnauthorizedException when user not authenticated", async () => {
      await expect(
        controller.getTopicMissionHealth(makeAnonReq() as never, "topic-1"),
      ).rejects.toThrow(UnauthorizedException);
    });
  });

  describe("canResumeMission", () => {
    it("checks if a mission can be resumed", async () => {
      const canResume = {
        canResume: true,
        reason: "All tasks have checkpoints",
      };
      mockCheckpointService.canResume.mockResolvedValue(canResume);

      const result = await controller.canResumeMission(
        makeReq(),
        "topic-1",
        "m-1",
      );

      expect(mockCheckpointService.canResume).toHaveBeenCalledWith("m-1");
      expect(result).toBe(canResume);
    });

    it("throws UnauthorizedException when user not authenticated", async () => {
      await expect(
        controller.canResumeMission(makeAnonReq() as never, "topic-1", "m-1"),
      ).rejects.toThrow(UnauthorizedException);
    });
  });

  describe("resumeMission", () => {
    it("resumes a failed mission from checkpoint", async () => {
      const resumeResult = { resumed: true, tasksRestored: 3 };
      mockCheckpointService.resumeMission.mockResolvedValue(resumeResult);

      const result = await controller.resumeMission("topic-1", "m-1");

      expect(mockCheckpointService.resumeMission).toHaveBeenCalledWith("m-1");
      expect(result).toBe(resumeResult);
    });
  });

  describe("getResumableMissions", () => {
    it("returns list of resumable missions for user", async () => {
      const missions = [{ id: "m-1" }, { id: "m-2" }];
      mockCheckpointService.getResumableMissions.mockResolvedValue(missions);

      const result = await controller.getResumableMissions(makeReq());

      expect(mockCheckpointService.getResumableMissions).toHaveBeenCalledWith(
        "user-1",
      );
      expect(result).toBe(missions);
    });

    it("throws UnauthorizedException when user not authenticated", async () => {
      await expect(
        controller.getResumableMissions(makeAnonReq() as never),
      ).rejects.toThrow(UnauthorizedException);
    });
  });

  describe("triggerHealthCheck", () => {
    it("triggers manual health check for admin", async () => {
      const checkResult = { checked: 5, stuck: 1, recovered: 1 };
      mockHealthService.forceHealthCheck.mockResolvedValue(checkResult);

      const result = await controller.triggerHealthCheck(makeReq());

      expect(mockHealthService.forceHealthCheck).toHaveBeenCalled();
      expect(result).toBe(checkResult);
    });

    it("throws UnauthorizedException when user not authenticated", async () => {
      await expect(
        controller.triggerHealthCheck(makeAnonReq() as never),
      ).rejects.toThrow(UnauthorizedException);
    });
  });
});
