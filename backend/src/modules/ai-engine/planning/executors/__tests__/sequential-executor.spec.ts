/**
 * SequentialExecutor Unit Tests
 * 顺序执行器测试
 */

import { Logger } from "@nestjs/common";
import { SequentialExecutor } from "../sequential-executor";
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
    executionId: "exec-seq-1",
    workflowId: "wf-seq-1",
    userId: "user-1",
    sessionId: "session-1",
    input: { prompt: "hello" },
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

function makeWorkflow(overrides?: Partial<Workflow>): Workflow {
  return {
    id: "wf-seq-1",
    name: "Sequential Workflow",
    mode: "sequential",
    steps: [],
    ...overrides,
  };
}

/**
 * Drain the AsyncGenerator and collect yielded events + the final return value.
 */
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

describe("SequentialExecutor", () => {
  let executor: SequentialExecutor;
  let mockToolRegistry: jest.Mocked<Pick<ToolRegistry, "tryGet">>;

  beforeEach(() => {
    executor = new SequentialExecutor();
    jest.spyOn(Logger.prototype, "log").mockImplementation();
    jest.spyOn(Logger.prototype, "warn").mockImplementation();
    jest.spyOn(Logger.prototype, "error").mockImplementation();
    jest.spyOn(Logger.prototype, "debug").mockImplementation();

    mockToolRegistry = { tryGet: jest.fn() };
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  // --------------------------------------------------------------------------
  // Identity
  // --------------------------------------------------------------------------

  describe("identity", () => {
    it("should have id = sequential-executor", () => {
      expect(executor.id).toBe("sequential-executor");
    });

    it("should support sequential mode", () => {
      expect(executor.supportedModes).toContain("sequential");
    });
  });

  // --------------------------------------------------------------------------
  // Empty workflow
  // --------------------------------------------------------------------------

  describe("empty workflow", () => {
    it("should emit workflow_started and workflow_completed events and succeed", async () => {
      const workflow = makeWorkflow({ steps: [] });
      const context = makeContext();

      const { events, result } = await drainGenerator(
        executor.execute(workflow, context),
      );

      const types = events.map((e) => e.type);
      expect(types).toContain("workflow_started");
      expect(types).toContain("workflow_completed");
      expect(result.success).toBe(true);
      expect(result.workflowId).toBe("wf-seq-1");
      expect(result.executionId).toBe("exec-seq-1");
    });

    it("should return undefined output when no steps completed", async () => {
      const workflow = makeWorkflow({ steps: [] });
      const context = makeContext();

      const { result } = await drainGenerator(
        executor.execute(workflow, context),
      );

      expect(result.output).toBeUndefined();
    });
  });

  // --------------------------------------------------------------------------
  // Successful step execution
  // --------------------------------------------------------------------------

  describe("successful step execution", () => {
    it("should emit step_started and step_completed events for each step", async () => {
      const tool = {
        execute: jest
          .fn()
          .mockResolvedValue({ success: true, data: "output-1" }),
      };
      mockToolRegistry.tryGet.mockReturnValue(
        tool as unknown as ReturnType<ToolRegistry["tryGet"]>,
      );
      executor.setRegistries(
        mockToolRegistry as unknown as ToolRegistry,
        {} as SkillRegistry,
        {} as AgentRegistry,
      );

      const workflow = makeWorkflow({
        steps: [makeStep({ id: "s1", type: "tool", executor: "my-tool" })],
      });
      const context = makeContext();

      const { events, result } = await drainGenerator(
        executor.execute(workflow, context),
      );

      const types = events.map((e) => e.type);
      expect(types).toContain("step_started");
      expect(types).toContain("step_completed");
      expect(result.success).toBe(true);
    });

    it("should use last completed step output as workflow output", async () => {
      const tool = jest.fn();
      tool
        .mockResolvedValueOnce({ success: true, data: "first" })
        .mockResolvedValueOnce({ success: true, data: "second" });

      mockToolRegistry.tryGet.mockReturnValue({
        execute: tool,
      } as unknown as ReturnType<ToolRegistry["tryGet"]>);
      executor.setRegistries(
        mockToolRegistry as unknown as ToolRegistry,
        {} as SkillRegistry,
        {} as AgentRegistry,
      );

      const workflow = makeWorkflow({
        steps: [
          makeStep({ id: "s1", type: "tool", executor: "my-tool" }),
          makeStep({ id: "s2", type: "tool", executor: "my-tool" }),
        ],
      });
      const context = makeContext();

      const { result } = await drainGenerator(
        executor.execute(workflow, context),
      );

      expect(result.output).toBe("second");
    });

    it("should execute steps in order", async () => {
      const callOrder: string[] = [];
      const makeTool = (id: string) => ({
        execute: jest.fn().mockImplementation(async () => {
          callOrder.push(id);
          return { success: true, data: id };
        }),
      });

      mockToolRegistry.tryGet
        .mockReturnValueOnce(
          makeTool("tool-a") as unknown as ReturnType<ToolRegistry["tryGet"]>,
        )
        .mockReturnValueOnce(
          makeTool("tool-b") as unknown as ReturnType<ToolRegistry["tryGet"]>,
        )
        .mockReturnValueOnce(
          makeTool("tool-c") as unknown as ReturnType<ToolRegistry["tryGet"]>,
        );

      executor.setRegistries(
        mockToolRegistry as unknown as ToolRegistry,
        {} as SkillRegistry,
        {} as AgentRegistry,
      );

      const workflow = makeWorkflow({
        steps: [
          makeStep({ id: "s1", type: "tool", executor: "tool-a" }),
          makeStep({ id: "s2", type: "tool", executor: "tool-b" }),
          makeStep({ id: "s3", type: "tool", executor: "tool-c" }),
        ],
      });
      const context = makeContext();

      await drainGenerator(executor.execute(workflow, context));

      expect(callOrder).toEqual(["tool-a", "tool-b", "tool-c"]);
    });
  });

  // --------------------------------------------------------------------------
  // Cancellation
  // --------------------------------------------------------------------------

  describe("cancellation", () => {
    it("should emit workflow_cancelled and return failure when signal is aborted before first step", async () => {
      const controller = new AbortController();
      controller.abort();
      const context = makeContext({ signal: controller.signal });

      const workflow = makeWorkflow({
        steps: [makeStep({ id: "s1" })],
      });

      const { events, result } = await drainGenerator(
        executor.execute(workflow, context),
      );

      const types = events.map((e) => e.type);
      expect(types).toContain("workflow_cancelled");
      expect(result.success).toBe(false);
      expect(result.error?.code).toBe("CANCELLED");
    });

    it("should stop processing remaining steps after cancellation", async () => {
      const tool = {
        execute: jest.fn().mockResolvedValue({ success: true, data: "ran" }),
      };
      mockToolRegistry.tryGet.mockReturnValue(
        tool as unknown as ReturnType<ToolRegistry["tryGet"]>,
      );
      executor.setRegistries(
        mockToolRegistry as unknown as ToolRegistry,
        {} as SkillRegistry,
        {} as AgentRegistry,
      );

      const controller = new AbortController();
      // Abort after first step starts but before second is checked
      let callCount = 0;
      tool.execute = jest.fn().mockImplementation(async () => {
        callCount++;
        controller.abort();
        return { success: true, data: "ran" };
      });

      const context = makeContext({ signal: controller.signal });
      const workflow = makeWorkflow({
        steps: [
          makeStep({ id: "s1", executor: "my-tool" }),
          makeStep({ id: "s2", executor: "my-tool" }),
        ],
      });

      const { result } = await drainGenerator(
        executor.execute(workflow, context),
      );

      // Only one step should have run, then cancelled
      expect(callCount).toBe(1);
      expect(result.success).toBe(false);
    });
  });

  // --------------------------------------------------------------------------
  // Error handling
  // --------------------------------------------------------------------------

  describe("error handling", () => {
    it("should emit step_failed event when step fails", async () => {
      const tool = {
        execute: jest
          .fn()
          .mockResolvedValue({ success: false, error: { message: "boom" } }),
      };
      mockToolRegistry.tryGet.mockReturnValue(
        tool as unknown as ReturnType<ToolRegistry["tryGet"]>,
      );
      executor.setRegistries(
        mockToolRegistry as unknown as ToolRegistry,
        {} as SkillRegistry,
        {} as AgentRegistry,
      );

      const workflow = makeWorkflow({
        steps: [makeStep({ id: "s1", type: "tool", executor: "my-tool" })],
      });
      const context = makeContext();

      const { events } = await drainGenerator(
        executor.execute(workflow, context),
      );

      const types = events.map((e) => e.type);
      expect(types).toContain("step_failed");
    });

    it("should abort workflow and emit workflow_failed when onError.strategy is abort", async () => {
      const tool = {
        execute: jest.fn().mockResolvedValue({
          success: false,
          error: { message: "step error" },
        }),
      };
      mockToolRegistry.tryGet.mockReturnValue(
        tool as unknown as ReturnType<ToolRegistry["tryGet"]>,
      );
      executor.setRegistries(
        mockToolRegistry as unknown as ToolRegistry,
        {} as SkillRegistry,
        {} as AgentRegistry,
      );

      const workflow = makeWorkflow({
        steps: [
          makeStep({
            id: "s1",
            type: "tool",
            executor: "my-tool",
            onError: { strategy: "abort" },
          }),
          makeStep({
            id: "s2",
            type: "tool",
            executor: "my-tool",
          }),
        ],
      });
      const context = makeContext();

      const { events, result } = await drainGenerator(
        executor.execute(workflow, context),
      );

      const types = events.map((e) => e.type);
      expect(types).toContain("workflow_failed");
      expect(result.success).toBe(false);
      // When tool.execute returns success:false, the error is thrown and caught by
      // executeStep's catch block, resulting in STEP_EXECUTION_ERROR code
      expect(result.error?.code).toBe("STEP_EXECUTION_ERROR");
      expect(result.error?.stepId).toBe("s1");

      // Second step should NOT have executed
      expect(tool.execute).toHaveBeenCalledTimes(1);
    });

    it("should continue to next step when onError.strategy is skip", async () => {
      const tool = jest.fn();
      tool
        .mockResolvedValueOnce({
          success: false,
          error: { message: "skip me" },
        })
        .mockResolvedValueOnce({ success: true, data: "step-2 output" });

      mockToolRegistry.tryGet.mockReturnValue({
        execute: tool,
      } as unknown as ReturnType<ToolRegistry["tryGet"]>);
      executor.setRegistries(
        mockToolRegistry as unknown as ToolRegistry,
        {} as SkillRegistry,
        {} as AgentRegistry,
      );

      const workflow = makeWorkflow({
        steps: [
          makeStep({
            id: "s1",
            type: "tool",
            executor: "my-tool",
            onError: { strategy: "skip" },
          }),
          makeStep({ id: "s2", type: "tool", executor: "my-tool" }),
        ],
      });
      const context = makeContext();

      const { result } = await drainGenerator(
        executor.execute(workflow, context),
      );

      expect(tool).toHaveBeenCalledTimes(2);
      expect(result.success).toBe(true);
    });

    it("should emit workflow_failed and return failure on unexpected exception", async () => {
      // When an unsupported step type is used, executeStep catches the error internally
      // and returns a failed StepResult. Since onError.strategy is "abort", it then
      // emits workflow_failed.
      const step = makeStep({
        type: "loop",
        onError: { strategy: "abort" },
      });
      const workflow = makeWorkflow({ steps: [step] });
      const context = makeContext();

      const { events, result } = await drainGenerator(
        executor.execute(workflow, context),
      );

      const types = events.map((e) => e.type);
      expect(types).toContain("workflow_failed");
      expect(result.success).toBe(false);
    });
  });

  // --------------------------------------------------------------------------
  // Condition / skip
  // --------------------------------------------------------------------------

  describe("conditional step skipping", () => {
    it("should emit step_skipped when condition is not met", async () => {
      const workflow = makeWorkflow({
        steps: [
          makeStep({
            id: "s1",
            type: "tool",
            executor: "my-tool",
            condition: { expression: "false" },
          }),
        ],
      });
      const context = makeContext();

      const { events } = await drainGenerator(
        executor.execute(workflow, context),
      );

      const types = events.map((e) => e.type);
      expect(types).toContain("step_skipped");
    });
  });

  // --------------------------------------------------------------------------
  // Result structure
  // --------------------------------------------------------------------------

  describe("result structure", () => {
    it("should include stepResults array in result", async () => {
      const tool = {
        execute: jest.fn().mockResolvedValue({ success: true, data: "out" }),
      };
      mockToolRegistry.tryGet.mockReturnValue(
        tool as unknown as ReturnType<ToolRegistry["tryGet"]>,
      );
      executor.setRegistries(
        mockToolRegistry as unknown as ToolRegistry,
        {} as SkillRegistry,
        {} as AgentRegistry,
      );

      const workflow = makeWorkflow({
        steps: [makeStep({ id: "s1", type: "tool", executor: "my-tool" })],
      });
      const context = makeContext();

      const { result } = await drainGenerator(
        executor.execute(workflow, context),
      );

      expect(result.stepResults).toBeInstanceOf(Array);
      expect(result.stepResults.length).toBeGreaterThan(0);
    });

    it("should record startTime, endTime, duration in result", async () => {
      const workflow = makeWorkflow({ steps: [] });
      const context = makeContext();

      const { result } = await drainGenerator(
        executor.execute(workflow, context),
      );

      expect(result.startTime).toBeInstanceOf(Date);
      expect(result.endTime).toBeInstanceOf(Date);
      expect(result.duration).toBeGreaterThanOrEqual(0);
    });
  });
});
