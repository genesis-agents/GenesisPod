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
