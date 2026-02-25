/**
 * ResearchLeaderService Unit Tests
 *
 * Coverage targets:
 * - getReasoningModel: delegates to facade, handles null
 * - planResearch: topic not found, AI call, post-processing agent assignments
 * - reviewTaskResult: approved/needs_revision, parse failure fallback
 */

import { Test, TestingModule } from "@nestjs/testing";
import { ResearchLeaderService } from "../research-leader.service";
import { PrismaService } from "@/common/prisma/prisma.service";
import { AIEngineFacade } from "@/modules/ai-engine/facade";
import { ResearchEventEmitterService } from "../research-event-emitter.service";
import { LeaderToolService, LeaderActionType } from "../../data/leader-tool.service";

// ──────────────────────────────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────────────────────────────

function buildMocks() {
  const mockPrisma = {
    researchTopic: {
      findUnique: jest.fn(),
    },
    leaderDecision: {
      create: jest.fn(),
    },
    researchTask: {
      create: jest.fn(),
      findFirst: jest.fn(),
      update: jest.fn(),
    },
    researchMission: {
      update: jest.fn(),
    },
  };

  const mockFacade = {
    getAvailableModelsExtended: jest.fn(),
    getReasoningModel: jest.fn(),
    chat: jest.fn(),
    intentDetector: {
      detectIntent: jest.fn(),
    },
  };

  const mockEventEmitter = {
    saveUserMessage: jest.fn().mockResolvedValue(undefined),
    emitLeaderResponse: jest.fn().mockResolvedValue(undefined),
    emitResumeMissionExecution: jest.fn().mockResolvedValue(undefined),
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

const mockTopicWithDimensions = {
  id: "topic-001",
  name: "5G 网络发展",
  type: "technology",
  description: "5G 技术趋势",
  language: "zh",
  dimensions: [
    {
      id: "dim-001",
      name: "技术架构",
      description: "5G 技术架构分析",
      status: "PENDING",
      searchQueries: ["5G architecture"],
    },
  ],
};

const mockLeaderPlanJson = {
  dimensions: [
    { id: "dim-001", name: "技术架构", priority: "high", rationale: "核心维度" },
    { id: "dim-002", name: "市场应用", priority: "medium", rationale: "应用层面" },
  ],
  agentAssignments: [
    {
      agentId: "agent-001",
      agentName: "研究员-技术",
      agentType: "dimension_researcher",
      assignedDimensions: ["dim-001"],
      modelId: "gpt-4o",
      skills: ["deep_dive", "synthesis"],
      tools: ["web-search"],
      assignmentReason: {
        agentReason: "专注技术领域",
        modelReason: "擅长技术分析",
      },
    },
  ],
  strategy: "parallel",
  estimatedTime: "30 minutes",
};

// ──────────────────────────────────────────────────────────────────────────────
// Tests
// ──────────────────────────────────────────────────────────────────────────────

describe("ResearchLeaderService", () => {
  let service: ResearchLeaderService;
  let mockPrisma: ReturnType<typeof buildMocks>["mockPrisma"];
  let mockFacade: ReturnType<typeof buildMocks>["mockFacade"];
  let mockEventEmitter: ReturnType<typeof buildMocks>["mockEventEmitter"];
  let mockLeaderToolService: ReturnType<typeof buildMocks>["mockLeaderToolService"];

  beforeEach(async () => {
    const mocks = buildMocks();
    mockPrisma = mocks.mockPrisma;
    mockFacade = mocks.mockFacade;
    mockEventEmitter = mocks.mockEventEmitter;
    mockLeaderToolService = mocks.mockLeaderToolService;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ResearchLeaderService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: AIEngineFacade, useValue: mockFacade },
        { provide: ResearchEventEmitterService, useValue: mockEventEmitter },
        { provide: LeaderToolService, useValue: mockLeaderToolService },
      ],
    }).compile();

    service = module.get<ResearchLeaderService>(ResearchLeaderService);
  });

  afterEach(() => jest.clearAllMocks());

  // ============================================================
  // getReasoningModel
  // ============================================================

  describe("getReasoningModel", () => {
    it("should return model info when facade provides a reasoning model", async () => {
      mockFacade.getAvailableModelsExtended.mockResolvedValue([
        { id: "gpt-4o", name: "GPT-4o", provider: "openai", isReasoning: false, isAvailable: true },
        { id: "o3-mini", name: "o3-mini", provider: "openai", isReasoning: true, isAvailable: true },
      ]);
      mockFacade.getReasoningModel.mockResolvedValue({
        id: "o3-mini",
        name: "o3-mini",
        provider: "openai",
        isReasoning: true,
      });

      const result = await service.getReasoningModel();

      expect(result).toEqual({
        modelId: "o3-mini",
        modelName: "o3-mini",
        provider: "openai",
        isReasoning: true,
      });
    });

    it("should return null when facade returns null model", async () => {
      mockFacade.getAvailableModelsExtended.mockResolvedValue([]);
      mockFacade.getReasoningModel.mockResolvedValue(null);

      const result = await service.getReasoningModel();

      expect(result).toBeNull();
    });

    it("should return model with isReasoning false when no reasoning model available", async () => {
      mockFacade.getAvailableModelsExtended.mockResolvedValue([
        { id: "gpt-4o", name: "GPT-4o", provider: "openai", isReasoning: false, isAvailable: true },
      ]);
      mockFacade.getReasoningModel.mockResolvedValue({
        id: "gpt-4o",
        name: "GPT-4o",
        provider: "openai",
        isReasoning: false,
      });

      const result = await service.getReasoningModel();

      expect(result).not.toBeNull();
      expect(result!.isReasoning).toBe(false);
    });

    it("should handle undefined isReasoning from facade and default to false", async () => {
      mockFacade.getAvailableModelsExtended.mockResolvedValue([]);
      mockFacade.getReasoningModel.mockResolvedValue({
        id: "model-x",
        name: "Model X",
        provider: "custom",
        isReasoning: undefined,
      });

      const result = await service.getReasoningModel();

      expect(result!.isReasoning).toBe(false);
    });
  });

  // ============================================================
  // planResearch
  // ============================================================

  describe("planResearch", () => {
    function setupPlanResearchHappy() {
      mockPrisma.researchTopic.findUnique.mockResolvedValue(mockTopicWithDimensions);
      mockFacade.getAvailableModelsExtended.mockResolvedValue([
        { id: "gpt-4o", name: "GPT-4o", provider: "openai", isReasoning: false, isAvailable: true },
        { id: "o3-mini", name: "o3-mini", provider: "openai", isReasoning: true, isAvailable: true },
      ]);
      mockFacade.getReasoningModel.mockResolvedValue({
        id: "o3-mini",
        name: "o3-mini",
        provider: "openai",
        isReasoning: true,
      });
      mockFacade.chat.mockResolvedValue({
        content: JSON.stringify(mockLeaderPlanJson),
      });
      mockPrisma.leaderDecision.create.mockResolvedValue({ id: "decision-001" });
    }

    it("should throw when topic is not found", async () => {
      mockPrisma.researchTopic.findUnique.mockResolvedValue(null);
      mockFacade.getAvailableModelsExtended.mockResolvedValue([]);
      mockFacade.getReasoningModel.mockResolvedValue({
        id: "o3-mini",
        name: "o3-mini",
        provider: "openai",
        isReasoning: true,
      });

      await expect(service.planResearch("nonexistent-topic")).rejects.toThrow(
        "Topic nonexistent-topic not found",
      );
    });

    it("should throw when no reasoning model is available", async () => {
      mockPrisma.researchTopic.findUnique.mockResolvedValue(mockTopicWithDimensions);
      mockFacade.getAvailableModelsExtended.mockResolvedValue([]);
      mockFacade.getReasoningModel.mockResolvedValue(null);

      await expect(service.planResearch("topic-001")).rejects.toThrow(
        "No reasoning model available for Leader",
      );
    });

    it("should return a plan on happy path", async () => {
      setupPlanResearchHappy();

      const result = await service.planResearch("topic-001");

      expect(mockPrisma.researchTopic.findUnique).toHaveBeenCalledWith({
        where: { id: "topic-001" },
        include: { dimensions: true },
      });
      expect(mockFacade.chat).toHaveBeenCalled();
      expect(result.dimensions).toHaveLength(2);
    });

    it("should throw when AI returns empty response", async () => {
      mockPrisma.researchTopic.findUnique.mockResolvedValue(mockTopicWithDimensions);
      mockFacade.getAvailableModelsExtended.mockResolvedValue([]);
      mockFacade.getReasoningModel.mockResolvedValue({
        id: "o3-mini",
        name: "o3-mini",
        provider: "openai",
        isReasoning: true,
      });
      mockFacade.chat.mockResolvedValue({ content: "" });

      await expect(service.planResearch("topic-001")).rejects.toThrow(
        "AI 返回空响应，请稍后重试",
      );
    });

    it("should throw when AI response cannot be parsed", async () => {
      mockPrisma.researchTopic.findUnique.mockResolvedValue(mockTopicWithDimensions);
      mockFacade.getAvailableModelsExtended.mockResolvedValue([]);
      mockFacade.getReasoningModel.mockResolvedValue({
        id: "o3-mini",
        name: "o3-mini",
        provider: "openai",
        isReasoning: true,
      });
      mockFacade.chat.mockResolvedValue({ content: "This is not JSON and has no dimensions" });

      await expect(service.planResearch("topic-001")).rejects.toThrow(
        "无法解析 AI 规划响应，请稍后重试",
      );
    });

    it("should auto-assign skills to dimension_researcher agents missing skills", async () => {
      mockPrisma.researchTopic.findUnique.mockResolvedValue(mockTopicWithDimensions);
      mockFacade.getAvailableModelsExtended.mockResolvedValue([
        { id: "gpt-4o", name: "GPT-4o", provider: "openai", isReasoning: false, isAvailable: true },
      ]);
      mockFacade.getReasoningModel.mockResolvedValue({
        id: "o3-mini",
        name: "o3-mini",
        provider: "openai",
        isReasoning: true,
      });

      const planWithoutSkills = {
        ...mockLeaderPlanJson,
        agentAssignments: [
          {
            agentId: "agent-001",
            agentName: "研究员",
            agentType: "dimension_researcher",
            assignedDimensions: ["dim-001"],
            modelId: "gpt-4o",
            skills: [], // empty skills
            tools: [], // empty tools
          },
        ],
      };

      mockFacade.chat.mockResolvedValue({ content: JSON.stringify(planWithoutSkills) });
      mockPrisma.leaderDecision.create.mockResolvedValue({});

      const result = await service.planResearch("topic-001");

      const researcherAgent = result.agentAssignments?.find(
        (a) => a.agentType === "dimension_researcher",
      );
      expect(researcherAgent?.skills).toEqual(["deep_dive", "synthesis", "data_interpretation"]);
      expect(researcherAgent?.tools).toEqual(["web-search"]);
    });

    it("should auto-assign model to agents with no modelId using round-robin", async () => {
      mockPrisma.researchTopic.findUnique.mockResolvedValue(mockTopicWithDimensions);
      const availableModels = [
        { id: "gpt-4o", name: "GPT-4o", provider: "openai", isReasoning: false, isAvailable: true },
        { id: "claude-3", name: "Claude 3", provider: "anthropic", isReasoning: false, isAvailable: true },
      ];
      mockFacade.getAvailableModelsExtended.mockResolvedValue(availableModels);
      mockFacade.getReasoningModel.mockResolvedValue({
        id: "o3-mini",
        name: "o3-mini",
        provider: "openai",
        isReasoning: true,
      });

      const planWithoutModels = {
        ...mockLeaderPlanJson,
        agentAssignments: [
          {
            agentId: "agent-001",
            agentType: "dimension_researcher",
            assignedDimensions: ["dim-001"],
            modelId: null, // no model assigned
            skills: ["deep_dive"],
            tools: ["web-search"],
          },
          {
            agentId: "agent-002",
            agentType: "dimension_researcher",
            assignedDimensions: ["dim-002"],
            modelId: null,
            skills: ["synthesis"],
            tools: ["web-search"],
          },
        ],
      };

      mockFacade.chat.mockResolvedValue({ content: JSON.stringify(planWithoutModels) });
      mockPrisma.leaderDecision.create.mockResolvedValue({});

      const result = await service.planResearch("topic-001");

      // Agents should have model IDs assigned via round-robin
      expect(result.agentAssignments?.[0].modelId).toBe("gpt-4o");
      expect(result.agentAssignments?.[1].modelId).toBe("claude-3");
    });

    it("should filter out unavailable models", async () => {
      mockPrisma.researchTopic.findUnique.mockResolvedValue(mockTopicWithDimensions);
      mockFacade.getAvailableModelsExtended.mockResolvedValue([
        { id: "gpt-4o", name: "GPT-4o", provider: "openai", isReasoning: false, isAvailable: true },
        { id: "broken-model", name: "Broken", provider: "custom", isReasoning: false, isAvailable: false },
      ]);
      mockFacade.getReasoningModel.mockResolvedValue({
        id: "o3-mini",
        name: "o3-mini",
        provider: "openai",
        isReasoning: true,
      });
      mockFacade.chat.mockResolvedValue({ content: JSON.stringify(mockLeaderPlanJson) });
      mockPrisma.leaderDecision.create.mockResolvedValue({});

      await service.planResearch("topic-001");

      // The prompt should only include available models
      const chatCall = mockFacade.chat.mock.calls[0][0];
      const userPrompt = chatCall.messages[1].content;
      expect(userPrompt).not.toContain("Broken");
    });

    it("should wrap AI call error in a descriptive message", async () => {
      mockPrisma.researchTopic.findUnique.mockResolvedValue(mockTopicWithDimensions);
      mockFacade.getAvailableModelsExtended.mockResolvedValue([]);
      mockFacade.getReasoningModel.mockResolvedValue({
        id: "o3-mini",
        name: "o3-mini",
        provider: "openai",
        isReasoning: true,
      });
      mockFacade.chat.mockRejectedValue(new Error("Rate limit exceeded"));

      await expect(service.planResearch("topic-001")).rejects.toThrow("AI 调用失败");
    });

    it("should include userPrompt in plan research call", async () => {
      setupPlanResearchHappy();

      await service.planResearch("topic-001", "重点分析芯片技术");

      const chatCall = mockFacade.chat.mock.calls[0][0];
      const userPrompt = chatCall.messages[1].content;
      expect(userPrompt).toContain("重点分析芯片技术");
    });
  });

  // ============================================================
  // reviewTaskResult
  // ============================================================

  describe("reviewTaskResult", () => {
    beforeEach(() => {
      mockFacade.getAvailableModelsExtended.mockResolvedValue([
        { id: "o3-mini", name: "o3-mini", provider: "openai", isReasoning: true, isAvailable: true },
      ]);
      mockFacade.getReasoningModel.mockResolvedValue({
        id: "o3-mini",
        name: "o3-mini",
        provider: "openai",
        isReasoning: true,
      });
      mockPrisma.leaderDecision.create.mockResolvedValue({ id: "decision-001" });
    });

    it("should return approved when AI returns approved status", async () => {
      mockFacade.chat.mockResolvedValue({
        content: JSON.stringify({
          status: "approved",
          feedback: "研究质量符合要求",
          suggestions: [],
        }),
      });

      const result = await service.reviewTaskResult(
        "mission-001",
        "task-001",
        { summary: "分析完成", keyFindings: ["找到重要发现"] },
        "技术架构",
      );

      expect(result.status).toBe("approved");
      expect(result.taskId).toBe("task-001");
      expect(result.feedback).toBe("研究质量符合要求");
    });

    it("should return needs_revision with revision instructions", async () => {
      mockFacade.chat.mockResolvedValue({
        content: JSON.stringify({
          status: "needs_revision",
          feedback: "需要补充竞争对手分析",
          suggestions: ["添加竞争对手对比"],
          revisionInstructions: "请在结论部分增加市场竞争分析",
          revisionNeeded: true,
        }),
      });

      const result = await service.reviewTaskResult(
        "mission-001",
        "task-001",
        "初步分析结果",
        "市场分析",
      );

      expect(result.status).toBe("needs_revision");
      expect(result.revisionInstructions).toBe("请在结论部分增加市场竞争分析");
      expect(result.suggestions).toHaveLength(1);
    });

    it("should default to approved when AI response cannot be parsed", async () => {
      mockFacade.chat.mockResolvedValue({ content: "不是有效的 JSON 格式" });

      const result = await service.reviewTaskResult(
        "mission-001",
        "task-001",
        "任意内容",
        "某维度",
      );

      expect(result.status).toBe("approved");
      expect(result.feedback).toContain("解析失败");
    });

    it("should throw when no reasoning model available", async () => {
      mockFacade.getReasoningModel.mockResolvedValue(null);

      await expect(
        service.reviewTaskResult("mission-001", "task-001", "result"),
      ).rejects.toThrow("No reasoning model available for Leader");
    });

    it("should record decision after review", async () => {
      mockFacade.chat.mockResolvedValue({
        content: JSON.stringify({ status: "approved", feedback: "通过" }),
      });

      await service.reviewTaskResult("mission-001", "task-001", "result", "维度名称");

      expect(mockPrisma.leaderDecision.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            missionId: "mission-001",
          }),
        }),
      );
    });

    it("should pass string result directly to AI prompt", async () => {
      mockFacade.chat.mockResolvedValue({
        content: JSON.stringify({ status: "approved", feedback: "OK" }),
      });

      await service.reviewTaskResult("mission-001", "task-001", "Simple string result");

      const chatCall = mockFacade.chat.mock.calls[0][0];
      expect(chatCall.messages[1].content).toContain("Simple string result");
    });

    it("should work with dimensionName undefined", async () => {
      mockFacade.chat.mockResolvedValue({
        content: JSON.stringify({ status: "approved", feedback: "OK" }),
      });

      const result = await service.reviewTaskResult("mission-001", "task-001", { data: "test" });

      expect(result.taskId).toBe("task-001");
      expect(result.status).toBe("approved");
    });
  });

  // ============================================================
  // handleUserMessage (ResearchLeaderService also has this method)
  // ============================================================

  describe("handleUserMessage", () => {
    const mockMissionWithDimensions = {
      id: "mission-001",
      status: "EXECUTING",
      topic: {
        id: "topic-001",
        name: "AI 趋势研究",
        dimensions: [
          { id: "dim-001", name: "技术发展", status: "RESEARCHING" },
        ],
      },
      tasks: [
        { id: "task-001", status: "COMPLETED", dimensionName: "技术发展" },
        { id: "task-002", status: "EXECUTING", dimensionName: "市场应用" },
      ],
    };

    beforeEach(() => {
      mockPrisma.researchMission = {
        findUnique: jest.fn().mockResolvedValue(mockMissionWithDimensions),
        update: jest.fn().mockResolvedValue({}),
      };
      mockPrisma.leaderDecision = {
        create: jest.fn().mockResolvedValue({ id: "decision-001" }),
        findMany: jest.fn().mockResolvedValue([]),
      };
      mockFacade.getAvailableModelsExtended.mockResolvedValue([
        { id: "o3-mini", name: "o3-mini", provider: "openai", isReasoning: true, isAvailable: true },
      ]);
      mockFacade.getReasoningModel.mockResolvedValue({
        id: "o3-mini", name: "o3-mini", provider: "openai", isReasoning: true,
      });
      mockFacade.intentDetector.detectIntent.mockReturnValue({
        intent: "unknown",
        confidence: 0.3,
      });
      mockEventEmitter.saveUserMessage.mockResolvedValue(undefined);
      mockEventEmitter.emitLeaderResponse.mockResolvedValue(undefined);
    });

    it("should return fallback response when AI returns unparseable content", async () => {
      mockFacade.chat.mockResolvedValue({ content: "not json" });

      const result = await service.handleUserMessage(
        "topic-001", "mission-001", "做点什么",
      );

      expect(result.response).toBe("收到您的指令，我会继续推进研究工作。");
    });

    it("should execute DELETE_DIMENSION action", async () => {
      mockFacade.chat.mockResolvedValue({
        content: JSON.stringify({
          actions: [
            { type: "DELETE_DIMENSION", params: { dimensionName: "技术发展" } },
          ],
          response: "已删除维度",
        }),
      });
      mockLeaderToolService.deleteDimension.mockResolvedValue({
        success: true,
        action: "DELETE_DIMENSION",
        message: "维度删除成功",
      });

      const result = await service.handleUserMessage(
        "topic-001", "mission-001", "删除技术发展维度",
      );

      expect(mockLeaderToolService.deleteDimension).toHaveBeenCalled();
      expect(result.response).toBe("已删除维度");
    });

    it("should execute CANCEL_TASK action", async () => {
      mockFacade.chat.mockResolvedValue({
        content: JSON.stringify({
          actions: [
            { type: "CANCEL_TASK", params: { dimensionName: "市场应用" } },
          ],
          response: "已取消任务",
        }),
      });
      mockLeaderToolService.cancelTask.mockResolvedValue({
        success: true,
        action: "CANCEL_TASK",
        message: "任务已取消",
      });

      const result = await service.handleUserMessage(
        "topic-001", "mission-001", "停止市场应用任务",  // avoid 取消/删除 keywords to prevent fallback delete
      );

      expect(mockLeaderToolService.cancelTask).toHaveBeenCalled();
    });

    it("should execute UPDATE_DIMENSION action", async () => {
      mockFacade.chat.mockResolvedValue({
        content: JSON.stringify({
          actions: [
            {
              type: "UPDATE_DIMENSION",
              params: { dimensionName: "技术发展", newName: "技术架构", newDescription: "更新描述" },
            },
          ],
          response: "已更新维度",
        }),
      });
      mockLeaderToolService.updateDimension.mockResolvedValue({
        success: true,
        action: "UPDATE_DIMENSION",
        message: "维度更新成功",
      });

      await service.handleUserMessage("topic-001", "mission-001", "修改技术发展名称");

      expect(mockLeaderToolService.updateDimension).toHaveBeenCalledWith(
        expect.objectContaining({ dimensionName: "技术发展", newName: "技术架构" }),
      );
    });

    it("should execute MERGE_DIMENSIONS action", async () => {
      mockFacade.chat.mockResolvedValue({
        content: JSON.stringify({
          actions: [
            {
              type: "MERGE_DIMENSIONS",
              params: {
                sourceDimensionNames: ["技术发展", "技术架构"],
                targetDimensionName: "技术综合",
              },
            },
          ],
          response: "已合并维度",
        }),
      });
      mockLeaderToolService.mergeDimensions.mockResolvedValue({
        success: true,
        action: "MERGE_DIMENSIONS",
        message: "合并成功",
      });

      await service.handleUserMessage("topic-001", "mission-001", "合并技术维度");

      expect(mockLeaderToolService.mergeDimensions).toHaveBeenCalled();
    });

    it("should execute NO_ACTION and return response", async () => {
      mockFacade.chat.mockResolvedValue({
        content: JSON.stringify({
          actions: [{ type: "NO_ACTION", params: {} }],
          response: "无需操作",
        }),
      });

      const result = await service.handleUserMessage(
        "topic-001", "mission-001", "了解一下进度",
      );

      expect(result.response).toBe("无需操作");
    });

    it("should handle unknown action type gracefully", async () => {
      mockFacade.chat.mockResolvedValue({
        content: JSON.stringify({
          actions: [{ type: "UNKNOWN_ACTION", params: {} }],
          response: "了解",
        }),
      });

      const result = await service.handleUserMessage(
        "topic-001", "mission-001", "做些未知事情",
      );

      expect(result.actionResults).toHaveLength(1);
      expect(result.actionResults![0].success).toBe(false);
    });

    it("should throw when mission not found", async () => {
      mockPrisma.researchMission.findUnique.mockResolvedValue(null);

      await expect(
        service.handleUserMessage("topic-001", "mission-nonexistent", "问题"),
      ).rejects.toThrow("Mission mission-nonexistent not found");
    });

    it("should append error notice to response when actions fail", async () => {
      mockFacade.chat.mockResolvedValue({
        content: JSON.stringify({
          actions: [{ type: "DELETE_DIMENSION", params: { dimensionName: "不存在" } }],
          response: "尝试删除",
        }),
      });
      mockLeaderToolService.deleteDimension.mockResolvedValue({
        success: false,
        action: "DELETE_DIMENSION",
        message: "维度不存在",
      });

      const result = await service.handleUserMessage(
        "topic-001", "mission-001", "删除不存在的维度",
      );

      expect(result.response).toContain("尝试删除");
      expect(result.response).toContain("维度不存在");
    });

    it("should use quick response for CONTINUE intent with high confidence", async () => {
      const { UserIntent } = await import("@/modules/ai-engine/facade");
      mockFacade.intentDetector.detectIntent.mockReturnValue({
        intent: UserIntent.CONTINUE,
        confidence: 0.9,
      });

      const result = await service.handleUserMessage(
        "topic-001", "mission-001", "继续",
      );

      expect(mockFacade.chat).not.toHaveBeenCalled();
      expect(result.response).toContain("AI 趋势研究");
    });

    it("should use quick response for SUMMARIZE intent when progress < 50", async () => {
      const { UserIntent } = await import("@/modules/ai-engine/facade");
      // mission has 1 of 2 tasks completed = 50% - need to set up one with <50%
      const missionLowProgress = {
        ...mockMissionWithDimensions,
        tasks: [
          { id: "task-001", status: "PENDING", dimensionName: "技术发展" },
          { id: "task-002", status: "PENDING", dimensionName: "市场应用" },
          { id: "task-003", status: "PENDING", dimensionName: "政策法规" },
        ],
      };
      mockPrisma.researchMission.findUnique.mockResolvedValue(missionLowProgress);
      mockFacade.intentDetector.detectIntent.mockReturnValue({
        intent: UserIntent.SUMMARIZE,
        confidence: 0.85,
      });

      const result = await service.handleUserMessage(
        "topic-001", "mission-001", "总结一下",
      );

      expect(mockFacade.chat).not.toHaveBeenCalled();
      expect(result.response).toContain("进度");
    });

    it("should fall through to AI for SUMMARIZE when progress >= 50", async () => {
      const { UserIntent } = await import("@/modules/ai-engine/facade");
      // 1 of 2 tasks = 50%
      mockFacade.intentDetector.detectIntent.mockReturnValue({
        intent: UserIntent.SUMMARIZE,
        confidence: 0.85,
      });
      mockFacade.chat.mockResolvedValue({
        content: JSON.stringify({
          actions: [],
          response: "详细总结内容",
        }),
      });

      await service.handleUserMessage("topic-001", "mission-001", "总结");

      expect(mockFacade.chat).toHaveBeenCalled();
    });
  });

  // ============================================================
  // selectAgentForTask
  // ============================================================

  describe("selectAgentForTask", () => {
    beforeEach(() => {
      mockPrisma.researchMission = {
        findUnique: jest.fn(),
        update: jest.fn().mockResolvedValue({}),
      };
      mockPrisma.leaderDecision = {
        create: jest.fn().mockResolvedValue({}),
        findMany: jest.fn().mockResolvedValue([]),
      };
    });

    it("should select existing agent with lowest workload", async () => {
      mockPrisma.researchMission.findUnique.mockResolvedValue({
        id: "mission-001",
        tasks: [
          { assignedAgent: "researcher-01", assignedAgentType: "dimension_researcher", modelId: "gpt-4o", status: "EXECUTING" },
          { assignedAgent: "researcher-01", assignedAgentType: "dimension_researcher", modelId: "gpt-4o", status: "COMPLETED" },
          { assignedAgent: "researcher-02", assignedAgentType: "dimension_researcher", modelId: "claude-3", status: "PENDING" },
        ],
      });
      mockFacade.getAvailableModelsExtended.mockResolvedValue([
        { id: "gpt-4o", name: "GPT-4o", isReasoning: false, isAvailable: true },
        { id: "claude-3", name: "Claude 3", isReasoning: false, isAvailable: true },
      ]);

      const result = await service.selectAgentForTask("topic-001", "mission-001", "市场研究");

      // researcher-02 has 1 task (lower load), should be selected
      expect(result.agentId).toBe("researcher-02");
      expect(result.modelId).toBe("claude-3");
    });

    it("should create a new agent when no existing agents found", async () => {
      mockPrisma.researchMission.findUnique.mockResolvedValue({
        id: "mission-001",
        tasks: [],
      });
      mockFacade.getAvailableModelsExtended.mockResolvedValue([
        { id: "gpt-4o", name: "GPT-4o", isReasoning: false, isAvailable: true },
      ]);

      const result = await service.selectAgentForTask("topic-001", "mission-001", "分析任务");

      expect(result.agentId).toMatch(/researcher_user_/);
      expect(result.agentType).toBe("dimension_researcher");
    });

    it("should create new agent with default model when no models available", async () => {
      mockPrisma.researchMission.findUnique.mockResolvedValue({
        id: "mission-001",
        tasks: [],
      });
      mockFacade.getAvailableModelsExtended.mockResolvedValue([]);

      const result = await service.selectAgentForTask("topic-001", "mission-001", "分析任务");

      expect(result.modelId).toBe("gpt-4o"); // hardcoded fallback
    });

    it("should select skills and tools based on policy-related task title", async () => {
      mockPrisma.researchMission.findUnique.mockResolvedValue({
        id: "mission-001",
        tasks: [],
      });
      mockFacade.getAvailableModelsExtended.mockResolvedValue([
        { id: "gpt-4o", name: "GPT-4o", isReasoning: false, isAvailable: true },
      ]);

      const result = await service.selectAgentForTask(
        "topic-001",
        "mission-001",
        "政策法规分析",
        "AI 监管政策研究",
      );

      expect(result.skills).toContain("policy_analysis");
      expect(result.tools).toContain("federal-register");
    });

    it("should select market skills for market-related tasks", async () => {
      mockPrisma.researchMission.findUnique.mockResolvedValue({ id: "mission-001", tasks: [] });
      mockFacade.getAvailableModelsExtended.mockResolvedValue([
        { id: "gpt-4o", isReasoning: false, isAvailable: true },
      ]);

      const result = await service.selectAgentForTask(
        "topic-001", "mission-001", "市场竞争格局", "分析市场份额",
      );

      expect(result.skills).toContain("competitive_analysis");
    });

    it("should use default skills when no keywords match", async () => {
      mockPrisma.researchMission.findUnique.mockResolvedValue({ id: "mission-001", tasks: [] });
      mockFacade.getAvailableModelsExtended.mockResolvedValue([
        { id: "gpt-4o", isReasoning: false, isAvailable: true },
      ]);

      const result = await service.selectAgentForTask(
        "topic-001", "mission-001", "Random task", "No keywords here",
      );

      expect(result.skills).toContain("deep_dive");
      expect(result.tools).toContain("web-search");
    });
  });

  // ============================================================
  // getDecisionHistory
  // ============================================================

  describe("getDecisionHistory", () => {
    it("should return decision history ordered by createdAt desc", async () => {
      const decisions = [
        { id: "d-001", missionId: "mission-001", type: "PLAN", createdAt: new Date() },
        { id: "d-002", missionId: "mission-001", type: "REVIEW", createdAt: new Date() },
      ];
      mockPrisma.leaderDecision = {
        create: jest.fn(),
        findMany: jest.fn().mockResolvedValue(decisions),
      };

      const result = await service.getDecisionHistory("mission-001");

      expect(mockPrisma.leaderDecision.findMany).toHaveBeenCalledWith({
        where: { missionId: "mission-001" },
        orderBy: { createdAt: "desc" },
      });
      expect(result).toHaveLength(2);
    });

    it("should return empty array when no decisions exist", async () => {
      mockPrisma.leaderDecision = {
        create: jest.fn(),
        findMany: jest.fn().mockResolvedValue([]),
      };

      const result = await service.getDecisionHistory("mission-no-decisions");

      expect(result).toHaveLength(0);
    });
  });

  // ============================================================
  // extractClaims
  // ============================================================

  describe("extractClaims", () => {
    it("should return claims when AI returns valid claims JSON", async () => {
      const mockClaims = [
        { id: "c1", claim: "5G 技术覆盖率达到 60%", confidence: 0.9, sectionId: "section-1" },
        { id: "c2", claim: "AI 市场规模超过 1000 亿", confidence: 0.85, sectionId: "section-1" },
      ];
      mockFacade.chat.mockResolvedValue({
        content: JSON.stringify({ claims: mockClaims }),
      });

      const result = await service.extractClaims("section-1", "5G 技术发展和 AI 市场分析内容...");

      expect(result).toHaveLength(2);
      expect(result[0].claim).toBe("5G 技术覆盖率达到 60%");
    });

    it("should return empty array when AI returns unparseable content", async () => {
      mockFacade.chat.mockResolvedValue({ content: "not valid json" });

      const result = await service.extractClaims("section-1", "some content");

      expect(result).toEqual([]);
    });

    it("should return empty array when AI call throws", async () => {
      mockFacade.chat.mockRejectedValue(new Error("API error"));

      const result = await service.extractClaims("section-1", "some content");

      expect(result).toEqual([]);
    });

    it("should truncate very long section content to 4000 chars", async () => {
      mockFacade.chat.mockResolvedValue({ content: JSON.stringify({ claims: [] }) });

      const longContent = "x".repeat(10000);
      await service.extractClaims("section-1", longContent);

      const chatCall = mockFacade.chat.mock.calls[0][0];
      const promptContent = chatCall.messages[1].content;
      // The truncated content should appear in the prompt
      expect(promptContent.length).toBeLessThan(longContent.length);
    });

    it("should return empty array when response has no claims key", async () => {
      mockFacade.chat.mockResolvedValue({
        content: JSON.stringify({ other: "data" }),
      });

      const result = await service.extractClaims("section-1", "content");

      expect(result).toEqual([]);
    });
  });

  // ============================================================
  // verifyHypotheses
  // ============================================================

  describe("verifyHypotheses", () => {
    it("should return empty array when hypotheses list is empty", async () => {
      const result = await service.verifyHypotheses([], "evidence summary");

      expect(result).toEqual([]);
      expect(mockFacade.chat).not.toHaveBeenCalled();
    });

    it("should return verification results when AI returns valid JSON", async () => {
      const hypotheses = [
        { id: "h1", statement: "AI 会取代部分工作", confidence: 0.7 },
      ];
      const mockResults = [
        { hypothesisId: "h1", verdict: "supported", evidence: ["data point 1"] },
      ];
      mockFacade.chat.mockResolvedValue({
        content: JSON.stringify({ results: mockResults }),
      });

      const result = await service.verifyHypotheses(hypotheses as never, "detailed evidence summary");

      expect(result).toHaveLength(1);
      expect(result[0].verdict).toBe("supported");
    });

    it("should return empty array when AI returns unparseable content", async () => {
      mockFacade.chat.mockResolvedValue({ content: "not json" });

      const result = await service.verifyHypotheses(
        [{ id: "h1", statement: "hypothesis", confidence: 0.5 }] as never,
        "evidence",
      );

      expect(result).toEqual([]);
    });

    it("should return empty array when AI call throws", async () => {
      mockFacade.chat.mockRejectedValue(new Error("API error"));

      const result = await service.verifyHypotheses(
        [{ id: "h1", statement: "hypothesis", confidence: 0.5 }] as never,
        "evidence",
      );

      expect(result).toEqual([]);
    });

    it("should return empty array when response has no results key", async () => {
      mockFacade.chat.mockResolvedValue({
        content: JSON.stringify({ other: "data" }),
      });

      const result = await service.verifyHypotheses(
        [{ id: "h1", statement: "test", confidence: 0.8 }] as never,
        "some evidence",
      );

      expect(result).toEqual([]);
    });
  });

  // ============================================================
  // handleUserMessage - fallback delete mechanism
  // ============================================================

  describe("handleUserMessage - fallback delete mechanism", () => {
    const mockMissionWithDimensions = {
      id: "mission-001",
      status: "EXECUTING",
      topic: {
        id: "topic-001",
        name: "AI 趋势研究",
        dimensions: [
          { id: "dim-001", name: "技术发展", status: "RESEARCHING" },
        ],
      },
      tasks: [
        { id: "task-001", status: "COMPLETED", dimensionName: "技术发展" },
        { id: "task-002", status: "EXECUTING", dimensionName: "市场应用" },
      ],
    };

    beforeEach(() => {
      mockPrisma.researchMission = {
        findUnique: jest.fn().mockResolvedValue(mockMissionWithDimensions),
        update: jest.fn().mockResolvedValue({}),
      };
      mockPrisma.leaderDecision = {
        create: jest.fn().mockResolvedValue({ id: "decision-001" }),
        findMany: jest.fn().mockResolvedValue([]),
      };
      mockFacade.getAvailableModelsExtended.mockResolvedValue([
        { id: "o3-mini", name: "o3-mini", provider: "openai", isReasoning: true, isAvailable: true },
      ]);
      mockFacade.getReasoningModel.mockResolvedValue({
        id: "o3-mini", name: "o3-mini", provider: "openai", isReasoning: true,
      });
      mockFacade.intentDetector.detectIntent.mockReturnValue({
        intent: "unknown",
        confidence: 0.3,
      });
    });

    it("should trigger fallback delete when AI omits DELETE_DIMENSION but user message has delete intent", async () => {
      // AI returns no actions
      mockFacade.chat.mockResolvedValue({
        content: JSON.stringify({
          actions: [],
          response: "好的",
        }),
      });
      mockLeaderToolService.deleteDimension.mockResolvedValue({
        success: true,
        action: "DELETE_DIMENSION",
        message: "技术发展维度已删除",
      });

      const result = await service.handleUserMessage(
        "topic-001",
        "mission-001",
        "删除技术发展维度",
      );

      // The fallback delete should have been attempted.
      // The regex extracts "技术发展维度" from "删除技术发展维度" because
      // the [维度章节]* part is greedy-zero and the capture group consumes everything.
      expect(mockLeaderToolService.deleteDimension).toHaveBeenCalledWith(
        expect.objectContaining({ dimensionName: "技术发展维度" }),
      );
    });

    it("should not trigger fallback delete when AI already produced DELETE_DIMENSION action", async () => {
      mockFacade.chat.mockResolvedValue({
        content: JSON.stringify({
          actions: [{ type: "DELETE_DIMENSION", params: { dimensionName: "技术发展" } }],
          response: "已删除",
        }),
      });
      mockLeaderToolService.deleteDimension.mockResolvedValue({
        success: true,
        action: "DELETE_DIMENSION",
        message: "deleted",
      });

      const callsBefore = mockLeaderToolService.deleteDimension.mock.calls.length;

      await service.handleUserMessage("topic-001", "mission-001", "删除技术发展维度");

      // deleteDimension should be called exactly once (by the action, not fallback)
      expect(mockLeaderToolService.deleteDimension).toHaveBeenCalledTimes(callsBefore + 1);
    });

    it("should handle action execution error gracefully and add to actionResults", async () => {
      mockFacade.chat.mockResolvedValue({
        content: JSON.stringify({
          actions: [{ type: "CREATE_DIMENSION", params: { name: "新维度" } }],
          response: "创建维度",
        }),
      });
      mockLeaderToolService.createDimension = jest.fn().mockRejectedValue(
        new Error("DB constraint"),
      );
      mockPrisma.researchTask = {
        create: jest.fn(),
        findFirst: jest.fn().mockResolvedValue(null),
        update: jest.fn(),
      };
      mockPrisma.researchMission.update = jest.fn().mockResolvedValue({});

      const result = await service.handleUserMessage(
        "topic-001",
        "mission-001",
        "增加一个新维度",
      );

      const failedActions = result.actionResults?.filter((r) => !r.success);
      expect(failedActions?.length).toBeGreaterThan(0);
    });
  });

  // ============================================================
  // planResearch - quality_reviewer auto-assignment
  // ============================================================

  describe("planResearch - quality_reviewer and report_writer assignment", () => {
    function setupPlanResearchHappy() {
      mockPrisma.researchTopic.findUnique.mockResolvedValue(mockTopicWithDimensions);
      mockFacade.getAvailableModelsExtended.mockResolvedValue([
        { id: "gpt-4o", name: "GPT-4o", provider: "openai", isReasoning: false, isAvailable: true },
      ]);
      mockFacade.getReasoningModel.mockResolvedValue({
        id: "o3-mini", name: "o3-mini", provider: "openai", isReasoning: true,
      });
      mockPrisma.leaderDecision.create.mockResolvedValue({});
    }

    it("should auto-assign skills to quality_reviewer agents missing skills", async () => {
      setupPlanResearchHappy();

      const planWithReviewer = {
        dimensions: [{ id: "dim-001", name: "技术架构", priority: "high" }],
        agentAssignments: [
          {
            agentId: "reviewer-01",
            agentName: "质量审核员",
            agentType: "quality_reviewer",
            assignedDimensions: [],
            modelId: "gpt-4o",
            skills: [],
            tools: [],
          },
        ],
        strategy: "parallel",
      };

      mockFacade.chat.mockResolvedValue({ content: JSON.stringify(planWithReviewer) });

      const result = await service.planResearch("topic-001");

      const reviewerAgent = result.agentAssignments?.find(
        (a) => a.agentType === "quality_reviewer",
      );
      expect(reviewerAgent?.skills).toContain("critical_thinking");
    });

    it("should auto-assign skills to report_writer agents missing skills", async () => {
      setupPlanResearchHappy();

      const planWithWriter = {
        dimensions: [{ id: "dim-001", name: "技术架构", priority: "high" }],
        agentAssignments: [
          {
            agentId: "writer-01",
            agentName: "报告撰写员",
            agentType: "report_writer",
            assignedDimensions: [],
            modelId: "gpt-4o",
            skills: [],
            tools: [],
          },
        ],
        strategy: "parallel",
      };

      mockFacade.chat.mockResolvedValue({ content: JSON.stringify(planWithWriter) });

      const result = await service.planResearch("topic-001");

      const writerAgent = result.agentAssignments?.find(
        (a) => a.agentType === "report_writer",
      );
      expect(writerAgent?.skills).toContain("synthesis");
    });

    it("should auto-assign assignmentReason to researcher agents missing it", async () => {
      setupPlanResearchHappy();

      const planWithoutReason = {
        dimensions: [{ id: "dim-001", name: "技术架构", priority: "high" }],
        agentAssignments: [
          {
            agentId: "agent-001",
            agentName: "研究员",
            agentType: "dimension_researcher",
            assignedDimensions: ["dim-001"],
            modelId: "gpt-4o",
            skills: ["deep_dive"],
            tools: ["web-search"],
            // no assignmentReason
          },
        ],
        strategy: "parallel",
      };

      mockFacade.chat.mockResolvedValue({ content: JSON.stringify(planWithoutReason) });

      const result = await service.planResearch("topic-001");

      const researcher = result.agentAssignments?.[0];
      expect(researcher?.assignmentReason?.agentReason).toBeDefined();
      expect(researcher?.assignmentReason?.modelReason).toContain("gpt-4o");
    });

    it("should handle topic with no existing dimensions", async () => {
      const topicNodims = { ...mockTopicWithDimensions, dimensions: [] };
      mockPrisma.researchTopic.findUnique.mockResolvedValue(topicNodims);
      mockFacade.getAvailableModelsExtended.mockResolvedValue([]);
      mockFacade.getReasoningModel.mockResolvedValue({
        id: "o3-mini", name: "o3-mini", provider: "openai", isReasoning: true,
      });
      mockFacade.chat.mockResolvedValue({
        content: JSON.stringify(mockLeaderPlanJson),
      });
      mockPrisma.leaderDecision.create.mockResolvedValue({});

      const result = await service.planResearch("topic-001", "研究主题");

      expect(result.dimensions).toHaveLength(2);
    });
  });
});
