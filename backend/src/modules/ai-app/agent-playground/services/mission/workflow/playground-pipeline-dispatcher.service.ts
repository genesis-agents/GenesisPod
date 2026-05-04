/**
 * PlaygroundPipelineDispatcher —— v5.1 R2-A.1 新轨入口
 *
 * 职责：
 *   - 与 TeamMission 同签名（runMission(missionId, input, userId, workspaceId?)）
 *   - 复用 MissionRuntimeShellService.openSession（保持 billing / pool / abort
 *     / heartbeat / DB record / model+credit 校验完全一致）
 *   - 走 MissionPipelineOrchestrator 跑新轨 14 step（hooks 由本 service 通过
 *     buildPipelineWithHooks 注入闭包，闭包从 dispatcher session map 取 session
 *     上下文 + delegate 到 stage adapter）
 *   - cleanup session（成功 / 失败都释放 abort registry / heartbeat timer）
 *
 * R2-A.1 阶段：14 个 stage hook 暂为 NotYetWired，pipeline-v1 路径调用会快速 fail
 * 在 s1。Controller 层尚未接入 flag dispatch（R2-A.3 上线），所以本 service 当前
 * 只能由 spec 显式调用，生产流量仍走 TeamMission。
 *
 * R2-A.2~A.13 增量替换 14 个 stage hook 的 NotYetWired 为真实 thin adapter
 * （adapter 内部调既有 runXxxStage 函数）。
 *
 * 设计要点（与 writing-team service 一致 closure pattern）：
 *   - PLAYGROUND_PIPELINE 在 onModuleInit 注册一次 + hooks 闭包引用 this
 *   - per-mission session 存放在 sessions Map (active mission 期间)，
 *     hook 闭包通过 ctx.missionId 反查；mission 结束清掉 entry
 *   - 并发安全：每 mission 一个独立 session entry，hook 不共享状态
 */
import { Injectable, Logger, OnModuleInit } from "@nestjs/common";
import {
  MissionPipelineOrchestrator,
  MissionPipelineRegistry,
  type MissionPipelineConfig,
  type ResolvedStageHooks,
  type StageRunArgs,
} from "@/modules/ai-harness/facade";
import {
  MissionRuntimeShellService,
  type MissionRuntimeSession,
} from "./mission-runtime-shell.service";
import {
  PLAYGROUND_PIPELINE,
  PlaygroundHookNotYetWiredError,
} from "../../../playground.config";
import { type RunMissionInput } from "../../../dto/run-mission.dto";

/**
 * Mission 跑完后给 caller 的最小快照。pipeline-v1 路径暂时只回 missionId +
 * status；report / verdicts 等生产 schema 等 R2-A.5 等价 spec 通过后再扩。
 */
export interface PipelineMissionSummary {
  readonly missionId: string;
  readonly status: "completed" | "failed" | "aborted";
  readonly stageOutputs: Readonly<Record<string, unknown>>;
  readonly error?: unknown;
}

@Injectable()
export class PlaygroundPipelineDispatcher implements OnModuleInit {
  private readonly log = new Logger(PlaygroundPipelineDispatcher.name);

  /** active mission session 表：hook 闭包通过 missionId 反查 */
  private readonly sessions = new Map<string, MissionRuntimeSession>();

  constructor(
    private readonly registry: MissionPipelineRegistry,
    private readonly orchestrator: MissionPipelineOrchestrator,
    private readonly runtimeShell: MissionRuntimeShellService,
  ) {}

  onModuleInit(): void {
    if (this.registry.has(PLAYGROUND_PIPELINE.id)) return;
    this.registry.register(this.buildPipelineWithHooks());
    this.log.log(
      `[playground-pipeline] registered "${PLAYGROUND_PIPELINE.id}" (14 step / hooks=NotYetWired)`,
    );
  }

  /**
   * spec / runtime 用：取出指定 missionId 的 session（hook 闭包内部用）。
   * 不存在抛错（说明 hook 在 mission 生命周期外被调用，是 bug）。
   */
  getSession(missionId: string): MissionRuntimeSession {
    const s = this.sessions.get(missionId);
    if (!s) {
      throw new Error(
        `[playground-pipeline] no active session for mission ${missionId}`,
      );
    }
    return s;
  }

  /**
   * 跑一次 mission（与 TeamMission.runMission 同签名）。
   *
   * 1. shell.openSession 起 billing / pool / abort / heartbeat
   * 2. orchestrator.run 跑 14 step（每 step 走 hook 闭包）
   * 3. cleanup session
   * 4. 返回最小快照
   */
  async runMission(
    missionId: string,
    input: RunMissionInput,
    userId: string,
    workspaceId?: string,
  ): Promise<PipelineMissionSummary> {
    const session = await this.runtimeShell.openSession({
      missionId,
      input,
      userId,
      workspaceId,
    });
    this.sessions.set(missionId, session);
    try {
      return await this.runtimeShell.runWithinContext(session, async () => {
        const result = await this.orchestrator.run({
          missionId,
          pipelineId: PLAYGROUND_PIPELINE.id,
          input,
          userId,
          tenantId: workspaceId,
          signal: session.missionAbort.signal,
        });
        return {
          missionId: result.missionId,
          status: result.status,
          stageOutputs: result.stageOutputs,
          error: result.error,
        };
      });
    } finally {
      this.sessions.delete(missionId);
      session.cleanup();
    }
  }

  // ── pipeline 构造 ──────────────────────────────────────────────────────

  /**
   * 构造含 hook 闭包的 pipeline config。每 hook 闭包：
   *   - 通过 args.ctx.missionId 反查 session（用于访问 billing / pool / abort）
   *   - delegate 到 stageHandlers 里对应方法
   *
   * R2-A.1 占位：所有 stageHandlers 暂抛 PlaygroundHookNotYetWiredError；
   * R2-A.2~A.13 替换为真实 adapter 调既有 runXxxStage。
   */
  private buildPipelineWithHooks(): MissionPipelineConfig {
    const stepHooks: Record<string, ResolvedStageHooks> = {};
    for (const step of PLAYGROUND_PIPELINE.steps) {
      stepHooks[step.id] = this.buildHooksForStep(step.id, step.primitive);
    }
    return {
      ...PLAYGROUND_PIPELINE,
      steps: PLAYGROUND_PIPELINE.steps.map((s) => ({
        ...s,
        hooks: stepHooks[s.id] ?? {},
      })),
    };
  }

  /**
   * 给单个 step 构造 hook 闭包集合。每个 primitive 期望的 hook 名字不同：
   *   plan / signoff       → runRole
   *   research             → runRole + (perItemPipeline)
   *   assess               → runRole
   *   synthesize           → runMode
   *   draft                → draftOnce
   *   review               → runRole / objectiveEval
   *   persist              → onPersist
   *   learn                → onLearn
   *
   * 全部 hook 现在都 throw NotYetWired；R2-A.2 起逐个替换。
   */
  private buildHooksForStep(
    stepId: string,
    primitive: string,
  ): ResolvedStageHooks {
    const notYetWired = (hookName: string) => {
      return (_args: unknown) => {
        throw new PlaygroundHookNotYetWiredError(stepId, hookName);
      };
    };

    // 各 primitive 必填的 hook 名（与 ai-harness/teams/services/stages/* 一致；
    //   未列出 = optional，缺失不抛错）
    const requiredHooks: Record<string, ReadonlyArray<string>> = {
      plan: ["runRole"],
      research: ["fanOut", "perItemPipeline"],
      assess: ["runRole", "parseDecision"],
      synthesize: ["synthesize"],
      draft: ["draftOnce"],
      review: ["review"],
      signoff: ["runRole"],
      persist: ["persist"],
      learn: [], // postmortemClassifier / memoryConsolidation 都是 optional
    };

    const hooks: ResolvedStageHooks = {};
    const required = requiredHooks[primitive] ?? [];
    for (const name of required) {
      (hooks as Record<string, unknown>)[name] = notYetWired(name);
    }
    return hooks;
  }
}

/**
 * 让 hook 闭包能访问 dispatcher 的便捷类型；R2-A.2~A.13 实现 stage adapter
 * 时的 hook signature 模板。
 */
export type PipelineHookCtx = StageRunArgs["ctx"];
