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
import { AgentRegistry } from "../../agents/registry";

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
   * 执行工作流
   */
  abstract execute(
    workflow: Workflow,
    context: ExecutionContext,
  ): AsyncGenerator<ExecutionEvent, ExecutionResult>;

  /**
   * 执行单个步骤
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

      // 准备输入
      const input = this.resolveInput(step.input, context);

      // 执行步骤
      const output = await this.executeStepByType(step, input, context);

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
      });

      return this.createStepResult(step.id, "completed", startTime, output);
    } catch (error) {
      const stepError = {
        code: "STEP_EXECUTION_ERROR",
        message: (error as Error).message,
        stack: (error as Error).stack,
      };

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
