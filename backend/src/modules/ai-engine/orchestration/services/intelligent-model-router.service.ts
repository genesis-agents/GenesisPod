/**
 * IntelligentModelRouterService
 *
 * 支柱四：智能模型路由 — 模型选择层
 *
 * 在 ModelFallbackService（负责降级链）之前执行，
 * 根据 ComplexityAnalyzerService 的复杂度档位，
 * 选择最优的 TaskProfile，引导 LiteLLM 选择正确模型级别。
 *
 * 与 ModelFallbackService 的关系：
 *   IntelligentModelRouter  →  决策"应该用什么级别的模型"
 *   ModelFallbackService    →  执行"如果主选失败则降级"
 *
 * 成本节约估算（基于路线图）：
 *   简单任务 (minimal/simple) 从 Opus 级别 → mini 级别：约节省 98%
 *   中等任务 (medium) 维持 Sonnet 级别：约节省 70%
 *   复杂任务 (complex/extreme) 保持 Opus 级别：质量优先
 */

import { Injectable, Logger } from "@nestjs/common";
import {
  ComplexityAnalyzerService,
  ComplexityLevel,
  TaskDescriptor,
  TaskComplexity,
} from "./complexity-analyzer.service";
import {
  TaskProfile,
  CreativityLevel,
  OutputLengthLevel,
} from "../../llm/types/task-profile";

// ─────────────────────────────────────────────────────────
// Public types
// ─────────────────────────────────────────────────────────

/**
 * 质量反馈记录（由 EvalPipeline 写入）
 */
export interface QualityFeedback {
  taskType: string;
  complexityLevel: ComplexityLevel;
  /** 归一化 0-100 的综合评分（来自 EvalResult.overallScore） */
  score: number;
  recordedAt: Date;
}

/** 质量统计快照（用于 Admin Dashboard） */
export interface QualityStats {
  key: string;
  taskType: string;
  complexityLevel: ComplexityLevel;
  sampleCount: number;
  avgScore: number;
  /** 是否因质量不足已触发档位升级 */
  upgraded: boolean;
}

/**
 * 路由策略 — 覆盖默认行为
 */
export interface RoutingStrategy {
  /**
   * 强制最低复杂度档位
   * 例：分析任务中的"标签提取"子步骤可强制 minimal
   */
  forceMinLevel?: ComplexityLevel;
  /**
   * 强制最高复杂度档位（成本上限）
   * 例：受配额约束的场景不允许 extreme
   */
  forceMaxLevel?: ComplexityLevel;
  /**
   * 是否允许使用高创意模型
   * 默认 true；对于代码生成等确定性任务可设为 false
   */
  allowHighCreativity?: boolean;
}

/**
 * 路由结果
 */
export interface RoutingResult {
  /** 任务复杂度分析 */
  complexity: TaskComplexity;
  /** 最终推荐的 TaskProfile（经策略调整后） */
  profile: TaskProfile;
  /** 是否因策略限制而调整了档位 */
  adjusted: boolean;
  /** 调整原因（若 adjusted=true） */
  adjustReason?: string;
}

// ─────────────────────────────────────────────────────────
// Internal constants
// ─────────────────────────────────────────────────────────

/** 质量低于此阈值时触发档位升级 */
const QUALITY_UPGRADE_THRESHOLD = 55;
/** 至少需要此数量样本才做升级决策 */
const MIN_SAMPLES_FOR_UPGRADE = 3;
/** 每个 key 保留的最近 N 条记录（滑动窗口） */
const MAX_HISTORY_PER_KEY = 20;

const LEVEL_ORDER: ComplexityLevel[] = [
  "minimal",
  "simple",
  "medium",
  "complex",
  "extreme",
];

// ─────────────────────────────────────────────────────────
// Service
// ─────────────────────────────────────────────────────────

@Injectable()
export class IntelligentModelRouterService {
  private readonly logger = new Logger(IntelligentModelRouterService.name);

  /** 质量历史：key = `${taskType}:${complexityLevel}` → 最近 N 条评分 */
  private readonly qualityHistory = new Map<string, number[]>();

  constructor(private readonly complexityAnalyzer: ComplexityAnalyzerService) {}

  /**
   * 分析任务并返回路由结果（含调整后的 TaskProfile）
   */
  route(task: TaskDescriptor, strategy?: RoutingStrategy): RoutingResult {
    const complexity = this.complexityAnalyzer.analyze(task);
    let level = complexity.level;
    let adjusted = false;
    let adjustReason: string | undefined;

    // 应用质量历史升级（在 strategy 之前，给 strategy 机会再覆盖）
    const qualityUpgraded = this.applyQualityUpgrade(task.taskType, level);
    if (qualityUpgraded !== level) {
      adjustReason = `Level upgraded from ${level} to ${qualityUpgraded} (quality history below threshold)`;
      level = qualityUpgraded;
      adjusted = true;
    }

    // 应用 forceMinLevel
    if (
      strategy?.forceMinLevel &&
      this.compareLevels(level, strategy.forceMinLevel) < 0
    ) {
      adjustReason = `Level raised from ${level} to ${strategy.forceMinLevel} (forceMinLevel)`;
      level = strategy.forceMinLevel;
      adjusted = true;
    }

    // 应用 forceMaxLevel
    if (
      strategy?.forceMaxLevel &&
      this.compareLevels(level, strategy.forceMaxLevel) > 0
    ) {
      adjustReason = `Level capped from ${level} to ${strategy.forceMaxLevel} (forceMaxLevel)`;
      level = strategy.forceMaxLevel;
      adjusted = true;
    }

    // 构建最终 profile（使用调整后的档位对应的 base profile）
    const profile = this.buildProfile(this.levelToBaseProfile(level), strategy);

    if (adjusted) {
      this.logger.debug(adjustReason);
    }

    return {
      complexity,
      profile,
      adjusted,
      adjustReason,
    };
  }

  /**
   * 快捷方法：直接获取推荐 TaskProfile
   */
  getProfile(task: TaskDescriptor, strategy?: RoutingStrategy): TaskProfile {
    return this.route(task, strategy).profile;
  }

  /**
   * 记录 EvalPipeline 的质量反馈，用于反向优化路由决策。
   * 通常由 EvalPipelineService.evaluate() 完成后 fire-and-forget 调用。
   *
   * @param taskType  任务类型标识（如 "research_mission"、"writing"）
   * @param complexityLevel  本次路由使用的复杂度档位
   * @param score  归一化综合分（0-100，来自 EvalResult.overallScore）
   */
  recordQualityFeedback(
    taskType: string,
    complexityLevel: ComplexityLevel,
    score: number,
  ): void {
    const key = `${taskType}:${complexityLevel}`;
    const existing = this.qualityHistory.get(key) ?? [];

    // 滑动窗口：保留最近 N 条
    const updated = [...existing, score].slice(-MAX_HISTORY_PER_KEY);
    this.qualityHistory.set(key, updated);

    const avg = updated.reduce((s, v) => s + v, 0) / updated.length;
    this.logger.debug(
      `[qualityFeedback] ${key} score=${score.toFixed(1)} avg=${avg.toFixed(1)} samples=${updated.length}`,
    );

    if (
      updated.length >= MIN_SAMPLES_FOR_UPGRADE &&
      avg < QUALITY_UPGRADE_THRESHOLD
    ) {
      this.logger.warn(
        `[qualityFeedback] ${key} avg=${avg.toFixed(1)} below threshold=${QUALITY_UPGRADE_THRESHOLD}, ` +
          `consider upgrading complexity level or model for this task type`,
      );
    }
  }

  /**
   * 获取所有质量统计快照（Admin Dashboard 用）
   */
  getQualityStats(): QualityStats[] {
    const stats: QualityStats[] = [];

    for (const [key, scores] of this.qualityHistory) {
      // Key format is "{taskType}:{complexityLevel}" — taskType itself may contain
      // colons, so split at the LAST colon only.
      const lastColon = key.lastIndexOf(":");
      const taskType = lastColon === -1 ? key : key.slice(0, lastColon);
      const complexityLevel = (
        lastColon === -1 ? key : key.slice(lastColon + 1)
      ) as ComplexityLevel;
      const avgScore = scores.reduce((s, v) => s + v, 0) / scores.length;
      const upgraded =
        scores.length >= MIN_SAMPLES_FOR_UPGRADE &&
        avgScore < QUALITY_UPGRADE_THRESHOLD;

      stats.push({
        key,
        taskType,
        complexityLevel,
        sampleCount: scores.length,
        avgScore: Math.round(avgScore * 10) / 10,
        upgraded,
      });
    }

    return stats.sort((a, b) => a.avgScore - b.avgScore);
  }

  /**
   * 应用质量历史：若 taskType 在当前档位持续低分，自动升一档。
   * 由 route() 内部调用。
   */
  private applyQualityUpgrade(
    taskType: string | undefined,
    level: ComplexityLevel,
  ): ComplexityLevel {
    if (!taskType) return level;

    const key = `${taskType}:${level}`;
    const scores = this.qualityHistory.get(key);
    if (!scores || scores.length < MIN_SAMPLES_FOR_UPGRADE) return level;

    const avg = scores.reduce((s, v) => s + v, 0) / scores.length;
    if (avg < QUALITY_UPGRADE_THRESHOLD) {
      const currentIdx = LEVEL_ORDER.indexOf(level);
      const nextLevel = LEVEL_ORDER[currentIdx + 1];
      if (nextLevel) {
        this.logger.debug(
          `[qualityUpgrade] ${key} avg=${avg.toFixed(1)} → upgrading ${level} → ${nextLevel}`,
        );
        return nextLevel;
      }
    }
    return level;
  }

  /**
   * 从已知复杂度档位直接获取 profile（不重复分析）
   */
  profileFromLevel(
    level: ComplexityLevel,
    strategy?: RoutingStrategy,
  ): TaskProfile {
    return this.buildProfile(this.levelToBaseProfile(level), strategy);
  }

  // ─── private ───────────────────────────────────────────

  private buildProfile(
    base: TaskProfile,
    strategy?: RoutingStrategy,
  ): TaskProfile {
    let creativity: CreativityLevel = base.creativity ?? "medium";
    const outputLength: OutputLengthLevel = base.outputLength ?? "medium";

    // 如果策略不允许高创意，降级到 medium
    if (strategy?.allowHighCreativity === false && creativity === "high") {
      creativity = "medium";
    }

    return { creativity, outputLength };
  }

  /** 比较两个档位的大小（-1: a<b, 0: a=b, 1: a>b） */
  private compareLevels(a: ComplexityLevel, b: ComplexityLevel): number {
    return LEVEL_ORDER.indexOf(a) - LEVEL_ORDER.indexOf(b);
  }

  /** 档位 → 基础 TaskProfile（与 ComplexityAnalyzerService 内部映射表保持一致） */
  private levelToBaseProfile(level: ComplexityLevel): TaskProfile {
    const BASE_PROFILES: Record<ComplexityLevel, TaskProfile> = {
      minimal: { creativity: "deterministic", outputLength: "minimal" },
      simple: { creativity: "low", outputLength: "short" },
      medium: { creativity: "medium", outputLength: "medium" },
      complex: { creativity: "medium", outputLength: "long" },
      extreme: { creativity: "high", outputLength: "extended" },
    };
    return BASE_PROFILES[level];
  }
}
