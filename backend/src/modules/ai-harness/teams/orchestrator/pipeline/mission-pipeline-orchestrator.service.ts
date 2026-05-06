/**
 * MissionPipelineOrchestrator — pipeline 执行引擎（v5.1 §3.2 R1-B）
 *
 * 责任：
 *   1. 解析 PipelineConfig：roleId → ResolvedRole；primitive id → IStagePrimitive
 *   2. 顺序执行 steps：每 step 调 primitive.run(args)
 *   3. 维护 stage outputs（按 step.id 索引），传给后续 step.previousOutputs
 *   4. CrossStageState 跨 step 共享（v5.1 §3.4 P0-F）
 *   5. emit MissionEvent（启停 / 每 step 结果）
 *   6. timeout / abort / StageAbortError 处理
 *   7. resume 入口：从 lastCompletedStage+1 续跑（v5.1 §3.4 崩溃 resume）
 *
 * 依赖注入（构造期）：
 *   - registry: MissionPipelineRegistry
 *
 * 不依赖 plugins/core HookBus（PR-11 PluginCoreModule 之后的扩展任务）；
 * 但本 orchestrator 自己 emit MissionEvent，业务监听者可订阅。
 */
import { Injectable, Logger } from "@nestjs/common";
import { CrossStageState } from "../../services/stages/abstractions";
import {
  type MissionContext,
  type ResolvedRole,
  StageAbortError,
} from "../../services/stages/abstractions";
import { MissionPipelineRegistry } from "./mission-pipeline-registry.service";
import {
  type MissionPipelineConfig,
  type ResolvedPipelineStep,
} from "./mission-pipeline-config";

/**
 * MissionEvent — orchestrator 在执行流中 emit 的事件
 */
export interface MissionEvent {
  readonly type:
    | "mission:started"
    | "mission:completed"
    | "mission:failed"
    | "mission:aborted"
    | "stage:started"
    | "stage:completed"
    | "stage:failed"
    /** ★ 2026-05-06 (A-6): 软失败信号，stage 内部 catch 决定不阻断但要让用户可见 */
    | "stage:degraded"
    /** ★ 2026-05-06 (A-9): watchdog 检测到 stage 卡顿（started 后超过阈值未完成）*/
    | "stage:stalled";
  readonly missionId: string;
  readonly stepId?: string;
  readonly primitive?: string;
  readonly output?: unknown;
  readonly error?: unknown;
  readonly timestamp: number;
  /** stage:degraded / stage:stalled 携带的额外信息 */
  readonly reason?: string;
  readonly elapsedMs?: number;
}

/**
 * Mission 执行结果
 */
export interface MissionResult {
  readonly missionId: string;
  readonly status: "completed" | "failed" | "aborted";
  readonly stageOutputs: Readonly<Record<string, unknown>>;
  readonly crossStageState: Readonly<Record<string, unknown>>;
  readonly error?: unknown;
}

/**
 * Run 输入参数
 */
export interface RunPipelineArgs<TInput = unknown> {
  readonly missionId: string;
  readonly pipelineId: string;
  readonly input: TInput;
  readonly userId?: string;
  readonly tenantId?: string;
  readonly signal?: AbortSignal;
  /** resume 入口：从该 stepId 之后开始（含已有的 stageOutputs / crossStageState）*/
  readonly resumeFromStepId?: string;
  readonly initialStageOutputs?: Readonly<Record<string, unknown>>;
  readonly initialCrossStageState?: Readonly<Record<string, unknown>>;
  /** event listener（每个 MissionEvent emit 时调用）*/
  readonly onEvent?: (event: MissionEvent) => void | Promise<void>;
}

@Injectable()
export class MissionPipelineOrchestrator {
  private readonly logger = new Logger(MissionPipelineOrchestrator.name);

  constructor(private readonly registry: MissionPipelineRegistry) {}

  /**
   * 执行一个 mission 的完整 pipeline
   */
  async run<TInput = unknown>(
    args: RunPipelineArgs<TInput>,
  ): Promise<MissionResult> {
    const config = this.registry.get(args.pipelineId);
    const resolvedSteps = this.resolveSteps(config);

    const stageOutputs: Record<string, unknown> = {
      ...(args.initialStageOutputs ?? {}),
    };
    const crossStageState = CrossStageState.fromJSON(
      args.initialCrossStageState ?? {},
    );

    // resume 起点
    let startIndex = 0;
    if (args.resumeFromStepId) {
      const idx = resolvedSteps.findIndex(
        (s) => s.step.id === args.resumeFromStepId,
      );
      if (idx === -1) {
        throw new Error(
          `[MissionPipelineOrchestrator] resumeFromStepId "${args.resumeFromStepId}" not in pipeline`,
        );
      }
      startIndex = idx + 1; // 从该 step 之后开始
    }

    const ctx: MissionContext<TInput> = {
      missionId: args.missionId,
      userId: args.userId,
      tenantId: args.tenantId,
      input: args.input,
      statefulRoleStates: {},
      signal: args.signal,
    };

    await this.emit(args.onEvent, {
      type: "mission:started",
      missionId: args.missionId,
      timestamp: Date.now(),
    });

    try {
      for (let i = startIndex; i < resolvedSteps.length; i++) {
        // signal 检查
        if (args.signal?.aborted) {
          throw new StageAbortError(
            resolvedSteps[i].step.id,
            "mission cancelled (signal aborted)",
          );
        }

        const resolved = resolvedSteps[i];
        const output = await this.runStep(
          resolved,
          ctx,
          crossStageState,
          stageOutputs,
          args.onEvent,
        );
        stageOutputs[resolved.step.id] = output;
      }

      await this.emit(args.onEvent, {
        type: "mission:completed",
        missionId: args.missionId,
        timestamp: Date.now(),
      });
      return {
        missionId: args.missionId,
        status: "completed",
        stageOutputs,
        crossStageState: crossStageState.toJSON(),
      };
    } catch (err) {
      const isAbort = err instanceof StageAbortError;
      await this.emit(args.onEvent, {
        type: isAbort ? "mission:aborted" : "mission:failed",
        missionId: args.missionId,
        error: err,
        timestamp: Date.now(),
      });
      return {
        missionId: args.missionId,
        status: isAbort ? "aborted" : "failed",
        stageOutputs,
        crossStageState: crossStageState.toJSON(),
        error: err,
      };
    }
  }

  /**
   * 解析 PipelineConfig 中所有 step（启动期一次性把 primitive + role 解析好）
   */
  private resolveSteps(config: MissionPipelineConfig): ResolvedPipelineStep[] {
    const roleById = new Map<string, ResolvedRole>();
    for (const r of config.roles) {
      roleById.set(r.id, {
        id: r.id,
        skillSpec: r.skillSpec,
        stateful: r.stateful ?? false,
      });
    }

    return config.steps.map((step) => ({
      step,
      primitive: this.registry.resolvePrimitive(step.primitive),
      role: step.roleId ? roleById.get(step.roleId) : undefined,
      timeoutMs: step.timeoutMs ?? config.defaultStepTimeoutMs,
    }));
  }

  /**
   * 执行单个 step（含 timeout + event emit）
   */
  private async runStep(
    resolved: ResolvedPipelineStep,
    ctx: MissionContext,
    crossStageState: CrossStageState,
    stageOutputs: Readonly<Record<string, unknown>>,
    onEvent?: RunPipelineArgs["onEvent"],
  ): Promise<unknown> {
    const { step, primitive, role, timeoutMs } = resolved;

    const stageStartedAt = Date.now();
    await this.emit(onEvent, {
      type: "stage:started",
      missionId: ctx.missionId,
      stepId: step.id,
      primitive: step.primitive,
      timestamp: stageStartedAt,
    });

    // ★ 2026-05-06 (A-9 watchdog): stage:started 后 stallThresholdMs（默认 timeoutMs ×
    //   1.5 / 兜底 15min）未到 stage:completed/failed → emit stage:stalled 警告（不杀，
    //   仅可见性）。覆盖 stage 内部 LLM 卡死但未抛错的盲区。
    const stallThresholdMs = Math.max(
      timeoutMs ? Math.floor(timeoutMs * 1.5) : 15 * 60 * 1000,
      60_000,
    );
    // ★ 全覆盖审计修 (2026-05-06): stageDone 防止 stallTimer 与 try/catch 双路竞态。
    //   try 末尾或 catch 分支都设 stageDone=true + clearTimeout；
    //   stallTimer callback 先检查 !stageDone 再 emit，避免 stage 已正常结束后仍
    //   触发 stage:stalled（P0 竞态修复）。
    let stageDone = false;
    const stallTimer = setTimeout(() => {
      if (stageDone) return; // stage 已完成，不触发 stall
      void this.emit(onEvent, {
        type: "stage:stalled",
        missionId: ctx.missionId,
        stepId: step.id,
        primitive: step.primitive,
        elapsedMs: Date.now() - stageStartedAt,
        reason: `stage 在 ${Math.round(stallThresholdMs / 60_000)} 分钟内未完成`,
        timestamp: Date.now(),
      }).catch(() => undefined);
    }, stallThresholdMs);
    (stallTimer as { unref?: () => void }).unref?.();

    try {
      // primitive.run 期望 ResolvedRole；step 没指定 role 时用 placeholder
      const roleArg: ResolvedRole = role ?? {
        id: "_no-role",
        stateful: false,
        skillSpec: {
          id: "_no-role",
          systemPrompt: "",
          allowedToolIds: [],
          allowedModels: [],
          // outputSchema 需要 zod 实例；用 unknown 类型 bypass（primitive 不会真校验）
          outputSchema: { safeParse: () => ({ success: true }) } as never,
          meta: {},
        },
      };

      const runPromise = primitive.run({
        ctx,
        role: roleArg,
        config: step,
        hooks: step.hooks ?? {},
        crossStageState,
        previousOutputs: stageOutputs,
      });

      const output = await this.withTimeout(runPromise, timeoutMs, step.id);

      // ★ 全覆盖审计修 (2026-05-06): 正常完成路径设 stageDone=true + clearTimeout
      stageDone = true;
      clearTimeout(stallTimer);
      await this.emit(onEvent, {
        type: "stage:completed",
        missionId: ctx.missionId,
        stepId: step.id,
        primitive: step.primitive,
        output,
        timestamp: Date.now(),
      });
      return output;
    } catch (err) {
      // ★ 全覆盖审计修 (2026-05-06): catch 路径也设 stageDone=true + clearTimeout
      stageDone = true;
      clearTimeout(stallTimer);
      await this.emit(onEvent, {
        type: "stage:failed",
        missionId: ctx.missionId,
        stepId: step.id,
        primitive: step.primitive,
        error: err,
        timestamp: Date.now(),
      });
      throw err;
    }
  }

  /** 包装 timeout race，超时抛 StageAbortError */
  private async withTimeout<T>(
    promise: Promise<T>,
    timeoutMs: number | undefined,
    stepId: string,
  ): Promise<T> {
    if (!timeoutMs) return promise;
    let timer: NodeJS.Timeout | undefined;
    try {
      return (await Promise.race([
        promise,
        new Promise<never>((_, reject) => {
          timer = setTimeout(() => {
            reject(
              new StageAbortError(stepId, `stage timeout after ${timeoutMs}ms`),
            );
          }, timeoutMs);
          (timer as { unref?: () => void }).unref?.();
        }),
      ])) as T;
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  /** event emit 包装：吞掉 listener 异常防止影响 mission 主流程 */
  private async emit(
    onEvent: RunPipelineArgs["onEvent"],
    event: MissionEvent,
  ): Promise<void> {
    if (!onEvent) return;
    try {
      await onEvent(event);
    } catch (err) {
      this.logger.warn(
        `[MissionPipelineOrchestrator] event listener threw: ${String(err)}`,
      );
    }
  }
}

/** 仅给 step 一个 placeholder skillSpec（避免 type-only export 冲突） */
export type _RoleArg = ResolvedRole;
