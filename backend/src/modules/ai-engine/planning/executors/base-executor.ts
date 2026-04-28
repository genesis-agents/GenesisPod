/**
 * AI Engine - Base Executor
 * 执行器基类
 */

import { Logger } from "@nestjs/common";
import { JsonObject, JsonValue } from "../../core";
import {
  Workflow,
  WorkflowStep,
  ExecutionContext,
  ExecutionEvent,
  ExecutionResult,
  StepResult,
  StepStatus,
} from "../abstractions/orchestrator.interface";
import { ToolRegistry } from "../../tools/registry";
import { SkillRegistry } from "../../skills/registry";
import { AgentRegistry } from "../../facade/exports/registries";
import type { WorkflowHandlerRegistry } from "../handlers/handler-registry";
import type { MapStepConfig } from "../handlers/workflow-node-handler.interface";
import { RetryStrategy } from "./retry-strategy";
import type { CircuitBreakerService } from "../../safety/resilience/circuit-breaker.service";
// PR-X3: engine 端运行时依赖契约（无反向 import）
import type { IProgressTracker } from "./runtime-deps";

/**
 * 执行器接口
 */
export interface IExecutor {
  readonly id: string;
  readonly supportedModes: string[];
  execute(
    workflow: Workflow,
    context: ExecutionContext,
  ): AsyncGenerator<ExecutionEvent, ExecutionResult>;
}

/**
 * 执行器基类
 */
export abstract class BaseExecutor implements IExecutor {
  abstract readonly id: string;
  abstract readonly supportedModes: string[];

  protected readonly logger: Logger;
  protected toolRegistry?: ToolRegistry;
  protected skillRegistry?: SkillRegistry;
  protected agentRegistry?: AgentRegistry;
  protected handlerRegistry?: WorkflowHandlerRegistry;
  protected circuitBreaker?: CircuitBreakerService;
  protected progressTracker?: IProgressTracker;

  constructor() {
    this.logger = new Logger(this.constructor.name);
  }

  /**
   * 设置注册表
   */
  setRegistries(
    toolRegistry: ToolRegistry,
    skillRegistry: SkillRegistry,
    agentRegistry: AgentRegistry,
  ): void {
    this.toolRegistry = toolRegistry;
    this.skillRegistry = skillRegistry;
    this.agentRegistry = agentRegistry;
  }

  /**
   * 设置 Handler 注册表（可选，支持 "handler" / "map" step types）
   */
  setHandlerRegistry(handlerRegistry: WorkflowHandlerRegistry): void {
    this.handlerRegistry = handlerRegistry;
  }

  /**
   * 设置熔断器服务（可选，用于 step 级别健康检查）
   */
  setCircuitBreaker(circuitBreaker: CircuitBreakerService): void {
    this.circuitBreaker = circuitBreaker;
  }

  /**
   * 设置进度追踪器（可选，DAGExecutor 用于自动上报进度）
   */
  setProgressTracker(progressTracker: IProgressTracker): void {
    this.progressTracker = progressTracker;
  }

  /**
   * 执行工作流
   */
  abstract execute(
    workflow: Workflow,
    context: ExecutionContext,
  ): AsyncGenerator<ExecutionEvent, ExecutionResult>;

  /**
   * 执行单个步骤
   * 集成: 条件检查 → 熔断器检查 → 超时控制 → 重试策略 → 执行
   */
  protected async executeStep(
    step: WorkflowStep,
    context: ExecutionContext,
  ): Promise<StepResult> {
    const startTime = new Date();

    try {
      // 检查取消信号
      if (context.signal?.aborted) {
        return this.createStepResult(step.id, "cancelled", startTime);
      }

      // 检查条件
      if (step.condition) {
        const shouldExecute = this.evaluateCondition(
          step.condition.expression,
          context,
        );
        if (!shouldExecute) {
          return this.createStepResult(step.id, "skipped", startTime);
        }
      }

      // ★ 熔断器检查：executor 不可用时直接跳过
      if (this.circuitBreaker && step.executor) {
        if (!this.circuitBreaker.canExecute(step.executor)) {
          this.logger.warn(
            `Step "${step.id}" skipped: executor "${step.executor}" circuit is OPEN`,
          );
          const cbError = {
            code: "CIRCUIT_BREAKER_OPEN",
            message: `Executor "${step.executor}" is unavailable (circuit breaker open)`,
          };
          context.stepResults.set(step.id, {
            stepId: step.id,
            status: "failed",
            error: cbError,
            startTime,
            endTime: new Date(),
            duration: Date.now() - startTime.getTime(),
          });
          return this.createStepResult(
            step.id,
            "failed",
            startTime,
            undefined,
            cbError,
          );
        }
      }

      // 准备输入
      const input = this.resolveInput(step.input, context);

      // ★ 构建执行函数（含超时控制）
      const executeFn = async (): Promise<unknown> => {
        const execPromise = this.executeStepByType(step, input, context);

        // 超时控制：step.timeout 优先，否则无超时
        const timeout = step.timeout;
        if (timeout && timeout > 0) {
          return Promise.race([
            execPromise,
            new Promise<never>((_, reject) =>
              setTimeout(
                () =>
                  reject(
                    new Error(`Step "${step.id}" timed out after ${timeout}ms`),
                  ),
                timeout,
              ),
            ),
          ]);
        }

        return execPromise;
      };

      // ★ 重试策略：step.retry 配置驱动
      let output: unknown;
      let retryCount = 0;

      if (step.retry && step.retry.maxAttempts > 1) {
        const strategy = new RetryStrategy({
          maxRetries: step.retry.maxAttempts - 1,
          initialDelay: step.retry.delay,
          maxDelay: step.retry.maxDelay ?? 30000,
          backoffMultiplier: step.retry.backoffMultiplier ?? 2,
          jitter: true,
        });

        const result = await strategy.executeWithRetry(
          executeFn,
          step.executor || step.id,
          `step:${step.id}`,
        );

        retryCount = result.attempts - 1;

        if (!result.success) {
          throw (
            result.error?.originalError ||
            new Error(
              result.error?.message || "Step execution failed after retries",
            )
          );
        }
        output = result.data;
      } else {
        output = await executeFn();
      }

      // ★ 熔断器记录成功
      if (this.circuitBreaker && step.executor) {
        this.circuitBreaker.recordSuccess(
          step.executor,
          Date.now() - startTime.getTime(),
        );
      }

      // 保存输出
      if (step.output?.toContext) {
        this.setContextValue(context.state, step.output.toContext, output);
      }

      // 保存步骤结果
      context.stepResults.set(step.id, {
        stepId: step.id,
        status: "completed",
        output,
        startTime,
        endTime: new Date(),
        duration: Date.now() - startTime.getTime(),
        retryCount,
      });

      return this.createStepResult(step.id, "completed", startTime, output);
    } catch (error) {
      const stepError = {
        code: "STEP_EXECUTION_ERROR",
        message: (error as Error).message,
        stack: (error as Error).stack,
      };

      // ★ 熔断器记录失败
      if (this.circuitBreaker && step.executor) {
        const errorType = this.circuitBreaker.parseErrorType(
          (error as Error).message,
        );
        this.circuitBreaker.recordFailure(
          step.executor,
          errorType,
          (error as Error).message,
        );
      }

      context.stepResults.set(step.id, {
        stepId: step.id,
        status: "failed",
        error: stepError,
        startTime,
        endTime: new Date(),
        duration: Date.now() - startTime.getTime(),
      });

      return this.createStepResult(
        step.id,
        "failed",
        startTime,
        undefined,
        stepError,
      );
    }
  }

  /**
   * 按类型执行步骤
   */
  protected async executeStepByType(
    step: WorkflowStep,
    input: unknown,
    context: ExecutionContext,
  ): Promise<unknown> {
    switch (step.type) {
      case "tool":
        return this.executeTool(step.executor, input, context);

      case "skill":
        return this.executeSkill(step.executor, input, context);

      case "agent":
        return this.executeAgent(step.executor, input, context);

      case "transform":
        return this.executeTransform(step, input, context);

      case "decision":
        return this.executeDecision(step, context);

      case "wait":
        return this.executeWait(input as number);

      case "handler":
        return this.executeHandler(step.executor, input, context);

      case "map":
        return this.executeMap(step, input, context);

      case "parallel":
        return this.executeParallelSteps(step, context);

      default:
        throw new Error(`Unsupported step type: ${step.type}`);
    }
  }

  /**
   * 执行工具
   */
  protected async executeTool(
    toolId: string,
    input: unknown,
    context: ExecutionContext,
  ): Promise<unknown> {
    if (!this.toolRegistry) {
      throw new Error("Tool registry not set");
    }

    const tool = this.toolRegistry.tryGet(toolId);
    if (!tool) {
      throw new Error(`Tool not found: ${toolId}`);
    }

    const result = await tool.execute(input, {
      executionId: context.executionId,
      toolId,
      userId: context.userId,
      sessionId: context.sessionId,
      callerId: "orchestrator",
      callerType: "orchestrator",
      signal: context.signal,
      createdAt: new Date(),
    });

    if (!result.success) {
      throw new Error(result.error?.message || "Tool execution failed");
    }

    return result.data;
  }

  /**
   * 执行技能
   */
  protected async executeSkill(
    skillId: string,
    input: unknown,
    context: ExecutionContext,
  ): Promise<unknown> {
    if (!this.skillRegistry) {
      throw new Error("Skill registry not set");
    }

    const skill = this.skillRegistry.tryGet(skillId);
    if (!skill) {
      throw new Error(`Skill not found: ${skillId}`);
    }

    const result = await skill.execute(input, {
      executionId: context.executionId,
      skillId,
      userId: context.userId,
      sessionId: context.sessionId,
      callerId: "orchestrator",
      signal: context.signal,
      createdAt: new Date(),
    });

    if (!result.success) {
      throw new Error(result.error?.message || "Skill execution failed");
    }

    return result.data;
  }

  /**
   * 执行 Agent（适配 PlanBasedAgent 接口）
   */
  protected async executeAgent(
    agentId: string,
    input: unknown,
    context: ExecutionContext,
  ): Promise<unknown> {
    if (!this.agentRegistry) {
      throw new Error("Agent registry not set");
    }

    const agent = this.agentRegistry.tryGet(agentId);
    if (!agent) {
      throw new Error(`Agent not found: ${agentId}`);
    }

    // 将输入转换为 AgentInput 格式
    const agentInput = {
      prompt: typeof input === "string" ? input : JSON.stringify(input),
      options: {
        executionId: context.executionId,
        userId: context.userId,
        sessionId: context.sessionId,
      },
    };

    // 生成执行计划
    const plan = await agent.plan(agentInput);

    // 执行计划并收集结果
    let lastResult: unknown = null;
    for await (const event of agent.execute(plan)) {
      if (event.type === "complete") {
        if (!event.result.success) {
          throw new Error(event.result.error || "Agent execution failed");
        }
        lastResult = event.result.artifacts;
      } else if (event.type === "error") {
        throw new Error(event.error || "Agent execution failed");
      }
    }

    return lastResult;
  }

  /**
   * 执行自定义 Handler（App 层注册的 WorkflowNodeHandler）
   */
  protected async executeHandler(
    handlerId: string,
    input: unknown,
    context: ExecutionContext,
  ): Promise<unknown> {
    if (!this.handlerRegistry) {
      throw new Error("Handler registry not set");
    }

    const handler = this.handlerRegistry.getOrThrow(handlerId);

    // 1. prepare（可选）
    let preparedInput = input;
    if (handler.prepare) {
      preparedInput = await handler.prepare(input, context);
    }

    // 2. execute
    const output = await handler.execute(preparedInput, context);

    // 3. validate（可选）
    if (handler.validate) {
      const valid = await handler.validate(output, context);
      if (!valid) {
        throw new Error(`Handler "${handlerId}" output validation failed`);
      }
    }

    return output;
  }

  /**
   * 执行 Map 步骤：对数组中的每个元素并行执行同一 handler
   *
   * step.executor = handler ID
   * input = 数组（从 StepInput 解析）
   * step.metadata.concurrency = 并发限制（默认 4）
   * step.metadata.onItemError = 元素失败策略（默认 'skip'）
   */
  protected async executeMap(
    step: WorkflowStep,
    input: unknown,
    context: ExecutionContext,
  ): Promise<unknown[]> {
    if (!Array.isArray(input)) {
      throw new Error(
        `Map step "${step.id}" expects array input, got ${typeof input}`,
      );
    }

    const config: MapStepConfig = (step.metadata as MapStepConfig) || {};
    const concurrency = config.concurrency ?? 4;
    const onItemError = config.onItemError ?? "skip";

    // p-limit is ESM-only; handle CJS interop
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const pLimitMod = require("p-limit");
    const pLimit: (c: number) => <T>(fn: () => Promise<T>) => Promise<T> =
      pLimitMod.default || pLimitMod;
    const limit = pLimit(concurrency);

    const results: unknown[] = [];
    const errors: Array<{ index: number; error: Error }> = [];

    const promises = input.map((item: unknown, index: number) =>
      limit(async () => {
        if (context.signal?.aborted) {
          throw new Error("Execution cancelled");
        }

        try {
          const itemResult = await this.executeStepByType(
            { ...step, type: "handler" },
            item,
            context,
          );
          return { index, result: itemResult, success: true };
        } catch (err) {
          const error = err instanceof Error ? err : new Error(String(err));
          if (onItemError === "abort") {
            throw error;
          }
          this.logger.warn(
            `Map step "${step.id}" item ${index} failed (skipping): ${error.message}`,
          );
          errors.push({ index, error });
          return { index, result: undefined, success: false };
        }
      }),
    );

    const settled = await Promise.all(promises);
    for (const item of settled) {
      if (item.success) {
        results.push(item.result);
      }
    }

    if (errors.length > 0) {
      this.logger.warn(
        `Map step "${step.id}": ${errors.length}/${input.length} items failed`,
      );
    }

    return results;
  }

  /**
   * 执行 Parallel 步骤：并行执行多个子步骤
   * step.metadata.steps = WorkflowStep[] 子步骤数组
   */
  protected async executeParallelSteps(
    step: WorkflowStep,
    context: ExecutionContext,
  ): Promise<unknown[]> {
    const subSteps = (step.metadata as { steps?: WorkflowStep[] })?.steps;
    if (!subSteps || !Array.isArray(subSteps)) {
      throw new Error(
        `Parallel step "${step.id}" requires metadata.steps array`,
      );
    }

    const promises = subSteps.map((subStep) =>
      this.executeStep(subStep, context),
    );
    const results = await Promise.allSettled(promises);

    return results.map((r) =>
      r.status === "fulfilled" ? r.value.output : undefined,
    );
  }

  /**
   * 执行数据转换
   */
  protected async executeTransform(
    step: WorkflowStep,
    input: unknown,
    context: ExecutionContext,
  ): Promise<unknown> {
    // 简单实现：使用 JSON path 或表达式
    if (step.output?.transform) {
      return this.runExpression(step.output.transform, {
        input,
        context: context.state,
      });
    }
    return input;
  }

  /**
   * 执行决策
   */
  protected async executeDecision(
    step: WorkflowStep,
    context: ExecutionContext,
  ): Promise<unknown> {
    if (!step.condition) {
      return true;
    }
    return this.evaluateCondition(step.condition.expression, context);
  }

  /**
   * 执行等待
   */
  protected async executeWait(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * 解析输入
   */
  protected resolveInput(
    input: WorkflowStep["input"],
    context: ExecutionContext,
  ): unknown {
    if (!input) {
      return context.input;
    }

    const resolved: JsonObject = {};

    // 静态值
    if (input.static) {
      Object.assign(resolved, input.static);
    }

    // 从上下文映射
    if (input.fromContext) {
      for (const [key, path] of Object.entries(input.fromContext)) {
        resolved[key] = this.getContextValue(context.state, path) as JsonValue;
      }
    }

    // 从其他步骤输出映射
    if (input.fromStep) {
      for (const [key, mapping] of Object.entries(input.fromStep)) {
        const stepResult = context.stepResults.get(mapping.stepId);
        if (stepResult?.output) {
          resolved[key] = this.getContextValue(
            stepResult.output as JsonObject,
            mapping.path,
          ) as JsonValue;
        }
      }
    }

    // 表达式
    if (input.expression) {
      return this.runExpression(input.expression, {
        input: context.input,
        state: context.state,
        steps: Object.fromEntries(context.stepResults),
      });
    }

    return Object.keys(resolved).length > 0 ? resolved : context.input;
  }

  /**
   * 评估条件
   */
  protected evaluateCondition(
    expression: string,
    context: ExecutionContext,
  ): boolean {
    try {
      const result = this.runExpression(expression, {
        input: context.input,
        state: context.state,
        steps: Object.fromEntries(context.stepResults),
      });
      return Boolean(result);
    } catch {
      return false;
    }
  }

  /**
   * 评估表达式（已禁用 — 存在代码注入风险）
   * 外部代码不应调用此方法；内部逻辑请使用 runExpression()。
   */
  protected evaluateExpression(_expression: string, _scope: object): unknown {
    throw new Error(
      "evaluateExpression is disabled for security reasons. Use a safe expression engine.",
    );
  }

  /**
   * 内部表达式求值（仅供 BaseExecutor 内部使用）
   * 使用安全路径解析代替 new Function，防止代码注入。
   * 支持的表达式格式：属性访问、比较运算、逻辑运算。
   */
  private runExpression(expression: string, scope: object): unknown {
    // Security: reject expressions with dangerous patterns
    const SAFE_EXPRESSION = /^[\w\s.\[\]<>=!&|+\-*/%()'",:?]+$/;
    if (!SAFE_EXPRESSION.test(expression)) {
      this.logger.warn(
        `Rejected unsafe expression: ${expression.slice(0, 100)}`,
      );
      return undefined;
    }

    // Security: reject known dangerous keywords
    const FORBIDDEN =
      /\b(eval|Function|import|require|process|globalThis|constructor|__proto__)\b/;
    if (FORBIDDEN.test(expression)) {
      this.logger.warn(
        `Rejected expression with forbidden keyword: ${expression.slice(0, 100)}`,
      );
      return undefined;
    }

    try {
      // eslint-disable-next-line @typescript-eslint/no-implied-eval -- Sandboxed eval with SAFE_EXPRESSION + FORBIDDEN guards above
      const fn = new Function(...Object.keys(scope), `return ${expression}`);
      return fn(...Object.values(scope));
    } catch {
      return undefined;
    }
  }

  /**
   * 获取上下文值
   */
  protected getContextValue(obj: JsonObject, path: string): unknown {
    const parts = path.split(".");
    let current: unknown = obj;

    for (const part of parts) {
      if (current === null || current === undefined) {
        return undefined;
      }
      current = (current as Record<string, unknown>)[part];
    }

    return current;
  }

  /**
   * 设置上下文值
   */
  protected setContextValue(
    obj: JsonObject,
    path: string,
    value: unknown,
  ): void {
    const parts = path.split(".");
    let current = obj;

    for (let i = 0; i < parts.length - 1; i++) {
      const part = parts[i];
      if (!(part in current)) {
        current[part] = {};
      }
      current = current[part] as JsonObject;
    }

    current[parts[parts.length - 1]] = value as JsonObject[string];
  }

  /**
   * 创建步骤结果
   */
  protected createStepResult(
    stepId: string,
    status: StepStatus,
    startTime: Date,
    output?: unknown,
    error?: StepResult["error"],
  ): StepResult {
    const endTime = new Date();
    return {
      stepId,
      status,
      output,
      error,
      startTime,
      endTime,
      duration: endTime.getTime() - startTime.getTime(),
    };
  }

  /**
   * 创建执行事件
   */
  protected createEvent(
    type: ExecutionEvent["type"],
    context: ExecutionContext,
    stepId?: string,
    data?: unknown,
  ): ExecutionEvent {
    return {
      type,
      executionId: context.executionId,
      workflowId: context.workflowId,
      stepId,
      timestamp: new Date(),
      data,
    };
  }
}
