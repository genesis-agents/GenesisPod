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
  PageTemplateType,
} from "../checkpoint/checkpoint.types";
import { getTemplate } from "../templates";

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
 * 四步设计系统提示词 - 优化版：内容密度 + 布局多样性 + 真实图表
 */
const FOUR_STEP_DESIGN_SYSTEM_PROMPT = `你是一位世界级的 PPT 设计大师，专精于创建信息密度高、视觉冲击力强的商务演示文稿。

## 设计系统

### 色彩规范 (Genspark 深色主题)
- 背景色: #0F172A (深蓝黑)
- 卡片背景: #1E293B (带 rgba 透明度变体)
- 边框色: #334155 (细边框) / #475569 (强调边框)
- 强调色: #D4AF37 (金色 - 数据高亮)
- 辅助色: #3B82F6 (蓝色 - 图表) / #10B981 (绿色 - 正向) / #EF4444 (红色 - 负向)
- 主文本: #F8FAFC
- 次文本: #94A3B8
- 渐变: linear-gradient(135deg, #0F172A 0%, #1E293B 100%)

### 字体规范
- 标题: 36-48px, font-weight: 900
- 副标题: 20-24px, font-weight: 500
- 正文: 16-18px, font-weight: 400
- 数据大字: 56-72px, font-weight: 900
- 图表标签: 12-14px

## 核心设计原则

### 1. 内容密度至上
- **禁止空白幻灯片** - 每页必须信息充实
- **3-5 个内容区块** - 使用卡片、列表、数据框组合
- **视觉层次** - 标题→数据→内容→脚注 四层结构
- **填满有效空间** - 内边距内的区域必须被有效利用

### 2. 布局多样性（按页面类型）
- **封面页**: 大标题 + 副标题 + 装饰元素 + **3个核心数据卡片**（必须！）
- **数据页**: 左侧大数据 + 右侧列表/图表 (60-40 分割)
- **对比页**: 双列卡片布局 (50-50 分割)
- **流程页**: 横向流程图 + 说明文字
- **列表页**: 图标列表 + 侧边数据卡片
- **总结页**: 核心数据居中 + 要点环绕

### 特别说明：封面页设计
封面页**必须**包含以下元素，占满画布：
1. 主标题 (52px, 粗体)
2. 副标题 (24px, 灰色)
3. **3-4个数据亮点卡片** - 展示关键数字（如市值、用户数、增长率等）
4. 装饰元素（渐变光晕、装饰线等）
5. 底部元信息（日期、作者等）

封面页示例结构：
\`\`\`html
<div style="display: flex; flex-direction: column; height: 100%;">
  <div style="flex: 1;"><!-- 标题区 --></div>
  <div style="display: flex; gap: 24px; justify-content: center;">
    <!-- 3-4个数据卡片 -->
    <div style="背景卡片样式"><span style="大数字">500+</span><span>科技企业</span></div>
    <div style="背景卡片样式"><span style="大数字">$10B</span><span>产值规模</span></div>
    <div style="背景卡片样式"><span style="大数字">25%</span><span>年增长率</span></div>
  </div>
  <div><!-- 底部信息 --></div>
</div>
\`\`\`

### 3. 数据可视化要求
当内容包含 chart 类型时，**必须**使用 ECharts 生成真实图表：
\`\`\`html
<div id="chart-{pageNumber}" style="width: 500px; height: 300px;"></div>
<script src="https://cdn.jsdelivr.net/npm/echarts@5.4.3/dist/echarts.min.js"></script>
<script>
  var chart = echarts.init(document.getElementById('chart-{pageNumber}'));
  chart.setOption({
    backgroundColor: 'transparent',
    textStyle: { color: '#94A3B8' },
    // ... ECharts 配置
  });
</script>
\`\`\`

### 4. 视觉元素要求
- **图标**: 使用 Font Awesome 图标丰富视觉
- **卡片**: 圆角 12px, 内边距 24px, 微妙阴影
- **分隔线**: 使用渐变色分隔线
- **数据高亮**: 关键数字使用金色 #D4AF37

## 四步设计流程

### Step 1: Drafting (内容定位)
- 确定页面核心信息
- 识别需要突出的数据点
- 选择最适合的布局类型

### Step 2: Refining Layout (布局规划)
- 选择分栏比例 (60-40 / 50-50 / 70-30)
- 规划内容区块位置
- 确保视觉重心平衡

### Step 3: Planning Visuals (视觉增强)
- 添加图标和装饰元素
- 规划颜色使用（强调色、对比色）
- 设计数据可视化方案

### Step 4: Formulating HTML (代码实现)
- 生成完整、独立的 HTML
- 包含所有内联样式
- 集成 ECharts（如有图表）

## 输出格式

\`\`\`json
{
  "step1_drafting": {
    "style": "data-driven professional",
    "coreElements": ["核心元素列表"],
    "mood": "authoritative and impactful",
    "layoutType": "data-highlight / comparison / process / summary"
  },
  "step2_refiningLayout": {
    "alignment": "具体对齐方案",
    "graphicsPosition": "图表/图标位置",
    "spacing": "间距规划",
    "ratio": "分栏比例"
  },
  "step3_planningVisuals": {
    "backgroundColor": "#0F172A",
    "accentColors": ["使用的强调色"],
    "decorations": ["装饰元素"],
    "dataVisualization": "图表类型和配置思路"
  },
  "step4_formulatingHTML": {
    "html": "完整的 HTML 代码（见下方规范）",
    "externalDependencies": ["依赖资源"]
  }
}
\`\`\`

## HTML 规范

1. **画布**: 1280x720px, overflow: hidden
2. **内边距**: 50px 80px 80px 80px
3. **底部安全区**: 80px (脚注区域)
4. **字体**: 'Noto Sans SC', sans-serif
5. **完全内联样式**: 不依赖外部 CSS
6. **ECharts**: 有图表数据时必须渲染真实图表
7. **Font Awesome**: 使用图标增强视觉效果
8. **响应式**: 使用 flexbox/grid 布局

## 示例 HTML 结构

\`\`\`html
<div style="width: 1280px; height: 720px; background: linear-gradient(135deg, #0F172A 0%, #1E293B 100%); font-family: 'Noto Sans SC', sans-serif; color: #F8FAFC; padding: 50px 80px 80px 80px; box-sizing: border-box; position: relative; overflow: hidden;">
  <!-- 标题区 -->
  <h1 style="font-size: 42px; font-weight: 900; margin: 0 0 8px 0;">主标题带数据</h1>
  <p style="font-size: 20px; color: #94A3B8; margin: 0 0 32px 0;">副标题说明</p>

  <!-- 内容区 (Flexbox 布局) -->
  <div style="display: flex; gap: 32px; height: calc(100% - 150px);">
    <!-- 左侧数据卡片 -->
    <div style="flex: 0 0 40%; background: rgba(30, 41, 59, 0.8); border: 1px solid #334155; border-radius: 12px; padding: 32px;">
      <div style="font-size: 64px; font-weight: 900; color: #D4AF37;">86%</div>
      <div style="font-size: 18px; color: #94A3B8;">指标名称</div>
    </div>

    <!-- 右侧列表 -->
    <div style="flex: 1;">
      <!-- 列表项... -->
    </div>
  </div>

  <!-- 脚注 -->
  <div style="position: absolute; bottom: 24px; left: 80px; right: 80px; font-size: 12px; color: #64748B;">
    数据来源: XXX | 更新时间: 2024
  </div>
</div>
\`\`\`

记住：**每一页都必须是信息丰富、视觉专业的高端演示**。`;

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

## 参考模板

以下是该页面类型的参考模板，请参考其布局结构和设计风格，但要根据实际内容进行调整和创新：

\`\`\`html
${this.getTemplateReference(pageOutline.templateType)}
\`\`\`

## 请求

请执行四步设计流程，生成该页面的设计方案和 HTML 代码。
注意：
1. 参考模板的结构和风格，但要根据实际内容进行调整
2. 所有内容必须来自"页面内容"部分，不要使用模板中的占位符
3. 确保生成的 HTML 完整、独立，可以直接渲染`;
  }

  /**
   * 获取模板参考
   */
  private getTemplateReference(templateType: PageTemplateType): string {
    const template = getTemplate(templateType);
    // 截取模板核心结构，避免过长
    const html = template.html;
    if (html.length > 3000) {
      return html.substring(0, 3000) + "\n<!-- 模板已截断，请参考结构 -->";
    }
    return html;
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
