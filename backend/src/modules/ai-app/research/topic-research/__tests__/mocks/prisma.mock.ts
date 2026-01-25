// @ts-nocheck
/**
 * Prisma Mock for Topic Research Tests
 *
 * Provides a mock implementation of PrismaService for unit testing
 * Type checking is disabled due to Jest mock compatibility issues.
 */

import { jest } from "@jest/globals";

/**
 * Create a mock Prisma service with all commonly used methods
 */
export function createMockPrisma() {
  return {
    // ResearchTopic
    researchTopic: {
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      count: jest.fn(),
    },

    // ResearchMission
    researchMission: {
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      count: jest.fn(),
    },

    // ResearchTask
    researchTask: {
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      createMany: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
      delete: jest.fn(),
      count: jest.fn(),
    },

    // ResearchTodo
    researchTodo: {
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      createMany: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
      delete: jest.fn(),
      count: jest.fn(),
    },

    // TopicReport
    topicReport: {
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },

    // TopicEvidence
    topicEvidence: {
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      createMany: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
      delete: jest.fn(),
      deleteMany: jest.fn(),
      aggregate: jest.fn(),
    },

    // TopicDimension
    topicDimension: {
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      createMany: jest.fn(),
      update: jest.fn(),
      upsert: jest.fn(),
      delete: jest.fn(),
    },

    // LeaderDecision
    leaderDecision: {
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },

    // TopicCollaborator
    topicCollaborator: {
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },

    // AgentActivity
    agentActivity: {
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },

    // KnowledgeBase
    knowledgeBase: {
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      findMany: jest.fn(),
    },

    // DefaultModel
    defaultModel: {
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      findMany: jest.fn(),
    },

    // ★ Security: User model for JWT authentication
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

    // Raw query (should not be used after Phase 1 security fixes)
    $queryRaw: jest.fn(),
  };
}

/**
 * Type for the mock Prisma service
 */
export type MockPrismaService = ReturnType<typeof createMockPrisma>;
