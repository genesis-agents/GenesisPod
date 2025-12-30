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
  GeneratedImage,
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
  /** 预生成的图片（背景图等） */
  images?: GeneratedImage[];
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

### 1. 内容密度 (⚠️ 封面页除外)
**注意：封面页(cover)不适用此规则，封面页必须极简！**

对于非封面页：
- **禁止空白幻灯片** - 每页必须信息充实
- **3-5 个内容区块** - 使用卡片、列表、数据框组合
- **视觉层次** - 标题→数据→内容→脚注 四层结构
- **填满有效空间** - 内边距内的区域必须被有效利用

### 2. 布局多样性（按页面类型）

#### ⭐ 封面页 (cover) - 极简主义原则
**封面页是演示文稿的门面，必须简洁、大气、有冲击力！**

⚠️ **封面页严禁包含**：
- ❌ 数据卡片 (任何 stat 或数字展示)
- ❌ 列表要点
- ❌ 图表
- ❌ 大段文字

✅ **封面页只需包含**：
1. **主标题** - 52-64px, 粗体, 一句话概括主题
2. **副标题** - 20-24px, 灰色, 补充说明
3. **装饰元素** - 渐变光晕、装饰线、品牌标识
4. **底部信息** - 演讲者、日期（可选）

封面页示例结构：
\`\`\`html
<div style="display: flex; flex-direction: column; justify-content: center; height: 100%;">
  <!-- 顶部装饰线 -->
  <div style="width: 80px; height: 4px; background: linear-gradient(90deg, #D4AF37, #3B82F6); margin-bottom: 32px;"></div>
  <!-- 主标题 - 简洁有力 -->
  <h1 style="font-size: 56px; font-weight: 900; margin: 0 0 20px 0;">渥太华KANATA</h1>
  <!-- 副标题 - 一句话定位 -->
  <p style="font-size: 24px; color: #94A3B8; margin: 0;">加拿大硅谷的崛起与未来</p>
  <!-- 底部信息 -->
  <div style="margin-top: auto;"><span style="color: #64748B;">2024年度报告 | DeepDive Research</span></div>
</div>
\`\`\`

#### 其他页面类型
- **数据页**: 左侧大数据 + 右侧列表/图表 (60-40 分割)
- **对比页**: 双列卡片布局 (50-50 分割)
- **流程页**: 横向流程图 + 说明文字
- **列表页**: 图标列表 + 侧边数据卡片
- **总结页**: 核心数据居中 + 要点环绕

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

### 5. ⭐ 背景图使用规范（重要！）

**当提供了背景图 URL 时，必须在 HTML 中使用！**

背景图应用方式：
\`\`\`html
<div style="
  width: 1280px;
  height: 720px;
  background-image: url('PROVIDED_BACKGROUND_URL');
  background-size: cover;
  background-position: center;
  position: relative;
">
  <!-- 半透明叠加层确保文字可读 -->
  <div style="
    position: absolute;
    inset: 0;
    background: linear-gradient(135deg, rgba(15, 23, 42, 0.85) 0%, rgba(30, 41, 59, 0.9) 100%);
  "></div>

  <!-- 内容区域 (z-index: 1) -->
  <div style="position: relative; z-index: 1; padding: 50px 80px; height: 100%; box-sizing: border-box;">
    <!-- 页面内容 -->
  </div>
</div>
\`\`\`

**不同页面类型的叠加层透明度（确保文字清晰可读！）：**
- **封面页 (cover)**: rgba(15, 23, 42, 0.7) 至 rgba(15, 23, 42, 0.8) - 允许背景透出但文字必须清晰
- **数据页 (dashboard)**: rgba(15, 23, 42, 0.88) 至 rgba(15, 23, 42, 0.92) - 较深，确保数据清晰
- **内容页**: rgba(15, 23, 42, 0.82) 至 rgba(15, 23, 42, 0.88) - 标准透明度
- **总结页**: rgba(15, 23, 42, 0.78) 至 rgba(15, 23, 42, 0.85) - 中等透明度

⚠️ **文字可读性优先**：如果背景图颜色较浅或对比度不足，请使用更深的叠加层（增加 0.05-0.1 的透明度）

⚠️ **没有背景图时**：使用纯色渐变背景
\`\`\`html
background: linear-gradient(135deg, #0F172A 0%, #1E293B 100%);
\`\`\`

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

    const { design, html: rawHtml } = this.parseResponse(result.content, input);

    // 修复误用的图片占位符（AI 可能将占位符作为文本输出）
    const fixedHtml = this.fixMisusedImagePlaceholders(rawHtml);

    // 替换图片占位符为真实 URL
    const html = this.replaceImagePlaceholders(fixedHtml, input.images);

    const durationMs = Date.now() - startTime;

    this.logger.log(
      `[execute] Four-step design complete for page ${input.pageOutline.pageNumber} in ${durationMs}ms`,
    );

    return { design, html, durationMs };
  }

  /**
   * 替换 HTML 中的图片占位符为真实 URL
   */
  private replaceImagePlaceholders(
    html: string,
    images?: GeneratedImage[],
  ): string {
    if (!images || images.length === 0) {
      return html;
    }

    let result = html;

    // 替换背景图占位符
    const backgroundImage = images.find((img) => img.position === "background");
    if (backgroundImage?.url) {
      result = result.replace(/\{\{BACKGROUND_IMAGE\}\}/g, backgroundImage.url);
    }

    // 替换内联图片占位符
    const inlineImages = images.filter((img) => img.position !== "background");
    inlineImages.forEach((img, index) => {
      if (img.url) {
        const placeholder = `{{INLINE_IMAGE_${index + 1}}}`;
        result = result.replace(
          new RegExp(placeholder.replace(/[{}]/g, "\\$&"), "g"),
          img.url,
        );
      }
    });

    return result;
  }

  /**
   * 构建用户消息
   * 重要：不要将 base64 图片数据发送给 AI，否则会导致 token 爆炸（100KB 图片 = 25000+ tokens）
   * 使用占位符 {{BACKGROUND_IMAGE}} 和 {{INLINE_IMAGE_N}}，之后替换为真实 URL
   */
  private buildUserMessage(input: FourStepDesignInput): string {
    const { pageOutline, pageContent, globalStyles, images } = input;

    // 获取背景图信息（但不包含 base64 数据）
    const backgroundImage = images?.find(
      (img) => img.position === "background",
    );
    const inlineImages =
      images?.filter((img) => img.position !== "background") || [];

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

## ⭐ 图片资源（必须使用！）

${
  backgroundImage
    ? `### 背景图（必须使用！）
已预生成背景图，语义：${backgroundImage.semanticContext || "专业背景"}

**使用方式**：在 HTML 中使用占位符 \`{{BACKGROUND_IMAGE}}\` 作为 background-image 的 URL，系统会自动替换为真实图片。

示例：
\`\`\`html
background-image: url('{{BACKGROUND_IMAGE}}');
\`\`\`

请添加半透明叠加层确保文字可读。
`
    : `### 背景图
无预生成背景图，请使用纯色渐变背景：linear-gradient(135deg, #0F172A 0%, #1E293B 100%)
`
}

${
  inlineImages.length > 0
    ? `### 内联图片（必须正确使用！）

⚠️ **重要**：内联图片占位符必须放在 \`<img>\` 标签的 \`src\` 属性中，**绝对不要作为文本内容输出**！

${inlineImages.map((img, i) => `- 图片${i + 1}: 占位符 \`{{INLINE_IMAGE_${i + 1}}}\` (语义: ${img.semanticContext || "无"})`).join("\n")}

**正确使用方式**：
\`\`\`html
<img src="{{INLINE_IMAGE_1}}" style="width: 100%; height: auto; border-radius: 8px;" alt="描述" />
\`\`\`

**错误用法（禁止！）**：
\`\`\`html
<!-- 禁止！这会导致图片 URL 显示为文本 -->
<p>{{INLINE_IMAGE_1}}</p>
<span>图片：{{INLINE_IMAGE_1}}</span>
\`\`\`
`
    : ""
}

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
3. 确保生成的 HTML 完整、独立，可以直接渲染
4. **⭐ 使用图片占位符 {{BACKGROUND_IMAGE}} 或 {{INLINE_IMAGE_N}}**，系统会自动替换为真实图片 URL`;
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
    // 尝试多种方式提取 JSON
    let jsonStr = content;

    // 方式1: 匹配 ```json ... ``` 代码块
    const jsonCodeBlockMatch = content.match(/```json\s*([\s\S]*?)\s*```/);
    if (jsonCodeBlockMatch) {
      jsonStr = jsonCodeBlockMatch[1].trim();
    } else {
      // 方式2: 匹配 ``` ... ``` 代码块（无语言标记）
      const codeBlockMatch = content.match(/```\s*([\s\S]*?)\s*```/);
      if (codeBlockMatch) {
        jsonStr = codeBlockMatch[1].trim();
      } else {
        // 方式3: 尝试找到第一个 { 和最后一个 }
        const firstBrace = content.indexOf("{");
        const lastBrace = content.lastIndexOf("}");
        if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
          jsonStr = content.slice(firstBrace, lastBrace + 1);
        }
      }
    }

    // 尝试解析 JSON
    try {
      const parsed = JSON.parse(jsonStr);
      const design = this.normalizeDesign(parsed);
      const html = this.extractHtml(parsed, input);
      return { design, html };
    } catch (error) {
      this.logger.warn(
        "[parseResponse] First JSON parse attempt failed, trying repair...",
      );
    }

    // 尝试修复常见的 JSON 问题
    try {
      const repairedJson = this.repairJson(jsonStr);
      const parsed = JSON.parse(repairedJson);
      const design = this.normalizeDesign(parsed);
      const html = this.extractHtml(parsed, input);
      this.logger.log("[parseResponse] JSON repaired successfully");
      return { design, html };
    } catch (error) {
      this.logger.warn(
        "[parseResponse] JSON repair failed, trying to extract HTML directly...",
      );
    }

    // 最后尝试：直接从响应中提取 HTML
    const directHtml = this.extractHtmlDirect(content);
    if (directHtml) {
      this.logger.log("[parseResponse] Extracted HTML directly from response");
      return {
        design: this.createFallbackDesign(),
        html: this.wrapHtmlWithContainer(directHtml, input.globalStyles),
      };
    }

    // 最终降级
    this.logger.error("[parseResponse] All parsing methods failed");
    this.logger.debug(
      `[parseResponse] Raw content (first 500 chars): ${content.substring(0, 500)}`,
    );
    return {
      design: this.createFallbackDesign(),
      html: this.createFallbackHtml(input),
    };
  }

  /**
   * 尝试修复常见的 JSON 问题
   */
  private repairJson(jsonStr: string): string {
    let repaired = jsonStr;

    // 1. 移除 JSON 中的控制字符（除了 \n, \r, \t）
    repaired = repaired.replace(/[\x00-\x08\x0b\x0c\x0e-\x1f]/g, "");

    // 2. 修复 HTML 字符串中的未转义换行符
    // 找到 "html": "..." 模式并修复其中的换行符
    repaired = repaired.replace(
      /"html"\s*:\s*"([\s\S]*?)"/g,
      (_match, htmlContent) => {
        // 转义 HTML 内容中的换行符和特殊字符
        const escaped = htmlContent
          .replace(/\\/g, "\\\\")
          .replace(/\n/g, "\\n")
          .replace(/\r/g, "\\r")
          .replace(/\t/g, "\\t")
          .replace(/"/g, '\\"');
        return `"html": "${escaped}"`;
      },
    );

    // 3. 移除尾随逗号
    repaired = repaired.replace(/,(\s*[}\]])/g, "$1");

    return repaired;
  }

  /**
   * 直接从响应中提取 HTML（当 JSON 解析失败时）
   */
  private extractHtmlDirect(content: string): string | null {
    // 尝试匹配 HTML 代码块
    const htmlBlockMatch = content.match(/```html\s*([\s\S]*?)\s*```/);
    if (htmlBlockMatch) {
      return htmlBlockMatch[1].trim();
    }

    // 尝试匹配 "html": 后面的内容
    const htmlFieldMatch = content.match(
      /"html"\s*:\s*"([\s\S]*?)(?:"\s*[,}]|$)/,
    );
    if (htmlFieldMatch) {
      // 解码转义的字符
      return htmlFieldMatch[1]
        .replace(/\\n/g, "\n")
        .replace(/\\r/g, "\r")
        .replace(/\\t/g, "\t")
        .replace(/\\"/g, '"')
        .replace(/\\\\/g, "\\");
    }

    // 尝试匹配完整的 HTML 结构
    const fullHtmlMatch = content.match(
      /<div\s+style="[^"]*width:\s*1280px[\s\S]*?<\/div>\s*$/,
    );
    if (fullHtmlMatch) {
      return fullHtmlMatch[0];
    }

    return null;
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

  /**
   * 修复 HTML 中误用的图片占位符
   * 当 AI 将图片占位符作为文本输出时，尝试将其转换为 img 标签
   */
  private fixMisusedImagePlaceholders(html: string): string {
    let result = html;

    // 检测并修复被作为文本输出的内联图片占位符
    // 匹配 >{{INLINE_IMAGE_N}}< 或 纯文本 {{INLINE_IMAGE_N}}
    const inlinePlaceholderPattern =
      /(?<=>|\s)(\{\{INLINE_IMAGE_(\d+)\}\})(?=<|[^"']|\s|$)/g;

    result = result.replace(inlinePlaceholderPattern, (_match, placeholder) => {
      this.logger.warn(
        `[fixMisusedImagePlaceholders] Found misused placeholder: ${placeholder}, converting to img tag`,
      );
      return `<img src="${placeholder}" style="max-width: 100%; height: auto; border-radius: 8px;" alt="图片" />`;
    });

    // 检测并修复被作为文本输出的背景图占位符
    const bgPlaceholderPattern =
      /(?<=>|\s)(\{\{BACKGROUND_IMAGE\}\})(?=<|[^"']|\s|$)/g;

    result = result.replace(bgPlaceholderPattern, (_match, placeholder) => {
      this.logger.warn(
        `[fixMisusedImagePlaceholders] Found misused background placeholder: ${placeholder}`,
      );
      // 对于背景图，我们不能简单转换，只记录警告
      return "";
    });

    return result;
  }
}
