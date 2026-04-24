/**
 * Research depth 枚举（对齐既有 ResearchDepth 概念）
 * 不直接 import legacy 的 ResearchDepth，避免 harness 绑定 legacy 类型。
 */

export type ResearchDepth = "quick" | "standard" | "thorough" | "deep";

export interface ResearchDepthConfig {
  readonly depth: ResearchDepth;
  readonly maxDimensions: number;
  readonly maxSectionsPerDimension: number;
  readonly maxCognitiveLoops: number;
  readonly maxRevisionRounds: number;
  readonly literatureBaselineEnabled: boolean;
  readonly factCheckEnabled: boolean;
  readonly evaluationEnabled: boolean;
}

export const DEPTH_CONFIG_DEFAULTS: Readonly<
  Record<ResearchDepth, ResearchDepthConfig>
> = Object.freeze({
  quick: {
    depth: "quick",
    maxDimensions: 3,
    maxSectionsPerDimension: 1,
    maxCognitiveLoops: 0,
    maxRevisionRounds: 0,
    literatureBaselineEnabled: false,
    factCheckEnabled: false,
    evaluationEnabled: false,
  },
  standard: {
    depth: "standard",
    maxDimensions: 4,
    maxSectionsPerDimension: 2,
    maxCognitiveLoops: 0,
    maxRevisionRounds: 1,
    literatureBaselineEnabled: false,
    factCheckEnabled: false,
    evaluationEnabled: false,
  },
  thorough: {
    depth: "thorough",
    maxDimensions: 6,
    maxSectionsPerDimension: 3,
    maxCognitiveLoops: 1,
    maxRevisionRounds: 2,
    literatureBaselineEnabled: true,
    factCheckEnabled: true,
    evaluationEnabled: true,
  },
  deep: {
    depth: "deep",
    maxDimensions: 8,
    maxSectionsPerDimension: 4,
    maxCognitiveLoops: 2,
    maxRevisionRounds: 3,
    literatureBaselineEnabled: true,
    factCheckEnabled: true,
    evaluationEnabled: true,
  },
});

export function resolveDepthConfig(depth: ResearchDepth): ResearchDepthConfig {
  return DEPTH_CONFIG_DEFAULTS[depth];
}
