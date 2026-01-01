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

## 15 种页面模板类型及适用场景

### ⚠️ 模板选择核心原则（必读！）

**模板必须与内容语义匹配！** 错误的模板选择会导致内容逻辑混乱。

| 内容类型 | 正确模板 | 错误模板 |
|---------|---------|---------|
| 地理位置/位置描述 | splitLayout, multiColumn | ❌ framework, timeline |
| 人口/面积等统计数据 | dashboard | ❌ timeline, framework |
| 发展历程/时间演变 | timeline, evolutionRoadmap | ❌ dashboard, pillars |
| 核心概念框架 | framework, pillars | ❌ timeline, comparison |
| 优劣对比 | comparison | ❌ framework, pillars |
| 流程/步骤 | framework（仅当内容是真实的步骤流程时） | - |

### 模板详细说明

1. **cover** - 封面页（标题、副标题、日期）
2. **toc** - 目录页（章节列表）
3. **questions** - 问题页（核心问题列表）
4. **pillars** - 支柱页（3-5 个核心支柱）- 适用于并列的支柱概念
5. **framework** - 框架页 ⚠️ **仅用于真正的流程/步骤！** 不能用于描述性内容
6. **timeline** - 时间线页 - 必须有明确的时间节点/阶段
7. **evolutionRoadmap** - 演进路线图 - 必须展示发展变化过程
8. **dashboard** - 仪表板页（多个 KPI）- 适用于数据展示
9. **comparison** - 对比页（两方对比）- 必须有两个对比对象
10. **splitLayout** - 分栏布局 - 适用于描述性内容+图像组合
11. **caseStudy** - 案例研究页 - 必须是具体案例
12. **multiColumn** - 多列布局 - 适用于多个并列信息块
13. **recommendations** - 建议页 - 必须是行动建议
14. **maturityModel** - 成熟度模型 - 必须有阶段模型
15. **riskOpportunity** - 风险/机遇页 - 必须有正反两面分析

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
5. **叙事连贯**：确保页面之间有逻辑过渡
6. **视觉丰富**：每页必须有图像需求，增强视觉效果

## ⚠️ 必须包含的页面（强制要求！）

**以下页面类型是必须的，缺少任何一个都是错误的：**

1. **封面页 (cover)** - 第1页，必须包含主题标题、副标题、日期
2. **目录页 (toc)** - 第2页，列出所有章节，帮助观众把握整体结构
3. **结尾页 (recommendations/summary)** - 最后一页，必须包含总结、致谢或行动号召

**页面顺序规则：**
- 第1页：cover（封面）
- 第2页：toc（目录）
- 第3-N-1页：内容页（根据源文本组织）
- 第N页：结尾页（总结/建议/致谢）

**绝对禁止：**
- 没有目录页直接进入内容
- 内容页结束后没有收尾
- 目录页放在第3页及之后

## ⚠️ 叙事逻辑顺序（必须遵守！）

**内容页面必须遵循合理的逻辑顺序，避免话题突然跳转：**

1. **地理类主题**的推荐顺序：
   - 地理位置 → 自然环境（气候、地形） → 人口/人文 → 经济/产业 → 发展/展望

2. **产品/项目类主题**的推荐顺序：
   - 背景/问题 → 解决方案 → 核心功能 → 技术架构 → 成功案例 → 未来规划

3. **分析报告类主题**的推荐顺序：
   - 行业概述 → 市场分析 → 竞争格局 → 机会与风险 → 战略建议

4. **相关话题必须合并或相邻**：
   - ❌ 错误：第3页-气候，第5页-人口，第7页-气候特征（气候分散！）
   - ✅ 正确：第3页-气候概述，第4页-气候特征，第5页-人口（相关内容相邻）

5. **避免话题跳跃**：
   - 每个页面与前后页面必须有逻辑关联
   - 使用过渡性语言或章节分隔来标记主题切换

## ⚠️ 模板多样性（避免视觉疲劳！）

**必须避免连续使用相同模板，确保视觉节奏变化：**

1. **同一模板不能连续出现超过2次**
   - ❌ 错误：第4页splitLayout，第6页splitLayout，第8页splitLayout
   - ✅ 正确：第4页splitLayout，第5页dashboard，第6页pillars

2. **推荐的模板交替模式**：
   - 数据页(dashboard) → 内容页(splitLayout/multiColumn) → 框架页(pillars/framework)
   - 高密度页 → 中密度页 → 低密度页（休息）

3. **根据内容特点选择不同模板**：
   - 统计数据 → dashboard 或 comparison
   - 概念列表 → pillars 或 multiColumn
   - 流程步骤 → framework 或 timeline
   - 图文结合 → splitLayout

4. **章节之间使用分隔页**：
   - 每个主题模块开始前可以使用 framework 章节分隔页
   - 帮助观众理解演示结构

## 图像需求规则（重要！）

每个页面都必须包含 imageRequirements 字段：

- **cover**: 必须有 background 图像（科技/商务主题背景）
- **toc**: 可选背景图像
- **dashboard**: 必须有 background 图像（数据可视化主题）
- **framework/pillars/timeline**: 必须有 inline 或 background 图像
- **comparison**: 两侧各需要 inline 图像
- **caseStudy**: 必须有案例相关 inline 图像
- 其他类型: 至少需要一个 background 或 inline 图像

图像需求示例：
- 封面页: [{"position": "background", "semanticContext": "科技创新深色背景，抽象几何图案", "style": "abstract dark tech", "optional": false}]
- 数据页: [{"position": "background", "semanticContext": "数据流动深色背景", "style": "data visualization abstract", "optional": false}]
- 内容页: [{"position": "inline", "semanticContext": "与页面主题相关的插图", "style": "professional illustration", "optional": false}]

## ⛔ 严禁事项（违反将导致任务失败！）

**绝对禁止生成以下类型的页面标题或内容：**
1. 关于"设计风格"、"商务简约"、"视觉设计"、"设计理念"的页面
2. 关于"PPT制作方法"、"幻灯片设计技巧"的页面
3. 任何自我描述性内容（如"本演示文稿采用XX风格"）
4. 任何与选择的主题风格（如"商务白"、"科技紫"）名称相关的内容

**页面标题必须100%基于源文本的实际主题！**
- 源文本讲"渥太华KANATA" → 页面标题如"KANATA科技园概况"、"KANATA发展历程"
- 源文本讲"AI发展" → 页面标题如"AI技术趋势"、"AI应用场景"
- ❌ 错误示例："设计理念：商务简约风格的力量" ← 绝对禁止！`;

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

    let pages: PageOutline[] = Array.isArray(parsed.pages)
      ? parsed.pages.map((page: Record<string, unknown>, index: number) =>
          this.normalizePageOutline(page, index + 1),
        )
      : this.generateDefaultPages(taskDecomposition);

    // 强制确保必要页面存在
    pages = this.ensureRequiredPages(pages, title, taskDecomposition);

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
   * 确保必要页面存在（封面、目录、结尾）
   */
  private ensureRequiredPages(
    pages: PageOutline[],
    title: string,
    taskDecomposition: TaskDecomposition,
  ): PageOutline[] {
    const result = [...pages];

    // 1. 确保第一页是封面
    const hasCover = result.length > 0 && result[0].templateType === "cover";
    if (!hasCover) {
      this.logger.warn(
        "[ensureRequiredPages] Missing cover page, injecting...",
      );
      const coverPage: PageOutline = {
        pageNumber: 1,
        title: title,
        subtitle: taskDecomposition.chapters[0]?.title || "专业报告",
        templateType: "cover",
        contentBrief: "封面页 - 展示报告主题和基本信息",
        keyElements: ["标题", "副标题", "日期", "作者"],
        layoutHints: [{ type: "alignment", value: "center" }],
        imageRequirements: [
          {
            position: "background",
            semanticContext: "专业商务深色背景，抽象几何图案",
            style: "abstract dark professional",
            optional: false,
          },
        ],
      };
      result.unshift(coverPage);
    }

    // 2. 确保第二页是目录
    const hasToc = result.length > 1 && result[1].templateType === "toc";
    if (!hasToc) {
      this.logger.warn("[ensureRequiredPages] Missing TOC page, injecting...");
      const tocPage: PageOutline = {
        pageNumber: 2,
        title: "目录",
        subtitle: "CONTENTS",
        templateType: "toc",
        contentBrief: "目录页 - 展示报告结构，帮助观众把握整体脉络",
        keyElements: taskDecomposition.chapters.map((ch) => ch.title),
        layoutHints: [{ type: "alignment", value: "left" }],
      };
      // 插入到第二位
      if (result.length > 1) {
        result.splice(1, 0, tocPage);
      } else {
        result.push(tocPage);
      }
    }

    // 3. 确保最后一页是结尾页（总结/建议/致谢）
    const closingTypes: PageTemplateType[] = ["recommendations", "caseStudy"];
    const lastPage = result[result.length - 1];
    const hasClosing =
      lastPage &&
      (closingTypes.includes(lastPage.templateType) ||
        lastPage.title.includes("总结") ||
        lastPage.title.includes("结论") ||
        lastPage.title.includes("建议") ||
        lastPage.title.includes("致谢") ||
        lastPage.title.includes("感谢"));

    if (!hasClosing) {
      this.logger.warn(
        "[ensureRequiredPages] Missing closing page, injecting...",
      );
      const closingPage: PageOutline = {
        pageNumber: result.length + 1,
        title: "总结与展望",
        subtitle: "SUMMARY & OUTLOOK",
        templateType: "recommendations",
        contentBrief: "结尾页 - 总结核心要点，提出行动建议",
        keyElements: ["核心总结", "关键发现", "行动建议", "联系方式"],
        layoutHints: [{ type: "emphasis", value: "conclusion" }],
        imageRequirements: [
          {
            position: "background",
            semanticContext: "专业结尾页背景，未来展望主题",
            style: "abstract future outlook",
            optional: true,
          },
        ],
      };
      result.push(closingPage);
    }

    // 重新编号所有页面
    result.forEach((page, index) => {
      page.pageNumber = index + 1;
    });

    this.logger.log(
      `[ensureRequiredPages] Final page count: ${result.length} (cover: ${hasCover ? "existed" : "injected"}, toc: ${hasToc ? "existed" : "injected"}, closing: ${hasClosing ? "existed" : "injected"})`,
    );

    // 检查并修复模板多样性问题
    return this.ensureTemplateDiversity(result);
  }

  /**
   * 确保模板多样性，避免连续使用相同模板
   */
  private ensureTemplateDiversity(pages: PageOutline[]): PageOutline[] {
    const result = [...pages];
    const MAX_CONSECUTIVE = 2; // 最多连续2次使用相同模板

    // 用于交替的备选模板
    const alternativeTemplates: Record<PageTemplateType, PageTemplateType[]> = {
      splitLayout: ["multiColumn", "pillars"],
      multiColumn: ["splitLayout", "pillars"],
      pillars: ["multiColumn", "splitLayout"],
      dashboard: ["comparison", "pillars"],
      comparison: ["dashboard", "pillars"],
      framework: ["pillars", "timeline"],
      timeline: ["framework", "evolutionRoadmap"],
      evolutionRoadmap: ["timeline", "framework"],
      caseStudy: ["splitLayout", "multiColumn"],
      cover: ["cover"], // 封面不替换
      toc: ["toc"], // 目录不替换
      closing: ["recommendations"], // 结尾页用建议模板替代
      questions: ["pillars"],
      recommendations: ["pillars", "multiColumn"],
      maturityModel: ["timeline", "pillars"],
      riskOpportunity: ["comparison", "pillars"],
    };

    let consecutiveCount = 1;
    let lastTemplate: PageTemplateType | null = null;

    for (let i = 0; i < result.length; i++) {
      const page = result[i];
      const currentTemplate = page.templateType;

      // 跳过封面、目录和结尾页
      if (
        currentTemplate === "cover" ||
        currentTemplate === "toc" ||
        i === result.length - 1
      ) {
        lastTemplate = currentTemplate;
        consecutiveCount = 1;
        continue;
      }

      if (currentTemplate === lastTemplate) {
        consecutiveCount++;

        if (consecutiveCount > MAX_CONSECUTIVE) {
          // 需要替换模板
          const alternatives: PageTemplateType[] = alternativeTemplates[
            currentTemplate
          ] || ["multiColumn"];
          const newTemplate: PageTemplateType = alternatives[0];

          this.logger.warn(
            `[ensureTemplateDiversity] Page ${i + 1} uses ${currentTemplate} consecutively ${consecutiveCount} times, changing to ${newTemplate}`,
          );

          result[i] = {
            ...page,
            templateType: newTemplate,
          };

          // 重置计数
          lastTemplate = newTemplate;
          consecutiveCount = 1;
        } else {
          lastTemplate = currentTemplate;
        }
      } else {
        lastTemplate = currentTemplate;
        consecutiveCount = 1;
      }
    }

    return result;
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
