/**
 * Slides Engine v3.0 - Rhythm Controller Skill
 *
 * 节奏控制技能 (Layer 2)：控制演示的信息密度节奏
 * 确保高密度数据页和低密度过渡页合理交替
 */

import { Injectable, Logger } from "@nestjs/common";
import {
  DensityLevel,
  NarrativePlan,
  PageOutline,
} from "../checkpoint/checkpoint.types";

/**
 * 节奏分析结果
 */
export interface RhythmAnalysis {
  /** 当前节奏模式 */
  currentPattern: DensityLevel[];
  /** 建议的节奏模式 */
  suggestedPattern: DensityLevel[];
  /** 问题点 */
  issues: RhythmIssue[];
  /** 节奏评分 (0-100) */
  score: number;
}

/**
 * 节奏问题
 */
export interface RhythmIssue {
  /** 起始页码 */
  startPage: number;
  /** 结束页码 */
  endPage: number;
  /** 问题类型 */
  type: "consecutive_high" | "no_rest" | "abrupt_change" | "monotonous";
  /** 问题描述 */
  description: string;
  /** 修复建议 */
  suggestion: string;
}

/**
 * 节奏控制输入
 */
export interface RhythmControllerInput {
  /** 叙事规划 */
  narrativePlan: NarrativePlan;
  /** 页面大纲列表 */
  pageOutlines: PageOutline[];
}

@Injectable()
export class RhythmControllerSkill {
  private readonly logger = new Logger(RhythmControllerSkill.name);

  // 节奏规则配置
  private readonly MAX_CONSECUTIVE_HIGH = 2;
  private readonly MIN_REST_INTERVAL = 4; // 每4页至少一个低密度页

  /**
   * 分析并优化节奏
   */
  analyze(input: RhythmControllerInput): RhythmAnalysis {
    const { narrativePlan, pageOutlines } = input;
    const currentPattern = narrativePlan.rhythmPattern;

    this.logger.log(
      `[analyze] Analyzing rhythm for ${pageOutlines.length} pages`,
    );

    const issues = this.detectIssues(currentPattern, pageOutlines);
    const suggestedPattern = this.optimizePattern(
      currentPattern,
      pageOutlines,
      issues,
    );
    const score = this.calculateScore(suggestedPattern, issues);

    this.logger.log(
      `[analyze] Rhythm analysis complete: score=${score}, issues=${issues.length}`,
    );

    return {
      currentPattern,
      suggestedPattern,
      issues,
      score,
    };
  }

  /**
   * 检测节奏问题
   */
  private detectIssues(
    pattern: DensityLevel[],
    pageOutlines: PageOutline[],
  ): RhythmIssue[] {
    const issues: RhythmIssue[] = [];

    // 检测连续高密度
    let consecutiveHigh = 0;
    let highStart = -1;

    for (let i = 0; i < pattern.length; i++) {
      if (pattern[i] === "high") {
        if (consecutiveHigh === 0) highStart = i;
        consecutiveHigh++;

        if (consecutiveHigh > this.MAX_CONSECUTIVE_HIGH) {
          issues.push({
            startPage: highStart + 1,
            endPage: i + 1,
            type: "consecutive_high",
            description: `连续 ${consecutiveHigh} 页高密度内容，可能导致信息过载`,
            suggestion: `在第 ${i + 1} 页后插入一个过渡页或总结页`,
          });
        }
      } else {
        consecutiveHigh = 0;
        highStart = -1;
      }
    }

    // 检测缺少休息页
    let lastLowPage = -1;
    for (let i = 0; i < pattern.length; i++) {
      if (pattern[i] === "low") {
        if (lastLowPage >= 0 && i - lastLowPage > this.MIN_REST_INTERVAL) {
          issues.push({
            startPage: lastLowPage + 1,
            endPage: i + 1,
            type: "no_rest",
            description: `第 ${lastLowPage + 1} 到 ${i + 1} 页之间没有低密度休息页`,
            suggestion: `建议在第 ${Math.floor((lastLowPage + i) / 2) + 1} 页降低信息密度`,
          });
        }
        lastLowPage = i;
      }
    }

    // 检测突变
    for (let i = 1; i < pattern.length; i++) {
      if (
        (pattern[i - 1] === "high" && pattern[i] === "low") ||
        (pattern[i - 1] === "low" && pattern[i] === "high")
      ) {
        // 检查是否是故意的过渡
        const pageOutline = pageOutlines[i];
        const isIntentionalTransition =
          pageOutline?.templateType === "framework" ||
          pageOutline?.templateType === "cover" ||
          pageOutline?.templateType === "recommendations";

        if (!isIntentionalTransition && i > 0 && i < pattern.length - 1) {
          // 检查周围模式
          const prevPrev = i > 1 ? pattern[i - 2] : pattern[i - 1];
          const nextNext =
            i < pattern.length - 2 ? pattern[i + 2] : pattern[i + 1];

          if (prevPrev === pattern[i - 1] && nextNext === pattern[i]) {
            issues.push({
              startPage: i,
              endPage: i + 1,
              type: "abrupt_change",
              description: `第 ${i} 到 ${i + 1} 页密度突变`,
              suggestion: `建议在中间添加过渡页或调整为 medium 密度`,
            });
          }
        }
      }
    }

    // 检测单调
    if (pattern.length > 6) {
      const uniqueLevels = new Set(pattern);
      if (uniqueLevels.size === 1) {
        issues.push({
          startPage: 1,
          endPage: pattern.length,
          type: "monotonous",
          description: `整个演示都是 ${pattern[0]} 密度，节奏单调`,
          suggestion: `建议在开头和结尾使用低密度，在核心内容使用高密度`,
        });
      }
    }

    return issues;
  }

  /**
   * 优化节奏模式
   */
  private optimizePattern(
    current: DensityLevel[],
    pageOutlines: PageOutline[],
    issues: RhythmIssue[],
  ): DensityLevel[] {
    const optimized = [...current];

    // 根据页面类型调整
    for (let i = 0; i < pageOutlines.length; i++) {
      const outline = pageOutlines[i];

      // 封面和结尾强制低密度
      if (outline.templateType === "cover" || i === pageOutlines.length - 1) {
        optimized[i] = "low";
      }

      // 数据仪表盘和对比页强制高密度
      if (
        outline.templateType === "dashboard" ||
        outline.templateType === "comparison"
      ) {
        optimized[i] = "high";
      }

      // 章节分隔页强制低密度
      if (
        outline.templateType === "framework" &&
        outline.title.includes("章")
      ) {
        optimized[i] = "low";
      }
    }

    // 修复连续高密度问题
    for (const issue of issues.filter((i) => i.type === "consecutive_high")) {
      const midPage = Math.floor((issue.startPage + issue.endPage) / 2) - 1;
      if (midPage >= 0 && midPage < optimized.length) {
        optimized[midPage] = "medium";
      }
    }

    // 确保开头和结尾是低密度
    if (optimized.length > 0) {
      optimized[0] = "low";
    }
    if (optimized.length > 1) {
      optimized[optimized.length - 1] = "low";
    }

    return optimized;
  }

  /**
   * 计算节奏评分
   */
  private calculateScore(
    pattern: DensityLevel[],
    issues: RhythmIssue[],
  ): number {
    let score = 100;

    // 每个问题扣分
    for (const issue of issues) {
      switch (issue.type) {
        case "consecutive_high":
          score -= 15;
          break;
        case "no_rest":
          score -= 10;
          break;
        case "abrupt_change":
          score -= 5;
          break;
        case "monotonous":
          score -= 20;
          break;
      }
    }

    // 检查是否有合理的节奏变化
    const transitions = this.countTransitions(pattern);
    const idealTransitions = Math.floor(pattern.length / 3);

    if (transitions < idealTransitions / 2) {
      score -= 10; // 变化太少
    } else if (transitions > idealTransitions * 2) {
      score -= 5; // 变化太多
    }

    return Math.max(0, Math.min(100, score));
  }

  /**
   * 统计密度变化次数
   */
  private countTransitions(pattern: DensityLevel[]): number {
    let count = 0;
    for (let i = 1; i < pattern.length; i++) {
      if (pattern[i] !== pattern[i - 1]) {
        count++;
      }
    }
    return count;
  }

  /**
   * 根据页面内容推断密度
   */
  inferDensityFromOutline(outline: PageOutline): DensityLevel {
    // 基于模板类型
    switch (outline.templateType) {
      case "cover":
      case "toc":
      case "framework":
        return "low";

      case "dashboard":
      case "comparison":
      case "timeline":
      case "evolutionRoadmap":
        return "high";

      case "pillars":
      case "multiColumn":
      case "caseStudy":
        return "medium";

      default:
        // 基于关键元素数量
        if (outline.keyElements.length >= 5) {
          return "high";
        } else if (outline.keyElements.length >= 3) {
          return "medium";
        }
        return "low";
    }
  }
}
