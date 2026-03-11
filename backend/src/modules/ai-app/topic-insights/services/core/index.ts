export { ResearchLeaderService } from "./research-leader.service";
export { TopicTeamOrchestratorService } from "./topic-team-orchestrator.service";
export {
  ResearchEventEmitterService,
  RESEARCH_INTERNAL_EVENTS,
} from "./research-event-emitter.service";
export type { ResumeMissionExecutionPayload } from "./research-event-emitter.service";
export { ResearchStrategyService } from "./research-strategy.service";

// ★ Mission sub-services (God Service decomposition)
export { MissionObservabilityService } from "./mission-observability.service";
export { MissionKernelBridgeService } from "./mission-kernel-bridge.service";
export { MissionNotificationService } from "./mission-notification.service";

// ★ New sub-services (Facade pattern)
export { TopicCrudService } from "./topic-crud.service";
export { TopicDimensionService } from "./topic-dimension.service";
export { TopicExportService } from "./topic-export.service";
export { TopicScheduleService } from "./topic-schedule.service";
