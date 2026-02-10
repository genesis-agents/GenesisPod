/**
 * AiAskService 单元测试
 *
 * 测试 AI 问答核心服务：
 * - createSession() 创建会话
 * - getSessions() 获取会话列表（分页）
 * - getSession() 获取单个会话
 * - updateSession() 更新会话
 * - deleteSession() 删除会话
 * - sendMessage() 发送消息（含 AI 响应、RAG、积分）
 * - getMessages() 获取消息列表
 * - searchSessions() 搜索会话
 * - getAvailableTools() 可用工具列表
 */

import { Test, TestingModule } from "@nestjs/testing";
import { Logger, NotFoundException } from "@nestjs/common";
import { AiAskService } from "../ai-ask.service";
import { PrismaService } from "../../../../common/prisma/prisma.service";
import { AIEngineFacade } from "../../../ai-engine/facade";

describe("AiAskService", () => {
  let service: AiAskService;
  let mockPrisma: any;
  let mockFacade: any;

  const userId = "user-123";
  const sessionId = "session-456";

  const mockSession = {
    id: sessionId,
    userId,
    title: "Test Chat",
    modelId: "gpt-4o",
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const mockMessage = {
    id: "msg-1",
    sessionId,
    role: "user",
    content: "Hello",
    createdAt: new Date(),
  };

  beforeEach(async () => {
    mockPrisma = {
      askSession: {
        create: jest.fn().mockResolvedValue(mockSession),
        findMany: jest.fn().mockResolvedValue([mockSession]),
        findFirst: jest.fn().mockResolvedValue(mockSession),
        count: jest.fn().mockResolvedValue(1),
        update: jest.fn().mockResolvedValue({ ...mockSession, title: "Updated" }),
        delete: jest.fn().mockResolvedValue(mockSession),
      },
      askMessage: {
        create: jest.fn().mockResolvedValue(mockMessage),
        findMany: jest.fn().mockResolvedValue([mockMessage]),
        findFirst: jest.fn(),
        count: jest.fn().mockResolvedValue(1),
        update: jest.fn(),
        delete: jest.fn(),
        deleteMany: jest.fn(),
      },
      aIModel: {
        findFirst: jest.fn().mockResolvedValue({
          id: "db-1",
          modelId: "gpt-4o",
          displayName: "GPT-4o",
          provider: "openai",
          maxTokens: 4096,
          apiKey: "sk-xxx",
          isReasoning: false,
        }),
      },
    };

    mockFacade = {
      chat: jest.fn().mockResolvedValue({
        content: "Hello! How can I help?",
        model: "gpt-4o",
        tokensUsed: 50,
        isError: false,
      }),
      chatStream: jest.fn(),
      selectModel: jest.fn(),
      getAvailableModels: jest.fn().mockResolvedValue([]),
      getModelById: jest.fn().mockResolvedValue({
        id: "db-1",
        modelId: "gpt-4o",
        displayName: "GPT-4o",
        provider: "openai",
        apiKey: "sk-xxx",
      }),
      buildContext: jest.fn().mockResolvedValue(""),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AiAskService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: AIEngineFacade, useValue: mockFacade },
        // All other dependencies are @Optional
      ],
    }).compile();

    service = module.get<AiAskService>(AiAskService);

    jest.spyOn(Logger.prototype, "log").mockImplementation();
    jest.spyOn(Logger.prototype, "warn").mockImplementation();
    jest.spyOn(Logger.prototype, "error").mockImplementation();
    jest.spyOn(Logger.prototype, "debug").mockImplementation();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  // =========================================================================
  // createSession
  // =========================================================================

  describe("createSession", () => {
    it("should create a new session", async () => {
      const result = await service.createSession(userId, {
        title: "My Chat",
      });

      expect(result).toBeDefined();
      expect(mockPrisma.askSession.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          userId,
          title: "My Chat",
        }),
      });
    });

    it("should default title to 'New Chat' when not provided", async () => {
      await service.createSession(userId, {} as any);

      expect(mockPrisma.askSession.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          title: "New Chat",
        }),
      });
    });

    it("should pass modelId when provided", async () => {
      await service.createSession(userId, {
        title: "Test",
        modelId: "claude-3-opus",
      });

      expect(mockPrisma.askSession.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          modelId: "claude-3-opus",
        }),
      });
    });
  });

  // =========================================================================
  // getSessions
  // =========================================================================

  describe("getSessions", () => {
    it("should return paginated sessions", async () => {
      const result = await service.getSessions(userId, 1, 50);

      expect(result).toBeDefined();
      expect(mockPrisma.askSession.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { userId },
          orderBy: { updatedAt: "desc" },
          skip: 0,
          take: 50,
        }),
      );
    });

    it("should calculate correct skip for pagination", async () => {
      await service.getSessions(userId, 3, 20);

      expect(mockPrisma.askSession.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          skip: 40, // (3-1) * 20
          take: 20,
        }),
      );
    });
  });

  // =========================================================================
  // getSession
  // =========================================================================

  describe("getSession", () => {
    it("should return session with messages", async () => {
      const result = await service.getSession(sessionId, userId);

      expect(result).toBeDefined();
      expect(mockPrisma.askSession.findFirst).toHaveBeenCalledWith({
        where: { id: sessionId, userId },
      });
    });

    it("should throw NotFoundException when session not found", async () => {
      mockPrisma.askSession.findFirst.mockResolvedValue(null);

      await expect(
        service.getSession("nonexistent", userId),
      ).rejects.toThrow(NotFoundException);
    });

    it("should not return sessions belonging to other users", async () => {
      mockPrisma.askSession.findFirst.mockResolvedValue(null);

      await expect(
        service.getSession(sessionId, "other-user"),
      ).rejects.toThrow(NotFoundException);
    });
  });

  // =========================================================================
  // updateSession
  // =========================================================================

  describe("updateSession", () => {
    it("should update session title", async () => {
      const result = await service.updateSession(sessionId, userId, {
        title: "Updated Title",
      });

      expect(result).toBeDefined();
      expect(mockPrisma.askSession.update).toHaveBeenCalledWith({
        where: { id: sessionId },
        data: { title: "Updated Title" },
      });
    });

    it("should throw NotFoundException when session not found", async () => {
      mockPrisma.askSession.findFirst.mockResolvedValue(null);

      await expect(
        service.updateSession("nonexistent", userId, { title: "X" }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  // =========================================================================
  // deleteSession
  // =========================================================================

  describe("deleteSession", () => {
    it("should delete session", async () => {
      await service.deleteSession(sessionId, userId);

      expect(mockPrisma.askSession.delete).toHaveBeenCalledWith({
        where: { id: sessionId },
      });
    });

    it("should throw NotFoundException when session not found", async () => {
      mockPrisma.askSession.findFirst.mockResolvedValue(null);

      await expect(
        service.deleteSession("nonexistent", userId),
      ).rejects.toThrow(NotFoundException);
    });
  });

  // =========================================================================
  // sendMessage
  // =========================================================================

  describe("sendMessage", () => {
    it("should throw NotFoundException for invalid session", async () => {
      mockPrisma.askSession.findFirst.mockResolvedValue(null);

      await expect(
        service.sendMessage("nonexistent", userId, {
          content: "Hello",
        } as any),
      ).rejects.toThrow(NotFoundException);
    });

    it("should verify session belongs to user", async () => {
      mockPrisma.askSession.findFirst.mockResolvedValue(null);

      await expect(
        service.sendMessage(sessionId, "wrong-user", {
          content: "Hello",
        } as any),
      ).rejects.toThrow(NotFoundException);
    });
  });

  // =========================================================================
  // getMessages
  // =========================================================================

  describe("getMessages", () => {
    it("should return messages for a session", async () => {
      const result = await service.getMessages(sessionId, userId);

      expect(result).toBeDefined();
      expect(mockPrisma.askSession.findFirst).toHaveBeenCalledWith({
        where: { id: sessionId, userId },
      });
    });

    it("should throw NotFoundException for invalid session", async () => {
      mockPrisma.askSession.findFirst.mockResolvedValue(null);

      await expect(
        service.getMessages("nonexistent", userId),
      ).rejects.toThrow(NotFoundException);
    });
  });

  // =========================================================================
  // searchSessions
  // =========================================================================

  describe("searchSessions", () => {
    it("should search sessions by title or summary", async () => {
      await service.searchSessions(userId, "test query", 20);

      expect(mockPrisma.askSession.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            userId,
            OR: [
              { title: { contains: "test query", mode: "insensitive" } },
              { summary: { contains: "test query", mode: "insensitive" } },
            ],
          },
          take: 20,
        }),
      );
    });
  });

  // =========================================================================
  // getAvailableTools
  // =========================================================================

  describe("getAvailableTools", () => {
    it("should return empty array when tool capability not available", () => {
      // Without toolRegistry, tools are not available
      const result = service.getAvailableTools();

      expect(result).toEqual([]);
    });
  });
});
