/**
 * Slides Engine v3.0 - Transition Checker Skill
 *
 * 过渡检查技能 (Layer 5)：检查页面之间的过渡质量
 * 确保演示文稿的叙事流畅性
 */

import { Injectable, Logger } from "@nestjs/common";
import {
  MultiModelService,
  RoleCallInput,
} from "../orchestrator/multi-model.service";
import { PageState, PageTemplateType } from "../checkpoint/checkpoint.types";

/**
 * 过渡质量
 */
export type TransitionQuality = "smooth" | "acceptable" | "abrupt";

/**
 * 过渡分析
 */
export interface TransitionAnalysis {
  /** 起始页 */
  fromPage: number;
  /** 目标页 */
  toPage: number;
  /** 过渡质量 */
  quality: TransitionQuality;
  /** 问题描述 (如果有) */
  issue?: string;
  /** 改进建议 (如果有) */
  suggestion?: string;
}

/**
 * 过渡检查结果
 */
export interface TransitionCheckResult {
  /** 所有过渡分析 */
  transitions: TransitionAnalysis[];
  /** 问题过渡数量 */
  issueCount: number;
  /** 总体评分 (0-100) */
  overallScore: number;
  /** 检查时间 */
  checkedAt: Date;
}

/**
 * 模板过渡兼容性矩阵
 */
const TEMPLATE_TRANSITIONS: Record<
  PageTemplateType,
  { goodAfter: PageTemplateType[]; badAfter: PageTemplateType[] }
> = {
  cover: {
    goodAfter: [], // 封面通常是第一页
    badAfter: ["recommendations", "riskOpportunity"],
  },
  toc: {
    goodAfter: ["cover"],
    badAfter: ["recommendations", "dashboard"],
  },
  questions: {
    goodAfter: ["toc", "cover", "framework"],
    badAfter: ["recommendations"],
  },
  pillars: {
    goodAfter: ["questions", "framework", "toc"],
    badAfter: ["cover"],
  },
  framework: {
    goodAfter: ["toc", "cover", "pillars"],
    badAfter: ["recommendations"],
  },
  timeline: {
    goodAfter: ["framework", "pillars", "questions"],
    badAfter: ["cover", "toc"],
  },
  evolutionRoadmap: {
    goodAfter: ["timeline", "framework"],
    badAfter: ["cover", "toc"],
  },
  dashboard: {
    goodAfter: ["framework", "pillars", "timeline"],
    badAfter: ["cover", "toc", "recommendations"],
  },
  comparison: {
    goodAfter: ["dashboard", "pillars", "caseStudy"],
    badAfter: ["cover", "toc"],
  },
  splitLayout: {
    goodAfter: ["pillars", "framework", "dashboard"],
    badAfter: ["cover"],
  },
  caseStudy: {
    goodAfter: ["pillars", "framework", "comparison"],
    badAfter: ["cover", "toc"],
  },
  multiColumn: {
    goodAfter: ["pillars", "framework"],
    badAfter: ["cover"],
  },
  recommendations: {
    goodAfter: ["dashboard", "comparison", "caseStudy", "riskOpportunity"],
    badAfter: ["cover", "toc", "questions"],
  },
  maturityModel: {
    goodAfter: ["framework", "timeline"],
    badAfter: ["cover", "recommendations"],
  },
  riskOpportunity: {
    goodAfter: ["dashboard", "comparison", "caseStudy"],
    badAfter: ["cover", "toc"],
  },
};

/**
 * 过渡检查系统提示词
 */
const TRANSITION_CHECK_SYSTEM_PROMPT = `你是一位专业的演示文稿叙事专家，负责检查页面之间的过渡质量。

## 任务

分析相邻页面之间的过渡，评估叙事流畅性。

## 评估标准

1. **内容连贯性**：前后页内容是否有逻辑关联
2. **主题过渡**：主题切换是否自然
3. **信息密度**：密度变化是否合理
4. **视觉节奏**：模板类型切换是否和谐

## 过渡质量评级

- **smooth (流畅)**：内容自然衔接，逻辑清晰
- **acceptable (可接受)**：有一定过渡，但可以改进
- **abrupt (突兀)**：内容跳跃，缺乏过渡

## 输出格式

\`\`\`json
{
  "transitions": [
    {
      "fromPage": 1,
      "toPage": 2,
      "quality": "smooth|acceptable|abrupt",
      "issue": "问题描述（如果有）",
      "suggestion": "改进建议（如果有）"
    }
  ],
  "overallScore": 85
}
\`\`\``;

@Injectable()
export class TransitionCheckerSkill {
  private readonly logger = new Logger(TransitionCheckerSkill.name);

  constructor(private readonly multiModel: MultiModelService) {}

  /**
   * 执行过渡检查
   */
  async check(
    pages: PageState[],
    sessionId?: string,
  ): Promise<TransitionCheckResult> {
    this.logger.log(
      `[check] Checking transitions across ${pages.length} pages`,
    );

    if (pages.length < 2) {
      return {
        transitions: [],
        issueCount: 0,
        overallScore: 100,
        checkedAt: new Date(),
      };
    }

    // 首先使用规则引擎快速检测
    const ruleBasedTransitions = this.checkWithRules(pages);
    const ruleBasedIssues = ruleBasedTransitions.filter(
      (t) => t.quality !== "smooth",
    );

    // 如果规则检测到问题或页面较多，使用 AI 深度分析
    if (ruleBasedIssues.length > 2 || pages.length > 8) {
      return this.checkWithAI(pages, ruleBasedTransitions, sessionId);
    }

    // 否则返回规则检测结果
    return {
      transitions: ruleBasedTransitions,
      issueCount: ruleBasedIssues.length,
      overallScore: this.calculateScore(ruleBasedTransitions),
      checkedAt: new Date(),
    };
  }

  /**
   * 使用规则引擎检测
   */
  private checkWithRules(pages: PageState[]): TransitionAnalysis[] {
    const transitions: TransitionAnalysis[] = [];

    for (let i = 0; i < pages.length - 1; i++) {
      const fromPage = pages[i];
      const toPage = pages[i + 1];

      const analysis = this.analyzeTransition(fromPage, toPage);
      transitions.push(analysis);
    }

    return transitions;
  }

  /**
   * 分析单个过渡
   */
  private analyzeTransition(
    fromPage: PageState,
    toPage: PageState,
  ): TransitionAnalysis {
    const fromType = fromPage.outline.templateType;
    const toType = toPage.outline.templateType;

    const transitionRules = TEMPLATE_TRANSITIONS[toType];

    // 检查模板兼容性
    if (transitionRules.badAfter.includes(fromType)) {
      return {
        fromPage: fromPage.pageNumber,
        toPage: toPage.pageNumber,
        quality: "abrupt",
        issue: `${this.getTemplateNameCN(toType)}不适合放在${this.getTemplateNameCN(fromType)}之后`,
        suggestion: `考虑在中间添加过渡页，或调整页面顺序`,
      };
    }

    if (transitionRules.goodAfter.includes(fromType)) {
      return {
        fromPage: fromPage.pageNumber,
        toPage: toPage.pageNumber,
        quality: "smooth",
      };
    }

    // 检查内容连贯性
    const contentContinuity = this.checkContentContinuity(fromPage, toPage);

    if (contentContinuity < 0.3) {
      return {
        fromPage: fromPage.pageNumber,
        toPage: toPage.pageNumber,
        quality: "abrupt",
        issue: "页面内容跳跃较大，缺乏逻辑过渡",
        suggestion: "考虑添加过渡语句或调整内容顺序",
      };
    }

    if (contentContinuity < 0.6) {
      return {
        fromPage: fromPage.pageNumber,
        toPage: toPage.pageNumber,
        quality: "acceptable",
        issue: "页面过渡可以更加自然",
        suggestion: "可以在前一页添加引导语或在后一页添加承接语",
      };
    }

    return {
      fromPage: fromPage.pageNumber,
      toPage: toPage.pageNumber,
      quality: "smooth",
    };
  }

  /**
   * 检查内容连贯性
   */
  private checkContentContinuity(
    fromPage: PageState,
    toPage: PageState,
  ): number {
    const fromKeywords = this.extractKeywords(fromPage);
    const toKeywords = this.extractKeywords(toPage);

    if (fromKeywords.length === 0 || toKeywords.length === 0) {
      return 0.5; // 默认中等
    }

    // 计算关键词重叠度
    const intersection = fromKeywords.filter((k) =>
      toKeywords.some((tk) => tk.includes(k) || k.includes(tk)),
    );

    const overlapRatio =
      (intersection.length * 2) / (fromKeywords.length + toKeywords.length);

    return Math.min(1, overlapRatio + 0.3); // 加上基础分
  }

  /**
   * 提取关键词
   */
  private extractKeywords(page: PageState): string[] {
    const keywords: string[] = [];

    if (page.outline) {
      keywords.push(...page.outline.keyElements);
    }

    if (page.content) {
      // 从标题提取
      const titleWords = page.content.title.split(/[，,、\s]+/);
      keywords.push(...titleWords.filter((w) => w.length >= 2));
    }

    return keywords;
  }

  /**
   * 使用 AI 进行深度检查
   */
  private async checkWithAI(
    pages: PageState[],
    ruleBasedTransitions: TransitionAnalysis[],
    sessionId?: string,
  ): Promise<TransitionCheckResult> {
    const pageSummaries = pages
      .map(
        (p) =>
          `[第${p.pageNumber}页 - ${p.outline.templateType}] ${p.content?.title || p.outline.title}\n关键元素: ${p.outline.keyElements.slice(0, 3).join(", ")}`,
      )
      .join("\n\n");

    const userMessage = `## 页面序列

${pageSummaries}

## 规则检测结果

${ruleBasedTransitions.map((t) => `- 第${t.fromPage}→${t.toPage}页: ${t.quality}${t.issue ? ` (${t.issue})` : ""}`).join("\n")}

## 请求

请深度分析页面过渡质量，输出完整的检查报告（JSON 格式）。`;

    const roleCall: RoleCallInput = {
      role: "reviewer",
      messages: [
        { role: "system", content: TRANSITION_CHECK_SYSTEM_PROMPT },
        { role: "user", content: userMessage },
      ],
      maxTokens: 4096,
      temperature: 0.1,
      metadata: {
        sessionId,
        phase: "transition_check",
      },
    };

    const result = await this.multiModel.callByRole(roleCall);

    if (!result.success || !result.content) {
      this.logger.error("[checkWithAI] AI call failed:", result.error);
      return {
        transitions: ruleBasedTransitions,
        issueCount: ruleBasedTransitions.filter((t) => t.quality !== "smooth")
          .length,
        overallScore: this.calculateScore(ruleBasedTransitions),
        checkedAt: new Date(),
      };
    }

    return this.parseResponse(result.content, ruleBasedTransitions);
  }

  /**
   * 解析 AI 响应
   */
  private parseResponse(
    content: string,
    fallbackTransitions: TransitionAnalysis[],
  ): TransitionCheckResult {
    const jsonMatch = content.match(/```json\s*([\s\S]*?)\s*```/);
    const jsonStr = jsonMatch ? jsonMatch[1] : content;

    try {
      const parsed = JSON.parse(jsonStr);

      const transitions: TransitionAnalysis[] = Array.isArray(
        parsed.transitions,
      )
        ? parsed.transitions.map((t: Record<string, unknown>) => ({
            fromPage: typeof t.fromPage === "number" ? t.fromPage : 1,
            toPage: typeof t.toPage === "number" ? t.toPage : 2,
            quality: this.validateQuality(t.quality),
            issue: t.issue ? String(t.issue) : undefined,
            suggestion: t.suggestion ? String(t.suggestion) : undefined,
          }))
        : fallbackTransitions;

      const issueCount = transitions.filter(
        (t) => t.quality !== "smooth",
      ).length;

      const overallScore =
        typeof parsed.overallScore === "number"
          ? parsed.overallScore
          : this.calculateScore(transitions);

      return {
        transitions,
        issueCount,
        overallScore,
        checkedAt: new Date(),
      };
    } catch (error) {
      this.logger.error("[parseResponse] JSON parse error:", error);
      return {
        transitions: fallbackTransitions,
        issueCount: fallbackTransitions.filter((t) => t.quality !== "smooth")
          .length,
        overallScore: this.calculateScore(fallbackTransitions),
        checkedAt: new Date(),
      };
    }
  }

  /**
   * 验证过渡质量
   */
  private validateQuality(quality: unknown): TransitionQuality {
    const validQualities: TransitionQuality[] = [
      "smooth",
      "acceptable",
      "abrupt",
    ];
    const qualityStr = String(quality).toLowerCase();
    return validQualities.includes(qualityStr as TransitionQuality)
      ? (qualityStr as TransitionQuality)
      : "acceptable";
  }

  /**
   * 计算总体评分
   */
  private calculateScore(transitions: TransitionAnalysis[]): number {
    if (transitions.length === 0) return 100;

    let totalScore = 0;
    for (const t of transitions) {
      switch (t.quality) {
        case "smooth":
          totalScore += 100;
          break;
        case "acceptable":
          totalScore += 70;
          break;
        case "abrupt":
          totalScore += 30;
          break;
      }
    }

    return Math.round(totalScore / transitions.length);
  }

  /**
   * 获取模板中文名称
   */
  private getTemplateNameCN(type: PageTemplateType): string {
    const names: Record<PageTemplateType, string> = {
      cover: "封面页",
      toc: "目录页",
      questions: "问题页",
      pillars: "支柱页",
      framework: "框架页",
      timeline: "时间线页",
      evolutionRoadmap: "演进路线图",
      dashboard: "仪表盘页",
      comparison: "对比页",
      splitLayout: "分栏布局",
      caseStudy: "案例页",
      multiColumn: "多列布局",
      recommendations: "建议页",
      maturityModel: "成熟度模型",
      riskOpportunity: "风险机遇页",
    };
    return names[type] || type;
  }
}
