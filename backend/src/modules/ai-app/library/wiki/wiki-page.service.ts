import * as crypto from "crypto";
import {
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import { Prisma, WikiPage, WikiPageEditedBy } from "@prisma/client";
import { PrismaService } from "../../../../common/prisma/prisma.service";
import {
  parseMarkdownWikiLinks,
  normalizeMarkdownSlug,
  sanitizeMarkdownBody,
} from "../../../ai-engine/facade";
import { KnowledgeBaseService } from "../rag/services/knowledge-base.service";
import { CreateWikiPageDto, UpdateWikiPageDto } from "./dto/wiki-page.dto";

/**
 * P3 (2026-05-12): default locale for legacy single-locale callers. The
 * column gained a DB default of 'zh' in P3 commit 1; this constant
 * mirrors that for explicit composite-key reads where Prisma cannot
 * fall back to the column default.
 */
const DEFAULT_WIKI_LOCALE = "zh";

/**
 * WikiPageService — page CRUD, link parsing, revision writing, and revert.
 *
 * v1.5.3 P1 scope:
 *  - Body sanitization on every write (engine sanitizeMarkdownBody, double
 *    defense with frontend rehype-sanitize per §11)
 *  - [[slug]] parsing → WikiPageLink upsert (engine parseMarkdownWikiLinks)
 *  - WikiPageRevision snapshot on apply / edit / revert (3 sites per v1.4)
 *  - Revert with cross-page IDOR protection: service-layer 404 on mismatch
 *    (v1.5.3 §6 / §7.3 unified resource cross-KB IDOR semantics)
 *  - hasAccess + wikiEnabled gate enforced at every write
 */
@Injectable()
export class WikiPageService {
  private readonly logger = new Logger(WikiPageService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly kbService: KnowledgeBaseService,
  ) {}

  /** List pages by KB scope, optionally filtered by category. */
  async listPages(
    userId: string,
    knowledgeBaseId: string,
    options: { category?: WikiPage["category"]; limit?: number } = {},
  ): Promise<WikiPage[]> {
    await this.assertViewerAccess(userId, knowledgeBaseId);
    return this.prisma.wikiPage.findMany({
      where: {
        knowledgeBaseId,
        ...(options.category ? { category: options.category } : {}),
      },
      orderBy: [{ category: "asc" }, { updatedAt: "desc" }],
      take: options.limit ?? 100,
    });
  }

  /** Get single page including outbound links + backlinks. */
  async getPage(
    userId: string,
    knowledgeBaseId: string,
    slug: string,
  ): Promise<{
    page: WikiPage;
    outboundLinks: string[];
    backlinks: string[];
  }> {
    await this.assertViewerAccess(userId, knowledgeBaseId);

    // P3 (2026-05-12): unique key is now (kb, slug, locale). Existing
    // single-locale callers default to 'zh'; multi-locale-aware lookups
    // (e.g. findAllInTranslationGroup with cross-locale fallback) land
    // in a follow-up commit.
    const page = await this.prisma.wikiPage.findUnique({
      where: {
        knowledgeBaseId_slug_locale: {
          knowledgeBaseId,
          slug,
          locale: DEFAULT_WIKI_LOCALE,
        },
      },
    });
    if (!page) throw new NotFoundException("Wiki page not found");

    const [outbound, inbound] = await Promise.all([
      this.prisma.wikiPageLink.findMany({
        where: { fromPageId: page.id },
        select: { toSlug: true },
      }),
      this.prisma.wikiPageLink.findMany({
        where: {
          toSlug: page.slug,
          fromPage: { knowledgeBaseId },
        },
        select: { fromPage: { select: { slug: true } } },
      }),
    ]);

    return {
      page,
      outboundLinks: outbound.map((l) => l.toSlug),
      backlinks: inbound.map((l) => l.fromPage.slug),
    };
  }

  /** Create a new page (manual user creation; ingest path goes through diff apply). */
  async createPage(
    userId: string,
    knowledgeBaseId: string,
    dto: CreateWikiPageDto,
  ): Promise<WikiPage> {
    await this.assertEditorAccessAndWikiEnabled(userId, knowledgeBaseId);

    // Defense in depth: even though DTO validates slug regex, run normalize
    // so that downstream consumers see a canonical form.
    const slug = normalizeMarkdownSlug(dto.slug);
    if (slug !== dto.slug) {
      throw new ForbiddenException(
        "slug must already be in canonical normalized form",
      );
    }

    const sanitizedBody = sanitizeMarkdownBody(dto.body).body;
    const contentHash = this.hashBody(sanitizedBody);

    const page = await this.prisma.$transaction(async (tx) => {
      const created = await tx.wikiPage.create({
        data: {
          knowledgeBaseId,
          slug,
          title: dto.title,
          category: dto.category,
          body: sanitizedBody,
          oneLiner: dto.oneLiner,
          contentHash,
          lastEditedBy: WikiPageEditedBy.USER,
        },
      });

      await this.replaceOutboundLinks(tx, created.id, sanitizedBody);

      return created;
    });

    this.logger.log(
      `[createPage] kb=${knowledgeBaseId} slug=${slug} by user=${userId}`,
    );
    return page;
  }

  /**
   * Update page — supports two actions:
   *  - 'edit' (default): write new body/title/etc + snapshot WikiPageRevision
   *  - 'revert': restore body from a target WikiPageRevision (must belong to
   *    this page; cross-page revisionId returns 404 per v1.5.3 §6)
   */
  async updatePage(
    userId: string,
    knowledgeBaseId: string,
    slug: string,
    dto: UpdateWikiPageDto,
  ): Promise<WikiPage> {
    await this.assertEditorAccessAndWikiEnabled(userId, knowledgeBaseId);

    const action = dto.action ?? "edit";
    const current = await this.prisma.wikiPage.findUnique({
      where: {
        knowledgeBaseId_slug_locale: {
          knowledgeBaseId,
          slug,
          locale: DEFAULT_WIKI_LOCALE,
        },
      },
    });
    if (!current) throw new NotFoundException("Wiki page not found");

    if (action === "revert") {
      return this.revertPage(userId, current, dto.toRevisionId);
    }
    return this.editPage(userId, current, dto);
  }

  /** Delete a page. Cascade clears revisions / links / sources / embeddings. */
  async deletePage(
    userId: string,
    knowledgeBaseId: string,
    slug: string,
  ): Promise<void> {
    await this.assertEditorAccessAndWikiEnabled(userId, knowledgeBaseId);

    const page = await this.prisma.wikiPage.findUnique({
      where: {
        knowledgeBaseId_slug_locale: {
          knowledgeBaseId,
          slug,
          locale: DEFAULT_WIKI_LOCALE,
        },
      },
      select: { id: true },
    });
    if (!page) throw new NotFoundException("Wiki page not found");

    await this.prisma.wikiPage.delete({ where: { id: page.id } });
    this.logger.log(`[deletePage] kb=${knowledgeBaseId} slug=${slug}`);
  }

  // ─── Helpers (also used by WikiDiffService for apply transactions) ───

  /**
   * Recompute outbound links for a page after a body change.
   * Caller passes a transaction client to keep delete+insert atomic.
   */
  async replaceOutboundLinks(
    tx: Prisma.TransactionClient,
    pageId: string,
    body: string,
  ): Promise<void> {
    await tx.wikiPageLink.deleteMany({ where: { fromPageId: pageId } });
    const slugs = parseMarkdownWikiLinks(body);
    if (slugs.length === 0) return;
    await tx.wikiPageLink.createMany({
      data: slugs.map((toSlug) => ({ fromPageId: pageId, toSlug })),
      skipDuplicates: true,
    });
  }

  hashBody(body: string): string {
    return crypto.createHash("sha256").update(body, "utf8").digest("hex");
  }

  // ─── Internal ───

  private async editPage(
    _userId: string,
    current: WikiPage,
    dto: UpdateWikiPageDto,
  ): Promise<WikiPage> {
    const newBodyRaw = dto.body ?? current.body;
    const sanitizedBody = sanitizeMarkdownBody(newBodyRaw).body;
    const contentHash = this.hashBody(sanitizedBody);
    const bodyChanged = sanitizedBody !== current.body;

    return this.prisma.$transaction(async (tx) => {
      // Snapshot before edit (only when body actually changes)
      if (bodyChanged) {
        await tx.wikiPageRevision.create({
          data: {
            pageId: current.id,
            body: current.body,
            contentHash: current.contentHash,
          },
        });
      }

      const updated = await tx.wikiPage.update({
        where: { id: current.id },
        data: {
          ...(dto.title !== undefined ? { title: dto.title } : {}),
          ...(dto.category !== undefined ? { category: dto.category } : {}),
          ...(dto.oneLiner !== undefined ? { oneLiner: dto.oneLiner } : {}),
          ...(bodyChanged
            ? {
                body: sanitizedBody,
                contentHash,
                lastEditedBy: WikiPageEditedBy.USER,
              }
            : {}),
        },
      });

      if (bodyChanged) {
        await this.replaceOutboundLinks(tx, updated.id, sanitizedBody);
      }

      return updated;
    });
  }

  private async revertPage(
    _userId: string,
    current: WikiPage,
    toRevisionId: string | undefined,
  ): Promise<WikiPage> {
    if (!toRevisionId) {
      throw new NotFoundException("Revision not found");
    }
    const revision = await this.prisma.wikiPageRevision.findUnique({
      where: { id: toRevisionId },
    });
    // v1.5.3 §6: cross-page revisionId returns 404 (not 403) to defeat
    // existence oracle on revisionId
    if (!revision || revision.pageId !== current.id) {
      throw new NotFoundException("Revision not found");
    }

    const sanitizedBody = sanitizeMarkdownBody(revision.body).body;
    const contentHash = this.hashBody(sanitizedBody);

    return this.prisma.$transaction(async (tx) => {
      // Snapshot the current state before revert (so revert itself is
      // reversible; per v1.4 R2 #3 + tester edge #3)
      await tx.wikiPageRevision.create({
        data: {
          pageId: current.id,
          body: current.body,
          contentHash: current.contentHash,
        },
      });

      const updated = await tx.wikiPage.update({
        where: { id: current.id },
        data: {
          body: sanitizedBody,
          contentHash,
          lastEditedBy: WikiPageEditedBy.USER,
        },
      });

      await this.replaceOutboundLinks(tx, updated.id, sanitizedBody);

      return updated;
    });
  }

  /**
   * Read WikiKnowledgeBaseConfig for the KB. VIEWER+ access required.
   * Returns the row directly (auto-created on enable per WikiKbAdminService).
   */
  async getConfig(userId: string, knowledgeBaseId: string) {
    await this.assertViewerAccess(userId, knowledgeBaseId);
    const kb = await this.prisma.knowledgeBase.findUnique({
      where: { id: knowledgeBaseId },
      select: { wikiEnabled: true },
    });
    if (!kb) throw new NotFoundException("Knowledge base not found");
    const config = await this.prisma.wikiKnowledgeBaseConfig.findUnique({
      where: { knowledgeBaseId },
    });
    // If somehow missing (e.g. legacy KB enabled before defaults landed),
    // synthesize the schema defaults so the UI always has values to show.
    return (
      config ?? {
        knowledgeBaseId,
        inlinePageCount: 200,
        inlineTokenBudget: 500_000,
        ingestMaxTokens: 80_000,
        cronLintEnabled: true,
        cronLintDailyBudgetCalls: 50,
        // W3 v2.0 rebuild：兜底默认 ['zh']（与 migration backfill 一致）
        enabledLocales: ["zh"],
        updatedAt: new Date(),
      }
    );
  }

  /**
   * Update WikiKnowledgeBaseConfig (numeric / boolean fields). VIEWER+ access
   * required (matches the relaxed wiki-toggle policy: shared-with-me KBs
   * editable). Numeric fields clamped to safe ranges to prevent abuse.
   */
  async updateConfig(
    userId: string,
    knowledgeBaseId: string,
    patch: {
      inlinePageCount?: number;
      inlineTokenBudget?: number;
      ingestMaxTokens?: number;
      cronLintEnabled?: boolean;
      cronLintDailyBudgetCalls?: number;
      /** W3 v2.0 rebuild：KB 启用语种集合（zh / en / 二者）。controller 已过滤白名单。*/
      enabledLocales?: Array<"zh" | "en">;
    },
  ) {
    await this.assertViewerAccess(userId, knowledgeBaseId);
    const kb = await this.prisma.knowledgeBase.findUnique({
      where: { id: knowledgeBaseId },
      select: { wikiEnabled: true },
    });
    if (!kb) throw new NotFoundException("Knowledge base not found");
    if (!kb.wikiEnabled) {
      throw new ForbiddenException("Wiki is not enabled for this KB");
    }

    const clamp = (v: number | undefined, min: number, max: number) =>
      v === undefined ? undefined : Math.max(min, Math.min(max, Math.floor(v)));

    const update: Prisma.WikiKnowledgeBaseConfigUpdateInput = {};
    // Defaults match wiki.prisma schema; create branch is only hit if the
    // config row was somehow never written (upsert from a pre-existing KB).
    const create: Prisma.WikiKnowledgeBaseConfigUncheckedCreateInput = {
      knowledgeBaseId,
      inlinePageCount: 200,
      inlineTokenBudget: 500_000,
      ingestMaxTokens: 80_000,
      cronLintEnabled: true,
      cronLintDailyBudgetCalls: 50,
    };

    const ipc = clamp(patch.inlinePageCount, 1, 5_000);
    if (ipc !== undefined) {
      update.inlinePageCount = ipc;
      create.inlinePageCount = ipc;
    }
    const itb = clamp(patch.inlineTokenBudget, 10_000, 5_000_000);
    if (itb !== undefined) {
      update.inlineTokenBudget = itb;
      create.inlineTokenBudget = itb;
    }
    const imt = clamp(patch.ingestMaxTokens, 1_000, 500_000);
    if (imt !== undefined) {
      update.ingestMaxTokens = imt;
      create.ingestMaxTokens = imt;
    }
    if (patch.cronLintEnabled !== undefined) {
      update.cronLintEnabled = patch.cronLintEnabled;
      create.cronLintEnabled = patch.cronLintEnabled;
    }
    const cdb = clamp(patch.cronLintDailyBudgetCalls, 0, 5_000);
    if (cdb !== undefined) {
      update.cronLintDailyBudgetCalls = cdb;
      create.cronLintDailyBudgetCalls = cdb;
    }
    // W3 v2.0 rebuild：enabledLocales 写入。空数组拒绝（不允许"无语种"）。
    if (patch.enabledLocales !== undefined && patch.enabledLocales.length > 0) {
      // 去重 + 排序保 deterministic（'en' < 'zh' 按字典序）
      const sorted = Array.from(new Set(patch.enabledLocales)).sort();
      update.enabledLocales = { set: sorted };
      create.enabledLocales = sorted;
    }

    return this.prisma.wikiKnowledgeBaseConfig.upsert({
      where: { knowledgeBaseId },
      update,
      create,
    });
  }

  private async assertViewerAccess(
    userId: string,
    knowledgeBaseId: string,
  ): Promise<void> {
    const ok = await this.kbService.hasAccess(
      knowledgeBaseId,
      userId,
      "VIEWER",
    );
    if (!ok) {
      // v1.5.3 §7.3: no VIEWER access on the underlying KB returns the
      // generic redirect-to-guidance signal at the controller boundary;
      // service layer just throws a typed exception the controller maps.
      throw new ForbiddenException("Access denied");
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

    // v1.5.3 §11 wikiEnabled=false gate on writes
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
