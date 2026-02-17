/**
 * Public API Module
 *
 * Exposes Genesis.ai capabilities via REST endpoints
 * for external consumers (OpenClaw, Web Apps, Mobile).
 *
 * Authentication: MCP API Key (same key pool as MCP Server)
 * Response format: Wrapped by global ResponseTransformInterceptor
 */

import { Module } from "@nestjs/common";
import { PublicApiController } from "./public-api.controller";
import { SecretsModule } from "../core/secrets/secrets.module";
import { DiscussionModule } from "../ai-app/research/discussion/discussion.module";

@Module({
  imports: [
    SecretsModule, // Required for MCPApiKeyGuard
    DiscussionModule, // Required for DiscussionResearchService
    // AIEngineFacade is @Global, no explicit import needed
  ],
  controllers: [PublicApiController],
})
export class PublicApiModule {}
