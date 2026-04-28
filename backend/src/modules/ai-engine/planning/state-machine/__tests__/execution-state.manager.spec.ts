/**
 * ExecutionStateManager Unit Tests
 * 执行状态管理器测试
 */

import { Test, TestingModule } from "@nestjs/testing";
import { Logger } from "@nestjs/common";
import {
  ProcessSupervisorService as ExecutionStateManager,
  StateCategory,
  ExecutionStateConfig,
} from "../../../../ai-engine/facade";
import { CacheService } from "@/common/cache/cache.service";

describe("ExecutionStateManager", () => {
  let service: ExecutionStateManager;
  let mockCacheService: any;

  beforeEach(async () => {
    jest.useFakeTimers();

    mockCacheService = {
      set: jest.fn().mockResolvedValue(undefined),
      del: jest.fn().mockResolvedValue(undefined),
      get: jest.fn().mockResolvedValue(null),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ExecutionStateManager,
        {
          provide: CacheService,
          useValue: mockCacheService,
        },
      ],
    }).compile();

    service = module.get<ExecutionStateManager>(ExecutionStateManager);

    // Suppress logger output during tests
    jest.spyOn(Logger.prototype, "log").mockImplementation();
    jest.spyOn(Logger.prototype, "warn").mockImplementation();
    jest.spyOn(Logger.prototype, "debug").mockImplementation();
  });

  afterEach(() => {
    service.onModuleDestroy();
    jest.clearAllTimers();
    jest.useRealTimers();
  });

  describe("start() - creates state entry", () => {
    it("should create a new state entry with correct startTime", () => {
      const now = Date.now();
      const result = service.start(StateCategory.TASK, "task-1", "Test task");

      expect(result).toBe(true);

      const state = service.getState(StateCategory.TASK, "task-1");
      expect(state).toBeDefined();
      expect(state?.startTime).toBeGreaterThanOrEqual(now);
      expect(state?.description).toBe("Test task");
    });

    it("should return false when ID already exists in same category", () => {
      service.start(StateCategory.TASK, "task-1", "First");
      const result = service.start(StateCategory.TASK, "task-1", "Duplicate");

      expect(result).toBe(false);

      const state = service.getState(StateCategory.TASK, "task-1");
      expect(state?.description).toBe("First");
    });

    it("should allow same ID in different categories", () => {
      const result1 = service.start(StateCategory.TASK, "id-1");
      const result2 = service.start(StateCategory.WORKFLOW, "id-1");

      expect(result1).toBe(true);
      expect(result2).toBe(true);
      expect(service.isActive(StateCategory.TASK, "id-1")).toBe(true);
      expect(service.isActive(StateCategory.WORKFLOW, "id-1")).toBe(true);
    });

    it("should store metadata correctly", () => {
      const metadata = { userId: "user-1", priority: "high" };
      service.start(StateCategory.TASK, "task-1", "Test", metadata);

      const state = service.getState(StateCategory.TASK, "task-1");
      expect(state?.metadata).toEqual(metadata);
    });
  });

  describe("finish() - removes state entry", () => {
    it("should remove the state entry", () => {
      service.start(StateCategory.TASK, "task-1");
      expect(service.isActive(StateCategory.TASK, "task-1")).toBe(true);

      service.finish(StateCategory.TASK, "task-1");
      expect(service.isActive(StateCategory.TASK, "task-1")).toBe(false);
      expect(service.getState(StateCategory.TASK, "task-1")).toBeUndefined();
    });

    it("should be a no-op for non-existent entries", () => {
      expect(() => {
        service.finish(StateCategory.TASK, "non-existent");
      }).not.toThrow();
    });

    it("should only remove from specified category", () => {
      service.start(StateCategory.TASK, "id-1");
      service.start(StateCategory.WORKFLOW, "id-1");

      service.finish(StateCategory.TASK, "id-1");

      expect(service.isActive(StateCategory.TASK, "id-1")).toBe(false);
      expect(service.isActive(StateCategory.WORKFLOW, "id-1")).toBe(true);
    });
  });

  describe("isActive() - checks active state", () => {
    it("should return true for active entries", () => {
      service.start(StateCategory.TASK, "task-1");
      expect(service.isActive(StateCategory.TASK, "task-1")).toBe(true);
    });

    it("should return false for non-existent entries", () => {
      expect(service.isActive(StateCategory.TASK, "task-1")).toBe(false);
    });

    it("should return false after finish", () => {
      service.start(StateCategory.TASK, "task-1");
      service.finish(StateCategory.TASK, "task-1");
      expect(service.isActive(StateCategory.TASK, "task-1")).toBe(false);
    });
  });

  describe("getState() - retrieves state entry", () => {
    it("should return the state entry with metadata", () => {
      const metadata = { key: "value" };
      service.start(StateCategory.TASK, "task-1", "Test", metadata);

      const state = service.getState(StateCategory.TASK, "task-1");
      expect(state).toBeDefined();
      expect(state?.description).toBe("Test");
      expect(state?.metadata).toEqual(metadata);
      expect(state?.startTime).toBeGreaterThan(0);
    });

    it("should return undefined for non-existent entry", () => {
      const state = service.getState(StateCategory.TASK, "non-existent");
      expect(state).toBeUndefined();
    });
  });

  describe("getActiveIds() - returns all active IDs", () => {
    it("should return all active IDs for a category", () => {
      service.start(StateCategory.TASK, "task-1");
      service.start(StateCategory.TASK, "task-2");
      service.start(StateCategory.TASK, "task-3");

      const ids = service.getActiveIds(StateCategory.TASK);
      expect(ids).toHaveLength(3);
      expect(ids).toContain("task-1");
      expect(ids).toContain("task-2");
      expect(ids).toContain("task-3");
    });

    it("should return empty array for category with no states", () => {
      const ids = service.getActiveIds(StateCategory.TASK);
      expect(ids).toEqual([]);
    });

    it("should not include finished tasks", () => {
      service.start(StateCategory.TASK, "task-1");
      service.start(StateCategory.TASK, "task-2");
      service.finish(StateCategory.TASK, "task-1");

      const ids = service.getActiveIds(StateCategory.TASK);
      expect(ids).toHaveLength(1);
      expect(ids).toContain("task-2");
    });
  });

  describe("convenience methods - startTask/finishTask/isTaskExecuting", () => {
    it("should work correctly for task operations", () => {
      expect(service.startTask("task-1", "Test task")).toBe(true);
      expect(service.isTaskExecuting("task-1")).toBe(true);

      service.finishTask("task-1");
      expect(service.isTaskExecuting("task-1")).toBe(false);
    });

    it("should prevent duplicate task starts", () => {
      service.startTask("task-1");
      expect(service.startTask("task-1")).toBe(false);
    });
  });

  describe("convenience methods - startWorkflow/finishWorkflow/isWorkflowExecuting", () => {
    it("should work correctly for workflow operations", () => {
      expect(service.startWorkflow("workflow-1", "Test workflow")).toBe(true);
      expect(service.isWorkflowExecuting("workflow-1")).toBe(true);

      service.finishWorkflow("workflow-1");
      expect(service.isWorkflowExecuting("workflow-1")).toBe(false);
    });

    it("should isolate workflow state from task state", () => {
      service.startTask("id-1");
      service.startWorkflow("id-1");

      expect(service.isTaskExecuting("id-1")).toBe(true);
      expect(service.isWorkflowExecuting("id-1")).toBe(true);

      service.finishTask("id-1");
      expect(service.isTaskExecuting("id-1")).toBe(false);
      expect(service.isWorkflowExecuting("id-1")).toBe(true);
    });
  });

  describe("getStats() - returns statistics", () => {
    it("should return correct counts and oldest ages", () => {
      service.start(StateCategory.TASK, "task-1");
      jest.advanceTimersByTime(1000);
      service.start(StateCategory.TASK, "task-2");
      service.start(StateCategory.WORKFLOW, "workflow-1");

      const stats = service.getStats();

      expect(stats.totalActive).toBe(3);
      expect(stats.activeCounts[StateCategory.TASK]).toBe(2);
      expect(stats.activeCounts[StateCategory.WORKFLOW]).toBe(1);

      expect(stats.oldestAges[StateCategory.TASK]).toBeGreaterThanOrEqual(1000);
      expect(stats.oldestAges[StateCategory.WORKFLOW]).toBeGreaterThanOrEqual(
        0,
      );
    });

    it("should return null for oldest age when category is empty", () => {
      const stats = service.getStats();
      expect(stats.totalActive).toBe(0);
      expect(stats.activeCounts).toEqual({});
      expect(stats.oldestAges).toEqual({});
    });

    it("should include config in stats", () => {
      const stats = service.getStats();
      expect(stats.config.ttlMs).toBe(30 * 60 * 1000);
      expect(stats.config.cleanupIntervalMs).toBe(5 * 60 * 1000);
    });
  });

  describe("cleanupExpiredStates() - removes old entries", () => {
    it("should remove entries older than TTL", () => {
      service.start(StateCategory.TASK, "task-1");
      service.start(StateCategory.TASK, "task-2");

      // Advance time past TTL (30 minutes)
      jest.advanceTimersByTime(31 * 60 * 1000);

      // Trigger cleanup via initialization
      void service.onModuleInit();
      jest.advanceTimersByTime(5 * 60 * 1000); // Cleanup interval

      const ids = service.getActiveIds(StateCategory.TASK);
      expect(ids).toHaveLength(0);
    });

    it("should not remove entries within TTL", () => {
      service.start(StateCategory.TASK, "task-1");

      // Advance time but stay within TTL
      jest.advanceTimersByTime(20 * 60 * 1000);

      void service.onModuleInit();
      jest.advanceTimersByTime(5 * 60 * 1000);

      expect(service.isActive(StateCategory.TASK, "task-1")).toBe(true);
    });

    it("should clean multiple categories", () => {
      service.start(StateCategory.TASK, "task-1");
      service.start(StateCategory.WORKFLOW, "workflow-1");

      jest.advanceTimersByTime(31 * 60 * 1000);

      void service.onModuleInit();
      jest.advanceTimersByTime(5 * 60 * 1000);

      expect(service.getStats().totalActive).toBe(0);
    });
  });

  describe("forceCleanAll() - clears all categories", () => {
    it("should clear all categories", () => {
      service.start(StateCategory.TASK, "task-1");
      service.start(StateCategory.TASK, "task-2");
      service.start(StateCategory.WORKFLOW, "workflow-1");
      service.start(StateCategory.REVISION, "revision-1");

      expect(service.getStats().totalActive).toBe(4);

      service.forceCleanAll();

      expect(service.getStats().totalActive).toBe(0);
      expect(service.getActiveIds(StateCategory.TASK)).toEqual([]);
      expect(service.getActiveIds(StateCategory.WORKFLOW)).toEqual([]);
      expect(service.getActiveIds(StateCategory.REVISION)).toEqual([]);
    });
  });

  describe("clearCategory() - clears only specified category", () => {
    it("should clear only the specified category", () => {
      service.start(StateCategory.TASK, "task-1");
      service.start(StateCategory.TASK, "task-2");
      service.start(StateCategory.WORKFLOW, "workflow-1");

      service.clearCategory(StateCategory.TASK);

      expect(service.getActiveIds(StateCategory.TASK)).toEqual([]);
      expect(service.getActiveIds(StateCategory.WORKFLOW)).toHaveLength(1);
    });

    it("should be no-op for non-existent category", () => {
      expect(() => {
        service.clearCategory("non-existent" as StateCategory);
      }).not.toThrow();
    });
  });

  describe("configure() - updates TTL and cleanup interval", () => {
    it("should update TTL", () => {
      const newConfig: ExecutionStateConfig = {
        ttlMs: 60000,
      };

      service.configure(newConfig);

      const stats = service.getStats();
      expect(stats.config.ttlMs).toBe(60000);
    });

    it("should update cleanup interval", () => {
      const newConfig: ExecutionStateConfig = {
        cleanupIntervalMs: 120000,
      };

      service.configure(newConfig);

      const stats = service.getStats();
      expect(stats.config.cleanupIntervalMs).toBe(120000);
    });

    it("should enable/disable auto cleanup", () => {
      service.configure({ enableAutoCleanup: false });
      // If cleanup is disabled, the cleanup timer won't run
      // This is mainly tested through integration
      expect(() =>
        service.configure({ enableAutoCleanup: true }),
      ).not.toThrow();
    });

    it("should update multiple config values", () => {
      service.configure({
        ttlMs: 120000,
        cleanupIntervalMs: 180000,
      });

      const stats = service.getStats();
      expect(stats.config.ttlMs).toBe(120000);
      expect(stats.config.cleanupIntervalMs).toBe(180000);
    });
  });

  describe("Redis dual-write - with CacheService", () => {
    it("should call cacheService.set() on start", () => {
      service.start(StateCategory.TASK, "task-1", "Test task");

      expect(mockCacheService.set).toHaveBeenCalledWith(
        "ai:state:task:task-1",
        expect.objectContaining({
          startTime: expect.any(Number),
          description: "Test task",
        }),
        expect.any(Number), // TTL in seconds
      );
    });

    it("should call cacheService.del() on finish", () => {
      service.start(StateCategory.TASK, "task-1");
      mockCacheService.set.mockClear();

      service.finish(StateCategory.TASK, "task-1");

      expect(mockCacheService.del).toHaveBeenCalledWith("ai:state:task:task-1");
    });

    it("should calculate correct Redis TTL", () => {
      service.start(StateCategory.TASK, "task-1");

      const expectedTtlSeconds = Math.ceil((30 * 60 * 1000) / 1000); // 30 minutes in seconds
      expect(mockCacheService.set).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(Object),
        expectedTtlSeconds,
      );
    });
  });

  describe("Redis dual-write - without CacheService", () => {
    beforeEach(async () => {
      const module: TestingModule = await Test.createTestingModule({
        providers: [ExecutionStateManager],
      }).compile();

      service = module.get<ExecutionStateManager>(ExecutionStateManager);

      jest.spyOn(Logger.prototype, "log").mockImplementation();
      jest.spyOn(Logger.prototype, "warn").mockImplementation();
      jest.spyOn(Logger.prototype, "debug").mockImplementation();
    });

    it("should work in-memory only when CacheService is null", () => {
      const result = service.start(StateCategory.TASK, "task-1");
      expect(result).toBe(true);
      expect(service.isActive(StateCategory.TASK, "task-1")).toBe(true);

      service.finish(StateCategory.TASK, "task-1");
      expect(service.isActive(StateCategory.TASK, "task-1")).toBe(false);
    });

    it("should not throw errors when CacheService is null", () => {
      expect(() => {
        service.start(StateCategory.TASK, "task-1");
        service.finish(StateCategory.TASK, "task-1");
      }).not.toThrow();
    });
  });

  describe("getActiveStates() - returns all states", () => {
    it("should return all active states for a category", () => {
      service.start(StateCategory.TASK, "task-1", "First");
      service.start(StateCategory.TASK, "task-2", "Second");

      const states = service.getActiveStates(StateCategory.TASK);
      expect(states).toBeDefined();
      expect(states?.size).toBe(2);
      expect(states?.get("task-1")?.description).toBe("First");
      expect(states?.get("task-2")?.description).toBe("Second");
    });

    it("should return undefined for non-existent category", () => {
      const states = service.getActiveStates(StateCategory.TASK);
      expect(states).toBeUndefined();
    });
  });

  describe("legacy compatibility methods", () => {
    it("should support getExecutingTaskIds()", () => {
      service.startTask("task-1");
      service.startTask("task-2");

      const ids = service.getExecutingTaskIds();
      expect(ids).toHaveLength(2);
      expect(ids).toContain("task-1");
      expect(ids).toContain("task-2");
    });

    it("should support getExecutingMissionIds()", () => {
      service.startWorkflow("mission-1");
      service.startWorkflow("mission-2");

      const ids = service.getExecutingMissionIds();
      expect(ids).toHaveLength(2);
      expect(ids).toContain("mission-1");
      expect(ids).toContain("mission-2");
    });

    it("should support revision methods", () => {
      expect(service.startRevision("rev-1")).toBe(true);
      expect(service.isRevisionInProgress("rev-1")).toBe(true);

      service.finishRevision("rev-1");
      expect(service.isRevisionInProgress("rev-1")).toBe(false);

      const ids = service.getRevisingTaskIds();
      expect(ids).toEqual([]);
    });
  });

  describe("triggerCleanup() - manual cleanup", () => {
    it("should return before and after stats", () => {
      service.start(StateCategory.TASK, "task-1");
      jest.advanceTimersByTime(31 * 60 * 1000);

      const result = service.triggerCleanup();

      expect(result.before.totalActive).toBe(1);
      expect(result.after.totalActive).toBe(0);
    });
  });
});
