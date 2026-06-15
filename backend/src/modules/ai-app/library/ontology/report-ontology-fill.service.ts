/**
 * ReportOntologyFillService — W-E 既有报告手工回填
 *
 * 读取 ai-app 层已落库的报告正文（TopicReport / TeamMission / KnowledgeBaseDocument），
 * 以 text 方式调 engine OntologyBuilderSkill 抽取本体，写入知识图谱。
 *
 * 设计约束：
 * - 在 ai-app 层读正文后以 text 传入 skill（engine skill 不反向依赖 app）。
 * - off-load URI 由 PrismaService 透明 hydrate（select fullReport + fullReportUri 时自动拉取）。
 * - 回填不受 ENABLE_ONTOLOGY_AUTO_INGEST 开关影响（显式用户动作）。
 * - 幂等：upsert 安全，重复回填覆盖旧节点。
 * - 限流：顺序 await（单并发）避免 LLM 过载。
 * - fire-and-forget：batchFill 非阻塞，状态由内存 taskId map 追踪。
 *
 * Layer: ai-app / library / ontology
 */

import { Inject, Injectable, Logger, Optional } from "@nestjs/common";
import { v4 as uuid } from "uuid";
import { MissionStatus } from "@prisma/client";
import { PrismaService } from "@/common/prisma/prisma.service";
import {
  OntologyBuilderSkill,
  OntologyBuilderOutput,
  ToolRegistry,
} from "@/modules/ai-engine/facade";
import type { SkillContext } from "@/modules/ai-engine/facade";
import type { BackfillSourceKind } from "./dto/backfill.dto";

/** Maximum text fed to the skill per call (aligns with skill internal limit). */
const FILL_MAX_CHARS = 24_000;

// ─── Task tracking ────────────────────────────────────────────────────────────

export type BackfillStatus = "running" | "done" | "failed";

export interface BackfillTaskState {
  status: BackfillStatus;
  processed: number;
  total: number;
  /** 因之前已回填而跳过的报告数（去重）。 */
  skipped: number;
  errors: string[];
}

// ─── Service ──────────────────────────────────────────────────────────────────

@Injectable()
export class ReportOntologyFillService {
  private readonly logger = new Logger(ReportOntologyFillService.name);

  /** In-memory task registry (process-scoped; sufficient for manual backfill UX). */
  private readonly tasks = new Map<string, BackfillTaskState>();

  // 注：@Inject(类) 显式钉死注入 token —— 构造参数若写成 `T | undefined`，
  // TS emitDecoratorMetadata 会把 design:paramtypes 退化成 Object，Nest 解析不到，
  // @Optional() 便永远注入 undefined（本体回填全程 skip 的真因）。改 `?:` + 显式 @Inject。
  constructor(
    private readonly prisma: PrismaService,
    @Optional()
    @Inject(OntologyBuilderSkill)
    private readonly ontologyBuilderSkill?: OntologyBuilderSkill,
    @Optional()
    @Inject(ToolRegistry)
    private readonly toolRegistry?: ToolRegistry,
  ) {}

  // ─── Public API ──────────────────────────────────────────────────────────────

  /**
   * Resolve text for a single source record and run OntologyBuilderSkill.
   * Returns null when the skill is unavailable or text cannot be resolved.
   */
  async fillOne(
    sourceKind: BackfillSourceKind,
    id: string,
    topicId?: string,
  ): Promise<OntologyBuilderOutput | null> {
    if (!this.ontologyBuilderSkill) {
      this.logger.warn(
        "[fillOne] OntologyBuilderSkill unavailable — skipping (non-fatal)",
      );
      return null;
    }

    const text = await this.resolveText(sourceKind, id);
    if (!text) {
      this.logger.warn(
        `[fillOne] No text resolved for ${sourceKind}:${id} — skipping`,
      );
      return null;
    }

    const truncated =
      text.length > FILL_MAX_CHARS
        ? text.slice(0, FILL_MAX_CHARS) + " […truncated]"
        : text;

    if (this.toolRegistry) {
      this.ontologyBuilderSkill.setToolRegistry(this.toolRegistry);
    }

    const context: SkillContext = {
      executionId: `ontology-backfill-${sourceKind}-${id}`,
      skillId: this.ontologyBuilderSkill.id,
      createdAt: new Date(),
    };

    const result = await this.ontologyBuilderSkill.execute(
      {
        text: truncated,
        topicId,
        sourceType: sourceKind,
        sourceId: id,
      },
      context,
    );

    if (!result.success) {
      this.logger.warn(
        `[fillOne] skill returned error for ${sourceKind}:${id}: ${result.error?.message ?? "unknown"}`,
      );
      return null;
    }

    return result.data ?? null;
  }

  /**
   * Launch a fire-and-forget batch fill job.
   *
   * @param opts.userId     Required — scopes all source kinds to the authenticated user.
   * @param opts.topicId    Optional further scope to a single topic (topic-report / team-mission).
   * @param opts.sourceId   Optional scope to a single record by ID.
   * @param opts.sourceKind Which source type to scan; omit to run all three.
   * @returns { taskId, queued } — taskId can be polled via getTaskStatus().
   */
  startBatchFill(opts: {
    userId: string;
    topicId?: string;
    sourceId?: string;
    sourceKind?: BackfillSourceKind;
  }): { taskId: string; queued: number } {
    const taskId = uuid();
    const kinds: BackfillSourceKind[] = opts.sourceKind
      ? [opts.sourceKind]
      : ["topic-report", "team-mission", "kb-document", "playground-mission"];

    // Initialise task state — total is updated asynchronously once records are fetched
    const state: BackfillTaskState = {
      status: "running",
      processed: 0,
      total: 0,
      skipped: 0,
      errors: [],
    };
    this.tasks.set(taskId, state);

    // Fire-and-forget
    void this.runBatch(taskId, state, kinds, opts);

    return { taskId, queued: kinds.length };
  }

  /** Return the current task state or null when unknown. */
  getTaskStatus(taskId: string): BackfillTaskState | null {
    return this.tasks.get(taskId) ?? null;
  }

  // ─── Private helpers ──────────────────────────────────────────────────────────

  private async runBatch(
    taskId: string,
    state: BackfillTaskState,
    kinds: BackfillSourceKind[],
    opts: { userId: string; topicId?: string; sourceId?: string },
  ): Promise<void> {
    this.logger.log(
      `[batch:${taskId}] starting — kinds=${kinds.join(",")} userId=${opts.userId} topicId=${opts.topicId ?? "*"} sourceId=${opts.sourceId ?? "*"}`,
    );

    try {
      for (const kind of kinds) {
        await this.runKind(taskId, state, kind, opts);
      }
      state.status = "done";
      this.logger.log(
        `[batch:${taskId}] done — processed=${state.processed} errors=${state.errors.length}`,
      );
    } catch (err: unknown) {
      state.status = "failed";
      const msg = err instanceof Error ? err.message : String(err);
      state.errors.push(`batch-fatal: ${msg}`);
      this.logger.error(`[batch:${taskId}] fatal error: ${msg}`);
    }
  }

  private async runKind(
    taskId: string,
    state: BackfillTaskState,
    kind: BackfillSourceKind,
    opts: { userId: string; topicId?: string; sourceId?: string },
  ): Promise<void> {
    const rows = await this.listSourceRows(kind, opts);

    // 去重：跳过此前已回填过的报告，只处理新增的（省 LLM、不覆盖手工编辑）。
    const processed = await this.getProcessedSourceIds(opts.userId, kind);
    const pending = rows.filter((r) => !processed.has(r.id));
    const skipped = rows.length - pending.length;
    state.skipped += skipped;
    state.total += pending.length;

    this.logger.log(
      `[batch:${taskId}] kind=${kind} total=${rows.length} pending=${pending.length} skipped=${skipped}`,
    );

    for (const row of pending) {
      try {
        const output = await this.fillOne(kind, row.id, row.topicId);
        if (output) {
          this.logger.debug(
            `[batch:${taskId}] ${kind}:${row.id} — created=${output.created} merged=${output.merged} linked=${output.linked}`,
          );
          // 仅在 skill 实际产出（即真正抽取过）后标记已处理；text 为空/skill
          // 不可用返回 null 时不标记，留待下次（避免永久误跳过）。
          await this.markProcessed(opts.userId, kind, row.id);
        }
        state.processed++;
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        const entry = `${kind}:${row.id}: ${msg}`;
        state.errors.push(entry);
        this.logger.warn(`[batch:${taskId}] error — ${entry}`);
        state.processed++;
      }
    }
  }

  /** 已处理报告的 source_id 集合（去重用）。表缺失/异常时返回空集（降级为不去重）。 */
  private async getProcessedSourceIds(
    userId: string,
    kind: BackfillSourceKind,
  ): Promise<Set<string>> {
    try {
      const rows = await this.prisma.$queryRaw<{ source_id: string }[]>`
        SELECT "source_id" FROM "ontology_backfill_records"
        WHERE "user_id" = ${userId} AND "source_kind" = ${kind}
      `;
      return new Set(rows.map((r) => r.source_id));
    } catch (err: unknown) {
      this.logger.warn(
        `[getProcessedSourceIds] query failed (no dedup): ${err instanceof Error ? err.message : String(err)}`,
      );
      return new Set();
    }
  }

  /** 标记一条报告已回填（幂等：ON CONFLICT DO NOTHING）。 */
  private async markProcessed(
    userId: string,
    kind: BackfillSourceKind,
    sourceId: string,
  ): Promise<void> {
    try {
      await this.prisma.$executeRaw`
        INSERT INTO "ontology_backfill_records" ("user_id", "source_kind", "source_id")
        VALUES (${userId}, ${kind}, ${sourceId})
        ON CONFLICT ("user_id", "source_kind", "source_id") DO NOTHING
      `;
    } catch (err: unknown) {
      this.logger.warn(
        `[markProcessed] insert failed for ${kind}:${sourceId}: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  /**
   * List the (id, topicId) pairs to process for the given source kind.
   * Always scoped to opts.userId for security — never returns cross-user records.
   * If opts.sourceId is provided, returns only that single record.
   */
  private async listSourceRows(
    kind: BackfillSourceKind,
    opts: { userId: string; topicId?: string; sourceId?: string },
  ): Promise<Array<{ id: string; topicId: string | undefined }>> {
    if (kind === "topic-report") {
      const where: Record<string, unknown> = {
        // Only reports with at least one dimensionAnalysis (non-empty drafts)
        dimensionAnalyses: { some: {} },
        // Scope to the authenticated user via the parent ResearchTopic
        topic: { userId: opts.userId },
      };
      if (opts.topicId) where["topicId"] = opts.topicId;
      if (opts.sourceId) where["id"] = opts.sourceId;

      const rows = await this.prisma.topicReport.findMany({
        where,
        select: { id: true, topicId: true },
        orderBy: { generatedAt: "desc" },
      });
      return rows.map((r) => ({ id: r.id, topicId: r.topicId }));
    }

    if (kind === "team-mission") {
      const where: Record<string, unknown> = {
        status: MissionStatus.COMPLETED,
        finalResult: { not: null },
        // Scope to the authenticated user via createdById
        createdById: opts.userId,
      };
      if (opts.topicId) where["topicId"] = opts.topicId;
      if (opts.sourceId) where["id"] = opts.sourceId;

      const rows = await this.prisma.teamMission.findMany({
        where,
        select: { id: true, topicId: true },
        orderBy: { completedAt: "desc" },
      });
      return rows.map((r) => ({ id: r.id, topicId: r.topicId }));
    }

    // kb-document: scoped to user via knowledgeBase.userId relation
    if (kind === "kb-document") {
      const where: Record<string, unknown> = {
        rawContent: { not: "" },
        // Scope to the authenticated user via the parent KnowledgeBase
        knowledgeBase: { userId: opts.userId },
      };
      if (opts.sourceId) where["id"] = opts.sourceId;

      const rows = await this.prisma.knowledgeBaseDocument.findMany({
        where,
        select: { id: true },
        orderBy: { createdAt: "desc" },
      });
      return rows.map((r) => ({ id: r.id, topicId: undefined }));
    }

    // Agent Playground missions：用户维度（无议题），写入全局本体（topicId=null）。
    if (kind === "playground-mission") {
      const where: Record<string, unknown> = {
        status: "completed",
        userId: opts.userId,
      };
      if (opts.sourceId) where["id"] = opts.sourceId;

      const rows = await this.prisma.agentPlaygroundMission.findMany({
        where,
        select: { id: true },
        orderBy: { startedAt: "desc" },
      });
      return rows.map((r) => ({ id: r.id, topicId: undefined }));
    }

    return [];
  }

  /**
   * Resolve full text for a source record.
   * PrismaService transparently hydrates off-loaded content when the row is
   * selected with both the content field and the URI field.
   */
  private async resolveText(
    kind: BackfillSourceKind,
    id: string,
  ): Promise<string | null> {
    if (kind === "topic-report") {
      const row = await this.prisma.topicReport.findUnique({
        where: { id },
        select: {
          fullReport: true,
          fullReportUri: true,
        },
      });
      const text = row?.fullReport?.trim();
      return text || null;
    }

    if (kind === "team-mission") {
      const row = await this.prisma.teamMission.findUnique({
        where: { id },
        select: { finalResult: true },
      });
      const text = row?.finalResult?.trim();
      return text || null;
    }

    if (kind === "kb-document") {
      const row = await this.prisma.knowledgeBaseDocument.findUnique({
        where: { id },
        select: {
          rawContent: true,
          rawContentUri: true,
        },
      });
      const text = row?.rawContent?.trim();
      return text || null;
    }

    if (kind === "playground-mission") {
      // 报告正文是结构化 JSON（v1 ResearchReport / v2 ReportArtifact）；本体抽取用
      // 标题 + 主题概述 + 摘要这三段纯文本即可（含关键实体），避免解析 artifact 结构。
      const row = await this.prisma.agentPlaygroundMission.findUnique({
        where: { id },
        select: {
          reportTitle: true,
          themeSummary: true,
          reportSummary: true,
        },
      });
      if (!row) return null;
      const text = [row.reportTitle, row.themeSummary, row.reportSummary]
        .filter((s): s is string => !!s && s.trim().length > 0)
        .join("\n\n")
        .trim();
      return text || null;
    }

    return null;
  }
}
