/**
 * AgentPlaygroundModule
 *
 * Demo 模块 —— 展示 Harness 全栈能力（loop / verify / handoff / memory / cost）。
 */

import { Module, OnModuleInit } from "@nestjs/common";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { JwtModule } from "@nestjs/jwt";
import { AgentPlaygroundController } from "./agent-playground.controller";
import { AgentPlaygroundGateway } from "./agent-playground.gateway";
import { ResearchTeamOrchestrator } from "./services/research-team.orchestrator";
import { MissionOwnershipRegistry } from "./services/mission-ownership.registry";
import { MissionEventBuffer } from "./services/mission-event-buffer.service";
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
  ],
  exports: [MissionEventBuffer],
})
export class AgentPlaygroundModule implements OnModuleInit {
  constructor(
    private readonly eventBus: DomainEventBus,
    private readonly registry: DomainEventRegistry,
    private readonly buffer: MissionEventBuffer,
  ) {}

  onModuleInit(): void {
    // 1. 注册事件类型 —— DomainEventBus 校验未注册的 type 会 drop+warn
    this.registry.registerAll(AGENT_PLAYGROUND_EVENTS);
    // 2. 注册缓冲 adapter，截获所有 agent-playground.* 事件入内存（给 /replay 用）
    this.eventBus.registerAdapter(this.buffer);
  }
}
