/**
 * A2A (Agent-to-Agent) Module
 * 将 Genesis.ai 暴露为 A2A 兼容的 Agent，让外部 AI Agent 可以发现和调用 Genesis 能力。
 *
 * TraceCollectorService 来自 @Global() ObservabilityModule，本模块无需再次注册为 provider。
 */

import { Module } from "@nestjs/common";
import { A2AController } from "./a2a.controller";
import { AgentCardRegistry } from "./agent-card.registry";
import { A2AApiKeyGuard } from "./guards/a2a-api-key.guard";
import { TEAMS_SERVICE_TOKEN, TRACE_COLLECTOR_TOKEN } from "./a2a.tokens";
import { SecretsModule } from "../../../ai-infra/secrets/secrets.module";
import { TeamsModule } from "../../runtime/teams/teams.module";
import { TeamsService } from "../../runtime/teams/services/teams.service";
import { TraceCollectorService } from "../../../ai-harness/governance/observability/trace-collector.service";

@Module({
  imports: [SecretsModule, TeamsModule],
  controllers: [A2AController],
  providers: [
    AgentCardRegistry,
    A2AApiKeyGuard,
    // DI token bindings: A2AController injects via token instead of concrete class
    {
      provide: TEAMS_SERVICE_TOKEN,
      useExisting: TeamsService,
    },
    {
      provide: TRACE_COLLECTOR_TOKEN,
      useExisting: TraceCollectorService,
    },
  ],
  exports: [AgentCardRegistry],
})
export class A2AModule {}
