/**
 * VerifierAgent — unit tests
 *
 * 覆盖：
 *   - inputSchema: 4 modes (discriminatedUnion)
 *   - outputSchema: 4 modes
 *   - buildSystemPrompt: calls buildPromptFromDuty for each mode,
 *     injects currentDate
 */

import { z } from "zod";
import { readDefineAgentMeta } from "../../../../ai-harness/kernel/dx";
import { VerifierAgent } from "./verifier.agent";
import * as dutyLoader from "../../utils/duty-loader";

const meta = readDefineAgentMeta(VerifierAgent)!;
const inputSchema = meta.inputSchema as z.ZodType;
const outputSchema = meta.outputSchema as z.ZodType;

// ─── citation-audit input ────────────────────────────────────────

const citationAuditInput = {
  mode: "citation-audit" as const,
  topic: "AI in Finance",
  language: "zh-CN" as const,
  citations: [
    {
      index: 1,
      url: "https://example.com/source1",
      inlineQuote: "AI revenue grew 40%",
    },
  ],
};

// ─── number-check input ──────────────────────────────────────────

const numberCheckInput = {
  mode: "number-check" as const,
  topic: "AI in Finance",
  language: "zh-CN" as const,
  claims: [
    {
      text: "Revenue grew 40% in 2024",
      sourceUrl: "https://example.com/annual-report",
    },
  ],
};

// ─── claim-grounding input ───────────────────────────────────────

const claimGroundingInput = {
  mode: "claim-grounding" as const,
  topic: "AI in Finance",
  language: "zh-CN" as const,
  claims: ["AI adoption doubled in 2024", "Cost reduction by 25%"],
};

// ─── source-tier input ───────────────────────────────────────────

const sourceTierInput = {
  mode: "source-tier" as const,
  topic: "AI in Finance",
  language: "zh-CN" as const,
  sources: [
    "https://mckinsey.com/reports/ai",
    "https://blog.medium.com/ai-stuff",
  ],
};

// ─── shared verdict ──────────────────────────────────────────────

const verdict = {
  status: "verified" as const,
  evidence: "Source clearly states the claim with matching data.",
};

describe("VerifierAgent", () => {
  let agent: VerifierAgent;

  beforeAll(() => {
    agent = new VerifierAgent();
  });

  // ─────────────────────────────────────────────
  // inputSchema — citation-audit
  // ─────────────────────────────────────────────

  describe("inputSchema — citation-audit", () => {
    it("accepts valid citation-audit input", () => {
      expect(inputSchema.safeParse(citationAuditInput).success).toBe(true);
    });

    it("rejects empty citations array (min 1)", () => {
      expect(
        inputSchema.safeParse({ ...citationAuditInput, citations: [] }).success,
      ).toBe(false);
    });

    it("accepts citation without optional inlineQuote", () => {
      expect(
        inputSchema.safeParse({
          ...citationAuditInput,
          citations: [{ index: 1, url: "https://example.com" }],
        }).success,
      ).toBe(true);
    });

    it("rejects citation with non-integer index", () => {
      expect(
        inputSchema.safeParse({
          ...citationAuditInput,
          citations: [{ index: 1.5, url: "https://example.com" }],
        }).success,
      ).toBe(false);
    });

    it("accepts language en-US", () => {
      expect(
        inputSchema.safeParse({ ...citationAuditInput, language: "en-US" })
          .success,
      ).toBe(true);
    });

    it("rejects invalid language", () => {
      expect(
        inputSchema.safeParse({ ...citationAuditInput, language: "de-DE" })
          .success,
      ).toBe(false);
    });

    it("rejects missing topic", () => {
      const { topic: _, ...rest } = citationAuditInput as Record<
        string,
        unknown
      >;
      expect(inputSchema.safeParse(rest).success).toBe(false);
    });
  });

  // ─────────────────────────────────────────────
  // inputSchema — number-check
  // ─────────────────────────────────────────────

  describe("inputSchema — number-check", () => {
    it("accepts valid number-check input", () => {
      expect(inputSchema.safeParse(numberCheckInput).success).toBe(true);
    });

    it("accepts empty claims array", () => {
      expect(
        inputSchema.safeParse({ ...numberCheckInput, claims: [] }).success,
      ).toBe(true);
    });

    it("rejects claim missing text", () => {
      expect(
        inputSchema.safeParse({
          ...numberCheckInput,
          claims: [{ sourceUrl: "https://example.com" }],
        }).success,
      ).toBe(false);
    });

    it("rejects claim missing sourceUrl", () => {
      expect(
        inputSchema.safeParse({
          ...numberCheckInput,
          claims: [{ text: "some claim" }],
        }).success,
      ).toBe(false);
    });
  });

  // ─────────────────────────────────────────────
  // inputSchema — claim-grounding
  // ─────────────────────────────────────────────

  describe("inputSchema — claim-grounding", () => {
    it("accepts valid claim-grounding input", () => {
      expect(inputSchema.safeParse(claimGroundingInput).success).toBe(true);
    });

    it("accepts empty claims array", () => {
      expect(
        inputSchema.safeParse({ ...claimGroundingInput, claims: [] }).success,
      ).toBe(true);
    });

    it("accepts single string claim", () => {
      expect(
        inputSchema.safeParse({
          ...claimGroundingInput,
          claims: ["Single claim here"],
        }).success,
      ).toBe(true);
    });
  });

  // ─────────────────────────────────────────────
  // inputSchema — source-tier
  // ─────────────────────────────────────────────

  describe("inputSchema — source-tier", () => {
    it("accepts valid source-tier input", () => {
      expect(inputSchema.safeParse(sourceTierInput).success).toBe(true);
    });

    it("accepts empty sources array", () => {
      expect(
        inputSchema.safeParse({ ...sourceTierInput, sources: [] }).success,
      ).toBe(true);
    });

    it("accepts single source", () => {
      expect(
        inputSchema.safeParse({
          ...sourceTierInput,
          sources: ["https://example.com"],
        }).success,
      ).toBe(true);
    });
  });

  // ─────────────────────────────────────────────
  // outputSchema — citation-audit
  // ─────────────────────────────────────────────

  describe("outputSchema — citation-audit", () => {
    it("accepts valid citation-audit output", () => {
      expect(
        outputSchema.safeParse({
          mode: "citation-audit",
          summary: { total: 1, verified: 1, unverified: 0, contradicted: 0 },
          verdicts: [{ index: 1, url: "https://example.com", ...verdict }],
        }).success,
      ).toBe(true);
    });

    it("rejects non-integer summary.total", () => {
      expect(
        outputSchema.safeParse({
          mode: "citation-audit",
          summary: { total: 1.5, verified: 1, unverified: 0, contradicted: 0 },
          verdicts: [],
        }).success,
      ).toBe(false);
    });

    it("accepts all valid verdict statuses", () => {
      for (const status of [
        "verified",
        "unverified-but-plausible",
        "unverified-suspicious",
        "contradicted",
      ] as const) {
        expect(
          outputSchema.safeParse({
            mode: "citation-audit",
            summary: { total: 1, verified: 0, unverified: 0, contradicted: 0 },
            verdicts: [{ ...verdict, status }],
          }).success,
        ).toBe(true);
      }
    });

    it("rejects invalid verdict status", () => {
      expect(
        outputSchema.safeParse({
          mode: "citation-audit",
          summary: { total: 1, verified: 0, unverified: 0, contradicted: 0 },
          verdicts: [{ ...verdict, status: "unknown" }],
        }).success,
      ).toBe(false);
    });

    it("accepts verdict without optional index and url", () => {
      expect(
        outputSchema.safeParse({
          mode: "citation-audit",
          summary: { total: 1, verified: 1, unverified: 0, contradicted: 0 },
          verdicts: [
            {
              status: "verified" as const,
              evidence: "Source confirms claim.",
            },
          ],
        }).success,
      ).toBe(true);
    });
  });

  // ─────────────────────────────────────────────
  // outputSchema — number-check
  // ─────────────────────────────────────────────

  describe("outputSchema — number-check", () => {
    it("accepts valid number-check output", () => {
      expect(
        outputSchema.safeParse({
          mode: "number-check",
          summary: { total: 2, matched: 1, mismatched: 1 },
          verdicts: [verdict],
        }).success,
      ).toBe(true);
    });

    it("rejects number-check missing summary.matched", () => {
      expect(
        outputSchema.safeParse({
          mode: "number-check",
          summary: { total: 1, mismatched: 0 },
          verdicts: [],
        }).success,
      ).toBe(false);
    });
  });

  // ─────────────────────────────────────────────
  // outputSchema — claim-grounding
  // ─────────────────────────────────────────────

  describe("outputSchema — claim-grounding", () => {
    it("accepts valid claim-grounding output", () => {
      expect(
        outputSchema.safeParse({
          mode: "claim-grounding",
          summary: { total: 2, grounded: 1, ungrounded: 1 },
          verdicts: [verdict],
        }).success,
      ).toBe(true);
    });

    it("accepts empty verdicts array", () => {
      expect(
        outputSchema.safeParse({
          mode: "claim-grounding",
          summary: { total: 0, grounded: 0, ungrounded: 0 },
          verdicts: [],
        }).success,
      ).toBe(true);
    });
  });

  // ─────────────────────────────────────────────
  // outputSchema — source-tier
  // ─────────────────────────────────────────────

  describe("outputSchema — source-tier", () => {
    it("accepts valid source-tier output", () => {
      expect(
        outputSchema.safeParse({
          mode: "source-tier",
          tiers: [
            {
              url: "https://mckinsey.com/report",
              tier: "primary",
              rationale: "Original research publisher",
            },
          ],
        }).success,
      ).toBe(true);
    });

    it("accepts all tier values", () => {
      for (const tier of [
        "primary",
        "secondary",
        "tertiary",
        "unknown",
      ] as const) {
        expect(
          outputSchema.safeParse({
            mode: "source-tier",
            tiers: [
              {
                url: "https://example.com",
                tier,
                rationale: "Some rationale",
              },
            ],
          }).success,
        ).toBe(true);
      }
    });

    it("rejects invalid tier value", () => {
      expect(
        outputSchema.safeParse({
          mode: "source-tier",
          tiers: [
            {
              url: "https://example.com",
              tier: "quaternary",
              rationale: "Some rationale",
            },
          ],
        }).success,
      ).toBe(false);
    });

    it("accepts empty tiers array", () => {
      expect(
        outputSchema.safeParse({ mode: "source-tier", tiers: [] }).success,
      ).toBe(true);
    });
  });

  // ─────────────────────────────────────────────
  // buildSystemPrompt
  // ─────────────────────────────────────────────

  describe("buildSystemPrompt", () => {
    const identity = {
      role: { id: "verifier", name: "Verifier" },
    } as never;

    it("citation-audit mode calls buildPromptFromDuty with correct args", () => {
      const spy = jest
        .spyOn(dutyLoader, "buildPromptFromDuty")
        .mockReturnValue("mocked citation-audit prompt");
      agent.buildSystemPrompt({ input: citationAuditInput, identity });
      expect(spy).toHaveBeenCalledWith(
        "verifier",
        "citation-audit",
        expect.objectContaining({ currentDate: expect.any(String) }),
      );
      spy.mockRestore();
    });

    it("number-check mode calls buildPromptFromDuty with correct args", () => {
      const spy = jest
        .spyOn(dutyLoader, "buildPromptFromDuty")
        .mockReturnValue("mocked number-check prompt");
      agent.buildSystemPrompt({ input: numberCheckInput, identity });
      expect(spy).toHaveBeenCalledWith(
        "verifier",
        "number-check",
        expect.objectContaining({ currentDate: expect.any(String) }),
      );
      spy.mockRestore();
    });

    it("claim-grounding mode calls buildPromptFromDuty with correct args", () => {
      const spy = jest
        .spyOn(dutyLoader, "buildPromptFromDuty")
        .mockReturnValue("mocked claim-grounding prompt");
      agent.buildSystemPrompt({ input: claimGroundingInput, identity });
      expect(spy).toHaveBeenCalledWith(
        "verifier",
        "claim-grounding",
        expect.objectContaining({ currentDate: expect.any(String) }),
      );
      spy.mockRestore();
    });

    it("source-tier mode calls buildPromptFromDuty with correct args", () => {
      const spy = jest
        .spyOn(dutyLoader, "buildPromptFromDuty")
        .mockReturnValue("mocked source-tier prompt");
      agent.buildSystemPrompt({ input: sourceTierInput, identity });
      expect(spy).toHaveBeenCalledWith(
        "verifier",
        "source-tier",
        expect.objectContaining({ currentDate: expect.any(String) }),
      );
      spy.mockRestore();
    });

    it("injects currentDate in YYYY-MM-DD format", () => {
      const spy = jest
        .spyOn(dutyLoader, "buildPromptFromDuty")
        .mockReturnValue("mocked prompt");
      agent.buildSystemPrompt({ input: citationAuditInput, identity });
      const args = spy.mock.calls[0];
      const vars = args[2] as unknown as Record<string, unknown>;
      expect(typeof vars["currentDate"]).toBe("string");
      expect(vars["currentDate"] as string).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      spy.mockRestore();
    });

    it("citation-audit prompt returns string (real duty file exists)", () => {
      dutyLoader.clearDutyCache();
      const prompt = agent.buildSystemPrompt({
        input: citationAuditInput,
        identity,
      });
      expect(typeof prompt).toBe("string");
      expect(prompt.length).toBeGreaterThan(0);
    });
  });
});
