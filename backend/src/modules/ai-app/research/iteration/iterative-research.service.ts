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

export interface IterationSessionEvent {
  type: "iteration.session";
  data: {
    sessionId: string;
    maxIterations?: number;
    qualityThreshold?: number;
    depth?: string;
  };
}

export type IterationSSEEvent =
  | IterationStartEvent
  | IterationResearchEvent
  | IterationIdeasEvent
  | IterationDemoEvent
  | IterationEvalEvent
  | IterationExitEvent
  | IterationAwaitingFeedbackEvent
  | IterationSessionEvent;

const DEMO_POLL_INTERVAL_MS = 3000;
const DEMO_POLL_TIMEOUT_MS = 120_000;
const MAX_ACCUMULATED_IDEAS = 30;

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

    // Extract initial ideas (insights)
    const initialIdeas = await this.extractIdeas(userId, projectId, sessionId);
    const allInsights = initialIdeas.filter((i) => i.type === "INSIGHT");
    const allCreativeIdeas = initialIdeas.filter(
      (i) => i.type === "CREATIVE_IDEA",
    );

    // P0-3: Also extract creative ideas from insights (they are NEVER auto-extracted
    // by extractFromSession which only produces INSIGHTs).
    if (allInsights.length > 0) {
      const creativeIdeas = await this.extractCreativeIdeasSafe(
        userId,
        projectId,
      );
      creativeIdeas.forEach((i) => {
        if (!allCreativeIdeas.some((x) => x.id === i.id))
          allCreativeIdeas.push(i);
      });
    }

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
    let currentGaps: { dataGaps: string[]; ideaGaps: string[] } = {
      dataGaps: [],
      ideaGaps: [],
    };
    let lastDemoScore: DemoScore | undefined;
    let currentReport = report;
    let currentSessionId = sessionId;
    const originalSessionId = sessionId; // Never changes - all iteration data saved here

    // P0 #1: Notify frontend of sessionId + config immediately so it can save on early error
    // P1 #4: Include maxIterations and qualityThreshold so frontend doesn't hardcode
    subject.next({
      type: "iteration.session",
      data: {
        sessionId: originalSessionId,
        maxIterations,
        qualityThreshold: dto.iterationOptions?.qualityThreshold ?? 0.75,
        depth,
      },
    } satisfies IterationSessionEvent);

    // P1 #4: Emit research event for round 0 so frontend has source data from the start
    subject.next({
      type: "iteration.research",
      data: {
        round: 0,
        queries: [dto.query],
        newSources: report.metadata.totalSources,
        informationGain: 1.0,
      },
    } satisfies IterationResearchEvent);

    let demoAvailable = false;
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
        demoAvailable = true;
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

    // Fallback: when demo evaluation is unavailable, derive score from report heuristics
    if (!demoAvailable) {
      const fallback = estimateReportQuality(
        report,
        allInsights.length,
        allCreativeIdeas.length,
      );
      currentScore = fallback.score;
      currentGaps = fallback.gaps;
      this.logger.log(
        `[Iterative] Demo unavailable, using report-based score: ${(currentScore * 100).toFixed(0)}%`,
      );
    }

    const scores: number[] = [currentScore];
    const iterationRecords: string[] = [];
    const userFeedbackHistory: string[] = [];
    let latestFeedback: string | null = null;

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
        record: initMarkdown ?? undefined,
      },
    } satisfies IterationEvalEvent);

    // Persist Round 0 snapshot (await to prevent write races with subsequent rounds)
    await this.saveIterationSnapshot(originalSessionId, {
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
      userFeedbackHistory.push(round0Feedback);
      latestFeedback = round0Feedback;
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
      const followUpQuery = buildFollowUpQuery(
        dto.query,
        currentGaps,
        latestFeedback,
      );
      latestFeedback = null;

      // Run follow-up research
      const iterationHistory = buildIterationHistory(
        iterationRecords,
        scores,
        userFeedbackHistory,
      );
      const previousContext = buildPreviousContext(
        currentReport,
        iterationHistory,
      );
      const prevTotalSources = currentReport.metadata.totalSources;

      // P0 #2: Wrap inner research and downstream processing in try-catch so a
      // single-round failure does not discard all accumulated progress.
      let roundErrored = false;
      try {
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

        // P0-3: Also re-extract creative ideas from accumulated insights
        if (newInsights.length > 0) {
          const freshCreativeIdeas = await this.extractCreativeIdeasSafe(
            userId,
            projectId,
          );
          freshCreativeIdeas.forEach((i) => {
            if (!newCreativeIdeas.some((x) => x.id === i.id))
              newCreativeIdeas.push(i);
          });
        }

        // Accumulate ideas
        newInsights.forEach((i) => {
          if (!allInsights.some((x) => x.id === i.id)) allInsights.push(i);
        });
        newCreativeIdeas.forEach((i) => {
          if (!allCreativeIdeas.some((x) => x.id === i.id))
            allCreativeIdeas.push(i);
        });

        // Cap accumulated arrays to prevent OOM on long iterations
        if (allInsights.length > MAX_ACCUMULATED_IDEAS) {
          allInsights.splice(0, allInsights.length - MAX_ACCUMULATED_IDEAS);
        }
        if (allCreativeIdeas.length > MAX_ACCUMULATED_IDEAS) {
          allCreativeIdeas.splice(
            0,
            allCreativeIdeas.length - MAX_ACCUMULATED_IDEAS,
          );
        }

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

        let roundDemoAvailable = false;
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
            roundDemoAvailable = true;
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

        // Fallback: when demo evaluation is unavailable, use report-based heuristics
        if (!roundDemoAvailable) {
          const fallback = estimateReportQuality(
            followUp.report,
            allInsights.length,
            allCreativeIdeas.length,
            currentReport,
          );
          newScore = fallback.score;
          newGaps = fallback.gaps;
        }

        // Ensure score is monotonically non-decreasing — accumulated research should never lose quality
        newScore = Math.max(newScore, currentScore);

        scores.push(newScore);
        currentScore = newScore;
        currentGaps = newGaps;
        currentReport = followUp.report;
        currentSessionId = followUp.sessionId;

        // Update the original session with the latest report and discussion, then clean up intermediate session
        try {
          // Fetch intermediate session's discussion before deletion
          let intermediateDiscussion: unknown[] = [];
          if (currentSessionId !== originalSessionId) {
            const intermediateSession =
              await this.prisma.deepResearchSession.findUnique({
                where: { id: currentSessionId },
                select: { discussion: true },
              });
            if (
              intermediateSession?.discussion &&
              Array.isArray(intermediateSession.discussion)
            ) {
              intermediateDiscussion =
                intermediateSession.discussion as unknown[];
            }
          }

          // Incremental merge: use PostgreSQL array concat to avoid 3x memory copy
          // discussion column is jsonb[] (Prisma Json[])
          // Convert new elements via jsonb array → unnest → array_agg to get jsonb[]
          if (intermediateDiscussion.length > 0) {
            const newDiscussionJson = JSON.stringify(intermediateDiscussion);
            await this.prisma.$executeRaw`
              UPDATE "deep_research_sessions"
              SET "discussion" = array_cat(
                    COALESCE("discussion", ARRAY[]::jsonb[]),
                    (SELECT array_agg(elem) FROM jsonb_array_elements(${newDiscussionJson}::jsonb) AS elem)
                  ),
                  "report" = ${JSON.stringify(followUp.report)}::jsonb,
                  "status" = 'SEARCHING',
                  "updated_at" = NOW()
              WHERE "id" = ${originalSessionId}
            `;
          } else {
            await this.prisma.deepResearchSession.update({
              where: { id: originalSessionId },
              data: {
                report: followUp.report as unknown as Record<
                  string,
                  unknown
                > & {
                  toJSON(): unknown;
                },
                status: "SEARCHING",
              },
            });
          }

          // Reassign ideas from intermediate session to original session before deletion
          if (currentSessionId !== originalSessionId) {
            await this.prisma.researchIdea.updateMany({
              where: { sessionId: currentSessionId },
              data: { sessionId: originalSessionId },
            });

            await this.prisma.deepResearchSession
              .delete({
                where: { id: currentSessionId },
              })
              .catch(() => {
                /* ignore if already deleted */
              });
          }
        } catch (err) {
          this.logger.warn(
            `Failed to sync report to original session: ${err instanceof Error ? err.message : String(err)}`,
          );
        }

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
            record: iterationMarkdown ?? undefined,
          },
        } satisfies IterationEvalEvent);

        // Persist this round's snapshot (await to prevent write races with subsequent rounds)
        await this.saveIterationSnapshot(originalSessionId, {
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
          userFeedbackHistory.push(userFeedback);
          latestFeedback = userFeedback;
        }
      } catch (roundErr: unknown) {
        // P0 #2: A round failure should not discard all accumulated data. Log the
        // error, emit an eval event with the previous score so the frontend
        // remains in a consistent state, then break out of the loop and fall
        // through to the summary/save section so everything collected so far
        // is still persisted.
        const message =
          roundErr instanceof Error ? roundErr.message : String(roundErr);
        this.logger.error(
          `[Iterative] Round ${round} failed, exiting loop gracefully: ${message}`,
        );

        // P0-4: Use "round_error" instead of "budget_exhausted" so the user sees the real reason
        exitDecision = { exit: true, reason: "round_error" };
        roundErrored = true;

        subject.next({
          type: "iteration.eval",
          data: {
            round,
            score: currentScore * 100,
            previousScore: currentScore * 100,
            gaps: currentGaps,
          },
        } satisfies IterationEvalEvent);
      }

      if (roundErrored) {
        break;
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

    // Persist iteration records (markdown audit log) and final meta to original session
    await this.saveIterationMetadata(originalSessionId, iterationRecords);
    await this.saveIterationMeta(originalSessionId, {
      exitReason: exitDecision.reason ?? "completed",
      finalScore: currentScore * 100,
      totalIterations,
      maxIterations,
    });

    // Mark the original session as COMPLETED so frontend can display it properly
    try {
      await this.prisma.deepResearchSession.update({
        where: { id: originalSessionId },
        data: {
          status: "COMPLETED",
          completedAt: new Date(),
        },
      });
    } catch (err) {
      this.logger.warn(
        `Failed to mark session as COMPLETED: ${err instanceof Error ? err.message : String(err)}`,
      );
    }

    // Persist memory (fire-and-forget)
    if (this.memoryService) {
      void this.memoryService
        .saveSessionMeta({
          sessionId: originalSessionId,
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
        sessionId: originalSessionId,
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
        mode: "iterative_internal",
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

  /**
   * P0-3: Extract creative ideas from all project insights.
   * Safe wrapper that never throws — returns empty array on failure.
   */
  private async extractCreativeIdeasSafe(
    userId: string,
    projectId: string,
  ): Promise<IdeaItem[]> {
    if (!this.ideaService) return [];
    try {
      return (await this.ideaService.extractCreativeIdeas(
        userId,
        projectId,
      )) as IdeaItem[];
    } catch (err) {
      this.logger.warn(
        `Creative idea extraction failed for project ${projectId}: ${err instanceof Error ? err.message : String(err)}`,
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

/**
 * Fallback quality estimation when demo evaluation is unavailable.
 * Uses report structure, content depth, and idea pool as heuristics.
 * When `previousReport` is provided, applies an incremental improvement bonus
 * (up to 0.1) based on section count, reference count, and total content growth.
 */
function estimateReportQuality(
  report: DeepResearchReport,
  insightCount: number,
  creativeIdeaCount: number,
  previousReport?: DeepResearchReport,
): { score: number; gaps: { dataGaps: string[]; ideaGaps: string[] } } {
  const sections = report.sections ?? [];
  const refs = report.references ?? [];
  const hasSummary = (report.executiveSummary?.length ?? 0) > 100;
  const hasConclusion = (report.conclusion?.length ?? 0) > 50;

  // Score components (0-1 each, weighted sum)
  // P1-2: Raised thresholds to prevent inflated scores that trigger premature quality_met exit.
  // Previously 5 sections / 20 refs / 10K chars easily reached 0.75+; now requires genuinely comprehensive research.
  const sectionScore = Math.min(sections.length / 8, 1); // 8+ sections = full marks (was 5)
  const refScore = Math.min(refs.length / 40, 1); // 40+ refs = full marks (was 20)
  const depthScore = Math.min(
    sections.reduce((sum, s) => sum + (s.content?.length ?? 0), 0) / 20000,
    1,
  ); // 20K+ chars = full marks (was 10K)
  const ideaScore = Math.min(insightCount / 15, 1); // 15+ insights = full marks (was 10)
  const structureScore = (hasSummary ? 0.5 : 0) + (hasConclusion ? 0.5 : 0);

  // P1-2: Apply a conservative ceiling (0.65) to prevent fallback alone from exceeding quality_met thresholds.
  // Only demo-based evaluation should allow scores above 0.65.
  const rawScore =
    sectionScore * 0.25 +
    refScore * 0.2 +
    depthScore * 0.25 +
    ideaScore * 0.15 +
    structureScore * 0.15;
  const baseScore = Math.min(rawScore, 0.65);

  // P2 #8: Cross-round incremental improvement bonus (up to 0.1)
  let incrementalBonus = 0;
  if (previousReport) {
    const prevSections = previousReport.sections?.length ?? 0;
    const prevRefs = previousReport.references?.length ?? 0;
    const prevDepth = (previousReport.sections ?? []).reduce(
      (sum, s) => sum + (s.content?.length ?? 0),
      0,
    );
    const currDepth = sections.reduce(
      (sum, s) => sum + (s.content?.length ?? 0),
      0,
    );

    let improvements = 0;
    if (sections.length > prevSections) improvements++;
    if (refs.length > prevRefs) improvements++;
    if (currDepth > prevDepth) improvements++;

    // Each improvement dimension contributes up to 0.033 (3 * 0.033 ≈ 0.1)
    incrementalBonus = Math.min((improvements / 3) * 0.1, 0.1);
  }

  const score = Math.min(baseScore + incrementalBonus, 1);

  // Generate meaningful gaps based on what's missing
  const dataGaps: string[] = [];
  const ideaGaps: string[] = [];

  if (sections.length < 4) dataGaps.push("报告章节不够全面，需要更多研究方向");
  if (refs.length < 10) dataGaps.push("参考来源不足，需要更多数据支撑");
  if (!hasSummary) dataGaps.push("缺少深入的执行摘要");
  if (depthScore < 0.5) dataGaps.push("各章节分析深度不够，需要更详细的论述");
  if (insightCount < 5) ideaGaps.push("洞察数量不足，需要更多独到见解");
  if (creativeIdeaCount === 0)
    ideaGaps.push("缺少创意方案，需要提出创新性观点");

  // Ensure at least one gap when score is low
  if (dataGaps.length === 0 && ideaGaps.length === 0 && score < 0.75) {
    dataGaps.push("需要更深入的分析和交叉验证");
  }

  return { score, gaps: { dataGaps, ideaGaps } };
}

function buildFollowUpQuery(
  originalQuery: string,
  gaps: { dataGaps: string[]; ideaGaps: string[] },
  userFeedback?: string | null,
): string {
  const parts: string[] = [];

  if (userFeedback) {
    parts.push(`[用户指令] ${userFeedback}`);
  }

  const gapParts = [...gaps.dataGaps.slice(0, 3), ...gaps.ideaGaps.slice(0, 2)];
  if (gapParts.length > 0) {
    parts.push(`[系统识别的gap] ${gapParts.join("; ")}`);
  }

  if (parts.length === 0) {
    return `${originalQuery} — 需要更深入的分析和额外证据`;
  }

  return `${originalQuery} — ${parts.join(" | ")}`;
}

function buildPreviousContext(
  report: DeepResearchReport,
  iterationHistory?: string,
): StartIterativeResearchDto["previousContext"] {
  return {
    executiveSummary: report.executiveSummary?.slice(0, CONTEXT_SUMMARY_MAX),
    sections: report.sections.map((s) => ({
      title: s.title,
      content: s.content?.slice(0, CONTEXT_SECTION_MAX),
    })),
    conclusion: report.conclusion?.slice(0, CONTEXT_CONCLUSION_MAX),
    references: report.references.map((r) => ({
      title: r.title,
      url: r.url,
    })),
    iterationHistory,
  };
}

const CONTEXT_SECTION_MAX = 500;
const CONTEXT_SUMMARY_MAX = 1000;
const CONTEXT_CONCLUSION_MAX = 500;

/** Max total length for the assembled iteration history injected into context */
const ITERATION_HISTORY_MAX_LENGTH = 2000;
/** Max feedback entries to keep (most recent) */
const MAX_FEEDBACK_ENTRIES = 3;
/** Max chars per feedback entry */
const MAX_FEEDBACK_ENTRY_LENGTH = 200;
/** Max chars per iteration record */
const MAX_RECORD_LENGTH = 500;
/** Max recent records to include */
const MAX_RECENT_RECORDS = 2;

function buildIterationHistory(
  records: string[],
  scores: number[],
  userFeedbackHistory: string[],
): string {
  const parts: string[] = [];

  // Score trajectory — compact, always include all (grows ~30 chars/round)
  if (scores.length > 0) {
    const trajectory = scores
      .map((s, i) => `Round ${i}: ${(s * 100).toFixed(0)}%`)
      .join(" → ");
    parts.push(`## 分数轨迹\n${trajectory}`);
  }

  // User feedback — keep recent N entries, truncate each to preserve signal density
  if (userFeedbackHistory.length > 0) {
    const recentFeedback = userFeedbackHistory.slice(-MAX_FEEDBACK_ENTRIES);
    const startIdx = userFeedbackHistory.length - recentFeedback.length;
    const fbLines = recentFeedback
      .map((f, i) => {
        const roundIdx = startIdx + i;
        const trimmed =
          f.length > MAX_FEEDBACK_ENTRY_LENGTH
            ? f.slice(0, MAX_FEEDBACK_ENTRY_LENGTH) + "..."
            : f;
        return `- Round ${roundIdx}: ${trimmed}`;
      })
      .join("\n");
    parts.push(`## 用户反馈历史\n${fbLines}`);
  }

  // Condensed iteration records — last N records, each truncated
  const recentRecords = records.slice(-MAX_RECENT_RECORDS);
  if (recentRecords.length > 0) {
    const condensed = recentRecords
      .map((r) =>
        r.length > MAX_RECORD_LENGTH
          ? r.slice(0, MAX_RECORD_LENGTH) + "..."
          : r,
      )
      .join("\n---\n");
    parts.push(`## 近期迭代记录\n${condensed}`);
  }

  const result = parts.join("\n\n");

  // Final safety cap — truncate at sentence boundary when possible
  if (result.length <= ITERATION_HISTORY_MAX_LENGTH) {
    return result;
  }
  const truncated = result.slice(0, ITERATION_HISTORY_MAX_LENGTH);
  const lastNewline = truncated.lastIndexOf("\n");
  return lastNewline > ITERATION_HISTORY_MAX_LENGTH * 0.8
    ? truncated.slice(0, lastNewline) + "\n[...已截断]"
    : truncated + "\n[...已截断]";
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
