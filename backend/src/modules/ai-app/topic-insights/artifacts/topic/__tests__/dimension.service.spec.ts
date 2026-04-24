/**
 * TopicDimensionService Unit Tests
 *
 * F1: tests cover template lookup + transactional createFromTemplate +
 * scoped refreshDimension (no more 501 / no more empty templates).
 */

import { Test, TestingModule } from "@nestjs/testing";
import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from "@nestjs/common";
import { DimensionStatus, ResearchTopicType } from "@prisma/client";

import { PrismaService } from "@/common/prisma/prisma.service";
import { TopicDimensionService } from "../dimension.service";
import {
  DimensionTemplatesRepository,
  DIMENSION_TEMPLATES_SEED,
} from "../templates";
import { MissionExecutionService } from "../../../mission/control/execution.service";
import type { DimensionTemplate } from "../templates";
import { ResearchEventEmitterService } from "../../../mission/realtime/event-emitter.service";

// ─── Mocks ───────────────────────────────────────────────────────────────────

function buildMocks() {
  const mockPrisma = {
    researchTopic: {
      findUnique: jest.fn(),
      create: jest.fn(),
    },
    researchMission: {
      findFirst: jest.fn().mockResolvedValue(null),
      create: jest.fn(),
      update: jest.fn().mockResolvedValue({}),
    },
    topicDimension: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
      create: jest.fn(),
      createMany: jest.fn().mockResolvedValue({ count: 0 }),
      update: jest.fn(),
      delete: jest.fn(),
    },
    $transaction: jest.fn(async (ops: unknown) => {
      if (Array.isArray(ops)) return Promise.all(ops);
      return (ops as (tx: unknown) => Promise<unknown>)(mockPrisma);
    }),
    $queryRaw: jest
      .fn()
      .mockResolvedValue([{ visibility: "PRIVATE", is_collaborator: false }]),
  };

  const mockExecution = {
    startExecution: jest.fn().mockResolvedValue(undefined),
  };

  const mockEvents = {
    emitDimensionCreated: jest.fn().mockResolvedValue(undefined),
    emitDimensionAdded: jest.fn().mockResolvedValue(undefined),
    emitDimensionRemoved: jest.fn().mockResolvedValue(undefined),
  };

  return { mockPrisma, mockExecution, mockEvents };
}

const SEED: readonly DimensionTemplate[] = [
  {
    id: "tpl-macro",
    topicType: ResearchTopicType.MACRO,
    name: "测试宏观",
    description: "macro test template",
    defaultLanguage: "zh",
    defaultIcon: "🌐",
    defaultColor: "#2563EB",
    dimensions: [
      {
        id: "d1",
        name: "政策",
        description: "policy",
        purpose: "policy purpose",
        queryTemplates: ["{topicName} 政策"],
        dataSources: ["policy-search"],
        minSources: 4,
        sortOrder: 1,
      },
      {
        id: "d2",
        name: "市场",
        description: "market",
        purpose: "market purpose",
        queryTemplates: ["{topicName} 市场规模"],
        dataSources: ["web-search"],
        minSources: 5,
        sortOrder: 2,
      },
    ],
  },
];

const mockTopic = {
  id: "topic-1",
  userId: "user-1",
  visibility: "PRIVATE",
};

const mockDimension = {
  id: "dim-1",
  topicId: "topic-1",
  name: "Market Analysis",
  description: "Market research",
  sortOrder: 1,
  isEnabled: true,
  status: DimensionStatus.PENDING,
  searchQueries: [],
  searchSources: [],
  minSources: 5,
  analyses: [],
};

// ─── Tests ───────────────────────────────────────────────────────────────────

describe("TopicDimensionService", () => {
  let service: TopicDimensionService;
  let prisma: ReturnType<typeof buildMocks>["mockPrisma"];
  let execution: ReturnType<typeof buildMocks>["mockExecution"];

  beforeEach(async () => {
    const mocks = buildMocks();
    prisma = mocks.mockPrisma;
    execution = mocks.mockExecution;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TopicDimensionService,
        DimensionTemplatesRepository,
        { provide: PrismaService, useValue: mocks.mockPrisma },
        { provide: DIMENSION_TEMPLATES_SEED, useValue: SEED },
        { provide: MissionExecutionService, useValue: mocks.mockExecution },
        { provide: ResearchEventEmitterService, useValue: mocks.mockEvents },
      ],
    }).compile();

    service = module.get<TopicDimensionService>(TopicDimensionService);
  });

  afterEach(() => jest.clearAllMocks());

  // ── listDimensions ────────────────────────────────────────────────────────

  describe("listDimensions", () => {
    it("should throw NotFoundException when topic not found", async () => {
      prisma.researchTopic.findUnique.mockResolvedValue(null);
      await expect(
        service.listDimensions("user-1", "nonexistent"),
      ).rejects.toThrow(NotFoundException);
    });

    it("should return dimensions with flattened analysis data", async () => {
      prisma.researchTopic.findUnique.mockResolvedValue(mockTopic);
      prisma.topicDimension.findMany.mockResolvedValue([
        {
          ...mockDimension,
          analyses: [
            {
              id: "analysis-1",
              summary: "Market growing",
              keyFindings: ["Finding 1"],
              dataPoints: {
                dimensionAnalysis: "detailed",
                detailedContent: "content",
              },
            },
          ],
        },
      ]);

      const result = await service.listDimensions("user-1", "topic-1");
      expect(result).toHaveLength(1);
      expect(result[0].dataPoints).not.toBeNull();
      expect(result[0].analyses).toBeUndefined();
    });

    it("should return dimensions with null dataPoints when no analysis", async () => {
      prisma.researchTopic.findUnique.mockResolvedValue(mockTopic);
      prisma.topicDimension.findMany.mockResolvedValue([
        { ...mockDimension, analyses: [] },
      ]);

      const result = await service.listDimensions("user-1", "topic-1");
      expect(result[0].dataPoints).toBeNull();
    });
  });

  // ── addDimension ──────────────────────────────────────────────────────────

  describe("addDimension", () => {
    it("should throw NotFoundException when topic not found for ownership check", async () => {
      prisma.researchTopic.findUnique.mockResolvedValue(null);

      await expect(
        service.addDimension("user-1", "nonexistent", {
          name: "New Dim",
        } as any),
      ).rejects.toThrow(NotFoundException);
    });

    it("should throw ForbiddenException for non-owner", async () => {
      prisma.researchTopic.findUnique.mockResolvedValue({
        userId: "other-user",
      });

      await expect(
        service.addDimension("user-1", "topic-1", { name: "New Dim" } as any),
      ).rejects.toThrow(ForbiddenException);
    });

    it("should create dimension with auto-calculated sortOrder", async () => {
      prisma.researchTopic.findUnique.mockResolvedValue(mockTopic);
      prisma.topicDimension.findFirst.mockResolvedValue({ sortOrder: 3 });
      prisma.topicDimension.create.mockResolvedValue({
        ...mockDimension,
        id: "dim-new",
        sortOrder: 4,
      });

      const result = await service.addDimension("user-1", "topic-1", {
        name: "New Dimension",
        description: "New analysis",
      } as any);

      expect(result.id).toBe("dim-new");
      expect(prisma.topicDimension.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            sortOrder: 4,
            name: "New Dimension",
          }),
        }),
      );
    });

    it("should use sortOrder=1 when no existing dimensions", async () => {
      prisma.researchTopic.findUnique.mockResolvedValue(mockTopic);
      prisma.topicDimension.findFirst.mockResolvedValue(null);
      prisma.topicDimension.create.mockResolvedValue({
        ...mockDimension,
        sortOrder: 1,
      });

      await service.addDimension("user-1", "topic-1", {
        name: "First Dim",
      } as any);

      expect(prisma.topicDimension.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ sortOrder: 1 }),
        }),
      );
    });
  });

  // ── updateDimension ───────────────────────────────────────────────────────

  describe("updateDimension", () => {
    it("should throw NotFoundException when dimension not found in topic", async () => {
      prisma.researchTopic.findUnique.mockResolvedValue(mockTopic);
      prisma.topicDimension.findFirst.mockResolvedValue(null);

      await expect(
        service.updateDimension("user-1", "topic-1", "dim-nonexistent", {
          name: "Updated",
        } as any),
      ).rejects.toThrow(NotFoundException);
    });

    it("should update dimension successfully", async () => {
      prisma.researchTopic.findUnique.mockResolvedValue(mockTopic);
      prisma.topicDimension.findFirst.mockResolvedValue(mockDimension);
      prisma.topicDimension.update.mockResolvedValue({
        ...mockDimension,
        name: "Updated Name",
      });

      const result = await service.updateDimension(
        "user-1",
        "topic-1",
        "dim-1",
        { name: "Updated Name" } as any,
      );
      expect(result.name).toBe("Updated Name");
    });
  });

  // ── deleteDimension ───────────────────────────────────────────────────────

  describe("deleteDimension", () => {
    it("should throw NotFoundException when dimension not found", async () => {
      prisma.researchTopic.findUnique.mockResolvedValue(mockTopic);
      prisma.topicDimension.findFirst.mockResolvedValue(null);

      await expect(
        service.deleteDimension("user-1", "topic-1", "dim-nonexistent"),
      ).rejects.toThrow(NotFoundException);
    });

    it("should delete dimension successfully", async () => {
      prisma.researchTopic.findUnique.mockResolvedValue(mockTopic);
      prisma.topicDimension.findFirst.mockResolvedValue(mockDimension);
      prisma.topicDimension.delete.mockResolvedValue({});

      const result = await service.deleteDimension(
        "user-1",
        "topic-1",
        "dim-1",
      );
      expect(result.success).toBe(true);
      expect(prisma.topicDimension.delete).toHaveBeenCalledWith({
        where: { id: "dim-1" },
      });
    });
  });

  // ── reorderDimensions ─────────────────────────────────────────────────────

  describe("reorderDimensions", () => {
    it("should throw NotFoundException when some dimensions not found", async () => {
      prisma.researchTopic.findUnique.mockResolvedValue(mockTopic);
      prisma.topicDimension.findMany.mockResolvedValue([]);

      await expect(
        service.reorderDimensions("user-1", "topic-1", {
          dimensionIds: ["dim-1", "dim-2"],
        } as any),
      ).rejects.toThrow(NotFoundException);
    });

    it("should reorder dimensions in transaction", async () => {
      prisma.researchTopic.findUnique.mockResolvedValue(mockTopic);
      prisma.topicDimension.findMany.mockResolvedValue([
        { id: "dim-1" },
        { id: "dim-2" },
      ]);
      prisma.topicDimension.update.mockResolvedValue({});

      const result = await service.reorderDimensions("user-1", "topic-1", {
        dimensionIds: ["dim-1", "dim-2"],
      } as any);
      expect(result.success).toBe(true);
    });
  });

  // ── getTemplates ──────────────────────────────────────────────────────────

  describe("getTemplates", () => {
    it("returns MACRO templates from repository with back-compat dimensions array", async () => {
      const result = await service.getTemplates({
        type: ResearchTopicType.MACRO,
      } as any);
      expect(result.type).toBe(ResearchTopicType.MACRO);
      expect(result.templates).toHaveLength(1);
      expect(result.templates[0].id).toBe("tpl-macro");
      expect(result.templates[0].dimensions).toHaveLength(2);
      expect(result.dimensions).toHaveLength(2);
      // back-compat shape uses searchQueries/searchSources keys
      expect(result.dimensions[0].searchQueries).toEqual(["{topicName} 政策"]);
      expect(result.dimensions[0].searchSources).toEqual(["policy-search"]);
    });

    it("returns empty templates + dimensions for a topicType with no seed", async () => {
      const result = await service.getTemplates({
        type: ResearchTopicType.COMPANY,
      } as any);
      expect(result.templates).toEqual([]);
      expect(result.dimensions).toEqual([]);
    });
  });

  // ── createFromTemplate ────────────────────────────────────────────────────

  describe("createFromTemplate", () => {
    it("throws NotFoundException for unknown templateId", async () => {
      await expect(
        service.createFromTemplate("user-1", {
          templateId: "does-not-exist",
          name: "x",
        } as any),
      ).rejects.toThrow(NotFoundException);
    });

    it("creates topic + dimensions in a transaction", async () => {
      prisma.researchTopic.create.mockResolvedValue({
        id: "topic-created-1",
        userId: "user-1",
        name: "OpenAI",
        type: ResearchTopicType.MACRO,
      });

      const result = await service.createFromTemplate("user-1", {
        templateId: "tpl-macro",
        name: "OpenAI",
      } as any);

      expect(result.topicId).toBe("topic-created-1");
      expect(result.dimensionCount).toBe(2);
      expect(prisma.$transaction).toHaveBeenCalled();
      expect(prisma.researchTopic.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            userId: "user-1",
            name: "OpenAI",
            type: ResearchTopicType.MACRO,
          }),
        }),
      );
      expect(prisma.topicDimension.createMany).toHaveBeenCalledWith({
        data: expect.arrayContaining([
          expect.objectContaining({
            topicId: "topic-created-1",
            name: "政策",
            searchQueries: ["OpenAI 政策"],
          }),
        ]),
      });
    });

    it("respects customizations: removes by name and appends extras", async () => {
      prisma.researchTopic.create.mockResolvedValue({ id: "topic-2" });

      const result = await service.createFromTemplate("user-1", {
        templateId: "tpl-macro",
        name: "Anthropic",
        customizations: {
          dimensions: {
            remove: ["市场"],
            add: [
              {
                name: "文化",
                description: "企业文化",
                searchQueries: ["文化 custom"],
              },
            ],
          },
        },
      } as any);

      expect(result.dimensionCount).toBe(2); // 2 - 1 removed + 1 added
      const createManyCall = prisma.topicDimension.createMany.mock.calls[0][0];
      const names = (createManyCall.data as Array<{ name: string }>).map(
        (d) => d.name,
      );
      expect(names).toEqual(["政策", "文化"]);
    });
  });

  // ── refreshDimension ──────────────────────────────────────────────────────

  describe("refreshDimension", () => {
    it("throws NotFoundException when dimension not in topic", async () => {
      prisma.researchTopic.findUnique.mockResolvedValue(mockTopic);
      prisma.topicDimension.findFirst.mockResolvedValue(null);

      await expect(
        service.refreshDimension("user-1", "topic-1", "missing", {} as any),
      ).rejects.toThrow(NotFoundException);
    });

    it("throws BadRequestException when an active mission blocks refresh", async () => {
      prisma.researchTopic.findUnique.mockResolvedValue(mockTopic);
      prisma.topicDimension.findFirst.mockResolvedValue(mockDimension);
      prisma.researchMission.findFirst.mockResolvedValue({
        id: "active-m",
        status: "EXECUTING",
      });

      await expect(
        service.refreshDimension("user-1", "topic-1", "dim-1", {} as any),
      ).rejects.toThrow(BadRequestException);
    });

    it("creates an EXECUTING mission and starts scoped execution", async () => {
      prisma.researchTopic.findUnique.mockResolvedValue(mockTopic);
      prisma.topicDimension.findFirst.mockResolvedValue(mockDimension);
      prisma.researchMission.create.mockResolvedValue({
        id: "mission-42",
        topicId: "topic-1",
        status: "EXECUTING",
      });

      const result = await service.refreshDimension(
        "user-1",
        "topic-1",
        "dim-1",
        {} as any,
      );

      expect(result.missionId).toBe("mission-42");
      expect(result.dimensionId).toBe("dim-1");
      expect(prisma.researchMission.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            topicId: "topic-1",
            status: "EXECUTING",
          }),
        }),
      );
      // Allow the fire-and-forget promise to resolve before asserting
      await new Promise((r) => setImmediate(r));
      expect(execution.startExecution).toHaveBeenCalledWith(
        "mission-42",
        "topic-1",
        { dimensionScope: ["dim-1"] },
      );
    });
  });
});
