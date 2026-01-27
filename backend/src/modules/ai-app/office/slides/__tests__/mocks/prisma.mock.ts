// @ts-nocheck
/**
 * Prisma Mock for Slides Tests
 *
 * Provides a mock implementation of PrismaService for unit testing slides module.
 * Type checking is disabled due to Jest mock compatibility issues.
 */

import { jest } from "@jest/globals";

/**
 * Create a mock Prisma service with all slides-related methods
 */
export function createMockPrisma() {
  return {
    // SlidesSession
    slidesSession: {
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      count: jest.fn(),
    },

    // SlidesMission
    slidesMission: {
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      deleteMany: jest.fn(),
      count: jest.fn(),
    },

    // SlidesTask
    slidesTask: {
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      createMany: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
      delete: jest.fn(),
      deleteMany: jest.fn(),
      count: jest.fn(),
    },

    // SlidesCheckpoint
    slidesCheckpoint: {
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      deleteMany: jest.fn(),
      count: jest.fn(),
    },

    // SlidesMissionEvent
    slidesMissionEvent: {
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      createMany: jest.fn(),
      delete: jest.fn(),
      deleteMany: jest.fn(),
    },

    // ResearchTopic (for import)
    researchTopic: {
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      findMany: jest.fn(),
    },

    // WritingProject (for import)
    writingProject: {
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      findMany: jest.fn(),
    },

    // Topic (AI Teams - for import)
    topic: {
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      findMany: jest.fn(),
    },

    // Resource (Library - for import)
    resource: {
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      findMany: jest.fn(),
    },

    // User
    user: {
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      findMany: jest.fn(),
    },

    // Transaction support
    $transaction: jest.fn((callback) => {
      if (typeof callback === "function") {
        return callback(createMockPrisma());
      }
      return Promise.all(callback);
    }),

    // Raw query
    $queryRaw: jest.fn(),
  };
}

/**
 * Type for the mock Prisma service
 */
export type MockPrismaService = ReturnType<typeof createMockPrisma>;
