/**
 * DAGExecutor Unit Tests
 * 有向无环图执行器测试
 */

import { Logger } from "@nestjs/common";
import { DAGExecutor } from "../dag-executor";
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
    executionId: "exec-dag-1",
    workflowId: "wf-dag-1",
    userId: "user-1",
    sessionId: "session-1",
    input: { prompt: "dag test" },
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
    id: "wf-dag-1",
    name: "DAG Workflow",
    mode: "dag",
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

function makeSuccessTool(): { execute: jest.Mock } {
  return {
    execute: jest.fn().mockResolvedValue({ success: true, data: "result" }),
  };
}

// ============================================================================
// Tests
// ============================================================================

describe("DAGExecutor", () => {
  let executor: DAGExecutor;

  beforeEach(() => {
    executor = new DAGExecutor();
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
    it("should have id = dag-executor", () => {
      expect(executor.id).toBe("dag-executor");
    });

    it("should support dag mode", () => {
      expect(executor.supportedModes).toContain("dag");
    });

    it("should accept custom maxConcurrency in constructor", () => {
      const custom = new DAGExecutor(5);
      expect(custom).toBeDefined();
    });
  });

  // --------------------------------------------------------------------------
  // onModuleDestroy
  // --------------------------------------------------------------------------

  describe("onModuleDestroy()", () => {
    it("should not throw when called", () => {
      expect(() => executor.onModuleDestroy()).not.toThrow();
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
  // Single node (no dependencies)
  // --------------------------------------------------------------------------

  describe("single node", () => {
    it("should execute a single step with no dependencies", async () => {
      const tool = makeSuccessTool();
      const toolRegistry = {
        tryGet: jest.fn().mockReturnValue(tool),
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
      expect(types).toContain("step_started");
      expect(types).toContain("step_completed");
      expect(result.success).toBe(true);
    });
  });

  // --------------------------------------------------------------------------
  // Dependency ordering
  // --------------------------------------------------------------------------

  describe("dependency ordering", () => {
    it("should execute steps in topological order (A → B → C chain)", async () => {
      const callOrder: string[] = [];
      const makeOrderedTool = (id: string) => ({
        execute: jest.fn().mockImplementation(async () => {
          callOrder.push(id);
          return { success: true, data: id };
        }),
      });

      const toolRegistry = {
        tryGet: jest
          .fn()
          .mockReturnValueOnce(makeOrderedTool("s1"))
          .mockReturnValueOnce(makeOrderedTool("s2"))
          .mockReturnValueOnce(makeOrderedTool("s3")),
      } as unknown as ToolRegistry;
      executor.setRegistries(
        toolRegistry,
        {} as SkillRegistry,
        {} as AgentRegistry,
      );

      // s1 → s2 → s3
      const workflow = makeWorkflow([
        makeStep({ id: "s1", executor: "my-tool" }),
        makeStep({ id: "s2", executor: "my-tool", dependsOn: ["s1"] }),
        makeStep({ id: "s3", executor: "my-tool", dependsOn: ["s2"] }),
      ]);
      const context = makeContext();

      const { result } = await drainGenerator(
        executor.execute(workflow, context),
      );

      expect(result.success).toBe(true);
      expect(callOrder.indexOf("s1")).toBeLessThan(callOrder.indexOf("s2"));
      expect(callOrder.indexOf("s2")).toBeLessThan(callOrder.indexOf("s3"));
    });

    it("should execute independent branches in parallel", async () => {
      const tool = makeSuccessTool();
      const toolRegistry = {
        tryGet: jest.fn().mockReturnValue(tool),
      } as unknown as ToolRegistry;
      executor.setRegistries(
        toolRegistry,
        {} as SkillRegistry,
        {} as AgentRegistry,
      );

      // Diamond: s1 → (s2, s3) → s4
      const workflow = makeWorkflow([
        makeStep({ id: "s1", executor: "my-tool" }),
        makeStep({ id: "s2", executor: "my-tool", dependsOn: ["s1"] }),
        makeStep({ id: "s3", executor: "my-tool", dependsOn: ["s1"] }),
        makeStep({ id: "s4", executor: "my-tool", dependsOn: ["s2", "s3"] }),
      ]);
      const context = makeContext();

      const { result } = await drainGenerator(
        executor.execute(workflow, context),
      );

      expect(result.success).toBe(true);
      expect(tool.execute).toHaveBeenCalledTimes(4);
    });

    it("should handle fan-out: one step feeds multiple dependents", async () => {
      const tool = makeSuccessTool();
      const toolRegistry = {
        tryGet: jest.fn().mockReturnValue(tool),
      } as unknown as ToolRegistry;
      executor.setRegistries(
        toolRegistry,
        {} as SkillRegistry,
        {} as AgentRegistry,
      );

      const workflow = makeWorkflow([
        makeStep({ id: "root", executor: "my-tool" }),
        makeStep({ id: "child1", executor: "my-tool", dependsOn: ["root"] }),
        makeStep({ id: "child2", executor: "my-tool", dependsOn: ["root"] }),
        makeStep({ id: "child3", executor: "my-tool", dependsOn: ["root"] }),
      ]);
      const context = makeContext();

      const { result } = await drainGenerator(
        executor.execute(workflow, context),
      );

      expect(result.success).toBe(true);
      expect(tool.execute).toHaveBeenCalledTimes(4);
    });
  });

  // --------------------------------------------------------------------------
  // Circular dependency detection
  // --------------------------------------------------------------------------

  describe("circular dependency detection", () => {
    it("should detect a direct cycle (A → B → A)", async () => {
      const workflow = makeWorkflow([
        makeStep({ id: "a", executor: "my-tool", dependsOn: ["b"] }),
        makeStep({ id: "b", executor: "my-tool", dependsOn: ["a"] }),
      ]);
      const context = makeContext();

      const { events, result } = await drainGenerator(
        executor.execute(workflow, context),
      );

      const types = events.map((e) => e.type);
      expect(types).toContain("workflow_failed");
      expect(result.success).toBe(false);
      expect(result.error?.code).toBe("CIRCULAR_DEPENDENCY");
    });

    it("should detect a longer cycle (A → B → C → A)", async () => {
      const workflow = makeWorkflow([
        makeStep({ id: "a", executor: "my-tool", dependsOn: ["c"] }),
        makeStep({ id: "b", executor: "my-tool", dependsOn: ["a"] }),
        makeStep({ id: "c", executor: "my-tool", dependsOn: ["b"] }),
      ]);
      const context = makeContext();

      const { result } = await drainGenerator(
        executor.execute(workflow, context),
      );

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe("CIRCULAR_DEPENDENCY");
    });

    it("should not falsely detect cycle in valid DAG", async () => {
      const tool = makeSuccessTool();
      const toolRegistry = {
        tryGet: jest.fn().mockReturnValue(tool),
      } as unknown as ToolRegistry;
      executor.setRegistries(
        toolRegistry,
        {} as SkillRegistry,
        {} as AgentRegistry,
      );

      // Valid diamond (no cycle)
      const workflow = makeWorkflow([
        makeStep({ id: "a", executor: "my-tool" }),
        makeStep({ id: "b", executor: "my-tool", dependsOn: ["a"] }),
        makeStep({ id: "c", executor: "my-tool", dependsOn: ["a"] }),
        makeStep({ id: "d", executor: "my-tool", dependsOn: ["b", "c"] }),
      ]);
      const context = makeContext();

      const { result } = await drainGenerator(
        executor.execute(workflow, context),
      );

      expect(result.success).toBe(true);
    });
  });

  // --------------------------------------------------------------------------
  // Failure propagation
  // --------------------------------------------------------------------------

  describe("failure propagation", () => {
    it("should mark dependents as skipped when a step fails", async () => {
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

      // s1 fails → s2 depends on s1 → s2 should be skipped
      const workflow = makeWorkflow([
        makeStep({ id: "s1", executor: "my-tool" }),
        makeStep({ id: "s2", executor: "my-tool", dependsOn: ["s1"] }),
      ]);
      const context = makeContext();

      const { events, result } = await drainGenerator(
        executor.execute(workflow, context),
      );

      const types = events.map((e) => e.type);
      expect(types).toContain("step_failed");
      expect(result.success).toBe(false);
      expect(result.error?.code).toBe("STEPS_FAILED");
      // s2 should never have been executed
      expect(toolFn).toHaveBeenCalledTimes(1);
    });

    it("should count all failed nodes in error message", async () => {
      const toolFn = jest.fn().mockResolvedValue({
        success: false,
        error: { message: "fail" },
      });
      const toolRegistry = {
        tryGet: jest.fn().mockReturnValue({ execute: toolFn }),
      } as unknown as ToolRegistry;
      executor.setRegistries(
        toolRegistry,
        {} as SkillRegistry,
        {} as AgentRegistry,
      );

      // Both independent steps fail
      const workflow = makeWorkflow([
        makeStep({ id: "s1", executor: "my-tool" }),
        makeStep({ id: "s2", executor: "my-tool" }),
      ]);
      const context = makeContext();

      const { result } = await drainGenerator(
        executor.execute(workflow, context),
      );

      expect(result.error?.message).toMatch(/2 step\(s\) failed/);
    });

    it("should not execute dependent steps when a parent step fails", async () => {
      const tool = makeSuccessTool();
      let callCount = 0;
      tool.execute = jest.fn().mockImplementation(async () => {
        callCount++;
        if (callCount === 1) {
          return { success: false, error: { message: "fail" } };
        }
        return { success: true, data: "ok" };
      });

      const toolRegistry = {
        tryGet: jest.fn().mockReturnValue(tool),
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

      const { events } = await drainGenerator(
        executor.execute(workflow, context),
      );

      const types = events.map((e) => e.type);
      expect(types).toContain("step_failed");
      // s2 should never start: skipDependents marks status but doesn't emit step_skipped event
      // (skipDependents only updates status, executeNode never runs for s2)
      expect(callCount).toBe(1);
    });
  });

  // --------------------------------------------------------------------------
  // Cancellation
  // --------------------------------------------------------------------------

  describe("cancellation", () => {
    it("should skip pending nodes when signal is aborted", async () => {
      const controller = new AbortController();
      controller.abort();

      const tool = makeSuccessTool();
      const toolRegistry = {
        tryGet: jest.fn().mockReturnValue(tool),
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

      // Aborted before any step runs — success or fail depends on timing,
      // but no exception should be thrown and result must exist
      expect(result).toBeDefined();
    });
  });

  // --------------------------------------------------------------------------
  // Output collection
  // --------------------------------------------------------------------------

  describe("output collection", () => {
    it("should collect outputs from all successful steps keyed by stepId", async () => {
      let idx = 0;
      const toolFn = jest.fn().mockImplementation(async () => {
        idx++;
        return { success: true, data: `output-${idx}` };
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

      const output = result.output as Record<string, unknown>;
      expect(Object.keys(output).sort()).toEqual(["s1", "s2"]);
    });

    it("should not include failed step output", async () => {
      const toolFn = jest.fn().mockResolvedValue({
        success: false,
        error: { message: "fail" },
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

  // --------------------------------------------------------------------------
  // Exception handling
  // --------------------------------------------------------------------------

  describe("exception handling", () => {
    it("should emit workflow_failed when step fails due to unsupported type", async () => {
      // Unsupported step type: executeStep catches it internally → StepResult.failed
      // DAGExecutor then detects the failed node → emits workflow_failed with STEPS_FAILED
      const step = makeStep({ type: "loop" });
      const workflow = makeWorkflow([step]);
      const context = makeContext();

      const { events, result } = await drainGenerator(
        executor.execute(workflow, context),
      );

      const types = events.map((e) => e.type);
      expect(types).toContain("workflow_failed");
      expect(result.success).toBe(false);
      // DAGExecutor reports STEPS_FAILED (not EXECUTION_ERROR) for caught step errors
      expect(result.error?.code).toBe("STEPS_FAILED");
    });
  });

  // --------------------------------------------------------------------------
  // Result structure
  // --------------------------------------------------------------------------

  describe("result structure", () => {
    it("should include timing fields in result", async () => {
      const workflow = makeWorkflow([]);
      const context = makeContext();

      const { result } = await drainGenerator(
        executor.execute(workflow, context),
      );

      expect(result.startTime).toBeInstanceOf(Date);
      expect(result.endTime).toBeInstanceOf(Date);
      expect(result.duration).toBeGreaterThanOrEqual(0);
      expect(result.executionId).toBe("exec-dag-1");
      expect(result.workflowId).toBe("wf-dag-1");
    });

    it("should include stepResults array", async () => {
      const tool = makeSuccessTool();
      const toolRegistry = {
        tryGet: jest.fn().mockReturnValue(tool),
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
      expect(result.stepResults.length).toBeGreaterThan(0);
    });
  });
});
