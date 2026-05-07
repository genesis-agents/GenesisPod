import { Injectable, Logger, Optional } from "@nestjs/common";
import { MissionBudgetPool } from "@/modules/ai-harness/facade";
import { MissionAbortRegistry } from "@/modules/ai-harness/facade";
import { BudgetGuardService } from "../../budget/budget-guard.service";
import { BillingContext } from "../../../../../ai-infra/credits/billing-context.store";
import { withUserContext } from "../../../../../../common/context";
import { CreditsService } from "../../../../../ai-infra/credits/credits.service";
import { RuntimeEnvironmentService } from "@/modules/ai-harness/facade";
import {
  resolveBudgetMultiplier,
  resolveMissionCredits,
  resolveMissionWallTimeMs,
  type RunMissionInput,
} from "../../../dto/run-mission.dto";
import { BillingRuntimeEnvAdapter } from "@/modules/ai-harness/facade";
import { MissionStore } from "../lifecycle/mission-store.service";
import { AgentInvoker } from "../../roles";

export interface MissionRuntimeSession {
  readonly missionId: string;
  readonly userId: string;
  readonly workspaceId?: string;
  readonly billing: BillingRuntimeEnvAdapter;
  readonly pool: MissionBudgetPool;
  readonly budgetMultiplier: number;
  readonly missionAbort: AbortController;
  readonly wallTimeMs: number;
  cleanup(): void;
}

@Injectable()
export class MissionRuntimeShellService {
  private readonly log = new Logger(MissionRuntimeShellService.name);
  // 别名兼容已有调用点 (this.logger.warn ...)
  private readonly logger = this.log;

  constructor(
    private readonly invoker: AgentInvoker,
    private readonly credits: CreditsService,
    private readonly runtimeEnv: RuntimeEnvironmentService,
    private readonly store: MissionStore,
    private readonly abortRegistry: MissionAbortRegistry,
    // ★ PR-6 v1.6: BudgetGuard 可选注入（向后兼容，spec 不传也不影响）
    @Optional()
    private readonly budgetGuard?: BudgetGuardService,
  ) {}

  async openSession(args: {
    missionId: string;
    input: RunMissionInput;
    userId: string;
    workspaceId?: string;
  }): Promise<MissionRuntimeSession> {
    const { missionId, input, userId, workspaceId } = args;
    const missionAbort = this.abortRegistry.register(missionId);
    const wallTimeMs = resolveMissionWallTimeMs(input);
    this.log.log(
      `[${missionId}] mission wall-time = ${Math.round(wallTimeMs / 60000)}min ` +
        `(depth=${input.depth}, audit=${input.auditLayers}, budget=${input.budgetProfile})`,
    );

    const billing = new BillingRuntimeEnvAdapter(
      userId,
      workspaceId,
      this.credits,
      this.runtimeEnv,
    );
    const effectiveMaxCredits = resolveMissionCredits(input);
    const budgetMultiplier = resolveBudgetMultiplier(input);
    const pool = new MissionBudgetPool({
      maxTokens: effectiveMaxCredits * 1000,
      maxCostUsd: effectiveMaxCredits * 0.002,
    });

    const wallTimer = setTimeout(() => {
      // ★ P0-1 (audit 2026-05-06): 用 try-finally 保证 abortRegistry.abort 一定执行，
      //   即使 emit 失败 / abort 内部 throw 也不让 wall-timer 失效（mission 继续跑）
      try {
        this.log.warn(
          `[${missionId}] mission wall-time exceeded (${wallTimeMs}ms) - auto abort`,
        );
        void this.invoker
          .emitEvent({
            type: "agent-playground.mission:budget-warning-hard",
            missionId,
            userId,
            payload: {
              reason: "wall_time_exceeded",
              wallTimeMs,
            },
          })
          .catch((err) => {
            this.log.warn(
              `[${missionId}] wall-timer emit failed: ${err instanceof Error ? err.message : String(err)}`,
            );
          });
      } finally {
        try {
          missionAbort.abort("mission_wall_time_exceeded");
        } catch (err) {
          this.log.error(
            `[${missionId}] wall-timer abort failed: ${err instanceof Error ? err.message : String(err)}`,
          );
        }
      }
    }, wallTimeMs);
    wallTimer.unref?.();

    let heartbeatTimer: NodeJS.Timeout | null = null;
    let cleaned = false;
    const cleanup = (): void => {
      if (cleaned) return;
      cleaned = true;
      clearTimeout(wallTimer);
      if (heartbeatTimer) clearInterval(heartbeatTimer);
      this.abortRegistry.unregister(missionId);
      // ★ PR-6 v1.6 D4: mission 终态时清理 BudgetGuard 内存（防 Map 泄漏）
      try {
        this.budgetGuard?.clearBudget(missionId);
      } catch (err) {
        this.log.warn(
          `[mission-runtime ${missionId}] budgetGuard.clearBudget failed: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    };

    try {
      await this.validateModels({ missionId, userId, billing });
      await this.validateCredits({ missionId, userId, billing });

      await this.store.create({
        id: missionId,
        userId,
        workspaceId,
        topic: input.topic,
        depth: input.depth,
        language: input.language,
        maxCredits: effectiveMaxCredits,
        userProfile: {
          depth: input.depth,
          language: input.language,
          budgetProfile: input.budgetProfile,
          styleProfile: input.styleProfile,
          lengthProfile: input.lengthProfile,
          audienceProfile: input.audienceProfile,
          withFigures: input.withFigures,
          auditLayers: input.auditLayers,
          concurrency: input.concurrency,
          viewMode: input.viewMode,
          // ★ P4 (2026-05-06): maxCredits / budgetMultiplierOverride 已在 row 字段
          //   (maxCredits 行字段) 存储，userProfile 不再双写（行字段是权威源）。
          //   wallTimeMs / knowledgeBaseIds / inheritFromMissionId 仅存于此 JSON，
          //   rerun hydrator 从 userProfile 读取。
          wallTimeMs: input.wallTimeMs,
          knowledgeBaseIds: input.knowledgeBaseIds,
          inheritFromMissionId: input.inheritFromMissionId,
          // ★ PR-4' v1.6 D1 reportScale 单一轴 + D4 硬合约 withCitations 持久化
          //   不存于 row 字段，rerun hydrator 从 userProfile 读取
          reportScale: input.reportScale,
          withCitations: input.withCitations,
          parentMissionId: input.parentMissionId,
        } as Record<string, unknown>,
      });

      // ★ PR-6 v1.6 D4 BudgetGuard 初始化（atomic deduct 起点）
      //   mission 创建时填充预算池；per-dim-pipeline 内 LLM 调用前 atomic tryDeduct；
      //   mission completed/failed 时 clearBudget（在 markCompleted / markFailed 后由 caller）
      try {
        if (this.budgetGuard) {
          this.budgetGuard.initBudget(missionId, effectiveMaxCredits);
        }
      } catch (err) {
        this.logger.warn(
          `[mission-runtime ${missionId}] budgetGuard.initBudget failed: ${err instanceof Error ? err.message : String(err)}`,
        );
      }

      const podId =
        process.env.RAILWAY_REPLICA_ID ??
        process.env.HOSTNAME ??
        `local-${process.pid}`;
      void this.store.refreshHeartbeat(missionId, podId);
      heartbeatTimer = setInterval(() => {
        void this.store.refreshHeartbeat(missionId, podId);
      }, 30_000);
      heartbeatTimer.unref?.();

      return {
        missionId,
        userId,
        workspaceId,
        billing,
        pool,
        budgetMultiplier,
        missionAbort,
        wallTimeMs,
        cleanup,
      };
    } catch (err) {
      cleanup();
      throw err;
    }
  }

  async runWithinContext<T>(
    session: MissionRuntimeSession,
    fn: () => Promise<T>,
  ): Promise<T> {
    return withUserContext(session.userId, () =>
      BillingContext.run(
        {
          userId: session.userId,
          moduleType: "agent-playground",
          operationType: "team",
          referenceId: session.missionId,
        },
        fn,
      ),
    );
  }

  private async validateModels(args: {
    missionId: string;
    userId: string;
    billing: BillingRuntimeEnvAdapter;
  }): Promise<void> {
    try {
      const allModels = await args.billing.listAvailableModels();
      const healthy = allModels.filter((m) => m.available);
      if (allModels.length > 0 && healthy.length === 0) {
        const ids = allModels.map((m) => m.modelId).join(", ");
        const msg = `用户 BYOK 配置的所有模型均不可用：${ids}。请前往 设置 → 模型 检查 model id 是否真实存在 / API key 是否有效`;
        await this.invoker.emitEvent({
          type: "agent-playground.mission:rejected",
          missionId: args.missionId,
          userId: args.userId,
          payload: {
            reason: "no_healthy_model",
            availableCount: 0,
            totalCount: allModels.length,
            userMessage: msg,
          },
        });
        throw new Error(msg);
      }
      if (healthy.length === 1) {
        await this.invoker
          .emitEvent({
            type: "agent-playground.mission:warning",
            missionId: args.missionId,
            userId: args.userId,
            payload: {
              code: "SINGLE_MODEL_NO_FALLBACK",
              modelId: healthy[0].modelId,
              userMessage:
                `当前仅启用 1 个模型 (${healthy[0].modelId})，` +
                `若该模型 rate-limit 或临时故障，mission 将无 fallback。` +
                `建议在 设置 → 模型 启用 2+ 模型作为备份`,
            },
          })
          .catch(() => {});
      }
    } catch (err) {
      if (err instanceof Error && err.message.includes("BYOK 配置")) {
        throw err;
      }
    }
  }

  private async validateCredits(args: {
    missionId: string;
    userId: string;
    billing: BillingRuntimeEnvAdapter;
  }): Promise<void> {
    const credit = await args.billing.getCreditState();
    if (credit.balance <= (credit.hardLimit ?? 0)) {
      const hint = await args.billing.suggestFallback({ reason: "no_credit" });
      await this.invoker.emitEvent({
        type: "agent-playground.mission:rejected",
        missionId: args.missionId,
        userId: args.userId,
        payload: {
          reason: "no_credit",
          balance: credit.balance,
          userMessage: hint.userMessage,
        },
      });
      throw new Error(hint.userMessage ?? "Credit balance too low");
    }
  }
}
