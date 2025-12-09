/**
 * Agent 编排器
 * 负责协调多个 Agent 和工具的执行
 */

import { Injectable, Logger } from "@nestjs/common";
import { AgentRegistry } from "./agent.registry";
import { ToolRegistry } from "./tool.registry";
import { IAgent } from "./agent.interface";
import {
  AgentType,
  AgentInput,
  AgentEvent,
  AgentResult,
  ToolType,
} from "./agent.types";
import { ToolContext } from "./tool.interface";

/**
 * Agent 选择结果
 */
interface AgentSelectionResult {
  agent: IAgent;
  confidence: number;
  reason: string;
}

/**
 * 编排器配置
 */
interface OrchestratorConfig {
  /**
   * 默认超时时间（毫秒）
   */
  defaultTimeout?: number;

  /**
   * 最大并发工具调用数
   */
  maxConcurrentTools?: number;

  /**
   * 是否启用工具结果缓存
   */
  enableToolCache?: boolean;
}

/**
 * Agent 编排器
 * 智能协调 Agent 和工具的执行
 */
@Injectable()
export class AgentOrchestrator {
  private readonly logger = new Logger(AgentOrchestrator.name);
  private readonly config: Required<OrchestratorConfig>;

  constructor(
    private readonly agentRegistry: AgentRegistry,
    private readonly toolRegistry: ToolRegistry,
  ) {
    this.config = {
      defaultTimeout: 300000, // 5 分钟
      maxConcurrentTools: 3,
      enableToolCache: true,
    };
  }

  /**
   * 执行 Agent 任务
   *
   * @param input Agent 输入
   * @param agentType 指定的 Agent 类型（可选，不指定则智能路由）
   * @param userId 用户 ID
   * @yields AgentEvent 事件流
   */
  async *execute(
    input: AgentInput,
    agentType?: AgentType,
    userId?: string,
  ): AsyncGenerator<AgentEvent> {
    const startTime = Date.now();
    let tokensUsed = 0;

    try {
      // 1. 选择最合适的 Agent
      const selection = agentType
        ? {
            agent: this.agentRegistry.get(agentType),
            confidence: 1,
            reason: "User specified",
          }
        : this.selectAgent(input);

      this.logger.log(
        `Selected agent: ${selection.agent.type} (confidence: ${selection.confidence}, reason: ${selection.reason})`,
      );

      const agent = selection.agent;

      // 2. 生成执行计划
      this.logger.log(`Planning task for agent: ${agent.type}`);
      const plan = await agent.plan(input);
      yield { type: "plan_ready", plan };

      // 3. 执行计划
      this.logger.log(`Executing plan: ${plan.steps.length} steps`);

      for await (const event of agent.execute(plan)) {
        // 处理工具调用事件
        if (event.type === "tool_call") {
          const toolEvent = event;
          const toolType = toolEvent.tool;

          if (this.toolRegistry.has(toolType)) {
            const tool = this.toolRegistry.get(toolType);
            const context: ToolContext = {
              taskId: plan.taskId,
              userId,
              timeout: this.config.defaultTimeout,
            };

            this.logger.log(`Executing tool: ${toolType}`);
            const result = await tool.execute(toolEvent.input, context);

            yield {
              type: "tool_result",
              tool: toolType,
              output: result.data,
              duration: result.duration,
            };
          } else {
            this.logger.warn(`Tool not found: ${toolType}`);
            yield {
              type: "error",
              error: `Tool ${toolType} not registered`,
            };
          }
        } else {
          // 直接转发其他事件
          yield event;
        }

        // 记录 token 使用（如果事件中包含）
        if ("tokensUsed" in event && typeof event.tokensUsed === "number") {
          tokensUsed += event.tokensUsed;
        }
      }

      // 4. 生成最终结果
      const duration = Date.now() - startTime;
      const result: AgentResult = {
        success: true,
        artifacts: [],
        tokensUsed,
        duration,
      };

      yield { type: "complete", result };
    } catch (error) {
      this.logger.error(`Orchestration error: ${error}`);
      yield {
        type: "error",
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }

  /**
   * 智能选择 Agent
   * 基于用户输入分析意图，路由到最合适的 Agent
   *
   * @param input 用户输入
   * @returns Agent 选择结果
   */
  private selectAgent(input: AgentInput): AgentSelectionResult {
    const prompt = input.prompt.toLowerCase();

    // 关键词匹配规则
    const rules: Array<{
      agentType: AgentType;
      keywords: string[];
      weight: number;
    }> = [
      {
        agentType: AgentType.SLIDES,
        keywords: [
          "ppt",
          "slides",
          "powerpoint",
          "幻灯片",
          "演示",
          "汇报",
          "presentation",
          "演讲",
          "报告",
          "大纲",
        ],
        weight: 1,
      },
      {
        agentType: AgentType.DOCS,
        keywords: [
          "word",
          "doc",
          "document",
          "文档",
          "报告",
          "论文",
          "方案",
          "计划",
          "总结",
          "分析",
          "调研",
        ],
        weight: 1,
      },
      {
        agentType: AgentType.DESIGNER,
        keywords: [
          "design",
          "image",
          "设计",
          "海报",
          "banner",
          "logo",
          "图片",
          "封面",
          "图标",
          "插画",
          "ui",
          "界面",
        ],
        weight: 1,
      },
      {
        agentType: AgentType.DEVELOPER,
        keywords: [
          "code",
          "function",
          "api",
          "代码",
          "函数",
          "程序",
          "开发",
          "javascript",
          "python",
          "typescript",
          "组件",
        ],
        weight: 1,
      },
    ];

    // 计算每个 Agent 的匹配分数
    const scores = new Map<AgentType, number>();

    for (const rule of rules) {
      let score = 0;
      for (const keyword of rule.keywords) {
        if (prompt.includes(keyword)) {
          score += rule.weight;
        }
      }
      if (score > 0) {
        scores.set(rule.agentType, score);
      }
    }

    // 选择得分最高的 Agent
    let bestAgent: AgentType = AgentType.DOCS; // 默认使用 Docs
    let bestScore = 0;

    for (const [agentType, score] of scores) {
      if (score > bestScore && this.agentRegistry.has(agentType)) {
        bestScore = score;
        bestAgent = agentType;
      }
    }

    const confidence = bestScore > 0 ? Math.min(bestScore / 3, 1) : 0.5;

    return {
      agent: this.agentRegistry.get(bestAgent),
      confidence,
      reason: bestScore > 0 ? "Keyword matching" : "Default fallback",
    };
  }

  /**
   * 获取所有可用的 Agent
   */
  getAvailableAgents(): IAgent[] {
    return this.agentRegistry.getAll();
  }

  /**
   * 获取所有可用的工具
   */
  getAvailableTools(): ToolType[] {
    return this.toolRegistry.getRegisteredTypes();
  }

  /**
   * 检查 Agent 和其所需工具是否都可用
   *
   * @param agentType Agent 类型
   * @returns 是否可用
   */
  isAgentReady(agentType: AgentType): boolean {
    if (!this.agentRegistry.has(agentType)) {
      return false;
    }

    const agent = this.agentRegistry.get(agentType);
    return this.toolRegistry.hasAll(agent.requiredTools);
  }

  /**
   * 获取 Agent 状态报告
   */
  getStatusReport(): Record<
    AgentType,
    {
      registered: boolean;
      ready: boolean;
      missingTools: ToolType[];
    }
  > {
    const report: Record<
      AgentType,
      {
        registered: boolean;
        ready: boolean;
        missingTools: ToolType[];
      }
    > = {} as any;

    for (const agentType of Object.values(AgentType)) {
      const registered = this.agentRegistry.has(agentType);
      let missingTools: ToolType[] = [];

      if (registered) {
        const agent = this.agentRegistry.get(agentType);
        missingTools = agent.requiredTools.filter(
          (tool) => !this.toolRegistry.has(tool),
        );
      }

      report[agentType] = {
        registered,
        ready: registered && missingTools.length === 0,
        missingTools,
      };
    }

    return report;
  }
}
