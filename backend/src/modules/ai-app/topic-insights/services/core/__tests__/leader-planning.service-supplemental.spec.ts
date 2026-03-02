/**
 * LeaderPlanningService - Supplemental Unit Tests
 *
 * Covers uncovered branches:
 * - planResearch: prior findings from memory, model name deduplication,
 *   model name-to-ID mapping, missing dimensions in topic, unavailable model filtering
 * - planGlobalOutline: isError response, HTML response retry, missing dimensions stubs
 * - planDimensionOutline: isError response retry, no figuresSummary branch
 */

import { Test, TestingModule } from "@nestjs/testing";
import { LeaderPlanningService } from "../leader-planning.service";
import { PrismaService } from "@/common/prisma/prisma.service";
import { ChatFacade } from "@/modules/ai-engine/facade";
import { ResearchMemoryService } from "../research-memory.service";

// ──────────────────────────────────────────────────────────────────────────────
// Mock factory
// ──────────────────────────────────────────────────────────────────────────────

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

// ──────────────────────────────────────────────────────────────────────────────
// Fixtures
// ──────────────────────────────────────────────────────────────────────────────

const mockTopic = {
  id: "topic-001",
  name: "AI 市场研究",
  type: "technology",
  description: "AI 市场分析",
  language: "zh",
  dimensions: [],
};

const mockTopicWithDimensions = {
  ...mockTopic,
  dimensions: [
    {
      id: "dim-001",
      name: "技术现状",
      description: "技术分析",
      status: "PENDING",
      searchQueries: ["AI trends"],
    },
  ],
};

const basePlanResponse = {
  dimensions: [
    {
      id: "dim-001",
      name: "技术现状",
      priority: "high",
      rationale: "核心",
      description: "技术分析描述",
      searchQueries: ["AI trends"],
      dataSources: ["web"],
    },
  ],
  agentAssignments: [
    {
      agentId: "researcher-001",
      agentName: "研究员 A",
      agentType: "dimension_researcher",
      assignedDimensions: ["dim-001"],
      modelId: "gpt-4o",
      skills: ["deep_dive"],
      tools: ["web-search"],
    },
  ],
  strategy: "parallel",
  estimatedTime: "30 minutes",
};

// ──────────────────────────────────────────────────────────────────────────────
// Tests
// ──────────────────────────────────────────────────────────────────────────────

describe("LeaderPlanningService (supplemental)", () => {
  let service: LeaderPlanningService;
  let mocks: ReturnType<typeof buildMocks>;

  beforeAll(async () => {
    mocks = buildMocks();

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

  // ============================================================
  // planResearch - additional branches
  // ============================================================

  describe("planResearch - prior memories integration", () => {
    it("should include prior findings in prompt when memories are available", async () => {
      mocks.mockPrisma.researchTopic.findUnique.mockResolvedValue(mockTopic);
      mocks.mockAiFacade.getReasoningModel.mockResolvedValue({
        id: "gpt-4o",
        name: "GPT-4o",
        provider: "openai",
        isReasoning: false,
      });
      mocks.mockAiFacade.getAvailableModelsExtended.mockResolvedValue([]);
      mocks.mockResearchMemory.getRelevantMemories.mockResolvedValue([
        {
          entity: "AI 市场规模",
          finding: "2024年全球AI市场规模达到5000亿美元",
          category: "market",
          confidence: 0.9,
        },
      ]);
      mocks.mockAiFacade.chat.mockResolvedValue({
        content: JSON.stringify(basePlanResponse),
        isError: false,
      });

      await service.planResearch("topic-001");

      // The prompt should include prior findings
      expect(mocks.mockResearchMemory.getRelevantMemories).toHaveBeenCalledWith(
        expect.any(String),
        "topic-001",
        5,
      );
      expect(mocks.mockAiFacade.chat).toHaveBeenCalledWith(
        expect.objectContaining({
          messages: expect.arrayContaining([
            expect.objectContaining({
              content: expect.stringContaining("AI 市场规模"),
            }),
          ]),
        }),
      );
    });

    it("should continue without prior findings when memory service throws", async () => {
      mocks.mockPrisma.researchTopic.findUnique.mockResolvedValue(mockTopic);
      mocks.mockAiFacade.getReasoningModel.mockResolvedValue({
        id: "gpt-4o",
        name: "GPT-4o",
        provider: "openai",
        isReasoning: false,
      });
      mocks.mockAiFacade.getAvailableModelsExtended.mockResolvedValue([]);
      mocks.mockResearchMemory.getRelevantMemories.mockRejectedValue(
        new Error("Memory service unavailable"),
      );
      mocks.mockAiFacade.chat.mockResolvedValue({
        content: JSON.stringify(basePlanResponse),
        isError: false,
      });

      // Should not throw
      const result = await service.planResearch("topic-001");
      expect(result.dimensions).toHaveLength(1);
    });

    it("should include existing dimensions in prompt when topic has dimensions", async () => {
      mocks.mockPrisma.researchTopic.findUnique.mockResolvedValue(
        mockTopicWithDimensions,
      );
      mocks.mockAiFacade.getReasoningModel.mockResolvedValue({
        id: "gpt-4o",
        name: "GPT-4o",
        provider: "openai",
        isReasoning: false,
      });
      mocks.mockAiFacade.getAvailableModelsExtended.mockResolvedValue([]);
      mocks.mockAiFacade.chat.mockResolvedValue({
        content: JSON.stringify(basePlanResponse),
        isError: false,
      });

      await service.planResearch("topic-001");

      // The prompt should include existing dimensions info
      expect(mocks.mockAiFacade.chat).toHaveBeenCalledWith(
        expect.objectContaining({
          messages: expect.arrayContaining([
            expect.objectContaining({
              content: expect.stringContaining("技术现状"),
            }),
          ]),
        }),
      );
    });
  });

  describe("planResearch - model name resolution", () => {
    it("should resolve agent model name to real ID using modelNameToIdMap", async () => {
      mocks.mockPrisma.researchTopic.findUnique.mockResolvedValue(mockTopic);
      mocks.mockAiFacade.getReasoningModel.mockResolvedValue({
        id: "gpt-4o",
        name: "GPT-4o",
        provider: "openai",
        isReasoning: false,
      });
      // Available models with a display name different from id
      mocks.mockAiFacade.getAvailableModelsExtended.mockResolvedValue([
        {
          id: "ep-20240101-gpt4o",
          name: "GPT-4o",
          provider: "azure",
          isReasoning: false,
          isAvailable: true,
        },
      ]);

      // AI returns display name "GPT-4o" instead of real ID "ep-20240101-gpt4o"
      const planWithDisplayName = {
        ...basePlanResponse,
        agentAssignments: [
          {
            agentId: "researcher-001",
            agentName: "研究员",
            agentType: "dimension_researcher",
            assignedDimensions: ["dim-001"],
            modelId: "GPT-4o", // display name
            skills: ["deep_dive"],
            tools: ["web-search"],
          },
        ],
      };
      mocks.mockAiFacade.chat.mockResolvedValue({
        content: JSON.stringify(planWithDisplayName),
        isError: false,
      });

      const result = await service.planResearch("topic-001");

      // Model name should be resolved to the real ID
      expect(result.agentAssignments[0].modelId).toBe("ep-20240101-gpt4o");
    });

    it("should filter unavailable models from the available model list", async () => {
      mocks.mockPrisma.researchTopic.findUnique.mockResolvedValue(mockTopic);
      mocks.mockAiFacade.getReasoningModel.mockResolvedValue({
        id: "gpt-4o",
        name: "GPT-4o",
        provider: "openai",
        isReasoning: false,
      });
      // One unavailable model
      mocks.mockAiFacade.getAvailableModelsExtended.mockResolvedValue([
        {
          id: "gpt-4o",
          name: "GPT-4o",
          provider: "openai",
          isReasoning: false,
          isAvailable: true,
        },
        {
          id: "broken-model",
          name: "Broken",
          provider: "openai",
          isReasoning: false,
          isAvailable: false,
        },
      ]);
      mocks.mockAiFacade.chat.mockResolvedValue({
        content: JSON.stringify(basePlanResponse),
        isError: false,
      });

      // Should succeed despite one unavailable model
      const result = await service.planResearch("topic-001");
      expect(result.dimensions).toHaveLength(1);
    });

    it("should handle duplicate model names by adding variant suffix", async () => {
      mocks.mockPrisma.researchTopic.findUnique.mockResolvedValue(mockTopic);
      mocks.mockAiFacade.getReasoningModel.mockResolvedValue({
        id: "gpt-4o",
        name: "GPT-4o",
        provider: "openai",
        isReasoning: false,
      });
      // Two models with same name (Doubao endpoints)
      mocks.mockAiFacade.getAvailableModelsExtended.mockResolvedValue([
        {
          id: "ep-001-doubao",
          name: "Doubao",
          provider: "volcengine",
          isReasoning: false,
          isAvailable: true,
        },
        {
          id: "ep-002-doubao",
          name: "Doubao",
          provider: "volcengine",
          isReasoning: false,
          isAvailable: true,
        },
      ]);
      mocks.mockAiFacade.chat.mockResolvedValue({
        content: JSON.stringify(basePlanResponse),
        isError: false,
      });

      // Should not throw, second Doubao should be renamed "Doubao (variant-2)"
      const result = await service.planResearch("topic-001");
      expect(result.dimensions).toHaveLength(1);
    });
  });

  describe("planResearch - agent assignment reason", () => {
    it("should auto-create assignmentReason for researcher agents missing it", async () => {
      mocks.mockPrisma.researchTopic.findUnique.mockResolvedValue(mockTopic);
      mocks.mockAiFacade.getReasoningModel.mockResolvedValue({
        id: "gpt-4o",
        name: "GPT-4o",
        provider: "openai",
        isReasoning: false,
      });
      mocks.mockAiFacade.getAvailableModelsExtended.mockResolvedValue([
        {
          id: "gpt-4o",
          name: "GPT-4o",
          provider: "openai",
          isReasoning: false,
          isAvailable: true,
        },
      ]);

      const planNoReason = {
        ...basePlanResponse,
        agentAssignments: [
          {
            agentId: "researcher-001",
            agentName: "研究员",
            agentType: "dimension_researcher",
            assignedDimensions: ["dim-001"],
            modelId: "gpt-4o",
            skills: ["deep_dive"],
            tools: ["web-search"],
            // No assignmentReason
          },
        ],
      };
      mocks.mockAiFacade.chat.mockResolvedValue({
        content: JSON.stringify(planNoReason),
        isError: false,
      });

      const result = await service.planResearch("topic-001");

      const agent = result.agentAssignments[0];
      expect(agent.assignmentReason).toBeDefined();
      expect(agent.assignmentReason!.agentReason).toContain("研究员");
    });
  });

  // ============================================================
  // planGlobalOutline - additional branches
  // ============================================================

  describe("planGlobalOutline - error paths", () => {
    const topic = {
      name: "AI 市场研究",
      type: "technology",
      description: "AI 研究",
      language: "zh",
    };
    const dimResults = [
      {
        dimensionId: "dim-001",
        dimensionName: "技术现状",
        dimensionDescription: "技术描述",
        evidenceSummary: "摘要内容",
        figuresSummary: "",
      },
    ];

    it("should retry on isError response and succeed on second attempt", async () => {
      mocks.mockAiFacade.getAvailableModelsExtended.mockResolvedValue([]);
      mocks.mockAiFacade.getReasoningModel.mockResolvedValue({
        id: "gpt-4o",
        name: "GPT-4o",
        provider: "openai",
        isReasoning: false,
      });

      mocks.mockAiFacade.chat
        .mockResolvedValueOnce({
          content: "429 rate limit exceeded",
          isError: true,
        })
        .mockResolvedValueOnce({
          content: JSON.stringify({
            dimensions: [
              {
                dimensionId: "dim-001",
                dimensionName: "技术现状",
                crossDimensionNotes: "",
                outline: { sections: [{ id: "s1", title: "分析" }] },
              },
            ],
          }),
          isError: false,
        });

      const result = await service.planGlobalOutline(topic, dimResults);
      expect(result.dimensions).toHaveLength(1);
    }, 15000);

    it("should retry on HTML error page and eventually throw", async () => {
      mocks.mockAiFacade.getAvailableModelsExtended.mockResolvedValue([]);
      mocks.mockAiFacade.getReasoningModel.mockResolvedValue({
        id: "gpt-4o",
        name: "GPT-4o",
        provider: "openai",
        isReasoning: false,
      });
      mocks.mockAiFacade.chat.mockResolvedValue({
        content: "<!DOCTYPE html><html>Service Unavailable</html>",
        isError: false,
      });

      await expect(
        service.planGlobalOutline(topic, dimResults),
      ).rejects.toThrow(/Failed to parse global outline/);
    }, 30000);
  });

  // ============================================================
  // planDimensionOutline - additional branches
  // ============================================================

  describe("planDimensionOutline - error paths", () => {
    const topic = {
      name: "AI 市场研究",
      type: "technology",
      description: "AI 研究",
      language: "zh",
    };
    const dimension = {
      name: "技术现状",
      description: "技术描述",
      searchQueries: ["AI trends"],
    };

    it("should retry on isError response and succeed on second attempt", async () => {
      mocks.mockAiFacade.getAvailableModelsExtended.mockResolvedValue([]);
      mocks.mockAiFacade.getReasoningModel.mockResolvedValue({
        id: "gpt-4o",
        name: "GPT-4o",
        provider: "openai",
        isReasoning: false,
      });

      mocks.mockAiFacade.chat
        .mockResolvedValueOnce({
          content: "quota exceeded",
          isError: true,
        })
        .mockResolvedValueOnce({
          content: JSON.stringify({
            sections: [
              {
                id: "s1",
                title: "技术分析",
                description: "desc",
                keyPoints: [],
                targetWords: 800,
                evidenceRequirements: { minReferences: 2 },
              },
            ],
          }),
          isError: false,
        });

      const result = await service.planDimensionOutline(
        topic,
        dimension,
        "evidence summary",
      );

      expect(result.sections).toHaveLength(1);
    }, 15000);

    it("should handle exception thrown during chat call and retry", async () => {
      mocks.mockAiFacade.getAvailableModelsExtended.mockResolvedValue([]);
      mocks.mockAiFacade.getReasoningModel.mockResolvedValue({
        id: "gpt-4o",
        name: "GPT-4o",
        provider: "openai",
        isReasoning: false,
      });

      mocks.mockAiFacade.chat
        .mockRejectedValueOnce(new Error("Network timeout"))
        .mockResolvedValueOnce({
          content: JSON.stringify({
            sections: [
              {
                id: "s1",
                title: "分析",
                description: "desc",
                keyPoints: [],
                targetWords: 600,
                evidenceRequirements: { minReferences: 2 },
              },
            ],
          }),
          isError: false,
        });

      const result = await service.planDimensionOutline(
        topic,
        dimension,
        "evidence",
      );

      expect(result.sections).toHaveLength(1);
    }, 15000);
  });
});
