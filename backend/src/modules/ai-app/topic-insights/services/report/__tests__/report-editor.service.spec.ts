/**
 * ReportEditorService Unit Tests
 *
 * Coverage targets:
 * - editDimensionInputs: single dimension (no-op), multi-dimension dedup
 * - generateTransitionHints: produces transitions between adjacent dimensions
 * - checkCrossDimensionDuplicates: AI call succeeds, AI call fails (non-fatal)
 * - Duplicate removal from detailedContent using paragraphHints
 */

import { Test, TestingModule } from "@nestjs/testing";
import { ReportEditorService } from "../report-editor.service";
import { ChatFacade } from "@/modules/ai-engine/facade";

// ──────────────────────────────────────────────────────────────────────────────
// Mock fixtures
// ──────────────────────────────────────────────────────────────────────────────

const mockFacade = {
  chatWithSkills: jest.fn(),
};

const makeDimensionInput = (id: string, name: string, content = "") => ({
  dimensionId: id,
  dimensionName: name,
  dimensionDescription: `Description for ${name}`,
  summary: `Summary for ${name}`,
  keyFindings: [
    { finding: `Finding for ${name}`, significance: "high", evidenceIds: [] },
  ],
  trends: [],
  challenges: [],
  opportunities: [],
  detailedContent: content,
  sourcesUsed: 5,
  figureReferences: [],
  generatedCharts: [],
});

// ──────────────────────────────────────────────────────────────────────────────
// Test suite
// ──────────────────────────────────────────────────────────────────────────────

describe("ReportEditorService", () => {
  let service: ReportEditorService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ReportEditorService,
        { provide: ChatFacade, useValue: mockFacade },
      ],
    }).compile();

    service = module.get<ReportEditorService>(ReportEditorService);
    jest.clearAllMocks();
  });

  // ──────────────────────── editDimensionInputs ─────────────────────────────

  describe("editDimensionInputs", () => {
    it("should return input unchanged when only one dimension", async () => {
      const input = [makeDimensionInput("dim-001", "Market Size")];

      const result = await service.editDimensionInputs(input, "AI Market");

      expect(result.dimensions).toHaveLength(1);
      expect(result.deduplicationStats.duplicateClaims).toBe(0);
      expect(result.transitions).toHaveLength(0);
      expect(mockFacade.chatWithSkills).not.toHaveBeenCalled();
    });

    it("should process multiple dimensions and generate transitions", async () => {
      mockFacade.chatWithSkills.mockResolvedValue({
        content: '```json\n{"duplicates": [], "suggestions": []}\n```',
        tokensUsed: 100,
      });

      const inputs = [
        makeDimensionInput("dim-001", "Market Size"),
        makeDimensionInput("dim-002", "Competitors"),
        makeDimensionInput("dim-003", "Trends"),
      ];

      const result = await service.editDimensionInputs(inputs, "AI Market");

      expect(result.dimensions).toHaveLength(3);
      expect(result.transitions).toHaveLength(2); // between 3 dims: [0->1, 1->2]
    });

    it("should remove duplicate paragraphs using paragraphHints", async () => {
      const duplicateParagraph =
        "The global AI chip market reached $50 billion in 2024, growing rapidly.";

      mockFacade.chatWithSkills.mockResolvedValue({
        content: JSON.stringify({
          duplicates: [
            {
              claim: "AI chip market $50 billion",
              dimensions: ["Market Size", "Competitors"],
              keepIn: "Market Size",
              removeFrom: ["Competitors"],
              paragraphHints: [duplicateParagraph.substring(0, 30)],
            },
          ],
          suggestions: [],
        }),
        tokensUsed: 150,
      });

      const inputs = [
        makeDimensionInput(
          "dim-001",
          "Market Size",
          "Market overview section.\n\nKey findings here.",
        ),
        makeDimensionInput(
          "dim-002",
          "Competitors",
          `Competitor analysis.\n\n${duplicateParagraph}\n\nCompetitor details.`,
        ),
      ];

      const result = await service.editDimensionInputs(inputs, "AI Market");

      expect(result.deduplicationStats.duplicateClaims).toBe(1);
    });

    it("should handle AI failure gracefully (non-fatal)", async () => {
      mockFacade.chatWithSkills.mockRejectedValue(
        new Error("AI service unavailable"),
      );

      const inputs = [
        makeDimensionInput("dim-001", "Market Size"),
        makeDimensionInput("dim-002", "Competitors"),
      ];

      const result = await service.editDimensionInputs(inputs, "AI Market");

      // Should still return dimensions without crashing
      expect(result.dimensions).toHaveLength(2);
      expect(result.deduplicationStats.duplicateClaims).toBe(0);
    });

    it("should handle malformed AI JSON response gracefully", async () => {
      mockFacade.chatWithSkills.mockResolvedValue({
        content: "This is not valid JSON response",
        tokensUsed: 50,
      });

      const inputs = [
        makeDimensionInput("dim-001", "Market Size"),
        makeDimensionInput("dim-002", "Competitors"),
      ];

      const result = await service.editDimensionInputs(inputs, "AI Market");

      expect(result.dimensions).toHaveLength(2);
    });
  });

  // ──────────────────── generateTransitionHints ────────────────────────────

  describe("transition hints generation", () => {
    it("should generate transitions mentioning both dimension names", async () => {
      mockFacade.chatWithSkills.mockResolvedValue({
        content: '{"duplicates": [], "suggestions": []}',
        tokensUsed: 100,
      });

      const inputs = [
        makeDimensionInput("dim-001", "Market Size"),
        makeDimensionInput("dim-002", "Technology Trends"),
      ];

      const result = await service.editDimensionInputs(inputs, "AI Report");

      expect(result.transitions).toHaveLength(1);
      expect(result.transitions[0].fromDimension).toBe("Market Size");
      expect(result.transitions[0].toDimension).toBe("Technology Trends");
      expect(result.transitions[0].transitionText).toContain("Market Size");
      expect(result.transitions[0].transitionText).toContain(
        "Technology Trends",
      );
    });

    it("should generate N-1 transitions for N dimensions", async () => {
      mockFacade.chatWithSkills.mockResolvedValue({
        content: '{"duplicates": [], "suggestions": []}',
        tokensUsed: 100,
      });

      const inputs = Array.from({ length: 5 }, (_, i) =>
        makeDimensionInput(`dim-00${i}`, `Dimension ${i}`),
      );

      const result = await service.editDimensionInputs(inputs, "AI Report");

      expect(result.transitions).toHaveLength(4);
    });
  });

  // ──────────────────── terminology/data consistency ────────────────────────

  describe("V5 enhanced deduplication", () => {
    it("should pass through terminologyIssues from AI response", async () => {
      mockFacade.chatWithSkills.mockResolvedValue({
        content: JSON.stringify({
          duplicates: [],
          suggestions: [],
          terminologyIssues: [
            {
              term: "AI",
              variants: ["Artificial Intelligence", "A.I."],
              standardForm: "AI",
              affectedDimensions: ["Market Size", "Trends"],
            },
          ],
          dataConsistencyIssues: [],
        }),
        tokensUsed: 100,
      });

      const inputs = [
        makeDimensionInput("dim-001", "Market Size"),
        makeDimensionInput("dim-002", "Trends"),
      ];

      const result = await service.editDimensionInputs(inputs, "AI Report");

      expect(result.terminologyIssues).toHaveLength(1);
      expect(result.terminologyIssues![0].term).toBe("AI");
    });
  });
});
