/**
 * Realtime & event exports
 */
export type {
  RoomConfig,
  EngineEvent,
  IEngineEventEmitter,
  ProgressEvent,
  RoomType,
} from "../../../ai-harness/protocol/realtime/abstractions/event-emitter.interface";
export type {
  IProgressTracker,
  TrackedTask,
  CreateTrackedTaskRequest,
  TaskPhase,
} from "../../../ai-harness/protocol/realtime/abstractions/progress-tracker.interface";
export { calculateOverallProgress } from "../../../ai-harness/protocol/realtime/abstractions/progress-tracker.interface";
export { EventBusService as EngineEventEmitterService } from "../../../ai-harness/protocol/ipc/event-bus.service";
export { ProgressTrackerService } from "../../../ai-harness/protocol/ipc/progress-tracker.service";
