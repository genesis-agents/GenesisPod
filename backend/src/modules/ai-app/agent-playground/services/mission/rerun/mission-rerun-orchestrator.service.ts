/**
 * MissionRerunOrchestratorService —— Mission rerun 装配（创建新 mission + 复用 input + checkpoint clone）
 *
 * 拆自 agent-playground.controller.ts (PR-10d 2026-05-04, 把 rerunMission +
 * rerunTodo 业务装配从 controller endpoint 体抽出)。
 *
 * 留 app（B 类领域装配，17 §四）：
 *   • 直接 read playground 业务表 schema (mission.userProfile / topic / depth)
 *   • 业务规则（origin = leader-assess-abort 拒绝 / s11-persist 终态拒绝 / running 拒绝）
 *   • playground 业务事件 emit（mission:manual-rerun-from-todo）
 *   • Topic / scope / dimensionRef / chapterIndex 业务参数 schema
 *
 * Note: 与现有 LocalRerunService（B 路线，复用 missionId 局部重跑）对偶 —
 *      此 service 是 A 路线（创建新 mission，全跑或 focused）。
 */

import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
} from "@nestjs/common";
import { randomUUID } from "crypto";
import { PlaygroundPipelineDispatcher } from "../workflow/playground-pipeline-dispatcher.service";
import { MissionStore } from "../lifecycle/mission-store.service";
import { MissionEventBuffer } from "../lifecycle/mission-event-buffer.service";
import {
  MissionCheckpointService,
  MissionOwnershipRegistry,
} from "@/modules/ai-harness/facade";
import { type RunMissionInput } from "../../../dto/run-mission.dto";
import { RerunGuardService } from "./rerun-guard.service";

interface RerunResult {
  missionId: string;
  streamNamespace: string;
}

interface RerunTodoBody {
  origin?: string;
  scope?: "dimension" | "chapter" | "review" | "system" | "mission";
  dimensionRef?: string;
  chapterIndex?: number;
  todoTitle?: string;
  reasonText?: string;
}

@Injectable()
export class MissionRerunOrchestratorService {
  private readonly log = new Logger(MissionRerunOrchestratorService.name);

  constructor(
    private readonly orchestrator: PlaygroundPipelineDispatcher,
    private readonly store: MissionStore,
    private readonly buffer: MissionEventBuffer,
    private readonly ownership: MissionOwnershipRegistry,
    private readonly checkpoint: MissionCheckpointService,
    // ★ 2026-05-07 rerun-overhaul v1.1 §3.6：source mission in-flight + zombie 判定
    private readonly rerunGuard: RerunGuardService,
  ) {}

  /**
   * ★ 2026-05-05 [task #12 机制] 共用 rerun 前置校验
   * 原 rerunFullMission / rerunFromTodo 各自手写 (1) ownership 校验 (2) running
   * 拒绝 —— 接口不一致（前者一度漏 running 检查 → 用户连点会同时启动多条
   * mission 覆盖产物）。抽出共用入口，未来新增 rerun 路径自动继承。
   */
  private async assertSourceMissionRerunnable(
    sourceMissionId: string,
    userId: string,
  ): Promise<NonNullable<Awaited<ReturnType<MissionStore["getById"]>>>> {
    // ★ 2026-05-07 rerun-overhaul v1.1 §3.6：先调 RerunGuard ensureRerunable
    //   - in-flight=true → 抛 BadRequest（真在跑，拒绝并发 rerun 覆盖产物）
    //   - zombieDetected=true → 主动 cleanup（status: running→failed）后放行
    //   - 然后下面白名单 status 检查继续做（与 RerunGuard 互补正交）
    await this.rerunGuard.ensureRerunable(sourceMissionId, userId);

    const original = await this.store.getById(sourceMissionId, userId);
    if (!original) {
      throw new ForbiddenException(`mission ${sourceMissionId} not found`);
    }
    // ★ 全覆盖审计修 (2026-05-06): 白名单校验，cancelled 也允许 rerun（用户感知 OK）
    const RERUNNABLE_STATUSES = [
      "completed",
      "failed",
      "quality-failed",
      "cancelled",
    ] as const;
    if (
      !RERUNNABLE_STATUSES.includes(
        original.status as (typeof RERUNNABLE_STATUSES)[number],
      )
    ) {
      throw new BadRequestException(
        `Source mission cannot be rerun from status "${original.status}" — must be one of: ${RERUNNABLE_STATUSES.join(", ")}`,
      );
    }
    return original;
  }

  /**
   * Phase P11-1: rerun 复用原 mission 的 userProfile（如有）+ checkpoint clone，
   * 让 team.mission 入口 canResume() 取到 ok 决策，下游 stage 跳过已完成 keys。
   *
   * ★ 2026-05-05 对齐 Topic Insight startLeaderPlan('fresh' | 'incremental')：
   *   - mode='fresh'       清空 checkpoint，全新从头跑（"开始"按钮语义）
   *   - mode='incremental' clone checkpoint，跳过已完成 stage（"更新"按钮语义）
   *   默认 incremental（向后兼容老调用方）。
   */
  async rerunFullMission(
    sourceMissionId: string,
    userId: string,
    mode: "fresh" | "incremental" = "incremental",
  ): Promise<RerunResult> {
    const original = await this.assertSourceMissionRerunnable(
      sourceMissionId,
      userId,
    );

    const input = this.cloneInputFromMission(original, {
      // ★ 2026-05-06 (P0-G regression): 之前硬编码 ?? 300 兜底，把 budgetProfile=unlimited
      //   的 mission rerun 后强制限到 300 credits → budget:exhausted。改为不传 maxCredits
      //   让 resolveMissionCredits 按 budgetProfile 推导（unlimited=10_000）。
      maxCreditsFallback: undefined,
      // ★ 2026-05-05: incremental 模式注入 inheritFromMissionId 让 dispatcher 载入
      //   source plan 跳过 S2 Leader LLM；fresh 模式不传，正常从头跑
      inheritFromMissionId:
        mode === "incremental" ? sourceMissionId : undefined,
    });

    const newMissionId = randomUUID();
    this.ownership.assign(newMissionId, userId);

    // ★ P0-R5-2 (2026-04-30): rerun 闭环 — 复制原 mission checkpoint 到新 mission
    //   过期 / 已 completed 的 checkpoint 自动跳过；新 mission 从头跑。
    //   ★ 2026-05-05: mode='fresh' 时跳过 clone（用户想全新重跑）
    if (mode === "incremental") {
      const cloned = await this.checkpoint
        .cloneCheckpoint(sourceMissionId, newMissionId)
        .catch(() => false);
      if (cloned) {
        this.log.log(
          `[rerun:${mode}] mission ${newMissionId} resumed from ${sourceMissionId} checkpoint + inheritFromMissionId set`,
        );
      } else {
        this.log.log(
          `[rerun:${mode}] mission ${newMissionId} no checkpoint to clone, but inheritFromMissionId set — dispatcher will hydrate plan from source DB`,
        );
      }
    } else {
      this.log.log(
        `[rerun:${mode}] mission ${newMissionId} fresh restart from ${sourceMissionId} (no checkpoint clone, no inherit)`,
      );
    }

    void this.orchestrator
      .runMission(newMissionId, input, userId)
      .catch((err: unknown) => {
        this.log.error(
          `mission ${newMissionId} (rerun of ${sourceMissionId}) failed: ${
            err instanceof Error ? err.message : String(err)
          }`,
        );
      });

    return { missionId: newMissionId, streamNamespace: "agent-playground" };
  }

  /**
   * 单 todo 重跑 v1 —— 创建新 mission，沿用原 input，emit
   * mission:manual-rerun-from-todo 事件让前端 ledger 关联。
   *
   * 不允许重跑：
   *   - origin = leader-assess-abort（已放弃）
   *   - origin = system-stage 且 todoId 以 s11-persist 结尾（终态归档）
   *   - source mission 仍在 running（防覆盖在跑产物）
   */
  async rerunFromTodo(args: {
    sourceMissionId: string;
    userId: string;
    todoId: string;
    body: RerunTodoBody;
  }): Promise<RerunResult> {
    const { sourceMissionId, userId, todoId, body } = args;
    const original = await this.assertSourceMissionRerunnable(
      sourceMissionId,
      userId,
    );

    const origin = (body?.origin ?? "").trim();
    if (origin === "leader-assess-abort") {
      throw new BadRequestException(
        "Aborted dimensions cannot be re-run; create a new mission instead",
      );
    }
    if (origin === "system-stage" && todoId.endsWith("s11-persist")) {
      throw new BadRequestException(
        "Persistence stage cannot be re-run — re-run the whole mission instead",
      );
    }

    // 构造 focusHint —— 仅 emit 给前端 ledger 用（不再嵌入 topic 末尾）
    // ★ 2026-05-01 修：原 P1-21 把 hint 嵌进 topic 导致 mission header truncate
    //   失效，多行 topic 把右上角设置按钮挤出可视区。改成 hintLines 仅用于事件
    //   trace，topic 保持原样。
    const scope = body?.scope ?? "mission";
    const dimRef = (body?.dimensionRef ?? "").trim();
    const chapterIdx = body?.chapterIndex;
    const todoTitle = (body?.todoTitle ?? "").trim();
    const reasonText = (body?.reasonText ?? "").trim();

    const TOPIC_LIMIT = 200;
    const focusedTopic = original.topic.slice(0, TOPIC_LIMIT);
    const input = this.cloneInputFromMission(original, {
      topic: focusedTopic,
      // ★ 2026-05-06 (P0-G): 同上，让 budgetProfile 决定 maxCredits
      maxCreditsFallback: undefined,
    });

    const newMissionId = randomUUID();
    this.ownership.assign(newMissionId, userId);

    // emit mission:manual-rerun-from-todo 让前端 ledger 把新 mission 关联到 sourceTodoId
    await this.buffer.broadcast({
      type: "agent-playground.mission:manual-rerun-from-todo",
      scope: { missionId: newMissionId, userId },
      payload: {
        sourceMissionId,
        sourceTodoId: todoId,
        origin,
        scope,
        dimensionRef: dimRef || undefined,
        chapterIndex: chapterIdx,
        todoTitle: todoTitle || undefined,
        reasonText: reasonText || undefined,
      },
      timestamp: Date.now(),
    });

    void this.orchestrator
      .runMission(newMissionId, input, userId)
      .catch((err: unknown) => {
        this.log.error(
          `mission ${newMissionId} (rerun-todo ${todoId} of ${sourceMissionId}) failed: ${
            err instanceof Error ? err.message : String(err)
          }`,
        );
      });

    return { missionId: newMissionId, streamNamespace: "agent-playground" };
  }

  /** 从 source mission row 重建 RunMissionInput（rerun 复用原配置）*/
  private cloneInputFromMission(
    original: NonNullable<Awaited<ReturnType<MissionStore["getById"]>>>,
    overrides: {
      topic?: string;
      /** undefined = 不传 maxCredits，让 resolveMissionCredits 按 budgetProfile 推导 */
      maxCreditsFallback?: number;
      inheritFromMissionId?: string;
    },
  ): RunMissionInput {
    const originalProfile = (original as { userProfile?: unknown })
      .userProfile as Partial<RunMissionInput> | null | undefined;
    return {
      topic: overrides.topic ?? original.topic,
      depth: (["quick", "standard", "deep"].includes(
        originalProfile?.depth ?? original.depth,
      )
        ? (originalProfile?.depth ?? original.depth)
        : "deep") as RunMissionInput["depth"],
      language: (originalProfile?.language ??
        (original.language === "en-US"
          ? "en-US"
          : "zh-CN")) as RunMissionInput["language"],
      budgetProfile: originalProfile?.budgetProfile ?? "medium",
      styleProfile: originalProfile?.styleProfile ?? "executive",
      lengthProfile: originalProfile?.lengthProfile ?? "standard",
      audienceProfile: originalProfile?.audienceProfile ?? "domain-expert",
      withFigures: originalProfile?.withFigures ?? true,
      auditLayers: originalProfile?.auditLayers ?? "default",
      concurrency: originalProfile?.concurrency ?? 3,
      viewMode: originalProfile?.viewMode ?? "continuous",
      // ★ 2026-05-06 (P0-K): maxCredits 必填，rerun 直接沿用原 mission 用户传入值；
      //   原 mission 缺失（旧数据）则用 fallback（caller 传 1000 等显式值，不再有
      //   "BUDGET_PROFILE_CREDITS[unlimited]=10000" 类的内部硬编码默认）。
      maxCredits:
        originalProfile?.maxCredits ?? overrides.maxCreditsFallback ?? 1000,
      // ★ P0-K: budgetMultiplierOverride 也必填，rerun 沿用原值或默认 1.0
      budgetMultiplierOverride:
        originalProfile?.budgetMultiplierOverride ?? 1.0,
      inheritFromMissionId: overrides.inheritFromMissionId,
    };
  }
}
