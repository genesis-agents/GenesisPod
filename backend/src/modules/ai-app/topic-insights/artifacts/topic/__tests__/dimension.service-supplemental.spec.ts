/**
 * TopicDimensionService — Supplemental Tests
 *
 * Covers visibility / access branches not in the main spec:
 * - checkTopicAccess: creator short-circuit
 * - checkTopicAccess: empty SQL result → false
 * - checkTopicAccess: visibility=PUBLIC → true
 * - checkTopicAccess: visibility=SHARED + is_collaborator branches
 * - verifyTopicReadAccess: non-owner without access → ForbiddenException
 */

import { Test, TestingModule } from "@nestjs/testing";
import { ForbiddenException } from "@nestjs/common";

import { PrismaService } from "@/common/prisma/prisma.service";
import { TopicDimensionService } from "../dimension.service";
import { DimensionTemplatesRepository } from "../templates";
import { MissionExecutionService } from "../../../mission/control/execution.service";
import { ResearchEventEmitterService } from "../../../mission/realtime/event-emitter.service";

function buildMocks() {
  const mockPrisma = {
    researchTopic: { findUnique: jest.fn() },
    researchMission: {
      findFirst: jest.fn().mockResolvedValue(null),
      create: jest.fn(),
    },
    topicDimension: {
      findMany: jest.fn().mockResolvedValue([]),
      findFirst: jest.fn(),
      create: jest.fn(),
      createMany: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    $transaction: jest.fn(async (ops: unknown) => {
      if (Array.isArray(ops)) return Promise.all(ops);
      return (ops as (tx: unknown) => Promise<unknown>)(mockPrisma);
    }),
    $queryRaw: jest.fn(),
  };
  return { mockPrisma };
}

describe("TopicDimensionService — supplemental", () => {
  let service: TopicDimensionService;
  let prisma: ReturnType<typeof buildMocks>["mockPrisma"];

  beforeEach(async () => {
    const mocks = buildMocks();
    prisma = mocks.mockPrisma;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TopicDimensionService,
        DimensionTemplatesRepository,
        { provide: PrismaService, useValue: mocks.mockPrisma },
        {
          provide: MissionExecutionService,
          useValue: { startExecution: jest.fn() },
        },
        {
          provide: ResearchEventEmitterService,
          useValue: {
            emitDimensionCreated: jest.fn().mockResolvedValue(undefined),
            emitDimensionAdded: jest.fn().mockResolvedValue(undefined),
            emitDimensionRemoved: jest.fn().mockResolvedValue(undefined),
          },
        },
      ],
    }).compile();

    service = module.get<TopicDimensionService>(TopicDimensionService);
  });

  afterEach(() => jest.clearAllMocks());

  describe("verifyTopicReadAccess — non-owner paths", () => {
    it("throws ForbiddenException for non-owner when PRIVATE", async () => {
      prisma.researchTopic.findUnique.mockResolvedValue({ userId: "owner-1" });
      prisma.$queryRaw.mockResolvedValue([
        { visibility: "PRIVATE", is_collaborator: false },
      ]);

      await expect(
        service.listDimensions("other-user", "topic-1"),
      ).rejects.toThrow(ForbiddenException);
    });

    it("throws ForbiddenException for non-owner when SHARED + not collaborator", async () => {
      prisma.researchTopic.findUnique.mockResolvedValue({ userId: "owner-1" });
      prisma.$queryRaw.mockResolvedValue([
        { visibility: "SHARED", is_collaborator: false },
      ]);

      await expect(
        service.listDimensions("other-user", "topic-1"),
      ).rejects.toThrow(ForbiddenException);
    });

    it("does NOT throw for non-owner when PUBLIC", async () => {
      prisma.researchTopic.findUnique.mockResolvedValue({ userId: "owner-1" });
      prisma.$queryRaw.mockResolvedValue([
        { visibility: "PUBLIC", is_collaborator: false },
      ]);
      prisma.topicDimension.findMany.mockResolvedValue([]);

      await expect(
        service.listDimensions("other-user", "topic-1"),
      ).resolves.toEqual([]);
    });

    it("does NOT throw for non-owner when SHARED + collaborator", async () => {
      prisma.researchTopic.findUnique.mockResolvedValue({ userId: "owner-1" });
      prisma.$queryRaw.mockResolvedValue([
        { visibility: "SHARED", is_collaborator: true },
      ]);
      prisma.topicDimension.findMany.mockResolvedValue([]);

      await expect(
        service.listDimensions("other-user", "topic-1"),
      ).resolves.toEqual([]);
    });

    it("throws ForbiddenException when $queryRaw returns empty result", async () => {
      prisma.researchTopic.findUnique.mockResolvedValue({ userId: "owner-1" });
      prisma.$queryRaw.mockResolvedValue([]);

      await expect(
        service.listDimensions("other-user", "topic-1"),
      ).rejects.toThrow(ForbiddenException);
    });

    it("does NOT call $queryRaw when user is the owner (creator short-circuit)", async () => {
      prisma.researchTopic.findUnique.mockResolvedValue({ userId: "user-1" });
      prisma.topicDimension.findMany.mockResolvedValue([]);

      await service.listDimensions("user-1", "topic-1");

      expect(prisma.$queryRaw).not.toHaveBeenCalled();
    });
  });
});
