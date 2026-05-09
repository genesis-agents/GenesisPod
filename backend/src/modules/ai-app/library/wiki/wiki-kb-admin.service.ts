import {
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../../../../common/prisma/prisma.service";
import { KnowledgeBaseService } from "../rag/services/knowledge-base.service";

export interface WikiKbSummary {
  id: string;
  name: string;
  description: string | null;
  type: "PERSONAL" | "TEAM";
  pageCount: number;
  lastIngestAt: Date | null;
}

export interface WikiPageSearchHit {
  slug: string;
  title: string;
  oneLiner: string;
  category: string;
}

const SEARCH_REGEX = /^[\p{L}\p{N}\p{M}\s\-]+$/u;

/**
 * WikiKbAdminService — v1.5.3 P3b backend support for the KB selector,
 * wikiEnabled toggle, and wiki-internal search.
 *
 * Three endpoints (per v1.5.3 §6 + §11 v1.5.x security rules):
 *
 *  - GET /library/wiki/kbs
 *    Lists wikiEnabled KBs the user has VIEWER+ access to (server-side
 *    filtering only; frontend never sees other KBs). Excludes KBs that
 *    have wikiEnabled=false.
 *
 *  - PATCH /library/kbs/:kbId/wiki-enabled
 *    Toggles wikiEnabled. Requires KB OWNER or ADMIN role (per security
 *    P0-5: prevents EDITOR from unilaterally enabling wiki and exposing
 *    ingest payload surface). EDITOR/VIEWER → 403.
 *
 *  - GET /library/wiki/kbs/:kbId/pages/search
 *    Wiki-internal full-text search restricted to caller's KB. Path
 *    segment kbId enforces scope; service layer hasAccess + wikiEnabled
 *    double check; returns only slug/title/oneLiner/category (NOT body)
 *    to minimize data exposure surface; q regex defends ReDoS via
 *    Unicode property classes.
 */
@Injectable()
export class WikiKbAdminService {
  private readonly logger = new Logger(WikiKbAdminService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly kbService: KnowledgeBaseService,
  ) {}

  /**
   * List wikiEnabled KBs accessible to the user (VIEWER+).
   * Server-side filtering — no client-side fallback (per §11 v1.5.x).
   * Sorted by most-recently-edited wiki page (activity proxy).
   */
  async listWikiEnabledKbs(userId: string): Promise<WikiKbSummary[]> {
    const userKbs = await this.kbService.findByUser(userId);
    const wikiEnabledIds = userKbs
      .filter((kb) => (kb as { wikiEnabled?: boolean }).wikiEnabled)
      .map((kb) => kb.id);

    if (wikiEnabledIds.length === 0) return [];

    // Fetch page counts + last ingest time in parallel via raw aggregate
    const [pageCounts, ingestRows] = await Promise.all([
      this.prisma.wikiPage.groupBy({
        by: ["knowledgeBaseId"],
        where: { knowledgeBaseId: { in: wikiEnabledIds } },
        _count: { _all: true },
      }),
      this.prisma.wikiOperationLog.findMany({
        where: {
          knowledgeBaseId: { in: wikiEnabledIds },
          op: "INGEST",
        },
        select: { knowledgeBaseId: true, createdAt: true },
        orderBy: { createdAt: "desc" },
      }),
    ]);

    const countByKb = new Map(
      pageCounts.map((c) => [c.knowledgeBaseId, c._count._all]),
    );
    const lastIngestByKb = new Map<string, Date>();
    for (const row of ingestRows) {
      if (!lastIngestByKb.has(row.knowledgeBaseId)) {
        lastIngestByKb.set(row.knowledgeBaseId, row.createdAt);
      }
    }

    return userKbs
      .filter((kb) => wikiEnabledIds.includes(kb.id))
      .map((kb) => ({
        id: kb.id,
        name: kb.name,
        description: kb.description,
        type: kb.type as "PERSONAL" | "TEAM",
        pageCount: countByKb.get(kb.id) ?? 0,
        lastIngestAt: lastIngestByKb.get(kb.id) ?? null,
      }))
      .sort((a, b) => {
        const at = a.lastIngestAt?.getTime() ?? 0;
        const bt = b.lastIngestAt?.getTime() ?? 0;
        return bt - at;
      });
  }

  /**
   * Toggle wikiEnabled on a KB. Requires any KB access (VIEWER+) — i.e. owner,
   * any KbMember role, or platform admin (per kbService.hasAccess fallback).
   *
   * Note: 2026-05-09 product decision relaxed this from ADMIN+ to VIEWER+ —
   * shared-with-me KBs should also be wiki-enable-able. The original P0-5
   * concern (EDITOR exposing ingest surface) is mitigated downstream by
   * existing per-action checks on /ingest, /lint, /query, etc.
   *
   * On enable: upsert WikiKnowledgeBaseConfig with v1.5.3 defaults so
   * subsequent reads (query / lint / ingest) have config to consult.
   * Returns { kbId, wikiEnabled, configCreated } so the UI can flag
   * the first-time path.
   */
  async toggleWikiEnabled(
    userId: string,
    knowledgeBaseId: string,
    enabled: boolean,
  ): Promise<{
    kbId: string;
    wikiEnabled: boolean;
    configCreated: boolean;
  }> {
    const ok = await this.kbService.hasAccess(
      knowledgeBaseId,
      userId,
      "VIEWER",
    );
    if (!ok) {
      throw new ForbiddenException(
        "Need at least KB access to toggle wikiEnabled",
      );
    }

    const kb = await this.prisma.knowledgeBase.findUnique({
      where: { id: knowledgeBaseId },
      select: { id: true, wikiEnabled: true },
    });
    if (!kb) throw new NotFoundException("Knowledge base not found");

    if (kb.wikiEnabled === enabled) {
      return {
        kbId: knowledgeBaseId,
        wikiEnabled: enabled,
        configCreated: false,
      };
    }

    let configCreated = false;
    await this.prisma.$transaction(async (tx) => {
      await tx.knowledgeBase.update({
        where: { id: knowledgeBaseId },
        data: { wikiEnabled: enabled },
      });
      if (enabled) {
        const existing = await tx.wikiKnowledgeBaseConfig.findUnique({
          where: { knowledgeBaseId },
        });
        if (!existing) {
          await tx.wikiKnowledgeBaseConfig.create({
            data: { knowledgeBaseId },
          });
          configCreated = true;
        }
      }
      await tx.wikiOperationLog.create({
        data: {
          knowledgeBaseId,
          op: "EDIT",
          title: `wikiEnabled toggled to ${enabled}`,
          meta: {
            action: "toggle_wiki_enabled",
            enabled,
          } as Prisma.InputJsonValue,
          actorUserId: userId,
        },
      });
    });

    this.logger.log(
      `[toggleWikiEnabled] kb=${knowledgeBaseId} enabled=${enabled} configCreated=${configCreated} actor=${userId}`,
    );
    return {
      kbId: knowledgeBaseId,
      wikiEnabled: enabled,
      configCreated,
    };
  }

  /**
   * Wiki-internal search restricted to a single KB.
   *
   * Defense layers (per §11 v1.5.x):
   *  - kbId path segment enforced by controller; service double-checks
   *    hasAccess + wikiEnabled
   *  - q regex blocks ReDoS via Unicode property classes (linear match)
   *  - returns only metadata fields (slug/title/oneLiner/category) — no
   *    body / contentHash / sourceRefs / lastEditedBy
   */
  async searchPages(
    userId: string,
    knowledgeBaseId: string,
    query: string,
    limit: number = 20,
  ): Promise<WikiPageSearchHit[]> {
    const trimmed = query.trim();
    if (trimmed.length === 0 || trimmed.length > 200) {
      throw new ForbiddenException("Search query must be 1–200 characters");
    }
    if (!SEARCH_REGEX.test(trimmed)) {
      throw new ForbiddenException(
        "Search query contains disallowed characters",
      );
    }

    const ok = await this.kbService.hasAccess(
      knowledgeBaseId,
      userId,
      "VIEWER",
    );
    if (!ok) throw new ForbiddenException("Access denied");

    const kb = await this.prisma.knowledgeBase.findUnique({
      where: { id: knowledgeBaseId },
      select: { wikiEnabled: true },
    });
    // v1.5.3 §6: KB unknown / wikiEnabled=false returns 404 (existence
    // oracle protection)
    if (!kb || !kb.wikiEnabled) {
      throw new NotFoundException("Knowledge base not found");
    }

    const safeLimit = Math.max(1, Math.min(50, Math.floor(limit)));
    const lower = trimmed.toLowerCase();

    const pages = await this.prisma.wikiPage.findMany({
      where: {
        knowledgeBaseId,
        OR: [
          { slug: { contains: lower, mode: "insensitive" } },
          { title: { contains: trimmed, mode: "insensitive" } },
          { oneLiner: { contains: trimmed, mode: "insensitive" } },
        ],
      },
      select: {
        slug: true,
        title: true,
        oneLiner: true,
        category: true,
      },
      orderBy: { updatedAt: "desc" },
      take: safeLimit,
    });

    return pages.map((p) => ({
      slug: p.slug,
      title: p.title,
      oneLiner: p.oneLiner,
      category: p.category,
    }));
  }
}
