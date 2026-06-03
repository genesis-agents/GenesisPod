/**
 * Public API Module
 *
 * Exposes GenesisPod capabilities via REST endpoints
 * for external consumers (OpenClaw, Web Apps, Mobile).
 *
 * Authentication: MCP API Key (same key pool as MCP Server)
 * Response format: Wrapped by global ResponseTransformInterceptor
 */

import { Module } from "@nestjs/common";
import { PublicApiController } from "./public-api.controller";
import { SecretsModule } from "../../platform/secrets/secrets.module";
@Module({
  imports: [
    SecretsModule, // Required for MCPApiKeyGuard
    // ★ DiscussionModule removed — research accessed via AIFacade.executeDirectResearch()
    // AIFacade is @Global, no explicit import needed
  ],
  controllers: [PublicApiController],
})
export class PublicApiModule {}
