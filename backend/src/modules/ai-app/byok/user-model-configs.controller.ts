import {
  Body,
  Controller,
  Delete,
  Get,
  NotFoundException,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { Throttle } from "@nestjs/throttler";
import { JwtAuthGuard } from "../../../common/guards/jwt-auth.guard";
import { UserModelConfigsService } from "../../ai-engine/credentials/user-model-configs/user-model-configs.service";
import { CreateUserModelConfigDto, UpdateUserModelConfigDto } from "../../ai-engine/credentials/user-model-configs/dto";

interface AuthenticatedRequest {
  user: { id: string; email: string };
}

@ApiTags("User - Model Configs")
@Controller("user/model-configs")
@UseGuards(JwtAuthGuard)
export class UserModelConfigsController {
  constructor(private readonly service: UserModelConfigsService) {}

  @Get()
  async list(
    @Req() req: AuthenticatedRequest,
    @Query("provider") provider?: string,
  ) {
    const items = provider
      ? await this.service.listByUserAndProvider(req.user.id, provider)
      : await this.service.listByUser(req.user.id);
    return { items };
  }

  @Get(":id")
  async detail(@Req() req: AuthenticatedRequest, @Param("id") id: string) {
    const item = await this.service.findById(req.user.id, id);
    if (!item) throw new NotFoundException("Model config not found");
    return { item };
  }

  @Throttle({ default: { ttl: 60_000, limit: 30 } })
  @Post()
  async create(
    @Req() req: AuthenticatedRequest,
    @Body() dto: CreateUserModelConfigDto,
  ) {
    return this.service.create(req.user.id, dto);
  }

  @Patch(":id")
  async update(
    @Req() req: AuthenticatedRequest,
    @Param("id") id: string,
    @Body() dto: UpdateUserModelConfigDto,
  ) {
    return this.service.update(req.user.id, id, dto);
  }

  @Post(":id/set-default")
  async setDefault(@Req() req: AuthenticatedRequest, @Param("id") id: string) {
    return this.service.setDefault(req.user.id, id);
  }

  @Delete(":id")
  async remove(@Req() req: AuthenticatedRequest, @Param("id") id: string) {
    return this.service.delete(req.user.id, id);
  }
}
