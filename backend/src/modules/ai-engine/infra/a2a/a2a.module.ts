/**
 * A2A (Agent-to-Agent) Module
 * 将 Genesis.ai 暴露为 A2A 兼容的 Agent
 * 让外部 AI Agent 可以发现和调用 Genesis 能力
 */

import { Module } from "@nestjs/common";
import { A2AController } from "../../../ai-kernel/ipc/a2a/a2a.controller";
import { AgentCardRegistry } from "../../../ai-kernel/facade";
import { A2AApiKeyGuard } from "../../../ai-kernel/facade";
import { SecretsModule } from "../../../ai-infra/secrets/secrets.module";
import { TeamsModule } from "../../teams/teams.module";
import { TeamsService } from "../../teams/services/teams.service";
import { ProcessEventLogService as TraceCollectorService } from "../../../ai-kernel/facade";
import { TEAMS_SERVICE_TOKEN } from "../../../ai-kernel/abstractions";

@Module({
  imports: [SecretsModule, TeamsModule],
  controllers: [A2AController],
  providers: [
    AgentCardRegistry,
    A2AApiKeyGuard,
    TraceCollectorService, // P1 #21: Add observability support
    // DI token alias: TEAMS_SERVICE_TOKEN → TeamsService
    // Allows A2AController (in ai-kernel) to inject TeamsService via token
    // without the kernel layer directly importing ai-engine service classes.
    {
      provide: TEAMS_SERVICE_TOKEN,
      useExisting: TeamsService,
    },
  ],
  exports: [AgentCardRegistry],
})
export class A2AModule {}
