import { Injectable, Logger } from "@nestjs/common";
import { AuthRequestType, ByokMode } from "@prisma/client";
import { PrismaService } from "../../../../common/prisma/prisma.service";
import { SecretsService } from "../../secrets/secrets.service";
import { EXTERNAL_TOOL_SECRET_MAPPING } from "../../secrets/secret-name.catalog";
import { UserSecretsService } from "../user-secrets/user-secrets.service";

/** 工具 Key 无法解析时抛出（STRICT 模式下用户未配 + 未授权）。 */
export class NoToolKeyError extends Error {
  constructor(
    public readonly toolId: string,
    public readonly secretName: string,
  ) {
    super(
      `工具「${toolId}」没有可用的 Key：你未配置自己的 Key，也未获系统授权。请到「我的工具」配置 Key 或申请授权。`,
    );
    this.name = "NoToolKeyError";
  }
}

export type ToolKeySource = "user" | "granted" | "admin-fallback";

export interface ResolvedToolKey {
  value: string;
  source: ToolKeySource;
  secretName: string;
}

/**
 * 2026-05-27 BYOK 全量化：工具 Key 运行时解析（「优先使用 BYOK 工具」的核心）。
 *
 * 优先级链（方案 §3 D3 / §18 V2=SWITCH-default-strict）：
 *  1. 用户私有 Key（user_secrets，per-user 解密）           → source=user
 *  2. 系统授权（AuthorizationGrant TOOL_GRANT 未过期未撤销）→ 走 admin Key，source=granted
 *  3. user.byokMode:
 *       FALLBACK → 走 admin 系统 Key                       → source=admin-fallback
 *       STRICT   → 抛 NoToolKeyError（不烧 admin 池）
 *
 * userId 必填（缺失即抛错，D6）——防止工具链漏传 userId 静默退化成走 admin Key。
 */
@Injectable()
export class ToolKeyResolverService {
  private readonly logger = new Logger(ToolKeyResolverService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly userSecrets: UserSecretsService,
    private readonly secrets: SecretsService,
  ) {}

  /** 把 toolId 映射到 secret name；未在映射表的，按 toolId 原样当 secret name。 */
  resolveSecretName(toolId: string): string {
    return EXTERNAL_TOOL_SECRET_MAPPING[toolId] ?? toolId;
  }

  /**
   * 解析某工具运行时该用哪把 Key 的明文。userId 必填。
   * 返回 null 当且仅当 FALLBACK 模式但 admin 也没配（调用方据此报「未配置」）。
   * STRICT 模式且用户无 Key 无授权 → 抛 NoToolKeyError。
   */
  async resolveToolKey(
    toolId: string,
    userId: string,
  ): Promise<ResolvedToolKey | null> {
    if (!userId) {
      throw new Error(
        `resolveToolKey(${toolId}): userId is required (BYOK isolation, D6)`,
      );
    }
    const secretName = this.resolveSecretName(toolId);

    // 1. 用户私有 Key 优先
    const userValue = await this.userSecrets.getUserSecretValue(
      secretName,
      userId,
    );
    if (userValue) {
      return { value: userValue, source: "user", secretName };
    }

    // 2. 系统授权（已授权 → 允许走 admin Key）
    const granted = await this.hasActiveToolGrant(userId, toolId, secretName);
    if (granted) {
      const adminValue = await this.secrets.getValueInternal(secretName);
      if (adminValue) {
        return { value: adminValue, source: "granted", secretName };
      }
    }

    // 3. byokMode 决定是否兜底 admin
    const mode = await this.getByokMode(userId);
    if (mode === ByokMode.FALLBACK) {
      const adminValue = await this.secrets.getValueInternal(secretName);
      if (adminValue) {
        return { value: adminValue, source: "admin-fallback", secretName };
      }
      // FALLBACK 但 admin 也没配 → null（调用方报「未配置」）
      this.logger.debug(
        `[resolveToolKey] ${toolId}: FALLBACK but no admin key for ${secretName}`,
      );
      return null;
    }

    // STRICT：不烧 admin 池
    throw new NoToolKeyError(toolId, secretName);
  }

  private async getByokMode(userId: string): Promise<ByokMode> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { byokMode: true },
    });
    return user?.byokMode ?? ByokMode.STRICT;
  }

  private async hasActiveToolGrant(
    userId: string,
    toolId: string,
    secretName: string,
  ): Promise<boolean> {
    const now = new Date();
    const grant = await this.prisma.authorizationGrant.findFirst({
      where: {
        userId,
        type: AuthRequestType.TOOL_GRANT,
        targetId: { in: [toolId, secretName] },
        revokedAt: null,
        OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
      },
      select: { id: true },
    });
    return grant !== null;
  }
}
