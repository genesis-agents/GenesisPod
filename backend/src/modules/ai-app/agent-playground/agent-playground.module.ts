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
import { ResearchTeamOrchestrator } from "./services/research-team.orchestrator";
import { MissionOwnershipRegistry } from "./services/mission/mission-ownership.registry";
import { MissionEventBuffer } from "./services/mission/mission-event-buffer.service";
import { MissionStore } from "./services/mission/mission-store.service";
import { LeaderChatService } from "./services/chat/leader-chat.service";
import { HarnessFailureLearner } from "./services/failure-learning/harness-failure-learner.service";
import { ReportAssemblerService } from "./services/artifact/report-assembler.service";
import { MissionStateService } from "./services/mission/mission-state.service";
import { MissionAbortRegistry } from "./services/mission/mission-abort.registry";
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
import { DomainEventBus, DomainEventRegistry } from "../../ai-engine/facade";
import { AGENT_PLAYGROUND_EVENTS } from "./agent-playground.events";

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
    ResearchTeamOrchestrator,
    MissionOwnershipRegistry,
    MissionEventBuffer,
    MissionStore,
    LeaderChatService,
    HarnessFailureLearner,
    ReportAssemblerService,
    MissionStateService,
    MissionAbortRegistry,
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
  ],
  exports: [MissionEventBuffer],
})
export class AgentPlaygroundModule implements OnModuleInit {
  constructor(
    private readonly eventBus: DomainEventBus,
    private readonly registry: DomainEventRegistry,
    private readonly buffer: MissionEventBuffer,
    private readonly store: MissionStore,
  ) {}

  onModuleInit(): void {
    // 1. 注册事件类型 —— DomainEventBus 校验未注册的 type 会 drop+warn
    this.registry.registerAll(AGENT_PLAYGROUND_EVENTS);
    // 2. 注册缓冲 adapter，截获所有 agent-playground.* 事件入内存（给 /replay 用）
    this.eventBus.registerAdapter(this.buffer);
    // 3. 启动恢复：清理 Railway recycle 后悬挂的 running missions
    void this.store.recoverOrphanedRunning(30);
  }
}
