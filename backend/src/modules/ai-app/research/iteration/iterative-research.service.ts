import { Injectable, Logger, Optional } from "@nestjs/common";
import { Subject, Observable } from "rxjs";
import { PrismaService } from "../../../../common/prisma/prisma.service";
import { DiscussionOrchestratorService } from "../discussion/discussion-orchestrator.service";
import { ResearchIdeaService } from "../idea/research-idea.service";
import { ResearchDemoService } from "../demo/research-demo.service";
import {
  TopicClassifierService,
  DemoEvaluatorService,
  ExitDecisionService,
} from "../evaluation";
import type {
  TopicType,
  DemoScore,
  ExitDecision,
  ExitContext,
} from "../evaluation";
import { IterationRecordService } from "./iteration-record.service";
import type {
  StartIterativeResearchDto,
  IterationStartEvent,
  IterationResearchEvent,
  IterationIdeasEvent,
  IterationDemoEvent,
  IterationEvalEvent,
  IterationExitEvent,
  IterationAwaitingFeedbackEvent,
} from "./types";
import { ResearchMemoryService } from "../memory/research-memory.service";
import type {
  DeepResearchReport,
  DeepResearchSSEEvent,
} from "../discussion/types";

export type IterationSSEEvent =
  | IterationStartEvent
  | IterationResearchEvent
  | IterationIdeasEvent
  | IterationDemoEvent
  | IterationEvalEvent
  | IterationExitEvent
  | IterationAwaitingFeedbackEvent;

const DEMO_POLL_INTERVAL_MS = 3000;
const DEMO_POLL_TIMEOUT_MS = 120_000;

interface RunInnerResult {
  sessionId: string;
  report: DeepResearchReport;
}

interface IdeaItem {
  id: string;
  title: string;
  type: string;
  description: string;
  metadata: unknown;
}

/**
 * Structured snapshot persisted per-round, aligned with frontend IterationRound type.
 */
export interface IterationSnapshot {
  round: number;
  score: number;
  previousScore: number;
  gaps: { dataGaps: string[]; ideaGaps: string[] };
  research?: {
    queries: string[];
    newSources: number;
    informationGain: number;
  };
  ideas?: {
    newInsights: Array<{ title: string }>;
    newCreativeIdeas: Array<{ title: string }>;
    totalInsights: number;
    totalCreativeIdeas: number;
  };
  demo?: {
    status: "generating" | "completed";
  };
  timestamp: string; // ISO string for JSON serialization
}

export interface IterationMeta {
  exitReason: string | null;
  finalScore: number | null;
  totalIterations: number | null;
  maxIterations: number;
}

@Injectable()
export class IterativeResearchService {
  private readonly logger = new Logger(IterativeResearchService.name);

  private readonly feedbackResolvers = new Map<
    string,
    {
      resolve: (feedback: string | null) => void;
      timer: ReturnType<typeof setTimeout>;
    }
  >();

  constructor(
    private readonly prisma: PrismaService,
    private readonly orchestrator: DiscussionOrchestratorService,
    @Optional() private readonly topicClassifier?: TopicClassifierService,
    @Optional() private readonly demoEvaluator?: DemoEvaluatorService,
    @Optional() private readonly exitDecisionService?: ExitDecisionService,
    @Optional()
    private readonly iterationRecordService?: IterationRecordService,
    @Optional() private readonly ideaService?: ResearchIdeaService,
    @Optional() private readonly demoService?: ResearchDemoService,
    @Optional() private readonly memoryService?: ResearchMemoryService,
  ) {}

  /**
   * Start research. For mode === 'single', delegates directly to the inner
   * orchestrator. For mode === 'iterative', runs the self-iterating outer loop.
   */
  startResearch(
    projectId: string,
    dto: StartIterativeResearchDto,
  ): Observable<DeepResearchSSEEvent | IterationSSEEvent> {
    if (dto.mode === "single") {
      return this.orchestrator.startResearch(projectId, dto);
    }

    const subject = new Subject<DeepResearchSSEEvent | IterationSSEEvent>();
    void this.runIterativeLoop(projectId, dto, subject).catch(
      (err: unknown) => {
        const message = err instanceof Error ? err.message : String(err);
        this.logger.error(`Iterative research loop failed: ${message}`);
        subject.next({
          type: "error",
          data: {
            code: "ITERATIVE_LOOP_ERROR",
            message,
            recoverable: false,
          },
        });
        subject.complete();
      },
    );

    return subject.asObservable();
  }

  /**
   * Called by the HTTP controller when the user submits feedback during the
   * pause window. Returns true if a waiting resolver was found and resolved.
   */
  submitFeedback(projectId: string, feedback: string): boolean {
    const entry = this.feedbackResolvers.get(projectId);
    if (!entry) return false;
    clearTimeout(entry.timer);
    entry.resolve(feedback);
    this.feedbackResolvers.delete(projectId);
    return true;
  }

  private waitForFeedback(
    projectId: string,
    timeoutMs: number,
  ): Promise<string | null> {
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        this.feedbackResolvers.delete(projectId);
        resolve(null);
      }, timeoutMs);
      this.feedbackResolvers.set(projectId, { resolve, timer });
    });
  }

  // ---------------------------------------------------------------------------
  // Private: outer loop
  // ---------------------------------------------------------------------------

  private async runIterativeLoop(
    projectId: string,
    dto: StartIterativeResearchDto,
    subject: Subject<DeepResearchSSEEvent | IterationSSEEvent>,
  ): Promise<void> {
    const startTime = Date.now();
    const depth = dto.options?.depth ?? "standard";
    const maxIterations = dto.iterationOptions?.maxIterations ?? 4;

    // Look up the project owner
    const project = await this.prisma.researchProject.findUnique({
      where: { id: projectId },
      select: { userId: true },
    });
    const userId = project?.userId ?? "";
    if (!userId) {
      this.logger.warn(
        `[Iterative] No userId found for project ${projectId}, proceeding with empty userId`,
      );
    }

    // ---- Round 0: initial research ----------------------------------------
    this.logger.log(`[Iterative] Starting round 0 for project ${projectId}`);
    const { sessionId, report } = await this.runInnerResearch(
      projectId,
      {
        query: dto.query,
        options: dto.options,
        isFollowUp: dto.isFollowUp,
        previousContext: dto.previousContext,
      },
      subject,
    );

    // Classify topic
    const topicType = await this.classifyTopic(
      dto.query,
      report.executiveSummary,
    );

    // Extract initial ideas
    const initialIdeas = await this.extractIdeas(userId, projectId, sessionId);
    const allInsights = initialIdeas.filter((i) => i.type === "INSIGHT");
    const allCreativeIdeas = initialIdeas.filter(
      (i) => i.type === "CREATIVE_IDEA",
    );

    // Emit ideas event for round 0
    subject.next({
      type: "iteration.ideas",
      data: {
        round: 0,
        newInsights: allInsights.map((i) => ({ title: i.title })),
        newCreativeIdeas: allCreativeIdeas.map((i) => ({ title: i.title })),
        totalInsights: allInsights.length,
        totalCreativeIdeas: allCreativeIdeas.length,
      },
    } satisfies IterationIdeasEvent);

    // Generate initial demo
    const demoIdea = allCreativeIdeas[0] ?? allInsights[0];
    let currentScore = 0;
    // Empty defaults are safe: exit-decision guard (iteration <= 1 → no exit)
    // prevents premature no_gaps exit before real evaluation runs.
    let currentGaps: { dataGaps: string[]; ideaGaps: string[] } = {
      dataGaps: [],
      ideaGaps: [],
    };
    let lastDemoScore: DemoScore | undefined;
    let currentReport = report;
    let currentSessionId = sessionId;

    if (demoIdea) {
      subject.next({
        type: "iteration.demo",
        data: { round: 0, status: "generating" },
      } satisfies IterationDemoEvent);

      const completedDemo = await this.createAndPollDemo(
        userId,
        projectId,
        demoIdea.id,
      );
      if (completedDemo) {
        subject.next({
          type: "iteration.demo",
          data: { round: 0, status: "completed" },
        } satisfies IterationDemoEvent);

        lastDemoScore = await this.evaluateDemo(
          completedDemo.htmlContent,
          {
            insights: allInsights.map((i) => i.title),
            creativeIdeas: allCreativeIdeas.map((i) => i.title),
          },
          topicType,
          dto.query,
        );

        currentScore = lastDemoScore.composite;
        currentGaps = lastDemoScore.gaps;
      }
    }

    const scores: number[] = [currentScore];
    const iterationRecords: string[] = [];

    // Track per-round snapshot counts for the summary table
    const roundSnapshots: Array<{
      insights: number;
      creativeIdeas: number;
      gapCount: number;
      keyChange: string;
    }> = [
      {
        insights: allInsights.length,
        creativeIdeas: allCreativeIdeas.length,
        gapCount: currentGaps.dataGaps.length + currentGaps.ideaGaps.length,
        keyChange: "Initial research",
      },
    ];

    // Generate init record
    const initMarkdown = this.iterationRecordService?.generateInitRecord({
      query: dto.query,
      topicType,
      depth,
      qualityThreshold: dto.iterationOptions?.qualityThreshold ?? 0.75,
      maxIterations,
      searchSummary: {
        directions: report.metadata.searchRounds,
        sources: report.metadata.totalSources,
        rounds: report.metadata.searchRounds,
      },
      insights: allInsights.map((i) => i.title),
      creativeIdeas: allCreativeIdeas.map((i) => i.title),
      demoType: topicType,
      demoScore: currentScore,
      gaps: currentGaps,
    });
    if (initMarkdown) {
      iterationRecords.push(initMarkdown);
    }

    subject.next({
      type: "iteration.eval",
      data: {
        round: 0,
        score: currentScore * 100,
        previousScore: 0,
        gaps: currentGaps,
      },
    } satisfies IterationEvalEvent);

    // Persist Round 0 snapshot (await to prevent write races with subsequent rounds)
    await this.saveIterationSnapshot(currentSessionId, {
      round: 0,
      score: currentScore * 100,
      previousScore: 0,
      gaps: currentGaps,
      ideas: {
        newInsights: allInsights.map((i) => ({ title: i.title })),
        newCreativeIdeas: allCreativeIdeas.map((i) => ({ title: i.title })),
        totalInsights: allInsights.length,
        totalCreativeIdeas: allCreativeIdeas.length,
      },
      demo: demoIdea ? { status: "completed" } : undefined,
      timestamp: new Date().toISOString(),
    });

    // Pause for user feedback after Round 0 (30s timeout)
    const FEEDBACK_TIMEOUT_MS = 30_000;
    subject.next({
      type: "iteration.awaiting_feedback" as const,
      data: {
        round: 0,
        score: currentScore * 100,
        gaps: currentGaps,
        timeoutMs: FEEDBACK_TIMEOUT_MS,
      },
    });

    const round0Feedback = await this.waitForFeedback(
      projectId,
      FEEDBACK_TIMEOUT_MS,
    );
    if (round0Feedback) {
      this.logger.log(
        `[Iterative] User feedback for round 0: "${round0Feedback.slice(0, 100)}"`,
      );
      // Prepend user feedback to data gaps so buildFollowUpQuery uses it
      currentGaps = {
        dataGaps: [round0Feedback, ...currentGaps.dataGaps],
        ideaGaps: currentGaps.ideaGaps,
      };
    }

    // ---- Iteration loop (rounds 1..maxIterations) ---------------------------
    let exitDecision: ExitDecision = { exit: false };
    // Initialize above SATURATION_GAIN_THRESHOLD (0.10) so round 1 doesn't
    // falsely exit as "information_saturated" before any follow-up research.
    let informationGain = 1.0;

    for (let round = 1; round <= maxIterations; round++) {
      const exitContext: ExitContext = {
        iteration: round,
        depth,
        scores,
        informationGain,
        gaps: currentGaps,
      };

      exitDecision = this.exitDecisionService?.decide(exitContext) ?? {
        exit: round >= maxIterations,
        reason: round >= maxIterations ? "budget_exhausted" : undefined,
      };

      if (exitDecision.exit) {
        this.logger.log(
          `[Iterative] Exit at round ${round}: ${exitDecision.reason}`,
        );
        break;
      }

      subject.next({
        type: "iteration.start",
        data: { round, targetGaps: currentGaps },
      } satisfies IterationStartEvent);

      // Build follow-up query targeting gaps
      const followUpQuery = buildFollowUpQuery(dto.query, currentGaps);

      // Run follow-up research
      const previousContext = buildPreviousContext(currentReport);
      const prevTotalSources = currentReport.metadata.totalSources;

      const followUp = await this.runInnerResearch(
        projectId,
        {
          query: followUpQuery,
          options: dto.options,
          isFollowUp: true,
          previousContext,
        },
        subject,
      );

      const newTotalSources = followUp.report.metadata.totalSources;
      const newSources = Math.max(0, newTotalSources - prevTotalSources);
      informationGain =
        prevTotalSources > 0 ? newSources / prevTotalSources : 1;

      subject.next({
        type: "iteration.research",
        data: {
          round,
          queries: [followUpQuery],
          newSources,
          informationGain,
        },
      } satisfies IterationResearchEvent);

      // Re-extract ideas for the new session
      const newIdeas = await this.extractIdeas(
        userId,
        projectId,
        followUp.sessionId,
      );
      const newInsights = newIdeas.filter((i) => i.type === "INSIGHT");
      const newCreativeIdeas = newIdeas.filter(
        (i) => i.type === "CREATIVE_IDEA",
      );

      // Accumulate ideas
      newInsights.forEach((i) => {
        if (!allInsights.some((x) => x.id === i.id)) allInsights.push(i);
      });
      newCreativeIdeas.forEach((i) => {
        if (!allCreativeIdeas.some((x) => x.id === i.id))
          allCreativeIdeas.push(i);
      });

      subject.next({
        type: "iteration.ideas",
        data: {
          round,
          newInsights: newInsights.map((i) => ({ title: i.title })),
          newCreativeIdeas: newCreativeIdeas.map((i) => ({ title: i.title })),
          totalInsights: allInsights.length,
          totalCreativeIdeas: allCreativeIdeas.length,
        },
      } satisfies IterationIdeasEvent);

      // Regenerate demo using best available idea
      const bestIdea =
        newCreativeIdeas[0] ??
        allCreativeIdeas[0] ??
        newInsights[0] ??
        allInsights[0];

      const previousScore = currentScore;
      let newScore = previousScore;
      let newGaps = currentGaps;

      if (bestIdea) {
        subject.next({
          type: "iteration.demo",
          data: { round, status: "generating" },
        } satisfies IterationDemoEvent);

        const newDemo = await this.createAndPollDemo(
          userId,
          projectId,
          bestIdea.id,
        );
        if (newDemo) {
          subject.next({
            type: "iteration.demo",
            data: { round, status: "completed" },
          } satisfies IterationDemoEvent);

          const updatedScore = await this.evaluateDemo(
            newDemo.htmlContent,
            {
              insights: allInsights.map((i) => i.title),
              creativeIdeas: allCreativeIdeas.map((i) => i.title),
            },
            topicType,
            dto.query,
          );

          newScore = updatedScore.composite;
          newGaps = updatedScore.gaps;
          lastDemoScore = updatedScore;
        }
      }

      scores.push(newScore);
      currentScore = newScore;
      currentGaps = newGaps;
      currentReport = followUp.report;
      currentSessionId = followUp.sessionId;

      // Snapshot actual counts for summary table
      roundSnapshots.push({
        insights: allInsights.length,
        creativeIdeas: allCreativeIdeas.length,
        gapCount: newGaps.dataGaps.length + newGaps.ideaGaps.length,
        keyChange: `Iteration ${round}`,
      });

      // Build exit decision for record (peek ahead to see if we exit next)
      const nextExitContext: ExitContext = {
        iteration: round + 1,
        depth,
        scores,
        informationGain,
        gaps: currentGaps,
      };
      const nextExitDecision = this.exitDecisionService?.decide(
        nextExitContext,
      ) ?? {
        exit: round + 1 >= maxIterations,
      };

      const iterationMarkdown =
        this.iterationRecordService?.generateIterationRecord({
          round,
          previousScore,
          gaps: currentGaps,
          researchActions: {
            queries: [followUpQuery],
            newSources,
            informationGain,
          },
          newInsights: newInsights.map((i) => i.title),
          newCreativeIdeas: newCreativeIdeas.map((i) => i.title),
          ideaPoolTotal: {
            insights: allInsights.length,
            creativeIdeas: allCreativeIdeas.length,
          },
          adoptedInDemo: bestIdea ? [bestIdea.title] : [],
          demoChanges: newGaps.dataGaps
            .slice(0, 3)
            .map((g) => `Addressed gap: ${g}`),
          newScore,
          remainingGaps: newGaps,
          exitDecision: nextExitDecision,
        });
      if (iterationMarkdown) {
        iterationRecords.push(iterationMarkdown);
      }

      subject.next({
        type: "iteration.eval",
        data: {
          round,
          score: newScore * 100,
          previousScore: previousScore * 100,
          gaps: newGaps,
        },
      } satisfies IterationEvalEvent);

      // Persist this round's snapshot (await to prevent write races with subsequent rounds)
      await this.saveIterationSnapshot(currentSessionId, {
        round,
        score: newScore * 100,
        previousScore: previousScore * 100,
        gaps: newGaps,
        research: {
          queries: [followUpQuery],
          newSources,
          informationGain,
        },
        ideas: {
          newInsights: newInsights.map((i) => ({ title: i.title })),
          newCreativeIdeas: newCreativeIdeas.map((i) => ({ title: i.title })),
          totalInsights: allInsights.length,
          totalCreativeIdeas: allCreativeIdeas.length,
        },
        demo: bestIdea ? { status: "completed" } : undefined,
        timestamp: new Date().toISOString(),
      });

      // Pause for user feedback between iterations (30s timeout)
      subject.next({
        type: "iteration.awaiting_feedback" as const,
        data: {
          round,
          score: newScore * 100,
          gaps: newGaps,
          timeoutMs: FEEDBACK_TIMEOUT_MS,
        },
      });

      const userFeedback = await this.waitForFeedback(
        projectId,
        FEEDBACK_TIMEOUT_MS,
      );
      if (userFeedback) {
        this.logger.log(
          `[Iterative] User feedback for round ${round}: "${userFeedback.slice(0, 100)}"`,
        );
        // Prepend user feedback to data gaps so buildFollowUpQuery uses it
        currentGaps = {
          dataGaps: [userFeedback, ...currentGaps.dataGaps],
          ideaGaps: currentGaps.ideaGaps,
        };
      }
    }

    // ---- Summary ------------------------------------------------------------
    const durationSec = Math.round((Date.now() - startTime) / 1000);
    const totalIterations = scores.length - 1; // round 0 not counted

    const summaryRows = scores.map((s, idx) => {
      const snapshot = roundSnapshots[idx];
      return {
        round: idx,
        score: s * 100,
        delta: idx === 0 ? 0 : (s - scores[idx - 1]) * 100,
        insights: snapshot?.insights ?? allInsights.length,
        creativeIdeas: snapshot?.creativeIdeas ?? allCreativeIdeas.length,
        gaps: snapshot?.gapCount ?? 0,
        keyChange: snapshot?.keyChange ?? `Round ${idx}`,
      };
    });

    const summaryMarkdown = this.iterationRecordService?.generateSummaryRecord({
      exitReason: exitDecision.reason ?? "completed",
      totalIterations,
      finalScore: currentScore * 100,
      duration: durationSec,
      creditsConsumed: 0, // credit tracking is handled by existing billing layer
      iterations: summaryRows,
      finalInsights: allInsights.map((i) => i.title),
      finalCreativeIdeas: allCreativeIdeas.map((i) => i.title),
      learnings: (exitDecision.nextResearchFocus ?? []).slice(0, 5),
    });
    if (summaryMarkdown) {
      iterationRecords.push(summaryMarkdown);
    }

    // Persist iteration records (markdown audit log) and final meta to session
    await this.saveIterationMetadata(currentSessionId, iterationRecords);
    await this.saveIterationMeta(currentSessionId, {
      exitReason: exitDecision.reason ?? "completed",
      finalScore: currentScore * 100,
      totalIterations,
      maxIterations,
    });

    // Persist memory (fire-and-forget)
    if (this.memoryService) {
      void this.memoryService
        .saveSessionMeta({
          sessionId: currentSessionId,
          userId,
          topicType,
          topicKeywords: extractKeywords(dto.query),
          searchStats: {
            totalSources: currentReport.metadata.totalSources,
            uniqueDomains: 0,
            languageDistribution: {},
            avgRelevanceScore: 0,
          },
          qualityMetrics: {
            coverageRate: informationGain,
            sourcesDiversity: 0,
            informationGain,
            finalDemoScore: currentScore,
          },
          strategyUsed: [],
          strategyEffect: [],
          iterationCount: totalIterations,
          exitReason: exitDecision.reason,
        })
        .catch((err: unknown) => {
          this.logger.warn(
            `Failed to save session meta: ${err instanceof Error ? err.message : String(err)}`,
          );
        });
    }

    // Clean up any pending feedback resolver (e.g. if loop exited early)
    const pendingFeedback = this.feedbackResolvers.get(projectId);
    if (pendingFeedback) {
      clearTimeout(pendingFeedback.timer);
      this.feedbackResolvers.delete(projectId);
    }

    subject.next({
      type: "iteration.exit",
      data: {
        reason: exitDecision.reason ?? "completed",
        finalScore: currentScore * 100,
        totalIterations,
      },
    } satisfies IterationExitEvent);

    subject.complete();
  }

  // ---------------------------------------------------------------------------
  // Private: helpers
  // ---------------------------------------------------------------------------

  /**
   * Subscribes to the inner orchestrator Observable, pipes all events except
   * "interaction.complete" to the outer subject, and resolves when the
   * "interaction.complete" event arrives.
   */
  private runInnerResearch(
    projectId: string,
    dto: {
      query: string;
      options?: StartIterativeResearchDto["options"];
      isFollowUp?: boolean;
      previousContext?: StartIterativeResearchDto["previousContext"];
    },
    subject: Subject<DeepResearchSSEEvent | IterationSSEEvent>,
  ): Promise<RunInnerResult> {
    return new Promise((resolve, reject) => {
      let resolved = false;
      const obs = this.orchestrator.startResearch(projectId, {
        query: dto.query,
        mode: "iterative",
        options: dto.options,
        isFollowUp: dto.isFollowUp,
        previousContext: dto.previousContext,
      });

      obs.subscribe({
        next: (event) => {
          if (event.type === "interaction.complete") {
            resolved = true;
            const data = (
              event as {
                type: "interaction.complete";
                data: {
                  sessionId: string;
                  report: DeepResearchReport;
                  status: string;
                };
              }
            ).data;
            resolve({ sessionId: data.sessionId, report: data.report });
          } else {
            // Forward all other events to the outer subject
            subject.next(event);
          }
        },
        error: (err: unknown) => {
          reject(err instanceof Error ? err : new Error(String(err)));
        },
        complete: () => {
          if (!resolved) {
            // Observable completed without emitting "interaction.complete" — reject to avoid hanging.
            reject(
              new Error(
                "Inner research Observable completed without emitting interaction.complete",
              ),
            );
          }
        },
      });
    });
  }

  /**
   * Creates a demo for an idea and polls until generation completes or times out.
   * Returns the completed demo record (with htmlContent) or null on failure.
   */
  private async createAndPollDemo(
    userId: string,
    projectId: string,
    ideaId: string,
  ): Promise<{ id: string; htmlContent: string; status: string } | null> {
    if (!this.demoService) return null;

    let demoId: string;
    try {
      const created = await this.demoService.createForIdea(
        userId,
        projectId,
        ideaId,
      );
      demoId = created.id;
    } catch (err) {
      this.logger.warn(
        `createForIdea failed for idea ${ideaId}: ${err instanceof Error ? err.message : String(err)}`,
      );
      return null;
    }

    return this.pollDemoCompletion(demoId);
  }

  /**
   * Polls the database every DEMO_POLL_INTERVAL_MS until the demo reaches
   * COMPLETED or FAILED status, or until DEMO_POLL_TIMEOUT_MS elapses.
   */
  private async pollDemoCompletion(
    demoId: string,
  ): Promise<{ id: string; htmlContent: string; status: string } | null> {
    const deadline = Date.now() + DEMO_POLL_TIMEOUT_MS;

    while (Date.now() < deadline) {
      const demo = await this.prisma.researchDemo.findUnique({
        where: { id: demoId },
        select: { id: true, htmlContent: true, status: true },
      });

      if (!demo) {
        this.logger.warn(`Demo ${demoId} not found during poll`);
        return null;
      }

      if (demo.status === "COMPLETED") {
        return {
          id: demo.id,
          htmlContent: demo.htmlContent ?? "",
          status: demo.status,
        };
      }

      if (demo.status === "FAILED") {
        this.logger.warn(`Demo ${demoId} generation failed`);
        return null;
      }

      await sleep(DEMO_POLL_INTERVAL_MS);
    }

    this.logger.warn(
      `Demo ${demoId} did not complete within ${DEMO_POLL_TIMEOUT_MS}ms`,
    );
    return null;
  }

  private async classifyTopic(
    query: string,
    reportSummary: string,
  ): Promise<TopicType> {
    if (!this.topicClassifier) return "market";
    try {
      return await this.topicClassifier.classify(query, reportSummary);
    } catch (err) {
      this.logger.warn(
        `Topic classification failed, defaulting to 'market': ${err instanceof Error ? err.message : String(err)}`,
      );
      return "market";
    }
  }

  private async extractIdeas(
    userId: string,
    projectId: string,
    sessionId: string,
  ): Promise<IdeaItem[]> {
    if (!this.ideaService) return [];
    try {
      return (await this.ideaService.extractFromSession(
        userId,
        projectId,
        sessionId,
      )) as IdeaItem[];
    } catch (err) {
      this.logger.warn(
        `Idea extraction failed for session ${sessionId}: ${err instanceof Error ? err.message : String(err)}`,
      );
      return [];
    }
  }

  private async evaluateDemo(
    html: string,
    ideaPool: { insights: string[]; creativeIdeas: string[] },
    topicType: TopicType,
    researchQuery: string,
  ): Promise<DemoScore> {
    const fallback: DemoScore = {
      auto: {
        structureValid: false,
        noExternalDeps: true,
        viewCount: 0,
        interactiveElements: 0,
        dataPoints: 0,
        hasStateManagement: false,
        codeSize: 0,
      },
      llm: {
        ideaAlignment: 0.5,
        insightDensity: 0.5,
        dataCompleteness: 0.5,
        interactionQuality: 0.5,
        gaps: { dataGaps: [], ideaGaps: [] },
        topicTypeMatch: true,
      },
      composite: 0.5,
      gaps: { dataGaps: [], ideaGaps: [] },
    };

    if (!this.demoEvaluator) return fallback;

    try {
      return await this.demoEvaluator.evaluate(
        html,
        ideaPool,
        topicType,
        researchQuery,
      );
    } catch (err) {
      this.logger.warn(
        `Demo evaluation failed, using fallback score: ${err instanceof Error ? err.message : String(err)}`,
      );
      return fallback;
    }
  }

  /**
   * Saves iteration records as a JSON array in the session's metadata JSONB field.
   */
  private async saveIterationMetadata(
    sessionId: string,
    records: string[],
  ): Promise<void> {
    if (records.length === 0) return;

    try {
      const session = await this.prisma.deepResearchSession.findUnique({
        where: { id: sessionId },
        select: { directions: true },
      });

      const existingDirections =
        session?.directions && typeof session.directions === "object"
          ? (session.directions as Record<string, unknown>)
          : {};

      await this.prisma.deepResearchSession.update({
        where: { id: sessionId },
        data: {
          directions: { ...existingDirections, iterationRecords: records },
        },
      });
    } catch (err) {
      this.logger.warn(
        `Failed to save iteration metadata for session ${sessionId}: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  /**
   * Persists a structured iteration snapshot immediately after each round.
   * Snapshots are stored in `directions.iterationSnapshots` as a JSON array,
   * aligned with the frontend IterationRound type.
   * Also saves iterationMeta (exitReason, finalScore, totalIterations, maxIterations).
   */
  private async saveIterationSnapshot(
    sessionId: string,
    snapshot: IterationSnapshot,
    meta?: IterationMeta,
  ): Promise<void> {
    try {
      const session = await this.prisma.deepResearchSession.findUnique({
        where: { id: sessionId },
        select: { directions: true },
      });

      const existingDirections =
        session?.directions && typeof session.directions === "object"
          ? (session.directions as Record<string, unknown>)
          : {};

      const existingSnapshots = Array.isArray(
        existingDirections.iterationSnapshots,
      )
        ? (existingDirections.iterationSnapshots as IterationSnapshot[])
        : [];

      // Replace existing snapshot for the same round or append
      const idx = existingSnapshots.findIndex(
        (s) => s.round === snapshot.round,
      );
      if (idx >= 0) {
        existingSnapshots[idx] = snapshot;
      } else {
        existingSnapshots.push(snapshot);
      }

      const updateData: Record<string, unknown> = {
        ...existingDirections,
        iterationSnapshots: existingSnapshots,
      };
      if (meta) {
        updateData.iterationMeta = meta;
      }

      await this.prisma.deepResearchSession.update({
        where: { id: sessionId },
        data: {
          directions: updateData as unknown as Record<string, unknown> & {
            toJSON(): unknown;
          },
        },
      });
    } catch (err) {
      this.logger.warn(
        `Failed to save iteration snapshot for session ${sessionId} round ${snapshot.round}: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  /**
   * Persists iteration meta (exit reason, final score, etc.) to directions JSONB.
   */
  private async saveIterationMeta(
    sessionId: string,
    meta: IterationMeta,
  ): Promise<void> {
    try {
      const session = await this.prisma.deepResearchSession.findUnique({
        where: { id: sessionId },
        select: { directions: true },
      });

      const existingDirections =
        session?.directions && typeof session.directions === "object"
          ? (session.directions as Record<string, unknown>)
          : {};

      const mergedData = { ...existingDirections, iterationMeta: meta };
      await this.prisma.deepResearchSession.update({
        where: { id: sessionId },
        data: {
          directions: mergedData as unknown as Record<string, unknown> & {
            toJSON(): unknown;
          },
        },
      });
    } catch (err) {
      this.logger.warn(
        `Failed to save iteration meta for session ${sessionId}: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }
}

// ---------------------------------------------------------------------------
// Pure helpers (no class state needed)
// ---------------------------------------------------------------------------

function buildFollowUpQuery(
  originalQuery: string,
  gaps: { dataGaps: string[]; ideaGaps: string[] },
): string {
  const gapParts = [...gaps.dataGaps.slice(0, 3), ...gaps.ideaGaps.slice(0, 2)];

  if (gapParts.length === 0) {
    return `${originalQuery} — deeper analysis and additional evidence`;
  }

  return `${originalQuery} — focusing on: ${gapParts.join("; ")}`;
}

function buildPreviousContext(
  report: DeepResearchReport,
): StartIterativeResearchDto["previousContext"] {
  return {
    executiveSummary: report.executiveSummary,
    sections: report.sections.map((s) => ({
      title: s.title,
      content: s.content,
    })),
    conclusion: report.conclusion,
    references: report.references.map((r) => ({
      title: r.title,
      url: r.url,
    })),
  };
}

function extractKeywords(query: string): string[] {
  return query
    .split(/\s+/)
    .filter((w) => w.length > 3)
    .slice(0, 5);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
