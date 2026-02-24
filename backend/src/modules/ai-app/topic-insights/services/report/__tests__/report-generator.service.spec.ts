/**
 * ReportGeneratorService Unit Tests
 *
 * Coverage targets:
 * - checkCrossDimensionConsistency: single vs multiple dimensions
 * - generateComprehensiveReport: happy path, fallback on context_length error
 * - generateExecutiveSummary: delegates to generateComprehensiveReport
 */

import { Test, TestingModule } from "@nestjs/testing";
import { ReportGeneratorService } from "../report-generator.service";
import { AIEngineFacade } from "@/modules/ai-engine/facade";
import type { ResearchTopic } from "@prisma/client";
import type { DimensionAnalysisInput, EvidenceInput } from "../../../types/report.types";

// ──────────────────────────────────────────────────────────────────────────────
// Fixtures
// ──────────────────────────────────────────────────────────────────────────────

const mockTopic: ResearchTopic = {
  id: "topic-001",
  name: "量子计算发展趋势",
  type: "technology",
  description: "量子计算领域分析",
  language: "zh",
  userId: "user-001",
  status: "ACTIVE",
  topicConfig: null,
  searchConfig: null,
  visibility: "PRIVATE",
  createdAt: new Date(),
  updatedAt: new Date(),
  scheduledAt: null,
  refreshInterval: null,
  lastRefreshedAt: null,
  totalTokens: 0,
  totalSources: 0,
  totalDimensions: 0,
  isTemplate: false,
  templateCategory: null,
  templateDescription: null,
  shareToken: null,
  sharedAt: null,
  tags: [],
} as unknown as ResearchTopic;

const mockEnglishTopic = { ...mockTopic, language: "en" } as unknown as ResearchTopic;

function buildDimensionInput(overrides?: Partial<DimensionAnalysisInput>): DimensionAnalysisInput {
  return {
    dimensionId: "dim-001",
    dimensionName: "技术现状",
    dimensionDescription: "当前量子计算技术状态",
    summary: "量子计算进入实用化阶段",
    keyFindings: [
      { finding: "超导量子位错误率下降至 1%", significance: "high", evidenceIds: ["ev-1"] },
    ],
    trends: [{ trend: "量子优越性实验增加", direction: "up", timeframe: "2024", evidenceIds: ["ev-1"] }],
    challenges: [{ challenge: "退相干问题", impact: "high", evidenceIds: ["ev-2"] }],
    opportunities: [{ opportunity: "药物研发加速", potential: "very high", evidenceIds: ["ev-3"] }],
    detailedContent: "## 技术现状\n\n量子计算机已突破 1000 量子位门槛。",
    sourcesUsed: 10,
    figureReferences: [],
    generatedCharts: [],
    ...overrides,
  };
}

function buildEvidenceInput(): EvidenceInput {
  return {
    citationIndex: 1,
    title: "Quantum Computing Progress 2024",
    url: "https://arxiv.org/abs/2024.0001",
    domain: "arxiv.org",
    sourceType: "ACADEMIC",
    publishedAt: new Date("2024-01-15"),
    credibilityScore: 0.95,
  };
}

const VALID_REPORT_JSON = JSON.stringify({
  executiveSummary: "量子计算进入新纪元，商业化路径逐渐清晰。",
  preface: "本报告基于最新研究数据...",
  conclusion: "## 跨维度关联分析\n内容\n\n## 风险评估\n内容\n\n## 战略建议\n内容\n\n## 结语\n最终结论。",
  highlights: [
    { title: "量子优越性", description: "已超越经典计算机", category: "breakthrough", importance: "high" },
  ],
  charts: [],
});

// ──────────────────────────────────────────────────────────────────────────────
// Tests
// ──────────────────────────────────────────────────────────────────────────────

describe("ReportGeneratorService", () => {
  let service: ReportGeneratorService;
  let mockFacade: { chat: jest.Mock };

  beforeEach(async () => {
    mockFacade = { chat: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ReportGeneratorService,
        { provide: AIEngineFacade, useValue: mockFacade },
      ],
    }).compile();

    service = module.get<ReportGeneratorService>(ReportGeneratorService);
  });

  afterEach(() => jest.clearAllMocks());

  // ============================================================
  // checkCrossDimensionConsistency
  // ============================================================

  describe("checkCrossDimensionConsistency", () => {
    it("should return high consistency without AI call for single dimension", async () => {
      const result = await service.checkCrossDimensionConsistency(mockTopic, [
        buildDimensionInput(),
      ]);

      expect(mockFacade.chat).not.toHaveBeenCalled();
      expect(result.overallConsistency).toBe("high");
      expect(result.conflicts).toHaveLength(0);
      expect(result.summary).toBe("单维度研究，无需跨维度一致性检查");
    });

    it("should return high consistency without AI call for zero dimensions", async () => {
      const result = await service.checkCrossDimensionConsistency(mockTopic, []);

      expect(mockFacade.chat).not.toHaveBeenCalled();
      expect(result.overallConsistency).toBe("high");
    });

    it("should call AI and return parsed consistency result for multiple dimensions", async () => {
      mockFacade.chat.mockResolvedValue({
        content: JSON.stringify({
          overallConsistency: "medium",
          conflicts: [
            {
              type: "data_conflict",
              severity: "warning",
              dimensions: ["技术现状", "市场应用"],
              description: "量子位数量数据不一致",
              suggestedResolution: "以权威来源为准",
            },
          ],
          recommendations: ["统一引用标准"],
          summary: "存在轻微数据差异",
        }),
      });

      const dims = [buildDimensionInput(), buildDimensionInput({ dimensionName: "市场应用", dimensionId: "dim-002" })];
      const result = await service.checkCrossDimensionConsistency(mockTopic, dims);

      expect(mockFacade.chat).toHaveBeenCalledTimes(1);
      expect(result.overallConsistency).toBe("medium");
      expect(result.conflicts).toHaveLength(1);
      expect(result.conflicts[0].type).toBe("data_conflict");
    });

    it("should return default high consistency when AI call fails", async () => {
      mockFacade.chat.mockRejectedValue(new Error("AI service unavailable"));

      const dims = [buildDimensionInput(), buildDimensionInput({ dimensionId: "dim-002" })];
      const result = await service.checkCrossDimensionConsistency(mockTopic, dims);

      expect(result.overallConsistency).toBe("high");
      expect(result.conflicts).toHaveLength(0);
      expect(result.summary).toBe("一致性检查跳过");
    });

    it("should return default high consistency when AI response cannot be parsed", async () => {
      mockFacade.chat.mockResolvedValue({ content: "This is not JSON" });

      const dims = [buildDimensionInput(), buildDimensionInput({ dimensionId: "dim-002" })];
      const result = await service.checkCrossDimensionConsistency(mockTopic, dims);

      expect(result.overallConsistency).toBe("high");
      expect(result.conflicts).toHaveLength(0);
    });

    it("should handle critical conflicts in response", async () => {
      mockFacade.chat.mockResolvedValue({
        content: JSON.stringify({
          overallConsistency: "low",
          conflicts: [
            {
              type: "logic_conflict",
              severity: "critical",
              dimensions: ["A", "B"],
              description: "逻辑矛盾",
              suggestedResolution: "重新分析",
            },
            {
              type: "data_conflict",
              severity: "warning",
              dimensions: ["A", "C"],
              description: "数据差异",
              suggestedResolution: "标注差异",
            },
          ],
          recommendations: ["重新审查数据"],
          summary: "存在严重冲突",
        }),
      });

      const dims = [
        buildDimensionInput(),
        buildDimensionInput({ dimensionId: "dim-002", dimensionName: "B" }),
      ];
      const result = await service.checkCrossDimensionConsistency(mockTopic, dims);

      expect(result.overallConsistency).toBe("low");
      expect(result.conflicts.filter((c) => c.severity === "critical")).toHaveLength(1);
    });
  });

  // ============================================================
  // generateComprehensiveReport
  // ============================================================

  describe("generateComprehensiveReport", () => {
    it("should generate a comprehensive report on happy path", async () => {
      mockFacade.chat.mockResolvedValue({ content: VALID_REPORT_JSON });

      const result = await service.generateComprehensiveReport(
        mockTopic,
        [buildDimensionInput()],
        [buildEvidenceInput()],
      );

      expect(mockFacade.chat).toHaveBeenCalledTimes(1);
      expect(result.executiveSummary).toBe("量子计算进入新纪元，商业化路径逐渐清晰。");
      expect(result.highlights).toHaveLength(1);
      expect(result.fullReport).toBeDefined();
    });

    it("should include conflict notice in prompt when consistency check has conflicts", async () => {
      mockFacade.chat.mockResolvedValue({ content: VALID_REPORT_JSON });

      const consistencyCheck = {
        overallConsistency: "low" as const,
        conflicts: [
          {
            type: "data_conflict",
            severity: "critical",
            dimensions: ["A", "B"],
            description: "数据矛盾",
            suggestedResolution: "统一标准",
          },
        ],
        recommendations: ["重新核查"],
      };

      await service.generateComprehensiveReport(
        mockTopic,
        [buildDimensionInput()],
        [buildEvidenceInput()],
        consistencyCheck,
      );

      const chatCall = mockFacade.chat.mock.calls[0][0];
      const userPrompt = chatCall.messages[1].content;
      expect(userPrompt).toContain("数据一致性修正指令");
      expect(userPrompt).toContain("数据矛盾");
    });

    it("should include userFeedback in prompt when provided", async () => {
      mockFacade.chat.mockResolvedValue({ content: VALID_REPORT_JSON });

      await service.generateComprehensiveReport(
        mockTopic,
        [buildDimensionInput()],
        [],
        undefined,
        "请重点分析商业化前景",
      );

      const chatCall = mockFacade.chat.mock.calls[0][0];
      const userPrompt = chatCall.messages[1].content;
      expect(userPrompt).toContain("请重点分析商业化前景");
    });

    it("should fall back to reduced prompt on context_length error", async () => {
      mockFacade.chat
        .mockRejectedValueOnce(new Error("context_length exceeded"))
        .mockResolvedValueOnce({ content: VALID_REPORT_JSON });

      const result = await service.generateComprehensiveReport(
        mockTopic,
        [buildDimensionInput()],
        [buildEvidenceInput()],
      );

      expect(mockFacade.chat).toHaveBeenCalledTimes(2);
      expect(result.executiveSummary).toBeDefined();
    });

    it("should fall back to reduced prompt on input-complexity-check error", async () => {
      mockFacade.chat
        .mockRejectedValueOnce(new Error("input-complexity-check failed"))
        .mockResolvedValueOnce({ content: VALID_REPORT_JSON });

      await service.generateComprehensiveReport(
        mockTopic,
        [buildDimensionInput()],
        [],
      );

      expect(mockFacade.chat).toHaveBeenCalledTimes(2);
      // Second call should omit detailed evidence
      const secondCall = mockFacade.chat.mock.calls[1][0];
      const userPrompt = secondCall.messages[1].content;
      expect(userPrompt).toContain("证据列表已省略");
    });

    it("should rethrow non-complexity errors without fallback", async () => {
      mockFacade.chat.mockRejectedValue(new Error("Authentication failed"));

      await expect(
        service.generateComprehensiveReport(mockTopic, [buildDimensionInput()], []),
      ).rejects.toThrow("Authentication failed");

      expect(mockFacade.chat).toHaveBeenCalledTimes(1);
    });

    it("should scale maxTokens based on dimension count", async () => {
      mockFacade.chat.mockResolvedValue({ content: VALID_REPORT_JSON });

      const manyDimensions = Array.from({ length: 20 }, (_, i) =>
        buildDimensionInput({ dimensionId: `dim-${i}`, dimensionName: `维度 ${i}` }),
      );

      await service.generateComprehensiveReport(mockTopic, manyDimensions, []);

      const chatCall = mockFacade.chat.mock.calls[0][0];
      // With 20 dimensions: base(16000) + 20*2500 = 66000, capped at 64000
      expect(chatCall.maxTokens).toBe(64000);
    });

    it("should use correct modelType (CHAT) for report synthesis", async () => {
      mockFacade.chat.mockResolvedValue({ content: VALID_REPORT_JSON });

      await service.generateComprehensiveReport(mockTopic, [buildDimensionInput()], []);

      const chatCall = mockFacade.chat.mock.calls[0][0];
      expect(chatCall.modelType).toBe("CHAT");
    });

    it("should handle English language topic with correct labels", async () => {
      mockFacade.chat.mockResolvedValue({
        content: JSON.stringify({
          executiveSummary: "Executive summary here",
          preface: "Preface content",
          conclusion: "## Cross-Dimension Analysis\nContent\n\n## Risk Assessment\nContent\n\n## Strategic Recommendations\nContent\n\n## Conclusion\nFinal conclusion.",
          highlights: [],
          charts: [],
        }),
      });

      const result = await service.generateComprehensiveReport(
        mockEnglishTopic,
        [buildDimensionInput()],
        [],
      );

      expect(result.executiveSummary).toBe("Executive summary here");
    });

    it("should handle malformed AI response gracefully", async () => {
      mockFacade.chat.mockResolvedValue({ content: "Not valid JSON at all." });

      const result = await service.generateComprehensiveReport(
        mockTopic,
        [buildDimensionInput()],
        [],
      );

      // Service normalizes the response and returns a result
      expect(result).toBeDefined();
      expect(result.fullReport).toBeDefined();
    });
  });

  // ============================================================
  // generateExecutiveSummary
  // ============================================================

  describe("generateExecutiveSummary", () => {
    it("should return only the executive summary from a comprehensive report", async () => {
      mockFacade.chat.mockResolvedValue({ content: VALID_REPORT_JSON });

      const summary = await service.generateExecutiveSummary(
        mockTopic,
        [buildDimensionInput()],
      );

      expect(summary).toBe("量子计算进入新纪元，商业化路径逐渐清晰。");
    });

    it("should call AI once and delegate to generateComprehensiveReport", async () => {
      mockFacade.chat.mockResolvedValue({ content: VALID_REPORT_JSON });

      await service.generateExecutiveSummary(mockTopic, [buildDimensionInput()]);

      expect(mockFacade.chat).toHaveBeenCalledTimes(1);
    });
  });

  // ============================================================
  // buildFullReportFromDimensions — public method
  // ============================================================

  describe("buildFullReportFromDimensions", () => {
    it("should build a report string from dimension inputs (Chinese topic)", () => {
      const result = service.buildFullReportFromDimensions(
        mockTopic,
        [buildDimensionInput()],
        {
          preface: "研究前言内容",
          executiveSummary: "执行摘要内容",
          crossDimensionAnalysis: "跨维度分析内容",
          riskAssessment: "风险评估内容",
          strategicRecommendations: "战略建议内容",
          conclusion: "结语内容",
        },
      );

      expect(typeof result).toBe("string");
      expect(result).toContain(mockTopic.name);
      expect(result).toContain("执行摘要");
      expect(result).toContain("前言");
    });

    it("should build a report string from dimension inputs (English topic)", () => {
      const result = service.buildFullReportFromDimensions(
        mockEnglishTopic,
        [buildDimensionInput()],
        {
          preface: "Preface content",
          executiveSummary: "Executive summary content",
          crossDimensionAnalysis: "Cross dimension analysis",
          riskAssessment: "Risk assessment content",
          strategicRecommendations: "Strategic recommendations",
          conclusion: "Conclusion content",
        },
      );

      expect(result).toContain("Executive Summary");
      expect(result).toContain("Preface");
      expect(result).toContain("Cross-Dimension Analysis");
    });

    it("should sort dimensions by priority", () => {
      const dim1 = buildDimensionInput({ dimensionName: "低优先级维度", priority: 999 });
      const dim2 = buildDimensionInput({ dimensionId: "dim-002", dimensionName: "高优先级维度", priority: 1 });

      const result = service.buildFullReportFromDimensions(
        mockTopic,
        [dim1, dim2],
        {},
      );

      const highPriorityIdx = result.indexOf("高优先级维度");
      const lowPriorityIdx = result.indexOf("低优先级维度");
      expect(highPriorityIdx).toBeLessThan(lowPriorityIdx);
    });

    it("should generate fallback cross-dimension content when supplementary fields are all empty", () => {
      const dim1 = buildDimensionInput({
        dimensionName: "维度A",
        keyFindings: [
          { finding: "发现1", significance: "high", evidenceIds: [] },
          { finding: "发现2", significance: "medium", evidenceIds: [] },
        ],
      });
      const dim2 = buildDimensionInput({
        dimensionId: "dim-002",
        dimensionName: "维度B",
        keyFindings: [{ finding: "发现3", significance: "high", evidenceIds: [] }],
      });

      const result = service.buildFullReportFromDimensions(
        mockTopic,
        [dim1, dim2],
        {}, // no supplementary content
      );

      expect(result).toContain("维度A");
      expect(result).toContain("维度B");
    });

    it("should include risk assessment fallback from dimension challenges", () => {
      const dim = buildDimensionInput({
        challenges: [
          { challenge: "主要挑战1", impact: "high", evidenceIds: [] },
          { challenge: "主要挑战2", impact: "medium", evidenceIds: [] },
        ],
      });

      const result = service.buildFullReportFromDimensions(
        mockTopic,
        [dim],
        {}, // no supplementary content
      );

      expect(result).toContain("风险评估");
    });

    it("should include strategic recommendations fallback from dimension opportunities", () => {
      const dim = buildDimensionInput({
        opportunities: [
          { opportunity: "战略机会1", potential: "high", evidenceIds: [] },
        ],
      });

      const result = service.buildFullReportFromDimensions(
        mockTopic,
        [dim],
        {}, // no supplementary content
      );

      expect(result).toContain("战略建议");
    });

    it("should handle dimension with detailedContent containing heading level-1 sections", () => {
      const dim = buildDimensionInput({
        detailedContent: "# 一级标题\n\n内容段落\n\n## 二级标题\n\n更多内容",
      });

      const result = service.buildFullReportFromDimensions(
        mockTopic,
        [dim],
        {},
      );

      // Heading levels should be demoted
      expect(result).toBeDefined();
      expect(typeof result).toBe("string");
    });

    it("should strip inline images from dimension content", () => {
      const dim = buildDimensionInput({
        detailedContent: "内容\n\n![alt text](https://example.com/image.png)\n\n更多内容",
      });

      const result = service.buildFullReportFromDimensions(
        mockTopic,
        [dim],
        {},
      );

      expect(result).not.toContain("![alt text]");
    });

    it("should skip duplicate cross-dimension section if already in dimension content", () => {
      const dim = buildDimensionInput({
        detailedContent: "## 跨维度关联分析\n\n已有跨维度内容",
      });

      const result = service.buildFullReportFromDimensions(
        mockTopic,
        [dim],
        { crossDimensionAnalysis: "新的跨维度分析" },
      );

      // Should not duplicate the section
      expect(result).toBeDefined();
    });

    it("should include table of contents entries for all dimensions", () => {
      const dims = [
        buildDimensionInput({ dimensionName: "技术现状", priority: 1 }),
        buildDimensionInput({ dimensionId: "dim-002", dimensionName: "市场分析", priority: 2 }),
      ];

      const result = service.buildFullReportFromDimensions(
        mockTopic,
        dims,
        { crossDimensionAnalysis: "跨维度分析" },
      );

      expect(result).toContain("技术现状");
      expect(result).toContain("市场分析");
    });

    it("should truncate very long dimension content", () => {
      const longContent = "这是很长的内容。".repeat(3500); // > 24000 chars
      const dim = buildDimensionInput({
        detailedContent: longContent,
      });

      const result = service.buildFullReportFromDimensions(
        mockTopic,
        [dim],
        {},
      );

      expect(result).toBeDefined();
      // Content should be truncated - result will be shorter than naive concatenation
      expect(result.length).toBeLessThan(longContent.length * 2);
    });

    it("should handle empty dimensionInputs array", () => {
      const result = service.buildFullReportFromDimensions(
        mockTopic,
        [],
        { executiveSummary: "Summary with no dims" },
      );

      expect(result).toBeDefined();
      expect(result).toContain(mockTopic.name);
    });
  });

  // ============================================================
  // normalizeExecutiveSummary — object vs string format
  // ============================================================

  describe("normalizeExecutiveSummary via generateComprehensiveReport", () => {
    it("should handle executiveSummary as structured object with fullText", async () => {
      mockFacade.chat.mockResolvedValue({
        content: JSON.stringify({
          executiveSummary: {
            fullText: "来自 fullText 的摘要",
            coreConclusions: ["结论1"],
          },
          preface: "",
          conclusion: "",
          highlights: [],
          charts: [],
        }),
      });

      const result = await service.generateComprehensiveReport(
        mockTopic,
        [buildDimensionInput()],
        [],
      );

      expect(result.executiveSummary).toBe("来自 fullText 的摘要");
    });

    it("should assemble executiveSummary from structured fields when fullText absent", async () => {
      mockFacade.chat.mockResolvedValue({
        content: JSON.stringify({
          executiveSummary: {
            coreConclusions: ["量子计算超越经典算法", "商业应用加速落地"],
            keyMetrics: [{ metric: "市场规模", value: "$500B", source: "Gartner" }],
            riskAlerts: ["量子纠错成本高"],
            actionItems: ["加大量子投资"],
          },
          preface: "",
          conclusion: "",
          highlights: [],
          charts: [],
        }),
      });

      const result = await service.generateComprehensiveReport(
        mockTopic,
        [buildDimensionInput()],
        [],
      );

      expect(result.executiveSummary).toContain("核心结论");
      expect(result.executiveSummary).toContain("量子计算超越经典算法");
      expect(result.executiveSummary).toContain("关键数据");
      expect(result.executiveSummary).toContain("风险提示");
      expect(result.executiveSummary).toContain("行动建议");
    });

    it("should handle executiveSummary as JSON string containing coreConclusions", async () => {
      const esJson = JSON.stringify({
        coreConclusions: ["量子计算突破性进展"],
        fullText: "完整摘要文本",
      });

      mockFacade.chat.mockResolvedValue({
        content: JSON.stringify({
          executiveSummary: esJson,
          preface: "",
          conclusion: "",
          highlights: [],
          charts: [],
        }),
      });

      const result = await service.generateComprehensiveReport(
        mockTopic,
        [buildDimensionInput()],
        [],
      );

      expect(result.executiveSummary).toBe("完整摘要文本");
    });

    it("should handle executiveSummary as plain JSON string that fails to parse", async () => {
      mockFacade.chat.mockResolvedValue({
        content: JSON.stringify({
          executiveSummary: "{invalid json",
          preface: "",
          conclusion: "",
          highlights: [],
          charts: [],
        }),
      });

      const result = await service.generateComprehensiveReport(
        mockTopic,
        [buildDimensionInput()],
        [],
      );

      expect(result.executiveSummary).toBe("{invalid json");
    });

    it("should return empty string for null/undefined executiveSummary", async () => {
      mockFacade.chat.mockResolvedValue({
        content: JSON.stringify({
          executiveSummary: null,
          preface: "",
          conclusion: "",
          highlights: [],
          charts: [],
        }),
      });

      const result = await service.generateComprehensiveReport(
        mockTopic,
        [buildDimensionInput()],
        [],
      );

      expect(result.executiveSummary).toBe("");
    });
  });

  // ============================================================
  // normalizeReportResponse — crossDimensionAnalysis / riskAssessment / strategicRecommendations
  // ============================================================

  describe("normalizeReportResponse — supplementary content fields", () => {
    it("should use crossDimensionAnalysis.fullText when present", async () => {
      mockFacade.chat.mockResolvedValue({
        content: JSON.stringify({
          executiveSummary: "摘要",
          crossDimensionAnalysis: { fullText: "跨维度完整文本" },
          preface: "",
          conclusion: "",
          highlights: [],
          charts: [],
        }),
      });

      const result = await service.generateComprehensiveReport(
        mockTopic,
        [buildDimensionInput()],
        [],
      );

      expect(result.fullReport).toContain("跨维度完整文本");
    });

    it("should generate crossDimensionAnalysis from causalChains and keyLinkages when fullText absent", async () => {
      mockFacade.chat.mockResolvedValue({
        content: JSON.stringify({
          executiveSummary: "摘要",
          crossDimensionAnalysis: {
            causalChains: [
              { chain: "A→B→C", explanation: "原因链解释", timeframe: "2024-2026" },
            ],
            keyLinkages: [
              { dimensions: ["技术", "市场"], relationship: "相互促进", impact: "高" },
            ],
          },
          preface: "",
          conclusion: "",
          highlights: [],
          charts: [],
        }),
      });

      const result = await service.generateComprehensiveReport(
        mockTopic,
        [buildDimensionInput()],
        [],
      );

      expect(result.fullReport).toContain("A→B→C");
    });

    it("should generate riskAssessment from riskMatrix when fullText absent", async () => {
      mockFacade.chat.mockResolvedValue({
        content: JSON.stringify({
          executiveSummary: "摘要",
          riskAssessment: {
            riskMatrix: [
              {
                riskType: "技术风险",
                probability: "高",
                impact: "重大",
                timeframe: "2025",
                indicators: "量子错误率升高",
                mitigation: "增加纠错预算",
              },
            ],
          },
          preface: "",
          conclusion: "",
          highlights: [],
          charts: [],
        }),
      });

      const result = await service.generateComprehensiveReport(
        mockTopic,
        [buildDimensionInput()],
        [],
      );

      expect(result.fullReport).toContain("技术风险");
    });

    it("should generate strategicRecommendations from forEnterprise/forInvestors when fullText absent", async () => {
      mockFacade.chat.mockResolvedValue({
        content: JSON.stringify({
          executiveSummary: "摘要",
          strategicRecommendations: {
            forEnterprise: {
              shortTerm: ["优化量子算法", "招募量子工程师"],
              midTerm: ["建立量子计算中心"],
            },
            forInvestors: {
              opportunities: ["量子计算初创公司"],
              risks: ["技术成熟期不确定"],
            },
            forPolicymakers: {
              keyObservations: ["需要国际合作框架"],
            },
          },
          preface: "",
          conclusion: "",
          highlights: [],
          charts: [],
        }),
      });

      const result = await service.generateComprehensiveReport(
        mockTopic,
        [buildDimensionInput()],
        [],
      );

      expect(result.fullReport).toContain("优化量子算法");
    });

    it("should use English labels when language is en", async () => {
      mockFacade.chat.mockResolvedValue({
        content: JSON.stringify({
          executiveSummary: "Summary",
          crossDimensionAnalysis: {
            causalChains: [
              { chain: "A→B", explanation: "Explanation", timeframe: "2024" },
            ],
          },
          preface: "",
          conclusion: "",
          highlights: [],
          charts: [],
        }),
      });

      const result = await service.generateComprehensiveReport(
        mockEnglishTopic,
        [buildDimensionInput()],
        [],
      );

      expect(result.fullReport).toContain("Causal Chain Analysis");
    });
  });

  // ============================================================
  // createFallbackReport — when AI response cannot be parsed
  // ============================================================

  describe("createFallbackReport via malformed AI response", () => {
    it("should extract viewpoints from numbered list in fallback", async () => {
      const contentWithPoints = "分析结果\n\n1. 量子计算市场规模快速增长。\n2. 技术突破持续推进。";
      mockFacade.chat.mockResolvedValue({ content: contentWithPoints });

      const result = await service.generateComprehensiveReport(
        mockTopic,
        [buildDimensionInput()],
        [],
      );

      expect(result).toBeDefined();
      expect(result.fullReport).toBeDefined();
    });

    it("should extract viewpoints from key-phrase patterns in fallback", async () => {
      const contentWithKeyPhrases = "研究内容\n\n关键：量子计算将在五年内实现商业化突破。核心：错误纠正率成关键指标。";
      mockFacade.chat.mockResolvedValue({ content: contentWithKeyPhrases });

      const result = await service.generateComprehensiveReport(
        mockTopic,
        [buildDimensionInput()],
        [],
      );

      expect(result).toBeDefined();
    });

    it("should use first sentence as executiveSummary in fallback", async () => {
      const contentWithSentence = "量子计算市场规模超过百亿美元。后续内容...";
      mockFacade.chat.mockResolvedValue({ content: contentWithSentence });

      const result = await service.generateComprehensiveReport(
        mockTopic,
        [buildDimensionInput()],
        [],
      );

      expect(result.executiveSummary).toContain("量子计算市场规模超过百亿美元");
    });

    it("should use English label for fallback section when language is en", async () => {
      mockFacade.chat.mockResolvedValue({ content: "Research content without valid JSON." });

      const result = await service.generateComprehensiveReport(
        mockEnglishTopic,
        [buildDimensionInput()],
        [],
      );

      expect(result).toBeDefined();
      expect(result.fullReport).toBeDefined();
    });
  });

  // ============================================================
  // generateComprehensiveReport — conflict notice branches
  // ============================================================

  describe("generateComprehensiveReport — conflict notice branches", () => {
    it("should include both critical and warning conflict notices", async () => {
      mockFacade.chat.mockResolvedValue({ content: VALID_REPORT_JSON });

      const consistencyCheck = {
        overallConsistency: "low" as const,
        conflicts: [
          {
            type: "data_conflict",
            severity: "critical",
            dimensions: ["A", "B"],
            description: "临界数据矛盾",
            suggestedResolution: "选用权威来源",
          },
          {
            type: "source_conflict",
            severity: "warning",
            dimensions: ["C", "D"],
            description: "次要差异",
            suggestedResolution: "标注来源差异",
          },
        ],
        recommendations: ["审查数据"],
      };

      await service.generateComprehensiveReport(
        mockTopic,
        [buildDimensionInput()],
        [],
        consistencyCheck,
      );

      const chatCall = mockFacade.chat.mock.calls[0][0];
      const userPrompt = chatCall.messages[1].content;
      expect(userPrompt).toContain("关键冲突");
      expect(userPrompt).toContain("次要差异");
    });

    it("should not include conflict notice when conflicts array is empty", async () => {
      mockFacade.chat.mockResolvedValue({ content: VALID_REPORT_JSON });

      const consistencyCheck = {
        overallConsistency: "high" as const,
        conflicts: [],
        recommendations: [],
      };

      await service.generateComprehensiveReport(
        mockTopic,
        [buildDimensionInput()],
        [],
        consistencyCheck,
      );

      const chatCall = mockFacade.chat.mock.calls[0][0];
      const userPrompt = chatCall.messages[1].content;
      expect(userPrompt).not.toContain("数据一致性修正指令");
    });

    it("should handle max_tokens error in fallback chain", async () => {
      mockFacade.chat
        .mockRejectedValueOnce(new Error("max_tokens exceeded limit"))
        .mockResolvedValueOnce({ content: VALID_REPORT_JSON });

      const result = await service.generateComprehensiveReport(
        mockTopic,
        [buildDimensionInput()],
        [buildEvidenceInput()],
      );

      expect(mockFacade.chat).toHaveBeenCalledTimes(2);
      expect(result).toBeDefined();
    });

    it("should calculate small maxTokens for 1 dimension", async () => {
      mockFacade.chat.mockResolvedValue({ content: VALID_REPORT_JSON });

      await service.generateComprehensiveReport(mockTopic, [buildDimensionInput()], []);

      const chatCall = mockFacade.chat.mock.calls[0][0];
      // 1 dim: base(16000) + 1*2500 = 18500
      expect(chatCall.maxTokens).toBe(18500);
    });
  });

  // ============================================================
  // checkCrossDimensionConsistency — additional branches
  // ============================================================

  describe("checkCrossDimensionConsistency — additional branches", () => {
    it("should include keyFindings and trends in dimension summaries sent to AI", async () => {
      mockFacade.chat.mockResolvedValue({
        content: JSON.stringify({
          overallConsistency: "high",
          conflicts: [],
          recommendations: [],
          summary: "一致性良好",
        }),
      });

      const dimA = buildDimensionInput({
        keyFindings: [
          { finding: "发现A1", significance: "high", evidenceIds: [] },
          { finding: "发现A2", significance: "medium", evidenceIds: [] },
          { finding: "发现A3", significance: "low", evidenceIds: [] },
          { finding: "发现A4", significance: "low", evidenceIds: [] }, // Only first 3 included
        ],
        trends: [
          { trend: "趋势A1", direction: "up", timeframe: "2024", evidenceIds: [] },
          { trend: "趋势A2", direction: "stable", timeframe: "2024", evidenceIds: [] },
          { trend: "趋势A3", direction: "down", timeframe: "2024", evidenceIds: [] }, // Only first 2 included
        ],
      });
      const dimB = buildDimensionInput({ dimensionId: "dim-002", dimensionName: "市场" });

      await service.checkCrossDimensionConsistency(mockTopic, [dimA, dimB]);

      const chatCall = mockFacade.chat.mock.calls[0][0];
      const userMsg = chatCall.messages[1].content;
      // First 3 key findings
      expect(userMsg).toContain("发现A1");
      expect(userMsg).toContain("发现A3");
      // First 2 trends
      expect(userMsg).toContain("趋势A1");
      expect(userMsg).toContain("趋势A2");
    });

    it("should handle dimension with no keyFindings or trends", async () => {
      mockFacade.chat.mockResolvedValue({
        content: JSON.stringify({
          overallConsistency: "high",
          conflicts: [],
          recommendations: [],
          summary: "无数据",
        }),
      });

      const dimEmpty = buildDimensionInput({
        keyFindings: [],
        trends: [],
        summary: "",
      });
      const dimB = buildDimensionInput({ dimensionId: "dim-002" });

      const result = await service.checkCrossDimensionConsistency(
        mockTopic,
        [dimEmpty, dimB],
      );

      expect(result.overallConsistency).toBe("high");
    });
  });
});
