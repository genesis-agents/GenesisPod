/**
 * Slides Engine v3.0 - Four Step Design Skill
 *
 * 四步设计技能：Genspark 风格的四步页面设计流程
 * 使用 Renderer 角色 (CHAT + QUALITY_FIRST)
 *
 * 四步流程：
 * 1. Drafting - 风格定调
 * 2. Refining Layout - 布局细化
 * 3. Planning Visuals - 视觉规划
 * 4. Formulating HTML - HTML 生成
 */

import { Injectable, Logger } from "@nestjs/common";
import {
  MultiModelService,
  RoleCallInput,
} from "../orchestrator/multi-model.service";
import {
  PageOutline,
  PageContent,
  PageDesign,
  GlobalStyles,
  GENSPARK_DESIGN_SYSTEM,
  CDN_RESOURCES,
} from "../checkpoint/checkpoint.types";

/**
 * 四步设计输入
 */
export interface FourStepDesignInput {
  /** 页面大纲 */
  pageOutline: PageOutline;
  /** 页面内容 */
  pageContent: PageContent;
  /** 全局样式 */
  globalStyles: GlobalStyles;
  /** 会话 ID */
  sessionId?: string;
}

/**
 * 四步设计结果
 */
export interface FourStepDesignResult {
  /** 设计过程 */
  design: PageDesign;
  /** 最终 HTML */
  html: string;
  /** 设计耗时 */
  durationMs: number;
}

/**
 * 四步设计系统提示词
 */
const FOUR_STEP_DESIGN_SYSTEM_PROMPT = `你是一位专业的 PPT 页面设计师，擅长创建高端商务风格的幻灯片。

## 设计原则

采用 Genspark 风格的深色主题设计：
- 背景色: #0F172A (深蓝黑)
- 卡片背景: #1E293B
- 边框色: #334155
- 强调色: #D4AF37 (金色)
- 辅助色: #3B82F6 (蓝色)
- 主文本: #F8FAFC
- 次文本: #94A3B8

## 四步设计流程

### Step 1: Drafting (风格定调)
确定页面的整体风格、核心元素和情绪基调。

### Step 2: Refining Layout (布局细化)
规划对齐方式、图形位置、间距和比例。

### Step 3: Planning Visuals (视觉规划)
确定背景色、强调色、装饰元素和阴影效果。

### Step 4: Formulating HTML (HTML 生成)
生成最终的 HTML 代码，使用内联样式。

## 输出格式

严格按照以下 JSON 格式输出：

\`\`\`json
{
  "step1_drafting": {
    "style": "McKinsey-style professional",
    "coreElements": ["title", "subtitle", "data visualization"],
    "mood": "authoritative and data-driven"
  },
  "step2_refiningLayout": {
    "alignment": "left-aligned title, centered content",
    "graphicsPosition": "right side",
    "spacing": "generous whitespace, 80px bottom safe zone",
    "ratio": "60-40 text-visual split"
  },
  "step3_planningVisuals": {
    "backgroundColor": "#0F172A",
    "accentColors": ["#D4AF37", "#3B82F6"],
    "decorations": ["gradient overlay", "subtle grid pattern"],
    "shadows": "soft drop shadows on cards"
  },
  "step4_formulatingHTML": {
    "html": "<div style=\\"...\\">[完整的 HTML 代码]</div>",
    "externalDependencies": ["tailwind", "fontawesome"]
  }
}
\`\`\`

## HTML 规范

1. **画布尺寸**: 1280x720px
2. **内边距**: 50px 80px 80px 80px
3. **底部安全区**: 80px (避免放置关键内容)
4. **字体**: Noto Sans SC
5. **使用内联样式**: 确保样式完整独立
6. **响应式图标**: 使用 Font Awesome
7. **数据可视化**: 可使用 ECharts（通过 script 标签）`;

@Injectable()
export class FourStepDesignSkill {
  private readonly logger = new Logger(FourStepDesignSkill.name);

  constructor(private readonly multiModel: MultiModelService) {}

  /**
   * 执行四步设计
   */
  async execute(input: FourStepDesignInput): Promise<FourStepDesignResult> {
    const startTime = Date.now();

    this.logger.log(
      `[execute] Starting four-step design for page ${input.pageOutline.pageNumber}`,
    );

    const userMessage = this.buildUserMessage(input);

    const roleCall: RoleCallInput = {
      role: "renderer",
      messages: [
        { role: "system", content: FOUR_STEP_DESIGN_SYSTEM_PROMPT },
        { role: "user", content: userMessage },
      ],
      maxTokens: 8192,
      temperature: 0.2,
      metadata: {
        sessionId: input.sessionId,
        pageNumber: input.pageOutline.pageNumber,
        phase: "four_step_design",
      },
    };

    const result = await this.multiModel.callByRole(roleCall);

    if (!result.success || !result.content) {
      this.logger.error("[execute] AI call failed:", result.error);
      throw new Error(`Four-step design failed: ${result.error}`);
    }

    const { design, html } = this.parseResponse(result.content, input);

    const durationMs = Date.now() - startTime;

    this.logger.log(
      `[execute] Four-step design complete for page ${input.pageOutline.pageNumber} in ${durationMs}ms`,
    );

    return { design, html, durationMs };
  }

  /**
   * 构建用户消息
   */
  private buildUserMessage(input: FourStepDesignInput): string {
    const { pageOutline, pageContent, globalStyles } = input;

    return `## 页面信息

### 页码
${pageOutline.pageNumber}

### 页面类型
${pageOutline.templateType}

### 标题
${pageOutline.title}

### 副标题
${pageOutline.subtitle || "无"}

### 内容简述
${pageOutline.contentBrief}

### 关键元素
${pageOutline.keyElements.join("\n- ")}

## 页面内容

### 主标题
${pageContent.title}

### 副标题
${pageContent.subtitle || "无"}

### 内容区块
${JSON.stringify(pageContent.sections, null, 2)}

### 脚注
${pageContent.footer || "无"}

## 全局样式

${JSON.stringify(globalStyles, null, 2)}

## CDN 资源

- Tailwind: ${CDN_RESOURCES.tailwind}
- Font Awesome: ${CDN_RESOURCES.fontAwesome}
- ECharts: ${CDN_RESOURCES.echarts}
- Noto Sans SC: ${CDN_RESOURCES.notoSansSC}

## 请求

请执行四步设计流程，生成该页面的设计方案和 HTML 代码。`;
  }

  /**
   * 解析 AI 响应
   */
  private parseResponse(
    content: string,
    input: FourStepDesignInput,
  ): { design: PageDesign; html: string } {
    const jsonMatch = content.match(/```json\s*([\s\S]*?)\s*```/);
    const jsonStr = jsonMatch ? jsonMatch[1] : content;

    try {
      const parsed = JSON.parse(jsonStr);
      const design = this.normalizeDesign(parsed);
      const html = this.extractHtml(parsed, input);

      return { design, html };
    } catch (error) {
      this.logger.error("[parseResponse] JSON parse error:", error);
      return {
        design: this.createFallbackDesign(),
        html: this.createFallbackHtml(input),
      };
    }
  }

  /**
   * 规范化设计结果
   */
  private normalizeDesign(parsed: Record<string, unknown>): PageDesign {
    const step1 = parsed.step1_drafting as Record<string, unknown> | undefined;
    const step2 = parsed.step2_refiningLayout as
      | Record<string, unknown>
      | undefined;
    const step3 = parsed.step3_planningVisuals as
      | Record<string, unknown>
      | undefined;
    const step4 = parsed.step4_formulatingHTML as
      | Record<string, unknown>
      | undefined;

    return {
      step1_drafting: {
        style: String(step1?.style || "professional"),
        coreElements: Array.isArray(step1?.coreElements)
          ? step1.coreElements.map(String)
          : [],
        mood: String(step1?.mood || "professional"),
      },
      step2_refiningLayout: {
        alignment: String(step2?.alignment || "left-aligned"),
        graphicsPosition: String(step2?.graphicsPosition || "right"),
        spacing: String(step2?.spacing || "standard"),
        ratio: step2?.ratio ? String(step2.ratio) : undefined,
      },
      step3_planningVisuals: {
        backgroundColor: String(
          step3?.backgroundColor || GENSPARK_DESIGN_SYSTEM.backgroundColor,
        ),
        accentColors: Array.isArray(step3?.accentColors)
          ? step3.accentColors.map(String)
          : [GENSPARK_DESIGN_SYSTEM.accentColor],
        decorations: Array.isArray(step3?.decorations)
          ? step3.decorations.map(String)
          : [],
        shadows: step3?.shadows ? String(step3.shadows) : undefined,
      },
      step4_formulatingHTML: {
        html: String(step4?.html || ""),
        css: step4?.css ? String(step4.css) : undefined,
        externalDependencies: Array.isArray(step4?.externalDependencies)
          ? step4.externalDependencies.map(String)
          : [],
      },
    };
  }

  /**
   * 提取 HTML
   */
  private extractHtml(
    parsed: Record<string, unknown>,
    input: FourStepDesignInput,
  ): string {
    const step4 = parsed.step4_formulatingHTML as
      | Record<string, unknown>
      | undefined;

    if (step4?.html && typeof step4.html === "string") {
      return this.wrapHtmlWithContainer(step4.html, input.globalStyles);
    }

    return this.createFallbackHtml(input);
  }

  /**
   * 用容器包装 HTML
   */
  private wrapHtmlWithContainer(
    html: string,
    globalStyles: GlobalStyles,
  ): string {
    // 如果 HTML 已经包含容器，直接返回
    if (html.includes("width: 1280px") || html.includes("width:1280px")) {
      return html;
    }

    return `
<div style="
  width: ${globalStyles.canvasWidth}px;
  height: ${globalStyles.canvasHeight}px;
  background-color: ${globalStyles.backgroundColor};
  font-family: ${globalStyles.fontFamily};
  color: ${globalStyles.textPrimary};
  padding: ${globalStyles.pagePadding};
  box-sizing: border-box;
  position: relative;
  overflow: hidden;
">
  ${html}
</div>`.trim();
  }

  /**
   * 创建降级设计
   */
  private createFallbackDesign(): PageDesign {
    return {
      step1_drafting: {
        style: "professional",
        coreElements: ["title", "content"],
        mood: "professional",
      },
      step2_refiningLayout: {
        alignment: "left-aligned",
        graphicsPosition: "right",
        spacing: "standard",
      },
      step3_planningVisuals: {
        backgroundColor: GENSPARK_DESIGN_SYSTEM.backgroundColor,
        accentColors: [GENSPARK_DESIGN_SYSTEM.accentColor],
        decorations: [],
      },
      step4_formulatingHTML: {
        html: "",
        externalDependencies: [],
      },
    };
  }

  /**
   * 创建降级 HTML
   */
  private createFallbackHtml(input: FourStepDesignInput): string {
    const { pageContent, globalStyles } = input;

    return `
<div style="
  width: ${globalStyles.canvasWidth}px;
  height: ${globalStyles.canvasHeight}px;
  background-color: ${globalStyles.backgroundColor};
  font-family: ${globalStyles.fontFamily};
  color: ${globalStyles.textPrimary};
  padding: ${globalStyles.pagePadding};
  box-sizing: border-box;
  position: relative;
">
  <h1 style="
    font-size: 36px;
    font-weight: 900;
    color: ${globalStyles.textPrimary};
    margin-bottom: 16px;
  ">${pageContent.title}</h1>

  ${
    pageContent.subtitle
      ? `
  <h2 style="
    font-size: 20px;
    font-weight: 400;
    color: ${globalStyles.textSecondary};
    margin-bottom: 32px;
  ">${pageContent.subtitle}</h2>
  `
      : ""
  }

  <div style="
    display: flex;
    gap: 24px;
    margin-top: 32px;
  ">
    ${pageContent.sections
      .map(
        (section) => `
    <div style="
      flex: 1;
      background: ${globalStyles.cardBackground};
      border: 1px solid ${globalStyles.borderColor};
      border-radius: 12px;
      padding: 24px;
    ">
      ${typeof section.content === "string" ? section.content : JSON.stringify(section.content)}
    </div>
    `,
      )
      .join("")}
  </div>

  ${
    pageContent.footer
      ? `
  <div style="
    position: absolute;
    bottom: 24px;
    left: 80px;
    right: 80px;
    font-size: 12px;
    color: ${globalStyles.textSecondary};
  ">${pageContent.footer}</div>
  `
      : ""
  }
</div>`.trim();
  }

  /**
   * 验证 HTML 质量
   */
  validateHtml(html: string): { valid: boolean; issues: string[] } {
    const issues: string[] = [];

    // 检查基本结构
    if (!html.includes("width: 1280") && !html.includes("width:1280")) {
      issues.push("Missing canvas width (1280px)");
    }

    if (!html.includes("height: 720") && !html.includes("height:720")) {
      issues.push("Missing canvas height (720px)");
    }

    // 检查必要样式
    if (!html.includes("font-family")) {
      issues.push("Missing font-family declaration");
    }

    // 检查底部安全区
    if (html.includes("bottom: 0") || html.includes("bottom:0")) {
      issues.push("Content may violate bottom safe zone");
    }

    return {
      valid: issues.length === 0,
      issues,
    };
  }
}
