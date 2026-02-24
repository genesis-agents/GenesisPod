/**
 * TopicCrudService Unit Tests
 */

import { Test, TestingModule } from "@nestjs/testing";
import { TopicCrudService } from "../topic-crud.service";
import { PrismaService } from "@/common/prisma/prisma.service";
import {
  NotFoundException,
  ForbiddenException,
} from "@nestjs/common";
import {
  ResearchTopicStatus,
  RefreshFrequency,
  DimensionStatus,
} from "@prisma/client";

// ─── Mocks ───────────────────────────────────────────────────────────────────

function buildMocks() {
  const mockPrisma = {
    researchTopic: {
      findUnique: jest.fn(),
      create: jest.fn(),
      findMany: jest.fn(),
      findFirst: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      count: jest.fn(),
      aggregate: jest.fn(),
    },
    topicDimension: {
      create: jest.fn(),
      findMany: jest.fn(),
    },
    topicCollaborator: {
      findMany: jest.fn().mockResolvedValue([]),
    },
    researchMission: {
      findMany: jest.fn().mockResolvedValue([]),
    },
    topicReport: {
      findMany: jest.fn().mockResolvedValue([]),
      findFirst: jest.fn(),
      aggregate: jest.fn(),
    },
    topicRefreshLog: {
      findMany: jest.fn().mockResolvedValue([]),
      count: jest.fn().mockResolvedValue(0),
      aggregate: jest.fn().mockResolvedValue({ _count: 0, _avg: { dimensionsRefreshed: 0, sourcesFound: 0 } }),
    },
    $transaction: jest.fn(async (cb: (tx: unknown) => Promise<unknown>) => cb(mockPrisma)),
    $queryRaw: jest.fn().mockResolvedValue([{ id: "topic-1" }]),
  };

  return { mockPrisma };
}

const mockTopic = {
  id: "topic-1",
  name: "AI Research",
  userId: "user-1",
  description: "Research on AI trends",
  type: "TECHNOLOGY",
  status: ResearchTopicStatus.ACTIVE,
  visibility: "PRIVATE",
  language: "zh",
  totalReports: 0,
  totalSources: 0,
  lastRefreshAt: null,
  createdAt: new Date(),
  updatedAt: new Date(),
  dimensions: [],
  reports: [],
  _count: { reports: 0, dimensions: 0, refreshLogs: 0 },
};

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("TopicCrudService", () => {
  let service: TopicCrudService;
  let prisma: ReturnType<typeof buildMocks>["mockPrisma"];

  beforeEach(async () => {
    const mocks = buildMocks();
    prisma = mocks.mockPrisma;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TopicCrudService,
        { provide: PrismaService, useValue: mocks.mockPrisma },
      ],
    }).compile();

    service = module.get<TopicCrudService>(TopicCrudService);
  });

  afterEach(() => jest.clearAllMocks());

  // ─── createTopic ────────────────────────────────────────────────────────────

  describe("createTopic", () => {
    it("should create topic without dimensions when none provided", async () => {
      (prisma.researchTopic as any).create = jest.fn().mockResolvedValue(mockTopic);
      prisma.$transaction.mockImplementation(async (cb: (tx: unknown) => Promise<unknown>) => {
        const result = await (prisma.researchTopic as any).create();
        return { ...result, dimensions: [] };
      });

      const result = await service.createTopic("user-1", {
        name: "AI Research",
        type: "TECHNOLOGY" as any,
      } as any);

      expect(result.name).toBe("AI Research");
      expect(result.dimensions).toEqual([]);
    });

    it("should create topic with dimensions when provided", async () => {
      const topicWithDims = { ...mockTopic, id: "topic-with-dims" };
      (prisma.researchTopic as any).create = jest.fn().mockResolvedValue(topicWithDims);
      (prisma.topicDimension as any).create = jest.fn().mockResolvedValue({ id: "dim-1", name: "Market" });

      prisma.$transaction.mockImplementation(async (cb: (tx: unknown) => Promise<unknown>) => {
        const topic = await (prisma.researchTopic as any).create();
        const dim = await (prisma.topicDimension as any).create();
        return { ...topic, dimensions: [dim] };
      });

      const result = await service.createTopic("user-1", {
        name: "AI Research",
        type: "TECHNOLOGY" as any,
        dimensions: [{ name: "Market Analysis", description: "Market study" }],
      } as any);

      expect(result.dimensions).toHaveLength(1);
    });
  });

  // ─── getTopic ────────────────────────────────────────────────────────────────

  describe("getTopic", () => {
    it("should throw NotFoundException when topic not found", async () => {
      prisma.researchTopic.findUnique.mockResolvedValue(null);

      await expect(service.getTopic("user-1", "nonexistent")).rejects.toThrow(NotFoundException);
    });

    it("should throw ForbiddenException when user lacks access to private topic", async () => {
      prisma.researchTopic.findUnique.mockResolvedValue({
        ...mockTopic,
        userId: "other-user",
        visibility: "PRIVATE",
      });
      prisma.$queryRaw.mockResolvedValue([{ visibility: "PRIVATE", is_collaborator: false }]);

      await expect(service.getTopic("user-1", "topic-1")).rejects.toThrow(ForbiddenException);
    });

    it("should return topic for owner", async () => {
      prisma.researchTopic.findUnique.mockResolvedValue(mockTopic);

      const result = await service.getTopic("user-1", "topic-1");
      expect(result.id).toBe("topic-1");
    });

    it("should return topic for PUBLIC visibility", async () => {
      prisma.researchTopic.findUnique.mockResolvedValue({
        ...mockTopic,
        userId: "other-user",
        visibility: "PUBLIC",
      });
      prisma.$queryRaw.mockResolvedValue([{ visibility: "PUBLIC", is_collaborator: false }]);

      const result = await service.getTopic("user-1", "topic-1");
      expect(result.id).toBe("topic-1");
    });
  });

  // ─── updateTopic ────────────────────────────────────────────────────────────

  describe("updateTopic", () => {
    it("should throw NotFoundException when topic not found", async () => {
      prisma.researchTopic.findUnique.mockResolvedValue(null);

      await expect(service.updateTopic("user-1", "nonexistent", { name: "New Name" } as any)).rejects.toThrow(NotFoundException);
    });

    it("should throw ForbiddenException when non-owner tries to update", async () => {
      prisma.researchTopic.findUnique.mockResolvedValue({ userId: "other-user" });

      await expect(service.updateTopic("user-1", "topic-1", { name: "Updated" } as any)).rejects.toThrow(ForbiddenException);
    });

    it("should update topic successfully for owner", async () => {
      prisma.researchTopic.findUnique.mockResolvedValue({ userId: "user-1" });
      prisma.researchTopic.update.mockResolvedValue({
        ...mockTopic,
        name: "Updated AI Research",
        dimensions: [],
      });

      const result = await service.updateTopic("user-1", "topic-1", { name: "Updated AI Research" } as any);
      expect(result.name).toBe("Updated AI Research");
    });
  });

  // ─── deleteTopic ────────────────────────────────────────────────────────────

  describe("deleteTopic", () => {
    it("should throw NotFoundException when topic not found", async () => {
      prisma.researchTopic.findUnique.mockResolvedValue(null);

      await expect(service.deleteTopic("user-1", "nonexistent")).rejects.toThrow(NotFoundException);
    });

    it("should throw ForbiddenException for non-owner", async () => {
      prisma.researchTopic.findUnique.mockResolvedValue({ userId: "other-user" });

      await expect(service.deleteTopic("user-1", "topic-1")).rejects.toThrow(ForbiddenException);
    });

    it("should delete topic for owner", async () => {
      prisma.researchTopic.findUnique.mockResolvedValue({ userId: "user-1" });
      prisma.researchTopic.delete.mockResolvedValue({});

      const result = await service.deleteTopic("user-1", "topic-1");
      expect(result.success).toBe(true);
      expect(prisma.researchTopic.delete).toHaveBeenCalled();
    });
  });

  // ─── getResearchHistory ──────────────────────────────────────────────────────

  describe("getResearchHistory", () => {
    it("should return timeline with missions and reports", async () => {
      prisma.researchTopic.findUnique.mockResolvedValue({ userId: "user-1" });
      prisma.researchMission.findMany.mockResolvedValue([
        {
          id: "mission-1",
          createdAt: new Date(),
          completedAt: new Date(),
          status: "COMPLETED",
          tasks: [{ id: "task-1", status: "COMPLETED", dimensionName: "Market", result: { summary: "Done" }, resultSummary: "Done" }],
        },
      ]);
      prisma.topicReport.findMany.mockResolvedValue([
        { id: "report-1", version: 1, generatedAt: new Date(), totalSources: 10 },
      ]);

      const result = await service.getResearchHistory("user-1", "topic-1");
      expect(result.timeline.length).toBeGreaterThanOrEqual(1);
      expect(result.totalMissions).toBe(1);
      expect(result.totalReports).toBe(1);
    });
  });

  // ─── getStats ───────────────────────────────────────────────────────────────

  describe("getStats", () => {
    it("should return topic stats", async () => {
      prisma.researchTopic.findUnique
        .mockResolvedValueOnce({ userId: "user-1" }) // access check
        .mockResolvedValueOnce({ ...mockTopic, _count: { dimensions: 3, reports: 2, refreshLogs: 5 } });

      const result = await service.getStats("user-1", "topic-1");
      expect(result.topic.id).toBe("topic-1");
      expect(result.counts).toBeDefined();
    });

    it("should throw NotFoundException when topic not found for stats", async () => {
      prisma.researchTopic.findUnique
        .mockResolvedValueOnce({ userId: "user-1" }) // access check
        .mockResolvedValueOnce(null); // getStats query

      await expect(service.getStats("user-1", "topic-1")).rejects.toThrow(NotFoundException);
    });
  });

  // ─── listTopics ─────────────────────────────────────────────────────────────

  describe("listTopics", () => {
    it("should return paginated topic list", async () => {
      prisma.topicCollaborator.findMany.mockResolvedValue([]);
      prisma.$queryRaw.mockResolvedValue([{ id: "topic-1" }]);
      prisma.researchTopic.findMany.mockResolvedValue([
        {
          ...mockTopic,
          _count: { reports: 0, dimensions: 0 },
          reports: [],
          missions: [],
        },
      ]);
      prisma.researchTopic.count.mockResolvedValue(1);

      const result = await service.listTopics("user-1", { skip: 0, take: 20 } as any);
      expect(result.topics).toHaveLength(1);
      expect(result.total).toBe(1);
    });
  });
});
