/**
 * AI Engine Facade
 * 统一入口模块
 */

export { AIEngineFacade } from "./ai-engine.facade";
export * from "./types";
export { PromptSkillBridge } from "../skills/runtime";
// ★ Re-export Engine types so AI App modules can import from facade instead of engine internals
export type {
  RoomConfig,
  EngineEvent,
} from "../realtime/abstractions/event-emitter.interface";
export type { SaveEvidenceRequest } from "../evidence/abstractions/evidence.interface";
export type { AICapabilityContext } from "../capabilities/ai-capability-resolver.service";
export type {
  SkillPromptBundle,
  SkillPromptOptions,
} from "../capabilities/types";
export type { SkillMdDefinition } from "../skills/types/skill-md.types";
export type { EmbeddingResult } from "../rag/embedding";
export type {
  SimilaritySearchOptions,
  SimilarityResult,
} from "../rag/vector/vector.service";
export { TaskCompletionType } from "../orchestration/services/circuit-breaker.service";
export { UserIntent } from "../orchestration/services/interfaces";
export type { TeamInfo } from "../teams/services/teams.service";
