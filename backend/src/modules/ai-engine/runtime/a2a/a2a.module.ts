/**
 * A2A (Agent-to-Agent) Module
 * 将 Genesis.ai 暴露为 A2A 兼容的 Agent，让外部 AI Agent 可以发现和调用 Genesis 能力。
 *
 * 本模块全部实现内聚于 ai-engine/runtime/a2a/，TraceCollector 仍由 ai-kernel 提供
 * （待 PR 2 的 Observability 迁移完成后，会一并改为本模块自注入）。
 */

import { Module } from "@nestjs/common";
import { A2AController } from "./a2a.controller";
import { AgentCardRegistry } from "./agent-card.registry";
import { A2AApiKeyGuard } from "./guards/a2a-api-key.guard";
import { TEAMS_SERVICE_TOKEN, TRACE_COLLECTOR_TOKEN } from "./a2a.tokens";
import { SecretsModule } from "../../../ai-infra/secrets/secrets.module";
import { TeamsModule } from "../../teams/teams.module";
import { TeamsService } from "../../teams/services/teams.service";
import { TraceCollectorService } from "@/modules/ai-engine/runtime/observability/trace-collector.service";

@Module({
  imports: [SecretsModule, TeamsModule],
  controllers: [A2AController],
  providers: [
    AgentCardRegistry,
    A2AApiKeyGuard,
    TraceCollectorService, // observability support (temporary: still in ai-kernel)
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
