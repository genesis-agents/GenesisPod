/**
 * IntentGatewayModule — L6 Agent OS Intent Gateway
 *
 * Provides IntentGatewayService as the L6 entry point for intent routing.
 * Exports it so AgentOsModule (and downstream consumers) can inject it.
 */
import { Module } from "@nestjs/common";
import { IntentGatewayService } from "./intent-gateway.service";

@Module({
  providers: [IntentGatewayService],
  exports: [IntentGatewayService],
})
export class IntentGatewayModule {}
