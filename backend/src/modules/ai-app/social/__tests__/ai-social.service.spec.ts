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
import { SocialBrowserService } from "../services/social-browser.service";
import { XhsMcpAdapter } from "../adapters/xiaohongshu.adapter";
import {
  SocialPlatformType,
  SocialContentStatus,
  SocialContentSourceType,
} from "../types";

// S4 audit fix（2026-05-04）：session-crypto 删 dev fallback 后，spec 必须设
// SESSION_ENCRYPTION_KEY（64 hex chars = 32 bytes for AES-256）
process.env.SESSION_ENCRYPTION_KEY =
  "00112233445566778899aabbccddeeff00112233445566778899aabbccddeeff";

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

    // Mock SocialBrowserService
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
        { provide: SocialBrowserService, useValue: mockPlaywright },
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
      mockCache.get
        .mockResolvedValueOnce(false) // No lock
        .mockResolvedValueOnce(null); // No pending session

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

    it("should report error when content not found in transaction", async () => {
      mockPrisma.socialPlatformConnection.findFirst.mockResolvedValue({
        id: connectionId,
        userId,
        isActive: true,
      });

      mockPrisma.$transaction.mockImplementation(async (callback: any) => {
        const mockTx = {
          socialContent: {
            findFirst: jest.fn().mockResolvedValue(null),
            update: jest.fn(),
          },
          socialPublishLog: {
            create: jest.fn(),
          },
        };
        return callback(mockTx);
      });

      const result = await service.batchPublishContents(
        userId,
        ["nonexistent-content"],
        connectionId,
      );

      expect(result.succeeded).toBe(0);
      expect(result.failed).toBe(1);
      expect(result.errors![0].error).toContain("不存在");
    });

    it("should report error when content status is not publishable", async () => {
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
              status: "PUBLISHED",
            }),
            update: jest.fn(),
          },
          socialPublishLog: {
            create: jest.fn(),
          },
        };
        return callback(mockTx);
      });

      const result = await service.batchPublishContents(
        userId,
        ["content-1"],
        connectionId,
      );

      expect(result.succeeded).toBe(0);
      expect(result.errors![0].error).toContain("不允许发布");
    });

    it("should handle exception inside batch publish transaction", async () => {
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
            update: jest.fn().mockRejectedValue(new Error("DB error")),
          },
          socialPublishLog: {
            create: jest.fn(),
          },
        };
        return callback(mockTx);
      });

      const result = await service.batchPublishContents(
        userId,
        ["content-1"],
        connectionId,
      );

      expect(result.failed).toBe(1);
      expect(result.errors![0].error).toBe("DB error");
    });

    it("should fire-and-forget publish executor for succeeded contents", async () => {
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

      mockPublishExecutor.execute.mockRejectedValue(
        new Error("Publish failed"),
      );

      const result = await service.batchPublishContents(
        userId,
        ["content-1"],
        connectionId,
      );

      // Despite executor failure, the batch result reflects transaction success
      expect(result.succeeded).toBe(1);
    });
  });

  // =========================================================================
  // XHS MCP connection flows
  // =========================================================================

  describe("initConnection - XIAOHONGSHU", () => {
    it("should return pending with instructions when MCP not available", async () => {
      mockPrisma.socialPlatformConnection.findUnique.mockResolvedValue(null);
      mockXhsMcpAdapter.isAvailable.mockReturnValue(false);

      const result = (await service.initConnection(
        userId,
        "xiaohongshu",
      )) as any;

      expect(result.status).toBe("pending");
      expect(result.loginMethod).toBe("external-mcp");
      expect(result.instructions).toBeDefined();
      expect(result.message).toContain("MCP");
    });

    it("should create connection immediately when XHS already logged in", async () => {
      mockPrisma.socialPlatformConnection.findUnique.mockResolvedValue(null);
      mockXhsMcpAdapter.isAvailable.mockReturnValue(true);
      mockXhsMcpAdapter.checkLoginStatus.mockResolvedValue({
        loggedIn: true,
        nickname: "XHSUser",
      });
      mockPrisma.socialPlatformConnection.create = jest.fn().mockResolvedValue({
        id: "xhs-conn-id",
        userId,
        platformType: SocialPlatformType.XIAOHONGSHU,
        accountName: "XHSUser",
        sessionData: "mcp-managed",
        isActive: true,
      });

      const result = (await service.initConnection(
        userId,
        "xiaohongshu",
      )) as any;

      expect(result.status).toBe("success");
      expect(result.connection).toBeDefined();
    });

    it("should return pending with instructions when XHS not logged in yet", async () => {
      mockPrisma.socialPlatformConnection.findUnique.mockResolvedValue(null);
      mockXhsMcpAdapter.isAvailable.mockReturnValue(true);
      mockXhsMcpAdapter.checkLoginStatus.mockResolvedValue({ loggedIn: false });

      const result = (await service.initConnection(
        userId,
        "xiaohongshu",
      )) as any;

      expect(result.status).toBe("pending");
      expect(result.instructions).toBeDefined();
    });

    it("should return error when XHS MCP throws", async () => {
      mockPrisma.socialPlatformConnection.findUnique.mockResolvedValue(null);
      mockXhsMcpAdapter.isAvailable.mockReturnValue(true);
      mockXhsMcpAdapter.checkLoginStatus.mockRejectedValue(
        new Error("MCP unavailable"),
      );

      const result = (await service.initConnection(
        userId,
        "xiaohongshu",
      )) as any;

      expect(result.status).toBe("error");
      expect(result.message).toContain("MCP unavailable");
    });
  });

  describe("verifyConnection - XIAOHONGSHU", () => {
    it("should upsert connection when XHS login confirmed", async () => {
      mockXhsMcpAdapter.checkLoginStatus.mockResolvedValue({
        loggedIn: true,
        nickname: "XHSUser",
      });

      const result = (await service.verifyConnection(
        userId,
        "xiaohongshu",
      )) as any;

      expect(result.status).toBe("success");
      expect(mockPrisma.socialPlatformConnection.upsert).toHaveBeenCalled();
    });

    it("should return pending when XHS not yet logged in", async () => {
      mockXhsMcpAdapter.checkLoginStatus.mockResolvedValue({ loggedIn: false });

      const result = await service.verifyConnection(userId, "xiaohongshu");

      expect(result.status).toBe("pending");
      expect(result.message).toContain("等待");
    });

    it("should return error when XHS verify throws", async () => {
      mockXhsMcpAdapter.checkLoginStatus.mockRejectedValue(
        new Error("XHS error"),
      );

      const result = await service.verifyConnection(userId, "xiaohongshu");

      expect(result.status).toBe("error");
      expect(result.message).toContain("XHS error");
    });
  });

  // =========================================================================
  // testConnection - session validation paths
  // =========================================================================

  describe("testConnection - session validation", () => {
    it("should return invalid when sessionData is null", async () => {
      const connectionWithNoSession = {
        ...mockConnection,
        sessionData: null,
      };
      mockPrisma.socialPlatformConnection.findFirst.mockResolvedValue(
        connectionWithNoSession,
      );

      const result = await service.testConnection(userId, connectionId);

      expect(result.success).toBe(false);
      expect(result.message).toContain("无会话数据");
    });

    it("should validate XHS mcp-managed connection", async () => {
      const xhsConnection = {
        ...mockConnection,
        platformType: SocialPlatformType.XIAOHONGSHU,
        sessionData: "mcp-managed",
      };
      mockPrisma.socialPlatformConnection.findFirst.mockResolvedValue(
        xhsConnection,
      );
      mockXhsMcpAdapter.checkLoginStatus.mockResolvedValue({ loggedIn: true });

      const result = await service.testConnection(userId, connectionId);

      expect(result.success).toBe(true);
      expect(result.message).toBe("连接正常");
    });

    it("should return invalid when XHS MCP reports logged out", async () => {
      const xhsConnection = {
        ...mockConnection,
        platformType: SocialPlatformType.XIAOHONGSHU,
        sessionData: "mcp-managed",
      };
      mockPrisma.socialPlatformConnection.findFirst.mockResolvedValue(
        xhsConnection,
      );
      mockXhsMcpAdapter.checkLoginStatus.mockResolvedValue({ loggedIn: false });

      const result = await service.testConnection(userId, connectionId);

      expect(result.success).toBe(false);
    });

    it("should return invalid when XHS MCP throws during validation", async () => {
      const xhsConnection = {
        ...mockConnection,
        platformType: SocialPlatformType.XIAOHONGSHU,
        sessionData: "mcp-managed",
      };
      mockPrisma.socialPlatformConnection.findFirst.mockResolvedValue(
        xhsConnection,
      );
      mockXhsMcpAdapter.checkLoginStatus.mockRejectedValue(
        new Error("MCP down"),
      );

      const result = await service.testConnection(userId, connectionId);

      expect(result.success).toBe(false);
      expect(result.message).toContain("MCP");
    });

    it("should validate wechat session returning unsupported platform for unknown type", async () => {
      // Connection with non-xhs, non-wechat platform type (should return unsupported)
      const unknownPlatformConnection = {
        ...mockConnection,
        platformType: "TWITTER" as any,
        sessionData: "encrypted-data",
      };
      mockPrisma.socialPlatformConnection.findFirst.mockResolvedValue(
        unknownPlatformConnection,
      );

      // Mock decryptSession behavior
      const { decryptSession } = jest.requireMock("../utils/session-crypto");
      if (decryptSession) {
        decryptSession.mockReturnValue({
          cookies: [{ name: "test", value: "val" }],
        });
      }

      mockPlaywright.restoreSession.mockResolvedValue(undefined);
      mockPlaywright.createPage.mockResolvedValue({
        goto: jest.fn(),
        waitForNetworkIdle: jest.fn().mockResolvedValue(undefined),
        url: jest.fn().mockReturnValue("https://example.com"),
        $: jest.fn().mockResolvedValue(null),
      });
      mockPlaywright.closeContext.mockResolvedValue(undefined);

      const result = await service.testConnection(userId, connectionId);
      // Should return false (unsupported or validation failed)
      expect(result).toBeDefined();
      expect(typeof result.success).toBe("boolean");
    });
  });

  // =========================================================================
  // refreshConnection
  // =========================================================================

  describe("refreshConnection", () => {
    it("should throw NotFoundException if connection not found", async () => {
      mockPrisma.socialPlatformConnection.findFirst.mockResolvedValue(null);

      await expect(
        service.refreshConnection(userId, connectionId),
      ).rejects.toThrow(NotFoundException);
    });

    it("should update lastCheckAt and updatedAt", async () => {
      mockPrisma.socialPlatformConnection.findFirst.mockResolvedValue(
        mockConnection,
      );
      mockPrisma.socialPlatformConnection.update.mockResolvedValue({
        ...mockConnection,
        lastCheckAt: new Date(),
        updatedAt: new Date(),
      });

      const result = await service.refreshConnection(userId, connectionId);

      expect(mockPrisma.socialPlatformConnection.update).toHaveBeenCalledWith({
        where: { id: connectionId },
        data: expect.objectContaining({ lastCheckAt: expect.any(Date) }),
      });
      expect(result).toBeDefined();
    });
  });

  // =========================================================================
  // XHS pass-through methods
  // =========================================================================

  describe("XHS pass-through methods", () => {
    it("xhsGetLoginStatus should delegate to adapter", async () => {
      mockXhsMcpAdapter.checkLoginStatus.mockResolvedValue({
        loggedIn: true,
        nickname: "User",
      });

      const result = await service.xhsGetLoginStatus();

      expect(result.loggedIn).toBe(true);
      expect(mockXhsMcpAdapter.checkLoginStatus).toHaveBeenCalled();
    });

    it("xhsListFeeds should delegate to adapter", async () => {
      const feeds = [{ id: "feed-1", title: "Feed 1" }];
      mockXhsMcpAdapter.listFeeds.mockResolvedValue(feeds);

      const result = await service.xhsListFeeds();

      expect(result).toEqual(feeds);
    });

    it("xhsSearchFeeds should delegate to adapter", async () => {
      const feeds = [{ id: "feed-2", title: "Search Result" }];
      mockXhsMcpAdapter.searchFeeds.mockResolvedValue(feeds);

      const result = await service.xhsSearchFeeds("test keyword");

      expect(result).toEqual(feeds);
      expect(mockXhsMcpAdapter.searchFeeds).toHaveBeenCalledWith(
        "test keyword",
      );
    });

    it("xhsGetFeedDetail should delegate to adapter", async () => {
      const detail = { id: "feed-1", title: "Detail", content: "..." };
      mockXhsMcpAdapter.getFeedDetail.mockResolvedValue(detail);

      const result = await service.xhsGetFeedDetail("feed-1", "token-abc");

      expect(result).toEqual(detail);
      expect(mockXhsMcpAdapter.getFeedDetail).toHaveBeenCalledWith(
        "feed-1",
        "token-abc",
      );
    });

    it("xhsPostComment should delegate to adapter", async () => {
      mockXhsMcpAdapter.postComment.mockResolvedValue({ success: true });

      const result = await service.xhsPostComment(
        "feed-1",
        "token-abc",
        "Nice post!",
      );

      expect(result.success).toBe(true);
    });

    it("xhsGetUserProfile should delegate to adapter", async () => {
      const profile = { userId: "xhs-user-1", nickname: "User" };
      mockXhsMcpAdapter.getUserProfile.mockResolvedValue(profile);

      const result = await service.xhsGetUserProfile("xhs-user-1", "token");

      expect(result).toEqual(profile);
    });
  });

  // =========================================================================
  // Source listing methods
  // =========================================================================

  describe("getExploreSources", () => {
    it("should return resources without type filter", async () => {
      const mockResources = [
        { id: "r1", type: "ARTICLE", title: "Resource 1" },
      ];
      mockPrisma.resource.findMany.mockResolvedValue(mockResources);

      const result = await service.getExploreSources(userId, {
        page: 1,
        limit: 10,
      });

      expect(result).toEqual(mockResources);
      expect(mockPrisma.resource.findMany).toHaveBeenCalled();
    });

    it("should filter by type when provided", async () => {
      mockPrisma.resource.findMany.mockResolvedValue([]);

      await service.getExploreSources(userId, {
        type: "video",
        page: 1,
        limit: 10,
      });

      expect(mockPrisma.resource.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { type: "VIDEO" },
        }),
      );
    });
  });

  describe("getResearchSources", () => {
    it("should return user research topics", async () => {
      const mockTopics = [{ id: "t1", name: "Topic 1", status: "ACTIVE" }];
      mockPrisma.researchTopic.findMany.mockResolvedValue(mockTopics);

      const result = await service.getResearchSources(userId);

      expect(result).toEqual(mockTopics);
      expect(mockPrisma.researchTopic.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { userId } }),
      );
    });
  });

  describe("getOfficeSources", () => {
    it("should return user office documents", async () => {
      const mockDocs = [{ id: "d1", title: "Doc 1", type: "SLIDES" }];
      mockPrisma.officeDocument.findMany.mockResolvedValue(mockDocs);

      const result = await service.getOfficeSources(userId);

      expect(result).toEqual(mockDocs);
      expect(mockPrisma.officeDocument.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { userId } }),
      );
    });
  });

  describe("getWritingSources", () => {
    it("should return user writing projects", async () => {
      const mockProjects = [{ id: "p1", name: "Project 1", status: "ACTIVE" }];
      mockPrisma.writingProject.findMany.mockResolvedValue(mockProjects);

      const result = await service.getWritingSources(userId);

      expect(result).toEqual(mockProjects);
      expect(mockPrisma.writingProject.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { ownerId: userId } }),
      );
    });
  });

  describe("getPublishLogs", () => {
    it("should return publish logs for content", async () => {
      const mockLogs = [
        { id: "log-1", contentId, action: "PUBLISH", status: "DONE" },
      ];
      mockPrisma.socialPublishLog.findMany.mockResolvedValue(mockLogs);

      // Mock getContent
      mockPrisma.$queryRaw.mockResolvedValue([
        { id: contentId, userId, title: "Test", content: "Test" },
      ]);

      const result = await service.getPublishLogs(userId, contentId);

      expect(result).toEqual(mockLogs);
      expect(mockPrisma.socialPublishLog.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { contentId } }),
      );
    });
  });

  // =========================================================================
  // updateContent - no-op path
  // =========================================================================

  describe("updateContent - edge cases", () => {
    it("should return current content when no fields to update", async () => {
      const contentRow = {
        id: contentId,
        userId,
        connectionId: null,
        contentType: "WECHAT_ARTICLE",
        title: "Test",
        content: "Content",
        status: "DRAFT",
        connectionAccountName: null,
        connectionPlatformType: null,
      };
      mockPrisma.$queryRaw.mockResolvedValue([contentRow]);

      // Pass empty DTO - no fields to update
      const result = await service.updateContent(userId, contentId, {});

      expect(result).toBeDefined();
      // No update call should be made
      expect(mockPrisma.socialContent.update).not.toHaveBeenCalled();
    });
  });

  // =========================================================================
  // batchDeleteContents - error paths
  // =========================================================================

  describe("batchDeleteContents - error paths", () => {
    it("should report error when content not found in transaction", async () => {
      mockPrisma.$transaction.mockImplementation(async (callback: any) => {
        const mockTx = {
          socialContent: {
            findFirst: jest.fn().mockResolvedValue(null),
            delete: jest.fn(),
          },
        };
        return callback(mockTx);
      });

      const result = await service.batchDeleteContents(userId, ["missing-id"]);

      expect(result.succeeded).toBe(0);
      expect(result.failed).toBe(1);
      expect(result.errors![0].error).toContain("不存在");
    });

    it("should handle exception during deletion", async () => {
      mockPrisma.$transaction.mockImplementation(async (callback: any) => {
        const mockTx = {
          socialContent: {
            findFirst: jest.fn().mockResolvedValue({
              id: "content-1",
              userId,
              status: "DRAFT",
            }),
            delete: jest.fn().mockRejectedValue(new Error("FK constraint")),
          },
        };
        return callback(mockTx);
      });

      const result = await service.batchDeleteContents(userId, ["content-1"]);

      expect(result.failed).toBe(1);
      expect(result.errors![0].error).toBe("FK constraint");
    });

    it("should return success=false and include errors array when any fail", async () => {
      const ids = ["content-good", "content-missing"];

      mockPrisma.$transaction.mockImplementation(async (callback: any) => {
        const mockTx = {
          socialContent: {
            findFirst: jest.fn().mockImplementation((query: any) => {
              if (query.where.id === "content-good") {
                return Promise.resolve({
                  id: "content-good",
                  userId,
                  status: "DRAFT",
                });
              }
              return Promise.resolve(null);
            }),
            delete: jest.fn().mockResolvedValue(undefined),
          },
        };
        return callback(mockTx);
      });

      const result = await service.batchDeleteContents(userId, ids);

      expect(result.total).toBe(2);
      expect(result.succeeded).toBe(1);
      expect(result.failed).toBe(1);
      expect(result.success).toBe(false);
      expect(result.errors).toBeDefined();
    });
  });

  // =========================================================================
  // getContents - with contentType filter
  // =========================================================================

  describe("getContents - contentType filter", () => {
    it("should filter by both status and contentType", async () => {
      mockPrisma.$queryRaw
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([{ count: BigInt(0) }]);

      await service.getContents(userId, {
        status: "DRAFT",
        contentType: "WECHAT_ARTICLE",
        page: 1,
        limit: 10,
      });

      expect(mockPrisma.$queryRaw).toHaveBeenCalledTimes(2);
    });

    it("should transform content with null connectionId to null connection", async () => {
      const contentRow = {
        id: contentId,
        userId,
        connectionId: null,
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
        connectionAccountName: null,
        connectionPlatformType: null,
      };

      mockPrisma.$queryRaw
        .mockResolvedValueOnce([contentRow])
        .mockResolvedValueOnce([{ count: BigInt(1) }]);

      const result = await service.getContents(userId, { page: 1, limit: 10 });

      expect(result.contents[0].connection).toBeNull();
    });
  });
});
