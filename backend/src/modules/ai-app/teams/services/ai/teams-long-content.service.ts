/**
 * AI Teams 长内容集成服务
 * Teams Long Content Integration Service
 *
 * 将 LongContentEngine 的能力集成到 AI Teams 工作流
 */

import { Injectable, Logger } from "@nestjs/common";
import {
  LongContentEngineService,
  LongContentProjectConfig,
  TaskExecutionContext,
  TaskCompletionResult,
} from "../../../../ai-engine/long-content";
import { ContinuationProtocolService } from "../../../../ai-engine/long-content/services";
import {
  GranularityLevel,
  TaskEstimate,
  TaskDecomposition,
  DecompositionValidation,
  ContinuationState,
  ExpectedOutput,
  QualityDashboard,
} from "../../../../ai-engine/long-content/interfaces";

/**
 * AI Teams 任务配置
 */
export interface TeamsMissionConfig {
  missionId: string;
  missionTitle: string;
  missionDescription: string;
  objectives: string[];
  constraints: string[];
  expectedTaskCount?: number;
  expectedWordsPerTask?: number;
  granularityLevel?: GranularityLevel;
}

/**
 * 任务执行结果
 */
export interface TeamsTaskResult {
  taskId: string;
  taskTitle: string;
  content: string;
  needsContinuation: boolean;
  continuationState?: ContinuationState;
  qualityScore?: number;
  warning?: string;
}

@Injectable()
export class TeamsLongContentService {
  private readonly logger = new Logger(TeamsLongContentService.name);

  /** 任务配置缓存 */
  private missionConfigs = new Map<string, TeamsMissionConfig>();

  constructor(
    private readonly longContentEngine: LongContentEngineService,
    private readonly continuationService: ContinuationProtocolService,
  ) {}

  // ============ 任务初始化 ============

  /**
   * 初始化团队任务的长内容处理
   */
  async initMission(config: TeamsMissionConfig): Promise<void> {
    this.logger.log(
      `Initializing long content for mission: ${config.missionId}`,
    );

    // 缓存配置
    this.missionConfigs.set(config.missionId, config);

    // 预估任务规模
    const estimate = await this.estimateTaskScale(
      config.missionDescription,
      config.objectives,
    );

    // 初始化长内容引擎
    const projectConfig: LongContentProjectConfig = {
      projectId: config.missionId,
      projectTitle: config.missionTitle,
      projectDescription: config.missionDescription,
      totalTasks: config.expectedTaskCount || estimate.totalTasks,
      granularityLevel:
        config.granularityLevel || estimate.recommendedGranularity,
      expectedWordsPerTask: config.expectedWordsPerTask || 1500,
    };

    await this.longContentEngine.initProject(projectConfig);

    this.logger.log(
      `Mission ${config.missionId} initialized with ${projectConfig.totalTasks} tasks`,
    );
  }

  /**
   * 清理任务
   */
  clearMission(missionId: string): void {
    this.missionConfigs.delete(missionId);
    this.longContentEngine.clearProject(missionId);
    this.logger.log(`Mission ${missionId} cleared`);
  }

  // ============ 任务规模预估 ============

  /**
   * 预估任务规模
   */
  async estimateTaskScale(
    description: string,
    objectives: string[],
  ): Promise<TaskEstimate> {
    const fullRequirement = `${description}\n\n目标：\n${objectives.map((o, i) => `${i + 1}. ${o}`).join("\n")}`;
    return this.longContentEngine.estimateTaskScale(fullRequirement);
  }

  // ============ 任务分解 ============

  /**
   * 构建任务分解的粒度约束 Prompt
   */
  buildGranularityConstraintPrompt(missionId: string): string {
    const config = this.missionConfigs.get(missionId);
    if (!config) {
      this.logger.warn(`Mission config not found: ${missionId}`);
      return "";
    }

    return this.longContentEngine.buildGranularityConstraintPrompt(missionId, {
      projectType: this.detectProjectType(config),
    });
  }

  /**
   * 验证任务分解
   */
  validateTaskDecomposition(
    missionId: string,
    tasks: Array<{ title: string; description: string }>,
  ): DecompositionValidation {
    const taskDecompositions: TaskDecomposition[] = tasks.map((t, idx) => ({
      title: t.title,
      description: t.description,
      order: idx + 1,
    }));

    return this.longContentEngine.validateTaskDecomposition(
      missionId,
      taskDecompositions,
    );
  }

  // ============ 任务执行 ============

  /**
   * 构建任务执行上下文
   */
  async buildTaskContext(
    missionId: string,
    taskId: string,
    currentContent: string,
    taskTitle?: string,
  ): Promise<TaskExecutionContext> {
    return this.longContentEngine.buildTaskExecutionContext(
      missionId,
      taskId,
      currentContent,
      { relevantQuery: taskTitle },
    );
  }

  /**
   * 处理任务完成（检测续写、评估质量、更新上下文）
   */
  async processTaskCompletion(
    missionId: string,
    taskId: string,
    taskTitle: string,
    taskResult: string,
    expected?: ExpectedOutput,
  ): Promise<TaskCompletionResult> {
    const config = this.missionConfigs.get(missionId);
    const expectedOutput: ExpectedOutput = expected || {
      minWords: config?.expectedWordsPerTask || 1500,
      requireStructuredEnd: true,
    };

    return this.longContentEngine.processTaskCompletion(
      missionId,
      taskId,
      taskTitle,
      taskResult,
      expectedOutput,
    );
  }

  // ============ 续写处理 ============

  /**
   * 检测是否需要续写
   */
  detectContinuationNeeded(
    content: string,
    expectedWords: number = 1500,
  ): boolean {
    const result = this.continuationService.detectContinuation(content, {
      minWords: expectedWords,
      hasStructuredEnd: true,
    });
    return result.needsContinuation;
  }

  /**
   * 构建续写 Prompt
   */
  buildContinuationPrompt(
    taskId: string,
    taskTitle: string,
    taskDescription: string,
  ): string {
    return this.longContentEngine.buildContinuationPrompt(taskId, {
      taskTitle,
      taskDescription,
    });
  }

  /**
   * 获取续写状态
   */
  getContinuationState(taskId: string): ContinuationState | undefined {
    return this.continuationService.getState(taskId);
  }

  /**
   * 获取续写后的最终结果
   */
  getFinalResult(taskId: string): string | null {
    return this.continuationService.getFinalResult(taskId);
  }

  // ============ 质量监控 ============

  /**
   * 获取质量仪表盘
   */
  getQualityDashboard(missionId: string): QualityDashboard {
    return this.longContentEngine.getQualityDashboard(missionId);
  }

  /**
   * 检查是否需要质量干预
   */
  checkQualityIntervention(missionId: string): {
    needed: boolean;
    level?: number;
    action?: string;
    reason?: string;
  } {
    try {
      const dashboard = this.getQualityDashboard(missionId);
      const trend = dashboard.quality.trend;

      if (trend.trend === "degrading" && trend.consecutiveDeclines >= 3) {
        return {
          needed: true,
          level: 2,
          action: "adjust_parameters",
          reason: `质量连续下降 ${trend.consecutiveDeclines} 次`,
        };
      }

      if (trend.averageScore < 5) {
        return {
          needed: true,
          level: 3,
          action: "pause_and_review",
          reason: `平均质量分数过低 (${trend.averageScore.toFixed(1)}/10)`,
        };
      }

      return { needed: false };
    } catch {
      return { needed: false };
    }
  }

  // ============ 最终报告 ============

  /**
   * 构建完整的最终报告
   */
  async buildFinalReport(missionId: string): Promise<{
    fullContent: string;
    dashboard: QualityDashboard;
  }> {
    return this.longContentEngine.buildFinalReport(missionId);
  }

  /**
   * 获取所有完成任务的内容
   */
  getAllCompletedTaskContents(missionId: string): Array<{
    taskId: string;
    title: string;
    content: string;
  }> {
    return this.longContentEngine.getAllCompletedTaskContents(missionId);
  }

  // ============ 私有方法 ============

  /**
   * 检测项目类型
   */
  private detectProjectType(config: TeamsMissionConfig): string {
    const desc = config.missionDescription.toLowerCase();

    if (
      desc.includes("小说") ||
      desc.includes("故事") ||
      desc.includes("章节")
    ) {
      return "novel";
    }

    if (
      desc.includes("报告") ||
      desc.includes("分析") ||
      desc.includes("研究")
    ) {
      return "report";
    }

    if (
      desc.includes("文档") ||
      desc.includes("说明") ||
      desc.includes("手册")
    ) {
      return "documentation";
    }

    return "general";
  }
}
