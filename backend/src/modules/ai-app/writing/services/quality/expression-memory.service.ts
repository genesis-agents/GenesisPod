/**
 * ExpressionMemoryService - 表达记忆服务
 *
 * 核心职责：
 * - 追踪项目中已使用的表达（成语、比喻、描写手法等）
 * - 实现冷却期机制，防止表达重复使用
 * - 为 Writer Agent 提供「禁用表达」列表
 * - 分析内容，自动提取并记录新表达
 */

import { Injectable, Logger } from "@nestjs/common";
import { PrismaService } from "../../../../../common/prisma/prisma.service";

// 表达类型（与 Prisma schema 同步）
export type ExpressionType =
  | "IDIOM"
  | "METAPHOR"
  | "DESCRIPTION"
  | "EMOTION"
  | "ACTION"
  | "DIALOGUE"
  | "TRANSITION"
  | "PLOT_PATTERN";

// ==================== 常量配置 ====================

/**
 * 表达冷却配置
 */
const EXPRESSION_COOLDOWN_CONFIG = {
  /** 默认冷却章节数（表达需要间隔多少章才能再用） */
  defaultCooldownChapters: 10,
  /** 高频表达冷却章节数（使用超过3次的表达） */
  highFrequencyCooldownChapters: 20,
  /** 成语冷却章节数 */
  idiomCooldownChapters: 15,
  /** 情感表达冷却章节数 */
  emotionCooldownChapters: 8,
  /** 过渡语冷却章节数 */
  transitionCooldownChapters: 5,
  /** 每章目标字数（用于估算冷却时间） */
  chapterWordCount: 3000,
} as const;

/**
 * 常见重复表达模式 - 用于检测
 */
const COMMON_EXPRESSION_PATTERNS: Array<{
  pattern: RegExp;
  type: ExpressionType;
  category?: string;
}> = [
  // 情感震惊类
  { pattern: /心中一震/g, type: "EMOTION", category: "震惊" },
  { pattern: /心头一紧/g, type: "EMOTION", category: "紧张" },
  { pattern: /心中一动/g, type: "EMOTION", category: "触动" },
  { pattern: /心中一凛/g, type: "EMOTION", category: "警惕" },
  { pattern: /心下一沉/g, type: "EMOTION", category: "沮丧" },
  { pattern: /心中暗喜/g, type: "EMOTION", category: "喜悦" },
  { pattern: /心中暗道/g, type: "EMOTION", category: "思考" },
  { pattern: /暗自思忖/g, type: "EMOTION", category: "思考" },
  { pattern: /不由得/g, type: "EMOTION", category: "自然反应" },
  { pattern: /不禁/g, type: "EMOTION", category: "自然反应" },

  // 动作描写类
  { pattern: /微微一笑/g, type: "ACTION", category: "微笑" },
  { pattern: /嘴角微扬/g, type: "ACTION", category: "微笑" },
  { pattern: /轻声道/g, type: "ACTION", category: "说话" },
  { pattern: /淡淡道/g, type: "ACTION", category: "说话" },
  { pattern: /缓缓道/g, type: "ACTION", category: "说话" },
  { pattern: /冷冷道/g, type: "ACTION", category: "说话" },
  { pattern: /眉头微皱/g, type: "ACTION", category: "表情" },
  { pattern: /眉头一蹙/g, type: "ACTION", category: "表情" },
  { pattern: /目光一闪/g, type: "ACTION", category: "眼神" },
  { pattern: /眼中闪过/g, type: "ACTION", category: "眼神" },

  // 过渡语类
  { pattern: /话说/g, type: "TRANSITION", category: "开场" },
  { pattern: /却说/g, type: "TRANSITION", category: "转场" },
  { pattern: /且说/g, type: "TRANSITION", category: "转场" },
  { pattern: /正当此时/g, type: "TRANSITION", category: "时间" },
  { pattern: /就在这时/g, type: "TRANSITION", category: "时间" },
  { pattern: /与此同时/g, type: "TRANSITION", category: "时间" },
  { pattern: /不多时/g, type: "TRANSITION", category: "时间" },
  { pattern: /片刻之后/g, type: "TRANSITION", category: "时间" },

  // 描写类
  { pattern: /一袭[^，。,\.]{2,6}/g, type: "DESCRIPTION", category: "服饰" },
  { pattern: /身着[^，。,\.]{2,8}/g, type: "DESCRIPTION", category: "服饰" },
  { pattern: /面如[^，。,\.]{2,4}/g, type: "DESCRIPTION", category: "外貌" },
  { pattern: /眉如[^，。,\.]{2,4}/g, type: "DESCRIPTION", category: "外貌" },
  { pattern: /肤若[^，。,\.]{2,4}/g, type: "DESCRIPTION", category: "外貌" },
];

// ==================== 类型定义 ====================

export interface ExpressionRecord {
  expression: string;
  type: ExpressionType;
  category?: string;
  useCount: number;
  lastChapterId?: string;
  isCoolingDown: boolean;
  cooldownUntil?: Date;
}

export interface CoolingExpression {
  expression: string;
  type: ExpressionType;
  useCount: number;
  remainingCooldown: number; // 剩余冷却章节数
}

export interface ExpressionAnalysisResult {
  /** 新发现的表达 */
  newExpressions: Array<{
    expression: string;
    type: ExpressionType;
    category?: string;
  }>;
  /** 重复使用的表达（违反冷却期） */
  violatedExpressions: Array<{ expression: string; useCount: number }>;
  /** 高频表达警告 */
  highFrequencyWarnings: Array<{ expression: string; useCount: number }>;
}

// ==================== 服务实现 ====================

@Injectable()
export class ExpressionMemoryService {
  private readonly logger = new Logger(ExpressionMemoryService.name);

  constructor(private readonly prisma: PrismaService) {}

  // ==================== 核心查询方法 ====================

  /**
   * 获取当前处于冷却期的表达列表
   *
   * Writer Agent 在写作前调用此方法获取禁用列表
   */
  async getCoolingExpressions(
    projectId: string,
    currentChapterNumber: number,
  ): Promise<CoolingExpression[]> {
    const expressions = await this.prisma.writingExpressionMemory.findMany({
      where: {
        projectId,
        isCoolingDown: true,
      },
      orderBy: { useCount: "desc" },
    });

    return expressions.map((expr) => ({
      expression: expr.expression,
      type: expr.expressionType,
      useCount: expr.useCount,
      remainingCooldown: this.calculateRemainingCooldown(
        expr,
        currentChapterNumber,
      ),
    }));
  }

  /**
   * 获取高频表达列表（用于警告）
   */
  async getHighFrequencyExpressions(
    projectId: string,
    threshold: number = 5,
  ): Promise<ExpressionRecord[]> {
    const expressions = await this.prisma.writingExpressionMemory.findMany({
      where: {
        projectId,
        useCount: { gte: threshold },
      },
      orderBy: { useCount: "desc" },
      take: 50,
    });

    return expressions.map((expr) => ({
      expression: expr.expression,
      type: expr.expressionType,
      category: expr.category ?? undefined,
      useCount: expr.useCount,
      lastChapterId: expr.lastChapterId ?? undefined,
      isCoolingDown: expr.isCoolingDown,
      cooldownUntil: expr.cooldownUntil ?? undefined,
    }));
  }

  /**
   * 生成禁用表达提示词（供 Writer Agent 使用）
   */
  async generateAvoidancePrompt(
    projectId: string,
    currentChapterNumber: number,
  ): Promise<string> {
    const coolingExpressions = await this.getCoolingExpressions(
      projectId,
      currentChapterNumber,
    );
    const highFrequency = await this.getHighFrequencyExpressions(projectId, 3);

    if (coolingExpressions.length === 0 && highFrequency.length === 0) {
      return "";
    }

    const parts: string[] = [];

    if (coolingExpressions.length > 0) {
      const grouped = this.groupByType(coolingExpressions);
      parts.push("## 禁用表达（冷却期中，请使用替代表达）\n");

      for (const [type, exprs] of Object.entries(grouped)) {
        const typeLabel = this.getTypeLabel(type as ExpressionType);
        parts.push(`### ${typeLabel}`);
        parts.push(
          exprs
            .map((e) => `- ❌ "${e.expression}" (已用${e.useCount}次)`)
            .join("\n"),
        );
        parts.push("");
      }
    }

    if (highFrequency.length > 0) {
      parts.push("## 高频警告（尽量避免使用）");
      parts.push(
        highFrequency
          .slice(0, 20)
          .map((e) => `- ⚠️ "${e.expression}" (已用${e.useCount}次)`)
          .join("\n"),
      );
    }

    return parts.join("\n");
  }

  // ==================== 内容分析方法 ====================

  /**
   * 分析章节内容，提取并记录表达
   *
   * 在章节写作完成后调用
   */
  async analyzeAndRecordExpressions(
    projectId: string,
    chapterId: string,
    chapterNumber: number,
    content: string,
  ): Promise<ExpressionAnalysisResult> {
    const result: ExpressionAnalysisResult = {
      newExpressions: [],
      violatedExpressions: [],
      highFrequencyWarnings: [],
    };

    // 1. 使用模式匹配检测表达
    const detectedExpressions = this.detectExpressions(content);

    // 2. 批量查询已有记录
    const existingRecords = await this.prisma.writingExpressionMemory.findMany({
      where: {
        projectId,
        expression: { in: detectedExpressions.map((e) => e.expression) },
      },
    });
    const existingMap = new Map(existingRecords.map((r) => [r.expression, r]));

    // 3. 处理每个检测到的表达
    for (const detected of detectedExpressions) {
      const existing = existingMap.get(detected.expression);

      if (existing) {
        // 已存在的表达：更新计数和冷却状态
        const newCount = existing.useCount + detected.count;

        // 检查是否违反冷却期
        if (existing.isCoolingDown) {
          result.violatedExpressions.push({
            expression: detected.expression,
            useCount: newCount,
          });
        }

        // 高频警告
        if (newCount >= 5) {
          result.highFrequencyWarnings.push({
            expression: detected.expression,
            useCount: newCount,
          });
        }

        // 更新记录
        await this.updateExpressionRecord(
          existing.id,
          chapterId,
          chapterNumber,
          detected.count,
        );
      } else {
        // 新表达：创建记录
        result.newExpressions.push({
          expression: detected.expression,
          type: detected.type,
          category: detected.category,
        });

        await this.createExpressionRecord(
          projectId,
          detected.expression,
          detected.type,
          detected.category,
          chapterId,
          chapterNumber,
        );
      }
    }

    this.logger.log(
      `[ExpressionMemory] Analyzed chapter ${chapterNumber}: ` +
        `${result.newExpressions.length} new, ` +
        `${result.violatedExpressions.length} violated, ` +
        `${result.highFrequencyWarnings.length} high-frequency`,
    );

    return result;
  }

  /**
   * 检测内容中的表达
   */
  private detectExpressions(
    content: string,
  ): Array<{
    expression: string;
    type: ExpressionType;
    category?: string;
    count: number;
  }> {
    const detected = new Map<
      string,
      {
        expression: string;
        type: ExpressionType;
        category?: string;
        count: number;
      }
    >();

    for (const pattern of COMMON_EXPRESSION_PATTERNS) {
      const matches = content.match(pattern.pattern);
      if (matches) {
        for (const match of matches) {
          const existing = detected.get(match);
          if (existing) {
            existing.count++;
          } else {
            detected.set(match, {
              expression: match,
              type: pattern.type,
              category: pattern.category,
              count: 1,
            });
          }
        }
      }
    }

    return Array.from(detected.values());
  }

  // ==================== 记录管理方法 ====================

  /**
   * 创建新的表达记录
   */
  private async createExpressionRecord(
    projectId: string,
    expression: string,
    type: ExpressionType,
    category: string | undefined,
    chapterId: string,
    chapterNumber: number,
  ): Promise<void> {
    const cooldownChapters = this.getCooldownChapters(type, 1);

    await this.prisma.writingExpressionMemory.create({
      data: {
        projectId,
        expression,
        expressionType: type,
        category,
        useCount: 1,
        lastUsedAt: new Date(),
        lastChapterId: chapterId,
        isCoolingDown: true,
        cooldownUntil: this.calculateCooldownEnd(
          chapterNumber,
          cooldownChapters,
        ),
      },
    });
  }

  /**
   * 更新已有表达记录
   */
  private async updateExpressionRecord(
    recordId: string,
    chapterId: string,
    chapterNumber: number,
    additionalCount: number,
  ): Promise<void> {
    const record = await this.prisma.writingExpressionMemory.findUnique({
      where: { id: recordId },
    });

    if (!record) return;

    const newCount = record.useCount + additionalCount;
    const cooldownChapters = this.getCooldownChapters(
      record.expressionType,
      newCount,
    );

    await this.prisma.writingExpressionMemory.update({
      where: { id: recordId },
      data: {
        useCount: newCount,
        lastUsedAt: new Date(),
        lastChapterId: chapterId,
        isCoolingDown: true,
        cooldownUntil: this.calculateCooldownEnd(
          chapterNumber,
          cooldownChapters,
        ),
      },
    });
  }

  /**
   * 更新冷却状态（定期调用或写作前调用）
   */
  async refreshCooldownStatus(
    projectId: string,
    _currentChapterNumber?: number,
  ): Promise<void> {
    // 获取所有冷却中的表达
    const coolingExpressions =
      await this.prisma.writingExpressionMemory.findMany({
        where: {
          projectId,
          isCoolingDown: true,
        },
      });

    const now = new Date();
    const updates: string[] = [];

    for (const expr of coolingExpressions) {
      // 检查是否应该解除冷却
      if (expr.cooldownUntil && expr.cooldownUntil <= now) {
        updates.push(expr.id);
      }
    }

    if (updates.length > 0) {
      await this.prisma.writingExpressionMemory.updateMany({
        where: { id: { in: updates } },
        data: { isCoolingDown: false },
      });

      this.logger.log(
        `[ExpressionMemory] Released ${updates.length} expressions from cooldown`,
      );
    }
  }

  // ==================== 辅助方法 ====================

  /**
   * 获取表达类型的冷却章节数
   */
  private getCooldownChapters(type: ExpressionType, useCount: number): number {
    let base: number;

    switch (type) {
      case "IDIOM":
        base = EXPRESSION_COOLDOWN_CONFIG.idiomCooldownChapters;
        break;
      case "EMOTION":
        base = EXPRESSION_COOLDOWN_CONFIG.emotionCooldownChapters;
        break;
      case "TRANSITION":
        base = EXPRESSION_COOLDOWN_CONFIG.transitionCooldownChapters;
        break;
      default:
        base = EXPRESSION_COOLDOWN_CONFIG.defaultCooldownChapters;
    }

    // 高频使用的表达需要更长冷却期
    if (useCount >= 3) {
      base = Math.max(
        base,
        EXPRESSION_COOLDOWN_CONFIG.highFrequencyCooldownChapters,
      );
    }

    return base;
  }

  /**
   * 计算冷却结束时间
   */
  private calculateCooldownEnd(
    _currentChapter: number,
    cooldownChapters: number,
  ): Date {
    // 估算每章写作时间（假设每章需要 1 小时）
    const hoursPerChapter = 1;
    const cooldownHours = cooldownChapters * hoursPerChapter;

    const cooldownEnd = new Date();
    cooldownEnd.setHours(cooldownEnd.getHours() + cooldownHours);

    return cooldownEnd;
  }

  /**
   * 计算剩余冷却章节数
   */
  private calculateRemainingCooldown(
    expr: {
      cooldownUntil: Date | null;
      useCount: number;
      expressionType: ExpressionType;
    },
    _currentChapterNumber: number,
  ): number {
    if (!expr.cooldownUntil) {
      return 0;
    }

    const now = new Date();
    const remainingMs = expr.cooldownUntil.getTime() - now.getTime();

    if (remainingMs <= 0) {
      return 0;
    }

    // 估算剩余章节数
    const hoursRemaining = remainingMs / (1000 * 60 * 60);
    return Math.ceil(hoursRemaining);
  }

  /**
   * 按类型分组表达
   */
  private groupByType(
    expressions: CoolingExpression[],
  ): Record<string, CoolingExpression[]> {
    const groups: Record<string, CoolingExpression[]> = {};

    for (const expr of expressions) {
      const type = expr.type;
      if (!groups[type]) {
        groups[type] = [];
      }
      groups[type].push(expr);
    }

    return groups;
  }

  /**
   * 获取表达类型的中文标签
   */
  private getTypeLabel(type: ExpressionType): string {
    const labels: Record<ExpressionType, string> = {
      IDIOM: "成语",
      METAPHOR: "比喻",
      DESCRIPTION: "描写手法",
      EMOTION: "情感表达",
      ACTION: "动作描写",
      DIALOGUE: "对话模式",
      TRANSITION: "过渡语",
      PLOT_PATTERN: "情节模式",
    };

    return labels[type] || type;
  }

  // ==================== 统计方法 ====================

  /**
   * 获取项目表达统计
   */
  async getProjectExpressionStats(projectId: string): Promise<{
    totalExpressions: number;
    coolingCount: number;
    highFrequencyCount: number;
    byType: Record<string, number>;
  }> {
    const [total, cooling, highFrequency, byType] = await Promise.all([
      this.prisma.writingExpressionMemory.count({ where: { projectId } }),
      this.prisma.writingExpressionMemory.count({
        where: { projectId, isCoolingDown: true },
      }),
      this.prisma.writingExpressionMemory.count({
        where: { projectId, useCount: { gte: 5 } },
      }),
      this.prisma.writingExpressionMemory.groupBy({
        by: ["expressionType"],
        where: { projectId },
        _count: true,
      }),
    ]);

    const typeStats: Record<string, number> = {};
    for (const item of byType) {
      typeStats[item.expressionType] = item._count;
    }

    return {
      totalExpressions: total,
      coolingCount: cooling,
      highFrequencyCount: highFrequency,
      byType: typeStats,
    };
  }
}
