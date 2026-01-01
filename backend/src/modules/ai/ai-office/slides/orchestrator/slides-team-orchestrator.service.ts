/**
 * Slides Team Orchestrator
 *
 * 编排 5 个 Agent 协作生成 PPT（和 AI Teams 协作模式一致）：
 * 1. Leader (Slides Architect) - 协调全局，审核每个 Agent 的结果
 * 2. Analyst (Content Analyst) - 分析源内容
 * 3. Strategist (Visual Strategist) - 设计策略
 * 4. Writer (Content Writer) - 内容生成
 * 5. Reviewer (Quality Reviewer) - 质量审核
 *
 * 核心机制：每个 Agent 产生的结果必须经过 Leader 审核
 * 复用现有 skills：task-decomposition, outline-planning, content-compression, template-rendering
 */

import { Injectable, Logger } from "@nestjs/common";
import { EventEmitter2 } from "@nestjs/event-emitter";
import { Observable, Subject } from "rxjs";
import { PrismaService } from "../../../../../common/prisma/prisma.service";

// 导入现有 Skills
import { TaskDecompositionSkill } from "../skills/task-decomposition.skill";
import { OutlinePlanningSkill } from "../skills/outline-planning.skill";
import { ContentCompressionSkill } from "../skills/content-compression.skill";
import { TemplateRenderingSkill } from "../skills/template-rendering.skill";
import { CheckpointService } from "../checkpoint/checkpoint.service";

// 导入类型
import {
  SlidesTeamInput,
  SlidesTeamOutput,
  SlidesTeamEvent,
  SlidesTeamPhase,
  SlidesAgentRole,
  SLIDES_TEAM_AGENTS,
  AnalysisResult,
  PlanningResult,
  GenerationResult,
  ReviewResult,
  SlidesTeamState,
} from "./slides-team.types";

import { OutlinePlan, PageOutline } from "../checkpoint/checkpoint.types";

/**
 * 审核评分维度
 */
interface ReviewDimension {
  name: string;
  score: number; // 0-100
  weight: number; // 0-1
  comment?: string;
}

/**
 * Leader 审核结果（带量化评分）
 */
interface LeaderReviewResult {
  approved: boolean;
  score: number; // 综合分数 0-100
  threshold: number; // 通过阈值
  dimensions: ReviewDimension[]; // 各维度评分
  feedback?: string;
  suggestions?: string[];
  revisionRequired?: boolean;
}

/**
 * 最大重试次数
 */
const MAX_REVISION_ATTEMPTS = 3;

/**
 * 各阶段通过阈值
 */
const PHASE_THRESHOLDS: Record<string, number> = {
  analysis: 70,
  planning: 75,
  generation: 80,
};

/**
 * Agent 策略变体（用于切换）
 */
interface AgentVariant {
  id: string;
  name: string;
  strategy: "default" | "detailed" | "creative" | "conservative";
}

@Injectable()
export class SlidesTeamOrchestratorService {
  private readonly logger = new Logger(SlidesTeamOrchestratorService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly eventEmitter: EventEmitter2,
    private readonly taskDecomposition: TaskDecompositionSkill,
    private readonly outlinePlanning: OutlinePlanningSkill,
    private readonly contentCompression: ContentCompressionSkill,
    private readonly templateRendering: TemplateRenderingSkill,
    private readonly checkpoint: CheckpointService,
  ) {}

  /**
   * 执行 Team 协作生成 PPT（流式）
   * 返回 Observable 用于 SSE
   */
  executeStream(input: SlidesTeamInput): Observable<SlidesTeamEvent> {
    const subject = new Subject<SlidesTeamEvent>();

    // 异步执行，通过 subject 发送事件
    this.executeInternal(input, subject)
      .then(() => subject.complete())
      .catch((error) => {
        this.emitEvent(subject, input.sessionId, "execution:failed", {
          error: error.message,
          phase: "failed" as SlidesTeamPhase,
          recoverable: false,
        });
        subject.complete();
      });

    return subject.asObservable();
  }

  /**
   * 内部执行逻辑
   */
  private async executeInternal(
    input: SlidesTeamInput,
    subject: Subject<SlidesTeamEvent>,
  ): Promise<SlidesTeamOutput> {
    const executionId = await this.createExecution(input);
    const startTime = Date.now();

    const state: SlidesTeamState = {
      executionId,
      sessionId: input.sessionId,
      phase: "initializing",
      progress: 0,
      startTime: new Date(),
      phaseStartTime: new Date(),
    };

    try {
      // ========== 开始执行 ==========
      this.emitEvent(subject, executionId, "execution:started", {
        sessionId: input.sessionId,
        sourceLength: input.sourceText.length,
        targetPages: input.targetPages,
      });

      // Leader 初始化
      this.emitLeaderActivity(
        subject,
        executionId,
        "thinking",
        "审视任务需求，分配工作给团队成员...",
      );

      // ========== Phase 1: 分析 (Analyst) → Leader 审核（带重试） ==========
      state.analysisResult = await this.runPhaseWithReview(
        input,
        state,
        subject,
        executionId,
        "analysis",
        "analyst",
        async () => this.runAnalysisPhase(input, state, subject),
      );

      // ========== Phase 2: 规划 (Strategist) → Leader 审核（带重试） ==========
      state.planningResult = await this.runPhaseWithReview(
        input,
        state,
        subject,
        executionId,
        "planning",
        "strategist",
        async () => this.runPlanningPhase(input, state, subject),
      );

      // ========== Phase 3: 生成 (Writer) → Leader 审核（带重试） ==========
      state.generationResult = await this.runPhaseWithReview(
        input,
        state,
        subject,
        executionId,
        "generation",
        "writer",
        async () => this.runGenerationPhase(input, state, subject),
      );

      // ========== Phase 4: 审核 (Reviewer) → Leader 最终确认 ==========
      state.reviewResult = await this.runReviewPhase(state, subject);
      await this.leaderFinalApproval(subject, executionId, state);

      // ========== 完成 ==========
      const totalTime = Date.now() - startTime;
      const checkpointId = await this.saveCheckpoint(state);

      await this.updateExecution(executionId, "COMPLETED", state);

      this.emitEvent(subject, executionId, "execution:completed", {
        totalPages: state.planningResult?.totalPages || 0,
        totalTime,
        checkpointId,
      });

      return {
        executionId,
        sessionId: input.sessionId,
        status: "completed",
        totalPages: state.planningResult?.totalPages || 0,
        checkpointId,
        metrics: {
          totalTime,
          phaseTimings: {} as Record<SlidesTeamPhase, number>,
          tokenUsage: 0,
        },
      };
    } catch (error) {
      state.error = {
        message: error instanceof Error ? error.message : String(error),
        phase: state.phase,
      };

      await this.updateExecution(executionId, "FAILED", state);

      throw error;
    }
  }

  // ============================================================================
  // Leader 审核机制
  // ============================================================================

  /**
   * Leader 审核每个阶段的结果（带量化评分）
   */
  private async leaderReviewPhase(
    subject: Subject<SlidesTeamEvent>,
    executionId: string,
    fromAgent: SlidesAgentRole,
    phaseType: string,
    result: unknown,
  ): Promise<LeaderReviewResult> {
    const leader = SLIDES_TEAM_AGENTS.find((a) => a.role === "leader")!;

    // Leader 接收交接
    this.emitEvent(subject, executionId, "agent:handoff", {
      fromAgent,
      toAgent: "leader",
      message: `${phaseType} 阶段完成，提交给 Leader 审核`,
    });

    // Leader 思考
    this.emitEvent(subject, executionId, "agent:thinking", {
      agent: "leader",
      agentName: leader.name,
      thought: `审核 ${fromAgent} 的工作成果，正在进行多维度评分...`,
    });

    // 执行量化审核
    const reviewResult = this.performLeaderReview(phaseType, result);

    // 发送评分事件（可视化评分结果）
    this.emitEvent(subject, executionId, "review:scoring", {
      phase: phaseType,
      agent: fromAgent,
      score: reviewResult.score,
      threshold: reviewResult.threshold,
      passed: reviewResult.approved,
      dimensions: reviewResult.dimensions,
      summary: reviewResult.approved
        ? `综合评分 ${reviewResult.score}/${reviewResult.threshold}，审核通过`
        : `综合评分 ${reviewResult.score}/${reviewResult.threshold}，未达标`,
    });

    // Leader 完成审核
    this.emitEvent(subject, executionId, "agent:completed", {
      agent: "leader",
      agentName: leader.name,
      result: reviewResult.approved
        ? `✅ 审核通过 (${reviewResult.score}分)：${reviewResult.feedback}`
        : `❌ 需要修订 (${reviewResult.score}/${reviewResult.threshold}分)：${reviewResult.feedback}`,
      duration: 100,
    });

    return reviewResult;
  }

  /**
   * 执行 Leader 审核（量化评分）
   */
  private performLeaderReview(
    phaseType: string,
    result: unknown,
  ): LeaderReviewResult {
    const threshold = PHASE_THRESHOLDS[phaseType] || 70;
    const dimensions: ReviewDimension[] = [];

    // 基础验证逻辑
    if (!result) {
      return {
        approved: false,
        score: 0,
        threshold,
        dimensions: [
          { name: "完整性", score: 0, weight: 1.0, comment: "未产生有效结果" },
        ],
        feedback: `${phaseType} 阶段未产生有效结果`,
        revisionRequired: true,
      };
    }

    // 根据阶段类型进行不同维度的评分
    switch (phaseType) {
      case "analysis": {
        const analysis = result as AnalysisResult;

        // 维度1：主题提取（权重 30%）
        const topicScore = Math.min(100, analysis.topics.length * 20);
        dimensions.push({
          name: "主题提取",
          score: topicScore,
          weight: 0.3,
          comment:
            analysis.topics.length === 0
              ? "未提取到主题"
              : `提取了 ${analysis.topics.length} 个主题`,
        });

        // 维度2：数据点识别（权重 25%）
        const dataScore = Math.min(100, analysis.dataPoints.length * 15);
        dimensions.push({
          name: "数据识别",
          score: dataScore,
          weight: 0.25,
          comment: `识别了 ${analysis.dataPoints.length} 个数据点`,
        });

        // 维度3：洞察深度（权重 25%）
        const insightScore = Math.min(100, analysis.keyInsights.length * 25);
        dimensions.push({
          name: "洞察深度",
          score: insightScore,
          weight: 0.25,
          comment: `发现 ${analysis.keyInsights.length} 个关键洞察`,
        });

        // 维度4：页数建议合理性（权重 20%）
        const pageScore =
          analysis.suggestedPages >= 5 && analysis.suggestedPages <= 20
            ? 100
            : analysis.suggestedPages < 5
              ? 60
              : 80;
        dimensions.push({
          name: "页数建议",
          score: pageScore,
          weight: 0.2,
          comment: `建议 ${analysis.suggestedPages} 页`,
        });
        break;
      }

      case "planning": {
        const planning = result as PlanningResult;

        // 维度1：结构完整性（权重 35%）
        const structureScore =
          planning.chapters.length >= 3 ? 100 : planning.chapters.length * 30;
        dimensions.push({
          name: "结构完整性",
          score: structureScore,
          weight: 0.35,
          comment: `${planning.chapters.length} 个章节`,
        });

        // 维度2：页面规划（权重 30%）
        const pageScore =
          planning.totalPages >= 5 ? 100 : planning.totalPages * 15;
        dimensions.push({
          name: "页面规划",
          score: pageScore,
          weight: 0.3,
          comment: `规划 ${planning.totalPages} 页`,
        });

        // 维度3：模板分配合理性（权重 20%）
        const templateTypes = new Set(
          planning.pageOutlines.map((p) => p.templateType),
        );
        const varietyScore = Math.min(100, templateTypes.size * 25);
        dimensions.push({
          name: "模板多样性",
          score: varietyScore,
          weight: 0.2,
          comment: `使用 ${templateTypes.size} 种模板`,
        });

        // 维度4：设计策略（权重 15%）
        const designScore = planning.designStrategy?.colorScheme ? 100 : 50;
        dimensions.push({
          name: "设计策略",
          score: designScore,
          weight: 0.15,
          comment: planning.designStrategy?.colorScheme || "缺少配色方案",
        });
        break;
      }

      case "generation": {
        const generation = result as GenerationResult;

        // 维度1：内容完整性（权重 40%）
        const emptyPages = generation.pages.filter(
          (p) => !p.html || p.html.length < 100,
        ).length;
        const completenessScore =
          generation.pages.length > 0
            ? Math.round(
                ((generation.pages.length - emptyPages) /
                  generation.pages.length) *
                  100,
              )
            : 0;
        dimensions.push({
          name: "内容完整性",
          score: completenessScore,
          weight: 0.4,
          comment:
            emptyPages > 0 ? `${emptyPages} 页内容过短` : "所有页面内容完整",
        });

        // 维度2：内容丰富度（权重 30%）
        const avgLength =
          generation.pages.length > 0
            ? generation.totalContentLength / generation.pages.length
            : 0;
        const richnessScore = Math.min(100, Math.round(avgLength / 10));
        dimensions.push({
          name: "内容丰富度",
          score: richnessScore,
          weight: 0.3,
          comment: `平均每页 ${Math.round(avgLength)} 字符`,
        });

        // 维度3：格式规范（权重 30%）
        const hasUnreplacedVars = generation.pages.some(
          (p) => p.html.includes("{{") && p.html.includes("}}"),
        );
        const formatScore = hasUnreplacedVars ? 30 : 100;
        dimensions.push({
          name: "格式规范",
          score: formatScore,
          weight: 0.3,
          comment: hasUnreplacedVars ? "存在未替换的模板变量" : "格式规范",
        });
        break;
      }

      default:
        dimensions.push({
          name: "通用评估",
          score: 80,
          weight: 1.0,
          comment: "默认评分",
        });
    }

    // 计算加权总分
    const totalScore = Math.round(
      dimensions.reduce((sum, d) => sum + d.score * d.weight, 0),
    );

    // 生成反馈
    const lowScoreDimensions = dimensions.filter((d) => d.score < 60);
    const feedback =
      lowScoreDimensions.length > 0
        ? `需改进：${lowScoreDimensions.map((d) => d.name).join("、")}`
        : "各维度表现良好";

    const suggestions = lowScoreDimensions.map(
      (d) => `提升${d.name}：${d.comment}`,
    );

    return {
      approved: totalScore >= threshold,
      score: totalScore,
      threshold,
      dimensions,
      feedback,
      suggestions: suggestions.length > 0 ? suggestions : undefined,
      revisionRequired: totalScore < threshold,
    };
  }

  /**
   * Leader 最终确认
   */
  private async leaderFinalApproval(
    subject: Subject<SlidesTeamEvent>,
    executionId: string,
    state: SlidesTeamState,
  ): Promise<void> {
    const leader = SLIDES_TEAM_AGENTS.find((a) => a.role === "leader")!;

    this.emitEvent(subject, executionId, "agent:thinking", {
      agent: "leader",
      agentName: leader.name,
      thought: "综合审查所有阶段成果，确认最终交付物...",
    });

    const reviewScore = state.reviewResult?.overallScore || 0;
    const qualityAssessment =
      reviewScore >= 90
        ? "优秀"
        : reviewScore >= 70
          ? "良好"
          : reviewScore >= 50
            ? "合格"
            : "需改进";

    this.emitEvent(subject, executionId, "agent:completed", {
      agent: "leader",
      agentName: leader.name,
      result: `最终确认完成，整体质量评估：${qualityAssessment}（${reviewScore}分）`,
      duration: 200,
    });
  }

  /**
   * 发送 Leader 活动事件
   */
  private emitLeaderActivity(
    subject: Subject<SlidesTeamEvent>,
    executionId: string,
    type: "thinking" | "working",
    message: string,
  ): void {
    const leader = SLIDES_TEAM_AGENTS.find((a) => a.role === "leader")!;

    if (type === "thinking") {
      this.emitEvent(subject, executionId, "agent:thinking", {
        agent: "leader",
        agentName: leader.name,
        thought: message,
      });
    } else {
      this.emitEvent(subject, executionId, "agent:working", {
        agent: "leader",
        agentName: leader.name,
        task: message,
      });
    }
  }

  /**
   * 获取 Agent 的替代策略
   */
  private getAlternativeAgent(
    agentRole: SlidesAgentRole,
    attempt: number,
  ): AgentVariant {
    const variants: Record<SlidesAgentRole, AgentVariant[]> = {
      analyst: [
        { id: "analyst-default", name: "内容分析师", strategy: "default" },
        { id: "analyst-detailed", name: "深度分析师", strategy: "detailed" },
        { id: "analyst-creative", name: "创意分析师", strategy: "creative" },
      ],
      strategist: [
        { id: "strategist-default", name: "视觉策略师", strategy: "default" },
        {
          id: "strategist-conservative",
          name: "稳健策略师",
          strategy: "conservative",
        },
        { id: "strategist-creative", name: "创意策略师", strategy: "creative" },
      ],
      writer: [
        { id: "writer-default", name: "内容写手", strategy: "default" },
        { id: "writer-detailed", name: "详细写手", strategy: "detailed" },
        { id: "writer-creative", name: "创意写手", strategy: "creative" },
      ],
      reviewer: [
        { id: "reviewer-default", name: "质量审核员", strategy: "default" },
      ],
      leader: [
        { id: "leader-default", name: "项目负责人", strategy: "default" },
      ],
    };

    const agentVariants = variants[agentRole] || [
      { id: `${agentRole}-default`, name: agentRole, strategy: "default" },
    ];
    const variantIndex = Math.min(attempt, agentVariants.length - 1);
    return agentVariants[variantIndex];
  }

  /**
   * 执行阶段并进行 Leader 审核（带重试和 Agent 切换机制）
   * - 同一 Agent 最多重试 MAX_REVISION_ATTEMPTS 次
   * - 3 次失败后切换到不同策略的 Agent
   */
  private async runPhaseWithReview<T>(
    _input: SlidesTeamInput,
    _state: SlidesTeamState,
    subject: Subject<SlidesTeamEvent>,
    executionId: string,
    phaseType: string,
    agentRole: SlidesAgentRole,
    phaseExecutor: () => Promise<T>,
  ): Promise<T> {
    let attempts = 0;
    let result: T;
    let reviewResult: LeaderReviewResult;
    let currentVariant = this.getAlternativeAgent(agentRole, 0);
    let agentSwitchCount = 0;
    const maxAgentSwitches = 2; // 最多切换 2 次（共 3 个 Agent 变体）

    do {
      attempts++;

      // 如果是重试，发送重试事件
      if (attempts > 1) {
        this.emitEvent(subject, executionId, "phase:retry", {
          phase: phaseType,
          attempt: attempts,
          maxAttempts: MAX_REVISION_ATTEMPTS,
          reason: reviewResult!.feedback || "Leader 要求修订",
        });

        this.emitLeaderActivity(
          subject,
          executionId,
          "thinking",
          `第 ${attempts} 次尝试（${currentVariant.name}）：根据反馈重新执行 ${phaseType} 阶段...`,
        );
      }

      // 执行阶段
      result = await phaseExecutor();

      // Leader 审核
      reviewResult = await this.leaderReviewPhase(
        subject,
        executionId,
        agentRole,
        phaseType,
        result,
      );

      // 如果审核通过，退出循环
      if (reviewResult.approved) {
        break;
      }

      // 发送打回事件（包含评分）
      this.emitEvent(subject, executionId, "review:rejected", {
        phase: phaseType,
        attempt: attempts,
        score: reviewResult.score,
        threshold: reviewResult.threshold,
        feedback: reviewResult.feedback,
        suggestions: reviewResult.suggestions,
        dimensions: reviewResult.dimensions,
        willRetry:
          attempts < MAX_REVISION_ATTEMPTS ||
          agentSwitchCount < maxAgentSwitches,
      });

      this.logger.warn(
        `[runPhaseWithReview] ${phaseType} rejected (attempt ${attempts}, score ${reviewResult.score}/${reviewResult.threshold}): ${reviewResult.feedback}`,
      );

      // 检查是否需要切换 Agent
      if (
        attempts >= MAX_REVISION_ATTEMPTS &&
        agentSwitchCount < maxAgentSwitches
      ) {
        agentSwitchCount++;
        attempts = 0; // 重置尝试次数
        const previousVariant = currentVariant;
        currentVariant = this.getAlternativeAgent(agentRole, agentSwitchCount);

        // 发送 Agent 切换事件
        this.emitEvent(subject, executionId, "agent:switched", {
          phase: phaseType,
          originalAgent: agentRole,
          newAgent: currentVariant.id,
          reason: `${previousVariant.name} 连续 ${MAX_REVISION_ATTEMPTS} 次未通过审核（最高分 ${reviewResult.score}），切换到 ${currentVariant.name}`,
          previousScore: reviewResult.score,
        });

        // 发送最大重试事件（但采取切换 Agent 行动）
        this.emitEvent(subject, executionId, "review:max_retries_reached", {
          phase: phaseType,
          attempts: MAX_REVISION_ATTEMPTS,
          lastScore: reviewResult.score,
          lastFeedback: reviewResult.feedback,
          action: "switching_agent",
          newAgent: currentVariant.name,
        });

        this.logger.log(
          `[runPhaseWithReview] Switching from ${previousVariant.name} to ${currentVariant.name} for ${phaseType}`,
        );
      }
    } while (
      !reviewResult.approved &&
      (attempts < MAX_REVISION_ATTEMPTS || agentSwitchCount < maxAgentSwitches)
    );

    // 如果所有 Agent 都尝试过仍未通过
    if (!reviewResult.approved) {
      this.emitEvent(subject, executionId, "review:max_retries_reached", {
        phase: phaseType,
        attempts: (agentSwitchCount + 1) * MAX_REVISION_ATTEMPTS,
        lastScore: reviewResult.score,
        lastFeedback: reviewResult.feedback,
        action: "proceeding_with_best_effort",
      });

      this.logger.warn(
        `[runPhaseWithReview] ${phaseType} phase exhausted all ${agentSwitchCount + 1} agent variants, proceeding with best result (score: ${reviewResult.score})`,
      );
    }

    return result;
  }

  // ============================================================================
  // Phase 1: 分析阶段 (Content Analyst)
  // ============================================================================

  private async runAnalysisPhase(
    input: SlidesTeamInput,
    state: SlidesTeamState,
    subject: Subject<SlidesTeamEvent>,
  ): Promise<AnalysisResult> {
    state.phase = "analyzing";
    state.phaseStartTime = new Date();
    const agent = SLIDES_TEAM_AGENTS.find((a) => a.role === "analyst")!;

    // 通知阶段开始
    this.emitEvent(subject, state.executionId, "phase:started", {
      phase: "analyzing",
      agent: "analyst",
      description: "分析源文本，提取主题和数据",
    });

    // Agent 思考
    this.emitEvent(subject, state.executionId, "agent:thinking", {
      agent: "analyst",
      agentName: agent.name,
      thought: "正在阅读和理解源文本内容...",
    });

    // Agent 工作
    this.emitEvent(subject, state.executionId, "agent:working", {
      agent: "analyst",
      agentName: agent.name,
      task: "提取主题、实体、数据点",
      progress: 30,
    });

    // 调用 task-decomposition skill
    const decomposition = await this.taskDecomposition.execute({
      sourceText: input.sourceText,
      userRequirement: input.userRequirement,
      targetPages: input.targetPages,
      stylePreference: input.stylePreference,
      targetAudience: input.targetAudience,
      sessionId: input.sessionId,
    });

    // 构建分析结果
    const result: AnalysisResult = {
      topics: decomposition.sourceAnalysis?.topics || [],
      keyEntities: [],
      dataPoints:
        decomposition.sourceAnalysis?.dataPoints?.map((dp) => ({
          type: dp.type,
          value: dp.value,
          context: dp.context,
        })) || [],
      keyInsights: decomposition.sourceAnalysis?.keyInsights || [],
      sourceWordCount: decomposition.sourceAnalysis?.totalWords || 0,
      suggestedPages: decomposition.totalPages,
    };

    const duration = Date.now() - state.phaseStartTime.getTime();

    // Agent 完成
    this.emitEvent(subject, state.executionId, "agent:completed", {
      agent: "analyst",
      agentName: agent.name,
      result: `识别了 ${result.topics.length} 个主题，${result.dataPoints.length} 个数据点`,
      duration,
    });

    // 阶段完成
    this.emitEvent(subject, state.executionId, "phase:completed", {
      phase: "analyzing",
      duration,
      result: {
        topics: result.topics.slice(0, 3),
        suggestedPages: result.suggestedPages,
      },
    });

    state.progress = 20;
    return result;
  }

  // ============================================================================
  // Phase 2: 规划阶段 (Visual Strategist)
  // ============================================================================

  private async runPlanningPhase(
    input: SlidesTeamInput,
    state: SlidesTeamState,
    subject: Subject<SlidesTeamEvent>,
  ): Promise<PlanningResult> {
    state.phase = "planning";
    state.phaseStartTime = new Date();
    const agent = SLIDES_TEAM_AGENTS.find((a) => a.role === "strategist")!;

    this.emitEvent(subject, state.executionId, "phase:started", {
      phase: "planning",
      agent: "strategist",
      description: "规划 PPT 结构和视觉策略",
    });

    this.emitEvent(subject, state.executionId, "agent:thinking", {
      agent: "strategist",
      agentName: agent.name,
      thought: "基于分析结果设计最佳 PPT 结构...",
    });

    // 先获取任务分解结果
    const decomposition = await this.taskDecomposition.execute({
      sourceText: input.sourceText,
      userRequirement: input.userRequirement,
      targetPages: input.targetPages,
      stylePreference: input.stylePreference,
      targetAudience: input.targetAudience,
      sessionId: input.sessionId,
    });

    this.emitEvent(subject, state.executionId, "agent:working", {
      agent: "strategist",
      agentName: agent.name,
      task: "生成页面大纲和模板分配",
      progress: 50,
    });

    // 调用 outline-planning skill
    const outline: OutlinePlan = await this.outlinePlanning.execute({
      taskDecomposition: decomposition,
      sourceText: input.sourceText,
      sessionId: input.sessionId,
    });

    const result: PlanningResult = {
      totalPages: outline.pages.length,
      chapters: decomposition.chapters.map((ch) => ({
        id: ch.id,
        title: ch.title,
        pageRange: ch.pageRange,
      })),
      designStrategy: {
        colorScheme: decomposition.designStrategy.colorScheme,
        accentColor: decomposition.designStrategy.accentColor,
        styleReference: decomposition.designStrategy.styleReference,
      },
      pageOutlines: outline.pages.map((po: PageOutline) => ({
        pageNumber: po.pageNumber,
        templateType: po.templateType,
        title: po.title,
        keyElements: po.keyElements,
      })),
    };

    const duration = Date.now() - state.phaseStartTime.getTime();

    this.emitEvent(subject, state.executionId, "agent:completed", {
      agent: "strategist",
      agentName: agent.name,
      result: `规划了 ${result.totalPages} 页，${result.chapters.length} 个章节`,
      duration,
    });

    this.emitEvent(subject, state.executionId, "phase:completed", {
      phase: "planning",
      duration,
      result: {
        totalPages: result.totalPages,
        chapters: result.chapters.length,
      },
    });

    state.progress = 35;
    return result;
  }

  // ============================================================================
  // Phase 3: 生成阶段 (Content Writer)
  // ============================================================================

  /**
   * 并发写手数量
   */
  private readonly WRITER_CONCURRENCY = 3;

  private async runGenerationPhase(
    input: SlidesTeamInput,
    state: SlidesTeamState,
    subject: Subject<SlidesTeamEvent>,
  ): Promise<GenerationResult> {
    state.phase = "generating";
    state.phaseStartTime = new Date();
    const agent = SLIDES_TEAM_AGENTS.find((a) => a.role === "writer")!;
    const planningResult = state.planningResult!;

    this.emitEvent(subject, state.executionId, "phase:started", {
      phase: "generating",
      agent: "writer",
      description: `生成 ${planningResult.totalPages} 页内容（${this.WRITER_CONCURRENCY} 个写手并发）`,
    });

    // 获取主题配置
    const themeId = input.themeId || "genspark-dark";

    // 重新获取完整的 OutlinePlan
    const decomposition = await this.taskDecomposition.execute({
      sourceText: input.sourceText,
      userRequirement: input.userRequirement,
      targetPages: input.targetPages,
      stylePreference: input.stylePreference,
      targetAudience: input.targetAudience,
      sessionId: input.sessionId,
    });

    const outline: OutlinePlan = await this.outlinePlanning.execute({
      taskDecomposition: decomposition,
      sourceText: input.sourceText,
      sessionId: input.sessionId,
    });

    // 通知开始并发生成
    this.emitEvent(subject, state.executionId, "agent:thinking", {
      agent: "writer",
      agentName: agent.name,
      thought: `分配 ${this.WRITER_CONCURRENCY} 个写手并发生成 ${outline.pages.length} 页内容...`,
    });

    // 并发生成页面（使用批次处理）
    const pages: GenerationResult["pages"] = [];
    const totalPages = outline.pages.length;

    // 分批并发处理
    for (
      let batchStart = 0;
      batchStart < totalPages;
      batchStart += this.WRITER_CONCURRENCY
    ) {
      const batchEnd = Math.min(
        batchStart + this.WRITER_CONCURRENCY,
        totalPages,
      );
      const batchPages = outline.pages.slice(batchStart, batchEnd);

      // 通知当前批次
      this.emitEvent(subject, state.executionId, "agent:working", {
        agent: "writer",
        agentName: agent.name,
        task: `并发生成第 ${batchStart + 1}-${batchEnd} 页（共 ${totalPages} 页）`,
        progress: 35 + Math.floor((batchStart / totalPages) * 40),
      });

      // 为每个页面发送生成开始事件
      for (const pageOutline of batchPages) {
        this.emitEvent(subject, state.executionId, "slide:generating", {
          pageNumber: pageOutline.pageNumber,
          totalPages,
          title: pageOutline.title,
          templateType: pageOutline.templateType,
        });
      }

      // 并发生成当前批次的所有页面
      const batchResults = await Promise.all(
        batchPages.map(async (pageOutline) => {
          // 调用 content-compression skill
          const contentResult = await this.contentCompression.execute({
            pageOutline: pageOutline,
            sourceText: input.sourceText,
            sessionId: input.sessionId,
          });

          // 调用 template-rendering skill
          const renderResult = this.templateRendering.render({
            pageOutline: pageOutline,
            pageContent: contentResult.pageContent,
            themeId,
          });

          return {
            pageNumber: pageOutline.pageNumber,
            title: pageOutline.title,
            content: contentResult.pageContent,
            html: renderResult.html,
            compressedLength: contentResult.compressedLength,
          };
        }),
      );

      // 按页码排序后添加到结果
      batchResults.sort((a, b) => a.pageNumber - b.pageNumber);

      for (const result of batchResults) {
        pages.push({
          pageNumber: result.pageNumber,
          title: result.title,
          content: result.content,
          html: result.html,
        });

        this.emitEvent(subject, state.executionId, "slide:generated", {
          pageNumber: result.pageNumber,
          title: result.title,
          contentLength: result.compressedLength,
        });
      }

      state.progress = 35 + Math.floor((batchEnd / totalPages) * 40);
    }

    // 按页码重新排序（确保顺序正确）
    pages.sort((a, b) => a.pageNumber - b.pageNumber);

    const result: GenerationResult = {
      pages,
      totalContentLength: pages.reduce(
        (sum, p) =>
          sum + (typeof p.content === "string" ? p.content.length : 0),
        0,
      ),
    };

    const duration = Date.now() - state.phaseStartTime.getTime();

    this.emitEvent(subject, state.executionId, "agent:completed", {
      agent: "writer",
      agentName: agent.name,
      result: `${this.WRITER_CONCURRENCY} 个写手并发生成了 ${pages.length} 页内容`,
      duration,
    });

    this.emitEvent(subject, state.executionId, "phase:completed", {
      phase: "generating",
      duration,
      result: { pagesGenerated: pages.length },
    });

    state.progress = 75;
    return result;
  }

  // ============================================================================
  // Phase 4: 审核阶段 (Quality Reviewer)
  // ============================================================================

  private async runReviewPhase(
    state: SlidesTeamState,
    subject: Subject<SlidesTeamEvent>,
  ): Promise<ReviewResult> {
    state.phase = "reviewing";
    state.phaseStartTime = new Date();
    const agent = SLIDES_TEAM_AGENTS.find((a) => a.role === "reviewer")!;
    const generationResult = state.generationResult!;

    this.emitEvent(subject, state.executionId, "phase:started", {
      phase: "reviewing",
      agent: "reviewer",
      description: "检查内容质量和一致性",
    });

    this.emitEvent(subject, state.executionId, "agent:thinking", {
      agent: "reviewer",
      agentName: agent.name,
      thought: "审核每页内容的完整性和准确性...",
    });

    const pageScores: ReviewResult["pageScores"] = [];
    let issuesFound = 0;
    let issuesFixed = 0;

    // 简单的质量检查（可扩展为 AI 驱动）
    for (const page of generationResult.pages) {
      const issues: string[] = [];
      let score = 100;

      // 检查内容是否为空
      if (!page.html || page.html.length < 100) {
        issues.push("内容过短");
        score -= 20;
        issuesFound++;

        this.emitEvent(subject, state.executionId, "review:issue_found", {
          pageNumber: page.pageNumber,
          severity: "warning",
          type: "content_short",
          message: "页面内容过短",
        });
      }

      // 检查是否有占位符残留
      if (page.html.includes("{{") && page.html.includes("}}")) {
        issues.push("存在未替换的模板变量");
        score -= 30;
        issuesFound++;

        this.emitEvent(subject, state.executionId, "review:issue_found", {
          pageNumber: page.pageNumber,
          severity: "error",
          type: "unreplaced_variable",
          message: "存在未替换的模板变量",
        });
      }

      pageScores.push({
        pageNumber: page.pageNumber,
        score,
        issues,
      });

      this.emitEvent(subject, state.executionId, "phase:progress", {
        phase: "reviewing",
        progress:
          75 +
          Math.floor((page.pageNumber / generationResult.pages.length) * 20),
        message: `检查第 ${page.pageNumber} 页`,
      });
    }

    const overallScore =
      pageScores.length > 0
        ? Math.round(
            pageScores.reduce((sum, p) => sum + p.score, 0) / pageScores.length,
          )
        : 0;

    const result: ReviewResult = {
      overallScore,
      issuesFound,
      issuesFixed,
      pageScores,
    };

    const duration = Date.now() - state.phaseStartTime.getTime();

    this.emitEvent(subject, state.executionId, "agent:completed", {
      agent: "reviewer",
      agentName: agent.name,
      result: `审核完成，综合评分 ${overallScore}，发现 ${issuesFound} 个问题`,
      duration,
    });

    this.emitEvent(subject, state.executionId, "phase:completed", {
      phase: "reviewing",
      duration,
      result: { overallScore, issuesFound },
    });

    state.progress = 95;
    return result;
  }

  // ============================================================================
  // 辅助方法
  // ============================================================================

  private emitEvent(
    subject: Subject<SlidesTeamEvent>,
    executionId: string,
    type: SlidesTeamEvent["type"],
    data: SlidesTeamEvent["data"],
  ): void {
    const event: SlidesTeamEvent = {
      type,
      timestamp: new Date(),
      executionId,
      data,
    };

    subject.next(event);

    // 同时发送到 EventEmitter（用于其他监听器）
    this.eventEmitter.emit(`slides.team.${type}`, event);

    this.logger.debug(`[Event] ${type}: ${JSON.stringify(data).slice(0, 100)}`);
  }

  private async createExecution(input: SlidesTeamInput): Promise<string> {
    const execution = await this.prisma.slidesTeamExecution.create({
      data: {
        sessionId: input.sessionId,
        userId: input.userId,
        status: "PENDING",
        sourceContent: input.sourceText.slice(0, 10000), // 限制长度
        targetPages: input.targetPages,
        stylePreset: input.stylePreference,
        audience: input.targetAudience,
      },
    });

    return execution.id;
  }

  private async updateExecution(
    executionId: string,
    status:
      | "ANALYZING"
      | "PLANNING"
      | "GENERATING"
      | "REVIEWING"
      | "COMPLETED"
      | "FAILED",
    state: SlidesTeamState,
  ): Promise<void> {
    await this.prisma.slidesTeamExecution.update({
      where: { id: executionId },
      data: {
        status,
        currentPhase: state.phase,
        progressPercent: state.progress,
        analysisResult: state.analysisResult as object,
        planningResult: state.planningResult as object,
        generationResult: state.generationResult as object,
        reviewResult: state.reviewResult as object,
        errorMessage: state.error?.message,
        errorPhase: state.error?.phase,
        startedAt: status === "ANALYZING" ? new Date() : undefined,
        completedAt:
          status === "COMPLETED" || status === "FAILED"
            ? new Date()
            : undefined,
      },
    });
  }

  private async saveCheckpoint(state: SlidesTeamState): Promise<string> {
    // 保存到 checkpoint 系统
    const checkpointState = {
      taskDecomposition: null, // 简化
      pageOutline: state.planningResult,
      renderedPages: state.generationResult?.pages.map((p) => ({
        pageNumber: p.pageNumber,
        html: p.html,
        pageContent: p.content,
      })),
      currentPageIndex: state.generationResult?.pages.length || 0,
      completedPages:
        state.generationResult?.pages.map((p) => p.pageNumber) || [],
    };

    await this.checkpoint.create({
      sessionId: state.sessionId,
      type: "batch_rendered",
      state: checkpointState as never,
      name: `Team 协作完成 - ${state.generationResult?.pages.length || 0} 页`,
    });

    return state.sessionId; // 返回 session ID 作为 checkpoint 引用
  }
}
