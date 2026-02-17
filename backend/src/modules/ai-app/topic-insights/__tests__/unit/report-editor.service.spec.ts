/**
 * ReportEditorService Unit Tests
 *
 * Tests for cross-dimension deduplication and editing functionality
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
import { ReportEditorService } from "../../services/report/report-editor.service";
import { createMockAiEngineFacade } from "../mocks";

describe("ReportEditorService", () => {
  let service: ReportEditorService;
  let mockAiFacade: ReturnType<typeof createMockAiEngineFacade>;

  beforeEach(() => {
    mockAiFacade = createMockAiEngineFacade();
    service = new ReportEditorService(mockAiFacade as any);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  // ==================== editDimensionInputs Tests ====================

  describe("editDimensionInputs", () => {
    it("should return unchanged for empty array", async () => {
      // Arrange
      const dimensionInputs: unknown[] = [];
      const topicName = "Test Topic";

      // Act
      const result = await service.editDimensionInputs(
        dimensionInputs as any,
        topicName,
      );

      // Assert
      expect(result.dimensions).toEqual([]);
      expect(result.deduplicationStats.duplicateClaims).toBe(0);
      expect(result.deduplicationStats.removedParagraphs).toBe(0);
      expect(result.deduplicationStats.affectedDimensions).toEqual([]);
      expect(result.transitions).toEqual([]);
      expect(mockAiFacade.chat).not.toHaveBeenCalled();
    });

    it("should return unchanged for single dimension (no dedup needed)", async () => {
      // Arrange
      const dimensionInputs = [
        {
          dimensionId: "dim-1",
          dimensionName: "Market Analysis",
          dimensionDescription: "Market overview",
          summary: "Market is growing",
          keyFindings: [{ finding: "Growth rate 15%", evidenceIds: [] }],
          detailedContent: "# Market Analysis\n\nThe market is growing at 15%.",
          sourcesUsed: 3,
          trends: [],
          challenges: [],
          opportunities: [],
        },
      ];
      const topicName = "Test Topic";

      // Act
      const result = await service.editDimensionInputs(
        dimensionInputs as any,
        topicName,
      );

      // Assert
      expect(result.dimensions).toEqual(dimensionInputs);
      expect(result.deduplicationStats.duplicateClaims).toBe(0);
      expect(result.deduplicationStats.removedParagraphs).toBe(0);
      expect(result.transitions).toEqual([]);
      expect(mockAiFacade.chat).not.toHaveBeenCalled();
    });

    it("should call AI and apply dedup for 2+ dimensions", async () => {
      // Arrange
      const dimensionInputs = [
        {
          dimensionId: "dim-1",
          dimensionName: "Market Analysis",
          dimensionDescription: "Market overview",
          summary: "Market is growing",
          keyFindings: [{ finding: "Growth rate 15%", evidenceIds: [] }],
          detailedContent:
            "# Market Analysis\n\nThe global market reached $10B in 2024.\n\nGrowth is accelerating.",
          sourcesUsed: 3,
          trends: [],
          challenges: [],
          opportunities: [],
        },
        {
          dimensionId: "dim-2",
          dimensionName: "Competitive Landscape",
          dimensionDescription: "Competitor analysis",
          summary: "Competition is intense",
          keyFindings: [
            { finding: "Top 3 players control 60%", evidenceIds: [] },
          ],
          detailedContent:
            "# Competitive Landscape\n\nThe global market reached $10B in 2024.\n\nTop players dominate.",
          sourcesUsed: 2,
          trends: [],
          challenges: [],
          opportunities: [],
        },
      ];

      const dedupResponse = {
        duplicates: [
          {
            claim: "Market size $10B",
            dimensions: ["Market Analysis", "Competitive Landscape"],
            keepIn: "Market Analysis",
            removeFrom: ["Competitive Landscape"],
            paragraphHints: ["The global market reached $10B"],
          },
        ],
        suggestions: ["Keep market size data in Market Analysis only"],
      };

      mockAiFacade.chat.mockResolvedValue({
        content: JSON.stringify(dedupResponse),
        usage: { promptTokens: 500, completionTokens: 200, totalTokens: 700 },
      });

      // Act
      const result = await service.editDimensionInputs(
        dimensionInputs as any,
        "AI Market",
      );

      // Assert
      expect(mockAiFacade.chat).toHaveBeenCalledTimes(1);
      expect(result.deduplicationStats.duplicateClaims).toBe(1);
      expect(result.deduplicationStats.removedParagraphs).toBe(1);
      expect(result.deduplicationStats.affectedDimensions).toContain(
        "Competitive Landscape",
      );

      // Check that the duplicate paragraph was removed
      const editedDim2 = result.dimensions.find(
        (d) => d.dimensionName === "Competitive Landscape",
      );
      expect(editedDim2!.detailedContent).not.toContain(
        "The global market reached $10B in 2024.",
      );
      expect(editedDim2!.detailedContent).toContain("Top players dominate.");
    });

    it("should match paragraphs with normalized whitespace", async () => {
      // Arrange
      const dimensionInputs = [
        {
          dimensionId: "dim-1",
          dimensionName: "Dimension A",
          dimensionDescription: null,
          summary: "Summary A",
          keyFindings: [],
          detailedContent: "Para 1",
          sourcesUsed: 1,
          trends: [],
          challenges: [],
          opportunities: [],
        },
        {
          dimensionId: "dim-2",
          dimensionName: "Dimension B",
          dimensionDescription: null,
          summary: "Summary B",
          keyFindings: [],
          detailedContent:
            "Para 1\n\nThe   market    has   grown   significantly.\n\nPara 2",
          sourcesUsed: 1,
          trends: [],
          challenges: [],
          opportunities: [],
        },
      ];

      const dedupResponse = {
        duplicates: [
          {
            claim: "Market growth",
            dimensions: ["Dimension A", "Dimension B"],
            keepIn: "Dimension A",
            removeFrom: ["Dimension B"],
            // Note: extra spaces in hint
            paragraphHints: ["The market has grown"],
          },
        ],
        suggestions: [],
      };

      mockAiFacade.chat.mockResolvedValue({
        content: JSON.stringify(dedupResponse),
        usage: { promptTokens: 300, completionTokens: 100, totalTokens: 400 },
      });

      // Act
      const result = await service.editDimensionInputs(
        dimensionInputs,
        "Topic",
      );

      // Assert
      expect(result.deduplicationStats.removedParagraphs).toBe(1);
      const editedDimB = result.dimensions.find(
        (d) => d.dimensionName === "Dimension B",
      );
      expect(editedDimB!.detailedContent).toBe("Para 1\n\nPara 2");
    });

    it("should never remove headings (starting with #)", async () => {
      // Arrange
      const dimensionInputs = [
        {
          dimensionId: "dim-1",
          dimensionName: "Dimension A",
          dimensionDescription: null,
          summary: "Summary A",
          keyFindings: [],
          detailedContent: "Content A",
          sourcesUsed: 1,
          trends: [],
          challenges: [],
          opportunities: [],
        },
        {
          dimensionId: "dim-2",
          dimensionName: "Dimension B",
          dimensionDescription: null,
          summary: "Summary B",
          keyFindings: [],
          detailedContent:
            "# Heading 1\n\n## Subheading\n\nSome paragraph content here.",
          sourcesUsed: 1,
          trends: [],
          challenges: [],
          opportunities: [],
        },
      ];

      const dedupResponse = {
        duplicates: [
          {
            claim: "Duplicate heading",
            dimensions: ["Dimension A", "Dimension B"],
            keepIn: "Dimension A",
            removeFrom: ["Dimension B"],
            paragraphHints: ["# Heading 1", "## Subheading"],
          },
        ],
        suggestions: [],
      };

      mockAiFacade.chat.mockResolvedValue({
        content: JSON.stringify(dedupResponse),
        usage: { promptTokens: 300, completionTokens: 100, totalTokens: 400 },
      });

      // Act
      const result = await service.editDimensionInputs(
        dimensionInputs,
        "Topic",
      );

      // Assert
      // Headings should NOT be removed
      const editedDimB = result.dimensions.find(
        (d) => d.dimensionName === "Dimension B",
      );
      expect(editedDimB!.detailedContent).toContain("# Heading 1");
      expect(editedDimB!.detailedContent).toContain("## Subheading");
      expect(result.deduplicationStats.removedParagraphs).toBe(0);
    });

    it("should gracefully handle AI call failure and return original dimensions", async () => {
      // Arrange
      const dimensionInputs = [
        {
          dimensionId: "dim-1",
          dimensionName: "Dimension A",
          dimensionDescription: null,
          summary: "Summary A",
          keyFindings: [],
          detailedContent: "Content A",
          sourcesUsed: 1,
          trends: [],
          challenges: [],
          opportunities: [],
        },
        {
          dimensionId: "dim-2",
          dimensionName: "Dimension B",
          dimensionDescription: null,
          summary: "Summary B",
          keyFindings: [],
          detailedContent: "Content B",
          sourcesUsed: 1,
          trends: [],
          challenges: [],
          opportunities: [],
        },
      ];

      mockAiFacade.chat.mockRejectedValue(new Error("API timeout"));

      // Act
      const result = await service.editDimensionInputs(
        dimensionInputs,
        "Topic",
      );

      // Assert
      expect(result.dimensions).toEqual(dimensionInputs);
      expect(result.deduplicationStats.duplicateClaims).toBe(0);
      expect(result.deduplicationStats.removedParagraphs).toBe(0);
    });

    it("should handle invalid AI response gracefully", async () => {
      // Arrange
      const dimensionInputs = [
        {
          dimensionId: "dim-1",
          dimensionName: "Dimension A",
          dimensionDescription: null,
          summary: "Summary A",
          keyFindings: [],
          detailedContent: "Content A",
          sourcesUsed: 1,
          trends: [],
          challenges: [],
          opportunities: [],
        },
        {
          dimensionId: "dim-2",
          dimensionName: "Dimension B",
          dimensionDescription: null,
          summary: "Summary B",
          keyFindings: [],
          detailedContent: "Content B",
          sourcesUsed: 1,
          trends: [],
          challenges: [],
          opportunities: [],
        },
      ];

      // Return invalid JSON
      mockAiFacade.chat.mockResolvedValue({
        content: "This is not JSON",
        usage: { promptTokens: 100, completionTokens: 50, totalTokens: 150 },
      });

      // Act
      const result = await service.editDimensionInputs(
        dimensionInputs,
        "Topic",
      );

      // Assert
      expect(result.dimensions).toEqual(dimensionInputs);
      expect(result.deduplicationStats.duplicateClaims).toBe(0);
      expect(result.deduplicationStats.removedParagraphs).toBe(0);
    });
  });

  // ==================== generateTransitionHints Tests ====================

  describe("generateTransitionHints", () => {
    it("should generate N-1 transitions for N dimensions", async () => {
      // Arrange
      const dimensionInputs = [
        {
          dimensionId: "dim-1",
          dimensionName: "Market Overview",
          dimensionDescription: null,
          summary: "Market summary",
          keyFindings: [],
          detailedContent: "Market content",
          sourcesUsed: 1,
          trends: [],
          challenges: [],
          opportunities: [],
        },
        {
          dimensionId: "dim-2",
          dimensionName: "Technology Trends",
          dimensionDescription: null,
          summary: "Tech summary",
          keyFindings: [],
          detailedContent: "Tech content",
          sourcesUsed: 1,
          trends: [],
          challenges: [],
          opportunities: [],
        },
        {
          dimensionId: "dim-3",
          dimensionName: "Competitive Analysis",
          dimensionDescription: null,
          summary: "Competition summary",
          keyFindings: [],
          detailedContent: "Competition content",
          sourcesUsed: 1,
          trends: [],
          challenges: [],
          opportunities: [],
        },
      ];

      mockAiFacade.chat.mockResolvedValue({
        content: JSON.stringify({ duplicates: [], suggestions: [] }),
        usage: { promptTokens: 100, completionTokens: 50, totalTokens: 150 },
      });

      // Act
      const result = await service.editDimensionInputs(
        dimensionInputs,
        "AI Topic",
      );

      // Assert
      expect(result.transitions).toHaveLength(2); // N-1 = 3-1 = 2
      expect(result.transitions[0].fromDimension).toBe("Market Overview");
      expect(result.transitions[0].toDimension).toBe("Technology Trends");
      expect(result.transitions[1].fromDimension).toBe("Technology Trends");
      expect(result.transitions[1].toDimension).toBe("Competitive Analysis");
    });

    it("should generate no transitions for single dimension", async () => {
      // Arrange
      const dimensionInputs = [
        {
          dimensionId: "dim-1",
          dimensionName: "Single Dimension",
          dimensionDescription: null,
          summary: "Summary",
          keyFindings: [],
          detailedContent: "Content",
          sourcesUsed: 1,
          trends: [],
          challenges: [],
          opportunities: [],
        },
      ];

      // Act
      const result = await service.editDimensionInputs(
        dimensionInputs,
        "Topic",
      );

      // Assert
      expect(result.transitions).toEqual([]);
    });

    it("should include dimension names in transition text", async () => {
      // Arrange
      const dimensionInputs = [
        {
          dimensionId: "dim-1",
          dimensionName: "市场规模",
          dimensionDescription: null,
          summary: "市场摘要",
          keyFindings: [],
          detailedContent: "市场内容",
          sourcesUsed: 1,
          trends: [],
          challenges: [],
          opportunities: [],
        },
        {
          dimensionId: "dim-2",
          dimensionName: "技术创新",
          dimensionDescription: null,
          summary: "技术摘要",
          keyFindings: [],
          detailedContent: "技术内容",
          sourcesUsed: 1,
          trends: [],
          challenges: [],
          opportunities: [],
        },
      ];

      mockAiFacade.chat.mockResolvedValue({
        content: JSON.stringify({ duplicates: [], suggestions: [] }),
        usage: { promptTokens: 100, completionTokens: 50, totalTokens: 150 },
      });

      // Act
      const result = await service.editDimensionInputs(
        dimensionInputs,
        "AI 主题",
      );

      // Assert
      expect(result.transitions).toHaveLength(1);
      expect(result.transitions[0].transitionText).toContain("市场规模");
      expect(result.transitions[0].transitionText).toContain("技术创新");
    });
  });
});
