import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { AIModelType, Prisma, UserModelConfig } from "@prisma/client";
import { PrismaService } from "../../../common/prisma/prisma.service";

/** Provider → 默认 endpoint / apiFormat（与 UserApiKeysService.PROVIDER_DEFAULTS 保持一致） */
const PROVIDER_API_DEFAULTS: Record<
  string,
  { endpoint: string; apiFormat: string }
> = {
  openai: { endpoint: "https://api.openai.com/v1", apiFormat: "openai" },
  anthropic: {
    endpoint: "https://api.anthropic.com/v1",
    apiFormat: "anthropic",
  },
  deepseek: {
    endpoint: "https://api.deepseek.com/v1",
    apiFormat: "openai",
  },
  google: {
    endpoint: "https://generativelanguage.googleapis.com/v1beta",
    apiFormat: "google",
  },
  xai: { endpoint: "https://api.x.ai/v1", apiFormat: "openai" },
  qwen: {
    endpoint: "https://dashscope.aliyuncs.com/compatible-mode/v1",
    apiFormat: "openai",
  },
  cohere: { endpoint: "https://api.cohere.com/v2", apiFormat: "openai" },
  groq: { endpoint: "https://api.groq.com/openai/v1", apiFormat: "openai" },
  openrouter: {
    endpoint: "https://openrouter.ai/api/v1",
    apiFormat: "openai",
  },
  minimax: { endpoint: "https://api.minimax.chat/v1", apiFormat: "openai" },
};

const PROVIDER_NAME_PATTERN = /^[a-z0-9-]+$/;

export interface CreateUserModelConfigInput {
  provider: string;
  modelId: string;
  displayName: string;
  modelType: AIModelType;
  apiEndpoint?: string | null;
  maxTokens?: number;
  temperature?: number;
  embeddingDimensions?: number | null;
  maxInputTokens?: number | null;
  isReasoning?: boolean;
  apiFormat?: string;
  supportsTemperature?: boolean;
  supportsStreaming?: boolean;
  supportsFunctionCalling?: boolean;
  supportsVision?: boolean;
  tokenParamName?: string;
  defaultTimeoutMs?: number;
  priority?: number;
  isEnabled?: boolean;
  isDefault?: boolean;
  description?: string | null;
  priceInputPerMillion?: number | null;
  priceOutputPerMillion?: number | null;
}

export type UpdateUserModelConfigInput = Partial<CreateUserModelConfigInput>;

@Injectable()
export class UserModelConfigsService {
  constructor(private readonly prisma: PrismaService) {}

  private validateProvider(provider: string): string {
    const normalized = provider.toLowerCase().trim();
    if (!PROVIDER_NAME_PATTERN.test(normalized) || normalized.length > 50) {
      throw new BadRequestException("Invalid provider name");
    }
    return normalized;
  }

  private applyDefaults(
    input: CreateUserModelConfigInput,
    provider: string,
  ): Prisma.UserModelConfigCreateInput {
    const providerDefaults =
      PROVIDER_API_DEFAULTS[provider] ?? PROVIDER_API_DEFAULTS.openai;
    return {
      provider,
      modelId: input.modelId.trim(),
      displayName: input.displayName.trim() || input.modelId.trim(),
      modelType: input.modelType,
      apiEndpoint: input.apiEndpoint?.trim() || null,
      maxTokens: input.maxTokens ?? 4096,
      temperature: input.temperature ?? 0.7,
      embeddingDimensions: input.embeddingDimensions ?? null,
      maxInputTokens: input.maxInputTokens ?? null,
      isReasoning: input.isReasoning ?? false,
      apiFormat: input.apiFormat ?? providerDefaults.apiFormat,
      supportsTemperature: input.supportsTemperature ?? true,
      supportsStreaming: input.supportsStreaming ?? true,
      supportsFunctionCalling: input.supportsFunctionCalling ?? true,
      supportsVision: input.supportsVision ?? false,
      tokenParamName: input.tokenParamName ?? "max_tokens",
      defaultTimeoutMs: input.defaultTimeoutMs ?? 120000,
      priority: input.priority ?? 50,
      isEnabled: input.isEnabled ?? true,
      isDefault: input.isDefault ?? false,
      description: input.description?.trim() || null,
      priceInputPerMillion: input.priceInputPerMillion ?? null,
      priceOutputPerMillion: input.priceOutputPerMillion ?? null,
      user: { connect: { id: "" } }, // Caller replaces this
    };
  }

  async create(
    userId: string,
    input: CreateUserModelConfigInput,
  ): Promise<UserModelConfig> {
    if (!input.modelId?.trim()) {
      throw new BadRequestException("modelId is required");
    }
    if (!input.displayName?.trim()) {
      // 允许缺省，默认用 modelId
      input.displayName = input.modelId;
    }
    const provider = this.validateProvider(input.provider);
    const data = this.applyDefaults(input, provider);
    data.user = { connect: { id: userId } };

    try {
      const created = await this.prisma.userModelConfig.create({ data });
      // 如果用户指定 isDefault=true，把同 modelType 下其他同类清掉
      if (created.isDefault) {
        await this.ensureSingleDefault(userId, created);
      }
      return created;
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2002"
      ) {
        throw new ConflictException(
          `Model "${input.modelId}" already configured for provider "${provider}"`,
        );
      }
      throw error;
    }
  }

  async update(
    userId: string,
    id: string,
    patch: UpdateUserModelConfigInput,
  ): Promise<UserModelConfig> {
    const existing = await this.prisma.userModelConfig.findUnique({
      where: { id },
    });
    if (!existing || existing.userId !== userId) {
      throw new NotFoundException("Model config not found");
    }

    const data: Prisma.UserModelConfigUpdateInput = {};
    if (patch.modelId !== undefined) data.modelId = patch.modelId.trim();
    if (patch.displayName !== undefined)
      data.displayName = patch.displayName.trim();
    if (patch.modelType !== undefined) data.modelType = patch.modelType;
    if (patch.apiEndpoint !== undefined)
      data.apiEndpoint = patch.apiEndpoint?.trim() || null;
    if (patch.maxTokens !== undefined) data.maxTokens = patch.maxTokens;
    if (patch.temperature !== undefined) data.temperature = patch.temperature;
    if (patch.embeddingDimensions !== undefined)
      data.embeddingDimensions = patch.embeddingDimensions;
    if (patch.maxInputTokens !== undefined)
      data.maxInputTokens = patch.maxInputTokens;
    if (patch.isReasoning !== undefined) data.isReasoning = patch.isReasoning;
    if (patch.apiFormat !== undefined) data.apiFormat = patch.apiFormat;
    if (patch.supportsTemperature !== undefined)
      data.supportsTemperature = patch.supportsTemperature;
    if (patch.supportsStreaming !== undefined)
      data.supportsStreaming = patch.supportsStreaming;
    if (patch.supportsFunctionCalling !== undefined)
      data.supportsFunctionCalling = patch.supportsFunctionCalling;
    if (patch.supportsVision !== undefined)
      data.supportsVision = patch.supportsVision;
    if (patch.tokenParamName !== undefined)
      data.tokenParamName = patch.tokenParamName;
    if (patch.defaultTimeoutMs !== undefined)
      data.defaultTimeoutMs = patch.defaultTimeoutMs;
    if (patch.priority !== undefined) data.priority = patch.priority;
    if (patch.isEnabled !== undefined) data.isEnabled = patch.isEnabled;
    if (patch.isDefault !== undefined) data.isDefault = patch.isDefault;
    if (patch.description !== undefined)
      data.description = patch.description?.trim() || null;
    if (patch.priceInputPerMillion !== undefined)
      data.priceInputPerMillion = patch.priceInputPerMillion;
    if (patch.priceOutputPerMillion !== undefined)
      data.priceOutputPerMillion = patch.priceOutputPerMillion;

    try {
      const updated = await this.prisma.userModelConfig.update({
        where: { id },
        data,
      });
      if (patch.isDefault === true || patch.modelType !== undefined) {
        await this.ensureSingleDefault(userId, updated);
      }
      return updated;
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2002"
      ) {
        throw new ConflictException(
          `Model "${patch.modelId ?? existing.modelId}" already exists for this provider`,
        );
      }
      throw error;
    }
  }

  async delete(userId: string, id: string): Promise<{ success: true }> {
    const existing = await this.prisma.userModelConfig.findUnique({
      where: { id },
    });
    if (!existing || existing.userId !== userId) {
      throw new NotFoundException("Model config not found");
    }
    await this.prisma.userModelConfig.delete({ where: { id } });
    return { success: true };
  }

  async listByUser(userId: string): Promise<UserModelConfig[]> {
    return this.prisma.userModelConfig.findMany({
      where: { userId },
      orderBy: [
        { isDefault: "desc" },
        { modelType: "asc" },
        { priority: "desc" },
        { createdAt: "desc" },
      ],
    });
  }

  async listByUserAndProvider(
    userId: string,
    provider: string,
  ): Promise<UserModelConfig[]> {
    return this.prisma.userModelConfig.findMany({
      where: { userId, provider: provider.toLowerCase() },
      orderBy: [
        { isDefault: "desc" },
        { modelType: "asc" },
        { priority: "desc" },
      ],
    });
  }

  async findById(userId: string, id: string): Promise<UserModelConfig | null> {
    const item = await this.prisma.userModelConfig.findUnique({
      where: { id },
    });
    if (!item || item.userId !== userId) return null;
    return item;
  }

  /**
   * 按 modelId 精确查找当前用户的配置。供 AiModelConfigService 在路由时查用。
   */
  async findByModelId(
    userId: string,
    modelId: string,
  ): Promise<UserModelConfig | null> {
    return this.prisma.userModelConfig.findFirst({
      where: {
        userId,
        modelId: { equals: modelId, mode: "insensitive" },
        isEnabled: true,
      },
    });
  }

  /**
   * 查用户在指定 modelType 下的默认模型（isDefault=true）。
   * 没有则返回该 type 下 priority 最高的启用模型，再没有返回 null。
   */
  async findDefaultForType(
    userId: string,
    modelType: AIModelType,
  ): Promise<UserModelConfig | null> {
    const def = await this.prisma.userModelConfig.findFirst({
      where: { userId, modelType, isEnabled: true, isDefault: true },
    });
    if (def) return def;
    return this.prisma.userModelConfig.findFirst({
      where: { userId, modelType, isEnabled: true },
      orderBy: [{ priority: "desc" }, { createdAt: "asc" }],
    });
  }

  async setDefault(userId: string, id: string): Promise<UserModelConfig> {
    const existing = await this.prisma.userModelConfig.findUnique({
      where: { id },
    });
    if (!existing || existing.userId !== userId) {
      throw new NotFoundException("Model config not found");
    }
    // 先把同 modelType 下其他 isDefault 清掉，再设当前为 default
    await this.prisma.$transaction([
      this.prisma.userModelConfig.updateMany({
        where: {
          userId,
          modelType: existing.modelType,
          isDefault: true,
          NOT: { id },
        },
        data: { isDefault: false },
      }),
      this.prisma.userModelConfig.update({
        where: { id },
        data: { isDefault: true },
      }),
    ]);
    return (await this.prisma.userModelConfig.findUnique({
      where: { id },
    })) as UserModelConfig;
  }

  /**
   * 工具：确保给定 modelType 下只有一个 isDefault=true。
   * 在 create/update 之后调用，维持唯一默认不变。
   */
  private async ensureSingleDefault(
    userId: string,
    current: UserModelConfig,
  ): Promise<void> {
    if (!current.isDefault) return;
    await this.prisma.userModelConfig.updateMany({
      where: {
        userId,
        modelType: current.modelType,
        isDefault: true,
        NOT: { id: current.id },
      },
      data: { isDefault: false },
    });
  }
}
