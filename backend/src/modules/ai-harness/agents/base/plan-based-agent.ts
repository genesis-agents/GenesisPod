/**
 * Legacy Plan-Based Agent (migrated from ai-harness/agents/base)
 *
 * @deprecated Use HarnessedAgent / SpecBasedAgent for new agents.
 * This base class supports the IPlanBasedAgent (plan → execute) paradigm.
 * New agents should implement IAgent via HarnessedAgent.
 *
 * Migrated: PR-X5 (ai-harness/agents/base → ai-harness/agents/base)
 */

import {
  AgentId,
  BuiltinAgentId,
  ToolId,
  BUILTIN_AGENTS,
  AGENT_CONFIGS,
  AgentInput,
  AgentPlan,
  AgentEvent,
  AgentTemplate,
  AgentConfig,
} from "@/modules/ai-harness/agents/abstractions/agent.types";

/**
 * Plan-Based Agent 接口
 * 适用于多步骤、可预览计划的 Agent
 */
export interface IPlanBasedAgent {
  /**
   * Agent 唯一标识符
   */
  readonly id: AgentId;

  /**
   * Agent 名称
   */
  readonly name: string;

  /**
   * Agent 描述
   */
  readonly description: string;

  /**
   * Agent 能力列表
   */
  readonly capabilities: string[];

  /**
   * 所需工具列表
   */
  readonly requiredTools: ToolId[];

  /**
   * 分析用户输入，生成执行计划
   */
  plan(input: AgentInput): Promise<AgentPlan>;

  /**
   * 执行计划，流式返回进度和结果
   */
  execute(plan: AgentPlan): AsyncGenerator<AgentEvent>;

  /**
   * 获取可用模板列表
   */
  getTemplates(): AgentTemplate[];

  /**
   * 获取 Agent 配置
   */
  getConfig(): AgentConfig;
}

/**
 * Plan-Based Agent 基类
 * 提供计划执行模式的通用实现
 *
 * @example
 * ```typescript
 * class SlidesAgent extends PlanBasedAgent {
 *   readonly id = BUILTIN_AGENTS.SLIDES;
 *   readonly name = 'AI Slides';
 *   readonly description = '智能 PPT 生成器';
 *   readonly capabilities = ['生成大纲', '配图', '导出'];
 *   readonly requiredTools = [BUILTIN_TOOLS.TEXT_GENERATION];
 *
 *   async plan(input: AgentInput): Promise<AgentPlan> {
 *     // 分析输入，生成执行计划
 *   }
 *
 *   async *execute(plan: AgentPlan): AsyncGenerator<AgentEvent> {
 *     // 执行计划，流式返回进度
 *   }
 * }
 * ```
 */
export abstract class PlanBasedAgent implements IPlanBasedAgent {
  abstract readonly id: AgentId;
  abstract readonly name: string;
  abstract readonly description: string;
  abstract readonly capabilities: string[];
  abstract readonly requiredTools: ToolId[];

  /**
   * 模板列表 - 子类可覆盖
   */
  protected templates: AgentTemplate[] = [];

  /**
   * Agent 选择关键词 - 子类可覆盖
   * 用于 AgentOrchestrator 根据用户输入自动选择 Agent
   */
  protected selectionKeywords: string[] = [];

  /**
   * Runtime overrides from DB config (set by orchestrator)
   */
  protected _systemPromptOverride?: string;
  protected _modelTypeOverride?: string;
  protected _taskProfileOverride?: Record<string, unknown>;

  /**
   * Set system prompt override from DB config
   */
  setSystemPromptOverride(prompt: string): void {
    this._systemPromptOverride = prompt;
  }

  /**
   * Set model type override from DB config
   */
  setModelTypeOverride(modelType: string): void {
    this._modelTypeOverride = modelType;
  }

  /**
   * Set task profile override from DB config
   */
  setTaskProfileOverride(profile: Record<string, unknown>): void {
    this._taskProfileOverride = profile;
  }

  /**
   * Clear all runtime overrides (called after execution)
   */
  clearRuntimeOverrides(): void {
    this._systemPromptOverride = undefined;
    this._modelTypeOverride = undefined;
    this._taskProfileOverride = undefined;
  }

  /**
   * 分析用户输入，生成执行计划
   */
  abstract plan(input: AgentInput): Promise<AgentPlan>;

  /**
   * 执行计划，流式返回进度和结果
   */
  abstract execute(plan: AgentPlan): AsyncGenerator<AgentEvent>;

  /**
   * 获取可用模板
   */
  getTemplates(): AgentTemplate[] {
    return this.templates;
  }

  /**
   * 获取 Agent 配置
   */
  getConfig(): AgentConfig {
    // 尝试从预定义配置获取
    const predefinedConfig = AGENT_CONFIGS[this.id as BuiltinAgentId];
    if (predefinedConfig) {
      return {
        ...predefinedConfig,
        templates: this.templates,
        selectionKeywords: this.selectionKeywords,
      };
    }

    // 自定义 Agent 配置
    return {
      id: this.id,
      name: this.name,
      description: this.description,
      icon: "bot",
      color: "#6B7280",
      capabilities: this.capabilities,
      templates: this.templates,
      selectionKeywords: this.selectionKeywords,
    };
  }

  /**
   * 生成唯一步骤 ID
   */
  protected generateStepId(): string {
    return `step_${crypto.randomUUID()}`;
  }

  /**
   * 生成唯一任务 ID
   */
  protected generateTaskId(): string {
    return `task_${crypto.randomUUID()}`;
  }
}

// 重导出常用类型
export {
  AgentId,
  BuiltinAgentId,
  ToolId,
  BUILTIN_AGENTS,
  AGENT_CONFIGS,
  AgentInput,
  AgentPlan,
  AgentEvent,
  AgentTemplate,
  AgentConfig,
};
