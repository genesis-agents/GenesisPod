/**
 * BaseExecutor Extended Tests - covers uncovered branches
 */

import { Logger } from "@nestjs/common";
import { BaseExecutor } from "../base-executor";
import {
  Workflow,
  WorkflowStep,
  ExecutionContext,
  ExecutionEvent,
  ExecutionResult,
  StepResult,
} from "../../abstractions/orchestrator.interface";

// Concrete subclass that exposes protected methods
class ExtendedTestExecutor extends BaseExecutor {
  readonly id = "extended-test-executor";
  readonly supportedModes = ["extended-test"];

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

  public exposeExecuteHandler(
    handlerId: string,
    input: unknown,
    context: ExecutionContext,
  ): Promise<unknown> {
    return this.executeHandler(handlerId, input, context);
  }

  public exposeExecuteMap(
    step: WorkflowStep,
    input: unknown,
    context: ExecutionContext,
  ): Promise<unknown[]> {
    return this.executeMap(step, input, context);
  }

  public exposeExecuteParallelSteps(
    step: WorkflowStep,
    context: ExecutionContext,
  ): Promise<unknown[]> {
    return this.executeParallelSteps(step, context);
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

  public exposeResolveInput(
    input: WorkflowStep["input"],
    context: ExecutionContext,
  ): unknown {
    return this.resolveInput(input, context);
  }
}

function makeContext(overrides?: Partial<ExecutionContext>): ExecutionContext {
  return {
    executionId: "exec-ext-1",
    workflowId: "wf-ext-1",
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

describe("BaseExecutor (extended coverage)", () => {
  let executor: ExtendedTestExecutor;

  beforeEach(() => {
    executor = new ExtendedTestExecutor();
    jest.spyOn(Logger.prototype, "log").mockImplementation();
    jest.spyOn(Logger.prototype, "warn").mockImplementation();
    jest.spyOn(Logger.prototype, "error").mockImplementation();
    jest.spyOn(Logger.prototype, "debug").mockImplementation();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  // -------------------------------------------------------------------------
  // setCircuitBreaker / setProgressTracker / setHandlerRegistry
  // -------------------------------------------------------------------------

  describe("setter methods", () => {
    it("setCircuitBreaker sets the circuit breaker", () => {
      const cb = {
        canExecute: jest.fn(),
        recordSuccess: jest.fn(),
        recordFailure: jest.fn(),
        parseErrorType: jest.fn(),
      } as any;
      executor.setCircuitBreaker(cb);
      // After setting, the executor stores it (no direct getter, but we can verify via step execution)
      expect(() => executor.setCircuitBreaker(cb)).not.toThrow();
    });

    it("setProgressTracker sets the progress tracker", () => {
      const pt = { reportProgress: jest.fn() } as any;
      executor.setProgressTracker(pt);
      expect(() => executor.setProgressTracker(pt)).not.toThrow();
    });

    it("setHandlerRegistry sets the handler registry", () => {
      const hr = { getOrThrow: jest.fn() } as any;
      executor.setHandlerRegistry(hr);
      expect(() => executor.setHandlerRegistry(hr)).not.toThrow();
    });
  });

  // -------------------------------------------------------------------------
  // executeStep - circuit breaker open branch
  // -------------------------------------------------------------------------

  describe("executeStep - circuit breaker open", () => {
    it("should return failed result when circuit breaker is open", async () => {
      const mockCb = {
        canExecute: jest.fn().mockReturnValue(false),
        recordSuccess: jest.fn(),
        recordFailure: jest.fn(),
        parseErrorType: jest.fn().mockReturnValue("unknown"),
      } as any;
      executor.setCircuitBreaker(mockCb);

      const step = makeStep({ executor: "broken-tool" });
      const context = makeContext();

      const result = await executor.exposeExecuteStep(step, context);
      expect(result.status).toBe("failed");
      expect(result.error?.code).toBe("CIRCUIT_BREAKER_OPEN");
      expect(mockCb.canExecute).toHaveBeenCalledWith("broken-tool");
    });

    it("should record circuit breaker success after step completion", async () => {
      const mockCb = {
        canExecute: jest.fn().mockReturnValue(true),
        recordSuccess: jest.fn(),
        recordFailure: jest.fn(),
        parseErrorType: jest.fn().mockReturnValue("unknown"),
      } as any;
      executor.setCircuitBreaker(mockCb);

      const mockTool = {
        execute: jest.fn().mockResolvedValue({ success: true, data: "result" }),
      };
      const mockRegistry = {
        tryGet: jest.fn().mockReturnValue(mockTool),
        has: jest.fn().mockReturnValue(true),
      } as any;
      executor.setRegistries(mockRegistry, {} as any, {} as any);

      const step = makeStep({ type: "tool", executor: "my-tool" });
      const context = makeContext();

      const result = await executor.exposeExecuteStep(step, context);
      expect(result.status).toBe("completed");
      expect(mockCb.recordSuccess).toHaveBeenCalledWith(
        "my-tool",
        expect.any(Number),
      );
    });

    it("should record circuit breaker failure when step throws", async () => {
      const mockCb = {
        canExecute: jest.fn().mockReturnValue(true),
        recordSuccess: jest.fn(),
        recordFailure: jest.fn(),
        parseErrorType: jest.fn().mockReturnValue("unknown"),
      } as any;
      executor.setCircuitBreaker(mockCb);

      const mockTool = {
        execute: jest.fn().mockRejectedValue(new Error("Tool error")),
      };
      const mockRegistry = {
        tryGet: jest.fn().mockReturnValue(mockTool),
        has: jest.fn().mockReturnValue(true),
      } as any;
      executor.setRegistries(mockRegistry, {} as any, {} as any);

      const step = makeStep({ type: "tool", executor: "my-tool" });
      const context = makeContext();

      const result = await executor.exposeExecuteStep(step, context);
      expect(result.status).toBe("failed");
      expect(mockCb.recordFailure).toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // executeStep - retry strategy
  // -------------------------------------------------------------------------

  describe("executeStep - retry strategy", () => {
    it("should use retry strategy when step.retry.maxAttempts > 1", async () => {
      const mockTool = {
        execute: jest
          .fn()
          .mockResolvedValue({ success: true, data: "retried" }),
      };
      const mockRegistry = {
        tryGet: jest.fn().mockReturnValue(mockTool),
        has: jest.fn().mockReturnValue(true),
      } as any;
      executor.setRegistries(mockRegistry, {} as any, {} as any);

      const step = makeStep({
        type: "tool",
        executor: "my-tool",
        retry: { maxAttempts: 2, delay: 10 },
      });
      const context = makeContext();

      const result = await executor.exposeExecuteStep(step, context);
      expect(result.status).toBe("completed");
    });

    it("should fail step when retry exhausted", async () => {
      const mockTool = {
        execute: jest.fn().mockRejectedValue(new Error("Always fails")),
      };
      const mockRegistry = {
        tryGet: jest.fn().mockReturnValue(mockTool),
        has: jest.fn().mockReturnValue(true),
      } as any;
      executor.setRegistries(mockRegistry, {} as any, {} as any);

      const step = makeStep({
        type: "tool",
        executor: "my-tool",
        retry: { maxAttempts: 2, delay: 10 },
      });
      const context = makeContext();

      const result = await executor.exposeExecuteStep(step, context);
      expect(result.status).toBe("failed");
    });
  });

  // -------------------------------------------------------------------------
  // executeStep - step.output.toContext
  // -------------------------------------------------------------------------

  describe("executeStep - output.toContext", () => {
    it("should save output to context state when toContext is specified", async () => {
      const mockTool = {
        execute: jest
          .fn()
          .mockResolvedValue({ success: true, data: "saved-value" }),
      };
      const mockRegistry = {
        tryGet: jest.fn().mockReturnValue(mockTool),
      } as any;
      executor.setRegistries(mockRegistry, {} as any, {} as any);

      const step = makeStep({
        type: "tool",
        executor: "my-tool",
        output: { toContext: "result.value" },
      });
      const context = makeContext();

      await executor.exposeExecuteStep(step, context);
      expect((context.state as any)?.result?.value).toBe("saved-value");
    });
  });

  // -------------------------------------------------------------------------
  // executeStepByType - handler, map, parallel, wait, transform, decision, default
  // -------------------------------------------------------------------------

  describe("executeStepByType - type routing", () => {
    it("should execute wait step", async () => {
      jest.useFakeTimers();
      const step = makeStep({ type: "wait", executor: "none" });
      const context = makeContext();

      const promise = executor.exposeExecuteStepByType(step, 100, context);
      jest.advanceTimersByTime(100);
      await promise;
      jest.useRealTimers();
    });

    it("should execute transform step with no transform config", async () => {
      const step = makeStep({ type: "transform", executor: "none" });
      const context = makeContext();

      const result = await executor.exposeExecuteStepByType(
        step,
        { x: 1 },
        context,
      );
      expect(result).toEqual({ x: 1 });
    });

    it("should execute transform step with expression", async () => {
      const step = makeStep({
        type: "transform",
        executor: "none",
        output: { transform: "input.x + 1" },
      });
      const context = makeContext();

      const result = await executor.exposeExecuteStepByType(
        step,
        { x: 5 },
        context,
      );
      expect(result).toBe(6);
    });

    it("should execute decision step with no condition", async () => {
      const step = makeStep({ type: "decision", executor: "none" });
      const context = makeContext();

      const result = await executor.exposeExecuteStepByType(step, {}, context);
      expect(result).toBe(true);
    });

    it("should execute decision step with condition expression", async () => {
      const step = makeStep({
        type: "decision",
        executor: "none",
        condition: { expression: "1 === 1" },
      });
      const context = makeContext();

      const result = await executor.exposeExecuteStepByType(step, {}, context);
      expect(result).toBe(true);
    });

    it("should throw for unsupported step type", async () => {
      const step = makeStep({ type: "unsupported-type" as any });
      const context = makeContext();

      await expect(
        executor.exposeExecuteStepByType(step, {}, context),
      ).rejects.toThrow("Unsupported step type: unsupported-type");
    });

    it("should throw for handler type when no handlerRegistry set", async () => {
      const step = makeStep({ type: "handler", executor: "my-handler" });
      const context = makeContext();

      await expect(
        executor.exposeExecuteStepByType(step, {}, context),
      ).rejects.toThrow("Handler registry not set");
    });

    it("should throw for map type when input is not array", async () => {
      const step = makeStep({ type: "map", executor: "my-handler" });
      const context = makeContext();

      // Map step requires array input, we set handler registry so it passes that check
      const hr = {
        getOrThrow: jest
          .fn()
          .mockReturnValue({ execute: jest.fn().mockResolvedValue("r") }),
      } as any;
      executor.setHandlerRegistry(hr);

      await expect(
        executor.exposeExecuteStepByType(step, "not-array", context),
      ).rejects.toThrow("expects array input");
    });

    it("should throw for parallel type when no metadata.steps", async () => {
      const step = makeStep({ type: "parallel", executor: "none" });
      const context = makeContext();

      await expect(
        executor.exposeExecuteStepByType(step, {}, context),
      ).rejects.toThrow("requires metadata.steps array");
    });
  });

  // -------------------------------------------------------------------------
  // executeHandler
  // -------------------------------------------------------------------------

  describe("executeHandler", () => {
    it("should throw when handlerRegistry not set", async () => {
      const context = makeContext();
      await expect(
        executor.exposeExecuteHandler("my-handler", {}, context),
      ).rejects.toThrow("Handler registry not set");
    });

    it("should execute handler successfully", async () => {
      const mockHandler = {
        execute: jest.fn().mockResolvedValue("handler-result"),
      };
      const hr = { getOrThrow: jest.fn().mockReturnValue(mockHandler) } as any;
      executor.setHandlerRegistry(hr);

      const context = makeContext();
      const result = await executor.exposeExecuteHandler(
        "my-handler",
        { input: "x" },
        context,
      );
      expect(result).toBe("handler-result");
    });

    it("should call handler.prepare if available", async () => {
      const mockHandler = {
        prepare: jest.fn().mockResolvedValue({ prepared: true }),
        execute: jest.fn().mockResolvedValue("prepared-result"),
      };
      const hr = { getOrThrow: jest.fn().mockReturnValue(mockHandler) } as any;
      executor.setHandlerRegistry(hr);

      const context = makeContext();
      const result = await executor.exposeExecuteHandler(
        "my-handler",
        {},
        context,
      );
      expect(mockHandler.prepare).toHaveBeenCalled();
      expect(mockHandler.execute).toHaveBeenCalledWith(
        { prepared: true },
        context,
      );
      expect(result).toBe("prepared-result");
    });

    it("should call handler.validate if available and throw when invalid", async () => {
      const mockHandler = {
        execute: jest.fn().mockResolvedValue("invalid-result"),
        validate: jest.fn().mockResolvedValue(false),
      };
      const hr = { getOrThrow: jest.fn().mockReturnValue(mockHandler) } as any;
      executor.setHandlerRegistry(hr);

      const context = makeContext();
      await expect(
        executor.exposeExecuteHandler("my-handler", {}, context),
      ).rejects.toThrow("output validation failed");
    });

    it("should pass when handler.validate returns true", async () => {
      const mockHandler = {
        execute: jest.fn().mockResolvedValue("valid-result"),
        validate: jest.fn().mockResolvedValue(true),
      };
      const hr = { getOrThrow: jest.fn().mockReturnValue(mockHandler) } as any;
      executor.setHandlerRegistry(hr);

      const context = makeContext();
      const result = await executor.exposeExecuteHandler(
        "my-handler",
        {},
        context,
      );
      expect(result).toBe("valid-result");
    });
  });

  // -------------------------------------------------------------------------
  // executeMap
  // -------------------------------------------------------------------------

  describe("executeMap", () => {
    it("should map over array and execute handler for each item", async () => {
      const mockHandler = {
        execute: jest
          .fn()
          .mockImplementation(
            async (input: unknown) => `processed-${JSON.stringify(input)}`,
          ),
      };
      const hr = { getOrThrow: jest.fn().mockReturnValue(mockHandler) } as any;
      executor.setHandlerRegistry(hr);

      const step = makeStep({ type: "map", executor: "my-handler" });
      const context = makeContext();

      const result = await executor.exposeExecuteMap(step, [1, 2, 3], context);
      expect(result).toHaveLength(3);
    });

    it("should throw when input is not an array", async () => {
      const step = makeStep({ type: "map", executor: "my-handler" });
      const context = makeContext();

      await expect(
        executor.exposeExecuteMap(step, "not-array", context),
      ).rejects.toThrow("expects array input");
    });

    it("should skip failed items by default (onItemError=skip)", async () => {
      let callCount = 0;
      const mockHandler = {
        execute: jest.fn().mockImplementation(async () => {
          callCount++;
          if (callCount === 2) throw new Error("Item 2 failed");
          return `ok-${callCount}`;
        }),
      };
      const hr = { getOrThrow: jest.fn().mockReturnValue(mockHandler) } as any;
      executor.setHandlerRegistry(hr);

      const step = makeStep({ type: "map", executor: "my-handler" });
      const context = makeContext();

      const result = await executor.exposeExecuteMap(step, [1, 2, 3], context);
      // Item 2 failed and was skipped, so only 2 results
      expect(result).toHaveLength(2);
    });

    it("should throw when onItemError=abort and an item fails", async () => {
      const mockHandler = {
        execute: jest.fn().mockRejectedValue(new Error("All items fail")),
      };
      const hr = { getOrThrow: jest.fn().mockReturnValue(mockHandler) } as any;
      executor.setHandlerRegistry(hr);

      const step = makeStep({
        type: "map",
        executor: "my-handler",
        metadata: { onItemError: "abort" },
      });
      const context = makeContext();

      await expect(
        executor.exposeExecuteMap(step, [1], context),
      ).rejects.toThrow("All items fail");
    });
  });

  // -------------------------------------------------------------------------
  // executeParallelSteps
  // -------------------------------------------------------------------------

  describe("executeParallelSteps", () => {
    it("should throw when no metadata.steps", async () => {
      const step = makeStep({ type: "parallel", executor: "none" });
      const context = makeContext();

      await expect(
        executor.exposeExecuteParallelSteps(step, context),
      ).rejects.toThrow("requires metadata.steps array");
    });

    it("should execute all sub-steps in parallel", async () => {
      const mockTool = {
        execute: jest
          .fn()
          .mockResolvedValue({ success: true, data: "parallel-result" }),
      };
      const mockRegistry = {
        tryGet: jest.fn().mockReturnValue(mockTool),
      } as any;
      executor.setRegistries(mockRegistry, {} as any, {} as any);

      const subStep1 = makeStep({
        id: "sub-1",
        type: "tool",
        executor: "my-tool",
      });
      const subStep2 = makeStep({
        id: "sub-2",
        type: "tool",
        executor: "my-tool",
      });
      const step = makeStep({
        type: "parallel",
        executor: "none",
        metadata: { steps: [subStep1, subStep2] },
      });
      const context = makeContext();

      const results = await executor.exposeExecuteParallelSteps(step, context);
      expect(results).toHaveLength(2);
    });
  });

  // -------------------------------------------------------------------------
  // executeTool - error paths
  // -------------------------------------------------------------------------

  describe("executeTool - error paths", () => {
    it("should throw when toolRegistry not set", async () => {
      const context = makeContext();
      await expect(
        executor.exposeExecuteTool("my-tool", {}, context),
      ).rejects.toThrow("Tool registry not set");
    });

    it("should throw when tool not found", async () => {
      const mockRegistry = { tryGet: jest.fn().mockReturnValue(null) } as any;
      executor.setRegistries(mockRegistry, {} as any, {} as any);

      const context = makeContext();
      await expect(
        executor.exposeExecuteTool("missing-tool", {}, context),
      ).rejects.toThrow("Tool not found: missing-tool");
    });

    it("should throw when tool execution fails", async () => {
      const mockTool = {
        execute: jest.fn().mockResolvedValue({
          success: false,
          error: { message: "Tool failed" },
        }),
      };
      const mockRegistry = {
        tryGet: jest.fn().mockReturnValue(mockTool),
      } as any;
      executor.setRegistries(mockRegistry, {} as any, {} as any);

      const context = makeContext();
      await expect(
        executor.exposeExecuteTool("my-tool", {}, context),
      ).rejects.toThrow("Tool failed");
    });
  });

  // -------------------------------------------------------------------------
  // executeSkill - error paths
  // -------------------------------------------------------------------------

  describe("executeSkill - error paths", () => {
    it("should throw when skillRegistry not set", async () => {
      const context = makeContext();
      await expect(
        executor.exposeExecuteSkill("my-skill", {}, context),
      ).rejects.toThrow("Skill registry not set");
    });

    it("should throw when skill not found", async () => {
      const mockSkillRegistry = {
        tryGet: jest.fn().mockReturnValue(null),
      } as any;
      executor.setRegistries({} as any, mockSkillRegistry, {} as any);

      const context = makeContext();
      await expect(
        executor.exposeExecuteSkill("missing-skill", {}, context),
      ).rejects.toThrow("Skill not found: missing-skill");
    });

    it("should throw when skill execution fails", async () => {
      const mockSkill = {
        execute: jest.fn().mockResolvedValue({
          success: false,
          error: { message: "Skill failed" },
        }),
      };
      const mockSkillRegistry = {
        tryGet: jest.fn().mockReturnValue(mockSkill),
      } as any;
      executor.setRegistries({} as any, mockSkillRegistry, {} as any);

      const context = makeContext();
      await expect(
        executor.exposeExecuteSkill("my-skill", {}, context),
      ).rejects.toThrow("Skill failed");
    });

    it("should return skill data on success", async () => {
      const mockSkill = {
        execute: jest
          .fn()
          .mockResolvedValue({ success: true, data: "skill-output" }),
      };
      const mockSkillRegistry = {
        tryGet: jest.fn().mockReturnValue(mockSkill),
      } as any;
      executor.setRegistries({} as any, mockSkillRegistry, {} as any);

      const context = makeContext();
      const result = await executor.exposeExecuteSkill("my-skill", {}, context);
      expect(result).toBe("skill-output");
    });
  });

  // -------------------------------------------------------------------------
  // executeAgent - error paths
  // -------------------------------------------------------------------------

  describe("executeAgent - error paths", () => {
    it("should throw when agentRegistry not set", async () => {
      const context = makeContext();
      await expect(
        executor.exposeExecuteAgent("my-agent", {}, context),
      ).rejects.toThrow("Agent registry not set");
    });

    it("should throw when agent not found", async () => {
      const mockAgentRegistry = {
        tryGet: jest.fn().mockReturnValue(null),
      } as any;
      executor.setRegistries({} as any, {} as any, mockAgentRegistry);

      const context = makeContext();
      await expect(
        executor.exposeExecuteAgent("missing-agent", {}, context),
      ).rejects.toThrow("Agent not found: missing-agent");
    });

    it("should execute agent and return artifacts", async () => {
      async function* fakeExecute() {
        yield {
          type: "complete",
          result: { success: true, artifacts: ["artifact-1"] },
        };
      }
      const mockAgent = {
        plan: jest.fn().mockResolvedValue({ steps: [] }),
        execute: jest.fn().mockReturnValue(fakeExecute()),
      };
      const mockAgentRegistry = {
        tryGet: jest.fn().mockReturnValue(mockAgent),
      } as any;
      executor.setRegistries({} as any, {} as any, mockAgentRegistry);

      const context = makeContext();
      const result = await executor.exposeExecuteAgent(
        "my-agent",
        "test prompt",
        context,
      );
      expect(result).toEqual(["artifact-1"]);
    });

    it("should throw when agent returns error event", async () => {
      async function* fakeExecute() {
        yield { type: "error", error: "Agent crashed" };
      }
      const mockAgent = {
        plan: jest.fn().mockResolvedValue({ steps: [] }),
        execute: jest.fn().mockReturnValue(fakeExecute()),
      };
      const mockAgentRegistry = {
        tryGet: jest.fn().mockReturnValue(mockAgent),
      } as any;
      executor.setRegistries({} as any, {} as any, mockAgentRegistry);

      const context = makeContext();
      await expect(
        executor.exposeExecuteAgent("my-agent", "test", context),
      ).rejects.toThrow("Agent crashed");
    });

    it("should throw when agent complete result is not success", async () => {
      async function* fakeExecute() {
        yield {
          type: "complete",
          result: { success: false, error: "Agent failed" },
        };
      }
      const mockAgent = {
        plan: jest.fn().mockResolvedValue({ steps: [] }),
        execute: jest.fn().mockReturnValue(fakeExecute()),
      };
      const mockAgentRegistry = {
        tryGet: jest.fn().mockReturnValue(mockAgent),
      } as any;
      executor.setRegistries({} as any, {} as any, mockAgentRegistry);

      const context = makeContext();
      await expect(
        executor.exposeExecuteAgent("my-agent", {}, context),
      ).rejects.toThrow("Agent failed");
    });
  });

  // -------------------------------------------------------------------------
  // executeCondition / evaluateExpression (disabled)
  // -------------------------------------------------------------------------

  describe("evaluateExpression", () => {
    it("should throw since evaluateExpression is disabled for security", () => {
      expect(() => executor.exposeEvaluateExpression("1+1", {})).toThrow(
        "disabled for security",
      );
    });
  });

  // -------------------------------------------------------------------------
  // evaluateCondition - error handling
  // -------------------------------------------------------------------------

  describe("evaluateCondition", () => {
    it("should return false when expression throws", () => {
      // Inject an unsafe expression that fails evaluation (rejected by SAFE_EXPRESSION)
      const context = makeContext();
      const result = executor.exposeEvaluateCondition("function(){}", context);
      expect(result).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // resolveInput - fromStep branch
  // -------------------------------------------------------------------------

  describe("resolveInput - fromStep", () => {
    it("should resolve input from step results", () => {
      const context = makeContext();
      context.stepResults.set("prev-step", {
        stepId: "prev-step",
        status: "completed",
        output: { data: { value: 42 } },
        startTime: new Date(),
        endTime: new Date(),
        duration: 0,
      });

      const step = makeStep({
        input: {
          fromStep: {
            resultValue: { stepId: "prev-step", path: "data.value" },
          },
        },
      });

      const result = executor.exposeResolveInput(step.input, context) as any;
      expect(result.resultValue).toBe(42);
    });

    it("should return empty resolved when fromStep has no output", () => {
      const context = makeContext();
      // No step results set

      const step = makeStep({
        input: {
          fromStep: {
            missing: { stepId: "nonexistent", path: "data" },
          },
        },
      });

      const result = executor.exposeResolveInput(step.input, context);
      // fromStep with missing step → no output → resolved = {} → returns context.input
      expect(result).toEqual(context.input);
    });
  });

  // -------------------------------------------------------------------------
  // executeStep - timeout
  // -------------------------------------------------------------------------

  describe("executeStep - timeout", () => {
    it("should time out a step that takes too long", async () => {
      jest.useRealTimers();
      const mockTool = {
        execute: jest
          .fn()
          .mockImplementation(
            () => new Promise((resolve) => setTimeout(resolve, 5000)),
          ),
      };
      const mockRegistry = {
        tryGet: jest.fn().mockReturnValue(mockTool),
      } as any;
      executor.setRegistries(mockRegistry, {} as any, {} as any);

      const step = makeStep({
        type: "tool",
        executor: "slow-tool",
        timeout: 50, // 50ms timeout
      });
      const context = makeContext();

      const result = await executor.exposeExecuteStep(step, context);
      expect(result.status).toBe("failed");
      expect(result.error?.message).toContain("timed out");
    }, 10000);
  });
});
