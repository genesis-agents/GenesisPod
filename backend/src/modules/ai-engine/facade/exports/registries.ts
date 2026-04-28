/**
 * Registry exports — AI App modules inject these directly
 *
 * PR-X13: harness registry symbols (AgentRegistry / TeamRegistry / RoleRegistry /
 * CollaborationModule / AgentOrchestrator) have been removed from here.
 * Import them from "@/modules/ai-harness/facade" instead.
 */
export { ToolRegistry } from "../../tools/registry/tool-registry";
export { SkillRegistry } from "../../skills/registry/skill-registry";
