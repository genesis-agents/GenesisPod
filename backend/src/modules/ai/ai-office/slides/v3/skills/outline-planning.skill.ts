/**
 * Slides Engine v3.0 - Outline Planning Skill
 *
 * 大纲规划技能：基于任务分解生成详细的页面大纲
 * 使用 Architect 角色 (CHAT + QUALITY_FIRST)
 */

import { Injectable, Logger } from "@nestjs/common";
import {
  MultiModelService,
  RoleCallInput,
} from "../orchestrator/multi-model.service";
import {
  TaskDecomposition,
  OutlinePlan,
  PageOutline,
  GlobalStyles,
  ContentFlowAnalysis,
  PageTemplateType,
  LayoutHint,
  DataRequirement,
  ImageRequirement,
  GENSPARK_DESIGN_SYSTEM,
} from "../checkpoint/checkpoint.types";

/**
 * 大纲规划输入
 */
export interface OutlinePlanningInput {
  /** 任务分解结果 */
  taskDecomposition: TaskDecomposition;
  /** 原始源文本（用于提取具体内容） */
  sourceText: string;
  /** 会话 ID */
  sessionId?: string;
}

/**
 * 大纲规划系统提示词
 */
const OUTLINE_PLANNING_SYSTEM_PROMPT = `你是一位专业的 PPT 大纲规划师，负责为每一页设计详细的内容大纲。

## 你的任务

基于任务分解结果，为每一页生成详细的大纲，包括：
1. **页面类型**：从 15 种模板中选择最合适的
2. **内容简述**：该页的核心内容
3. **关键元素**：需要展示的关键信息
4. **布局提示**：排版建议
5. **数据需求**：需要可视化的数据
6. **图像需求**：需要生成的图像

## 15 种页面模板类型

1. **cover** - 封面页（标题、副标题、日期）
2. **toc** - 目录页（章节列表）
3. **questions** - 问题页（核心问题列表）
4. **pillars** - 支柱页（3-5 个核心支柱）
5. **framework** - 框架页（概念框架图）
6. **timeline** - 时间线页（阶段演进）
7. **evolutionRoadmap** - 演进路线图（发展轨迹）
8. **dashboard** - 仪表板页（多个 KPI）
9. **comparison** - 对比页（两方对比）
10. **splitLayout** - 分栏布局（左右分栏）
11. **caseStudy** - 案例研究页（具体案例分析）
12. **multiColumn** - 多列布局（3-4 列内容）
13. **recommendations** - 建议页（行动建议列表）
14. **maturityModel** - 成熟度模型（阶段模型）
15. **riskOpportunity** - 风险/机遇页（正反两面）

## 输出格式

严格按照以下 JSON 格式输出：

\`\`\`json
{
  "title": "报告标题",
  "pages": [
    {
      "pageNumber": 1,
      "title": "页面标题",
      "subtitle": "副标题（可选）",
      "templateType": "cover",
      "contentBrief": "该页核心内容描述",
      "keyElements": ["元素1", "元素2"],
      "layoutHints": [
        {"type": "alignment", "value": "center", "description": "居中对齐"}
      ],
      "dataRequirements": [
        {"type": "metric", "description": "关键指标", "mustInclude": true}
      ],
      "imageRequirements": [
        {"position": "background", "semanticContext": "科技感背景", "optional": true}
      ],
      "sourceRef": "第1章"
    }
  ],
  "globalStyles": {
    "backgroundColor": "#0F172A",
    "cardBackground": "#1E293B",
    "borderColor": "#334155",
    "accentColor": "#D4AF37",
    "secondaryAccent": "#3B82F6",
    "textPrimary": "#F8FAFC",
    "textSecondary": "#94A3B8",
    "fontFamily": "Noto Sans SC, sans-serif",
    "canvasWidth": 1280,
    "canvasHeight": 720,
    "pagePadding": "50px 80px 80px 80px",
    "bottomSafeZone": 80
  },
  "contentFlow": {
    "narrativeArc": "problem-solution",
    "keyTransitions": ["从问题到方案", "从现状到未来"],
    "climaxPage": 12,
    "conclusionStyle": "recommendations"
  }
}
\`\`\`

## 规划原则

1. **页面类型匹配内容**：根据内容特点选择最合适的模板
2. **信息密度适中**：每页 3-5 个关键元素
3. **视觉层次清晰**：重要内容突出显示
4. **数据可视化**：尽量将数据转化为图表
5. **叙事连贯**：确保页面之间有逻辑过渡`;

@Injectable()
export class OutlinePlanningSkill {
  private readonly logger = new Logger(OutlinePlanningSkill.name);

  constructor(private readonly multiModel: MultiModelService) {}

  /**
   * 执行大纲规划
   */
  async execute(input: OutlinePlanningInput): Promise<OutlinePlan> {
    this.logger.log(
      `[execute] Starting outline planning for ${input.taskDecomposition.totalPages} pages`,
    );

    const userMessage = this.buildUserMessage(input);

    const roleCall: RoleCallInput = {
      role: "architect",
      messages: [
        { role: "system", content: OUTLINE_PLANNING_SYSTEM_PROMPT },
        { role: "user", content: userMessage },
      ],
      maxTokens: 8192, // 大纲需要更多 token
      temperature: 0.3,
      metadata: {
        sessionId: input.sessionId,
        phase: "outline_planning",
      },
    };

    const result = await this.multiModel.callByRole(roleCall);

    if (!result.success || !result.content) {
      this.logger.error("[execute] AI call failed:", result.error);
      throw new Error(`Outline planning failed: ${result.error}`);
    }

    const outlinePlan = this.parseResponse(
      result.content,
      input.taskDecomposition,
    );

    this.logger.log(
      `[execute] Outline planning complete: ${outlinePlan.pages.length} pages planned`,
    );

    return outlinePlan;
  }

  /**
   * 构建用户消息
   */
  private buildUserMessage(input: OutlinePlanningInput): string {
    const { taskDecomposition, sourceText } = input;

    return `## 任务分解结果

### 总页数
${taskDecomposition.totalPages} 页

### 章节结构
${JSON.stringify(taskDecomposition.chapters, null, 2)}

### 设计策略
${JSON.stringify(taskDecomposition.designStrategy, null, 2)}

### 源内容分析
${taskDecomposition.sourceAnalysis ? JSON.stringify(taskDecomposition.sourceAnalysis, null, 2) : "无"}

## 原始源文本（供参考）

${sourceText.substring(0, 10000)}${sourceText.length > 10000 ? "\n\n[内容已截断...]" : ""}

## 请求

请为每一页生成详细的大纲规划，输出完整的 JSON 格式结果。`;
  }

  /**
   * 解析 AI 响应
   */
  private parseResponse(
    content: string,
    taskDecomposition: TaskDecomposition,
  ): OutlinePlan {
    const jsonMatch = content.match(/```json\s*([\s\S]*?)\s*```/);
    const jsonStr = jsonMatch ? jsonMatch[1] : content;

    try {
      const parsed = JSON.parse(jsonStr);
      return this.validateAndNormalize(parsed, taskDecomposition);
    } catch (error) {
      this.logger.error("[parseResponse] JSON parse error:", error);
      return this.createFallbackOutline(taskDecomposition);
    }
  }

  /**
   * 验证并规范化解析结果
   */
  private validateAndNormalize(
    parsed: Record<string, unknown>,
    taskDecomposition: TaskDecomposition,
  ): OutlinePlan {
    const title = String(parsed.title || "演示文稿");

    const pages: PageOutline[] = Array.isArray(parsed.pages)
      ? parsed.pages.map((page: Record<string, unknown>, index: number) =>
          this.normalizePageOutline(page, index + 1),
        )
      : this.generateDefaultPages(taskDecomposition);

    const globalStylesRaw = parsed.globalStyles as
      | Record<string, unknown>
      | undefined;
    const globalStyles: GlobalStyles = globalStylesRaw
      ? this.normalizeGlobalStyles(globalStylesRaw)
      : { ...GENSPARK_DESIGN_SYSTEM };

    const contentFlowRaw = parsed.contentFlow as
      | Record<string, unknown>
      | undefined;
    const contentFlow: ContentFlowAnalysis = contentFlowRaw
      ? {
          narrativeArc:
            (contentFlowRaw.narrativeArc as ContentFlowAnalysis["narrativeArc"]) ||
            "problem-solution",
          keyTransitions: Array.isArray(contentFlowRaw.keyTransitions)
            ? contentFlowRaw.keyTransitions.map(String)
            : [],
          climaxPage:
            typeof contentFlowRaw.climaxPage === "number"
              ? contentFlowRaw.climaxPage
              : undefined,
          conclusionStyle:
            (contentFlowRaw.conclusionStyle as ContentFlowAnalysis["conclusionStyle"]) ||
            "summary",
        }
      : {
          narrativeArc: "problem-solution",
          keyTransitions: [],
          conclusionStyle: "summary",
        };

    return { title, pages, globalStyles, contentFlow };
  }

  /**
   * 规范化页面大纲
   */
  private normalizePageOutline(
    raw: Record<string, unknown>,
    pageNumber: number,
  ): PageOutline {
    return {
      pageNumber:
        typeof raw.pageNumber === "number" ? raw.pageNumber : pageNumber,
      title: String(raw.title || `第 ${pageNumber} 页`),
      subtitle: raw.subtitle ? String(raw.subtitle) : undefined,
      templateType: this.validateTemplateType(raw.templateType),
      contentBrief: String(raw.contentBrief || ""),
      keyElements: Array.isArray(raw.keyElements)
        ? raw.keyElements.map(String)
        : [],
      layoutHints: this.normalizeLayoutHints(raw.layoutHints),
      dataRequirements: this.normalizeDataRequirements(raw.dataRequirements),
      imageRequirements: this.normalizeImageRequirements(raw.imageRequirements),
      sourceRef: raw.sourceRef ? String(raw.sourceRef) : undefined,
    };
  }

  /**
   * 验证模板类型
   */
  private validateTemplateType(type: unknown): PageTemplateType {
    const validTypes: PageTemplateType[] = [
      "cover",
      "toc",
      "questions",
      "pillars",
      "framework",
      "timeline",
      "evolutionRoadmap",
      "dashboard",
      "comparison",
      "splitLayout",
      "caseStudy",
      "multiColumn",
      "recommendations",
      "maturityModel",
      "riskOpportunity",
    ];

    if (
      typeof type === "string" &&
      validTypes.includes(type as PageTemplateType)
    ) {
      return type as PageTemplateType;
    }

    return "splitLayout"; // 默认类型
  }

  /**
   * 规范化布局提示
   */
  private normalizeLayoutHints(raw: unknown): LayoutHint[] {
    if (!Array.isArray(raw)) return [];

    return raw.map((hint: Record<string, unknown>) => ({
      type: (hint.type as LayoutHint["type"]) || "alignment",
      value: String(hint.value || ""),
      description: hint.description ? String(hint.description) : undefined,
    }));
  }

  /**
   * 规范化数据需求
   */
  private normalizeDataRequirements(
    raw: unknown,
  ): DataRequirement[] | undefined {
    if (!Array.isArray(raw) || raw.length === 0) return undefined;

    return raw.map((req: Record<string, unknown>) => ({
      type: (req.type as DataRequirement["type"]) || "metric",
      description: String(req.description || ""),
      mustInclude: Boolean(req.mustInclude),
      sourceRef: req.sourceRef ? String(req.sourceRef) : undefined,
    }));
  }

  /**
   * 规范化图像需求
   */
  private normalizeImageRequirements(
    raw: unknown,
  ): ImageRequirement[] | undefined {
    if (!Array.isArray(raw) || raw.length === 0) return undefined;

    return raw.map((req: Record<string, unknown>) => ({
      position: (req.position as ImageRequirement["position"]) || "inline",
      semanticContext: String(req.semanticContext || ""),
      style: req.style ? String(req.style) : undefined,
      optional: Boolean(req.optional),
    }));
  }

  /**
   * 规范化全局样式
   */
  private normalizeGlobalStyles(raw: Record<string, unknown>): GlobalStyles {
    return {
      backgroundColor: String(
        raw.backgroundColor || GENSPARK_DESIGN_SYSTEM.backgroundColor,
      ),
      cardBackground: String(
        raw.cardBackground || GENSPARK_DESIGN_SYSTEM.cardBackground,
      ),
      borderColor: String(
        raw.borderColor || GENSPARK_DESIGN_SYSTEM.borderColor,
      ),
      accentColor: String(
        raw.accentColor || GENSPARK_DESIGN_SYSTEM.accentColor,
      ),
      secondaryAccent: String(
        raw.secondaryAccent || GENSPARK_DESIGN_SYSTEM.secondaryAccent,
      ),
      textPrimary: String(
        raw.textPrimary || GENSPARK_DESIGN_SYSTEM.textPrimary,
      ),
      textSecondary: String(
        raw.textSecondary || GENSPARK_DESIGN_SYSTEM.textSecondary,
      ),
      fontFamily: String(raw.fontFamily || GENSPARK_DESIGN_SYSTEM.fontFamily),
      canvasWidth:
        typeof raw.canvasWidth === "number"
          ? raw.canvasWidth
          : GENSPARK_DESIGN_SYSTEM.canvasWidth,
      canvasHeight:
        typeof raw.canvasHeight === "number"
          ? raw.canvasHeight
          : GENSPARK_DESIGN_SYSTEM.canvasHeight,
      pagePadding: String(
        raw.pagePadding || GENSPARK_DESIGN_SYSTEM.pagePadding,
      ),
      bottomSafeZone:
        typeof raw.bottomSafeZone === "number"
          ? raw.bottomSafeZone
          : GENSPARK_DESIGN_SYSTEM.bottomSafeZone,
    };
  }

  /**
   * 生成默认页面
   */
  private generateDefaultPages(
    taskDecomposition: TaskDecomposition,
  ): PageOutline[] {
    const pages: PageOutline[] = [];
    const totalPages = taskDecomposition.totalPages;

    // 封面
    pages.push({
      pageNumber: 1,
      title: "报告标题",
      templateType: "cover",
      contentBrief: "封面页",
      keyElements: ["标题", "副标题", "日期"],
      layoutHints: [{ type: "alignment", value: "center" }],
    });

    // 目录
    pages.push({
      pageNumber: 2,
      title: "目录",
      templateType: "toc",
      contentBrief: "内容目录",
      keyElements: taskDecomposition.chapters.map((ch) => ch.title),
      layoutHints: [{ type: "alignment", value: "left" }],
    });

    // 内容页
    for (let i = 3; i < totalPages; i++) {
      pages.push({
        pageNumber: i,
        title: `第 ${i} 页`,
        templateType: "splitLayout",
        contentBrief: "内容页",
        keyElements: ["要点1", "要点2"],
        layoutHints: [],
      });
    }

    // 总结页
    pages.push({
      pageNumber: totalPages,
      title: "总结与建议",
      templateType: "recommendations",
      contentBrief: "总结和下一步建议",
      keyElements: ["总结", "建议"],
      layoutHints: [],
    });

    return pages;
  }

  /**
   * 创建降级大纲
   */
  private createFallbackOutline(
    taskDecomposition: TaskDecomposition,
  ): OutlinePlan {
    return {
      title: "演示文稿",
      pages: this.generateDefaultPages(taskDecomposition),
      globalStyles: { ...GENSPARK_DESIGN_SYSTEM },
      contentFlow: {
        narrativeArc: "problem-solution",
        keyTransitions: [],
        conclusionStyle: "summary",
      },
    };
  }
}
