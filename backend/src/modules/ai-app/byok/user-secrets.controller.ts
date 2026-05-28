import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
  Req,
  UseGuards,
} from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { Throttle } from "@nestjs/throttler";
import { JwtAuthGuard } from "../../../common/guards/jwt-auth.guard";
import { UserSecretsService } from "../../ai-infra/credentials/user-secrets/user-secrets.service";
import {
  CreateUserSecretDto,
  UpdateUserSecretDto,
  UserSecretSource,
} from "../../ai-infra/credentials/user-secrets/dto/user-secret.dto";

interface AuthenticatedRequest {
  user: { id: string; email: string };
}

/**
 * 2026-05-27 BYOK 全量化：用户私有 Secret 统一管理端点（/me/api-keys 页面后端）。
 * 一个表格管所有类别 Key（LLM + 工具 + 其他），后端按 category 分流两张表。
 * 所有操作强制 req.user.id owner 隔离（防 IDOR / 越权）。
 */
@ApiTags("User Secrets (BYOK)")
@Controller("user/secrets")
@UseGuards(JwtAuthGuard)
export class UserSecretsController {
  constructor(private readonly userSecrets: UserSecretsService) {}

  /** 列出用户所有私有 Key（统一表格数据源）。 */
  @Get()
  async list(@Req() req: AuthenticatedRequest) {
    const items = await this.userSecrets.list(req.user.id);
    return { items };
  }

  /** 新增一把 Key（按 category 分流：AI_MODEL→user_api_keys，其余→secrets）。 */
  @Throttle({ default: { ttl: 60000, limit: 20 } })
  @Post()
  async create(
    @Req() req: AuthenticatedRequest,
    @Body() dto: CreateUserSecretDto,
  ) {
    return this.userSecrets.create(req.user.id, dto);
  }

  /** 更新一把 Key（source 区分来源表）。 */
  @Throttle({ default: { ttl: 60000, limit: 20 } })
  @Put(":source/:id")
  async update(
    @Req() req: AuthenticatedRequest,
    @Param("source") source: UserSecretSource,
    @Param("id") id: string,
    @Body() dto: UpdateUserSecretDto,
  ) {
    return this.userSecrets.update(req.user.id, source, id, dto);
  }

  /** 删除一把 Key（owner 校验 + 软删）。 */
  @Delete(":source/:id")
  async remove(
    @Req() req: AuthenticatedRequest,
    @Param("source") source: UserSecretSource,
    @Param("id") id: string,
  ) {
    return this.userSecrets.remove(req.user.id, source, id);
  }

  /**
   * C8：测试用户自己的 Key 是否存在（每用户每小时限 5 次）。
   * 仅验证 Key 存在性，不调付费 API，响应不回传明文。
   */
  @Throttle({ default: { ttl: 3600000, limit: 5 } })
  @Post(":source/:id/test")
  async testKey(
    @Req() req: AuthenticatedRequest,
    @Param("source") source: UserSecretSource,
    @Param("id") id: string,
  ) {
    return this.userSecrets.testKey(req.user.id, source, id);
  }
}
