/**
 * PlaygroundPipelineDispatcher —— v5.1 R2-A.1 / R2-A.3 新轨入口
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
 * 设计要点（与 writing-team service 一致 closure pattern）：
 *   - PLAYGROUND_PIPELINE 在 onModuleInit 注册一次 + hooks 闭包引用 this
 *   - per-mission session 存放在 sessions Map，hook 闭包通过 ctx.missionId 反查；
 *     mission 结束清掉 entry
 *   - 并发安全：每 mission 一个独立 session entry，hook 不共享状态
 *
 * R2-A 增量：
 *   - R2-A.1 (committed): scaffolding + module wiring + 14 step NotYetWired 占位
 *   - R2-A.3 (本 commit): s1-budget hook 实装 = thin adapter 调既有
 *                         runBudgetEstimateStage（其余 13 step 仍 NotYetWired）
 *   - R2-A.4 ~ R2-A.13: s2-s12 hook 逐 stage 实装
 */
import {
  Injectable,
  OnModuleInit,
  Optional,
  Inject,
  forwardRef,
} from "@nestjs/common";
import {
  BusinessTeamMissionDispatcherFramework,
  EventBus,
  MissionElectionTracker,
  MissionLifecycleManager,
  mapAgentFailureCode,
  type StageRunArgs,
} from "@/modules/ai-harness/facade";
import type { PlaygroundTerminalExtra } from "../lifecycle/mission-store.service";
import {
  MissionRuntimeShellService,
  type MissionRuntimeSession,
} from "./mission-runtime-shell.service";
import { type RunMissionInput } from "../../api/dto/run-mission.dto";
// ★ #16b env2（2026-06-09）：S12 postlude 已迁移到能力核（deep-insight.runner.ts
//   assembleCompleted → fireSelfEvolutionPostlude），dispatcher 不再双写。
//   runSelfEvolutionStage import 已删除；fireSelfEvolutionPostlude 方法已删除。
import { MissionCheckpointService } from "@/modules/ai-harness/facade";
import { MissionFailedPreset } from "@/modules/platform/facade";
import { MissionSedimentService } from "@/modules/ai-app/library/sediment/mission-sediment.service";
import { MissionStore } from "../lifecycle/mission-store.service";
// ★ #16b 能力轨（唯一执行轨）：playground 消费平台共享能力（deep-insight）执行 14 阶段，
//   注入自己的持久化端口 + 事件桥。私有 orchestrator 路径已退役。
import {
  CapabilityRegistry,
  type CapabilityRunEvent,
  type CapabilityRunInput,
} from "@/modules/ai-app/marketplace/capability";
import { AgentInvoker, LeaderService, type SupervisedMission } from "../roles";
import { LeaderInvocationFactory } from "./leader-invocation.factory";
// ★ Stage 1 / S1-1 (2026-05-09): 业务编排已抽到独立 service —— dispatcher inject + delegate
import { PlaygroundBusinessOrchestrator } from "./playground-business-orchestrator.service";
// ★ post-run 副作用：mission 完成后自动构建知识图谱（fire-and-forget，不阻断主流程）
import { MissionGraphService } from "../graph/mission-graph.service";
// ★ R2-#38: OTel span emission (mission root + stage child spans via AgentTracer)
import { PlaygroundMissionSpanService } from "./playground-mission-span.service";
// ★ Stage 1 / S1-2 (2026-05-09,closes T3): cross-stage cache 改用 Z5 CrossStageState 容器
import { PlaygroundCrossStageState } from "./playground-cross-stage-state";
import { mapStepIdToFrontendStageId } from "../../api/contracts/step-id-mapping.contract";
// ★ P-DUR2 (2026-05-30): orphan boot 自动续跑 —— 认领赢家 + canResume 的 orphan 经
//   rerun orchestrator 以 incremental/inheritFromMissionId 续跑（复用 checkpoint）。
//   循环依赖（rerun orchestrator inject dispatcher）用 forwardRef 解。值导入只在
//   forwardRef 箭头闭包内引用，模块加载期不触发 require 循环求值。
import { MissionRerunOrchestratorService } from "../rerun/mission-rerun-orchestrator.service";

export interface PipelineMissionSummary {
  readonly missionId: string;
  readonly status: "completed" | "failed" | "aborted";
  readonly stageOutputs: Readonly<Record<string, unknown>>;
  readonly error?: unknown;
}

/**
 * Per-mission session 状态容器(runtime-glue).
 *
 * Stage 1 / S1-1(2026-05-09):interface 改为 export 让 PlaygroundBusinessOrchestrator
 * type-import,通过 dispatcher 注入的 sessionLookup 访问。详见 audit §7 S1-1。
 */
export interface SessionEntry {
  readonly session: MissionRuntimeSession;
  readonly t0: number;
  readonly input: RunMissionInput;
  readonly workspaceId?: string;
  /**
   * SupervisedMission —— Leader 容器（s2/s4/s10 全程在场）
   * 每 mission 一个，由 leaderService.create + buildLeaderInvocation 构造
   */
  readonly leader: SupervisedMission;
  /**
   * Stage 1 / S1-2 (2026-05-09,closes T3):跨 stage 缓存中间产物 + 共享状态 +
   * trajectory rerun cache 统一通过 PlaygroundCrossStageState 容器暴露
   * (内部 wrap Z5 CrossStageState)。
   *
   * 之前 14 个 ad-hoc fields(`lastPlan` / `lastResearcherResults` / ... /
   * `s4PatchFailures` / `inheritedResearchResults` / `inheritedChapters`)
   * 已迁移到此 typed container,保 in-memory 性能 + grep gate 转 green。
   */
  readonly crossState: PlaygroundCrossStageState;
}

@Injectable()
export class PlaygroundPipelineDispatcher
  extends BusinessTeamMissionDispatcherFramework
  implements OnModuleInit
{
  private readonly sessions = new Map<string, SessionEntry>();

  constructor(
    private readonly runtimeShell: MissionRuntimeShellService,
    private readonly leaderService: LeaderService,
    private readonly invoker: AgentInvoker,
    private readonly leaderInvocationFactory: LeaderInvocationFactory,
    // R2-A.13: s11 hook 需要 missionCheckpoint.clear
    private readonly missionCheckpoint: MissionCheckpointService,
    // R2-A.13.1: 失败兜底需要 store.markFailed
    private readonly store: MissionStore,
    private readonly electionTracker: MissionElectionTracker,
    eventBus: EventBus,
    // ★ Stage 1 / S1-1 (2026-05-09): 业务编排(STAGE_NUMBER / CHECKPOINT_AT 字面量 +
    //   11 个 build*Hooks)已抽到独立 service。dispatcher 在 onModuleInit bind sessionLookup
    //   后,buildBaseHooksForStep 改为 delegate 到此 service。
    private readonly businessOrch: PlaygroundBusinessOrchestrator,
    // ★ C0/G1：唯一终态写入口。dispatcher 不再直写 store.markX，统一经 finalize 仲裁。
    private readonly lifecycleManager: MissionLifecycleManager,
    // ★ R2-#38: OTel span service (optional — gracefully absent if tracer not configured)
    private readonly missionSpan: PlaygroundMissionSpanService,
    // ★ e2e P0-#5: mission 失败通知（email + site）。@Optional — NotificationDispatcherModule
    //   未装配时优雅缺省（不发通知，不影响 mission 失败处理）。
    @Optional() private readonly missionFailedPreset?: MissionFailedPreset,
    // ★ P-DUR2 (2026-05-30): orphan boot 续跑编排器。forwardRef 解循环依赖
    //   （rerun orchestrator 构造期 inject 本 dispatcher）。@Optional 让缺省装配
    //   时（如裁剪测试床）优雅降级为"只 mark failed 不续跑"。
    @Optional()
    @Inject(forwardRef(() => MissionRerunOrchestratorService))
    private readonly rerunOrchestrator?: MissionRerunOrchestratorService,
    // ★ W3 能力轨：@Global MarketplaceModule 提供 CapabilityRegistry，DI 全局可见，
    //   无需 playground.module import。@Optional 让裁剪测试床（直接 new dispatcher、
    //   不装配 MarketplaceModule）优雅降级——OFF 路（默认）完全不触达本依赖；ON 路缺
    //   registry 时 warn + 返回 failed（不 throw，符合 DI 反模式守护：@Optional 不配 throw）。
    @Optional() private readonly capabilityRegistry?: CapabilityRegistry,
    // ★ post-run 副作用：mission 完成后自动构建知识图谱。@Optional 让裁剪测试床优雅降级。
    @Optional() private readonly missionGraph?: MissionGraphService,
    // ★ post-run 副作用：mission 完成后把报告沉淀进应用内库（library notes）。@Optional
    //   让裁剪测试床优雅降级。
    @Optional() private readonly sediment?: MissionSedimentService,
  ) {
    // 2026-05-24 P4: framework 提供 emitToBus + bridgeOrchestratorStageEvent
    //   通用 mechanism；本 dispatcher 仅注入 playground 专属事件 type 字符串。
    super(eventBus, {
      namespace: "playground",
      stageLifecycleEvent: "playground.stage:lifecycle",
      stageStalledEvent: "playground.stage:stalled",
      stageDegradedEvent: "playground.stage:degraded",
      mapStepId: mapStepIdToFrontendStageId,
    });
  }

  // 2026-05-24 P4: emitToBus 已上提到 BusinessTeamMissionDispatcherFramework，
  //   本 dispatcher 通过继承直接复用（this.emitToBus(...)），不再本地定义。

  // ── #16b (2026-06-09): withProgressTracking 已删——OFF 路私有 14 阶段 hooks 退役。
  //   ON 路（能力轨）的 stage 进度 + checkpoint 经 MissionStorePersistenceAdapter
  //   （markStageProgress → markStageComplete / saveCheckpoint）由能力核驱动，见
  //   mission-store.service.ts asPersistencePort + deep-insight.runner bridgeMissionEvent。
  //   STAGE_NUMBER（crash-resume 排序）/ resolveTriggerType / bindSessionLookup 仍由
  //   PlaygroundBusinessOrchestrator 提供，故 businessOrch 仍注入。

  onModuleInit(): void {
    // ★ Stage 1 / S1-1 (2026-05-09): bind sessionLookup 让 PlaygroundBusinessOrchestrator
    //   能通过 missionId 访问 SessionEntry。S12 postlude / crash-resume 续跑仍经
    //   businessOrch 读 SessionEntry。
    // ★ #16b (2026-06-09): 不再注册私有 "playground" pipeline 到 MissionPipelineRegistry
    //   ——OFF 路退役，能力轨经能力核自注册的 "deep-insight" pipeline 执行（见
    //   DeepInsightDefaultRunner）。dispatcher 不再持有 orchestrator / registry。
    this.businessOrch.bindSessionLookup((missionId) =>
      this.getEntry(missionId),
    );
    // ★ 2026-05-06 #88: pod restart 后扫 orphan running missions（hb_age > 5min
    //   = pod 失联标志），立即 mark failed 不让用户等 15min Liveness Guard。
    //   Liveness Guard 仍在跑作为兜底（处理 boot 后才死的 mission）。
    void this.cleanupOrphanRunningMissions();
  }

  /**
   * #88 (2026-05-06): pod restart 时 dispatcher 内存丢失所有 active session，
   * 但 DB 上 status='running' 不会自动改。本方法在 onModuleInit 扫描所有
   * heartbeat 已停 5+ min 的 'running' mission，立即 mark failed 并 emit
   * mission:failed event，用户体验从"等 15 min" → "boot 后 1s 即失败提示"。
   */
  private async cleanupOrphanRunningMissions(): Promise<void> {
    try {
      const orphanThresholdMs = 5 * 60 * 1000; // 5 min
      // ★ P-DUR2 (2026-05-30): 原子认领版 cleanup。多 pod 并发启动时，每个 orphan
      //   只被一个 pod 原子认领（claimOrphanFailed 条件写 count===1）。本 pod 只对
      //   **认领赢家**触发续跑，其它 pod count===0 跳过 → 消除重复 rerun（重复烧 credit）。
      const result =
        await this.store.cleanupOrphanRunningMissionsAtomic?.(
          orphanThresholdMs,
        );
      const orphans = result?.orphans ?? [];
      const claimedWinners = result?.claimedWinners ?? [];
      if (orphans.length === 0) {
        this.log.log("[#88 orphan-cleanup] no orphan running missions found");
        return;
      }
      this.log.warn(
        `[#88 orphan-cleanup] cleaned ${orphans.length} orphan running missions ` +
          `(heartbeat > ${Math.round(orphanThresholdMs / 60000)}min stale), ` +
          `claimed=${claimedWinners.length} (this pod)`,
      );
      // 对**本 pod 认领赢家**逐个发失败事件 + 视情况续跑。
      for (const o of claimedWinners) {
        await this.emitToBus({
          type: "playground.mission:failed",
          missionId: o.id,
          userId: o.userId,
          payload: {
            message:
              "Mission 在执行中遇到后端重启或异常退出（dispatcher 内存丢失）。" +
              "已自动标记为失败，建议使用顶部「重新运行」按钮重启相同主题。",
            failureCode: "DISPATCHER_BOOT_ORPHAN_CLEANUP",
            source: "dispatcher-boot-orphan-cleanup",
          },
        });
        // ★ P-DUR2 续跑：认领赢家且 canResume()=true → 经 rerun orchestrator 以
        //   incremental（inheritFromMissionId + checkpoint clone）分配**新 missionId**
        //   续跑，复用已落 checkpoint 的 trajectory，不从零重跑。rerun 分配新 id
        //   规避 runMission 入口 createMission 对已存在 orphan row 的 P2002 冲突。
        //   幂等：认领已保证同一 source 只有一个 pod 进此分支 → 只触发一次续跑。
        await this.maybeResumeOrphan(o.id, o.userId);
      }
    } catch (err) {
      this.log.error(
        `[#88 orphan-cleanup] failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  /**
   * ★ P-DUR2 (2026-05-30): 对本 pod 认领赢家的 orphan，若可恢复则触发 incremental
   * rerun（复用 checkpoint），否则仅记录"已 mark failed、不续跑"。
   *
   * - canResume()=false（无 checkpoint / 超出恢复窗口）→ 不续跑，只 log（用户手动重跑）。
   * - rerunOrchestrator 未装配（@Optional 缺省）→ 不续跑，只 log。
   * - 续跑失败不抛（fire-and-forget 语义在 orchestrator 内部），本层只 log。
   */
  private async maybeResumeOrphan(
    missionId: string,
    userId: string,
  ): Promise<void> {
    const resumable = await this.missionCheckpoint
      .canResume(missionId)
      .then((d) => d.canResume)
      .catch(() => false);
    if (!resumable || !this.rerunOrchestrator) {
      this.log.warn(
        `orphan_resume_skipped missionId=${missionId} ` +
          `resumable=${resumable} orchestrator=${this.rerunOrchestrator ? "present" : "absent"} ` +
          `action=user-manual-rerun`,
      );
      return;
    }
    try {
      const { missionId: newMissionId } =
        await this.rerunOrchestrator.rerunFullMission(
          missionId,
          userId,
          "incremental",
        );
      this.log.warn(
        `orphan_resume_triggered sourceMissionId=${missionId} ` +
          `newMissionId=${newMissionId} mode=incremental reason=boot-orphan-claimed-winner`,
      );
    } catch (err) {
      // legacy snapshot / guard 拒绝 / 配置缺失等 → 已 mark failed，用户可手动重跑。
      this.log.warn(
        `orphan_resume_failed missionId=${missionId} ` +
          `reason="${err instanceof Error ? err.message : String(err)}" action=user-manual-rerun`,
      );
    }
  }

  /** spec / hook 闭包用：取出指定 missionId 的活动 session（不存在抛错）*/
  getSession(missionId: string): MissionRuntimeSession {
    const entry = this.sessions.get(missionId);
    if (!entry) {
      throw new Error(
        `[playground-pipeline] no active session for mission ${missionId}`,
      );
    }
    return entry.session;
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
    /**
     * ★ R-CA (2026-05-05) 时序回调：mission row 已经 INSERT + session/ownership 装配完成、
     * orchestrator 长耗时 stages 启动之前，回调一次。
     * 用法：custom-agents.launch 在此回调里 await 写 launches 行，保证主调方 endpoint
     * 返回时 launches 行已就位（消除 mission row vs launches 写入时序窗口）。
     * 异常：本回调抛错只 log warn，不阻断 orchestrator（launches 写失败属可容忍 degrade）。
     */
    afterRowCreated?: () => Promise<void>,
  ): Promise<PipelineMissionSummary> {
    const t0 = Date.now();
    const session = await this.runtimeShell.openSession({
      missionId,
      input,
      userId,
      workspaceId,
    });
    // 创建 SupervisedMission（Leader 容器）—— 整 mission 复用，s2/s4/s10 都用它
    const leader = this.leaderService.create(
      missionId,
      userId,
      {
        topic: input.topic,
        description: input.description,
        depth: input.depth,
        language: input.language,
        userProfile: input,
      },
      this.leaderInvocationFactory.build(missionId, userId, session.billing),
    );
    // ★ R2-#38: start root OTel span for this mission
    this.missionSpan.startMissionSpan(missionId, input.topic);
    // ★ Stage 1 / S1-2 (2026-05-09): 初始化 PlaygroundCrossStageState 容器
    //   (替代 14 个 ad-hoc lastXxx / s4PatchFailures / inheritedX fields)
    this.sessions.set(missionId, {
      session,
      t0,
      input,
      workspaceId,
      leader,
      crossState: new PlaygroundCrossStageState(),
    });
    // ★ R-CA: row 已落 + session 已 register，但 stages 尚未跑 —— 给上层回调
    //   一个时机做"挂接关联"（launches.record 等）。回调失败仅 log，不影响 mission。
    if (afterRowCreated) {
      try {
        await afterRowCreated();
      } catch (err) {
        this.log.warn(
          `[runMission ${missionId}] afterRowCreated callback threw (non-fatal): ${
            err instanceof Error ? err.message : String(err)
          }`,
        );
      }
    }
    // ★ R2-#37 (2026-05-23): crash-resume — if a checkpoint exists for this
    //   missionId (e.g. prior pod restart mid-run), restore crossState and
    //   resume from the last completed step instead of restarting from scratch.
    let resumeFromStepId: string | undefined;
    let initialCrossStageState: Readonly<Record<string, unknown>> | undefined;
    try {
      const resumeDecision = await this.missionCheckpoint.canResume(missionId);
      if (resumeDecision.canResume && resumeDecision.snapshot) {
        const snap = resumeDecision.snapshot;
        // completedKeys is an array of step IDs already finished; restore
        // crossState payload so downstream stages get their inputs back.
        const payload = snap.payload as {
          lastStage?: string;
          crossState?: Record<string, unknown>;
        };
        if (payload.crossState) {
          const entry = this.sessions.get(missionId);
          if (entry) {
            const restored = PlaygroundCrossStageState.fromJSON(
              payload.crossState,
            );
            // Replace the in-memory crossState on the session entry (immutable update)
            this.sessions.set(missionId, { ...entry, crossState: restored });
            initialCrossStageState = payload.crossState;
          }
        }
        // The last completed step is the highest-stageNumber key in completedKeys
        if (snap.completedKeys.length > 0) {
          const stageNumber = this.businessOrch.STAGE_NUMBER;
          const sorted = [...snap.completedKeys].sort(
            (a, b) => (stageNumber[a] ?? 0) - (stageNumber[b] ?? 0),
          );
          resumeFromStepId = sorted[sorted.length - 1];
        }
        this.log.log(
          `[R2-#37 crash-resume] mission ${missionId} resuming from stepId="${resumeFromStepId}" (${snap.completedKeys.length} completed steps)`,
        );
      }
    } catch (resumeErr) {
      // Non-fatal: if resume load fails just start fresh
      this.log.warn(
        `[R2-#37 crash-resume] mission ${missionId} checkpoint load failed (will start fresh): ${resumeErr instanceof Error ? resumeErr.message : String(resumeErr)}`,
      );
    }

    // ★ 2026-05-05 增量更新："更新"按钮 → input.inheritFromMissionId 携带源 mission；
    //   从源 mission DB row hydrate plan（dimensions+themeSummary）到 entry.crossState.lastPlan，
    //   下游 S2 hook 检测到 lastPlan 已就绪即跳过 LLM 调用并 emit synthetic plan event。
    if (input.inheritFromMissionId) {
      await this.hydrateInheritedPlan(
        missionId,
        userId,
        input.inheritFromMissionId,
      );
      // ★ P0-D 完整版 (2026-05-06): trajectory 持久化让 rerun 真正复用 S3 + 章节产物，
      //   "更新"按钮跳过 S3 35min 重做 + S5+ 章节重写，直达 S10 signoff。
      await this.hydrateInheritedResearchResults(
        missionId,
        input.inheritFromMissionId,
      );
      await this.hydrateInheritedChapterDrafts(
        missionId,
        input.inheritFromMissionId,
      );
    }
    // ★ 2026-05-06 (A-8): 终态守门 — 任何 unexpected throw / pod kill / OOM 后
    //   finally 检查 mission 是否走完正常 markCompleted/markFailed 路径，否则
    //   emit mission:execution-aborted + markFailed 兜底。覆盖：
    //     · runtimeShell.runWithinContext throw（withUserContext / BillingContext 异常）
    //     · orchestrator.run throw 但 handleMissionFailure 自己又 throw
    //     · process.exit() / SIGTERM 导致 finally 也跑不全（这种由 liveness-guard 兜底）
    let reachedTerminal = false;
    try {
      return await this.runtimeShell.runWithinContext(session, async () => {
        // ★ #16b 终态硬切（2026-06-09）：playground 单轨消费平台共享能力（deep-insight 14
        //   阶段内核），注入自己的持久化端口 + 事件桥。旧 OFF 路（私有 orchestrator + 14
        //   阶段 hooks）已删除——能力轨是唯一实现。增量"更新"复用经 capInput.inheritedBaseline
        //   下沉（见 runViaCapabilityRunner / #16a）；14-chip / timeline 经事件桥不变。
        const result = await this.runViaCapabilityRunner(
          missionId,
          input,
          userId,
          session,
          resumeFromStepId,
          initialCrossStageState,
        );
        // ★ R2-A.13.1 失败兜底：orchestrator 返 status=failed/aborted 时，
        //   补齐 legacy team.mission.ts 的 mission:failed event + markFailed 行为
        //   （pipeline-v1 hook 内部抛错经 orchestrator 包成 stage:failed event +
        //    result.status="failed"，但 mission DB row + 前端事件流缺收尾兜底）
        if (result.status !== "completed") {
          // ★ R2-#38: end root OTel span with failure status
          this.missionSpan.endMissionSpan(
            missionId,
            result.status as "failed" | "aborted",
            result.error instanceof Error ? result.error : undefined,
          );
          await this.handleMissionFailure(
            missionId,
            userId,
            t0,
            result,
            session,
          );
        } else {
          // ★ R2-#38: end root OTel span with success
          this.missionSpan.endMissionSpan(missionId, "completed");
          // ★ R2-A.13.1 成功路径：清 checkpoint（mission 已完整落库）
          await this.missionCheckpoint
            .clear(missionId)
            .catch((err: unknown) => {
              this.log.warn(
                `[dispatcher ${missionId}] checkpoint.clear (success path) failed (non-fatal): ${err instanceof Error ? err.message : String(err)}`,
              );
            });
          // ★ post-run 副作用 #1：知识图谱构建（fire-and-forget，不阻断主流程）。
          //   graphService.build 读 mission.reportFull → LLM 抽取实体/关系 → upsert
          //   playgroundMissionGraph。失败只 warn，不影响 mission 终态。
          if (this.missionGraph) {
            void this.missionGraph
              .build(userId, missionId)
              .catch((err: unknown) => {
                this.log.error(
                  `[post-run graph ${missionId}] knowledge-graph build failed (non-fatal): ${err instanceof Error ? err.message : String(err)}`,
                );
              });
          }
          // ★ post-run 副作用 #2：library 沉淀（fire-and-forget，不阻断主流程）。
          //   把能力核富报告 markdown 落成一条 library note，与 company 侧对称。
          if (this.sediment) {
            const artifact = result.stageOutputs.reportArtifact as {
              content?: { fullMarkdown?: string };
            } | null;
            const plan = result.stageOutputs.plan as {
              dimensions?: Array<{ name?: string }>;
            } | null;
            const dimTags = (plan?.dimensions ?? [])
              .map((d) => d?.name)
              .filter((n): n is string => typeof n === "string");
            void this.sediment
              .sedimentMission({
                missionId,
                userId,
                title: input.topic,
                content: artifact?.content?.fullMarkdown ?? "",
                source: "playground",
                tags: ["playground", ...dimTags],
              })
              .catch((err: unknown) => {
                this.log.error(
                  `[post-run sediment ${missionId}] library sediment failed (non-fatal): ${err instanceof Error ? err.message : String(err)}`,
                );
              });
          }
        }
        // ★ #16b env2（2026-06-09）：S12 postlude 已由能力核 fireSelfEvolutionPostlude
        //   在 assembleCompleted 内 fire，不在 dispatcher 层双写。
        reachedTerminal = true;
        return {
          missionId: result.missionId,
          status: result.status,
          stageOutputs: result.stageOutputs,
          error: result.error,
        };
      });
    } catch (err) {
      // ★ A-8: orchestrator/runtimeShell 抛出未被 handleMissionFailure 接住的异常
      // ★ R2-#38: end root OTel span on unexpected throw
      this.missionSpan.endMissionSpan(
        missionId,
        "failed",
        err instanceof Error ? err : undefined,
      );
      reachedTerminal = await this.tryHandleAbort(
        missionId,
        userId,
        t0,
        err,
        session,
        "execution_threw",
      );
      throw err;
    } finally {
      // ★ A-8: 最后一道闸 — finally 仍未达终态（极端：catch 里 markFailed 也 throw）
      //   尝试兜底 emit mission:execution-aborted（不写 DB 避免再 throw）
      if (!reachedTerminal) {
        await this.emitToBus({
          type: "playground.mission:execution-aborted",
          missionId,
          userId,
          payload: {
            reason: "runtime_unknown_state",
            podId:
              process.env.RAILWAY_REPLICA_ID ?? process.env.HOSTNAME ?? "local",
            wallTimeMs: Date.now() - t0,
          },
        });
      }
      // ★ 全覆盖审计修 (2026-05-06): 先 cleanup 再 delete — cleanup throw 时 entry 不会已删
      try {
        session.cleanup();
      } catch (cleanupErr) {
        this.log.error(
          `[runMission ${missionId}] session.cleanup() threw: ${cleanupErr instanceof Error ? cleanupErr.message : String(cleanupErr)}`,
        );
      }
      // ★ P0-1 (2026-05-06): relay exhaustedMissions cleanup —— short mission 不 leak Map 条目
      this.invoker.clearMissionRelayState(missionId);
      this.sessions.delete(missionId);
      this.electionTracker.clear(missionId);
    }
  }

  /**
   * ★ W3 能力轨（flag ON 专用）：经 ICapabilityRunner 消费 deep-insight 能力内核跑
   *   真 14 阶段，注入 playground 自己的：
   *     - persistence（MissionStore.asPersistencePort）→ checkpoint/resume + 终态仲裁
   *       仍落 agent_playground_missions、走 lifecycleManager.finalize（WHERE
   *       status='running' 条件写，与 OFF 路语义一致）。
   *     - onEvent → 桥到既有 EventBus（playground.stage:lifecycle 等）+ OTel span，
   *       让前端 14-chip / timeline 照常点亮（事件契约不变）。
   *     - signal → 透传 mission abort。
   *   返回 MissionResult（与 orchestrator.run 同形），下游终态收口（handleMissionFailure
   *   / checkpoint clear / fireSelfEvolutionPostlude）与 OFF 路完全共用。
   *
   *   checkpoint 兼容（§3 结论）：ON 路 resume 走能力内核 CrossStageState 格式（端口
   *   loadCheckpoint 仅认带 lastStepId 的 payload）；旧 OFF 路 checkpoint（lastStage
   *   字段）不被 ON 路 resume，不混用。同一 mission 生命周期内 flag 进程级稳定，不跨轨。
   */
  private async runViaCapabilityRunner(
    missionId: string,
    input: RunMissionInput,
    userId: string,
    session: MissionRuntimeSession,
    resumeFromStepId: string | undefined,
    initialCrossStageState: Readonly<Record<string, unknown>> | undefined,
  ): Promise<{
    readonly missionId: string;
    readonly status: "completed" | "failed" | "aborted";
    readonly stageOutputs: Readonly<Record<string, unknown>>;
    readonly crossStageState: Readonly<Record<string, unknown>>;
    readonly error?: unknown;
  }> {
    // 缺 registry（裁剪测试床未装配 MarketplaceModule）或 runner 未注册：不 throw，
    //   warn + 返回 failed MissionResult，由下游失败收口处理（避免 @Optional + throw
    //   反模式，且不让 mission 卡 running）。生产装配齐全，此分支不应触达。
    const runner = this.capabilityRegistry?.resolve("deep-insight");
    if (!runner) {
      const reason = this.capabilityRegistry
        ? '能力 runner "deep-insight" 未注册（DeepInsightDefaultRunner.onModuleInit 未执行）'
        : "CapabilityRegistry 未注入（@Global MarketplaceModule 未装配）";
      this.log.error(
        `[W3 capability ${missionId}] 无法走能力轨：${reason} —— 标记 mission 失败。`,
      );
      return {
        missionId,
        status: "failed",
        stageOutputs: {},
        crossStageState: {},
        error: new Error(`capability runner unavailable: ${reason}`),
      };
    }
    // resume 上下文：OFF 路 checkpoint 已在 runMission 顶部 hydrate 进
    //   initialCrossStageState（lastStage 格式，ON 路端口 loadCheckpoint 不认它）。
    //   ON 路 resume 实际由能力 runner 内部经 persistence.loadCheckpoint（lastStepId
    //   格式）驱动；此处入参仅作日志参考，不强行喂给能力核（避免格式串轨）。
    if (resumeFromStepId != null || initialCrossStageState != null) {
      this.log.log(
        `[W3 capability ${missionId}] OFF-path resume ctx present (stepId=` +
          `${resumeFromStepId ?? "none"}); ON-path resume 由能力核 checkpoint 端口驱动。`,
      );
    }

    // RunMissionInput → CapabilityRunInput：转发能力消费的语义字段 + 四档位
    //   （style/length/audience/auditLayers——能力核 s7/s9 bindings 已消费，
    //   不转发会让 Dialog 选择器静默失效、zod 默认 executive 被换成能力核 academic）。
    //   仍不转发：budget/concurrency/viewMode（playground 专属）+ 计费字段（session.billing 体现）。
    // 注：RunMissionInput 无 preferredModelId 字段（playground 默认按 TaskProfile +
    //   BYOK 选模），故不转发；能力核走自身默认模型选择，与 OFF 路行为一致。
    // ★ #16a 增量复用："更新"按钮（inheritFromMissionId）已在 runMission 顶部经
    //   hydrateInheritedPlan / hydrateInheritedResearchResults 把上次 mission 的 plan +
    //   各维 researcher 产物灌进 entry.crossState。这里转成中性 inheritedBaseline 传给能力核，
    //   让 ON 路 S2/S3 命中即跳过重算（等价 OFF 路跳过 S2/S3）。无继承时为 undefined → 全量新跑。
    const inheritEntry = this.sessions.get(missionId);
    const inheritedPlan = inheritEntry?.crossState.lastPlan;
    const inheritedResearch = inheritEntry?.crossState.inheritedResearchResults;
    const inheritedBaseline =
      inheritedPlan || (inheritedResearch && inheritedResearch.length > 0)
        ? {
            ...(inheritedPlan ? { plan: inheritedPlan } : {}),
            ...(inheritedResearch?.length
              ? { researcherResults: inheritedResearch }
              : {}),
          }
        : undefined;

    const capInput: CapabilityRunInput = {
      topic: input.topic,
      ...(input.description ? { description: input.description } : {}),
      ...(input.depth ? { depth: input.depth } : {}),
      ...(input.language ? { language: input.language } : {}),
      ...(input.withFigures !== undefined
        ? { withFigures: input.withFigures }
        : {}),
      ...(input.knowledgeBaseIds?.length
        ? { knowledgeBaseIds: [...input.knowledgeBaseIds] }
        : {}),
      ...(input.searchTimeRange
        ? { searchTimeRange: input.searchTimeRange }
        : {}),
      ...(input.styleProfile ? { styleProfile: input.styleProfile } : {}),
      ...(input.lengthProfile ? { lengthProfile: input.lengthProfile } : {}),
      ...(input.audienceProfile
        ? { audienceProfile: input.audienceProfile }
        : {}),
      ...(input.auditLayers ? { auditLayers: [input.auditLayers] } : {}),
      ...(inheritedBaseline ? { inheritedBaseline } : {}),
    };

    const persistence = this.store.asPersistencePort(this.lifecycleManager);

    const capResult = await runner.run(capInput, {
      userId,
      missionId,
      signal: session.missionAbort.signal,
      persistence,
      onEvent: (event) => {
        void this.bridgeCapabilityEventToPlayground(event, missionId, userId);
      },
    });

    // ★ #16b S12 postlude 等价：能力核的 CrossStageState 是私有的（R1 隔离不外露），
    //   但终态产物经 collectStageOutputs 投影进 stageOutputs。这里把它们回灌进
    //   entry.crossState，让 fireSelfEvolutionPostlude（s12 自进化）+ handleMissionFailure
    //   的 partial 落库拿到真实产物，而非空数据（修复硬切后 entry.crossState 全空的退化）。
    const so = capResult.stageOutputs as {
      plan?: unknown;
      researcherResults?: unknown;
      report?: unknown;
      reportArtifact?: unknown;
      leaderSignOff?: unknown;
    };
    const so_entry = this.sessions.get(missionId);
    if (so_entry) {
      const cs = so_entry.crossState;
      if (so.plan) cs.lastPlan = so.plan as typeof cs.lastPlan;
      if (so.researcherResults)
        cs.lastResearcherResults =
          so.researcherResults as typeof cs.lastResearcherResults;
      if (so.report) cs.lastReport = so.report as typeof cs.lastReport;
      if (so.reportArtifact)
        cs.lastReportArtifact =
          so.reportArtifact as typeof cs.lastReportArtifact;
      if (so.leaderSignOff)
        cs.lastLeaderSignOff = so.leaderSignOff as typeof cs.lastLeaderSignOff;
    }

    // CapabilityRunResult → MissionResult（status: failed/completed；能力核无 aborted，
    //   abort 经 signal 后 runner 落 failed/cancelled，dispatcher 失败收口统一处理）。
    return {
      missionId,
      status: capResult.status,
      stageOutputs: capResult.stageOutputs,
      crossStageState: {},
      ...(capResult.error ? { error: new Error(capResult.error) } : {}),
    };
  }

  /**
   * ★ W3 能力轨事件桥：CapabilityRunEvent → playground 既有事件出口（EventBus +
   *   OTel span），复用 OFF 路同一桥接 mechanism（bridgeOrchestratorStageEvent +
   *   missionSpan），保证前端 14-chip / timeline 无感（事件契约不变）。
   *
   *   stage:started/completed/failed 走 stage span + lifecycle 桥；
   *   stage:degraded/stalled 走 framework degraded/stalled 桥；
   *   agent-trace / agent-lifecycle 暂不桥到 playground（OFF 路也无对应实时 agent
   *   narrative 出口，避免新增前端未消费的事件流——保持等价、不超范围）。
   */
  private async bridgeCapabilityEventToPlayground(
    event: CapabilityRunEvent,
    missionId: string,
    userId: string,
  ): Promise<void> {
    // ★ #16b 回归修复（2026-06-09）：能力核经 ctx.onEvent 抛 agent-trace（researcher
    //   thinking / 工具调用 / 错误的实时过程）+ agent-lifecycle（完成快照）。此前 bridge
    //   只桥 stage:* → agent 过程事件全被丢弃，前端"所有过程丢失"（阶段只剩启动/完成空壳、
    //   无 token、无内部活动）。这里翻成 playground.agent:narrative / agent:lifecycle，
    //   恢复与 OFF 路等价的实时过程展示。
    if (event.type === "agent-trace") {
      const p = (event.payload ?? {}) as {
        kind?: string;
        text?: string;
        role?: string;
        dimension?: string;
      };
      if (p.text) {
        await this.emitToBus({
          type: "playground.agent:narrative",
          missionId,
          userId,
          payload: {
            ...(event.stepId
              ? { stage: mapStepIdToFrontendStageId(event.stepId) }
              : {}),
            role: p.role ?? "agent",
            tag: this.narrativeTagFromKind(p.kind),
            text: p.text,
            ...(p.dimension ? { dimension: p.dimension } : {}),
          },
        }).catch(() => undefined);
      }
      return;
    }
    if (event.type === "agent-lifecycle") {
      await this.emitToBus({
        type: "playground.agent:lifecycle",
        missionId,
        userId,
        payload: event.payload ?? {},
      }).catch(() => undefined);
      return;
    }
    // ★ #16b domain 事件桥接：能力核发 domain 中性事件 → playground.<event> namespace。
    // payload 结构：{ event: string; data: Record<string,unknown> }
    // 消费方前端按 "playground.agent:lifecycle" / "playground.agent:narrative" /
    //   "playground.dimension:research:started" 等订阅（与 OFF 路等价）。
    if (event.type === "domain") {
      const domainPayload = event.payload as
        | { event?: string; data?: Record<string, unknown> }
        | undefined;
      const domainEvent = domainPayload?.event;
      const domainData = domainPayload?.data ?? {};
      if (domainEvent) {
        await this.emitToBus({
          type: `playground.${domainEvent}`,
          missionId,
          userId,
          payload: domainData,
        }).catch(() => undefined);
      }
      return;
    }
    const stepId = event.telemetry?.systemStageId ?? event.stepId;
    if (!stepId) return; // 无 stage 锚点的纯生命周期事件（started/completed）不桥 stage。
    if (event.type === "stage:started") {
      this.missionSpan.startStageSpan(missionId, stepId, "capability");
    } else if (
      event.type === "stage:completed" ||
      event.type === "stage:failed"
    ) {
      this.missionSpan.endStageSpan(
        missionId,
        stepId,
        event.type === "stage:completed" ? "completed" : "failed",
      );
    }
    // framework 通用桥接：把能力事件（type + stepId）翻成 playground.stage:lifecycle /
    //   stage:degraded / stage:stalled（mapStepId 映射前端 chip id，与 OFF 路同表）。
    await this.bridgeOrchestratorStageEvent(
      { type: event.type, stepId, timestamp: event.timestamp },
      { missionId, userId },
    );
  }

  /** 能力 agent-trace 的 kind → playground.agent:narrative 的 NarrativeTag。 */
  private narrativeTagFromKind(kind?: string): string {
    switch (kind) {
      case "thinking":
        return "thinking";
      case "action_planned":
        return "planning";
      case "action_executed":
        return "searching";
      case "error":
        return "warning";
      default:
        return "info";
    }
  }

  /** A-8: 兜底 abort 处理 — emit mission:execution-aborted + markFailed */
  private async tryHandleAbort(
    missionId: string,
    userId: string,
    t0: number,
    err: unknown,
    session: MissionRuntimeSession,
    reason: string,
  ): Promise<boolean> {
    try {
      const message = err instanceof Error ? err.message : String(err);
      const snap = session.pool.snapshot();
      await this.emitToBus({
        type: "playground.mission:execution-aborted",
        missionId,
        userId,
        payload: {
          reason,
          error: message,
          wallTimeMs: Date.now() - t0,
          podId:
            process.env.RAILWAY_REPLICA_ID ?? process.env.HOSTNAME ?? "local",
        },
      });
      await this.lifecycleManager
        .finalize<PlaygroundTerminalExtra>({
          missionId,
          intent: {
            status: "failed",
            extra: {
              kind: "failed",
              detail: {
                errorMessage: `execution_aborted: ${message.slice(0, 500)}`,
                tokensUsed: snap.poolTokensUsed,
                costUsd: snap.poolCostUsd,
                elapsedWallTimeMs: Date.now() - t0,
              },
            },
          },
          arbiter: this.store,
        })
        .catch((dbErr: unknown) => {
          this.log.warn(
            `[A-8 ${missionId}] finalize after execution-aborted failed: ${dbErr instanceof Error ? dbErr.message : String(dbErr)}`,
          );
        });
      return true;
    } catch (innerErr) {
      this.log.warn(
        `[A-8] tryHandleAbort failed for ${missionId}: ${innerErr instanceof Error ? innerErr.message : String(innerErr)}`,
      );
      return false;
    }
  }

  /**
   * R2-A.13.1 失败兜底（与 legacy team.mission.ts:265-340 等价）：
   *   1. 检测 cancel（abort signal / cancelled message）→ 不发 mission:failed，
   *      让 controller.cancelMission 已 emit 的 mission:cancelled 接管
   *   2. 分类 failureCode（ORCH_CREDIT_INSUFFICIENT / PROVIDER_BYOK_MODEL_NOT_FOUND
   *      / RUNNER_INPUT_SCHEMA_MISMATCH / RUNNER_WALL_TIME_EXCEEDED /
   *      PROVIDER_RATE_LIMIT / PROVIDER_API_ERROR）
   *   3. emit mission:failed event 含完整 payload（tokensUsed/costUsd/wallTimeMs/
   *      diagnostic.errorStack）
   *   4. store.markFailed 写 partial 产物（reportArtifact / leaderSignOff /
   *      themeSummary 等）让用户能看到部分结果
   */
  private async handleMissionFailure(
    missionId: string,
    userId: string,
    t0: number,
    result: { error?: unknown; status: string },
    session: MissionRuntimeSession,
  ): Promise<void> {
    const err = result.error;
    // ★ P0-7 (audit 2026-05-06): err 是非 Error 对象时 String(err) 返回 "[object Object]"
    //   让 UI 显示无意义文案。改用 JSON.stringify 兜底，让用户能定位真因。
    const message = (() => {
      if (err instanceof Error) return err.message;
      if (err && typeof err === "object") {
        try {
          return JSON.stringify(err, null, 2).slice(0, 2000);
        } catch {
          return String(err);
        }
      }
      return String(err);
    })();
    const errName = err instanceof Error ? err.name : "Unknown";
    const snap = session.pool.snapshot();

    // ★ 2026-05-22 真治：abort 必须按 signal.reason 区分"用户主动取消"与"系统级中止"。
    //   abort-registry.abort(missionId, reason) 已把 reason 透传进 signal.reason：
    //     · "user_cancelled"             → controller.cancelMission 已 emit mission:cancelled，跳过 mission:failed
    //     · "budget_exhausted"           → 预算耗尽，必须 emit mission:failed(failureCode=BUDGET_EXHAUSTED)
    //     · "mission_wall_time_exceeded" → 墙钟超时，emit mission:failed(failureCode=RUNNER_WALL_TIME_EXCEEDED)
    //   旧逻辑只看 signal.aborted（任何 abort 都为 true）→ 把 budget/超时也当成用户取消 →
    //   skip mission:failed + 不 markFailed → DB 卡 running → liveness guard 15min 后才用
    //   "pod 重启/失联" 误导文案兜底（撒谎错误 + 延迟 15min）。
    const abortReason =
      session.missionAbort.signal.aborted &&
      typeof session.missionAbort.signal.reason === "string"
        ? session.missionAbort.signal.reason
        : "";
    // controller.cancelMission 一定调 abortRegistry.abort(missionId, "user_cancelled")，
    //   故 signal.reason 是用户取消的权威判据；不再用脆弱的 message 正则（误报会静默吞失败）。
    const wasUserCancelled = abortReason === "user_cancelled";
    if (wasUserCancelled) {
      // mission:cancelled 已由 controller.cancelMission emit；这里不补 mission:failed
      this.log.log(
        `[pipeline-v1] mission ${missionId} user-cancelled — skipping mission:failed (mission:cancelled 已 emit)`,
      );
      return;
    }

    let missionFailureCode = "UNKNOWN";
    if (
      abortReason === "budget_exhausted" ||
      /budget.?exhausted/i.test(message)
    ) {
      missionFailureCode = "BUDGET_EXHAUSTED";
    } else if (
      abortReason === "mission_wall_time_exceeded" ||
      /timeout|timed out|wall.?time/i.test(message)
    ) {
      missionFailureCode = "RUNNER_WALL_TIME_EXCEEDED";
    } else if (
      errName === "InsufficientCreditsException" ||
      /credit|余额不足|insufficient/i.test(message)
    ) {
      missionFailureCode = "ORCH_CREDIT_INSUFFICIENT";
    } else if (
      // ★ 2026-05-30：BYOK 密钥额度/配额耗尽（"Payment required - quota exceeded" /
      //   QUOTA_EXCEEDED / PROVIDER_QUOTA_EXCEEDED）此前掉进兜底 PROVIDER_API_ERROR，
      //   只显示裸英文，用户看不懂"为什么停了"。单列出来给可操作中文文案。
      /quota.?exceeded|payment required|QUOTA_EXCEEDED|配额|额度耗尽/i.test(
        message,
      )
    ) {
      missionFailureCode = "PROVIDER_QUOTA_EXCEEDED";
    } else if (errName === "ByokRequiredError") {
      missionFailureCode = "PROVIDER_BYOK_MODEL_NOT_FOUND";
    } else if (
      errName === "InputValidationError" ||
      errName === "DefineAgentMissingError"
    ) {
      missionFailureCode = "RUNNER_INPUT_SCHEMA_MISMATCH";
    } else if (/rate.?limit|429/i.test(message)) {
      missionFailureCode = "PROVIDER_RATE_LIMIT";
    } else {
      missionFailureCode = "PROVIDER_API_ERROR";
    }

    // ★ 预算/超时/额度类失败给用户可操作的中文文案（替代裸 abort message）
    const displayMessage =
      missionFailureCode === "BUDGET_EXHAUSTED"
        ? `预算已耗尽（已用约 ${Math.round(snap.poolTokensUsed / 1000)}k tokens / $${snap.poolCostUsd.toFixed(2)}）。请在「Mission 设置」提高 Credits 上限后重跑。`
        : missionFailureCode === "RUNNER_WALL_TIME_EXCEEDED"
          ? "运行超过墙钟时限被中止。请在「Mission 设置」提高时间上限后重跑。"
          : missionFailureCode === "PROVIDER_QUOTA_EXCEEDED" ||
              missionFailureCode === "ORCH_CREDIT_INSUFFICIENT"
            ? `调用模型时密钥额度/配额已耗尽（${message.slice(0, 160)}）。请为对应 Provider 充值，或在「Mission 设置」切换到有额度的模型 / 启用平台额度后重跑。`
            : missionFailureCode === "PROVIDER_RATE_LIMIT"
              ? `模型调用触发限流（${message.slice(0, 160)}）。请稍后重跑，或在「Mission 设置」切换到更高额度档的模型。`
              : message;

    await this.invoker
      .emitEvent({
        type: "playground.mission:failed",
        missionId,
        userId,
        payload: {
          message: displayMessage,
          failureCode: missionFailureCode,
          errorName: errName,
          wallTimeMs: Date.now() - t0,
          tokensUsed: snap.poolTokensUsed,
          costUsd: snap.poolCostUsd,
          diagnostic: {
            errorStack: err instanceof Error ? err.stack : undefined,
          },
        },
      })
      .catch((emitErr: unknown) => {
        this.log.warn(
          `[handleMissionFailure ${missionId}] emit mission:failed failed: ${emitErr instanceof Error ? emitErr.message : String(emitErr)}`,
        );
      });

    // 写 partial 产物到 DB —— 与 legacy team.mission.ts:317-339 一致
    // ★ C0/G1：终态写经 finalize 单入口仲裁（条件写 WHERE status='running' 首写赢）
    const entry = this.sessions.get(missionId);
    const reportPayload =
      entry?.crossState.lastReportArtifact ?? entry?.crossState.lastReport;
    await this.lifecycleManager
      .finalize<PlaygroundTerminalExtra>({
        missionId,
        intent: {
          status: "failed",
          failureCode: mapAgentFailureCode(missionFailureCode),
          errorMessage: displayMessage,
          extra: {
            kind: "failed",
            detail: {
              errorMessage: displayMessage,
              // ★ C2/MAJOR-6:把 inline 大写 code 映射成 canonical MissionFailureCode 落 DB
              failureCode: mapAgentFailureCode(missionFailureCode),
              tokensUsed: snap.poolTokensUsed,
              costUsd: snap.poolCostUsd,
              elapsedWallTimeMs: Date.now() - t0,
              themeSummary: entry?.crossState.lastPlan?.themeSummary,
              dimensions: entry?.crossState.lastPlan?.dimensions as
                | unknown[]
                | undefined,
              report: reportPayload as
                | { title?: string; summary?: string }
                | undefined,
              reportArtifactVersion: entry?.crossState.lastReportArtifact
                ? 2
                : entry?.crossState.lastReport
                  ? 1
                  : undefined,
              // ★ S4b/B-部分：userProfile 停写，不再传 entry.input
              reconciliationReport: entry?.crossState.lastReconciliationReport,
              verdicts: entry?.crossState.lastVerifierVerdicts,
              leaderOverallScore:
                entry?.crossState.lastLeaderSignOff?.leaderOverallScore,
              leaderSigned: entry?.crossState.lastLeaderSignOff?.signed,
              leaderVerdict: entry?.crossState.lastLeaderSignOff?.leaderVerdict,
            },
          },
        },
        arbiter: this.store,
        // ★ e2e P0-#5: 仅在本 finalize 真正赢得终态写(running→failed)时发失败通知,
        //   保证恰好一次(已被 liveness/cancel 抢先终态则不重发)。user_cancelled 在
        //   上方 wasUserCancelled 已 return,不会走到这里。fire-and-forget。
        onWon: async () => {
          await this.missionFailedPreset
            ?.notify({
              userId,
              missionId,
              missionTitle: entry?.input.topic ?? "Mission",
              missionUrl: `/agent-playground/team/${missionId}`,
              reason: displayMessage,
              failureCode: missionFailureCode,
            })
            .catch((notifyErr: unknown) => {
              this.log.warn(
                `[handleMissionFailure ${missionId}] mission-failed notify failed (non-fatal): ${notifyErr instanceof Error ? notifyErr.message : String(notifyErr)}`,
              );
            });
        },
      })
      .catch((dbErr) => {
        this.log.error(
          `[pipeline-v1] finalize(failed) for mission ${missionId} failed: ${
            dbErr instanceof Error ? dbErr.message : String(dbErr)
          }`,
        );
      });
    // ★ 报告版本化 (2026-05-06): 失败路径有 partial report 时也写版本，
    //   让用户能查看失败前生成的报告内容
    if (reportPayload && entry) {
      await this.store
        .saveReportVersion({
          missionId,
          triggerType: this.businessOrch.resolveTriggerType(entry),
          report: reportPayload as { title?: string; summary?: string },
          finalScore: entry.crossState.lastLeaderSignOff?.leaderOverallScore,
          leaderSigned: entry.crossState.lastLeaderSignOff?.signed ?? undefined,
        })
        .catch((err: unknown) => {
          this.log.warn(
            `[handleMissionFailure] saveReportVersion for ${missionId} failed (non-fatal): ${err instanceof Error ? err.message : String(err)}`,
          );
        });
    }
  }

  // ── #16b (2026-06-09): buildPipelineWithHooks / buildHooksForStep /
  //   buildBaseHooksForStep 已删——OFF 路私有 pipeline 注册退役。能力轨经
  //   DeepInsightDefaultRunner 自注册 "deep-insight" pipeline + DeepInsightStageBindings
  //   执行 14 阶段。PlaygroundBusinessOrchestrator 的 build*Hooks 随之成为不可达死代码
  //   （留待后续清理，不构成第二执行轨）。

  /**
   * 公共 helper：从 sessions Map 取 entry，缺失抛错 + 类型收窄
   */
  private getEntry(missionId: string): SessionEntry {
    const entry = this.sessions.get(missionId);
    if (!entry) {
      throw new Error(
        `[playground-pipeline] no active session for mission ${missionId}`,
      );
    }
    return entry;
  }

  /**
   * ★ 2026-05-05 增量更新（"更新"按钮）helper：
   * 从 source mission DB row 重建 plan（dimensions+themeSummary+goals）写入
   * entry.crossState.lastPlan，让 S2 hook 检测到后跳过 Leader LLM 调用直接用继承的 plan。
   *
   * 失败兜底：source 不存在 / dimensions 缺失 → log warn，不写 entry.crossState.lastPlan，
   * S2 走原有 runLeaderPlanStage 路径（fallback to fresh plan）。
   */
  /**
   * ★ P0-D 完整版 (2026-05-06): 从源 mission DB hydrate baseline researcher 产物。
   * S3 hook 检测到 entry.crossState.inheritedResearchResults 不空 → skip invoker + 复用 findings。
   */
  private async hydrateInheritedResearchResults(
    missionId: string,
    sourceMissionId: string,
  ): Promise<void> {
    try {
      const results =
        await this.store.loadBaselineResearchResults(sourceMissionId);
      if (results.length === 0) {
        this.log.log(
          `[hydrateInheritedResearchResults] source ${sourceMissionId} 无持久化 researcher 产物，S3 走 fresh`,
        );
        return;
      }
      const entry = this.sessions.get(missionId);
      if (!entry) return;
      entry.crossState.inheritedResearchResults = results;
      // ★ P0-D 完整版: 复制到新 mission 的 research_results 表，让 stage 通过
      //   missionId 自然查到 cache（避免传 entry 跨多层 stage 调用）
      for (const r of results) {
        await this.store.saveResearchResult({
          missionId,
          dimension: r.dimension,
          findings: r.findings,
          summary: r.summary,
          state: "completed",
        });
      }
      this.log.log(
        `[hydrateInheritedResearchResults] mission ${missionId} 复用 ${results.length} 个 dim 的 researcher 产物（来自 ${sourceMissionId}），已复制到新 mission DB`,
      );
    } catch (err) {
      this.log.warn(
        `[hydrateInheritedResearchResults] failed for ${sourceMissionId}: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  /**
   * ★ P0-D 完整版: 从源 mission DB hydrate 合格 chapter drafts。
   * 下游 chapter pipeline 检测到已存的章节直接复用，跳过 LLM 重写。
   */
  private async hydrateInheritedChapterDrafts(
    missionId: string,
    sourceMissionId: string,
  ): Promise<void> {
    try {
      const drafts =
        await this.store.loadQualifiedChapterDrafts(sourceMissionId);
      if (drafts.length === 0) {
        this.log.log(
          `[hydrateInheritedChapterDrafts] source ${sourceMissionId} 无持久化 chapter drafts，S5+ 走 fresh`,
        );
        return;
      }
      const entry = this.sessions.get(missionId);
      if (!entry) return;
      entry.crossState.inheritedChapters = drafts;
      // ★ P0-D 完整版: 复制到新 mission 的 chapter_drafts 表，让 chapter pipeline
      //   通过 deps.store.loadQualifiedChapterDrafts(missionId) 自然查到 cache
      for (const d of drafts) {
        await this.store.saveChapterDraft({
          missionId,
          dimension: d.dimension,
          chapterIndex: d.chapterIndex,
          heading: d.heading,
          thesis: d.thesis,
          content: d.content,
          status: "passed",
          score: d.score,
          attempts: d.attempts,
          wordCount: d.wordCount,
        });
      }
      this.log.log(
        `[hydrateInheritedChapterDrafts] mission ${missionId} 复用 ${drafts.length} 个章节 drafts（来自 ${sourceMissionId}），已复制到新 mission DB`,
      );
    } catch (err) {
      this.log.warn(
        `[hydrateInheritedChapterDrafts] failed for ${sourceMissionId}: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  private async hydrateInheritedPlan(
    missionId: string,
    userId: string,
    sourceMissionId: string,
  ): Promise<void> {
    try {
      const source = await this.store.getById(sourceMissionId, userId);
      if (!source) {
        this.log.warn(
          `[hydrateInheritedPlan] source mission ${sourceMissionId} not found, S2 will run fresh`,
        );
        return;
      }
      const rawDimensions = source.dimensions;
      const themeSummary = (source as { themeSummary?: string | null })
        .themeSummary;
      // ★ 防御 source DB JSON 损坏：每个 dim 必须有 string id + name + rationale
      if (!Array.isArray(rawDimensions) || rawDimensions.length === 0) {
        this.log.warn(
          `[hydrateInheritedPlan] source mission ${sourceMissionId} has no/invalid dimensions, S2 will run fresh`,
        );
        return;
      }
      const dimensions = rawDimensions.filter(
        (
          d,
        ): d is {
          id: string;
          name: string;
          rationale: string;
          toolHint?: { categories: string[]; preferIds?: string[] };
          dependsOn?: string[];
        } =>
          typeof d === "object" &&
          d !== null &&
          typeof (d as { id?: unknown }).id === "string" &&
          typeof (d as { name?: unknown }).name === "string" &&
          typeof (d as { rationale?: unknown }).rationale === "string",
      );
      if (dimensions.length === 0) {
        this.log.warn(
          `[hydrateInheritedPlan] source mission ${sourceMissionId} dimensions all malformed, S2 will run fresh`,
        );
        return;
      }
      if (dimensions.length < rawDimensions.length) {
        this.log.warn(
          `[hydrateInheritedPlan] source mission ${sourceMissionId} dimensions partially malformed: kept ${dimensions.length}/${rawDimensions.length}`,
        );
      }
      const entry = this.sessions.get(missionId);
      if (!entry) return;
      entry.crossState.lastPlan = {
        themeSummary: themeSummary ?? "",
        dimensions: dimensions as NonNullable<
          import("../context/mission-context").MissionContext["plan"]
        >["dimensions"],
        // goals/initialRisks 不从 source DB 反序列化（不在 mission row 持久化里），
        // 留空数组让下游 stage 走兜底逻辑（S4 leader assess 仅消费 dimensions）
        goals: [] as unknown as NonNullable<
          import("../context/mission-context").MissionContext["plan"]
        >["goals"],
        initialRisks: [] as unknown as NonNullable<
          import("../context/mission-context").MissionContext["plan"]
        >["initialRisks"],
      };
      this.log.log(
        `[hydrateInheritedPlan] mission ${missionId} inherited plan from ${sourceMissionId} (${dimensions.length} dims)`,
      );
    } catch (err) {
      this.log.warn(
        `[hydrateInheritedPlan] failed for ${sourceMissionId}: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }
  }
}

export type PipelineHookCtx = StageRunArgs["ctx"];
