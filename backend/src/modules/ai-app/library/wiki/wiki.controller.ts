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
import {
  CreateWikiPageDto,
  ListWikiPagesQueryDto,
  UpdateWikiPageDto,
} from "./dto/wiki-page.dto";
import {
  IngestWikiDto,
  PatchWikiDiffDto,
  PatchWikiLintFindingDto,
} from "./dto/wiki-diff.dto";

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
  constructor(private readonly pageService: WikiPageService) {}

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
    });
    return { items: pages };
  }

  @Get(":kbId/pages/:slug")
  @UseGuards(JwtAuthGuard)
  async getPage(
    @Request() req: RequestWithUser,
    @Param("kbId") kbId: string,
    @Param("slug") slug: string,
  ) {
    return this.pageService.getPage(req.user.id, kbId, slug);
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

  // ─── Ingest / Diff (stubs — wiring in P1 next iteration) ─────────

  @Post(":kbId/ingest")
  @UseGuards(JwtAuthGuard)
  async ingest(
    @Request() _req: RequestWithUser,
    @Param("kbId") _kbId: string,
    @Body() _dto: IngestWikiDto,
  ): Promise<{ diffId: string }> {
    throw new NotImplementedException(
      "Wiki ingest is not yet implemented (v1.5.3 P1 next iteration)",
    );
  }

  @Get(":kbId/diffs/:diffId")
  @UseGuards(JwtAuthGuard)
  async getDiff(
    @Request() _req: RequestWithUser,
    @Param("kbId") _kbId: string,
    @Param("diffId") _diffId: string,
  ) {
    throw new NotImplementedException(
      "Wiki diff inspection is not yet implemented",
    );
  }

  @Patch(":kbId/diffs/:diffId")
  @UseGuards(JwtAuthGuard)
  async patchDiff(
    @Request() _req: RequestWithUser,
    @Param("kbId") _kbId: string,
    @Param("diffId") _diffId: string,
    @Body() _dto: PatchWikiDiffDto,
  ) {
    throw new NotImplementedException(
      "Wiki diff apply/dismiss is not yet implemented",
    );
  }

  // ─── Query (stub — P2) ───────────────────────────────────────────

  @Post(":kbId/query")
  @UseGuards(JwtAuthGuard)
  async query(
    @Request() _req: RequestWithUser,
    @Param("kbId") _kbId: string,
    @Body() _payload: unknown,
  ) {
    throw new NotImplementedException(
      "Wiki query is not yet implemented (v1.5.3 P2)",
    );
  }

  // ─── Lint (stubs — P2) ───────────────────────────────────────────

  @Post(":kbId/lint")
  @UseGuards(JwtAuthGuard)
  async runLint(
    @Request() _req: RequestWithUser,
    @Param("kbId") _kbId: string,
  ) {
    throw new NotImplementedException(
      "Wiki lint trigger is not yet implemented (v1.5.3 P2)",
    );
  }

  @Get(":kbId/lint-findings")
  @UseGuards(JwtAuthGuard)
  async listLintFindings(
    @Request() _req: RequestWithUser,
    @Param("kbId") _kbId: string,
  ) {
    throw new NotImplementedException(
      "Wiki lint findings list is not yet implemented (v1.5.3 P2)",
    );
  }

  @Patch(":kbId/lint-findings/:id")
  @UseGuards(JwtAuthGuard)
  async patchLintFinding(
    @Request() _req: RequestWithUser,
    @Param("kbId") _kbId: string,
    @Param("id") _id: string,
    @Body() _dto: PatchWikiLintFindingDto,
  ) {
    throw new NotImplementedException(
      "Wiki lint finding patch is not yet implemented (v1.5.3 P2)",
    );
  }

  // ─── Export (stub — P3a) ─────────────────────────────────────────

  @Post(":kbId/export")
  @UseGuards(JwtAuthGuard)
  async export(@Request() _req: RequestWithUser, @Param("kbId") _kbId: string) {
    throw new NotImplementedException(
      "Wiki tarball export is not yet implemented (v1.5.3 P3a)",
    );
  }
}
