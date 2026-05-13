/**
 * playground-tuning-profile — unit tests
 *
 * Verifies the profile selector + the precedence chain
 * (DEFAULTS → profile → env vars) at the level of the public loader.
 */

import {
  loadPlaygroundRuntimeConfig,
  loadPlaygroundRuntimeConfigWithProfile,
} from "../playground-runtime.config";
import {
  parsePlaygroundTuningProfile,
  PLAYGROUND_TUNING_PROFILES,
  getProfileOverrides,
} from "../playground-tuning-profile";

describe("playground-tuning-profile", () => {
  describe("parsePlaygroundTuningProfile", () => {
    it("returns 'frontier' for undefined/empty input", () => {
      expect(parsePlaygroundTuningProfile(undefined)).toBe("frontier");
      expect(parsePlaygroundTuningProfile("")).toBe("frontier");
    });

    it("accepts each known profile name verbatim", () => {
      for (const name of PLAYGROUND_TUNING_PROFILES) {
        expect(parsePlaygroundTuningProfile(name)).toBe(name);
      }
    });

    it("is case-insensitive and tolerates underscores", () => {
      expect(parsePlaygroundTuningProfile("LOCAL-QUANTIZED")).toBe(
        "local-quantized",
      );
      expect(parsePlaygroundTuningProfile("Local_Reasoning")).toBe(
        "local-reasoning",
      );
      expect(parsePlaygroundTuningProfile("  frontier  ")).toBe("frontier");
    });

    it("falls back to 'frontier' for unknown profiles", () => {
      expect(parsePlaygroundTuningProfile("turbo-mode")).toBe("frontier");
      expect(parsePlaygroundTuningProfile("gpt-5-extreme")).toBe("frontier");
    });
  });

  describe("getProfileOverrides", () => {
    it("returns an empty object for the frontier baseline", () => {
      expect(getProfileOverrides("frontier")).toEqual({});
    });

    it("returns the documented local-quantized overrides", () => {
      const o = getProfileOverrides("local-quantized");
      expect(o.minFindingsThreshold).toBe(3);
      expect(o.chapterToleranceRatio).toBe(0.4);
      expect(o.researcherMaxIterations).toBe(10);
    });

    it("returns the documented local-reasoning overrides incl. disableBudgetAbort", () => {
      const o = getProfileOverrides("local-reasoning");
      expect(o.researcherMaxIterations).toBe(15);
      expect(o.researcherMaxWallTimeMs).toBe(1_800_000);
      expect(o.disableBudgetAbort).toBe(true);
    });
  });

  describe("precedence (DEFAULTS → profile → env vars)", () => {
    it("frontier profile + no env => DEFAULTS", () => {
      const cfg = loadPlaygroundRuntimeConfig({
        PLAYGROUND_TUNING_PROFILE: "frontier",
      } as NodeJS.ProcessEnv);
      expect(cfg.minFindingsThreshold).toBe(4); // DEFAULT
      expect(cfg.chapterToleranceRatio).toBe(0.3); // DEFAULT
      expect(cfg.disableBudgetAbort).toBe(false); // DEFAULT
    });

    it("local-quantized profile applies its overrides without per-knob env", () => {
      const cfg = loadPlaygroundRuntimeConfig({
        PLAYGROUND_TUNING_PROFILE: "local-quantized",
      } as NodeJS.ProcessEnv);
      expect(cfg.minFindingsThreshold).toBe(3); // profile
      expect(cfg.chapterToleranceRatio).toBe(0.4); // profile
      expect(cfg.researcherMaxIterations).toBe(10); // profile
      expect(cfg.staleThresholdMin).toBe(30); // profile
      expect(cfg.disableBudgetAbort).toBe(false); // DEFAULT (profile doesn't override)
    });

    it("local-reasoning profile applies longer-wait + disableBudgetAbort", () => {
      const cfg = loadPlaygroundRuntimeConfig({
        PLAYGROUND_TUNING_PROFILE: "local-reasoning",
      } as NodeJS.ProcessEnv);
      expect(cfg.researcherMaxIterations).toBe(15); // profile
      expect(cfg.researcherMaxWallTimeMs).toBe(1_800_000); // profile
      expect(cfg.staleThresholdMin).toBe(60); // profile
      expect(cfg.disableBudgetAbort).toBe(true); // profile
    });

    it("per-knob env vars override the profile baseline", () => {
      const cfg = loadPlaygroundRuntimeConfig({
        PLAYGROUND_TUNING_PROFILE: "local-reasoning",
        // Deviation: tighten one specific knob below the profile setting
        MIN_FINDINGS_THRESHOLD: "1",
        CHAPTER_TOLERANCE_RATIO: "0.6",
      } as NodeJS.ProcessEnv);
      // Per-knob env wins
      expect(cfg.minFindingsThreshold).toBe(1);
      expect(cfg.chapterToleranceRatio).toBe(0.6);
      // Other profile values still apply
      expect(cfg.researcherMaxIterations).toBe(15);
      expect(cfg.disableBudgetAbort).toBe(true);
    });

    it("env can override a profile-set boolean back to false (explicit override)", () => {
      const cfg = loadPlaygroundRuntimeConfig({
        PLAYGROUND_TUNING_PROFILE: "local-reasoning",
        PLAYGROUND_DISABLE_BUDGET_ABORT: "0",
      } as NodeJS.ProcessEnv);
      expect(cfg.disableBudgetAbort).toBe(false);
    });

    it("unknown profile name falls back to frontier silently", () => {
      const cfg = loadPlaygroundRuntimeConfig({
        PLAYGROUND_TUNING_PROFILE: "what-even-is-this",
      } as NodeJS.ProcessEnv);
      // Defaults restored
      expect(cfg.minFindingsThreshold).toBe(4);
      expect(cfg.chapterToleranceRatio).toBe(0.3);
    });
  });

  describe("loadPlaygroundRuntimeConfigWithProfile", () => {
    it("returns the resolved config + profile name", () => {
      const { config, profile } = loadPlaygroundRuntimeConfigWithProfile({
        PLAYGROUND_TUNING_PROFILE: "local-quantized",
      } as NodeJS.ProcessEnv);
      expect(profile).toBe("local-quantized");
      expect(config.researcherMaxIterations).toBe(10);
    });

    it("reports 'frontier' when no profile env is set", () => {
      const { profile } = loadPlaygroundRuntimeConfigWithProfile(
        {} as NodeJS.ProcessEnv,
      );
      expect(profile).toBe("frontier");
    });
  });
});
