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
    _count: { messages: 0 },
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
        update: jest
          .fn()
          .mockResolvedValue({ ...mockSession, title: "Updated" }),
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
      isToolAvailable: jest.fn().mockReturnValue(false),
      isToolExecutionAvailable: jest.fn().mockReturnValue(false),
      chatWithToolsStream: jest.fn(),
      sessionMemoryGet: jest.fn().mockResolvedValue(undefined),
      sessionMemorySet: jest.fn().mockResolvedValue(undefined),
      sessionMemoryClear: jest.fn().mockResolvedValue(undefined),
      listModuleCapabilities: jest.fn().mockReturnValue([
        {
          module: "research",
          description: "Deep research",
          phase: 1,
          label: "启动深度研究",
          iconName: "Search",
          urlTemplate: "/ai-research?q={input}",
        },
        {
          module: "image",
          description: "Image generation",
          phase: 2,
          label: "生成图片",
          iconName: "Image",
          urlTemplate: "/ai-image?q={input}",
        },
        {
          module: "writing",
          description: "Long-form writing",
          phase: 2,
          label: "开始写作",
          iconName: "PenLine",
          urlTemplate: "/ai-writing?q={input}",
        },
        {
          module: "ask",
          description: "Quick Q&A",
          phase: 1,
          label: "智能问答",
          iconName: "MessageSquare",
          urlTemplate: "/ai-ask?q={input}",
        },
      ]),
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

      await expect(service.getSession("nonexistent", userId)).rejects.toThrow(
        NotFoundException,
      );
    });

    it("should not return sessions belonging to other users", async () => {
      mockPrisma.askSession.findFirst.mockResolvedValue(null);

      await expect(service.getSession(sessionId, "other-user")).rejects.toThrow(
        NotFoundException,
      );
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

      await expect(service.getMessages("nonexistent", userId)).rejects.toThrow(
        NotFoundException,
      );
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

  // =========================================================================
  // detectIntent (private — tested via direct instance access)
  // =========================================================================

  describe("detectIntent", () => {
    const mockRouter = { route: jest.fn() };

    beforeEach(() => {
      (service as any).intentRouterService = mockRouter;
    });

    afterEach(() => {
      mockRouter.route.mockReset();
    });

    it("returns empty array when intentRouterService is unavailable", async () => {
      (service as any).intentRouterService = undefined;
      const result = await (service as any).detectIntent(
        "hello",
        "user-1",
        "sess-1",
      );
      expect(result).toEqual([]);
    });

    it("returns empty array when confidence is below CONFIRMATION_THRESHOLD (0.6)", async () => {
      mockRouter.route.mockResolvedValue({
        plan: {
          steps: [
            {
              module: "research",
              action: "研究",
              input: "AI",
              dependsOn: [],
              priority: 1,
            },
          ],
          confidence: 0.55,
          executionMode: "sequential",
        },
        requiresConfirmation: true,
      });

      const result = await (service as any).detectIntent(
        "研究 AI",
        "user-1",
        "sess-1",
      );
      expect(result).toEqual([]);
    });

    it("returns action cards when confidence >= CONFIRMATION_THRESHOLD", async () => {
      mockRouter.route.mockResolvedValue({
        plan: {
          steps: [
            {
              module: "research",
              action: "深度研究",
              input: "AI trends",
              dependsOn: [],
              priority: 1,
            },
          ],
          confidence: 0.8,
          executionMode: "sequential",
        },
        requiresConfirmation: false,
      });

      const result = await (service as any).detectIntent(
        "研究 AI 趋势",
        "user-1",
        "sess-1",
      );
      expect(result).toHaveLength(1);
      expect(result[0].module).toBe("research");
      expect(result[0].url).toContain("/ai-research");
    });

    it("returns action cards at exactly CONFIRMATION_THRESHOLD (boundary)", async () => {
      mockRouter.route.mockResolvedValue({
        plan: {
          steps: [
            {
              module: "image",
              action: "生成图片",
              input: "sunset",
              dependsOn: [],
              priority: 1,
            },
          ],
          confidence: 0.6, // exactly at threshold
          executionMode: "sequential",
        },
        requiresConfirmation: false,
      });

      const result = await (service as any).detectIntent(
        "画一张日落图片",
        "user-1",
        "sess-1",
      );
      expect(result).toHaveLength(1);
    });

    it("returns empty array and logs warn when route() throws", async () => {
      const warnSpy = jest
        .spyOn((service as any).logger, "warn")
        .mockImplementation();
      mockRouter.route.mockRejectedValue(new Error("LLM timeout"));

      const result = await (service as any).detectIntent(
        "hello",
        "user-1",
        "sess-1",
      );
      expect(result).toEqual([]);
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining("[detectIntent]"),
      );
    });
  });

  // =========================================================================
  // buildSuggestedActions (private — tested via direct instance access)
  // =========================================================================

  describe("buildSuggestedActions", () => {
    type StepLike = {
      id: string;
      module: string;
      action: string;
      input: string;
      dependsOn: string[];
      priority: number;
    };
    type PlanLike = { steps: StepLike[]; confidence: number };

    const makePlan = (modules: string[]): PlanLike => ({
      steps: modules.map((m, i) => ({
        id: `step-${i}`,
        module: m,
        action: "任务",
        input: "AI",
        dependsOn: [],
        priority: i + 1,
      })),
      confidence: 0.9,
    });

    it("filters out ask module", () => {
      const result = (service as any).buildSuggestedActions(
        "hello",
        makePlan(["ask", "research"]),
      );
      const modules = result.map((a: { module: string }) => a.module);
      expect(modules).not.toContain("ask");
      expect(modules).toContain("research");
    });

    it("deduplicates same module appearing multiple times", () => {
      const result = (service as any).buildSuggestedActions(
        "AI",
        makePlan(["research", "research", "image"]),
      );
      const modules = result.map((a: { module: string }) => a.module);
      expect(modules.filter((m: string) => m === "research")).toHaveLength(1);
    });

    it("caps output at 3 actions", () => {
      const result = (service as any).buildSuggestedActions(
        "test",
        makePlan(["research", "image", "writing", "research"]),
      );
      expect(result).toHaveLength(3);
    });

    it("replaces {input} placeholder with encoded step.input (LLM-extracted topic)", () => {
      // step.input is the LLM-extracted topic (e.g. "AI"), not the raw user message
      const result = (service as any).buildSuggestedActions(
        "请帮我分析一下 AI 趋势的走向",
        makePlan(["research"]), // makePlan sets step.input = "AI"
      );
      expect(result[0].url).toContain(encodeURIComponent("AI"));
      expect(result[0].url).not.toContain("{input}");
    });

    it("skips modules with missing or empty urlTemplate", () => {
      mockFacade.listModuleCapabilities.mockReturnValue([
        {
          module: "research",
          description: "Research",
          phase: 1,
          label: "研究",
          iconName: "Search",
          urlTemplate: "", // falsy — should be skipped
        },
        {
          module: "image",
          description: "Image",
          phase: 2,
          label: "图片",
          iconName: "Image",
          urlTemplate: "/ai-image?q={input}",
        },
      ]);
      const result = (service as any).buildSuggestedActions(
        "test",
        makePlan(["research", "image"]),
      );
      const modules = result.map((a: { module: string }) => a.module);
      expect(modules).not.toContain("research");
      expect(modules).toContain("image");
    });

    it("skips unknown modules not present in capability map", () => {
      const result = (service as any).buildSuggestedActions(
        "test",
        makePlan(["unknownModule", "research"]),
      );
      const modules = result.map((a: { module: string }) => a.module);
      expect(modules).not.toContain("unknownModule");
      expect(modules).toContain("research");
    });
  });
});
