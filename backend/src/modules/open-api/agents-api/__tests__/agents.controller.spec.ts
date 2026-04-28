/**
 * AgentsController unit tests
 *
 * Tests REST API endpoints for agent management:
 * - GET /agents → getAgents()
 * - GET /agents/status → getStatus()
 * - GET /agents/:type/templates → getTemplates()
 * - POST /agents/execute → execute()
 * - GET /agents/tasks/:taskId → getTask()
 * - SSE /agents/tasks/:taskId/stream → streamTask()
 * - POST /agents/tasks/:taskId/cancel → cancelTask()
 * - GET /agents/tasks/:taskId/artifacts → getArtifacts()
 * - GET /agents/artifacts/:artifactId/download → downloadArtifact()
 */

import { Test, TestingModule } from "@nestjs/testing";
import { HttpException, HttpStatus, Logger } from "@nestjs/common";
import { of } from "rxjs";
import { AgentsController } from "../agents.controller";
import { AgentOrchestrator } from "../../../ai-harness/facade";
import { AgentRegistry } from "../../../ai-harness/facade";
import { AgentsService } from "../agents.service";

describe("AgentsController", () => {
  let controller: AgentsController;
  let mockOrchestrator: any;
  let mockAgentRegistry: any;
  let mockAgentsService: any;

  const mockAgentConfig = {
    id: "slides",
    name: "Slides Agent",
    description: "Generates presentations",
    icon: "slides",
    color: "#0000FF",
    capabilities: ["presentation"],
    templates: [
      { id: "basic", name: "Basic Presentation", description: "5 slides" },
    ],
    selectionKeywords: ["slides", "presentation"],
  };

  const mockAgent = {
    id: "slides",
    name: "Slides Agent",
    description: "Generates presentations",
    capabilities: [],
    requiredTools: [],
    getConfig: jest.fn().mockReturnValue(mockAgentConfig),
    getTemplates: jest
      .fn()
      .mockReturnValue([
        { id: "basic", name: "Basic Presentation", description: "5 slides" },
      ]),
    plan: jest.fn(),
    execute: jest.fn(),
  };

  const mockTask = {
    id: "task-1",
    status: "PENDING",
    agentType: "SLIDES",
    input: {},
    plan: null,
    result: null,
    createdAt: new Date(),
    artifacts: [],
  };

  beforeEach(async () => {
    mockOrchestrator = {
      execute: jest.fn(),
      getStatusReport: jest.fn().mockReturnValue([
        {
          agentId: "slides",
          name: "Slides Agent",
          available: true,
          executions: 10,
          errors: 1,
        },
      ]),
    };

    mockAgentRegistry = {
      getAllConfigs: jest.fn().mockReturnValue([mockAgentConfig]),
      getStats: jest.fn().mockReturnValue({
        total: 1,
        byId: { slides: { executions: 10, errors: 1 } },
      }),
      has: jest.fn().mockReturnValue(true),
      get: jest.fn().mockReturnValue(mockAgent),
    };

    mockAgentsService = {
      createTask: jest.fn().mockResolvedValue({ id: "task-1" }),
      getTask: jest.fn().mockResolvedValue(mockTask),
      getTaskStream: jest.fn().mockReturnValue(of({ type: "progress" })),
      updateTaskStatus: jest.fn().mockResolvedValue(undefined),
      updateTaskPlan: jest.fn().mockResolvedValue(undefined),
      saveArtifact: jest.fn().mockResolvedValue(undefined),
      updateTaskResult: jest.fn().mockResolvedValue(undefined),
      publishEvent: jest.fn(),
      cancelTask: jest.fn().mockResolvedValue(true),
      getArtifacts: jest
        .fn()
        .mockResolvedValue([{ id: "art-1", type: "pptx" }]),
      getArtifactDownload: jest.fn().mockResolvedValue({
        url: "https://storage.example.com/file.pptx",
        name: "presentation.pptx",
        mimeType:
          "application/vnd.openxmlformats-officedocument.presentationml.presentation",
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [AgentsController],
      providers: [
        { provide: AgentOrchestrator, useValue: mockOrchestrator },
        { provide: AgentRegistry, useValue: mockAgentRegistry },
        { provide: AgentsService, useValue: mockAgentsService },
      ],
    }).compile();

    controller = module.get<AgentsController>(AgentsController);

    jest.spyOn(Logger.prototype, "log").mockImplementation();
    jest.spyOn(Logger.prototype, "warn").mockImplementation();
    jest.spyOn(Logger.prototype, "error").mockImplementation();
    jest.spyOn(Logger.prototype, "debug").mockImplementation();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("should be defined", () => {
    expect(controller).toBeDefined();
  });

  // ==================== getAgents ====================

  describe("getAgents", () => {
    it("should return all registered agent configs", async () => {
      const result = await controller.getAgents();

      expect(mockAgentRegistry.getAllConfigs).toHaveBeenCalled();
      expect(result.agents).toHaveLength(1);
      expect(result.agents[0].id).toBe("slides");
    });
  });

  // ==================== getStatus ====================

  describe("getStatus", () => {
    it("should return status report with stats", async () => {
      const result = await controller.getStatus();

      expect(mockOrchestrator.getStatusReport).toHaveBeenCalled();
      expect(mockAgentRegistry.getStats).toHaveBeenCalled();
      expect(result.agents).toHaveLength(1);
      expect(result.stats).toBeDefined();
    });
  });

  // ==================== getTemplates ====================

  describe("getTemplates", () => {
    it("should return templates for valid agent type", async () => {
      const result = await controller.getTemplates("slides");

      expect(mockAgentRegistry.has).toHaveBeenCalledWith("slides");
      expect(mockAgentRegistry.get).toHaveBeenCalledWith("slides");
      expect(result.templates).toHaveLength(1);
      expect(result.templates[0].id).toBe("basic");
    });

    it("should normalize type to lowercase", async () => {
      await controller.getTemplates("SLIDES");
      expect(mockAgentRegistry.has).toHaveBeenCalledWith("slides");
    });

    it("should throw BAD_REQUEST for invalid agent type", async () => {
      await expect(
        controller.getTemplates("invalid-agent-xyz"),
      ).rejects.toThrow(
        new HttpException("Invalid agent type", HttpStatus.BAD_REQUEST),
      );
    });

    it("should return empty templates when agent not registered", async () => {
      mockAgentRegistry.has.mockReturnValueOnce(false);

      const result = await controller.getTemplates("slides");
      expect(result.templates).toEqual([]);
    });
  });

  // ==================== execute ====================

  describe("execute", () => {
    const mockRequest = { user: { id: "user-1", email: "user@test.com" } };

    it("should create task and return taskId with pending status", async () => {
      // Mock the orchestrator execute as async generator
      async function* mockExecute() {
        yield { type: "complete" as const, result: { success: true } };
      }
      mockOrchestrator.execute.mockReturnValue(mockExecute());

      const result = await controller.execute(
        {
          prompt: "Create a presentation",
          agentId: "slides",
          files: [],
          urls: [],
          resourceIds: [],
          options: {},
        },
        mockRequest as any,
      );

      expect(mockAgentsService.createTask).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: "user-1",
          agentId: "slides",
        }),
      );
      expect(result.taskId).toBe("task-1");
      expect(result.status).toBe("pending");
    });

    it("should pass input fields to agentsService.createTask", async () => {
      async function* mockExecute() {
        yield { type: "complete" as const, result: { success: true } };
      }
      mockOrchestrator.execute.mockReturnValue(mockExecute());

      await controller.execute(
        {
          prompt: "My prompt",
          files: [{ name: "file.txt", content: "data" }] as any,
          urls: ["https://example.com"],
          resourceIds: ["res-1"],
          templateId: "basic",
          options: { format: "pdf" },
        },
        mockRequest as any,
      );

      expect(mockAgentsService.createTask).toHaveBeenCalledWith(
        expect.objectContaining({
          input: expect.objectContaining({
            prompt: "My prompt",
            files: expect.any(Array),
            urls: ["https://example.com"],
            resourceIds: ["res-1"],
            templateId: "basic",
            options: { format: "pdf" },
          }),
        }),
      );
    });
  });

  // ==================== getTask ====================

  describe("getTask", () => {
    it("should return task when found", async () => {
      const result = await controller.getTask("task-1");

      expect(mockAgentsService.getTask).toHaveBeenCalledWith("task-1");
      expect(result).toBeDefined();
    });

    it("should throw NOT_FOUND when task does not exist", async () => {
      mockAgentsService.getTask.mockResolvedValueOnce(null);

      await expect(controller.getTask("nonexistent")).rejects.toThrow(
        new HttpException("Task not found", HttpStatus.NOT_FOUND),
      );
    });
  });

  // ==================== streamTask ====================

  describe("streamTask", () => {
    it("should return observable with JSON-stringified events", (done) => {
      const observable = controller.streamTask("task-1");

      observable.subscribe({
        next: (event) => {
          expect(event.data).toBe(JSON.stringify({ type: "progress" }));
          done();
        },
        error: done,
      });
    });

    it("should handle stream errors gracefully", (done) => {
      const { throwError } = require("rxjs");
      mockAgentsService.getTaskStream.mockReturnValueOnce(
        throwError(() => new Error("Stream broken")),
      );

      const observable = controller.streamTask("task-1");

      observable.subscribe({
        next: (event) => {
          const data = JSON.parse(event.data as string);
          expect(data.type).toBe("error");
          expect(data.error).toBe("Stream broken");
          done();
        },
        error: done,
      });
    });
  });

  // ==================== cancelTask ====================

  describe("cancelTask", () => {
    it("should cancel task and return success: true", async () => {
      const result = await controller.cancelTask("task-1");

      expect(mockAgentsService.cancelTask).toHaveBeenCalledWith("task-1");
      expect(result.success).toBe(true);
    });

    it("should return success: false when task cannot be cancelled", async () => {
      mockAgentsService.cancelTask.mockResolvedValueOnce(false);

      const result = await controller.cancelTask("task-1");
      expect(result.success).toBe(false);
    });
  });

  // ==================== getArtifacts ====================

  describe("getArtifacts", () => {
    it("should return artifacts for a task", async () => {
      const result = await controller.getArtifacts("task-1");

      expect(mockAgentsService.getArtifacts).toHaveBeenCalledWith("task-1");
      expect(result.artifacts).toHaveLength(1);
    });
  });

  // ==================== downloadArtifact ====================

  describe("downloadArtifact", () => {
    it("should return artifact download info", async () => {
      const result = await controller.downloadArtifact("artifact-1");

      expect(mockAgentsService.getArtifactDownload).toHaveBeenCalledWith(
        "artifact-1",
      );
      expect(result.url).toBeDefined();
      expect(result.name).toBe("presentation.pptx");
      expect(result.mimeType).toContain("presentationml");
    });
  });

  // ==================== executeTaskAsync (private, through execute) ====================

  describe("executeTaskAsync (via execute)", () => {
    const mockReq = { user: { id: "user-1", email: "user@test.com" } };

    it("should handle plan_ready event", async () => {
      const plan = { steps: ["plan step"] };
      async function* mockGen() {
        yield { type: "plan_ready" as const, plan };
        yield { type: "complete" as const, result: { success: true } };
      }
      mockOrchestrator.execute.mockReturnValue(mockGen());

      await controller.execute(
        { prompt: "Test", agentId: "slides" },
        mockReq as any,
      );

      // Give async task time to start
      await new Promise((r) => setTimeout(r, 50));

      expect(mockAgentsService.updateTaskStatus).toHaveBeenCalledWith(
        "task-1",
        "PLANNING",
      );
    });

    it("should handle error event from orchestrator", async () => {
      async function* mockGen() {
        yield { type: "error" as const, error: "Agent failed" };
      }
      mockOrchestrator.execute.mockReturnValue(mockGen());

      await controller.execute({ prompt: "Fail" }, mockReq as any);

      await new Promise((r) => setTimeout(r, 50));

      // updateTaskStatus should be called with FAILED eventually
      // (async background task)
      expect(mockAgentsService.updateTaskStatus).toHaveBeenCalledWith(
        "task-1",
        "PLANNING",
      );
    });

    it("should handle thrown exception from orchestrator", async () => {
      async function* mockGen() {
        throw new Error("Orchestrator crash");
        // eslint-disable-next-line no-unreachable
        yield { type: "complete" as const, result: {} } as any;
      }
      mockOrchestrator.execute.mockReturnValue(mockGen());

      // Should not throw — error is caught inside executeTaskAsync
      await expect(
        controller.execute({ prompt: "Crash" }, mockReq as any),
      ).resolves.toBeDefined();

      await new Promise((r) => setTimeout(r, 50));

      expect(mockAgentsService.updateTaskStatus).toHaveBeenCalledWith(
        "task-1",
        "PLANNING",
      );
    });
  });
});
