/**
 * LocalRerunService — 单 stage 局部重跑入口（B 路线主调）
 *
 * 与老版 rerunTodo（创建新 mission）的核心区别：
 *   ✓ 复用原 missionId（不创建新 mission）
 *   ✓ 从 DB hydrate 上游产物 → MissionContext（不重跑 S1-S2-S3）
 *   ✓ 跑指定的 stage（按 todo.scope 路由）
 *   ✓ patch 回 DB（markRerunPatch 只 update 受影响字段）
 *   ✓ 失败时原产物保留（atomic — patch 只在最后写）
 *   ✓ 并发锁防同 todo 重入
 *
 * v1 支持 4 类 scope：
 *   - dimension      → 单维度 researcher + 链式 S5/S8 该维度章节
 *   - chapter        → 单章 writer 重写
 *   - system:s9b     → 10 维客观评审（轻量）
 *   - system:s10     → leader signoff（轻量）
 *
 * 不允许：
 *   - origin = leader-assess-abort（已放弃）
 *   - system: s11-persist（终态归档）
 *   - mission 当前 status === 'running'（防覆盖在跑产物）
 */

import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import { CtxHydratorService } from "./ctx-hydrator.service";
import { RerunLockRegistry } from "@/modules/ai-harness/facade";
import { StageRerunDispatcher } from "./stage-rerun.dispatcher";
import type { EmitFn } from "../workflow/mission-deps";
import { PrismaService } from "../../../../../../common/prisma/prisma.service";

export interface LocalRerunInput {
  missionId: string;
  userId: string;
  todoId: string;
  origin: string;
  scope: "dimension" | "chapter" | "review" | "system" | "mission";
  dimensionRef?: string;
  chapterIndex?: number;
  todoTitle?: string;
  reasonText?: string;
}

export interface LocalRerunResult {
  ok: true;
  missionId: string;
  scope: string;
  durationMs: number;
}

@Injectable()
export class LocalRerunService {
  private readonly log = new Logger(LocalRerunService.name);

  constructor(
    private readonly hydrator: CtxHydratorService,
    private readonly lockRegistry: RerunLockRegistry,
    private readonly dispatcher: StageRerunDispatcher,
    // ★ 全覆盖审计修 (2026-05-06): TOCTOU fix — 改为 prisma $transaction 原子校验
    private readonly prisma: PrismaService,
  ) {}

  /**
   * 判断 todo 是否能用 local-rerun（vs 老版 fresh rerun）
   * 调用方先 query 这个，UI 路由按结果选按钮。
   */
  static isLocallyRerunable(args: {
    origin: string;
    scope: string;
    todoId: string;
  }): { rerunable: boolean; reason?: string } {
    if (args.origin === "leader-assess-abort") {
      return { rerunable: false, reason: "已放弃的维度无法重跑" };
    }
    if (args.todoId.endsWith("s11-persist")) {
      return { rerunable: false, reason: "持久化阶段不能局部重跑" };
    }
    // v1 真实可工作 scope：仅 system:s9b（无装配级 dep）
    if (
      args.scope === "system" &&
      args.todoId.endsWith("s9b-objective-evaluation")
    ) {
      return { rerunable: true };
    }
    // v1.1 待做：dimension / chapter / s10（涉及 billing / SupervisedMission 装配 dep）
    return {
      rerunable: false,
      reason: `${args.scope} 类型暂未支持局部重跑（v1 仅 system:s9b），请用"开新研究对比"按钮`,
    };
  }

  /**
   * 入口：执行单 stage 局部重跑（异步，不阻塞 HTTP 响应）
   * 调用方应直接 fire-and-forget，外部用事件流跟踪进度。
   */
  async run(input: LocalRerunInput, emit: EmitFn): Promise<LocalRerunResult> {
    const { missionId, userId, todoId, origin, scope } = input;
    const t0 = Date.now();

    // 1. 资格闸 ──
    const eligibility = LocalRerunService.isLocallyRerunable({
      origin,
      scope,
      todoId,
    });
    if (!eligibility.rerunable) {
      throw new BadRequestException(eligibility.reason ?? "局部重跑不允许");
    }

    // 2+3. ★ 全覆盖审计修 (2026-05-06): 原 acquire + getById TOCTOU race
    //   改用 prisma $transaction 在事务内原子确认 mission 非 running，跨 pod 安全。
    //   lockRegistry.acquire 在事务后，防止同 todo 并发重入。
    await this.prisma.$transaction(async (tx) => {
      const exists = await tx.agentPlaygroundMission.findFirst({
        where: { id: missionId, userId },
        select: { id: true, status: true },
      });
      if (!exists) {
        throw new NotFoundException(
          `mission ${missionId} not found or not owned by ${userId}`,
        );
      }
      if (exists.status === "running") {
        throw new BadRequestException(
          "原 mission 还在跑，无法局部重跑 —— 取消或等结束后再操作",
        );
      }
    });

    if (!this.lockRegistry.acquire(missionId, todoId)) {
      throw new BadRequestException(
        "该任务正在重跑，请等待当前一轮完成后再操作",
      );
    }

    // 4. emit started ──
    await emit({
      type: "agent-playground.mission:rerun-started",
      missionId,
      userId,
      payload: {
        todoId,
        origin,
        scope,
        dimensionRef: input.dimensionRef,
        chapterIndex: input.chapterIndex,
        todoTitle: input.todoTitle,
        startedAtMs: t0,
      },
    }).catch(() => {});

    try {
      // 5. hydrate context from DB ──
      const ctx = await this.hydrator.hydrate(missionId, userId);

      // 6. dispatch 到具体 scope handler ──
      await this.dispatcher.dispatch({
        ctx,
        input,
        emit,
      });

      // 7. emit completed ──
      const durationMs = Date.now() - t0;
      await emit({
        type: "agent-playground.mission:rerun-completed",
        missionId,
        userId,
        payload: {
          todoId,
          scope,
          durationMs,
        },
      }).catch(() => {});

      this.log.log(
        `[local-rerun ${missionId}] todo=${todoId} scope=${scope} done in ${durationMs}ms`,
      );
      return { ok: true, missionId, scope, durationMs };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.log.error(
        `[local-rerun ${missionId}] todo=${todoId} scope=${scope} failed: ${message}`,
      );
      await emit({
        type: "agent-playground.mission:rerun-failed",
        missionId,
        userId,
        payload: {
          todoId,
          scope,
          errorMessage: message,
          durationMs: Date.now() - t0,
        },
      }).catch(() => {});
      throw err;
    } finally {
      this.lockRegistry.release(missionId, todoId);
    }
  }
}
