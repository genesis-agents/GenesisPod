import { validateLatexDelimiters } from "../latex-delimiter-validator";

describe("validateLatexDelimiters", () => {
  describe("valid inputs", () => {
    it("passes empty markdown", () => {
      expect(validateLatexDelimiters("").valid).toBe(true);
    });

    it("passes markdown without math", () => {
      expect(validateLatexDelimiters("# Title\n\nJust prose.").valid).toBe(
        true,
      );
    });

    it("passes well-formed inline math", () => {
      const result = validateLatexDelimiters("Let $\\alpha + \\beta$ be.");
      expect(result.valid).toBe(true);
    });

    it("passes well-formed display math", () => {
      const result = validateLatexDelimiters(
        "Eq: $$\\sum_{i=1}^{n} x_i$$ ends.",
      );
      expect(result.valid).toBe(true);
    });

    it("passes multi-line display math", () => {
      const result = validateLatexDelimiters(
        "Text\n$$\n\\frac{a}{b}\n$$\nmore text",
      );
      expect(result.valid).toBe(true);
    });

    it("passes \\text{CJK} inside inline math", () => {
      const result = validateLatexDelimiters(
        "公式 $T_{\\text{延迟}} + T_{\\text{偏移}}$ 的和。",
      );
      expect(result.valid).toBe(true);
    });

    it("passes multiple inline blocks on same line", () => {
      const result = validateLatexDelimiters("$a$, $b$, and $c$ are defined.");
      expect(result.valid).toBe(true);
    });

    it("passes \\begin/\\end environments", () => {
      const result = validateLatexDelimiters(
        "$$\\begin{aligned}a &= 1\\\\b &= 2\\end{aligned}$$",
      );
      expect(result.valid).toBe(true);
    });

    it("does not count escaped \\$ as delimiter", () => {
      const result = validateLatexDelimiters("Price is \\$5.");
      expect(result.valid).toBe(true);
    });
  });

  describe("detects violations", () => {
    it("flags odd $ count on a line", () => {
      const result = validateLatexDelimiters(
        "Text $\\alpha + \\beta with no close",
      );
      expect(result.valid).toBe(false);
      expect(result.issues[0].kind).toBe("inline-unbalanced");
      expect(result.issues[0].line).toBe(1);
    });

    it("flags prose absorbed into inline math", () => {
      const result = validateLatexDelimiters(
        "输出 $T=\\frac{a}{b}，其中 B$ 是基准值",
      );
      expect(result.valid).toBe(false);
      expect(result.issues.some((i) => i.kind === "prose-in-inline-math")).toBe(
        true,
      );
    });

    it("flags unbalanced $$ display math", () => {
      const result = validateLatexDelimiters("$$\\alpha + \\beta");
      expect(result.valid).toBe(false);
      expect(result.issues.some((i) => i.kind === "display-unbalanced")).toBe(
        true,
      );
    });

    it("flags unbalanced \\[ \\]", () => {
      const result = validateLatexDelimiters("Math \\[\\alpha");
      expect(result.valid).toBe(false);
      expect(
        result.issues.some((i) => i.kind === "bracket-display-unbalanced"),
      ).toBe(true);
    });

    it("flags unbalanced \\begin/\\end", () => {
      const result = validateLatexDelimiters("$$\\begin{aligned}a = 1$$");
      expect(result.valid).toBe(false);
      expect(
        result.issues.some((i) => i.kind === "environment-unbalanced"),
      ).toBe(true);
    });

    it("flags mismatched environment names", () => {
      const result = validateLatexDelimiters(
        "$$\\begin{aligned}a=1\\end{pmatrix}$$",
      );
      expect(result.valid).toBe(false);
      expect(
        result.issues.some((i) => i.kind === "environment-unbalanced"),
      ).toBe(true);
    });

    it("flags unbalanced braces inside inline math", () => {
      const result = validateLatexDelimiters("$\\frac{a}{b$");
      expect(result.valid).toBe(false);
      expect(result.issues.some((i) => i.kind === "brace-unbalanced")).toBe(
        true,
      );
    });

    it("flags CJK run inside inline math (not in \\text{})", () => {
      const result = validateLatexDelimiters("$T_{输入理解层}$");
      expect(result.valid).toBe(false);
      expect(result.issues.some((i) => i.kind === "prose-in-inline-math")).toBe(
        true,
      );
    });

    it("reports line number for each violation", () => {
      const result = validateLatexDelimiters(
        "First line good.\nLine 2 has $alpha problem\nLine 3 good.",
      );
      expect(result.issues[0].line).toBe(2);
    });
  });

  describe("repair hint generation", () => {
    it("builds a usable LLM retry prompt", () => {
      const result = validateLatexDelimiters(
        "Line $a has problem.\nAlso $T_{norm}=\\frac{x}{y}，prose B$ here",
      );
      expect(result.valid).toBe(false);
      expect(result.repairHint).toContain("LaTeX formatting issues");
      expect(result.repairHint).toContain("Every `$` must be paired");
      expect(result.repairHint).toContain("Never place Chinese punctuation");
    });

    it("returns empty hint when valid", () => {
      expect(validateLatexDelimiters("$a + b = c$").repairHint).toBe("");
    });
  });

  describe("real-world damage patterns", () => {
    it("catches the T_{iu}$ displaced delimiter", () => {
      const result = validateLatexDelimiters(
        "模型 $T_{\\mathrm{iu}$}，覆盖解析。",
      );
      expect(result.valid).toBe(false);
    });

    it("catches prose-absorbed formula", () => {
      const result = validateLatexDelimiters(
        "输出 $T_{norm}=\\frac{T^{adj}}{B}，其中B$ 是预先声明的基准量",
      );
      expect(result.valid).toBe(false);
    });

    it("catches unclosed formula with CJK continuation", () => {
      const result = validateLatexDelimiters(
        "第二，是阶段调整项：$\\delta_i=\\delta_i^{retry}，用于表达可审计的附加耗时",
      );
      expect(result.valid).toBe(false);
    });
  });
});
