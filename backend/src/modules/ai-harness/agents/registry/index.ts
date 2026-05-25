/**
 * Legacy Agent Registry Module — PR-X5 (now in ai-harness/agents/registry)
 *
 * AgentRegistry here = IPlanBasedAgent registry (old plan→execute model).
 * Distinguished from ai-harness/handoffs/agent-registry (IAgent runtime registry).
 *
 * @deprecated Use SpecAgentRegistry for new-style agents.
 */

export { AgentRegistry } from "./plan-based-agent-registry";
export type { AgentRegistryStats } from "./plan-based-agent-registry";
export { AgentOrchestrator } from "./agent-orchestrator";
export type { AgentStatusReport } from "./agent-orchestrator";
