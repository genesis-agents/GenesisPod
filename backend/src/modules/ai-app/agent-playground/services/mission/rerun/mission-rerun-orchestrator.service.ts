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
import { TeamMission } from "../workflow/team.mission";
import { MissionStore } from "../lifecycle/mission-store.service";
import { MissionEventBuffer } from "../lifecycle/mission-event-buffer.service";
import {
  MissionCheckpointService,
  MissionOwnershipRegistry,
} from "@/modules/ai-harness/facade";
import { type RunMissionInput } from "../../../dto/run-mission.dto";

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
    private readonly orchestrator: TeamMission,
    private readonly store: MissionStore,
    private readonly buffer: MissionEventBuffer,
    private readonly ownership: MissionOwnershipRegistry,
    private readonly checkpoint: MissionCheckpointService,
  ) {}

  /**
   * Phase P11-1: rerun 复用原 mission 的 userProfile（如有）+ checkpoint clone，
   * 让 team.mission 入口 canResume() 取到 ok 决策，下游 stage 跳过已完成 keys。
   */
  async rerunFullMission(
    sourceMissionId: string,
    userId: string,
  ): Promise<RerunResult> {
    const original = await this.store.getById(sourceMissionId, userId);
    if (!original) {
      throw new ForbiddenException(`mission ${sourceMissionId} not found`);
    }

    const input = this.cloneInputFromMission(original, {
      maxCreditsFallback:
        (original as { maxCredits?: number }).maxCredits ?? 300,
    });

    const newMissionId = randomUUID();
    this.ownership.assign(newMissionId, userId);

    // ★ P0-R5-2 (2026-04-30): rerun 闭环 — 复制原 mission checkpoint 到新 mission
    //   过期 / 已 completed 的 checkpoint 自动跳过；新 mission 从头跑。
    const cloned = await this.checkpoint
      .cloneCheckpoint(sourceMissionId, newMissionId)
      .catch(() => false);
    if (cloned) {
      this.log.log(
        `[rerun] mission ${newMissionId} resumed from ${sourceMissionId} checkpoint`,
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
    const original = await this.store.getById(sourceMissionId, userId);
    if (!original) {
      throw new ForbiddenException(`mission ${sourceMissionId} not found`);
    }

    if (original.status === "running") {
      throw new BadRequestException(
        "Source mission is still running — cancel or wait for completion before re-running individual todos",
      );
    }

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
      maxCreditsFallback: 300,
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
    overrides: { topic?: string; maxCreditsFallback: number },
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
      maxCredits: originalProfile?.maxCredits ?? overrides.maxCreditsFallback,
    };
  }
}
