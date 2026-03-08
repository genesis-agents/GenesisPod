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

      const chatCall = mockAiFacade.chatWithSkills.mock.calls[0][0];
      const userMsg = chatCall.messages.find(
        (m: { role: string }) => m.role === "user",
      );
      expect(userMsg?.content).toContain("2025年1月19日");
    });

    it("should include previous sections context when provided", async () => {
      mockAiFacade.chatWithSkills.mockResolvedValueOnce({
        content: validContent,
        model: "gpt-4o",
        isError: false,
        tokensUsed: 300,
      });

      const previousSections = [
        { title: "第一章", content: "Content of chapter 1".repeat(20) },
      ];

      await service.writeSection({
        section: makeSection(),
        evidenceData: [],
        previousSections,
      });

      const chatCall = mockAiFacade.chatWithSkills.mock.calls[0][0];
      const userMsg = chatCall.messages.find(
        (m: { role: string }) => m.role === "user",
      );
      expect(userMsg?.content).toContain("第一章");
    });

    it("should inject validation context when provided", async () => {
      mockAiFacade.chatWithSkills.mockResolvedValueOnce({
        content: validContent,
        model: "gpt-4o",
        isError: false,
        tokensUsed: 300,
      });

      await service.writeSection({
        section: makeSection(),
        evidenceData: [],
        validationContext: "V5 VALIDATION: Ensure accuracy of all claims",
      });

      const chatCall = mockAiFacade.chatWithSkills.mock.calls[0][0];
      const userMsg = chatCall.messages.find(
        (m: { role: string }) => m.role === "user",
      );
      expect(userMsg?.content).toContain("V5 VALIDATION");
    });

    it("should record the actual model used in the result", async () => {
      mockAiFacade.chatWithSkills.mockResolvedValueOnce({
        content: validContent,
        model: "claude-3-opus",
        isError: false,
        tokensUsed: 500,
      });

      const result = await service.writeSection({
        section: makeSection(),
        evidenceData: [],
      });

      expect(result.actualModelId).toBe("claude-3-opus");
    });

    it('should use "long" outputLength task profile for section writing', async () => {
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
          taskProfile: expect.objectContaining({ outputLength: "long" }),
        }),
      );
    });

    it("should use English language instruction when topicLanguage is en", async () => {
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

      const chatCall = mockAiFacade.chatWithSkills.mock.calls[0][0];
      const sysMsg = chatCall.messages.find(
        (m: { role: string }) => m.role === "system",
      );
      expect(sysMsg?.content).toContain("English");
    });
  });

  // ============================================================
  // reviseSection
  // ============================================================

  describe("reviseSection", () => {
    const validRevisedContent = "# Revised AI History\n\n" + "B".repeat(500);

    it("should revise a section based on feedback", async () => {
      mockAiFacade.chatWithSkills.mockResolvedValueOnce({
        content: validRevisedContent,
        model: "gpt-4o",
        isError: false,
        tokensUsed: 400,
      });

      const result = await service.reviseSection({
        section: makeSection(),
        originalContent: "Original content here",
        reviewFeedback: "Need more depth and citations",
        revisionInstructions: "Add at least 3 more references",
        evidenceData: [makeEvidenceData()],
      });

      expect(result.sectionId).toBe("section-1");
      expect(result.content).not.toBe("Original content here");
      expect(mockAiFacade.chatWithSkills).toHaveBeenCalled();
    });

    it("should throw error when revised content is too short", async () => {
      mockAiFacade.chatWithSkills.mockResolvedValueOnce({
        content: "Too short revised",
        model: "gpt-4o",
        isError: false,
        tokensUsed: 20,
      });

      await expect(
        service.reviseSection({
          section: makeSection({ targetWords: 800 }),
          originalContent: "Original content",
          reviewFeedback: "Expand this",
          revisionInstructions: "Write more",
          evidenceData: [],
        }),
      ).rejects.toThrow("too short");
    });

    it("should use specified modelId for revision", async () => {
      mockAiFacade.chatWithSkills.mockResolvedValueOnce({
        content: validRevisedContent,
        model: "gemini-pro",
        isError: false,
        tokensUsed: 300,
      });

      await service.reviseSection({
        section: makeSection(),
        originalContent: "Original",
        reviewFeedback: "Fix this",
        revisionInstructions: "Improve quality",
        evidenceData: [],
        modelId: "gemini-pro",
      });

      expect(mockAiFacade.chatWithSkills).toHaveBeenCalledWith(
        expect.objectContaining({
          model: "gemini-pro",
        }),
      );
    });

    it("should include original content and feedback in revision prompt", async () => {
      mockAiFacade.chatWithSkills.mockResolvedValueOnce({
        content: validRevisedContent,
        model: "gpt-4o",
        isError: false,
        tokensUsed: 300,
      });

      await service.reviseSection({
        section: makeSection(),
        originalContent: "This is the original draft",
        reviewFeedback: "Needs improvement",
        revisionInstructions: "Add more details",
        evidenceData: [],
      });

      const chatCall = mockAiFacade.chatWithSkills.mock.calls[0][0];
      const userMsg = chatCall.messages.find(
        (m: { role: string }) => m.role === "user",
      );
      expect(userMsg?.content).toContain("This is the original draft");
      expect(userMsg?.content).toContain("Needs improvement");
    });

    it("should throw API error when reviseSection gets isError response", async () => {
      mockAiFacade.chatWithSkills.mockResolvedValueOnce({
        content: "Server error",
        model: "gpt-4o",
        isError: true,
        tokensUsed: 0,
      });

      await expect(
        service.reviseSection({
          section: makeSection(),
          originalContent: "Original",
          reviewFeedback: "Fix it",
          revisionInstructions: "Revise",
          evidenceData: [],
        }),
      ).rejects.toThrow("API error while revising section");
    });

    it("should use default revisionInstructions when empty string provided", async () => {
      mockAiFacade.chatWithSkills.mockResolvedValueOnce({
        content: validRevisedContent,
        model: "gpt-4o",
        isError: false,
        tokensUsed: 300,
      });

      await service.reviseSection({
        section: makeSection(),
        originalContent: "Original content here",
        reviewFeedback: "Feedback",
        revisionInstructions: "",
        evidenceData: [],
      });

      const chatCall = mockAiFacade.chatWithSkills.mock.calls[0][0];
      const userMsg = chatCall.messages.find(
        (m: { role: string }) => m.role === "user",
      );
      expect(userMsg?.content).toContain("请根据反馈改进内容");
    });

    it("should use low creativity profile for revision", async () => {
      mockAiFacade.chatWithSkills.mockResolvedValueOnce({
        content: validRevisedContent,
        model: "gpt-4o",
        isError: false,
        tokensUsed: 300,
      });

      await service.reviseSection({
        section: makeSection(),
        originalContent: "Original",
        reviewFeedback: "Feedback",
        revisionInstructions: "Revise",
        evidenceData: [],
      });

      expect(mockAiFacade.chatWithSkills).toHaveBeenCalledWith(
        expect.objectContaining({
          taskProfile: expect.objectContaining({ creativity: "low" }),
        }),
      );
    });

    it("should record actualModelId in reviseSection result", async () => {
      mockAiFacade.chatWithSkills.mockResolvedValueOnce({
        content: validRevisedContent,
        model: "claude-revision-model",
        isError: false,
        tokensUsed: 300,
      });

      const result = await service.reviseSection({
        section: makeSection(),
        originalContent: "Content",
        reviewFeedback: "Review",
        revisionInstructions: "Revise",
        evidenceData: [],
      });

      expect(result.actualModelId).toBe("claude-revision-model");
    });
  });

  // ============================================================
  // writeSectionsParallel
  // ============================================================

  describe("writeSectionsParallel", () => {
    const validContent = "# AI历史\n\n" + "A".repeat(500);

    it("should return results in the same order as inputs", async () => {
      mockAiFacade.chatWithSkills
        .mockResolvedValueOnce({
          content: validContent,
          model: "gpt-4o",
          isError: false,
        })
        .mockResolvedValueOnce({
          content: validContent,
          model: "gpt-4o",
          isError: false,
        })
        .mockResolvedValueOnce({
          content: validContent,
          model: "gpt-4o",
          isError: false,
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
        {
          section: makeSection({ id: "s3", title: "Section 3" }),
          evidenceData: [],
        },
      ];

      const results = await service.writeSectionsParallel(inputs);

      expect(results).toHaveLength(3);
      expect(results[0].sectionId).toBe("s1");
      expect(results[1].sectionId).toBe("s2");
      expect(results[2].sectionId).toBe("s3");
    });

    it("should return empty array for empty input", async () => {
      const results = await service.writeSectionsParallel([]);
      expect(results).toEqual([]);
    });

    it("should use fallback model on failure and succeed on retry", async () => {
      // selectModel returns a fallback
      (mockAiFacade as any).selectModel = jest
        .fn()
        .mockResolvedValue({ id: "gpt-3.5-turbo" });
      // First write fails, retry succeeds
      mockAiFacade.chatWithSkills
        .mockRejectedValueOnce(new Error("Primary model failed"))
        .mockResolvedValueOnce({
          content: validContent,
          model: "gpt-3.5-turbo",
          isError: false,
        });

      const inputs = [
        {
          section: makeSection({ id: "sf1" }),
          evidenceData: [],
          modelId: "gpt-4o",
        },
      ];

      const results = await service.writeSectionsParallel(inputs);

      expect(results[0].wordCount).toBeGreaterThan(0);
    });

    it("should create failed placeholder when no fallback model available", async () => {
      (mockAiFacade as any).selectModel = jest.fn().mockResolvedValue(null);
      mockAiFacade.chatWithSkills.mockRejectedValue(new Error("All failed"));

      const inputs = [
        { section: makeSection({ id: "sf2" }), evidenceData: [] },
      ];

      const results = await service.writeSectionsParallel(inputs);

      expect(results[0].wordCount).toBe(0);
      expect(results[0].content).toContain("内容生成失败");
    });

    it("should skip retry when fallback model same as original model", async () => {
      (mockAiFacade as any).selectModel = jest
        .fn()
        .mockResolvedValue({ id: "gpt-4o" });
      mockAiFacade.chatWithSkills.mockRejectedValue(new Error("Failed"));

      const inputs = [
        {
          section: makeSection({ id: "sf3" }),
          evidenceData: [],
          modelId: "gpt-4o",
        },
      ];

      const results = await service.writeSectionsParallel(inputs);

      expect(results[0].wordCount).toBe(0);
    });

    it("should create failed placeholder when retry also fails", async () => {
      (mockAiFacade as any).selectModel = jest
        .fn()
        .mockResolvedValue({ id: "claude-3" });
      mockAiFacade.chatWithSkills.mockRejectedValue(
        new Error("Everything failed"),
      );

      const inputs = [
        {
          section: makeSection({ id: "sf4" }),
          evidenceData: [],
          modelId: "gpt-4o",
        },
      ];

      const results = await service.writeSectionsParallel(inputs);

      expect(results[0].wordCount).toBe(0);
      expect(results[0].content).toContain("内容生成失败");
    });

    it("should handle mix of success and failure across multiple sections", async () => {
      (mockAiFacade as any).selectModel = jest.fn().mockResolvedValue(null);
      mockAiFacade.chatWithSkills
        .mockResolvedValueOnce({
          content: validContent,
          model: "gpt-4o",
          isError: false,
        })
        .mockRejectedValueOnce(new Error("Second section failed"));

      const inputs = [
        {
          section: makeSection({ id: "sm1", title: "Success" }),
          evidenceData: [],
        },
        {
          section: makeSection({ id: "sm2", title: "Failure" }),
          evidenceData: [],
        },
      ];

      const results = await service.writeSectionsParallel(inputs);

      expect(results[0].wordCount).toBeGreaterThan(0);
      expect(results[1].wordCount).toBe(0);
    });
  });

  // ============================================================
  // Chart parsing (via writeSection)
  // ============================================================

  describe("chart parsing (CHARTS separator)", () => {
    const baseContent = "A".repeat(250);

    it("should parse generatedCharts from CHARTS separator", async () => {
      const chartJson = JSON.stringify({
        generatedCharts: [
          {
            id: "c1",
            type: "bar",
            title: "Revenue",
            position: "after_para_1",
            data: [{ label: "2023", value: 100 }],
            source: "Market data",
          },
        ],
        figureReferences: [],
      });

      mockAiFacade.chatWithSkills.mockResolvedValueOnce({
        content: baseContent + "\n---CHARTS---\n" + chartJson,
        model: "gpt-4o",
        isError: false,
      });

      const result = await service.writeSection({
        section: makeSection(),
        evidenceData: [],
      });

      expect(result.generatedCharts?.length).toBe(1);
      expect(result.generatedCharts?.[0].type).toBe("bar");
    });

    it("should parse figureReferences from CHARTS separator", async () => {
      const chartJson = JSON.stringify({
        generatedCharts: [],
        figureReferences: [
          {
            id: "fig-1",
            evidenceCitationIndex: 1,
            figureIndex: 0,
            caption: "人工智能发展 timeline",
            position: "after_para_1",
            imageUrl: "https://example.com/chart.png",
          },
        ],
      });

      mockAiFacade.chatWithSkills.mockResolvedValueOnce({
        content: baseContent + "\n---CHARTS---\n" + chartJson,
        model: "gpt-4o",
        isError: false,
      });

      const result = await service.writeSection({
        section: makeSection(),
        evidenceData: [],
      });

      expect(result.figureReferences?.length).toBe(1);
      expect(result.figureReferences?.[0].caption).toBe(
        "人工智能发展 timeline",
      );
    });

    it("should return empty charts when CHARTS json is invalid", async () => {
      mockAiFacade.chatWithSkills.mockResolvedValueOnce({
        content: baseContent + "\n---CHARTS---\n{not valid json",
        model: "gpt-4o",
        isError: false,
      });

      const result = await service.writeSection({
        section: makeSection(),
        evidenceData: [],
      });

      expect(result.generatedCharts).toEqual([]);
      expect(result.figureReferences).toEqual([]);
    });

    it("should handle CHARTS with non-object JSON (e.g., array)", async () => {
      mockAiFacade.chatWithSkills.mockResolvedValueOnce({
        content: baseContent + "\n---CHARTS---\n[1, 2, 3]",
        model: "gpt-4o",
        isError: false,
      });

      const result = await service.writeSection({
        section: makeSection(),
        evidenceData: [],
      });

      expect(result.generatedCharts).toEqual([]);
    });

    it("should parse charts from ```json code fence format", async () => {
      const chartJson = JSON.stringify({
        generatedCharts: [{ id: "c2", type: "pie", title: "Market", data: [] }],
        figureReferences: [],
      });

      mockAiFacade.chatWithSkills.mockResolvedValueOnce({
        content: baseContent + "\n```json\n" + chartJson + "\n```",
        model: "gpt-4o",
        isError: false,
      });

      const result = await service.writeSection({
        section: makeSection(),
        evidenceData: [],
      });

      expect(result.generatedCharts?.length).toBe(1);
      expect(result.generatedCharts?.[0].type).toBe("pie");
    });

    it("should parse charts from inline JSON format", async () => {
      const chartJson = JSON.stringify({
        generatedCharts: [{ id: "c3", type: "line", title: "Trend", data: [] }],
        figureReferences: [],
      });

      mockAiFacade.chatWithSkills.mockResolvedValueOnce({
        content: baseContent + "\n" + chartJson,
        model: "gpt-4o",
        isError: false,
      });

      const result = await service.writeSection({
        section: makeSection(),
        evidenceData: [],
      });

      expect(result.generatedCharts?.length).toBe(1);
    });

    it('should default invalid chart type to "bar"', async () => {
      const chartJson = JSON.stringify({
        generatedCharts: [
          { id: "cx", type: "heatmap", title: "Unknown type", data: [] },
        ],
        figureReferences: [],
      });

      mockAiFacade.chatWithSkills.mockResolvedValueOnce({
        content: baseContent + "\n---CHARTS---\n" + chartJson,
        model: "gpt-4o",
        isError: false,
      });

      const result = await service.writeSection({
        section: makeSection(),
        evidenceData: [],
      });

      expect(result.generatedCharts?.[0].type).toBe("bar");
    });

    it("should handle all valid chart types", async () => {
      for (const type of ["line", "bar", "pie", "area", "radar"] as const) {
        jest.clearAllMocks();
        const chartJson = JSON.stringify({
          generatedCharts: [{ id: `c-${type}`, type, title: type, data: [] }],
          figureReferences: [],
        });

        mockAiFacade.chatWithSkills.mockResolvedValueOnce({
          content: baseContent + "\n---CHARTS---\n" + chartJson,
          model: "gpt-4o",
          isError: false,
        });

        const result = await service.writeSection({
          section: makeSection(),
          evidenceData: [],
        });

        expect(result.generatedCharts?.[0].type).toBe(type);
      }
    });

    it("should strip ```markdown code fence from response", async () => {
      mockAiFacade.chatWithSkills.mockResolvedValueOnce({
        content: "```markdown\n" + baseContent + "\n```",
        model: "gpt-4o",
        isError: false,
      });

      const result = await service.writeSection({
        section: makeSection(),
        evidenceData: [],
      });

      expect(result.content).not.toContain("```markdown");
      expect(result.content).not.toContain("```");
    });

    it("should strip plain ``` code fence from response", async () => {
      mockAiFacade.chatWithSkills.mockResolvedValueOnce({
        content: "```\n" + baseContent + "\n```",
        model: "gpt-4o",
        isError: false,
      });

      const result = await service.writeSection({
        section: makeSection(),
        evidenceData: [],
      });

      expect(result.content).not.toContain("```");
    });

    it("should backfill imageUrl from allocatedFigures when figureReference lacks URL", async () => {
      const chartJson = JSON.stringify({
        generatedCharts: [],
        figureReferences: [
          {
            id: "fr1",
            evidenceCitationIndex: 1,
            figureIndex: 0,
            caption: "",
            position: "after_para_1",
          },
        ],
      });

      mockAiFacade.chatWithSkills.mockResolvedValueOnce({
        content: baseContent + "\n---CHARTS---\n" + chartJson,
        model: "gpt-4o",
        isError: false,
      });

      const result = await service.writeSection({
        section: makeSection(),
        evidenceData: [],
        allocatedFigures: [
          {
            evidenceIndex: 1,
            figureIndex: 0,
            imageUrl: "https://img.test.com/fig.png",
            caption: "人工智能 deep learning 发展趋势",
            relevanceReason: "Shows AI development trend",
          },
        ],
      });

      expect(result.figureReferences?.[0].imageUrl).toBe(
        "https://img.test.com/fig.png",
      );
      expect(result.figureReferences?.[0].caption).toBe(
        "人工智能 deep learning 发展趋势",
      );
    });

    it("should not overwrite existing imageUrl from figureReference", async () => {
      const chartJson = JSON.stringify({
        generatedCharts: [],
        figureReferences: [
          {
            id: "fr2",
            evidenceCitationIndex: 1,
            figureIndex: 0,
            imageUrl: "https://existing.url.com/fig.png",
            caption: "Machine learning revolution 发展历史",
            position: "after_para_1",
          },
        ],
      });

      mockAiFacade.chatWithSkills.mockResolvedValueOnce({
        content: baseContent + "\n---CHARTS---\n" + chartJson,
        model: "gpt-4o",
        isError: false,
      });

      const result = await service.writeSection({
        section: makeSection(),
        evidenceData: [],
        allocatedFigures: [
          {
            evidenceIndex: 1,
            figureIndex: 0,
            imageUrl: "https://should-not-replace.com/fig.png",
            caption: "人工智能发展 alternative",
            relevanceReason: "AI history",
          },
        ],
      });

      expect(result.figureReferences?.[0].imageUrl).toBe(
        "https://existing.url.com/fig.png",
      );
    });
  });

  // ============================================================
  // formatFiguresForSection (via writeSection with allocatedFigures)
  // ============================================================

  describe("formatFiguresForSection", () => {
    const validContent = "# AI历史\n\n" + "A".repeat(500);

    it("should use allocatedFigures when provided", async () => {
      mockAiFacade.chatWithSkills.mockResolvedValueOnce({
        content: validContent,
        model: "gpt-4o",
        isError: false,
      });

      await service.writeSection({
        section: makeSection(),
        evidenceData: [],
        allocatedFigures: [
          {
            evidenceIndex: 1,
            figureIndex: 0,
            imageUrl: "https://img.test.com/1.png",
            caption: "Figure 1",
            relevanceReason: "Market data",
          },
        ],
      });

      const chatCall = mockAiFacade.chatWithSkills.mock.calls[0][0];
      const userMsg = chatCall.messages.find(
        (m: { role: string }) => m.role === "user",
      );
      expect(userMsg?.content).toContain("Leader 已为本章节分配以下图表");
    });

    it("should show all evidence figures when no allocatedFigures", async () => {
      mockAiFacade.chatWithSkills.mockResolvedValueOnce({
        content: validContent,
        model: "gpt-4o",
        isError: false,
      });

      const evidenceWithFigures = [
        {
          ...makeEvidenceData(),
          extractedFigures: [
            {
              type: "chart",
              imageUrl: "https://img.test.com/chart.png",
              caption: "Market Share",
              alt: "Chart",
            },
          ],
        },
      ];

      await service.writeSection({
        section: makeSection(),
        evidenceData: evidenceWithFigures as any,
      });

      const chatCall = mockAiFacade.chatWithSkills.mock.calls[0][0];
      const userMsg = chatCall.messages.find(
        (m: { role: string }) => m.role === "user",
      );
      expect(userMsg?.content).toContain("Market Share");
    });

    it('should show "无可用图片资源" when no figures in evidence', async () => {
      mockAiFacade.chatWithSkills.mockResolvedValueOnce({
        content: validContent,
        model: "gpt-4o",
        isError: false,
      });

      await service.writeSection({
        section: makeSection(),
        evidenceData: [makeEvidenceData() as any],
      });

      const chatCall = mockAiFacade.chatWithSkills.mock.calls[0][0];
      const userMsg = chatCall.messages.find(
        (m: { role: string }) => m.role === "user",
      );
      expect(userMsg?.content).toContain("无可用图片资源");
    });
  });

  // ============================================================
  // formatAgentGuidance (via writeSection with agentConfig)
  // ============================================================

  describe("formatAgentGuidance", () => {
    const validContent = "# AI历史\n\n" + "A".repeat(500);

    it('should return "无特殊指导" when agentConfig is null', async () => {
      mockAiFacade.chatWithSkills.mockResolvedValueOnce({
        content: validContent,
        model: "gpt-4o",
        isError: false,
      });

      await service.writeSection({
        section: makeSection({ agentConfig: null }),
        evidenceData: [],
      });

      const chatCall = mockAiFacade.chatWithSkills.mock.calls[0][0];
      const userMsg = chatCall.messages.find(
        (m: { role: string }) => m.role === "user",
      );
      expect(userMsg?.content).toContain("无特殊指导");
      // No skills passed when agentConfig is null
      expect(chatCall.additionalSkills).toEqual([]);
    });

    it("should pass empty additionalSkills when agentConfig has no skills", async () => {
      mockAiFacade.chatWithSkills.mockResolvedValueOnce({
        content: validContent,
        model: "gpt-4o",
        isError: false,
      });

      await service.writeSection({
        section: makeSection({ agentConfig: {} }),
        evidenceData: [],
      });

      const chatCall = mockAiFacade.chatWithSkills.mock.calls[0][0];
      expect(chatCall.additionalSkills).toEqual([]);
    });

    it("should pass mapped kebab-case skill IDs to additionalSkills", async () => {
      mockAiFacade.chatWithSkills.mockResolvedValueOnce({
        content: validContent,
        model: "gpt-4o",
        isError: false,
      });

      await service.writeSection({
        section: makeSection({
          agentConfig: {
            skills: ["trend_analysis", "swot_analysis"],
          },
        }),
        evidenceData: [],
      });

      const chatCall = mockAiFacade.chatWithSkills.mock.calls[0][0];
      expect(chatCall.additionalSkills).toEqual([
        "trend-analysis",
        "swot-analysis",
      ]);
    });

    it("should handle unknown skill id by converting underscore to hyphen", async () => {
      mockAiFacade.chatWithSkills.mockResolvedValueOnce({
        content: validContent,
        model: "gpt-4o",
        isError: false,
      });

      await service.writeSection({
        section: makeSection({
          agentConfig: {
            skills: ["custom_analysis_skill"],
          },
        }),
        evidenceData: [],
      });

      const chatCall = mockAiFacade.chatWithSkills.mock.calls[0][0];
      expect(chatCall.additionalSkills).toEqual(["custom-analysis-skill"]);
    });

    it("should include analysisGuidance in prompt", async () => {
      mockAiFacade.chatWithSkills.mockResolvedValueOnce({
        content: validContent,
        model: "gpt-4o",
        isError: false,
      });

      await service.writeSection({
        section: makeSection({
          agentConfig: {
            analysisGuidance: "Focus on regulatory impact",
          },
        }),
        evidenceData: [],
      });

      const chatCall = mockAiFacade.chatWithSkills.mock.calls[0][0];
      const userMsg = chatCall.messages.find(
        (m: { role: string }) => m.role === "user",
      );
      expect(userMsg?.content).toContain("Focus on regulatory impact");
    });

    it('should include outputStyle "narrative" description', async () => {
      mockAiFacade.chatWithSkills.mockResolvedValueOnce({
        content: validContent,
        model: "gpt-4o",
        isError: false,
      });

      await service.writeSection({
        section: makeSection({
          agentConfig: { outputStyle: "narrative" },
        }),
        evidenceData: [],
      });

      const chatCall = mockAiFacade.chatWithSkills.mock.calls[0][0];
      const userMsg = chatCall.messages.find(
        (m: { role: string }) => m.role === "user",
      );
      expect(userMsg?.content).toContain("故事性强");
    });

    it('should include outputStyle "concise" description', async () => {
      mockAiFacade.chatWithSkills.mockResolvedValueOnce({
        content: validContent,
        model: "gpt-4o",
        isError: false,
      });

      await service.writeSection({
        section: makeSection({
          agentConfig: { outputStyle: "concise" },
        }),
        evidenceData: [],
      });

      const chatCall = mockAiFacade.chatWithSkills.mock.calls[0][0];
      const userMsg = chatCall.messages.find(
        (m: { role: string }) => m.role === "user",
      );
      expect(userMsg?.content).toContain("精炼要点");
    });

    it('should include outputStyle "detailed" description', async () => {
      mockAiFacade.chatWithSkills.mockResolvedValueOnce({
        content: validContent,
        model: "gpt-4o",
        isError: false,
      });

      await service.writeSection({
        section: makeSection({
          agentConfig: { outputStyle: "detailed" },
        }),
        evidenceData: [],
      });

      const chatCall = mockAiFacade.chatWithSkills.mock.calls[0][0];
      const userMsg = chatCall.messages.find(
        (m: { role: string }) => m.role === "user",
      );
      expect(userMsg?.content).toContain("面面俱到");
    });

    it("should include preferredDataSources in prompt", async () => {
      mockAiFacade.chatWithSkills.mockResolvedValueOnce({
        content: validContent,
        model: "gpt-4o",
        isError: false,
      });

      await service.writeSection({
        section: makeSection({
          agentConfig: {
            preferredDataSources: ["Bloomberg", "Reuters", "Gartner"],
          },
        }),
        evidenceData: [],
      });

      const chatCall = mockAiFacade.chatWithSkills.mock.calls[0][0];
      const userMsg = chatCall.messages.find(
        (m: { role: string }) => m.role === "user",
      );
      expect(userMsg?.content).toContain("Bloomberg");
      expect(userMsg?.content).toContain("Gartner");
    });

    it("should map all predefined skill IDs to kebab-case for additionalSkills", async () => {
      const allSkillIds = [
        "trend_analysis",
        "swot_analysis",
        "competitive_analysis",
        "deep_dive",
        "data_interpretation",
        "synthesis",
        "critical_thinking",
        "future_projection",
        "cause_effect",
        "comparison",
      ];

      const expectedKebab = [
        "trend-analysis",
        "swot-analysis",
        "competitive-analysis",
        "deep-dive",
        "data-interpretation",
        "synthesis",
        "critical-thinking",
        "future-projection",
        "cause-effect",
        "comparison",
      ];

      for (let i = 0; i < allSkillIds.length; i++) {
        jest.clearAllMocks();
        mockAiFacade.chatWithSkills.mockResolvedValueOnce({
          content: validContent,
          model: "gpt-4o",
          isError: false,
        });

        await service.writeSection({
          section: makeSection({ agentConfig: { skills: [allSkillIds[i]] } }),
          evidenceData: [],
        });

        const chatCall = mockAiFacade.chatWithSkills.mock.calls[0][0];
        expect(chatCall.additionalSkills).toEqual([expectedKebab[i]]);
      }
    });

    it("should use fallback guidance text when only skills are provided", async () => {
      mockAiFacade.chatWithSkills.mockResolvedValueOnce({
        content: validContent,
        model: "gpt-4o",
        isError: false,
      });

      await service.writeSection({
        section: makeSection({
          agentConfig: {
            skills: ["trend_analysis"],
          },
        }),
        evidenceData: [],
      });

      const chatCall = mockAiFacade.chatWithSkills.mock.calls[0][0];
      const userMsg = chatCall.messages.find(
        (m: { role: string }) => m.role === "user",
      );
      // Skills are no longer injected into user prompt; fallback guidance directs LLM to system message
      expect(userMsg?.content).toContain("请参考系统提示中的分析技能指导");
    });

    it("should not pass domain to chatWithSkills (only additionalSkills)", async () => {
      mockAiFacade.chatWithSkills.mockResolvedValueOnce({
        content: validContent,
        model: "gpt-4o",
        isError: false,
      });

      await service.writeSection({
        section: makeSection({
          agentConfig: {
            skills: ["trend_analysis"],
          },
        }),
        evidenceData: [],
      });

      const chatCall = mockAiFacade.chatWithSkills.mock.calls[0][0];
      expect(chatCall.domain).toBeUndefined();
    });

    it("should merge assignedSkills with section.agentConfig.skills", async () => {
      mockAiFacade.chatWithSkills.mockResolvedValueOnce({
        content: validContent,
        model: "gpt-4o",
        isError: false,
      });

      await service.writeSection({
        section: makeSection({
          agentConfig: {
            skills: ["trend_analysis"],
          },
        }),
        evidenceData: [],
        assignedSkills: ["deep_dive", "synthesis"],
      });

      const chatCall = mockAiFacade.chatWithSkills.mock.calls[0][0];
      // section-level skill + mission-level skills, all mapped to kebab-case
      expect(chatCall.additionalSkills).toContain("trend-analysis");
      expect(chatCall.additionalSkills).toContain("deep-dive");
      expect(chatCall.additionalSkills).toContain("synthesis");
    });

    it("should use only assignedSkills when section has no agentConfig", async () => {
      mockAiFacade.chatWithSkills.mockResolvedValueOnce({
        content: validContent,
        model: "gpt-4o",
        isError: false,
      });

      await service.writeSection({
        section: makeSection({ agentConfig: null }),
        evidenceData: [],
        assignedSkills: ["critical_thinking", "comparison"],
      });

      const chatCall = mockAiFacade.chatWithSkills.mock.calls[0][0];
      expect(chatCall.additionalSkills).toEqual([
        "critical-thinking",
        "comparison",
      ]);
    });

    it("should deduplicate merged skills when section and assignedSkills overlap", async () => {
      mockAiFacade.chatWithSkills.mockResolvedValueOnce({
        content: validContent,
        model: "gpt-4o",
        isError: false,
      });

      await service.writeSection({
        section: makeSection({
          agentConfig: {
            skills: ["trend_analysis", "synthesis"],
          },
        }),
        evidenceData: [],
        assignedSkills: ["synthesis", "deep_dive"], // "synthesis" overlaps
      });

      const chatCall = mockAiFacade.chatWithSkills.mock.calls[0][0];
      // "synthesis" should appear only once
      expect(
        chatCall.additionalSkills.filter((s: string) => s === "synthesis"),
      ).toHaveLength(1);
      expect(chatCall.additionalSkills).toContain("trend-analysis");
      expect(chatCall.additionalSkills).toContain("deep-dive");
    });
  });

  // ============================================================
  // Previous sections truncation
  // ============================================================

  describe("previous sections truncation", () => {
    const validContent = "# AI历史\n\n" + "A".repeat(500);

    it("should truncate at sentence boundary when content > 800 chars and last sentence end > 600", async () => {
      mockAiFacade.chatWithSkills.mockResolvedValueOnce({
        content: validContent,
        model: "gpt-4o",
        isError: false,
      });

      // 650 chars, then '。', then more content — last 。 is at 650 which > 600
      const longContent = "A".repeat(650) + "。" + "B".repeat(200);

      await service.writeSection({
        section: makeSection(),
        evidenceData: [],
        previousSections: [{ title: "Chapter 1", content: longContent }],
      });

      const chatCall = mockAiFacade.chatWithSkills.mock.calls[0][0];
      const userMsg = chatCall.messages.find(
        (m: { role: string }) => m.role === "user",
      );
      expect(userMsg?.content).toContain("Chapter 1");
      expect(userMsg?.content).toContain("...");
    });

    it("should truncate at English period boundary", async () => {
      mockAiFacade.chatWithSkills.mockResolvedValueOnce({
        content: validContent,
        model: "gpt-4o",
        isError: false,
      });

      const longContent = "A".repeat(650) + "." + "B".repeat(200);

      await service.writeSection({
        section: makeSection(),
        evidenceData: [],
        previousSections: [{ title: "Chapter 2", content: longContent }],
      });

      expect(mockAiFacade.chatWithSkills).toHaveBeenCalled();
    });

    it("should NOT truncate at sentence boundary when last sentence end <= 600", async () => {
      mockAiFacade.chatWithSkills.mockResolvedValueOnce({
        content: validContent,
        model: "gpt-4o",
        isError: false,
      });

      // 300 chars, then '。', then more content — last 。 is at 300 which <= 600
      const longContent = "A".repeat(300) + "。" + "B".repeat(600);

      await service.writeSection({
        section: makeSection(),
        evidenceData: [],
        previousSections: [{ title: "Chapter 3", content: longContent }],
      });

      expect(mockAiFacade.chatWithSkills).toHaveBeenCalled();
    });

    it("should stop adding sections when MAX_PREVIOUS_TOTAL (6000) is exceeded", async () => {
      mockAiFacade.chatWithSkills.mockResolvedValueOnce({
        content: validContent,
        model: "gpt-4o",
        isError: false,
      });

      // Each section is ~810 chars (800 + header); 8 sections = ~6480 chars > 6000
      const sections = Array.from({ length: 10 }, (_, i) => ({
        title: `Section${i}`,
        content: "A".repeat(800),
      }));

      await service.writeSection({
        section: makeSection(),
        evidenceData: [],
        previousSections: sections,
      });

      // Should not throw; just verify AI was called
      expect(mockAiFacade.chatWithSkills).toHaveBeenCalled();
    });
  });

  // ============================================================
  // backfillFigureUrls (#35)
  // ============================================================

  describe("backfillFigureUrls", () => {
    const makeFigureRef = (
      overrides: Partial<{
        id: string;
        evidenceCitationIndex: number;
        figureIndex: number;
        imageUrl: string | undefined;
        caption: string;
        position: string;
      }> = {},
    ) => ({
      id: "fig-1",
      evidenceCitationIndex: 1,
      figureIndex: 0,
      imageUrl: undefined as string | undefined,
      caption: "",
      position: "after_paragraph_1",
      ...overrides,
    });

    const makeAllocatedFigure = (
      overrides: Partial<{
        evidenceIndex: number;
        figureIndex: number;
        imageUrl: string;
        caption: string;
        relevanceReason: string;
      }> = {},
    ) => ({
      evidenceIndex: 1,
      figureIndex: 0,
      imageUrl: "https://example.com/chart.png",
      caption: "Market Share Chart",
      relevanceReason: "Supports main finding",
      ...overrides,
    });

    it("should return figureRefs unchanged when allocatedFigures is undefined", () => {
      const refs = [
        makeFigureRef({ imageUrl: "https://existing.com/img.png" }),
      ];

      const result = (service as any).backfillFigureUrls(refs, undefined);

      expect(result).toEqual(refs);
    });

    it("should return figureRefs unchanged when allocatedFigures is empty", () => {
      const refs = [
        makeFigureRef({ imageUrl: "https://existing.com/img.png" }),
      ];

      const result = (service as any).backfillFigureUrls(refs, []);

      expect(result).toEqual(refs);
    });

    it("should fill missing imageUrl from matching allocated figure", () => {
      const refs = [makeFigureRef({ imageUrl: undefined })];
      const allocated = [
        makeAllocatedFigure({ imageUrl: "https://example.com/chart.png" }),
      ];

      const result = (service as any).backfillFigureUrls(refs, allocated);

      expect(result[0].imageUrl).toBe("https://example.com/chart.png");
    });

    it("should fill missing caption from matching allocated figure", () => {
      const refs = [makeFigureRef({ imageUrl: undefined, caption: "" })];
      const allocated = [
        makeAllocatedFigure({
          imageUrl: "https://example.com/chart.png",
          caption: "Revenue Trend 2024",
        }),
      ];

      const result = (service as any).backfillFigureUrls(refs, allocated);

      expect(result[0].caption).toBe("Revenue Trend 2024");
    });

    it("should filter out refs still missing imageUrl after backfill (key behavior)", () => {
      // Ref has no imageUrl and no matching allocated figure (key mismatch)
      const refs = [
        makeFigureRef({
          evidenceCitationIndex: 5,
          figureIndex: 0,
          imageUrl: undefined,
        }),
      ];
      const allocated = [
        makeAllocatedFigure({
          evidenceIndex: 99, // does not match evidenceCitationIndex 5
          figureIndex: 0,
          imageUrl: "https://example.com/other.png",
        }),
      ];

      const result = (service as any).backfillFigureUrls(refs, allocated);

      // No match found => imageUrl still undefined => filtered out
      expect(result).toHaveLength(0);
    });

    it("should NOT overwrite existing imageUrl", () => {
      const originalUrl = "https://existing.com/original.png";
      const refs = [makeFigureRef({ imageUrl: originalUrl })];
      const allocated = [
        makeAllocatedFigure({ imageUrl: "https://example.com/new.png" }),
      ];

      const result = (service as any).backfillFigureUrls(refs, allocated);

      expect(result[0].imageUrl).toBe(originalUrl);
    });

    it("should NOT overwrite existing caption", () => {
      const originalCaption = "Original caption";
      const refs = [
        makeFigureRef({
          imageUrl: "https://existing.com/img.png",
          caption: originalCaption,
        }),
      ];
      const allocated = [
        makeAllocatedFigure({ caption: "Replacement caption" }),
      ];

      const result = (service as any).backfillFigureUrls(refs, allocated);

      expect(result[0].caption).toBe(originalCaption);
    });

    it("should keep refs that have imageUrl after backfill and drop refs without", () => {
      const refs = [
        makeFigureRef({
          id: "fig-1",
          evidenceCitationIndex: 1,
          figureIndex: 0,
          imageUrl: undefined,
        }),
        makeFigureRef({
          id: "fig-2",
          evidenceCitationIndex: 2,
          figureIndex: 0,
          imageUrl: undefined,
        }),
      ];
      const allocated = [
        makeAllocatedFigure({
          evidenceIndex: 1,
          figureIndex: 0,
          imageUrl: "https://example.com/chart1.png",
        }),
        // No allocation for evidenceIndex 2
      ];

      const result = (service as any).backfillFigureUrls(refs, allocated);

      expect(result).toHaveLength(1);
      expect(result[0].id).toBe("fig-1");
    });
  });
});
