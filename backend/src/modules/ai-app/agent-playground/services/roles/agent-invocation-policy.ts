import { FailureLearnerService } from "@/modules/ai-harness/facade";
import { BillingRuntimeEnvAdapter } from "@/modules/ai-harness/facade";

export class AgentInvocationPolicy {
  constructor(private readonly failureLearner: FailureLearnerService) {}

  async preDisableKnownFailingModels(
    billing: BillingRuntimeEnvAdapter,
    agentSpecId: string,
    promptKey: string,
  ): Promise<{ failed: string; fallback: string }[]> {
    const known = await this.failureLearner
      .lookup({ agentSpecId, systemPrompt: promptKey })
      .catch(() => []);
    const preDisabled: { failed: string; fallback: string }[] = [];
    for (const rec of known) {
      if (rec.count >= 2 && rec.lastFallbackModel) {
        billing.markModelDisabled(rec.modelId, rec.lastFallbackModel);
        preDisabled.push({
          failed: rec.modelId,
          fallback: rec.lastFallbackModel,
        });
      }
    }
    return preDisabled;
  }

  resolveLoopOverride(
    auditLayers: string,
    stage:
      | "leader"
      | "researcher"
      | "reconciler"
      | "analyst"
      | "writer"
      | "reviewer"
      | "verifier"
      | "critic"
      | "steward",
  ): "react" | "reflexion" | undefined {
    if (auditLayers === "minimal") return undefined;
    const useReflexion =
      auditLayers === "thorough" || auditLayers === "thorough+";
    if (!useReflexion) return undefined;
    if (
      stage === "researcher" ||
      stage === "reconciler" ||
      stage === "verifier" ||
      stage === "critic" ||
      stage === "steward"
    ) {
      return undefined;
    }
    return "reflexion";
  }
}
