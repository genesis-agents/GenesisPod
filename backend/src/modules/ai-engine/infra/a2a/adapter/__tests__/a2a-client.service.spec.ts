/**
 * Unit tests for A2AClientService
 */

import { Test, TestingModule } from "@nestjs/testing";
import { Logger } from "@nestjs/common";
import axios from "axios";
import { A2AClientService } from "../a2a-client.service";
import { A2ATaskStatus } from "../../abstractions/a2a.interface";

jest.mock("axios");

const mockedAxios = axios as jest.Mocked<typeof axios>;

const mockHttpClient = {
  get: jest.fn(),
  post: jest.fn(),
};

describe("A2AClientService", () => {
  let service: A2AClientService;

  beforeEach(async () => {
    jest.clearAllMocks();
    jest.spyOn(Logger.prototype, "log").mockReturnValue(undefined);
    jest.spyOn(Logger.prototype, "error").mockReturnValue(undefined);
    jest.spyOn(Logger.prototype, "warn").mockReturnValue(undefined);
    jest.spyOn(Logger.prototype, "debug").mockReturnValue(undefined);

    // Mock axios.create to return our mock client
    mockedAxios.create = jest.fn().mockReturnValue(mockHttpClient);

    const module: TestingModule = await Test.createTestingModule({
      providers: [A2AClientService],
    }).compile();

    service = module.get<A2AClientService>(A2AClientService);
  });

  describe("discoverAgent", () => {
    it("returns the agent card from the well-known endpoint", async () => {
      const agentCard = {
        name: "External Agent",
        description: "An external AI agent",
        url: "https://agent.example.com/a2a",
        provider: { organization: "Example", url: "https://example.com" },
        version: "1.0.0",
        defaultInputModes: ["text"],
        defaultOutputModes: ["text/markdown"],
        skills: [],
      };

      mockHttpClient.get.mockResolvedValue({ data: agentCard });

      const result = await service.discoverAgent(
        "https://agent.example.com/.well-known/agent.json",
      );

      expect(result).toEqual(agentCard);
      expect(mockHttpClient.get).toHaveBeenCalledWith(
        "https://agent.example.com/.well-known/agent.json",
      );
    });

    it("throws an error when discovery fails", async () => {
      mockHttpClient.get.mockRejectedValue(new Error("ECONNREFUSED"));

      await expect(
        service.discoverAgent(
          "https://unreachable.example.com/.well-known/agent.json",
        ),
      ).rejects.toThrow("Failed to discover A2A agent");
    });

    it("includes original error message in the thrown error", async () => {
      mockHttpClient.get.mockRejectedValue(new Error("Connection timeout"));

      await expect(
        service.discoverAgent("https://example.com/.well-known/agent.json"),
      ).rejects.toThrow(/Failed to discover A2A agent/);
    });
  });

  describe("createTask", () => {
    const agentUrl = "https://agent.example.com";
    const taskRequest = {
      skillId: "deep-research",
      input: { content: "Analyze AI" },
    };

    it("creates a task and returns the task response", async () => {
      const taskResponse = {
        taskId: "task-123",
        status: A2ATaskStatus.PENDING,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      mockHttpClient.post.mockResolvedValue({ data: taskResponse });

      const result = await service.createTask(agentUrl, taskRequest);

      expect(result).toEqual(taskResponse);
      expect(mockHttpClient.post).toHaveBeenCalledWith(
        `${agentUrl}/tasks`,
        taskRequest,
      );
    });

    it("throws an error when task creation fails", async () => {
      mockHttpClient.post.mockRejectedValue(new Error("Bad request"));

      await expect(service.createTask(agentUrl, taskRequest)).rejects.toThrow(
        "Failed to create A2A task",
      );
    });

    it("includes error details in the thrown error", async () => {
      mockHttpClient.post.mockRejectedValue(new Error("Skill not found"));

      await expect(service.createTask(agentUrl, taskRequest)).rejects.toThrow(
        /Failed to create A2A task/,
      );
    });
  });

  describe("getTaskStatus", () => {
    const agentUrl = "https://agent.example.com";

    it("returns task status response", async () => {
      const statusResponse = {
        taskId: "task-123",
        skillId: "deep-research",
        status: A2ATaskStatus.RUNNING,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      mockHttpClient.get.mockResolvedValue({ data: statusResponse });

      const result = await service.getTaskStatus(agentUrl, "task-123");

      expect(result).toEqual(statusResponse);
      expect(mockHttpClient.get).toHaveBeenCalledWith(
        `${agentUrl}/tasks/task-123`,
      );
    });

    it("throws an error when status fetch fails", async () => {
      mockHttpClient.get.mockRejectedValue(new Error("Task not found"));

      await expect(
        service.getTaskStatus(agentUrl, "nonexistent"),
      ).rejects.toThrow("Failed to get A2A task status");
    });
  });

  describe("pollTaskUntilComplete", () => {
    const agentUrl = "https://agent.example.com";

    it("returns immediately when task is COMPLETED", async () => {
      const completedStatus = {
        taskId: "task-123",
        skillId: "deep-research",
        status: A2ATaskStatus.COMPLETED,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        result: { content: "Done", mode: "text/markdown" },
      };

      mockHttpClient.get.mockResolvedValue({ data: completedStatus });

      const result = await service.pollTaskUntilComplete(
        agentUrl,
        "task-123",
        0, // 0ms poll interval for fast tests
        10,
      );

      expect(result.status).toBe(A2ATaskStatus.COMPLETED);
      expect(mockHttpClient.get).toHaveBeenCalledTimes(1);
    });

    it("returns immediately when task is FAILED", async () => {
      const failedStatus = {
        taskId: "task-failed",
        skillId: "deep-research",
        status: A2ATaskStatus.FAILED,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        error: { code: "TASK_FAILED", message: "Execution failed" },
      };

      mockHttpClient.get.mockResolvedValue({ data: failedStatus });

      const result = await service.pollTaskUntilComplete(
        agentUrl,
        "task-failed",
        0,
        10,
      );

      expect(result.status).toBe(A2ATaskStatus.FAILED);
    });

    it("returns immediately when task is CANCELLED", async () => {
      const cancelledStatus = {
        taskId: "task-cancelled",
        skillId: "deep-research",
        status: A2ATaskStatus.CANCELLED,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      mockHttpClient.get.mockResolvedValue({ data: cancelledStatus });

      const result = await service.pollTaskUntilComplete(
        agentUrl,
        "task-cancelled",
        0,
        10,
      );

      expect(result.status).toBe(A2ATaskStatus.CANCELLED);
    });

    it("polls multiple times until task completes", async () => {
      const pendingStatus = {
        taskId: "task-poll",
        skillId: "deep-research",
        status: A2ATaskStatus.PENDING,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      const completedStatus = {
        ...pendingStatus,
        status: A2ATaskStatus.COMPLETED,
        result: { content: "Done", mode: "text/markdown" },
      };

      mockHttpClient.get
        .mockResolvedValueOnce({ data: pendingStatus })
        .mockResolvedValueOnce({ data: pendingStatus })
        .mockResolvedValueOnce({ data: completedStatus });

      const result = await service.pollTaskUntilComplete(
        agentUrl,
        "task-poll",
        0,
        10,
      );

      expect(result.status).toBe(A2ATaskStatus.COMPLETED);
      expect(mockHttpClient.get).toHaveBeenCalledTimes(3);
    });

    it("throws when max polling attempts are exhausted", async () => {
      const runningStatus = {
        taskId: "task-infinite",
        skillId: "deep-research",
        status: A2ATaskStatus.RUNNING,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      mockHttpClient.get.mockResolvedValue({ data: runningStatus });

      await expect(
        service.pollTaskUntilComplete(agentUrl, "task-infinite", 0, 3),
      ).rejects.toThrow("did not complete within maximum polling attempts");
    });
  });
});
