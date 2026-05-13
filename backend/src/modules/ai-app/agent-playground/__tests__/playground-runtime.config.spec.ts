/**
 * playground-runtime.config — unit tests
 *
 * Verifies that:
 *   - All defaults match the documented values when no env is set
 *   - Each knob can be overridden via its env var
 *   - Invalid env values (negatives, junk) fall back to defaults
 *   - Cross-field invariants hold (hardCap >= soft, softWarn >= stale)
 *   - The Zod schema rejects any pathological raw object
 */

import {
  loadPlaygroundRuntimeConfig,
  PlaygroundRuntimeConfigSchema,
} from "../playground-runtime.config";

describe("playground-runtime.config", () => {
  describe("defaults", () => {
    const cfg = loadPlaygroundRuntimeConfig({} as NodeJS.ProcessEnv);

    it("loads frontier-model-safe defaults when no env vars are set", () => {
      expect(cfg).toEqual({
        minFindingsThreshold: 4,
        chapterToleranceRatio: 0.3,
        researcherMaxIterations: 5,
        researcherMaxIterationsHardCap: 10,
        researcherMaxWallTimeMs: 600_000,
        chapterWriterInternalMaxIterations: 1,
        chapterMaxRevisionAttempts: 1,
        missionWriterMaxAttempts: 2,
        reactMaxFinalizeRejects: 4,
        staleThresholdMin: 15,
        softWarnThresholdMin: 20,
        wallTimeCapMs: 4 * 60 * 60 * 1000,
        disableBudgetAbort: false,
      });
    });
  });

  describe("overrides", () => {
    it("overrides minFindingsThreshold from MIN_FINDINGS_THRESHOLD", () => {
      const cfg = loadPlaygroundRuntimeConfig({
        MIN_FINDINGS_THRESHOLD: "3",
      } as NodeJS.ProcessEnv);
      expect(cfg.minFindingsThreshold).toBe(3);
    });

    it("overrides chapterToleranceRatio from CHAPTER_TOLERANCE_RATIO", () => {
      const cfg = loadPlaygroundRuntimeConfig({
        CHAPTER_TOLERANCE_RATIO: "0.4",
      } as NodeJS.ProcessEnv);
      expect(cfg.chapterToleranceRatio).toBe(0.4);
    });

    it("overrides researcher loop bounds", () => {
      const cfg = loadPlaygroundRuntimeConfig({
        RESEARCHER_MAX_ITERATIONS: "15",
        RESEARCHER_MAX_ITERATIONS_HARD_CAP: "30",
        RESEARCHER_MAX_WALL_TIME_MS: "1800000",
      } as NodeJS.ProcessEnv);
      expect(cfg.researcherMaxIterations).toBe(15);
      expect(cfg.researcherMaxIterationsHardCap).toBe(30);
      expect(cfg.researcherMaxWallTimeMs).toBe(1_800_000);
    });

    it("overrides chapter writer / revision attempts", () => {
      const cfg = loadPlaygroundRuntimeConfig({
        CHAPTER_WRITER_INTERNAL_MAX_ITERATIONS: "3",
        CHAPTER_MAX_REVISION_ATTEMPTS: "3",
        MISSION_WRITER_MAX_ATTEMPTS: "3",
      } as NodeJS.ProcessEnv);
      expect(cfg.chapterWriterInternalMaxIterations).toBe(3);
      expect(cfg.chapterMaxRevisionAttempts).toBe(3);
      expect(cfg.missionWriterMaxAttempts).toBe(3);
    });

    it("overrides liveness thresholds", () => {
      const cfg = loadPlaygroundRuntimeConfig({
        PLAYGROUND_STALE_THRESHOLD_MIN: "60",
        PLAYGROUND_SOFT_WARN_THRESHOLD_MIN: "75",
      } as NodeJS.ProcessEnv);
      expect(cfg.staleThresholdMin).toBe(60);
      expect(cfg.softWarnThresholdMin).toBe(75);
    });

    it("overrides wallTimeCapMs from PLAYGROUND_WALL_TIME_CAP_MS", () => {
      const cfg = loadPlaygroundRuntimeConfig({
        PLAYGROUND_WALL_TIME_CAP_MS: "0",
      } as NodeJS.ProcessEnv);
      expect(cfg.wallTimeCapMs).toBe(0); // 0 means "unlimited" upstream
    });

    it("overrides budget abort flag from PLAYGROUND_DISABLE_BUDGET_ABORT=1", () => {
      const cfg = loadPlaygroundRuntimeConfig({
        PLAYGROUND_DISABLE_BUDGET_ABORT: "1",
      } as NodeJS.ProcessEnv);
      expect(cfg.disableBudgetAbort).toBe(true);
    });

    it.each(["true", "yes", "on", "TRUE"])(
      "treats PLAYGROUND_DISABLE_BUDGET_ABORT=%s as true",
      (raw) => {
        const cfg = loadPlaygroundRuntimeConfig({
          PLAYGROUND_DISABLE_BUDGET_ABORT: raw,
        } as NodeJS.ProcessEnv);
        expect(cfg.disableBudgetAbort).toBe(true);
      },
    );

    it.each(["0", "false", "no", "anything-else"])(
      "treats PLAYGROUND_DISABLE_BUDGET_ABORT=%s as false",
      (raw) => {
        const cfg = loadPlaygroundRuntimeConfig({
          PLAYGROUND_DISABLE_BUDGET_ABORT: raw,
        } as NodeJS.ProcessEnv);
        expect(cfg.disableBudgetAbort).toBe(false);
      },
    );
  });

  describe("invalid env values fall back to defaults", () => {
    it("ignores negative integers", () => {
      const cfg = loadPlaygroundRuntimeConfig({
        MIN_FINDINGS_THRESHOLD: "-5",
      } as NodeJS.ProcessEnv);
      expect(cfg.minFindingsThreshold).toBe(4); // default
    });

    it("ignores non-numeric junk", () => {
      const cfg = loadPlaygroundRuntimeConfig({
        RESEARCHER_MAX_ITERATIONS: "not-a-number",
      } as NodeJS.ProcessEnv);
      expect(cfg.researcherMaxIterations).toBe(5); // default
    });

    it("ignores out-of-range ratio", () => {
      const cfg = loadPlaygroundRuntimeConfig({
        CHAPTER_TOLERANCE_RATIO: "1.5",
      } as NodeJS.ProcessEnv);
      expect(cfg.chapterToleranceRatio).toBe(0.3); // default
    });

    it("ignores 0 for positive-int fields (researcherMaxIterations must be >= 1)", () => {
      const cfg = loadPlaygroundRuntimeConfig({
        RESEARCHER_MAX_ITERATIONS: "0",
      } as NodeJS.ProcessEnv);
      expect(cfg.researcherMaxIterations).toBe(5); // default
    });
  });

  describe("cross-field invariants", () => {
    it("forces softWarnThresholdMin >= staleThresholdMin", () => {
      const cfg = loadPlaygroundRuntimeConfig({
        PLAYGROUND_STALE_THRESHOLD_MIN: "30",
        PLAYGROUND_SOFT_WARN_THRESHOLD_MIN: "3",
      } as NodeJS.ProcessEnv);
      expect(cfg.softWarnThresholdMin).toBe(30);
    });

    it("forces researcherMaxIterationsHardCap >= researcherMaxIterations", () => {
      const cfg = loadPlaygroundRuntimeConfig({
        RESEARCHER_MAX_ITERATIONS: "20",
        RESEARCHER_MAX_ITERATIONS_HARD_CAP: "5",
      } as NodeJS.ProcessEnv);
      expect(cfg.researcherMaxIterationsHardCap).toBe(20);
    });
  });

  describe("schema integrity", () => {
    it("the loaded config always satisfies the Zod schema", () => {
      const cfg = loadPlaygroundRuntimeConfig({} as NodeJS.ProcessEnv);
      expect(PlaygroundRuntimeConfigSchema.safeParse(cfg).success).toBe(true);
    });

    it("the schema rejects a pathological raw object", () => {
      expect(
        PlaygroundRuntimeConfigSchema.safeParse({
          minFindingsThreshold: -1,
        }).success,
      ).toBe(false);
    });
  });
});
