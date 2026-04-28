import {
  BadRequestException,
  Body,
  Controller,
  NotFoundException,
  Param,
  Post,
  Req,
  UseGuards,
} from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { Throttle } from "@nestjs/throttler";
import { JwtAuthGuard } from "../../../common/guards/jwt-auth.guard";
import {
  AiModelDiscoveryService,
  AiConnectionTestService,
  UserApiKeysService,
  UserModelConfigsService,
  AutoConfigureService,
} from "../../ai-engine/facade";

interface AuthenticatedRequest {
  user: { id: string; email: string };
}

interface FetchUserModelsDto {
  /** 用户当前在表单里输入的 Key（还没保存），优先用它。 */
  apiKey?: string;
  /** 自定义 endpoint（可选） */
  apiEndpoint?: string;
  /** 过滤模型类型：CHAT/CHAT_FAST/EMBEDDING/... */
  modelType?: string;
}

/**
 * 用户端动态模型发现接口：与管理员的 /admin/ai-models/fetch-available
 * 等价，但用用户自己的 Personal Key（或表单里当场输入的新 Key）去拉
 * provider 的 /v1/models。
 *
 * 迁移自 ai-engine/llm/user-models.controller.ts (PR-X17)
 * 只暴露给登录用户（JwtAuthGuard），没有管理员限制。
 */
@ApiTags("User - Models")
@Controller("user/api-keys")
@UseGuards(JwtAuthGuard)
export class UserModelsController {
  constructor(
    private readonly modelDiscovery: AiModelDiscoveryService,
    private readonly userApiKeys: UserApiKeysService,
  ) {}

  @Throttle({ default: { ttl: 60_000, limit: 10 } })
  @Post(":provider/available-models")
  async fetchAvailableModels(
    @Req() req: AuthenticatedRequest,
    @Param("provider") provider: string,
    @Body() dto: FetchUserModelsDto,
  ) {
    const normalized = provider.toLowerCase();

    // 优先使用表单里输入的 Key（用户还没保存时也能拉列表）；
    // 否则回退到已保存的 Personal Key。
    let apiKey = dto.apiKey?.trim();
    if (!apiKey) {
      const personal = await this.userApiKeys.getPersonalKey(
        req.user.id,
        normalized,
      );
      apiKey = personal?.apiKey;
    }
    if (!apiKey) {
      throw new BadRequestException(
        "No API Key available. Please provide one in the form or save one first.",
      );
    }

    const result = await this.modelDiscovery.fetchAvailableModels(
      normalized,
      apiKey,
      dto.apiEndpoint?.trim(),
      dto.modelType,
    );
    return result;
  }
}

/**
 * 一键 AI 配置：基于用户所有已配 Personal Keys，自动创建推荐的 UserModelConfig
 * （CHAT / CHAT_FAST / EMBEDDING / RERANK / ...），尽可能为每个 modelType 都
 * 配上一个合适的默认模型。
 *
 * 迁移自 ai-engine/llm/user-models.controller.ts (PR-X17)
 */
@ApiTags("User - Model Configs")
@Controller("user/model-configs")
@UseGuards(JwtAuthGuard)
export class UserModelConfigsAutoController {
  constructor(
    private readonly autoConfigure: AutoConfigureService,
    private readonly userModelConfigs: UserModelConfigsService,
    private readonly userApiKeys: UserApiKeysService,
    private readonly connectionTest: AiConnectionTestService,
  ) {}

  @Throttle({ default: { ttl: 60_000, limit: 5 } })
  @Post("auto-configure")
  async autoConfigureModels(@Req() req: AuthenticatedRequest) {
    return this.autoConfigure.runForUser(req.user.id);
  }

  /**
   * 测试用户自配模型的连接：用用户的 Personal Key + 模型参数实际调一次 provider
   * 路径：POST /user/model-configs/:id/test
   */
  @Throttle({ default: { ttl: 60_000, limit: 20 } })
  @Post(":id/test")
  async testConnection(
    @Req() req: AuthenticatedRequest,
    @Param("id") id: string,
  ) {
    const cfg = await this.userModelConfigs.findById(req.user.id, id);
    if (!cfg) throw new NotFoundException("Model config not found");

    const personal = await this.userApiKeys.getPersonalKey(
      req.user.id,
      cfg.provider,
    );
    if (!personal?.apiKey) {
      throw new BadRequestException(
        `No active Personal Key for provider "${cfg.provider}". 请先在 API Keys Tab 配置 Key。`,
      );
    }

    const endpoint =
      cfg.apiEndpoint?.trim() || personal.apiEndpoint?.trim() || "";

    return this.connectionTest.testModelConnectionWithKey(
      cfg.provider,
      cfg.modelId,
      personal.apiKey,
      endpoint,
      cfg.modelType,
    );
  }
}
