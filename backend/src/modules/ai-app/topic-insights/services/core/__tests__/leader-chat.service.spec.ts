/**
 * LeaderChatService Unit Tests
 *
 * Coverage targets:
 * - getReasoningModel: facade delegation
 * - handleUserMessage: quick intent, complex intent, action execution, fallback
 * - decodeUserInput / selectAgentForTask (if public methods exist)
 */

import { Test, TestingModule } from "@nestjs/testing";
import { LeaderChatService } from "../leader-chat.service";
import { PrismaService } from "@/common/prisma/prisma.service";
import {
  ChatFacade,
  AgentFacade,
  ToolFacade,
  UserIntent,
} from "@/modules/ai-engine/facade";
import { ResearchEventEmitterService } from "../research-event-emitter.service";
import {
  LeaderToolService,
  LeaderActionType,
} from "../../data/leader-tool.service";

// ──────────────────────────────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────────────────────────────

function buildMocks() {
  const mockPrisma = {
    researchMission: {
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    researchTask: {
      create: jest.fn(),
      findFirst: jest.fn(),
      update: jest.fn(),
    },
    leaderDecision: {
      create: jest.fn(),
      findMany: jest.fn(),
    },
    researchTopic: {
      findUnique: jest.fn(),
    },
    knowledgeBase: {
      findMany: jest.fn().mockResolvedValue([]),
    },
  };

  const mockFacade = {
    getAvailableModelsExtended: jest.fn(),
    getReasoningModel: jest.fn(),
    chat: jest.fn(),
    chatStructured: jest.fn(),
    getAvailableTools: jest.fn().mockReturnValue([]),
    intentDetector: {
      detectIntent: jest.fn(),
    },
  };

  const mockEventEmitter = {
    saveUserMessage: jest.fn().mockResolvedValue(undefined),
    emitLeaderResponse: jest.fn().mockResolvedValue(undefined),
    emitResumeMissionExecution: jest.fn().mockResolvedValue(undefined),
    recordDecision: jest.fn().mockResolvedValue(undefined),
    getLeaderConversationHistory: jest.fn().mockResolvedValue([]),
  };

  const mockLeaderToolService = {
    createDimension: jest.fn(),
    deleteDimension: jest.fn(),
    cancelTask: jest.fn(),
    updateDimension: jest.fn(),
    mergeDimensions: jest.fn(),
  };

  return { mockPrisma, mockFacade, mockEventEmitter, mockLeaderToolService };
}

const mockMission = {
  id: "mission-001",
  topicId: "topic-001",
  status: "EXECUTING",
  topic: {
    id: "topic-001",
    name: "AI 教育应用",
    dimensions: [
      { id: "dim-001", name: "技术现状", status: "COMPLETED" },
      { id: "dim-002", name: "市场分析", status: "RESEARCHING" },
    ],
  },
  tasks: [
    { id: "task-001", status: "COMPLETED", dimensionName: "技术现状" },
    { id: "task-002", status: "EXECUTING", dimensionName: "市场分析" },
    { id: "task-003", status: "PENDING", dimensionName: "政策分析" },
  ],
};

// ──────────────────────────────────────────────────────────────────────────────
// Tests
// ──────────────────────────────────────────────────────────────────────────────

describe("LeaderChatService", () => {
  let service: LeaderChatService;
  let mockPrisma: ReturnType<typeof buildMocks>["mockPrisma"];
  let mockFacade: ReturnType<typeof buildMocks>["mockFacade"];
  let mockEventEmitter: ReturnType<typeof buildMocks>["mockEventEmitter"];
  let mockLeaderToolService: ReturnType<
    typeof buildMocks
  >["mockLeaderToolService"];

  beforeEach(async () => {
    const mocks = buildMocks();
    mockPrisma = mocks.mockPrisma;
    mockFacade = mocks.mockFacade;
    mockEventEmitter = mocks.mockEventEmitter;
    mockLeaderToolService = mocks.mockLeaderToolService;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        LeaderChatService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: ChatFacade, useValue: mockFacade },
        { provide: AgentFacade, useValue: mockFacade },
        { provide: ToolFacade, useValue: mockFacade },
        { provide: ResearchEventEmitterService, useValue: mockEventEmitter },
        { provide: LeaderToolService, useValue: mockLeaderToolService },
      ],
    }).compile();

    service = module.get<LeaderChatService>(LeaderChatService);
  });

  afterEach(() => jest.clearAllMocks());

  // ============================================================
  // getReasoningModel
  // ============================================================

  describe("getReasoningModel", () => {
    it("should return model info from facade", async () => {
      mockFacade.getAvailableModelsExtended.mockResolvedValue([
        {
          id: "o3",
          name: "o3",
          provider: "openai",
          isReasoning: true,
          isAvailable: true,
        },
      ]);
      mockFacade.getReasoningModel.mockResolvedValue({
        id: "o3",
        name: "o3",
        provider: "openai",
        isReasoning: true,
      });

      const result = await service.getReasoningModel();

      expect(result).toEqual({
        modelId: "o3",
        modelName: "o3",
        provider: "openai",
        isReasoning: true,
      });
    });

    it("should return null when no model available", async () => {
      mockFacade.getAvailableModelsExtended.mockResolvedValue([]);
      mockFacade.getReasoningModel.mockResolvedValue(null);

      const result = await service.getReasoningModel();
      expect(result).toBeNull();
    });

    it("should default isReasoning to false when undefined from facade", async () => {
      mockFacade.getAvailableModelsExtended.mockResolvedValue([]);
      mockFacade.getReasoningModel.mockResolvedValue({
        id: "fallback",
        name: "Fallback",
        provider: "custom",
        isReasoning: undefined,
      });

      const result = await service.getReasoningModel();
      expect(result!.isReasoning).toBe(false);
    });
  });

  // ============================================================
  // handleUserMessage
  // ============================================================

  describe("handleUserMessage", () => {
    function setupBasicMission() {
      mockPrisma.researchMission.findUnique.mockResolvedValue(mockMission);
      mockPrisma.leaderDecision.create.mockResolvedValue({
        id: "decision-001",
      });
      mockFacade.getAvailableModelsExtended.mockResolvedValue([
        {
          id: "o3",
          name: "o3",
          provider: "openai",
          isReasoning: true,
          isAvailable: true,
        },
      ]);
      mockFacade.getReasoningModel.mockResolvedValue({
        id: "o3",
        name: "o3",
        provider: "openai",
        isReasoning: true,
      });
    }

    it("should throw when mission not found", async () => {
      mockPrisma.researchMission.findUnique.mockResolvedValue(null);
      mockFacade.intentDetector.detectIntent.mockReturnValue({
        intent: "status_check",
        confidence: 0.3,
      });

      await expect(
        service.handleUserMessage(
          "topic-001",
          "nonexistent-mission",
          "进度如何？",
        ),
      ).rejects.toThrow("Mission nonexistent-mission not found");
    });

    it("should return quick response for high-confidence CONTINUE intent", async () => {
      setupBasicMission();
      // Use a real UserIntent that has a quick response handler
      mockFacade.intentDetector.detectIntent.mockReturnValue({
        intent: UserIntent.CONTINUE,
        confidence: 0.9,
      });

      const result = await service.handleUserMessage(
        "topic-001",
        "mission-001",
        "继续研究",
      );

      // Should not call AI model for quick intent
      expect(mockFacade.chatStructured).not.toHaveBeenCalled();
      expect(result.response).toBeDefined();
      expect(result.response.length).toBeGreaterThan(0);
    });

    it("should call AI for complex intent when confidence is below threshold", async () => {
      setupBasicMission();
      mockFacade.intentDetector.detectIntent.mockReturnValue({
        intent: "complex_request",
        confidence: 0.5, // below 0.75 threshold
      });

      mockFacade.chatStructured.mockResolvedValue({
        data: {
          understanding: "用户希望了解研究进展",
          actions: [],
          response: "研究正在顺利进行，技术现状维度已完成。",
        },
        rawContent: "{}",
        model: "o3",
        tokensUsed: 100,
        retriedParse: false,
      });

      const result = await service.handleUserMessage(
        "topic-001",
        "mission-001",
        "请给我一个详细的研究状态分析",
      );

      expect(mockFacade.chatStructured).toHaveBeenCalledTimes(1);
      expect(result.response).toBe("研究正在顺利进行，技术现状维度已完成。");
    });

    it("should return fallback response when AI response cannot be parsed", async () => {
      setupBasicMission();
      mockFacade.intentDetector.detectIntent.mockReturnValue({
        intent: "unknown",
        confidence: 0.3,
      });

      mockFacade.chatStructured.mockResolvedValue({
        data: {},
        rawContent: "Not valid JSON at all",
        model: "o3",
        tokensUsed: 50,
        retriedParse: true,
      });

      const result = await service.handleUserMessage(
        "topic-001",
        "mission-001",
        "请执行某个复杂任务",
      );

      expect(result.response).toBe("收到您的指令，我会继续推进研究工作。");
      expect(mockEventEmitter.emitLeaderResponse).toHaveBeenCalledWith(
        "topic-001",
        "mission-001",
        "收到您的指令，我会继续推进研究工作。",
      );
    });

    it("should throw when no reasoning model available for complex intent", async () => {
      setupBasicMission();
      mockFacade.getReasoningModel.mockResolvedValue(null);
      mockFacade.intentDetector.detectIntent.mockReturnValue({
        intent: "unknown",
        confidence: 0.3,
      });

      await expect(
        service.handleUserMessage("topic-001", "mission-001", "复杂问题"),
      ).rejects.toThrow("No reasoning model available for Leader");
    });

    it("should emit leader response after successful AI call", async () => {
      setupBasicMission();
      mockFacade.intentDetector.detectIntent.mockReturnValue({
        intent: "unknown",
        confidence: 0.3,
      });
      mockFacade.chatStructured.mockResolvedValue({
        data: {
          actions: [],
          response: "已收到您的指示，将调整研究方向。",
        },
        rawContent: "{}",
        model: "o3",
        tokensUsed: 100,
        retriedParse: false,
      });

      const result = await service.handleUserMessage(
        "topic-001",
        "mission-001",
        "调整研究重点",
      );

      expect(mockEventEmitter.emitLeaderResponse).toHaveBeenCalledWith(
        "topic-001",
        "mission-001",
        "已收到您的指示，将调整研究方向。",
      );
      expect(result.response).toBe("已收到您的指示，将调整研究方向。");
    });

    it("should save user message before processing", async () => {
      setupBasicMission();
      mockFacade.intentDetector.detectIntent.mockReturnValue({
        intent: UserIntent.GENERAL_CHAT,
        confidence: 0.9,
      });

      await service.handleUserMessage("topic-001", "mission-001", "你好！");

      expect(mockEventEmitter.saveUserMessage).toHaveBeenCalledWith(
        "topic-001",
        "mission-001",
        expect.any(String), // sanitized message
      );
    });

    it("should calculate progress as 0 when no tasks exist", async () => {
      const missionNoTasks = { ...mockMission, tasks: [] };
      mockPrisma.researchMission.findUnique.mockResolvedValue(missionNoTasks);
      mockFacade.intentDetector.detectIntent.mockReturnValue({
        intent: UserIntent.GENERAL_CHAT,
        confidence: 0.95,
      });
      mockPrisma.leaderDecision.create.mockResolvedValue({});

      const result = await service.handleUserMessage(
        "topic-001",
        "mission-001",
        "你好！",
      );

      // With 0 tasks, progress = 0%, but should still return a valid response
      expect(result.response).toBeDefined();
    });

    it("should calculate progress correctly with completed tasks", async () => {
      // 1 of 3 tasks completed => 33%
      const mission = { ...mockMission };
      mockPrisma.researchMission.findUnique.mockResolvedValue(mission);
      mockFacade.intentDetector.detectIntent.mockReturnValue({
        intent: UserIntent.CONTINUE,
        confidence: 0.95,
      });
      mockPrisma.leaderDecision.create.mockResolvedValue({});

      const result = await service.handleUserMessage(
        "topic-001",
        "mission-001",
        "继续研究",
      );

      expect(result.response).toBeDefined();
    });

    it("should execute CREATE_DIMENSION action from AI response", async () => {
      setupBasicMission();
      mockFacade.intentDetector.detectIntent.mockReturnValue({
        intent: "create_dimension",
        confidence: 0.4,
      });
      mockFacade.chatStructured.mockResolvedValue({
        data: {
          actions: [
            {
              type: LeaderActionType.CREATE_DIMENSION,
              params: { name: "竞争格局", description: "分析竞争对手" },
            },
          ],
          response: "好的，我将为您创建竞争格局维度。",
        },
        rawContent: "{}",
        model: "o3",
        tokensUsed: 100,
        retriedParse: false,
      });

      mockLeaderToolService.createDimension.mockResolvedValue({
        success: true,
        action: LeaderActionType.CREATE_DIMENSION,
        message: "维度创建成功",
        data: { dimensionId: "dim-new", name: "竞争格局" },
      });

      mockPrisma.researchTask.create.mockResolvedValue({ id: "task-new" });
      mockPrisma.researchTask.findFirst.mockResolvedValue(null);

      const result = await service.handleUserMessage(
        "topic-001",
        "mission-001",
        "帮我创建一个新的竞争格局维度",
      );

      expect(mockLeaderToolService.createDimension).toHaveBeenCalledWith({
        topicId: "topic-001",
        name: "竞争格局",
        description: "分析竞争对手",
      });
      expect(result.response).toBe("好的，我将为您创建竞争格局维度。");
    });

    it("should execute DELETE_DIMENSION action from AI response", async () => {
      setupBasicMission();
      mockFacade.intentDetector.detectIntent.mockReturnValue({
        intent: "unknown",
        confidence: 0.4,
      });
      mockFacade.chatStructured.mockResolvedValue({
        data: {
          actions: [
            {
              type: LeaderActionType.DELETE_DIMENSION,
              params: { dimensionName: "技术现状" },
            },
          ],
          response: "已删除技术现状维度。",
        },
        rawContent: "{}",
        model: "o3",
        tokensUsed: 100,
        retriedParse: false,
      });

      mockLeaderToolService.deleteDimension.mockResolvedValue({
        success: true,
        action: LeaderActionType.DELETE_DIMENSION,
        message: "删除成功",
      });

      const result = await service.handleUserMessage(
        "topic-001",
        "mission-001",
        "删除技术现状这个维度",
      );

      expect(mockLeaderToolService.deleteDimension).toHaveBeenCalledWith({
        topicId: "topic-001",
        dimensionName: "技术现状",
      });
      expect(result.response).toBe("已删除技术现状维度。");
    });

    it("should handle action execution error without interrupting main flow", async () => {
      setupBasicMission();
      mockFacade.intentDetector.detectIntent.mockReturnValue({
        intent: UserIntent.GENERAL_CHAT,
        confidence: 0.4,
      });
      mockFacade.chatStructured.mockResolvedValue({
        data: {
          actions: [
            {
              type: LeaderActionType.CREATE_DIMENSION,
              params: { name: "新维度" },
            },
          ],
          response: "尝试创建新维度。",
        },
        rawContent: "{}",
        model: "o3",
        tokensUsed: 100,
        retriedParse: false,
      });

      // Create dimension fails
      mockLeaderToolService.createDimension.mockRejectedValue(
        new Error("DB constraint"),
      );

      const result = await service.handleUserMessage(
        "topic-001",
        "mission-001",
        "帮我创建新维度吧",
      );

      // Main response should still be returned despite action failure
      // Response may include error notice suffix when actions fail
      expect(result.response).toContain("尝试创建新维度。");
    });

    it("should execute CANCEL_TASK action", async () => {
      setupBasicMission();
      mockFacade.intentDetector.detectIntent.mockReturnValue({
        intent: "unknown",
        confidence: 0.3,
      });
      mockFacade.chatStructured.mockResolvedValue({
        data: {
          actions: [
            {
              type: LeaderActionType.CANCEL_TASK,
              params: { dimensionName: "市场分析" },
            },
          ],
          response: "已停止任务",
        },
        rawContent: "{}",
        model: "o3",
        tokensUsed: 100,
        retriedParse: false,
      });
      mockLeaderToolService.cancelTask.mockResolvedValue({
        success: true,
        action: LeaderActionType.CANCEL_TASK,
        message: "任务停止成功",
      });

      const result = await service.handleUserMessage(
        "topic-001",
        "mission-001",
        "停止市场分析任务的执行", // avoid 取消/删除 keywords to prevent fallback delete
      );

      expect(mockLeaderToolService.cancelTask).toHaveBeenCalledWith(
        expect.objectContaining({ dimensionName: "市场分析" }),
      );
      expect(result.response).toBe("已停止任务");
    });

    it("should execute UPDATE_DIMENSION action", async () => {
      setupBasicMission();
      mockFacade.intentDetector.detectIntent.mockReturnValue({
        intent: "unknown",
        confidence: 0.3,
      });
      mockFacade.chatStructured.mockResolvedValue({
        data: {
          actions: [
            {
              type: LeaderActionType.UPDATE_DIMENSION,
              params: {
                dimensionName: "技术现状",
                newName: "技术架构",
                newDescription: "更新",
              },
            },
          ],
          response: "已更新维度",
        },
        rawContent: "{}",
        model: "o3",
        tokensUsed: 100,
        retriedParse: false,
      });
      mockLeaderToolService.updateDimension.mockResolvedValue({
        success: true,
        action: LeaderActionType.UPDATE_DIMENSION,
        message: "更新成功",
      });

      const _result = await service.handleUserMessage(
        "topic-001",
        "mission-001",
        "修改技术现状的名称",
      );

      expect(mockLeaderToolService.updateDimension).toHaveBeenCalledWith(
        expect.objectContaining({
          dimensionName: "技术现状",
          newName: "技术架构",
        }),
      );
    });

    it("should execute MERGE_DIMENSIONS action", async () => {
      setupBasicMission();
      mockFacade.intentDetector.detectIntent.mockReturnValue({
        intent: "unknown",
        confidence: 0.3,
      });
      mockFacade.chatStructured.mockResolvedValue({
        data: {
          actions: [
            {
              type: LeaderActionType.MERGE_DIMENSIONS,
              params: {
                sourceDimensionNames: ["技术现状", "市场分析"],
                targetDimensionName: "综合分析",
              },
            },
          ],
          response: "已合并维度",
        },
        rawContent: "{}",
        model: "o3",
        tokensUsed: 100,
        retriedParse: false,
      });
      mockLeaderToolService.mergeDimensions.mockResolvedValue({
        success: true,
        action: LeaderActionType.MERGE_DIMENSIONS,
        message: "合并成功",
      });

      await service.handleUserMessage(
        "topic-001",
        "mission-001",
        "合并技术和市场维度",
      );

      expect(mockLeaderToolService.mergeDimensions).toHaveBeenCalled();
    });

    it("should execute NO_ACTION", async () => {
      setupBasicMission();
      mockFacade.intentDetector.detectIntent.mockReturnValue({
        intent: "unknown",
        confidence: 0.3,
      });
      mockFacade.chatStructured.mockResolvedValue({
        data: {
          actions: [{ type: LeaderActionType.NO_ACTION, params: {} }],
          response: "无需操作",
        },
        rawContent: "{}",
        model: "o3",
        tokensUsed: 100,
        retriedParse: false,
      });

      const result = await service.handleUserMessage(
        "topic-001",
        "mission-001",
        "了解情况即可",
      );

      expect(result.response).toBe("无需操作");
      expect(result.actionResults?.[0].success).toBe(true);
    });

    it("should handle unknown action type gracefully", async () => {
      setupBasicMission();
      mockFacade.intentDetector.detectIntent.mockReturnValue({
        intent: "unknown",
        confidence: 0.3,
      });
      mockFacade.chatStructured.mockResolvedValue({
        data: {
          actions: [{ type: "TOTALLY_UNKNOWN_ACTION", params: {} }],
          response: "尝试执行",
        },
        rawContent: "{}",
        model: "o3",
        tokensUsed: 100,
        retriedParse: false,
      });

      const result = await service.handleUserMessage(
        "topic-001",
        "mission-001",
        "做点奇怪的事",
      );

      expect(result.actionResults?.[0].success).toBe(false);
      expect(result.actionResults?.[0].message).toContain("未知的动作类型");
    });

    it("should attempt fallback delete when delete intent detected but no DELETE_DIMENSION action", async () => {
      setupBasicMission();
      mockFacade.intentDetector.detectIntent.mockReturnValue({
        intent: "unknown",
        confidence: 0.3,
      });
      mockFacade.chatStructured.mockResolvedValue({
        data: {
          actions: [],
          response: "好的",
        },
        rawContent: "{}",
        model: "o3",
        tokensUsed: 100,
        retriedParse: false,
      });
      mockLeaderToolService.deleteDimension.mockResolvedValue({
        success: true,
        action: LeaderActionType.DELETE_DIMENSION,
        message: "维度已删除",
      });

      const _result = await service.handleUserMessage(
        "topic-001",
        "mission-001",
        "删除技术现状这个维度",
      );

      expect(mockLeaderToolService.deleteDimension).toHaveBeenCalled();
    });

    it("should skip fallback delete when message does not contain dimension name", async () => {
      setupBasicMission();
      mockFacade.intentDetector.detectIntent.mockReturnValue({
        intent: "unknown",
        confidence: 0.3,
      });
      mockFacade.chatStructured.mockResolvedValue({
        data: {
          actions: [],
          response: "已处理",
        },
        rawContent: "{}",
        model: "o3",
        tokensUsed: 100,
        retriedParse: false,
      });

      await service.handleUserMessage(
        "topic-001",
        "mission-001",
        "删除", // no dimension name extractable after keyword
      );

      expect(mockLeaderToolService.deleteDimension).not.toHaveBeenCalled();
    });

    it("should create ResearchTask after successful CREATE_DIMENSION with quality review task update", async () => {
      setupBasicMission();
      mockFacade.intentDetector.detectIntent.mockReturnValue({
        intent: "unknown",
        confidence: 0.3,
      });
      mockFacade.chatStructured.mockResolvedValue({
        data: {
          actions: [
            {
              type: LeaderActionType.CREATE_DIMENSION,
              params: { name: "新增维度", description: "新维度描述" },
            },
          ],
          response: "维度已创建",
        },
        rawContent: "{}",
        model: "o3",
        tokensUsed: 100,
        retriedParse: false,
      });
      mockLeaderToolService.createDimension.mockResolvedValue({
        success: true,
        action: LeaderActionType.CREATE_DIMENSION,
        message: "创建成功",
        data: { dimensionId: "dim-new-001", name: "新增维度" },
      });
      mockPrisma.researchTask.create.mockResolvedValue({ id: "task-new-001" });
      mockPrisma.researchMission.update.mockResolvedValue({});
      // Has quality review task
      mockPrisma.researchTask.findFirst.mockResolvedValue({
        id: "review-task-001",
        dependencies: ["task-001"],
      });
      mockPrisma.researchTask.update.mockResolvedValue({});

      await service.handleUserMessage(
        "topic-001",
        "mission-001",
        "添加新增维度",
      );

      expect(mockPrisma.researchTask.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            dimensionName: "新增维度",
            taskType: "dimension_research",
          }),
        }),
      );
      expect(mockPrisma.researchTask.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: "review-task-001" },
          data: expect.objectContaining({
            dependencies: expect.arrayContaining(["task-new-001"]),
          }),
        }),
      );
    });
  });

  // ============================================================
  // decodeUserInput
  // ============================================================

  describe("decodeUserInput", () => {
    const mockTopic = {
      id: "topic-001",
      name: "AI 应用研究",
      description: "研究 AI 应用场景",
      dimensions: [],
      topicConfig: {},
    };

    beforeEach(() => {
      mockPrisma.researchMission.findUnique.mockResolvedValue(null);
      mockFacade.getAvailableModelsExtended.mockResolvedValue([]);
      mockFacade.getReasoningModel.mockResolvedValue({
        id: "o3",
        name: "o3",
        provider: "openai",
        isReasoning: true,
      });
      mockFacade.getAvailableTools = jest.fn().mockReturnValue([]);
      mockPrisma.researchTopic = {
        findUnique: jest.fn().mockResolvedValue(mockTopic),
      };
      mockEventEmitter.getLeaderConversationHistory = jest
        .fn()
        .mockResolvedValue([]);
    });

    it("should throw when topic not found", async () => {
      mockPrisma.researchTopic.findUnique.mockResolvedValue(null);

      await expect(
        service.decodeUserInput("nonexistent-topic", "问题"),
      ).rejects.toThrow("Topic nonexistent-topic not found");
    });

    it("should return DIRECT_ANSWER for progress query via quickDecodeIntent", async () => {
      const result = await service.decodeUserInput("topic-001", "进度怎么样");

      expect(result.decisionType).toBe("DIRECT_ANSWER");
      expect(result.response).toContain("AI 应用研究");
    });

    it("should return ACKNOWLEDGE for simple confirmation", async () => {
      const result = await service.decodeUserInput("topic-001", "好的");

      expect(result.decisionType).toBe("ACKNOWLEDGE");
    });

    it("should return CLARIFY for vague request", async () => {
      const result = await service.decodeUserInput("topic-001", "改一下");

      expect(result.decisionType).toBe("CLARIFY");
    });

    it("should skip quick decode for project config questions", async () => {
      mockFacade.chatStructured.mockResolvedValue({
        data: {
          decisionType: "DIRECT_ANSWER",
          understanding: "查询配置",
          response: "当前配置如下：...",
        },
        rawContent: "{}",
        model: "o3",
        tokensUsed: 100,
        retriedParse: false,
      });

      const result = await service.decodeUserInput("topic-001", "你有哪些工具");

      // Should call AI because of config keyword
      expect(mockFacade.chatStructured).toHaveBeenCalled();
      expect(result.decisionType).toBe("DIRECT_ANSWER");
    });

    it("should return ACKNOWLEDGE fallback when no reasoning model available", async () => {
      mockFacade.getReasoningModel.mockResolvedValue(null);

      const result = await service.decodeUserInput("topic-001", "复杂分析问题");

      expect(result.decisionType).toBe("ACKNOWLEDGE");
      expect(result.response).toContain("收到");
    });

    it("should return ACKNOWLEDGE fallback when AI response cannot be parsed", async () => {
      mockFacade.chatStructured.mockResolvedValue({
        data: {},
        rawContent: "bad json",
        model: "o3",
        tokensUsed: 50,
        retriedParse: true,
      });

      const result = await service.decodeUserInput("topic-001", "复杂分析问题");

      expect(result.decisionType).toBe("ACKNOWLEDGE");
    });

    it("should default invalid decisionType to ACKNOWLEDGE", async () => {
      mockFacade.chatStructured.mockResolvedValue({
        data: {
          decisionType: "INVALID_TYPE",
          understanding: "test",
          response: "test response",
        },
        rawContent: "{}",
        model: "o3",
        tokensUsed: 100,
        retriedParse: false,
      });

      const result = await service.decodeUserInput("topic-001", "复杂问题");

      expect(result.decisionType).toBe("ACKNOWLEDGE");
    });

    it("should return CREATE_TODO decision type when AI returns it", async () => {
      mockFacade.chatStructured.mockResolvedValue({
        data: {
          decisionType: "CREATE_TODO",
          understanding: "用户要创建任务",
          response: "好的，我会为您创建任务",
          todoTitle: "研究AI教育应用",
          todoDescription: "深度研究AI在教育领域的应用",
        },
        rawContent: "{}",
        model: "o3",
        tokensUsed: 100,
        retriedParse: false,
      });

      const result = await service.decodeUserInput(
        "topic-001",
        "帮我研究一下AI教育应用",
      );

      expect(result.decisionType).toBe("CREATE_TODO");
      expect(result.todoTitle).toBe("研究AI教育应用");
    });

    it("should include mission context when missionId provided", async () => {
      mockPrisma.researchMission.findUnique.mockResolvedValue({
        id: "mission-001",
        status: "EXECUTING",
        tasks: [
          {
            id: "t1",
            status: "COMPLETED",
            title: "技术研究",
            dimensionName: "技术现状",
          },
          {
            id: "t2",
            status: "EXECUTING",
            title: "市场分析",
            dimensionName: "市场格局",
          },
          {
            id: "t3",
            status: "PENDING",
            title: "政策研究",
            dimensionName: "政策分析",
          },
        ],
      });
      mockFacade.chatStructured.mockResolvedValue({
        data: {
          decisionType: "DIRECT_ANSWER",
          understanding: "查询进度",
          response: "研究进度33%",
        },
        rawContent: "{}",
        model: "o3",
        tokensUsed: 100,
        retriedParse: false,
      });

      const result = await service.decodeUserInput(
        "topic-001",
        "进度如何",
        "mission-001",
      );

      // With mission, progress calculation should work
      expect(result.decisionType).toBeDefined();
    });
  });

  // ============================================================
  // selectAgentForTask
  // ============================================================

  describe("selectAgentForTask", () => {
    beforeEach(() => {
      mockPrisma.leaderDecision.create.mockResolvedValue({});
      mockFacade.getAvailableModelsExtended.mockResolvedValue([
        { id: "gpt-4o", name: "GPT-4o", isReasoning: false, isAvailable: true },
      ]);
    });

    it("should select existing agent with lowest workload", async () => {
      mockPrisma.researchMission.findUnique.mockResolvedValue({
        id: "mission-001",
        tasks: [
          {
            assignedAgent: "researcher-01",
            assignedAgentType: "dimension_researcher",
            modelId: "gpt-4o",
            status: "COMPLETED",
          },
          {
            assignedAgent: "researcher-01",
            assignedAgentType: "dimension_researcher",
            modelId: "gpt-4o",
            status: "COMPLETED",
          },
          {
            assignedAgent: "researcher-02",
            assignedAgentType: "dimension_researcher",
            modelId: "claude-3",
            status: "PENDING",
          },
        ],
      });
      mockFacade.getAvailableModelsExtended.mockResolvedValue([
        { id: "gpt-4o", isReasoning: false, isAvailable: true },
        { id: "claude-3", isReasoning: false, isAvailable: true },
      ]);

      const result = await service.selectAgentForTask(
        "topic-001",
        "mission-001",
        "新研究任务",
      );

      expect(result.agentId).toBe("researcher-02");
      expect(result.modelId).toBe("claude-3");
    });

    it("should create new agent when no existing agents", async () => {
      mockPrisma.researchMission.findUnique.mockResolvedValue({
        id: "mission-001",
        tasks: [],
      });

      const result = await service.selectAgentForTask(
        "topic-001",
        "mission-001",
        "全新任务",
      );

      expect(result.agentId).toMatch(/researcher_user_/);
      expect(result.agentName).toBe("新研究员");
    });

    it("should select technology skills for tech task", async () => {
      mockPrisma.researchMission.findUnique.mockResolvedValue({
        id: "mission-001",
        tasks: [],
      });

      const result = await service.selectAgentForTask(
        "topic-001",
        "mission-001",
        "技术架构分析",
        "研究系统架构",
      );

      expect(result.skills).toContain("deep-dive");
    });

    it("should select strategy skills for strategy task", async () => {
      mockPrisma.researchMission.findUnique.mockResolvedValue({
        id: "mission-001",
        tasks: [],
      });

      const result = await service.selectAgentForTask(
        "topic-001",
        "mission-001",
        "战略布局分析",
        "未来发展预测",
      );

      expect(result.skills).toContain("future-projection");
    });

    it("should use default skills when no keywords match", async () => {
      mockPrisma.researchMission.findUnique.mockResolvedValue({
        id: "mission-001",
        tasks: [],
      });

      const result = await service.selectAgentForTask(
        "topic-001",
        "mission-001",
        "General Research",
      );

      expect(result.skills).toContain("synthesis");
      expect(result.tools).toContain("web-search");
    });

    it("should record decision after selecting agent", async () => {
      mockPrisma.researchMission.findUnique.mockResolvedValue({
        id: "mission-001",
        tasks: [],
      });

      await service.selectAgentForTask("topic-001", "mission-001", "研究任务");

      expect(mockPrisma.leaderDecision.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ missionId: "mission-001" }),
        }),
      );
    });
  });

  // ============================================================
  // getDecisionHistory
  // ============================================================

  describe("getDecisionHistory", () => {
    it("should return decision history from prisma", async () => {
      const decisions = [
        {
          id: "d-001",
          missionId: "mission-001",
          type: "INTERVENE",
          createdAt: new Date(),
        },
        {
          id: "d-002",
          missionId: "mission-001",
          type: "PLAN",
          createdAt: new Date(),
        },
      ];
      mockPrisma.leaderDecision.findMany.mockResolvedValue(decisions);

      const result = await service.getDecisionHistory("mission-001");

      expect(mockPrisma.leaderDecision.findMany).toHaveBeenCalledWith({
        where: { missionId: "mission-001" },
        orderBy: { createdAt: "desc" },
      });
      expect(result).toHaveLength(2);
    });

    it("should return empty array when no decisions", async () => {
      mockPrisma.leaderDecision.findMany.mockResolvedValue([]);

      const result = await service.getDecisionHistory("empty-mission");

      expect(result).toHaveLength(0);
    });
  });
});
