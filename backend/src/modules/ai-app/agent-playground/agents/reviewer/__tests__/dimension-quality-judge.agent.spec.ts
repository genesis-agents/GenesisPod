/**
 * DimensionQualityJudgeAgent — unit tests
 *
 * 覆盖：
 *   - inputSchema
 *   - outputSchema: 5-axis scores, grade enum, overall bounds
 *   - buildSystemPrompt: axis descriptions, weighted formula, grade mapping,
 *     source list (sliced to 30), fullMarkdown slice
 */

import { z } from "zod";
import { readDefineAgentMeta } from "../../../../../ai-harness/kernel/dx";
import { DimensionQualityJudgeAgent } from "../dimension-quality-judge.agent";

const meta = readDefineAgentMeta(DimensionQualityJudgeAgent)!;
const inputSchema = meta.inputSchema as z.ZodType;
const outputSchema = meta.outputSchema as z.ZodType;

const baseInput = {
  topic: "AI in Finance",
  dimension: "Market Growth",
  language: "zh-CN" as const,
  abstract:
    "AI is transforming financial markets with measurable revenue impacts.",
  fullMarkdown: "# Market Growth\n\nAI adoption grew 40% in 2024...",
  totalWordCount: 1500,
  sources: [
    { url: "https://example.com/source1", publishedDate: "2024-01-15" },
    { url: "https://example.com/source2" },
  ],
};

const axisScore = { score: 80, comment: "Good coverage" };

const baseOutput = {
  dimension: "Market Growth",
  overall: 78,
  grade: "good" as const,
  axes: {
    breadth: axisScore,
    depth: axisScore,
    evidence: axisScore,
    coherence: axisScore,
    freshness: axisScore,
  },
  summary: "Overall a strong dimension report with good evidence coverage.",
};

describe("DimensionQualityJudgeAgent", () => {
  let agent: DimensionQualityJudgeAgent;

  beforeAll(() => {
    agent = new DimensionQualityJudgeAgent();
  });

  // ─────────────────────────────────────────────
  // inputSchema
  // ─────────────────────────────────────────────

  describe("inputSchema", () => {
    it("accepts valid minimal input", () => {
      expect(inputSchema.safeParse(baseInput).success).toBe(true);
    });

    it("accepts source without publishedDate", () => {
      expect(
        inputSchema.safeParse({
          ...baseInput,
          sources: [{ url: "https://example.com" }],
        }).success,
      ).toBe(true);
    });

    it("accepts empty sources array", () => {
      expect(inputSchema.safeParse({ ...baseInput, sources: [] }).success).toBe(
        true,
      );
    });

    it("accepts language en-US", () => {
      expect(
        inputSchema.safeParse({ ...baseInput, language: "en-US" }).success,
      ).toBe(true);
    });

    it("rejects invalid language", () => {
      expect(
        inputSchema.safeParse({ ...baseInput, language: "es-ES" }).success,
      ).toBe(false);
    });

    it("rejects non-integer totalWordCount", () => {
      expect(
        inputSchema.safeParse({ ...baseInput, totalWordCount: 1500.5 }).success,
      ).toBe(false);
    });

    it("rejects missing abstract", () => {
      const { abstract: _, ...rest } = baseInput as Record<string, unknown>;
      expect(inputSchema.safeParse(rest).success).toBe(false);
    });

    it("rejects missing fullMarkdown", () => {
      const { fullMarkdown: _, ...rest } = baseInput as Record<string, unknown>;
      expect(inputSchema.safeParse(rest).success).toBe(false);
    });

    it("rejects missing topic", () => {
      const { topic: _, ...rest } = baseInput as Record<string, unknown>;
      expect(inputSchema.safeParse(rest).success).toBe(false);
    });

    it("rejects missing dimension", () => {
      const { dimension: _, ...rest } = baseInput as Record<string, unknown>;
      expect(inputSchema.safeParse(rest).success).toBe(false);
    });
  });

  // ─────────────────────────────────────────────
  // outputSchema
  // ─────────────────────────────────────────────

  describe("outputSchema", () => {
    it("accepts valid output", () => {
      expect(outputSchema.safeParse(baseOutput).success).toBe(true);
    });

    it("accepts all grade values", () => {
      for (const grade of ["excellent", "good", "fair", "poor"] as const) {
        expect(outputSchema.safeParse({ ...baseOutput, grade }).success).toBe(
          true,
        );
      }
    });

    it("rejects invalid grade", () => {
      expect(
        outputSchema.safeParse({ ...baseOutput, grade: "average" }).success,
      ).toBe(false);
    });

    it("rejects overall score below 0", () => {
      expect(
        outputSchema.safeParse({ ...baseOutput, overall: -1 }).success,
      ).toBe(false);
    });

    it("rejects overall score above 100", () => {
      expect(
        outputSchema.safeParse({ ...baseOutput, overall: 101 }).success,
      ).toBe(false);
    });

    it("accepts overall score at boundary 0", () => {
      expect(
        outputSchema.safeParse({ ...baseOutput, overall: 0 }).success,
      ).toBe(true);
    });

    it("accepts overall score at boundary 100", () => {
      expect(
        outputSchema.safeParse({ ...baseOutput, overall: 100 }).success,
      ).toBe(true);
    });

    it("rejects non-integer overall", () => {
      expect(
        outputSchema.safeParse({ ...baseOutput, overall: 78.5 }).success,
      ).toBe(false);
    });

    it("rejects axis score below 0", () => {
      expect(
        outputSchema.safeParse({
          ...baseOutput,
          axes: {
            ...baseOutput.axes,
            breadth: { score: -1, comment: "bad" },
          },
        }).success,
      ).toBe(false);
    });

    it("rejects axis score above 100", () => {
      expect(
        outputSchema.safeParse({
          ...baseOutput,
          axes: {
            ...baseOutput.axes,
            depth: { score: 101, comment: "too high" },
          },
        }).success,
      ).toBe(false);
    });

    it("rejects non-integer axis score", () => {
      expect(
        outputSchema.safeParse({
          ...baseOutput,
          axes: {
            ...baseOutput.axes,
            evidence: { score: 75.5, comment: "decimal" },
          },
        }).success,
      ).toBe(false);
    });

    it("rejects missing axes", () => {
      const { axes: _, ...rest } = baseOutput as Record<string, unknown>;
      expect(outputSchema.safeParse(rest).success).toBe(false);
    });

    it("rejects axes missing breadth", () => {
      const { breadth: _, ...axesRest } = baseOutput.axes as Record<
        string,
        unknown
      >;
      expect(
        outputSchema.safeParse({ ...baseOutput, axes: axesRest }).success,
      ).toBe(false);
    });

    it("rejects missing summary", () => {
      const { summary: _, ...rest } = baseOutput as Record<string, unknown>;
      expect(outputSchema.safeParse(rest).success).toBe(false);
    });

    it("accepts output with excellent grade (score ≥ 85)", () => {
      expect(
        outputSchema.safeParse({
          ...baseOutput,
          overall: 90,
          grade: "excellent",
        }).success,
      ).toBe(true);
    });

    it("accepts output with poor grade (score < 55)", () => {
      expect(
        outputSchema.safeParse({
          ...baseOutput,
          overall: 45,
          grade: "poor",
        }).success,
      ).toBe(true);
    });
  });

  // ─────────────────────────────────────────────
  // buildSystemPrompt
  // ─────────────────────────────────────────────

  describe("buildSystemPrompt", () => {
    const identity = {
      role: { id: "quality-judge", name: "Quality Judge" },
    } as never;

    it("contains dimension name", () => {
      const prompt = agent.buildSystemPrompt({ input: baseInput, identity });
      expect(prompt).toContain("Market Growth");
    });

    it("contains topic", () => {
      const prompt = agent.buildSystemPrompt({ input: baseInput, identity });
      expect(prompt).toContain("AI in Finance");
    });

    it("contains 5 axis descriptions", () => {
      const prompt = agent.buildSystemPrompt({ input: baseInput, identity });
      expect(prompt).toContain("breadth");
      expect(prompt).toContain("depth");
      expect(prompt).toContain("evidence");
      expect(prompt).toContain("coherence");
      expect(prompt).toContain("freshness");
    });

    it("contains weighted formula: breadth 20% depth 25% evidence 25%", () => {
      const prompt = agent.buildSystemPrompt({ input: baseInput, identity });
      expect(prompt).toContain("20%");
      expect(prompt).toContain("25%");
      expect(prompt).toContain("15%");
    });

    it("contains grade mapping thresholds", () => {
      const prompt = agent.buildSystemPrompt({ input: baseInput, identity });
      expect(prompt).toContain("85");
      expect(prompt).toContain("70-84");
      expect(prompt).toContain("55-69");
    });

    it("contains source list entries", () => {
      const prompt = agent.buildSystemPrompt({ input: baseInput, identity });
      expect(prompt).toContain("https://example.com/source1");
      expect(prompt).toContain("2024-01-15");
    });

    it("source without publishedDate shows no date", () => {
      const prompt = agent.buildSystemPrompt({ input: baseInput, identity });
      expect(prompt).toContain("https://example.com/source2");
    });

    it("shows source count in prompt", () => {
      const prompt = agent.buildSystemPrompt({ input: baseInput, identity });
      expect(prompt).toContain("2 条");
    });

    it("slices fullMarkdown to 4000 chars", () => {
      const longMarkdown = "A".repeat(5000);
      const prompt = agent.buildSystemPrompt({
        input: { ...baseInput, fullMarkdown: longMarkdown },
        identity,
      });
      // The sliced version (4000 A's) should be in the prompt
      expect(prompt).toContain("A".repeat(100));
      // Full 5000 chars should NOT be in prompt
      expect(prompt.includes("A".repeat(5000))).toBe(false);
    });

    it("slices sources to 30 entries max", () => {
      const manySources = Array.from({ length: 35 }, (_, i) => ({
        url: `https://example.com/source${i}`,
        publishedDate: "2024-01-01",
      }));
      const prompt = agent.buildSystemPrompt({
        input: { ...baseInput, sources: manySources },
        identity,
      });
      // Source 30 (index 30) should NOT appear
      expect(prompt).not.toContain("source34");
    });

    it("contains abstract in prompt", () => {
      const prompt = agent.buildSystemPrompt({ input: baseInput, identity });
      expect(prompt).toContain(
        "AI is transforming financial markets with measurable revenue impacts.",
      );
    });

    it("contains language in prompt", () => {
      const prompt = agent.buildSystemPrompt({ input: baseInput, identity });
      expect(prompt).toContain("zh-CN");
    });
  });
});
