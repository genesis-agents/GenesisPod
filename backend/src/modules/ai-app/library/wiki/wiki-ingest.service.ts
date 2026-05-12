import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import { AIModelType, Prisma, WikiDiff, WikiDiffStatus } from "@prisma/client";
import { PrismaService } from "../../../../common/prisma/prisma.service";
import { KnowledgeBaseService } from "../rag/services/knowledge-base.service";
import { WikiDiffService } from "./wiki-diff.service";
import { WikiDiffItemsSchema } from "./dto/wiki-diff-items.schema";
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
 *     status=PENDING and affectedSlugs computed from items
 *  7. Return diffId for subsequent /diffs/:diffId fetch + apply
 */
@Injectable()
export class WikiIngestService {
  private readonly logger = new Logger(WikiIngestService.name);

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
    const userId = recordUserId;
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
      let truncatedOneLiners = 0;
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
    const items = validated.data;
    if (droppedSources > 0) {
      const breakdown = Object.entries(droppedByReason)
        .filter(([, n]) => n > 0)
        .map(([k, n]) => `${k}=${n}`)
        .join(", ");
      this.logger.warn(
        `[ingest] kb=${knowledgeBaseId} dropped ${droppedSources}/${totalSourcesSeen} sources (${breakdown})`,
      );
    }

    // Compute affectedSlugs from validated items.
    const affectedSlugs = [
      ...new Set([
        ...items.creates.map((c) => c.slug),
        ...items.updates.map((u) => u.slug),
        ...items.deletes,
      ]),
    ];

    // Persist PENDING diff.
    const diff = await this.prisma.wikiDiff.create({
      data: {
        knowledgeBaseId,
        status: WikiDiffStatus.PENDING,
        items: items as unknown as Prisma.InputJsonValue,
        baselineHash,
        affectedSlugs,
        createdByUserId: userId,
      },
    });

    this.logger.log(
      `[ingest] kb=${knowledgeBaseId} diff=${diff.id} creates=${items.creates.length} updates=${items.updates.length} deletes=${items.deletes.length}`,
    );

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
