import {
  BadRequestException,
  Body,
  Controller,
  Param,
  Post,
  Req,
  UseGuards,
} from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { Throttle } from "@nestjs/throttler";
import { JwtAuthGuard } from "../../../common/guards/jwt-auth.guard";
import { AiModelDiscoveryService } from "./services/ai-model-discovery.service";
import { UserApiKeysService } from "../../ai-infra/user-api-keys/user-api-keys.service";

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
 * 放在 ai-engine 层是因为要依赖 AiModelDiscoveryService；只暴露给
 * 登录用户（JwtAuthGuard），没有管理员限制。
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
