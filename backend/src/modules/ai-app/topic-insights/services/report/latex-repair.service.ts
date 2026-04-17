import { Injectable, Logger } from "@nestjs/common";
import { AIModelType } from "@prisma/client";
import { ChatFacade } from "@/modules/ai-engine/facade";
import {
  validateLatexDelimiters,
  type LatexValidationResult,
} from "@/common/utils/latex-delimiter-validator";

/**
 * LaTeX Repair Service
 *
 * Surgical repair for reports where the markdown has ALREADY been stored
 * with malformed LaTeX (bare commands, unclosed `$`, prose inside `$...$`).
 *
 * This service DOES NOT regenerate content. It asks the LLM to add or fix
 * math delimiters ONLY — every character of prose must stay identical.
 * That keeps cost low and preserves the researcher's work.
 *
 * Strategy:
 *   1. Run `validateLatexDelimiters` on the stored markdown.
 *   2. If clean, return untouched.
 *   3. Otherwise, send the markdown + a STRICT repair prompt to the LLM.
 *   4. Re-validate the LLM response. If still invalid, return the
 *      MORE-valid of the two (fewer issues) and log a warning.
 *
 * Safety:
 *   - Temperature LOW (deterministic text-level edits only).
 *   - System prompt is explicit that no other edits are allowed.
 *   - Caller is responsible for persisting the result.
 */
@Injectable()
export class LatexRepairService {
  private readonly logger = new Logger(LatexRepairService.name);

  constructor(private readonly chatFacade: ChatFacade) {}

  /**
   * Repair LaTeX delimiters in a markdown document without changing prose.
   *
   * Returns:
   *   - `{ repaired: markdown, changed: false }` when input was already valid.
   *   - `{ repaired, changed: true, before, after }` when LLM produced a
   *     strictly-better result (fewer issues) — `after` is the residual
   *     validation result so callers can tell whether any issues remain.
   *   - `{ repaired: original, changed: false, before, failureReason }`
   *     when LLM repair failed and original is kept unchanged.
   */
  async repairMarkdown(markdown: string): Promise<{
    repaired: string;
    changed: boolean;
    before?: LatexValidationResult;
    after?: LatexValidationResult;
    failureReason?: string;
  }> {
    // ── No mechanical pre-cleanup ──
    // Earlier iterations stripped `$$$1$$` artifacts and `}$$` patterns
    // via regex, but a scan of 303 stored reports showed every candidate
    // "artifact" carries LOST content (the regex bug that produced `$1`
    // replaced a real formula, so stripping `$1` leaves a lone `}` or
    // mismatched delimiter — adding MORE issues, not fewer). Only an LLM
    // that sees surrounding context can safely rebuild those regions.
    //
    // So: we skip straight to validator → LLM.
    const before = validateLatexDelimiters(markdown);
    if (before.valid) {
      return { repaired: markdown, changed: false };
    }

    this.logger.log(
      `[LatexRepair] Found ${before.issues.length} issue(s), invoking LLM. Types: ${Array.from(
        new Set(before.issues.map((i) => i.kind)),
      ).join(", ")}`,
    );

    const systemPrompt = this.buildSystemPrompt();
    const userPrompt = this.buildUserPrompt(markdown, before);

    let response;
    try {
      response = await this.chatFacade.chat({
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        operationName: "LaTeX公式定界符修复",
        modelType: AIModelType.CHAT,
        skipGuardrails: true,
        cachePolicy: "auto",
        taskProfile: {
          creativity: "deterministic",
          outputLength: "extended",
        },
      });
    } catch (err) {
      this.logger.warn(
        `[LatexRepair] LLM call failed: ${(err as Error).message}. Keeping original.`,
      );
      return {
        repaired: markdown,
        changed: false,
        before,
        failureReason: `llm_error: ${(err as Error).message}`,
      };
    }

    if (response.isError) {
      this.logger.warn(
        `[LatexRepair] LLM returned error state. Keeping original.`,
      );
      return {
        repaired: markdown,
        changed: false,
        before,
        failureReason: "llm_error_response",
      };
    }

    const candidate = this.stripCodeFence(response.content).trim();

    // Refuse if LLM returned an obviously-too-short response (it summarized
    // or refused instead of repairing). Heuristic: repaired length should be
    // within 85%..120% of original.
    if (
      candidate.length < markdown.length * 0.85 ||
      candidate.length > markdown.length * 1.2
    ) {
      this.logger.warn(
        `[LatexRepair] LLM response length ${candidate.length} out of bounds (${markdown.length} original). Keeping original.`,
      );
      return {
        repaired: markdown,
        changed: false,
        before,
        failureReason: "llm_response_length_out_of_bounds",
      };
    }

    const after = validateLatexDelimiters(candidate);
    // Only accept if strictly fewer issues
    if (after.issues.length >= before.issues.length) {
      this.logger.warn(
        `[LatexRepair] LLM did not reduce issue count (${before.issues.length} → ${after.issues.length}). Keeping original.`,
      );
      return {
        repaired: markdown,
        changed: false,
        before,
        after,
        failureReason: "no_improvement",
      };
    }

    this.logger.log(
      `[LatexRepair] Issues reduced ${before.issues.length} → ${after.issues.length}. Accepting LLM repair.`,
    );
    return { repaired: candidate, changed: true, before, after };
  }

  private buildSystemPrompt(): string {
    return [
      "You are a LaTeX delimiter repair tool. Your ONLY job is to add or fix math delimiters in markdown.",
      "",
      "STRICT RULES — follow exactly:",
      "1. Do NOT change any prose, wording, sentence, punctuation, or paragraph structure.",
      "2. Do NOT add, remove, or modify any markdown heading, list, table, image, or link.",
      "3. Do NOT add commentary. Your entire output is ONLY the repaired markdown.",
      "4. You MAY:",
      "   - Wrap bare LaTeX formulas (e.g. `T_{r,s}`, `\\frac{a}{b}`, `\\sum_{i}^{n}`) in `$...$`.",
      "   - Wrap display formulas (standalone equations on their own line) in `$$...$$`.",
      "   - Close unclosed `$` openings.",
      "   - Close unclosed `$$` openings.",
      "   - Remove `$` misplaced INSIDE a subscript brace (e.g. `T_{\\mathrm{ret}$}` → `T_{\\mathrm{ret}}$`).",
      "   - Split `$...$` blocks that wrongly contain prose (close the formula before the prose).",
      "   - Fix `x_{输入}` → wrap CJK in `\\text{...}`: `x_{\\text{输入}}`.",
      "5. Keep all existing `$`-wrapped math exactly as-is if already valid.",
      "6. Preserve every CJK character in its original position.",
      "7. Output the full repaired document in one response. Do NOT truncate.",
    ].join("\n");
  }

  private buildUserPrompt(
    markdown: string,
    validation: LatexValidationResult,
  ): string {
    const issueList = validation.issues
      .slice(0, 15)
      .map((issue, idx) => `  ${idx + 1}. [${issue.kind}] ${issue.message}`)
      .join("\n");
    return [
      "The following markdown document has broken LaTeX delimiters. Repair ONLY the math delimiters.",
      "",
      "Validator detected these issues:",
      issueList,
      validation.issues.length > 15
        ? `  ...and ${validation.issues.length - 15} more.`
        : "",
      "",
      "Return the full repaired markdown with identical prose. Do not add any preamble or code-fence wrapper.",
      "",
      "--- DOCUMENT START ---",
      markdown,
      "--- DOCUMENT END ---",
    ]
      .filter(Boolean)
      .join("\n");
  }

  /**
   * Strip a leading/trailing ```markdown code fence if the LLM wrapped
   * its response despite being told not to.
   */
  private stripCodeFence(text: string): string {
    const m = text.match(/^```(?:markdown)?\s*\n?([\s\S]*?)\n?```\s*$/);
    return m ? m[1] : text;
  }
}
