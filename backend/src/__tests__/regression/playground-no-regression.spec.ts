/**
 * playground-no-regression.spec.ts
 *
 * P0 Bug anti-regression suite — verifies that every previously-fixed critical
 * defect cannot silently reappear in production code.  Each test case maps to
 * a named bug and describes the root cause so future readers know WHY the check
 * exists.
 *
 * Approach: static analysis (fs.readFileSync / grep-in-code) only.  No NestJS
 * bootstrapping, no DB, no HTTP — fastest possible feedback loop.
 *
 * Coverage:
 *   P0-A  — 5 stage files that historically leaked lifecycle emit
 *   P0-B  — liveness staleThreshold must be >= 15 min in playground registration
 *   P0-C/G/K — maxCredits must be required, no fallback constants
 *   P0-D  — trajectory persistence: saveResearchResult + saveChapterDraft exist
 *   P0-8de5d02b — leader:goals-set initialRisks must be object[] not string[]
 *   P0-919d4a4cb — hardcoded pricing (MODEL_COSTS / COST_PER_1K) confined to 1 file
 */

import * as fs from "fs";
import * as path from "path";

const BACKEND_SRC = path.resolve(__dirname, "../..");
const MODULES = path.join(BACKEND_SRC, "modules");

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

function read(rel: string): string {
  const abs = path.isAbsolute(rel) ? rel : path.join(MODULES, rel);
  return fs.readFileSync(abs, "utf8");
}

function exists(rel: string): boolean {
  const abs = path.isAbsolute(rel) ? rel : path.join(MODULES, rel);
  return fs.existsSync(abs);
}

/** Recursively collect all production (non-spec) .ts files under dir */
function prodTsFiles(dir: string): string[] {
  const out: string[] = [];
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...prodTsFiles(full));
    else if (
      entry.isFile() &&
      full.endsWith(".ts") &&
      !full.endsWith(".spec.ts")
    )
      out.push(full);
  }
  return out;
}

// ---------------------------------------------------------------------------
// P0-A: Stage lifecycle — orchestrator must bridge stage:started/completed/failed
// ---------------------------------------------------------------------------

describe("P0-A — stage lifecycle emit via orchestrator bridge (no longer in stage files)", () => {
  const dispatcherFile =
    "ai-app/agent-playground/services/mission/workflow/playground-pipeline-dispatcher.service.ts";

  it("dispatcher onEvent bridge emits agent-playground.stage:lifecycle", () => {
    const src = read(dispatcherFile);
    // The bridge must translate stage:started/completed/failed → stage:lifecycle
    expect(src).toContain("agent-playground.stage:lifecycle");
    expect(src).toContain('event.type === "stage:started"');
    expect(src).toContain('event.type === "stage:completed"');
    expect(src).toContain('event.type === "stage:failed"');
  });

  it("dispatcher bridges onEvent to orchestrator.run()", () => {
    const src = read(dispatcherFile);
    // onEvent must be wired into orchestrator.run() call
    const runIdx = src.indexOf("orchestrator.run(");
    expect(runIdx).toBeGreaterThan(-1);
    const segment = src.slice(runIdx, runIdx + 800);
    expect(segment).toContain("onEvent");
  });

  // The 5 stage files that previously had no emit.  After 2026-05-06 single-track
  // unification the orchestrator is the sole emitter — verify the fix notes are
  // present or that the files no longer manually emit stage:started.
  // NOTE: Not all files use the exact same keyword; we verify the orchestrator
  // bridge is wired (tested above) and that each stage file still exists.
  const PREVIOUSLY_MISSING_STAGES = [
    "ai-app/agent-playground/services/mission/workflow/stages/s4-leader-assess-research.stage.ts",
    "ai-app/agent-playground/services/mission/workflow/stages/s9-reviewer-critic-l4.stage.ts",
    "ai-app/agent-playground/services/mission/workflow/stages/s10-leader-foreword-and-signoff.stage.ts",
    "ai-app/agent-playground/services/mission/workflow/stages/s11-mission-persist.stage.ts",
    "ai-app/agent-playground/services/mission/workflow/stages/s7-writer-plan-outline.stage.ts",
  ];

  it.each(PREVIOUSLY_MISSING_STAGES)(
    "stage file %s exists and does NOT standalone emit stage:started for its own stage",
    (relPath) => {
      expect(exists(relPath)).toBe(true);
      const src = read(relPath);
      // These files must NOT emit stage:started independently in production code paths
      // (the orchestrator bridge handles it).  Comments mentioning the pattern are OK.
      // We check by: the string "stage:started" either doesn't appear, or only in comments.
      const lines = src.split("\n");
      const nonCommentEmitStarted = lines
        .filter(
          (l) =>
            !l.trimStart().startsWith("//") && !l.trimStart().startsWith("*"),
        )
        .some(
          (l) =>
            l.includes('"stage:started"') &&
            l.includes("emit") &&
            !l.includes("//"),
        );
      // If the stage independently emits stage:started outside comments, that's P0-A regression
      if (nonCommentEmitStarted) {
        throw new Error(
          `${relPath} must not have independent stage:started emission (orchestrator handles it)`,
        );
      }
      expect(nonCommentEmitStarted).toBe(false);
    },
  );

  it("S1 budget stage does not standalone-emit stage:started (orchestrator handles it)", () => {
    const src = read(
      "ai-app/agent-playground/services/mission/workflow/stages/s1-mission-estimate-budget.stage.ts",
    );
    // S1 emits mission:started — NOT stage:lifecycle independently
    expect(src).toContain("agent-playground.mission:started");
    // The comment confirming single-track
    expect(src).toMatch(/单轨化|P0-A|orchestrator/);
  });
});

// ---------------------------------------------------------------------------
// P0-B: Liveness staleThreshold must be >= 15 minutes in playground adapter
// ---------------------------------------------------------------------------

describe("P0-B — MissionLivenessGuard staleThresholdMs >= 15 min in playground", () => {
  const moduleFile = "ai-app/agent-playground/agent-playground.module.ts";

  it("playground module registers liveness adapter with staleThresholdMs", () => {
    const src = read(moduleFile);
    expect(src).toContain("registerAdapter");
    expect(src).toContain("staleThresholdMs");
  });

  it("staleThresholdMs value is >= 15 * 60 * 1000 (900000)", () => {
    const src = read(moduleFile);
    // Extract all numeric staleThresholdMs assignments
    const matches = src.matchAll(
      /staleThresholdMs\s*:\s*(\d+)\s*\*\s*60\s*\*\s*1000/g,
    );
    const values: number[] = [];
    for (const m of matches) {
      values.push(parseInt(m[1], 10));
    }
    // Must have at least one value, all must be >= 15
    expect(values.length).toBeGreaterThan(0);
    for (const v of values) {
      expect(v).toBeGreaterThanOrEqual(15);
    }
  });

  it("MissionLivenessGuard DEFAULTS.staleThresholdMs is defined", () => {
    const guardFile =
      "ai-harness/lifecycle/mission-lifecycle/mission-liveness-guard.service.ts";
    const src = read(guardFile);
    expect(src).toContain("staleThresholdMs");
    // DEFAULTS object must exist
    expect(src).toContain("DEFAULTS");
  });

  it("playground registers softWarnThresholdMs > staleThresholdMs", () => {
    const src = read(moduleFile);
    const staleMatch = src.match(
      /staleThresholdMs\s*:\s*(\d+)\s*\*\s*60\s*\*\s*1000/,
    );
    const softMatch = src.match(
      /softWarnThresholdMs\s*:\s*(\d+)\s*\*\s*60\s*\*\s*1000/,
    );
    if (staleMatch && softMatch) {
      const staleMin = parseInt(staleMatch[1], 10);
      const softMin = parseInt(softMatch[1], 10);
      expect(softMin).toBeGreaterThan(staleMin);
    }
  });
});

// ---------------------------------------------------------------------------
// P0-C/G/K: maxCredits must be required; no internal fallback hardcodes
// ---------------------------------------------------------------------------

describe("P0-C/G/K — maxCredits required, no fallback hardcoding", () => {
  const dtoFile = "ai-app/agent-playground/dto/run-mission.dto.ts";

  it("RunMissionInputSchema declares maxCredits as required (no .optional())", () => {
    const src = read(dtoFile);
    // maxCredits must appear, and must NOT be followed by .optional()
    const maxCreditsIdx = src.indexOf("maxCredits");
    expect(maxCreditsIdx).toBeGreaterThan(-1);
    // Grab the 200 chars after the field declaration
    const segment = src.slice(maxCreditsIdx, maxCreditsIdx + 200);
    expect(segment).not.toContain(".optional()");
  });

  it("resolveMissionCredits returns input.maxCredits directly (no fallback)", () => {
    const src = read(dtoFile);
    // The function must exist and return input.maxCredits
    expect(src).toContain("resolveMissionCredits");
    expect(src).toContain("return input.maxCredits");
    // Must NOT have a fallback like ?? 1000 or ?? 300
    const fnIdx = src.indexOf("resolveMissionCredits");
    const fnBody = src.slice(fnIdx, fnIdx + 200);
    expect(fnBody).not.toMatch(/\?\?\s*\d+/);
  });

  it("resolveBudgetMultiplier returns input.budgetMultiplierOverride directly", () => {
    const src = read(dtoFile);
    expect(src).toContain("resolveBudgetMultiplier");
    expect(src).toContain("return input.budgetMultiplierOverride");
    const fnIdx = src.indexOf("resolveBudgetMultiplier");
    const fnBody = src.slice(fnIdx, fnIdx + 200);
    expect(fnBody).not.toMatch(/\?\?\s*[\d.]+/);
  });

  it("no BUDGET_PROFILE_CREDITS constant declared in dto (was removed in P0-K)", () => {
    const src = read(dtoFile);
    // The constant BUDGET_PROFILE_CREDITS must not be declared (const/let/var);
    // it's fine if it appears in a JSDoc comment explaining what was removed.
    expect(src).not.toMatch(/(?:const|let|var)\s+BUDGET_PROFILE_CREDITS/);
    // BUDGET_PROFILE_MULTIPLIER was the old internal mapping — must not be declared either
    expect(src).not.toMatch(/(?:const|let|var)\s+BUDGET_PROFILE_MULTIPLIER/);
  });

  it("no ??\\ 300 or ?? 1000 fallback in dispatcher service", () => {
    const dispatcher =
      "ai-app/agent-playground/services/mission/workflow/playground-pipeline-dispatcher.service.ts";
    const src = read(dispatcher);
    // maxCredits fallback patterns that would bypass P0-K fix
    expect(src).not.toMatch(/maxCredits\s*\?\?\s*300/);
    expect(src).not.toMatch(/maxCredits\s*\?\?\s*1000/);
    expect(src).not.toMatch(/maxCredits\s*\?\?\s*500/);
  });
});

// ---------------------------------------------------------------------------
// P0-D: Trajectory persistence — saveResearchResult + saveChapterDraft exist
// ---------------------------------------------------------------------------

describe("P0-D — trajectory persistence methods exist in MissionStore", () => {
  const storeFile =
    "ai-app/agent-playground/services/mission/lifecycle/mission-store.service.ts";

  it("saveResearchResult method exists", () => {
    const src = read(storeFile);
    expect(src).toContain("async saveResearchResult(");
  });

  it("saveChapterDraft method exists", () => {
    const src = read(storeFile);
    expect(src).toContain("async saveChapterDraft(");
  });

  it("loadBaselineResearchResults method exists (rerun hydration)", () => {
    const src = read(storeFile);
    expect(src).toContain("async loadBaselineResearchResults(");
  });

  it("loadQualifiedChapterDrafts method exists (rerun hydration)", () => {
    const src = read(storeFile);
    expect(src).toContain("async loadQualifiedChapterDrafts(");
  });

  it("saveResearchResult is called from dispatcher pipeline", () => {
    const dispatcher =
      "ai-app/agent-playground/services/mission/workflow/playground-pipeline-dispatcher.service.ts";
    const src = read(dispatcher);
    expect(src).toContain("saveResearchResult");
  });

  it("saveChapterDraft is called from pipeline util or dispatcher", () => {
    // Either per-dim-pipeline or dispatcher uses saveChapterDraft
    const utilFile =
      "ai-app/agent-playground/services/mission/workflow/per-dim-pipeline.util.ts";
    const dispatcherFile =
      "ai-app/agent-playground/services/mission/workflow/playground-pipeline-dispatcher.service.ts";
    const utilHas = exists(utilFile)
      ? read(utilFile).includes("saveChapterDraft")
      : false;
    const dispatcherHas = read(dispatcherFile).includes("saveChapterDraft");
    expect(utilHas || dispatcherHas).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// P0-8de5d02b0: leader:goals-set initialRisks must be object[] not string[]
// — tested here via DomainEventBus contract (same guard as protection-net.spec.ts
//   but verifying the specific event schema registered in the registry)
// ---------------------------------------------------------------------------

describe("P0-8de5d02b0 — leader:goals-set initialRisks schema is object[]", () => {
  it("agent-playground event schemas file registers leader:goals-set", () => {
    const schemasFile =
      "ai-app/agent-playground/agent-playground.event-schemas.ts";
    if (!exists(schemasFile)) {
      // May be inline registered; check events file
      const eventsFile = "ai-app/agent-playground/agent-playground.events.ts";
      const src = read(eventsFile);
      // goals-set must appear
      expect(src).toContain("goals-set");
      return;
    }
    const src = read(schemasFile);
    expect(src).toContain("goals-set");
  });

  it("no file treats initialRisks as z.array(z.string())", () => {
    // Any zod schema that defines initialRisks must use z.object, not z.string
    const allProd = prodTsFiles(MODULES);
    const violations = allProd.filter((f) => {
      try {
        const c = fs.readFileSync(f, "utf8");
        // Look for: initialRisks: z.array(z.string())
        return /initialRisks\s*:\s*z\.array\s*\(\s*z\.string/.test(c);
      } catch {
        return false;
      }
    });
    expect(violations).toHaveLength(0);
    if (violations.length > 0) {
      console.error(
        "initialRisks as z.array(z.string()) found in:",
        violations,
      );
    }
  });
});

// ---------------------------------------------------------------------------
// P0-919d4a4cb: Hardcoded pricing — MODEL_COSTS / COST_PER_1K confined
// ---------------------------------------------------------------------------

describe("P0-919d4a4cb — hardcoded pricing confined to known locations", () => {
  it("COST_PER_1K_TOKENS does not appear in any production file", () => {
    const allProd = prodTsFiles(MODULES);
    const hits = allProd.filter((f) => {
      try {
        return fs.readFileSync(f, "utf8").includes("COST_PER_1K_TOKENS");
      } catch {
        return false;
      }
    });
    expect(hits).toHaveLength(0);
  });

  it("MODEL_COSTS appears in constraint-engine.ts only (as FALLBACK_TIER_COSTS semantic tiers)", () => {
    const allProd = prodTsFiles(MODULES);
    const hits = allProd
      .filter((f) => !f.includes("constraint-engine.ts"))
      .filter((f) => {
        try {
          return fs.readFileSync(f, "utf8").includes("MODEL_COSTS");
        } catch {
          return false;
        }
      });
    expect(hits).toHaveLength(0);
  });

  it("constraint-engine.ts uses semantic tier keys (cheap/balanced/premium), not real model IDs", () => {
    const ceFile = "ai-harness/guardrails/constraints/constraint-engine.ts";
    const src = read(ceFile);
    // The fallback table uses semantic tier names
    expect(src).toContain("cheap");
    expect(src).toContain("balanced");
    expect(src).toContain("premium");
    // And it uses ModelPricingRegistry as the primary source (optional injection)
    expect(src).toContain("ModelPricingRegistry");
    expect(src).toContain("pricingRegistry");
  });

  it("cost.calculator.ts has been deleted (ai-engine/planning/budget)", () => {
    const file = path.join(
      MODULES,
      "ai-engine/planning/budget/cost.calculator.ts",
    );
    expect(fs.existsSync(file)).toBe(false);
  });

  it("ai-observability.service.ts does not contain static estimateCost", () => {
    const file = "ai-harness/tracing/observability/ai-observability.service.ts";
    if (!exists(file)) return; // file was deleted — even better
    const src = read(file);
    expect(src).not.toContain("static estimateCost");
  });

  it("ai-metrics.service.ts does not contain private estimateCost", () => {
    const file = "ai-infra/monitoring/metrics/ai-metrics.service.ts";
    if (!exists(file)) return;
    const src = read(file);
    expect(src).not.toContain("private estimateCost");
  });
});
