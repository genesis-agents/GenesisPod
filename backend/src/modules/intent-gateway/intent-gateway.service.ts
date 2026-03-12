/**
 * IntentGatewayService — L6 意图网关
 *
 * Thin wrapper over L2 IntentRouterService that adds L6 concerns:
 * - Session-scoped intent routing
 * - Module capability listing for external consumers
 * - Rate limiting hooks (future)
 *
 * Architecture: L6 Intent Gateway → L3 AI Engine (via facade)
 *
 * IntentRouterService is injected as @Optional so that the Intent Gateway
 * module can bootstrap independently of the AI Engine module in test
 * and edge-deployment scenarios.
 */
import { Injectable, Logger, Optional } from "@nestjs/common";
import {
  IntentRouterService,
  type IntentAgentContext,
  type RouteResult,
} from "../ai-engine/facade";

@Injectable()
export class IntentGatewayService {
  private readonly logger = new Logger(IntentGatewayService.name);

  constructor(
    @Optional() private readonly intentRouter?: IntentRouterService,
  ) {}

  /**
   * Route user intent to the appropriate AI module.
   *
   * Builds a minimal AgentContext from the caller-supplied partial context,
   * delegates to IntentRouterService.route(), and returns the RouteResult
   * (containing a DAG TaskPlan and a requiresConfirmation flag).
   *
   * Returns null when IntentRouterService is not available (e.g. test env).
   */
  async routeIntent(
    text: string,
    context?: Partial<IntentAgentContext>,
  ): Promise<RouteResult | null> {
    if (!this.intentRouter) {
      this.logger.warn(
        "IntentRouterService not available — skipping intent routing",
      );
      return null;
    }

    const agentContext: IntentAgentContext = {
      userId: context?.userId ?? "anonymous",
      sessionId: context?.sessionId,
      metadata: context?.metadata,
    };

    return this.intentRouter.route(text, agentContext);
  }

  /**
   * List the names of all registered AI App modules that can handle intents.
   *
   * Uses the static MODULE_REGISTRY on IntentRouterService so no instance
   * call is needed, but we still guard on router availability for safety.
   */
  listCapabilities(): string[] {
    if (!this.intentRouter) {
      return [];
    }
    return IntentRouterService.getRegisteredModules().map((m) => m.module);
  }
}
