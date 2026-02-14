import { Injectable, Logger, Optional } from "@nestjs/common";
import { Subject, Observable } from "rxjs";
import { AIModelType, DeepResearchStatus } from "@prisma/client";
import { PrismaService } from "../../../../common/prisma/prisma.service";
import { DiscussionAgentService } from "./discussion-agent.service";
import { IterativeSearchService } from "./iterative-search.service";
import { ReportSynthesizerService } from "./report-synthesizer.service";
import { CreditsService } from "../../../credits/credits.service";
import { InsufficientCreditsException } from "../../../credits/exceptions/insufficient-credits.exception";
import { BillingContext } from "../../../credits/billing-context";
import {
  StartDeepResearchDto,
  DeepResearchSSEEvent,
  DeepResearchReport,
  SearchRound,
  ResearchPlanStep,
} from "./types";
import {
  DiscussionMessage,
  AgentState,
  ResearchDirection,
} from "./discussion-types";

/**
 * 讨论驱动型研究编排器
 * 完全替代 DeepResearchAgentService 的研究执行流程
 *
 * 流程: Ideation → Execution → Findings → Synthesis
 */
@Injectable()
export class DiscussionOrchestratorService {
  private readonly logger = new Logger(DiscussionOrchestratorService.name);
  private readonly STAGE_TIMEOUT = 2 * 60 * 1000;

  constructor(
    private readonly prisma: PrismaService,
    private readonly agentService: DiscussionAgentService,
    private readonly searchService: IterativeSearchService,
    private readonly reportService: ReportSynthesizerService,
    @Optional() private readonly creditsService: CreditsService,
  ) {}

  /**
   * 启动讨论驱动型研究（SSE 事件流）
   */
  startResearch(
    projectId: string,
    dto: StartDeepResearchDto,
  ): Observable<DeepResearchSSEEvent> {
    const subject = new Subject<DeepResearchSSEEvent>();

    (async () => {
      const project = await this.prisma.researchProject.findUnique({
        where: { id: projectId },
        select: { userId: true },
      });

      if (!project) {
        throw new Error("Project not found");
      }

      const depth = dto.options?.depth || "standard";

      await BillingContext.run(
        {
          userId: project.userId,
          moduleType: "deep-research",
          operationType: `research-${depth}`,
          description: `Deep Research Discussion (${depth}) - ${dto.query.slice(0, 50)}...`,
        },
        async () => {
          await this.executeDiscussion(projectId, dto, subject);
        },
      );
    })().catch((error) => {
      this.logger.error(`Discussion research failed: ${error}`);
      subject.next({
        type: "error",
        data: {
          code: "EXECUTION_ERROR",
          message: error.message || "研究执行失败",
          recoverable: false,
        },
      });
      subject.complete();
    });

    return subject.asObservable();
  }

  /**
   * 执行完整的讨论驱动研究流程
   */
  private async executeDiscussion(
    projectId: string,
    dto: StartDeepResearchDto,
    subject: Subject<DeepResearchSSEEvent>,
  ): Promise<void> {
    const startTime = Date.now();
    const allMessages: DiscussionMessage[] = [];
    const searchRounds: SearchRound[] = [];

    // 获取项目 userId 用于积分检查
    const project = await this.prisma.researchProject.findUnique({
      where: { id: projectId },
      select: { userId: true },
    });

    if (!project) {
      throw new Error("Project not found");
    }

    // 积分检查
    const depth = dto.options?.depth || "standard";
    const creditsMap: Record<string, number> = {
      quick: 300,
      standard: 700,
      thorough: 1500,
    };
    const estimatedCredits = creditsMap[depth] || 700;

    if (this.creditsService) {
      const balanceCheck = await this.creditsService.checkBalance(
        project.userId,
        estimatedCredits,
      );
      if (!balanceCheck.sufficient) {
        throw new InsufficientCreditsException(
          estimatedCredits,
          balanceCheck.balance,
        );
      }
    }

    // 创建会话
    const session = await this.prisma.deepResearchSession.create({
      data: {
        projectId,
        query: dto.query,
        status: DeepResearchStatus.IDEATION,
      },
    });

    try {
      // 初始化 Agent 团队
      const team = this.agentService.initializeTeam(dto.query);

      // ========== Phase 1: IDEATION ==========
      subject.next({
        type: "discussion.phase",
        data: {
          phase: "ideation",
          summary: "团队开始围绕课题进行头脑风暴",
        },
      });

      const directions = await this.runIdeationPhase(
        dto,
        team,
        allMessages,
        subject,
      );

      await this.updateSession(session.id, {
        status: DeepResearchStatus.SEARCHING,
        directions: { directions } as unknown as Record<string, unknown>,
        discussion: allMessages as unknown as Record<string, unknown>[],
      });

      // ========== Phase 2: EXECUTION ==========
      subject.next({
        type: "discussion.phase",
        data: {
          phase: "execution",
          summary: "研究员们开始分头调研",
          directions: directions.map((d) => d.title),
        },
      });

      await this.runExecutionPhase(
        dto,
        team,
        directions,
        searchRounds,
        allMessages,
        subject,
      );

      await this.updateSession(session.id, {
        searchRounds: searchRounds as unknown as Record<string, unknown>[],
        discussion: allMessages as unknown as Record<string, unknown>[],
      });

      // ========== Phase 3: FINDINGS ==========
      subject.next({
        type: "discussion.phase",
        data: {
          phase: "findings",
          summary: "研究员开始汇报发现",
        },
      });

      await this.updateSession(session.id, {
        status: DeepResearchStatus.FINDINGS as DeepResearchStatus,
      });

      await this.runFindingsPhase(
        dto,
        team,
        searchRounds,
        allMessages,
        subject,
      );

      await this.updateSession(session.id, {
        discussion: allMessages as unknown as Record<string, unknown>[],
      });

      // ========== Phase 4: SYNTHESIS ==========
      subject.next({
        type: "discussion.phase",
        data: {
          phase: "synthesis",
          summary: "撰稿人开始撰写最终报告",
        },
      });

      await this.updateSession(session.id, {
        status: DeepResearchStatus.SYNTHESIZING,
      });

      const report = await this.runSynthesisPhase(
        dto,
        team,
        searchRounds,
        allMessages,
        subject,
      );

      // ========== 完成 ==========
      const totalSources = this.countUniqueSources(searchRounds);
      const duration = (Date.now() - startTime) / 1000;

      const finalReport: DeepResearchReport = {
        ...report,
        metadata: {
          ...report.metadata,
          totalSources,
          duration,
          searchRounds: searchRounds.length,
        },
      };

      await this.updateSession(session.id, {
        status: DeepResearchStatus.COMPLETED,
        report: finalReport as unknown as Record<string, unknown>,
        discussion: allMessages as unknown as Record<string, unknown>[],
        sourcesUsed: totalSources,
        completedAt: new Date(),
      });

      subject.next({
        type: "interaction.complete",
        data: {
          sessionId: session.id,
          report: finalReport,
          status: "success",
        },
      });

      this.logger.log(
        `Discussion research completed: ${session.id}, sources: ${totalSources}, duration: ${duration.toFixed(1)}s`,
      );
    } catch (error) {
      await this.updateSession(session.id, {
        status: DeepResearchStatus.FAILED,
        error: error instanceof Error ? error.message : String(error),
        discussion: allMessages as unknown as Record<string, unknown>[],
      });
      throw error;
    } finally {
      subject.complete();
    }
  }

  // ==================== Phase 1: Ideation ====================

  private async runIdeationPhase(
    dto: StartDeepResearchDto,
    team: Map<string, AgentState>,
    allMessages: DiscussionMessage[],
    subject: Subject<DeepResearchSSEEvent>,
  ): Promise<ResearchDirection[]> {
    const isFollowUp = dto.isFollowUp ?? false;
    const director = this.getAgent(team, "director");
    const researcherA = this.getAgent(team, "researcher-a");
    const researcherB = this.getAgent(team, "researcher-b");
    const researcherC = this.getAgent(team, "researcher-c");
    const analyst = this.getAgent(team, "analyst");

    // Round 1: 总监开场
    const directorOpener = isFollowUp
      ? `基于之前的研究，我们来深入探讨这个追问："${dto.query}"。请分析这个新课题需要从哪些角度深入研究。`
      : `请分析这个研究课题："${dto.query}"。提出你的研究框架和初步分析。`;

    this.emitTyping(subject, director);
    const directorResponse = await this.withTimeout(
      this.agentService.speak(director, directorOpener, {
        creativity: "high",
        outputLength: "short",
      }),
      this.STAGE_TIMEOUT,
      "Director opening",
    );

    const msg1 = this.agentService.createMessage(
      director,
      directorResponse,
      "ideation",
      "proposal",
    );
    allMessages.push(msg1);
    subject.next({ type: "discussion.message", data: msg1 });

    // Round 2: 研究员们各自提 Ideas（并行）
    const researcherContext = `总监的分析：\n${directorResponse}\n\n请从你的专业视角提出 2-3 个研究方向/Ideas。`;

    this.emitTyping(subject, researcherA);
    const researcherResults = await Promise.allSettled([
      this.withTimeout(
        this.agentService.speak(researcherA, researcherContext, {
          creativity: "high",
          outputLength: "short",
        }),
        this.STAGE_TIMEOUT,
        "Researcher A ideation",
      ),
      this.withTimeout(
        this.agentService.speak(researcherB, researcherContext, {
          creativity: "high",
          outputLength: "short",
        }),
        this.STAGE_TIMEOUT,
        "Researcher B ideation",
      ),
      this.withTimeout(
        this.agentService.speak(researcherC, researcherContext, {
          creativity: "high",
          outputLength: "short",
        }),
        this.STAGE_TIMEOUT,
        "Researcher C ideation",
      ),
    ]);

    const researchers = [researcherA, researcherB, researcherC];
    const responses: string[] = [];

    for (let i = 0; i < researcherResults.length; i++) {
      const result = researcherResults[i];
      const agent = researchers[i];
      const resp =
        result.status === "fulfilled"
          ? result.value
          : `[分析暂时不可用: ${result.reason instanceof Error ? result.reason.message : "未知错误"}]`;

      if (result.status === "rejected") {
        this.logger.warn(`Researcher ${i} ideation failed: ${result.reason}`);
      }

      responses.push(resp);
      const msg = this.agentService.createMessage(
        agent,
        resp,
        "ideation",
        "idea",
      );
      allMessages.push(msg);
      subject.next({ type: "discussion.message", data: msg });
    }

    const [respA, respB, respC] = responses;

    // Round 3: 分析师挑战假设
    const analystContext = `以下是团队的讨论：

总监：${directorResponse}

研究员 A：${respA}

研究员 B：${respB}

研究员 C：${respC}

请指出团队讨论中的盲区、假设和潜在问题。`;

    this.emitTyping(subject, analyst);
    const analystResponse = await this.withTimeout(
      this.agentService.speak(analyst, analystContext, {
        creativity: "medium",
        outputLength: "short",
      }),
      this.STAGE_TIMEOUT,
      "Analyst critique",
    );

    const msgAnalyst = this.agentService.createMessage(
      analyst,
      analystResponse,
      "ideation",
      "critique",
    );
    allMessages.push(msgAnalyst);
    subject.next({ type: "discussion.message", data: msgAnalyst });

    // Round 4: 总监综合，确定研究方向
    const summaryContext = `基于团队讨论和分析师的反馈：

分析师反馈：${analystResponse}

请综合所有观点，确定 3-4 个明确的研究方向，并分配给研究员。

请以 JSON 格式输出：
\`\`\`json
[
  {
    "title": "研究方向标题",
    "description": "简要描述",
    "assignedTo": "研究员 A/B/C",
    "searchQueries": ["搜索关键词1", "搜索关键词2"]
  }
]
\`\`\``;

    this.emitTyping(subject, director);
    const directorSummary = await this.withTimeout(
      this.agentService.speak(director, summaryContext, {
        creativity: "medium",
        outputLength: "short",
      }),
      this.STAGE_TIMEOUT,
      "Director summary",
    );

    const msgSummary = this.agentService.createMessage(
      director,
      directorSummary,
      "ideation",
      "synthesis",
    );
    allMessages.push(msgSummary);
    subject.next({ type: "discussion.message", data: msgSummary });

    // 解析研究方向
    let directions = this.agentService.parseDirections(directorSummary);

    // 确保有至少 2 个方向
    if (directions.length < 2) {
      directions = [
        {
          title: `${dto.query} - 核心分析`,
          description: "从核心概念和技术角度深入分析",
          assignedTo: "研究员 A",
          searchQueries: [dto.query, `${dto.query} analysis`],
        },
        {
          title: `${dto.query} - 应用与影响`,
          description: "从应用场景和社会影响角度分析",
          assignedTo: "研究员 B",
          searchQueries: [`${dto.query} impact`, `${dto.query} application`],
        },
        {
          title: `${dto.query} - 趋势与展望`,
          description: "从发展趋势和未来展望角度分析",
          assignedTo: "研究员 C",
          searchQueries: [
            `${dto.query} trends 2024 2025`,
            `${dto.query} future`,
          ],
        },
      ];
    }

    return directions;
  }

  // ==================== Phase 2: Execution ====================

  private async runExecutionPhase(
    dto: StartDeepResearchDto,
    team: Map<string, AgentState>,
    directions: ResearchDirection[],
    searchRounds: SearchRound[],
    allMessages: DiscussionMessage[],
    subject: Subject<DeepResearchSSEEvent>,
  ): Promise<void> {
    const depth = dto.options?.depth || "standard";
    const maxRoundsPerDirection: Record<string, number> = {
      quick: 1,
      standard: 2,
      thorough: 3,
    };
    const roundsPerDir = maxRoundsPerDirection[depth] || 2;

    // 按方向分配给研究员
    const researcherIds = ["researcher-a", "researcher-b", "researcher-c"];

    for (let dirIdx = 0; dirIdx < directions.length; dirIdx++) {
      const direction = directions[dirIdx];
      const researcherId = researcherIds[dirIdx % researcherIds.length];
      const researcher = this.getAgent(team, researcherId);

      // 状态更新
      const statusMsg = this.agentService.createMessage(
        researcher,
        `正在调研方向："${direction.title}"`,
        "execution",
        "status",
      );
      allMessages.push(statusMsg);
      subject.next({ type: "discussion.message", data: statusMsg });

      // 执行搜索
      for (
        let roundIdx = 0;
        roundIdx < roundsPerDir && roundIdx < direction.searchQueries.length;
        roundIdx++
      ) {
        const query = direction.searchQueries[roundIdx] || direction.title;
        const roundNum = searchRounds.length + 1;

        // 搜索进度事件
        subject.next({
          type: "search_progress",
          data: {
            round: roundNum,
            totalRounds: directions.length * roundsPerDir,
            query,
            resultsCount: 0,
            message: `${researcher.config.name} 正在搜索: ${query}`,
          },
        });

        const step: ResearchPlanStep = {
          id: `step_${dirIdx}_${roundIdx}`,
          type: roundIdx === 0 ? "initial_search" : "deep_dive",
          query,
          rationale: direction.description,
          estimatedSources: 10,
        };

        const round = await this.withTimeout(
          this.searchService.executeStep(step, roundNum),
          this.STAGE_TIMEOUT,
          `Search ${roundNum}`,
        );
        searchRounds.push(round);

        // 搜索完成事件
        subject.next({
          type: "search_progress",
          data: {
            round: roundNum,
            totalRounds: directions.length * roundsPerDir,
            query,
            resultsCount: round.resultsCount,
            message: `${researcher.config.name} 找到 ${round.resultsCount} 个来源`,
          },
        });

        // 短暂延迟避免限速
        await this.delay(300);
      }
    }
  }

  // ==================== Phase 3: Findings ====================

  private async runFindingsPhase(
    _dto: StartDeepResearchDto,
    team: Map<string, AgentState>,
    searchRounds: SearchRound[],
    allMessages: DiscussionMessage[],
    subject: Subject<DeepResearchSSEEvent>,
  ): Promise<void> {
    const director = this.getAgent(team, "director");
    const analyst = this.getAgent(team, "analyst");
    const researcherIds = ["researcher-a", "researcher-b", "researcher-c"];

    // 准备搜索结果摘要
    const sourceSummary = searchRounds
      .map(
        (r) =>
          `[轮次 ${r.round}] 查询: "${r.query}" - 找到 ${r.resultsCount} 个来源\n` +
          r.sources
            .slice(0, 3)
            .map((s) => `  - ${s.title}: ${s.snippet.slice(0, 100)}`)
            .join("\n"),
      )
      .join("\n\n");

    // 研究员汇报（并行）
    const findingsContext = `你已完成搜索调研。以下是搜索结果：

${sourceSummary}

请总结你的关键发现（150-250字），包括：
1. 最重要的发现
2. 意外发现
3. 需要进一步验证的点`;

    const findingsPromises = researcherIds.map(async (id) => {
      const researcher = team.get(id);
      if (!researcher) {
        this.logger.warn(`Researcher ${id} not found in team`);
        return null;
      }
      this.emitTyping(subject, researcher);
      const findings = await this.withTimeout(
        this.agentService.speak(researcher, findingsContext, {
          creativity: "medium",
          outputLength: "short",
        }),
        this.STAGE_TIMEOUT,
        `${id} findings`,
      );
      return { researcher, findings };
    });

    const settledResults = await Promise.allSettled(findingsPromises);
    const allFindings = settledResults
      .filter(
        (
          r,
        ): r is PromiseFulfilledResult<{
          researcher: AgentState;
          findings: string;
        } | null> => r.status === "fulfilled" && r.value !== null,
      )
      .map((r) => r.value!);
    const findingsTexts: string[] = [];

    for (const { researcher, findings } of allFindings) {
      const msg = this.agentService.createMessage(
        researcher,
        findings,
        "findings",
        "findings",
      );
      allMessages.push(msg);
      subject.next({ type: "discussion.message", data: msg });
      findingsTexts.push(`${researcher.config.name}：${findings}`);
    }

    // 分析师交叉验证
    const crossCheckContext = `以下是研究员们的汇报：

${findingsTexts.join("\n\n")}

请进行交叉验证：
1. 指出不同研究员发现之间的矛盾
2. 识别信息缺口
3. 评估整体研究质量`;

    this.emitTyping(subject, analyst);
    const crossCheck = await this.withTimeout(
      this.agentService.speak(analyst, crossCheckContext, {
        creativity: "low",
        outputLength: "short",
      }),
      this.STAGE_TIMEOUT,
      "Analyst cross-check",
    );

    const msgCrossCheck = this.agentService.createMessage(
      analyst,
      crossCheck,
      "findings",
      "cross_check",
    );
    allMessages.push(msgCrossCheck);
    subject.next({ type: "discussion.message", data: msgCrossCheck });

    // 总监综合洞察
    const insightContext = `分析师的交叉验证：
${crossCheck}

请综合所有发现，给出最终研究洞察（200-300字）。这将作为报告撰写的核心纲要。`;

    this.emitTyping(subject, director);
    const directorInsight = await this.withTimeout(
      this.agentService.speak(director, insightContext, {
        creativity: "medium",
        outputLength: "short",
      }),
      this.STAGE_TIMEOUT,
      "Director insight",
    );

    const msgInsight = this.agentService.createMessage(
      director,
      directorInsight,
      "findings",
      "synthesis",
    );
    allMessages.push(msgInsight);
    subject.next({ type: "discussion.message", data: msgInsight });
  }

  // ==================== Phase 4: Synthesis ====================

  private async runSynthesisPhase(
    dto: StartDeepResearchDto,
    team: Map<string, AgentState>,
    searchRounds: SearchRound[],
    allMessages: DiscussionMessage[],
    subject: Subject<DeepResearchSSEEvent>,
  ): Promise<DeepResearchReport> {
    const writer = this.getAgent(team, "writer");
    const reviewer = this.getAgent(team, "reviewer");

    // 撰稿人开始写作通知
    const writeStartMsg = this.agentService.createMessage(
      writer,
      "开始基于团队讨论和研究发现撰写报告...",
      "synthesis",
      "status",
    );
    allMessages.push(writeStartMsg);
    subject.next({ type: "discussion.message", data: writeStartMsg });

    // 流式生成报告
    this.emitTyping(subject, writer);
    for await (const chunk of this.reportService.generateReportStream(
      dto.query,
      searchRounds,
      { language: dto.options?.language },
    )) {
      subject.next({
        type: "content.delta",
        data: {
          section: chunk.section,
          delta: chunk.content,
        },
      });
    }

    // 生成完整报告
    const report = await this.withTimeout(
      this.reportService.generateReport(dto.query, searchRounds, {
        language: dto.options?.language,
        isFollowUp: dto.isFollowUp,
        previousContext: dto.previousContext,
      }),
      this.STAGE_TIMEOUT,
      "Report synthesis",
    );

    // 撰稿人完成通知
    const writeDoneMsg = this.agentService.createMessage(
      writer,
      "报告初稿已完成，提交审稿人评审。",
      "synthesis",
      "draft",
    );
    allMessages.push(writeDoneMsg);
    subject.next({ type: "discussion.message", data: writeDoneMsg });

    // 审稿人评审
    const reviewContext = `请审查以下报告的质量：

执行摘要：${report.executiveSummary.slice(0, 300)}...

章节数：${report.sections.length}
引用数：${report.references.length}

请简要评价报告质量（50-100字）。`;

    this.emitTyping(subject, reviewer);
    const reviewResponse = await this.withTimeout(
      this.agentService.speak(reviewer, reviewContext, {
        creativity: "low",
        outputLength: "minimal",
        modelType: AIModelType.CHAT_FAST,
      }),
      this.STAGE_TIMEOUT,
      "Review",
    );

    const reviewMsg = this.agentService.createMessage(
      reviewer,
      reviewResponse,
      "synthesis",
      "review",
    );
    allMessages.push(reviewMsg);
    subject.next({ type: "discussion.message", data: reviewMsg });

    return report;
  }

  // ==================== 会话管理（代理给原有 service） ====================

  async getSession(sessionId: string) {
    return this.prisma.deepResearchSession.findUnique({
      where: { id: sessionId },
    });
  }

  async getProjectSessions(projectId: string) {
    return this.prisma.deepResearchSession.findMany({
      where: { projectId },
      orderBy: { createdAt: "desc" },
      take: 10,
    });
  }

  async deleteSession(sessionId: string) {
    return this.prisma.deepResearchSession.delete({
      where: { id: sessionId },
    });
  }

  async deleteSessions(sessionIds: string[]) {
    return this.prisma.deepResearchSession.deleteMany({
      where: { id: { in: sessionIds } },
    });
  }

  // ==================== 工具方法 ====================

  private getAgent(team: Map<string, AgentState>, id: string): AgentState {
    const agent = team.get(id);
    if (!agent) {
      throw new Error(`Agent "${id}" not initialized in team`);
    }
    return agent;
  }

  private emitTyping(
    subject: Subject<DeepResearchSSEEvent>,
    agent: AgentState,
  ): void {
    subject.next({
      type: "discussion.typing",
      data: {
        agentRole: agent.config.role,
        agentName: agent.config.name,
      },
    });
  }

  private async updateSession(
    sessionId: string,
    data: {
      status?: DeepResearchStatus;
      plan?: unknown;
      searchRounds?: unknown;
      reflections?: unknown;
      thinkingChain?: unknown;
      report?: unknown;
      discussion?: unknown;
      directions?: unknown;
      sourcesUsed?: number;
      tokensUsed?: number;
      error?: string;
      completedAt?: Date;
    },
  ) {
    return this.prisma.deepResearchSession.update({
      where: { id: sessionId },
      data: JSON.parse(JSON.stringify(data)),
    });
  }

  private countUniqueSources(searchRounds: SearchRound[]): number {
    const urls = new Set<string>();
    for (const round of searchRounds) {
      for (const source of round.sources) {
        urls.add(source.url);
      }
    }
    return urls.size;
  }

  private async withTimeout<T>(
    promise: Promise<T>,
    timeoutMs: number,
    operationName: string,
  ): Promise<T> {
    let timeoutId: NodeJS.Timeout | undefined;
    const timeoutPromise = new Promise<never>((_, reject) => {
      timeoutId = setTimeout(() => {
        reject(new Error(`${operationName} 超时 (${timeoutMs / 1000}秒)`));
      }, timeoutMs);
    });

    try {
      const result = await Promise.race([promise, timeoutPromise]);
      return result;
    } finally {
      if (timeoutId !== undefined) {
        clearTimeout(timeoutId);
      }
    }
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
