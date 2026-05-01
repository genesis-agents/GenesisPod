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
import { TeamMission } from "./services/mission/workflow/team.mission";
import { MissionEventBuffer } from "./services/mission/lifecycle/mission-event-buffer.service";
import { MissionStore } from "./services/mission/lifecycle/mission-store.service";
import { PrismaMissionCheckpointStore } from "./services/mission/lifecycle/prisma-mission-checkpoint.store";
import { MissionHealthScheduler } from "./services/mission/lifecycle/mission-health.scheduler";
import {
  MissionCheckpointService,
  type MissionCheckpointStore,
} from "../../ai-harness/facade";
import { LeaderChatService } from "./services/chat/leader-chat.service";
import { MissionStateService } from "./services/mission/lifecycle/mission-state.service";
// ── 2026-04-30 (B 路线): 单 stage 局部重跑 ──
import { LocalRerunService } from "./services/mission/rerun/local-rerun.service";
import { CtxHydratorService } from "./services/mission/rerun/ctx-hydrator.service";
import { RerunLockRegistry } from "./services/mission/rerun/rerun-lock.registry";
import { StageRerunDispatcher } from "./services/mission/rerun/stage-rerun.dispatcher";
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
  MissionOrphanDetectorService,
} from "../../ai-harness/facade";
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
    TeamMission,
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
    // ★ Phase 6 (2026-04-29): playground 接入 ai-harness 沉淀的 MissionHealthMonitor
    MissionHealthScheduler,
    LeaderChatService,
    // FailureLearnerService / ReportArtifactAssembler 由 @Global HarnessModule 提供（PR-X-failure-learner 上提 / PR-X-report-artifact 上提）
    MissionStateService,
    // ── Per-role services（Phase Lead-Services）──
    AgentInvoker,
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
    RerunLockRegistry,
    StageRerunDispatcher,
  ],
  exports: [MissionEventBuffer],
})
export class AgentPlaygroundModule implements OnModuleInit {
  constructor(
    private readonly eventBus: DomainEventBus,
    private readonly registry: DomainEventRegistry,
    private readonly buffer: MissionEventBuffer,
    private readonly store: MissionStore,
    private readonly prisma: PrismaService,
    private readonly orphanDetector: MissionOrphanDetectorService,
  ) {}

  onModuleInit(): void {
    // 1. 注册事件类型 —— DomainEventBus 校验未注册的 type 会 drop+warn
    this.registry.registerAll(AGENT_PLAYGROUND_EVENTS);
    // 2. 注册缓冲 adapter，截获所有 agent-playground.* 事件入内存（给 /replay 用）
    this.eventBus.registerAdapter(this.buffer);
    // 3. 启动恢复：清理 Railway recycle 后悬挂的 running missions
    //    ★ 2026-05-01 (PR-G iter5): 30min 太短 —— mission deep+extended+thorough+unlimited
    //    wall-time 可达 150min (resolveMissionWallTimeMs)。原 30min 触发 mission
    //    在 55min 处被误标 orphan。改 240min（覆盖 3h hard cap + 1h buffer）。
    void this.store.recoverOrphanedRunning(240);
    // 4. ★ Phase 9 (2026-04-30): 注册 orphan detector callbacks —— 跨 pod 接管基于 heartbeat 的快速检测
    this.orphanDetector.registerCallbacks({
      fetchRunningMissions: () =>
        this.prisma.agentPlaygroundMission
          .findMany({
            where: { status: "running" },
            // ★ 2026-05-01 (PR-G): 加 startedAt 让 detector 能给新启动 mission 5min 恩典
            select: { id: true, userId: true, startedAt: true },
            take: 200,
          })
          .catch(() => []),
      markOrphanFailed: async (missionId, userId, reason) => {
        await this.store.markFailed(missionId, {
          errorMessage: reason,
        });
        await this.eventBus
          .emit({
            type: "agent-playground.mission:failed",
            scope: { missionId, userId },
            payload: {
              message: reason,
              failureCode: "ORPHAN_HEARTBEAT_LOST",
              source: "orphan-detector",
            },
            timestamp: Date.now(),
          })
          .catch(() => undefined);
      },
    });
  }
}
