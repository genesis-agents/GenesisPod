/**
 * MissionPostmortemHelper — mission 复盘记录
 * （recordMissionPostmortem / listRecentPostmortems）。
 *
 * 普通 class（非 @Injectable），由 MissionStore 在 constructor 内 new。
 * embeddingService 为 Optional，缺失时降级 tag-only 召回。
 */

import { Logger } from "@nestjs/common";
import { PrismaService } from "../../../../../../common/prisma/prisma.service";
import { EmbeddingService } from "@/modules/ai-engine/facade";

export class MissionPostmortemHelper {
  private readonly log = new Logger(MissionPostmortemHelper.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly embeddingService?: EmbeddingService,
  ) {}

  async recordMissionPostmortem(input: {
    missionId: string;
    userId: string;
    topic: string;
    summary: string;
    recommendations: string[];
    leaderSigned: boolean | null;
    qualityScore: number | null;
    tokensUsed: number;
    costUsd: number;
    failureClassification?: {
      mode: string;
      signals: string[];
      confidence: number;
    };
  }): Promise<void> {
    let embedding: number[] = [];
    if (this.embeddingService) {
      try {
        const text = `${input.topic}\n\n${input.summary}`.slice(0, 2000);
        const result = await this.embeddingService.generateEmbedding(text);
        if (Array.isArray(result?.embedding)) {
          embedding = result.embedding;
        }
      } catch (err) {
        this.log.warn(
          `[recordMissionPostmortem userId=${input.userId}] embedding failed (degrade to tag-only recall): ${
            err instanceof Error ? err.message : String(err)
          }`,
        );
      }
    }

    try {
      await this.prisma.harnessVectorMemory.create({
        data: {
          namespace: input.userId,
          source: "agent-playground:mission",
          entryKey: `mission-postmortem:${input.missionId}`,
          content: input.summary.slice(0, 2000),
          embedding,
          confidence: 1.0,
          tags: [
            "agent-playground",
            "mission-postmortem",
            input.leaderSigned === true ? "signed" : "unsigned",
          ],
          metadata: {
            missionId: input.missionId,
            topic: input.topic,
            recommendations: input.recommendations,
            qualityScore: input.qualityScore,
            tokensUsed: input.tokensUsed,
            costUsd: input.costUsd,
            ...(input.failureClassification
              ? { failureClassification: input.failureClassification }
              : {}),
          },
        },
      });
    } catch (err) {
      this.log.warn(
        `recordMissionPostmortem failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  async listRecentPostmortems(
    userId: string,
    limit = 3,
  ): Promise<
    {
      missionId: string;
      topic: string;
      summary: string;
      recommendations: string[];
      leaderSigned: boolean | null;
      qualityScore: number | null;
      createdAt: Date;
    }[]
  > {
    const recentMissionExists = await this.prisma.agentPlaygroundMission
      .findFirst({
        where: {
          userId,
          status: { in: ["completed", "quality-failed"] },
          completedAt: { gte: new Date(Date.now() - 5 * 60_000) },
        },
        select: { id: true, completedAt: true },
        orderBy: { completedAt: "desc" },
      })
      .catch(() => null);

    const fetchPostmortems = async () =>
      this.prisma.harnessVectorMemory
        .findMany({
          where: {
            namespace: userId,
            tags: { has: "mission-postmortem" },
          },
          orderBy: { createdAt: "desc" },
          take: Math.min(Math.max(limit, 1), 10),
        })
        .catch(() => []);

    let rows = await fetchPostmortems();

    if (recentMissionExists) {
      const recentMissionId = recentMissionExists.id;
      const hasRecent = rows.some(
        (r) =>
          ((r.metadata as Record<string, unknown> | null)?.missionId ??
            null) === recentMissionId,
      );
      if (!hasRecent) {
        const deadline = Date.now() + 3000;
        while (Date.now() < deadline) {
          await new Promise((r) => setTimeout(r, 300));
          rows = await fetchPostmortems();
          if (
            rows.some(
              (r) =>
                ((r.metadata as Record<string, unknown> | null)?.missionId ??
                  null) === recentMissionId,
            )
          ) {
            this.log.debug(
              `[listRecentPostmortems ${userId}] S12 caught up for mission ${recentMissionId}`,
            );
            break;
          }
        }
      }
    }
    return rows.map((r) => {
      const meta = (r.metadata ?? {}) as Record<string, unknown>;
      return {
        missionId: String(meta.missionId ?? ""),
        topic: String(meta.topic ?? ""),
        summary: r.content,
        recommendations: Array.isArray(meta.recommendations)
          ? (meta.recommendations as string[])
          : [],
        leaderSigned: r.tags.includes("signed")
          ? true
          : r.tags.includes("unsigned")
            ? false
            : null,
        qualityScore:
          typeof meta.qualityScore === "number" ? meta.qualityScore : null,
        createdAt: r.createdAt,
      };
    });
  }
}
