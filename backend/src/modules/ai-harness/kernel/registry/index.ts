/**
 * Legacy Agent Registry Module — migrated from ai-engine/agents/registry (PR-X5)
 *
 * AgentRegistry here = IPlanBasedAgent registry (old plan→execute model).
 * Distinguished from ai-harness/process/handoff/agent-registry (IAgent runtime registry).
 *
 * @deprecated Use SpecAgentRegistry for new-style agents.
 */

export { AgentRegistry, AgentRegistryStats } from "./plan-based-agent-registry";
export { AgentOrchestrator, AgentStatusReport } from "./agent-orchestrator";
