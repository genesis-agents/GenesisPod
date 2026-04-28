import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Req,
  UseGuards,
} from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { Throttle } from "@nestjs/throttler";
import { JwtAuthGuard } from "../../../common/guards/jwt-auth.guard";
import { KeyRequestsService } from "../../ai-engine/facade";
import { CreateKeyRequestDto } from "../../ai-engine/facade";

interface AuthenticatedRequest {
  user: { id: string; email: string };
}

@ApiTags("User - Key Requests")
@Controller("user/key-requests")
@UseGuards(JwtAuthGuard)
export class UserKeyRequestsController {
  constructor(private readonly service: KeyRequestsService) {}

  @Get()
  async listMine(@Req() req: AuthenticatedRequest) {
    return { items: await this.service.listMine(req.user.id) };
  }

  @Throttle({ default: { ttl: 3600_000, limit: 3 } })
  @Post()
  async create(
    @Req() req: AuthenticatedRequest,
    @Body() dto: CreateKeyRequestDto,
  ) {
    return this.service.create(req.user.id, dto);
  }

  @Delete(":id")
  async cancel(@Req() req: AuthenticatedRequest, @Param("id") id: string) {
    return this.service.cancel(id, req.user.id);
  }
}
