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
  | "PLOT_PATTERN"
  | "CHAPTER_OPENING" // 章节开场模式
  | "SCENE_STRUCTURE" // 场景结构模式
  | "NARRATIVE_PACING"; // 叙事节奏模式

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
  /** 章节开场模式冷却章节数（★新增：防止每章开场雷同） */
  chapterOpeningCooldownChapters: 25,
  /** 场景结构模式冷却章节数（★新增：防止场景安排重复） */
  sceneStructureCooldownChapters: 20,
  /** 叙事节奏模式冷却章节数（★新增：防止节奏单一） */
  narrativePacingCooldownChapters: 15,
  /** 每章目标字数（用于估算冷却时间） */
  chapterWordCount: 3000,
} as const;

/**
 * 常见重复表达模式 - 用于检测
 * 扩展版本：覆盖更多常见 AI 写作重复模式
 */
const COMMON_EXPRESSION_PATTERNS: Array<{
  pattern: RegExp;
  type: ExpressionType;
  category?: string;
}> = [
  // ==================== 情感震惊类 ====================
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
  { pattern: /心如刀绞/g, type: "EMOTION", category: "痛苦" },
  { pattern: /心乱如麻/g, type: "EMOTION", category: "困惑" },
  { pattern: /百感交集/g, type: "EMOTION", category: "复杂" },
  { pattern: /五味杂陈/g, type: "EMOTION", category: "复杂" },
  { pattern: /心头一热/g, type: "EMOTION", category: "感动" },
  { pattern: /心中一喜/g, type: "EMOTION", category: "喜悦" },
  { pattern: /暗自庆幸/g, type: "EMOTION", category: "庆幸" },
  { pattern: /心中一寒/g, type: "EMOTION", category: "恐惧" },
  { pattern: /心中一惊/g, type: "EMOTION", category: "惊讶" },
  { pattern: /若有所思/g, type: "EMOTION", category: "思考" },

  // ==================== 动作描写类 ====================
  { pattern: /微微一笑/g, type: "ACTION", category: "微笑" },
  { pattern: /嘴角微扬/g, type: "ACTION", category: "微笑" },
  { pattern: /嘴角上扬/g, type: "ACTION", category: "微笑" },
  { pattern: /淡然一笑/g, type: "ACTION", category: "微笑" },
  { pattern: /莞尔一笑/g, type: "ACTION", category: "微笑" },
  { pattern: /轻声道/g, type: "ACTION", category: "说话" },
  { pattern: /淡淡道/g, type: "ACTION", category: "说话" },
  { pattern: /缓缓道/g, type: "ACTION", category: "说话" },
  { pattern: /冷冷道/g, type: "ACTION", category: "说话" },
  { pattern: /沉声道/g, type: "ACTION", category: "说话" },
  { pattern: /低声道/g, type: "ACTION", category: "说话" },
  { pattern: /喃喃道/g, type: "ACTION", category: "说话" },
  { pattern: /厉声道/g, type: "ACTION", category: "说话" },
  { pattern: /眉头微皱/g, type: "ACTION", category: "表情" },
  { pattern: /眉头一蹙/g, type: "ACTION", category: "表情" },
  { pattern: /眉头紧锁/g, type: "ACTION", category: "表情" },
  { pattern: /眉头舒展/g, type: "ACTION", category: "表情" },
  { pattern: /目光一闪/g, type: "ACTION", category: "眼神" },
  { pattern: /眼中闪过/g, type: "ACTION", category: "眼神" },
  { pattern: /目光如炬/g, type: "ACTION", category: "眼神" },
  { pattern: /目光深邃/g, type: "ACTION", category: "眼神" },
  { pattern: /眼神一凝/g, type: "ACTION", category: "眼神" },
  { pattern: /微微颔首/g, type: "ACTION", category: "点头" },
  { pattern: /轻轻点头/g, type: "ACTION", category: "点头" },
  { pattern: /缓缓摇头/g, type: "ACTION", category: "摇头" },
  { pattern: /轻叹一声/g, type: "ACTION", category: "叹息" },
  { pattern: /长叹一声/g, type: "ACTION", category: "叹息" },
  { pattern: /轻轻叹息/g, type: "ACTION", category: "叹息" },

  // ==================== 过渡语类 ====================
  { pattern: /话说/g, type: "TRANSITION", category: "开场" },
  { pattern: /却说/g, type: "TRANSITION", category: "转场" },
  { pattern: /且说/g, type: "TRANSITION", category: "转场" },
  { pattern: /正当此时/g, type: "TRANSITION", category: "时间" },
  { pattern: /就在这时/g, type: "TRANSITION", category: "时间" },
  { pattern: /与此同时/g, type: "TRANSITION", category: "时间" },
  { pattern: /不多时/g, type: "TRANSITION", category: "时间" },
  { pattern: /片刻之后/g, type: "TRANSITION", category: "时间" },
  { pattern: /时光荏苒/g, type: "TRANSITION", category: "时间跨度" },
  { pattern: /岁月如梭/g, type: "TRANSITION", category: "时间跨度" },
  { pattern: /转眼之间/g, type: "TRANSITION", category: "时间" },
  { pattern: /不知不觉/g, type: "TRANSITION", category: "时间" },
  { pattern: /良久之后/g, type: "TRANSITION", category: "时间" },
  { pattern: /须臾之间/g, type: "TRANSITION", category: "时间" },

  // ==================== 环境描写类 ====================
  { pattern: /月光透过[^，。]{2,8}/g, type: "DESCRIPTION", category: "月光" },
  { pattern: /月色如水/g, type: "DESCRIPTION", category: "月光" },
  { pattern: /月华如练/g, type: "DESCRIPTION", category: "月光" },
  { pattern: /晨曦初露/g, type: "DESCRIPTION", category: "晨景" },
  { pattern: /晨光熹微/g, type: "DESCRIPTION", category: "晨景" },
  { pattern: /夕阳西下/g, type: "DESCRIPTION", category: "夕景" },
  { pattern: /夜色深沉/g, type: "DESCRIPTION", category: "夜景" },
  { pattern: /夜幕降临/g, type: "DESCRIPTION", category: "夜景" },
  { pattern: /烛光摇曳/g, type: "DESCRIPTION", category: "光线" },
  { pattern: /灯火阑珊/g, type: "DESCRIPTION", category: "光线" },
  { pattern: /金碧辉煌/g, type: "DESCRIPTION", category: "建筑" },
  { pattern: /雕梁画栋/g, type: "DESCRIPTION", category: "建筑" },
  { pattern: /亭台楼阁/g, type: "DESCRIPTION", category: "建筑" },
  { pattern: /气势恢宏/g, type: "DESCRIPTION", category: "气势" },
  { pattern: /庄严肃穆/g, type: "DESCRIPTION", category: "气氛" },

  // ==================== 人物外貌类 ====================
  { pattern: /一袭[^，。,\.]{2,6}/g, type: "DESCRIPTION", category: "服饰" },
  { pattern: /身着[^，。,\.]{2,8}/g, type: "DESCRIPTION", category: "服饰" },
  { pattern: /面如[^，。,\.]{2,4}/g, type: "DESCRIPTION", category: "外貌" },
  { pattern: /眉如[^，。,\.]{2,4}/g, type: "DESCRIPTION", category: "外貌" },
  { pattern: /肤若[^，。,\.]{2,4}/g, type: "DESCRIPTION", category: "外貌" },
  { pattern: /倾国倾城/g, type: "DESCRIPTION", category: "美貌" },
  { pattern: /国色天香/g, type: "DESCRIPTION", category: "美貌" },
  { pattern: /沉鱼落雁/g, type: "DESCRIPTION", category: "美貌" },
  { pattern: /闭月羞花/g, type: "DESCRIPTION", category: "美貌" },
  { pattern: /仪表堂堂/g, type: "DESCRIPTION", category: "外貌" },
  { pattern: /气宇轩昂/g, type: "DESCRIPTION", category: "气质" },
  { pattern: /风度翩翩/g, type: "DESCRIPTION", category: "气质" },

  // ==================== 情节模式类 ====================
  { pattern: /权力的游戏/g, type: "PLOT_PATTERN", category: "政治" },
  { pattern: /暗流涌动/g, type: "PLOT_PATTERN", category: "氛围" },
  { pattern: /波谲云诡/g, type: "PLOT_PATTERN", category: "氛围" },
  { pattern: /风起云涌/g, type: "PLOT_PATTERN", category: "氛围" },
  { pattern: /山雨欲来/g, type: "PLOT_PATTERN", category: "氛围" },
  { pattern: /一触即发/g, type: "PLOT_PATTERN", category: "紧张" },
  { pattern: /剑拔弩张/g, type: "PLOT_PATTERN", category: "紧张" },
  { pattern: /势如破竹/g, type: "PLOT_PATTERN", category: "进展" },
  { pattern: /峰回路转/g, type: "PLOT_PATTERN", category: "转折" },
  { pattern: /柳暗花明/g, type: "PLOT_PATTERN", category: "转折" },
  { pattern: /绝处逢生/g, type: "PLOT_PATTERN", category: "转折" },
  { pattern: /出人意料/g, type: "PLOT_PATTERN", category: "转折" },

  // ==================== 对话模式类 ====================
  { pattern: /你可知道/g, type: "DIALOGUE", category: "提问" },
  { pattern: /你可曾想过/g, type: "DIALOGUE", category: "提问" },
  { pattern: /难道你不知道/g, type: "DIALOGUE", category: "反问" },
  { pattern: /这是为何/g, type: "DIALOGUE", category: "疑问" },
  { pattern: /此话怎讲/g, type: "DIALOGUE", category: "疑问" },
  { pattern: /莫非是/g, type: "DIALOGUE", category: "猜测" },
  { pattern: /想必是/g, type: "DIALOGUE", category: "猜测" },
  { pattern: /原来如此/g, type: "DIALOGUE", category: "恍然" },
  { pattern: /恍然大悟/g, type: "DIALOGUE", category: "恍然" },
  { pattern: /不可思议/g, type: "DIALOGUE", category: "惊讶" },

  // ==================== 成语高频类 ====================
  { pattern: /深不可测/g, type: "IDIOM", category: "描述" },
  { pattern: /高深莫测/g, type: "IDIOM", category: "描述" },
  { pattern: /不可一世/g, type: "IDIOM", category: "态度" },
  { pattern: /胸有成竹/g, type: "IDIOM", category: "态度" },
  { pattern: /步步为营/g, type: "IDIOM", category: "策略" },
  { pattern: /运筹帷幄/g, type: "IDIOM", category: "策略" },
  { pattern: /深谋远虑/g, type: "IDIOM", category: "策略" },
  { pattern: /明争暗斗/g, type: "IDIOM", category: "斗争" },
  { pattern: /尔虞我诈/g, type: "IDIOM", category: "斗争" },
  { pattern: /勾心斗角/g, type: "IDIOM", category: "斗争" },

  // ==================== 章节开场模式类（★新增） ====================
  // 场景固定型开场
  {
    pattern: /站在[^，。]{2,8}中/g,
    type: "CHAPTER_OPENING",
    category: "场景固定",
  },
  {
    pattern: /坐在[^，。]{2,8}中/g,
    type: "CHAPTER_OPENING",
    category: "场景固定",
  },
  { pattern: /晨光[^，。]{2,6}洒/g, type: "CHAPTER_OPENING", category: "晨景" },
  { pattern: /月光[^，。]{2,6}洒/g, type: "CHAPTER_OPENING", category: "月景" },
  {
    pattern: /阳光透过[^，。]{2,8}/g,
    type: "CHAPTER_OPENING",
    category: "光线",
  },
  // 配角打断型开场
  {
    pattern: /打断了[^，。]{1,4}的思绪/g,
    type: "CHAPTER_OPENING",
    category: "打断思绪",
  },
  {
    pattern: /声音打破了[^，。]{2,6}/g,
    type: "CHAPTER_OPENING",
    category: "打破宁静",
  },
  // 心理独白型开场
  {
    pattern: /心中[^，。]{2,6}复杂/g,
    type: "CHAPTER_OPENING",
    category: "心理开场",
  },
  {
    pattern: /思绪[^，。]{2,6}飘/g,
    type: "CHAPTER_OPENING",
    category: "心理开场",
  },

  // ==================== 场景结构模式类（★新增） ====================
  // 偷听模式
  {
    pattern: /躲在[^，。]{2,6}偷听/g,
    type: "SCENE_STRUCTURE",
    category: "偷听",
  },
  { pattern: /藏身[^，。]{2,6}听/g, type: "SCENE_STRUCTURE", category: "偷听" },
  {
    pattern: /透过门缝[^，。]{2,8}/g,
    type: "SCENE_STRUCTURE",
    category: "偷窥",
  },
  // 巧遇模式
  {
    pattern: /正巧遇[到见上]/g,
    type: "SCENE_STRUCTURE",
    category: "巧遇",
  },
  {
    pattern: /恰好[^，。]{2,6}经过/g,
    type: "SCENE_STRUCTURE",
    category: "巧遇",
  },
  // 被打断模式
  {
    pattern: /话未说完[^，。]{2,8}打断/g,
    type: "SCENE_STRUCTURE",
    category: "被打断",
  },
  {
    pattern: /正要[^，。]{2,6}却被/g,
    type: "SCENE_STRUCTURE",
    category: "被打断",
  },
  // 深夜密会
  {
    pattern: /夜深人静[^，。]{2,8}来到/g,
    type: "SCENE_STRUCTURE",
    category: "深夜密会",
  },
  {
    pattern: /悄悄来到[^，。]{2,8}/g,
    type: "SCENE_STRUCTURE",
    category: "密会",
  },

  // ==================== 叙事节奏模式类（★新增） ====================
  // 被动观察型（主角无作为）
  {
    pattern: /只能[^，。]{2,6}看着/g,
    type: "NARRATIVE_PACING",
    category: "被动观察",
  },
  {
    pattern: /默默[^，。]{2,6}注视/g,
    type: "NARRATIVE_PACING",
    category: "被动观察",
  },
  {
    pattern: /静静地站在[^，。]{2,8}/g,
    type: "NARRATIVE_PACING",
    category: "被动等待",
  },
  // 重复询问型
  {
    pattern: /这究竟是怎么回事/g,
    type: "NARRATIVE_PACING",
    category: "重复疑问",
  },
  {
    pattern: /到底发生了什么/g,
    type: "NARRATIVE_PACING",
    category: "重复疑问",
  },
  // 拖延型叙事
  {
    pattern: /不知过了多久/g,
    type: "NARRATIVE_PACING",
    category: "时间拖延",
  },
  {
    pattern: /时间一点一点过去/g,
    type: "NARRATIVE_PACING",
    category: "时间拖延",
  },
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
  private detectExpressions(content: string): Array<{
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
      // ★新增：章节开场模式冷却期最长，防止每章开场雷同
      case "CHAPTER_OPENING":
        base = EXPRESSION_COOLDOWN_CONFIG.chapterOpeningCooldownChapters;
        break;
      // ★新增：场景结构模式冷却
      case "SCENE_STRUCTURE":
        base = EXPRESSION_COOLDOWN_CONFIG.sceneStructureCooldownChapters;
        break;
      // ★新增：叙事节奏模式冷却
      case "NARRATIVE_PACING":
        base = EXPRESSION_COOLDOWN_CONFIG.narrativePacingCooldownChapters;
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
      CHAPTER_OPENING: "章节开场",
      SCENE_STRUCTURE: "场景结构",
      NARRATIVE_PACING: "叙事节奏",
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

  // ==================== 动态表达学习 ====================

  /**
   * 从项目历史内容中学习新的重复模式
   *
   * 策略：
   * 1. 扫描所有章节内容
   * 2. 提取 3-6 字的短语
   * 3. 统计出现频率
   * 4. 识别高频短语（超过阈值）
   * 5. 过滤常见词汇和已有模式
   * 6. 添加到表达记忆
   */
  async learnFromProjectContent(
    projectId: string,
    minFrequency: number = 5,
  ): Promise<{
    newPatterns: Array<{ expression: string; frequency: number }>;
    totalAnalyzed: number;
  }> {
    this.logger.log(
      `[ExpressionMemory] Starting dynamic learning for project ${projectId}`,
    );

    // 1. 获取项目所有章节内容
    const chapters = await this.prisma.writingChapter.findMany({
      where: {
        volume: { projectId },
        content: { not: null },
      },
      select: { content: true, chapterNumber: true },
      orderBy: { chapterNumber: "asc" },
    });

    if (chapters.length === 0) {
      return { newPatterns: [], totalAnalyzed: 0 };
    }

    // 2. 合并所有内容
    const allContent = chapters.map((ch) => ch.content || "").join("\n");

    // 3. 提取 n-gram 短语并统计频率
    const phraseFrequency = new Map<string, number>();
    const ngramLengths = [3, 4, 5, 6]; // 3-6 字短语

    for (const n of ngramLengths) {
      for (let i = 0; i <= allContent.length - n; i++) {
        const phrase = allContent.slice(i, i + n);

        // 过滤：必须全是中文字符
        if (!/^[\u4e00-\u9fa5]+$/.test(phrase)) continue;

        // 过滤：不能包含常见虚词开头/结尾
        if (this.isCommonWord(phrase)) continue;

        const count = phraseFrequency.get(phrase) || 0;
        phraseFrequency.set(phrase, count + 1);
      }
    }

    // 4. 筛选高频短语
    const highFrequencyPhrases: Array<{
      expression: string;
      frequency: number;
    }> = [];

    for (const [phrase, count] of phraseFrequency) {
      if (count >= minFrequency) {
        // 检查是否已在静态模式中
        const isStaticPattern = COMMON_EXPRESSION_PATTERNS.some((p) =>
          p.pattern.test(phrase),
        );

        // 检查是否已在数据库中
        const existsInDb = await this.prisma.writingExpressionMemory.findFirst({
          where: { projectId, expression: phrase },
        });

        if (!isStaticPattern && !existsInDb) {
          highFrequencyPhrases.push({ expression: phrase, frequency: count });
        }
      }
    }

    // 5. 按频率排序，取前 50 个
    highFrequencyPhrases.sort((a, b) => b.frequency - a.frequency);
    const topPhrases = highFrequencyPhrases.slice(0, 50);

    // 6. 添加到表达记忆（标记为动态学习）
    for (const { expression, frequency } of topPhrases) {
      const type = this.inferExpressionType(expression);

      await this.prisma.writingExpressionMemory.create({
        data: {
          projectId,
          expression,
          expressionType: type,
          category: "动态学习",
          useCount: frequency,
          lastUsedAt: new Date(),
          isCoolingDown: frequency >= 10, // 高频直接进入冷却
          cooldownUntil:
            frequency >= 10 ? this.calculateCooldownEnd(0, 15) : null,
        },
      });
    }

    this.logger.log(
      `[ExpressionMemory] Learned ${topPhrases.length} new patterns from ${chapters.length} chapters`,
    );

    return {
      newPatterns: topPhrases,
      totalAnalyzed: chapters.length,
    };
  }

  /**
   * 检查是否为常见虚词/无意义短语
   */
  private isCommonWord(phrase: string): boolean {
    const commonPatterns = [
      /^[的地得了着过]/,
      /[的地得了着过]$/,
      /^[是在有为]/,
      /^[这那其]/,
      /^[我你他她它们]/,
      /[也就都还]/,
      /^[一二三四五六七八九十]/,
      /[个只条件]$/,
    ];

    return commonPatterns.some((p) => p.test(phrase));
  }

  /**
   * 推断表达类型
   */
  private inferExpressionType(expression: string): ExpressionType {
    // 基于关键词推断类型
    if (/心|情|感|怒|喜|悲|惧|惊/.test(expression)) {
      return "EMOTION";
    }
    if (/道|说|言|语|喊|叫|问/.test(expression)) {
      return "DIALOGUE";
    }
    if (/时|刻|间|后|前|之/.test(expression)) {
      return "TRANSITION";
    }
    if (/眼|眉|目|脸|面|唇|嘴/.test(expression)) {
      return "ACTION";
    }
    if (/月|日|风|云|雨|雪|光/.test(expression)) {
      return "DESCRIPTION";
    }

    return "DESCRIPTION"; // 默认
  }
}
