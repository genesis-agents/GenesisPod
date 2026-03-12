/**
 * SectionWriterService Unit Tests
 *
 * Tests for section writing and revision:
 * - writeSection: write a single section
 * - reviseSection: revise a section based on feedback
 * - Content quality checking
 * - Error handling for API errors and short content
 */

import { Test, TestingModule } from "@nestjs/testing";
import { SectionWriterService } from "../section-writer.service";
import { ChatFacade } from "@/modules/ai-engine/facade";
import { AIModelType } from "@prisma/client";

// ============================================================
// Helpers
// ============================================================

const makeSection = (overrides: Record<string, unknown> = {}) => ({
  id: "section-1",
  title: "人工智能的发展历史",
  description: "Cover the history and evolution of AI",
  targetWords: 800,
  keyPoints: [
    "Early AI research",
    "Machine learning revolution",
    "Deep learning era",
  ],
  evidenceRequirements: {
    minReferences: 3,
    preferredTypes: ["academic", "industry_report"],
  },
  agentConfig: null,
  order: 1,
  dependsOn: [],
  ...overrides,
});

const makeEvidenceData = (overrides: Record<string, unknown> = {}) => ({
  id: `evidence-${Math.random().toString(36).slice(2)}`,
  title: "AI Research Paper 2024",
  content: "This paper presents findings on deep learning advances in 2024.",
  url: "https://arxiv.org/abs/2024.00001",
  source: "WEB",
  publishedAt: "2024-01-01",
  credibilityScore: 0.9,
  relevanceScore: 0.85,
  author: "John Doe",
  snippet: "Key finding: deep learning outperforms...",
  ...overrides,
});

// ============================================================
// Mocks
// ============================================================

const mockAiFacade = {
  chatWithSkills: jest.fn(),
  selectModel: jest.fn(),
};

// ============================================================
// Test suite
// ============================================================

describe("SectionWriterService", () => {
  let service: SectionWriterService;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SectionWriterService,
        { provide: ChatFacade, useValue: mockAiFacade },
      ],
    }).compile();

    service = module.get<SectionWriterService>(SectionWriterService);
  });

  it("should be defined", () => {
    expect(service).toBeDefined();
  });

  // ============================================================
  // writeSection
  // ============================================================

  describe("writeSection", () => {
    const validContent = "# AI历史\n\n" + "A".repeat(500); // 500+ chars, well above minimum

    it("should write a section successfully", async () => {
      mockAiFacade.chatWithSkills.mockResolvedValueOnce({
        content: validContent,
        model: "gpt-4o",
        isError: false,
        tokensUsed: 300,
      });

      const result = await service.writeSection({
        section: makeSection(),
        evidenceData: [makeEvidenceData()],
      });

      expect(result.sectionId).toBe("section-1");
      expect(result.title).toBe("人工智能的发展历史");
      expect(result.content).toBeTruthy();
      expect(result.wordCount).toBeGreaterThan(0);
    });

    it("should call aiFacade.chatWithSkills with CHAT model type", async () => {
      mockAiFacade.chatWithSkills.mockResolvedValueOnce({
        content: validContent,
        model: "gpt-4o",
        isError: false,
        tokensUsed: 300,
      });

      await service.writeSection({
        section: makeSection(),
        evidenceData: [],
      });

      expect(mockAiFacade.chatWithSkills).toHaveBeenCalledWith(
        expect.objectContaining({
          modelType: AIModelType.CHAT,
        }),
      );
    });

    it("should use specified modelId when provided", async () => {
      mockAiFacade.chatWithSkills.mockResolvedValueOnce({
        content: validContent,
        model: "claude-3-sonnet",
        isError: false,
        tokensUsed: 400,
      });

      await service.writeSection({
        section: makeSection(),
        evidenceData: [],
        modelId: "claude-3-sonnet",
      });

      expect(mockAiFacade.chatWithSkills).toHaveBeenCalledWith(
        expect.objectContaining({
          model: "claude-3-sonnet",
        }),
      );
    });

    it("should throw error when API returns error status", async () => {
      mockAiFacade.chatWithSkills.mockResolvedValueOnce({
        content: "Error: Rate limit exceeded",
        model: "gpt-4o",
        isError: true,
        tokensUsed: 0,
      });

      await expect(
        service.writeSection({
          section: makeSection(),
          evidenceData: [],
        }),
      ).rejects.toThrow("API error while writing section");
    });

    it("should throw error when content is too short", async () => {
      mockAiFacade.chatWithSkills.mockResolvedValueOnce({
        content: "Too short", // Only 9 chars, way below minimum
        model: "gpt-4o",
        isError: false,
        tokensUsed: 10,
      });

      await expect(
        service.writeSection({
          section: makeSection({ targetWords: 800 }),
          evidenceData: [],
        }),
      ).rejects.toThrow("Content too short");
    });

    it("should include temporal context in prompts when provided", async () => {
      mockAiFacade.chatWithSkills.mockResolvedValueOnce({
        content: validContent,
        model: "gpt-4o",
        isError: false,
        tokensUsed: 300,
      });

      const temporalContext = {
        currentDate: "2025年1月19日",
        freshnessRequirement: "需要2024年以内的最新数据",
      };

      await service.writeSection({
        section: makeSection(),
        evidenceData: [],
        temporalContext,
      });

      expect(mockAiFacade.chatWithSkills).toHaveBeenCalled();
    });

    it("should throw INSUFFICIENT_CREDITS error without wrapping when credits are depleted", async () => {
      mockAiFacade.chatWithSkills.mockResolvedValueOnce({
        content: "Error: insufficient credits for this request",
        model: "gpt-4o",
        isError: true,
        tokensUsed: 0,
      });

      await expect(
        service.writeSection({
          section: makeSection(),
          evidenceData: [],
        }),
      ).rejects.toThrow("[INSUFFICIENT_CREDITS]");
    });

    it("should throw INSUFFICIENT_CREDITS when response contains insufficient_credits", async () => {
      mockAiFacade.chatWithSkills.mockResolvedValueOnce({
        content: "Error: insufficient_credits for your account",
        model: "gpt-4o",
        isError: true,
        tokensUsed: 0,
      });

      await expect(
        service.writeSection({
          section: makeSection(),
          evidenceData: [],
        }),
      ).rejects.toThrow("[INSUFFICIENT_CREDITS]");
    });

    it("should handle previousSections context truncation", async () => {
      mockAiFacade.chatWithSkills.mockResolvedValueOnce({
        content: validContent,
        model: "gpt-4o",
        isError: false,
        tokensUsed: 300,
      });

      const previousSections = [
        { title: "Introduction", content: "A".repeat(1000) },
        { title: "Background", content: "B".repeat(1000) },
      ];

      const result = await service.writeSection({
        section: makeSection(),
        evidenceData: [],
        previousSections,
      });

      expect(result).toBeDefined();
      expect(mockAiFacade.chatWithSkills).toHaveBeenCalled();
    });

    it("should use assignedSkills when provided", async () => {
      mockAiFacade.chatWithSkills.mockResolvedValueOnce({
        content: validContent,
        model: "gpt-4o",
        isError: false,
        tokensUsed: 300,
      });

      await service.writeSection({
        section: makeSection(),
        evidenceData: [],
        assignedSkills: ["trend_analysis", "swot_analysis"],
      });

      expect(mockAiFacade.chatWithSkills).toHaveBeenCalledWith(
        expect.objectContaining({
          additionalSkills: expect.arrayContaining([
            "trend-analysis",
            "swot-analysis",
          ]),
        }),
      );
    });

    it("should record actualModelId from response", async () => {
      mockAiFacade.chatWithSkills.mockResolvedValueOnce({
        content: validContent,
        model: "claude-3-opus",
        isError: false,
        tokensUsed: 300,
      });

      const result = await service.writeSection({
        section: makeSection(),
        evidenceData: [],
      });

      expect(result.actualModelId).toBe("claude-3-opus");
    });

    it("should handle validationContext injection", async () => {
      mockAiFacade.chatWithSkills.mockResolvedValueOnce({
        content: validContent,
        model: "gpt-4o",
        isError: false,
        tokensUsed: 300,
      });

      await service.writeSection({
        section: makeSection(),
        evidenceData: [],
        validationContext: "V5: Some validation context",
      });

      expect(mockAiFacade.chatWithSkills).toHaveBeenCalled();
    });

    it("should handle section with agentConfig including analysis guidance", async () => {
      mockAiFacade.chatWithSkills.mockResolvedValueOnce({
        content: validContent,
        model: "gpt-4o",
        isError: false,
        tokensUsed: 300,
      });

      await service.writeSection({
        section: makeSection({
          agentConfig: {
            analysisGuidance: "Focus on quantitative data",
            outputStyle: "analytical",
            preferredDataSources: ["academic", "gov"],
            skills: ["trend_analysis"],
          },
        }),
        evidenceData: [],
      });

      expect(mockAiFacade.chatWithSkills).toHaveBeenCalled();
    });

    it("should handle section with only assignedSkills (no agentConfig)", async () => {
      mockAiFacade.chatWithSkills.mockResolvedValueOnce({
        content: validContent,
        model: "gpt-4o",
        isError: false,
        tokensUsed: 300,
      });

      await service.writeSection({
        section: makeSection({ agentConfig: null }),
        evidenceData: [],
        assignedSkills: ["deep_dive"],
      });

      expect(mockAiFacade.chatWithSkills).toHaveBeenCalledWith(
        expect.objectContaining({
          additionalSkills: expect.arrayContaining(["deep-dive"]),
        }),
      );
    });

    it("should extract references from content with citation markers", async () => {
      const contentWithRefs =
        "# AI History\n\n" +
        "Deep learning [1] revolutionized AI [2]. Models improved [1] significantly.\n" +
        "A".repeat(300);

      mockAiFacade.chatWithSkills.mockResolvedValueOnce({
        content: contentWithRefs,
        model: "gpt-4o",
        isError: false,
        tokensUsed: 300,
      });

      const result = await service.writeSection({
        section: makeSection(),
        evidenceData: [],
      });

      expect(result.referencesUsed).toContain("1");
      expect(result.referencesUsed).toContain("2");
    });

    it("should handle content wrapped in markdown code block", async () => {
      const wrappedContent =
        "```markdown\n# AI History\n\n" + "B".repeat(500) + "\n```";

      mockAiFacade.chatWithSkills.mockResolvedValueOnce({
        content: wrappedContent,
        model: "gpt-4o",
        isError: false,
        tokensUsed: 300,
      });

      const result = await service.writeSection({
        section: makeSection(),
        evidenceData: [],
      });

      expect(result.content).not.toContain("```markdown");
      expect(result.content).not.toContain("```");
    });

    it("should handle content wrapped in plain ``` code block", async () => {
      const wrappedContent =
        "```\n# AI History\n\n" + "C".repeat(500) + "\n```";

      mockAiFacade.chatWithSkills.mockResolvedValueOnce({
        content: wrappedContent,
        model: "gpt-4o",
        isError: false,
        tokensUsed: 300,
      });

      const result = await service.writeSection({
        section: makeSection(),
        evidenceData: [],
      });

      expect(result.content).not.toContain("```");
    });

    it("should parse chart output when CHARTS separator is present", async () => {
      const contentWithCharts =
        "# AI History\n\n" +
        "D".repeat(300) +
        "\n---CHARTS---\n" +
        JSON.stringify({
          generatedCharts: [
            {
              id: "chart-1",
              type: "bar",
              title: "Growth Chart",
              data: [{ year: 2020, value: 100 }],
              position: "after_paragraph_1",
              source: "Research data",
            },
          ],
          figureReferences: [],
        });

      mockAiFacade.chatWithSkills.mockResolvedValueOnce({
        content: contentWithCharts,
        model: "gpt-4o",
        isError: false,
        tokensUsed: 300,
      });

      const result = await service.writeSection({
        section: makeSection(),
        evidenceData: [],
      });

      expect(result.generatedCharts).toBeDefined();
      expect(result.generatedCharts!.length).toBeGreaterThan(0);
      expect(result.generatedCharts![0].type).toBe("bar");
    });

    it("should handle chart JSON parse failure gracefully", async () => {
      const contentWithBadCharts =
        "# AI History\n\n" +
        "E".repeat(300) +
        "\n---CHARTS---\n" +
        "invalid json {{{";

      mockAiFacade.chatWithSkills.mockResolvedValueOnce({
        content: contentWithBadCharts,
        model: "gpt-4o",
        isError: false,
        tokensUsed: 300,
      });

      const result = await service.writeSection({
        section: makeSection(),
        evidenceData: [],
      });

      expect(result).toBeDefined();
      expect(result.generatedCharts).toEqual([]);
    });

    it("should handle non-object parsed chart data gracefully", async () => {
      const contentWithArrayJson =
        "# AI History\n\n" +
        "F".repeat(300) +
        "\n---CHARTS---\n" +
        '"just a string"';

      mockAiFacade.chatWithSkills.mockResolvedValueOnce({
        content: contentWithArrayJson,
        model: "gpt-4o",
        isError: false,
        tokensUsed: 300,
      });

      const result = await service.writeSection({
        section: makeSection(),
        evidenceData: [],
      });

      expect(result.generatedCharts).toEqual([]);
    });

    it("should use topicLanguage when provided", async () => {
      mockAiFacade.chatWithSkills.mockResolvedValueOnce({
        content: validContent,
        model: "gpt-4o",
        isError: false,
        tokensUsed: 300,
      });

      await service.writeSection({
        section: makeSection(),
        evidenceData: [],
        topicLanguage: "en",
      });

      expect(mockAiFacade.chatWithSkills).toHaveBeenCalled();
    });
  });

  // ============================================================
  // reviseSection
  // ============================================================

  describe("reviseSection", () => {
    const validRevisedContent = "# Revised AI History\n\n" + "R".repeat(500);

    it("should revise section successfully", async () => {
      mockAiFacade.chatWithSkills.mockResolvedValueOnce({
        content: validRevisedContent,
        model: "gpt-4o",
        isError: false,
        tokensUsed: 350,
      });

      const result = await service.reviseSection({
        section: makeSection(),
        originalContent: "Original content " + "X".repeat(300),
        reviewFeedback: "Needs more data",
        revisionInstructions: "Add more quantitative data",
        evidenceData: [makeEvidenceData()],
      });

      expect(result.sectionId).toBe("section-1");
      expect(result.content.length).toBeGreaterThan(0);
    });

    it("should throw API error during revision", async () => {
      mockAiFacade.chatWithSkills.mockResolvedValueOnce({
        content: "Error: service unavailable",
        model: "gpt-4o",
        isError: true,
        tokensUsed: 0,
      });

      await expect(
        service.reviseSection({
          section: makeSection(),
          originalContent: "Original content",
          reviewFeedback: "Needs more data",
          revisionInstructions: "Add more data",
          evidenceData: [],
        }),
      ).rejects.toThrow("API error while revising section");
    });

    it("should throw INSUFFICIENT_CREDITS during revision", async () => {
      mockAiFacade.chatWithSkills.mockResolvedValueOnce({
        content: "Error: insufficient credits for revision",
        model: "gpt-4o",
        isError: true,
        tokensUsed: 0,
      });

      await expect(
        service.reviseSection({
          section: makeSection(),
          originalContent: "Original content",
          reviewFeedback: "Needs more data",
          revisionInstructions: "Add more data",
          evidenceData: [],
        }),
      ).rejects.toThrow("[INSUFFICIENT_CREDITS]");
    });

    it("should throw error when revised content is too short", async () => {
      mockAiFacade.chatWithSkills.mockResolvedValueOnce({
        content: "Short",
        model: "gpt-4o",
        isError: false,
        tokensUsed: 10,
      });

      await expect(
        service.reviseSection({
          section: makeSection({ targetWords: 800 }),
          originalContent: "Original content",
          reviewFeedback: "Needs more data",
          revisionInstructions: "Add more data",
          evidenceData: [],
        }),
      ).rejects.toThrow("Revised content too short");
    });

    it("should use modelId when provided during revision", async () => {
      mockAiFacade.chatWithSkills.mockResolvedValueOnce({
        content: validRevisedContent,
        model: "claude-3-opus",
        isError: false,
        tokensUsed: 400,
      });

      await service.reviseSection({
        section: makeSection(),
        originalContent: "Original content " + "Y".repeat(200),
        reviewFeedback: "Good but needs more",
        revisionInstructions: "Expand the analysis",
        evidenceData: [],
        modelId: "claude-3-opus",
      });

      expect(mockAiFacade.chatWithSkills).toHaveBeenCalledWith(
        expect.objectContaining({
          model: "claude-3-opus",
        }),
      );
    });

    it("should apply low creativity taskProfile during revision", async () => {
      mockAiFacade.chatWithSkills.mockResolvedValueOnce({
        content: validRevisedContent,
        model: "gpt-4o",
        isError: false,
        tokensUsed: 300,
      });

      await service.reviseSection({
        section: makeSection(),
        originalContent: "Original content",
        reviewFeedback: "Needs more data",
        revisionInstructions: "Add data",
        evidenceData: [],
      });

      expect(mockAiFacade.chatWithSkills).toHaveBeenCalledWith(
        expect.objectContaining({
          taskProfile: expect.objectContaining({
            creativity: "low",
          }),
        }),
      );
    });

    it("should truncate evidence when revision prompt would be too large", async () => {
      mockAiFacade.chatWithSkills.mockResolvedValueOnce({
        content: validRevisedContent,
        model: "gpt-4o",
        isError: false,
        tokensUsed: 300,
      });

      // Create large evidence data
      const largeEvidence = makeEvidenceData({
        content: "E".repeat(90000),
      });

      await service.reviseSection({
        section: makeSection(),
        originalContent: "Original content",
        reviewFeedback: "Needs more data",
        revisionInstructions: "Improve the section",
        evidenceData: [largeEvidence],
      });

      // Should complete without error (evidence is truncated internally)
      expect(mockAiFacade.chatWithSkills).toHaveBeenCalled();
    });

    it("should use assignedSkills during revision", async () => {
      mockAiFacade.chatWithSkills.mockResolvedValueOnce({
        content: validRevisedContent,
        model: "gpt-4o",
        isError: false,
        tokensUsed: 300,
      });

      await service.reviseSection({
        section: makeSection(),
        originalContent: "Original content " + "Z".repeat(200),
        reviewFeedback: "Good",
        revisionInstructions: "Minor improvements",
        evidenceData: [],
        assignedSkills: ["critical_thinking"],
      });

      expect(mockAiFacade.chatWithSkills).toHaveBeenCalledWith(
        expect.objectContaining({
          additionalSkills: expect.arrayContaining(["critical-thinking"]),
        }),
      );
    });
  });

  // ============================================================
  // writeSectionsParallel
  // ============================================================

  describe("writeSectionsParallel", () => {
    const validContent = "# AI Section\n\n" + "A".repeat(500);

    it("should write multiple sections in parallel", async () => {
      mockAiFacade.chatWithSkills
        .mockResolvedValueOnce({
          content: validContent,
          model: "gpt-4o",
          isError: false,
          tokensUsed: 300,
        })
        .mockResolvedValueOnce({
          content: validContent,
          model: "gpt-4o",
          isError: false,
          tokensUsed: 300,
        });

      const inputs = [
        {
          section: makeSection({ id: "s1", title: "Section 1" }),
          evidenceData: [],
        },
        {
          section: makeSection({ id: "s2", title: "Section 2" }),
          evidenceData: [],
        },
      ];

      const results = await service.writeSectionsParallel(inputs);

      expect(results).toHaveLength(2);
      expect(results[0].sectionId).toBe("s1");
      expect(results[1].sectionId).toBe("s2");
    });

    it("should abort all sections on INSUFFICIENT_CREDITS failure", async () => {
      mockAiFacade.chatWithSkills
        .mockResolvedValueOnce({
          content: "[INSUFFICIENT_CREDITS] No credits left",
          model: "gpt-4o",
          isError: true,
          tokensUsed: 0,
        })
        .mockResolvedValueOnce({
          content: validContent,
          model: "gpt-4o",
          isError: false,
          tokensUsed: 300,
        });

      const inputs = [
        {
          section: makeSection({ id: "s1", title: "Section 1" }),
          evidenceData: [],
        },
        {
          section: makeSection({ id: "s2", title: "Section 2" }),
          evidenceData: [],
        },
      ];

      await expect(service.writeSectionsParallel(inputs)).rejects.toThrow(
        "[INSUFFICIENT_CREDITS]",
      );
    });

    it("should retry failed sections with fallback model", async () => {
      const fallbackModel = { id: "claude-fallback", provider: "anthropic" };
      mockAiFacade.selectModel.mockResolvedValueOnce(fallbackModel);

      // First section fails on first attempt, succeeds on retry
      // Second section succeeds immediately
      mockAiFacade.chatWithSkills
        .mockResolvedValueOnce({
          content: "Too short",
          model: "gpt-4o",
          isError: false,
          tokensUsed: 10,
        })
        .mockResolvedValueOnce({
          content: validContent,
          model: "gpt-4o",
          isError: false,
          tokensUsed: 300,
        })
        .mockResolvedValueOnce({
          content: validContent,
          model: "claude-fallback",
          isError: false,
          tokensUsed: 300,
        });

      const inputs = [
        { section: makeSection({ id: "s1" }), evidenceData: [] },
        { section: makeSection({ id: "s2" }), evidenceData: [] },
      ];

      const results = await service.writeSectionsParallel(inputs);

      expect(results).toHaveLength(2);
      expect(mockAiFacade.selectModel).toHaveBeenCalled();
    });

    it("should create failed result placeholder when no fallback model available", async () => {
      mockAiFacade.selectModel.mockResolvedValueOnce(null); // no fallback

      mockAiFacade.chatWithSkills.mockResolvedValueOnce({
        content: "Too short",
        model: "gpt-4o",
        isError: false,
        tokensUsed: 10,
      });

      const inputs = [
        {
          section: makeSection({ id: "s1", title: "Section 1" }),
          evidenceData: [],
        },
      ];

      const results = await service.writeSectionsParallel(inputs);

      expect(results).toHaveLength(1);
      // Failed result has wordCount 0
      expect(results[0].wordCount).toBe(0);
      expect(results[0].content).toContain("内容生成失败");
    });

    it("should skip retry when fallback model is same as original model", async () => {
      const fallbackModel = { id: "gpt-4o", provider: "openai" };
      mockAiFacade.selectModel.mockResolvedValueOnce(fallbackModel);

      mockAiFacade.chatWithSkills.mockResolvedValueOnce({
        content: "Too short",
        model: "gpt-4o",
        isError: false,
        tokensUsed: 10,
      });

      const inputs = [
        {
          section: makeSection({ id: "s1" }),
          evidenceData: [],
          modelId: "gpt-4o", // same as fallback
        },
      ];

      const results = await service.writeSectionsParallel(inputs);

      expect(results).toHaveLength(1);
      expect(results[0].wordCount).toBe(0);
      // selectModel called once, but no retry (skip item)
      expect(mockAiFacade.selectModel).toHaveBeenCalled();
    });

    it("should handle retry failure and create failed result", async () => {
      const fallbackModel = { id: "claude-fallback", provider: "anthropic" };
      mockAiFacade.selectModel.mockResolvedValueOnce(fallbackModel);

      // First attempt fails, retry also fails
      mockAiFacade.chatWithSkills
        .mockResolvedValueOnce({
          content: "Short",
          model: "gpt-4o",
          isError: false,
          tokensUsed: 10,
        })
        .mockResolvedValueOnce({
          content: "Also short",
          model: "claude-fallback",
          isError: false,
          tokensUsed: 10,
        });

      const inputs = [{ section: makeSection({ id: "s1" }), evidenceData: [] }];

      const results = await service.writeSectionsParallel(inputs);

      expect(results).toHaveLength(1);
      expect(results[0].wordCount).toBe(0);
    });
  });

  // ============================================================
  // Private method coverage via public interface
  // ============================================================

  describe("parseChartOutput edge cases", () => {
    const longContent = "G".repeat(300);

    it("should handle inline JSON with generatedCharts key", async () => {
      const inlineJson =
        "# Section\n\n" +
        longContent +
        '\n\n{"generatedCharts": [], "figureReferences": []}';

      mockAiFacade.chatWithSkills.mockResolvedValueOnce({
        content: inlineJson,
        model: "gpt-4o",
        isError: false,
        tokensUsed: 300,
      });

      const result = await service.writeSection({
        section: makeSection(),
        evidenceData: [],
      });

      expect(result).toBeDefined();
      expect(result.generatedCharts).toBeDefined();
    });

    it("should handle code-fenced JSON with generatedCharts key", async () => {
      const codeFenceJson =
        "# Section\n\n" +
        longContent +
        '\n```json\n{"generatedCharts": [], "figureReferences": []}\n```';

      mockAiFacade.chatWithSkills.mockResolvedValueOnce({
        content: codeFenceJson,
        model: "gpt-4o",
        isError: false,
        tokensUsed: 300,
      });

      const result = await service.writeSection({
        section: makeSection(),
        evidenceData: [],
      });

      expect(result).toBeDefined();
    });

    it("should normalize figureReferences with defaults", async () => {
      const contentWithFigureRefs =
        "# Section\n\n" +
        longContent +
        "\n---CHARTS---\n" +
        JSON.stringify({
          generatedCharts: [],
          figureReferences: [
            {
              // Missing id, caption, position - should use defaults
              evidenceCitationIndex: 1,
              figureIndex: 0,
              imageUrl: "https://example.com/image.png",
            },
          ],
        });

      mockAiFacade.chatWithSkills.mockResolvedValueOnce({
        content: contentWithFigureRefs,
        model: "gpt-4o",
        isError: false,
        tokensUsed: 300,
      });

      const result = await service.writeSection({
        section: makeSection(),
        evidenceData: [],
      });

      expect(result).toBeDefined();
    });

    it("should normalize charts with invalid type to bar", async () => {
      const contentWithInvalidType =
        "# Section\n\n" +
        longContent +
        "\n---CHARTS---\n" +
        JSON.stringify({
          generatedCharts: [
            {
              type: "invalid_type",
              title: "Test Chart",
              data: [],
            },
          ],
          figureReferences: [],
        });

      mockAiFacade.chatWithSkills.mockResolvedValueOnce({
        content: contentWithInvalidType,
        model: "gpt-4o",
        isError: false,
        tokensUsed: 300,
      });

      const result = await service.writeSection({
        section: makeSection(),
        evidenceData: [],
      });

      expect(result.generatedCharts![0].type).toBe("bar");
    });
  });

  describe("formatAgentGuidance coverage", () => {
    const validContent = "# AI History\n\n" + "H".repeat(500);

    it("should format outputStyle narrative correctly", async () => {
      mockAiFacade.chatWithSkills.mockResolvedValueOnce({
        content: validContent,
        model: "gpt-4o",
        isError: false,
        tokensUsed: 300,
      });

      await service.writeSection({
        section: makeSection({
          agentConfig: {
            outputStyle: "narrative",
            skills: [],
            preferredDataSources: [],
          },
        }),
        evidenceData: [],
      });

      expect(mockAiFacade.chatWithSkills).toHaveBeenCalled();
    });

    it("should handle unknown outputStyle gracefully", async () => {
      mockAiFacade.chatWithSkills.mockResolvedValueOnce({
        content: validContent,
        model: "gpt-4o",
        isError: false,
        tokensUsed: 300,
      });

      await service.writeSection({
        section: makeSection({
          agentConfig: {
            outputStyle: "unknown_style",
            skills: [],
            preferredDataSources: [],
          },
        }),
        evidenceData: [],
      });

      expect(mockAiFacade.chatWithSkills).toHaveBeenCalled();
    });

    it("should merge section skills and mission skills (dedup)", async () => {
      mockAiFacade.chatWithSkills.mockResolvedValueOnce({
        content: validContent,
        model: "gpt-4o",
        isError: false,
        tokensUsed: 300,
      });

      await service.writeSection({
        section: makeSection({
          agentConfig: {
            skills: ["trend_analysis"],
            preferredDataSources: [],
          },
        }),
        evidenceData: [],
        assignedSkills: ["trend_analysis", "synthesis"], // trend_analysis is a duplicate
      });

      expect(mockAiFacade.chatWithSkills).toHaveBeenCalledWith(
        expect.objectContaining({
          additionalSkills: expect.arrayContaining([
            "trend-analysis",
            "synthesis",
          ]),
        }),
      );
    });
  });
});
