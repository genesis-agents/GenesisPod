/**
 * Legacy Agent Registry Module — PR-X5 (now in ai-harness/kernel/registry)
 *
 * AgentRegistry here = IPlanBasedAgent registry (old plan→execute model).
 * Distinguished from ai-harness/process/handoff/agent-registry (IAgent runtime registry).
 *
 * @deprecated Use SpecAgentRegistry for new-style agents.
 */

export { AgentRegistry, AgentRegistryStats } from "./plan-based-agent-registry";
export { AgentOrchestrator, AgentStatusReport } from "./agent-orchestrator";
