// @blueprint:framework-subclass
/**
 * MissionRerunOrchestratorService —— playground 业务子类(继承
 * BusinessTeamRerunOrchestratorFramework)
 *
 * 2026-05-24 P5 (Wave 1)：rerun guard + status whitelist + ownership + checkpoint
 * clone + emit + fire-and-forget 骨架已上提到 ai-harness/teams/business-team/rerun/
 * business-team-rerun-orchestrator.framework。本类只剩 playground hook：
 *   - sourceMissionResolver / extractStatus / extractTopic：业务表 schema
 *   - cloneInput：configSnapshot → RunMissionInput 重建
 *   - runMission：调 playground pipeline dispatcher
 *   - emit / eventNames：playground 业务事件 type
 *   - rerunFromTodo 业务规则：origin / scope 黑名单 + dimensionRef / chapterIndex DTO
 */

import { BadRequestException, Injectable } from "@nestjs/common";
import { PlaygroundPipelineDispatcher } from "../pipeline/playground.pipeline";
import {
  MissionStore,
  type MissionDetail,
} from "../lifecycle/mission-store.service";
// MissionDetail (basic mission row)

import { MissionEventBuffer } from "../lifecycle/mission-event-buffer.service";
import {
  BusinessTeamRerunOrchestratorFramework,
  MissionCheckpointService,
  MissionOwnershipRegistry,
  type MissionRerunOrchestratorHooks,
  type MissionRerunResult,
} from "@/modules/ai-harness/facade";
import { type RunMissionInput } from "../../api/dto/run-mission.dto";
import type { PlaygroundConfigSnapshot } from "../../runtime/agent-playground.input-rebuilder";
import { RerunGuardService } from "./rerun-guard.service";

interface RerunTodoBody {
  origin?: string;
  scope?: "dimension" | "chapter" | "review" | "system" | "mission";
  dimensionRef?: string;
  chapterIndex?: number;
  todoTitle?: string;
  reasonText?: string;
}

@Injectable()
export class MissionRerunOrchestratorService extends BusinessTeamRerunOrchestratorFramework<
  MissionDetail,
  RunMissionInput,
  RerunTodoBody
> {
  constructor(
    orchestrator: PlaygroundPipelineDispatcher,
    store: MissionStore,
    buffer: MissionEventBuffer,
    ownership: MissionOwnershipRegistry,
    checkpoint: MissionCheckpointService,
    rerunGuard: RerunGuardService,
  ) {
    const hooks: MissionRerunOrchestratorHooks<
      MissionDetail,
      RunMissionInput,
      RerunTodoBody
    > = {
      rerunGuard,
      sourceMissionResolver: (sourceMissionId, userId) =>
        store.getById(sourceMissionId, userId),
      // 全覆盖审计修 (2026-05-06): 白名单校验，cancelled 也允许 rerun（用户感知 OK）
      rerunnableStatuses: [
        "completed",
        "failed",
        "quality-failed",
        "cancelled",
      ] as const,
      extractStatus: (m) => m.status,
      extractTopic: (m) => m.topic,
      cloneInput: (source, overrides) => {
        // C5/G7 S3：rerun 输入只从 typed config snapshot 重建(单一真源),不读 userProfile
        const snap = (source as { configSnapshot?: unknown })
          .configSnapshot as PlaygroundConfigSnapshot | null;
        if (snap?.schemaVersion == null) {
          throw new BadRequestException(
            `mission ${source.id} 早于 config snapshot 上线(legacy),不支持重跑。`,
          );
        }
        const b = snap.businessInput;
        return {
          topic: overrides.topic ?? snap.topic,
          depth: b.depth,
          language: snap.language as RunMissionInput["language"],
          budgetProfile: b.budgetProfile,
          styleProfile: b.styleProfile,
          lengthProfile: b.lengthProfile,
          audienceProfile: b.audienceProfile,
          withFigures: b.withFigures,
          auditLayers: b.auditLayers,
          concurrency: b.concurrency,
          viewMode: b.viewMode,
          searchTimeRange: b.searchTimeRange,
          knowledgeBaseIds: b.knowledgeBaseIds,
          maxCredits: snap.budget.maxCredits,
          budgetMultiplierOverride: snap.budget.budgetMultiplier,
          wallTimeCapMs: snap.runtimeLimits.wallTimeCapMs,
          inheritFromMissionId: overrides.inheritFromMissionId,
        };
      },
      runMission: async (missionId, input, userId) => {
        await orchestrator.runMission(missionId, input, userId);
      },
      assignOwnership: (missionId, userId) =>
        ownership.assign(missionId, userId),
      cloneCheckpoint: (sourceMissionId, newMissionId) =>
        checkpoint.cloneCheckpoint(sourceMissionId, newMissionId),
      emit: async ({ type, missionId, userId, payload }) => {
        await buffer.broadcast({
          type,
          scope: { missionId, userId },
          payload,
          timestamp: Date.now(),
        });
      },
      streamNamespace: "agent-playground",
      eventNames: {
        manualRerunFromTodo: "agent-playground.mission:manual-rerun-from-todo",
      },
    };
    super(hooks, "agent-playground");
  }

  /**
   * Playground 专属 rerunFromTodo 业务规则封装：
   *  - origin/scope 黑名单（leader-assess-abort / s11-persist）
   *  - dimensionRef / chapterIndex / todoTitle / reasonText 字段透传给 emit payload
   *  - topic 200 字符 trim（防 header truncate 失效）
   *
   *  保留旧签名 (controller 直接调对象参数,framework 的 rerunFromTodo 是对象 + 多个 callback)。
   */
  async rerunFromTodo(args: {
    sourceMissionId: string;
    userId: string;
    todoId: string;
    body: RerunTodoBody;
  }): Promise<MissionRerunResult> {
    const { sourceMissionId, userId, todoId, body } = args;
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

    return this["rerunFromTodoFrameworkCore"](
      { sourceMissionId, userId, todoId, todoBody: body },
      (todoBody) => {
        const scope = todoBody?.scope ?? "mission";
        const dimRef = (todoBody?.dimensionRef ?? "").trim();
        const todoTitle = (todoBody?.todoTitle ?? "").trim();
        const reasonText = (todoBody?.reasonText ?? "").trim();
        return {
          origin: (todoBody?.origin ?? "").trim(),
          scope,
          dimensionRef: dimRef || undefined,
          chapterIndex: todoBody?.chapterIndex,
          todoTitle: todoTitle || undefined,
          reasonText: reasonText || undefined,
        };
      },
      (_todoBody, sourceTopic) => sourceTopic.slice(0, 200),
    );
  }

  /** 保留旧签名 rerunFullMission(sourceMissionId, userId, mode) (controller 直接调) */
  async rerunFullMission(
    sourceMissionId: string,
    userId: string,
    mode: "fresh" | "incremental" = "incremental",
  ): Promise<MissionRerunResult> {
    return this["rerunFullMissionFrameworkCore"]({
      sourceMissionId,
      userId,
      mode,
    });
  }
}
