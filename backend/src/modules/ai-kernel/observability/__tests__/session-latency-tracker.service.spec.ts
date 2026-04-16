/**
 * SessionLatencyTrackerService Unit Tests
 *
 * Covers:
 * - Session lifecycle (startSession / endSession)
 * - Phase management (startPhase / endPhase / endPhaseByName)
 * - Checkpoints
 * - LLM call recording + throughput calculation
 * - Summary computation (TTFT stats, percentiles, phase breakdown, llmTimePercent)
 * - Auto-close of open phases on endSession
 * - Error / graceful-handling paths (invalid sessionId)
 * - getActivePhaseId
 * - DB persistence via PrismaService (mock)
 * - DB persistence failure (graceful)
 * - listSessions / getLatestSummary query methods
 * - LRU eviction behaviour
 */

import { Test, TestingModule } from "@nestjs/testing";
import { Logger } from "@nestjs/common";
import { PrismaService } from "@/common/prisma/prisma.service";
import { SessionLatencyTrackerService } from "../session-latency-tracker.service";
import type { RecordLLMLatencyInput } from "../session-latency.types";

// ---------------------------------------------------------------------------
// Suppress Logger output during tests
// ---------------------------------------------------------------------------
jest.spyOn(Logger.prototype, "log").mockImplementation();
jest.spyOn(Logger.prototype, "debug").mockImplementation();
jest.spyOn(Logger.prototype, "warn").mockImplementation();
jest.spyOn(Logger.prototype, "error").mockImplementation();

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function buildMockPrisma() {
  return {
    latencySession: {
      create: jest.fn().mockResolvedValue({}),
      findMany: jest.fn().mockResolvedValue([]),
      findFirst: jest.fn().mockResolvedValue(null),
    },
  };
}

/** Build a minimal streaming LLM call input */
function streamingCall(
  overrides: Partial<RecordLLMLatencyInput> = {},
): RecordLLMLatencyInput {
  return {
    model: "gpt-4o",
    provider: "openai",
    streaming: true,
    ttftMs: 300,
    ttltMs: 3000,
    totalDurationMs: 3000,
    inputTokens: 200,
    outputTokens: 400,
    ...overrides,
  };
}

/** Build a minimal non-streaming LLM call input */
function nonStreamingCall(
  overrides: Partial<RecordLLMLatencyInput> = {},
): RecordLLMLatencyInput {
  return {
    model: "claude-3",
    provider: "anthropic",
    streaming: false,
    totalDurationMs: 2000,
    inputTokens: 100,
    outputTokens: 200,
    ttltMs: 2000,
    ...overrides,
  };
}

/** Small delay to guarantee a measurable wall-clock duration */
function wait(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

// ===========================================================================
// Suite A – No Prisma (pure in-memory)
// ===========================================================================

describe("SessionLatencyTrackerService (no Prisma)", () => {
  let service: SessionLatencyTrackerService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [SessionLatencyTrackerService],
    }).compile();

    service = module.get<SessionLatencyTrackerService>(
      SessionLatencyTrackerService,
    );
  });

  afterEach(() => jest.clearAllMocks());

  // =========================================================================
  // 1. Session lifecycle
  // =========================================================================

  describe("Session lifecycle", () => {
    it("should start a session and return a non-empty string ID", () => {
      // Arrange / Act
      const sessionId = service.startSession({ type: "ai_ask" });

      // Assert
      expect(typeof sessionId).toBe("string");
      expect(sessionId.length).toBeGreaterThan(0);
    });

    it("should be retrievable via getSession immediately after start", () => {
      const sessionId = service.startSession({
        type: "research_mission",
        entityId: "entity-42",
        userId: "user-1",
        metadata: { key: "value" },
      });

      const session = service.getSession(sessionId);

      expect(session).toBeDefined();
      expect(session!.id).toBe(sessionId);
      expect(session!.type).toBe("research_mission");
      expect(session!.entityId).toBe("entity-42");
      expect(session!.userId).toBe("user-1");
      expect(session!.metadata).toEqual({ key: "value" });
      expect(session!.status).toBe("running");
      expect(session!.phases).toHaveLength(0);
      expect(session!.llmCalls).toHaveLength(0);
    });

    it("should return a summary with correct fields on endSession", async () => {
      // Arrange
      const sessionId = service.startSession({ type: "ai_ask" });
      await wait(5); // ensure measurable totalDurationMs

      // Act
      const summary = service.endSession(sessionId);

      // Assert
      expect(summary).toBeDefined();
      expect(summary!.sessionId).toBe(sessionId);
      expect(summary!.type).toBe("ai_ask");
      expect(summary!.status).toBe("completed");
      expect(summary!.totalDurationMs).toBeGreaterThanOrEqual(0);
      expect(summary!.llmCallCount).toBe(0);
      expect(summary!.llmTotalTimeMs).toBe(0);
      expect(summary!.phases).toHaveLength(0);
    });

    it("should mark session as failed when status=failed is passed", () => {
      // Arrange
      const sessionId = service.startSession({ type: "team_execution" });

      // Act
      const summary = service.endSession(sessionId, "failed");

      // Assert
      expect(summary!.status).toBe("failed");
    });

    it("startSession generates unique IDs each time", () => {
      const id1 = service.startSession({ type: "ai_ask" });
      const id2 = service.startSession({ type: "ai_ask" });

      expect(id1).not.toBe(id2);
    });
  });

  // =========================================================================
  // 2. Multiple sequential phases
  // =========================================================================

  describe("Multiple sequential phases", () => {
    it("should collect all top-level phases in summary with correct names", async () => {
      // Arrange
      const sessionId = service.startSession({
        type: "topic_insights_refresh",
      });

      const phase1Id = service.startPhase(sessionId, { name: "planning" });
      await wait(5);
      service.endPhase(sessionId, phase1Id);

      const phase2Id = service.startPhase(sessionId, { name: "execution" });
      await wait(5);
      service.endPhase(sessionId, phase2Id);

      const phase3Id = service.startPhase(sessionId, { name: "formatting" });
      await wait(5);
      service.endPhase(sessionId, phase3Id);

      // Act
      const summary = service.endSession(sessionId);

      // Assert
      expect(summary!.phases).toHaveLength(3);
      const names = summary!.phases.map((p) => p.name);
      expect(names).toContain("planning");
      expect(names).toContain("execution");
      expect(names).toContain("formatting");
    });

    it("should compute positive durationMs for each phase", async () => {
      const sessionId = service.startSession({ type: "ai_writing" });

      const phaseId = service.startPhase(sessionId, { name: "draft" });
      await wait(5);
      service.endPhase(sessionId, phaseId);

      const summary = service.endSession(sessionId);
      const draftPhase = summary!.phases.find((p) => p.name === "draft");

      expect(draftPhase!.durationMs).toBeGreaterThan(0);
    });

    it("should compute percentOfTotal that sums to ≤ 100 for sequential phases", async () => {
      const sessionId = service.startSession({ type: "ai_ask" });

      const p1 = service.startPhase(sessionId, { name: "p1" });
      await wait(5);
      service.endPhase(sessionId, p1);

      const p2 = service.startPhase(sessionId, { name: "p2" });
      await wait(5);
      service.endPhase(sessionId, p2);

      const summary = service.endSession(sessionId);

      const total = summary!.phases.reduce(
        (acc, p) => acc + p.percentOfTotal,
        0,
      );
      // Sequential phases: sum should be ≤ 100% (can be slightly less due to overhead)
      expect(total).toBeLessThanOrEqual(100.1); // small float tolerance
      expect(total).toBeGreaterThan(0);
    });
  });

  // =========================================================================
  // 3. Parallel phases
  // =========================================================================

  describe("Parallel phases", () => {
    it("should record parallel flag and parallelCount in phase metadata", () => {
      const sessionId = service.startSession({ type: "team_execution" });

      const phaseId = service.startPhase(sessionId, {
        name: "parallel_research",
        parallel: true,
        parallelCount: 5,
      });

      const session = service.getSession(sessionId);
      const phase = session!.phases.find((p) => p.id === phaseId);

      expect(phase!.parallel).toBe(true);
      expect(phase!.parallelCount).toBe(5);
    });

    it("should include parallel phase in summary as a top-level phase", async () => {
      const sessionId = service.startSession({ type: "team_execution" });

      const phaseId = service.startPhase(sessionId, {
        name: "parallel_workers",
        parallel: true,
        parallelCount: 3,
      });
      await wait(5);
      service.endPhase(sessionId, phaseId);

      const summary = service.endSession(sessionId);

      expect(summary!.phases).toHaveLength(1);
      expect(summary!.phases[0].name).toBe("parallel_workers");
    });
  });

  // =========================================================================
  // 4. Nested phases (child phases excluded from top-level summary)
  // =========================================================================

  describe("Nested phases", () => {
    it("should exclude child phases from summary phases array", async () => {
      const sessionId = service.startSession({ type: "research_mission" });

      // Top-level parent
      const parentId = service.startPhase(sessionId, { name: "parent" });

      // Child phase referencing parent
      const childId = service.startPhase(sessionId, {
        name: "child",
        parentPhaseId: parentId,
      });
      await wait(5);
      service.endPhase(sessionId, childId);
      service.endPhase(sessionId, parentId);

      const summary = service.endSession(sessionId);

      // Only the parent (no parentPhaseId) should appear
      expect(summary!.phases).toHaveLength(1);
      expect(summary!.phases[0].name).toBe("parent");
    });

    it("should store parentPhaseId on the child phase object", () => {
      const sessionId = service.startSession({ type: "ai_ask" });

      const parentId = service.startPhase(sessionId, { name: "parent" });
      const childId = service.startPhase(sessionId, {
        name: "child",
        parentPhaseId: parentId,
      });

      const session = service.getSession(sessionId);
      const child = session!.phases.find((p) => p.id === childId);

      expect(child!.parentPhaseId).toBe(parentId);
    });

    it("should handle multiple nested children, all excluded from summary", async () => {
      const sessionId = service.startSession({ type: "ai_writing" });

      const parentId = service.startPhase(sessionId, { name: "root" });
      const child1 = service.startPhase(sessionId, {
        name: "child-a",
        parentPhaseId: parentId,
      });
      const child2 = service.startPhase(sessionId, {
        name: "child-b",
        parentPhaseId: parentId,
      });
      await wait(5);
      service.endPhase(sessionId, child1);
      service.endPhase(sessionId, child2);
      service.endPhase(sessionId, parentId);

      const summary = service.endSession(sessionId);

      expect(summary!.phases).toHaveLength(1);
      expect(summary!.phases[0].name).toBe("root");
    });
  });

  // =========================================================================
  // 5. LLM call recording – 10 calls, aggregated stats
  // =========================================================================

  describe("LLM call recording – aggregated stats", () => {
    it("should count 10 recorded calls", () => {
      const sessionId = service.startSession({ type: "ai_ask" });

      for (let i = 0; i < 10; i++) {
        service.recordLLMCall(
          sessionId,
          streamingCall({ ttftMs: 100 + i * 50, ttltMs: 2000 + i * 100 }),
        );
      }

      const session = service.getSession(sessionId);
      expect(session!.llmCalls).toHaveLength(10);

      const summary = service.endSession(sessionId);
      expect(summary!.llmCallCount).toBe(10);
    });

    it("should compute TTFT avgMs correctly for known values", () => {
      // ttftMs values: 100, 200, 300 → avg = 200
      const sessionId = service.startSession({ type: "ai_ask" });

      [100, 200, 300].forEach((ttftMs) => {
        service.recordLLMCall(
          sessionId,
          streamingCall({
            ttftMs,
            ttltMs: ttftMs + 1000,
            totalDurationMs: ttftMs + 1000,
          }),
        );
      });

      const summary = service.endSession(sessionId);

      expect(summary!.ttft).toBeDefined();
      expect(summary!.ttft!.avgMs).toBe(200);
    });

    it("should compute TTFT p50Ms and p95Ms for 10 sorted values", () => {
      // ttftMs: 100..1000 in steps of 100 → sorted array
      // p50: ceil(50/100 * 10) - 1 = 5 - 1 = 4 → sorted[4] = 500
      // p95: ceil(95/100 * 10) - 1 = 10 - 1 = 9 → sorted[9] = 1000
      const sessionId = service.startSession({ type: "ai_ask" });

      for (let i = 1; i <= 10; i++) {
        service.recordLLMCall(
          sessionId,
          streamingCall({
            ttftMs: i * 100,
            ttltMs: i * 100 + 2000,
            totalDurationMs: i * 100 + 2000,
          }),
        );
      }

      const summary = service.endSession(sessionId);

      expect(summary!.ttft).toBeDefined();
      expect(summary!.ttft!.p50Ms).toBe(500);
      expect(summary!.ttft!.p95Ms).toBe(1000);
      expect(summary!.ttft!.minMs).toBe(100);
      expect(summary!.ttft!.maxMs).toBe(1000);
    });

    it("should compute tokenThroughputPerSec for streaming calls", () => {
      // ttftMs=200, ttltMs=5000 → generationTime=4800ms, outputTokens=500
      // throughput = 500/4.8 ≈ 104.2
      const sessionId = service.startSession({ type: "ai_ask" });

      service.recordLLMCall(sessionId, {
        model: "gpt-4o",
        provider: "openai",
        streaming: true,
        ttftMs: 200,
        ttltMs: 5000,
        totalDurationMs: 5000,
        inputTokens: 100,
        outputTokens: 500,
      });

      const session = service.getSession(sessionId);
      const record = session!.llmCalls[0];

      // 500 / 4.8 * rounding to 1dp
      expect(record.tokenThroughputPerSec).toBeCloseTo(104.2, 0);
    });

    it("should compute tokenThroughputPerSec for non-streaming calls", () => {
      // totalDurationMs=3000, outputTokens=300 → 300/3 = 100 tokens/sec
      const sessionId = service.startSession({ type: "ai_ask" });

      service.recordLLMCall(sessionId, {
        model: "claude-3",
        provider: "anthropic",
        streaming: false,
        ttltMs: 3000,
        totalDurationMs: 3000,
        inputTokens: 100,
        outputTokens: 300,
      });

      const session = service.getSession(sessionId);
      const record = session!.llmCalls[0];

      expect(record.tokenThroughputPerSec).toBe(100);
    });

    it("should compute llmTimePercent correctly", async () => {
      const sessionId = service.startSession({ type: "ai_ask" });

      // Record two non-streaming calls: 500ms + 500ms = 1000ms total LLM time
      service.recordLLMCall(
        sessionId,
        nonStreamingCall({ totalDurationMs: 500, ttltMs: 500 }),
      );
      service.recordLLMCall(
        sessionId,
        nonStreamingCall({ totalDurationMs: 500, ttltMs: 500 }),
      );

      const summary = service.endSession(sessionId);

      expect(summary!.llmTotalTimeMs).toBe(1000);
      // llmTimePercent = (1000 / totalDurationMs) * 100
      // can be > 100 for parallel calls, but ≥ 0 always
      expect(summary!.llmTimePercent).toBeGreaterThanOrEqual(0);
    });

    it("should aggregate totalInputTokens and totalOutputTokens", () => {
      const sessionId = service.startSession({ type: "ai_ask" });

      service.recordLLMCall(
        sessionId,
        streamingCall({ inputTokens: 100, outputTokens: 200 }),
      );
      service.recordLLMCall(
        sessionId,
        streamingCall({ inputTokens: 150, outputTokens: 250 }),
      );

      const summary = service.endSession(sessionId);

      expect(summary!.totalInputTokens).toBe(250);
      expect(summary!.totalOutputTokens).toBe(450);
    });

    it("should compute avgTokenThroughput as average of individual throughputs", () => {
      // Two non-streaming calls: 300 tokens / 3000ms = 100 t/s, 200/2000 = 100 t/s → avg 100
      const sessionId = service.startSession({ type: "ai_ask" });

      service.recordLLMCall(
        sessionId,
        nonStreamingCall({
          outputTokens: 300,
          totalDurationMs: 3000,
          ttltMs: 3000,
        }),
      );
      service.recordLLMCall(
        sessionId,
        nonStreamingCall({
          outputTokens: 200,
          totalDurationMs: 2000,
          ttltMs: 2000,
        }),
      );

      const summary = service.endSession(sessionId);

      expect(summary!.avgTokenThroughput).toBe(100);
    });
  });

  // =========================================================================
  // 6. Auto-close of open phases on endSession
  // =========================================================================

  describe("Auto-close of open phases", () => {
    it("should auto-close an unclosed phase when endSession is called", () => {
      const sessionId = service.startSession({ type: "ai_ask" });

      service.startPhase(sessionId, { name: "unclosed" });

      // End session without explicitly ending the phase
      const summary = service.endSession(sessionId);

      // Phase should appear in summary with a computed duration
      expect(summary!.phases).toHaveLength(1);
      expect(summary!.phases[0].durationMs).toBeGreaterThanOrEqual(0);
    });

    it("should auto-close multiple open phases", () => {
      const sessionId = service.startSession({ type: "ai_ask" });

      service.startPhase(sessionId, { name: "phase-a" });
      service.startPhase(sessionId, { name: "phase-b" });

      const summary = service.endSession(sessionId);

      expect(summary!.phases).toHaveLength(2);
    });
  });

  // =========================================================================
  // 7. Error path – session not found
  // =========================================================================

  describe("Invalid sessionId graceful handling", () => {
    it("endSession with unknown id returns undefined", () => {
      const result = service.endSession("nonexistent-id");
      expect(result).toBeUndefined();
    });

    it("startPhase with unknown sessionId returns empty string", () => {
      const phaseId = service.startPhase("nonexistent-id", { name: "x" });
      expect(phaseId).toBe("");
    });

    it("endPhase with unknown sessionId returns undefined", () => {
      const result = service.endPhase("nonexistent-id", "nonexistent-phase");
      expect(result).toBeUndefined();
    });

    it("recordLLMCall with unknown sessionId does not throw", () => {
      expect(() => {
        service.recordLLMCall("nonexistent-id", streamingCall());
      }).not.toThrow();
    });

    it("getActivePhaseId with unknown sessionId returns undefined", () => {
      const result = service.getActivePhaseId("nonexistent-id");
      expect(result).toBeUndefined();
    });

    it("endPhaseByName with unknown sessionId returns undefined", () => {
      const result = service.endPhaseByName("nonexistent-id", "x");
      expect(result).toBeUndefined();
    });
  });

  // =========================================================================
  // 8. Empty session (no phases, no LLM calls)
  // =========================================================================

  describe("Empty session", () => {
    it("should return a valid summary with zero counts", () => {
      const sessionId = service.startSession({ type: "ai_ask" });
      const summary = service.endSession(sessionId);

      expect(summary).toBeDefined();
      expect(summary!.llmCallCount).toBe(0);
      expect(summary!.llmTotalTimeMs).toBe(0);
      expect(summary!.llmTimePercent).toBe(0);
      expect(summary!.overheadMs).toBeGreaterThanOrEqual(0);
      expect(summary!.phases).toHaveLength(0);
      expect(summary!.totalInputTokens).toBe(0);
      expect(summary!.totalOutputTokens).toBe(0);
      expect(summary!.avgTokenThroughput).toBe(0);
    });
  });

  // =========================================================================
  // 9. endPhaseByName
  // =========================================================================

  describe("endPhaseByName", () => {
    it("should end the correct open phase by name", async () => {
      const sessionId = service.startSession({ type: "ai_ask" });

      service.startPhase(sessionId, { name: "target" });
      await wait(5);

      const duration = service.endPhaseByName(sessionId, "target");

      expect(typeof duration).toBe("number");
      expect(duration).toBeGreaterThan(0);
    });

    it("should return undefined when no open phase with that name exists", () => {
      const sessionId = service.startSession({ type: "ai_ask" });

      const result = service.endPhaseByName(sessionId, "missing-phase");
      expect(result).toBeUndefined();
    });

    it("should end the LAST open phase when duplicates exist", async () => {
      const sessionId = service.startSession({ type: "ai_ask" });

      const firstId = service.startPhase(sessionId, { name: "dup" });
      await wait(2);
      // Close the first one manually
      service.endPhase(sessionId, firstId);

      // Open a second phase with the same name
      service.startPhase(sessionId, { name: "dup" });
      await wait(5);

      const duration = service.endPhaseByName(sessionId, "dup");

      expect(typeof duration).toBe("number");
      expect(duration).toBeGreaterThan(0);
    });
  });

  // =========================================================================
  // 10. getActivePhaseId
  // =========================================================================

  describe("getActivePhaseId", () => {
    it("should return undefined when no phases exist", () => {
      const sessionId = service.startSession({ type: "ai_ask" });
      expect(service.getActivePhaseId(sessionId)).toBeUndefined();
    });

    it("should return the last open phase id", () => {
      const sessionId = service.startSession({ type: "ai_ask" });

      const id1 = service.startPhase(sessionId, { name: "first" });
      const id2 = service.startPhase(sessionId, { name: "second" });

      expect(service.getActivePhaseId(sessionId)).toBe(id2);

      // Close second – now first should be the last open
      service.endPhase(sessionId, id2);
      expect(service.getActivePhaseId(sessionId)).toBe(id1);
    });

    it("should return undefined when all phases are closed", () => {
      const sessionId = service.startSession({ type: "ai_ask" });

      const id = service.startPhase(sessionId, { name: "only" });
      service.endPhase(sessionId, id);

      expect(service.getActivePhaseId(sessionId)).toBeUndefined();
    });
  });

  // =========================================================================
  // 11. Checkpoints
  // =========================================================================

  describe("Checkpoints", () => {
    it("should store checkpoint on the phase", () => {
      const sessionId = service.startSession({ type: "ai_ask" });
      const phaseId = service.startPhase(sessionId, {
        name: "with-checkpoints",
      });

      service.addCheckpoint(sessionId, phaseId, "step-1", { detail: "x" });
      service.addCheckpoint(sessionId, phaseId, "step-2");

      const session = service.getSession(sessionId);
      const phase = session!.phases.find((p) => p.id === phaseId);

      expect(phase!.checkpoints).toHaveLength(2);
      expect(phase!.checkpoints[0].name).toBe("step-1");
      expect(phase!.checkpoints[0].metadata).toEqual({ detail: "x" });
      expect(phase!.checkpoints[1].name).toBe("step-2");
    });

    it("should record timestamps for each checkpoint", () => {
      const sessionId = service.startSession({ type: "ai_ask" });
      const phaseId = service.startPhase(sessionId, { name: "p" });

      service.addCheckpoint(sessionId, phaseId, "cp");

      const session = service.getSession(sessionId);
      const phase = session!.phases.find((p) => p.id === phaseId);

      expect(phase!.checkpoints[0].timestamp).toBeGreaterThan(0);
    });

    it("should silently ignore checkpoint on unknown session", () => {
      expect(() => {
        service.addCheckpoint("bad-session", "bad-phase", "cp");
      }).not.toThrow();
    });

    it("should silently ignore checkpoint on unknown phase", () => {
      const sessionId = service.startSession({ type: "ai_ask" });

      expect(() => {
        service.addCheckpoint(sessionId, "bad-phase-id", "cp");
      }).not.toThrow();
    });
  });

  // =========================================================================
  // 12. Token throughput calculation – precise values
  // =========================================================================

  describe("Token throughput calculation", () => {
    it("streaming: ttftMs=200, ttltMs=5000, outputTokens=500 → ≈104.2 tokens/sec", () => {
      const sessionId = service.startSession({ type: "ai_ask" });

      service.recordLLMCall(sessionId, {
        model: "gpt-4o",
        provider: "openai",
        streaming: true,
        ttftMs: 200,
        ttltMs: 5000,
        totalDurationMs: 5000,
        inputTokens: 50,
        outputTokens: 500,
      });

      const session = service.getSession(sessionId);
      const record = session!.llmCalls[0];

      // generationTimeMs = 5000 - 200 = 4800ms
      // throughput = 500 / 4.8 = 104.1666... → rounded to 1dp = 104.2
      expect(record.tokenThroughputPerSec).toBeCloseTo(104.2, 0);
    });

    it("non-streaming: totalDurationMs=3000, outputTokens=300 → 100 tokens/sec", () => {
      const sessionId = service.startSession({ type: "ai_ask" });

      service.recordLLMCall(sessionId, {
        model: "claude-3",
        provider: "anthropic",
        streaming: false,
        ttltMs: 3000,
        totalDurationMs: 3000,
        inputTokens: 50,
        outputTokens: 300,
      });

      const session = service.getSession(sessionId);
      const record = session!.llmCalls[0];

      // 300 / 3 = 100.0
      expect(record.tokenThroughputPerSec).toBe(100);
    });

    it("streaming with ttft === ttlt falls through to totalDurationMs branch", () => {
      // When ttltMs === ttftMs the condition `ttltMs > ttftMs` is false,
      // so the service falls back to the non-streaming branch:
      // throughput = outputTokens / totalDurationMs * 1000 = 50/1000*1000 = 50
      const sessionId = service.startSession({ type: "ai_ask" });

      service.recordLLMCall(sessionId, {
        model: "gpt-4o",
        provider: "openai",
        streaming: true,
        ttftMs: 1000,
        ttltMs: 1000, // ttlt === ttft → streaming branch skipped
        totalDurationMs: 1000,
        inputTokens: 10,
        outputTokens: 50,
      });

      const session = service.getSession(sessionId);
      const record = session!.llmCalls[0];

      // Falls to: (50 / 1000) * 1000 = 50 tokens/sec
      expect(record.tokenThroughputPerSec).toBe(50);
    });

    it("non-streaming with totalDurationMs=0 produces 0 throughput", () => {
      const sessionId = service.startSession({ type: "ai_ask" });

      service.recordLLMCall(sessionId, {
        model: "gpt-4o",
        provider: "openai",
        streaming: false,
        ttltMs: 0,
        totalDurationMs: 0,
        inputTokens: 10,
        outputTokens: 50,
      });

      const session = service.getSession(sessionId);
      const record = session!.llmCalls[0];

      expect(record.tokenThroughputPerSec).toBe(0);
    });
  });

  // =========================================================================
  // 13. No streaming calls → ttft is undefined in summary
  // =========================================================================

  describe("No streaming calls", () => {
    it("should return ttft=undefined when only non-streaming calls are recorded", () => {
      const sessionId = service.startSession({ type: "ai_ask" });

      service.recordLLMCall(sessionId, nonStreamingCall());
      service.recordLLMCall(sessionId, nonStreamingCall());

      const summary = service.endSession(sessionId);

      expect(summary!.ttft).toBeUndefined();
    });

    it("should return ttft=undefined when no LLM calls at all", () => {
      const sessionId = service.startSession({ type: "ai_ask" });
      const summary = service.endSession(sessionId);

      expect(summary!.ttft).toBeUndefined();
    });
  });

  // =========================================================================
  // 14. Percentile edge cases
  // =========================================================================

  describe("Percentile edge cases", () => {
    it("single streaming call: p50=p95=that value", () => {
      const sessionId = service.startSession({ type: "ai_ask" });

      service.recordLLMCall(
        sessionId,
        streamingCall({ ttftMs: 400, ttltMs: 2000, totalDurationMs: 2000 }),
      );

      const summary = service.endSession(sessionId);

      expect(summary!.ttft!.p50Ms).toBe(400);
      expect(summary!.ttft!.p95Ms).toBe(400);
      expect(summary!.ttft!.minMs).toBe(400);
      expect(summary!.ttft!.maxMs).toBe(400);
    });

    it("two streaming calls: p50 and p95 return expected elements", () => {
      // sorted: [100, 800]
      // p50: ceil(0.5*2)-1 = 0 → sorted[0] = 100
      // p95: ceil(0.95*2)-1 = 1 → sorted[1] = 800
      const sessionId = service.startSession({ type: "ai_ask" });

      service.recordLLMCall(
        sessionId,
        streamingCall({ ttftMs: 800, ttltMs: 3000, totalDurationMs: 3000 }),
      );
      service.recordLLMCall(
        sessionId,
        streamingCall({ ttftMs: 100, ttltMs: 1000, totalDurationMs: 1000 }),
      );

      const summary = service.endSession(sessionId);

      expect(summary!.ttft!.p50Ms).toBe(100);
      expect(summary!.ttft!.p95Ms).toBe(800);
    });
  });

  // =========================================================================
  // 15. Zero-duration phase
  // =========================================================================

  describe("Zero-duration phase", () => {
    it("should produce durationMs=0 for a phase ended in same tick (mocked Date.now)", () => {
      const fixedTime = 1700000000000;
      const dateSpy = jest.spyOn(Date, "now").mockReturnValue(fixedTime);

      const sessionId = service.startSession({ type: "ai_ask" });
      const phaseId = service.startPhase(sessionId, { name: "instant" });
      service.endPhase(sessionId, phaseId);

      const summary = service.endSession(sessionId);
      const phase = summary!.phases[0];

      expect(phase.durationMs).toBe(0);

      dateSpy.mockRestore();
    });
  });

  // =========================================================================
  // 16. LRU eviction (uses a reduced-capacity service)
  // =========================================================================

  describe("LRU eviction", () => {
    it("should evict the oldest session when capacity is exceeded", () => {
      // Access the private sessions LRU via getSession (which uses sessions.get)
      // Fill 500 sessions then add one more — session #1 should be evicted
      const firstId = service.startSession({ type: "ai_ask" });

      // Fill up to 499 more (total 500 including firstId)
      for (let i = 1; i < 500; i++) {
        service.startSession({ type: "ai_ask" });
      }

      // firstId is still present
      expect(service.getSession(firstId)).toBeDefined();

      // Adding one more triggers eviction of firstId
      service.startSession({ type: "ai_ask" });

      expect(service.getSession(firstId)).toBeUndefined();
    });
  });

  // =========================================================================
  // 17. endPhase merges additional metadata
  // =========================================================================

  describe("endPhase metadata merge", () => {
    it("should merge additional metadata on endPhase", () => {
      const sessionId = service.startSession({ type: "ai_ask" });
      const phaseId = service.startPhase(sessionId, {
        name: "meta-phase",
        metadata: { initial: true },
      });

      service.endPhase(sessionId, phaseId, { extra: "data" });

      const session = service.getSession(sessionId);
      const phase = session!.phases.find((p) => p.id === phaseId);

      expect(phase!.metadata).toEqual({ initial: true, extra: "data" });
    });

    it("endPhase returns the durationMs as a number", async () => {
      const sessionId = service.startSession({ type: "ai_ask" });
      const phaseId = service.startPhase(sessionId, { name: "timed" });
      await wait(5);

      const duration = service.endPhase(sessionId, phaseId);

      expect(typeof duration).toBe("number");
      expect(duration).toBeGreaterThan(0);
    });

    it("endPhase with unknown phaseId returns undefined", () => {
      const sessionId = service.startSession({ type: "ai_ask" });
      const result = service.endPhase(sessionId, "bad-phase");
      expect(result).toBeUndefined();
    });
  });
});

// ===========================================================================
// Suite B – With Prisma (persistence)
// ===========================================================================

describe("SessionLatencyTrackerService (with Prisma)", () => {
  let service: SessionLatencyTrackerService;
  let mockPrisma: ReturnType<typeof buildMockPrisma>;

  beforeEach(async () => {
    mockPrisma = buildMockPrisma();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SessionLatencyTrackerService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<SessionLatencyTrackerService>(
      SessionLatencyTrackerService,
    );
  });

  afterEach(() => jest.clearAllMocks());

  // =========================================================================
  // 18. DB persistence on endSession
  // =========================================================================

  describe("DB persistence", () => {
    it("should call prisma.latencySession.create on endSession", async () => {
      const sessionId = service.startSession({
        type: "topic_insights_refresh",
        entityId: "entity-1",
        userId: "user-1",
      });

      service.endSession(sessionId);

      // fire-and-forget – flush microtask queue
      await new Promise<void>((r) => setTimeout(r, 0));

      expect(mockPrisma.latencySession.create).toHaveBeenCalledTimes(1);
    });

    it("should pass correct fields to prisma.latencySession.create", async () => {
      const sessionId = service.startSession({
        type: "ai_ask",
        entityId: "e-42",
        userId: "u-7",
      });

      const summary = service.endSession(sessionId);

      await new Promise<void>((r) => setTimeout(r, 0));

      const callArg = mockPrisma.latencySession.create.mock.calls[0][0];
      const data = callArg.data;

      expect(data.id).toBe(sessionId);
      expect(data.type).toBe("ai_ask");
      expect(data.entityId).toBe("e-42");
      expect(data.userId).toBe("u-7");
      expect(data.status).toBe("completed");
      expect(data.durationMs).toBe(summary!.totalDurationMs);
      expect(data.summary).toMatchObject({ sessionId });
    });
  });

  // =========================================================================
  // 19. DB persistence failure – still returns summary
  // =========================================================================

  describe("DB persistence failure", () => {
    it("should still return summary even if prisma.create throws", async () => {
      mockPrisma.latencySession.create.mockRejectedValue(
        new Error("DB connection lost"),
      );

      const sessionId = service.startSession({ type: "ai_ask" });
      const summary = service.endSession(sessionId);

      // flush async persistence
      await new Promise<void>((r) => setTimeout(r, 0));

      expect(summary).toBeDefined();
      expect(summary!.sessionId).toBe(sessionId);
    });
  });

  // =========================================================================
  // 20. listSessions – filter construction
  // =========================================================================

  describe("listSessions", () => {
    it("should call findMany with correct where clause when all filters provided", async () => {
      const since = Date.now() - 86400000; // 24h ago

      mockPrisma.latencySession.findMany.mockResolvedValue([]);

      await service.listSessions({
        type: "ai_ask",
        userId: "user-1",
        entityId: "entity-1",
        status: "completed",
        since,
        limit: 10,
      });

      expect(mockPrisma.latencySession.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            type: "ai_ask",
            userId: "user-1",
            entityId: "entity-1",
            status: "completed",
            startTime: { gte: new Date(since) },
          }),
          take: 10,
        }),
      );
    });

    it("should default take to 50 when limit not provided", async () => {
      mockPrisma.latencySession.findMany.mockResolvedValue([]);

      await service.listSessions({});

      const callArg = mockPrisma.latencySession.findMany.mock.calls[0][0];
      expect(callArg.take).toBe(50);
    });

    it("should return parsed summaries from DB rows", async () => {
      const fakeSummary = {
        sessionId: "abc",
        type: "ai_ask",
        status: "completed",
        totalDurationMs: 1000,
        phases: [],
        llmCallCount: 0,
        llmTotalTimeMs: 0,
        llmTimePercent: 0,
        overheadMs: 1000,
        totalInputTokens: 0,
        totalOutputTokens: 0,
        avgTokenThroughput: 0,
      };

      mockPrisma.latencySession.findMany.mockResolvedValue([
        { summary: fakeSummary },
      ]);

      const results = await service.listSessions({ type: "ai_ask" });

      expect(results).toHaveLength(1);
      expect(results[0]).toEqual(fakeSummary);
    });

    it("should return empty array on DB error", async () => {
      mockPrisma.latencySession.findMany.mockRejectedValue(
        new Error("DB error"),
      );

      const results = await service.listSessions({ type: "ai_ask" });
      expect(results).toEqual([]);
    });

    it("should filter out null/undefined summary rows", async () => {
      mockPrisma.latencySession.findMany.mockResolvedValue([
        { summary: null },
        { summary: undefined },
      ]);

      const results = await service.listSessions({});
      expect(results).toEqual([]);
    });
  });

  // =========================================================================
  // 21. getLatestSummary
  // =========================================================================

  describe("getLatestSummary", () => {
    it("should call findFirst with entityId filter", async () => {
      mockPrisma.latencySession.findFirst.mockResolvedValue(null);

      await service.getLatestSummary("entity-99");

      expect(mockPrisma.latencySession.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ entityId: "entity-99" }),
          orderBy: { createdAt: "desc" },
        }),
      );
    });

    it("should include type in where clause when provided", async () => {
      mockPrisma.latencySession.findFirst.mockResolvedValue(null);

      await service.getLatestSummary("entity-99", "topic_insights_refresh");

      const callArg = mockPrisma.latencySession.findFirst.mock.calls[0][0];
      expect(callArg.where).toMatchObject({
        entityId: "entity-99",
        type: "topic_insights_refresh",
      });
    });

    it("should return parsed summary when row is found", async () => {
      const fakeSummary = { sessionId: "xyz", type: "ai_ask" };
      mockPrisma.latencySession.findFirst.mockResolvedValue({
        summary: fakeSummary,
      });

      const result = await service.getLatestSummary("entity-1");

      expect(result).toEqual(fakeSummary);
    });

    it("should return undefined when no row is found", async () => {
      mockPrisma.latencySession.findFirst.mockResolvedValue(null);

      const result = await service.getLatestSummary("entity-missing");
      expect(result).toBeUndefined();
    });

    it("should return undefined on DB error", async () => {
      mockPrisma.latencySession.findFirst.mockRejectedValue(
        new Error("DB down"),
      );

      const result = await service.getLatestSummary("entity-1");
      expect(result).toBeUndefined();
    });
  });
});

// ===========================================================================
// Suite C – No Prisma (query methods return empty/undefined)
// ===========================================================================

describe("SessionLatencyTrackerService query methods (no Prisma)", () => {
  let service: SessionLatencyTrackerService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [SessionLatencyTrackerService],
    }).compile();

    service = module.get<SessionLatencyTrackerService>(
      SessionLatencyTrackerService,
    );
  });

  afterEach(() => jest.clearAllMocks());

  it("listSessions returns [] when no Prisma is injected", async () => {
    const result = await service.listSessions({ type: "ai_ask" });
    expect(result).toEqual([]);
  });

  it("getLatestSummary returns undefined when no Prisma is injected", async () => {
    const result = await service.getLatestSummary("entity-1");
    expect(result).toBeUndefined();
  });
});

// ===========================================================================
// Suite D – Integration simulation (full session flow with mock DB)
// ===========================================================================

describe("SessionLatencyTrackerService – full flow integration", () => {
  let service: SessionLatencyTrackerService;
  let mockPrisma: ReturnType<typeof buildMockPrisma>;

  beforeEach(async () => {
    mockPrisma = buildMockPrisma();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SessionLatencyTrackerService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<SessionLatencyTrackerService>(
      SessionLatencyTrackerService,
    );
  });

  afterEach(() => jest.clearAllMocks());

  it("full topic_insights_refresh flow produces a complete summary", async () => {
    // Arrange
    const sessionId = service.startSession({
      type: "topic_insights_refresh",
      entityId: "topic-123",
      userId: "user-42",
      metadata: { refresh: true },
    });

    // Phase 1: planning
    const planningId = service.startPhase(sessionId, {
      name: "leader_planning",
    });
    service.recordLLMCall(sessionId, {
      model: "gpt-4o",
      provider: "openai",
      streaming: true,
      ttftMs: 300,
      ttltMs: 4500,
      totalDurationMs: 4500,
      inputTokens: 500,
      outputTokens: 800,
      phaseId: planningId,
    });
    service.addCheckpoint(sessionId, planningId, "plan_ready");
    service.endPhase(sessionId, planningId);

    // Phase 2: dimension research (parallel)
    const researchId = service.startPhase(sessionId, {
      name: "dimension_research",
      parallel: true,
      parallelCount: 4,
    });
    for (let i = 0; i < 4; i++) {
      service.recordLLMCall(sessionId, {
        model: "gpt-4o",
        provider: "openai",
        streaming: true,
        ttftMs: 250 + i * 50,
        ttltMs: 3000 + i * 200,
        totalDurationMs: 3000 + i * 200,
        inputTokens: 400,
        outputTokens: 600,
        phaseId: researchId,
      });
    }
    service.endPhase(sessionId, researchId);

    // Phase 3: formatting (non-streaming)
    const formattingId = service.startPhase(sessionId, { name: "formatting" });
    service.recordLLMCall(sessionId, {
      model: "claude-3",
      provider: "anthropic",
      streaming: false,
      ttltMs: 2000,
      totalDurationMs: 2000,
      inputTokens: 2000,
      outputTokens: 1500,
      phaseId: formattingId,
    });
    service.endPhase(sessionId, formattingId);

    // Act
    const summary = service.endSession(sessionId);

    // Flush DB persistence
    await new Promise<void>((r) => setTimeout(r, 0));

    // Assert – structural
    expect(summary).toBeDefined();
    expect(summary!.sessionId).toBe(sessionId);
    expect(summary!.type).toBe("topic_insights_refresh");
    expect(summary!.status).toBe("completed");

    // 3 top-level phases
    expect(summary!.phases).toHaveLength(3);

    // 5 streaming + 1 non-streaming = 6 total calls (1 planning + 4 research + 1 formatting)
    expect(summary!.llmCallCount).toBe(6);

    // TTFT stats should exist (5 streaming calls)
    // planning: ttftMs=300; research: 250, 300, 350, 400 → min=250, max=400
    expect(summary!.ttft).toBeDefined();
    expect(summary!.ttft!.minMs).toBe(250);
    expect(summary!.ttft!.maxMs).toBe(400);

    // Tokens:
    //   planning (1 call):  500 in, 800 out
    //   research (4 calls): 4*400=1600 in, 4*600=2400 out
    //   formatting (1 call): 2000 in, 1500 out
    //   totals: 4100 in, 4700 out
    expect(summary!.totalInputTokens).toBe(4100);
    expect(summary!.totalOutputTokens).toBe(4700);

    // DB should have been called
    expect(mockPrisma.latencySession.create).toHaveBeenCalledTimes(1);
  });
});
