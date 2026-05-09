/**
 * AgentPlaygroundModule
 *
 * Demo 模块 —— 展示 Harness 全栈能力（loop / verify / handoff / memory / cost）。
 *
 * 模型解析（系统配置感知 + BYOK）：
 *   完全走 Harness。Harness 的 ReAct/PlanAct/ContextCompactor/SkillLearner 都已
 *   修成"chat() 时透传 modelType + userId"——AiChatService 自然走：
 *     1. 用户 UserModelConfig 默认（BYOK）
 *     2. 全局 ai_models DB 默认
 *     3. DEFAULT_AI_MODEL env（兜底）
 *   API Key 由 Secret Manager 通过 ai_models.secret_key 解析，
 *   不需要任何独立 env var。AI App 层不再做模型 promotion 或硬编码。
 */

import { Module, OnModuleInit } from "@nestjs/common";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { JwtModule } from "@nestjs/jwt";
import { AgentPlaygroundController } from "./agent-playground.controller";
import { AgentPlaygroundGateway } from "./agent-playground.gateway";
import { MissionRuntimeShellService } from "./services/mission/workflow/mission-runtime-shell.service";
import { MissionStageBindingsService } from "./services/mission/workflow/mission-stage-bindings.service";
// ★ R2-C 单轨化 (2026-05-04)：pipelineDispatcher 是唯一 mission orchestrator
//   legacy TeamMission 已删除，flag service 已删除
import { PlaygroundPipelineDispatcher } from "./services/mission/workflow/playground-pipeline-dispatcher.service";
import {
  MissionPipelineOrchestrator,
  MissionPipelineRegistry,
} from "@/modules/ai-harness/facade";
import { SkillLoaderService } from "@/modules/ai-engine/facade";
import { MissionEventBuffer } from "./services/mission/lifecycle/mission-event-buffer.service";
import { MissionStore } from "./services/mission/lifecycle/mission-store.service";
import { PrismaMissionCheckpointStore } from "./services/mission/lifecycle/prisma-mission-checkpoint.store";
import {
  MissionCheckpointService,
  type MissionCheckpointStore,
} from "@/modules/ai-harness/facade";
import { LeaderChatService } from "./services/chat/leader-chat.service";
// MissionStateService 已上提到 harness/memory/working/handoff-compactor.service.ts（@Global RuntimeMemoryModule）
// ── 2026-04-30 (B 路线): 单 stage 局部重跑 ──
import { LocalRerunService } from "./services/mission/rerun/local-rerun.service";
import { CtxHydratorService } from "./services/mission/rerun/ctx-hydrator.service";
import { RerunGuardService } from "./services/mission/rerun/rerun-guard.service";
// RerunLockRegistry 已上提到 ai-harness/facade（@Global TeamsModule provider）
import { StageRerunDispatcher } from "./services/mission/rerun/stage-rerun.dispatcher";
// ★ PR-R5b-FULL (2026-05-07): rerun runtime builder（billing/pool/leader 装配 stub）
import { RerunMissionRuntimeBuilder } from "./services/mission/rerun/rerun-runtime-builder.service";
// ★ 单源 LeaderRunFn 工厂（dispatcher + rerun 共用，去 buildLeaderInvocation 双源）
import { LeaderInvocationFactory } from "./services/mission/leader-invocation.factory";
import { MissionRerunOrchestratorService } from "./services/mission/rerun/mission-rerun-orchestrator.service";
import { MissionExportService } from "./services/export/mission-export.service";
// PostmortemClassifierService 已上提到 @Global HarnessModule（PR-2 standardize playground）
import {
  AgentInvoker,
  LeaderService,
  ResearcherService,
  ReconcilerService,
  AnalystService,
  WriterService,
  ReviewerService,
  VerifierService,
  StewardService,
} from "./services/roles";
import { CreditsModule } from "../../ai-infra/credits/credits.module";
import {
  DomainEventBus,
  DomainEventRegistry,
  MissionLivenessGuard,
} from "@/modules/ai-harness/facade";
import { AGENT_PLAYGROUND_EVENTS } from "./agent-playground.events";
import { PrismaService } from "../../../common/prisma/prisma.service";

@Module({
  imports: [
    CreditsModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService) => ({
        secret: configService.get<string>("JWT_SECRET"),
        signOptions: { expiresIn: "7d" },
      }),
      inject: [ConfigService],
    }),
  ],
  controllers: [AgentPlaygroundController],
  providers: [
    AgentPlaygroundGateway,
    MissionRuntimeShellService,
    MissionStageBindingsService,
    // MissionOwnershipRegistry / MissionAbortRegistry 由 @Global HarnessModule 提供（PR-X-E 上提）
    MissionEventBuffer,
    MissionStore,
    // ★ Phase 5 (2026-04-29): playground 接入 ai-harness 沉淀的 MissionCheckpointService
    PrismaMissionCheckpointStore,
    {
      provide: MissionCheckpointService,
      useFactory: (store: MissionCheckpointStore) =>
        new MissionCheckpointService(store),
      inject: [PrismaMissionCheckpointStore],
    },
    // ★ 2026-05-05 MissionHealthScheduler 已删（DISABLED + 由 unified MissionLivenessGuard 接管）
    LeaderChatService,
    // FailureLearnerService / ReportArtifactAssembler 由 @Global HarnessModule 提供（PR-X-failure-learner 上提 / PR-X-report-artifact 上提）
    // MissionStateService → HandoffCompactorService 已上提到 @Global RuntimeMemoryModule（PR-5 standardize playground）
    // ── Per-role services（Phase Lead-Services）──
    AgentInvoker,
    LeaderInvocationFactory,
    LeaderService,
    ResearcherService,
    ReconcilerService,
    AnalystService,
    WriterService,
    ReviewerService,
    VerifierService,
    StewardService,
    // ── 局部重跑 ──
    LocalRerunService,
    CtxHydratorService,
    // ★ 2026-05-07 rerun-overhaul v1.1：唯一 in-flight 判定 + zombie 主动清理
    RerunGuardService,
    // RerunLockRegistry 已上提到 ai-harness/facade（PR-3 standardize playground）
    StageRerunDispatcher,
    // ★ PR-R5b-FULL (2026-05-07): RerunRuntimeBuilder — dispatcher 8 stage handler 必读
    RerunMissionRuntimeBuilder,
    MissionRerunOrchestratorService,
    // ── 导出装配（CSV / Markdown / JSON）──
    MissionExportService,
    // ★ R2-C 单轨化 (2026-05-04)：pipeline-v1 是唯一 mission 入口
    //   dispatcher.onModuleInit 注册 PLAYGROUND_PIPELINE 到 registry
    //   legacy TeamMission 已删除，PlaygroundRuntimeFlagService 已删除
    MissionPipelineRegistry,
    MissionPipelineOrchestrator,
    PlaygroundPipelineDispatcher,
    // ── S12 postmortem 失败模式分类（已上提到 @Global HarnessModule）──
  ],
  // R-CA (2026-05-05): 导出 dispatcher + store 让 custom-agents 模块复用启动 + 列表能力
  exports: [MissionEventBuffer, PlaygroundPipelineDispatcher, MissionStore],
})
export class AgentPlaygroundModule implements OnModuleInit {
  constructor(
    private readonly eventBus: DomainEventBus,
    private readonly registry: DomainEventRegistry,
    private readonly buffer: MissionEventBuffer,
    private readonly store: MissionStore,
    private readonly prisma: PrismaService,
    // ★ 2026-05-05 unified harness liveness guard（替代 4 个旧 detector）
    private readonly livenessGuard: MissionLivenessGuard,
    // R0-A3 (2026-05-04): 注册 playground skills 目录到 engine SkillLoader
    //   17 个 SKILL.md (mece-mission-planning / leader-* / dimension-research / web-research 等)
    //   下推到 ai-app/agent-playground/skills/，需要在这里 register 到 SkillRegistry
    //   否则 SkillActivator 在 leader/researcher role 启动时报 "skipped: <skill-id>"
    private readonly skillLoader: SkillLoaderService,
  ) {}

  async onModuleInit(): Promise<void> {
    // R0-A3: 注册 agent-playground skill 目录
    const path = await import("path");
    await this.skillLoader.addSkillDirectory({
      path: path.resolve(__dirname, "skills"),
      domain: "agent-playground",
      recursive: false,
    });

    // 1. 注册事件类型 —— DomainEventBus 校验未注册的 type 会 drop+warn
    this.registry.registerAll(AGENT_PLAYGROUND_EVENTS);
    // 2. 注册缓冲 adapter，截获所有 agent-playground.* 事件入内存（给 /replay 用）
    this.eventBus.registerAdapter(this.buffer);
    // 3. ★ 2026-05-05 归并 4 个 detector → 单一 harness MissionLivenessGuard
    //    用户驱动重构，归一 + 友好 + 完整覆盖：
    //      - 归一：playground / writing / research / topic-insights 共用同一算法
    //      - 多信号：heartbeat + events 必须双 stale 才认死，单一信号失败不误杀
    //      - 启动期豁免 5min：避免 fire-and-forget refreshHeartbeat 未落库即被杀
    //      - 三阶梯：soft warn 10min（不杀）/ hard kill 5min 双 stale / wall-time 4h
    //
    //    ★ 历史路径全部废弃（保留写路径 refreshHeartbeat / markStageComplete）：
    //      - this.store.recoverOrphanedRunning(240)              ← removed
    //      - this.store.recoverPodCrashedRunning(300) on 60s     ← removed
    //      - MissionHealthScheduler                              ← deleted (file removed)
    //      - MissionOrphanDetectorService                        ← deleted (file removed)
    this.livenessGuard.registerAdapter(
      "agent-playground",
      {
        fetchRunningMissions: async () => {
          const rows = await this.prisma.agentPlaygroundMission
            .findMany({
              where: { status: "running" },
              select: {
                id: true,
                userId: true,
                startedAt: true,
                heartbeatAt: true,
              },
              take: 200,
            })
            .catch(
              () =>
                [] as Array<{
                  id: string;
                  userId: string;
                  startedAt: Date;
                  heartbeatAt: Date | null;
                }>,
            );
          if (rows.length === 0) return [];
          // ★ 2026-05-07 rerun-overhaul：wall-time 用 effective start = max(startedAt,
          //   lastReopenedAt)。reopen 后的 mission 不应被原 startedAt 误判超时。
          //   按 missionId 取最近一条 mission:reopened 事件 ts。
          const ids = rows.map((r) => r.id);
          const reopenedMap = new Map<string, number>();
          try {
            const reopens =
              await this.prisma.agentPlaygroundMissionEvent.findMany({
                where: {
                  missionId: { in: ids },
                  type: "agent-playground.mission:reopened",
                },
                select: { missionId: true, ts: true },
                orderBy: { ts: "desc" },
              });
            for (const ev of reopens) {
              if (!reopenedMap.has(ev.missionId)) {
                const tsMs = Number(ev.ts);
                if (Number.isFinite(tsMs)) reopenedMap.set(ev.missionId, tsMs);
              }
            }
          } catch {
            // best-effort：reopen 查询失败不阻断 liveness 主流程，回退到 startedAt
          }
          return rows.map((r) => {
            const reopenedTs = reopenedMap.get(r.id);
            return {
              id: r.id,
              userId: r.userId,
              startedAt: r.startedAt,
              heartbeatAt: r.heartbeatAt,
              lastReopenedAt: reopenedTs != null ? new Date(reopenedTs) : null,
            };
          });
        },
        getMostRecentEventTs: async (missionIds, sinceMs) => {
          const grouped = await this.prisma.agentPlaygroundMissionEvent
            .groupBy({
              by: ["missionId"],
              where: {
                missionId: { in: missionIds as string[] },
                ts: { gte: BigInt(sinceMs) },
              },
              _max: { ts: true },
            })
            .catch(
              () => [] as { missionId: string; _max: { ts: bigint | null } }[],
            );
          const out = new Map<string, number>();
          for (const g of grouped) {
            const ts = g._max.ts;
            if (ts != null) {
              const tsMs = Number(ts);
              if (Number.isFinite(tsMs) && tsMs <= Number.MAX_SAFE_INTEGER) {
                out.set(g.missionId, tsMs);
              }
            }
          }
          return out;
        },
        markFailed: async (missionId, reason, errorMessage) => {
          await this.store.markFailed(missionId, { errorMessage });
          await this.eventBus
            .emit({
              type: "agent-playground.mission:failed",
              scope: { missionId, userId: "" },
              payload: {
                message: errorMessage,
                failureCode:
                  reason === "wall-time-exceeded"
                    ? "RUNNER_WALL_TIME_EXCEEDED"
                    : "MISSION_STALE",
                source: "liveness-guard",
              },
              timestamp: Date.now(),
            })
            .catch(() => undefined);
        },
        emitWarning: async (missionId, userId, payload) => {
          await this.eventBus
            .emit({
              type: "agent-playground.mission:warning",
              scope: { missionId, userId },
              payload: {
                message: `Mission 心跳/事件已停 ≥ 20 分钟，可能已卡死。建议主动取消重试，或继续等待至 wall-time 4h 自动失败。`,
                ageMs: payload.ageMs,
                heartbeatAgeMs: payload.heartbeatAgeMs,
                eventAgeMs: payload.eventAgeMs,
                source: "liveness-guard",
              },
              timestamp: Date.now(),
            })
            .catch(() => undefined);
        },
      },
      {
        // playground 实测档位最长 deep + thorough+ + unlimited ≈ 3h，给 4h 兜底
        wallTimeCapMs: 4 * 60 * 60 * 1000,
        // ★ 2026-05-06 (P0-B regression 真因): 5/5 unified MissionLivenessGuard 落地后
        //   staleThresholdMs=5min 把 4940b78d (5/3 跑通的 52min mission) 这类正常 deep
        //   mission 误杀。chapter writing × 56 + critic L4 等单次 LLM 调用本身就常 ~3-5min，
        //   双 stale 5min 阈值让 mission 在长 stage 间隔被误判 stale。
        //   调整：stale 阈值 5min → 15min；soft warn 10min → 20min。
        //   wall-time cap 仍 4h 兜底，真死锁不会无限等。
        staleThresholdMs: 15 * 60 * 1000,
        softWarnThresholdMs: 20 * 60 * 1000,
        startupGraceMs: 5 * 60 * 1000,
        scanIntervalMs: 60_000,
        bootDelayMs: 60_000,
      },
    );
  }
}
