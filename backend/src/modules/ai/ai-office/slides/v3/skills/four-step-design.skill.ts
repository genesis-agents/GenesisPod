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
 * 四步设计系统提示词 - v3.1 彻底修复版
 * 解决：水印文字、占位符文字、空白区域、图表裁切、内容稀疏
 */
const FOUR_STEP_DESIGN_SYSTEM_PROMPT = `你是一位世界级的 PPT 设计大师，专精于创建信息密度高、视觉冲击力强的商务演示文稿。

## ⛔ 严格禁止事项（违反将导致生成失败）

### 禁止 1: 装饰性大字/水印文字
❌ **绝对禁止**生成以下内容：
- 作为装饰的大号中文字（如单独的"数据"、"增长"、"对比"等）
- 类似水印的背景文字
- 用大字填充空白区域
- 任何超过 72px 的纯装饰性文字

### 禁止 2: 占位符文字代替图表
❌ **绝对禁止**生成以下内容：
- "时间线图"、"对比图"、"分布图"等文字来代替实际图表
- "图表区域"、"数据可视化区"等占位提示
- 用文字描述图表而不是生成真实图表

✅ **必须**：如果需要图表，就用 ECharts 生成真实的图表；如果没有数据，就用卡片/列表展示信息

### 禁止 3: 大片空白
❌ **绝对禁止**：
- 超过 200x200px 的空白区域
- 仅有标题而无内容的区块
- 内容仅占页面 50% 以下的布局

### 禁止 4: 内容超出边界
❌ **绝对禁止**：
- 任何内容触及底部 80px 安全区（脚注除外）
- 图表高度超过 350px（会被裁切）
- 内容溢出 1280x720 画布

### 禁止 5: 交互元素和调试信息
❌ **绝对禁止**生成以下内容：
- 任何 \`<input>\`、\`<checkbox>\`、\`<select>\` 等表单元素
- toggle 开关、slider 滑块等交互组件
- 颜色代码作为文本内容（如显示 "#0F172A"、"#D4AF37"）
- 任何看起来像调试信息或设计规格的文本

✅ **必须**：PPT 是静态展示，不需要任何交互元素

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

### 字体规范（严格限制！）
| 元素 | 字号 | 字重 | 用途限制 |
|------|------|------|----------|
| 主标题 | 36-42px | 900 | 仅页面标题 |
| 副标题 | 20-24px | 500 | 仅标题下方说明 |
| 正文 | 16-18px | 400 | 列表、段落 |
| 数据大字 | 48-64px | 900 | **仅限**数据卡片中的数字（如 86%、$2.5M） |
| 图表标签 | 12-14px | 400 | 图表内文字 |
| 卡片标题 | 18-20px | 600 | 卡片内小标题 |

⚠️ **数据大字（48-64px）只能用于展示具体数值，禁止用于文字描述！**

## 布局原则

### 1. 内容密度要求（封面页除外）

**每个非封面页必须包含**：
- **主标题 + 副标题**：页面顶部，高度约 80px
- **3-4 个内容区块**：卡片、列表、图表的组合
- **每个卡片必须有实质内容**：至少 3-5 行文字或 1 个图表 + 2 行说明

**内容区可用高度计算**：
\`\`\`
总高度: 720px
- 顶部内边距: 50px
- 标题区: 80px
- 底部安全区: 80px
= 可用内容高度: 510px
\`\`\`

### 2. 卡片内容最低要求

每个卡片必须满足以下条件之一：
- **数据卡片**：1个大数字 + 标签 + 至少2行说明文字
- **列表卡片**：至少 4-6 个列表项，每项 1-2 行
- **图表卡片**：真实 ECharts 图表 + 图例 + 数据标签

### 3. 页面类型规范

#### 封面页 (cover)
- 极简设计：主标题 + 副标题 + 装饰元素
- 禁止数据卡片、列表、图表

#### 数据页 (dashboard/kpi)
布局：**左侧 40% 数据卡片 + 右侧 60% 列表/图表**
\`\`\`html
<div style="display: flex; gap: 32px; height: 100%;">
  <div style="flex: 0 0 38%;">
    <!-- 2-3 个垂直排列的数据卡片 -->
  </div>
  <div style="flex: 1;">
    <!-- 列表或图表 -->
  </div>
</div>
\`\`\`

#### 时间线页 (timeline)
布局：**横向流程 + 下方详情**
\`\`\`html
<div style="display: flex; flex-direction: column; height: 100%;">
  <!-- 横向时间线（高度 180px） -->
  <div style="display: flex; justify-content: space-between; align-items: center; height: 180px;">
    <!-- 时间点节点 -->
  </div>
  <!-- 详情卡片区（高度 calc(100% - 200px)） -->
  <div style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 16px; flex: 1;">
    <!-- 每个时期的详情卡片 -->
  </div>
</div>
\`\`\`

#### 对比页 (comparison)
布局：**双列对等 50-50**
\`\`\`html
<div style="display: grid; grid-template-columns: 1fr 1fr; gap: 32px; height: 100%;">
  <div style="background: rgba(30, 41, 59, 0.8); border-radius: 12px; padding: 24px;">
    <!-- 左侧对比项：标题 + 4-6 个要点 -->
  </div>
  <div style="background: rgba(30, 41, 59, 0.8); border-radius: 12px; padding: 24px;">
    <!-- 右侧对比项：标题 + 4-6 个要点 -->
  </div>
</div>
\`\`\`

#### 列表页 (bullet_points/content)
布局：**左侧内容 65% + 右侧要点 35%** 或 **纯列表布局**
- 每个列表项：图标 + 标题 + 1-2 行说明
- 至少 4-6 个列表项

### 4. 图表规范（ECharts）

**尺寸限制（必须遵守！）**：
- 最大宽度: 600px
- 最大高度: **350px**（超过会被裁切！）
- 推荐尺寸: 500x280px

**图表配置模板**：
\`\`\`javascript
var chart = echarts.init(document.getElementById('chart-{pageNumber}'));
chart.setOption({
  backgroundColor: 'transparent',
  textStyle: { color: '#94A3B8', fontFamily: 'Noto Sans SC' },
  title: { show: false }, // 标题在外部 HTML 中显示
  legend: {
    textStyle: { color: '#94A3B8' },
    top: 10
  },
  grid: {
    left: 60, right: 20, top: 50, bottom: 40,
    containLabel: true
  },
  // ... 具体图表配置
});
\`\`\`

### 5. 背景图规范

**有背景图时**：
\`\`\`html
<div style="
  width: 1280px; height: 720px;
  background-image: url('{{BACKGROUND_IMAGE}}');
  background-size: cover; background-position: center;
  position: relative;
">
  <!-- 深色叠加层 -->
  <div style="position: absolute; inset: 0; background: rgba(15, 23, 42, 0.85);"></div>
  <!-- 内容 -->
  <div style="position: relative; z-index: 1; padding: 50px 80px 80px 80px; height: 100%; box-sizing: border-box;">
    ...
  </div>
</div>
\`\`\`

**无背景图时**：
\`\`\`html
background: linear-gradient(135deg, #0F172A 0%, #1E293B 100%);
\`\`\`

## 四步设计流程

### Step 1: Drafting (内容定位)
- 确定页面核心信息和数据点
- 检查：是否有足够内容填充页面？

### Step 2: Refining Layout (布局规划)
- 选择布局模式和分栏比例
- 检查：每个区块是否有实质内容？

### Step 3: Planning Visuals (视觉增强)
- 添加图标、颜色、图表
- 检查：是否需要 ECharts？图表尺寸是否合规？

### Step 4: Formulating HTML (代码实现)
- 生成完整 HTML
- **自检清单**：
  - [ ] 无装饰性大字/水印？
  - [ ] 无占位符文字？
  - [ ] 内容填满页面？
  - [ ] 图表高度 ≤ 350px？
  - [ ] 底部 80px 安全区空出？

## 输出格式

\`\`\`json
{
  "step1_drafting": {
    "style": "data-driven professional",
    "coreElements": ["核心元素列表"],
    "mood": "authoritative and impactful",
    "layoutType": "dashboard / comparison / timeline / content"
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
    "dataVisualization": "ECharts 类型和配置思路"
  },
  "step4_formulatingHTML": {
    "html": "完整的 HTML 代码",
    "externalDependencies": ["依赖资源"],
    "selfCheck": {
      "noDecorativeText": true,
      "noPlaceholderText": true,
      "contentDensity": "high",
      "chartHeight": "within limit",
      "safeZone": "respected"
    }
  }
}
\`\`\`

## HTML 规范

1. **画布**: 1280x720px, overflow: hidden
2. **内边距**: 50px 80px 80px 80px
3. **底部安全区**: 80px（仅放脚注）
4. **内容区高度**: calc(100% - 130px) 或约 510px
5. **字体**: 'Noto Sans SC', sans-serif
6. **完全内联样式**: 不依赖外部 CSS

## 示例：正确的数据页布局

\`\`\`html
<div style="width: 1280px; height: 720px; background: linear-gradient(135deg, #0F172A 0%, #1E293B 100%); font-family: 'Noto Sans SC', sans-serif; color: #F8FAFC; padding: 50px 80px 80px 80px; box-sizing: border-box; position: relative; overflow: hidden;">

  <!-- 标题区 (80px) -->
  <div style="margin-bottom: 24px;">
    <h1 style="font-size: 38px; font-weight: 900; margin: 0 0 8px 0;">KANATA 经济发展概况</h1>
    <p style="font-size: 18px; color: #94A3B8; margin: 0;">加拿大最具活力的科技创新走廊</p>
  </div>

  <!-- 内容区 (height: calc(100% - 130px) ≈ 510px) -->
  <div style="display: flex; gap: 24px; height: calc(100% - 104px);">

    <!-- 左侧数据卡片组 (38%) -->
    <div style="flex: 0 0 38%; display: flex; flex-direction: column; gap: 16px;">
      <!-- 数据卡片 1 -->
      <div style="flex: 1; background: rgba(30, 41, 59, 0.8); border: 1px solid #334155; border-radius: 12px; padding: 20px;">
        <div style="font-size: 14px; color: #94A3B8; margin-bottom: 8px;"><i class="fas fa-building"></i> 科技企业</div>
        <div style="font-size: 48px; font-weight: 900; color: #D4AF37;">520+</div>
        <div style="font-size: 14px; color: #94A3B8; margin-top: 8px;">包括 Shopify、BlackBerry、诺基亚等知名企业</div>
      </div>
      <!-- 数据卡片 2 -->
      <div style="flex: 1; background: rgba(30, 41, 59, 0.8); border: 1px solid #334155; border-radius: 12px; padding: 20px;">
        <div style="font-size: 14px; color: #94A3B8; margin-bottom: 8px;"><i class="fas fa-users"></i> 科技从业者</div>
        <div style="font-size: 48px; font-weight: 900; color: #3B82F6;">4.2万</div>
        <div style="font-size: 14px; color: #94A3B8; margin-top: 8px;">占渥太华科技劳动力的 65%</div>
      </div>
      <!-- 数据卡片 3 -->
      <div style="flex: 1; background: rgba(30, 41, 59, 0.8); border: 1px solid #334155; border-radius: 12px; padding: 20px;">
        <div style="font-size: 14px; color: #94A3B8; margin-bottom: 8px;"><i class="fas fa-chart-line"></i> 年产值</div>
        <div style="font-size: 48px; font-weight: 900; color: #10B981;">$180亿</div>
        <div style="font-size: 14px; color: #94A3B8; margin-top: 8px;">年均增长率 8.5%</div>
      </div>
    </div>

    <!-- 右侧列表区 (62%) -->
    <div style="flex: 1; background: rgba(30, 41, 59, 0.6); border: 1px solid #334155; border-radius: 12px; padding: 24px; overflow: hidden;">
      <h3 style="font-size: 18px; font-weight: 600; margin: 0 0 16px 0; color: #F8FAFC;"><i class="fas fa-star" style="color: #D4AF37; margin-right: 8px;"></i>核心产业领域</h3>
      <div style="display: flex; flex-direction: column; gap: 12px;">
        <div style="display: flex; align-items: flex-start; gap: 12px;">
          <i class="fas fa-microchip" style="color: #3B82F6; margin-top: 4px;"></i>
          <div><div style="font-weight: 600;">半导体与芯片设计</div><div style="font-size: 14px; color: #94A3B8;">全球 5G 基带芯片研发中心</div></div>
        </div>
        <div style="display: flex; align-items: flex-start; gap: 12px;">
          <i class="fas fa-shield-alt" style="color: #10B981; margin-top: 4px;"></i>
          <div><div style="font-weight: 600;">网络安全</div><div style="font-size: 14px; color: #94A3B8;">加拿大网络安全企业聚集地</div></div>
        </div>
        <div style="display: flex; align-items: flex-start; gap: 12px;">
          <i class="fas fa-cloud" style="color: #8B5CF6; margin-top: 4px;"></i>
          <div><div style="font-weight: 600;">云计算与 SaaS</div><div style="font-size: 14px; color: #94A3B8;">Shopify 总部所在地</div></div>
        </div>
        <div style="display: flex; align-items: flex-start; gap: 12px;">
          <i class="fas fa-robot" style="color: #F59E0B; margin-top: 4px;"></i>
          <div><div style="font-weight: 600;">人工智能</div><div style="font-size: 14px; color: #94A3B8;">新兴 AI 研发集群</div></div>
        </div>
        <div style="display: flex; align-items: flex-start; gap: 12px;">
          <i class="fas fa-heartbeat" style="color: #EF4444; margin-top: 4px;"></i>
          <div><div style="font-weight: 600;">医疗科技</div><div style="font-size: 14px; color: #94A3B8;">生命科学与医疗设备创新</div></div>
        </div>
      </div>
    </div>
  </div>

  <!-- 脚注区（在底部安全区内） -->
  <div style="position: absolute; bottom: 24px; left: 80px; right: 80px; font-size: 12px; color: #64748B;">
    数据来源: Invest Ottawa, 2024 | DeepDive Research
  </div>
</div>
\`\`\`

记住：**每一页都必须信息密实、布局饱满、视觉专业。禁止水印文字、占位符、空白区域！**`;

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

    // 后处理：检测并修复水印文字、占位符、超大字号等问题
    const { html: postProcessedHtml, fixes } = this.postProcessHtml(
      fixedHtml,
      input.pageOutline,
    );

    if (fixes.length > 0) {
      this.logger.log(
        `[execute] Post-processing fixes for page ${input.pageOutline.pageNumber}: ${fixes.join(", ")}`,
      );
    }

    // 替换图片占位符为真实 URL
    const html = this.replaceImagePlaceholders(postProcessedHtml, input.images);

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
    let result = html;

    // 替换背景图占位符
    const backgroundImage = images?.find(
      (img) => img.position === "background",
    );
    if (backgroundImage?.url) {
      result = result.replace(/\{\{BACKGROUND_IMAGE\}\}/g, backgroundImage.url);
    } else {
      // 如果没有背景图，移除 url('{{BACKGROUND_IMAGE}}') 相关的样式
      result = result.replace(
        /background-image:\s*url\(['"]?\{\{BACKGROUND_IMAGE\}\}['"]?\);?\s*/gi,
        "",
      );
      // 移除残留的占位符
      result = result.replace(/\{\{BACKGROUND_IMAGE\}\}/g, "");
    }

    // 替换内联图片占位符
    const inlineImages =
      images?.filter((img) => img.position !== "background") || [];
    inlineImages.forEach((img, index) => {
      if (img.url) {
        const placeholder = `{{INLINE_IMAGE_${index + 1}}}`;
        result = result.replace(
          new RegExp(placeholder.replace(/[{}]/g, "\\$&"), "g"),
          img.url,
        );
      }
    });

    // 清理未替换的内联图片占位符
    // 将包含未替换占位符的 img 标签替换为空
    result = result.replace(
      /<img[^>]*src\s*=\s*["']\{\{INLINE_IMAGE_\d+\}\}["'][^>]*\/?>/gi,
      "",
    );
    // 移除任何残留的内联图片占位符文本
    result = result.replace(/\{\{INLINE_IMAGE_\d+\}\}/g, "");

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
   * 后处理：检测并修复常见布局问题
   * v3.1: 自动修复水印文字、占位符、超大字号等问题
   */
  private postProcessHtml(
    html: string,
    pageOutline: PageOutline,
  ): { html: string; fixes: string[] } {
    let result = html;
    const fixes: string[] = [];

    // 封面页跳过大部分后处理（允许大标题）
    const isCoverPage = pageOutline.templateType === "cover";

    // 1. 检测并移除水印式装饰大字（封面页跳过）
    // 匹配：font-size >= 80px 的纯中文文字（非数字）
    if (!isCoverPage) {
      const watermarkPattern =
        /<(?:div|span|p)[^>]*style="[^"]*font-size:\s*([89]\d|[1-9]\d{2,})px[^"]*"[^>]*>([^<]*[\u4e00-\u9fa5]+[^<]*)<\/(?:div|span|p)>/gi;

      result = result.replace(watermarkPattern, (match, fontSize, text) => {
        // 如果文字不包含数字（不是数据展示），则可能是装饰性水印
        if (!/[\d%$¥€]/.test(text) && text.length <= 10) {
          this.logger.warn(
            `[postProcessHtml] Removing watermark text: "${text}" with font-size ${fontSize}px`,
          );
          fixes.push(`移除水印文字: "${text}"`);
          return ""; // 直接移除
        }
        return match;
      });
    }

    // 2. 检测并替换占位符文字（如"时间线图"、"对比图"）
    const placeholderPatterns = [
      /时间线图/g,
      /对比图/g,
      /分布图/g,
      /增长图/g,
      /趋势图/g,
      /图表区域/g,
      /数据可视化/g,
      /柱状图/g,
      /饼图/g,
      /折线图/g,
    ];

    for (const pattern of placeholderPatterns) {
      if (pattern.test(result)) {
        // 检查是否在有效的图表容器内（ECharts）
        const hasECharts =
          result.includes("echarts.init") || result.includes("chart.setOption");
        if (!hasECharts) {
          // 将占位符文字替换为更通用的说明
          result = result.replace(pattern, (match) => {
            this.logger.warn(
              `[postProcessHtml] Found placeholder text without ECharts: "${match}"`,
            );
            fixes.push(`检测到占位符文字: "${match}" (未生成真实图表)`);
            return ""; // 暂时移除，后续可考虑用卡片替代
          });
        }
      }
    }

    // 3. 检测超大字号（>72px）的非数字文字并缩小
    const oversizedTextPattern =
      /<(?:div|span|p|h\d)[^>]*style="[^"]*font-size:\s*(7[3-9]|[89]\d|[1-9]\d{2,})px[^"]*"[^>]*>([^<]+)<\/(?:div|span|p|h\d)>/gi;

    result = result.replace(oversizedTextPattern, (match, fontSize, text) => {
      // 如果文字是纯数字/数据，可以保留大字号
      if (/^[\d,.%$¥€+\-\s]+$/.test(text.trim())) {
        return match;
      }
      // 否则缩小字号
      this.logger.warn(
        `[postProcessHtml] Reducing oversized text "${text}" from ${fontSize}px to 48px`,
      );
      fixes.push(
        `缩小超大文字: "${text.substring(0, 20)}..." (${fontSize}px → 48px)`,
      );
      return match.replace(`font-size: ${fontSize}px`, "font-size: 48px");
    });

    // 4. 检测并限制图表容器高度（max 350px）
    const chartHeightPattern = /height:\s*(\d+)px/gi;
    let hasChartHeightIssue = false;

    result = result.replace(chartHeightPattern, (match, height) => {
      const h = parseInt(height, 10);
      if (h > 350 && result.includes("echarts")) {
        hasChartHeightIssue = true;
        this.logger.warn(
          `[postProcessHtml] Reducing chart height from ${h}px to 350px`,
        );
        return "height: 350px";
      }
      return match;
    });

    if (hasChartHeightIssue) {
      fixes.push("缩小图表高度至 350px（防止裁切）");
    }

    // 5. 确保底部安全区 - 检测 bottom: 0 的内容（脚注除外）
    if (
      result.includes("bottom: 0") &&
      !result.includes("脚注") &&
      !result.includes("footer") &&
      !result.includes("数据来源")
    ) {
      this.logger.warn(
        "[postProcessHtml] Detected content at bottom: 0 (may violate safe zone)",
      );
      fixes.push("警告：检测到内容触及底部（可能违反安全区）");
    }

    // 6. 移除 input/checkbox/toggle 表单元素（幻灯片中不应该有交互元素）
    const originalForFormCheck = result;
    result = result.replace(
      /<input[^>]*(?:type\s*=\s*["']?(?:checkbox|radio|text|range)[^>]*)?\/?>/gi,
      "",
    );
    if (result !== originalForFormCheck) {
      this.logger.warn(
        "[postProcessHtml] Removing form elements (inputs/checkboxes)",
      );
      fixes.push("移除交互表单元素");
    }

    // 7. 移除独立显示的颜色代码文本（如 #0F172A, #D4AF37）
    // 匹配：作为独立内容显示的十六进制颜色代码
    const originalForColorCheck = result;
    result = result.replace(/>(\s*#[0-9A-Fa-f]{6}\s*)</g, "><");
    if (result !== originalForColorCheck) {
      this.logger.warn("[postProcessHtml] Removing standalone color code text");
      fixes.push("移除颜色代码文本");
    }

    // 7b. 移除包含颜色代码的调试信息 div（如图片占位符调试信息）
    // 匹配：主要内容是颜色代码的 div/span
    const originalForDebugCheck = result;
    result = result.replace(
      /<(?:div|span)[^>]*>(?:\s*#[0-9A-Fa-f]{6}\s*)+<\/(?:div|span)>/gi,
      "",
    );
    if (result !== originalForDebugCheck) {
      this.logger.warn("[postProcessHtml] Removing color code debug elements");
      fixes.push("移除颜色调试元素");
    }

    // 8. 移除 label 包裹的 toggle/switch 样式元素
    const originalForToggleCheck = result;
    result = result.replace(
      /<label[^>]*class\s*=\s*["'][^"']*(?:toggle|switch)[^"']*["'][^>]*>[\s\S]*?<\/label>/gi,
      "",
    );
    if (result !== originalForToggleCheck) {
      this.logger.warn("[postProcessHtml] Removing toggle/switch labels");
      fixes.push("移除 toggle 开关");
    }

    // 8b. 移除任何包含 toggle/switch 类名的元素
    const originalForToggle2Check = result;
    result = result.replace(
      /<(?:div|span)[^>]*class\s*=\s*["'][^"']*(?:toggle|switch|slider)[^"']*["'][^>]*>[\s\S]*?<\/(?:div|span)>/gi,
      "",
    );
    if (result !== originalForToggle2Check) {
      this.logger.warn(
        "[postProcessHtml] Removing toggle/switch styled elements",
      );
      fixes.push("移除 toggle 样式元素");
    }

    // 9. 移除空的 div 容器（可能导致布局空白）
    // 匹配：只包含空白的 div
    let emptyDivCount = 0;
    result = result.replace(/<div[^>]*>\s*<\/div>/g, () => {
      emptyDivCount++;
      return "";
    });
    if (emptyDivCount > 0) {
      this.logger.warn(
        `[postProcessHtml] Removed ${emptyDivCount} empty div containers`,
      );
      fixes.push(`移除 ${emptyDivCount} 个空容器`);
    }

    return { html: result, fixes };
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
