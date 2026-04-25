/**
 * AgentPlaygroundModule
 *
 * Demo 模块 —— 展示 Harness 全栈能力（loop / verify / handoff / memory / cost）。
 * 所有依赖来自既有真实系统（Harness facade + ai-infra/credits + RuntimeEnvironmentService）。
 */

import { Module } from "@nestjs/common";
import { AgentPlaygroundController } from "./agent-playground.controller";
import { AgentPlaygroundGateway } from "./agent-playground.gateway";
import { ResearchTeamOrchestrator } from "./services/research-team.orchestrator";
import { CreditsModule } from "../../ai-infra/credits/credits.module";

@Module({
  imports: [
    // CreditsService 由 CreditsModule 提供
    CreditsModule,
    // HarnessModule 是 @Global，自动注入 AgentRunner / DomainEventBus / JudgeService /
    // MemoryAutoIndexer / AgentEventStore 等
    // RuntimeEnvironmentService 由 ResourceModule 提供（也是 @Global）
  ],
  controllers: [AgentPlaygroundController],
  providers: [AgentPlaygroundGateway, ResearchTeamOrchestrator],
})
export class AgentPlaygroundModule {}
