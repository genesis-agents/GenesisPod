import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Query,
  Request,
  UseGuards,
} from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { JwtAuthGuard } from "../../../../common/guards/jwt-auth.guard";
import type { RequestWithUser } from "../../../../common/types/express-request.types";
import { WikiKbAdminService } from "./wiki-kb-admin.service";
import {
  ToggleWikiEnabledDto,
  WikiPageSearchQueryDto,
} from "./dto/wiki-query.dto";

/**
 * WikiKbAdminController — v1.5.3 P3b backend support.
 *
 * Three endpoints (per v1.5.3 §6 + §11 v1.5.x security rules):
 *  - GET /library/wiki/kbs                        VIEWER+ (per row)
 *  - PATCH /library/kbs/:kbId/wiki-enabled        ADMIN/OWNER
 *  - GET /library/wiki/kbs/:kbId/pages/search     VIEWER+
 *
 * The wiki-enabled toggle lives under /library/kbs/ (not /library/wiki/)
 * because it is a KB-level feature flag, not a wiki sub-resource. The
 * KB selector listing and wiki search live under /library/wiki/ since
 * they are wiki-scoped reads.
 */
@ApiTags("LibraryWikiAdmin")
@Controller("library")
export class WikiKbAdminController {
  constructor(private readonly admin: WikiKbAdminService) {}

  @Get("wiki/kbs")
  @UseGuards(JwtAuthGuard)
  async listKbs(@Request() req: RequestWithUser) {
    const items = await this.admin.listWikiEnabledKbs(req.user.id);
    return { items };
  }

  @Patch("kbs/:kbId/wiki-enabled")
  @UseGuards(JwtAuthGuard)
  async toggleWikiEnabled(
    @Request() req: RequestWithUser,
    @Param("kbId") kbId: string,
    @Body() dto: ToggleWikiEnabledDto,
  ) {
    return this.admin.toggleWikiEnabled(req.user.id, kbId, dto.enabled);
  }

  @Get("wiki/kbs/:kbId/pages/search")
  @UseGuards(JwtAuthGuard)
  async searchPages(
    @Request() req: RequestWithUser,
    @Param("kbId") kbId: string,
    @Query() query: WikiPageSearchQueryDto,
  ) {
    const limit = query.limit ? Number.parseInt(query.limit, 10) : 20;
    const items = await this.admin.searchPages(
      req.user.id,
      kbId,
      query.q,
      limit,
    );
    return { items };
  }
}
