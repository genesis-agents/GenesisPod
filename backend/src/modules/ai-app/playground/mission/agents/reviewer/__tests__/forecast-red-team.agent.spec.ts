/**
 * ForecastRedTeamAgent — unit tests
 *
 * Covers:
 *   - @DefineAgent metadata (id, version, loop, skills, budget)
 *   - inputSchema: valid, missing baseCase, scenarios/criticalUncertainties default
 *   - outputSchema: valid, overallRobustness bounds
 *   - buildSystemPrompt: language branch (zh-CN vs en-US)
 *   - buildSystemPrompt: baseCase lines rendered with pct/confidence/horizon
 *   - buildSystemPrompt: scenarios section (present / absent)
 *   - buildSystemPrompt: criticalUncertainties section (present / absent)
 *   - buildSystemPrompt: output instructions always present
 */

import { z } from "zod";
import { readDefineAgentMeta } from "../../../../../../ai-harness/agents/dev-tools";
import { ForecastRedTeamAgent } from "../forecast-red-team.agent";

const meta = readDefineAgentMeta(ForecastRedTeamAgent)!;
const inputSchema = meta.inputSchema as z.ZodType;
const outputSchema = meta.outputSchema as z.ZodType;

// ── Fixtures ─────────────────────────────────────────────────────────────────

const baseCase = [
  {
    judgment: "AI adoption will accelerate significantly",
    probability: 0.75,
    confidence: "high" as const,
    horizon: "6-18m" as const,
  },
  {
    judgment: "Regulatory frameworks will remain fragmented",
    probability: 0.6,
    confidence: "moderate" as const,
    horizon: "18m-3y" as const,
  },
];

const validInput = {
  topic: "AI in Finance",
  language: "zh-CN" as const,
  baseCase,
  scenarios: [] as {
    kind: "bull" | "base" | "bear";
    narrative: string;
    probability: number;
  }[],
  criticalUncertainties: [] as string[],
};

const validOutput = {
  vulnerabilities: [
    {
      statement: "AI adoption depends on compute availability",
      failureScenario: "If GPU shortage persists beyond 2025, adoption slows",
      timeHorizon: "12m" as const,
      likelihood: 0.35,
      impactIfFails: "moderate" as const,
    },
  ],
  couldBeWrongIf: ["Credit tightening halts enterprise AI budgets"],
  overallRobustness: 72,
  rationale: "Forecasts are plausible but rely on macro stability assumptions.",
};

// ── Agent metadata ────────────────────────────────────────────────────────────

describe("ForecastRedTeamAgent @DefineAgent metadata", () => {
  it("id is playground.forecast-red-team", () => {
    expect(meta.id).toBe("playground.forecast-red-team");
  });

  it("version is 1.0.0", () => {
    expect(meta.version).toBe("1.0.0");
  });

  it("loop is simple", () => {
    expect(meta.loop).toBe("simple");
  });

  it("includes report-meta-critic skill", () => {
    expect(meta.skills).toContain("report-meta-critic");
  });

  it("toolCategories is empty", () => {
    expect(meta.toolCategories).toHaveLength(0);
  });

  it("identity role is critic", () => {
    expect(meta.identity.role).toBe("critic");
  });

  it("budget.maxTokens=12000, maxIterations=2", () => {
    expect(meta.budget.maxTokens).toBe(12_000);
    expect(meta.budget.maxIterations).toBe(2);
  });

  it("taskProfile creativity=low, reasoningDepth=deep", () => {
    expect(meta.taskProfile.creativity).toBe("low");
    expect(meta.taskProfile.reasoningDepth).toBe("deep");
  });
});

// ── inputSchema ───────────────────────────────────────────────────────────────

describe("ForecastRedTeamAgent inputSchema", () => {
  it("accepts minimal valid input with baseCase", () => {
    expect(inputSchema.safeParse(validInput).success).toBe(true);
  });

  it("scenarios defaults to [] when omitted", () => {
    const parsed = inputSchema.safeParse(validInput);
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.scenarios).toEqual([]);
    }
  });

  it("criticalUncertainties defaults to [] when omitted", () => {
    const parsed = inputSchema.safeParse(validInput);
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.criticalUncertainties).toEqual([]);
    }
  });

  it("accepts en-US language", () => {
    const input = { ...validInput, language: "en-US" as const };
    expect(inputSchema.safeParse(input).success).toBe(true);
  });

  it("rejects missing topic", () => {
    const { topic: _, ...rest } = validInput as any;
    expect(inputSchema.safeParse(rest).success).toBe(false);
  });

  it("rejects empty baseCase array", () => {
    const input = { ...validInput, baseCase: [] };
    expect(inputSchema.safeParse(input).success).toBe(false);
  });

  it("rejects invalid language", () => {
    const input = { ...validInput, language: "fr-FR" };
    expect(inputSchema.safeParse(input).success).toBe(false);
  });

  it("rejects baseCase item with probability > 1", () => {
    const input = {
      ...validInput,
      baseCase: [{ ...baseCase[0], probability: 1.5 }],
    };
    expect(inputSchema.safeParse(input).success).toBe(false);
  });

  it("rejects baseCase item with invalid confidence", () => {
    const input = {
      ...validInput,
      baseCase: [{ ...baseCase[0], confidence: "very-high" }],
    };
    expect(inputSchema.safeParse(input).success).toBe(false);
  });

  it("rejects baseCase item with invalid horizon", () => {
    const input = {
      ...validInput,
      baseCase: [{ ...baseCase[0], horizon: "1y" }],
    };
    expect(inputSchema.safeParse(input).success).toBe(false);
  });

  it("accepts scenarios with kind bull/base/bear", () => {
    const input = {
      ...validInput,
      scenarios: [
        { kind: "bull" as const, narrative: "Strong growth", probability: 0.3 },
        {
          kind: "base" as const,
          narrative: "Moderate growth",
          probability: 0.5,
        },
        { kind: "bear" as const, narrative: "Contraction", probability: 0.2 },
      ],
    };
    expect(inputSchema.safeParse(input).success).toBe(true);
  });

  it("rejects scenarios with invalid kind", () => {
    const input = {
      ...validInput,
      scenarios: [{ kind: "extreme", narrative: "test", probability: 0.1 }],
    };
    expect(inputSchema.safeParse(input).success).toBe(false);
  });
});

// ── outputSchema ──────────────────────────────────────────────────────────────

describe("ForecastRedTeamAgent outputSchema", () => {
  it("accepts valid output", () => {
    expect(outputSchema.safeParse(validOutput).success).toBe(true);
  });

  it("vulnerabilities defaults to [] when omitted", () => {
    const out = { ...validOutput };
    delete (out as any).vulnerabilities;
    const parsed = outputSchema.safeParse(out);
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.vulnerabilities).toEqual([]);
    }
  });

  it("couldBeWrongIf defaults to [] when omitted", () => {
    const out = { ...validOutput };
    delete (out as any).couldBeWrongIf;
    const parsed = outputSchema.safeParse(out);
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.couldBeWrongIf).toEqual([]);
    }
  });

  it("rejects overallRobustness < 0", () => {
    expect(
      outputSchema.safeParse({ ...validOutput, overallRobustness: -1 }).success,
    ).toBe(false);
  });

  it("rejects overallRobustness > 100", () => {
    expect(
      outputSchema.safeParse({ ...validOutput, overallRobustness: 101 })
        .success,
    ).toBe(false);
  });

  it("rejects rationale shorter than 20 chars", () => {
    expect(
      outputSchema.safeParse({ ...validOutput, rationale: "Too short." })
        .success,
    ).toBe(false);
  });

  it("rejects vulnerability with invalid timeHorizon", () => {
    const out = {
      ...validOutput,
      vulnerabilities: [
        { ...validOutput.vulnerabilities[0], timeHorizon: "1y" },
      ],
    };
    expect(outputSchema.safeParse(out).success).toBe(false);
  });

  it("rejects vulnerability likelihood > 1", () => {
    const out = {
      ...validOutput,
      vulnerabilities: [{ ...validOutput.vulnerabilities[0], likelihood: 1.5 }],
    };
    expect(outputSchema.safeParse(out).success).toBe(false);
  });

  it("rejects vulnerability impactIfFails with invalid value", () => {
    const out = {
      ...validOutput,
      vulnerabilities: [
        { ...validOutput.vulnerabilities[0], impactIfFails: "catastrophic" },
      ],
    };
    expect(outputSchema.safeParse(out).success).toBe(false);
  });
});

// ── buildSystemPrompt ─────────────────────────────────────────────────────────

describe("ForecastRedTeamAgent buildSystemPrompt", () => {
  let agent: ForecastRedTeamAgent;

  beforeAll(() => {
    agent = new ForecastRedTeamAgent();
  });

  it("includes PRE-MORTEM framing in prompt", () => {
    const prompt = agent.buildSystemPrompt({ input: validInput as any });
    expect(prompt).toContain("PRE-MORTEM");
  });

  it("zh-CN → 用中文输出 in prompt", () => {
    const prompt = agent.buildSystemPrompt({ input: validInput as any });
    expect(prompt).toContain("用中文输出");
    expect(prompt).not.toContain("Respond in English");
  });

  it("en-US → Respond in English in prompt", () => {
    const input = { ...validInput, language: "en-US" as const };
    const prompt = agent.buildSystemPrompt({ input: input as any });
    expect(prompt).toContain("Respond in English.");
    expect(prompt).not.toContain("用中文输出");
  });

  it("topic is included in prompt", () => {
    const prompt = agent.buildSystemPrompt({ input: validInput as any });
    expect(prompt).toContain('"AI in Finance"');
  });

  it("baseCase judgments are rendered as numbered list", () => {
    const prompt = agent.buildSystemPrompt({ input: validInput as any });
    expect(prompt).toContain("1. AI adoption will accelerate significantly");
    expect(prompt).toContain("2. Regulatory frameworks will remain fragmented");
  });

  it("baseCase probabilities formatted as percentages", () => {
    const prompt = agent.buildSystemPrompt({ input: validInput as any });
    expect(prompt).toContain("75%");
    expect(prompt).toContain("60%");
  });

  it("baseCase confidence and horizon included in line", () => {
    const prompt = agent.buildSystemPrompt({ input: validInput as any });
    expect(prompt).toContain("high");
    expect(prompt).toContain("6-18m");
    expect(prompt).toContain("moderate");
    expect(prompt).toContain("18m-3y");
  });

  it("scenarios section included when scenarios provided", () => {
    const input = {
      ...validInput,
      scenarios: [
        {
          kind: "bull" as const,
          narrative: "Rapid expansion",
          probability: 0.3,
        },
        {
          kind: "bear" as const,
          narrative: "Severe contraction",
          probability: 0.2,
        },
      ],
    };
    const prompt = agent.buildSystemPrompt({ input: input as any });
    expect(prompt).toContain("## Scenarios");
    expect(prompt).toContain("[bull]");
    expect(prompt).toContain("Rapid expansion");
    expect(prompt).toContain("[bear]");
    expect(prompt).toContain("30%");
  });

  it("scenarios section absent when empty array", () => {
    const prompt = agent.buildSystemPrompt({ input: validInput as any });
    expect(prompt).not.toContain("## Scenarios");
  });

  it("criticalUncertainties section included when provided", () => {
    const input = {
      ...validInput,
      criticalUncertainties: [
        "Will regulators impose open-source bans?",
        "Energy costs trajectory unclear",
      ],
    };
    const prompt = agent.buildSystemPrompt({ input: input as any });
    expect(prompt).toContain("## Critical uncertainties already flagged");
    expect(prompt).toContain("Will regulators impose open-source bans?");
    expect(prompt).toContain("Energy costs trajectory unclear");
  });

  it("criticalUncertainties section absent when empty", () => {
    const prompt = agent.buildSystemPrompt({ input: validInput as any });
    expect(prompt).not.toContain("## Critical uncertainties already flagged");
  });

  it("output instructions always present", () => {
    const prompt = agent.buildSystemPrompt({ input: validInput as any });
    expect(prompt).toContain("## What to produce");
    expect(prompt).toContain("vulnerabilities");
    expect(prompt).toContain("couldBeWrongIf");
    expect(prompt).toContain("overallRobustness");
    expect(prompt).toContain("rationale");
  });

  it("output JSON shape included", () => {
    const prompt = agent.buildSystemPrompt({ input: validInput as any });
    expect(prompt).toContain("## Output JSON shape");
    expect(prompt).toContain('"overallRobustness"');
  });

  it("probability 0 renders as 0%", () => {
    const input = {
      ...validInput,
      baseCase: [{ ...baseCase[0], probability: 0 }],
    };
    const prompt = agent.buildSystemPrompt({ input: input as any });
    expect(prompt).toContain("0%");
  });

  it("probability 1 renders as 100%", () => {
    const input = {
      ...validInput,
      baseCase: [{ ...baseCase[0], probability: 1 }],
    };
    const prompt = agent.buildSystemPrompt({ input: input as any });
    expect(prompt).toContain("100%");
  });

  it("scenarios probability rendered as percentage", () => {
    const input = {
      ...validInput,
      scenarios: [
        { kind: "base" as const, narrative: "Baseline", probability: 0.55 },
      ],
    };
    const prompt = agent.buildSystemPrompt({ input: input as any });
    expect(prompt).toContain("55%");
  });

  it("returns a string (not undefined)", () => {
    const prompt = agent.buildSystemPrompt({ input: validInput as any });
    expect(typeof prompt).toBe("string");
    expect(prompt.length).toBeGreaterThan(100);
  });

  it("all 4 horizon values can appear in baseCase", () => {
    const horizons = ["0-6m", "6-18m", "18m-3y", "3y+"] as const;
    for (const horizon of horizons) {
      const input = {
        ...validInput,
        baseCase: [{ ...baseCase[0], horizon }],
      };
      const prompt = agent.buildSystemPrompt({ input: input as any });
      expect(prompt).toContain(horizon);
    }
  });

  it("all 3 scenario kinds can appear", () => {
    const kinds = ["bull", "base", "bear"] as const;
    for (const kind of kinds) {
      const input = {
        ...validInput,
        scenarios: [{ kind, narrative: "test", probability: 0.33 }],
      };
      const prompt = agent.buildSystemPrompt({ input: input as any });
      expect(prompt).toContain(`[${kind}]`);
    }
  });
});
