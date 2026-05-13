/**
 * playground-runtime.config.ts —— Typed runtime tunables for the
 * agent-playground (mission pipeline).
 *
 * Replaces scattered `Number(process.env.X) || N` reads throughout
 * agent-playground / ai-harness with a single Zod-validated config
 * loaded once at boot.
 *
 * Two consumer paths:
 *   1. NestJS DI — inject ConfigService and read via the registered
 *      namespace (preferred for services).
 *   2. Static utils / AgentSpec classes — call loadPlaygroundRuntimeConfig()
 *      directly. The same Zod schema is used; defaults are guaranteed
 *      consistent.
 *
 * All numeric env vars are parsed via parseNonNegativeIntEnv /
 * parsePositiveIntEnv to reject negatives and preserve "0" semantics.
 * All boolean flags are parsed via parseBooleanEnv (opt-in: undefined →
 * production-safe default).
 *
 * Design rule: defaults MUST match the corresponding constants in
 * `@/modules/ai-harness/evaluation/thresholds.constants` so frontier-model
 * behavior is unchanged when nothing is overridden.
 */

import { registerAs } from "@nestjs/config";
import { z } from "zod";
import {
  parseNonNegativeIntEnv,
  parsePositiveIntEnv,
  parseBooleanEnv,
} from "@/common/utils/schema-coercion.utils";
import {
  getProfileOverrides,
  parsePlaygroundTuningProfile,
  type PlaygroundTuningProfile,
} from "./playground-tuning-profile";

/**
 * Per-knob default. **Single source of truth** — both DI and non-DI
 * loaders read from this table. To change a default in production, edit
 * here. To override per-environment, set the env var.
 */
const DEFAULTS = {
  // — researcher floor (used by researcher.agent.ts + s3 stage) —
  /** Minimum #findings a researcher must surface; below this triggers retry/abort. */
  minFindingsThreshold: 4,

  // — chapter integrity (used by per-dim-pipeline.util.ts) —
  /**
   * Max fraction of chapters allowed to be missing/dropped before the
   * dimension hard-fails. 0.3 = up to 30% missing tolerated.
   */
  chapterToleranceRatio: 0.3,

  // — researcher loop control (used by researcher.agent.ts) —
  /** Soft max iterations for the researcher react loop. */
  researcherMaxIterations: 5,
  /** Hard cap on researcher iterations; never exceeded. */
  researcherMaxIterationsHardCap: 10,
  /** Wall-time cap (ms) for a single researcher invocation. */
  researcherMaxWallTimeMs: 600_000,

  // — chapter writer / reviewer loop control —
  /** Internal iterations for a single chapter-writer agent run. */
  chapterWriterInternalMaxIterations: 1,
  /** Max revision attempts before accepting a degraded chapter. */
  chapterMaxRevisionAttempts: 1,
  /** Total attempts before mission-writer gives up. */
  missionWriterMaxAttempts: 2,

  // — react-loop finalize control —
  /** Max times the leader can reject a finalize call before forcing through. */
  reactMaxFinalizeRejects: 4,

  // — liveness guard (used by agent-playground.module.ts) —
  /**
   * Mission considered stalled after N minutes of inactivity (watchdog).
   * Production default 15min preserves clean-main behavior; local models
   * override upward via PLAYGROUND_STALE_THRESHOLD_MIN.
   */
  staleThresholdMin: 15,
  /**
   * Soft warning threshold for stale mission (before hard-kill).
   * Production default 20min preserves clean-main behavior.
   */
  softWarnThresholdMin: 20,
  /**
   * Total wall-time cap for a mission (ms). 0 = unlimited.
   * Production default 4h preserves clean-main behavior (deep + thorough+ +
   * unlimited ≈ 3h actual, 4h headroom).
   */
  wallTimeCapMs: 4 * 60 * 60 * 1000,

  // — budget pool toggles —
  /**
   * When true, suppress the cascading `abortRegistry.abort()` calls
   * triggered by budget exhaustion. Lets a slow/quantized model finish
   * outstanding sub-agent calls even after the soft budget is exceeded.
   * Default false (production-safe: budget abort enabled).
   */
  disableBudgetAbort: false,
} as const;

/**
 * Zod schema for the typed runtime config. Exported so consumers can
 * derive types via z.infer<typeof PlaygroundRuntimeConfigSchema>.
 */
export const PlaygroundRuntimeConfigSchema = z.object({
  minFindingsThreshold: z.number().int().min(0),
  chapterToleranceRatio: z.number().min(0).max(1),
  researcherMaxIterations: z.number().int().min(1),
  researcherMaxIterationsHardCap: z.number().int().min(1),
  researcherMaxWallTimeMs: z.number().int().min(1_000),
  chapterWriterInternalMaxIterations: z.number().int().min(1),
  chapterMaxRevisionAttempts: z.number().int().min(0),
  missionWriterMaxAttempts: z.number().int().min(1),
  reactMaxFinalizeRejects: z.number().int().min(0),
  staleThresholdMin: z.number().int().min(1),
  softWarnThresholdMin: z.number().int().min(1),
  wallTimeCapMs: z.number().int().min(0),
  disableBudgetAbort: z.boolean(),
});

export type PlaygroundRuntimeConfig = z.infer<
  typeof PlaygroundRuntimeConfigSchema
>;

/**
 * Parse a ratio-style env var ("0.4" / "0.0" / etc.) into a [0,1] number,
 * falling back to the default on parse failure or out-of-range.
 */
function parseRatioEnv(raw: string | undefined, defaultValue: number): number {
  if (raw === undefined || raw === null) return defaultValue;
  const n = Number(String(raw).trim());
  if (!Number.isFinite(n) || n < 0 || n > 1) return defaultValue;
  return n;
}

/**
 * Read env, parse + validate, return a fully populated typed config.
 *
 * Precedence:
 *   1. DEFAULTS (frontier-model production baseline) provide the starting point.
 *   2. The named tuning profile (`PLAYGROUND_TUNING_PROFILE`) overlays its
 *      profile-specific defaults — see playground-tuning-profile.ts.
 *   3. Individual env vars (MIN_FINDINGS_THRESHOLD etc.) override on top
 *      of the profile, allowing per-knob deviation from the profile baseline.
 *
 * The returned object includes `_profile` metadata so consumers can log
 * which posture the mission is running under.
 *
 * Throws via Zod if the parsed object would violate the schema — defensive
 * guard against a bug in the parser helpers above. In normal use, the
 * parser helpers always produce a value satisfying the schema.
 */
export function loadPlaygroundRuntimeConfig(
  env: NodeJS.ProcessEnv = process.env,
): PlaygroundRuntimeConfig {
  const profile: PlaygroundTuningProfile = parsePlaygroundTuningProfile(
    env.PLAYGROUND_TUNING_PROFILE,
  );
  const profileOverrides = getProfileOverrides(profile);
  const baseline = { ...DEFAULTS, ...profileOverrides };

  const raw = {
    minFindingsThreshold: parseNonNegativeIntEnv(
      env.MIN_FINDINGS_THRESHOLD,
      baseline.minFindingsThreshold,
    ),
    chapterToleranceRatio: parseRatioEnv(
      env.CHAPTER_TOLERANCE_RATIO,
      baseline.chapterToleranceRatio,
    ),
    researcherMaxIterations: parsePositiveIntEnv(
      env.RESEARCHER_MAX_ITERATIONS,
      baseline.researcherMaxIterations,
    ),
    researcherMaxIterationsHardCap: parsePositiveIntEnv(
      env.RESEARCHER_MAX_ITERATIONS_HARD_CAP,
      baseline.researcherMaxIterationsHardCap,
    ),
    researcherMaxWallTimeMs: parsePositiveIntEnv(
      env.RESEARCHER_MAX_WALL_TIME_MS,
      baseline.researcherMaxWallTimeMs,
    ),
    chapterWriterInternalMaxIterations: parsePositiveIntEnv(
      env.CHAPTER_WRITER_INTERNAL_MAX_ITERATIONS,
      baseline.chapterWriterInternalMaxIterations,
    ),
    chapterMaxRevisionAttempts: parseNonNegativeIntEnv(
      env.CHAPTER_MAX_REVISION_ATTEMPTS,
      baseline.chapterMaxRevisionAttempts,
    ),
    missionWriterMaxAttempts: parsePositiveIntEnv(
      env.MISSION_WRITER_MAX_ATTEMPTS,
      baseline.missionWriterMaxAttempts,
    ),
    reactMaxFinalizeRejects: parseNonNegativeIntEnv(
      env.REACT_MAX_FINALIZE_REJECTS,
      baseline.reactMaxFinalizeRejects,
    ),
    staleThresholdMin: parsePositiveIntEnv(
      env.PLAYGROUND_STALE_THRESHOLD_MIN,
      baseline.staleThresholdMin,
    ),
    softWarnThresholdMin: parsePositiveIntEnv(
      env.PLAYGROUND_SOFT_WARN_THRESHOLD_MIN,
      baseline.softWarnThresholdMin,
    ),
    wallTimeCapMs: parseNonNegativeIntEnv(
      env.PLAYGROUND_WALL_TIME_CAP_MS,
      baseline.wallTimeCapMs,
    ),
    disableBudgetAbort:
      env.PLAYGROUND_DISABLE_BUDGET_ABORT === undefined
        ? baseline.disableBudgetAbort
        : parseBooleanEnv(env.PLAYGROUND_DISABLE_BUDGET_ABORT),
  };

  // Cross-field invariants
  if (raw.researcherMaxIterationsHardCap < raw.researcherMaxIterations) {
    raw.researcherMaxIterationsHardCap = raw.researcherMaxIterations;
  }
  if (raw.softWarnThresholdMin < raw.staleThresholdMin) {
    raw.softWarnThresholdMin = raw.staleThresholdMin;
  }

  return PlaygroundRuntimeConfigSchema.parse(raw);
}

/**
 * Sibling helper that also surfaces which profile was selected. Useful for
 * boot-time logging and ops dashboards. Kept separate so consumers reading
 * a single tunable don't pay the cost of profile resolution metadata.
 */
export function loadPlaygroundRuntimeConfigWithProfile(
  env: NodeJS.ProcessEnv = process.env,
): { config: PlaygroundRuntimeConfig; profile: PlaygroundTuningProfile } {
  const profile = parsePlaygroundTuningProfile(env.PLAYGROUND_TUNING_PROFILE);
  return { config: loadPlaygroundRuntimeConfig(env), profile };
}

/**
 * NestJS @nestjs/config namespace. Inject in services as:
 *
 *   constructor(
 *     @Inject(playgroundRuntimeConfig.KEY)
 *     private readonly config: ConfigType<typeof playgroundRuntimeConfig>,
 *   ) {}
 *
 * Module wiring: `ConfigModule.forFeature(playgroundRuntimeConfig)`.
 */
export const playgroundRuntimeConfig = registerAs<PlaygroundRuntimeConfig>(
  "playgroundRuntime",
  () => loadPlaygroundRuntimeConfig(),
);
