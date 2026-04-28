import { Injectable, Logger, UnauthorizedException } from "@nestjs/common";
import { UserRole } from "@prisma/client";
import { PrismaService } from "../../../../common/prisma/prisma.service";
import { KeyAssignmentsService } from "../key-assignments/key-assignments.service";
import { SecretsService } from "../../../ai-infra/secrets/secrets.service";
import { UserApiKeysService } from "../user-api-keys/user-api-keys.service";
import { NoAvailableKeyError, NoSystemKeyError } from "./key-resolver.errors";

export type KeySource = "PERSONAL" | "ASSIGNED" | "SYSTEM";

export interface ResolvedKey {
  source: KeySource;
  apiKey: string;
  apiEndpoint: string | null;
  provider: string;
  userId: string;
  /** 仅 ASSIGNED 来源返回，用于消费回写 */
  assignmentId?: string;
  /** 仅 ASSIGNED 来源返回，用于审计 */
  keyId?: string;
  /** 用户自配模型：PERSONAL Key 关联的 preferredModelId（若有），
   *  用于在 chat 路由时覆盖全局默认模型。 */
  preferredModelId?: string | null;
}

/**
 * 统一的 API Key 解析入口。所有 LLM 调用都必须通过这里拿 Key，
 * 禁止直接访问 UserApiKeysService / SecretsService。
 *
 * 规则（与设计文档 §3 一致）：
 * - 管理员（User.role = ADMIN）：永远使用系统 Secret，忽略其 Personal/Assigned
 * - 普通用户：优先 Personal，其次 Assigned，都没有则抛 NoAvailableKeyError
 * - 不做 PERSONAL → SYSTEM 的静默回退（避免账单归属混乱）
 */
@Injectable()
export class KeyResolverService {
  private readonly logger = new Logger(KeyResolverService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly userApiKeys: UserApiKeysService,
    private readonly keyAssignments: KeyAssignmentsService,
    private readonly secrets: SecretsService,
  ) {}

  async resolveKey(
    userId: string,
    provider: string,
    options: { systemSecretName?: string | null } = {},
  ): Promise<ResolvedKey> {
    if (!userId) {
      throw new UnauthorizedException("userId is required for key resolution");
    }
    const normalizedProvider = provider.toLowerCase();

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { role: true },
    });
    if (!user) {
      throw new UnauthorizedException("User not found");
    }

    if (user.role === UserRole.ADMIN) {
      return this.resolveSystemKey(
        userId,
        normalizedProvider,
        options.systemSecretName ?? null,
      );
    }

    return this.resolveUserKey(userId, normalizedProvider);
  }

  /**
   * 获取用户为某 provider 指定的 preferredModelId（仅 Personal Key 有此概念）。
   * 供 AiChatService / AiModelConfigService 路由时优先选用该模型，
   * 避免全局默认模型（如 gpt-5.4）对用户 Key 的付费 tier 不可及。
   */
  async getPreferredModelIdForProvider(
    userId: string,
    provider: string,
  ): Promise<string | null> {
    const personal = await this.userApiKeys
      .getPersonalKey(userId, provider.toLowerCase())
      .catch(() => null);
    return personal?.preferredModelId ?? null;
  }

  /**
   * 用户可用的全部 provider 集合。
   * - ADMIN：系统 Secret 已配置的 provider
   * - USER：Personal ∪ Assigned
   */
  async getAvailableProviders(userId: string): Promise<string[]> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { role: true },
    });
    if (!user) return [];

    if (user.role === UserRole.ADMIN) {
      return this.secrets.listAvailableProviders();
    }

    const [personal, assigned] = await Promise.all([
      this.userApiKeys.getAvailableProviders(userId),
      this.keyAssignments.getAvailableProviders(userId),
    ]);
    return Array.from(new Set([...personal, ...assigned]));
  }

  /**
   * Assignment 来源的调用完成后回写配额。
   * 其他来源调用这个方法是 no-op，便于调用方统一处理。
   */
  async recordSpend(resolved: ResolvedKey, costCents: number): Promise<void> {
    if (resolved.source !== "ASSIGNED" || !resolved.assignmentId) return;
    try {
      await this.keyAssignments.incrementSpend(
        resolved.assignmentId,
        costCents,
      );
    } catch (error) {
      this.logger.warn(
        `Failed to record spend for assignment ${resolved.assignmentId}: ${(error as Error).message}`,
      );
    }
  }

  private async resolveUserKey(
    userId: string,
    provider: string,
  ): Promise<ResolvedKey> {
    // 1. Personal Key
    const personal = await this.userApiKeys
      .getPersonalKey(userId, provider)
      .catch((error) => {
        this.logger.warn(
          `getPersonalKey failed for ${userId}/${provider}: ${(error as Error).message}`,
        );
        return null;
      });
    if (personal?.apiKey) {
      return {
        source: "PERSONAL",
        apiKey: personal.apiKey,
        apiEndpoint: personal.apiEndpoint ?? null,
        provider,
        userId,
        preferredModelId: personal.preferredModelId ?? null,
      };
    }

    // 2. Assigned Key（配额耗尽会在 service 内抛 QuotaExceededError，调用方按错误码处理）
    const assigned = await this.keyAssignments.resolveActive(userId, provider);
    if (assigned) {
      return {
        source: "ASSIGNED",
        apiKey: assigned.apiKey,
        apiEndpoint: assigned.apiEndpoint,
        provider,
        userId,
        assignmentId: assigned.assignmentId,
        keyId: assigned.keyId,
      };
    }

    // 3. 都没有 → 明确抛错，前端据此引导到配置 / 申请页
    throw new NoAvailableKeyError(provider);
  }

  /**
   * 按优先级查系统 Secret：
   * 1. 调用方显式指定的 secretName（通常来自 AIModel.secretKey）
   * 2. 默认约定 `${provider}-api-key`
   * 3. 按 provider 字段在 secrets 表里模糊匹配（兜底：历史命名不规范）
   *
   * 任一命中即返回；都没有则抛 NoSystemKeyError。
   */
  private async resolveSystemKey(
    userId: string,
    provider: string,
    explicitSecretName: string | null,
  ): Promise<ResolvedKey> {
    const candidates: string[] = [];
    if (explicitSecretName) candidates.push(explicitSecretName);
    candidates.push(`${provider}-api-key`);

    for (const name of candidates) {
      const value = await this.secrets.getValueInternal(name);
      if (value) {
        return this.buildSystemResolved(userId, provider, value, name);
      }
    }

    // 兜底：按 secrets.provider 字段匹配（容忍历史命名如 claude-api-key / gemini-api / xai-grok-api-key）
    const fallback = await this.secrets.findByProviderAlias(provider);
    if (fallback) {
      const value = await this.secrets.getValueInternal(fallback.name);
      if (value) {
        return this.buildSystemResolved(userId, provider, value, fallback.name);
      }
    }

    throw new NoSystemKeyError(provider);
  }

  private async buildSystemResolved(
    userId: string,
    provider: string,
    apiKey: string,
    secretName: string,
  ): Promise<ResolvedKey> {
    // Endpoint 是可选 secret，命名约定 `${provider}-api-endpoint`；没有就留 null
    const endpointName = `${provider}-api-endpoint`;
    const endpoint = await this.secrets.getValueInternal(endpointName);
    return {
      source: "SYSTEM",
      apiKey: apiKey.trim(),
      apiEndpoint: endpoint?.trim() || null,
      provider,
      userId,
      // keyId 留空（SYSTEM 不写 assignment），但记一下 secretName 供审计
      keyId: secretName,
    };
  }
}
