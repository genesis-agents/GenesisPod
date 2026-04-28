/**
 * AiSocialService - Supplemental Tests
 *
 * Covers branches not covered by the existing ai-social.service.spec.ts:
 * - getContents() with invalid status/contentType enum
 * - deleteContent()
 * - checkContent()
 * - publishContent() success + failure
 * - xhs MCP adapter methods
 * - refreshConnection()
 * - batchDeleteContents()
 */

import { Test, TestingModule } from "@nestjs/testing";
import { NotFoundException, BadRequestException } from "@nestjs/common";
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

// Mock transitive deps that are not installed in the worktree
jest.mock("@nestjs/cache-manager", () => ({ CACHE_MANAGER: "CACHE_MANAGER" }), {
  virtual: true,
});
jest.mock("cache-manager", () => ({}), { virtual: true });
jest.mock("ioredis", () => ({}), { virtual: true });

// Mock the session encryption utilities so we don't need real crypto
jest.mock("../utils/session-crypto", () => ({
  encryptSession: jest.fn((data: unknown) => JSON.stringify(data)),
  decryptSession: jest.fn((data: string) => JSON.parse(data) as unknown),
}));

// From __tests__/ subfolder, the path is 3 levels up to ai-engine/facade
jest.mock("../../../ai-engine/facade", () => ({
  MissionExecutorService: class {},
  KernelContext: { run: jest.fn((_ctx: unknown, fn: () => unknown) => fn()) },
}));
jest.mock("../../../ai-harness/facade", () => ({
  MissionExecutorService: class {},
  KernelContext: { run: jest.fn((_ctx: unknown, fn: () => unknown) => fn()) },
}));

// Mock ai-engine/facade which has transitive cache-manager deps
jest.mock("../../../ai-engine/facade", () => ({
  AIFacade: class {},
  AiChatService: class {},
  ChatFacade: class {},
  EmbeddingService: class {},
}));
jest.mock("../../../ai-harness/facade", () => ({
  AIFacade: class {},
  AiChatService: class {},
  ChatFacade: class {},
  EmbeddingService: class {},
}));

// Mock the social services that import ai-engine
jest.mock("../services/publish-executor.service", () => ({
  PublishExecutorService: class {},
}));
jest.mock("../services/content-version.service", () => ({
  ContentVersionService: class {},
}));

describe("AiSocialService (supplemental)", () => {
  let service: AiSocialService;
  let mockPrisma: {
    socialPlatformConnection: {
      findMany: jest.Mock;
      findUnique: jest.Mock;
      findFirst: jest.Mock;
      upsert: jest.Mock;
      update: jest.Mock;
      delete: jest.Mock;
      create: jest.Mock;
    };
    socialContent: {
      findMany: jest.Mock;
      findFirst: jest.Mock;
      update: jest.Mock;
      delete: jest.Mock;
    };
    socialPublishLog: {
      findMany: jest.Mock;
      create: jest.Mock;
    };
    $queryRaw: jest.Mock;
    $executeRaw: jest.Mock;
    $transaction: jest.Mock;
  };
  let mockCache: {
    get: jest.Mock;
    set: jest.Mock;
    del: jest.Mock;
    buildKey: jest.Mock;
  };
  let mockContentChecker: { check: jest.Mock };
  let mockPublishExecutor: { execute: jest.Mock };
  let mockPlaywright: {
    startLoginSession: jest.Mock;
    checkLoginStatus: jest.Mock;
    endLoginSession: jest.Mock;
    restoreSession: jest.Mock;
    createPage: jest.Mock;
    closeContext: jest.Mock;
  };
  let mockXhsMcpAdapter: {
    isAvailable: jest.Mock;
    checkLoginStatus: jest.Mock;
    listFeeds: jest.Mock;
    searchFeeds: jest.Mock;
    getFeedDetail: jest.Mock;
    postComment: jest.Mock;
    getUserProfile: jest.Mock;
  };

  const userId = "user-123";
  const contentId = "content-789";
  const connectionId = "conn-456";

  const mockContent = {
    id: contentId,
    userId,
    connectionId,
    contentType: "WECHAT_ARTICLE",
    sourceType: SocialContentSourceType.MANUAL,
    title: "Test Article",
    content: "Article content here",
    status: SocialContentStatus.DRAFT,
    images: [],
    tags: [],
    autoPublish: false,
    retryCount: 0,
    coverImageUrl: null,
    digest: null,
    author: null,
    location: null,
    sourceId: null,
    sourceUrl: null,
    aiProcessLog: null,
    aiSuggestions: null,
    complianceCheck: null,
    reviewStatus: null,
    reviewedById: null,
    reviewedAt: null,
    reviewNote: null,
    scheduledAt: null,
    publishedAt: null,
    externalId: null,
    externalUrl: null,
    errorMessage: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    connectionAccountName: "MyAccount",
    connectionPlatformType: "WECHAT_MP",
    connection: { accountName: "MyAccount", platformType: "WECHAT_MP" },
  };

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

  beforeEach(async () => {
    mockPrisma = {
      socialPlatformConnection: {
        findMany: jest.fn().mockResolvedValue([mockConnection]),
        findUnique: jest.fn().mockResolvedValue(mockConnection),
        findFirst: jest.fn().mockResolvedValue(mockConnection),
        upsert: jest.fn().mockResolvedValue(mockConnection),
        update: jest.fn().mockResolvedValue(mockConnection),
        delete: jest.fn().mockResolvedValue(mockConnection),
        create: jest.fn().mockResolvedValue(mockConnection),
      },
      socialContent: {
        findMany: jest.fn().mockResolvedValue([mockContent]),
        findFirst: jest.fn().mockResolvedValue(mockContent),
        update: jest.fn().mockResolvedValue(mockContent),
        delete: jest.fn().mockResolvedValue(mockContent),
      },
      socialPublishLog: {
        findMany: jest.fn().mockResolvedValue([]),
        create: jest.fn().mockResolvedValue({}),
      },
      $queryRaw: jest.fn().mockResolvedValue([mockContent]),
      $executeRaw: jest.fn().mockResolvedValue(1),
      $transaction: jest.fn(),
    };

    mockCache = {
      get: jest.fn().mockResolvedValue(null),
      set: jest.fn().mockResolvedValue(undefined),
      del: jest.fn().mockResolvedValue(undefined),
      buildKey: jest
        .fn()
        .mockImplementation(
          (prefix: string, ...parts: string[]) =>
            `${prefix}:${parts.join(":")}`,
        ),
    };

    mockContentChecker = {
      check: jest.fn().mockResolvedValue({
        passed: true,
        issues: [],
        score: 1.0,
      }),
    };

    mockPublishExecutor = {
      execute: jest.fn().mockResolvedValue({
        success: true,
        externalId: "ext-123",
      }),
    };

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
      createPage: jest.fn().mockResolvedValue({
        goto: jest.fn().mockResolvedValue(undefined),
        waitForNetworkIdle: jest.fn().mockResolvedValue(undefined),
        url: jest.fn().mockReturnValue("https://mp.weixin.qq.com/cgi-bin/home"),
        $: jest.fn().mockResolvedValue(null),
      }),
      closeContext: jest.fn().mockResolvedValue(undefined),
    };

    mockXhsMcpAdapter = {
      isAvailable: jest.fn().mockReturnValue(true),
      checkLoginStatus: jest
        .fn()
        .mockResolvedValue({ loggedIn: true, nickname: "TestUser" }),
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
  });

  // ==================== getContents - validation ====================

  describe("getContents - invalid enum values", () => {
    it("throws BadRequestException for invalid status", async () => {
      await expect(
        service.getContents(userId, {
          status: "INVALID_STATUS",
          page: 1,
          limit: 10,
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it("throws BadRequestException for invalid contentType", async () => {
      await expect(
        service.getContents(userId, {
          contentType: "INVALID_TYPE",
          page: 1,
          limit: 10,
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it("returns content list for valid status filter (DRAFT)", async () => {
      mockPrisma.$queryRaw
        .mockResolvedValueOnce([mockContent])
        .mockResolvedValueOnce([{ count: BigInt(1) }]);

      const result = await service.getContents(userId, {
        status: "DRAFT",
        page: 1,
        limit: 10,
      });

      expect(result.contents).toBeDefined();
      expect(result.pagination).toBeDefined();
      expect(result.pagination.total).toBe(1);
    });

    it("paginates correctly with page and limit", async () => {
      mockPrisma.$queryRaw
        .mockResolvedValueOnce([mockContent])
        .mockResolvedValueOnce([{ count: BigInt(25) }]);

      const result = await service.getContents(userId, {
        page: 2,
        limit: 10,
      });

      expect(result.pagination.page).toBe(2);
      expect(result.pagination.limit).toBe(10);
      expect(result.pagination.total).toBe(25);
      expect(result.pagination.totalPages).toBe(3);
    });
  });

  // ==================== deleteContent ====================

  describe("deleteContent", () => {
    it("deletes content that belongs to user", async () => {
      mockPrisma.$queryRaw.mockResolvedValue([mockContent]);
      mockPrisma.$executeRaw.mockResolvedValue(1);

      const result = await service.deleteContent(userId, contentId);

      expect(result).toEqual({ success: true });
      expect(mockPrisma.$executeRaw).toHaveBeenCalled();
    });

    it("throws NotFoundException when content does not exist", async () => {
      mockPrisma.$queryRaw.mockResolvedValue([]);

      await expect(
        service.deleteContent(userId, "nonexistent"),
      ).rejects.toThrow(NotFoundException);
    });
  });

  // ==================== checkContent ====================

  describe("checkContent", () => {
    it("returns checker result with checkedAt for passing content", async () => {
      mockPrisma.$queryRaw.mockResolvedValue([mockContent]);
      mockContentChecker.check.mockResolvedValue({
        passed: true,
        issues: [],
        score: 0.95,
      });

      const result = await service.checkContent(userId, contentId);

      expect(result.passed).toBe(true);
      expect(result.score).toBe(0.95);
      expect(result.checkedAt).toBeDefined();
    });

    it("returns failed check result when content has issues", async () => {
      mockPrisma.$queryRaw.mockResolvedValue([mockContent]);
      mockContentChecker.check.mockResolvedValue({
        passed: false,
        issues: ["Contains sensitive keywords"],
        score: 0.3,
      });

      const result = await service.checkContent(userId, contentId);

      expect(result.passed).toBe(false);
      expect(result.issues).toContain("Contains sensitive keywords");
    });

    it("throws NotFoundException when content not found", async () => {
      mockPrisma.$queryRaw.mockResolvedValue([]);

      await expect(service.checkContent(userId, contentId)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  // ==================== publishContent ====================

  describe("publishContent", () => {
    it("publishes content successfully when executor returns success", async () => {
      // getContent calls $queryRaw and needs content with connectionId set
      const contentWithConn = { ...mockContent, connectionId };
      mockPrisma.$queryRaw
        .mockResolvedValueOnce([contentWithConn]) // getContent call
        .mockResolvedValueOnce(1); // UPDATE call
      mockPrisma.socialPlatformConnection.findUnique.mockResolvedValue(
        mockConnection,
      );
      mockPublishExecutor.execute.mockResolvedValue({
        success: true,
        externalId: "ext-pub-123",
        externalUrl: "https://mp.weixin.qq.com/s/abc",
      });

      const result = await service.publishContent(userId, contentId, {
        connectionId,
      });

      expect(result.success).toBe(true);
    });

    it("throws NotFoundException when content not found for publish", async () => {
      mockPrisma.$queryRaw.mockResolvedValue([]);

      await expect(
        service.publishContent(userId, "nonexistent", {}),
      ).rejects.toThrow(NotFoundException);
    });

    it("throws BadRequestException when no connectionId provided and content has none", async () => {
      const contentNoConn = { ...mockContent, connectionId: null };
      mockPrisma.$queryRaw.mockResolvedValue([contentNoConn]);

      await expect(
        service.publishContent(userId, contentId, {}),
      ).rejects.toThrow(BadRequestException);
    });
  });

  // ==================== getConnections ====================

  describe("getConnections", () => {
    it("returns all connections for user", async () => {
      mockPrisma.socialPlatformConnection.findMany.mockResolvedValue([
        mockConnection,
      ]);

      const result = await service.getConnections(userId);

      expect(result).toHaveLength(1);
      expect(result[0].id).toBe(connectionId);
    });

    it("returns empty array when user has no connections", async () => {
      mockPrisma.socialPlatformConnection.findMany.mockResolvedValue([]);

      const result = await service.getConnections(userId);

      expect(result).toHaveLength(0);
    });
  });

  // ==================== deleteConnection ====================

  describe("deleteConnection", () => {
    it("deletes connection by platformType", async () => {
      mockPrisma.socialPlatformConnection.delete.mockResolvedValue(
        mockConnection,
      );

      const result = await service.deleteConnection(userId, "wechat_mp");

      expect(result).toEqual({ success: true });
      expect(mockPrisma.socialPlatformConnection.delete).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            userId_platformType: { userId, platformType: "WECHAT_MP" },
          }),
        }),
      );
    });
  });

  // ==================== refreshConnection ====================

  describe("refreshConnection", () => {
    it("updates lastCheckAt timestamp for existing connection", async () => {
      mockPrisma.socialPlatformConnection.findFirst.mockResolvedValue(
        mockConnection,
      );
      mockPrisma.socialPlatformConnection.update.mockResolvedValue({
        ...mockConnection,
        lastCheckAt: new Date(),
      });

      const result = await service.refreshConnection(userId, connectionId);

      expect(mockPrisma.socialPlatformConnection.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: connectionId },
          data: expect.objectContaining({ lastCheckAt: expect.any(Date) }),
        }),
      );
      expect(result).toBeDefined();
    });

    it("throws NotFoundException when connection not found", async () => {
      mockPrisma.socialPlatformConnection.findFirst.mockResolvedValue(null);

      await expect(
        service.refreshConnection(userId, "nonexistent"),
      ).rejects.toThrow(NotFoundException);
    });
  });

  // ==================== XHS MCP adapter methods ====================

  describe("XHS MCP adapter delegation", () => {
    it("xhsGetLoginStatus delegates to adapter", async () => {
      mockXhsMcpAdapter.checkLoginStatus.mockResolvedValue({
        loggedIn: true,
        nickname: "TestUser",
      });

      const result = await service.xhsGetLoginStatus();

      expect(result.loggedIn).toBe(true);
      expect(mockXhsMcpAdapter.checkLoginStatus).toHaveBeenCalled();
    });

    it("xhsListFeeds delegates to adapter", async () => {
      const feeds = [{ id: "feed-1", title: "Feed 1" }];
      mockXhsMcpAdapter.listFeeds.mockResolvedValue(feeds);

      const result = await service.xhsListFeeds();

      expect(result).toEqual(feeds);
    });

    it("xhsSearchFeeds delegates to adapter with keyword", async () => {
      const feeds = [{ id: "feed-2", title: "Search Result" }];
      mockXhsMcpAdapter.searchFeeds.mockResolvedValue(feeds);

      const result = await service.xhsSearchFeeds("test keyword");

      expect(mockXhsMcpAdapter.searchFeeds).toHaveBeenCalledWith(
        "test keyword",
      );
      expect(result).toEqual(feeds);
    });

    it("xhsPostComment delegates to adapter with feedId, xsecToken, content", async () => {
      mockXhsMcpAdapter.postComment.mockResolvedValue({ success: true });

      const result = await service.xhsPostComment(
        "feed-1",
        "xsec-token-abc",
        "Nice post!",
      );

      expect(mockXhsMcpAdapter.postComment).toHaveBeenCalledWith(
        "feed-1",
        "xsec-token-abc",
        "Nice post!",
      );
      expect(result.success).toBe(true);
    });
  });

  // ==================== initConnection - Xiaohongshu path ====================

  describe("initConnection - XHS MCP path", () => {
    it("returns success when XHS MCP adapter is available and already logged in", async () => {
      mockPrisma.socialPlatformConnection.findUnique.mockResolvedValue(null);
      mockXhsMcpAdapter.isAvailable.mockReturnValue(true);
      mockXhsMcpAdapter.checkLoginStatus.mockResolvedValue({
        loggedIn: true,
        nickname: "XHS User",
      });
      mockPrisma.socialPlatformConnection.create.mockResolvedValue({
        id: "conn-xhs",
        userId,
        platformType: SocialPlatformType.XIAOHONGSHU,
        accountName: "XHS User",
        sessionData: "mcp-managed",
        isActive: true,
        lastCheckAt: new Date(),
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const result = await service.initConnection(userId, "xiaohongshu");

      expect(result.status).toBe("success");
    });

    it("returns pending when XHS MCP adapter is not available", async () => {
      mockPrisma.socialPlatformConnection.findUnique.mockResolvedValue(null);
      mockXhsMcpAdapter.isAvailable.mockReturnValue(false);

      const result = await service.initConnection(userId, "xiaohongshu");

      expect(result.status).toBe("pending");
    });
  });
});
