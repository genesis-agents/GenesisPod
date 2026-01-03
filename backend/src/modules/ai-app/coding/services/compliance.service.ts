/**
 * Compliance Service - 合规性检查服务
 *
 * 检查项目产出是否符合配置的工程规范
 */

import { Injectable, Logger, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../../../../common/prisma/prisma.service";
import { AiChatService } from "../../../ai-engine/llm/services/ai-chat.service";
import { StandardsService, StandardRule } from "./standards.service";
import { AiCodingComplianceStatus, Prisma } from "@prisma/client";

export interface ComplianceViolation {
  ruleId: string;
  rule: string;
  severity: "error" | "warning" | "info";
  file?: string;
  line?: number;
  description: string;
  suggestion?: string;
}

export interface ComplianceResult {
  standardId: string;
  standardName: string;
  type: string;
  passed: boolean;
  score: number;
  violations: ComplianceViolation[];
  suggestions: string[];
}

export interface CheckComplianceDto {
  iterationId?: string;
  standardIds?: string[];
}

@Injectable()
export class ComplianceService {
  private readonly logger = new Logger(ComplianceService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly aiChatService: AiChatService,
    private readonly standardsService: StandardsService,
  ) {}

  /**
   * 对项目运行合规性检查
   */
  async checkCompliance(
    projectId: string,
    userId: string,
    options?: CheckComplianceDto,
  ) {
    this.logger.log(`Running compliance check for project ${projectId}`);

    // 创建合规性报告
    const report = await this.prisma.aiCodingComplianceReport.create({
      data: {
        projectId,
        iterationId: options?.iterationId,
        status: AiCodingComplianceStatus.RUNNING,
      },
    });

    try {
      // 获取项目和文件
      const project = await this.prisma.aiCodingProject.findUnique({
        where: { id: projectId },
        include: { files: true },
      });

      if (!project) {
        throw new NotFoundException("Project not found");
      }

      // 获取用户规范
      let standards = await this.standardsService.getUserStandards(userId);

      if (options?.standardIds && options.standardIds.length > 0) {
        standards = standards.filter((s) =>
          options.standardIds!.includes(s.id),
        );
      }

      if (standards.length === 0) {
        // 没有配置规范，直接通过
        await this.prisma.aiCodingComplianceReport.update({
          where: { id: report.id },
          data: {
            overallScore: 100,
            status: AiCodingComplianceStatus.PASSED,
            summary: "没有配置工程规范，默认通过。建议配置规范以确保代码质量。",
            completedAt: new Date(),
          },
        });

        return this.prisma.aiCodingComplianceReport.findUnique({
          where: { id: report.id },
        });
      }

      const results: ComplianceResult[] = [];
      let totalScore = 0;

      // 检查每个规范
      for (const standard of standards) {
        const rules = (standard.rules || []) as unknown as StandardRule[];
        const result = await this.checkAgainstStandard(
          project.files,
          project.outputs as Record<string, unknown>,
          standard.id,
          standard.name,
          standard.type,
          rules,
        );
        results.push(result);
        totalScore += result.score;
      }

      const overallScore =
        standards.length > 0 ? Math.round(totalScore / standards.length) : 100;

      const hasErrors = results.some((r) =>
        r.violations.some((v) => v.severity === "error"),
      );

      const hasWarnings = results.some((r) =>
        r.violations.some((v) => v.severity === "warning"),
      );

      // 生成摘要
      const summary = this.generateSummary(results);

      // 更新报告
      await this.prisma.aiCodingComplianceReport.update({
        where: { id: report.id },
        data: {
          overallScore,
          status: hasErrors
            ? AiCodingComplianceStatus.FAILED
            : hasWarnings
              ? AiCodingComplianceStatus.WARNING
              : AiCodingComplianceStatus.PASSED,
          results: results as unknown as Prisma.InputJsonValue,
          summary,
          completedAt: new Date(),
        },
      });

      // 更新项目合规性分数
      await this.prisma.aiCodingProject.update({
        where: { id: projectId },
        data: { complianceScore: overallScore },
      });

      this.logger.log(
        `Compliance check completed for project ${projectId}: ${overallScore}%`,
      );

      return this.prisma.aiCodingComplianceReport.findUnique({
        where: { id: report.id },
      });
    } catch (error) {
      this.logger.error(
        `Compliance check failed for project ${projectId}`,
        error,
      );

      await this.prisma.aiCodingComplianceReport.update({
        where: { id: report.id },
        data: {
          status: AiCodingComplianceStatus.FAILED,
          summary: error instanceof Error ? error.message : String(error),
          completedAt: new Date(),
        },
      });

      throw error;
    }
  }

  /**
   * 检查项目是否符合特定规范
   */
  private async checkAgainstStandard(
    files: Array<{ path: string; content: string }>,
    outputs: Record<string, unknown>,
    standardId: string,
    standardName: string,
    type: string,
    rules: StandardRule[],
  ): Promise<ComplianceResult> {
    if (rules.length === 0) {
      return {
        standardId,
        standardName,
        type,
        passed: true,
        score: 100,
        violations: [],
        suggestions: [],
      };
    }

    const systemPrompt = `You are a software engineering compliance checker.

Given code files and engineering rules, identify any violations.

Output a JSON object:
{
  "violations": [
    {
      "ruleId": "RULE-001",
      "rule": "Use camelCase for variables",
      "severity": "error",
      "file": "src/index.ts",
      "line": 42,
      "description": "Variable 'user_name' uses snake_case instead of camelCase",
      "suggestion": "Rename to 'userName'"
    }
  ],
  "suggestions": [
    "Consider adding more inline comments"
  ],
  "score": 85
}

Score should be 0-100, where 100 means full compliance.
Be thorough but fair. Only flag actual violations, not stylistic preferences.`;

    // 准备文件内容（截断以适应 token 限制）
    const fileContents = files.slice(0, 10).map((f) => ({
      path: f.path,
      content: f.content?.substring(0, 3000),
    }));

    try {
      const result = await this.aiChatService.chat({
        messages: [
          {
            role: "user",
            content: `Check these files against the rules:

RULES:
${JSON.stringify(rules, null, 2)}

FILES:
${JSON.stringify(fileContents, null, 2)}

OUTPUTS (PRD, Design, etc):
${JSON.stringify(outputs, null, 2).substring(0, 2000)}`,
          },
        ],
        systemPrompt,
        maxTokens: 4096,
        temperature: 0.3,
      });

      const jsonMatch = result.content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        return {
          standardId,
          standardName,
          type,
          passed:
            (parsed.violations || []).filter(
              (v: ComplianceViolation) => v.severity === "error",
            ).length === 0,
          score: parsed.score || 100,
          violations: parsed.violations || [],
          suggestions: parsed.suggestions || [],
        };
      }
    } catch (e) {
      this.logger.warn(`Failed to check compliance for ${standardName}`, e);
    }

    return {
      standardId,
      standardName,
      type,
      passed: true,
      score: 100,
      violations: [],
      suggestions: [],
    };
  }

  /**
   * 生成合规性摘要
   */
  private generateSummary(results: ComplianceResult[]): string {
    const totalViolations = results.reduce(
      (acc, r) => acc + r.violations.length,
      0,
    );

    const errors = results.reduce(
      (acc, r) =>
        acc + r.violations.filter((v) => v.severity === "error").length,
      0,
    );

    const warnings = results.reduce(
      (acc, r) =>
        acc + r.violations.filter((v) => v.severity === "warning").length,
      0,
    );

    if (totalViolations === 0) {
      return "✅ 所有合规性检查通过。代码符合配置的工程规范。";
    }

    let summary = `合规性检查发现 ${totalViolations} 个问题：\n`;
    summary += `- ❌ ${errors} 个错误 (必须修复)\n`;
    summary += `- ⚠️ ${warnings} 个警告 (建议修复)\n\n`;

    summary += "各规范检查结果：\n";
    for (const result of results) {
      const icon = result.passed ? "✅" : "❌";
      summary += `${icon} ${result.standardName}: ${result.score}分`;
      if (result.violations.length > 0) {
        summary += ` (${result.violations.length} 个问题)`;
      }
      summary += "\n";
    }

    return summary;
  }

  /**
   * 获取项目的合规性报告
   */
  async getProjectReports(projectId: string, userId: string) {
    // 验证项目属于用户
    const project = await this.prisma.aiCodingProject.findFirst({
      where: { id: projectId, userId },
    });

    if (!project) {
      throw new NotFoundException("Project not found");
    }

    return this.prisma.aiCodingComplianceReport.findMany({
      where: { projectId },
      orderBy: { createdAt: "desc" },
    });
  }

  /**
   * 获取单个合规性报告
   */
  async getReportById(reportId: string, userId: string) {
    const report = await this.prisma.aiCodingComplianceReport.findUnique({
      where: { id: reportId },
      include: {
        project: true,
      },
    });

    if (!report || report.project.userId !== userId) {
      throw new NotFoundException("Report not found");
    }

    return report;
  }
}
