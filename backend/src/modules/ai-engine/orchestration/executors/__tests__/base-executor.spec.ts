/**
 * BaseExecutor Unit Tests
 * 执行器基类测试
 */

import { Logger } from "@nestjs/common";
import { BaseExecutor, IExecutor } from "../base-executor";
import {
  Workflow,
  WorkflowStep,
  ExecutionContext,
  ExecutionEvent,
  ExecutionResult,
  StepResult,
  StepStatus,
} from "../../abstractions/orchestrator.interface";
import { ToolRegistry } from "../../../tools/registry/tool-registry";
import { SkillRegistry } from "../../../skills/registry/skill-registry";
import { AgentRegistry } from "../../../agents/registry/agent-registry";

// ============================================================================
// Concrete subclass for testing abstract BaseExecutor
// ============================================================================

class TestExecutor extends BaseExecutor {
  readonly id = "test-executor";
  readonly supportedModes = ["test"];

  async *execute(
    workflow: Workflow,
    context: ExecutionContext,
  ): AsyncGenerator<ExecutionEvent, ExecutionResult> {
    yield this.createEvent("workflow_started", context);
    return {
      executionId: context.executionId,
      workflowId: workflow.id,
      success: true,
      stepResults: [],
      startTime: new Date(),
      endTime: new Date(),
      duration: 0,
    };
  }

  // Expose protected methods for testing
  public exposeExecuteStep(
    step: WorkflowStep,
    context: ExecutionContext,
  ): Promise<StepResult> {
    return this.executeStep(step, context);
  }

  public exposeExecuteStepByType(
    step: WorkflowStep,
    input: unknown,
    context: ExecutionContext,
  ): Promise<unknown> {
    return this.executeStepByType(step, input, context);
  }

  public exposeResolveInput(
    input: WorkflowStep["input"],
    context: ExecutionContext,
  ): unknown {
    return this.resolveInput(input, context);
  }

  public exposeEvaluateCondition(
    expression: string,
    context: ExecutionContext,
  ): boolean {
    return this.evaluateCondition(expression, context);
  }

  public exposeEvaluateExpression(expression: string, scope: object): unknown {
    return this.evaluateExpression(expression, scope);
  }

  public exposeGetContextValue(
    obj: Record<string, unknown>,
    path: string,
  ): unknown {
    return this.getContextValue(obj, path);
  }

  public exposeSetContextValue(
    obj: Record<string, unknown>,
    path: string,
    value: unknown,
  ): void {
    return this.setContextValue(obj, path, value);
  }

  public exposeCreateStepResult(
    stepId: string,
    status: StepStatus,
    startTime: Date,
    output?: unknown,
    error?: StepResult["error"],
  ): StepResult {
    return this.createStepResult(stepId, status, startTime, output, error);
  }

  public exposeCreateEvent(
    type: ExecutionEvent["type"],
    context: ExecutionContext,
    stepId?: string,
    data?: unknown,
  ): ExecutionEvent {
    return this.createEvent(type, context, stepId, data);
  }

  public exposeExecuteTool(
    toolId: string,
    input: unknown,
    context: ExecutionContext,
  ): Promise<unknown> {
    return this.executeTool(toolId, input, context);
  }

  public exposeExecuteSkill(
    skillId: string,
    input: unknown,
    context: ExecutionContext,
  ): Promise<unknown> {
    return this.executeSkill(skillId, input, context);
  }

  public exposeExecuteAgent(
    agentId: string,
    input: unknown,
    context: ExecutionContext,
  ): Promise<unknown> {
    return this.executeAgent(agentId, input, context);
  }

  public exposeExecuteWait(ms: number): Promise<void> {
    return this.executeWait(ms);
  }

  public exposeExecuteTransform(
    step: WorkflowStep,
    input: unknown,
    context: ExecutionContext,
  ): Promise<unknown> {
    return this.executeTransform(step, input, context);
  }

  public exposeExecuteDecision(
    step: WorkflowStep,
    context: ExecutionContext,
  ): Promise<unknown> {
    return this.executeDecision(step, context);
  }
}

// ============================================================================
// Helpers
// ============================================================================

function makeContext(overrides?: Partial<ExecutionContext>): ExecutionContext {
  return {
    executionId: "exec-1",
    workflowId: "wf-1",
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
    id: "wf-1",
    name: "Test Workflow",
    mode: "sequential",
    steps: [],
    ...overrides,
  };
}

// ============================================================================
// Tests
// ============================================================================

describe("BaseExecutor", () => {
  let executor: TestExecutor;

  beforeEach(() => {
    executor = new TestExecutor();
    jest.spyOn(Logger.prototype, "log").mockImplementation();
    jest.spyOn(Logger.prototype, "warn").mockImplementation();
    jest.spyOn(Logger.prototype, "error").mockImplementation();
    jest.spyOn(Logger.prototype, "debug").mockImplementation();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  // --------------------------------------------------------------------------
  // IExecutor contract
  // --------------------------------------------------------------------------

  describe("IExecutor interface contract", () => {
    it("should expose id property", () => {
      expect(executor.id).toBe("test-executor");
    });

    it("should expose supportedModes property", () => {
      expect(executor.supportedModes).toEqual(["test"]);
    });

    it("should satisfy IExecutor interface", () => {
      const iface: IExecutor = executor;
      expect(iface.id).toBeDefined();
      expect(iface.supportedModes).toBeDefined();
      expect(typeof iface.execute).toBe("function");
    });
  });

  // --------------------------------------------------------------------------
  // setRegistries
  // --------------------------------------------------------------------------

  describe("setRegistries()", () => {
    it("should set toolRegistry, skillRegistry, agentRegistry", () => {
      const toolRegistry = { tryGet: jest.fn() } as unknown as ToolRegistry;
      const skillRegistry = { tryGet: jest.fn() } as unknown as SkillRegistry;
      const agentRegistry = { tryGet: jest.fn() } as unknown as AgentRegistry;

      executor.setRegistries(toolRegistry, skillRegistry, agentRegistry);

      // After setting, executeTool should not throw "Tool registry not set"
      toolRegistry.tryGet = jest.fn().mockReturnValue(undefined);
      return expect(
        executor.exposeExecuteTool("nonexistent", {}, makeContext()),
      ).rejects.toThrow("Tool not found: nonexistent");
    });
  });

  // --------------------------------------------------------------------------
  // executeStep
  // --------------------------------------------------------------------------

  describe("executeStep()", () => {
    it("should return cancelled result when signal is aborted before execution", async () => {
      const controller = new AbortController();
      controller.abort();
      const context = makeContext({ signal: controller.signal });
      const step = makeStep({ type: "tool", executor: "tool-a" });

      const result = await executor.exposeExecuteStep(step, context);

      expect(result.stepId).toBe("step-1");
      expect(result.status).toBe("cancelled");
    });

    it("should return skipped result when condition evaluates to false", async () => {
      const context = makeContext();
      const step = makeStep({
        type: "tool",
        executor: "tool-a",
        condition: { expression: "false" },
      });

      const result = await executor.exposeExecuteStep(step, context);

      expect(result.status).toBe("skipped");
    });

    it("should return completed result on successful tool execution", async () => {
      const tool = {
        execute: jest.fn().mockResolvedValue({ success: true, data: "result" }),
      };
      const toolRegistry = {
        tryGet: jest.fn().mockReturnValue(tool),
      } as unknown as ToolRegistry;
      executor.setRegistries(
        toolRegistry,
        {} as SkillRegistry,
        {} as AgentRegistry,
      );

      const context = makeContext();
      const step = makeStep({ type: "tool", executor: "tool-a" });

      const result = await executor.exposeExecuteStep(step, context);

      expect(result.status).toBe("completed");
      expect(result.output).toBe("result");
      expect(context.stepResults.has("step-1")).toBe(true);
    });

    it("should return failed result when step throws an error", async () => {
      const tool = {
        execute: jest.fn().mockRejectedValue(new Error("tool crash")),
      };
      const toolRegistry = {
        tryGet: jest.fn().mockReturnValue(tool),
      } as unknown as ToolRegistry;
      executor.setRegistries(
        toolRegistry,
        {} as SkillRegistry,
        {} as AgentRegistry,
      );

      const context = makeContext();
      const step = makeStep({ type: "tool", executor: "tool-a" });

      const result = await executor.exposeExecuteStep(step, context);

      expect(result.status).toBe("failed");
      expect(result.error?.message).toBe("tool crash");
      expect(result.error?.code).toBe("STEP_EXECUTION_ERROR");
    });

    it("should save output to context via output.toContext", async () => {
      const tool = {
        execute: jest.fn().mockResolvedValue({ success: true, data: "value" }),
      };
      const toolRegistry = {
        tryGet: jest.fn().mockReturnValue(tool),
      } as unknown as ToolRegistry;
      executor.setRegistries(
        toolRegistry,
        {} as SkillRegistry,
        {} as AgentRegistry,
      );

      const context = makeContext();
      const step = makeStep({
        type: "tool",
        executor: "tool-a",
        output: { toContext: "result.data" },
      });

      await executor.exposeExecuteStep(step, context);

      expect((context.state as Record<string, unknown>)["result"]).toEqual({
        data: "value",
      });
    });
  });

  // --------------------------------------------------------------------------
  // executeStepByType
  // --------------------------------------------------------------------------

  describe("executeStepByType()", () => {
    it("should throw on unsupported step type", async () => {
      const step = makeStep({ type: "loop" });
      const context = makeContext();

      await expect(
        executor.exposeExecuteStepByType(step, {}, context),
      ).rejects.toThrow("Unsupported step type: loop");
    });

    it("should delegate 'wait' step type to executeWait", async () => {
      jest.useFakeTimers();
      const step = makeStep({ type: "wait", executor: "" });
      const context = makeContext();

      const promise = executor.exposeExecuteStepByType(step, 100, context);
      jest.advanceTimersByTime(100);
      await promise;

      jest.useRealTimers();
    });

    it("should delegate 'transform' step type", async () => {
      const step = makeStep({
        type: "transform",
        executor: "",
        output: { transform: "input.value" },
      });
      const context = makeContext();

      const result = await executor.exposeExecuteStepByType(
        step,
        { value: 42 },
        context,
      );

      expect(result).toBe(42);
    });

    it("should delegate 'decision' step type", async () => {
      const step = makeStep({
        type: "decision",
        executor: "",
        condition: { expression: "true" },
      });
      const context = makeContext();

      const result = await executor.exposeExecuteStepByType(step, {}, context);

      expect(result).toBe(true);
    });
  });

  // --------------------------------------------------------------------------
  // executeTool
  // --------------------------------------------------------------------------

  describe("executeTool()", () => {
    it("should throw when toolRegistry is not set", async () => {
      await expect(
        executor.exposeExecuteTool("tool-x", {}, makeContext()),
      ).rejects.toThrow("Tool registry not set");
    });

    it("should throw when tool is not found", async () => {
      const toolRegistry = {
        tryGet: jest.fn().mockReturnValue(undefined),
      } as unknown as ToolRegistry;
      executor.setRegistries(
        toolRegistry,
        {} as SkillRegistry,
        {} as AgentRegistry,
      );

      await expect(
        executor.exposeExecuteTool("unknown-tool", {}, makeContext()),
      ).rejects.toThrow("Tool not found: unknown-tool");
    });

    it("should throw when tool.execute returns success: false", async () => {
      const tool = {
        execute: jest.fn().mockResolvedValue({
          success: false,
          error: { message: "bad call" },
        }),
      };
      const toolRegistry = {
        tryGet: jest.fn().mockReturnValue(tool),
      } as unknown as ToolRegistry;
      executor.setRegistries(
        toolRegistry,
        {} as SkillRegistry,
        {} as AgentRegistry,
      );

      await expect(
        executor.exposeExecuteTool("tool-a", {}, makeContext()),
      ).rejects.toThrow("bad call");
    });

    it("should throw generic message when tool fails without error message", async () => {
      const tool = {
        execute: jest
          .fn()
          .mockResolvedValue({ success: false, error: undefined }),
      };
      const toolRegistry = {
        tryGet: jest.fn().mockReturnValue(tool),
      } as unknown as ToolRegistry;
      executor.setRegistries(
        toolRegistry,
        {} as SkillRegistry,
        {} as AgentRegistry,
      );

      await expect(
        executor.exposeExecuteTool("tool-a", {}, makeContext()),
      ).rejects.toThrow("Tool execution failed");
    });

    it("should return tool data on success", async () => {
      const tool = {
        execute: jest
          .fn()
          .mockResolvedValue({ success: true, data: { answer: 42 } }),
      };
      const toolRegistry = {
        tryGet: jest.fn().mockReturnValue(tool),
      } as unknown as ToolRegistry;
      executor.setRegistries(
        toolRegistry,
        {} as SkillRegistry,
        {} as AgentRegistry,
      );

      const result = await executor.exposeExecuteTool(
        "tool-a",
        { query: "test" },
        makeContext(),
      );

      expect(result).toEqual({ answer: 42 });
    });
  });

  // --------------------------------------------------------------------------
  // executeSkill
  // --------------------------------------------------------------------------

  describe("executeSkill()", () => {
    it("should throw when skillRegistry is not set", async () => {
      await expect(
        executor.exposeExecuteSkill("skill-x", {}, makeContext()),
      ).rejects.toThrow("Skill registry not set");
    });

    it("should throw when skill is not found", async () => {
      const skillRegistry = {
        tryGet: jest.fn().mockReturnValue(undefined),
      } as unknown as SkillRegistry;
      executor.setRegistries(
        {} as ToolRegistry,
        skillRegistry,
        {} as AgentRegistry,
      );

      await expect(
        executor.exposeExecuteSkill("unknown-skill", {}, makeContext()),
      ).rejects.toThrow("Skill not found: unknown-skill");
    });

    it("should throw when skill.execute returns success: false", async () => {
      const skill = {
        execute: jest.fn().mockResolvedValue({
          success: false,
          error: { message: "skill broke" },
        }),
      };
      const skillRegistry = {
        tryGet: jest.fn().mockReturnValue(skill),
      } as unknown as SkillRegistry;
      executor.setRegistries(
        {} as ToolRegistry,
        skillRegistry,
        {} as AgentRegistry,
      );

      await expect(
        executor.exposeExecuteSkill("skill-a", {}, makeContext()),
      ).rejects.toThrow("skill broke");
    });

    it("should throw generic message when skill fails without error message", async () => {
      const skill = {
        execute: jest
          .fn()
          .mockResolvedValue({ success: false, error: undefined }),
      };
      const skillRegistry = {
        tryGet: jest.fn().mockReturnValue(skill),
      } as unknown as SkillRegistry;
      executor.setRegistries(
        {} as ToolRegistry,
        skillRegistry,
        {} as AgentRegistry,
      );

      await expect(
        executor.exposeExecuteSkill("skill-a", {}, makeContext()),
      ).rejects.toThrow("Skill execution failed");
    });

    it("should return skill data on success", async () => {
      const skill = {
        execute: jest
          .fn()
          .mockResolvedValue({ success: true, data: "skill output" }),
      };
      const skillRegistry = {
        tryGet: jest.fn().mockReturnValue(skill),
      } as unknown as SkillRegistry;
      executor.setRegistries(
        {} as ToolRegistry,
        skillRegistry,
        {} as AgentRegistry,
      );

      const result = await executor.exposeExecuteSkill(
        "skill-a",
        {},
        makeContext(),
      );

      expect(result).toBe("skill output");
    });
  });

  // --------------------------------------------------------------------------
  // executeAgent
  // --------------------------------------------------------------------------

  describe("executeAgent()", () => {
    it("should throw when agentRegistry is not set", async () => {
      await expect(
        executor.exposeExecuteAgent("agent-x", {}, makeContext()),
      ).rejects.toThrow("Agent registry not set");
    });

    it("should throw when agent is not found", async () => {
      const agentRegistry = {
        tryGet: jest.fn().mockReturnValue(undefined),
      } as unknown as AgentRegistry;
      executor.setRegistries(
        {} as ToolRegistry,
        {} as SkillRegistry,
        agentRegistry,
      );

      await expect(
        executor.exposeExecuteAgent("unknown-agent", {}, makeContext()),
      ).rejects.toThrow("Agent not found: unknown-agent");
    });

    it("should throw when agent event type is error", async () => {
      async function* mockExecute() {
        yield { type: "error" as const, error: "agent crashed" };
      }
      const agent = {
        plan: jest.fn().mockResolvedValue({ steps: [] }),
        execute: jest.fn().mockReturnValue(mockExecute()),
      };
      const agentRegistry = {
        tryGet: jest.fn().mockReturnValue(agent),
      } as unknown as AgentRegistry;
      executor.setRegistries(
        {} as ToolRegistry,
        {} as SkillRegistry,
        agentRegistry,
      );

      await expect(
        executor.exposeExecuteAgent("agent-a", {}, makeContext()),
      ).rejects.toThrow("agent crashed");
    });

    it("should throw when agent complete event has success: false", async () => {
      async function* mockExecute() {
        yield {
          type: "complete" as const,
          result: { success: false, error: "plan failed" },
        };
      }
      const agent = {
        plan: jest.fn().mockResolvedValue({ steps: [] }),
        execute: jest.fn().mockReturnValue(mockExecute()),
      };
      const agentRegistry = {
        tryGet: jest.fn().mockReturnValue(agent),
      } as unknown as AgentRegistry;
      executor.setRegistries(
        {} as ToolRegistry,
        {} as SkillRegistry,
        agentRegistry,
      );

      await expect(
        executor.exposeExecuteAgent("agent-a", {}, makeContext()),
      ).rejects.toThrow("plan failed");
    });

    it("should return artifacts from complete event on success", async () => {
      async function* mockExecute() {
        yield {
          type: "complete" as const,
          result: { success: true, artifacts: ["artifact-1"] },
        };
      }
      const agent = {
        plan: jest.fn().mockResolvedValue({ steps: [] }),
        execute: jest.fn().mockReturnValue(mockExecute()),
      };
      const agentRegistry = {
        tryGet: jest.fn().mockReturnValue(agent),
      } as unknown as AgentRegistry;
      executor.setRegistries(
        {} as ToolRegistry,
        {} as SkillRegistry,
        agentRegistry,
      );

      const result = await executor.exposeExecuteAgent(
        "agent-a",
        "do something",
        makeContext(),
      );

      expect(result).toEqual(["artifact-1"]);
    });

    it("should stringify non-string input to agent prompt", async () => {
      async function* mockExecute() {
        yield {
          type: "complete" as const,
          result: { success: true, artifacts: null },
        };
      }
      const agent = {
        plan: jest.fn().mockResolvedValue({ steps: [] }),
        execute: jest.fn().mockReturnValue(mockExecute()),
      };
      const agentRegistry = {
        tryGet: jest.fn().mockReturnValue(agent),
      } as unknown as AgentRegistry;
      executor.setRegistries(
        {} as ToolRegistry,
        {} as SkillRegistry,
        agentRegistry,
      );

      await executor.exposeExecuteAgent(
        "agent-a",
        { key: "value" },
        makeContext(),
      );

      expect(agent.plan).toHaveBeenCalledWith(
        expect.objectContaining({
          prompt: JSON.stringify({ key: "value" }),
        }),
      );
    });
  });

  // --------------------------------------------------------------------------
  // executeWait
  // --------------------------------------------------------------------------

  describe("executeWait()", () => {
    it("should resolve after given milliseconds", async () => {
      jest.useFakeTimers();
      let resolved = false;

      const promise = executor.exposeExecuteWait(500).then(() => {
        resolved = true;
      });

      expect(resolved).toBe(false);
      jest.advanceTimersByTime(500);
      await promise;
      expect(resolved).toBe(true);

      jest.useRealTimers();
    });
  });

  // --------------------------------------------------------------------------
  // executeTransform
  // --------------------------------------------------------------------------

  describe("executeTransform()", () => {
    it("should return input unchanged when no transform expression", async () => {
      const step = makeStep({ type: "transform", executor: "" });
      const input = { value: "raw" };

      const result = await executor.exposeExecuteTransform(
        step,
        input,
        makeContext(),
      );

      expect(result).toEqual(input);
    });

    it("should evaluate transform expression against input", async () => {
      const step = makeStep({
        type: "transform",
        executor: "",
        output: { transform: "input.value * 2" },
      });

      const result = await executor.exposeExecuteTransform(
        step,
        { value: 5 },
        makeContext(),
      );

      expect(result).toBe(10);
    });
  });

  // --------------------------------------------------------------------------
  // executeDecision
  // --------------------------------------------------------------------------

  describe("executeDecision()", () => {
    it("should return true when no condition is defined", async () => {
      const step = makeStep({ type: "decision", executor: "" });
      const result = await executor.exposeExecuteDecision(step, makeContext());
      expect(result).toBe(true);
    });

    it("should evaluate condition expression", async () => {
      const step = makeStep({
        type: "decision",
        executor: "",
        condition: { expression: "1 === 1" },
      });

      const result = await executor.exposeExecuteDecision(step, makeContext());
      expect(result).toBe(true);
    });

    it("should return false for false condition", async () => {
      const step = makeStep({
        type: "decision",
        executor: "",
        condition: { expression: "1 === 2" },
      });

      const result = await executor.exposeExecuteDecision(step, makeContext());
      expect(result).toBe(false);
    });
  });

  // --------------------------------------------------------------------------
  // resolveInput
  // --------------------------------------------------------------------------

  describe("resolveInput()", () => {
    it("should return context.input when no input config provided", () => {
      const context = makeContext({ input: { prompt: "test" } });
      const result = executor.exposeResolveInput(undefined, context);
      expect(result).toEqual({ prompt: "test" });
    });

    it("should merge static values into resolved input", () => {
      const context = makeContext();
      const result = executor.exposeResolveInput(
        { static: { key: "staticValue" } },
        context,
      );
      expect(result).toMatchObject({ key: "staticValue" });
    });

    it("should resolve fromContext mapping", () => {
      const context = makeContext({
        state: { user: { name: "Alice" } },
      });
      const result = executor.exposeResolveInput(
        { fromContext: { username: "user.name" } },
        context,
      );
      expect(result).toMatchObject({ username: "Alice" });
    });

    it("should resolve fromStep mapping", () => {
      const context = makeContext();
      context.stepResults.set("prev-step", {
        stepId: "prev-step",
        status: "completed",
        output: { data: { count: 5 } },
        startTime: new Date(),
      });

      const result = executor.exposeResolveInput(
        {
          fromStep: {
            count: { stepId: "prev-step", path: "data.count" },
          },
        },
        context,
      );

      expect(result).toMatchObject({ count: 5 });
    });

    it("should evaluate expression input", () => {
      const context = makeContext({ input: { x: 10 } });
      const result = executor.exposeResolveInput(
        { expression: "input.x + 5" },
        context,
      );
      expect(result).toBe(15);
    });

    it("should return context.input when resolved object is empty", () => {
      const context = makeContext({ input: { fallback: true } });
      const result = executor.exposeResolveInput({}, context);
      expect(result).toEqual({ fallback: true });
    });

    it("should skip fromStep entry when step result has no output", () => {
      const context = makeContext();
      context.stepResults.set("prev-step", {
        stepId: "prev-step",
        status: "completed",
        output: undefined,
        startTime: new Date(),
      });

      const result = executor.exposeResolveInput(
        {
          fromStep: { key: { stepId: "prev-step", path: "some.path" } },
        },
        context,
      );

      // No static or fromContext merges, so resolved is empty → fallback to context.input
      expect(result).toEqual(context.input);
    });
  });

  // --------------------------------------------------------------------------
  // evaluateCondition
  // --------------------------------------------------------------------------

  describe("evaluateCondition()", () => {
    it("should return true for truthy expression", () => {
      const result = executor.exposeEvaluateCondition("1 > 0", makeContext());
      expect(result).toBe(true);
    });

    it("should return false for falsy expression", () => {
      const result = executor.exposeEvaluateCondition("false", makeContext());
      expect(result).toBe(false);
    });

    it("should return false when expression throws an error", () => {
      const result = executor.exposeEvaluateCondition(
        "undefinedVariable.property",
        makeContext(),
      );
      expect(result).toBe(false);
    });

    it("should access context variables in expression", () => {
      const context = makeContext({ input: { value: 100 } });
      const result = executor.exposeEvaluateCondition(
        "input.value > 50",
        context,
      );
      expect(result).toBe(true);
    });
  });

  // --------------------------------------------------------------------------
  // evaluateExpression (disabled — security)
  // --------------------------------------------------------------------------

  describe("evaluateExpression()", () => {
    it("should throw an error and not execute any code", () => {
      expect(() => executor.exposeEvaluateExpression("2 + 3", {})).toThrow(
        "evaluateExpression is disabled for security reasons",
      );
    });

    it("should throw regardless of the expression provided", () => {
      expect(() =>
        executor.exposeEvaluateExpression("x * y", { x: 4, y: 3 }),
      ).toThrow();
    });

    it("should throw even for safe-looking expressions", () => {
      expect(() => executor.exposeEvaluateExpression('"hello"', {})).toThrow();
    });
  });

  // --------------------------------------------------------------------------
  // getContextValue
  // --------------------------------------------------------------------------

  describe("getContextValue()", () => {
    it("should retrieve top-level value", () => {
      const obj = { name: "Alice" };
      expect(executor.exposeGetContextValue(obj, "name")).toBe("Alice");
    });

    it("should retrieve nested value via dot notation", () => {
      const obj = { user: { address: { city: "Tokyo" } } };
      expect(executor.exposeGetContextValue(obj, "user.address.city")).toBe(
        "Tokyo",
      );
    });

    it("should return undefined for missing path", () => {
      const obj = { a: 1 };
      expect(executor.exposeGetContextValue(obj, "a.b.c")).toBeUndefined();
    });

    it("should return undefined when intermediate value is null", () => {
      const obj = { a: null };
      expect(executor.exposeGetContextValue(obj, "a.b")).toBeUndefined();
    });
  });

  // --------------------------------------------------------------------------
  // setContextValue
  // --------------------------------------------------------------------------

  describe("setContextValue()", () => {
    it("should set top-level value", () => {
      const obj: Record<string, unknown> = {};
      executor.exposeSetContextValue(obj, "key", "val");
      expect(obj["key"]).toBe("val");
    });

    it("should create nested structure and set value", () => {
      const obj: Record<string, unknown> = {};
      executor.exposeSetContextValue(obj, "a.b.c", 42);
      expect((obj["a"] as Record<string, unknown>)["b"]).toEqual({ c: 42 });
    });

    it("should overwrite existing value", () => {
      const obj: Record<string, unknown> = { key: "old" };
      executor.exposeSetContextValue(obj, "key", "new");
      expect(obj["key"]).toBe("new");
    });
  });

  // --------------------------------------------------------------------------
  // createStepResult
  // --------------------------------------------------------------------------

  describe("createStepResult()", () => {
    it("should create a completed StepResult with output", () => {
      const start = new Date(Date.now() - 100);
      const result = executor.exposeCreateStepResult(
        "step-x",
        "completed",
        start,
        { data: "ok" },
      );

      expect(result.stepId).toBe("step-x");
      expect(result.status).toBe("completed");
      expect(result.output).toEqual({ data: "ok" });
      expect(result.duration).toBeGreaterThanOrEqual(0);
      expect(result.startTime).toBe(start);
      expect(result.endTime).toBeDefined();
    });

    it("should create a failed StepResult with error", () => {
      const start = new Date();
      const error = { code: "ERR", message: "something failed" };
      const result = executor.exposeCreateStepResult(
        "step-y",
        "failed",
        start,
        undefined,
        error,
      );

      expect(result.status).toBe("failed");
      expect(result.error).toEqual(error);
      expect(result.output).toBeUndefined();
    });

    it("should create a skipped StepResult", () => {
      const result = executor.exposeCreateStepResult(
        "step-z",
        "skipped",
        new Date(),
      );
      expect(result.status).toBe("skipped");
    });
  });

  // --------------------------------------------------------------------------
  // createEvent
  // --------------------------------------------------------------------------

  describe("createEvent()", () => {
    it("should create event with all required fields", () => {
      const context = makeContext();
      const event = executor.exposeCreateEvent(
        "workflow_started",
        context,
        undefined,
        { info: "started" },
      );

      expect(event.type).toBe("workflow_started");
      expect(event.executionId).toBe("exec-1");
      expect(event.workflowId).toBe("wf-1");
      expect(event.stepId).toBeUndefined();
      expect(event.timestamp).toBeInstanceOf(Date);
      expect(event.data).toEqual({ info: "started" });
    });

    it("should include stepId when provided", () => {
      const context = makeContext();
      const event = executor.exposeCreateEvent(
        "step_completed",
        context,
        "step-1",
      );

      expect(event.stepId).toBe("step-1");
    });
  });

  // --------------------------------------------------------------------------
  // execute (abstract implementation in TestExecutor)
  // --------------------------------------------------------------------------

  describe("execute() (via TestExecutor)", () => {
    it("should yield workflow_started event and return ExecutionResult", async () => {
      const workflow = makeWorkflow();
      const context = makeContext();
      const gen = executor.execute(workflow, context);

      const firstNext = await gen.next();
      expect(firstNext.done).toBe(false);
      expect((firstNext.value as ExecutionEvent).type).toBe("workflow_started");

      const second = await gen.next();
      expect(second.done).toBe(true);
      expect((second.value as ExecutionResult).success).toBe(true);
    });
  });
});
