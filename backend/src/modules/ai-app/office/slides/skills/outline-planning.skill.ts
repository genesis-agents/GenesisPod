/**
 * Slides Engine v4.0 - Outline Planning Skill
 *
 * 大纲规划技能：基于任务分解生成详细的页面大纲
 * 实现 AI Engine ISkill 接口，注册到 SkillRegistry
 */

import { Injectable, Logger, Optional } from "@nestjs/common";
import {
  ISkill,
  SkillContext,
  SkillResult,
  SkillLayer,
  SKILL_LAYERS,
} from "@/modules/ai-engine/skills/abstractions/skill.interface";
import { LLMFactory } from "@/modules/ai-engine/llm/factory/llm-factory";
import {
  TaskDecomposition,
  OutlinePlan,
  PageOutline,
  GlobalStyles,
  ContentFlowAnalysis,
  PageTemplateType,
  PageLogicType,
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

## ⭐ 核心原则：页面三要素（最重要！）

**每一页必须具备完整的三要素结构：观点 + 逻辑 + 数据**

### 1. 观点 (Viewpoint) = 页面标题
- **必须是判断句**：表达明确观点，不是描述性标题
- **必须有态度**：有立场、有结论
- **一页一观点**：聚焦单一核心

示例：
- ✅ 「AI 正在重塑企业竞争格局」
- ✅ 「数字化转型降低运营成本 30%」
- ❌ 「关于 AI 的介绍」（太泛）
- ❌ 「第三章：技术方案」（无观点）

### 2. 逻辑 (Logic) = 决定模板类型
观点需要逻辑来支撑，逻辑决定使用什么模板：

| 逻辑类型 | 描述 | 对应模板 |
|---------|------|---------|
| 并列论证 | N个并列的支撑点 | pillars, multiColumn |
| 时序论证 | 按时间顺序展开 | timeline, evolutionRoadmap |
| 对比论证 | 通过对比突显差异 | comparison |
| 数据论证 | 用数字说明问题 | dashboard |
| 因果论证 | 展示原因和结果 | framework |
| 层级论证 | 展示优先级或层次 | maturityModel |
| 案例论证 | 用实例佐证 | caseStudy, splitLayout |

### 3. 数据 (Data) = 填充模板的内容
数据分三种形式，必须支撑逻辑：

1. **描述性文字**：解释、要点、引用
2. **数字数据**：统计值、百分比、KPI
3. **图片素材**：图表、照片、图标

**数据必须与逻辑匹配！**
- 观点「成本降低30%」→ 逻辑「数据论证」→ 数据「30%数字 + 对比说明」
- ❌ 数据「用户增长50%」与成本无关，不能支撑观点

## 你的任务

基于任务分解结果，为每一页生成详细的大纲，确保每页都有：
1. **观点性标题**：必须是判断句，表达核心观点
2. **逻辑类型**：通过 templateType 体现
3. **支撑数据**：通过 keyElements 和 dataRequirements 体现
4. **布局提示**：排版建议
5. **图像需求**：需要生成的图像

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
      "title": "AI 正在重塑企业竞争格局",  // ⭐ 观点性标题！必须是判断句
      "subtitle": "技术变革下的战略机遇",
      "templateType": "pillars",  // ⭐ 逻辑类型！并列论证用 pillars
      "logicType": "parallel",  // 明确逻辑类型：parallel/temporal/comparison/data/causal/hierarchical/case
      "contentBrief": "通过三个并列支柱论证AI如何改变竞争格局",
      "keyElements": [
        "效率提升：自动化流程减少人力成本",
        "决策优化：数据驱动的精准决策",
        "创新加速：AI辅助的产品创新"
      ],  // ⭐ 数据！支撑逻辑的具体内容
      "dataRequirements": [
        {"type": "percentage", "description": "效率提升百分比", "mustInclude": true},
        {"type": "metric", "description": "成本节约金额", "mustInclude": false}
      ],
      "layoutHints": [
        {"type": "alignment", "value": "center", "description": "三列均匀分布"}
      ],
      "imageRequirements": [
        {"position": "inline", "semanticContext": "AI与企业融合的概念图", "optional": false}
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
export class OutlinePlanningSkill
  implements ISkill<OutlinePlanningInput, OutlinePlan>
{
  private readonly logger = new Logger(OutlinePlanningSkill.name);

  // ISkill 接口必需属性
  readonly id = "slides-outline-planning";
  readonly name = "大纲规划";
  readonly description = "基于任务分解生成详细的页面大纲";
  readonly layer: SkillLayer = SKILL_LAYERS.PLANNING;
  readonly domain = "slides";
  readonly tags = ["slides", "planning", "outline", "architecture"];
  readonly version = "4.0.0";

  constructor(@Optional() private readonly llmFactory: LLMFactory) {}

  /**
   * 执行大纲规划 (ISkill 接口实现)
   */
  async execute(
    input: OutlinePlanningInput,
    context: SkillContext,
  ): Promise<SkillResult<OutlinePlan>> {
    const startTime = new Date();

    this.logger.log(
      `[execute] Starting outline planning for ${input.taskDecomposition.totalPages} pages, executionId: ${context.executionId}`,
    );

    try {
      const userMessage = this.buildUserMessage(input);

      // 使用 LLMFactory 调用 LLM
      const adapter = await this.llmFactory?.getAdapter("gpt-4o");
      if (!adapter) {
        throw new Error("Failed to get LLM adapter");
      }

      const response = await adapter.chat({
        messages: [
          { role: "system", content: OUTLINE_PLANNING_SYSTEM_PROMPT },
          { role: "user", content: userMessage },
        ],
        maxTokens: 8192,
        temperature: 0.3,
      });

      if (!response.content) {
        throw new Error("Empty response from LLM");
      }

      const outlinePlan = this.parseResponse(
        response.content,
        input.taskDecomposition,
      );

      const endTime = new Date();
      this.logger.log(
        `[execute] Outline planning complete: ${outlinePlan.pages.length} pages planned`,
      );

      return {
        success: true,
        data: outlinePlan,
        metadata: {
          executionId: context.executionId,
          startTime,
          endTime,
          duration: endTime.getTime() - startTime.getTime(),
          tokensUsed: response.usage?.totalTokens || 0,
        },
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      const endTime = new Date();
      this.logger.error(`[execute] Outline planning failed: ${errorMessage}`);
      return {
        success: false,
        error: {
          code: "OUTLINE_PLANNING_FAILED",
          message: errorMessage,
        },
        metadata: {
          executionId: context.executionId,
          startTime,
          endTime,
          duration: endTime.getTime() - startTime.getTime(),
        },
      };
    }
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
        logicType: "narrative",
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
        logicType: "narrative",
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
        logicType: "parallel",
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

    // v3.5: 注入章节分隔页
    let pagesWithChapters = this.ensureChapterSeparators(
      result,
      taskDecomposition,
    );

    // v3.2 增强验证管线
    let validatedPages = this.ensureTemplateDiversity(pagesWithChapters);
    validatedPages = this.validateViewpointTitles(validatedPages);
    validatedPages = this.validateLogicDataMatch(validatedPages);
    validatedPages = this.validateLogicCoherence(validatedPages);

    return validatedPages;
  }

  /**
   * 确保章节分隔页存在 (v3.5 新增)
   *
   * 规则：
   * 1. 如果有多个章节（>=2），在每个章节开始前插入 chapterTitle 页
   * 2. 跳过第一章（封面后直接进入目录，然后是第一章内容）
   * 3. 章节分隔页根据 taskDecomposition.chapters 信息生成
   */
  private ensureChapterSeparators(
    pages: PageOutline[],
    taskDecomposition: TaskDecomposition,
  ): PageOutline[] {
    const chapters = taskDecomposition.chapters || [];

    // 如果章节数少于 2，不需要分隔页
    if (chapters.length < 2) {
      this.logger.log(
        `[ensureChapterSeparators] Only ${chapters.length} chapter(s), skipping separators`,
      );
      return pages;
    }

    // 检查是否已经有足够的 chapterTitle 页
    const existingChapterTitles = pages.filter(
      (p) => p.templateType === "chapterTitle",
    );
    if (existingChapterTitles.length >= chapters.length - 1) {
      this.logger.log(
        `[ensureChapterSeparators] Already has ${existingChapterTitles.length} chapter separators`,
      );
      return pages;
    }

    const result: PageOutline[] = [];
    let currentChapterIndex = 0;
    let contentPageCount = 0; // 统计内容页数量（不包括封面、目录、章节分隔、结尾）

    for (let i = 0; i < pages.length; i++) {
      const page = pages[i];

      // 跳过封面、目录、章节分隔页、结尾页
      const isStructuralPage =
        page.templateType === "cover" ||
        page.templateType === "toc" ||
        page.templateType === "chapterTitle" ||
        page.templateType === "closing" ||
        page.templateType === "recommendations";

      if (!isStructuralPage) {
        // 计算每章应有的页数
        const pagesPerChapter = Math.ceil(
          (pages.length - 3) / chapters.length, // -3 是封面、目录、结尾
        );

        // 检查是否应该在这里插入新章节分隔页
        const shouldInsertChapter =
          currentChapterIndex > 0 && // 跳过第一章
          contentPageCount > 0 &&
          contentPageCount % pagesPerChapter === 0 &&
          currentChapterIndex < chapters.length;

        if (shouldInsertChapter) {
          const chapter = chapters[currentChapterIndex];
          const chapterPage: PageOutline = {
            pageNumber: result.length + 1,
            title: chapter.title,
            subtitle: `CHAPTER ${String(currentChapterIndex + 1).padStart(2, "0")}`,
            logicType: "narrative",
            templateType: "chapterTitle",
            contentBrief: `章节分隔页 - ${chapter.title}`,
            keyElements: chapter.keyPoints || [],
            layoutHints: [{ type: "alignment", value: "center" }],
            imageRequirements: [
              {
                position: "background",
                semanticContext: "专业章节分隔背景，深色主题",
                style: "abstract dark professional",
                optional: true,
              },
            ],
          };

          result.push(chapterPage);
          this.logger.log(
            `[ensureChapterSeparators] Injected chapter separator for: ${chapter.title}`,
          );
          currentChapterIndex++;
        }

        contentPageCount++;
      }

      // 如果当前页是第一个内容页，初始化章节索引
      if (!isStructuralPage && contentPageCount === 1) {
        currentChapterIndex = 1; // 第一章已经开始，下一个分隔页是第二章
      }

      result.push(page);
    }

    // 重新编号
    result.forEach((page, index) => {
      page.pageNumber = index + 1;
    });

    this.logger.log(
      `[ensureChapterSeparators] Final count: ${result.length} pages (${result.filter((p) => p.templateType === "chapterTitle").length} chapter separators)`,
    );

    return result;
  }

  /**
   * 确保模板多样性，避免连续使用相同模板 (v3.2 增强版)
   *
   * 规则：
   * 1. 相同模板不能连续出现超过2次
   * 2. 相同模板在整个PPT中出现不能超过3次（封面/目录除外）
   * 3. 如果违反规则，自动替换为备选模板
   */
  private ensureTemplateDiversity(pages: PageOutline[]): PageOutline[] {
    const result = [...pages];
    const MAX_CONSECUTIVE = 2; // 最多连续2次使用相同模板
    // 动态计算最大使用次数：最多占总页数的 20%，但不少于 2 次
    const MAX_TOTAL_USAGE = Math.max(2, Math.floor(pages.length * 0.2));

    // 用于交替的备选模板（按优先级排序）
    const alternativeTemplates: Record<PageTemplateType, PageTemplateType[]> = {
      splitLayout: ["multiColumn", "pillars", "caseStudy"],
      multiColumn: ["splitLayout", "pillars", "dashboard"],
      pillars: ["multiColumn", "splitLayout", "dashboard"],
      dashboard: ["comparison", "pillars", "multiColumn"],
      comparison: ["dashboard", "pillars", "riskOpportunity"],
      framework: ["pillars", "timeline", "multiColumn"],
      timeline: ["framework", "evolutionRoadmap", "pillars"],
      evolutionRoadmap: ["timeline", "framework", "pillars"],
      caseStudy: ["splitLayout", "multiColumn", "pillars"],
      cover: ["cover"],
      toc: ["toc"],
      chapterTitle: ["chapterTitle"], // v3.5: 章节分隔页不替换
      closing: ["recommendations"],
      questions: ["pillars", "multiColumn"],
      recommendations: ["pillars", "multiColumn", "splitLayout"],
      maturityModel: ["timeline", "pillars", "framework"],
      riskOpportunity: ["comparison", "pillars", "dashboard"],
    };

    // 统计模板使用次数
    const templateUsageCount = new Map<PageTemplateType, number>();

    // 第一遍：统计使用次数并检查连续性
    let consecutiveCount = 1;
    let lastTemplate: PageTemplateType | null = null;

    for (let i = 0; i < result.length; i++) {
      const page = result[i];
      const currentTemplate = page.templateType;

      // 跳过封面、目录、章节分隔页
      if (
        currentTemplate === "cover" ||
        currentTemplate === "toc" ||
        currentTemplate === "chapterTitle"
      ) {
        lastTemplate = currentTemplate;
        consecutiveCount = 1;
        continue;
      }

      // 更新使用次数
      templateUsageCount.set(
        currentTemplate,
        (templateUsageCount.get(currentTemplate) || 0) + 1,
      );

      // 检查连续性
      if (currentTemplate === lastTemplate) {
        consecutiveCount++;

        if (consecutiveCount > MAX_CONSECUTIVE) {
          // 需要替换模板
          const newTemplate = this.findBestAlternative(
            currentTemplate,
            alternativeTemplates,
            templateUsageCount,
            MAX_TOTAL_USAGE,
          );

          this.logger.warn(
            `[ensureTemplateDiversity] Page ${i + 1} uses ${currentTemplate} consecutively ${consecutiveCount} times, changing to ${newTemplate}`,
          );

          // 更新计数
          templateUsageCount.set(
            currentTemplate,
            (templateUsageCount.get(currentTemplate) || 1) - 1,
          );
          templateUsageCount.set(
            newTemplate,
            (templateUsageCount.get(newTemplate) || 0) + 1,
          );

          result[i] = {
            ...page,
            templateType: newTemplate,
            logicType: this.templateToLogic(newTemplate),
          };

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

    // 第二遍：检查总使用次数是否超标
    for (let i = 0; i < result.length; i++) {
      const page = result[i];
      const currentTemplate = page.templateType;

      if (
        currentTemplate === "cover" ||
        currentTemplate === "toc" ||
        currentTemplate === "chapterTitle"
      ) {
        continue;
      }

      const usage = templateUsageCount.get(currentTemplate) || 0;
      if (usage > MAX_TOTAL_USAGE) {
        const newTemplate = this.findBestAlternative(
          currentTemplate,
          alternativeTemplates,
          templateUsageCount,
          MAX_TOTAL_USAGE,
        );

        this.logger.warn(
          `[ensureTemplateDiversity] Template ${currentTemplate} used ${usage} times (max ${MAX_TOTAL_USAGE}), page ${i + 1} changing to ${newTemplate}`,
        );

        templateUsageCount.set(currentTemplate, usage - 1);
        templateUsageCount.set(
          newTemplate,
          (templateUsageCount.get(newTemplate) || 0) + 1,
        );

        result[i] = {
          ...page,
          templateType: newTemplate,
          logicType: this.templateToLogic(newTemplate),
        };
      }
    }

    return result;
  }

  /**
   * 找到最佳备选模板
   */
  private findBestAlternative(
    currentTemplate: PageTemplateType,
    alternativeTemplates: Record<PageTemplateType, PageTemplateType[]>,
    usageCount: Map<PageTemplateType, number>,
    maxUsage: number,
  ): PageTemplateType {
    const alternatives = alternativeTemplates[currentTemplate] || [
      "multiColumn",
    ];

    // 找到使用次数最少且未超标的备选
    for (const alt of alternatives) {
      const usage = usageCount.get(alt) || 0;
      if (usage < maxUsage) {
        return alt;
      }
    }

    // 如果都超标了，返回使用最少的
    let minUsage = Infinity;
    let bestAlt = alternatives[0];
    for (const alt of alternatives) {
      const usage = usageCount.get(alt) || 0;
      if (usage < minUsage) {
        minUsage = usage;
        bestAlt = alt;
      }
    }

    return bestAlt;
  }

  /**
   * 模板类型反推逻辑类型
   */
  private templateToLogic(templateType: PageTemplateType): PageLogicType {
    const mapping: Record<PageTemplateType, PageLogicType> = {
      cover: "narrative",
      toc: "narrative",
      chapterTitle: "narrative", // v3.5: 章节分隔页
      closing: "narrative",
      questions: "parallel",
      pillars: "parallel",
      multiColumn: "parallel",
      framework: "causal",
      timeline: "temporal",
      evolutionRoadmap: "temporal",
      dashboard: "data",
      comparison: "comparison",
      splitLayout: "case",
      caseStudy: "case",
      recommendations: "parallel",
      maturityModel: "hierarchical",
      riskOpportunity: "comparison",
    };
    return mapping[templateType] || "parallel";
  }

  /**
   * 验证并增强观点性标题 (v3.2 新增)
   *
   * 规则：
   * 1. 标题必须是判断句，不是描述性标题
   * 2. 封面/目录/结尾页除外
   * 3. 如果标题不符合要求，尝试转换
   */
  private validateViewpointTitles(pages: PageOutline[]): PageOutline[] {
    const result = [...pages];

    // 描述性标题的特征词（需要转换）
    const descriptivePatterns = [
      /^关于.+的?$/,
      /^.+介绍$/,
      /^.+概述$/,
      /^.+概况$/,
      /^.+说明$/,
      /^第.+章[:：]?/,
      /^.+背景$/,
      /^.+现状$/,
    ];

    // 跳过的页面类型
    const skipTypes: PageTemplateType[] = ["cover", "toc", "chapterTitle"];

    for (let i = 0; i < result.length; i++) {
      const page = result[i];

      // 跳过特殊页面
      if (skipTypes.includes(page.templateType)) {
        continue;
      }

      // 检查是否是描述性标题
      const isDescriptive = descriptivePatterns.some((pattern) =>
        pattern.test(page.title),
      );

      if (isDescriptive) {
        this.logger.warn(
          `[validateViewpointTitles] Page ${i + 1} has descriptive title: "${page.title}"`,
        );

        // 尝试从 contentBrief 或 keyElements 提取观点
        const viewpoint = this.extractViewpointFromContent(page);
        if (viewpoint) {
          result[i] = {
            ...page,
            title: viewpoint,
            subtitle: page.title, // 原标题降级为副标题
          };
          this.logger.log(
            `[validateViewpointTitles] Converted to viewpoint: "${viewpoint}"`,
          );
        }
      }
    }

    return result;
  }

  /**
   * 从页面内容中提取观点性标题
   */
  private extractViewpointFromContent(page: PageOutline): string | null {
    // 优先从 contentBrief 提取
    if (page.contentBrief) {
      // 如果 contentBrief 包含判断性语句，使用它
      const brief = page.contentBrief;
      if (
        brief.includes("是") ||
        brief.includes("成为") ||
        brief.includes("推动") ||
        brief.includes("决定") ||
        brief.includes("创造") ||
        brief.includes("带来")
      ) {
        // 截取前30个字符作为标题
        return brief.length > 30 ? brief.substring(0, 30) + "..." : brief;
      }
    }

    // 从 keyElements 构造
    if (page.keyElements && page.keyElements.length >= 2) {
      const count = page.keyElements.length;
      // 构造观点性标题
      const firstElement = page.keyElements[0].split(/[:：]/)[0];
      return `${count}大${firstElement}支撑发展`;
    }

    return null;
  }

  /**
   * 验证逻辑-数据匹配 (v3.2 增强版)
   *
   * 确保每页的数据能够支撑其逻辑类型
   * 自动补充缺失的数据需求
   */
  private validateLogicDataMatch(pages: PageOutline[]): PageOutline[] {
    const result = [...pages];

    // 逻辑类型对应的详细数据要求
    const logicDataRequirements: Record<
      PageLogicType,
      {
        requiredTypes: Array<
          "metric" | "trend" | "comparison" | "percentage" | "text"
        >;
        minCount: number;
        suggestedDataItems: string[];
      }
    > = {
      parallel: {
        requiredTypes: ["text"],
        minCount: 2,
        suggestedDataItems: ["要点标题", "要点描述"],
      },
      temporal: {
        requiredTypes: ["text"],
        minCount: 3,
        suggestedDataItems: [
          "时间节点1",
          "时间节点2",
          "时间节点3",
          "各节点事件描述",
        ],
      },
      comparison: {
        requiredTypes: ["comparison", "metric"],
        minCount: 2,
        suggestedDataItems: [
          "对比对象A",
          "对比对象B",
          "对比维度1",
          "对比维度2",
          "差异数据",
        ],
      },
      data: {
        requiredTypes: ["metric", "percentage"],
        minCount: 1,
        suggestedDataItems: [
          "核心数字",
          "数字单位",
          "同比/环比变化",
          "数据来源",
        ],
      },
      causal: {
        requiredTypes: ["text"],
        minCount: 2,
        suggestedDataItems: ["输入/原因", "过程/步骤", "输出/结果"],
      },
      hierarchical: {
        requiredTypes: ["text"],
        minCount: 2,
        suggestedDataItems: ["层级1", "层级2", "层级3", "各层级描述"],
      },
      case: {
        requiredTypes: ["text", "metric"],
        minCount: 1,
        suggestedDataItems: [
          "案例背景",
          "挑战/问题",
          "解决方案",
          "成果数据",
          "客户引言",
        ],
      },
      narrative: {
        requiredTypes: [],
        minCount: 0,
        suggestedDataItems: [],
      },
    };

    for (let i = 0; i < result.length; i++) {
      const page = result[i];
      const logicType = page.logicType || "parallel";
      const requirements = logicDataRequirements[logicType];

      // 跳过 narrative 类型
      if (logicType === "narrative") {
        continue;
      }

      let updatedPage = { ...page };
      const dataReqs = [...(page.dataRequirements || [])];
      const keyElements = [...(page.keyElements || [])];

      // 检查并补充 dataRequirements
      const hasRequiredData = dataReqs.some((req) =>
        requirements.requiredTypes.some((t) => req.type === t),
      );

      if (!hasRequiredData && requirements.requiredTypes.length > 0) {
        this.logger.warn(
          `[validateLogicDataMatch] Page ${i + 1} (${logicType}) missing required data, auto-adding...`,
        );

        // 自动补充数据需求（映射内部类型到 DataRequirement.type）
        const typeMapping: Record<
          string,
          "chart" | "table" | "metric" | "list"
        > = {
          metric: "metric",
          percentage: "metric",
          trend: "chart",
          comparison: "table",
          text: "list",
        };
        for (const dataItem of requirements.suggestedDataItems) {
          const internalType = requirements.requiredTypes[0] || "text";
          const mappedType = typeMapping[internalType] || "list";
          dataReqs.push({
            type: mappedType,
            description: dataItem,
            mustInclude: true,
          });
        }

        updatedPage.dataRequirements = dataReqs;
      }

      // 检查并补充 keyElements
      if (keyElements.length < requirements.minCount) {
        this.logger.warn(
          `[validateLogicDataMatch] Page ${i + 1} (${logicType}) has ${keyElements.length} elements, needs ${requirements.minCount}, auto-adding placeholders...`,
        );

        // 自动补充占位符
        const placeholders = this.generateKeyElementPlaceholders(
          logicType,
          requirements.minCount - keyElements.length,
          page.title,
        );

        updatedPage.keyElements = [...keyElements, ...placeholders];
      }

      result[i] = updatedPage;
    }

    return result;
  }

  /**
   * 生成 keyElements 占位符
   */
  private generateKeyElementPlaceholders(
    logicType: PageLogicType,
    count: number,
    _pageTitle: string,
  ): string[] {
    const placeholders: string[] = [];

    const templates: Record<PageLogicType, string[]> = {
      parallel: [
        "[支柱1：核心优势]",
        "[支柱2：差异化价值]",
        "[支柱3：发展潜力]",
        "[支柱4：战略意义]",
        "[支柱5：长期价值]",
      ],
      temporal: [
        "[阶段1：起步期]",
        "[阶段2：发展期]",
        "[阶段3：成熟期]",
        "[阶段4：转型期]",
      ],
      comparison: ["[对比维度1]", "[对比维度2]", "[差异点]", "[结论]"],
      data: ["[核心数字]", "[增长率]", "[市场份额]", "[趋势说明]"],
      causal: ["[原因/输入]", "[过程/机制]", "[结果/输出]"],
      hierarchical: ["[基础层]", "[核心层]", "[战略层]"],
      case: ["[案例背景]", "[解决方案]", "[成果验证]"],
      narrative: [],
    };

    const typeTemplates = templates[logicType] || templates.parallel;

    for (let i = 0; i < count && i < typeTemplates.length; i++) {
      placeholders.push(typeTemplates[i]);
    }

    return placeholders;
  }

  /**
   * 验证页面间逻辑连贯性 (v3.2 新增)
   *
   * 确保相邻页面有合理的逻辑过渡
   */
  private validateLogicCoherence(pages: PageOutline[]): PageOutline[] {
    const result = [...pages];

    // 定义合理的逻辑过渡
    const validTransitions: Record<PageLogicType, PageLogicType[]> = {
      narrative: [
        "parallel",
        "data",
        "case",
        "temporal",
        "comparison",
        "causal",
        "hierarchical",
      ],
      parallel: [
        "data",
        "case",
        "comparison",
        "temporal",
        "causal",
        "hierarchical",
        "parallel",
      ],
      temporal: [
        "data",
        "comparison",
        "case",
        "parallel",
        "causal",
        "hierarchical",
      ],
      comparison: [
        "data",
        "case",
        "parallel",
        "temporal",
        "causal",
        "hierarchical",
      ],
      data: [
        "parallel",
        "case",
        "comparison",
        "temporal",
        "causal",
        "hierarchical",
      ],
      causal: [
        "data",
        "parallel",
        "case",
        "comparison",
        "temporal",
        "hierarchical",
      ],
      hierarchical: [
        "data",
        "parallel",
        "case",
        "comparison",
        "temporal",
        "causal",
      ],
      case: [
        "data",
        "parallel",
        "comparison",
        "temporal",
        "causal",
        "hierarchical",
      ],
    };

    // 检测突然的逻辑跳跃
    for (let i = 1; i < result.length - 1; i++) {
      const prevPage = result[i - 1];
      const currentPage = result[i];

      const prevLogic = prevPage.logicType || "narrative";
      const currentLogic = currentPage.logicType || "parallel";

      // 如果不在合理过渡列表中，记录警告
      if (!validTransitions[prevLogic]?.includes(currentLogic)) {
        this.logger.warn(
          `[validateLogicCoherence] Abrupt transition from page ${i} (${prevLogic}) to page ${i + 1} (${currentLogic})`,
        );
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
    const templateType = this.validateTemplateType(raw.templateType);
    return {
      pageNumber:
        typeof raw.pageNumber === "number" ? raw.pageNumber : pageNumber,
      title: String(raw.title || `第 ${pageNumber} 页`),
      subtitle: raw.subtitle ? String(raw.subtitle) : undefined,
      logicType: this.validateLogicType(raw.logicType, templateType),
      templateType,
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
   * 验证逻辑类型，如果未提供则根据模板类型推断
   */
  private validateLogicType(
    type: unknown,
    templateType: PageTemplateType,
  ): PageLogicType {
    const validTypes: PageLogicType[] = [
      "parallel",
      "temporal",
      "comparison",
      "data",
      "causal",
      "hierarchical",
      "case",
      "narrative",
    ];

    if (
      typeof type === "string" &&
      validTypes.includes(type as PageLogicType)
    ) {
      return type as PageLogicType;
    }

    // 根据模板类型推断逻辑类型
    const templateToLogic: Record<PageTemplateType, PageLogicType> = {
      cover: "narrative",
      toc: "narrative",
      chapterTitle: "narrative", // v3.5: 章节分隔页
      closing: "narrative",
      questions: "parallel",
      pillars: "parallel",
      multiColumn: "parallel",
      framework: "causal",
      timeline: "temporal",
      evolutionRoadmap: "temporal",
      dashboard: "data",
      comparison: "comparison",
      splitLayout: "case",
      caseStudy: "case",
      recommendations: "parallel",
      maturityModel: "hierarchical",
      riskOpportunity: "comparison",
    };

    return templateToLogic[templateType] || "parallel";
  }

  /**
   * 验证模板类型
   */
  private validateTemplateType(type: unknown): PageTemplateType {
    const validTypes: PageTemplateType[] = [
      "cover",
      "toc",
      "chapterTitle", // v3.5: 章节分隔页
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
      logicType: "narrative",
      templateType: "cover",
      contentBrief: "封面页",
      keyElements: ["标题", "副标题", "日期"],
      layoutHints: [{ type: "alignment", value: "center" }],
    });

    // 目录
    pages.push({
      pageNumber: 2,
      title: "目录",
      logicType: "narrative",
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
        logicType: "case",
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
      logicType: "parallel",
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
