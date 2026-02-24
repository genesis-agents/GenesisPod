/**
 * Unit tests for A2AController
 */

import { Test, TestingModule } from "@nestjs/testing";
import {
  BadRequestException,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { A2AController } from "../a2a.controller";
import { AgentCardRegistry } from "../agent-card/agent-card.registry";
import { TeamsService } from "../../teams/services/teams.service";
import { TraceCollectorService } from "../../observability/trace-collector.service";
import { A2AApiKeyGuard } from "../guards/a2a-api-key.guard";
import { SecretsService } from "../../../core/secrets/secrets.service";
import { A2ATaskStatus } from "../abstractions/a2a.interface";

const mockAgentCardRegistry = {
  getAgentCard: jest.fn(),
  getSkillById: jest.fn(),
  getSkills: jest.fn(),
};

const mockTeamsService = {
  executeMission: jest.fn(),
  getMissionStatus: jest.fn(),
  getMissionResult: jest.fn(),
};

const mockTraceCollector = {
  startTrace: jest.fn(),
  endTrace: jest.fn(),
};

const sampleAgentCard = {
  name: "Genesis.ai",
  description: "Enterprise AI platform",
  url: "https://example.com/a2a/tasks",
  provider: { organization: "Genesis", url: "https://example.com" },
  version: "1.0.0",
  defaultInputModes: ["text"],
  defaultOutputModes: ["text/markdown"],
  skills: [
    {
      id: "deep-research",
      name: "Deep Research",
      description: "Research anything",
      tags: ["research"],
    },
  ],
};

function makeValidTaskRequest(overrides: Record<string, unknown> = {}) {
  return {
    skillId: "deep-research",
    input: { content: "Analyze AI trends" },
    ...overrides,
  };
}

describe("A2AController", () => {
  let controller: A2AController;

  beforeEach(async () => {
    jest.clearAllMocks();
    jest.spyOn(Logger.prototype, "log").mockReturnValue(undefined);
    jest.spyOn(Logger.prototype, "error").mockReturnValue(undefined);
    jest.spyOn(Logger.prototype, "warn").mockReturnValue(undefined);
    jest.spyOn(Logger.prototype, "debug").mockReturnValue(undefined);

    const module: TestingModule = await Test.createTestingModule({
      controllers: [A2AController],
      providers: [
        { provide: AgentCardRegistry, useValue: mockAgentCardRegistry },
        { provide: TeamsService, useValue: mockTeamsService },
        { provide: TraceCollectorService, useValue: mockTraceCollector },
        { provide: SecretsService, useValue: { getSecretNames: jest.fn(), getValueInternal: jest.fn() } },
        { provide: Reflector, useValue: { getAllAndOverride: jest.fn().mockReturnValue(false) } },
        A2AApiKeyGuard,
      ],
    }).compile();

    controller = module.get<A2AController>(A2AController);
  });

  describe("getAgentCard", () => {
    it("returns the agent card from registry", () => {
      mockAgentCardRegistry.getAgentCard.mockReturnValue(sampleAgentCard);

      const result = controller.getAgentCard();

      expect(result).toEqual(sampleAgentCard);
      expect(mockAgentCardRegistry.getAgentCard).toHaveBeenCalledTimes(1);
    });
  });

  describe("createTask", () => {
    it("throws BadRequestException when input content is missing", async () => {
      const request = { skillId: "deep-research", input: {} };

      await expect(controller.createTask(request as never)).rejects.toThrow(
        BadRequestException,
      );
    });

    it("throws BadRequestException when input content is not a string", async () => {
      const request = {
        skillId: "deep-research",
        input: { content: 12345 },
      };

      await expect(controller.createTask(request as never)).rejects.toThrow(
        BadRequestException,
      );
    });

    it("throws BadRequestException when content exceeds 100KB", async () => {
      const request = makeValidTaskRequest({
        input: { content: "x".repeat(100_001) },
      });

      await expect(controller.createTask(request as never)).rejects.toThrow(
        BadRequestException,
      );
    });

    it("returns FAILED status when skill is not found", async () => {
      mockAgentCardRegistry.getSkillById.mockReturnValue(undefined);
      mockAgentCardRegistry.getSkills.mockReturnValue([]);

      const result = await controller.createTask(makeValidTaskRequest() as never);

      expect(result.status).toBe(A2ATaskStatus.FAILED);
      expect(result.error?.code).toBe("INVALID_SKILL");
    });

    it("returns FAILED status when skill has no team mapping", async () => {
      mockAgentCardRegistry.getSkillById.mockReturnValue({
        id: "unknown-skill",
        name: "Unknown",
        description: "no mapping",
        tags: [],
      });
      mockAgentCardRegistry.getSkills.mockReturnValue([]);

      const request = makeValidTaskRequest({ skillId: "unknown-skill" });
      const result = await controller.createTask(request as never);

      expect(result.status).toBe(A2ATaskStatus.FAILED);
      expect(result.error?.code).toBe("SKILL_NOT_IMPLEMENTED");
    });

    it("creates task successfully for valid deep-research skill", async () => {
      mockAgentCardRegistry.getSkillById.mockReturnValue({
        id: "deep-research",
        name: "Deep Research",
        description: "Research",
        tags: ["research"],
      });
      mockTeamsService.executeMission.mockResolvedValue("mission-123");
      mockTraceCollector.startTrace.mockReturnValue("trace-id-1");

      const result = await controller.createTask(makeValidTaskRequest() as never);

      expect(result.status).toBe(A2ATaskStatus.PENDING);
      expect(result.taskId).toBe("mission-123");
      expect(mockTeamsService.executeMission).toHaveBeenCalledWith(
        expect.objectContaining({
          teamId: "research",
          goal: "Analyze AI trends",
        }),
      );
    });

    it("returns FAILED status when team execution throws", async () => {
      mockAgentCardRegistry.getSkillById.mockReturnValue({
        id: "deep-research",
        name: "Deep Research",
        description: "Research",
        tags: [],
      });
      mockTeamsService.executeMission.mockRejectedValue(
        new Error("Team unavailable"),
      );
      mockTraceCollector.startTrace.mockReturnValue("trace-id");

      const result = await controller.createTask(makeValidTaskRequest() as never);

      expect(result.status).toBe(A2ATaskStatus.FAILED);
      expect(result.error?.code).toBe("TASK_CREATION_FAILED");
      expect(result.error?.message).toContain("Team unavailable");
    });

    it("throws BadRequestException for invalid webhook URL scheme (http)", async () => {
      mockAgentCardRegistry.getSkillById.mockReturnValue({
        id: "deep-research",
        name: "Deep Research",
        description: "Research",
        tags: [],
      });

      const request = makeValidTaskRequest({
        config: { webhookUrl: "http://example.com/webhook" },
      });

      await expect(controller.createTask(request as never)).rejects.toThrow(
        BadRequestException,
      );
    });

    it("throws BadRequestException for webhook URL pointing to localhost", async () => {
      mockAgentCardRegistry.getSkillById.mockReturnValue({
        id: "deep-research",
        name: "Deep Research",
        description: "Research",
        tags: [],
      });

      const request = makeValidTaskRequest({
        config: { webhookUrl: "https://localhost/webhook" },
      });

      await expect(controller.createTask(request as never)).rejects.toThrow(
        BadRequestException,
      );
    });

    it("throws BadRequestException for webhook URL pointing to private IP", async () => {
      mockAgentCardRegistry.getSkillById.mockReturnValue({
        id: "deep-research",
        name: "Deep Research",
        description: "Research",
        tags: [],
      });

      const request = makeValidTaskRequest({
        config: { webhookUrl: "https://192.168.1.1/webhook" },
      });

      await expect(controller.createTask(request as never)).rejects.toThrow(
        BadRequestException,
      );
    });

    it("throws BadRequestException for webhook URL on blocked port", async () => {
      mockAgentCardRegistry.getSkillById.mockReturnValue({
        id: "deep-research",
        name: "Deep Research",
        description: "Research",
        tags: [],
      });

      const request = makeValidTaskRequest({
        config: { webhookUrl: "https://example.com:5432/webhook" },
      });

      await expect(controller.createTask(request as never)).rejects.toThrow(
        BadRequestException,
      );
    });

    it("accepts valid HTTPS webhook URL on standard domain", async () => {
      mockAgentCardRegistry.getSkillById.mockReturnValue({
        id: "deep-research",
        name: "Deep Research",
        description: "Research",
        tags: [],
      });
      mockTeamsService.executeMission.mockResolvedValue("mission-456");
      mockTraceCollector.startTrace.mockReturnValue("trace-id");

      const request = makeValidTaskRequest({
        config: { webhookUrl: "https://api.partner.com/webhook" },
      });

      const result = await controller.createTask(request as never);

      expect(result.status).toBe(A2ATaskStatus.PENDING);
    });

    it("sanitizes metadata - strips __proto__ key", async () => {
      mockAgentCardRegistry.getSkillById.mockReturnValue({
        id: "deep-research",
        name: "Deep Research",
        description: "Research",
        tags: [],
      });
      mockTeamsService.executeMission.mockResolvedValue("mission-789");
      mockTraceCollector.startTrace.mockReturnValue("trace-id");

      const request = makeValidTaskRequest({
        metadata: { __proto__: { evil: true }, clientId: "client-1" },
      });

      const result = await controller.createTask(request as never);

      expect(result.status).toBe(A2ATaskStatus.PENDING);
      // Verify the mission was created (metadata was sanitized, not blocked)
      expect(mockTeamsService.executeMission).toHaveBeenCalled();
    });

    it("calls startTrace and endTrace on successful task creation", async () => {
      mockAgentCardRegistry.getSkillById.mockReturnValue({
        id: "deep-research",
        name: "Deep Research",
        description: "Research",
        tags: [],
      });
      mockTeamsService.executeMission.mockResolvedValue("mission-999");
      mockTraceCollector.startTrace.mockReturnValue("trace-001");

      await controller.createTask(makeValidTaskRequest() as never);

      expect(mockTraceCollector.startTrace).toHaveBeenCalledWith(
        expect.objectContaining({ type: "a2a_task" }),
      );
      expect(mockTraceCollector.endTrace).toHaveBeenCalledWith("trace-001", {
        status: "success",
      });
    });

    it("calls endTrace with error status on failure", async () => {
      mockAgentCardRegistry.getSkillById.mockReturnValue({
        id: "deep-research",
        name: "Deep Research",
        description: "Research",
        tags: [],
      });
      mockTeamsService.executeMission.mockRejectedValue(new Error("fail"));
      mockTraceCollector.startTrace.mockReturnValue("trace-002");

      await controller.createTask(makeValidTaskRequest() as never);

      expect(mockTraceCollector.endTrace).toHaveBeenCalledWith("trace-002", {
        status: "error",
      });
    });

    it("handles team-debate skill mapping correctly", async () => {
      mockAgentCardRegistry.getSkillById.mockReturnValue({
        id: "team-debate",
        name: "Team Debate",
        description: "Debate",
        tags: [],
      });
      mockTeamsService.executeMission.mockResolvedValue("debate-mission");
      mockTraceCollector.startTrace.mockReturnValue("trace-id");

      const request = makeValidTaskRequest({ skillId: "team-debate" });
      const result = await controller.createTask(request as never);

      expect(result.status).toBe(A2ATaskStatus.PENDING);
      expect(mockTeamsService.executeMission).toHaveBeenCalledWith(
        expect.objectContaining({ teamId: "debate" }),
      );
    });
  });

  describe("getTaskStatus", () => {
    it("throws NotFoundException when task is not found", async () => {
      mockTeamsService.getMissionStatus.mockImplementation(() => {
        throw new NotFoundException("Task not found");
      });

      await expect(controller.getTaskStatus("nonexistent-id")).rejects.toThrow(
        NotFoundException,
      );
    });

    it("throws NotFoundException when error message contains 'not found'", async () => {
      mockTeamsService.getMissionStatus.mockImplementation(() => {
        throw new Error("Mission abc not found");
      });

      await expect(controller.getTaskStatus("abc")).rejects.toThrow(
        NotFoundException,
      );
    });

    it("returns PENDING status for pending task", async () => {
      mockTeamsService.getMissionStatus.mockReturnValue({
        status: "pending",
        teamId: "research",
        startTime: new Date(),
        endTime: null,
        error: null,
      });

      const result = await controller.getTaskStatus("task-123");

      expect(result.status).toBe(A2ATaskStatus.PENDING);
      expect(result.taskId).toBe("task-123");
    });

    it("returns RUNNING status for running task", async () => {
      mockTeamsService.getMissionStatus.mockReturnValue({
        status: "running",
        teamId: "research",
        startTime: new Date(),
        endTime: null,
        error: null,
      });

      const result = await controller.getTaskStatus("task-456");

      expect(result.status).toBe(A2ATaskStatus.RUNNING);
    });

    it("returns COMPLETED status with result for completed task", async () => {
      const startTime = new Date();
      const endTime = new Date();
      mockTeamsService.getMissionStatus.mockReturnValue({
        status: "completed",
        teamId: "research",
        startTime,
        endTime,
        error: null,
      });
      mockTeamsService.getMissionResult.mockResolvedValue({
        summary: "Research complete",
        deliverables: ["report.pdf"],
        statistics: { sources: 5 },
        duration: 5000,
        tokensUsed: 1000,
        metadata: { a2aSkillId: "deep-research" },
      });

      const result = await controller.getTaskStatus("task-789");

      expect(result.status).toBe(A2ATaskStatus.COMPLETED);
      expect(result.result?.content).toBe("Research complete");
      expect(result.result?.metadata?.tokenUsage?.total).toBe(1000);
    });

    it("returns FAILED status with error for failed task", async () => {
      mockTeamsService.getMissionStatus.mockReturnValue({
        status: "failed",
        teamId: "debate",
        startTime: new Date(),
        endTime: new Date(),
        error: "Mission execution failed",
      });

      const result = await controller.getTaskStatus("failed-task");

      expect(result.status).toBe(A2ATaskStatus.FAILED);
      expect(result.error?.code).toBe("MISSION_FAILED");
      expect(result.error?.message).toBe("Mission execution failed");
    });

    it("returns CANCELLED status for cancelled task", async () => {
      mockTeamsService.getMissionStatus.mockReturnValue({
        status: "cancelled",
        teamId: "research",
        startTime: new Date(),
        endTime: new Date(),
        error: null,
      });

      const result = await controller.getTaskStatus("cancelled-task");

      expect(result.status).toBe(A2ATaskStatus.CANCELLED);
    });

    it("reverses teamId to skillId correctly for research team", async () => {
      mockTeamsService.getMissionStatus.mockReturnValue({
        status: "pending",
        teamId: "research",
        startTime: new Date(),
        endTime: null,
        error: null,
      });

      const result = await controller.getTaskStatus("task-research");

      expect(result.skillId).toBe("deep-research");
    });

    it("throws BadRequestException for unexpected errors during status fetch", async () => {
      mockTeamsService.getMissionStatus.mockImplementation(() => {
        throw new Error("Unexpected DB error");
      });

      await expect(controller.getTaskStatus("task-xyz")).rejects.toThrow(
        BadRequestException,
      );
    });
  });
});
