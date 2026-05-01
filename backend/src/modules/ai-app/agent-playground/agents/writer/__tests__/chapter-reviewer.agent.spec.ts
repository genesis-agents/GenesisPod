/**
 * ChapterReviewerAgent — unit tests
 *
 * 覆盖：
 *   - inputSchema
 *   - outputSchema: pass/revise, score bounds, issues max(6), summary max(300)
 *   - buildSystemPrompt: targetWords, wordCount threshold 70%, index/heading in prompt
 */

import { z } from "zod";
import { readDefineAgentMeta } from "../../../../../ai-harness/kernel/dx";
import { ChapterReviewerAgent } from "../chapter-reviewer.agent";

const meta = readDefineAgentMeta(ChapterReviewerAgent)!;
const inputSchema = meta.inputSchema as z.ZodType;
const outputSchema = meta.outputSchema as z.ZodType;

const baseChapter = {
  index: 1,
  heading: "Market Overview",
  thesis: "AI is transforming finance.",
  body: "This chapter covers AI adoption trends with specific evidence and data points.",
  wordCount: 900,
  targetWords: 1000,
};

const baseInput = {
  topic: "AI in Finance",
  dimension: "Market Growth",
  language: "zh-CN" as const,
  chapter: baseChapter,
};

const validIssue = {
  severity: "must-fix" as const,
  dimension: "evidence" as const,
  pointer: "§2 第 3 段",
  issue: "缺乏具体数字支撑",
  suggestion: "添加至少一个具体百分比或数字",
};

const baseOutput = {
  index: 1,
  decision: "pass" as const,
  score: 80,
  issues: [],
  summary: "章节质量良好，结构清晰，证据充分。",
};

describe("ChapterReviewerAgent", () => {
  let agent: ChapterReviewerAgent;

  beforeAll(() => {
    agent = new ChapterReviewerAgent();
  });

  // ─────────────────────────────────────────────
  // inputSchema
  // ─────────────────────────────────────────────

  describe("inputSchema", () => {
    it("accepts valid minimal input", () => {
      expect(inputSchema.safeParse(baseInput).success).toBe(true);
    });

    it("accepts language en-US", () => {
      expect(
        inputSchema.safeParse({ ...baseInput, language: "en-US" }).success,
      ).toBe(true);
    });

    it("rejects invalid language", () => {
      expect(
        inputSchema.safeParse({ ...baseInput, language: "ja-JP" }).success,
      ).toBe(false);
    });

    it("rejects missing topic", () => {
      const { topic: _, ...rest } = baseInput as Record<string, unknown>;
      expect(inputSchema.safeParse(rest).success).toBe(false);
    });

    it("rejects missing chapter", () => {
      const { chapter: _, ...rest } = baseInput as Record<string, unknown>;
      expect(inputSchema.safeParse(rest).success).toBe(false);
    });

    it("rejects non-integer chapter index", () => {
      expect(
        inputSchema.safeParse({
          ...baseInput,
          chapter: { ...baseChapter, index: 1.5 },
        }).success,
      ).toBe(false);
    });

    it("rejects non-integer chapter wordCount", () => {
      expect(
        inputSchema.safeParse({
          ...baseInput,
          chapter: { ...baseChapter, wordCount: 900.5 },
        }).success,
      ).toBe(false);
    });

    it("rejects non-integer chapter targetWords", () => {
      expect(
        inputSchema.safeParse({
          ...baseInput,
          chapter: { ...baseChapter, targetWords: 1000.9 },
        }).success,
      ).toBe(false);
    });

    it("rejects missing chapter thesis", () => {
      const { thesis: _, ...chapterRest } = baseChapter as Record<
        string,
        unknown
      >;
      expect(
        inputSchema.safeParse({ ...baseInput, chapter: chapterRest }).success,
      ).toBe(false);
    });

    it("accepts chapter with zero wordCount", () => {
      expect(
        inputSchema.safeParse({
          ...baseInput,
          chapter: { ...baseChapter, wordCount: 0 },
        }).success,
      ).toBe(true);
    });
  });

  // ─────────────────────────────────────────────
  // outputSchema
  // ─────────────────────────────────────────────

  describe("outputSchema", () => {
    it("accepts valid pass output", () => {
      expect(outputSchema.safeParse(baseOutput).success).toBe(true);
    });

    it("accepts valid revise output with issues", () => {
      expect(
        outputSchema.safeParse({
          ...baseOutput,
          decision: "revise",
          score: 55,
          issues: [validIssue],
        }).success,
      ).toBe(true);
    });

    it("rejects decision not in enum", () => {
      expect(
        outputSchema.safeParse({ ...baseOutput, decision: "hold" }).success,
      ).toBe(false);
    });

    it("rejects score below 0", () => {
      expect(outputSchema.safeParse({ ...baseOutput, score: -1 }).success).toBe(
        false,
      );
    });

    it("rejects score above 100", () => {
      expect(
        outputSchema.safeParse({ ...baseOutput, score: 101 }).success,
      ).toBe(false);
    });

    it("accepts score at boundary 0", () => {
      expect(outputSchema.safeParse({ ...baseOutput, score: 0 }).success).toBe(
        true,
      );
    });

    it("accepts score at boundary 100", () => {
      expect(
        outputSchema.safeParse({ ...baseOutput, score: 100 }).success,
      ).toBe(true);
    });

    it("rejects non-integer score", () => {
      expect(
        outputSchema.safeParse({ ...baseOutput, score: 75.5 }).success,
      ).toBe(false);
    });

    it("rejects issues array with more than 6 items", () => {
      const issues = Array.from({ length: 7 }, () => validIssue);
      expect(outputSchema.safeParse({ ...baseOutput, issues }).success).toBe(
        false,
      );
    });

    it("accepts issues array with exactly 6 items", () => {
      const issues = Array.from({ length: 6 }, () => validIssue);
      expect(outputSchema.safeParse({ ...baseOutput, issues }).success).toBe(
        true,
      );
    });

    it("rejects summary exceeding 300 chars", () => {
      expect(
        outputSchema.safeParse({
          ...baseOutput,
          summary: "A".repeat(301),
        }).success,
      ).toBe(false);
    });

    it("accepts summary at exactly 300 chars", () => {
      expect(
        outputSchema.safeParse({
          ...baseOutput,
          summary: "A".repeat(300),
        }).success,
      ).toBe(true);
    });

    it("accepts optional critique field", () => {
      expect(
        outputSchema.safeParse({
          ...baseOutput,
          critique: "Overall the chapter needs more evidence.",
        }).success,
      ).toBe(true);
    });

    it("accepts valid severity values in issues", () => {
      for (const severity of [
        "must-fix",
        "should-fix",
        "nice-to-have",
      ] as const) {
        expect(
          outputSchema.safeParse({
            ...baseOutput,
            issues: [{ ...validIssue, severity }],
          }).success,
        ).toBe(true);
      }
    });

    it("rejects invalid severity in issue", () => {
      expect(
        outputSchema.safeParse({
          ...baseOutput,
          issues: [{ ...validIssue, severity: "critical" }],
        }).success,
      ).toBe(false);
    });

    it("accepts all valid issue dimensions", () => {
      const validDimensions = [
        "evidence",
        "logic",
        "structure",
        "citation",
        "length",
        "style",
      ] as const;
      for (const dim of validDimensions) {
        expect(
          outputSchema.safeParse({
            ...baseOutput,
            issues: [{ ...validIssue, dimension: dim }],
          }).success,
        ).toBe(true);
      }
    });

    it("rejects invalid dimension in issue", () => {
      expect(
        outputSchema.safeParse({
          ...baseOutput,
          issues: [{ ...validIssue, dimension: "grammar" }],
        }).success,
      ).toBe(false);
    });
  });

  // ─────────────────────────────────────────────
  // buildSystemPrompt
  // ─────────────────────────────────────────────

  describe("buildSystemPrompt", () => {
    const identity = {
      role: { id: "chapter-reviewer", name: "Reviewer" },
    } as never;

    it("contains chapter index and heading", () => {
      const prompt = agent.buildSystemPrompt({ input: baseInput, identity });
      expect(prompt).toContain("1");
      expect(prompt).toContain("Market Overview");
    });

    it("contains dimension name", () => {
      const prompt = agent.buildSystemPrompt({ input: baseInput, identity });
      expect(prompt).toContain("Market Growth");
    });

    it("contains targetWords value", () => {
      const prompt = agent.buildSystemPrompt({ input: baseInput, identity });
      expect(prompt).toContain("1000");
    });

    it("contains wordCount of chapter", () => {
      const prompt = agent.buildSystemPrompt({ input: baseInput, identity });
      expect(prompt).toContain("900");
    });

    it("contains 70% hard rule threshold calculation", () => {
      // 1000 * 0.7 = 700
      const prompt = agent.buildSystemPrompt({ input: baseInput, identity });
      expect(prompt).toContain("700");
    });

    it("contains pass threshold 70 in decision rules", () => {
      const prompt = agent.buildSystemPrompt({ input: baseInput, identity });
      expect(prompt).toContain("70 分");
    });

    it("contains score checklist items (post template-removal 2026-04-30)", () => {
      const prompt = agent.buildSystemPrompt({ input: baseInput, identity });
      // 新 6 项：观点独立性 / 证据具体 / 引用充分 / 去模板化 / 字数达标
      expect(prompt).toContain("观点独立性");
      expect(prompt).toContain("证据具体");
      expect(prompt).toContain("去模板化");
      expect(prompt).toContain("anti-template");
    });

    it("contains language in prompt", () => {
      const prompt = agent.buildSystemPrompt({ input: baseInput, identity });
      expect(prompt).toContain("zh-CN");
    });

    it("body slice appears in prompt", () => {
      const prompt = agent.buildSystemPrompt({ input: baseInput, identity });
      expect(prompt).toContain("AI adoption trends");
    });

    it("prompt shows chapter body word count", () => {
      const prompt = agent.buildSystemPrompt({ input: baseInput, identity });
      expect(prompt).toContain("900 字");
    });
  });
});
