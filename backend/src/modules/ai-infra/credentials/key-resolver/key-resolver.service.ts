import {
  Injectable,
  Logger,
  Optional,
  UnauthorizedException,
} from "@nestjs/common";
import { PrismaService } from "../../../../common/prisma/prisma.service";
import { KeyAssignmentsService } from "../key-assignments/key-assignments.service";
import { UserApiKeysService } from "../user-api-keys/user-api-keys.service";
import {
  ClassifiedError,
  KeyHealthStore,
  buildAssignedKeyId,
  buildPersonalKeyId,
  parseKeyId,
} from "../health";
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
  /**
   * KeyHealth 命名空间下的统一标识：
   *   personal:{userId}:{provider}:{label}
   *   assigned:{assignmentId}
   *   system:{secretName}
   * KeyExecutor 用此标识 markFailure / markSuccess。
   */
  healthKeyId: string;
  /** PERSONAL key 的 label，便于调用方做诊断 / log */
  label?: string;
  /** 用户自配模型：PERSONAL Key 关联的 preferredModelId（若有），
   *  用于在 chat 路由时覆盖全局默认模型。 */
  preferredModelId?: string | null;
}

/**
 * KeyChain — 有序、惰性的 key 迭代器，KeyExecutor 直接使用。
 * 失败/成功事件 fanout 到 KeyHealthStore。
 */
export interface KeyChain {
  /** 取下一个可用 key；耗尽返回 null */
  next(): Promise<ResolvedKey | null>;
  /** 当前 key 调用失败，记录并跳过 */
  reportFailure(key: ResolvedKey, classified: ClassifiedError): Promise<void>;
  /** 当前 key 调用成功，重置健康 + 设 LastGood */
  reportSuccess(key: ResolvedKey): Promise<void>;
  /** chain 总长度（filter usable 后）— 0 时调用方应抛 NoAvailableKeyError */
  readonly size: number;
  /** 已尝试的 key 数 */
  readonly triedCount: number;
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
    @Optional() private readonly keyHealthStore?: KeyHealthStore,
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
        // PR-1 兼容：resolveKey 单 key 路径不知道 label（旧 getPersonalKey 不返回），
        // 用 "default" 兜底；新调用方应改走 resolveKeyChain。
        label: "default",
        healthKeyId: buildPersonalKeyId(userId, provider, "default"),
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
        healthKeyId: buildAssignedKeyId(assigned.assignmentId),
      };
    }

    // 3. 都没有 → 明确抛错，前端据此引导到配置 / 申请页
    throw new NoAvailableKeyError(provider);
  }

  /**
   * PR-1 (2026-05-05) failover 入口：返回有序 KeyChain，包含同 user/provider 下
   * 所有 PERSONAL + ASSIGNED key（按 health 过滤后）。
   *
   * 排序：
   *   1) LastGood（如有 + 仍在可用列表中）→ 队首
   *   2) PERSONAL（label asc，"default" 优先）
   *   3) ASSIGNED
   *
   * 返回的 KeyChain 在 KeyExecutor 中遍历调用：
   *   while (key = chain.next()) {
   *     try { call(key); chain.reportSuccess(key); return; }
   *     catch (e) { chain.reportFailure(key, classify(e)); }
   *   }
   */
  async resolveKeyChain(userId: string, provider: string): Promise<KeyChain> {
    if (!userId) {
      throw new UnauthorizedException("userId is required for key resolution");
    }
    const normalizedProvider = provider.toLowerCase();

    const [personalList, assignedList] = await Promise.all([
      this.userApiKeys
        .listPersonalKeys(userId, normalizedProvider)
        .catch((err) => {
          this.logger.warn(
            `listPersonalKeys failed: ${(err as Error).message}`,
          );
          return [];
        }),
      this.keyAssignments
        .listActive(userId, normalizedProvider)
        .catch((err) => {
          this.logger.warn(
            `listActive(assignments) failed: ${(err as Error).message}`,
          );
          return [];
        }),
    ]);

    const candidates: ResolvedKey[] = [];
    for (const p of personalList) {
      candidates.push({
        source: "PERSONAL",
        apiKey: p.apiKey,
        apiEndpoint: p.apiEndpoint ?? null,
        provider: normalizedProvider,
        userId,
        label: p.label,
        healthKeyId: buildPersonalKeyId(userId, normalizedProvider, p.label),
        preferredModelId: p.preferredModelId ?? null,
      });
    }
    for (const a of assignedList) {
      candidates.push({
        source: "ASSIGNED",
        apiKey: a.apiKey,
        apiEndpoint: a.apiEndpoint,
        provider: normalizedProvider,
        userId,
        assignmentId: a.assignmentId,
        keyId: a.keyId,
        healthKeyId: buildAssignedKeyId(a.assignmentId),
      });
    }

    // health 过滤
    let usable = candidates;
    if (this.keyHealthStore) {
      const usableIds = await this.keyHealthStore.filterUsable(
        candidates.map((c) => c.healthKeyId),
      );
      const usableSet = new Set(usableIds);
      usable = candidates.filter((c) => usableSet.has(c.healthKeyId));
    }

    // LastGood 提到队首
    if (this.keyHealthStore && usable.length > 1) {
      const lastGoodId = await this.keyHealthStore.getLastGood(
        userId,
        normalizedProvider,
      );
      if (lastGoodId) {
        const idx = usable.findIndex((k) => k.healthKeyId === lastGoodId);
        if (idx > 0) {
          const [hit] = usable.splice(idx, 1);
          usable.unshift(hit);
        }
      }
    }

    return new MaterializedKeyChain(
      usable,
      this.keyHealthStore,
      normalizedProvider,
      this.prisma,
    );
  }

  // ★ 2026-05-05 严格 BYOK 模式删除：resolveSystemKey / buildSystemResolved
  //   原 ADMIN fallback 调用方已删除（resolveKey 现在 PERSONAL/ASSIGNED 都
  //   无时直接 throw NoAvailableKeyError）。SYSTEM key 仅由
  //   ai-model-config.resolveApiKey 在"无 userId 上下文"分支自行查 secrets，
  //   不通过 KeyResolver 入口，避免被 user 调用链命中。
}

/**
 * ★ 2026-05-06: 业务流量调用上游成功/失败时，把状态写到对应 DB 行：
 *   personal:* → user_api_keys 表（按 userId+provider+label 命中）
 *   system:*   → secret_keys 表（找 secret.name 下首条 active SecretKey）
 *   assigned:* → 暂不写（KeyAssignment 自有用量记账）
 *
 * 这是为了让 admin / BYOK UI 看到的"上次活动状态/时间"能反映真实业务流量，
 * 而不是只反映"上次手动按 Test 按钮"。失败 try-catch 不抛，避免阻塞调用链。
 */
async function persistDbHealthOutcome(
  prisma: PrismaService,
  healthKeyId: string,
  outcome: { ok: true } | { ok: false; classified: ClassifiedError },
  logger: Logger,
): Promise<void> {
  const parsed = parseKeyId(healthKeyId);
  if (!parsed) return;
  const now = new Date();
  try {
    if (parsed.type === "personal") {
      const { userId, provider, label } = parsed;
      if (!userId || !provider || !label) return;
      if (outcome.ok) {
        await prisma.userApiKey.update({
          where: { userId_provider_label: { userId, provider, label } },
          data: {
            testStatus: "success",
            lastTestedAt: now,
            lastErrorCode: null,
            lastErrorMessage: null,
            usageCount: { increment: 1 },
          },
        });
      } else {
        await prisma.userApiKey.update({
          where: { userId_provider_label: { userId, provider, label } },
          data: {
            testStatus: "failed",
            lastTestedAt: now,
            lastErrorCode: outcome.classified.reason.slice(0, 40),
            lastErrorMessage: outcome.classified.originalMessage.slice(0, 500),
          },
        });
      }
    } else if (parsed.type === "system") {
      // SYSTEM key 当前由 ai-model-config 直接查 secrets 用，不走 KeyResolver。
      // 留 hook 给将来 system 路径接入：找 Secret.name → 首个 active SecretKey 行。
      // 暂不实现，避免没人触发的死代码。
    }
    // assigned 类型用量在 KeyAssignment 自有 usage log，跳过这里
  } catch (e) {
    logger.warn(
      `[persistDbHealthOutcome ${healthKeyId}] DB write failed (non-fatal): ${
        e instanceof Error ? e.message : String(e)
      }`,
    );
  }
}

/**
 * 物化 KeyChain：候选 key 在 resolveKeyChain 一次性 fetch 完成后传入，
 * next() 仅做指针推进，O(1) 不再 hit DB。
 */
class MaterializedKeyChain implements KeyChain {
  private cursor = 0;
  private _triedCount = 0;
  private readonly logger = new Logger(MaterializedKeyChain.name);

  constructor(
    private readonly keys: ResolvedKey[],
    private readonly healthStore: KeyHealthStore | undefined,
    private readonly provider: string,
    private readonly prisma: PrismaService,
  ) {}

  get size(): number {
    return this.keys.length;
  }

  get triedCount(): number {
    return this._triedCount;
  }

  async next(): Promise<ResolvedKey | null> {
    if (this.cursor >= this.keys.length) return null;
    const k = this.keys[this.cursor++];
    this._triedCount++;
    return k;
  }

  async reportFailure(
    key: ResolvedKey,
    classified: ClassifiedError,
  ): Promise<void> {
    // 1. in-memory 健康熔断（fallback chain 决策用）
    if (this.healthStore) {
      await this.healthStore.markFailure(
        key.healthKeyId,
        classified,
        this.provider,
      );
    }
    // 2. ★ 2026-05-06: 写 DB 持久化健康（UI 显示"上次使用 / 错误码"用）
    await persistDbHealthOutcome(
      this.prisma,
      key.healthKeyId,
      { ok: false, classified },
      this.logger,
    );
  }

  async reportSuccess(key: ResolvedKey): Promise<void> {
    if (this.healthStore) {
      await this.healthStore.markSuccess(
        key.healthKeyId,
        this.provider,
        key.userId,
      );
    }
    // ★ 2026-05-06: 同上，业务流量成功也写 DB
    await persistDbHealthOutcome(
      this.prisma,
      key.healthKeyId,
      { ok: true },
      this.logger,
    );
  }
}
