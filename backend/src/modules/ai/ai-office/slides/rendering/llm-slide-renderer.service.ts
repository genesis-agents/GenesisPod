/**
 * LLM Slide Renderer Service
 *
 * 使用 LLM 直接生成高质量 HTML 幻灯片
 * 参考 Genspark 的实现方式
 *
 * 核心特点：
 * 1. LLM 直接生成完整 HTML 代码
 * 2. 使用 TailwindCSS 样式系统
 * 3. 包含专业装饰元素 (accent bars, patterns, icons)
 * 4. 固定 1280x720 尺寸，16:9 比例
 * 5. 支持多种页面模板类型
 */

import { Injectable, Logger } from "@nestjs/common";
import { HttpService } from "@nestjs/axios";
import { firstValueFrom } from "rxjs";
import { AIModelService } from "../../core";
import {
  SlideSpec,
  GeneratedSlideContent,
  GeneratedSlideImage,
  PPTTheme,
  SlidePurpose,
} from "../types/slides.types";

// ============================================
// 基础 HTML 模板
// ============================================

const BASE_HTML_TEMPLATE = `<!DOCTYPE html>
<html data-theme="{{theme}}" lang="zh-CN">
<head>
<meta charset="utf-8"/>
<meta content="width=device-width, initial-scale=1.0" name="viewport"/>
<link href="https://cdn.jsdelivr.net/npm/tailwindcss@2.2.19/dist/tailwind.min.css" rel="stylesheet"/>
<link href="https://fonts.googleapis.com/css2?family=Noto+Sans+SC:wght@300;400;500;700;900&display=swap" rel="stylesheet"/>
<link href="https://cdn.jsdelivr.net/npm/@fortawesome/fontawesome-free@6.4.0/css/all.min.css" rel="stylesheet"/>
<style>
body {
  margin: 0;
  padding: 0;
  font-family: 'Noto Sans SC', sans-serif;
  -webkit-font-smoothing: antialiased;
}
.slide-container {
  width: 1280px;
  height: 720px;
  background-color: {{bgColor}};
  color: {{textColor}};
  position: relative;
  overflow: hidden;
}
/* 安全区：底部80px，确保内容不与页脚重叠 */
.content-safe-area {
  padding: 50px 80px 80px 80px;
  height: 100%;
  box-sizing: border-box;
}
/* 统一页脚样式 */
.page-footer {
  position: absolute;
  bottom: 25px;
  right: 40px;
  color: {{footerColor}};
  font-size: 14px;
  font-weight: 500;
  z-index: 50;
}
{{customStyles}}
</style>
</head>
<body>
<div class="slide-container">
{{content}}
<div class="page-footer">第{{pageNumber}}页 | {{brandName}}</div>
</div>
</body>
</html>`;

// ============================================
// LLM 提示词模板
// ============================================

const SLIDE_HTML_GENERATION_PROMPT = `You are a world-class presentation designer and HTML/CSS expert. Generate a complete, professional HTML slide based on the requirements below.

## Design System Requirements

1. **Fixed Dimensions**: 1280x720px (16:9 ratio)
2. **Safety Zone**: Content must stay within 80px from bottom edge (for footer)
3. **Typography**: Use 'Noto Sans SC' font family
4. **Icons**: Use Font Awesome 6 icons where appropriate
5. **Colors**: Use the provided color palette consistently

## Color Palette
- Background Primary: {{bgPrimary}}
- Background Secondary: {{bgSecondary}}
- Text Primary: {{textPrimary}}
- Text Secondary: {{textSecondary}}
- Accent Gold: #D4AF37 (for highlights, important elements)
- Accent Blue: #3B82F6 (for progress, links)
- Status Success: #22C55E
- Status Warning: #F59E0B
- Status Error: #EF4444

## Page Type: {{pageType}}

## Content to Display:
Title: {{title}}
Subtitle: {{subtitle}}
{{contentDetails}}

## Visual Requirements:
{{visualRequirements}}

## Output Format

Generate ONLY the content that goes inside the slide-container div. Do NOT include:
- DOCTYPE, html, head, body tags
- The slide-container div itself
- The page-footer div

DO include:
- All decorative elements (accent bars, lines, patterns)
- Semantic HTML with TailwindCSS classes
- Inline styles for custom positioning
- Font Awesome icons where appropriate

## Example Structure for a Title Slide:

\`\`\`html
<!-- Background Decor -->
<div class="absolute left-20 top-0 bottom-0 w-0.5 bg-yellow-600 opacity-10"></div>
<i class="fas fa-network-wired absolute -right-24 -bottom-24 text-white opacity-5" style="font-size: 500px; transform: rotate(-15deg);"></i>

<!-- Header -->
<div class="flex items-center pl-10 pt-16 z-10">
  <div class="w-2 h-2 bg-yellow-600 mr-3 rounded-full"></div>
  <p class="text-sm tracking-widest uppercase text-gray-400">组织名称</p>
</div>

<!-- Main Content -->
<div class="flex-1 flex flex-col justify-center pl-10 z-10 max-w-4xl px-16">
  <div class="w-20 h-1.5 bg-yellow-600 mb-6"></div>
  <h1 class="text-7xl font-bold leading-tight mb-6 text-white">
    主标题
    <span class="text-blue-400">副标题</span>
  </h1>
  <p class="text-xl text-gray-300 font-light tracking-wide">
    描述文字
  </p>
</div>
\`\`\`

Now generate the HTML for the specified slide type and content:`;

// ============================================
// 页面类型专用提示词
// ============================================

const PAGE_TYPE_PROMPTS: Record<SlidePurpose, string> = {
  title: `Create a dramatic title/cover slide with:
- Large, bold title text (text-7xl or larger)
- Accent bar decoration (gold color bar)
- Subtle background pattern or icon
- Organization info at top
- Keywords/tags at bottom if provided
- Cinematic, impactful visual style`,

  agenda: `Create a table of contents/agenda slide with:
- Clear title "目录" with English subtitle "Table of Contents"
- Left column: Title and summary
- Right column: Numbered agenda items in 2-column grid
- Use numbered boxes (00, 01, 02...) with gold accent
- Each item has title and brief description
- Vertical divider line between columns`,

  section_header: `Create a chapter/section divider slide with:
- Large chapter number with accent color
- Bold section title
- Brief description or tagline
- Decorative accent bar
- Clean, impactful layout`,

  content: `Create a content slide with:
- Clear title at top
- Well-organized bullet points or cards
- Optional icons for each point
- Proper spacing and hierarchy
- Professional business presentation style`,

  comparison: `Create a comparison slide with:
- Two or more columns for comparison
- Clear headers for each column
- Matching items aligned for easy comparison
- Color coding to distinguish items
- Optional icons or visual indicators`,

  timeline: `Create a horizontal timeline slide with:
- Timeline track with progress indicator
- Dots/nodes on the timeline
- Year/date labels above the line
- Content cards below each node
- Arrow pointing to future
- Last item highlighted with gold accent
- Card triangles pointing to nodes`,

  statistics: `Create a statistics/KPI dashboard slide with:
- Large numbers prominently displayed
- Metric labels beneath each number
- Trend indicators (up/down arrows)
- Card-based layout
- Color-coded by performance`,

  quote: `Create a quote slide with:
- Large quotation marks
- Quote text in italic, prominent font
- Attribution (author, title)
- Subtle background or accent
- Centered, impactful layout`,

  team: `Create a team/profile slide with:
- Profile grid or layout
- Avatar placeholders or icons
- Name and title for each person
- Optional additional info
- Professional, organized appearance`,

  image_focus: `Create an image-focused slide with:
- Large image area (placeholder or actual)
- Caption or title overlay
- Minimal text, visual impact
- Professional presentation style`,

  chart: `Create a chart/data slide with:
- Title and chart description
- Chart placeholder area
- Legend or data labels
- Source citation if needed
- Clean data visualization style`,

  closing: `Create a closing/thank you slide with:
- "Thank You" or equivalent message
- Contact information
- Call to action if applicable
- Memorable, conclusive design`,

  qna: `Create a Q&A slide with:
- "Questions?" or equivalent
- Contact information
- Inviting, open design
- Optional background pattern`,
};

// ============================================
// 服务实现
// ============================================

@Injectable()
export class LLMSlideRendererService {
  private readonly logger = new Logger(LLMSlideRendererService.name);

  constructor(
    private readonly httpService: HttpService,
    private readonly aiModelService: AIModelService,
  ) {}

  /**
   * 使用 LLM 生成幻灯片 HTML
   */
  async renderSlideWithLLM(
    spec: SlideSpec,
    content: GeneratedSlideContent,
    images: GeneratedSlideImage[],
    theme: PPTTheme,
    pageNumber: number,
    brandName: string = "DeepDive",
  ): Promise<string> {
    this.logger.log(
      `[LLM Render] Generating HTML for slide ${spec.index}: ${spec.title} (${spec.purpose})`,
    );

    try {
      // 构建 LLM 提示词
      const prompt = this.buildPrompt(spec, content, images, theme);

      // 调用 LLM 生成 HTML
      const generatedContent = await this.callLLMForHTML(prompt);

      // 组装完整 HTML
      const fullHtml = this.assembleFullHtml(
        generatedContent,
        theme,
        pageNumber,
        brandName,
      );

      return fullHtml;
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      this.logger.error(
        `[LLM Render] Failed to generate slide HTML: ${errorMessage}`,
      );
      // 降级到基础模板
      return this.generateFallbackHtml(
        spec,
        content,
        theme,
        pageNumber,
        brandName,
      );
    }
  }

  /**
   * 构建 LLM 提示词
   */
  private buildPrompt(
    spec: SlideSpec,
    content: GeneratedSlideContent,
    images: GeneratedSlideImage[],
    theme: PPTTheme,
  ): string {
    const pageTypePrompt =
      PAGE_TYPE_PROMPTS[spec.purpose] || PAGE_TYPE_PROMPTS.content;

    // 构建内容详情
    const contentDetails = this.buildContentDetails(content);

    // 构建视觉需求
    const visualRequirements = this.buildVisualRequirements(spec, images);

    return SLIDE_HTML_GENERATION_PROMPT.replace(
      "{{bgPrimary}}",
      theme.colors.background,
    )
      .replace("{{bgSecondary}}", theme.colors.backgroundSecondary)
      .replace("{{textPrimary}}", theme.colors.text)
      .replace("{{textSecondary}}", theme.colors.textLight)
      .replace("{{pageType}}", spec.purpose)
      .replace("{{title}}", content.title)
      .replace("{{subtitle}}", content.subtitle || "")
      .replace("{{contentDetails}}", contentDetails)
      .replace(
        "{{visualRequirements}}",
        pageTypePrompt + "\n" + visualRequirements,
      );
  }

  /**
   * 构建内容详情
   */
  private buildContentDetails(content: GeneratedSlideContent): string {
    const details: string[] = [];

    if (content.bulletPoints?.length) {
      details.push(
        `Bullet Points:\n${content.bulletPoints.map((p, i) => `${i + 1}. ${p}`).join("\n")}`,
      );
    }

    if (content.bodyText) {
      details.push(`Body Text: ${content.bodyText}`);
    }

    if (content.statistics?.length) {
      details.push(
        `Statistics:\n${content.statistics.map((s) => `- ${s.label}: ${s.value}`).join("\n")}`,
      );
    }

    if (content.quote) {
      details.push(
        `Quote: "${content.quote.text}" - ${content.quote.author || "Unknown"}`,
      );
    }

    if (content.highlightText) {
      details.push(`Highlight: ${content.highlightText}`);
    }

    return details.join("\n\n");
  }

  /**
   * 构建视觉需求
   */
  private buildVisualRequirements(
    spec: SlideSpec,
    images: GeneratedSlideImage[],
  ): string {
    const requirements: string[] = [];

    // 背景需求
    if (spec.backgroundDecision.type === "ai_generated") {
      const bgImage = images.find((img) => img.position === "background");
      if (bgImage) {
        requirements.push(
          `Background: Use image URL "${bgImage.url}" as background with overlay`,
        );
      }
    } else if (spec.backgroundDecision.type === "gradient") {
      const colors = spec.backgroundDecision.colors;
      requirements.push(
        `Background: Use gradient from ${colors?.primary} to ${colors?.secondary || "#1E293B"}`,
      );
    }

    // 内容图片
    const contentImages = images.filter((img) => img.position !== "background");
    if (contentImages.length > 0) {
      requirements.push(
        `Content Images:\n${contentImages.map((img) => `- Position: ${img.position}, URL: ${img.url}`).join("\n")}`,
      );
    }

    return requirements.join("\n");
  }

  /**
   * 调用 LLM 生成 HTML
   */
  private async callLLMForHTML(prompt: string): Promise<string> {
    try {
      // 使用 AIModelService 或直接调用 API
      const model = await this.aiModelService.getDefaultTextModel();

      const response = await firstValueFrom(
        this.httpService.post(
          model.apiEndpoint,
          {
            model: model.modelId,
            messages: [
              {
                role: "system",
                content:
                  "You are an expert HTML/CSS developer specializing in presentation slides. Generate clean, semantic HTML with TailwindCSS classes. Output ONLY the HTML content, no explanations or markdown code blocks.",
              },
              { role: "user", content: prompt },
            ],
            temperature: 0.7,
            max_tokens: 4096,
          },
          {
            headers: {
              Authorization: `Bearer ${model.apiKey}`,
              "Content-Type": "application/json",
            },
          },
        ),
      );

      const result =
        response.data.choices?.[0]?.message?.content ||
        response.data.content?.[0]?.text ||
        "";

      // 清理可能的 markdown 代码块
      return this.cleanHTMLOutput(result);
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      this.logger.error(`[LLM Call] Failed: ${errorMessage}`);
      throw error;
    }
  }

  /**
   * 清理 LLM 输出的 HTML
   */
  private cleanHTMLOutput(html: string): string {
    // 移除 markdown 代码块标记
    let cleaned = html
      .replace(/```html\n?/gi, "")
      .replace(/```\n?/g, "")
      .trim();

    // 确保不包含完整的 HTML 文档结构
    if (cleaned.includes("<!DOCTYPE") || cleaned.includes("<html")) {
      // 提取 body 内容
      const bodyMatch = cleaned.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
      if (bodyMatch) {
        cleaned = bodyMatch[1].trim();
      }

      // 提取 slide-container 内容
      const containerMatch = cleaned.match(
        /<div[^>]*class="[^"]*slide-container[^"]*"[^>]*>([\s\S]*?)<\/div>\s*$/i,
      );
      if (containerMatch) {
        cleaned = containerMatch[1].trim();
      }
    }

    return cleaned;
  }

  /**
   * 组装完整 HTML 文档
   */
  private assembleFullHtml(
    content: string,
    theme: PPTTheme,
    pageNumber: number,
    brandName: string,
  ): string {
    const isDark = this.isDarkTheme(theme);

    return BASE_HTML_TEMPLATE.replace("{{theme}}", isDark ? "dark" : "light")
      .replace("{{bgColor}}", theme.colors.background)
      .replace("{{textColor}}", theme.colors.text)
      .replace("{{footerColor}}", theme.colors.textMuted)
      .replace("{{customStyles}}", "")
      .replace("{{content}}", content)
      .replace("{{pageNumber}}", String(pageNumber))
      .replace("{{brandName}}", brandName);
  }

  /**
   * 判断是否为深色主题
   */
  private isDarkTheme(theme: PPTTheme): boolean {
    const bgColor = theme.colors.background.toLowerCase();
    // 简单判断：如果背景色较暗则为深色主题
    return (
      bgColor.includes("#0") ||
      bgColor.includes("#1") ||
      bgColor.includes("#2") ||
      bgColor.includes("rgb(0") ||
      bgColor.includes("rgb(1") ||
      bgColor.includes("rgb(2")
    );
  }

  /**
   * 降级：生成基础 HTML
   */
  private generateFallbackHtml(
    _spec: SlideSpec,
    content: GeneratedSlideContent,
    theme: PPTTheme,
    pageNumber: number,
    brandName: string,
  ): string {
    const fallbackContent = `
      <div class="content-safe-area flex flex-col">
        <div class="border-l-4 border-yellow-600 pl-6 mb-8">
          <h1 class="text-4xl font-bold mb-2">${this.escapeHtml(content.title)}</h1>
          ${content.subtitle ? `<p class="text-xl text-gray-400">${this.escapeHtml(content.subtitle)}</p>` : ""}
        </div>
        ${
          content.bulletPoints?.length
            ? `
          <ul class="space-y-4 text-xl">
            ${content.bulletPoints
              .map(
                (point) => `
              <li class="flex items-start">
                <span class="w-2 h-2 bg-yellow-600 rounded-full mt-3 mr-4 flex-shrink-0"></span>
                <span>${this.escapeHtml(point)}</span>
              </li>
            `,
              )
              .join("")}
          </ul>
        `
            : ""
        }
        ${content.bodyText ? `<p class="text-lg text-gray-300 mt-4">${this.escapeHtml(content.bodyText)}</p>` : ""}
      </div>
    `;

    return this.assembleFullHtml(fallbackContent, theme, pageNumber, brandName);
  }

  /**
   * HTML 转义
   */
  private escapeHtml(text: string): string {
    if (!text) return "";
    return text
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  /**
   * 批量渲染幻灯片
   */
  async renderSlidesWithLLM(
    slides: Array<{
      spec: SlideSpec;
      content: GeneratedSlideContent;
      images: GeneratedSlideImage[];
    }>,
    theme: PPTTheme,
    brandName: string = "DeepDive",
  ): Promise<string[]> {
    const results: string[] = [];

    for (let i = 0; i < slides.length; i++) {
      const { spec, content, images } = slides[i];
      const html = await this.renderSlideWithLLM(
        spec,
        content,
        images,
        theme,
        i + 1,
        brandName,
      );
      results.push(html);
    }

    return results;
  }
}
