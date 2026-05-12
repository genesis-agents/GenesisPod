import { randomUUID } from "crypto";
import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import pLimit from "p-limit";
import {
  AIModelType,
  Prisma,
  WikiDiff,
  WikiDiffStatus,
  WikiIngestPassMode,
} from "@prisma/client";
import { PrismaService } from "../../../../common/prisma/prisma.service";
import { KnowledgeBaseService } from "../rag/services/knowledge-base.service";
import { WikiDiffService } from "./wiki-diff.service";
import {
  WikiDiffItemsSchema,
  type WikiDiffItems,
} from "./dto/wiki-diff-items.schema";
import {
  WikiOutlineSchema,
  type WikiOutline,
  type WikiOutlineCreateItem,
  type WikiOutlineUpdateItem,
} from "./dto/wiki-ingest-outline.schema";
import {
  WikiSectionFillSchema,
  type WikiSectionFill,
} from "./dto/wiki-ingest-section.schema";
import {
  WikiCrosslinkSchema,
  type WikiCrosslink,
  type WikiCrosslinkInsertion,
} from "./dto/wiki-ingest-crosslink.schema";
import {
  AiChatService,
  SkillLoaderService,
  wrapExternalContent,
} from "../../../ai-engine/facade";

export type WikiIngestCandidateState =
  | "READY_NEW"
  | "READY_STALE"
  | "READY_COVERED"
  | "BLOCKED";

/**
 * Observable metrics from the most recent ingest call (P1 commit 3 —
 * Reviewer D 建议 expose metric channel so spec/E2E can drive退场断言
 * without re-deriving从 LLM 原始 response).
 *
 * Set at the end of `ingestInternal()` (after WikiDiff persisted, before
 * return). Read-only consumer surface; mutation only from inside the
 * service. `null` when no successful ingest has run on this instance yet.
 */
export interface WikiIngestMetrics {
  /** sources soft-truncated to schema cap (oneLiner > 280 chars trimmed). */
  truncatedOneLiners: number;
  /** sources dropped by the 4-invariant soft-drop filter (not zod). */
  droppedSources: number;
  /** total sources observed across all items before soft-drop. */
  totalSourcesSeen: number;
  /** drop reasons breakdown (notObject / unknownDoc / spanInvalid / quoteInvalid). */
  droppedByReason: Record<string, number>;
  /** count of CREATE items in the validated diff. */
  pageCount: number;
  /** average body length (chars) across CREATE items; 0 when pageCount === 0. */
  avgBodyLength: number;
  /** fraction of CREATE pages whose body contains at least one `## ` H2 header. */
  h2CoverageRate: number;
  /** Which pass mode produced the diff (SINGLE / MULTI). */
  passMode: WikiIngestPassMode;
  /**
   * Multi-pass observability snapshot. `null` for SINGLE-mode runs to keep
   * the field strictly additive (no breaking change to existing consumers).
   */
  multiPass: WikiMultiPassMetrics | null;
}

/**
 * Multi-pass orchestration observability (P2 commit 4/5 — 2026-05-12 §P2).
 *
 * Surfaced via `lastIngestMetrics.multiPass` so spec / E2E / future API can
 * gate on §P2 退场条件 (partial-progress count, outline truncation rate,
 * crosslink insertion volume) without re-parsing the persisted JSON.
 */
export interface WikiMultiPassMetrics {
  /** Outline pass: total `creates` items returned by the LLM (pre-truncate). */
  outlineCreates: number;
  /** Outline pass: total `updates` items returned by the LLM. */
  outlineUpdates: number;
  /** Outline pass: total `deletes` items returned by the LLM. */
  outlineDeletes: number;
  /** Outline pass: how many CREATE entries were dropped by the ingestOutlineMaxPages cap. */
  outlineTruncated: number;
  /** Section-fill pass: pages that produced valid output. */
  sectionFillSuccessful: number;
  /** Section-fill pass: pages that failed (LLM error, schema fail, slug mismatch, etc). */
  sectionFillFailed: number;
  /** Section-fill pass: slug list for failed pages — surfaced to spec for assertion. */
  sectionFillFailedSlugs: string[];
  /** Cross-link pass: total `insertions` injected into final bodies. */
  crosslinkInsertions: number;
  /** Final diff carried a `partial=true` metadata flag (some section-fill failed). */
  partial: boolean;
}

/**
 * Per-ingest-session circuit breaker for multi-pass orchestration
 * (P2 commit 4, BLOCKER B6 of the 2026-05-12 consensus).
 *
 * Counts failures per pass type so a runaway provider does not waste the
 * entire BYOK budget retrying the same failing slug. Intentionally
 * INSTANCE-scoped (created per `ingestInternal` call) — never module-level
 * state, which would cross-pollute between concurrent ingests on the same
 * service singleton (claude-code-build 反向洞察 #8).
 *
 * Thresholds are intentionally hard-coded constants here (not config knobs):
 *  - outline: 3 consecutive failures → block (outline is a single call so 3
 *    means 3 sequential retries — overkill in practice, kept for symmetry).
 *  - section: 3 failures per slug → that slug is skipped for the rest of
 *    the session even if it gets retried by an upstream caller.
 *  - crosslink: 3 failures → block (crosslink fail-closed, kept for
 *    symmetry with the other two).
 */
class WikiIngestCircuitBreaker {
  private static readonly THRESHOLD = 3;
  private outlineFailures = 0;
  private crosslinkFailures = 0;
  private readonly sectionFailuresBySlug = new Map<string, number>();

  recordOutlineFailure(): void {
    this.outlineFailures += 1;
  }

  recordSectionFailure(slug: string): void {
    this.sectionFailuresBySlug.set(
      slug,
      (this.sectionFailuresBySlug.get(slug) ?? 0) + 1,
    );
  }

  recordCrosslinkFailure(): void {
    this.crosslinkFailures += 1;
  }

  isOutlineBlocked(): boolean {
    return this.outlineFailures >= WikiIngestCircuitBreaker.THRESHOLD;
  }

  isSectionBlocked(slug: string): boolean {
    return (
      (this.sectionFailuresBySlug.get(slug) ?? 0) >=
      WikiIngestCircuitBreaker.THRESHOLD
    );
  }

  isCrosslinkBlocked(): boolean {
    return this.crosslinkFailures >= WikiIngestCircuitBreaker.THRESHOLD;
  }
}

/**
 * Sentinel value stored in `WikiDiff.createdByUserId` for diffs produced by
 * the auto-ingest scheduler (PR-1). Daily-budget queries filter by this so
 * user-triggered diffs are not counted against the cron quota and vice
 * versa. Not a foreign key — `createdByUserId` is a plain `String` column.
 */
export const AUTO_INGEST_SYSTEM_USER_ID = "__system_auto_ingest__";

export interface WikiIngestCandidate {
  id: string;
  title: string;
  sourceType: string;
  mimeType: string | null;
  status: string;
  createdAt: Date;
  updatedAt: Date;
  processedAt: Date | null;
  chunkCount: number;
  lastError: string | null;
  pageReferenceCount: number;
  lastCitedAt: Date | null;
  ingestState: WikiIngestCandidateState;
  recommended: boolean;
  reason: string;
}

/**
 * WikiIngestService — LLM orchestration for wiki diff proposal (v1.5.3 §5.1).
 *
 * Flow:
 *  1. Load + validate documents (must belong to kbId)
 *  2. Read WikiKnowledgeBaseConfig.ingestMaxTokens (default 80_000) and
 *     truncate raw context accordingly
 *  3. wrapExternalContent on every doc rawContent with explicit maxLength
 *     budgeted from remaining token capacity (security R2 P2)
 *  4. Compute baselineHash from current wiki index
 *  5. Resolve `wiki-ingest` skill prompt via SkillLoaderService (the SKILL.md
 *     lives at `skills/wiki-ingest.skill.md` and is bridged into the engine
 *     SkillRegistry from WikiModule.onModuleInit through
 *     `PromptSkillBridge.registerDomain("library")`); single-turn LLM call
 *     with structured JSON output, NO multi-turn agent loop
 *     (MECE rule 1: engine knows no agent/mission state).
 *  6. Parse LLM JSON response → zod validate → persist WikiDiff with
 *     status=PENDING and affectedKeys (`slug:locale` composites) computed
 *     from items — see BLOCKER C2 in the 2026-05-12 consensus archive
 *  7. Return diffId for subsequent /diffs/:diffId fetch + apply
 */
@Injectable()
export class WikiIngestService {
  private readonly logger = new Logger(WikiIngestService.name);

  /**
   * Snapshot of the most recent `ingestInternal()` run (P1 commit 3).
   * Reset to a fully-populated object whenever a diff is successfully
   * persisted. `null` until the first success. Used by spec / E2E /
   * future API exposure to gate on退场条件 without re-parsing LLM output.
   */
  public lastIngestMetrics: WikiIngestMetrics | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly kbService: KnowledgeBaseService,
    private readonly diffService: WikiDiffService,
    private readonly chat: AiChatService,
    private readonly skillLoader: SkillLoaderService,
  ) {}

  /**
   * Trigger ingest. Returns the persisted PENDING WikiDiff for user review.
   * Does NOT apply — apply requires a separate explicit user action.
   */
  async ingest(
    userId: string,
    knowledgeBaseId: string,
    documentIds: string[],
  ): Promise<WikiDiff> {
    if (!documentIds || documentIds.length === 0) {
      throw new BadRequestException("documentIds must not be empty");
    }

    await this.assertEditorAccessAndWikiEnabled(userId, knowledgeBaseId);
    return this.ingestInternal(userId, knowledgeBaseId, documentIds);
  }

  /**
   * Cron entry for auto-ingest after raw refresh (PR-1). Bypasses user
   * auth — caller is the trusted internal scheduler.
   *
   * ★ 2026-05-11 BYOK 一致性原则：知识库相关 LLM 调用必须用 KB owner 的 BYOK
   *   key，不退回系统 key。Records 的 createdByUserId 用哨兵字符串只是为了
   *   按 cron / user 分类查每日预算，跟 LLM key 解析完全解耦。
   *
   * @param ownerUserId KB.userId — 真实用户 id，作为 chat.chat 的 BYOK 上下文
   */
  async ingestAsCron(
    knowledgeBaseId: string,
    documentIds: string[],
    ownerUserId: string,
  ): Promise<WikiDiff> {
    if (!documentIds || documentIds.length === 0) {
      throw new BadRequestException("documentIds must not be empty");
    }
    if (!ownerUserId) {
      throw new BadRequestException(
        "ownerUserId is required for cron ingest (BYOK-only mode)",
      );
    }
    return this.ingestInternal(
      AUTO_INGEST_SYSTEM_USER_ID,
      knowledgeBaseId,
      documentIds,
      ownerUserId,
    );
  }

  /**
   * @param recordUserId 写入 WikiDiff.createdByUserId（用户路径=真实 userId；
   *   cron 路径=AUTO_INGEST_SYSTEM_USER_ID 哨兵）
   * @param chatUserId chat.chat({ userId }) 的 BYOK 解析上下文。默认 =
   *   recordUserId（用户路径）；cron 路径要传 KB owner 的真实 userId
   *   覆盖哨兵字符串，否则 strict BYOK 预检会 fail。
   */
  private async ingestInternal(
    recordUserId: string,
    knowledgeBaseId: string,
    documentIds: string[],
    chatUserId: string = recordUserId,
  ): Promise<WikiDiff> {
    // Load + validate documents (must belong to this KB).
    const documents = await this.prisma.knowledgeBaseDocument.findMany({
      where: { id: { in: documentIds }, knowledgeBaseId },
      // rawContentUri 必须同 select：off-load 后 rawContent 列为 ""，
      // PrismaService hydrate hook 用 rawContentUri 透明回填 R2 内容。
      select: {
        id: true,
        title: true,
        rawContent: true,
        rawContentUri: true,
      },
    });
    if (documents.length !== documentIds.length) {
      throw new NotFoundException(
        `Some documents not found or do not belong to KB ${knowledgeBaseId}`,
      );
    }

    // Read config (default fallback if config row absent).
    const config = await this.prisma.wikiKnowledgeBaseConfig.findUnique({
      where: { knowledgeBaseId },
    });
    const ingestMaxTokens = config?.ingestMaxTokens ?? 80_000;
    const passMode: WikiIngestPassMode =
      config?.ingestPassMode ?? WikiIngestPassMode.SINGLE;
    const ingestOutlineMaxPages = config?.ingestOutlineMaxPages ?? 30;
    const ingestSectionConcurrency = config?.ingestSectionConcurrency ?? 3;
    const ingestSectionFailureToleranceRatio =
      config?.ingestSectionFailureToleranceRatio ?? 0.2;

    // Approximate char budget per doc (~4 chars per token).
    const totalCharBudget = ingestMaxTokens * 4;
    const perDocMaxLength = Math.max(
      500,
      Math.floor(totalCharBudget / Math.max(documents.length, 1) / 2),
    );

    // Wrap each doc's rawContent with explicit maxLength (security R2 P2).
    // Prefix each wrapped block with the documentId so the LLM can quote it
    // verbatim in `sources[].documentId` (otherwise it hallucinates UUIDs).
    const wrappedDocs = documents.map(
      (d) =>
        `[documentId: ${d.id}]\n` +
        wrapExternalContent(d.rawContent ?? "", {
          source: "kb_document",
          title: d.title,
          maxLength: perDocMaxLength,
        }),
    );
    const allowedDocumentIds = new Set(documents.map((d) => d.id));

    // Compute baseline hash from current wiki index.
    const baselineHash =
      await this.diffService.computeKbBaselineHash(knowledgeBaseId);

    // Load current wiki index for the LLM.
    const currentIndex = await this.prisma.wikiPage.findMany({
      where: { knowledgeBaseId },
      select: {
        slug: true,
        title: true,
        category: true,
        oneLiner: true,
      },
      orderBy: { slug: "asc" },
    });

    if (passMode === WikiIngestPassMode.MULTI) {
      return this.runMultiMode({
        recordUserId,
        chatUserId,
        knowledgeBaseId,
        documentIds,
        wrappedDocs,
        currentIndex,
        allowedDocumentIds,
        baselineHash,
        ingestOutlineMaxPages,
        ingestSectionConcurrency,
        ingestSectionFailureToleranceRatio,
      });
    }

    return this.runSingleMode({
      recordUserId,
      chatUserId,
      knowledgeBaseId,
      documentIds,
      wrappedDocs,
      currentIndex,
      allowedDocumentIds,
      baselineHash,
    });
  }

  // ─── SINGLE mode (legacy one-shot ingest) ──────────────────────────────────

  /**
   * Legacy SINGLE-pass ingest preserved verbatim (backward compat). Drives
   * the original `wiki-ingest` skill in one chat.chat() call and runs the
   * exact same soft-drop + zod + persist pipeline shared with MULTI mode.
   */
  private async runSingleMode(params: {
    recordUserId: string;
    chatUserId: string;
    knowledgeBaseId: string;
    documentIds: string[];
    wrappedDocs: string[];
    currentIndex: Array<{
      slug: string;
      title: string;
      category: string;
      oneLiner: string;
    }>;
    allowedDocumentIds: Set<string>;
    baselineHash: string;
  }): Promise<WikiDiff> {
    const {
      recordUserId,
      chatUserId,
      knowledgeBaseId,
      documentIds,
      wrappedDocs,
      currentIndex,
      allowedDocumentIds,
      baselineHash,
    } = params;

    // Resolve the system prompt from the registered `wiki-ingest` skill
    // (skills/wiki-ingest.skill.md → PromptSkillBridge.registerDomain("library")
    // wired in WikiModule.onModuleInit). Single-turn LLM call + structured
    // JSON output — no tool calling loop, no agent/mission semantics.
    const skillDef = await this.skillLoader.getSkillById("wiki-ingest");
    if (!skillDef) {
      this.logger.error(
        "[ingest] wiki-ingest skill not found in SkillLoader; ensure WikiModule.onModuleInit ran",
      );
      throw new BadRequestException(
        "Wiki ingest skill is not available; please retry",
      );
    }
    const systemPrompt = skillDef.content;
    const userPrompt = this.buildUserPrompt(currentIndex, wrappedDocs);

    let llmResponse: Awaited<ReturnType<typeof this.chat.chat>>;
    try {
      // Use semantic TaskProfile per .claude/rules/ai-engine.md — never hardcode
      // model/temperature/maxTokens. deterministic+long fits structured JSON
      // extraction (was temperature 0.2 / maxTokens 8000).
      //
      // ★ 2026-05-11 BYOK 一致性原则：知识库 LLM 调用必须用真实 user 的 BYOK
      //   key，不退回系统 key。
      //   - user 触发：chatUserId = recordUserId = 真实用户 id（默认值）
      //   - cron 触发：chatUserId = KB.userId（KB owner）；recordUserId = 哨兵
      //     字符串（仅写 WikiDiff.createdByUserId 用于分类记账）
      llmResponse = await this.chat.chat({
        messages: [{ role: "user", content: userPrompt }],
        systemPrompt,
        modelType: AIModelType.CHAT,
        taskProfile: {
          creativity: "deterministic",
          outputLength: "long",
        },
        responseFormat: "json_object",
        operationName: "library-wiki-ingest",
        userId: chatUserId,
      });
    } catch (error) {
      this.logger.error(
        `[ingest] LLM call failed kb=${knowledgeBaseId} docs=${documentIds.length}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      throw new BadRequestException(
        "Wiki ingest LLM call failed; please retry",
      );
    }

    // Parse LLM JSON into items shape.
    const rawItems = this.extractJson(llmResponse.content);

    return this.softDropAndPersist({
      rawItems,
      allowedDocumentIds,
      knowledgeBaseId,
      recordUserId,
      baselineHash,
      passMode: WikiIngestPassMode.SINGLE,
      multiPassMetrics: null,
    });
  }

  // ─── MULTI mode (outline → section-fill → cross-link, P2 commit 4/5) ──────

  /**
   * Multi-pass ingest pipeline (2026-05-12 consensus §P2).
   *
   * 1. `passOutline` — single LLM call returns the planned diff shape
   *    (creates/updates/deletes + sectionSkeleton per page + groupLabel for
   *    translation dedup). Service rewrites groupLabel → crypto.randomUUID()
   *    so the LLM cannot hallucinate or repeat UUIDs (BLOCKER C7).
   * 2. `passSectionFill` — N parallel LLM calls (one per page), throttled
   *    via p-limit at `ingestSectionConcurrency`. Tolerates up to
   *    `ingestSectionFailureToleranceRatio` failures, upserts each
   *    successful page to WikiIngestDraft for partial-progress recovery
   *    (BLOCKER B2). Each invocation gets its own per-pass wrappedDocs
   *    clone to avoid cache prefix mutation (B 反洞察 #3).
   * 3. `passCrossLink` (commit 5) — single LLM call returns insertion
   *    positions; service injects `[[link]]` markers and re-hashes bodies.
   *
   * Commit 4 lands steps 1 + 2 + a TODO for step 3. Until commit 5 lands,
   * MULTI mode throws at the end of section-fill rather than committing
   * a half-baked diff. SINGLE mode remains the production default.
   */
  private async runMultiMode(params: {
    recordUserId: string;
    chatUserId: string;
    knowledgeBaseId: string;
    documentIds: string[];
    wrappedDocs: string[];
    currentIndex: Array<{
      slug: string;
      title: string;
      category: string;
      oneLiner: string;
    }>;
    allowedDocumentIds: Set<string>;
    baselineHash: string;
    ingestOutlineMaxPages: number;
    ingestSectionConcurrency: number;
    ingestSectionFailureToleranceRatio: number;
  }): Promise<WikiDiff> {
    const {
      chatUserId,
      knowledgeBaseId,
      wrappedDocs,
      currentIndex,
      ingestOutlineMaxPages,
      ingestSectionConcurrency,
      ingestSectionFailureToleranceRatio,
    } = params;

    const breaker = new WikiIngestCircuitBreaker();
    const draftSessionId = randomUUID();

    // Pass 1: outline.
    const outlineResult = await this.passOutline({
      knowledgeBaseId,
      chatUserId,
      currentIndex,
      wrappedDocs,
      breaker,
    });

    // Truncate creates to ingestOutlineMaxPages — protects BYOK budget when
    // the LLM over-produces pages (e.g. one page per paragraph).
    let outlineTruncated = 0;
    if (outlineResult.outline.creates.length > ingestOutlineMaxPages) {
      outlineTruncated =
        outlineResult.outline.creates.length - ingestOutlineMaxPages;
      this.logger.warn(
        `[ingest] kb=${knowledgeBaseId} outline produced ${outlineResult.outline.creates.length} > limit ${ingestOutlineMaxPages}, truncating ${outlineTruncated}`,
      );
      outlineResult.outline.creates = outlineResult.outline.creates.slice(
        0,
        ingestOutlineMaxPages,
      );
    }

    const outlineCreates = outlineResult.outline.creates.length;
    const outlineUpdates = outlineResult.outline.updates.length;
    const outlineDeletes = outlineResult.outline.deletes.length;

    // Pass 2: section-fill (parallel, fail-tolerant).
    const sectionResult = await this.passSectionFill({
      knowledgeBaseId,
      chatUserId,
      outline: outlineResult.outline,
      wrappedDocs,
      breaker,
      draftSessionId,
      concurrency: ingestSectionConcurrency,
      failureToleranceRatio: ingestSectionFailureToleranceRatio,
    });

    // If section-fill produced zero successful pages but had updates +
    // deletes from the outline, we can still ship a deletes-only diff.
    // Otherwise (no successes AND no deletes/updates) there's nothing to
    // commit — fail-closed.
    const hasAnyContent =
      sectionResult.successful.length > 0 ||
      outlineResult.outline.deletes.length > 0;
    if (!hasAnyContent) {
      this.logger.warn(
        `[ingest] kb=${knowledgeBaseId} MULTI mode produced no committable items (0 successful section-fills, 0 deletes)`,
      );
      throw new BadRequestException(
        "Wiki ingest produced no committable pages; please retry",
      );
    }

    // Pass 3: cross-link (fail-closed — a missing crosslink pass means we
    // ship pages without `[[link]]` stitching, which is worse than retry).
    const crosslink = await this.passCrossLink({
      knowledgeBaseId,
      chatUserId,
      pages: sectionResult.successful,
      currentIndex,
      breaker,
    });

    // Merge: section bodies + crosslink insertions + outline updates/deletes
    // → WikiDiffItems-shaped raw object that softDropAndPersist consumes.
    const merged = this.mergeIntoWikiDiffItems({
      outline: outlineResult.outline,
      successful: sectionResult.successful,
      crosslink,
    });

    const multiPassMetrics: WikiMultiPassMetrics = {
      outlineCreates,
      outlineUpdates,
      outlineDeletes,
      outlineTruncated,
      sectionFillSuccessful: sectionResult.successful.length,
      sectionFillFailed: sectionResult.failedSlugs.length,
      sectionFillFailedSlugs: sectionResult.failedSlugs,
      crosslinkInsertions: merged.totalInsertions,
      partial: sectionResult.failedSlugs.length > 0,
    };
    this.logger.log(
      `[ingest] kb=${knowledgeBaseId} MULTI mode merged: creates=${merged.items.creates.length} updates=${merged.items.updates.length} deletes=${merged.items.deletes.length} insertions=${merged.totalInsertions} partial=${multiPassMetrics.partial}`,
    );

    return this.softDropAndPersist({
      rawItems: merged.items,
      allowedDocumentIds: params.allowedDocumentIds,
      knowledgeBaseId,
      recordUserId: params.recordUserId,
      baselineHash: params.baselineHash,
      passMode: WikiIngestPassMode.MULTI,
      multiPassMetrics,
    });
  }

  // ─── Multi-pass building blocks ────────────────────────────────────────────

  /**
   * Outline pass — single LLM call returns the planned shape of the diff.
   *
   * Force-regenerates `translationGroupId` server-side: the LLM emits a
   * free-form `groupLabel` (e.g. "NVIDIA Blackwell GPU") and the service
   * dedups labels then assigns a fresh `crypto.randomUUID()` per unique
   * group. Any UUID the LLM happens to mint is IGNORED (BLOCKER C7 of the
   * 2026-05-12 consensus — LLMs reliably hallucinate UUIDs and re-emit ones
   * seen in earlier context).
   */
  private async passOutline(params: {
    knowledgeBaseId: string;
    chatUserId: string;
    currentIndex: Array<{
      slug: string;
      title: string;
      category: string;
      oneLiner: string;
    }>;
    wrappedDocs: string[];
    breaker: WikiIngestCircuitBreaker;
  }): Promise<{
    outline: WikiOutline;
    groupIdsBySlug: Map<string, string>;
  }> {
    const { knowledgeBaseId, chatUserId, currentIndex, wrappedDocs, breaker } =
      params;

    if (breaker.isOutlineBlocked()) {
      throw new BadRequestException(
        "Wiki ingest outline pass circuit-breaker tripped; please retry later",
      );
    }

    const skillDef = await this.skillLoader.getSkillById("wiki-ingest-outline");
    if (!skillDef) {
      this.logger.error(
        "[ingest] wiki-ingest-outline skill not found in SkillLoader",
      );
      throw new BadRequestException(
        "Wiki ingest outline skill is not available; please retry",
      );
    }
    const systemPrompt = skillDef.content;
    // Per-pass wrappedDocs slice — defensive clone so a later pass cannot
    // mutate this prefix and break Anthropic prompt-cache hits (B 反洞察 #3).
    const passDocs = wrappedDocs.slice();
    const userPrompt = this.buildUserPrompt(currentIndex, passDocs);

    let response: Awaited<ReturnType<typeof this.chat.chat>>;
    try {
      response = await this.chat.chat({
        messages: [{ role: "user", content: userPrompt }],
        systemPrompt,
        modelType: AIModelType.CHAT,
        taskProfile: {
          creativity: "deterministic",
          // outputLength stays 'long' (8K) per BLOCKER #1 — BYOK provider
          // ceilings (gpt-4o / Claude Sonnet thinking-off / Grok-2 all 8192)
          // make 'extended' unsafe across the user base.
          outputLength: "long",
        },
        responseFormat: "json_object",
        operationName: "library-wiki-ingest-outline",
        userId: chatUserId,
      });
    } catch (error) {
      breaker.recordOutlineFailure();
      this.logger.error(
        `[ingest:outline] LLM call failed kb=${knowledgeBaseId}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      throw new BadRequestException(
        "Wiki ingest outline LLM call failed; please retry",
      );
    }

    const rawJson = this.extractJson(response.content);
    const parsed = WikiOutlineSchema.safeParse(rawJson);
    if (!parsed.success) {
      breaker.recordOutlineFailure();
      this.logger.warn(
        `[ingest:outline] schema validation failed kb=${knowledgeBaseId}: ${parsed.error.message.slice(0, 200)}`,
      );
      throw new BadRequestException(
        "Wiki ingest outline output failed schema validation; please retry",
      );
    }
    const outline = parsed.data;

    // Service-side groupLabel → crypto.randomUUID() rewrite (BLOCKER C7).
    // Dedup labels case-insensitively + trimmed so cosmetic variants
    // ("NVIDIA Blackwell" vs " nvidia blackwell ") still share one group.
    const labelToGroupId = new Map<string, string>();
    const groupIdsBySlug = new Map<string, string>();
    for (const create of outline.creates) {
      const labelKey = create.groupLabel.trim().toLowerCase();
      let groupId = labelToGroupId.get(labelKey);
      if (!groupId) {
        groupId = randomUUID();
        labelToGroupId.set(labelKey, groupId);
      }
      groupIdsBySlug.set(create.slug, groupId);
    }
    this.logger.log(
      `[ingest:outline] kb=${knowledgeBaseId} creates=${outline.creates.length} updates=${outline.updates.length} deletes=${outline.deletes.length} groups=${labelToGroupId.size}`,
    );

    return { outline, groupIdsBySlug };
  }

  /**
   * Section-fill pass — N parallel LLM calls, one per page from the outline.
   *
   * Uses p-limit to cap concurrency at `ingestSectionConcurrency` (BLOCKER
   * B3: pure parallelism would torch the BYOK provider TPM/RPM budget on
   * its first run). Each call is independent + stateless; a single failure
   * just removes that slug from the diff without aborting the rest
   * (BLOCKER B2 partial-progress).
   *
   * Each successful page is upserted to WikiIngestDraft so a mid-pass
   * crash can recover already-completed work on the next attempt.
   */
  private async passSectionFill(params: {
    knowledgeBaseId: string;
    chatUserId: string;
    outline: WikiOutline;
    wrappedDocs: string[];
    breaker: WikiIngestCircuitBreaker;
    draftSessionId: string;
    concurrency: number;
    failureToleranceRatio: number;
  }): Promise<{
    successful: WikiSectionFill[];
    failedSlugs: string[];
  }> {
    const {
      knowledgeBaseId,
      chatUserId,
      outline,
      wrappedDocs,
      breaker,
      draftSessionId,
      concurrency,
      failureToleranceRatio,
    } = params;

    const skillDef = await this.skillLoader.getSkillById("wiki-ingest-section");
    if (!skillDef) {
      this.logger.error(
        "[ingest] wiki-ingest-section skill not found in SkillLoader",
      );
      throw new BadRequestException(
        "Wiki ingest section skill is not available; please retry",
      );
    }
    const systemPrompt = skillDef.content;

    // Build the per-page work list. Each entry is independent; we run them
    // through a p-limit gate so the LLM provider sees ≤ `concurrency` in
    // flight at any instant (deliberate throttle, NOT a retry loop).
    type SectionTask = {
      slug: string;
      kind: "create" | "update";
      item: WikiOutlineCreateItem | WikiOutlineUpdateItem;
    };
    const tasks: SectionTask[] = [
      ...outline.creates.map<SectionTask>((c) => ({
        slug: c.slug,
        kind: "create",
        item: c,
      })),
      ...outline.updates.map<SectionTask>((u) => ({
        slug: u.slug,
        kind: "update",
        item: u,
      })),
    ];
    const total = tasks.length;

    if (total === 0) {
      return { successful: [], failedSlugs: [] };
    }

    const limit = pLimit(Math.max(1, concurrency));
    const successful: WikiSectionFill[] = [];
    const failedSlugs: string[] = [];

    await Promise.all(
      tasks.map((task) =>
        limit(async () => {
          // Skip slugs that have already tripped the per-slug breaker; protects
          // BYOK budget against pathological inputs that fail deterministically.
          if (breaker.isSectionBlocked(task.slug)) {
            failedSlugs.push(task.slug);
            return;
          }

          // Per-pass wrappedDocs clone — protect Anthropic prompt-cache prefix
          // from mutation across parallel pages (B 反洞察 #3).
          const passDocs = wrappedDocs.slice();
          const userPrompt = this.buildSectionFillUserPrompt(task, passDocs);

          let response: Awaited<ReturnType<typeof this.chat.chat>>;
          try {
            response = await this.chat.chat({
              messages: [{ role: "user", content: userPrompt }],
              systemPrompt,
              modelType: AIModelType.CHAT,
              taskProfile: {
                creativity: "deterministic",
                outputLength: "long",
              },
              responseFormat: "json_object",
              operationName: "library-wiki-ingest-section",
              userId: chatUserId,
            });
          } catch (error) {
            breaker.recordSectionFailure(task.slug);
            this.logger.warn(
              `[ingest:section] kb=${knowledgeBaseId} slug=${task.slug} LLM call failed: ${
                error instanceof Error ? error.message : String(error)
              }`,
            );
            failedSlugs.push(task.slug);
            return;
          }

          const rawJson = this.extractJson(response.content);
          const parsed = WikiSectionFillSchema.safeParse(rawJson);
          if (!parsed.success) {
            breaker.recordSectionFailure(task.slug);
            this.logger.warn(
              `[ingest:section] kb=${knowledgeBaseId} slug=${task.slug} schema validation failed: ${parsed.error.message.slice(0, 200)}`,
            );
            failedSlugs.push(task.slug);
            return;
          }
          const section = parsed.data;
          if (section.slug !== task.slug) {
            breaker.recordSectionFailure(task.slug);
            this.logger.warn(
              `[ingest:section] kb=${knowledgeBaseId} slug mismatch: outline=${task.slug} llm=${section.slug}`,
            );
            failedSlugs.push(task.slug);
            return;
          }
          // Section-fill explicit failure protocol: skill md says "return
          // empty body + empty sources to signal cannot-write". Treat as a
          // failure so the outer threshold + partial-progress logic kicks in.
          if (section.body.trim().length === 0) {
            breaker.recordSectionFailure(task.slug);
            this.logger.warn(
              `[ingest:section] kb=${knowledgeBaseId} slug=${task.slug} empty-body signal — counting as failure`,
            );
            failedSlugs.push(task.slug);
            return;
          }

          successful.push(section);

          // Partial-progress checkpoint (BLOCKER B2). Upsert by
          // (diffSessionId, slug, locale) so a retry replaces an earlier
          // attempt instead of creating duplicates. `locale` defaults to
          // 'zh' until P3 multi-locale ships.
          try {
            await this.prisma.wikiIngestDraft.upsert({
              where: {
                diffSessionId_pageSlug_locale: {
                  diffSessionId: draftSessionId,
                  pageSlug: task.slug,
                  locale: "zh",
                },
              },
              create: {
                knowledgeBaseId,
                diffSessionId: draftSessionId,
                pageSlug: task.slug,
                locale: "zh",
                body: section as unknown as Prisma.InputJsonValue,
              },
              update: {
                body: section as unknown as Prisma.InputJsonValue,
              },
            });
          } catch (error) {
            // Draft checkpoint is best-effort recovery. A persist failure
            // here does NOT invalidate the section content — log and move on.
            this.logger.warn(
              `[ingest:section] kb=${knowledgeBaseId} slug=${task.slug} draft upsert failed (non-fatal): ${
                error instanceof Error ? error.message : String(error)
              }`,
            );
          }
        }),
      ),
    );

    // Failure-tolerance gate (BLOCKER B2).
    const failureRatio = failedSlugs.length / total;
    if (failureRatio > failureToleranceRatio) {
      this.logger.warn(
        `[ingest:section] kb=${knowledgeBaseId} failure ratio ${failureRatio.toFixed(2)} exceeds tolerance ${failureToleranceRatio} (failed ${failedSlugs.length}/${total})`,
      );
      throw new BadRequestException(
        `Wiki ingest section-fill failed too often (${failedSlugs.length}/${total} pages); please retry`,
      );
    }
    if (failedSlugs.length > 0) {
      this.logger.warn(
        `[ingest:section] kb=${knowledgeBaseId} partial success: ${successful.length}/${total} pages; failed slugs: ${failedSlugs.join(", ")}`,
      );
    } else {
      this.logger.log(
        `[ingest:section] kb=${knowledgeBaseId} all ${total} pages filled successfully`,
      );
    }

    return { successful, failedSlugs };
  }

  /**
   * Cross-link pass — single LLM call returns insertion positions per page.
   *
   * Fail-closed: any LLM error / schema validation failure aborts the whole
   * diff. The skill prompt allows empty `insertions: []` arrays so the LLM
   * can return "no good cross-links to suggest" without erroring; a true
   * call failure means we'd ship pages without stitching, which is worse
   * than retry.
   *
   * Service-side validation on top of zod:
   *  - linkSlug MUST exist in linkableSlugs (slugs the diff produces or
   *    existing pages in the wiki index). Out-of-set links are dropped
   *    rather than failing the whole diff.
   *  - position MUST be within [0, body.length]. Out-of-range positions
   *    are dropped.
   *  - The skill asks the LLM to avoid code blocks / inline code / existing
   *    `[[...]]` links / Sources sections. We do NOT re-validate those zones
   *    here (would require a markdown parser); the prompt is the primary
   *    guard.
   */
  private async passCrossLink(params: {
    knowledgeBaseId: string;
    chatUserId: string;
    pages: WikiSectionFill[];
    currentIndex: Array<{
      slug: string;
      title: string;
      category: string;
      oneLiner: string;
    }>;
    breaker: WikiIngestCircuitBreaker;
  }): Promise<WikiCrosslink> {
    const { knowledgeBaseId, chatUserId, pages, currentIndex, breaker } =
      params;

    if (breaker.isCrosslinkBlocked()) {
      throw new BadRequestException(
        "Wiki ingest crosslink pass circuit-breaker tripped; please retry later",
      );
    }

    // If there are no fresh pages and no existing pages to link to, skip
    // the LLM call entirely — empty insertions are a no-op.
    if (pages.length === 0) {
      return { pages: [] };
    }

    const skillDef = await this.skillLoader.getSkillById(
      "wiki-ingest-crosslink",
    );
    if (!skillDef) {
      this.logger.error(
        "[ingest] wiki-ingest-crosslink skill not found in SkillLoader",
      );
      throw new BadRequestException(
        "Wiki ingest crosslink skill is not available; please retry",
      );
    }
    const systemPrompt = skillDef.content;

    // Build the linkable slug set: every page just written this cycle, plus
    // every slug already in the wiki index. The LLM may link to any of
    // these; everything else is dropped post-parse.
    const linkableSlugs = new Set<string>([
      ...pages.map((p) => p.slug),
      ...currentIndex.map((p) => p.slug),
    ]);

    const userPrompt = this.buildCrossLinkUserPrompt(pages, linkableSlugs);

    let response: Awaited<ReturnType<typeof this.chat.chat>>;
    try {
      response = await this.chat.chat({
        messages: [{ role: "user", content: userPrompt }],
        systemPrompt,
        modelType: AIModelType.CHAT,
        taskProfile: {
          creativity: "deterministic",
          outputLength: "long",
        },
        responseFormat: "json_object",
        operationName: "library-wiki-ingest-crosslink",
        userId: chatUserId,
      });
    } catch (error) {
      breaker.recordCrosslinkFailure();
      this.logger.error(
        `[ingest:crosslink] LLM call failed kb=${knowledgeBaseId}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      throw new BadRequestException(
        "Wiki ingest crosslink LLM call failed; please retry",
      );
    }

    const rawJson = this.extractJson(response.content);
    const parsed = WikiCrosslinkSchema.safeParse(rawJson);
    if (!parsed.success) {
      breaker.recordCrosslinkFailure();
      this.logger.warn(
        `[ingest:crosslink] schema validation failed kb=${knowledgeBaseId}: ${parsed.error.message.slice(0, 200)}`,
      );
      throw new BadRequestException(
        "Wiki ingest crosslink output failed schema validation; please retry",
      );
    }

    // Service-layer drop pass: any insertion whose linkSlug is not in the
    // linkable set is dropped. We do NOT throw — a single bad slug should
    // not invalidate the entire diff (same three-prong logic as sources).
    let droppedInsertions = 0;
    const pageBySlug = new Map(pages.map((p) => [p.slug, p]));
    for (const pageInserts of parsed.data.pages) {
      const target = pageBySlug.get(pageInserts.slug);
      const bodyLen = target?.body.length ?? 0;
      pageInserts.insertions = pageInserts.insertions.filter((ins) => {
        if (!linkableSlugs.has(ins.linkSlug)) {
          droppedInsertions += 1;
          return false;
        }
        if (ins.position < 0 || ins.position > bodyLen) {
          droppedInsertions += 1;
          return false;
        }
        return true;
      });
    }
    if (droppedInsertions > 0) {
      this.logger.warn(
        `[ingest:crosslink] kb=${knowledgeBaseId} dropped ${droppedInsertions} invalid insertion(s) (unknown slug or out-of-range position)`,
      );
    }

    return parsed.data;
  }

  /**
   * Merge outline + section-fill outputs + crosslink insertions into a raw
   * WikiDiffItems shape ready for `softDropAndPersist`.
   *
   * Insertion algorithm (BLOCKER consensus §P2 commit 5):
   *  - sort insertions by `position` descending so earlier inserts do not
   *    shift later positions (classic splice-from-end pattern).
   *  - build the link text as `[[slug]]` or `[[slug|surfaceText]]`.
   *  - splice into body via `body.slice(0, pos) + linkText + body.slice(pos)`.
   *
   * UPDATEs from the outline are emitted as `updates[]` entries; section-fill
   * may or may not have produced a body for them (in our current flow it
   * always does, but we guard anyway). DELETEs pass through verbatim.
   */
  private mergeIntoWikiDiffItems(params: {
    outline: WikiOutline;
    successful: WikiSectionFill[];
    crosslink: WikiCrosslink;
  }): {
    items: {
      creates: Array<{
        slug: string;
        title: string;
        category: string;
        body: string;
        oneLiner: string;
        sources: WikiSectionFill["sources"];
      }>;
      updates: Array<{
        slug: string;
        newBody: string;
        newOneLiner?: string;
        sources?: WikiSectionFill["sources"];
      }>;
      deletes: string[];
    };
    totalInsertions: number;
  } {
    const { outline, successful, crosslink } = params;

    // Index for quick lookup.
    const sectionBySlug = new Map(successful.map((s) => [s.slug, s]));
    const insertionsBySlug = new Map<string, WikiCrosslinkInsertion[]>(
      crosslink.pages.map((p) => [p.slug, p.insertions]),
    );

    let totalInsertions = 0;

    const applyInsertions = (
      body: string,
      insertions: WikiCrosslinkInsertion[],
    ): string => {
      if (insertions.length === 0) return body;
      // Sort descending by position so each splice does not shift later
      // positions. Clamp position to [0, body.length] defensively (already
      // filtered in passCrossLink but be paranoid).
      const sorted = [...insertions].sort((a, b) => b.position - a.position);
      let out = body;
      for (const ins of sorted) {
        const pos = Math.max(0, Math.min(out.length, ins.position));
        const linkText = ins.surfaceText
          ? `[[${ins.linkSlug}|${ins.surfaceText}]]`
          : `[[${ins.linkSlug}]]`;
        out = out.slice(0, pos) + linkText + out.slice(pos);
        totalInsertions += 1;
      }
      return out;
    };

    // CREATES: outline supplies title/category, section-fill supplies
    // body/oneLiner/sources, crosslink supplies insertions.
    const creates: Array<{
      slug: string;
      title: string;
      category: string;
      body: string;
      oneLiner: string;
      sources: WikiSectionFill["sources"];
    }> = [];
    for (const create of outline.creates) {
      const section = sectionBySlug.get(create.slug);
      if (!section) continue; // section-fill failed for this slug; skip
      const insertions = insertionsBySlug.get(create.slug) ?? [];
      const body = applyInsertions(section.body, insertions);
      creates.push({
        slug: create.slug,
        title: create.title,
        category: create.category,
        body,
        oneLiner: section.oneLiner,
        sources: section.sources,
      });
    }

    // UPDATES: outline supplies slug, section-fill supplies newBody/oneLiner/
    // sources, crosslink supplies insertions.
    const updates: Array<{
      slug: string;
      newBody: string;
      newOneLiner?: string;
      sources?: WikiSectionFill["sources"];
    }> = [];
    for (const update of outline.updates) {
      const section = sectionBySlug.get(update.slug);
      if (!section) continue; // section-fill failed; skip
      const insertions = insertionsBySlug.get(update.slug) ?? [];
      const newBody = applyInsertions(section.body, insertions);
      updates.push({
        slug: update.slug,
        newBody,
        newOneLiner: section.oneLiner,
        sources: section.sources,
      });
    }

    return {
      items: {
        creates,
        updates,
        deletes: outline.deletes.slice(),
      },
      totalInsertions,
    };
  }

  // ─── Shared persistence path (used by SINGLE + MULTI) ─────────────────────

  /**
   * Pre-clean + zod validate + persist a WikiDiff. Extracted so SINGLE and
   * MULTI modes share the same soft-drop / oneLiner-trim / affectedKeys /
   * metrics logic. Mutates `rawItems` in place via the same logic that
   * lived inline in the original ingestInternal.
   */
  private async softDropAndPersist(params: {
    rawItems: unknown;
    allowedDocumentIds: Set<string>;
    knowledgeBaseId: string;
    recordUserId: string;
    baselineHash: string;
    passMode: WikiIngestPassMode;
    multiPassMetrics: WikiMultiPassMetrics | null;
  }): Promise<WikiDiff> {
    const {
      rawItems,
      allowedDocumentIds,
      knowledgeBaseId,
      recordUserId,
      baselineHash,
      passMode,
      multiPassMetrics,
    } = params;

    // Pre-clean: drop sources that fail any of the 4 source-schema invariants
    // (one bad cite must not 400 the whole diff — per feedback_llm_id_must_be_
    // in_prompt_and_whitelist three-prong rule: prompt explicit + service soft-
    // drop + zod is last-resort net). Mutates the parsed JSON in place; zod
    // runs after to enforce the rest of the shape.
    let droppedSources = 0;
    const droppedByReason = {
      notObject: 0,
      unknownDoc: 0,
      spanInvalid: 0,
      quoteInvalid: 0,
    };
    let totalSourcesSeen = 0;
    let truncatedOneLiners = 0;
    if (rawItems && typeof rawItems === "object" && !Array.isArray(rawItems)) {
      const obj = rawItems as Record<string, unknown>;
      const filterArr = (arr: unknown[]) => {
        for (const it of arr) {
          if (it && typeof it === "object" && "sources" in it) {
            const sources = (it as { sources?: unknown }).sources;
            if (Array.isArray(sources)) {
              totalSourcesSeen += sources.length;
              const kept = sources.filter((s) => {
                if (!s || typeof s !== "object") {
                  droppedSources += 1;
                  droppedByReason.notObject += 1;
                  return false;
                }
                const o = s as Record<string, unknown>;
                // documentId: must be a known id in the supplied whitelist
                if (
                  typeof o.documentId !== "string" ||
                  !allowedDocumentIds.has(o.documentId)
                ) {
                  droppedSources += 1;
                  droppedByReason.unknownDoc += 1;
                  return false;
                }
                // spanStart / spanEnd: required non-negative integers with
                // spanStart <= spanEnd (LLMs frequently omit these or emit
                // floats / negatives — drop rather than blow up zod).
                if (
                  typeof o.spanStart !== "number" ||
                  !Number.isInteger(o.spanStart) ||
                  o.spanStart < 0
                ) {
                  droppedSources += 1;
                  droppedByReason.spanInvalid += 1;
                  return false;
                }
                if (
                  typeof o.spanEnd !== "number" ||
                  !Number.isInteger(o.spanEnd) ||
                  o.spanEnd < o.spanStart
                ) {
                  droppedSources += 1;
                  droppedByReason.spanInvalid += 1;
                  return false;
                }
                // quote: required 1-2000 char string
                if (
                  typeof o.quote !== "string" ||
                  o.quote.length < 1 ||
                  o.quote.length > 2000
                ) {
                  droppedSources += 1;
                  droppedByReason.quoteInvalid += 1;
                  return false;
                }
                return true;
              });
              (it as { sources: unknown[] }).sources = kept;
            }
          }
        }
      };
      if (Array.isArray(obj.creates)) filterArr(obj.creates);
      if (Array.isArray(obj.updates)) filterArr(obj.updates);

      // Soft-truncate oneLiner / newOneLiner to schema max (280) instead of
      // letting one bloated summary 400 the entire diff. Same three-prong
      // logic as sources: prompt says "≤ 280", service trims defensively,
      // zod is the last-resort net (per
      // feedback_llm_id_must_be_in_prompt_and_whitelist).
      const trimOneLiner = (
        arr: unknown[],
        field: "oneLiner" | "newOneLiner",
      ) => {
        for (const it of arr) {
          if (!it || typeof it !== "object") continue;
          const o = it as Record<string, unknown>;
          const v = o[field];
          if (typeof v === "string" && v.length > 280) {
            o[field] = v.slice(0, 277).trimEnd() + "...";
            truncatedOneLiners += 1;
          }
        }
      };
      if (Array.isArray(obj.creates)) trimOneLiner(obj.creates, "oneLiner");
      if (Array.isArray(obj.updates)) trimOneLiner(obj.updates, "newOneLiner");
      if (truncatedOneLiners > 0) {
        this.logger.warn(
          `[ingest] kb=${knowledgeBaseId} soft-truncated ${truncatedOneLiners} oneLiner(s) over 280 chars`,
        );
      }
    }

    // If the LLM tried to cite at all but every single citation was
    // hallucinated, the diff has zero provenance — refuse it rather than
    // silently persist evidence-less changes (per v1.5.3 §11.1 sources are
    // evidence). Items that legitimately cite zero sources are still allowed.
    if (totalSourcesSeen > 0 && droppedSources === totalSourcesSeen) {
      this.logger.warn(
        `[ingest] kb=${knowledgeBaseId} rejecting diff: 100% of ${totalSourcesSeen} sources had unknown documentId`,
      );
      throw new BadRequestException(
        "LLM ingest produced no valid source citations; please retry",
      );
    }

    const validated = WikiDiffItemsSchema.safeParse(rawItems);
    if (!validated.success) {
      this.logger.warn(
        `[ingest] LLM output failed schema validation kb=${knowledgeBaseId}: ${validated.error.message.slice(0, 200)}`,
      );
      throw new BadRequestException(
        "LLM ingest output failed schema validation; please retry",
      );
    }
    const items: WikiDiffItems = validated.data;
    if (droppedSources > 0) {
      const breakdown = Object.entries(droppedByReason)
        .filter(([, n]) => n > 0)
        .map(([k, n]) => `${k}=${n}`)
        .join(", ");
      this.logger.warn(
        `[ingest] kb=${knowledgeBaseId} dropped ${droppedSources}/${totalSourcesSeen} sources (${breakdown})`,
      );
    }

    // Compute affectedKeys from validated items.
    //
    // BLOCKER C2 (2026-05-12 multi-pass-and-locale consensus): each entry
    // is `slug:locale` so the diff-apply collision check (see
    // wiki-diff.service.ts) can let two diffs touching the same slug in
    // different locales proceed concurrently — they target disjoint
    // WikiPage rows under the locale-aware unique constraint
    // ([knowledgeBaseId, slug, locale]).
    //
    // zod schema `.default('zh')` guarantees `c.locale` / `u.locale` are
    // always populated (LLM output need not include `locale` — see
    // dto/wiki-diff-items.schema.ts BLOCKER C6). The slug-only `deletes`
    // array uses the DEFAULT_WIKI_LOCALE 'zh' — this matches the
    // single-source-of-truth in wiki-diff.service.ts (parseAffectedKey
    // /makeAffectedKey). When a multi-locale `{slug, locale}` deletes
    // shape lands, update BOTH sites together.
    const affectedKeys = [
      ...new Set([
        ...items.creates.map((c) => `${c.slug}:${c.locale}`),
        ...items.updates.map((u) => `${u.slug}:${u.locale}`),
        ...items.deletes.map((s) => `${s}:zh`),
      ]),
    ];

    // Persist PENDING diff.
    const diff = await this.prisma.wikiDiff.create({
      data: {
        knowledgeBaseId,
        status: WikiDiffStatus.PENDING,
        items: items as unknown as Prisma.InputJsonValue,
        baselineHash,
        affectedKeys,
        createdByUserId: recordUserId,
      },
    });

    this.logger.log(
      `[ingest] kb=${knowledgeBaseId} diff=${diff.id} mode=${passMode} creates=${items.creates.length} updates=${items.updates.length} deletes=${items.deletes.length}`,
    );

    // P1 commit 3 — Reviewer D 建议 expose 可观测 metric so spec / future
    // E2E can gate on退场条件 without re-parsing the persisted JSON. Only
    // CREATE items contribute to body / H2 stats (UPDATE 只携带 newBody
    // delta, P1 baseline 不在 update path 衡量).
    const pages = [...items.creates];
    const avgBodyLength =
      pages.length === 0
        ? 0
        : Math.round(
            pages.reduce((s, p) => s + (p.body?.length ?? 0), 0) / pages.length,
          );
    const h2CoverageRate =
      pages.length === 0
        ? 0
        : pages.filter((p) => /^## /m.test(p.body ?? "")).length / pages.length;
    this.lastIngestMetrics = {
      truncatedOneLiners,
      droppedSources,
      totalSourcesSeen,
      droppedByReason,
      pageCount: pages.length,
      avgBodyLength,
      h2CoverageRate,
      passMode,
      multiPass: multiPassMetrics,
    };

    return diff;
  }

  /**
   * Return KB documents enriched with wiki-specific ingest state so the
   * frontend can present a professional candidate picker instead of the raw
   * RAG document list.
   */
  async listIngestCandidates(
    userId: string,
    knowledgeBaseId: string,
  ): Promise<WikiIngestCandidate[]> {
    await this.assertViewerAccessAndWikiEnabled(userId, knowledgeBaseId);

    const documents = await this.prisma.knowledgeBaseDocument.findMany({
      where: { knowledgeBaseId },
      orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }],
      select: {
        id: true,
        title: true,
        sourceType: true,
        mimeType: true,
        status: true,
        createdAt: true,
        updatedAt: true,
        processedAt: true,
        chunkCount: true,
        lastError: true,
        // metadata.pendingFetch=true marks docs whose rawContent is still
        // a "[Pending content fetch from X]" placeholder — those genuinely
        // have no text to ingest. rawContentUri is included so we can
        // recognize off-loaded content (always real) without paying the R2
        // hydrate roundtrip in this list endpoint.
        metadata: true,
        rawContentUri: true,
      },
    });

    const usageRows = await this.prisma.$queryRaw<
      Array<{
        document_id: string;
        page_reference_count: bigint;
        last_cited_at: Date | null;
      }>
    >`
      SELECT
        s.document_id,
        COUNT(DISTINCT s.page_id) AS page_reference_count,
        MAX(p.updated_at) AS last_cited_at
      FROM wiki_page_sources s
      JOIN wiki_pages p ON p.id = s.page_id
      WHERE p.knowledge_base_id = ${knowledgeBaseId}::text
      GROUP BY s.document_id
    `;

    const usageMap = new Map(
      usageRows.map((row) => [
        row.document_id,
        {
          pageReferenceCount: Number(row.page_reference_count),
          lastCitedAt: row.last_cited_at,
        },
      ]),
    );

    return documents.map((doc) => {
      const usage = usageMap.get(doc.id);
      const pageReferenceCount = usage?.pageReferenceCount ?? 0;
      const lastCitedAt = usage?.lastCitedAt ?? null;

      let ingestState: WikiIngestCandidateState;
      let recommended = false;
      let reason = "";

      // Wiki ingest only consumes `rawContent` — it does NOT consume the
      // RAG chunks or embeddings produced by the "向量化" button. So the
      // BLOCKED gate is on content availability, not on doc.status===READY
      // (which historically meant "chunking finished"). A PENDING doc with
      // real rawContent is perfectly ingestable.
      if (doc.status === "ERROR") {
        ingestState = "BLOCKED";
        reason = "Document processing failed; repair the source before ingest.";
      } else if (this.isContentPending(doc.metadata, doc.rawContentUri)) {
        ingestState = "BLOCKED";
        reason =
          "Document content has not been fetched yet from the external source.";
      } else if (pageReferenceCount === 0) {
        ingestState = "READY_NEW";
        recommended = true;
        reason = "Ready and not yet represented in the wiki.";
      } else if (lastCitedAt && doc.updatedAt > lastCitedAt) {
        ingestState = "READY_STALE";
        recommended = true;
        reason =
          "Document changed after the last wiki citation; re-ingest recommended.";
      } else {
        ingestState = "READY_COVERED";
        reason = "Already represented in current wiki pages.";
      }

      return {
        id: doc.id,
        title: doc.title,
        sourceType: doc.sourceType,
        mimeType: doc.mimeType,
        status: doc.status,
        createdAt: doc.createdAt,
        updatedAt: doc.updatedAt,
        processedAt: doc.processedAt,
        chunkCount: doc.chunkCount,
        lastError: doc.lastError,
        pageReferenceCount,
        lastCitedAt,
        ingestState,
        recommended,
        reason,
      };
    });
  }

  // ─── Internal ───

  /**
   * Detect docs whose `rawContent` is still a placeholder (e.g.
   * `[Pending content fetch from NOTION]`). These have no real text for the
   * wiki LLM to ingest, so they stay BLOCKED until the upstream fetcher
   * fills them in.
   *
   * Two signals — either is sufficient:
   *  - `metadata.pendingFetch === true` (set by the bookmark-import path
   *    in rag.controller.ts when content fetch is deferred)
   *  - rawContentUri is null AND we have no other proof of content
   *    (we don't read rawContent here to avoid the R2 hydrate roundtrip;
   *    off-loaded docs always have real content by construction)
   *
   * Off-loaded docs (`rawContentUri != null`) are always considered ready —
   * the off-load step only runs after content is materialized.
   */
  private isContentPending(
    metadata: Prisma.JsonValue,
    rawContentUri: string | null,
  ): boolean {
    if (rawContentUri) return false;
    if (
      metadata &&
      typeof metadata === "object" &&
      !Array.isArray(metadata) &&
      (metadata as Record<string, unknown>).pendingFetch === true
    ) {
      return true;
    }
    return false;
  }

  private buildUserPrompt(
    index: Array<{
      slug: string;
      title: string;
      category: string;
      oneLiner: string;
    }>,
    wrappedDocs: string[],
  ): string {
    const indexBlock =
      index.length === 0
        ? "(empty wiki — every doc will produce CREATE items)"
        : index
            .map(
              (p) =>
                `- [[${p.slug}]] (${p.category}) "${p.title}" — ${p.oneLiner}`,
            )
            .join("\n");

    return [
      "## Current wiki index",
      indexBlock,
      "",
      "## New documents to ingest",
      ...wrappedDocs,
    ].join("\n\n");
  }

  /**
   * Build the per-page user prompt for the section-fill pass.
   *
   * The skill prompt expects the page identity (slug + title + category) plus
   * the section skeleton from the outline pass, followed by the wrapped raw
   * documents the LLM may cite. `priorBody` is intentionally omitted in P2
   * commit 4 — UPDATE flows still get the slug + new skeleton; preserving
   * prior body content is a P2 commit 5 / P3 follow-up.
   */
  private buildSectionFillUserPrompt(
    task: {
      slug: string;
      kind: "create" | "update";
      item: WikiOutlineCreateItem | WikiOutlineUpdateItem;
    },
    wrappedDocs: string[],
  ): string {
    const lines: string[] = [];
    lines.push(`## Page identity`);
    lines.push(`- slug: ${task.slug}`);
    lines.push(`- kind: ${task.kind.toUpperCase()}`);
    if (task.kind === "create") {
      const item = task.item as WikiOutlineCreateItem;
      lines.push(`- title: ${item.title}`);
      lines.push(`- category: ${item.category}`);
      lines.push(`- groupLabel: ${item.groupLabel}`);
    }
    lines.push("");
    lines.push("## Section skeleton (emit these H2 headings in this order)");
    for (const heading of task.item.sectionSkeleton) {
      lines.push(`- ${heading}`);
    }
    lines.push("");
    lines.push("## Raw documents available for citation");
    lines.push(...wrappedDocs);
    return lines.join("\n");
  }

  /**
   * Build the user prompt for the cross-link pass. Lists every page produced
   * by section-fill (slug + body) plus the canonical `linkableSlugs` set so
   * the LLM only proposes links to slugs that will actually resolve.
   */
  private buildCrossLinkUserPrompt(
    pages: WikiSectionFill[],
    linkableSlugs: Set<string>,
  ): string {
    const lines: string[] = [];
    lines.push("## linkableSlugs (only link to these)");
    lines.push(...Array.from(linkableSlugs).map((s) => `- ${s}`));
    lines.push("");
    lines.push("## pages (slug + body)");
    for (const page of pages) {
      lines.push(`### ${page.slug}`);
      lines.push(page.body);
      lines.push("");
    }
    return lines.join("\n");
  }

  private extractJson(content: string): unknown {
    // LLMs sometimes wrap JSON in fenced code blocks. Strip and try parse.
    const cleaned = content
      .replace(/^```json\s*/i, "")
      .replace(/^```\s*/i, "")
      .replace(/\s*```\s*$/i, "")
      .trim();
    const match = cleaned.match(/\{[\s\S]*\}/);
    if (!match) return {};
    try {
      return JSON.parse(match[0]);
    } catch {
      return {};
    }
  }

  private async assertEditorAccessAndWikiEnabled(
    userId: string,
    knowledgeBaseId: string,
  ): Promise<void> {
    const ok = await this.kbService.hasAccess(
      knowledgeBaseId,
      userId,
      "EDITOR",
    );
    if (!ok) throw new ForbiddenException("Editor access required");
    const kb = await this.prisma.knowledgeBase.findUnique({
      where: { id: knowledgeBaseId },
      select: { wikiEnabled: true },
    });
    if (!kb) throw new NotFoundException("Knowledge base not found");
    if (!kb.wikiEnabled) {
      throw new ForbiddenException("Wiki is not enabled for this KB");
    }
  }

  private async assertViewerAccessAndWikiEnabled(
    userId: string,
    knowledgeBaseId: string,
  ): Promise<void> {
    const ok = await this.kbService.hasAccess(
      knowledgeBaseId,
      userId,
      "VIEWER",
    );
    if (!ok) throw new ForbiddenException("Viewer access required");
    const kb = await this.prisma.knowledgeBase.findUnique({
      where: { id: knowledgeBaseId },
      select: { wikiEnabled: true },
    });
    if (!kb) throw new NotFoundException("Knowledge base not found");
    if (!kb.wikiEnabled) {
      throw new ForbiddenException("Wiki is not enabled for this KB");
    }
  }
}
