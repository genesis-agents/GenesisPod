import { Injectable, Logger } from "@nestjs/common";
import { Cron, CronExpression } from "@nestjs/schedule";
import { PrismaService } from "../../../../common/prisma/prisma.service";
import {
  AUTO_INGEST_SYSTEM_USER_ID,
  WikiIngestService,
} from "./wiki-ingest.service";

/**
 * WikiAutoIngestScheduler — PR-1, the "compounding" half of Karpathy's
 * LLM Wiki philosophy. Before this scheduler existed, wiki only updated
 * when a user clicked Ingest; KBs accumulated raw doc updates that wiki
 * never absorbed.
 *
 * Cadence: every 5 minutes. Each tick:
 *  1. Find KBs with `wikiEnabled=true` AND `wikiConfig.autoIngestEnabled
 *     != false` (default true when config row absent).
 *  2. For each KB, compute the cursor = MAX(WikiDiff.createdAt) — any
 *     diff (user-triggered or auto) advances the cursor, so user manual
 *     ingest naturally suppresses redundant auto-ingest.
 *  3. Find candidate docs whose `updatedAt > cursor` AND have real
 *     content (status != ERROR, not the `[Pending content fetch from X]`
 *     placeholder via metadata.pendingFetch flag, OR off-loaded).
 *  4. Apply per-KB gates:
 *       a. debounce — skip if any WikiDiff from this scheduler created
 *          within `autoIngestDebounceSeconds`
 *       b. daily budget — skip if today's auto-ingest WikiDiff count for
 *          this KB ≥ `autoIngestDailyBudgetCalls`
 *  5. Call `WikiIngestService.ingestAsCron(kbId, docIds)` — produces a
 *     PENDING WikiDiff. Governance preserved (no auto-apply).
 *
 * Pull-based by design: zero changes to `KnowledgeBaseService.addDocument`
 * or update paths. Cursor + filter live entirely in this scheduler.
 */
@Injectable()
export class WikiAutoIngestScheduler {
  private readonly logger = new Logger(WikiAutoIngestScheduler.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly ingestService: WikiIngestService,
  ) {}

  @Cron(CronExpression.EVERY_5_MINUTES, { name: "wiki.auto-ingest" })
  async tick(): Promise<void> {
    try {
      const candidates = await this.prisma.knowledgeBase.findMany({
        where: { wikiEnabled: true },
        select: {
          id: true,
          wikiConfig: {
            select: {
              autoIngestEnabled: true,
              autoIngestDailyBudgetCalls: true,
              autoIngestDebounceSeconds: true,
            },
          },
        },
      });

      const eligible = candidates.filter(
        (kb) => kb.wikiConfig?.autoIngestEnabled !== false,
      );

      if (eligible.length === 0) return;

      let triggered = 0;
      let skipped = 0;
      let failed = 0;

      for (const kb of eligible) {
        try {
          const debounceSeconds =
            kb.wikiConfig?.autoIngestDebounceSeconds ?? 300;
          const dailyBudget = kb.wikiConfig?.autoIngestDailyBudgetCalls ?? 20;
          const eligibleDocIds = await this.findIngestableDocIds(
            kb.id,
            debounceSeconds,
            dailyBudget,
          );
          if (eligibleDocIds === null) {
            skipped += 1;
            continue;
          }
          if (eligibleDocIds.length === 0) {
            skipped += 1;
            continue;
          }
          const diff = await this.ingestService.ingestAsCron(
            kb.id,
            eligibleDocIds,
          );
          this.logger.log(
            `[cron:wiki.auto-ingest] kb=${kb.id} diff=${diff.id} docs=${eligibleDocIds.length}`,
          );
          triggered += 1;
        } catch (error) {
          failed += 1;
          this.logger.warn(
            `[cron:wiki.auto-ingest] kb=${kb.id} failed: ${
              error instanceof Error ? error.message : String(error)
            }`,
          );
        }
      }

      if (triggered > 0 || failed > 0) {
        this.logger.log(
          `[cron:wiki.auto-ingest] tick — eligible=${eligible.length} triggered=${triggered} skipped=${skipped} failed=${failed}`,
        );
      }
    } catch (error) {
      // Top-level catch keeps the Nest process alive on transient DB
      // failures — matches the ByokMaintenanceScheduler defensive pattern.
      this.logger.error(
        `[cron:wiki.auto-ingest] catastrophic failure: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }

  /**
   * Returns the doc IDs to ingest, or `null` if a per-KB gate (debounce /
   * daily budget) blocks this tick. Empty array means no doc has changed
   * since the cursor — different from `null` (which means "skip and try
   * again next tick").
   */
  private async findIngestableDocIds(
    knowledgeBaseId: string,
    debounceSeconds: number,
    dailyBudget: number,
  ): Promise<string[] | null> {
    // Debounce: any auto-ingest within the window pre-empts this tick.
    const debounceCutoff = new Date(Date.now() - debounceSeconds * 1000);
    const recentAuto = await this.prisma.wikiDiff.findFirst({
      where: {
        knowledgeBaseId,
        createdByUserId: AUTO_INGEST_SYSTEM_USER_ID,
        createdAt: { gte: debounceCutoff },
      },
      select: { id: true },
    });
    if (recentAuto) return null;

    // Daily budget: count today's auto-ingest diffs for this KB.
    const startOfDay = new Date();
    startOfDay.setUTCHours(0, 0, 0, 0);
    const todayAutoCount = await this.prisma.wikiDiff.count({
      where: {
        knowledgeBaseId,
        createdByUserId: AUTO_INGEST_SYSTEM_USER_ID,
        createdAt: { gte: startOfDay },
      },
    });
    if (todayAutoCount >= dailyBudget) return null;

    // Cursor: most recent diff from any source (user or auto). Manual user
    // ingest right after a doc edit will advance the cursor and suppress
    // duplicate auto-ingest.
    const lastDiff = await this.prisma.wikiDiff.findFirst({
      where: { knowledgeBaseId },
      orderBy: { createdAt: "desc" },
      select: { createdAt: true },
    });
    const cursor = lastDiff?.createdAt ?? new Date(0);

    // Candidate docs: changed since cursor, status != ERROR, content is
    // not a `[Pending content fetch from X]` placeholder.
    // We deliberately do NOT select rawContent — selecting it would trigger
    // PrismaService's R2 hydrate hook for off-loaded docs (N round-trips).
    const docs = await this.prisma.knowledgeBaseDocument.findMany({
      where: {
        knowledgeBaseId,
        updatedAt: { gt: cursor },
        status: { not: "ERROR" },
      },
      select: { id: true, metadata: true, rawContentUri: true },
    });

    return docs
      .filter((d) => {
        if (d.rawContentUri) return true; // off-loaded docs always real
        const meta = d.metadata as { pendingFetch?: boolean } | null;
        return meta?.pendingFetch !== true;
      })
      .map((d) => d.id);
  }
}
