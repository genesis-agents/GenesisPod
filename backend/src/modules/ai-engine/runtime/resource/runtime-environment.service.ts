/**
 * RuntimeEnvironmentService — L2 AI Engine 运行时环境发现（通用）
 *
 * 设计文档：docs/design/topic-insights-harness-redesign/11-capability-discovery.md
 *
 * 职责：
 * - 只回答"当前 AI Engine 基础设施客观有什么"：
 *   模型（AIModel 表）/ agent（L2 AgentRegistry）/ tool（L2 ToolRegistry）/
 *   skill（L2 SkillRegistry）/ 用户 key / 外部依赖
 * - **不**含任何 AI App 特定概念（没有 "harness"、"topic-insights"、"research-depth"）
 * - tablesExist() 接受通用表名数组，不硬编码 App 私有表
 *
 * 各 L3 App 自己在 CapabilityReconciler 里把本服务输出映射到 App 语义。
 *
 * 所有外部依赖 @Optional：单组件失败降级不抛错，partial snapshot 胜于 no snapshot。
 */

import { Injectable, Logger, Optional } from "@nestjs/common";
import { PrismaService } from "../../../../common/prisma/prisma.service";
import { AgentRegistry } from "../../agents/registry/agent-registry";
import { ToolRegistry } from "../../tools/registry/tool-registry";
import { SkillRegistry } from "../../skills/registry/skill-registry";
import { SpecAgentRegistry } from "../../harness/core/spec-agent-registry";
import { AiChatModelConfigService } from "../../llm/services/ai-chat-model-config.service";
import type {
  EnvironmentSnapshot,
  EnvironmentSnapshotParams,
  RuntimeModelCapability,
  RuntimeModelType,
  RuntimeToolCapability,
} from "./runtime-environment.types";

const CACHE_TTL_MS = 30_000;

interface CacheEntry {
  readonly snapshot: EnvironmentSnapshot;
  readonly expiresAt: number;
}

@Injectable()
export class RuntimeEnvironmentService {
  private readonly logger = new Logger(RuntimeEnvironmentService.name);
  private readonly cache = new Map<string, CacheEntry>();

  constructor(
    @Optional() private readonly prisma?: PrismaService,
    @Optional() private readonly agentRegistry?: AgentRegistry,
    @Optional() private readonly toolRegistry?: ToolRegistry,
    @Optional() private readonly skillRegistry?: SkillRegistry,
    @Optional() private readonly specAgentRegistry?: SpecAgentRegistry,
    @Optional()
    private readonly modelConfigService?: AiChatModelConfigService,
  ) {
    // P1-5: registry @Optional 是为了单元测试（没完整 DI 图）简单；
    // 生产环境（AppModule 完整组装）下这些必须到位，否则 snapshot 数据残缺。
    // 启动日志里 warn 缺项，帮助排查。
    if (!this.prisma) {
      this.logger.warn(
        "PrismaService missing — models & DB schema discovery disabled",
      );
    }
    if (!this.agentRegistry) {
      this.logger.warn(
        "AgentRegistry missing — env.agents will be empty (caller should ensure AiEngineOrchestrationModule is imported)",
      );
    }
    if (!this.toolRegistry) {
      this.logger.warn(
        "ToolRegistry missing — env.tools will be empty (caller should ensure AiEngineToolsModule is imported)",
      );
    }
    if (!this.skillRegistry) {
      this.logger.warn(
        "SkillRegistry missing — env.skills will be empty (caller should ensure AiEngineSkillsModule is imported)",
      );
    }
  }

  async snapshot(
    params: EnvironmentSnapshotParams,
  ): Promise<EnvironmentSnapshot> {
    const key = params.userId;
    if (!params.force) {
      const cached = this.cache.get(key);
      if (cached && cached.expiresAt > Date.now()) return cached.snapshot;
    }

    const [models, tools] = await Promise.all([
      this.discoverModels(),
      this.discoverTools(),
    ]);
    const agents = this.discoverAgents();
    const skills = this.discoverSkills();
    const userKeys = this.discoverUserKeys(params.userId);
    const externalDeps = this.discoverExternalDeps();

    const snapshot: EnvironmentSnapshot = {
      generatedAt: new Date().toISOString(),
      userId: params.userId,
      models,
      agents,
      tools,
      skills,
      userKeys,
      externalDeps,
    };
    this.cache.set(key, { snapshot, expiresAt: Date.now() + CACHE_TTL_MS });

    this.logger.log(
      `snapshot user=${params.userId} ` +
        `models=[CHAT:${models.CHAT.length},REAS:${models.REASONING.length},EMB:${models.EMBEDDING.length}] ` +
        `agents=${agents.length} tools=${tools.filter((t) => t.enabled).length}/${tools.length}`,
    );
    return snapshot;
  }

  /**
   * 通用 DB 表存在性探测。Caller 传表名数组，返回每个表是否存在。
   * 不含任何 App 特定表名；由 caller 决定关心哪些表。
   */
  async tablesExist(names: string[]): Promise<Record<string, boolean>> {
    const result: Record<string, boolean> = {};
    for (const n of names) result[n] = false;
    if (!this.prisma || names.length === 0) return result;

    try {
      const rows = await this.prisma.$queryRawUnsafe<
        Array<{ table_name: string }>
      >(
        `SELECT table_name FROM information_schema.tables
         WHERE table_schema = 'public' AND table_name = ANY($1)`,
        names,
      );
      const present = new Set(rows.map((r) => r.table_name));
      for (const n of names) result[n] = present.has(n);
    } catch (err) {
      this.logger.warn(
        `tablesExist failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
    return result;
  }

  invalidate(userId?: string): void {
    if (!userId) {
      this.cache.clear();
      return;
    }
    this.cache.delete(userId);
  }

  // ================== Discovery ==================

  private async discoverModels(): Promise<EnvironmentSnapshot["models"]> {
    const empty = {
      CHAT: [] as RuntimeModelCapability[],
      REASONING: [] as RuntimeModelCapability[],
      EMBEDDING: [] as RuntimeModelCapability[],
      VISION: [] as RuntimeModelCapability[],
    };
    if (!this.prisma) return empty;

    try {
      const rows = await this.prisma.aIModel.findMany({
        where: { isEnabled: true },
        select: {
          modelId: true,
          provider: true,
          modelType: true,
          maxTokens: true,
          // AIModel.isReasoning 是操作员在管理后台勾选的事实声明，之前被
          // discoverModels 遗漏，导致 reconciler 把 gpt-5 / o1 / deepseek-r1
          // 等已明确标 isReasoning=true 的模型错误地只归到 CHAT 桶。
          isReasoning: true,
          // supportsVision 是 VISION 桶的唯一权威来源：DB AIModelType enum
          // 不含 VISION，只有通过 supportsVision=true 才能识别多模态模型。
          supportsVision: true,
        },
      });

      // 最近 1 小时错误率（ai_engine_metrics 表可能不存在，包 try）
      const since = new Date(Date.now() - 60 * 60 * 1000);
      let errorMap = new Map<string, { calls: number; errors: number }>();
      try {
        const errorRows = await this.prisma.$queryRawUnsafe<
          Array<{ model_id: string; calls: bigint; errors: bigint }>
        >(
          `SELECT model_id,
                  COUNT(*)::bigint AS calls,
                  COUNT(*) FILTER (WHERE success = false)::bigint AS errors
           FROM ai_engine_metrics
           WHERE created_at >= $1 AND model_id IS NOT NULL
           GROUP BY model_id`,
          since,
        );
        errorMap = new Map(
          errorRows.map((r) => [
            r.model_id,
            { calls: Number(r.calls), errors: Number(r.errors) },
          ]),
        );
      } catch {
        // ai_engine_metrics 可能不存在；所有模型视为 healthy
      }

      const result: {
        CHAT: RuntimeModelCapability[];
        REASONING: RuntimeModelCapability[];
        EMBEDDING: RuntimeModelCapability[];
        VISION: RuntimeModelCapability[];
      } = { CHAT: [], REASONING: [], EMBEDDING: [], VISION: [] };
      for (const row of rows) {
        const s = errorMap.get(row.modelId);
        const errorRate = s && s.calls > 0 ? s.errors / s.calls : undefined;
        const cap: RuntimeModelCapability = {
          modelId: row.modelId,
          provider: row.provider,
          modelType: row.modelType as RuntimeModelType,
          contextWindow: row.maxTokens,
          costTier: inferCostTier(row.modelId),
          healthy: errorRate === undefined || errorRate < 0.5,
          recentErrorRate: errorRate,
        };
        const bucket = result[row.modelType as RuntimeModelType];
        if (bucket) bucket.push(cap);

        // Reasoning is a *capability*, not an exclusive enum value:
        // 1. DB `AIModelType` enum has no REASONING member — operators mark
        //    reasoning models as CHAT + `isReasoning=true`.
        // 2. A single model (gpt-5 / o1 / claude-4 / deepseek-r1) serves
        //    both plain CHAT calls and reasoning calls; a reconciler that
        //    reads only `modelType` will always report REAS:0 even when
        //    the user has explicitly enabled a reasoning model.
        //
        // Resolution: the DB `isReasoning` boolean is the operator-declared
        // truth. When absent, fall back to the shared
        // AiChatModelConfigService.isReasoningModel() which already knows
        // the o1/o3/gpt-5/deepseek-r1/gemini-2.5/*-thinking families.
        // Mirror the capability into the REASONING bucket additively — the
        // CHAT bucket entry stays so chat callers see the same model.
        const isReasoning =
          row.isReasoning === true ||
          (row.isReasoning !== false &&
            (this.modelConfigService?.isReasoningModel(row.modelId) ?? false));
        if (
          isReasoning &&
          !result.REASONING.some((m) => m.modelId === row.modelId)
        ) {
          result.REASONING.push({ ...cap, modelType: "REASONING" });
        }

        // Vision 与 reasoning 同理：AIModelType enum 无 VISION 成员，
        // 操作员通过 supportsVision=true 声明多模态模型。CHAT 桶保留，
        // VISION 桶 additive 填充——Reconciler 读 VISION 时可以拿到候选。
        if (
          row.supportsVision === true &&
          !result.VISION.some((m) => m.modelId === row.modelId)
        ) {
          result.VISION.push({ ...cap, modelType: "VISION" });
        }
      }
      return result;
    } catch (err) {
      this.logger.warn(
        `discoverModels failed: ${err instanceof Error ? err.message : String(err)}`,
      );
      return empty;
    }
  }

  private discoverAgents(): string[] {
    // 合并 legacy AgentRegistry（plan-based agents）+ 新 SpecAgentRegistry（spec agents）
    const ids = new Set<string>();
    if (this.agentRegistry) {
      try {
        for (const id of this.agentRegistry.getAllIds()) ids.add(id);
      } catch {
        // ignore
      }
    }
    if (this.specAgentRegistry) {
      try {
        for (const id of this.specAgentRegistry.getAllIds()) ids.add(id);
      } catch {
        // ignore
      }
    }
    return [...ids];
  }

  private discoverTools(): Promise<RuntimeToolCapability[]> {
    if (!this.toolRegistry) return Promise.resolve([]);
    try {
      const tools = this.toolRegistry.getAll();
      return Promise.resolve(
        tools.map((t) => ({
          toolId: t.id,
          name: t.name,
          category: t.category,
          enabled: t.enabled !== false,
          // MVP: 以 enabled 作为 healthy；后续接入各 tool 自己的 health probe
          healthy: t.enabled !== false,
        })),
      );
    } catch (err) {
      this.logger.warn(
        `discoverTools failed: ${err instanceof Error ? err.message : String(err)}`,
      );
      return Promise.resolve([]);
    }
  }

  private discoverSkills(): string[] {
    if (!this.skillRegistry) return [];
    try {
      // BaseRegistry.getAll returns ISkill[]; we map to id strings
      return this.skillRegistry.getAll().map((s) => s.id);
    } catch {
      return [];
    }
  }

  private discoverUserKeys(_userId: string): EnvironmentSnapshot["userKeys"] {
    // KeyResolverService 暂不注入（模块依赖待梳理）；先返回保守值：
    // - 无 BYOK（避免误判）
    // - sharedKey 假设可用（AiChatService 自己兜底）
    // 后续接入：
    //   - hasByok / byokProviders ← KeyResolverService.resolveForUser
    //   - sharedKeyAvailable ← SecretsService.probeSystemKey
    return {
      hasByok: false,
      byokProviders: [],
      sharedKeyAvailable: true,
    };
  }

  private discoverExternalDeps(): EnvironmentSnapshot["externalDeps"] {
    // MVP：不主动 probe（避免启动给外部服务打探测请求）。
    // 后续由 HealthCheckRunner 周期刷新 + 各 service 暴露状态。
    const now = new Date().toISOString();
    return {
      tavily: { healthy: true, checkedAt: now, note: "not probed (MVP)" },
      duckduckgo: { healthy: true, checkedAt: now, note: "not probed (MVP)" },
      rag: { healthy: true, checkedAt: now, note: "not probed (MVP)" },
      redis: { healthy: true, checkedAt: now, note: "not probed (MVP)" },
    };
  }
}

function inferCostTier(modelId: string): "cheap" | "standard" | "premium" {
  const m = modelId.toLowerCase();
  if (m.includes("mini") || m.includes("nano") || m.includes("haiku"))
    return "cheap";
  if (m.includes("opus") || m.includes("4.7") || m.includes("4-7"))
    return "premium";
  return "standard";
}
