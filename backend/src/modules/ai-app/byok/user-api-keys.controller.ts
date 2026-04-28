import {
  Controller,
  Get,
  Put,
  Delete,
  Post,
  Param,
  Body,
  Req,
  UseGuards,
} from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { Throttle } from "@nestjs/throttler";
import { JwtAuthGuard } from "../../../common/guards/jwt-auth.guard";
import { UserApiKeysService } from "../../ai-engine/facade";
import { SaveUserApiKeyDto, TestApiKeyDto } from "../../ai-engine/facade";

interface AuthenticatedRequest {
  user: { id: string; email: string };
}

@ApiTags("User API Keys")
@Controller("user/api-keys")
@UseGuards(JwtAuthGuard)
export class UserApiKeysController {
  constructor(private readonly userApiKeysService: UserApiKeysService) {}

  /**
   * 列出用户的所有 API Key 配置
   */
  @Get()
  async listKeys(@Req() req: AuthenticatedRequest) {
    const keys = await this.userApiKeysService.listUserApiKeys(req.user.id);
    const providers = this.userApiKeysService.getSupportedProviders();
    return { keys, providers };
  }

  /**
   * BYOK 状态概览 — 给首次登录引导 / dashboard banner 用
   * GET /api/v1/user/api-keys/status
   *
   * 返回 { configured, activeProviders, hasModelConfig }，
   * 前端 useByokStatus() 依据这个决定要不要显示 onboarding banner / modal。
   */
  @Get("status")
  async getStatus(@Req() req: AuthenticatedRequest) {
    return this.userApiKeysService.getByokStatus(req.user.id);
  }

  /**
   * 保存/更新 API Key
   */
  @Throttle({ default: { ttl: 60000, limit: 10 } })
  @Put(":provider")
  async saveKey(
    @Req() req: AuthenticatedRequest,
    @Param("provider") provider: string,
    @Body() dto: SaveUserApiKeyDto,
  ) {
    return this.userApiKeysService.saveKey(
      req.user.id,
      provider,
      dto.apiKey,
      dto.mode,
      dto.preferredModelId,
      dto.apiEndpoint,
    );
  }

  /**
   * 删除 API Key
   */
  @Delete(":provider")
  async deleteKey(
    @Req() req: AuthenticatedRequest,
    @Param("provider") provider: string,
  ) {
    return this.userApiKeysService.deleteKey(req.user.id, provider);
  }

  /**
   * 测试 API Key 连接
   */
  @Throttle({ default: { ttl: 60000, limit: 5 } })
  @Post(":provider/test")
  async testKey(
    @Param("provider") provider: string,
    @Body() dto: TestApiKeyDto,
  ) {
    return this.userApiKeysService.testKey(
      provider,
      dto.apiKey,
      dto.apiEndpoint,
    );
  }

  /**
   * 撤回捐赠（Key 变回自用模式）
   */
  @Delete(":provider/donate")
  async withdrawDonation(
    @Req() req: AuthenticatedRequest,
    @Param("provider") provider: string,
  ) {
    return this.userApiKeysService.withdrawDonation(req.user.id, provider);
  }
}
