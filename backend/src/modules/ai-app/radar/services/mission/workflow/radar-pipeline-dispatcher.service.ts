/**
 * RadarPipelineDispatcher —— Radar mission 入口（彻底重构后）
 *
 * 完全对齐 agent-playground/PlaygroundPipelineDispatcher 范式：
 *   - 启动时 register RADAR_REFRESH_PIPELINE + RADAR_DISCOVERY_PIPELINE 到
 *     MissionPipelineRegistry（每个 step 注入业务 hook 闭包）
 *   - runRefreshMission / runDiscoveryMission 都走 MissionRuntimeShell.openSession
 *     + orchestrator.run({ signal, onEvent })
 *   - per-mission session 存 sessions Map，hook 闭包通过 sessionLookup 反查
 *   - mission 结束（成功 / 失败 / 取消）cleanup session
 *
 * 设计要点：
 *   - dispatcher 是 runtime-glue，业务逻辑全在 BusinessOrchestrator + 9 个 stage adapter
 *   - 事件桥接：orchestrator 内置 stage:started/completed/failed → 桥到
 *     ai-radar.run.stage，前端 ws 订阅这个事件
 *   - Discovery mission 也走完整 runtimeShell.openSession（含 abortRegistry / wallTimer
 *     / heartbeat / billing），adapter 自己识别 discovery input 跳过 createMissionRow。
 */
import { Injectable, Logger, OnModuleInit } from "@nestjs/common";
import { randomUUID } from "crypto";
import {
  DomainEventBus,
  MissionPipelineOrchestrator,
  MissionPipelineRegistry,
  type MissionPipelineConfig,
  type ResolvedStageHooks,
} from "@/modules/ai-harness/facade";
import {
  RadarMissionRuntimeShell,
  type MissionRuntimeSession,
} from "./radar-mission-runtime-shell.service";
import { RadarBusinessOrchestrator } from "./radar-business-orchestrator.service";
import { RadarMissionStore } from "../lifecycle/radar-mission-store.service";
import {
  RADAR_DISCOVERY_PIPELINE,
  RADAR_REFRESH_PIPELINE,
} from "../../../radar.config";
import { RADAR_EVENTS } from "../../../radar.constants";
import {
  emptyRadarMissionState,
  type RadarMissionContext,
} from "../stages/radar-stage-types";
import type {
  RunRadarDiscoveryMissionInput,
  RunRadarRefreshMissionInput,
} from "../../../dto/run-radar-refresh-mission.dto";

export interface RadarMissionSummary {
  readonly missionId: string;
  readonly status: "completed" | "failed" | "aborted";
  readonly stageOutputs: Record<string, unknown>;
  /**
   * Discovery mission 特有：source-curator agent 输出的候选列表
   * （从 ctx.state.discoveryCandidates 取出）
   */
  readonly discoveryCandidates?: unknown[];
  readonly error?: unknown;
}

interface SessionEntry {
  readonly session: MissionRuntimeSession;
  readonly t0: number;
  readonly ctx: RadarMissionContext;
}

@Injectable()
export class RadarPipelineDispatcher implements OnModuleInit {
  private readonly log = new Logger(RadarPipelineDispatcher.name);
  private readonly sessions = new Map<string, SessionEntry>();

  constructor(
    private readonly registry: MissionPipelineRegistry,
    private readonly orchestrator: MissionPipelineOrchestrator,
    private readonly runtimeShell: RadarMissionRuntimeShell,
    private readonly businessOrch: RadarBusinessOrchestrator,
    private readonly eventBus: DomainEventBus,
    private readonly store: RadarMissionStore,
  ) {}

  async onModuleInit(): Promise<void> {
    this.businessOrch.bindSessionLookup((missionId) => {
      const entry = this.sessions.get(missionId);
      if (!entry) {
        throw new Error(
          `[radar-pipeline] no active session for mission ${missionId}`,
        );
      }
      return entry.ctx;
    });

    await this.businessOrch.preloadSystemPrompts();

    if (!this.registry.has(RADAR_REFRESH_PIPELINE.id)) {
      this.registry.register(
        this.buildPipelineWithHooks(RADAR_REFRESH_PIPELINE),
      );
      this.log.log(
        `[radar-pipeline] registered "${RADAR_REFRESH_PIPELINE.id}" (8 step)`,
      );
    }
    if (!this.registry.has(RADAR_DISCOVERY_PIPELINE.id)) {
      this.registry.register(
        this.buildPipelineWithHooks(RADAR_DISCOVERY_PIPELINE),
      );
      this.log.log(
        `[radar-pipeline] registered "${RADAR_DISCOVERY_PIPELINE.id}" (1 step)`,
      );
    }
  }

  async runRefreshMission(
    input: RunRadarRefreshMissionInput,
    userId: string,
    opts: { missionId?: string; workspaceId?: string } = {},
  ): Promise<RadarMissionSummary> {
    const missionId = opts.missionId ?? randomUUID();
    return this.runMission({
      missionId,
      pipelineId: RADAR_REFRESH_PIPELINE.id,
      input,
      userId,
      workspaceId: opts.workspaceId,
      trigger: input.trigger,
    });
  }

  async runDiscoveryMission(
    input: RunRadarDiscoveryMissionInput,
    userId: string,
    opts: { missionId?: string; workspaceId?: string } = {},
  ): Promise<RadarMissionSummary> {
    const missionId = opts.missionId ?? randomUUID();
    return this.runMission({
      missionId,
      pipelineId: RADAR_DISCOVERY_PIPELINE.id,
      input,
      userId,
      workspaceId: opts.workspaceId,
      trigger: "MANUAL",
    });
  }

  /**
   * 共通 mission 执行流程（refresh + discovery 共用 runtimeShell.openSession
   * 走完整 framework lifecycle —— framework adapter 自己识别 discovery input
   * 跳过 createMissionRow，但 abortRegistry / wallTimer / heartbeat 全保留）。
   */
  private async runMission(args: {
    missionId: string;
    pipelineId: string;
    input: RunRadarRefreshMissionInput | RunRadarDiscoveryMissionInput;
    userId: string;
    workspaceId?: string;
    trigger: "MANUAL" | "SCHEDULED" | "FIRST_RUN";
  }): Promise<RadarMissionSummary> {
    const { missionId, pipelineId, input, userId, workspaceId, trigger } = args;
    const t0 = Date.now();
    const isDiscovery = pipelineId === RADAR_DISCOVERY_PIPELINE.id;

    const session = await this.runtimeShell.openSession({
      missionId,
      input,
      userId,
      workspaceId,
    });

    const ctx: RadarMissionContext = {
      missionId,
      userId,
      trigger,
      input,
      state: emptyRadarMissionState(),
      signal: session.missionAbort.signal,
    };
    this.sessions.set(missionId, { session, t0, ctx });

    const topicId = input.topicId;

    if (!isDiscovery) {
      await this.emitToBus({
        type: RADAR_EVENTS.RUN_STARTED,
        missionId,
        userId,
        payload: {
          runId: missionId,
          topicId,
          trigger,
          startedAt: new Date(t0).toISOString(),
        },
      });
    }

    try {
      const result = await this.runtimeShell.runWithinContext(session, () =>
        this.orchestrator.run({
          missionId,
          pipelineId,
          input,
          userId,
          tenantId: workspaceId,
          signal: session.missionAbort.signal,
          onEvent: async (event) =>
            this.handleOrchestratorEvent(missionId, userId, event),
        }),
      );

      const durationMs = Date.now() - t0;
      if (isDiscovery) {
        const candidates =
          (ctx.state as { discoveryCandidates?: unknown[] })
            .discoveryCandidates ?? [];
        return {
          missionId,
          status: "completed",
          stageOutputs: result.stageOutputs,
          discoveryCandidates: candidates,
        };
      }

      await this.store.markCompleted(missionId, {
        ...ctx.state.metrics,
        durationMs,
      });
      await this.emitToBus({
        type: RADAR_EVENTS.RUN_COMPLETED,
        missionId,
        userId,
        payload: {
          runId: missionId,
          topicId,
          status: "COMPLETED",
          durationMs,
          metrics: ctx.state.metrics,
        },
      });
      return {
        missionId,
        status: "completed",
        stageOutputs: result.stageOutputs,
      };
    } catch (err) {
      const message =
        err instanceof Error ? err.message : String(err ?? "unknown error");
      const isAbort = message.includes("abort") || ctx.signal.aborted;
      const durationMs = Date.now() - t0;
      if (isDiscovery) {
        return { missionId, status: "failed", stageOutputs: {}, error: err };
      }
      if (isAbort) {
        await this.store.markCancelled(missionId, message);
        await this.emitToBus({
          type: RADAR_EVENTS.RUN_CANCELLED,
          missionId,
          userId,
          payload: {
            runId: missionId,
            topicId,
            reason: message,
          },
        });
        return { missionId, status: "aborted", stageOutputs: {}, error: err };
      }
      await this.store.markFailed(missionId, message);
      await this.emitToBus({
        type: RADAR_EVENTS.RUN_FAILED,
        missionId,
        userId,
        payload: {
          runId: missionId,
          topicId,
          error: message,
          durationMs,
        },
      });
      return { missionId, status: "failed", stageOutputs: {}, error: err };
    } finally {
      session.cleanup();
      this.sessions.delete(missionId);
    }
  }

  /**
   * 桥接 orchestrator 的 stage:* 事件到 radar.run.stage（前端 ws 订阅这个）。
   */
  private async handleOrchestratorEvent(
    missionId: string,
    userId: string,
    event: {
      type: string;
      stepId?: string;
      primitive?: string;
      timestamp?: number;
      error?: unknown;
      output?: unknown;
    },
  ): Promise<void> {
    if (!event.stepId) return;
    if (
      event.type !== "stage:started" &&
      event.type !== "stage:completed" &&
      event.type !== "stage:failed"
    ) {
      return;
    }
    const status =
      event.type === "stage:started"
        ? "started"
        : event.type === "stage:completed"
          ? "completed"
          : "failed";
    const entry = this.sessions.get(missionId);
    const topicId = entry?.ctx.input?.topicId ?? "";
    await this.emitToBus({
      type: RADAR_EVENTS.RUN_STAGE,
      missionId,
      userId,
      payload: {
        runId: missionId,
        topicId,
        stage: event.stepId,
        status,
        ...(status === "failed"
          ? {
              message:
                event.error instanceof Error
                  ? event.error.message
                  : String(event.error ?? ""),
            }
          : {}),
      },
      timestamp: event.timestamp,
    });
  }

  private async emitToBus(event: {
    type: string;
    missionId: string;
    userId: string;
    payload: unknown;
    timestamp?: number;
  }): Promise<void> {
    await this.eventBus
      .emit({
        type: event.type,
        scope: { missionId: event.missionId, userId: event.userId },
        payload: event.payload,
        timestamp: event.timestamp ?? Date.now(),
      })
      .catch((err: unknown) => {
        this.log.warn(
          `[radar-pipeline] emit ${event.type} for ${event.missionId} failed: ${err instanceof Error ? err.message : String(err)}`,
        );
      });
  }

  /**
   * 取消 mission（controller 调）：触发 abortRegistry.abort → orchestrator
   * 内部 signal.aborted=true → 各 stage 早断 → finally cleanup。
   */
  abortMission(missionId: string, reason = "user_cancelled"): boolean {
    const entry = this.sessions.get(missionId);
    if (!entry) return false;
    try {
      entry.session.missionAbort.abort(reason);
      return true;
    } catch (err) {
      this.log.warn(
        `[radar-pipeline] abort ${missionId} failed: ${err instanceof Error ? err.message : String(err)}`,
      );
      return false;
    }
  }

  private buildPipelineWithHooks(
    config: MissionPipelineConfig,
  ): MissionPipelineConfig {
    const stepHooks: Record<string, ResolvedStageHooks> = {};
    for (const step of config.steps) {
      stepHooks[step.id] = this.businessOrch.buildHooksForStep(step.id);
    }
    return {
      ...config,
      steps: config.steps.map((s) => ({
        ...s,
        hooks: stepHooks[s.id] ?? {},
      })),
    };
  }
}
