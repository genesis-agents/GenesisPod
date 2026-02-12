/**
 * AiSocialService 单元测试
 *
 * 测试 AI Social 核心功能：
 * - initConnection() 初始化平台连接
 * - verifyConnection() 验证平台连接
 * - getConnections() 获取连接列表
 * - createContent() 创建内容
 * - getContents() 获取内容列表
 * - publishContent() 发布内容
 * - checkContent() 内容审核
 * - batchDeleteContents() 批量删除
 */

import { Test, TestingModule } from "@nestjs/testing";
import { Logger, NotFoundException, BadRequestException } from "@nestjs/common";
import { AiSocialService } from "../ai-social.service";
import { PrismaService } from "../../../../common/prisma/prisma.service";
import { CacheService } from "../../../../common/cache/cache.service";
import { ContentCheckerService } from "../services/content-checker.service";
import { PublishExecutorService } from "../services/publish-executor.service";
import { PlaywrightService } from "../services/playwright.service";
import { XhsMcpAdapter } from "../adapters/xiaohongshu.adapter";
import {
  SocialPlatformType,
  SocialContentStatus,
  SocialContentSourceType,
} from "../types";

describe("AiSocialService", () => {
  let service: AiSocialService;
  let mockPrisma: any;
  let mockCache: any;
  let mockContentChecker: any;
  let mockPublishExecutor: any;
  let mockPlaywright: any;
  let mockXhsMcpAdapter: any;

  const userId = "user-123";
  const connectionId = "conn-456";
  const contentId = "content-789";

  const mockConnection = {
    id: connectionId,
    userId,
    platformType: SocialPlatformType.WECHAT_MP,
    accountName: "MyWechatMP",
    isActive: true,
    sessionData: "encrypted-session-data",
    lastCheckAt: new Date(),
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const mockContent = {
    id: contentId,
    userId,
    connectionId,
    contentType: "WECHAT_ARTICLE",
    sourceType: SocialContentSourceType.MANUAL,
    title: "Test Article",
    content: "Article content",
    status: SocialContentStatus.DRAFT,
    images: ["https://example.com/image.jpg"],
    tags: ["test", "article"],
    autoPublish: false,
    retryCount: 0,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  beforeEach(async () => {
    // Mock PrismaService
    mockPrisma = {
      socialPlatformConnection: {
        findMany: jest.fn().mockResolvedValue([mockConnection]),
        findUnique: jest.fn().mockResolvedValue(mockConnection),
        findFirst: jest.fn().mockResolvedValue(mockConnection),
        upsert: jest.fn().mockResolvedValue(mockConnection),
        update: jest.fn().mockResolvedValue(mockConnection),
        delete: jest.fn().mockResolvedValue(mockConnection),
      },
      socialContent: {
        findMany: jest.fn().mockResolvedValue([mockContent]),
        findFirst: jest.fn().mockResolvedValue(mockContent),
        update: jest.fn().mockResolvedValue(mockContent),
        delete: jest.fn().mockResolvedValue(mockContent),
      },
      socialPublishLog: {
        findMany: jest.fn().mockResolvedValue([]),
        create: jest.fn(),
      },
      resource: {
        findMany: jest.fn().mockResolvedValue([]),
      },
      researchTopic: {
        findMany: jest.fn().mockResolvedValue([]),
      },
      officeDocument: {
        findMany: jest.fn().mockResolvedValue([]),
      },
      writingProject: {
        findMany: jest.fn().mockResolvedValue([]),
      },
      $queryRaw: jest.fn(),
      $executeRaw: jest.fn(),
      $transaction: jest.fn(),
    };

    // Mock CacheService
    mockCache = {
      get: jest.fn(),
      set: jest.fn().mockResolvedValue(undefined),
      del: jest.fn().mockResolvedValue(undefined),
      buildKey: jest
        .fn()
        .mockImplementation(
          (prefix: string, ...parts: string[]) =>
            `${prefix}:${parts.join(":")}`,
        ),
    };

    // Mock ContentCheckerService
    mockContentChecker = {
      check: jest.fn().mockResolvedValue({
        passed: true,
        issues: [],
        score: 1.0,
      }),
    };

    // Mock PublishExecutorService
    mockPublishExecutor = {
      execute: jest.fn().mockResolvedValue({
        success: true,
        externalId: "ext-123",
      }),
    };

    // Mock PlaywrightService
    mockPlaywright = {
      startLoginSession: jest.fn().mockResolvedValue({
        sessionKey: "session-key-123",
        screenshot: "base64-screenshot-data",
      }),
      checkLoginStatus: jest.fn().mockResolvedValue({
        loggedIn: false,
        screenshot: "base64-screenshot-data",
      }),
      endLoginSession: jest.fn().mockResolvedValue(undefined),
      restoreSession: jest.fn().mockResolvedValue(undefined),
      createPage: jest.fn(),
      closeContext: jest.fn().mockResolvedValue(undefined),
    };

    // Mock XhsMcpAdapter
    mockXhsMcpAdapter = {
      isAvailable: jest.fn().mockReturnValue(false),
      checkLoginStatus: jest.fn().mockResolvedValue({ loggedIn: false }),
      publishContent: jest.fn().mockResolvedValue({ success: true }),
      listFeeds: jest.fn().mockResolvedValue([]),
      searchFeeds: jest.fn().mockResolvedValue([]),
      getFeedDetail: jest.fn().mockResolvedValue(null),
      postComment: jest.fn().mockResolvedValue({ success: true }),
      getUserProfile: jest.fn().mockResolvedValue(null),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AiSocialService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: CacheService, useValue: mockCache },
        { provide: ContentCheckerService, useValue: mockContentChecker },
        { provide: PublishExecutorService, useValue: mockPublishExecutor },
        { provide: PlaywrightService, useValue: mockPlaywright },
        { provide: XhsMcpAdapter, useValue: mockXhsMcpAdapter },
      ],
    }).compile();

    service = module.get<AiSocialService>(AiSocialService);

    jest.spyOn(Logger.prototype, "log").mockImplementation();
    jest.spyOn(Logger.prototype, "warn").mockImplementation();
    jest.spyOn(Logger.prototype, "error").mockImplementation();
    jest.spyOn(Logger.prototype, "debug").mockImplementation();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  // =========================================================================
  // Platform Connections
  // =========================================================================

  describe("getConnections", () => {
    it("should return user connections", async () => {
      const result = await service.getConnections(userId);

      expect(result).toEqual([mockConnection]);
      expect(mockPrisma.socialPlatformConnection.findMany).toHaveBeenCalledWith(
        {
          where: { userId },
        },
      );
    });
  });

  describe("initConnection", () => {
    it("should return existing connection if already exists", async () => {
      mockPrisma.socialPlatformConnection.findUnique.mockResolvedValue(
        mockConnection,
      );

      const result = await service.initConnection(userId, "wechat_mp");

      expect(result.status).toBe("existing");
      expect(result.connection).toEqual(mockConnection);
      expect(mockPlaywright.startLoginSession).not.toHaveBeenCalled();
    });

    it("should start new login session if no existing connection", async () => {
      mockPrisma.socialPlatformConnection.findUnique.mockResolvedValue(null);

      const result = (await service.initConnection(userId, "wechat_mp")) as any;

      expect(result.status).toBe("pending");
      expect(result.sessionKey).toBe("session-key-123");
      expect(result.screenshot).toBe("base64-screenshot-data");
      expect(mockPlaywright.startLoginSession).toHaveBeenCalledWith(
        userId,
        SocialPlatformType.WECHAT_MP,
      );
      expect(mockCache.set).toHaveBeenCalled();
    });

    it("should handle playwright startup errors", async () => {
      mockPrisma.socialPlatformConnection.findUnique.mockResolvedValue(null);
      mockPlaywright.startLoginSession.mockRejectedValue(
        new Error("Playwright error"),
      );

      const result = await service.initConnection(userId, "wechat_mp");

      expect(result.status).toBe("error");
      expect(result.message).toContain("Playwright error");
    });
  });

  describe("verifyConnection", () => {
    it("should return pending if already verifying", async () => {
      mockCache.get.mockResolvedValue(true); // Lock exists

      const result = await service.verifyConnection(userId, "wechat_mp");

      expect(result.status).toBe("pending");
      expect(result.message).toContain("验证中");
    });

    it("should return error if no pending session found", async () => {
      mockCache.get.mockResolvedValue(false); // No lock
      mockCache.get.mockResolvedValueOnce(null); // No pending session

      const result = await service.verifyConnection(userId, "wechat_mp");

      expect(result.status).toBe("error");
      expect(result.message).toContain("没有待验证的登录会话");
    });

    it("should return pending if login not yet completed", async () => {
      mockCache.get.mockResolvedValueOnce(false); // No lock
      mockCache.get.mockResolvedValueOnce({
        sessionKey: "session-key-123",
        platformType: SocialPlatformType.WECHAT_MP,
      });

      mockPlaywright.checkLoginStatus.mockResolvedValue({
        loggedIn: false,
        screenshot: "new-screenshot",
      });

      const result = (await service.verifyConnection(
        userId,
        "wechat_mp",
      )) as any;

      expect(result.status).toBe("pending");
      expect(result.screenshot).toBe("new-screenshot");
    });

    it("should create connection on successful login", async () => {
      mockCache.get.mockResolvedValueOnce(false); // No lock
      mockCache.get.mockResolvedValueOnce({
        sessionKey: "session-key-123",
        platformType: SocialPlatformType.WECHAT_MP,
      });

      mockPlaywright.checkLoginStatus.mockResolvedValue({
        loggedIn: true,
        accountName: "MyAccount",
        sessionData: {
          cookies: [
            { name: "session", value: "abc123", domain: "weixin.qq.com" },
          ],
          localStorage: {},
        },
      });

      const result = (await service.verifyConnection(
        userId,
        "wechat_mp",
      )) as any;

      expect(result.status).toBe("success");
      expect(result.connection).toBeDefined();
      expect(mockPrisma.socialPlatformConnection.upsert).toHaveBeenCalled();
      expect(mockPlaywright.endLoginSession).toHaveBeenCalledWith(
        "session-key-123",
      );
      expect(mockCache.del).toHaveBeenCalled();
    });

    it("should handle login with no cookies gracefully", async () => {
      mockCache.get.mockResolvedValueOnce(false);
      mockCache.get.mockResolvedValueOnce({
        sessionKey: "session-key-123",
        platformType: SocialPlatformType.WECHAT_MP,
      });

      mockPlaywright.checkLoginStatus.mockResolvedValue({
        loggedIn: true,
        sessionData: {
          cookies: [],
          localStorage: {},
        },
      });

      const result = await service.verifyConnection(userId, "wechat_mp");

      expect(result.status).toBe("pending");
      expect(result.message).toContain("登录检测中");
    });

    it("should release lock on error", async () => {
      mockCache.get.mockResolvedValueOnce(false);
      mockCache.get.mockResolvedValueOnce({
        sessionKey: "session-key-123",
        platformType: SocialPlatformType.WECHAT_MP,
      });

      mockPlaywright.checkLoginStatus.mockRejectedValue(
        new Error("Check failed"),
      );

      const result = await service.verifyConnection(userId, "wechat_mp");

      expect(result.status).toBe("error");
      expect(mockCache.del).toHaveBeenCalled(); // Lock released
    });
  });

  describe("deleteConnection", () => {
    it("should delete connection", async () => {
      const result = await service.deleteConnection(userId, "wechat_mp");

      expect(result.success).toBe(true);
      expect(mockPrisma.socialPlatformConnection.delete).toHaveBeenCalledWith({
        where: {
          userId_platformType: {
            userId,
            platformType: SocialPlatformType.WECHAT_MP,
          },
        },
      });
    });
  });

  describe("testConnection", () => {
    it("should throw NotFoundException if connection not found", async () => {
      mockPrisma.socialPlatformConnection.findFirst.mockResolvedValue(null);

      await expect(
        service.testConnection(userId, connectionId),
      ).rejects.toThrow(NotFoundException);
    });
  });

  // =========================================================================
  // Content Management
  // =========================================================================

  describe("getContents", () => {
    it("should return paginated contents", async () => {
      const mockContentRow = {
        id: contentId,
        userId,
        connectionId,
        contentType: "WECHAT_ARTICLE",
        sourceType: "MANUAL",
        sourceId: null,
        sourceUrl: null,
        title: "Test",
        content: "Content",
        author: null,
        digest: null,
        coverImageUrl: null,
        images: [],
        tags: [],
        location: null,
        status: "DRAFT",
        aiProcessLog: null,
        aiSuggestions: null,
        complianceCheck: null,
        reviewStatus: null,
        reviewedById: null,
        reviewedAt: null,
        reviewNote: null,
        scheduledAt: null,
        publishedAt: null,
        autoPublish: false,
        externalId: null,
        externalUrl: null,
        errorMessage: null,
        retryCount: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
        connectionAccountName: "MyAccount",
        connectionPlatformType: "WECHAT_MP",
      };

      mockPrisma.$queryRaw
        .mockResolvedValueOnce([mockContentRow]) // Contents query
        .mockResolvedValueOnce([{ count: BigInt(1) }]); // Count query

      const options = { page: 1, limit: 10 };

      const result = await service.getContents(userId, options);

      expect(result.contents).toHaveLength(1);
      expect(result.pagination.total).toBe(1);
      expect(result.pagination.page).toBe(1);
    });

    it("should filter by status", async () => {
      mockPrisma.$queryRaw
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([{ count: BigInt(0) }]);

      await service.getContents(userId, {
        status: "PUBLISHED",
        page: 1,
        limit: 10,
      });

      expect(mockPrisma.$queryRaw).toHaveBeenCalled();
    });

    it("should throw BadRequestException for invalid status", async () => {
      await expect(
        service.getContents(userId, {
          status: "INVALID_STATUS",
          page: 1,
          limit: 10,
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it("should throw BadRequestException for invalid content type", async () => {
      await expect(
        service.getContents(userId, {
          contentType: "INVALID_TYPE",
          page: 1,
          limit: 10,
        }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe("createContent", () => {
    it("should create new content", async () => {
      const dto = {
        contentType: "WECHAT_ARTICLE",
        title: "New Article",
        content: "Article content",
        author: "John Doe",
        images: ["https://example.com/image.jpg"],
        tags: ["test"],
      };

      mockPrisma.$queryRaw.mockResolvedValue([
        {
          id: "new-content-id",
          user_id: userId,
          content_type: "WECHAT_ARTICLE",
          source_type: "MANUAL",
          title: "New Article",
          content: "Article content",
          status: "DRAFT",
          created_at: new Date(),
          updated_at: new Date(),
        },
      ]);

      const result = await service.createContent(userId, dto as any);

      expect(result).toHaveProperty("id");
      expect(mockPrisma.$queryRaw).toHaveBeenCalled();
    });
  });

  describe("getContent", () => {
    it("should return single content", async () => {
      mockPrisma.$queryRaw.mockResolvedValue([
        {
          id: contentId,
          userId,
          connectionId,
          contentType: "WECHAT_ARTICLE",
          sourceType: "MANUAL",
          sourceId: null,
          sourceUrl: null,
          title: "Test",
          content: "Content",
          author: null,
          digest: null,
          coverImageUrl: null,
          images: [],
          tags: [],
          location: null,
          status: "DRAFT",
          complianceCheck: null,
          reviewStatus: null,
          scheduledAt: null,
          publishedAt: null,
          createdAt: new Date(),
          updatedAt: new Date(),
          connectionAccountName: "MyAccount",
          connectionPlatformType: "WECHAT_MP",
        },
      ]);

      const result = await service.getContent(userId, contentId);

      expect(result.id).toBe(contentId);
      expect(result.connection).toBeDefined();
    });

    it("should throw NotFoundException if content not found", async () => {
      mockPrisma.$queryRaw.mockResolvedValue([]);

      await expect(service.getContent(userId, contentId)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe("updateContent", () => {
    it("should update content fields", async () => {
      mockPrisma.$queryRaw.mockResolvedValue([
        {
          id: contentId,
          userId,
          title: "Test",
          content: "Content",
          status: "DRAFT",
        },
      ]);

      const dto = { title: "Updated Title" };

      await service.updateContent(userId, contentId, dto);

      expect(mockPrisma.socialContent.update).toHaveBeenCalledWith({
        where: { id: contentId, userId },
        data: expect.objectContaining({
          title: "Updated Title",
        }),
      });
    });
  });

  describe("deleteContent", () => {
    it("should verify ownership and delete content", async () => {
      mockPrisma.$queryRaw.mockResolvedValue([
        { id: contentId, userId, title: "Test" },
      ]);

      const result = await service.deleteContent(userId, contentId);

      expect(result.success).toBe(true);
      expect(mockPrisma.$executeRaw).toHaveBeenCalled();
    });
  });

  // =========================================================================
  // Content Checking
  // =========================================================================

  describe("checkContent", () => {
    it("should check content compliance", async () => {
      mockPrisma.$queryRaw.mockResolvedValue([
        {
          id: contentId,
          userId,
          content: "Test content",
          status: "DRAFT",
        },
      ]);

      const result = await service.checkContent(userId, contentId);

      expect(result.passed).toBe(true);
      expect(result).toHaveProperty("checkedAt");
      expect(mockContentChecker.check).toHaveBeenCalledWith("Test content");
      expect(mockPrisma.$executeRaw).toHaveBeenCalled();
    });
  });

  // =========================================================================
  // Publishing
  // =========================================================================

  describe("publishContent", () => {
    it("should throw error if no connection provided", async () => {
      mockPrisma.$queryRaw.mockResolvedValue([
        {
          id: contentId,
          userId,
          connectionId: null,
          contentType: "WECHAT_ARTICLE",
        },
      ]);

      await expect(
        service.publishContent(userId, contentId, {}),
      ).rejects.toThrow(BadRequestException);
    });

    it("should publish content with valid connection", async () => {
      mockPrisma.$queryRaw.mockResolvedValue([
        {
          id: contentId,
          userId,
          connectionId,
          contentType: "WECHAT_ARTICLE",
          status: "DRAFT",
        },
      ]);

      await service.publishContent(userId, contentId, {
        connectionId,
      });

      expect(mockPrisma.socialPlatformConnection.findUnique).toHaveBeenCalled();
      expect(mockPrisma.$executeRaw).toHaveBeenCalled();
      expect(mockPublishExecutor.execute).toHaveBeenCalledWith(contentId);
    });

    it("should find active connection if original connection not found", async () => {
      mockPrisma.$queryRaw.mockResolvedValue([
        {
          id: contentId,
          userId,
          connectionId: "old-connection-id",
          contentType: "WECHAT_ARTICLE",
          status: "DRAFT",
        },
      ]);

      mockPrisma.socialPlatformConnection.findUnique.mockResolvedValue(null);
      mockPrisma.socialPlatformConnection.findFirst.mockResolvedValue({
        id: "new-connection-id",
        userId,
        platformType: "WECHAT_MP",
        isActive: true,
      });

      await service.publishContent(userId, contentId, {});

      expect(mockPrisma.socialPlatformConnection.findFirst).toHaveBeenCalled();
    });

    it("should throw error if no active connection available", async () => {
      mockPrisma.$queryRaw.mockResolvedValue([
        {
          id: contentId,
          userId,
          connectionId: "old-connection-id",
          contentType: "WECHAT_ARTICLE",
          status: "DRAFT",
        },
      ]);

      mockPrisma.socialPlatformConnection.findUnique.mockResolvedValue(null);
      mockPrisma.socialPlatformConnection.findFirst.mockResolvedValue(null);

      await expect(
        service.publishContent(userId, contentId, {}),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe("scheduleContent", () => {
    it("should schedule content for future publishing", async () => {
      mockPrisma.$queryRaw.mockResolvedValue([
        {
          id: contentId,
          userId,
          status: "DRAFT",
        },
      ]);

      const scheduledAt = new Date("2025-12-31");

      await service.scheduleContent(userId, contentId, scheduledAt);

      expect(mockPrisma.$executeRaw).toHaveBeenCalled();
    });
  });

  describe("cancelPublish", () => {
    it("should cancel scheduled content", async () => {
      mockPrisma.$queryRaw.mockResolvedValue([
        {
          id: contentId,
          userId,
          status: SocialContentStatus.SCHEDULED,
        },
      ]);

      await service.cancelPublish(userId, contentId);

      expect(mockPrisma.$executeRaw).toHaveBeenCalled();
    });

    it("should throw error if content is not scheduled or pending", async () => {
      mockPrisma.$queryRaw.mockResolvedValue([
        {
          id: contentId,
          userId,
          status: SocialContentStatus.PUBLISHED,
        },
      ]);

      await expect(service.cancelPublish(userId, contentId)).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  // =========================================================================
  // Batch Operations
  // =========================================================================

  describe("batchDeleteContents", () => {
    it("should delete multiple contents", async () => {
      const ids = ["content-1", "content-2"];

      mockPrisma.$transaction.mockImplementation(async (callback: any) => {
        const mockTx = {
          socialContent: {
            findFirst: jest.fn().mockImplementation((query: any) => {
              const id = query.where.id;
              return Promise.resolve({
                id,
                userId,
                status: "DRAFT",
              });
            }),
            delete: jest.fn().mockResolvedValue(undefined),
          },
        };
        return callback(mockTx);
      });

      const result = await service.batchDeleteContents(userId, ids);

      expect(result.total).toBe(2);
      expect(result.succeeded).toBe(2);
      expect(result.success).toBe(true);
    });

    it("should not delete published content", async () => {
      const ids = ["content-1"];

      mockPrisma.$transaction.mockImplementation(async (callback: any) => {
        const mockTx = {
          socialContent: {
            findFirst: jest.fn().mockResolvedValue({
              id: "content-1",
              userId,
              status: "PUBLISHED",
            }),
            delete: jest.fn(),
          },
        };
        return callback(mockTx);
      });

      const result = await service.batchDeleteContents(userId, ids);

      expect(result.succeeded).toBe(0);
      expect(result.errors).toBeDefined();
      expect(result.errors![0].error).toContain("已发布内容无法删除");
    });
  });

  describe("batchPublishContents", () => {
    it("should validate connection before batch publish", async () => {
      mockPrisma.socialPlatformConnection.findFirst.mockResolvedValue(null);

      const result = await service.batchPublishContents(
        userId,
        ["content-1"],
        "invalid-connection",
      );

      expect(result.success).toBe(false);
      expect(result.errors![0].error).toContain("平台连接无效");
    });

    it("should publish multiple contents", async () => {
      mockPrisma.socialPlatformConnection.findFirst.mockResolvedValue({
        id: connectionId,
        userId,
        isActive: true,
      });

      mockPrisma.$transaction.mockImplementation(async (callback: any) => {
        const mockTx = {
          socialContent: {
            findFirst: jest.fn().mockResolvedValue({
              id: "content-1",
              userId,
              status: "DRAFT",
            }),
            update: jest.fn().mockResolvedValue(undefined),
          },
          socialPublishLog: {
            create: jest.fn().mockResolvedValue(undefined),
          },
        };
        return callback(mockTx);
      });

      const result = await service.batchPublishContents(
        userId,
        ["content-1"],
        connectionId,
      );

      expect(result.total).toBe(1);
    });
  });
});
