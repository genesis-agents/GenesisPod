import { Injectable, Logger, Optional } from "@nestjs/common";
import { Subject, Observable } from "rxjs";
import { AIModelType, DeepResearchStatus } from "@prisma/client";
import { PrismaService } from "../../../../common/prisma/prisma.service";
import { DiscussionAgentService } from "./discussion-agent.service";
import { IterativeSearchService } from "./iterative-search.service";
import { ReportSynthesizerService } from "./report-synthesizer.service";
import {
  CreditsService,
  InsufficientCreditsException,
  BillingContext,
} from "../../../ai-infra/facade";
import { ResearchIdeaService } from "../idea/research-idea.service";
import { AgentFacade, TeamFacade } from "../../../ai-engine/facade";
import {
  MissionExecutorService,
  KernelContext,
} from "../../../ai-kernel/facade";
import { ResearchReplannerService } from "./research-replanner.service";
import { ResearchToolRouterService } from "../search/research-tool-router.service";
import type { ResearchToolStrategy } from "../search/research-tool-router.types";
import { ResearchQualityGateService } from "../quality/research-quality-gate.service";
import { ResearchFactCheckerService } from "../quality/research-fact-checker.service";
import { LruMap } from "@/common/utils/lru-map";
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
import {
  ResearchLanguage,
  resolveLanguage,
  PHASE_MESSAGES,
  ORCHESTRATOR_PROMPTS,
  SEARCH_MESSAGES,
} from "./prompt-locale";

/**
 * 讨论驱动型研究编排器
 * 完全替代 DiscussionResearchService 的研究执行流程
 *
 * 流程: Ideation → Execution → Findings → Synthesis
 */
@Injectable()
export class DiscussionOrchestratorService {
  private readonly logger = new Logger(DiscussionOrchestratorService.name);
  private readonly STAGE_TIMEOUT = 2 * 60 * 1000;
  /** Synthesis involves multi-step report generation; needs a longer timeout */
  private readonly SYNTHESIS_TIMEOUT = 12 * 60 * 1000;
  private readonly kernelProcessIds = new LruMap<string, string>(500);

  constructor(
    private readonly prisma: PrismaService,
    private readonly agentService: DiscussionAgentService,
    private readonly searchService: IterativeSearchService,
    private readonly reportService: ReportSynthesizerService,
    @Optional() private readonly creditsService: CreditsService,
    @Optional() private readonly ideaService: ResearchIdeaService,
    @Optional() private readonly agentFacade: AgentFacade,
    @Optional() private readonly teamFacade: TeamFacade,
    @Optional() private readonly replanner: ResearchReplannerService,
    @Optional() private readonly missionExecutor?: MissionExecutorService,
    @Optional() private readonly toolRouter?: ResearchToolRouterService,
    @Optional() private readonly qualityGate?: ResearchQualityGateService,
    @Optional() private readonly factChecker?: ResearchFactCheckerService,
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
    const language = resolveLanguage(dto.options?.language);
    const allMessages: DiscussionMessage[] = [];
    const searchRounds: SearchRound[] = [];

    // ★ 工具路由：根据查询主题分类，选择最佳搜索工具组合
    const toolStrategy: ResearchToolStrategy | undefined =
      this.toolRouter?.buildToolStrategy(dto.query);

    // Start observability trace
    const traceId = this.agentFacade?.startTrace({
      name: `Research: ${dto.query.slice(0, 80)}`,
      type: "research",
      metadata: { projectId, depth: dto.options?.depth || "standard" },
    });

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
        mode: dto.mode ?? "single",
        status: DeepResearchStatus.IDEATION,
      },
    });

    // Spawn AI Kernel process for tracking
    if (this.missionExecutor) {
      try {
        const kernelResult = await this.missionExecutor.execute({
          userId: project.userId,
          agentId: "research-discussion",
          teamSessionId: session.id,
          input: {
            query: dto.query.slice(0, 200),
            depth: dto.options?.depth || "standard",
          },
        });
        this.kernelProcessIds.set(session.id, kernelResult.processId);
      } catch (err) {
        this.logger.warn(
          `[Kernel] Failed to spawn process: ${(err as Error).message}`,
        );
      }
    }

    const sessionProcessId = this.kernelProcessIds.get(session.id);
    const runPhases = async () => {
      try {
        // 初始化 Agent 团队
        const team = this.agentService.initializeTeam(dto.query, language);

        // ========== Phase 1: IDEATION ==========
        subject.next({
          type: "discussion.phase",
          data: {
            phase: "ideation",
            summary: PHASE_MESSAGES[language].ideation,
          },
        });

        const ideationSpanId = traceId
          ? this.agentFacade?.addSpan(traceId, {
              name: "ideation",
              type: "phase",
            })
          : undefined;

        const directions = await this.runIdeationPhase(
          session.id,
          dto,
          team,
          allMessages,
          subject,
          language,
        );

        if (ideationSpanId) {
          this.agentFacade?.endSpan(ideationSpanId, {
            status: "success",
            output: { directionsCount: directions.length },
          });
        }

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
            summary: PHASE_MESSAGES[language].execution,
            directions: directions.map((d) => d.title),
          },
        });

        const executionSpanId = traceId
          ? this.agentFacade?.addSpan(traceId, {
              name: "execution",
              type: "phase",
            })
          : undefined;

        await this.runExecutionPhase(
          session.id,
          dto,
          team,
          directions,
          searchRounds,
          allMessages,
          subject,
          language,
          toolStrategy,
        );

        // ========== Dynamic Replanning ==========
        if (this.replanner && searchRounds.length > 0) {
          const replanSpanId = traceId
            ? this.agentFacade?.addSpan(traceId, {
                name: "replanning",
                type: "evaluation",
              })
            : undefined;

          const replanResult = await this.replanner.evaluateAndReplan(
            dto.query,
            searchRounds,
            dto.options?.language,
          );

          if (
            replanResult.needsReplan &&
            replanResult.additionalSteps.length > 0
          ) {
            this.logger.log(
              `[Replanner] Adding ${replanResult.additionalSteps.length} extra searches: ${replanResult.record?.reason}`,
            );

            const replanTotal =
              searchRounds.length + replanResult.additionalSteps.length;

            for (const step of replanResult.additionalSteps) {
              const roundNum = searchRounds.length + 1;
              subject.next({
                type: "search_progress",
                data: {
                  round: roundNum,
                  totalRounds: replanTotal,
                  query: step.query,
                  resultsCount: 0,
                  message:
                    language === "en-US"
                      ? `[Gap Fill] Searching: ${step.query}`
                      : `[补充搜索] 查询: ${step.query}`,
                },
              });

              // ★ Replan 补充搜索也使用工具路由
              const replanResolution =
                toolStrategy && this.toolRouter
                  ? this.toolRouter.resolveToolsForStep(
                      step,
                      toolStrategy.topicType,
                      toolStrategy.stepOverrides,
                    )
                  : undefined;

              const round = await this.withTimeout(
                this.searchService.executeStep(
                  step,
                  roundNum,
                  replanResolution,
                ),
                this.STAGE_TIMEOUT,
                `Replan search ${roundNum}`,
              ).catch((err: unknown) => {
                this.logger.warn(
                  `[Replanner] Extra search failed: ${err instanceof Error ? err.message : String(err)}`,
                );
                return null;
              });

              if (round) {
                searchRounds.push(round);
                subject.next({
                  type: "search_progress",
                  data: {
                    round: roundNum,
                    totalRounds: replanTotal,
                    query: step.query,
                    resultsCount: round.resultsCount,
                    message:
                      language === "en-US"
                        ? `[Gap Fill] Found ${round.resultsCount} additional sources`
                        : `[补充搜索] 找到 ${round.resultsCount} 个来源`,
                  },
                });
              }
            }
          }

          if (replanSpanId) {
            this.agentFacade?.endSpan(replanSpanId, {
              status: "success",
              output: {
                replanned: replanResult.needsReplan,
                addedSteps: replanResult.additionalSteps.length,
              },
            });
          }
        }

        if (executionSpanId) {
          this.agentFacade?.endSpan(executionSpanId, {
            status: "success",
            output: { searchRounds: searchRounds.length },
          });
        }

        await this.updateSession(session.id, {
          searchRounds: searchRounds as unknown as Record<string, unknown>[],
          discussion: allMessages as unknown as Record<string, unknown>[],
        });

        // ========== Phase 3: FINDINGS ==========
        subject.next({
          type: "discussion.phase",
          data: {
            phase: "findings",
            summary: PHASE_MESSAGES[language].findings,
          },
        });

        await this.updateSession(session.id, {
          status: DeepResearchStatus.FINDINGS as DeepResearchStatus,
        });

        const findingsSpanId = traceId
          ? this.agentFacade?.addSpan(traceId, {
              name: "findings",
              type: "phase",
            })
          : undefined;

        await this.runFindingsPhase(
          session.id,
          dto,
          team,
          searchRounds,
          allMessages,
          subject,
          language,
        );

        if (findingsSpanId) {
          this.agentFacade?.endSpan(findingsSpanId, { status: "success" });
        }

        await this.updateSession(session.id, {
          discussion: allMessages as unknown as Record<string, unknown>[],
        });

        // ========== Phase 4: SYNTHESIS ==========
        subject.next({
          type: "discussion.phase",
          data: {
            phase: "synthesis",
            summary: PHASE_MESSAGES[language].synthesis,
          },
        });

        await this.updateSession(session.id, {
          status: DeepResearchStatus.SYNTHESIZING,
        });

        const synthesisSpanId = traceId
          ? this.agentFacade?.addSpan(traceId, {
              name: "synthesis",
              type: "phase",
            })
          : undefined;

        const report = await this.runSynthesisPhase(
          session.id,
          dto,
          team,
          searchRounds,
          allMessages,
          subject,
          language,
        );

        if (synthesisSpanId) {
          this.agentFacade?.endSpan(synthesisSpanId, {
            status: "success",
            output: {
              sections: report.sections.length,
              references: report.references.length,
            },
          });
        }

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

        // Complete AI Kernel process
        this.completeKernelProcess(session.id, {
          totalSources,
          duration,
          searchRounds: searchRounds.length,
        });

        // End observability trace
        if (traceId) {
          this.agentFacade?.endTrace(traceId, {
            status: "success",
            totalDuration: Date.now() - startTime,
          });
        }

        // 反哺长期记忆（fire-and-forget，不阻塞主流程）
        this.agentFacade
          ?.coordinatorStore(
            {
              type: "knowledge",
              key: `research:${session.id}`,
              value: {
                title: dto.query.slice(0, 100),
                summary: (finalReport.executiveSummary || dto.query).slice(
                  0,
                  2000,
                ),
                url: `/ai-research/${projectId}`,
                completedAt: new Date().toISOString(),
                sources: totalSources,
              },
              importance: 0.8,
              tags: ["research", "completed"],
            },
            project.userId,
          )
          ?.catch((err: unknown) => {
            this.logger.warn(
              `[memory] Failed to store research memory for session ${session.id}: ${err instanceof Error ? err.message : String(err)}`,
            );
          });

        // Auto-extract ideas from discussion messages
        // Skip in iterative mode — the iteration service handles extraction and
        // calling it here would cause a duplicate (and the 2nd run deletes+recreates).
        if (
          session.mode !== "iterative" &&
          session.mode !== "iterative_internal"
        ) {
          try {
            await this.autoExtractIdeas(projectId, session.id, allMessages);
          } catch (extractError) {
            this.logger.warn(
              `Failed to auto-extract ideas from session ${session.id}: ${extractError instanceof Error ? extractError.message : String(extractError)}`,
            );
          }
        }
      } catch (error) {
        // Fail AI Kernel process
        this.failKernelProcess(
          session.id,
          error instanceof Error ? error.message : String(error),
        );

        // End trace on failure
        if (traceId) {
          this.agentFacade?.endTrace(traceId, {
            status: "error",
            totalDuration: Date.now() - startTime,
          });
        }
        await this.updateSession(session.id, {
          status: DeepResearchStatus.FAILED,
          error: error instanceof Error ? error.message : String(error),
          discussion: allMessages as unknown as Record<string, unknown>[],
        });
        throw error;
      } finally {
        subject.complete();
        this.teamFacade?.a2aClearSession(session.id);
      }
    };

    await (sessionProcessId
      ? KernelContext.run(
          { processId: sessionProcessId, userId: project.userId },
          runPhases,
        )
      : runPhases());
  }

  // ==================== Phase 1: Ideation ====================

  private async runIdeationPhase(
    sessionId: string,
    dto: StartDeepResearchDto,
    team: Map<string, AgentState>,
    allMessages: DiscussionMessage[],
    subject: Subject<DeepResearchSSEEvent>,
    language: ResearchLanguage,
  ): Promise<ResearchDirection[]> {
    const isFollowUp = dto.isFollowUp ?? false;
    const director = this.getAgent(team, "director");
    const researcherA = this.getAgent(team, "researcher-a");
    const researcherB = this.getAgent(team, "researcher-b");
    const researcherC = this.getAgent(team, "researcher-c");
    const analyst = this.getAgent(team, "analyst");

    const op = ORCHESTRATOR_PROMPTS[language];

    // Build a concise summary of previous findings for follow-up rounds
    let previousFindings: string | undefined;
    if (isFollowUp && dto.previousContext) {
      const ctx = dto.previousContext;
      const parts: string[] = [];
      if (ctx.executiveSummary) {
        parts.push(`**核心摘要**: ${ctx.executiveSummary.slice(0, 500)}`);
      }
      if (ctx.sections && ctx.sections.length > 0) {
        const sectionSummary = ctx.sections
          .map(
            (s: { title: string; content: string }) =>
              `- ${s.title}: ${s.content.slice(0, 150)}...`,
          )
          .slice(0, 5)
          .join("\n");
        parts.push(`**已研究章节**:\n${sectionSummary}`);
      }
      if (ctx.conclusion) {
        parts.push(`**结论**: ${ctx.conclusion.slice(0, 300)}`);
      }
      if (ctx.iterationHistory) {
        // Cap iteration history to prevent context bloat (already pre-truncated
        // by buildIterationHistory, this is a second safety net)
        const cappedHistory =
          ctx.iterationHistory.length > 2000
            ? ctx.iterationHistory.slice(0, 2000) + "\n[...已截断]"
            : ctx.iterationHistory;
        parts.push(`**迭代历史**:\n${cappedHistory}`);
      }
      previousFindings = parts.join("\n\n");
    }

    // Round 1: 总监开场
    const directorOpener = isFollowUp
      ? op.directorOpenerFollowUp(dto.query, previousFindings)
      : op.directorOpener(dto.query);

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
    this.publishMessage(sessionId, msg1, subject);

    // Round 2: 研究员们各自提 Ideas（并行）
    const researcherContext = op.researcherIdeation(directorResponse);

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
          : language === "en-US"
            ? `[Analysis temporarily unavailable: ${result.reason instanceof Error ? result.reason.message : "unknown error"}]`
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
      this.publishMessage(sessionId, msg, subject);
    }

    const [respA, respB, respC] = responses;

    // Round 3: 分析师挑战假设
    const analystContext = op.analystCritique(
      directorResponse,
      respA,
      respB,
      respC,
    );

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
    this.publishMessage(sessionId, msgAnalyst, subject);

    // Round 4: 总监综合，确定研究方向
    const summaryContext = op.directorSummary(analystResponse);

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
    this.publishMessage(sessionId, msgSummary, subject);

    // 解析研究方向
    let directions = this.agentService.parseDirections(
      directorSummary,
      language,
    );

    // 确保有至少 2 个方向
    if (directions.length < 2) {
      const currentYear = new Date().getFullYear();
      const core = op.fallbackDirectionCore(dto.query);
      const impact = op.fallbackDirectionImpact(dto.query);
      const trends = op.fallbackDirectionTrends(dto.query);
      directions = [
        {
          ...core,
          searchQueries: [dto.query, `${dto.query} analysis`],
        },
        {
          ...impact,
          searchQueries: [`${dto.query} impact`, `${dto.query} application`],
        },
        {
          ...trends,
          searchQueries: [
            `${dto.query} trends ${currentYear} ${currentYear + 1}`,
            `${dto.query} future`,
          ],
        },
      ];
    }

    return directions;
  }

  // ==================== Phase 2: Execution ====================

  private async runExecutionPhase(
    sessionId: string,
    dto: StartDeepResearchDto,
    team: Map<string, AgentState>,
    directions: ResearchDirection[],
    searchRounds: SearchRound[],
    allMessages: DiscussionMessage[],
    subject: Subject<DeepResearchSSEEvent>,
    language: ResearchLanguage,
    toolStrategy?: ResearchToolStrategy,
  ): Promise<void> {
    const depth = dto.options?.depth || "standard";
    const maxRoundsPerDirection: Record<string, number> = {
      quick: 1,
      standard: 2,
      thorough: 3,
    };
    const roundsPerDir = maxRoundsPerDirection[depth] || 2;

    const op = ORCHESTRATOR_PROMPTS[language];
    const searchMsg = SEARCH_MESSAGES[language];

    // 按方向分配给研究员
    const researcherIds = ["researcher-a", "researcher-b", "researcher-c"];

    for (let dirIdx = 0; dirIdx < directions.length; dirIdx++) {
      const direction = directions[dirIdx];
      const researcherId = researcherIds[dirIdx % researcherIds.length];
      const researcher = this.getAgent(team, researcherId);

      // 状态更新
      const statusMsg = this.agentService.createMessage(
        researcher,
        op.executionStatus(direction.title),
        "execution",
        "status",
      );
      allMessages.push(statusMsg);
      this.publishMessage(sessionId, statusMsg, subject);

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
            message: searchMsg.searchProgress(researcher.config.name, query),
          },
        });

        const step: ResearchPlanStep = {
          id: `step_${dirIdx}_${roundIdx}`,
          type: roundIdx === 0 ? "initial_search" : "deep_dive",
          query,
          rationale: direction.description,
          estimatedSources: 10,
        };

        // ★ 使用工具路由解析本步骤的工具组合
        const stepResolution =
          toolStrategy && this.toolRouter
            ? this.toolRouter.resolveToolsForStep(
                step,
                toolStrategy.topicType,
                toolStrategy.stepOverrides,
              )
            : undefined;

        const round = await this.withTimeout(
          this.searchService.executeStep(step, roundNum, stepResolution),
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
            message: searchMsg.searchComplete(
              researcher.config.name,
              round.resultsCount,
            ),
          },
        });

        // 短暂延迟避免限速
        await this.delay(300);
      }
    }
  }

  // ==================== Phase 3: Findings ====================

  private async runFindingsPhase(
    sessionId: string,
    _dto: StartDeepResearchDto,
    team: Map<string, AgentState>,
    searchRounds: SearchRound[],
    allMessages: DiscussionMessage[],
    subject: Subject<DeepResearchSSEEvent>,
    language: ResearchLanguage,
  ): Promise<void> {
    const director = this.getAgent(team, "director");
    const analyst = this.getAgent(team, "analyst");
    const researcherIds = ["researcher-a", "researcher-b", "researcher-c"];

    const op = ORCHESTRATOR_PROMPTS[language];
    const searchMsg = SEARCH_MESSAGES[language];

    // 准备搜索结果摘要
    const sourceSummary = searchRounds
      .map(
        (r) =>
          `[${searchMsg.roundLabel(r.round)}] ${language === "en-US" ? `Query: "${r.query}" - found ${r.resultsCount} sources` : `查询: "${r.query}" - 找到 ${r.resultsCount} 个来源`}\n` +
          r.sources
            .slice(0, 3)
            .map((s) => `  - ${s.title}: ${s.snippet.slice(0, 100)}`)
            .join("\n"),
      )
      .join("\n\n");

    // 研究员汇报（并行）
    const findingsContext = op.findingsRequest(sourceSummary);

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
      this.publishMessage(sessionId, msg, subject);
      findingsTexts.push(`${researcher.config.name}：${findings}`);
    }

    // 分析师交叉验证 (★ 使用 fact-check + consistency-check 技能)
    const crossCheckContext = op.crossCheckRequest(findingsTexts.join("\n\n"));

    this.emitTyping(subject, analyst);
    const crossCheck = await this.withTimeout(
      this.agentService.speak(analyst, crossCheckContext, {
        creativity: "low",
        outputLength: "short",
        additionalSkills: [
          "fact-check",
          "consistency-check",
          "cross-reference-validation",
        ],
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
    this.publishMessage(sessionId, msgCrossCheck, subject);

    // 总监综合洞察 (★ 使用 synthesis + critical-thinking 技能)
    const insightContext = op.insightRequest(crossCheck);

    this.emitTyping(subject, director);
    const directorInsight = await this.withTimeout(
      this.agentService.speak(director, insightContext, {
        creativity: "medium",
        outputLength: "short",
        additionalSkills: ["synthesis", "critical-thinking", "gap-analysis"],
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
    this.publishMessage(sessionId, msgInsight, subject);
  }

  // ==================== Phase 4: Synthesis ====================

  private async runSynthesisPhase(
    sessionId: string,
    dto: StartDeepResearchDto,
    team: Map<string, AgentState>,
    searchRounds: SearchRound[],
    allMessages: DiscussionMessage[],
    subject: Subject<DeepResearchSSEEvent>,
    language: ResearchLanguage,
  ): Promise<DeepResearchReport> {
    const writer = this.getAgent(team, "writer");
    const reviewer = this.getAgent(team, "reviewer");

    const phaseMsg = PHASE_MESSAGES[language];
    const op = ORCHESTRATOR_PROMPTS[language];

    // 撰稿人开始写作通知
    const writeStartMsg = this.agentService.createMessage(
      writer,
      phaseMsg.writeStart,
      "synthesis",
      "status",
    );
    allMessages.push(writeStartMsg);
    this.publishMessage(sessionId, writeStartMsg, subject);

    // 生成完整报告（单次生成，避免双重 LLM 调用导致超时/OOM）
    this.emitTyping(subject, writer);
    const report = await this.withTimeout(
      this.reportService.generateReport(dto.query, searchRounds, {
        language: dto.options?.language,
        isFollowUp: dto.isFollowUp,
        previousContext: dto.previousContext,
      }),
      this.SYNTHESIS_TIMEOUT,
      "Report synthesis",
    );

    // ★ 质量门检查：自动修复格式问题
    if (this.qualityGate) {
      for (const section of report.sections) {
        const qr = this.qualityGate.validateReport(section.content);
        if (qr.wasAutoFixed && qr.fixedContent) {
          section.content = qr.fixedContent;
        }
      }
      const summaryQr = this.qualityGate.validateReport(
        report.executiveSummary,
      );
      if (summaryQr.wasAutoFixed && summaryQr.fixedContent) {
        report.executiveSummary = summaryQr.fixedContent;
      }
    }

    // ★ 事实检查 (fire-and-forget, 不阻塞主流程)
    if (this.factChecker && report.references.length > 0) {
      void this.factChecker
        .checkConsistency(
          report.sections
            .map((s) => `### ${s.title}\n${s.content}`)
            .join("\n\n"),
        )
        .then((result) => {
          if (result && !result.isConsistent) {
            this.logger.warn(
              `[FactChecker] Report has ${result.conflicts.length} consistency conflicts`,
            );
          }
        })
        .catch((err: unknown) => {
          this.logger.warn(
            `[FactChecker] consistency check failed: ${err instanceof Error ? err.message : String(err)}`,
          );
        });
    }

    // 撰稿人完成通知
    const writeDoneMsg = this.agentService.createMessage(
      writer,
      phaseMsg.writeDone,
      "synthesis",
      "draft",
    );
    allMessages.push(writeDoneMsg);
    this.publishMessage(sessionId, writeDoneMsg, subject);

    // 审稿人评审
    const reviewContext = op.reviewRequest(
      report.executiveSummary.slice(0, 300),
      report.sections.length,
      report.references.length,
    );

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
    this.publishMessage(sessionId, reviewMsg, subject);

    return report;
  }

  // ==================== 会话管理（代理给原有 service） ====================

  async getSession(sessionId: string) {
    return this.prisma.deepResearchSession.findUnique({
      where: { id: sessionId },
    });
  }

  async getProjectSessions(projectId: string) {
    const sessions = await this.prisma.deepResearchSession.findMany({
      where: { projectId },
      orderBy: { createdAt: "desc" },
      take: 10,
    });

    // Auto-correct stale sessions stuck in intermediate states
    const staleThreshold = 5 * 60 * 1000; // 5 minutes
    const now = Date.now();
    const intermediateStatuses: DeepResearchStatus[] = [
      DeepResearchStatus.IDEATION,
      DeepResearchStatus.PLANNING,
      DeepResearchStatus.SEARCHING,
      DeepResearchStatus.FINDINGS,
      DeepResearchStatus.REFLECTING,
      DeepResearchStatus.SYNTHESIZING,
    ];

    for (const session of sessions) {
      if (
        intermediateStatuses.includes(session.status) &&
        now - session.updatedAt.getTime() > staleThreshold
      ) {
        // If session has discussion data, mark as COMPLETED; otherwise FAILED
        const hasContent =
          session.discussion !== null &&
          Array.isArray(session.discussion) &&
          (session.discussion as unknown[]).length > 0;
        const newStatus = hasContent
          ? DeepResearchStatus.COMPLETED
          : DeepResearchStatus.FAILED;

        this.logger.warn(
          `Auto-correcting stale session ${session.id}: ${session.status} → ${newStatus}`,
        );
        try {
          await this.prisma.deepResearchSession.update({
            where: { id: session.id },
            data: {
              status: newStatus,
              ...(newStatus === DeepResearchStatus.FAILED && {
                error: "研究会话超时中断",
              }),
              ...(newStatus === DeepResearchStatus.COMPLETED && {
                completedAt: session.updatedAt,
              }),
            },
          });
          session.status = newStatus;
        } catch (e) {
          this.logger.error(
            `Failed to auto-correct session ${session.id}: ${e}`,
          );
        }
      }
    }

    return sessions;
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

  // ==================== AI Kernel 生命周期 ====================

  private completeKernelProcess(
    sessionId: string,
    output?: Record<string, unknown>,
  ): void {
    const processId = this.kernelProcessIds.get(sessionId);
    if (!processId || !this.missionExecutor) return;
    void this.missionExecutor
      .complete(processId, output)
      .catch((err) =>
        this.logger.warn(
          `[Kernel] Failed to complete process: ${(err as Error).message}`,
        ),
      );
    this.kernelProcessIds.delete(sessionId);
  }

  private failKernelProcess(sessionId: string, error: string): void {
    const processId = this.kernelProcessIds.get(sessionId);
    if (!processId || !this.missionExecutor) return;
    void this.missionExecutor
      .fail(processId, error)
      .catch((err) =>
        this.logger.warn(
          `[Kernel] Failed to fail process: ${(err as Error).message}`,
        ),
      );
    this.kernelProcessIds.delete(sessionId);
  }

  // ==================== 工具方法 ====================

  private getAgent(team: Map<string, AgentState>, id: string): AgentState {
    const agent = team.get(id);
    if (!agent) {
      throw new Error(`Agent "${id}" not initialized in team`);
    }
    return agent;
  }

  /**
   * 统一消息发送：同时推送 SSE 事件和 A2A Bus 消息（供可观测性使用）
   */
  private publishMessage(
    sessionId: string,
    msg: DiscussionMessage,
    subject: Subject<DeepResearchSSEEvent>,
  ): void {
    subject.next({ type: "discussion.message", data: msg });
    void this.teamFacade?.a2aPublish({
      sessionId,
      // Discussion agents are virtual roles with no UUID; agentRole is their stable identifier
      fromAgentId: msg.agentRole,
      type: "info_share",
      payload: {
        phase: msg.phase,
        messageType: msg.messageType,
        content: msg.content.slice(0, 500),
      },
    });
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

  /**
   * Auto-extract insights from completed discussion.
   * Uses ResearchIdeaService for AI-powered extraction.
   */
  private async autoExtractIdeas(
    projectId: string,
    sessionId: string,
    _messages: DiscussionMessage[],
  ): Promise<void> {
    if (!this.ideaService) {
      this.logger.log(
        `Discussion ${sessionId} completed. Ideas available for manual extraction.`,
      );
      return;
    }

    // Get the project's userId for the extraction
    const project = await this.prisma.researchProject.findUnique({
      where: { id: projectId },
      select: { userId: true },
    });
    if (!project) return;

    this.logger.log(`Auto-extracting insights from session ${sessionId}...`);
    const ideas = await this.ideaService.extractFromSession(
      project.userId,
      projectId,
      sessionId,
    );
    this.logger.log(
      `Auto-extracted ${ideas.length} insights from session ${sessionId}`,
    );
  }
}
