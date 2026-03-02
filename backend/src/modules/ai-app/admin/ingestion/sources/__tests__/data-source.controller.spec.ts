import { Test, TestingModule } from "@nestjs/testing";
import { DataSourceController } from "../data-source.controller";
import {
  DataSourceService,
  CreateDataSourceDto,
  UpdateDataSourceDto,
} from "../data-source.service";
import { DataSourceStatus, DataSourceType } from "@prisma/client";

const mockDataSourceService = {
  create: jest.fn(),
  bulkCreate: jest.fn(),
  findAll: jest.fn(),
  getStatsSummary: jest.fn(),
  findOne: jest.fn(),
  update: jest.fn(),
  remove: jest.fn(),
  test: jest.fn(),
  fixKnownRssUrls: jest.fn(),
};

const mockDataSource = {
  id: "ds-1",
  name: "Test Source",
  description: "A test data source",
  type: "RSS" as DataSourceType,
  category: "AI",
  baseUrl: "https://example.com",
  status: "ACTIVE" as DataSourceStatus,
  crawlerType: "rss",
  crawlerConfig: {},
  keywords: [],
  categories: [],
  languages: ["en"],
  rateLimit: 60,
  minQualityScore: 0,
  deduplicationConfig: {},
  isVerified: false,
  createdBy: null,
  createdAt: new Date(),
  updatedAt: new Date(),
  authType: "NONE",
  apiEndpoint: null,
  credentials: null,
};

describe("DataSourceController", () => {
  let controller: DataSourceController;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [DataSourceController],
      providers: [
        { provide: DataSourceService, useValue: mockDataSourceService },
      ],
    }).compile();

    controller = module.get<DataSourceController>(DataSourceController);
  });

  // ==================== create ====================

  describe("create", () => {
    it("creates a new data source", async () => {
      mockDataSourceService.create.mockResolvedValue(mockDataSource);

      const dto: CreateDataSourceDto = {
        name: "Test Source",
        type: "RSS" as DataSourceType,
        category: "AI",
        baseUrl: "https://example.com",
        crawlerType: "rss",
        crawlerConfig: {},
      };

      const result = await controller.create(dto);

      expect(mockDataSourceService.create).toHaveBeenCalledWith(dto);
      expect(result).toEqual(mockDataSource);
    });
  });

  // ==================== bulkCreate ====================

  describe("bulkCreate", () => {
    it("creates multiple data sources in bulk", async () => {
      const sources = [mockDataSource, { ...mockDataSource, id: "ds-2" }];
      mockDataSourceService.bulkCreate.mockResolvedValue(sources);

      const dtos: CreateDataSourceDto[] = [
        {
          name: "Source 1",
          type: "RSS" as DataSourceType,
          category: "AI",
          baseUrl: "https://example1.com",
          crawlerType: "rss",
          crawlerConfig: {},
        },
        {
          name: "Source 2",
          type: "API" as DataSourceType,
          category: "Science",
          baseUrl: "https://example2.com",
          crawlerType: "api",
          crawlerConfig: {},
        },
      ];

      const result = await controller.bulkCreate(dtos);

      expect(mockDataSourceService.bulkCreate).toHaveBeenCalledWith(dtos);
      expect(result).toEqual(sources);
    });
  });

  // ==================== findAll ====================

  describe("findAll", () => {
    it("returns all data sources without filters", async () => {
      mockDataSourceService.findAll.mockResolvedValue([mockDataSource]);

      const result = await controller.findAll();

      expect(mockDataSourceService.findAll).toHaveBeenCalledWith({
        type: undefined,
        status: undefined,
        category: undefined,
      });
      expect(result).toEqual({ data: [mockDataSource], total: 1 });
    });

    it("returns filtered data sources by type and status", async () => {
      mockDataSourceService.findAll.mockResolvedValue([mockDataSource]);

      const result = await controller.findAll(
        "RSS" as DataSourceType,
        "ACTIVE" as DataSourceStatus,
      );

      expect(mockDataSourceService.findAll).toHaveBeenCalledWith({
        type: "RSS",
        status: "ACTIVE",
        category: undefined,
      });
      expect(result.total).toBe(1);
    });

    it("returns filtered data sources by category", async () => {
      mockDataSourceService.findAll.mockResolvedValue([mockDataSource]);

      const result = await controller.findAll(undefined, undefined, "AI");

      expect(mockDataSourceService.findAll).toHaveBeenCalledWith({
        type: undefined,
        status: undefined,
        category: "AI",
      });
      expect(result.data).toHaveLength(1);
    });

    it("returns empty array when no sources match", async () => {
      mockDataSourceService.findAll.mockResolvedValue([]);

      const result = await controller.findAll("API" as DataSourceType);

      expect(result.data).toHaveLength(0);
      expect(result.total).toBe(0);
    });
  });

  // ==================== getStats ====================

  describe("getStats", () => {
    it("returns statistics summary", async () => {
      const stats = {
        total: 10,
        active: 7,
        inactive: 2,
        error: 1,
      };
      mockDataSourceService.getStatsSummary.mockResolvedValue(stats);

      const result = await controller.getStats();

      expect(mockDataSourceService.getStatsSummary).toHaveBeenCalled();
      expect(result).toEqual(stats);
    });
  });

  // ==================== findOne ====================

  describe("findOne", () => {
    it("returns a single data source by id", async () => {
      mockDataSourceService.findOne.mockResolvedValue(mockDataSource);

      const result = await controller.findOne("ds-1");

      expect(mockDataSourceService.findOne).toHaveBeenCalledWith("ds-1");
      expect(result).toEqual(mockDataSource);
    });
  });

  // ==================== update ====================

  describe("update", () => {
    it("updates a data source", async () => {
      const updated = { ...mockDataSource, name: "Updated Source" };
      mockDataSourceService.update.mockResolvedValue(updated);

      const dto: UpdateDataSourceDto = { name: "Updated Source" };
      const result = await controller.update("ds-1", dto);

      expect(mockDataSourceService.update).toHaveBeenCalledWith("ds-1", dto);
      expect(result.name).toBe("Updated Source");
    });
  });

  // ==================== remove ====================

  describe("remove", () => {
    it("removes a data source by id (returns void)", async () => {
      mockDataSourceService.remove.mockResolvedValue(undefined);

      await controller.remove("ds-1");

      expect(mockDataSourceService.remove).toHaveBeenCalledWith("ds-1");
    });
  });

  // ==================== test ====================

  describe("test", () => {
    it("tests connection to data source", async () => {
      const testResult = { success: true, message: "Connection OK" };
      mockDataSourceService.test.mockResolvedValue(testResult);

      const result = await controller.test("ds-1");

      expect(mockDataSourceService.test).toHaveBeenCalledWith("ds-1");
      expect(result).toEqual(testResult);
    });
  });

  // ==================== pause / resume ====================

  describe("pause", () => {
    it("pauses a data source by updating status to PAUSED", async () => {
      const paused = {
        ...mockDataSource,
        status: "PAUSED" as DataSourceStatus,
      };
      mockDataSourceService.update.mockResolvedValue(paused);

      const result = await controller.pause("ds-1");

      expect(mockDataSourceService.update).toHaveBeenCalledWith("ds-1", {
        status: "PAUSED",
      });
      expect(result.status).toBe("PAUSED");
    });
  });

  describe("resume", () => {
    it("resumes a data source by updating status to ACTIVE", async () => {
      const resumed = {
        ...mockDataSource,
        status: "ACTIVE" as DataSourceStatus,
      };
      mockDataSourceService.update.mockResolvedValue(resumed);

      const result = await controller.resume("ds-1");

      expect(mockDataSourceService.update).toHaveBeenCalledWith("ds-1", {
        status: "ACTIVE",
      });
      expect(result.status).toBe("ACTIVE");
    });
  });

  // ==================== fixRssUrls ====================

  describe("fixRssUrls", () => {
    it("fixes known RSS URL issues", async () => {
      const fixResult = { fixed: 3, details: [] };
      mockDataSourceService.fixKnownRssUrls.mockResolvedValue(fixResult);

      const result = await controller.fixRssUrls();

      expect(mockDataSourceService.fixKnownRssUrls).toHaveBeenCalled();
      expect(result).toEqual(fixResult);
    });
  });
});
