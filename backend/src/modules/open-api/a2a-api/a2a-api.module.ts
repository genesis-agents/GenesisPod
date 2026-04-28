/**
 * A2A API Module — open-api layer for Agent-to-Agent protocol endpoints
 *
 * This module exposes A2AController in the open-api layer.
 * Service infrastructure (AgentCardRegistry, DI tokens, guards) lives in
 * ai-harness/protocol/a2a/a2a.module.ts.
 *
 * Controller migrated from ai-harness/protocol/a2a/a2a.controller.ts (PR-X17).
 */

import { Module } from "@nestjs/common";
import { A2AController } from "../a2a-server.controller";
import { A2AModule } from "../../ai-harness/protocol/a2a/a2a.module";

@Module({
  imports: [A2AModule],
  controllers: [A2AController],
})
export class A2AApiModule {}
