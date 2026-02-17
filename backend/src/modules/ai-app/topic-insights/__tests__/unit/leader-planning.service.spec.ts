/**
 * LeaderPlanningService Unit Tests
 *
 * Tests for research planning, global outline, and dimension outline generation
 * Type checking is disabled due to Jest mock compatibility issues.
 */

import { Test, TestingModule } from "@nestjs/testing";
import { LeaderPlanningService } from "../../services/core/leader-planning.service";
import { ResearchMemoryService } from "../../services/core/research-memory.service";
import { AIEngineFacade } from "@/modules/ai-engine/facade/ai-engine.facade";
import { PrismaService } from "@/common/prisma/prisma.service";

import {
  createMockPrisma,
  createMockAiEngineFacade,
  MOCK_LEADER_PLAN,
} from "../mocks";
import { MOCK_TOPIC } from "../fixtures/topics.fixture";

describe("LeaderPlanningService", () => {
  let service: LeaderPlanningService;
  let prisma: ReturnType<typeof createMockPrisma>;
  let aiFacade: ReturnType<typeof createMockAiEngineFacade>;

  beforeEach(async () => {
    prisma = createMockPrisma();
    aiFacade = createMockAiEngineFacade();

    const mockResearchMemoryService = {};

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        LeaderPlanningService,
        { provide: PrismaService, useValue: prisma },
        { provide: AIEngineFacade, useValue: aiFacade },
        { provide: ResearchMemoryService, useValue: mockResearchMemoryService },
      ],
    }).compile();

    service = module.get<LeaderPlanningService>(LeaderPlanningService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  // ==================== getReasoningModel Tests ====================

  describe("getReasoningModel", () => {
    it("should return reasoning model info from AI facade", async () => {
      // Arrange
      const mockReasoningModel = {
        id: "deepseek-r1",
        name: "DeepSeek R1",
        provider: "deepseek",
        isReasoning: true,
      };

      aiFacade.getAvailableModelsExtended.mockResolvedValue([
        mockReasoningModel,
        {
          id: "gpt-4o",
          name: "GPT-4o",
          provider: "openai",
          isReasoning: false,
        },
      ]);
      aiFacade.getReasoningModel.mockResolvedValue(mockReasoningModel);

      // Act
      const result = await service.getReasoningModel();

      // Assert
      expect(result).toEqual({
        modelId: "deepseek-r1",
        modelName: "DeepSeek R1",
        provider: "deepseek",
        isReasoning: true,
      });
      expect(aiFacade.getReasoningModel).toHaveBeenCalled();
    });

    it("should return null if no reasoning model available", async () => {
      // Arrange
      aiFacade.getAvailableModelsExtended.mockResolvedValue([]);
      aiFacade.getReasoningModel.mockResolvedValue(null);

      // Act
      const result = await service.getReasoningModel();

      // Assert
      expect(result).toBeNull();
    });

    it("should warn if selected model is not a reasoning model", async () => {
      // Arrange
      const mockFallbackModel = {
        id: "gpt-4o",
        name: "GPT-4o",
        provider: "openai",
        isReasoning: false,
      };

      aiFacade.getAvailableModelsExtended.mockResolvedValue([
        mockFallbackModel,
      ]);
      aiFacade.getReasoningModel.mockResolvedValue(mockFallbackModel);

      // Act
      const result = await service.getReasoningModel();

      // Assert
      expect(result).toEqual({
        modelId: "gpt-4o",
        modelName: "GPT-4o",
        provider: "openai",
        isReasoning: false,
      });
    });
  });

  // ==================== planResearch Tests ====================

  describe("planResearch", () => {
    it("should return valid LeaderPlan with dimensions and agents", async () => {
      // Arrange
      const topicId = "topic-123";
      const topicWithDimensions = {
        ...MOCK_TOPIC,
        dimensions: [
          {
            id: "dim-1",
            name: "Market Overview",
            description: "Test",
            status: "PENDING",
          },
        ],
      };

      prisma.researchTopic.findUnique.mockResolvedValue(topicWithDimensions);

      aiFacade.getReasoningModel.mockResolvedValue({
        id: "deepseek-r1",
        name: "DeepSeek R1",
        provider: "deepseek",
        isReasoning: true,
      });

      aiFacade.getAvailableModelsExtended.mockResolvedValue([
        {
          id: "gpt-4o-mini",
          name: "GPT-4o Mini",
          provider: "openai",
          isAvailable: true,
        },
        {
          id: "claude-3",
          name: "Claude 3",
          provider: "anthropic",
          isAvailable: true,
        },
      ]);

      aiFacade.chat.mockResolvedValue({
        content: JSON.stringify(MOCK_LEADER_PLAN),
        usage: { promptTokens: 1000, completionTokens: 500, totalTokens: 1500 },
      });

      // Act
      const result = await service.planResearch(
        topicId,
        "Please analyze this topic",
      );

      // Assert
      expect(result).toBeDefined();
      expect(result.dimensions).toHaveLength(3);
      expect(result.agentAssignments).toBeDefined();
      expect(prisma.researchTopic.findUnique).toHaveBeenCalledWith({
        where: { id: topicId },
        include: { dimensions: true },
      });
      expect(aiFacade.chat).toHaveBeenCalledWith(
        expect.objectContaining({
          model: "deepseek-r1",
          taskProfile: expect.objectContaining({
            creativity: "medium",
            outputLength: "extended",
          }),
        }),
      );
    });

    it("should throw error if topic not found", async () => {
      // Arrange
      prisma.researchTopic.findUnique.mockResolvedValue(null);

      // Act & Assert
      await expect(service.planResearch("non-existent")).rejects.toThrow(
        "Topic non-existent not found",
      );
    });

    it("should throw error if no reasoning model available", async () => {
      // Arrange
      prisma.researchTopic.findUnique.mockResolvedValue(MOCK_TOPIC);
      aiFacade.getReasoningModel.mockResolvedValue(null);

      // Act & Assert
      await expect(service.planResearch("topic-123")).rejects.toThrow(
        "No reasoning model available for Leader",
      );
    });

    it("should auto-assign skills and tools to agents without them", async () => {
      // Arrange
      const incompletePlan = {
        ...MOCK_LEADER_PLAN,
        agentAssignments: [
          {
            agentId: "researcher-1",
            agentName: "Researcher",
            agentType: "dimension_researcher",
            modelId: "gpt-4o-mini",
            // Missing skills and tools
          },
        ],
      };

      prisma.researchTopic.findUnique.mockResolvedValue(MOCK_TOPIC);
      aiFacade.getReasoningModel.mockResolvedValue({
        id: "deepseek-r1",
        name: "DeepSeek R1",
        provider: "deepseek",
        isReasoning: true,
      });
      aiFacade.getAvailableModelsExtended.mockResolvedValue([
        {
          id: "gpt-4o-mini",
          name: "GPT-4o Mini",
          provider: "openai",
          isAvailable: true,
        },
      ]);
      aiFacade.chat.mockResolvedValue({
        content: JSON.stringify(incompletePlan),
        usage: { promptTokens: 1000, completionTokens: 500, totalTokens: 1500 },
      });

      // Act
      const result = await service.planResearch("topic-123");

      // Assert
      expect(result.agentAssignments[0].skills).toEqual([
        "deep_dive",
        "synthesis",
        "data_interpretation",
      ]);
      expect(result.agentAssignments[0].tools).toEqual(["web-search"]);
    });

    it("should resolve model display names to actual model IDs", async () => {
      // Arrange
      const planWithDisplayNames = {
        ...MOCK_LEADER_PLAN,
        agentAssignments: [
          {
            agentId: "researcher-1",
            agentName: "Researcher",
            agentType: "dimension_researcher",
            modelId: "GPT-4o Mini", // Display name instead of ID
          },
        ],
      };

      prisma.researchTopic.findUnique.mockResolvedValue(MOCK_TOPIC);
      aiFacade.getReasoningModel.mockResolvedValue({
        id: "deepseek-r1",
        name: "DeepSeek R1",
        provider: "deepseek",
        isReasoning: true,
      });
      aiFacade.getAvailableModelsExtended.mockResolvedValue([
        {
          id: "gpt-4o-mini",
          name: "GPT-4o Mini",
          provider: "openai",
          isAvailable: true,
        },
      ]);
      aiFacade.chat.mockResolvedValue({
        content: JSON.stringify(planWithDisplayNames),
        usage: { promptTokens: 1000, completionTokens: 500, totalTokens: 1500 },
      });

      // Act
      const result = await service.planResearch("topic-123");

      // Assert
      expect(result.agentAssignments[0].modelId).toBe("gpt-4o-mini");
    });

    it("should throw error if AI returns empty response", async () => {
      // Arrange
      prisma.researchTopic.findUnique.mockResolvedValue(MOCK_TOPIC);
      aiFacade.getReasoningModel.mockResolvedValue({
        id: "deepseek-r1",
        name: "DeepSeek R1",
        provider: "deepseek",
        isReasoning: true,
      });
      aiFacade.getAvailableModelsExtended.mockResolvedValue([]);
      aiFacade.chat.mockResolvedValue({
        content: "",
        usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
      });

      // Act & Assert
      await expect(service.planResearch("topic-123")).rejects.toThrow(
        "AI 返回空响应，请稍后重试",
      );
    });

    it("should throw error if AI call fails", async () => {
      // Arrange
      prisma.researchTopic.findUnique.mockResolvedValue(MOCK_TOPIC);
      aiFacade.getReasoningModel.mockResolvedValue({
        id: "deepseek-r1",
        name: "DeepSeek R1",
        provider: "deepseek",
        isReasoning: true,
      });
      aiFacade.getAvailableModelsExtended.mockResolvedValue([]);
      aiFacade.chat.mockRejectedValue(new Error("API rate limit exceeded"));

      // Act & Assert
      await expect(service.planResearch("topic-123")).rejects.toThrow(
        "AI 调用失败: API rate limit exceeded",
      );
    });
  });

  // ==================== planGlobalOutline Tests ====================

  describe("planGlobalOutline", () => {
    it("should generate global outline for all dimensions", async () => {
      // Arrange
      const topic = {
        name: "AI Market Analysis",
        type: "MACRO",
        description: "Market analysis",
      };

      const dimensionSearchResults = [
        {
          dimensionId: "dim-1",
          dimensionName: "Market Overview",
          dimensionDescription: "Market landscape",
          evidenceSummary: "Evidence for market...",
          figuresSummary: "Charts available...",
          searchQueries: ["market size", "growth rate"],
        },
        {
          dimensionId: "dim-2",
          dimensionName: "Technology Trends",
          dimensionDescription: "Tech trends",
          evidenceSummary: "Evidence for tech...",
          figuresSummary: "",
          searchQueries: ["AI trends", "innovation"],
        },
      ];

      const mockGlobalOutline = {
        dimensions: [
          {
            dimensionId: "dim-1",
            dimensionName: "Market Overview",
            crossDimensionNotes: "Coordinate with tech trends",
            outline: {
              intentUnderstanding: {
                coreQuestion: "What is the market size?",
                scope: { included: ["market size"], excluded: [] },
                expectedDepth: "detailed",
                targetAudience: "business",
                keyFocusAreas: ["market size", "growth"],
              },
              sections: [
                {
                  id: "sec-1",
                  title: "Market Size",
                  description: "Analysis of market size",
                  keyPoints: ["Total market size", "Growth rate"],
                  targetWords: 800,
                  evidenceRequirements: { minReferences: 3 },
                },
              ],
              executionPlan: {
                parallelGroups: [["sec-1"]],
                estimatedTotalWords: 800,
              },
            },
          },
          {
            dimensionId: "dim-2",
            dimensionName: "Technology Trends",
            crossDimensionNotes: "",
            outline: {
              intentUnderstanding: {
                coreQuestion: "What are the tech trends?",
                scope: { included: ["AI trends"], excluded: [] },
                expectedDepth: "detailed",
                targetAudience: "technical",
                keyFocusAreas: ["AI trends"],
              },
              sections: [
                {
                  id: "sec-2",
                  title: "AI Trends",
                  description: "Current AI trends",
                  keyPoints: ["Trend 1", "Trend 2"],
                  targetWords: 800,
                  evidenceRequirements: { minReferences: 3 },
                },
              ],
              executionPlan: {
                parallelGroups: [["sec-2"]],
                estimatedTotalWords: 800,
              },
            },
          },
        ],
      };

      aiFacade.getReasoningModel.mockResolvedValue({
        id: "deepseek-r1",
        name: "DeepSeek R1",
        provider: "deepseek",
        isReasoning: true,
      });
      aiFacade.chat.mockResolvedValue({
        content: JSON.stringify(mockGlobalOutline),
        isError: false,
      });

      // Act
      const result = await service.planGlobalOutline(
        topic,
        dimensionSearchResults,
      );

      // Assert
      expect(result).toBeDefined();
      expect(result.dimensions).toHaveLength(2);
      expect(result.dimensions[0].dimensionName).toBe("Market Overview");
      expect(result.dimensions[0].outline.sections).toHaveLength(1);
      expect(aiFacade.chat).toHaveBeenCalledWith(
        expect.objectContaining({
          model: "deepseek-r1",
          taskProfile: expect.objectContaining({
            creativity: "medium",
            outputLength: "extended",
          }),
        }),
      );
    });

    it("should add stub outlines for missing dimensions", async () => {
      // Arrange
      const topic = { name: "Test", type: "MACRO", description: "Test" };
      const dimensionSearchResults = [
        {
          dimensionId: "dim-1",
          dimensionName: "Dimension 1",
          dimensionDescription: "Desc",
          evidenceSummary: "Evidence",
          figuresSummary: "",
          searchQueries: [],
        },
        {
          dimensionId: "dim-2",
          dimensionName: "Dimension 2",
          dimensionDescription: "Desc",
          evidenceSummary: "Evidence",
          figuresSummary: "",
          searchQueries: [],
        },
      ];

      // AI only returns outline for one dimension
      const incompleteOutline = {
        dimensions: [
          {
            dimensionId: "dim-1",
            dimensionName: "Dimension 1",
            crossDimensionNotes: "",
            outline: {
              intentUnderstanding: {
                coreQuestion: "Test",
                scope: { included: [], excluded: [] },
                expectedDepth: "detailed",
                targetAudience: "general",
                keyFocusAreas: [],
              },
              sections: [{ id: "sec-1", title: "Section 1", targetWords: 800 }],
              executionPlan: { parallelGroups: [], estimatedTotalWords: 800 },
            },
          },
        ],
      };

      aiFacade.getReasoningModel.mockResolvedValue({
        id: "deepseek-r1",
        name: "DeepSeek R1",
        provider: "deepseek",
        isReasoning: true,
      });
      aiFacade.chat.mockResolvedValue({
        content: JSON.stringify(incompleteOutline),
        isError: false,
      });

      // Act
      const result = await service.planGlobalOutline(
        topic,
        dimensionSearchResults,
      );

      // Assert
      expect(result.dimensions).toHaveLength(2);
      expect(result.dimensions[1].dimensionName).toBe("Dimension 2");
      expect(result.dimensions[1].outline.sections).toHaveLength(1); // Stub section added
    });

    it("should retry on API error and eventually succeed", async () => {
      // Arrange
      const topic = { name: "Test", type: "MACRO", description: null };
      const dimensionSearchResults = [
        {
          dimensionId: "dim-1",
          dimensionName: "Test Dimension",
          evidenceSummary: "Evidence",
          figuresSummary: "",
        },
      ];

      const validOutline = {
        dimensions: [
          {
            dimensionId: "dim-1",
            dimensionName: "Test Dimension",
            crossDimensionNotes: "",
            outline: {
              intentUnderstanding: { coreQuestion: "Test" },
              sections: [{ id: "sec-1", title: "Test" }],
              executionPlan: { parallelGroups: [] },
            },
          },
        ],
      };

      aiFacade.getReasoningModel.mockResolvedValue({
        id: "deepseek-r1",
        name: "DeepSeek R1",
        provider: "deepseek",
        isReasoning: true,
      });
      aiFacade.chat
        .mockResolvedValueOnce({ content: "Error 429", isError: true }) // First attempt fails
        .mockResolvedValueOnce({
          content: JSON.stringify(validOutline),
          isError: false,
        }); // Second succeeds

      // Act
      const result = await service.planGlobalOutline(
        topic,
        dimensionSearchResults,
      );

      // Assert
      expect(result).toBeDefined();
      expect(result.dimensions).toHaveLength(1);
      expect(aiFacade.chat).toHaveBeenCalledTimes(2);
    });

    it("should throw error after max retries", async () => {
      // Arrange
      const topic = { name: "Test", type: "MACRO", description: null };
      const dimensionSearchResults = [
        {
          dimensionId: "dim-1",
          dimensionName: "Test",
          evidenceSummary: "Evidence",
          figuresSummary: "",
        },
      ];

      aiFacade.getReasoningModel.mockResolvedValue({
        id: "deepseek-r1",
        name: "DeepSeek R1",
        provider: "deepseek",
        isReasoning: true,
      });
      aiFacade.chat.mockResolvedValue({ content: "Error 500", isError: true });

      // Act & Assert
      await expect(
        service.planGlobalOutline(topic, dimensionSearchResults),
      ).rejects.toThrow("Failed to parse global outline after 3 attempts");
      expect(aiFacade.chat).toHaveBeenCalledTimes(3);
    }, 10000); // Increase timeout to 10s for retry delays
  });

  // ==================== planDimensionOutline Tests ====================

  describe("planDimensionOutline", () => {
    it("should generate outline for a single dimension", async () => {
      // Arrange
      const topic = { name: "AI Market", type: "MACRO", description: null };
      const dimension = {
        name: "Market Size",
        description: "Analysis of market size",
        searchQueries: ["market size 2024", "growth rate"],
      };
      const evidenceSummary = "Evidence about market size...";

      const mockOutline = {
        intentUnderstanding: {
          coreQuestion: "What is the market size?",
          scope: { included: ["market size"], excluded: [] },
          expectedDepth: "detailed",
          targetAudience: "business",
          keyFocusAreas: ["size", "growth"],
        },
        sections: [
          {
            id: "sec-1",
            title: "Current Market Size",
            description: "Analysis of current market",
            keyPoints: ["Total size", "Segments"],
            targetWords: 800,
            evidenceRequirements: { minReferences: 3 },
          },
        ],
        executionPlan: {
          parallelGroups: [["sec-1"]],
          estimatedTotalWords: 800,
        },
      };

      aiFacade.getReasoningModel.mockResolvedValue({
        id: "deepseek-r1",
        name: "DeepSeek R1",
        provider: "deepseek",
        isReasoning: true,
      });
      aiFacade.chat.mockResolvedValue({
        content: JSON.stringify(mockOutline),
        isError: false,
      });

      // Act
      const result = await service.planDimensionOutline(
        topic,
        dimension,
        evidenceSummary,
      );

      // Assert
      expect(result).toBeDefined();
      expect(result.sections).toHaveLength(1);
      expect(result.sections[0].title).toBe("Current Market Size");
      expect(aiFacade.chat).toHaveBeenCalledWith(
        expect.objectContaining({
          model: "deepseek-r1",
          taskProfile: expect.objectContaining({
            creativity: "medium",
            outputLength: "long",
          }),
        }),
      );
    });

    it("should include other dimensions in context for coordination", async () => {
      // Arrange
      const topic = { name: "AI Market", type: "MACRO", description: null };
      const dimension = { name: "Market Size", description: null };
      const evidenceSummary = "Evidence...";
      const otherDimensions = [
        { name: "Competitive Analysis", description: "Competition" },
        { name: "Technology Trends", description: null },
      ];

      const mockOutline = {
        intentUnderstanding: { coreQuestion: "Test" },
        sections: [{ id: "sec-1", title: "Test", targetWords: 800 }],
        executionPlan: { parallelGroups: [], estimatedTotalWords: 800 },
      };

      aiFacade.getReasoningModel.mockResolvedValue({
        id: "deepseek-r1",
        name: "DeepSeek R1",
        provider: "deepseek",
        isReasoning: true,
      });
      aiFacade.chat.mockResolvedValue({
        content: JSON.stringify(mockOutline),
        isError: false,
      });

      // Act
      const result = await service.planDimensionOutline(
        topic,
        dimension,
        evidenceSummary,
        undefined,
        otherDimensions,
      );

      // Assert
      expect(result).toBeDefined();
      expect(aiFacade.chat).toHaveBeenCalledWith(
        expect.objectContaining({
          messages: expect.arrayContaining([
            expect.objectContaining({
              content: expect.stringContaining("Competitive Analysis"),
            }),
          ]),
        }),
      );
    });

    it("should retry on HTML error response", async () => {
      // Arrange
      const topic = { name: "Test", type: "MACRO", description: null };
      const dimension = { name: "Test Dimension", description: null };
      const evidenceSummary = "Evidence";

      const validOutline = {
        intentUnderstanding: { coreQuestion: "Test" },
        sections: [{ id: "sec-1", title: "Test", targetWords: 800 }],
        executionPlan: { parallelGroups: [], estimatedTotalWords: 800 },
      };

      aiFacade.getReasoningModel.mockResolvedValue({
        id: "deepseek-r1",
        name: "DeepSeek R1",
        provider: "deepseek",
        isReasoning: true,
      });
      aiFacade.chat
        .mockResolvedValueOnce({
          content: "<!DOCTYPE html><html>Error</html>",
          isError: false,
        })
        .mockResolvedValueOnce({
          content: JSON.stringify(validOutline),
          isError: false,
        });

      // Act
      const result = await service.planDimensionOutline(
        topic,
        dimension,
        evidenceSummary,
      );

      // Assert
      expect(result).toBeDefined();
      expect(result.sections).toHaveLength(1);
      expect(aiFacade.chat).toHaveBeenCalledTimes(2);
    });

    it("should throw error after all retries fail", async () => {
      // Arrange
      const topic = { name: "Test", type: "MACRO", description: null };
      const dimension = { name: "Test", description: null };
      const evidenceSummary = "Evidence";

      aiFacade.getReasoningModel.mockResolvedValue({
        id: "deepseek-r1",
        name: "DeepSeek R1",
        provider: "deepseek",
        isReasoning: true,
      });
      aiFacade.chat.mockResolvedValue({
        content: "Invalid JSON",
        isError: false,
      });

      // Act & Assert
      await expect(
        service.planDimensionOutline(topic, dimension, evidenceSummary),
      ).rejects.toThrow("Failed to parse dimension outline after 3 attempts");
      expect(aiFacade.chat).toHaveBeenCalledTimes(3);
    }, 10000); // Increase timeout to 10s for retry delays
  });
});
