/**
 * StewardAgent — unit tests
 *
 * 覆盖：
 *   - inputSchema: 4 scopes (discriminatedUnion)
 *     budget-guard / compliance-check / data-boundary / source-diversity
 *   - outputSchema: 4 scopes
 *   - buildSystemPrompt: calls buildPromptFromDuty for each scope
 *     (duty file must exist on disk — budget-guard.md tested; others are file-not-found
 *     scenarios since they are stub scopes; we mock the duty loader for those)
 */

import { z } from "zod";
import { readDefineAgentMeta } from "../../../../ai-harness/kernel/dx";
import { StewardAgent } from "./steward.agent";
import * as dutyLoader from "../../utils/duty-loader";

const meta = readDefineAgentMeta(StewardAgent)!;
const inputSchema = meta.inputSchema as z.ZodType;
const outputSchema = meta.outputSchema as z.ZodType;

// ─── shared alert shape ───────────────────────────────────────────

const alert = {
  level: "warning" as const,
  trigger: "token usage at 75%",
  current: "75000",
  threshold: "70%",
  suggestedAction: "Consider pausing non-critical stages",
};

// ─── budget-guard input ───────────────────────────────────────────

const budgetGuardInput = {
  scope: "budget-guard" as const,
  missionId: "mission-123",
  language: "zh-CN" as const,
  snapshot: {
    tokensUsed: 75_000,
    tokensLimit: 100_000,
    costUsd: 0.5,
    stagesCompleted: ["S1", "S2"],
    stagesPending: ["S3", "S4"],
  },
  thresholds: {
    softWarnPct: 70,
    hardBlockPct: 95,
  },
};

// ─── compliance-check input ───────────────────────────────────────

const complianceInput = {
  scope: "compliance-check" as const,
  missionId: "mission-123",
  language: "zh-CN" as const,
  citations: [
    { url: "https://example.com/doc1", domain: "example.com" },
    { url: "https://banned.com/doc2", domain: "banned.com" },
  ],
  blacklist: ["banned.com"],
};

// ─── data-boundary input ─────────────────────────────────────────

const dataBoundaryInput = {
  scope: "data-boundary" as const,
  missionId: "mission-123",
  language: "zh-CN" as const,
  samples: ["text containing possible PII john@example.com"],
};

// ─── source-diversity input ───────────────────────────────────────

const sourceDiversityInput = {
  scope: "source-diversity" as const,
  missionId: "mission-123",
  language: "zh-CN" as const,
  citations: [
    { url: "https://a.com/1", domain: "a.com" },
    { url: "https://a.com/2", domain: "a.com" },
    { url: "https://b.com/1", domain: "b.com" },
  ],
  domainConcentrationThreshold: 0.6,
};

describe("StewardAgent", () => {
  let agent: StewardAgent;

  beforeAll(() => {
    agent = new StewardAgent();
  });

  // ─────────────────────────────────────────────
  // inputSchema — budget-guard
  // ─────────────────────────────────────────────

  describe("inputSchema — budget-guard", () => {
    it("accepts valid budget-guard input", () => {
      expect(inputSchema.safeParse(budgetGuardInput).success).toBe(true);
    });

    it("defaults softWarnPct to 70 when omitted", () => {
      const { thresholds: _, ...rest } = budgetGuardInput as Record<
        string,
        unknown
      >;
      const r = inputSchema.safeParse({
        ...rest,
        thresholds: { hardBlockPct: 95 },
      });
      expect(r.success).toBe(true);
      if (r.success) {
        const thresholds = (r.data as Record<string, unknown>)[
          "thresholds"
        ] as Record<string, unknown>;
        expect(thresholds["softWarnPct"]).toBe(70);
      }
    });

    it("defaults hardBlockPct to 95 when omitted", () => {
      const r = inputSchema.safeParse({
        ...budgetGuardInput,
        thresholds: { softWarnPct: 70 },
      });
      expect(r.success).toBe(true);
      if (r.success) {
        const thresholds = (r.data as Record<string, unknown>)[
          "thresholds"
        ] as Record<string, unknown>;
        expect(thresholds["hardBlockPct"]).toBe(95);
      }
    });

    it("rejects budget-guard missing snapshot", () => {
      const { snapshot: _, ...rest } = budgetGuardInput as Record<
        string,
        unknown
      >;
      expect(inputSchema.safeParse(rest).success).toBe(false);
    });

    it("rejects non-integer tokensUsed", () => {
      expect(
        inputSchema.safeParse({
          ...budgetGuardInput,
          snapshot: { ...budgetGuardInput.snapshot, tokensUsed: 75000.5 },
        }).success,
      ).toBe(false);
    });
  });

  // ─────────────────────────────────────────────
  // inputSchema — compliance-check
  // ─────────────────────────────────────────────

  describe("inputSchema — compliance-check", () => {
    it("accepts valid compliance-check input", () => {
      expect(inputSchema.safeParse(complianceInput).success).toBe(true);
    });

    it("defaults blacklist to [] when omitted", () => {
      const { blacklist: _, ...rest } = complianceInput as Record<
        string,
        unknown
      >;
      const r = inputSchema.safeParse(rest);
      expect(r.success).toBe(true);
      if (r.success) {
        expect((r.data as Record<string, unknown>)["blacklist"]).toEqual([]);
      }
    });

    it("accepts empty citations array", () => {
      expect(
        inputSchema.safeParse({ ...complianceInput, citations: [] }).success,
      ).toBe(true);
    });

    it("accepts citation without optional domain", () => {
      expect(
        inputSchema.safeParse({
          ...complianceInput,
          citations: [{ url: "https://example.com" }],
        }).success,
      ).toBe(true);
    });
  });

  // ─────────────────────────────────────────────
  // inputSchema — data-boundary
  // ─────────────────────────────────────────────

  describe("inputSchema — data-boundary", () => {
    it("accepts valid data-boundary input", () => {
      expect(inputSchema.safeParse(dataBoundaryInput).success).toBe(true);
    });

    it("rejects empty samples array (min 1)", () => {
      expect(
        inputSchema.safeParse({ ...dataBoundaryInput, samples: [] }).success,
      ).toBe(false);
    });

    it("accepts multiple samples", () => {
      expect(
        inputSchema.safeParse({
          ...dataBoundaryInput,
          samples: ["sample1", "sample2"],
        }).success,
      ).toBe(true);
    });
  });

  // ─────────────────────────────────────────────
  // inputSchema — source-diversity
  // ─────────────────────────────────────────────

  describe("inputSchema — source-diversity", () => {
    it("accepts valid source-diversity input", () => {
      expect(inputSchema.safeParse(sourceDiversityInput).success).toBe(true);
    });

    it("defaults domainConcentrationThreshold to 0.6 when omitted", () => {
      const { domainConcentrationThreshold: _, ...rest } =
        sourceDiversityInput as Record<string, unknown>;
      const r = inputSchema.safeParse(rest);
      expect(r.success).toBe(true);
      if (r.success) {
        expect(
          (r.data as Record<string, unknown>)["domainConcentrationThreshold"],
        ).toBe(0.6);
      }
    });

    it("rejects domainConcentrationThreshold below 0", () => {
      expect(
        inputSchema.safeParse({
          ...sourceDiversityInput,
          domainConcentrationThreshold: -0.1,
        }).success,
      ).toBe(false);
    });

    it("rejects domainConcentrationThreshold above 1", () => {
      expect(
        inputSchema.safeParse({
          ...sourceDiversityInput,
          domainConcentrationThreshold: 1.1,
        }).success,
      ).toBe(false);
    });

    it("accepts domainConcentrationThreshold at boundaries 0 and 1", () => {
      expect(
        inputSchema.safeParse({
          ...sourceDiversityInput,
          domainConcentrationThreshold: 0,
        }).success,
      ).toBe(true);
      expect(
        inputSchema.safeParse({
          ...sourceDiversityInput,
          domainConcentrationThreshold: 1,
        }).success,
      ).toBe(true);
    });
  });

  // ─────────────────────────────────────────────
  // outputSchema — budget-guard
  // ─────────────────────────────────────────────

  describe("outputSchema — budget-guard", () => {
    it("accepts valid budget-guard output", () => {
      expect(
        outputSchema.safeParse({
          scope: "budget-guard",
          alerts: [alert],
        }).success,
      ).toBe(true);
    });

    it("accepts budget-guard output with empty alerts", () => {
      expect(
        outputSchema.safeParse({ scope: "budget-guard", alerts: [] }).success,
      ).toBe(true);
    });

    it("accepts all alert levels", () => {
      for (const level of ["info", "warning", "block"] as const) {
        expect(
          outputSchema.safeParse({
            scope: "budget-guard",
            alerts: [{ ...alert, level }],
          }).success,
        ).toBe(true);
      }
    });

    it("rejects invalid alert level", () => {
      expect(
        outputSchema.safeParse({
          scope: "budget-guard",
          alerts: [{ ...alert, level: "critical" }],
        }).success,
      ).toBe(false);
    });
  });

  // ─────────────────────────────────────────────
  // outputSchema — compliance-check
  // ─────────────────────────────────────────────

  describe("outputSchema — compliance-check", () => {
    it("accepts valid compliance-check output", () => {
      expect(
        outputSchema.safeParse({
          scope: "compliance-check",
          alerts: [],
          flaggedCitations: ["https://banned.com/doc"],
        }).success,
      ).toBe(true);
    });

    it("defaults flaggedCitations to [] when omitted", () => {
      const r = outputSchema.safeParse({
        scope: "compliance-check",
        alerts: [],
      });
      expect(r.success).toBe(true);
      if (r.success) {
        expect((r.data as Record<string, unknown>)["flaggedCitations"]).toEqual(
          [],
        );
      }
    });
  });

  // ─────────────────────────────────────────────
  // outputSchema — data-boundary
  // ─────────────────────────────────────────────

  describe("outputSchema — data-boundary", () => {
    it("accepts valid data-boundary output", () => {
      expect(
        outputSchema.safeParse({
          scope: "data-boundary",
          alerts: [alert],
          flaggedSamples: [0, 2],
        }).success,
      ).toBe(true);
    });

    it("defaults flaggedSamples to [] when omitted", () => {
      const r = outputSchema.safeParse({
        scope: "data-boundary",
        alerts: [],
      });
      expect(r.success).toBe(true);
      if (r.success) {
        expect((r.data as Record<string, unknown>)["flaggedSamples"]).toEqual(
          [],
        );
      }
    });

    it("rejects non-integer flaggedSample index", () => {
      expect(
        outputSchema.safeParse({
          scope: "data-boundary",
          alerts: [],
          flaggedSamples: [1.5],
        }).success,
      ).toBe(false);
    });
  });

  // ─────────────────────────────────────────────
  // outputSchema — source-diversity
  // ─────────────────────────────────────────────

  describe("outputSchema — source-diversity", () => {
    it("accepts valid source-diversity output", () => {
      expect(
        outputSchema.safeParse({
          scope: "source-diversity",
          alerts: [],
          domainBreakdown: [{ domain: "a.com", count: 3, pct: 0.6 }],
        }).success,
      ).toBe(true);
    });

    it("accepts empty domainBreakdown", () => {
      expect(
        outputSchema.safeParse({
          scope: "source-diversity",
          alerts: [],
          domainBreakdown: [],
        }).success,
      ).toBe(true);
    });

    it("rejects non-integer count in domainBreakdown", () => {
      expect(
        outputSchema.safeParse({
          scope: "source-diversity",
          alerts: [],
          domainBreakdown: [{ domain: "a.com", count: 1.5, pct: 0.5 }],
        }).success,
      ).toBe(false);
    });
  });

  // ─────────────────────────────────────────────
  // buildSystemPrompt
  // ─────────────────────────────────────────────

  describe("buildSystemPrompt", () => {
    const identity = {
      role: { id: "steward", name: "Steward" },
    } as never;

    it("budget-guard scope calls buildPromptFromDuty with correct args", () => {
      const spy = jest
        .spyOn(dutyLoader, "buildPromptFromDuty")
        .mockReturnValue("mocked budget-guard prompt");
      agent.buildSystemPrompt({ input: budgetGuardInput, identity });
      expect(spy).toHaveBeenCalledWith(
        "steward",
        "budget-guard",
        expect.any(Object),
      );
      spy.mockRestore();
    });

    it("compliance-check scope calls buildPromptFromDuty with correct args", () => {
      const spy = jest
        .spyOn(dutyLoader, "buildPromptFromDuty")
        .mockReturnValue("mocked compliance prompt");
      agent.buildSystemPrompt({ input: complianceInput, identity });
      expect(spy).toHaveBeenCalledWith(
        "steward",
        "compliance-check",
        expect.any(Object),
      );
      spy.mockRestore();
    });

    it("data-boundary scope calls buildPromptFromDuty with correct args", () => {
      const spy = jest
        .spyOn(dutyLoader, "buildPromptFromDuty")
        .mockReturnValue("mocked data-boundary prompt");
      agent.buildSystemPrompt({ input: dataBoundaryInput, identity });
      expect(spy).toHaveBeenCalledWith(
        "steward",
        "data-boundary",
        expect.any(Object),
      );
      spy.mockRestore();
    });

    it("source-diversity scope calls buildPromptFromDuty with correct args", () => {
      const spy = jest
        .spyOn(dutyLoader, "buildPromptFromDuty")
        .mockReturnValue("mocked source-diversity prompt");
      agent.buildSystemPrompt({ input: sourceDiversityInput, identity });
      expect(spy).toHaveBeenCalledWith(
        "steward",
        "source-diversity",
        expect.any(Object),
      );
      spy.mockRestore();
    });

    it("budget-guard prompt returns string (real duty file exists)", () => {
      // budget-guard.md exists on disk — real integration
      dutyLoader.clearDutyCache();
      const prompt = agent.buildSystemPrompt({
        input: budgetGuardInput,
        identity,
      });
      expect(typeof prompt).toBe("string");
      expect(prompt.length).toBeGreaterThan(0);
    });
  });
});
