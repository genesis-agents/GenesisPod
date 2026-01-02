/**
 * Agent Handoff Tool
 * Agent 委派工具 - 将任务委派给其他专业 Agent
 */

import { Injectable, Logger } from "@nestjs/common";
import { BaseTool } from "../../base/base-tool";
import {
  ToolContext,
  JSONSchema,
  ToolCategory,
} from "../../abstractions/tool.interface";
import {
  BUILTIN_AGENTS,
  AgentId,
  AgentResult,
} from "../../../core/types/agent.types";

import { randomUUID } from "crypto";

// ============================================================================
// Types
// ============================================================================

/**
 * 任务定义
 */
export interface TaskDefinition {
  /**
   * 任务提示词
   */
  prompt: string;

  /**
   * 任务上下文（附加信息）
   */
  context?: Record<string, unknown>;

  /**
   * 任务优先级
   */
  priority?: "low" | "normal" | "high";
}

/**
 * 委派选项
 */
export interface HandoffOptions {
  /**
   * 是否等待结果（同步/异步）
   * - true: 等待目标 Agent 完成，返回结果
   * - false: 立即返回，后台执行
   */
  waitForResult?: boolean;

  /**
   * 超时时间（毫秒），仅在 waitForResult=true 时有效
   */
  timeout?: number;

  /**
   * 降级 Agent（当目标 Agent 不可用或失败时）
   */
  fallbackAgent?: AgentId;
}

/**
 * Agent 委派输入
 */
export interface AgentHandoffInput {
  /**
   * 目标 Agent 类型
   */
  targetAgent: AgentId;

  /**
   * 任务定义
   */
  task: TaskDefinition;

  /**
   * 委派选项
   */
  options?: HandoffOptions;
}

/**
 * 委派状态
 */
export type HandoffStatus = "delegated" | "completed" | "failed";

/**
 * Agent 委派输出
 */
export interface AgentHandoffOutput {
  /**
   * 是否成功委派
   */
  success: boolean;

  /**
   * 委派 ID（用于追踪）
   */
  handoffId: string;

  /**
   * 目标 Agent
   */
  targetAgent: AgentId;

  /**
   * 委派状态
   */
  status: HandoffStatus;

  /**
   * Agent 执行结果（仅在 waitForResult=true 且完成时有值）
   */
  result?: AgentResult;

  /**
   * 错误信息
   */
  error?: string;

  /**
   * 元数据
   */
  metadata?: {
    /**
     * 委派时间
     */
    handoffAt: Date;

    /**
     * 完成时间（如果已完成）
     */
    completedAt?: Date;

    /**
     * 是否使用了降级 Agent
     */
    usedFallback?: boolean;
  };
}

// ============================================================================
// Tool Implementation
// ============================================================================

/**
 * Agent 委派工具
 *
 * 用于将任务委派给其他专业 Agent，支持：
 * - 同步等待结果
 * - 异步后台执行
 * - 降级策略
 *
 * @example
 * ```typescript
 * // 委派给 Designer Agent 生成海报
 * {
 *   targetAgent: "DESIGNER",
 *   task: {
 *     prompt: "为科技产品发布会生成海报",
 *     context: { theme: "未来科技", colors: ["#0066FF", "#00CCFF"] },
 *     priority: "high"
 *   },
 *   options: {
 *     waitForResult: true,
 *     timeout: 60000
 *   }
 * }
 * ```
 */
@Injectable()
export class AgentHandoffTool extends BaseTool<
  AgentHandoffInput,
  AgentHandoffOutput
> {
  private readonly logger = new Logger(AgentHandoffTool.name);

  readonly id = "agent-handoff";
  readonly category: ToolCategory = "collaboration";
  readonly name = "Agent 委派";
  readonly description =
    "将任务委派给其他专业 Agent 执行。支持同步等待结果或异步后台执行，适用于需要跨 Agent 协作的复杂任务。";

  readonly inputSchema: JSONSchema = {
    type: "object",
    properties: {
      targetAgent: {
        type: "string",
        description: "目标 Agent 类型",
        enum: Object.values(BUILTIN_AGENTS),
      },
      task: {
        type: "object",
        description: "任务定义",
        properties: {
          prompt: {
            type: "string",
            description: "任务提示词，清晰描述需要完成的任务",
          },
          context: {
            type: "object",
            description: "任务上下文，提供额外信息和约束",
          },
          priority: {
            type: "string",
            description: "任务优先级",
            enum: ["low", "normal", "high"],
            default: "normal",
          },
        },
        required: ["prompt"],
      },
      options: {
        type: "object",
        description: "委派选项",
        properties: {
          waitForResult: {
            type: "boolean",
            description: "是否等待目标 Agent 完成（同步执行）",
            default: false,
          },
          timeout: {
            type: "number",
            description: "超时时间（毫秒），仅在同步模式下有效",
            default: 300000, // 5分钟
          },
          fallbackAgent: {
            type: "string",
            description: "降级 Agent，当目标 Agent 失败时使用",
            enum: Object.values(BUILTIN_AGENTS),
          },
        },
      },
    },
    required: ["targetAgent", "task"],
  };

  readonly outputSchema: JSONSchema = {
    type: "object",
    properties: {
      success: {
        type: "boolean",
        description: "是否成功委派",
      },
      handoffId: {
        type: "string",
        description: "委派 ID，用于追踪任务状态",
      },
      targetAgent: {
        type: "string",
        description: "实际执行的 Agent（可能是降级 Agent）",
      },
      status: {
        type: "string",
        description: "委派状态",
        enum: ["delegated", "completed", "failed"],
      },
      result: {
        type: "object",
        description: "Agent 执行结果（仅在同步模式且完成时有值）",
      },
      error: {
        type: "string",
        description: "错误信息（如果失败）",
      },
    },
  };

  constructor() {
    super();
    // defaultTimeout set in class property // 稍大于默认任务超时时间
  }

  /**
   * 验证输入
   */
  validateInput(input: AgentHandoffInput) {
    // 验证目标 Agent
    const builtinAgentValues = Object.values(BUILTIN_AGENTS) as string[];
    if (!builtinAgentValues.includes(input.targetAgent)) {
      this.logger.warn(`Invalid target agent: ${input.targetAgent}`);
      return false;
    }

    // 验证任务提示词
    if (!input.task?.prompt || input.task.prompt.trim().length === 0) {
      this.logger.warn("Task prompt is required");
      return false;
    }

    // 验证降级 Agent（如果提供）
    if (
      input.options?.fallbackAgent &&
      !builtinAgentValues.includes(input.options.fallbackAgent)
    ) {
      this.logger.warn(
        `Invalid fallback agent: ${input.options.fallbackAgent}`,
      );
      return false;
    }

    return true;
  }

  /**
   * 执行 Agent 委派
   */
  protected async doExecute(
    input: AgentHandoffInput,
    context: ToolContext,
  ): Promise<AgentHandoffOutput> {
    const handoffId = randomUUID();
    const handoffAt = new Date();
    const { targetAgent, task, options = {} } = input;
    const { waitForResult = false, timeout = 300000 } = options;

    this.logger.log(
      `Handing off task to ${targetAgent} [${handoffId}]: ${task.prompt.substring(0, 50)}...`,
    );

    try {
      // 异步模式：立即返回，后台执行
      if (!waitForResult) {
        // TODO: 在后台启动目标 Agent 任务
        // 当前返回 delegated 状态，实际执行需要集成 Agent 系统
        this.logger.log(
          `Task delegated to ${targetAgent} asynchronously [${handoffId}]`,
        );

        return {
          success: true,
          handoffId,
          targetAgent,
          status: "delegated",
          metadata: {
            handoffAt,
          },
        };
      }

      // 同步模式：等待目标 Agent 完成
      this.logger.log(
        `Waiting for ${targetAgent} to complete [${handoffId}], timeout: ${timeout}ms`,
      );

      try {
        // TODO: 实际执行目标 Agent 任务
        // 当前模拟执行结果
        const result = await this.executeTargetAgent(
          targetAgent,
          task,
          context,
          timeout,
        );

        const completedAt = new Date();

        this.logger.log(
          `Task completed by ${targetAgent} [${handoffId}] in ${completedAt.getTime() - handoffAt.getTime()}ms`,
        );

        return {
          success: true,
          handoffId,
          targetAgent,
          status: "completed",
          result,
          metadata: {
            handoffAt,
            completedAt,
          },
        };
      } catch (error) {
        // 尝试使用降级 Agent
        if (options.fallbackAgent) {
          this.logger.warn(
            `${targetAgent} failed, trying fallback agent: ${options.fallbackAgent}`,
          );

          try {
            const result = await this.executeTargetAgent(
              options.fallbackAgent,
              task,
              context,
              timeout,
            );

            const completedAt = new Date();

            return {
              success: true,
              handoffId,
              targetAgent: options.fallbackAgent,
              status: "completed",
              result,
              metadata: {
                handoffAt,
                completedAt,
                usedFallback: true,
              },
            };
          } catch (fallbackError) {
            throw new Error(
              `Both primary and fallback agents failed: ${error instanceof Error ? error.message : "Unknown error"}`,
            );
          }
        }

        throw error;
      }
    } catch (error) {
      this.logger.error(
        `Agent handoff failed [${handoffId}]: ${error instanceof Error ? error.message : "Unknown error"}`,
      );

      return {
        success: false,
        handoffId,
        targetAgent,
        status: "failed",
        error: error instanceof Error ? error.message : "Unknown error",
        metadata: {
          handoffAt,
        },
      };
    }
  }

  /**
   * 执行目标 Agent（模拟实现）
   * TODO: 实际集成 Agent 执行系统
   */
  private async executeTargetAgent(
    agentType: AgentId,
    task: TaskDefinition,
    _context: ToolContext,
    timeout: number,
  ): Promise<AgentResult> {
    // 模拟延迟
    await new Promise((resolve) => setTimeout(resolve, 1000));

    // 检查超时（简化版）
    if (timeout <= 0) {
      throw new Error("Agent execution timeout");
    }

    // 模拟返回结果
    // TODO: 实际应该调用 AgentService 执行任务
    return {
      success: true,
      artifacts: [],
      summary: `${agentType} completed task: ${task.prompt.substring(0, 50)}...`,
      tokensUsed: 1000,
      duration: 1000,
    };
  }
}
