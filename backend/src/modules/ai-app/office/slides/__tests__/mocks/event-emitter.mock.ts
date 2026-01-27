// @ts-nocheck
/**
 * EventEmitter2 Mock for Slides Tests
 */

import { jest } from "@jest/globals";

/**
 * Create a mock EventEmitter2 service
 */
export function createMockEventEmitter() {
  return {
    emit: jest.fn(),
    emitAsync: jest.fn().mockResolvedValue(undefined),
    on: jest.fn(),
    once: jest.fn(),
    onAny: jest.fn(),
    removeListener: jest.fn(),
    removeAllListeners: jest.fn(),
    listeners: jest.fn().mockReturnValue([]),
    listenerCount: jest.fn().mockReturnValue(0),
    hasListeners: jest.fn().mockReturnValue(false),
  };
}

/**
 * Type for the mock EventEmitter
 */
export type MockEventEmitter = ReturnType<typeof createMockEventEmitter>;
