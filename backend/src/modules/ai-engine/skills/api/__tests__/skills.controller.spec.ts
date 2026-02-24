/**
 * Unit tests for SkillsController
 */

import { Test, TestingModule } from "@nestjs/testing";
import { Logger } from "@nestjs/common";
import { SkillsController } from "../skills.controller";
import { SkillsApiService } from "../skills-api.service";
import { JwtAuthGuard } from "../../../../../common/guards/jwt-auth.guard";
import { AdminGuard } from "../../../../../common/guards/admin.guard";
import { SetDomainOverrideDto } from "../dto/set-domain-override.dto";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockSkillsApiService = {
  getStats: jest.fn(),
  getTimeline: jest.fn(),
  searchSkills: jest.fn(),
  getPopularSkills: jest.fn(),
  getFeaturedSkills: jest.fn(),
  getCategories: jest.fn(),
  getSkillsByDomain: jest.fn(),
  setSkillDomainOverride: jest.fn(),
  syncFromSkillsMP: jest.fn(),
} as unknown as jest.Mocked<SkillsApiService>;

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("SkillsController", () => {
  let controller: SkillsController;
  let service: jest.Mocked<typeof mockSkillsApiService>;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [SkillsController],
      providers: [
        { provide: SkillsApiService, useValue: mockSkillsApiService },
      ],
    })
      // 覆盖 Guard，在测试中直接放行
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(AdminGuard)
      .useValue({ canActivate: () => true })
      .setLogger(new Logger())
      .compile();

    controller = module.get<SkillsController>(SkillsController);
    service = module.get(SkillsApiService);
  });

  // -------------------------------------------------------------------------
  // getStats
  // -------------------------------------------------------------------------

  describe("getStats", () => {
    it("返回 skill 统计数据", async () => {
      const mockStats = {
        totalSkills: 1000,
        lastUpdated: "2024-01-01",
        weeklyGrowth: 5.5,
        featuredCount: 10,
        categoryCount: 8,
      };
      service.getStats.mockResolvedValue(mockStats);

      const result = await controller.getStats();

      expect(result).toEqual(mockStats);
      expect(service.getStats).toHaveBeenCalledTimes(1);
    });

    it("透传服务层错误", async () => {
      service.getStats.mockRejectedValue(new Error("Service error"));

      await expect(controller.getStats()).rejects.toThrow("Service error");
    });
  });

  // -------------------------------------------------------------------------
  // getTimeline
  // -------------------------------------------------------------------------

  describe("getTimeline", () => {
    it("返回时间轴数据", async () => {
      const mockTimeline = [
        { date: "Jan 1", count: 100, cumulative: 100 },
        { date: "Jan 8", count: 200, cumulative: 300 },
      ];
      service.getTimeline.mockResolvedValue(mockTimeline);

      const result = await controller.getTimeline();

      expect(result).toEqual(mockTimeline);
      expect(service.getTimeline).toHaveBeenCalledTimes(1);
    });
  });

  // -------------------------------------------------------------------------
  // searchSkills
  // -------------------------------------------------------------------------

  describe("searchSkills", () => {
    it("通过查询参数搜索 skill", async () => {
      const mockResult = {
        skills: [
          {
            id: "test-skill",
            name: "Test Skill",
            description: "A test",
            category: "tools",
            author: "author",
            stars: 100,
            downloads: "1K+",
            tags: [],
            featured: false,
            url: "https://example.com",
            lastUpdated: "2024-01-01",
          },
        ],
        total: 1,
      };
      service.searchSkills.mockResolvedValue(mockResult);

      const result = await controller.searchSkills("test", "tools", "stars", "10", "0");

      expect(result).toEqual(mockResult);
      expect(service.searchSkills).toHaveBeenCalledWith({
        query: "test",
        category: "tools",
        sortBy: "stars",
        limit: 10,
        offset: 0,
      });
    });

    it("参数未指定时使用默认值", async () => {
      service.searchSkills.mockResolvedValue({ skills: [], total: 0 });

      await controller.searchSkills();

      expect(service.searchSkills).toHaveBeenCalledWith({
        query: undefined,
        category: undefined,
        sortBy: undefined,
        limit: 50,
        offset: 0,
      });
    });

    it("sortBy 类型正确", async () => {
      service.searchSkills.mockResolvedValue({ skills: [], total: 0 });

      await controller.searchSkills(undefined, undefined, "downloads");

      expect(service.searchSkills).toHaveBeenCalledWith(
        expect.objectContaining({ sortBy: "downloads" }),
      );
    });

    it("limit 和 offset 被转换为整数", async () => {
      service.searchSkills.mockResolvedValue({ skills: [], total: 0 });

      await controller.searchSkills(undefined, undefined, undefined, "25", "100");

      expect(service.searchSkills).toHaveBeenCalledWith(
        expect.objectContaining({ limit: 25, offset: 100 }),
      );
    });
  });

  // -------------------------------------------------------------------------
  // getPopularSkills
  // -------------------------------------------------------------------------

  describe("getPopularSkills", () => {
    it("返回热门 skill", async () => {
      const mockSkills = [
        {
          id: "popular-skill",
          name: "Popular",
          description: "",
          category: "tools",
          author: "author",
          stars: 1000,
          downloads: "10K+",
          tags: [],
          featured: true,
          url: "https://example.com",
          lastUpdated: "2024-01-01",
        },
      ];
      service.getPopularSkills.mockResolvedValue(mockSkills);

      const result = await controller.getPopularSkills("10");

      expect(result).toEqual(mockSkills);
      expect(service.getPopularSkills).toHaveBeenCalledWith(10);
    });

    it("limit 未指定时使用默认值 50", async () => {
      service.getPopularSkills.mockResolvedValue([]);

      await controller.getPopularSkills();

      expect(service.getPopularSkills).toHaveBeenCalledWith(50);
    });
  });

  // -------------------------------------------------------------------------
  // getFeaturedSkills
  // -------------------------------------------------------------------------

  describe("getFeaturedSkills", () => {
    it("返回精选 skill", async () => {
      service.getFeaturedSkills.mockResolvedValue([]);

      await controller.getFeaturedSkills("5");

      expect(service.getFeaturedSkills).toHaveBeenCalledWith(5);
    });

    it("limit 未指定时使用默认值 20", async () => {
      service.getFeaturedSkills.mockResolvedValue([]);

      await controller.getFeaturedSkills();

      expect(service.getFeaturedSkills).toHaveBeenCalledWith(20);
    });
  });

  // -------------------------------------------------------------------------
  // getCategories
  // -------------------------------------------------------------------------

  describe("getCategories", () => {
    it("返回分类列表", async () => {
      const mockCategories = [
        { id: "tools", name: "Tools", count: 10 },
        { id: "development", name: "Development", count: 5 },
      ];
      service.getCategories.mockResolvedValue(mockCategories);

      const result = await controller.getCategories();

      expect(result).toEqual(mockCategories);
      expect(service.getCategories).toHaveBeenCalledTimes(1);
    });
  });

  // -------------------------------------------------------------------------
  // getSkillsByDomain
  // -------------------------------------------------------------------------

  describe("getSkillsByDomain", () => {
    it("返回指定 domain 的 skill", async () => {
      const mockResponse = {
        skills: [
          {
            skillId: "writing-skill",
            displayName: "Writing Skill",
            description: "",
            layer: "content",
            domain: "writing",
            enabled: true,
            tags: [],
            source: "local",
            effectiveness: {
              usageCount: 10,
              successCount: 8,
              successRate: 80,
              avgDuration: 1500,
            },
          },
        ],
        stats: { total: 1, enabled: 1, byLayer: { content: 1 } },
      };
      service.getSkillsByDomain.mockResolvedValue(mockResponse);

      const result = await controller.getSkillsByDomain("writing");

      expect(result).toEqual(mockResponse);
      expect(service.getSkillsByDomain).toHaveBeenCalledWith("writing");
    });

    it("domain 参数正确传递", async () => {
      service.getSkillsByDomain.mockResolvedValue({
        skills: [],
        stats: { total: 0, enabled: 0, byLayer: {} },
      });

      await controller.getSkillsByDomain("office");

      expect(service.getSkillsByDomain).toHaveBeenCalledWith("office");
    });
  });

  // -------------------------------------------------------------------------
  // setSkillDomainOverride
  // -------------------------------------------------------------------------

  describe("setSkillDomainOverride", () => {
    it("设置 domain override 并返回 {success: true}", async () => {
      service.setSkillDomainOverride.mockResolvedValue(undefined);

      const body: SetDomainOverrideDto = { enabled: false };
      const result = await controller.setSkillDomainOverride("my-skill", "writing", body);

      expect(result).toEqual({ success: true });
      expect(service.setSkillDomainOverride).toHaveBeenCalledWith(
        "my-skill",
        "writing",
        false,
      );
    });

    it("enabled=true 时也能正确处理", async () => {
      service.setSkillDomainOverride.mockResolvedValue(undefined);

      const body: SetDomainOverrideDto = { enabled: true };
      await controller.setSkillDomainOverride("my-skill", "research", body);

      expect(service.setSkillDomainOverride).toHaveBeenCalledWith(
        "my-skill",
        "research",
        true,
      );
    });

    it("透传服务层错误", async () => {
      service.setSkillDomainOverride.mockRejectedValue(new Error("Update failed"));

      const body: SetDomainOverrideDto = { enabled: true };

      await expect(
        controller.setSkillDomainOverride("error-skill", "writing", body),
      ).rejects.toThrow("Update failed");
    });
  });

  // -------------------------------------------------------------------------
  // syncSkills
  // -------------------------------------------------------------------------

  describe("syncSkills", () => {
    it("执行同步并返回结果", async () => {
      const mockResult = {
        success: true,
        message: "成功同步 100 个 Skills",
        skillsCount: 100,
      };
      service.syncFromSkillsMP.mockResolvedValue(mockResult);

      const result = await controller.syncSkills();

      expect(result).toEqual(mockResult);
      expect(service.syncFromSkillsMP).toHaveBeenCalledTimes(1);
    });

    it("API Key 未配置时返回错误结果", async () => {
      const mockResult = {
        success: false,
        message: "未配置 SkillsMP API Key",
      };
      service.syncFromSkillsMP.mockResolvedValue(mockResult);

      const result = await controller.syncSkills();

      expect(result.success).toBe(false);
    });
  });
});
