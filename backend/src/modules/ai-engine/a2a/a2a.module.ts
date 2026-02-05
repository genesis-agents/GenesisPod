/**
 * A2A (Agent-to-Agent) Module
 * 将 Raven AI Engine 暴露为 A2A 兼容的 Agent
 * 让外部 AI Agent 可以发现和调用 Raven 能力
 */

import { Module } from "@nestjs/common";
import { A2AController } from "./a2a.controller";
import { AgentCardRegistry } from "./agent-card/agent-card.registry";
import { A2AApiKeyGuard } from "./guards/a2a-api-key.guard";
import { SecretsModule } from "../../core/secrets/secrets.module";
import { TeamsModule } from "../teams/teams.module";

@Module({
  imports: [SecretsModule, TeamsModule],
  controllers: [A2AController],
  providers: [AgentCardRegistry, A2AApiKeyGuard],
  exports: [AgentCardRegistry],
})
export class A2AModule {}
