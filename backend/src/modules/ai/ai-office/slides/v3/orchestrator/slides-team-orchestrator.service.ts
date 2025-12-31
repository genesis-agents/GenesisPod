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
import { PrismaService } from "../../../../../../common/prisma/prisma.service";

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
 * Leader 审核结果
 */
interface LeaderReviewResult {
  approved: boolean;
  feedback?: string;
  suggestions?: string[];
  revisionRequired?: boolean;
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

      // ========== Phase 1: 分析 (Analyst) → Leader 审核 ==========
      state.analysisResult = await this.runAnalysisPhase(input, state, subject);
      await this.leaderReviewPhase(
        subject,
        executionId,
        "analyst",
        "analysis",
        state.analysisResult,
      );

      // ========== Phase 2: 规划 (Strategist) → Leader 审核 ==========
      state.planningResult = await this.runPlanningPhase(input, state, subject);
      await this.leaderReviewPhase(
        subject,
        executionId,
        "strategist",
        "planning",
        state.planningResult,
      );

      // ========== Phase 3: 生成 (Writer) → Leader 审核 ==========
      state.generationResult = await this.runGenerationPhase(
        input,
        state,
        subject,
      );
      await this.leaderReviewPhase(
        subject,
        executionId,
        "writer",
        "generation",
        state.generationResult,
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
   * Leader 审核每个阶段的结果
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
      thought: `审核 ${fromAgent} 的工作成果...`,
    });

    // 模拟审核逻辑（可以扩展为 AI 驱动）
    const reviewResult = this.performLeaderReview(phaseType, result);

    // Leader 完成审核
    this.emitEvent(subject, executionId, "agent:completed", {
      agent: "leader",
      agentName: leader.name,
      result: reviewResult.approved
        ? `审核通过：${phaseType} 阶段结果符合预期`
        : `需要修订：${reviewResult.feedback}`,
      duration: 100,
    });

    return reviewResult;
  }

  /**
   * 执行 Leader 审核
   */
  private performLeaderReview(
    phaseType: string,
    result: unknown,
  ): LeaderReviewResult {
    // 基础验证逻辑
    if (!result) {
      return {
        approved: false,
        feedback: `${phaseType} 阶段未产生有效结果`,
        revisionRequired: true,
      };
    }

    // 根据阶段类型进行不同的验证
    switch (phaseType) {
      case "analysis":
        const analysis = result as AnalysisResult;
        if (analysis.topics.length === 0) {
          return {
            approved: false,
            feedback: "未提取到有效主题",
            suggestions: ["重新分析源文本", "扩大关键词搜索范围"],
          };
        }
        break;

      case "planning":
        const planning = result as PlanningResult;
        if (planning.totalPages < 3) {
          return {
            approved: true,
            feedback: "页数较少，但可接受",
          };
        }
        break;

      case "generation":
        const generation = result as GenerationResult;
        if (generation.pages.some((p) => !p.html || p.html.length < 100)) {
          return {
            approved: false,
            feedback: "部分页面内容过短",
            revisionRequired: true,
          };
        }
        break;
    }

    return { approved: true };
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
