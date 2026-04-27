/**
 * Registry exports — AI App modules inject these directly
 * Also re-exports NestJS modules from ai-harness that ai-engine.module.ts needs to wire.
 */
export { CollaborationModule } from "../../../ai-harness/process/collaboration/collaboration.module";
export { ToolRegistry } from "../../tools/registry/tool-registry";
export { AgentRegistry } from "../../../ai-harness/kernel/registry/legacy-agent-registry";
export { AgentOrchestrator, type AgentStatusReport } from "../../../ai-harness/kernel/registry/agent-orchestrator";
export { TeamRegistry } from "../../../ai-harness/runtime/teams/registry/team-registry";
export { RoleRegistry } from "../../../ai-harness/runtime/teams/registry/role-registry";
export { SkillRegistry } from "../../skills/registry/skill-registry";
