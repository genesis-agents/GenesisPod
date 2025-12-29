/**
 * Slides Engine v3.0 - Architect Service
 *
 * 架构师角色：负责任务分解、大纲规划、质量审核
 * 使用 CHAT 模型 + QUALITY_FIRST 策略
 */

import { Injectable, Logger } from "@nestjs/common";
import {
  TaskDecompositionSkill,
  TaskDecompositionInput,
} from "../skills/task-decomposition.skill";
import {
  OutlinePlanningSkill,
  OutlinePlanningInput,
} from "../skills/outline-planning.skill";
import {
  TaskDecomposition,
  OutlinePlan,
  PageState,
  QualityReport,
  QualityIssue,
} from "../checkpoint/checkpoint.types";
import {
  MultiModelService,
  RoleCallInput,
} from "../orchestrator/multi-model.service";

/**
 * 质量审核输入
 */
export interface QualityReviewInput {
  pages: PageState[];
  outlinePlan: OutlinePlan;
  sessionId?: string;
}

/**
 * 质量审核系统提示词
 */
const QUALITY_REVIEW_SYSTEM_PROMPT = `你是一位专业的 PPT 质量审核专家，负责检查幻灯片的整体质量。

## 审核维度

1. **布局质量**：检查对齐、间距、比例是否合理
2. **内容完整性**：检查是否覆盖所有关键点
3. **图文匹配度**：检查图片与内容的语义相关性
4. **一致性**：检查风格、字体、颜色是否统一

## 输出格式

\`\`\`json
{
  "overall": "pass|warning|fail",
  "score": 85,
  "issues": [
    {
      "type": "layout|content|image|consistency",
      "severity": "error|warning|info",
      "pageNumber": 3,
      "description": "问题描述",
      "suggestion": "修复建议"
    }
  ],
  "suggestions": ["整体建议1", "整体建议2"]
}
\`\`\``;

@Injectable()
export class ArchitectService {
  private readonly logger = new Logger(ArchitectService.name);

  constructor(
    private readonly multiModel: MultiModelService,
    private readonly taskDecompositionSkill: TaskDecompositionSkill,
    private readonly outlinePlanningSkill: OutlinePlanningSkill,
  ) {}

  /**
   * 执行任务分解
   */
  async decomposeTask(
    input: TaskDecompositionInput,
  ): Promise<TaskDecomposition> {
    this.logger.log("[decomposeTask] Starting task decomposition");
    return this.taskDecompositionSkill.execute(input);
  }

  /**
   * 执行大纲规划
   */
  async planOutline(input: OutlinePlanningInput): Promise<OutlinePlan> {
    this.logger.log("[planOutline] Starting outline planning");
    return this.outlinePlanningSkill.execute(input);
  }

  /**
   * 执行质量审核
   */
  async reviewQuality(input: QualityReviewInput): Promise<QualityReport> {
    this.logger.log(`[reviewQuality] Reviewing ${input.pages.length} pages`);

    const userMessage = this.buildReviewMessage(input);

    const roleCall: RoleCallInput = {
      role: "reviewer",
      messages: [
        { role: "system", content: QUALITY_REVIEW_SYSTEM_PROMPT },
        { role: "user", content: userMessage },
      ],
      maxTokens: 2048,
      temperature: 0.1,
      metadata: {
        sessionId: input.sessionId,
        phase: "quality_review",
      },
    };

    const result = await this.multiModel.callByRole(roleCall);

    if (!result.success || !result.content) {
      this.logger.error("[reviewQuality] AI call failed:", result.error);
      return this.createFallbackReport();
    }

    return this.parseQualityReport(result.content);
  }

  /**
   * 快速质量检查（本地规则）
   */
  quickQualityCheck(pages: PageState[]): QualityIssue[] {
    const issues: QualityIssue[] = [];

    for (const page of pages) {
      // 检查 HTML 是否存在
      if (!page.html) {
        issues.push({
          type: "content",
          severity: "error",
          pageNumber: page.pageNumber,
          description: "页面缺少 HTML 内容",
          suggestion: "重新生成该页面",
        });
        continue;
      }

      // 检查 HTML 长度
      if (page.html.length < 100) {
        issues.push({
          type: "content",
          severity: "warning",
          pageNumber: page.pageNumber,
          description: "HTML 内容过短，可能内容不完整",
          suggestion: "检查页面内容是否完整",
        });
      }

      // 检查是否包含画布尺寸
      if (!page.html.includes("1280") || !page.html.includes("720")) {
        issues.push({
          type: "layout",
          severity: "warning",
          pageNumber: page.pageNumber,
          description: "画布尺寸可能不正确",
          suggestion: "确保画布为 1280x720",
        });
      }

      // 检查错误状态
      if (page.status === "error") {
        issues.push({
          type: "content",
          severity: "error",
          pageNumber: page.pageNumber,
          description: page.error || "页面生成失败",
          suggestion: "重新生成该页面",
        });
      }
    }

    return issues;
  }

  /**
   * 构建审核消息
   */
  private buildReviewMessage(input: QualityReviewInput): string {
    const { pages, outlinePlan } = input;

    const pagesSummary = pages.map((page) => ({
      pageNumber: page.pageNumber,
      title: page.outline.title,
      templateType: page.outline.templateType,
      status: page.status,
      hasHtml: !!page.html,
      htmlLength: page.html?.length || 0,
      hasImages: (page.images?.length || 0) > 0,
    }));

    return `## 大纲规划

${JSON.stringify(outlinePlan, null, 2)}

## 页面状态

${JSON.stringify(pagesSummary, null, 2)}

## 请求

请审核以上 PPT 的整体质量，输出审核报告（JSON 格式）。`;
  }

  /**
   * 解析质量报告
   */
  private parseQualityReport(content: string): QualityReport {
    const jsonMatch = content.match(/```json\s*([\s\S]*?)\s*```/);
    const jsonStr = jsonMatch ? jsonMatch[1] : content;

    try {
      const parsed = JSON.parse(jsonStr);
      return this.normalizeQualityReport(parsed);
    } catch {
      return this.createFallbackReport();
    }
  }

  /**
   * 规范化质量报告
   */
  private normalizeQualityReport(
    parsed: Record<string, unknown>,
  ): QualityReport {
    return {
      overall: (parsed.overall as QualityReport["overall"]) || "pass",
      score: typeof parsed.score === "number" ? parsed.score : 80,
      issues: Array.isArray(parsed.issues)
        ? parsed.issues.map((issue: Record<string, unknown>) => ({
            type: (issue.type as QualityIssue["type"]) || "content",
            severity: (issue.severity as QualityIssue["severity"]) || "info",
            pageNumber:
              typeof issue.pageNumber === "number"
                ? issue.pageNumber
                : undefined,
            description: String(issue.description || ""),
            suggestion: issue.suggestion ? String(issue.suggestion) : undefined,
          }))
        : [],
      suggestions: Array.isArray(parsed.suggestions)
        ? parsed.suggestions.map(String)
        : [],
      checkedAt: new Date(),
    };
  }

  /**
   * 创建降级报告
   */
  private createFallbackReport(): QualityReport {
    return {
      overall: "warning",
      score: 70,
      issues: [
        {
          type: "content",
          severity: "warning",
          description: "无法完成完整的质量审核",
          suggestion: "请手动检查 PPT 内容",
        },
      ],
      suggestions: ["建议手动检查每页内容的完整性"],
      checkedAt: new Date(),
    };
  }
}
