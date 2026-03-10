/**
 * LeaderPlanningService Unit Tests
 */

import { Test, TestingModule } from "@nestjs/testing";
import { LeaderPlanningService } from "../leader-planning.service";
import { PrismaService } from "@/common/prisma/prisma.service";
import { ChatFacade } from "@/modules/ai-engine/facade";
import { ResearchMemoryService } from "../research-memory.service";

// ─── Mocks ───────────────────────────────────────────────────────────────────

function buildMocks() {
  const mockPrisma = {
    researchTopic: {
      findUnique: jest.fn(),
    },
  };

  const mockAiFacade = {
    getAvailableModelsExtended: jest.fn().mockResolvedValue([
      {
        id: "gpt-4o",
        name: "GPT-4o",
        provider: "openai",
        isReasoning: false,
        isAvailable: true,
      },
    ]),
    getReasoningModel: jest.fn().mockResolvedValue({
      id: "gpt-4o",
      name: "GPT-4o",
      provider: "openai",
      isReasoning: false,
    }),
    chat: jest.fn(),
  };

  const mockResearchMemory = {
    getRelevantMemories: jest.fn().mockResolvedValue([]),
  };

  return { mockPrisma, mockAiFacade, mockResearchMemory };
}

const mockLeaderPlanResponse = {
  taskUnderstanding: { topic: "AI Research", scope: "global", objectives: [] },
  dimensions: [
    {
      id: "dim-1",
      name: "Market Analysis",
      description: "Analyze market trends",
      priority: 1,
      searchQueries: ["AI market size"],
      dataSources: ["web"],
    },
  ],
  executionStrategy: { parallelism: 3, priorityOrder: ["dim-1"] },
  agentAssignments: [
    {
      agentId: "researcher-1",
      agentName: "AI Researcher",
      agentType: "dimension_researcher",
      modelId: "gpt-4o",
      assignedDimensions: ["dim-1"],
      skills: ["deep_dive"],
      tools: ["web-search"],
    },
    {
      agentId: "reviewer-1",
      agentName: "Reviewer",
      agentType: "quality_reviewer",
      modelId: "gpt-4o",
      skills: [],
      tools: [],
    },
    {
      agentId: "writer-1",
      agentName: "Writer",
      agentType: "report_writer",
      modelId: "gpt-4o",
      skills: [],
      tools: [],
    },
  ],
};

const mockTopic = {
  id: "topic-1",
  name: "AI Research",
  type: "TECHNOLOGY",
  description: "Research on AI",
  language: "zh",
  dimensions: [],
};

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("LeaderPlanningService", () => {
  let service: LeaderPlanningService;
  let prisma: ReturnType<typeof buildMocks>["mockPrisma"];
  let aiFacade: ReturnType<typeof buildMocks>["mockAiFacade"];

  beforeEach(async () => {
    const mocks = buildMocks();
    prisma = mocks.mockPrisma;
    aiFacade = mocks.mockAiFacade;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        LeaderPlanningService,
        { provide: PrismaService, useValue: mocks.mockPrisma },
        { provide: ChatFacade, useValue: mocks.mockAiFacade },
        { provide: ResearchMemoryService, useValue: mocks.mockResearchMemory },
      ],
    }).compile();

    service = module.get<LeaderPlanningService>(LeaderPlanningService);
  });

  afterEach(() => jest.clearAllMocks());

  // ─── getReasoningModel ──────────────────────────────────────────────────────

  describe("getReasoningModel", () => {
    it("should return reasoning model info from facade", async () => {
      const result = await service.getReasoningModel();
      expect(result).not.toBeNull();
      expect(result!.modelId).toBe("gpt-4o");
      expect(result!.provider).toBe("openai");
    });

    it("should return null when facade returns no model", async () => {
      aiFacade.getReasoningModel.mockResolvedValue(null);
      const result = await service.getReasoningModel();
      expect(result).toBeNull();
    });
  });

  // ─── planResearch ───────────────────────────────────────────────────────────

  describe("planResearch", () => {
    it("should throw error when topic not found", async () => {
      prisma.researchTopic.findUnique.mockResolvedValue(null);

      await expect(service.planResearch("nonexistent")).rejects.toThrow(
        "Topic nonexistent not found",
      );
    });

    it("should throw error when no reasoning model available", async () => {
      prisma.researchTopic.findUnique.mockResolvedValue(mockTopic);
      aiFacade.getReasoningModel.mockResolvedValue(null);

      await expect(service.planResearch("topic-1")).rejects.toThrow(
        "No reasoning model available",
      );
    });

    it("should return leader plan on successful AI response", async () => {
      prisma.researchTopic.findUnique.mockResolvedValue(mockTopic);
      aiFacade.chat.mockResolvedValue({
        content: JSON.stringify(mockLeaderPlanResponse),
        isError: false,
      });

      const result = await service.planResearch(
        "topic-1",
        "Research AI trends",
      );
      expect(result.dimensions).toHaveLength(1);
      expect(result.dimensions[0].name).toBe("Market Analysis");
    });

    it("should throw error when AI returns empty response", async () => {
      prisma.researchTopic.findUnique.mockResolvedValue(mockTopic);
      aiFacade.chat.mockResolvedValue({
        content: "",
        isError: false,
      });

      await expect(service.planResearch("topic-1")).rejects.toThrow(
        "AI 返回空响应",
      );
    });

    it("should throw error when AI call fails", async () => {
      prisma.researchTopic.findUnique.mockResolvedValue(mockTopic);
      aiFacade.chat.mockRejectedValue(new Error("API timeout"));

      await expect(service.planResearch("topic-1")).rejects.toThrow(
        "AI 调用失败",
      );
    });

    it("should auto-assign default skills to researchers without skills", async () => {
      const planWithNoSkills = {
        ...mockLeaderPlanResponse,
        agentAssignments: [
          {
            agentId: "researcher-1",
            agentName: "Researcher",
            agentType: "dimension_researcher",
            modelId: "gpt-4o",
            assignedDimensions: ["dim-1"],
            skills: [],
            tools: [],
          },
          {
            agentId: "reviewer-1",
            agentType: "quality_reviewer",
            modelId: "gpt-4o",
            skills: [],
            tools: [],
          },
          {
            agentId: "writer-1",
            agentType: "report_writer",
            modelId: "gpt-4o",
            skills: [],
            tools: [],
          },
        ],
      };

      prisma.researchTopic.findUnique.mockResolvedValue(mockTopic);
      aiFacade.chat.mockResolvedValue({
        content: JSON.stringify(planWithNoSkills),
        isError: false,
      });

      const result = await service.planResearch("topic-1");
      const researcher = result.agentAssignments.find(
        (a) => a.agentType === "dimension_researcher",
      );
      // ★ 基于维度内容智能选择：dim-1 "Market Analysis" → 包含 "趋势" 相关关键词
      expect(researcher?.skills).toContain("deep_dive");
      expect(researcher?.skills).toContain("synthesis");
      expect(researcher?.tools).toContain("web-search");
    });

    it("should select dimension-aware skills based on dimension content", async () => {
      const planWithTrendDimension = {
        ...mockLeaderPlanResponse,
        dimensions: [
          {
            id: "dim-trend",
            name: "市场趋势分析",
            description: "分析市场增长趋势和竞争格局",
            priority: 1,
            searchQueries: ["market trends"],
            dataSources: ["web"],
          },
        ],
        agentAssignments: [
          {
            agentId: "researcher-1",
            agentName: "Researcher",
            agentType: "dimension_researcher",
            modelId: "gpt-4o",
            assignedDimensions: ["dim-trend"],
            skills: [],
            tools: [],
          },
        ],
      };

      prisma.researchTopic.findUnique.mockResolvedValue(mockTopic);
      aiFacade.chat.mockResolvedValue({
        content: JSON.stringify(planWithTrendDimension),
        isError: false,
      });

      const result = await service.planResearch("topic-1");
      const researcher = result.agentAssignments.find(
        (a) => a.agentType === "dimension_researcher",
      );
      // 维度名包含 "趋势" 和 "竞争" → 应选择 trend_analysis 和 competitive_analysis
      expect(researcher?.skills).toContain("trend_analysis");
      expect(researcher?.skills).toContain("competitive_analysis");
    });
  });

  // ─── planGlobalOutline ──────────────────────────────────────────────────────

  describe("planGlobalOutline", () => {
    const mockTopic = {
      name: "AI Research",
      type: "TECHNOLOGY",
      description: "AI study",
      language: "zh",
    };

    it("should throw when all retries fail", async () => {
      aiFacade.chat.mockResolvedValue({
        content: "invalid json",
        isError: false,
      });

      await expect(
        service.planGlobalOutline(mockTopic, [
          {
            dimensionId: "dim-1",
            dimensionName: "Market",
            evidenceSummary: "Evidence...",
            figuresSummary: "",
          },
        ]),
      ).rejects.toThrow(/Failed to parse global outline/);
    }, 20000);

    it("should return global outline with dimensions on success", async () => {
      const mockOutline = {
        dimensions: [
          {
            dimensionId: "dim-1",
            dimensionName: "Market",
            crossDimensionNotes: "",
            outline: {
              intentUnderstanding: {
                coreQuestion: "Market analysis",
                scope: { included: ["Market"], excluded: [] },
                expectedDepth: "detailed",
                targetAudience: "general",
                keyFocusAreas: ["Market"],
              },
              sections: [
                {
                  id: "s-1",
                  title: "Market Overview",
                  description: "Overview",
                  keyPoints: ["Key point"],
                  targetWords: 1000,
                  evidenceRequirements: { minReferences: 3 },
                },
              ],
              executionPlan: {
                parallelGroups: [["s-1"]],
                estimatedTotalWords: 1000,
              },
            },
          },
        ],
      };

      aiFacade.chat.mockResolvedValue({
        content: JSON.stringify(mockOutline),
        isError: false,
      });

      const result = await service.planGlobalOutline(mockTopic, [
        {
          dimensionId: "dim-1",
          dimensionName: "Market",
          evidenceSummary: "Evidence...",
          figuresSummary: "",
        },
      ]);

      expect(result.dimensions).toHaveLength(1);
      expect(result.dimensions[0].dimensionName).toBe("Market");
    });
  });

  // ─── planDimensionOutline ───────────────────────────────────────────────────

  describe("planDimensionOutline", () => {
    const mockTopic = {
      name: "AI Research",
      type: "TECHNOLOGY",
      description: "AI study",
      language: "zh",
    };
    const mockDimension = {
      name: "Market Analysis",
      description: "Market research",
      searchQueries: [],
    };

    it("should throw when all retries fail", async () => {
      aiFacade.chat.mockResolvedValue({
        content: "no json here",
        isError: false,
      });

      await expect(
        service.planDimensionOutline(
          mockTopic,
          mockDimension,
          "evidence summary",
        ),
      ).rejects.toThrow(/Failed to parse dimension outline/);
    }, 20000);

    it("should return outline with sections on success", async () => {
      const mockOutline = {
        intentUnderstanding: {
          coreQuestion: "Market analysis",
          scope: { included: ["Market"], excluded: [] },
          expectedDepth: "detailed",
          targetAudience: "general",
          keyFocusAreas: ["Market"],
        },
        sections: [
          {
            id: "s-1",
            title: "Market Size",
            description: "Analyze market size",
            keyPoints: ["Size data"],
            targetWords: 800,
            evidenceRequirements: { minReferences: 3 },
          },
        ],
        executionPlan: { parallelGroups: [["s-1"]], estimatedTotalWords: 800 },
      };

      aiFacade.chat.mockResolvedValue({
        content: JSON.stringify(mockOutline),
        isError: false,
      });

      const result = await service.planDimensionOutline(
        mockTopic,
        mockDimension,
        "Market is large",
      );
      expect(result.sections).toHaveLength(1);
    });
  });
});
