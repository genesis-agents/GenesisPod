/**
 * Realtime & event exports —— 已迁移到 ai-harness/facade。
 *
 * 历史出口：RoomConfig / EngineEvent / IEngineEventEmitter / RoomType /
 *           IProgressTracker / TrackedTask / TaskPhase /
 *           calculateOverallProgress / EventBusService /
 *           EngineEventEmitterService / ProgressTrackerService
 *
 * ai-app 请直接 import from "@/modules/ai-harness/facade"。
 */

// ProgressEvent 仍由 ai-engine 内部使用 — 留作 engine 内部类型导出
export type { ProgressEvent } from "../../../ai-harness/protocol/realtime/abstractions/event-emitter.interface";
