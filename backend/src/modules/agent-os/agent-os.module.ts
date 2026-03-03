/**
 * AgentOsModule — L6 Agent OS
 *
 * Top-level module for the Agent OS layer. Acts as the unified entry point
 * for user interactions: intent parsing, routing to AI Apps, session
 * management, and future rate-limiting / tracing hooks.
 *
 * Currently bootstraps the IntentGatewayModule. Additional sub-modules
 * (SessionModule, TracingModule, etc.) will be added here as they are built.
 *
 * Architecture layer: L6 (top of 6-layer stack)
 * Depends on: L2 AI Engine (via facade) — injected as @Optional
 */
import { Module } from "@nestjs/common";
import { IntentGatewayModule } from "./intent/intent-gateway.module";

@Module({
  imports: [IntentGatewayModule],
  exports: [IntentGatewayModule],
})
export class AgentOsModule {}
