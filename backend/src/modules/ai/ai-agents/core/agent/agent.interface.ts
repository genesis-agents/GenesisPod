/**
 * Agent 接口定义
 * 所有专项 Agent 都必须实现此接口
 */

import {
  AgentType,
  AgentInput,
  AgentPlan,
  AgentEvent,
  AgentTemplate,
  AgentConfig,
  ToolType,
} from "./agent.types";

/**
 * Agent 基础接口
 * 基于 Genspark 架构设计的 Agent 矩阵系统
 *
 * @example
 * ```typescript
 * class SlidesAgent implements IAgent {
 *   readonly type = AgentType.SLIDES;
 *   readonly name = 'AI Slides';
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
export interface IAgent {
  /**
   * Agent 类型
   */
  readonly type: AgentType;

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
  readonly requiredTools: ToolType[];

  /**
   * 分析用户输入，生成执行计划
   *
   * @param input 用户输入
   * @returns 执行计划
   */
  plan(input: AgentInput): Promise<AgentPlan>;

  /**
   * 执行计划，流式返回进度和结果
   *
   * @param plan 执行计划
   * @yields AgentEvent 事件流
   */
  execute(plan: AgentPlan): AsyncGenerator<AgentEvent>;

  /**
   * 获取可用模板列表
   *
   * @returns 模板列表
   */
  getTemplates(): AgentTemplate[];

  /**
   * 获取 Agent 配置
   *
   * @returns Agent 配置
   */
  getConfig(): AgentConfig;
}

/**
 * Agent 基类
 * 提供通用实现，具体 Agent 继承此类
 */
export abstract class BaseAgent implements IAgent {
  abstract readonly type: AgentType;
  abstract readonly name: string;
  abstract readonly description: string;
  abstract readonly capabilities: string[];
  abstract readonly requiredTools: ToolType[];

  /**
   * 模板列表 - 子类可覆盖
   */
  protected templates: AgentTemplate[] = [];

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
    return {
      type: this.type,
      name: this.name,
      description: this.description,
      icon: this.getIcon(),
      color: this.getColor(),
      capabilities: this.capabilities,
      templates: this.templates,
    };
  }

  /**
   * 获取图标 - 子类可覆盖
   */
  protected getIcon(): string {
    const icons: Record<AgentType, string> = {
      [AgentType.SLIDES]: "📊",
      [AgentType.DOCS]: "📄",
      [AgentType.DESIGNER]: "🎨",
      [AgentType.DEVELOPER]: "💻",
      [AgentType.RESEARCHER]: "🔬",
      [AgentType.SIMULATOR]: "🎯",
      [AgentType.IMAGE_DESIGNER]: "🖼️",
      [AgentType.TEAM_COLLABORATION]: "👥",
    };
    return icons[this.type] || "🤖";
  }

  /**
   * 获取颜色 - 子类可覆盖
   */
  protected getColor(): string {
    const colors: Record<AgentType, string> = {
      [AgentType.SLIDES]: "#3B82F6",
      [AgentType.DOCS]: "#10B981",
      [AgentType.DESIGNER]: "#F59E0B",
      [AgentType.DEVELOPER]: "#8B5CF6",
      [AgentType.RESEARCHER]: "#EC4899",
      [AgentType.SIMULATOR]: "#EF4444",
      [AgentType.IMAGE_DESIGNER]: "#06B6D4",
      [AgentType.TEAM_COLLABORATION]: "#8B5CF6",
    };
    return colors[this.type] || "#6B7280";
  }

  /**
   * 生成唯一步骤 ID
   */
  protected generateStepId(): string {
    return `step_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * 生成唯一任务 ID
   */
  protected generateTaskId(): string {
    return `task_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
}
