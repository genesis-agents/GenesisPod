/**
 * Public API Module
 *
 * Exposes Raven AI Engine capabilities via REST endpoints
 * for external consumers (OpenClaw, Web Apps, Mobile).
 *
 * Authentication: MCP API Key (same key pool as MCP Server)
 * Response format: Wrapped by global ResponseTransformInterceptor
 */

import { Module } from "@nestjs/common";
import { PublicApiController } from "./public-api.controller";
import { SecretsModule } from "../core/secrets/secrets.module";
import { DeepResearchModule } from "../ai-app/research/deep-research/deep-research.module";

@Module({
  imports: [
    SecretsModule, // Required for MCPApiKeyGuard
    DeepResearchModule, // Required for DeepResearchAgentService
    // AIEngineFacade is @Global, no explicit import needed
  ],
  controllers: [PublicApiController],
})
export class PublicApiModule {}
