/**
 * A2A (Agent-to-Agent) Module
 * å°† Genesis.ai æš´éœ²ä¸º A2A å…¼å®¹çš„ Agentï¼Œè®©å¤–éƒ¨ AI Agent å¯ä»¥å‘çŽ°å’Œè°ƒç”¨ Genesis èƒ½åŠ›ã€‚
 *
 * TraceCollectorService æ¥è‡ª @Global() ObservabilityModuleï¼Œæœ¬æ¨¡å—æ— éœ€å†æ¬¡æ³¨å†Œä¸º providerã€‚
 */

/**
 * A2A (Agent-to-Agent) Module
 * å°† Genesis.ai æš´éœ²ä¸º A2A å…¼å®¹çš„ Agentï¼Œè®©å¤–éƒ¨ AI Agent å¯ä»¥å‘çŽ°å’Œè°ƒç”¨ Genesis èƒ½åŠ›ã€‚
 *
 * Controller (A2AController) è¿ç§»è‡³ open-api/a2a-server.controller.ts (PR-X17)ã€‚
 * DI token ç»‘å®šä¿ç•™åœ¨æœ¬æ¨¡å—ï¼ˆä½œä¸ºæœåŠ¡åè®®å±‚ï¼‰ã€‚
 *
 * TraceCollectorService æ¥è‡ª @Global() ObservabilityModuleï¼Œæœ¬æ¨¡å—æ— éœ€å†æ¬¡æ³¨å†Œä¸º providerã€‚
 */

import { Module } from "@nestjs/common";
import { AgentCardRegistry } from "./agent-card.registry";
import { A2AApiKeyGuard } from "./guards/a2a-api-key.guard";
import { A2ARpcService } from "./a2a-rpc.service";
import { TEAMS_SERVICE_TOKEN, TRACE_COLLECTOR_TOKEN } from "./a2a.tokens";
import { SecretsModule } from "../../../ai-infra/secrets/secrets.module";
import { TeamsModule } from "../../teams/teams.module";
import { TeamsService } from "../../teams/services/teams.service";
import { TraceCollectorService } from "../../../ai-harness/tracing/observability/trace-collector.service";

@Module({
  imports: [SecretsModule, TeamsModule],
  providers: [
    AgentCardRegistry,
    A2AApiKeyGuard,
    // 2026-05-01 (PR-X-P): A2A v0.3 JSON-RPC handler service
    A2ARpcService,
    // DI token bindings: A2AController (in open-api/a2a-server.controller.ts) injects via token
    {
      provide: TEAMS_SERVICE_TOKEN,
      useExisting: TeamsService,
    },
    {
      provide: TRACE_COLLECTOR_TOKEN,
      useExisting: TraceCollectorService,
    },
  ],
  exports: [
    AgentCardRegistry,
    A2AApiKeyGuard,
    A2ARpcService,
    TEAMS_SERVICE_TOKEN,
    TRACE_COLLECTOR_TOKEN,
    // PR-X22: re-export SecretsModule so that consumers (e.g. A2AApiModule which
    // declares A2AController + uses @UseGuards(A2AApiKeyGuard)) can resolve the
    // guard's SecretsService dep in their own module context.
    SecretsModule,
  ],
})
export class A2AModule {}
