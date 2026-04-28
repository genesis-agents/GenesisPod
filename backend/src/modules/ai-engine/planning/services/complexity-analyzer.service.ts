/**
 * ComplexityAnalyzerService
 *
 * 支柱四：智能模型路由 — 任务复杂度分析器
 *
 * 通过多维信号评分，将任务分为五个复杂度档位，
 * 供 IntelligentModelRouterService 决策最优 TaskProfile，
 * 最终降低 AI 调用成本 60-70%。
 *
 * 评分维度（总分 0-15）：
 *   - 输入规模     (0-4): 文本长度 / 预估 token 数
 *   - 工具数量     (0-3): 需要调用的工具种数
 *   - Agent 数量   (0-3): 并行协作的 Agent 数
 *   - 领域深度     (0-2): 是否需要专业领域知识
 *   - 输出结构     (0-2): 是否需要严格格式 / 长报告
 *   - 跨模块程度   (0-1): 是否涉及多个 AI App 联动
 *
 * 档位映射：
 *   minimal (0-2)   → 意图分类、标签提取、是/否判断
 *   simple  (3-5)   → 摘要、关键点提取、单步分析
 *   medium  (6-8)   → 对话问答、中等报告、Ask
 *   complex (9-11)  → 深度研究、长文写作、多 Agent 协作
 *   extreme (12-15) → 多 Agent Leader 协调、超长内容生成
 */

import { Injectable } from "@nestjs/common";
import {
  TaskProfile,
  CreativityLevel,
  OutputLengthLevel,
} from "../../llm/types/task-profile";

// ─────────────────────────────────────────────────────────
// Public types
// ─────────────────────────────────────────────────────────

export type ComplexityLevel =
  | "minimal"
  | "simple"
  | "medium"
  | "complex"
  | "extreme";

/**
 * 任务描述符 — 调用方传入任务上下文信号
 */
export interface TaskDescriptor {
  /** 用户输入 / 任务描述文本（用于估算 token 量） */
  input: string;
  /** 任务类型标识（可选，用于质量历史路由优化） */
  taskType?: string;
  /** 需要调用的工具数量（默认 0） */
  toolCount?: number;
  /** 协作 Agent 数量（默认 1，即单 LLM 调用） */
  agentCount?: number;
  /** 是否需要专业领域知识（医学/法律/金融等） */
  requiresExpertDomain?: boolean;
  /** 是否需要结构化输出（JSON Schema / 表格 / 严格格式） */
  structuredOutput?: boolean;
  /** 是否需要超长输出（完整报告、多章节文档） */
  longOutput?: boolean;
  /** 是否跨多个 AI App 模块（Research + Writing 等） */
  crossModule?: boolean;
}

/**
 * 复杂度分析结果
 */
export interface TaskComplexity {
  /** 复杂度档位 */
  level: ComplexityLevel;
  /** 综合评分（0-15） */
  score: number;
  /** 各维度得分明细 */
  signals: ComplexitySignals;
  /** 推荐的 TaskProfile */
  recommendedProfile: TaskProfile;
}

interface ComplexitySignals {
  /** 输入规模得分 (0-4) */
  inputScale: number;
  /** 工具复杂度得分 (0-3) */
  toolComplexity: number;
  /** 协作复杂度得分 (0-3) */
  agentComplexity: number;
  /** 领域深度得分 (0-2) */
  domainDepth: number;
  /** 输出结构得分 (0-2) */
  outputComplexity: number;
  /** 跨模块得分 (0-1) */
  crossModuleScore: number;
}

// ─────────────────────────────────────────────────────────
// Internal constants
// ─────────────────────────────────────────────────────────

/** 复杂度档位阈值（score <= threshold → level） */
const LEVEL_THRESHOLDS: Array<[ComplexityLevel, number]> = [
  ["minimal", 2],
  ["simple", 5],
  ["medium", 8],
  ["complex", 11],
  ["extreme", 15],
];

/** 档位 → TaskProfile 映射 */
const LEVEL_TO_PROFILE: Record<
  ComplexityLevel,
  { creativity: CreativityLevel; outputLength: OutputLengthLevel }
> = {
  minimal: { creativity: "deterministic", outputLength: "minimal" },
  simple: { creativity: "low", outputLength: "short" },
  medium: { creativity: "medium", outputLength: "medium" },
  complex: { creativity: "medium", outputLength: "long" },
  extreme: { creativity: "high", outputLength: "extended" },
};

// ─────────────────────────────────────────────────────────
// Service
// ─────────────────────────────────────────────────────────

@Injectable()
export class ComplexityAnalyzerService {
  /**
   * 分析任务复杂度
   */
  analyze(task: TaskDescriptor): TaskComplexity {
    const signals = this.scoreSignals(task);
    const score = this.sumScore(signals);
    const level = this.mapScoreToLevel(score);
    const recommendedProfile: TaskProfile = LEVEL_TO_PROFILE[level];

    return { level, score, signals, recommendedProfile };
  }

  /**
   * 快捷方法：直接返回推荐的 TaskProfile
   */
  getRecommendedProfile(task: TaskDescriptor): TaskProfile {
    return this.analyze(task).recommendedProfile;
  }

  // ─── private ───────────────────────────────────────────

  private scoreSignals(task: TaskDescriptor): ComplexitySignals {
    return {
      inputScale: this.scoreInput(task.input),
      toolComplexity: this.scoreTools(task.toolCount ?? 0),
      agentComplexity: this.scoreAgents(task.agentCount ?? 1),
      domainDepth: task.requiresExpertDomain ? 2 : 0,
      outputComplexity: this.scoreOutput(task),
      crossModuleScore: task.crossModule ? 1 : 0,
    };
  }

  private sumScore(signals: ComplexitySignals): number {
    return Object.values(signals).reduce((a, b) => a + b, 0);
  }

  private mapScoreToLevel(score: number): ComplexityLevel {
    for (const [level, threshold] of LEVEL_THRESHOLDS) {
      if (score <= threshold) return level;
    }
    return "extreme";
  }

  /**
   * 输入规模评分 (0-4)
   * 基于预估 token 数：
   *   <500      → 0
   *   500-2000  → 1
   *   2000-8000 → 2
   *   8000-25k  → 3
   *   >25k      → 4
   */
  private scoreInput(text: string): number {
    const tokens = this.estimateTokens(text);
    if (tokens < 500) return 0;
    if (tokens < 2000) return 1;
    if (tokens < 8000) return 2;
    if (tokens < 25000) return 3;
    return 4;
  }

  /**
   * 工具复杂度评分 (0-3)
   *   0 tools  → 0
   *   1-2      → 1
   *   3-5      → 2
   *   6+       → 3
   */
  private scoreTools(toolCount: number): number {
    if (toolCount === 0) return 0;
    if (toolCount <= 2) return 1;
    if (toolCount <= 5) return 2;
    return 3;
  }

  /**
   * Agent 协作复杂度评分 (0-3)
   *   1 agent  → 0
   *   2-3      → 1
   *   4-6      → 2
   *   7+       → 3
   */
  private scoreAgents(agentCount: number): number {
    if (agentCount <= 1) return 0;
    if (agentCount <= 3) return 1;
    if (agentCount <= 6) return 2;
    return 3;
  }

  /**
   * 输出结构复杂度评分 (0-2)
   */
  private scoreOutput(task: TaskDescriptor): number {
    let score = 0;
    if (task.structuredOutput) score += 1;
    if (task.longOutput) score += 1;
    return score;
  }

  /**
   * 预估 token 数
   *
   * 使用两种算法取最大值，防止无空格长文本（如代码、URL）被低估：
   *   wordBased: words × 1.3 + Chinese chars（词粒度）
   *   charBased: chars ÷ 4（字符粒度兜底，1 token ≈ 4 chars）
   */
  private estimateTokens(text: string): number {
    const words = text.split(/\s+/).filter((w) => w.length > 0);
    const chineseChars = (text.match(/[\u4e00-\u9fa5]/g) ?? []).length;
    const wordBased = Math.ceil(words.length * 1.3 + chineseChars);
    const charBased = Math.ceil(text.length / 4);
    return Math.max(wordBased, charBased);
  }
}
