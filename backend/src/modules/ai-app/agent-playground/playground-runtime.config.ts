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

  // ★ 2026-05-22 follow-up：原 7 个 loop-control 旋钮(researcherMaxIterations /
  //   HardCap / WallTimeMs / chapterWriterInternalMaxIterations /
  //   chapterMaxRevisionAttempts / missionWriterMaxAttempts / reactMaxFinalizeRejects)
  //   已删除——config 定义了但**生产代码零消费**(真实消费方读 thresholds.constants.ts
  //   硬编码常量),profile 设了也静默无效。删除消除"定义即承诺生效"的腐朽误导。
  //   如需让 loop 上限可调,应改 thresholds 消费方读 config(单独 feature,非本轮)。

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

  // ★ 2026-05-22 follow-up：原 disableBudgetAbort 已删除——同样 config 定义但零消费
  //   (生产代码从不读),profile 设 true 也无效,"防级联 abort"保护实际不存在。删除止误导。
} as const;

/**
 * Zod schema for the typed runtime config. Exported so consumers can
 * derive types via z.infer<typeof PlaygroundRuntimeConfigSchema>.
 */
export const PlaygroundRuntimeConfigSchema = z.object({
  minFindingsThreshold: z.number().int().min(0),
  chapterToleranceRatio: z.number().min(0).max(1),
  staleThresholdMin: z.number().int().min(1),
  softWarnThresholdMin: z.number().int().min(1),
  wallTimeCapMs: z.number().int().min(0),
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
  };

  // Cross-field invariants
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
