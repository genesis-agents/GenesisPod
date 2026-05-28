import { Injectable } from "@nestjs/common";
import { AuthRequestType } from "@prisma/client";
import { PrismaService } from "../../../../common/prisma/prisma.service";
import { EXTERNAL_TOOL_DEFINITIONS } from "../../secrets/external-tool-definitions";

export interface UserToolItem {
  toolId: string;
  name: string;
  category: string;
  secretName: string;
  userConfigurable: boolean;
  /** 该用户在 secrets 表有 active 未删同名 secret */
  configured: boolean;
  /** admin 是否配了同名系统 secret（只返回 boolean，不泄露值/id） */
  systemConfigured: boolean;
  /** 该用户有未撤销未过期的 TOOL_GRANT */
  granted: boolean;
}

/**
 * 用户工具目录服务（/me/tools 端点后端）
 *
 * 安全原则：
 * - systemConfigured 只返回 boolean，绝不返回 admin secret 的 hint / value / id（安全 high-3）
 * - 批量查询避免 N+1（一次 findMany 覆盖所有 secretName / toolId）
 */
@Injectable()
export class UserToolsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * 返回用户可配置的工具目录，叠加「当前用户 Key 状态」。
   * 只列 userConfigurable !== false 且有 secretKeyName 的工具。
   */
  async listForUser(userId: string): Promise<UserToolItem[]> {
    // 1. 筛选可配置工具（跳过 noKeyRequired 和无 secretKeyName 的工具）
    const configurableTools = EXTERNAL_TOOL_DEFINITIONS.filter(
      (def) => def.userConfigurable !== false && !!def.secretKeyName,
    );

    if (configurableTools.length === 0) {
      return [];
    }

    const secretNames = configurableTools.map((d) => d.secretKeyName as string);
    const toolIds = configurableTools.map((d) => d.id);

    // 2. 批量查询用户私有 secret（一次查完，不 N+1）
    const [userSecrets, adminSecrets, grants] = await Promise.all([
      this.prisma.secret.findMany({
        where: {
          userId,
          deletedAt: null,
          name: { in: secretNames },
        },
        select: { name: true },
      }),
      // 3. 批量查询 admin 系统 secret（userId=null）——只取 boolean，不返回值
      this.prisma.secret.findMany({
        where: {
          userId: null,
          isActive: true,
          name: { in: secretNames },
        },
        select: { name: true },
      }),
      // 4. 批量查询未撤销未过期的 TOOL_GRANT
      this.prisma.authorizationGrant.findMany({
        where: {
          userId,
          type: AuthRequestType.TOOL_GRANT,
          revokedAt: null,
          targetId: { in: [...toolIds, ...secretNames] },
          OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
        },
        select: { targetId: true },
      }),
    ]);

    const userSecretSet = new Set(userSecrets.map((s) => s.name));
    const adminSecretSet = new Set(adminSecrets.map((s) => s.name));
    const grantTargetSet = new Set(grants.map((g) => g.targetId));

    return configurableTools.map((def) => {
      const secretName = def.secretKeyName as string;
      return {
        toolId: def.id,
        name: def.name,
        category: def.category,
        secretName,
        userConfigurable: true,
        configured: userSecretSet.has(secretName),
        systemConfigured: adminSecretSet.has(secretName),
        granted: grantTargetSet.has(def.id) || grantTargetSet.has(secretName),
      };
    });
  }
}
