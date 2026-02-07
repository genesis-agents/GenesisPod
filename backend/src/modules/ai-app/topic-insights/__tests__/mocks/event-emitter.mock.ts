// @ts-nocheck
/**
 * Event Emitter Mock for Topic Research Tests
 *
 * Provides mock implementations for event-related services
 * Type checking is disabled due to Jest mock compatibility issues.
 */

import { jest } from "@jest/globals";

/**
 * Create a mock NestJS EventEmitter2
 */
export function createMockEventEmitter2() {
  return {
    emit: jest.fn(),
    emitAsync: jest.fn().mockResolvedValue([]),
    on: jest.fn(),
    once: jest.fn(),
    addListener: jest.fn(),
    removeListener: jest.fn(),
    removeAllListeners: jest.fn(),
  };
}

/**
 * Create a mock ResearchEventEmitterService
 */
export function createMockResearchEventEmitter() {
  return {
    // Mission events
    emitMissionStarted: jest.fn().mockResolvedValue(undefined),
    emitMissionProgress: jest.fn().mockResolvedValue(undefined),
    emitMissionCompleted: jest.fn().mockResolvedValue(undefined),
    emitMissionFailed: jest.fn().mockResolvedValue(undefined),

    // Leader events
    emitLeaderThinking: jest.fn().mockResolvedValue(undefined),
    emitLeaderPlanning: jest.fn().mockResolvedValue(undefined),
    emitLeaderPlanReady: jest.fn().mockResolvedValue(undefined),
    emitLeaderResponse: jest.fn().mockResolvedValue(undefined),

    // Agent events
    emitAgentWorking: jest.fn().mockResolvedValue(undefined),
    emitAgentCompleted: jest.fn().mockResolvedValue(undefined),
    emitAgentFailed: jest.fn().mockResolvedValue(undefined),

    // Task events
    emitTaskStarted: jest.fn().mockResolvedValue(undefined),
    emitTaskProgress: jest.fn().mockResolvedValue(undefined),
    emitTaskCompleted: jest.fn().mockResolvedValue(undefined),
    emitTaskFailed: jest.fn().mockResolvedValue(undefined),

    // Dimension events
    emitDimensionResearchStarted: jest.fn().mockResolvedValue(undefined),
    emitDimensionResearchProgress: jest.fn().mockResolvedValue(undefined),
    emitDimensionResearchCompleted: jest.fn().mockResolvedValue(undefined),

    // Report events
    emitReportSynthesisStarted: jest.fn().mockResolvedValue(undefined),
    emitReportSynthesisProgress: jest.fn().mockResolvedValue(undefined),
    emitReportSynthesisCompleted: jest.fn().mockResolvedValue(undefined),

    // TODO events
    emitTodoCreated: jest.fn().mockResolvedValue(undefined),
    emitTodoStatusChanged: jest.fn().mockResolvedValue(undefined),
    emitTodoProgress: jest.fn().mockResolvedValue(undefined),
    emitTodoCompleted: jest.fn().mockResolvedValue(undefined),
    emitTodoFailed: jest.fn().mockResolvedValue(undefined),
    emitTodoCancelled: jest.fn().mockResolvedValue(undefined),
    emitTodoReviewing: jest.fn().mockResolvedValue(undefined),
    emitTodoReviewed: jest.fn().mockResolvedValue(undefined),

    // Generic emit
    emitToTopic: jest.fn().mockResolvedValue(undefined),

    // Handler registration
    registerEmitHandler: jest.fn(),

    // Message persistence
    saveUserMessage: jest.fn().mockResolvedValue(undefined),
    getTeamMessages: jest.fn().mockResolvedValue([]),
    getAgentActivities: jest.fn().mockResolvedValue([]),
  };
}

/**
 * Create a mock AgentActivityService
 */
export function createMockAgentActivityService() {
  return {
    recordActivity: jest.fn().mockResolvedValue({
      id: "activity-123",
      createdAt: new Date(),
    }),
    getActivitiesForMission: jest.fn().mockResolvedValue([]),
    getActivitiesForTopic: jest.fn().mockResolvedValue([]),
    getLatestActivityForAgent: jest.fn().mockResolvedValue(null),
    recordDimensionReview: jest.fn().mockResolvedValue(undefined),
    recordOverallReview: jest.fn().mockResolvedValue(undefined),
  };
}

/**
 * Types for mock services
 */
export type MockEventEmitter2 = ReturnType<typeof createMockEventEmitter2>;
export type MockResearchEventEmitter = ReturnType<
  typeof createMockResearchEventEmitter
>;
export type MockAgentActivityService = ReturnType<
  typeof createMockAgentActivityService
>;
