/**
 * ResearchLeaderService - Global Outline Tests
 *
 * Tests for planGlobalOutline method with retry logic and validation
 * Type checking is disabled due to Jest mock compatibility issues.
 */

import {
  describe,
  it,
  expect,
  beforeEach,
  afterEach,
  jest,
} from "@jest/globals";
import { Test, TestingModule } from "@nestjs/testing";
import { ResearchLeaderService } from "../../services/core/research-leader.service";
import {
  ChatFacade,
  AgentFacade,
  ToolFacade,
} from "@/modules/ai-engine/facade";
import { PrismaService } from "@/common/prisma/prisma.service";
import { ResearchEventEmitterService } from "../../services/core/research-event-emitter.service";
import { LeaderToolService } from "../../services/data/leader-tool.service";
import { createMockPrisma, createMockAiEngineFacade } from "../mocks";

describe("ResearchLeaderService - planGlobalOutline", () => {
  let service: ResearchLeaderService;
  let mockAiFacade: ReturnType<typeof createMockAiEngineFacade>;
  let mockPrisma: ReturnType<typeof createMockPrisma>;

  // Mock all required dependencies
  const mockResearchEventEmitter = {
    emitLeaderResponse: jest.fn(),
  };
  const mockLeaderToolService = {
    getAvailableTools: jest.fn<() => Promise<unknown>>().mockResolvedValue([]),
  };
  beforeEach(async () => {
    mockPrisma = createMockPrisma();
    mockAiFacade = createMockAiEngineFacade();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ResearchLeaderService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: ChatFacade, useValue: mockAiFacade },
        { provide: AgentFacade, useValue: mockAiFacade },
        { provide: ToolFacade, useValue: mockAiFacade },
        {
          provide: ResearchEventEmitterService,
          useValue: mockResearchEventEmitter,
        },
        { provide: LeaderToolService, useValue: mockLeaderToolService },
      ],
    }).compile();

    service = module.get<ResearchLeaderService>(ResearchLeaderService);

    // Mock getReasoningModel method
    (service as any)["getReasoningModel"] = jest
      .fn<() => Promise<unknown>>()
      .mockResolvedValue({
        modelId: "gpt-4o",
        name: "GPT-4o",
      });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  // ==================== planGlobalOutline Tests ====================

  describe("planGlobalOutline", () => {
    const mockTopic = {
      name: "AI Market Analysis",
      type: "market_research",
      description: "Analysis of the AI market landscape",
    };

    const mockDimensionSearchResults = [
      {
        dimensionId: "dim-1",
        dimensionName: "Market Size",
        dimensionDescription: "Overall market size and growth",
        evidenceSummary: "Market reached $100B in 2024 with 25% YoY growth",
        figuresSummary: "Figure: Market size trend 2020-2024",
        searchQueries: ["AI market size 2024", "AI market growth"],
      },
      {
        dimensionId: "dim-2",
        dimensionName: "Key Players",
        dimensionDescription: "Major companies in the space",
        evidenceSummary:
          "Top 5 players: OpenAI, Google, Anthropic, Microsoft, Meta",
        figuresSummary: "Figure: Market share by company",
        searchQueries: ["AI companies", "AI market leaders"],
      },
    ];

    it("should successfully parse a valid GlobalOutline JSON from AI response", async () => {
      // Arrange
      const mockGlobalOutline = {
        dimensions: [
          {
            dimensionId: "dim-1",
            dimensionName: "Market Size",
            crossDimensionNotes: "Focus on quantitative data",
            outline: {
              intentUnderstanding: {
                coreQuestion: "What is the market size?",
                scope: { included: ["Market data"], excluded: [] },
                expectedDepth: "detailed",
                targetAudience: "business",
                keyFocusAreas: ["Market size", "Growth rate"],
              },
              sections: [
                {
                  id: "sec-1",
                  title: "Market Overview",
                  description: "Overall market size analysis",
                  keyPoints: ["Market size $100B", "Growth 25% YoY"],
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
            dimensionName: "Key Players",
            crossDimensionNotes: "Avoid duplicating market size data",
            outline: {
              intentUnderstanding: {
                coreQuestion: "Who are the key players?",
                scope: { included: ["Companies"], excluded: [] },
                expectedDepth: "detailed",
                targetAudience: "business",
                keyFocusAreas: ["Major companies"],
              },
              sections: [
                {
                  id: "sec-2",
                  title: "Competitive Landscape",
                  description: "Major players analysis",
                  keyPoints: ["Top 5 companies"],
                  targetWords: 600,
                  evidenceRequirements: { minReferences: 2 },
                },
              ],
              executionPlan: {
                parallelGroups: [["sec-2"]],
                estimatedTotalWords: 600,
              },
            },
          },
        ],
        globalThemes: ["AI market growth", "Increasing competition"],
        deduplicationRules: ["Market size data in Market Size dimension only"],
      };

      mockAiFacade.chat.mockResolvedValue({
        content: JSON.stringify(mockGlobalOutline),
        usage: { promptTokens: 2000, completionTokens: 800, totalTokens: 2800 },
        isError: false,
      });

      // Act
      const result = await service.planGlobalOutline(
        mockTopic,
        mockDimensionSearchResults,
      );

      // Assert
      expect(result).toBeDefined();
      expect(result.dimensions).toHaveLength(2);
      expect(result.dimensions[0].dimensionName).toBe("Market Size");
      expect(result.dimensions[1].dimensionName).toBe("Key Players");
      expect(result.globalThemes).toContain("AI market growth");
      expect(mockAiFacade.chat).toHaveBeenCalledTimes(1);
    });

    it("should add stub outlines for missing dimensions (validation fix)", async () => {
      // Arrange - AI returns outline for only 1 dimension instead of 2
      const incompleteOutline = {
        dimensions: [
          {
            dimensionId: "dim-1",
            dimensionName: "Market Size",
            crossDimensionNotes: "Focus on quantitative data",
            outline: {
              intentUnderstanding: {
                coreQuestion: "What is the market size?",
                scope: { included: ["Market data"], excluded: [] },
                expectedDepth: "detailed",
                targetAudience: "business",
                keyFocusAreas: ["Market size"],
              },
              sections: [
                {
                  id: "sec-1",
                  title: "Market Overview",
                  description: "Market size analysis",
                  keyPoints: ["Market size"],
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
          // Missing "Key Players" dimension
        ],
        globalThemes: ["AI market growth"],
        deduplicationRules: [],
      };

      mockAiFacade.chat.mockResolvedValue({
        content: JSON.stringify(incompleteOutline),
        usage: { promptTokens: 2000, completionTokens: 800, totalTokens: 2800 },
        isError: false,
      });

      // Act
      const result = await service.planGlobalOutline(
        mockTopic,
        mockDimensionSearchResults,
      );

      // Assert
      expect(result.dimensions).toHaveLength(2); // Should have stub for missing dimension
      const stubDimension = result.dimensions.find(
        (d) => d.dimensionName === "Key Players",
      );
      expect(stubDimension).toBeDefined();
      expect(stubDimension!.outline.sections).toHaveLength(1);
      expect(stubDimension!.outline.sections[0].id).toContain("stub-");
    });

    it("should retry on API error up to 3 times", async () => {
      // Arrange
      const validOutline = {
        dimensions: mockDimensionSearchResults.map((dim) => ({
          dimensionId: dim.dimensionId,
          dimensionName: dim.dimensionName,
          crossDimensionNotes: "",
          outline: {
            intentUnderstanding: {
              coreQuestion: dim.dimensionName,
              scope: { included: [dim.dimensionName], excluded: [] },
              expectedDepth: "detailed",
              targetAudience: "general",
              keyFocusAreas: [dim.dimensionName],
            },
            sections: [
              {
                id: `sec-${dim.dimensionId}`,
                title: dim.dimensionName,
                description: "Analysis",
                keyPoints: ["Analysis"],
                targetWords: 800,
                evidenceRequirements: { minReferences: 2 },
              },
            ],
            executionPlan: {
              parallelGroups: [[`sec-${dim.dimensionId}`]],
              estimatedTotalWords: 800,
            },
          },
        })),
        globalThemes: [],
        deduplicationRules: [],
      };

      // Fail first 2 attempts, succeed on 3rd
      mockAiFacade.chat
        .mockResolvedValueOnce({
          content: "API Error",
          usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
          isError: true,
        })
        .mockResolvedValueOnce({
          content: "API Error",
          usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
          isError: true,
        })
        .mockResolvedValueOnce({
          content: JSON.stringify(validOutline),
          usage: {
            promptTokens: 2000,
            completionTokens: 800,
            totalTokens: 2800,
          },
          isError: false,
        });

      // Act
      const result = await service.planGlobalOutline(
        mockTopic,
        mockDimensionSearchResults,
      );

      // Assert
      expect(mockAiFacade.chat).toHaveBeenCalledTimes(3);
      expect(result).toBeDefined();
      expect(result.dimensions).toHaveLength(2);
    }, 10000); // 10 second timeout for retry tests

    it("should throw after all retries fail", async () => {
      // Arrange - All attempts return errors
      mockAiFacade.chat.mockResolvedValue({
        content: "API Error: Rate limit exceeded",
        usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
        isError: true,
      });

      // Act & Assert
      await expect(
        service.planGlobalOutline(mockTopic, mockDimensionSearchResults),
      ).rejects.toThrow("Failed to parse global outline after 3 attempts");

      expect(mockAiFacade.chat).toHaveBeenCalledTimes(3);
    }, 10000); // 10 second timeout for retry tests

    it("should handle HTML error page response (retries)", async () => {
      // Arrange
      const validOutline = {
        dimensions: mockDimensionSearchResults.map((dim) => ({
          dimensionId: dim.dimensionId,
          dimensionName: dim.dimensionName,
          crossDimensionNotes: "",
          outline: {
            intentUnderstanding: {
              coreQuestion: dim.dimensionName,
              scope: { included: [dim.dimensionName], excluded: [] },
              expectedDepth: "detailed",
              targetAudience: "general",
              keyFocusAreas: [dim.dimensionName],
            },
            sections: [
              {
                id: `sec-${dim.dimensionId}`,
                title: dim.dimensionName,
                description: "Analysis",
                keyPoints: ["Analysis"],
                targetWords: 800,
                evidenceRequirements: { minReferences: 2 },
              },
            ],
            executionPlan: {
              parallelGroups: [[`sec-${dim.dimensionId}`]],
              estimatedTotalWords: 800,
            },
          },
        })),
        globalThemes: [],
        deduplicationRules: [],
      };

      // First attempt returns HTML error page
      mockAiFacade.chat
        .mockResolvedValueOnce({
          content: "<!DOCTYPE html><html><body>Error 502</body></html>",
          usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
          isError: false,
        })
        .mockResolvedValueOnce({
          content: JSON.stringify(validOutline),
          usage: {
            promptTokens: 2000,
            completionTokens: 800,
            totalTokens: 2800,
          },
          isError: false,
        });

      // Act
      const result = await service.planGlobalOutline(
        mockTopic,
        mockDimensionSearchResults,
      );

      // Assert
      expect(mockAiFacade.chat).toHaveBeenCalledTimes(2);
      expect(result).toBeDefined();
      expect(result.dimensions).toHaveLength(2);
    });

    it("should retry on invalid JSON parse", async () => {
      // Arrange
      const validOutline = {
        dimensions: mockDimensionSearchResults.map((dim) => ({
          dimensionId: dim.dimensionId,
          dimensionName: dim.dimensionName,
          crossDimensionNotes: "",
          outline: {
            intentUnderstanding: {
              coreQuestion: dim.dimensionName,
              scope: { included: [dim.dimensionName], excluded: [] },
              expectedDepth: "detailed",
              targetAudience: "general",
              keyFocusAreas: [dim.dimensionName],
            },
            sections: [
              {
                id: `sec-${dim.dimensionId}`,
                title: dim.dimensionName,
                description: "Analysis",
                keyPoints: ["Analysis"],
                targetWords: 800,
                evidenceRequirements: { minReferences: 2 },
              },
            ],
            executionPlan: {
              parallelGroups: [[`sec-${dim.dimensionId}`]],
              estimatedTotalWords: 800,
            },
          },
        })),
        globalThemes: [],
        deduplicationRules: [],
      };

      // First attempt returns invalid JSON
      mockAiFacade.chat
        .mockResolvedValueOnce({
          content: "This is not valid JSON",
          usage: {
            promptTokens: 1000,
            completionTokens: 100,
            totalTokens: 1100,
          },
          isError: false,
        })
        .mockResolvedValueOnce({
          content: JSON.stringify(validOutline),
          usage: {
            promptTokens: 2000,
            completionTokens: 800,
            totalTokens: 2800,
          },
          isError: false,
        });

      // Act
      const result = await service.planGlobalOutline(
        mockTopic,
        mockDimensionSearchResults,
      );

      // Assert
      expect(mockAiFacade.chat).toHaveBeenCalledTimes(2);
      expect(result).toBeDefined();
    });

    it("should retry on empty dimensions array", async () => {
      // Arrange
      const validOutline = {
        dimensions: mockDimensionSearchResults.map((dim) => ({
          dimensionId: dim.dimensionId,
          dimensionName: dim.dimensionName,
          crossDimensionNotes: "",
          outline: {
            intentUnderstanding: {
              coreQuestion: dim.dimensionName,
              scope: { included: [dim.dimensionName], excluded: [] },
              expectedDepth: "detailed",
              targetAudience: "general",
              keyFocusAreas: [dim.dimensionName],
            },
            sections: [
              {
                id: `sec-${dim.dimensionId}`,
                title: dim.dimensionName,
                description: "Analysis",
                keyPoints: ["Analysis"],
                targetWords: 800,
                evidenceRequirements: { minReferences: 2 },
              },
            ],
            executionPlan: {
              parallelGroups: [[`sec-${dim.dimensionId}`]],
              estimatedTotalWords: 800,
            },
          },
        })),
        globalThemes: [],
        deduplicationRules: [],
      };

      // First attempt returns empty dimensions
      mockAiFacade.chat
        .mockResolvedValueOnce({
          content: JSON.stringify({
            dimensions: [],
            globalThemes: [],
            deduplicationRules: [],
          }),
          usage: {
            promptTokens: 1000,
            completionTokens: 100,
            totalTokens: 1100,
          },
          isError: false,
        })
        .mockResolvedValueOnce({
          content: JSON.stringify(validOutline),
          usage: {
            promptTokens: 2000,
            completionTokens: 800,
            totalTokens: 2800,
          },
          isError: false,
        });

      // Act
      const result = await service.planGlobalOutline(
        mockTopic,
        mockDimensionSearchResults,
      );

      // Assert
      expect(mockAiFacade.chat).toHaveBeenCalledTimes(2);
      expect(result).toBeDefined();
      expect(result.dimensions.length).toBeGreaterThan(0);
    });

    it("should use reasoning model from getReasoningModel()", async () => {
      // Arrange
      const customModel = {
        modelId: "claude-sonnet-4",
        name: "Claude Sonnet 4",
      };
      (service as any)["getReasoningModel"] = jest
        .fn<() => Promise<unknown>>()
        .mockResolvedValue(customModel);

      const validOutline = {
        dimensions: mockDimensionSearchResults.map((dim) => ({
          dimensionId: dim.dimensionId,
          dimensionName: dim.dimensionName,
          crossDimensionNotes: "",
          outline: {
            intentUnderstanding: {
              coreQuestion: dim.dimensionName,
              scope: { included: [dim.dimensionName], excluded: [] },
              expectedDepth: "detailed",
              targetAudience: "general",
              keyFocusAreas: [dim.dimensionName],
            },
            sections: [
              {
                id: `sec-${dim.dimensionId}`,
                title: dim.dimensionName,
                description: "Analysis",
                keyPoints: ["Analysis"],
                targetWords: 800,
                evidenceRequirements: { minReferences: 2 },
              },
            ],
            executionPlan: {
              parallelGroups: [[`sec-${dim.dimensionId}`]],
              estimatedTotalWords: 800,
            },
          },
        })),
        globalThemes: [],
        deduplicationRules: [],
      };

      mockAiFacade.chat.mockResolvedValue({
        content: JSON.stringify(validOutline),
        usage: { promptTokens: 2000, completionTokens: 800, totalTokens: 2800 },
        isError: false,
      });

      // Act
      await service.planGlobalOutline(mockTopic, mockDimensionSearchResults);

      // Assert
      expect((service as any)["getReasoningModel"]).toHaveBeenCalled();
      expect(mockAiFacade.chat).toHaveBeenCalledWith(
        expect.objectContaining({
          model: customModel.modelId,
        }),
      );
    });

    it("should throw if getReasoningModel returns null", async () => {
      // Arrange
      (service as any)["getReasoningModel"] = jest
        .fn<() => Promise<unknown>>()
        .mockResolvedValue(null);

      // Act & Assert
      await expect(
        service.planGlobalOutline(mockTopic, mockDimensionSearchResults),
      ).rejects.toThrow("No reasoning model available for Leader");
    }, 10000); // 10 second timeout for retry tests
  });
});
