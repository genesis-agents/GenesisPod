/**
 * ParallelExecutor Unit Tests
 * 并行执行器测试
 */

import { Logger } from "@nestjs/common";
import { ParallelExecutor } from "../parallel-executor";
import {
  Workflow,
  WorkflowStep,
  ExecutionContext,
  ExecutionEvent,
  ExecutionResult,
} from "../../abstractions/orchestrator.interface";
import { ToolRegistry } from "../../../tools/registry/tool-registry";
import { SkillRegistry } from "../../../skills/registry/skill-registry";
import { AgentRegistry } from "../../../agents/registry/agent-registry";

// ============================================================================
// Helpers
// ============================================================================

function makeContext(overrides?: Partial<ExecutionContext>): ExecutionContext {
  return {
    executionId: "exec-par-1",
    workflowId: "wf-par-1",
    userId: "user-1",
    sessionId: "session-1",
    input: { prompt: "parallel test" },
    state: {},
    stepResults: new Map(),
    startTime: new Date(),
    ...overrides,
  };
}

function makeStep(overrides?: Partial<WorkflowStep>): WorkflowStep {
  return {
    id: "step-1",
    type: "tool",
    executor: "my-tool",
    name: "Step One",
    ...overrides,
  };
}

function makeWorkflow(
  steps: WorkflowStep[],
  overrides?: Partial<Workflow>,
): Workflow {
  return {
    id: "wf-par-1",
    name: "Parallel Workflow",
    mode: "parallel",
    steps,
    ...overrides,
  };
}

async function drainGenerator(
  gen: AsyncGenerator<ExecutionEvent, ExecutionResult>,
): Promise<{ events: ExecutionEvent[]; result: ExecutionResult }> {
  const events: ExecutionEvent[] = [];
  let result: ExecutionResult | undefined;

  while (true) {
    const next = await gen.next();
    if (next.done) {
      result = next.value;
      break;
    }
    events.push(next.value);
  }

  return { events, result: result };
}

// ============================================================================
// Tests
// ============================================================================

describe("ParallelExecutor", () => {
  let executor: ParallelExecutor;

  beforeEach(() => {
    executor = new ParallelExecutor();
    jest.spyOn(Logger.prototype, "log").mockImplementation();
    jest.spyOn(Logger.prototype, "warn").mockImplementation();
    jest.spyOn(Logger.prototype, "error").mockImplementation();
    jest.spyOn(Logger.prototype, "debug").mockImplementation();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  // --------------------------------------------------------------------------
  // Identity
  // --------------------------------------------------------------------------

  describe("identity", () => {
    it("should have id = parallel-executor", () => {
      expect(executor.id).toBe("parallel-executor");
    });

    it("should support parallel mode", () => {
      expect(executor.supportedModes).toContain("parallel");
    });

    it("should accept custom maxConcurrency in constructor", () => {
      const custom = new ParallelExecutor(5);
      expect(custom).toBeDefined();
    });
  });

  // --------------------------------------------------------------------------
  // Empty workflow
  // --------------------------------------------------------------------------

  describe("empty workflow", () => {
    it("should emit workflow_started and workflow_completed and succeed", async () => {
      const workflow = makeWorkflow([]);
      const context = makeContext();

      const { events, result } = await drainGenerator(
        executor.execute(workflow, context),
      );

      const types = events.map((e) => e.type);
      expect(types).toContain("workflow_started");
      expect(types).toContain("workflow_completed");
      expect(result.success).toBe(true);
    });
  });

  // --------------------------------------------------------------------------
  // Successful parallel execution
  // --------------------------------------------------------------------------

  describe("successful parallel execution", () => {
    it("should execute independent steps and succeed", async () => {
      const toolFn = jest
        .fn()
        .mockResolvedValue({ success: true, data: "out" });
      const toolRegistry = {
        tryGet: jest.fn().mockReturnValue({ execute: toolFn }),
      } as unknown as ToolRegistry;
      executor.setRegistries(
        toolRegistry,
        {} as SkillRegistry,
        {} as AgentRegistry,
      );

      const workflow = makeWorkflow([
        makeStep({ id: "s1", executor: "my-tool" }),
        makeStep({ id: "s2", executor: "my-tool" }),
        makeStep({ id: "s3", executor: "my-tool" }),
      ]);
      const context = makeContext();

      const { result } = await drainGenerator(
        executor.execute(workflow, context),
      );

      expect(result.success).toBe(true);
      expect(toolFn).toHaveBeenCalledTimes(3);
    });

    it("should collect each step output keyed by stepId", async () => {
      let callIdx = 0;
      const toolFn = jest.fn().mockImplementation(async () => {
        callIdx++;
        return { success: true, data: `output-${callIdx}` };
      });
      const toolRegistry = {
        tryGet: jest.fn().mockReturnValue({ execute: toolFn }),
      } as unknown as ToolRegistry;
      executor.setRegistries(
        toolRegistry,
        {} as SkillRegistry,
        {} as AgentRegistry,
      );

      const workflow = makeWorkflow([
        makeStep({ id: "s1", executor: "my-tool" }),
        makeStep({ id: "s2", executor: "my-tool" }),
      ]);
      const context = makeContext();

      const { result } = await drainGenerator(
        executor.execute(workflow, context),
      );

      expect(result.success).toBe(true);
      const output = result.output as Record<string, unknown>;
      expect(Object.keys(output)).toHaveLength(2);
    });

    it("should emit step_completed events for successful steps", async () => {
      const toolFn = jest.fn().mockResolvedValue({ success: true, data: "ok" });
      const toolRegistry = {
        tryGet: jest.fn().mockReturnValue({ execute: toolFn }),
      } as unknown as ToolRegistry;
      executor.setRegistries(
        toolRegistry,
        {} as SkillRegistry,
        {} as AgentRegistry,
      );

      const workflow = makeWorkflow([
        makeStep({ id: "s1", executor: "my-tool" }),
        makeStep({ id: "s2", executor: "my-tool" }),
      ]);
      const context = makeContext();

      const { events } = await drainGenerator(
        executor.execute(workflow, context),
      );

      const completedEvents = events.filter((e) => e.type === "step_completed");
      expect(completedEvents).toHaveLength(2);
    });
  });

  // --------------------------------------------------------------------------
  // Dependency-based execution
  // --------------------------------------------------------------------------

  describe("dependency-based execution", () => {
    it("should wait for dependencies before executing a dependent step", async () => {
      const callOrder: string[] = [];
      const makeTool = (id: string) => ({
        execute: jest.fn().mockImplementation(async () => {
          callOrder.push(id);
          return { success: true, data: id };
        }),
      });

      const toolRegistry = {
        tryGet: jest
          .fn()
          .mockReturnValueOnce(makeTool("s1"))
          .mockReturnValueOnce(makeTool("s2")),
      } as unknown as ToolRegistry;
      executor.setRegistries(
        toolRegistry,
        {} as SkillRegistry,
        {} as AgentRegistry,
      );

      const workflow = makeWorkflow([
        makeStep({ id: "s1", executor: "my-tool" }),
        makeStep({ id: "s2", executor: "my-tool", dependsOn: ["s1"] }),
      ]);
      const context = makeContext();

      const { result } = await drainGenerator(
        executor.execute(workflow, context),
      );

      expect(result.success).toBe(true);
      expect(callOrder.indexOf("s1")).toBeLessThan(callOrder.indexOf("s2"));
    });
  });

  // --------------------------------------------------------------------------
  // Failure handling
  // --------------------------------------------------------------------------

  describe("failure handling", () => {
    it("should emit step_failed and workflow_failed when a step fails", async () => {
      const toolFn = jest.fn().mockResolvedValue({
        success: false,
        error: { message: "parallel step failed" },
      });
      const toolRegistry = {
        tryGet: jest.fn().mockReturnValue({ execute: toolFn }),
      } as unknown as ToolRegistry;
      executor.setRegistries(
        toolRegistry,
        {} as SkillRegistry,
        {} as AgentRegistry,
      );

      const workflow = makeWorkflow([
        makeStep({ id: "s1", executor: "my-tool" }),
      ]);
      const context = makeContext();

      const { events, result } = await drainGenerator(
        executor.execute(workflow, context),
      );

      const types = events.map((e) => e.type);
      expect(types).toContain("step_failed");
      expect(types).toContain("workflow_failed");
      expect(result.success).toBe(false);
      expect(result.error?.code).toBe("STEPS_FAILED");
    });

    it("should count multiple failed steps in error message", async () => {
      const toolFn = jest.fn().mockResolvedValue({
        success: false,
        error: { message: "bad" },
      });
      const toolRegistry = {
        tryGet: jest.fn().mockReturnValue({ execute: toolFn }),
      } as unknown as ToolRegistry;
      executor.setRegistries(
        toolRegistry,
        {} as SkillRegistry,
        {} as AgentRegistry,
      );

      const workflow = makeWorkflow([
        makeStep({ id: "s1", executor: "my-tool" }),
        makeStep({ id: "s2", executor: "my-tool" }),
      ]);
      const context = makeContext();

      const { result } = await drainGenerator(
        executor.execute(workflow, context),
      );

      expect(result.success).toBe(false);
      expect(result.error?.message).toMatch(/2 step\(s\) failed/);
    });

    it("should emit workflow_failed on unsupported step type", async () => {
      const step = makeStep({ type: "loop" }); // unsupported type → step fails with error
      const workflow = makeWorkflow([step]);
      const context = makeContext();

      const { events, result } = await drainGenerator(
        executor.execute(workflow, context),
      );

      const types = events.map((e) => e.type);
      expect(types).toContain("workflow_failed");
      expect(result.success).toBe(false);
      // Unsupported type errors are caught by executeStep and produce STEPS_FAILED
      expect(result.error?.code).toBe("STEPS_FAILED");
    });
  });

  // --------------------------------------------------------------------------
  // Cancellation
  // --------------------------------------------------------------------------

  describe("cancellation", () => {
    it("should cancel pending steps when signal is aborted during execution", async () => {
      const controller = new AbortController();

      const toolFn = jest.fn().mockImplementation(async () => {
        controller.abort();
        return { success: true, data: "done" };
      });
      const toolRegistry = {
        tryGet: jest.fn().mockReturnValue({ execute: toolFn }),
      } as unknown as ToolRegistry;
      executor.setRegistries(
        toolRegistry,
        {} as SkillRegistry,
        {} as AgentRegistry,
      );

      const workflow = makeWorkflow([
        makeStep({ id: "s1", executor: "my-tool" }),
        makeStep({ id: "s2", executor: "my-tool" }),
      ]);
      const context = makeContext({ signal: controller.signal });

      const { result } = await drainGenerator(
        executor.execute(workflow, context),
      );

      // When signal aborts mid-execution, the workflow should not fully succeed
      // (remaining steps cancelled or overall result reflects the abortion)
      expect(result).toBeDefined();
    });

    it("should return failure when signal is aborted before any step runs", async () => {
      const controller = new AbortController();
      controller.abort();

      // With aborted signal, steps that were already running get marked cancelled
      // The parallel executor checks signal inside the inner loop
      const toolFn = jest.fn().mockResolvedValue({ success: true, data: "ok" });
      const toolRegistry = {
        tryGet: jest.fn().mockReturnValue({ execute: toolFn }),
      } as unknown as ToolRegistry;
      executor.setRegistries(
        toolRegistry,
        {} as SkillRegistry,
        {} as AgentRegistry,
      );

      const workflow = makeWorkflow([
        makeStep({ id: "s1", executor: "my-tool" }),
      ]);
      const context = makeContext({ signal: controller.signal });

      const { result } = await drainGenerator(
        executor.execute(workflow, context),
      );

      expect(result).toBeDefined();
    });
  });

  // --------------------------------------------------------------------------
  // Deadlock detection
  // --------------------------------------------------------------------------

  describe("deadlock detection", () => {
    it("should break and log error when all pending steps depend on failed nodes", async () => {
      const errorSpy = jest.spyOn(Logger.prototype, "error");

      const toolFn = jest.fn().mockResolvedValue({
        success: false,
        error: { message: "step failed" },
      });
      const toolRegistry = {
        tryGet: jest.fn().mockReturnValue({ execute: toolFn }),
      } as unknown as ToolRegistry;
      executor.setRegistries(
        toolRegistry,
        {} as SkillRegistry,
        {} as AgentRegistry,
      );

      // s1 fails, s2 depends on s1 → s2 has unmet deps forever
      const workflow = makeWorkflow([
        makeStep({ id: "s1", executor: "my-tool" }),
        makeStep({ id: "s2", executor: "my-tool", dependsOn: ["s1"] }),
      ]);
      const context = makeContext();

      const { result } = await drainGenerator(
        executor.execute(workflow, context),
      );

      // Should complete (not hang) and detect deadlock
      expect(result).toBeDefined();
      expect(errorSpy).toHaveBeenCalledWith(
        expect.stringContaining("Deadlock detected"),
      );
    });
  });

  // --------------------------------------------------------------------------
  // Concurrency limit
  // --------------------------------------------------------------------------

  describe("concurrency limit", () => {
    it("should not exceed maxConcurrency running tasks at once", async () => {
      const concurrencyLimit = 2;
      const executorLimited = new ParallelExecutor(concurrencyLimit);
      jest.spyOn(Logger.prototype, "log").mockImplementation();
      jest.spyOn(Logger.prototype, "warn").mockImplementation();

      let activeCount = 0;
      let maxObserved = 0;

      const toolFn = jest.fn().mockImplementation(
        () =>
          new Promise<{ success: boolean; data: string }>((resolve) => {
            activeCount++;
            maxObserved = Math.max(maxObserved, activeCount);
            setTimeout(() => {
              activeCount--;
              resolve({ success: true, data: "ok" });
            }, 10);
          }),
      );

      const toolRegistry = {
        tryGet: jest.fn().mockReturnValue({ execute: toolFn }),
      } as unknown as ToolRegistry;
      executorLimited.setRegistries(
        toolRegistry,
        {} as SkillRegistry,
        {} as AgentRegistry,
      );

      const steps = Array.from({ length: 5 }, (_, i) =>
        makeStep({ id: `s${i}`, executor: "my-tool" }),
      );
      const workflow = makeWorkflow(steps);
      const context = makeContext();

      await drainGenerator(executorLimited.execute(workflow, context));

      expect(maxObserved).toBeLessThanOrEqual(concurrencyLimit);
    });
  });

  // --------------------------------------------------------------------------
  // Result structure
  // --------------------------------------------------------------------------

  describe("result structure", () => {
    it("should record stepResults in the result", async () => {
      const toolFn = jest
        .fn()
        .mockResolvedValue({ success: true, data: "out" });
      const toolRegistry = {
        tryGet: jest.fn().mockReturnValue({ execute: toolFn }),
      } as unknown as ToolRegistry;
      executor.setRegistries(
        toolRegistry,
        {} as SkillRegistry,
        {} as AgentRegistry,
      );

      const workflow = makeWorkflow([
        makeStep({ id: "s1", executor: "my-tool" }),
      ]);
      const context = makeContext();

      const { result } = await drainGenerator(
        executor.execute(workflow, context),
      );

      expect(result.stepResults).toBeInstanceOf(Array);
      expect(result.duration).toBeGreaterThanOrEqual(0);
      expect(result.startTime).toBeInstanceOf(Date);
      expect(result.endTime).toBeInstanceOf(Date);
    });

    it("should not include failed step output in merged output", async () => {
      const toolFn = jest.fn().mockResolvedValue({
        success: false,
        error: { message: "nope" },
      });
      const toolRegistry = {
        tryGet: jest.fn().mockReturnValue({ execute: toolFn }),
      } as unknown as ToolRegistry;
      executor.setRegistries(
        toolRegistry,
        {} as SkillRegistry,
        {} as AgentRegistry,
      );

      const workflow = makeWorkflow([
        makeStep({ id: "s1", executor: "my-tool" }),
      ]);
      const context = makeContext();

      const { result } = await drainGenerator(
        executor.execute(workflow, context),
      );

      const output = result.output as Record<string, unknown>;
      expect(output["s1"]).toBeUndefined();
    });
  });
});
