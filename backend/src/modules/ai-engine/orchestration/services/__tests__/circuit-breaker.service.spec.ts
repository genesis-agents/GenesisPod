/**
 * CircuitBreakerService Unit Tests
 * 熔断器服务测试
 */

import { Test, TestingModule } from "@nestjs/testing";
import { Logger } from "@nestjs/common";
import {
  CircuitBreakerService,
  TaskCompletionType,
  CircuitState as _CircuitState,
} from "../../../../ai-engine/facade";

describe("CircuitBreakerService", () => {
  let service: CircuitBreakerService;

  beforeEach(async () => {
    jest.useFakeTimers();

    const module: TestingModule = await Test.createTestingModule({
      providers: [CircuitBreakerService],
    }).compile();

    service = module.get<CircuitBreakerService>(CircuitBreakerService);

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

  describe("initialization and configuration", () => {
    it("should initialize with default config", () => {
      const stats = service.getStats();
      expect(stats.config.failureThreshold).toBe(3);
      expect(stats.config.defaultCooldownMs).toBe(3 * 60 * 1000);
      expect(stats.config.rateLimitCooldownMs).toBe(5 * 60 * 1000);
      expect(stats.config.halfOpenSuccessThreshold).toBe(2);
      expect(stats.config.inactiveTtlMs).toBe(24 * 60 * 60 * 1000);
      expect(stats.config.maxResponseSamples).toBe(20);
    });

    it("should allow configuration override", () => {
      service.configure({
        failureThreshold: 5,
        defaultCooldownMs: 60000,
      });

      const stats = service.getStats();
      expect(stats.config.failureThreshold).toBe(5);
      expect(stats.config.defaultCooldownMs).toBe(60000);
    });
  });

  describe("circuit state transitions: CLOSED → OPEN → HALF_OPEN", () => {
    it("should start in CLOSED state and allow execution", () => {
      const entityId = "entity-1";
      expect(service.isAvailable(entityId)).toBe(true);

      const metrics = service.getHealthMetrics(entityId);
      expect(metrics.state).toBe("CLOSED");
      expect(metrics.isAvailable).toBe(true);
    });

    it("should transition CLOSED → OPEN after 3 consecutive failures", () => {
      const entityId = "entity-1";

      // First failure
      service.recordFailure(entityId, TaskCompletionType.API_ERROR);
      expect(service.isAvailable(entityId)).toBe(true);
      expect(service.getHealthMetrics(entityId).state).toBe("CLOSED");

      // Second failure
      service.recordFailure(entityId, TaskCompletionType.API_ERROR);
      expect(service.isAvailable(entityId)).toBe(true);
      expect(service.getHealthMetrics(entityId).state).toBe("CLOSED");

      // Third failure - should trigger OPEN state
      service.recordFailure(entityId, TaskCompletionType.API_ERROR);
      expect(service.isAvailable(entityId)).toBe(false);
      expect(service.getHealthMetrics(entityId).state).toBe("OPEN");
    });

    it("should transition OPEN → HALF_OPEN after cooldown period", () => {
      const entityId = "entity-1";

      // Trigger OPEN state
      service.recordFailure(entityId, TaskCompletionType.API_ERROR);
      service.recordFailure(entityId, TaskCompletionType.API_ERROR);
      service.recordFailure(entityId, TaskCompletionType.API_ERROR);

      expect(service.isAvailable(entityId)).toBe(false);
      expect(service.getHealthMetrics(entityId).state).toBe("OPEN");

      // Advance time past cooldown (3 minutes)
      jest.advanceTimersByTime(3 * 60 * 1000 + 1000);

      expect(service.isAvailable(entityId)).toBe(true);
      expect(service.getHealthMetrics(entityId).state).toBe("HALF_OPEN");
    });

    it("should transition HALF_OPEN → CLOSED after 2 consecutive successes", () => {
      const entityId = "entity-1";

      // Trigger OPEN state
      service.recordFailure(entityId, TaskCompletionType.API_ERROR);
      service.recordFailure(entityId, TaskCompletionType.API_ERROR);
      service.recordFailure(entityId, TaskCompletionType.API_ERROR);

      // Advance to HALF_OPEN
      jest.advanceTimersByTime(3 * 60 * 1000 + 1000);
      expect(service.getHealthMetrics(entityId).state).toBe("HALF_OPEN");

      // First success
      service.recordSuccess(entityId);
      expect(service.getHealthMetrics(entityId).state).toBe("HALF_OPEN");

      // Second success - should close circuit
      service.recordSuccess(entityId);
      expect(service.getHealthMetrics(entityId).state).toBe("CLOSED");
      expect(service.isAvailable(entityId)).toBe(true);
    });

    it("should transition HALF_OPEN → OPEN on failure", () => {
      const entityId = "entity-1";

      // Trigger OPEN state
      service.recordFailure(entityId, TaskCompletionType.API_ERROR);
      service.recordFailure(entityId, TaskCompletionType.API_ERROR);
      service.recordFailure(entityId, TaskCompletionType.API_ERROR);

      // Advance to HALF_OPEN
      jest.advanceTimersByTime(3 * 60 * 1000 + 1000);
      expect(service.getHealthMetrics(entityId).state).toBe("HALF_OPEN");

      // Failure in HALF_OPEN should re-open circuit
      service.recordFailure(entityId, TaskCompletionType.API_ERROR);
      expect(service.getHealthMetrics(entityId).state).toBe("OPEN");
      expect(service.isAvailable(entityId)).toBe(false);
    });
  });

  describe("recordExecution() and different error types", () => {
    it("should record SUCCESS and reset failure count", () => {
      const entityId = "entity-1";

      service.recordFailure(entityId, TaskCompletionType.API_ERROR);
      service.recordFailure(entityId, TaskCompletionType.API_ERROR);

      const metricsBefore = service.getHealthMetrics(entityId);
      expect(metricsBefore.successRate).toBeLessThan(1.0);

      service.recordSuccess(entityId, 100);

      const metricsAfter = service.getHealthMetrics(entityId);
      expect(metricsAfter.isAvailable).toBe(true);
      expect(metricsAfter.avgResponseTime).toBe(100);
    });

    it("should handle API_ERROR with threshold", () => {
      const entityId = "entity-1";

      service.recordFailure(
        entityId,
        TaskCompletionType.API_ERROR,
        "500 error",
      );
      service.recordFailure(
        entityId,
        TaskCompletionType.API_ERROR,
        "500 error",
      );
      expect(service.isAvailable(entityId)).toBe(true);

      service.recordFailure(
        entityId,
        TaskCompletionType.API_ERROR,
        "500 error",
      );
      expect(service.isAvailable(entityId)).toBe(false);
      expect(service.getCooldownRemaining(entityId)).toBeGreaterThan(0);
    });

    it("should immediately open circuit on RATE_LIMITED with longer cooldown", () => {
      const entityId = "entity-1";

      service.recordFailure(
        entityId,
        TaskCompletionType.RATE_LIMITED,
        "429 rate limit",
      );

      const metrics = service.getHealthMetrics(entityId);
      expect(metrics.state).toBe("OPEN");
      expect(metrics.isAvailable).toBe(false);
      expect(metrics.rateLimitHits).toBe(1);

      // Should have 5-minute cooldown, not 3-minute
      const cooldown = service.getCooldownRemaining(entityId);
      expect(cooldown).toBeGreaterThan(4 * 60 * 1000); // > 4 minutes
      expect(cooldown).toBeLessThanOrEqual(5 * 60 * 1000); // <= 5 minutes
    });

    it("should handle TIMEOUT errors", () => {
      const entityId = "entity-1";

      service.recordFailure(entityId, TaskCompletionType.TIMEOUT);
      service.recordFailure(entityId, TaskCompletionType.TIMEOUT);
      service.recordFailure(entityId, TaskCompletionType.TIMEOUT);

      expect(service.isAvailable(entityId)).toBe(false);
      expect(service.getHealthMetrics(entityId).state).toBe("OPEN");
    });

    it("should immediately open circuit on CONTEXT_OVERFLOW with 2x cooldown", () => {
      const entityId = "entity-1";

      service.recordFailure(
        entityId,
        TaskCompletionType.CONTEXT_OVERFLOW,
        "token limit exceeded",
      );

      const metrics = service.getHealthMetrics(entityId);
      expect(metrics.state).toBe("OPEN");
      expect(metrics.isAvailable).toBe(false);

      // Should have 6-minute cooldown (2x default)
      const cooldown = service.getCooldownRemaining(entityId);
      expect(cooldown).toBeGreaterThan(5 * 60 * 1000);
    });

    it("should immediately open circuit on AUTH_ERROR with 2x cooldown", () => {
      const entityId = "entity-1";

      service.recordFailure(
        entityId,
        TaskCompletionType.AUTH_ERROR,
        "401 unauthorized",
      );

      const metrics = service.getHealthMetrics(entityId);
      expect(metrics.state).toBe("OPEN");
      expect(metrics.isAvailable).toBe(false);

      const cooldown = service.getCooldownRemaining(entityId);
      expect(cooldown).toBeGreaterThan(5 * 60 * 1000);
    });

    it("should use recordExecution() unified interface", () => {
      const entityId = "entity-1";

      service.recordExecution(entityId, true, 150);
      expect(service.getHealthMetrics(entityId).avgResponseTime).toBe(150);

      service.recordExecution(
        entityId,
        false,
        undefined,
        TaskCompletionType.API_ERROR,
        "error",
      );
      expect(service.getHealthMetrics(entityId).successRate).toBe(0.5);
    });
  });

  describe("health metrics calculation", () => {
    it("should calculate success rate correctly", () => {
      const entityId = "entity-1";

      service.recordSuccess(entityId);
      service.recordSuccess(entityId);
      service.recordSuccess(entityId);
      service.recordFailure(entityId, TaskCompletionType.API_ERROR);

      const metrics = service.getHealthMetrics(entityId);
      expect(metrics.successRate).toBe(0.75); // 3/4
    });

    it("should calculate average response time from samples", () => {
      const entityId = "entity-1";

      service.recordSuccess(entityId, 100);
      service.recordSuccess(entityId, 200);
      service.recordSuccess(entityId, 300);

      const metrics = service.getHealthMetrics(entityId);
      expect(metrics.avgResponseTime).toBe(200); // (100+200+300)/3
    });

    it("should track rate limit hits", () => {
      const entityId = "entity-1";

      service.recordFailure(entityId, TaskCompletionType.RATE_LIMITED);
      jest.advanceTimersByTime(5 * 60 * 1000 + 1000);

      service.recordFailure(entityId, TaskCompletionType.RATE_LIMITED);

      const metrics = service.getHealthMetrics(entityId);
      expect(metrics.rateLimitHits).toBe(2);
    });

    it("should track current load", () => {
      const entityId = "entity-1";

      service.incrementLoad(entityId);
      service.incrementLoad(entityId);
      service.incrementLoad(entityId);

      let metrics = service.getHealthMetrics(entityId);
      expect(metrics.currentLoad).toBe(3);

      service.decrementLoad(entityId);
      metrics = service.getHealthMetrics(entityId);
      expect(metrics.currentLoad).toBe(2);

      // Should not go negative
      service.decrementLoad(entityId);
      service.decrementLoad(entityId);
      service.decrementLoad(entityId);
      metrics = service.getHealthMetrics(entityId);
      expect(metrics.currentLoad).toBe(0);
    });

    it("should return default metrics for unknown entity", () => {
      const metrics = service.getHealthMetrics("unknown-entity");

      expect(metrics.successRate).toBe(1.0);
      expect(metrics.avgResponseTime).toBe(0);
      expect(metrics.rateLimitHits).toBe(0);
      expect(metrics.currentLoad).toBe(0);
      expect(metrics.isAvailable).toBe(true);
      expect(metrics.state).toBe("CLOSED");
    });

    it("should get all health metrics", () => {
      service.recordSuccess("entity-1");
      service.recordSuccess("entity-2");
      service.recordFailure("entity-3", TaskCompletionType.API_ERROR);

      const allMetrics = service.getAllHealthMetrics();
      expect(allMetrics).toHaveLength(3);
      expect(allMetrics.map((m) => m.entityId)).toContain("entity-1");
      expect(allMetrics.map((m) => m.entityId)).toContain("entity-2");
      expect(allMetrics.map((m) => m.entityId)).toContain("entity-3");
    });
  });

  describe("selectBest() load balancing", () => {
    it("should select from available entities only", () => {
      // Entity 1: healthy
      service.recordSuccess("entity-1");

      // Entity 2: circuit open
      service.recordFailure("entity-2", TaskCompletionType.API_ERROR);
      service.recordFailure("entity-2", TaskCompletionType.API_ERROR);
      service.recordFailure("entity-2", TaskCompletionType.API_ERROR);

      // Entity 3: healthy
      service.recordSuccess("entity-3");

      const selected = service.selectBest(["entity-1", "entity-2", "entity-3"]);
      expect(selected).not.toBe("entity-2");
      expect(["entity-1", "entity-3"]).toContain(selected);
    });

    it("should prefer entity with higher success rate", () => {
      // Entity 1: 100% success rate
      service.recordSuccess("entity-1");
      service.recordSuccess("entity-1");

      // Entity 2: 50% success rate
      service.recordSuccess("entity-2");
      service.recordFailure("entity-2", TaskCompletionType.API_ERROR);

      const selected = service.selectBest(["entity-1", "entity-2"]);
      expect(selected).toBe("entity-1");
    });

    it("should prefer entity with lower load", () => {
      // Entity 1: high load
      service.recordSuccess("entity-1");
      service.incrementLoad("entity-1");
      service.incrementLoad("entity-1");
      service.incrementLoad("entity-1");
      service.incrementLoad("entity-1");
      service.incrementLoad("entity-1");

      // Entity 2: low load
      service.recordSuccess("entity-2");
      service.incrementLoad("entity-2");

      const selected = service.selectBest(["entity-1", "entity-2"]);
      expect(selected).toBe("entity-2");
    });

    it("should return null if no entities available", () => {
      service.recordFailure("entity-1", TaskCompletionType.API_ERROR);
      service.recordFailure("entity-1", TaskCompletionType.API_ERROR);
      service.recordFailure("entity-1", TaskCompletionType.API_ERROR);

      const selected = service.selectBest(["entity-1"]);
      expect(selected).toBeNull();
    });

    it("should return null for empty entity list", () => {
      const selected = service.selectBest([]);
      expect(selected).toBeNull();
    });
  });

  describe("response time sampling with sliding window", () => {
    it("should maintain sliding window of max 20 samples", () => {
      const entityId = "entity-1";

      // Record 25 samples
      for (let i = 1; i <= 25; i++) {
        service.recordSuccess(entityId, i * 10);
      }

      const metrics = service.getHealthMetrics(entityId);

      // Should only keep last 20 samples (60-250)
      // Average = (60+70+80+...+250) / 20 = 155
      expect(metrics.avgResponseTime).toBe(155);
    });

    it("should handle response time recording", () => {
      const entityId = "entity-1";

      service.recordSuccess(entityId, 100);
      service.recordSuccess(entityId, 200);

      const metrics = service.getHealthMetrics(entityId);
      expect(metrics.avgResponseTime).toBe(150);
    });
  });

  describe("parseErrorType() error classification", () => {
    it("should detect RATE_LIMITED from error messages", () => {
      expect(service.parseErrorType("rate limit exceeded")).toBe(
        TaskCompletionType.RATE_LIMITED,
      );
      expect(service.parseErrorType("HTTP 429 too many requests")).toBe(
        TaskCompletionType.RATE_LIMITED,
      );
      expect(service.parseErrorType("quota exceeded")).toBe(
        TaskCompletionType.RATE_LIMITED,
      );
    });

    it("should detect TIMEOUT from error messages", () => {
      expect(service.parseErrorType("request timeout")).toBe(
        TaskCompletionType.TIMEOUT,
      );
      expect(service.parseErrorType("connection timed out")).toBe(
        TaskCompletionType.TIMEOUT,
      );
      expect(service.parseErrorType("ETIMEDOUT")).toBe(
        TaskCompletionType.TIMEOUT,
      );
    });

    it("should detect CONTEXT_OVERFLOW from error messages", () => {
      expect(service.parseErrorType("context length exceeded")).toBe(
        TaskCompletionType.CONTEXT_OVERFLOW,
      );
      expect(service.parseErrorType("token limit exceeded")).toBe(
        TaskCompletionType.CONTEXT_OVERFLOW,
      );
      expect(service.parseErrorType("input too large")).toBe(
        TaskCompletionType.CONTEXT_OVERFLOW,
      );
    });

    it("should detect AUTH_ERROR from error messages", () => {
      expect(service.parseErrorType("authentication failed")).toBe(
        TaskCompletionType.AUTH_ERROR,
      );
      expect(service.parseErrorType("invalid api key")).toBe(
        TaskCompletionType.AUTH_ERROR,
      );
      expect(service.parseErrorType("HTTP 401 unauthorized")).toBe(
        TaskCompletionType.AUTH_ERROR,
      );
      expect(service.parseErrorType("403 forbidden")).toBe(
        TaskCompletionType.AUTH_ERROR,
      );
    });

    it("should default to API_ERROR for unknown errors", () => {
      expect(service.parseErrorType("unknown error")).toBe(
        TaskCompletionType.API_ERROR,
      );
      expect(service.parseErrorType("")).toBe(TaskCompletionType.API_ERROR);
    });
  });

  describe("cleanup of inactive entities", () => {
    it("should remove inactive entities after TTL via cleanup scheduler", () => {
      const entityId = "entity-1";

      // Initialize the service to start the cleanup scheduler
      void service.onModuleInit();

      service.recordSuccess(entityId);

      let stats = service.getStats();
      expect(stats.totalBreakers).toBe(1);

      // Advance time by 25 hours (past 24-hour TTL)
      // The cleanup interval runs every hour, so advancing 25 hours should trigger it
      jest.advanceTimersByTime(25 * 60 * 60 * 1000);

      stats = service.getStats();
      expect(stats.totalBreakers).toBe(0);
    });

    it("should not remove active entities", () => {
      const entityId = "entity-1";
      service.recordSuccess(entityId);

      // Advance 12 hours
      jest.advanceTimersByTime(12 * 60 * 60 * 1000);

      // Record activity
      service.recordSuccess(entityId);

      // Advance another 12 hours
      jest.advanceTimersByTime(12 * 60 * 60 * 1000);

      const stats = service.getStats();
      expect(stats.totalBreakers).toBe(1);
    });

    it("should track oldest breaker age", () => {
      service.recordSuccess("entity-1");

      jest.advanceTimersByTime(60 * 60 * 1000); // 1 hour

      service.recordSuccess("entity-2");

      const stats = service.getStats();
      expect(stats.oldestBreakerAge).toBeGreaterThanOrEqual(60 * 60 * 1000);
    });
  });

  describe("reset operations", () => {
    it("should reset single entity", () => {
      service.recordSuccess("entity-1");
      service.recordSuccess("entity-2");
      service.incrementLoad("entity-1");

      service.reset("entity-1");

      const stats = service.getStats();
      expect(stats.totalBreakers).toBe(1);

      const metrics1 = service.getHealthMetrics("entity-1");
      expect(metrics1.successRate).toBe(1.0); // Reset to default
      expect(metrics1.currentLoad).toBe(0);

      const metrics2 = service.getHealthMetrics("entity-2");
      expect(metrics2.successRate).toBe(1.0); // Still exists
    });

    it("should reset all entities", () => {
      service.recordSuccess("entity-1");
      service.recordSuccess("entity-2");
      service.recordSuccess("entity-3");
      service.incrementLoad("entity-1");
      service.incrementLoad("entity-2");

      service.resetAll();

      const stats = service.getStats();
      expect(stats.totalBreakers).toBe(0);
      expect(service.getAllHealthMetrics()).toHaveLength(0);
    });
  });

  describe("getCooldownRemaining()", () => {
    it("should return 0 for entity not in cooldown", () => {
      const remaining = service.getCooldownRemaining("entity-1");
      expect(remaining).toBe(0);
    });

    it("should return remaining cooldown time", () => {
      const entityId = "entity-1";

      // Trigger circuit open
      service.recordFailure(entityId, TaskCompletionType.API_ERROR);
      service.recordFailure(entityId, TaskCompletionType.API_ERROR);
      service.recordFailure(entityId, TaskCompletionType.API_ERROR);

      const remaining1 = service.getCooldownRemaining(entityId);
      expect(remaining1).toBeGreaterThan(2 * 60 * 1000);
      expect(remaining1).toBeLessThanOrEqual(3 * 60 * 1000);

      // Advance 1 minute
      jest.advanceTimersByTime(60 * 1000);

      const remaining2 = service.getCooldownRemaining(entityId);
      expect(remaining2).toBeGreaterThan(1 * 60 * 1000);
      expect(remaining2).toBeLessThanOrEqual(2 * 60 * 1000);
    });

    it("should return 0 after cooldown expires", () => {
      const entityId = "entity-1";

      service.recordFailure(entityId, TaskCompletionType.API_ERROR);
      service.recordFailure(entityId, TaskCompletionType.API_ERROR);
      service.recordFailure(entityId, TaskCompletionType.API_ERROR);

      jest.advanceTimersByTime(3 * 60 * 1000 + 1000);

      const remaining = service.getCooldownRemaining(entityId);
      expect(remaining).toBe(0);
    });
  });

  describe("edge cases and error handling", () => {
    it("should handle success recording without response time", () => {
      const entityId = "entity-1";
      service.recordSuccess(entityId);

      const metrics = service.getHealthMetrics(entityId);
      expect(metrics.avgResponseTime).toBe(0);
    });

    it("should handle recordFailure without error message", () => {
      const entityId = "entity-1";
      service.recordFailure(entityId, TaskCompletionType.API_ERROR);

      expect(service.isAvailable(entityId)).toBe(true);
    });

    it("should handle multiple rate limits correctly", () => {
      const entityId = "entity-1";

      service.recordFailure(entityId, TaskCompletionType.RATE_LIMITED);
      expect(service.getHealthMetrics(entityId).rateLimitHits).toBe(1);

      // Wait for cooldown
      jest.advanceTimersByTime(5 * 60 * 1000 + 1000);

      // Another rate limit
      service.recordFailure(entityId, TaskCompletionType.RATE_LIMITED);
      expect(service.getHealthMetrics(entityId).rateLimitHits).toBe(2);
    });

    it("should handle canExecute() alias correctly", () => {
      const entityId = "entity-1";

      expect(service.canExecute(entityId)).toBe(service.isAvailable(entityId));

      service.recordFailure(entityId, TaskCompletionType.API_ERROR);
      service.recordFailure(entityId, TaskCompletionType.API_ERROR);
      service.recordFailure(entityId, TaskCompletionType.API_ERROR);

      expect(service.canExecute(entityId)).toBe(service.isAvailable(entityId));
      expect(service.canExecute(entityId)).toBe(false);
    });
  });
});
