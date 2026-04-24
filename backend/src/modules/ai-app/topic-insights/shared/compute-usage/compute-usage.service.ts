import {
  Injectable,
  Logger,
  NotFoundException,
  ForbiddenException,
  Optional,
} from "@nestjs/common";
import { PrismaService } from "@/common/prisma/prisma.service";
import {
  SessionLatencyTrackerService,
  type LatencySessionSummary,
} from "@/modules/ai-engine/facade";

export interface ComputeUsageResult {
  summary: {
    totalTokens: number;
    inputTokens: number;
    outputTokens: number;
    cacheCreationTokens: number;
    cacheReadTokens: number;
    totalCreditsConsumed: number;
    estimatedCostUsd: number;
    totalLlmCalls: number;
    totalDimensions: number;
    researchDurationMs: number;
    reportGenerationMs: number;
  };
  dimensions: Array<{
    dimensionName: string;
    modelUsed: string | null;
    tokensUsed: number | null;
    sourcesUsed: number;
  }>;
  modelDistribution: Array<{
    modelId: string;
    callCount: number;
    totalTokens: number;
    inputTokens: number;
    outputTokens: number;
    cacheCreationTokens: number;
    cacheReadTokens: number;
    estimatedCost: number;
    percentage: number;
  }>;
  creditHistory: Array<{
    operationType: string;
    amount: number;
    tokenCount: number | null;
    inputTokens: number | null;
    outputTokens: number | null;
    cacheCreationTokens: number | null;
    cacheReadTokens: number | null;
    modelName: string | null;
    createdAt: string;
  }>;
  mission: {
    leaderModel: string;
    researchDepth: string;
    startedAt: string | null;
    completedAt: string | null;
    totalTasks: number;
    completedTasks: number;
  } | null;
  latency: LatencySessionSummary | null;
  latencySteps: Array<{
    name: string;
    durationMs: number;
    parentStepId?: string;
    actions: Array<{
      name: string;
      type: string;
      model: string;
      totalDurationMs: number;
      ttftMs?: number;
      ttltMs: number;
      inputTokens: number;
      outputTokens: number;
    }>;
  }>;
  missions: Array<{
    id: string;
    status: string;
    researchDepth: string | null;
    startedAt: string | null;
    completedAt: string | null;
    createdAt: string;
  }>;
  currentMissionId: string | null;
}

@Injectable()
export class ComputeUsageService {
  private readonly logger = new Logger(ComputeUsageService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Optional()
    private readonly latencyTracker?: SessionLatencyTrackerService,
  ) {}

  async getComputeUsage(
    userId: string,
    topicId: string,
    missionId?: string,
  ): Promise<ComputeUsageResult> {
    await this.verifyTopicReadAccess(userId, topicId);

    this.logger.log(
      `[getComputeUsage] topicId=${topicId} missionId=${missionId ?? "latest"}`,
    );

    const targetMission = missionId
      ? await this.prisma.researchMission.findFirst({
          where: { id: missionId, topicId },
          select: {
            id: true,
            topicId: true,
            leaderModelId: true,
            leaderModelName: true,
            researchDepth: true,
            startedAt: true,
            completedAt: true,
            createdAt: true,
            totalTasks: true,
            completedTasks: true,
          },
        })
      : await this.prisma.researchMission.findFirst({
          where: { topicId },
          orderBy: { createdAt: "desc" },
          select: {
            id: true,
            topicId: true,
            leaderModelId: true,
            leaderModelName: true,
            researchDepth: true,
            startedAt: true,
            completedAt: true,
            createdAt: true,
            totalTasks: true,
            completedTasks: true,
          },
        });

    if (missionId && !targetMission) {
      throw new NotFoundException(
        `Mission ${missionId} not found for topic ${topicId}`,
      );
    }

    const windowStart = targetMission?.startedAt ?? targetMission?.createdAt;
    const windowEnd = targetMission?.completedAt ?? new Date();

    const latestReport = await this.prisma.topicReport.findFirst({
      where: {
        topicId,
        ...(windowStart
          ? { generatedAt: { gte: windowStart, lte: windowEnd } }
          : {}),
      },
      orderBy: { generatedAt: "desc" },
      select: {
        id: true,
        totalTokens: true,
        generationTimeMs: true,
        totalDimensions: true,
      },
    });

    const dimensionAnalyses = await this.prisma.dimensionAnalysis.findMany({
      where: {
        reportId: {
          in: latestReport ? [latestReport.id] : [],
        },
      },
      select: {
        tokensUsed: true,
        modelUsed: true,
        sourcesUsed: true,
        dimension: {
          select: { name: true },
        },
      },
    });

    const latestMission = targetMission;

    type CreditAggRow = {
      model_name: string | null;
      call_count: bigint;
      total_tokens: bigint | null;
      total_input_tokens: bigint | null;
      total_output_tokens: bigint | null;
      total_cache_creation_tokens: bigint | null;
      total_cache_read_tokens: bigint | null;
    };

    const creditAggGroups: CreditAggRow[] = await this.prisma.$queryRaw<
      CreditAggRow[]
    >`
        SELECT
          model_name,
          COUNT(*) AS call_count,
          SUM(COALESCE(token_count, 0)) AS total_tokens,
          SUM(COALESCE(input_tokens, 0)) AS total_input_tokens,
          SUM(COALESCE(output_tokens, 0)) AS total_output_tokens,
          SUM(COALESCE(cache_creation_tokens, 0)) AS total_cache_creation_tokens,
          SUM(COALESCE(cache_read_tokens, 0)) AS total_cache_read_tokens
        FROM credit_transactions
        WHERE reference_id = ${topicId}
          AND amount < 0
          AND created_at >= ${windowStart ?? new Date("2020-01-01")}
          AND created_at <= ${windowEnd}
        GROUP BY model_name
        ORDER BY call_count DESC
      `;

    const creditTransactions = await this.prisma.creditTransaction.findMany({
      where: {
        referenceId: topicId,
        ...(windowStart
          ? { createdAt: { gte: windowStart, lte: windowEnd } }
          : {}),
      },
      orderBy: { createdAt: "desc" },
      take: 50,
      select: {
        operationType: true,
        amount: true,
        tokenCount: true,
        inputTokens: true,
        outputTokens: true,
        cacheCreationTokens: true,
        cacheReadTokens: true,
        modelName: true,
        createdAt: true,
      },
    });

    const totalCreditsConsumed = creditTransactions
      .filter((t) => t.amount < 0)
      .reduce((acc, t) => acc + Math.abs(t.amount), 0);

    let totalLlmCalls = 0;
    let creditTotalTokens = 0;
    let creditInputTokens = 0;
    let creditOutputTokens = 0;
    let creditCacheCreationTokens = 0;
    let creditCacheReadTokens = 0;

    for (const g of creditAggGroups) {
      totalLlmCalls += Number(g.call_count);
      creditTotalTokens += Number(g.total_tokens ?? 0);
      creditInputTokens += Number(g.total_input_tokens ?? 0);
      creditOutputTokens += Number(g.total_output_tokens ?? 0);
      creditCacheCreationTokens += Number(g.total_cache_creation_tokens ?? 0);
      creditCacheReadTokens += Number(g.total_cache_read_tokens ?? 0);
    }

    const reportTotalTokens = latestReport?.totalTokens ?? 0;
    const finalTotalTokens =
      creditTotalTokens > 0 ? creditTotalTokens : reportTotalTokens;
    const estimatedCostUsd =
      finalTotalTokens > 0 ? (finalTotalTokens * 2) / 1_000_000 : 0;

    let researchDurationMs = 0;
    if (latestMission?.startedAt && latestMission?.completedAt) {
      researchDurationMs =
        new Date(latestMission.completedAt).getTime() -
        new Date(latestMission.startedAt).getTime();
    }

    const modelDistribution = creditAggGroups
      .filter((g) => g.model_name !== null)
      .map((g) => {
        const tokens = Number(g.total_tokens ?? 0);
        return {
          modelId: g.model_name as string,
          callCount: Number(g.call_count),
          totalTokens: tokens,
          inputTokens: Number(g.total_input_tokens ?? 0),
          outputTokens: Number(g.total_output_tokens ?? 0),
          cacheCreationTokens: Number(g.total_cache_creation_tokens ?? 0),
          cacheReadTokens: Number(g.total_cache_read_tokens ?? 0),
          estimatedCost: tokens > 0 ? (tokens * 2) / 1_000_000 : 0,
          percentage:
            totalLlmCalls > 0
              ? Math.round((Number(g.call_count) / totalLlmCalls) * 100)
              : 0,
        };
      })
      .sort((a, b) => b.callCount - a.callCount);

    const allMissions = await this.prisma.researchMission.findMany({
      where: { topicId },
      orderBy: { createdAt: "desc" },
      take: 20,
      select: {
        id: true,
        status: true,
        researchDepth: true,
        startedAt: true,
        completedAt: true,
        createdAt: true,
      },
    });

    type StepWithActions = {
      name: string;
      durationMs: number;
      actions: Array<{
        name: string;
        type: string;
        model: string;
        totalDurationMs: number;
        ttftMs?: number;
        ttltMs: number;
        inputTokens: number;
        outputTokens: number;
      }>;
    };
    let latencySummary: LatencySessionSummary | undefined;
    let latencySteps: StepWithActions[] = [];
    if (this.latencyTracker) {
      try {
        const dbSession = await this.prisma.latencySession.findFirst({
          where: {
            entityId: topicId,
            type: "topic_insights_refresh",
            ...(windowStart
              ? { startTime: { gte: windowStart, lte: windowEnd } }
              : {}),
          },
          orderBy: { createdAt: "desc" },
          select: { summary: true, phases: true },
        });
        if (dbSession?.summary) {
          latencySummary =
            dbSession.summary as unknown as LatencySessionSummary;
          const rawSteps = (dbSession.phases ?? []) as unknown as Array<{
            id?: string;
            name: string;
            parentStepId?: string;
            durationMs?: number;
            startTime?: number;
            endTime?: number;
            actions?: Array<{
              name: string;
              type?: string;
              model: string;
              totalDurationMs: number;
              ttftMs?: number;
              ttltMs: number;
              inputTokens: number;
              outputTokens: number;
            }>;
          }>;
          latencySteps = rawSteps.map((s) => ({
            name: s.name,
            parentStepId: s.parentStepId,
            durationMs:
              s.durationMs ??
              (s.startTime && s.endTime ? s.endTime - s.startTime : 0),
            actions: (s.actions ?? []).map((a) => ({
              name: a.name,
              type: a.type ?? "llm_call",
              model: a.model,
              totalDurationMs: a.totalDurationMs,
              ttftMs: a.ttftMs,
              ttltMs: a.ttltMs,
              inputTokens: a.inputTokens,
              outputTokens: a.outputTokens,
            })),
          }));
        }
      } catch {
        /* non-fatal */
      }
      if (!latencySummary) {
        const activeSession = this.latencyTracker.getActiveSession(
          topicId,
          "topic_insights_refresh",
        );
        if (activeSession) {
          latencySummary = this.latencyTracker.getActiveSessionSummary(
            topicId,
            "topic_insights_refresh",
          );
          latencySteps = activeSession.steps.map((s) => ({
            name: s.name,
            parentStepId: s.parentStepId,
            durationMs:
              s.durationMs ??
              (s.endTime ? s.endTime - s.startTime : Date.now() - s.startTime),
            actions: s.actions.map((a) => ({
              name: a.name,
              type: a.type ?? "llm_call",
              model: a.model,
              totalDurationMs: a.totalDurationMs,
              ttftMs: a.ttftMs,
              ttltMs: a.ttltMs,
              inputTokens: a.inputTokens,
              outputTokens: a.outputTokens,
            })),
          }));
        }
      }
    }

    return {
      summary: {
        totalTokens: finalTotalTokens,
        inputTokens: creditInputTokens,
        outputTokens: creditOutputTokens,
        cacheCreationTokens: creditCacheCreationTokens,
        cacheReadTokens: creditCacheReadTokens,
        totalCreditsConsumed,
        estimatedCostUsd,
        totalLlmCalls,
        totalDimensions: latestReport?.totalDimensions ?? 0,
        researchDurationMs,
        reportGenerationMs: latestReport?.generationTimeMs ?? 0,
      },
      dimensions: dimensionAnalyses.map((da) => ({
        dimensionName: da.dimension.name,
        modelUsed: da.modelUsed,
        tokensUsed: da.tokensUsed,
        sourcesUsed: da.sourcesUsed,
      })),
      modelDistribution,
      creditHistory: creditTransactions.map((t) => ({
        operationType: t.operationType ?? "",
        amount: t.amount,
        tokenCount: t.tokenCount,
        inputTokens: t.inputTokens,
        outputTokens: t.outputTokens,
        cacheCreationTokens: t.cacheCreationTokens,
        cacheReadTokens: t.cacheReadTokens,
        modelName: t.modelName,
        createdAt: t.createdAt.toISOString(),
      })),
      mission: latestMission
        ? {
            leaderModel:
              latestMission.leaderModelName ??
              latestMission.leaderModelId ??
              "",
            researchDepth: latestMission.researchDepth ?? "",
            startedAt: latestMission.startedAt?.toISOString() ?? null,
            completedAt: latestMission.completedAt?.toISOString() ?? null,
            totalTasks: latestMission.totalTasks,
            completedTasks: latestMission.completedTasks,
          }
        : null,
      latency: latencySummary ?? null,
      latencySteps,
      missions: allMissions.map((m) => ({
        id: m.id,
        status: m.status,
        researchDepth: m.researchDepth,
        startedAt: m.startedAt?.toISOString() ?? null,
        completedAt: m.completedAt?.toISOString() ?? null,
        createdAt: m.createdAt.toISOString(),
      })),
      currentMissionId: targetMission?.id ?? null,
    };
  }

  private async verifyTopicReadAccess(
    userId: string,
    topicId: string,
  ): Promise<void> {
    const topic = await this.prisma.researchTopic.findUnique({
      where: { id: topicId },
      select: { userId: true },
    });

    if (!topic) {
      throw new NotFoundException(`Topic ${topicId} not found`);
    }

    if (topic.userId === userId) {
      return;
    }

    const hasAccess = await this.checkTopicAccess(userId, topicId);
    if (!hasAccess) {
      throw new ForbiddenException(
        "You do not have permission to access this topic",
      );
    }
  }

  private async checkTopicAccess(
    userId: string,
    topicId: string,
  ): Promise<boolean> {
    const result = await this.prisma.$queryRaw<
      { visibility: string; is_collaborator: boolean }[]
    >`
      SELECT
        rt.visibility,
        EXISTS(
          SELECT 1 FROM research_topic_collaborators tc
          WHERE tc."topic_id" = rt.id
            AND tc."user_id" = ${userId}
            AND tc."is_active" = true
        ) as is_collaborator
      FROM research_topics rt
      WHERE rt.id = ${topicId}
    `;

    if (!result.length) {
      return false;
    }

    const { visibility, is_collaborator } = result[0];

    if (visibility === "PUBLIC") {
      return true;
    }

    if (visibility === "SHARED" && is_collaborator) {
      return true;
    }

    return false;
  }
}
