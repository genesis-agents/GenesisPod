// Mock the entire service module to prevent transitive imports
// (collection-task.service.ts has deep transitive deps that require @nestjs/cache-manager)
jest.mock("../collection-task.service", () => ({
  CollectionTaskService: class {},
}));

// Mock other transitive deps to allow the controller import
jest.mock("@nestjs/cache-manager", () => ({ CACHE_MANAGER: "CACHE_MANAGER" }), {
  virtual: true,
});
jest.mock("cache-manager", () => ({}), { virtual: true });
jest.mock("ioredis", () => ({}), { virtual: true });
jest.mock("@nestjs/throttler", () => ({
  SkipThrottle:
    () => (_target: unknown, _key: string, descriptor: PropertyDescriptor) =>
      descriptor,
  ThrottlerModule: { forRoot: jest.fn() },
  ThrottlerGuard: class {},
}));

import { Test, TestingModule } from "@nestjs/testing";
import { CollectionTaskController } from "../collection-task.controller";
import {
  CollectionTaskService,
  CreateCollectionTaskDto,
  UpdateCollectionTaskDto,
} from "../collection-task.service";
import { CollectionTaskStatus, CollectionTaskType } from "@prisma/client";

const mockTaskService = {
  create: jest.fn(),
  findAll: jest.fn(),
  getRunningTasks: jest.fn(),
  getPendingTasks: jest.fn(),
  findOne: jest.fn(),
  update: jest.fn(),
  remove: jest.fn(),
  execute: jest.fn(),
  pause: jest.fn(),
  resume: jest.fn(),
  cancel: jest.fn(),
};

const mockTask = {
  id: "task-1",
  name: "Test Task",
  description: "A test collection task",
  type: "RSS_FETCH" as CollectionTaskType,
  sourceId: "source-1",
  sourceConfig: {},
  status: "PENDING" as CollectionTaskStatus,
  progress: 0,
  priority: 5,
  maxConcurrency: 5,
  timeout: 300,
  retryCount: 3,
  deduplicationRules: {},
  schedule: null,
  createdBy: null,
  lastRunAt: null,
  nextRunAt: null,
  completedAt: null,
  errorMessage: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

describe("CollectionTaskController", () => {
  let controller: CollectionTaskController;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [CollectionTaskController],
      providers: [
        { provide: CollectionTaskService, useValue: mockTaskService },
      ],
    }).compile();

    controller = module.get<CollectionTaskController>(CollectionTaskController);
  });

  // ==================== create ====================

  describe("create", () => {
    it("creates a new collection task", async () => {
      mockTaskService.create.mockResolvedValue(mockTask);

      const dto: CreateCollectionTaskDto = {
        name: "Test Task",
        type: "RSS_FETCH" as CollectionTaskType,
        sourceId: "source-1",
        sourceConfig: { url: "https://example.com/rss" },
      };

      const result = await controller.create(dto);

      expect(mockTaskService.create).toHaveBeenCalledWith(dto);
      expect(result).toEqual(mockTask);
    });
  });

  // ==================== findAll ====================

  describe("findAll", () => {
    it("returns all tasks without filters", async () => {
      mockTaskService.findAll.mockResolvedValue([mockTask]);

      const result = await controller.findAll();

      expect(mockTaskService.findAll).toHaveBeenCalledWith({
        status: undefined,
        type: undefined,
        sourceId: undefined,
        limit: undefined,
      });
      expect(result).toEqual({ data: [mockTask], total: 1 });
    });

    it("returns filtered tasks by status", async () => {
      mockTaskService.findAll.mockResolvedValue([mockTask]);

      const result = await controller.findAll(
        "PENDING" as CollectionTaskStatus,
      );

      expect(mockTaskService.findAll).toHaveBeenCalledWith({
        status: "PENDING",
        type: undefined,
        sourceId: undefined,
        limit: undefined,
      });
      expect(result.total).toBe(1);
    });

    it("parses limit parameter from string to number", async () => {
      mockTaskService.findAll.mockResolvedValue([mockTask]);

      await controller.findAll(undefined, undefined, undefined, "50");

      expect(mockTaskService.findAll).toHaveBeenCalledWith(
        expect.objectContaining({ limit: 50 }),
      );
    });

    it("filters by sourceId", async () => {
      mockTaskService.findAll.mockResolvedValue([mockTask]);

      const result = await controller.findAll(undefined, undefined, "source-1");

      expect(mockTaskService.findAll).toHaveBeenCalledWith(
        expect.objectContaining({ sourceId: "source-1" }),
      );
      expect(result.data).toHaveLength(1);
    });

    it("returns empty array when no tasks match", async () => {
      mockTaskService.findAll.mockResolvedValue([]);

      const result = await controller.findAll(
        "RUNNING" as CollectionTaskStatus,
      );

      expect(result.data).toHaveLength(0);
      expect(result.total).toBe(0);
    });
  });

  // ==================== getRunning ====================

  describe("getRunning", () => {
    it("returns running tasks", async () => {
      const runningTask = {
        ...mockTask,
        status: "RUNNING" as CollectionTaskStatus,
      };
      mockTaskService.getRunningTasks.mockResolvedValue([runningTask]);

      const result = await controller.getRunning();

      expect(mockTaskService.getRunningTasks).toHaveBeenCalled();
      expect(result).toEqual({ data: [runningTask], total: 1 });
    });

    it("returns empty list when no running tasks", async () => {
      mockTaskService.getRunningTasks.mockResolvedValue([]);

      const result = await controller.getRunning();

      expect(result.total).toBe(0);
    });
  });

  // ==================== getPending ====================

  describe("getPending", () => {
    it("returns pending tasks", async () => {
      mockTaskService.getPendingTasks.mockResolvedValue([mockTask]);

      const result = await controller.getPending();

      expect(mockTaskService.getPendingTasks).toHaveBeenCalled();
      expect(result).toEqual({ data: [mockTask], total: 1 });
    });
  });

  // ==================== findOne ====================

  describe("findOne", () => {
    it("returns a single task by id", async () => {
      mockTaskService.findOne.mockResolvedValue(mockTask);

      const result = await controller.findOne("task-1");

      expect(mockTaskService.findOne).toHaveBeenCalledWith("task-1");
      expect(result).toEqual(mockTask);
    });
  });

  // ==================== update ====================

  describe("update", () => {
    it("updates a task", async () => {
      const updated = { ...mockTask, name: "Updated Task" };
      mockTaskService.update.mockResolvedValue(updated);

      const dto: UpdateCollectionTaskDto = { name: "Updated Task" };
      const result = await controller.update("task-1", dto);

      expect(mockTaskService.update).toHaveBeenCalledWith("task-1", dto);
      expect(result.name).toBe("Updated Task");
    });
  });

  // ==================== remove ====================

  describe("remove", () => {
    it("removes a task (returns void)", async () => {
      mockTaskService.remove.mockResolvedValue(undefined);

      await controller.remove("task-1");

      expect(mockTaskService.remove).toHaveBeenCalledWith("task-1");
    });
  });

  // ==================== execute ====================

  describe("execute", () => {
    it("validates task exists then schedules async execution", async () => {
      mockTaskService.findOne.mockResolvedValue(mockTask);
      mockTaskService.execute.mockResolvedValue(undefined);

      const result = await controller.execute("task-1");

      // findOne is called to validate task exists
      expect(mockTaskService.findOne).toHaveBeenCalledWith("task-1");
      // Returns immediately without waiting for execution
      expect(result).toEqual({ message: "Task execution started" });
    });

    it("returns execution started message immediately", async () => {
      mockTaskService.findOne.mockResolvedValue(mockTask);
      // execute is called via setImmediate, but we still verify the response
      mockTaskService.execute.mockResolvedValue(undefined);

      const result = await controller.execute("task-1");

      expect(result.message).toBe("Task execution started");
    });
  });

  // ==================== pause / resume / cancel ====================

  describe("pause", () => {
    it("pauses a running task", async () => {
      const paused = {
        ...mockTask,
        status: "PAUSED" as CollectionTaskStatus,
      };
      mockTaskService.pause.mockResolvedValue(paused);

      const result = await controller.pause("task-1");

      expect(mockTaskService.pause).toHaveBeenCalledWith("task-1");
      expect(result.status).toBe("PAUSED");
    });
  });

  describe("resume", () => {
    it("resumes a paused task", async () => {
      const resumed = {
        ...mockTask,
        status: "PENDING" as CollectionTaskStatus,
      };
      mockTaskService.resume.mockResolvedValue(resumed);

      const result = await controller.resume("task-1");

      expect(mockTaskService.resume).toHaveBeenCalledWith("task-1");
      expect(result.status).toBe("PENDING");
    });
  });

  describe("cancel", () => {
    it("cancels a task", async () => {
      const cancelled = {
        ...mockTask,
        status: "CANCELLED" as CollectionTaskStatus,
      };
      mockTaskService.cancel.mockResolvedValue(cancelled);

      const result = await controller.cancel("task-1");

      expect(mockTaskService.cancel).toHaveBeenCalledWith("task-1");
      expect(result.status).toBe("CANCELLED");
    });
  });
});
