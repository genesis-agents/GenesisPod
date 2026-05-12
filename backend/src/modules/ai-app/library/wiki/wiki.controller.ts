import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  NotImplementedException,
  Param,
  Patch,
  Post,
  Query,
  Request,
  UseGuards,
} from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { JwtAuthGuard } from "../../../../common/guards/jwt-auth.guard";
import type { RequestWithUser } from "../../../../common/types/express-request.types";

import { WikiPageService } from "./wiki-page.service";
import { WikiDiffService } from "./wiki-diff.service";
import { WikiIngestService } from "./wiki-ingest.service";
import { WikiLintService } from "./wiki-lint.service";
import { WikiQueryService } from "./wiki-query.service";
import {
  CreateWikiPageDto,
  ListWikiPagesQueryDto,
  UpdateWikiPageDto,
  WikiPageGetQueryDto,
} from "./dto/wiki-page.dto";
import {
  BatchPatchWikiLintFindingsDto,
  IngestWikiDto,
  PatchWikiDiffDto,
  PatchWikiLintFindingDto,
} from "./dto/wiki-diff.dto";
import { WikiLintType } from "@prisma/client";
import {
  WikiQueryRequestDto,
  WikiLintFindingsQueryDto,
} from "./dto/wiki-query.dto";

/**
 * LLM Wiki controller — 16 endpoints (v1.5.3 §6).
 *
 * Page CRUD + revert (5)            — implemented in P1 P0a-3 / P1
 * Ingest / Diff (3)                  — stubbed (P1 next iteration)
 * Query (1)                          — stubbed (P2)
 * Lint findings list / patch (2)     — stubbed (P2)
 * Export (1)                         — stubbed (P3a)
 * KB selector list / search / toggle (3) — stubbed (P3b)
 *
 * v1.5.3 §11 wikiEnabled gate + role checks are enforced inside services.
 * v1.5.3 §6 unified IDOR semantics (404 for cross-KB resource access)
 * is enforced inside services via NotFoundException.
 */
@ApiTags("LibraryWiki")
@Controller("library/wiki")
export class WikiController {
  constructor(
    private readonly pageService: WikiPageService,
    private readonly diffService: WikiDiffService,
    private readonly ingestService: WikiIngestService,
    private readonly lintService: WikiLintService,
    private readonly queryService: WikiQueryService,
  ) {}

  // ─── Pages (CRUD + revert) ───────────────────────────────────────

  @Get(":kbId/pages")
  @UseGuards(JwtAuthGuard)
  async listPages(
    @Request() req: RequestWithUser,
    @Param("kbId") kbId: string,
    @Query() query: ListWikiPagesQueryDto,
  ) {
    const userId = req.user.id;
    const pages = await this.pageService.listPages(userId, kbId, {
      category: query.category,
      limit: query.limit,
      // W3-P0 gap #2: forward locale so bilingual KBs can list zh-only / en-only
      locale: query.locale,
    });
    return { items: pages };
  }

  @Get(":kbId/pages/:slug")
  @UseGuards(JwtAuthGuard)
  async getPage(
    @Request() req: RequestWithUser,
    @Param("kbId") kbId: string,
    @Param("slug") slug: string,
    @Query() query: WikiPageGetQueryDto,
  ) {
    return this.pageService.getPage(req.user.id, kbId, slug, query.locale);
  }

  @Post(":kbId/pages")
  @HttpCode(201)
  @UseGuards(JwtAuthGuard)
  async createPage(
    @Request() req: RequestWithUser,
    @Param("kbId") kbId: string,
    @Body() dto: CreateWikiPageDto,
  ) {
    const page = await this.pageService.createPage(req.user.id, kbId, dto);
    return { page };
  }

  @Patch(":kbId/pages/:slug")
  @UseGuards(JwtAuthGuard)
  async updatePage(
    @Request() req: RequestWithUser,
    @Param("kbId") kbId: string,
    @Param("slug") slug: string,
    @Body() dto: UpdateWikiPageDto,
  ) {
    const page = await this.pageService.updatePage(
      req.user.id,
      kbId,
      slug,
      dto,
    );
    return { page };
  }

  @Delete(":kbId/pages/:slug")
  @HttpCode(204)
  @UseGuards(JwtAuthGuard)
  async deletePage(
    @Request() req: RequestWithUser,
    @Param("kbId") kbId: string,
    @Param("slug") slug: string,
  ) {
    await this.pageService.deletePage(req.user.id, kbId, slug);
  }

  // ─── Ingest / Diff ────────────────────────────────────────────────

  @Post(":kbId/ingest")
  @UseGuards(JwtAuthGuard)
  async ingest(
    @Request() req: RequestWithUser,
    @Param("kbId") kbId: string,
    @Body() dto: IngestWikiDto,
  ): Promise<{
    diff: { id: string; status: string; affectedKeys: string[] };
  }> {
    // P3 BLOCKER C2 (2026-05-12 multi-pass-and-locale consensus): the
    // diff column renamed from `affectedSlugs` to `affectedKeys` so each
    // entry can carry a `slug:locale` composite. The REST response shape
    // mirrors the column name 1:1 — frontend `WikiDiffSummary.affectedKeys`
    // consumes the same string-array payload.
    const diff = await this.ingestService.ingest(
      req.user.id,
      kbId,
      dto.documentIds,
    );
    return {
      diff: {
        id: diff.id,
        status: diff.status,
        affectedKeys: diff.affectedKeys,
      },
    };
  }

  @Get(":kbId/ingest-candidates")
  @UseGuards(JwtAuthGuard)
  async listIngestCandidates(
    @Request() req: RequestWithUser,
    @Param("kbId") kbId: string,
  ) {
    const items = await this.ingestService.listIngestCandidates(
      req.user.id,
      kbId,
    );
    return { items };
  }

  @Get(":kbId/diffs/:diffId")
  @UseGuards(JwtAuthGuard)
  async getDiff(
    @Request() req: RequestWithUser,
    @Param("kbId") kbId: string,
    @Param("diffId") diffId: string,
  ) {
    return this.diffService.getDiff(req.user.id, kbId, diffId);
  }

  @Patch(":kbId/diffs/:diffId")
  @UseGuards(JwtAuthGuard)
  async patchDiff(
    @Request() req: RequestWithUser,
    @Param("kbId") kbId: string,
    @Param("diffId") diffId: string,
    @Body() dto: PatchWikiDiffDto,
  ) {
    if (dto.action === "apply") {
      return this.diffService.applyDiff(
        req.user.id,
        kbId,
        diffId,
        dto.selectedItemIds,
        { supersedeConflictingDiffs: dto.supersedeConflictingDiffs ?? false },
      );
    }
    return this.diffService.dismissDiff(req.user.id, kbId, diffId);
  }

  // ─── Query ────────────────────────────────────────────────────────

  @Post(":kbId/query")
  @UseGuards(JwtAuthGuard)
  async query(
    @Request() req: RequestWithUser,
    @Param("kbId") kbId: string,
    @Body() dto: WikiQueryRequestDto,
  ) {
    return this.queryService.query(req.user.id, kbId, dto);
  }

  // ─── Lint ─────────────────────────────────────────────────────────

  @Post(":kbId/lint")
  @UseGuards(JwtAuthGuard)
  async runLint(@Request() req: RequestWithUser, @Param("kbId") kbId: string) {
    return this.lintService.runFullLint(req.user.id, kbId);
  }

  @Get(":kbId/lint-findings")
  @UseGuards(JwtAuthGuard)
  async listLintFindings(
    @Request() req: RequestWithUser,
    @Param("kbId") kbId: string,
    @Query() query: WikiLintFindingsQueryDto,
  ) {
    const items = await this.lintService.listFindings(req.user.id, kbId, {
      type: query.type,
      resolved:
        query.resolved === "true"
          ? true
          : query.resolved === "false"
            ? false
            : undefined,
    });
    return { items };
  }

  @Patch(":kbId/lint-findings/:id")
  @UseGuards(JwtAuthGuard)
  async patchLintFinding(
    @Request() req: RequestWithUser,
    @Param("kbId") kbId: string,
    @Param("id") id: string,
    @Body() dto: PatchWikiLintFindingDto,
  ) {
    return this.lintService.patchFinding(req.user.id, kbId, id, dto.action);
  }

  @Post(":kbId/lint-findings/batch")
  @UseGuards(JwtAuthGuard)
  async batchPatchLintFindings(
    @Request() req: RequestWithUser,
    @Param("kbId") kbId: string,
    @Body() dto: BatchPatchWikiLintFindingsDto,
  ) {
    return this.lintService.batchPatchFindings(req.user.id, kbId, dto.action, {
      ids: dto.ids,
      filterAll: dto.filterAll,
      type: dto.type as WikiLintType | undefined,
    });
  }

  // ─── Config (KB-level wiki settings) ─────────────────────────────

  @Get(":kbId/config")
  @UseGuards(JwtAuthGuard)
  async getConfig(
    @Request() req: RequestWithUser,
    @Param("kbId") kbId: string,
  ) {
    return this.pageService.getConfig(req.user.id, kbId);
  }

  @Patch(":kbId/config")
  @UseGuards(JwtAuthGuard)
  async updateConfig(
    @Request() req: RequestWithUser,
    @Param("kbId") kbId: string,
    @Body() body: Record<string, unknown>,
  ) {
    // Light-weight typed pass-through: service layer clamps each numeric
    // field and ignores unknown keys, so a plain object DTO is enough.
    const patch = {
      inlinePageCount:
        typeof body.inlinePageCount === "number"
          ? body.inlinePageCount
          : undefined,
      inlineTokenBudget:
        typeof body.inlineTokenBudget === "number"
          ? body.inlineTokenBudget
          : undefined,
      ingestMaxTokens:
        typeof body.ingestMaxTokens === "number"
          ? body.ingestMaxTokens
          : undefined,
      cronLintEnabled:
        typeof body.cronLintEnabled === "boolean"
          ? body.cronLintEnabled
          : undefined,
      cronLintDailyBudgetCalls:
        typeof body.cronLintDailyBudgetCalls === "number"
          ? body.cronLintDailyBudgetCalls
          : undefined,
      // W3 v2.0 rebuild：admin 选 KB 启用语种集合（zh / en / 二者）
      enabledLocales: Array.isArray(body.enabledLocales)
        ? (body.enabledLocales as unknown[])
            .filter((v): v is "zh" | "en" => v === "zh" || v === "en")
            .slice(0, 2)
        : undefined,
    };
    return this.pageService.updateConfig(req.user.id, kbId, patch);
  }

  // ─── Export (stub — P3a server-side tarball; client-side md export
  //     is handled in the frontend by joining listPages + getPage)
  // ─────────────────────────────────────────

  @Post(":kbId/export")
  @UseGuards(JwtAuthGuard)
  async export(@Request() _req: RequestWithUser, @Param("kbId") _kbId: string) {
    throw new NotImplementedException(
      "Server-side wiki tarball export is not yet implemented; the UI " +
        "exports as concatenated markdown client-side via listPages + getPage.",
    );
  }
}
