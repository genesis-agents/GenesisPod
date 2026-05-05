import { Injectable, Logger, UnauthorizedException } from "@nestjs/common";
import { PrismaService } from "../../../../common/prisma/prisma.service";
import { KeyAssignmentsService } from "../key-assignments/key-assignments.service";
import { UserApiKeysService } from "../user-api-keys/user-api-keys.service";
import { NoAvailableKeyError } from "./key-resolver.errors";

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
 * 规则（2026-05-05 严格 BYOK）：
 * - 所有用户（含 ADMIN）：Personal → Assigned，都无 → throw NoAvailableKeyError
 * - **不再 fallback SYSTEM** —— 用户必须显式配 BYOK，否则失败 + 引导配置
 * - SYSTEM key 仅供"无用户上下文"的后台任务（cron / health check）使用，
 *   通过 ai-model-config.resolveApiKey 自身的 SYSTEM 路径直查 secrets，
 *   不走本 KeyResolver 入口。
 *
 * 历史：
 * - 2026-04-30: 修订让 ADMIN 也走 PERSONAL → ASSIGNED → SYSTEM（之前 ADMIN
 *   永远 SYSTEM 让 BYOK 失效）
 * - 2026-05-05: 删除 ADMIN SYSTEM fallback，严格 BYOK。原因：用户报告 AI Ask /
 *   AI Explore / Library 仍在用 SYSTEM key（实际是 ADMIN 没配 PERSONAL 时
 *   静默 fallback SYSTEM）。改为强制 BYOK 让用户感知 + 配置。
 */
@Injectable()
export class KeyResolverService {
  private readonly logger = new Logger(KeyResolverService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly userApiKeys: UserApiKeysService,
    private readonly keyAssignments: KeyAssignmentsService,
  ) {}

  async resolveKey(
    userId: string,
    provider: string,
    // ★ 2026-05-05: options.systemSecretName 仅 ADMIN SYSTEM fallback 路径用，
    //   严格 BYOK 后该路径已删，参数保留作签名兼容（caller 可继续传，被忽略）。
    _options: { systemSecretName?: string | null } = {},
  ): Promise<ResolvedKey> {
    if (!userId) {
      throw new UnauthorizedException("userId is required for key resolution");
    }
    const normalizedProvider = provider.toLowerCase();

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true },
    });
    if (!user) {
      throw new UnauthorizedException("User not found");
    }

    // ★ 2026-05-05 严格 BYOK 模式：所有用户（含 ADMIN）必须配 PERSONAL 或
    //   ASSIGNED key，不再 fallback 到 SYSTEM。SYSTEM key 仅供"无用户上下文"
    //   的后台任务（cron / health check）使用，不通过本 resolveKey 入口。
    //
    //   背景（2026-05-05 用户报告）：AI Ask / AI Explore / Library 用户感知
    //   "还在用系统 Key"，根因是 ADMIN 在 PERSONAL 没配时静默 fallback SYSTEM。
    //   严格 BYOK = ADMIN 也必须配 BYOK，否则失败 + 引导用户去 BYOK 配置页。
    //
    //   历史路径（已废）：之前 ADMIN 在 PERSONAL/ASSIGNED 都无时回退 SYSTEM
    //   "保留管理员维持系统功能能力"。改回严格后，ADMIN 也必须显式配 BYOK，
    //   保留可调用性的方法是去 Admin → AI 配置加 PERSONAL key。
    return await this.resolveUserKey(userId, normalizedProvider);
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
   * - ADMIN：Personal ∪ Assigned ∪ 系统 Secret 已配置的 provider
   * - USER：Personal ∪ Assigned
   */
  async getAvailableProviders(userId: string): Promise<string[]> {
    // ★ 2026-05-05 严格 BYOK：ADMIN 不再额外加 SYSTEM provider 集合，与
    //   resolveKey 一致。ADMIN 想用某 provider 必须显式配 PERSONAL 或 ASSIGNED。
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true },
    });
    if (!user) return [];

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

  // ★ 2026-05-05 严格 BYOK 模式删除：resolveSystemKey / buildSystemResolved
  //   原 ADMIN fallback 调用方已删除（resolveKey 现在 PERSONAL/ASSIGNED 都
  //   无时直接 throw NoAvailableKeyError）。SYSTEM key 仅由
  //   ai-model-config.resolveApiKey 在"无 userId 上下文"分支自行查 secrets，
  //   不通过 KeyResolver 入口，避免被 user 调用链命中。
}
