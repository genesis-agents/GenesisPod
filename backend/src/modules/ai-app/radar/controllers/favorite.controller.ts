/**
 * Favorite controller（B16）
 *
 * 来源：daily-briefing-redesign-2026-05-18.md §4.2 §15 B3
 *
 * 路由：
 * - POST /api/v1/radar/signals/:signalId/favorite (toggle)
 * - GET  /api/v1/radar/favorites（用户收藏列表）
 *
 * 安全：JwtAuthGuard 必须先过；ownership 通过 userId 自然隔离
 */
import {
  Body,
  Controller,
  Get,
  Post,
  Query,
  Request,
  UseGuards,
} from "@nestjs/common";
import { IsString, IsUUID } from "class-validator";
import { JwtAuthGuard } from "../../../../common/guards/jwt-auth.guard";
import type { RequestWithUser } from "../../../../common/types/express-request.types";
import { FavoriteService } from "../services/briefing/favorite.service";

class ToggleFavoriteDto {
  @IsUUID("4")
  signalId!: string;
  @IsString()
  topicId!: string;
}

@Controller("api/v1/radar")
@UseGuards(JwtAuthGuard)
export class FavoriteController {
  constructor(private readonly svc: FavoriteService) {}

  @Post("favorites/toggle")
  async toggle(
    @Request() req: RequestWithUser,
    @Body() dto: ToggleFavoriteDto,
  ): Promise<{ favorited: boolean }> {
    return this.svc.toggle({
      userId: req.user.id,
      signalId: dto.signalId,
      topicId: dto.topicId,
    });
  }

  @Get("favorites")
  async list(@Request() req: RequestWithUser, @Query("limit") limit?: string) {
    const lim = limit ? Math.max(1, Math.min(100, Number(limit) || 50)) : 50;
    return this.svc.listForUser(req.user.id, lim);
  }
}
