/**
 * 统一导出系统 - PDF 渲染器
 * 使用 Puppeteer 将 HTML 转换为 PDF
 */

import { Injectable, Logger } from "@nestjs/common";
import { ExportFormat } from "@prisma/client";
import {
  ExportRenderer,
  MIME_TYPES,
  FILE_EXTENSIONS,
} from "./renderer.interface";
import { UnifiedContent, ContentSection } from "../types/unified-content";
import { ThemeConfig, LayoutConfig } from "../types/theme-config";
import { ExportOptions } from "../types/export-options";
import puppeteer from "puppeteer";

@Injectable()
export class PdfRenderer implements ExportRenderer {
  private readonly logger = new Logger(PdfRenderer.name);
  readonly format = ExportFormat.PDF;

  async render(
    content: UnifiedContent,
    theme: ThemeConfig,
    layout: LayoutConfig,
    options: ExportOptions,
  ): Promise<Buffer> {
    this.logger.debug("Rendering PDF...");

    // 生成 HTML
    const html = this.generateHtml(content, theme, layout, options);

    // 使用 Puppeteer 转换为 PDF
    const browser = await puppeteer.launch({
      headless: true,
      args: ["--no-sandbox", "--disable-setuid-sandbox"],
    });

    try {
      const page = await browser.newPage();
      await page.setContent(html, { waitUntil: "networkidle0" });

      // PDF 配置
      const pdfOptions: any = {
        format: this.mapPageSize(layout.pageSize),
        landscape: layout.orientation === "landscape",
        margin: {
          top: `${theme.spacing.page.top}px`,
          right: `${theme.spacing.page.right}px`,
          bottom: `${theme.spacing.page.bottom}px`,
          left: `${theme.spacing.page.left}px`,
        },
        printBackground: true,
      };

      // 页眉页脚
      if (options.includePageNumbers !== false) {
        pdfOptions.displayHeaderFooter = true;
        pdfOptions.headerTemplate = "<div></div>";
        pdfOptions.footerTemplate = `
          <div style="width: 100%; font-size: 10px; text-align: center; color: #666;">
            <span class="pageNumber"></span> / <span class="totalPages"></span>
          </div>
        `;
      }

      const pdfBuffer = await page.pdf(pdfOptions);
      this.logger.debug(`PDF generated: ${pdfBuffer.length} bytes`);

      return Buffer.from(pdfBuffer);
    } finally {
      await browser.close();
    }
  }

  getMimeType(): string {
    return MIME_TYPES.PDF;
  }

  getFileExtension(): string {
    return FILE_EXTENSIONS.PDF;
  }

  /**
   * 生成 HTML 内容
   */
  private generateHtml(
    content: UnifiedContent,
    theme: ThemeConfig,
    _layout: LayoutConfig,
    options: ExportOptions,
  ): string {
    const css = this.generateCss(theme);
    const bodyHtml = this.generateBody(content, theme, options);

    return `
<!DOCTYPE html>
<html lang="${content.metadata.language || "zh-CN"}">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${content.metadata.title}</title>
  <style>${css}</style>
</head>
<body>
  ${options.includeCover !== false ? this.generateCover(content, theme) : ""}
  ${options.includeTableOfContents && content.tableOfContents?.enabled ? this.generateToc(content) : ""}
  <main class="content">
    ${bodyHtml}
  </main>
  ${content.references && options.includeReferences !== false ? this.generateReferences(content.references) : ""}
  ${options.watermark ? this.generateWatermark(options.watermark, options.watermarkOpacity) : ""}
</body>
</html>
    `;
  }

  /**
   * 生成 CSS 样式
   */
  private generateCss(theme: ThemeConfig): string {
    return `
      * {
        box-sizing: border-box;
        margin: 0;
        padding: 0;
      }

      body {
        font-family: ${theme.fonts.body.family};
        font-size: ${theme.fonts.body.size}px;
        line-height: ${theme.fonts.body.lineHeight};
        color: ${theme.colors.text};
        background: ${theme.colors.background};
      }

      /* 封面 */
      .cover {
        page-break-after: always;
        display: flex;
        flex-direction: column;
        justify-content: center;
        align-items: center;
        min-height: 100vh;
        text-align: center;
        padding: 2rem;
      }

      .cover-title {
        font-size: 32px;
        font-weight: ${theme.fonts.heading.weight};
        color: ${theme.colors.heading};
        margin-bottom: 1rem;
      }

      .cover-subtitle {
        font-size: 18px;
        color: ${theme.colors.textLight};
        margin-bottom: 2rem;
      }

      .cover-meta {
        font-size: 14px;
        color: ${theme.colors.textLight};
      }

      /* 目录 */
      .toc {
        page-break-after: always;
        padding: 2rem;
      }

      .toc-title {
        font-size: 24px;
        font-weight: ${theme.fonts.heading.weight};
        color: ${theme.colors.heading};
        margin-bottom: 1.5rem;
        padding-bottom: 0.5rem;
        border-bottom: 2px solid ${theme.colors.primary};
      }

      .toc-item {
        display: flex;
        justify-content: space-between;
        padding: 0.5rem 0;
        border-bottom: 1px dotted ${theme.colors.border};
      }

      .toc-item-level-1 { padding-left: 0; font-weight: 600; }
      .toc-item-level-2 { padding-left: 1.5rem; }
      .toc-item-level-3 { padding-left: 3rem; font-size: 0.9em; }

      /* 内容 */
      .content {
        padding: 0;
      }

      h1, h2, h3, h4, h5, h6 {
        font-family: ${theme.fonts.heading.family};
        font-weight: ${theme.fonts.heading.weight};
        color: ${theme.colors.heading};
        margin-top: ${theme.spacing.heading}px;
        margin-bottom: ${theme.spacing.paragraph}px;
        line-height: ${theme.fonts.heading.lineHeight};
      }

      h1 { font-size: 28px; border-bottom: ${theme.decorations.headingUnderline ? `2px solid ${theme.colors.primary}` : "none"}; padding-bottom: 0.5rem; }
      h2 { font-size: 22px; }
      h3 { font-size: 18px; }
      h4 { font-size: 16px; }
      h5 { font-size: 14px; }
      h6 { font-size: 13px; }

      p {
        margin-bottom: ${theme.spacing.paragraph}px;
        text-align: justify;
      }

      ul, ol {
        margin-bottom: ${theme.spacing.list}px;
        padding-left: 2rem;
      }

      li {
        margin-bottom: 0.25rem;
      }

      /* 表格 */
      table {
        width: 100%;
        border-collapse: collapse;
        margin: ${theme.spacing.section}px 0;
      }

      th, td {
        padding: 0.75rem;
        text-align: left;
        border: ${theme.decorations.showTableBorders ? `1px solid ${theme.colors.border}` : "none"};
      }

      th {
        background: ${theme.colors.backgroundAlt || theme.colors.background};
        font-weight: 600;
        color: ${theme.colors.heading};
      }

      tr:nth-child(even) {
        background: ${theme.colors.backgroundAlt || "transparent"};
      }

      /* 代码 */
      code {
        font-family: ${theme.fonts.mono.family};
        font-size: ${theme.fonts.mono.size}px;
        background: ${theme.colors.backgroundAlt || "#f5f5f5"};
        padding: 0.2rem 0.4rem;
        border-radius: ${theme.decorations.roundedCorners ? "4px" : "0"};
      }

      pre {
        background: #1e1e1e;
        color: #d4d4d4;
        padding: 1rem;
        border-radius: ${theme.decorations.roundedCorners ? "8px" : "0"};
        overflow-x: auto;
        margin: ${theme.spacing.section}px 0;
      }

      pre code {
        background: transparent;
        padding: 0;
      }

      /* 引用 */
      blockquote {
        border-left: 4px solid ${theme.colors.primary};
        padding: 1rem;
        margin: ${theme.spacing.section}px 0;
        background: ${theme.colors.backgroundAlt || "#f9f9f9"};
        font-style: italic;
        color: ${theme.colors.textLight};
      }

      /* 分隔线 */
      hr {
        border: none;
        border-top: 1px solid ${theme.colors.border};
        margin: ${theme.spacing.section}px 0;
      }

      /* 提示框 */
      .callout {
        padding: 1rem;
        margin: ${theme.spacing.section}px 0;
        border-radius: ${theme.decorations.roundedCorners ? "8px" : "0"};
        border-left: 4px solid;
      }

      .callout-info { background: #e7f5ff; border-color: ${theme.colors.info || "#3b82f6"}; }
      .callout-warning { background: #fff8e1; border-color: ${theme.colors.warning}; }
      .callout-success { background: #e8f5e9; border-color: ${theme.colors.success}; }
      .callout-error { background: #ffebee; border-color: ${theme.colors.error}; }

      /* 引用标记 */
      .citation {
        color: ${theme.colors.primary};
        font-weight: 600;
        font-size: 0.85em;
        vertical-align: super;
      }

      /* 参考文献 */
      .references {
        page-break-before: always;
        padding: 2rem 0;
      }

      .references-title {
        font-size: 24px;
        font-weight: ${theme.fonts.heading.weight};
        color: ${theme.colors.heading};
        margin-bottom: 1.5rem;
        padding-bottom: 0.5rem;
        border-bottom: 2px solid ${theme.colors.primary};
      }

      .reference-item {
        display: flex;
        margin-bottom: 1rem;
        padding-bottom: 0.75rem;
        border-bottom: 1px solid ${theme.colors.border};
      }

      .reference-number {
        flex-shrink: 0;
        width: 2rem;
        font-weight: 600;
        color: ${theme.colors.primary};
      }

      .reference-content {
        flex: 1;
      }

      .reference-title {
        font-weight: 600;
        color: ${theme.colors.heading};
      }

      .reference-url {
        font-size: 0.9em;
        color: ${theme.colors.link};
        word-break: break-all;
      }

      .reference-snippet {
        font-size: 0.9em;
        color: ${theme.colors.textLight};
        margin-top: 0.25rem;
      }

      /* 水印 */
      .watermark {
        position: fixed;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%) rotate(-45deg);
        font-size: 72px;
        font-weight: bold;
        color: rgba(0, 0, 0, 0.05);
        pointer-events: none;
        white-space: nowrap;
        z-index: 1000;
      }

      /* 打印优化 */
      @media print {
        body { print-color-adjust: exact; -webkit-print-color-adjust: exact; }
        .content { page-break-inside: avoid; }
        h1, h2, h3 { page-break-after: avoid; }
        table, figure { page-break-inside: avoid; }
      }
    `;
  }

  /**
   * 生成封面
   */
  private generateCover(content: UnifiedContent, _theme: ThemeConfig): string {
    const meta = content.metadata;
    return `
      <div class="cover">
        <h1 class="cover-title">${this.escapeHtml(meta.title)}</h1>
        ${meta.subtitle ? `<p class="cover-subtitle">${this.escapeHtml(meta.subtitle)}</p>` : ""}
        <div class="cover-meta">
          ${meta.author ? `<p>作者: ${this.escapeHtml(meta.author)}</p>` : ""}
          ${meta.organization ? `<p>机构: ${this.escapeHtml(meta.organization)}</p>` : ""}
          ${meta.date ? `<p>日期: ${new Date(meta.date).toLocaleDateString("zh-CN")}</p>` : ""}
        </div>
      </div>
    `;
  }

  /**
   * 生成目录
   */
  private generateToc(content: UnifiedContent): string {
    const headings = content.sections.filter(
      (s) => s.type === "heading" && s.level && s.level <= 3,
    );

    if (headings.length === 0) return "";

    const items = headings
      .map(
        (h) => `
      <div class="toc-item toc-item-level-${h.level}">
        <span>${this.escapeHtml(h.content || "")}</span>
      </div>
    `,
      )
      .join("");

    return `
      <div class="toc">
        <h2 class="toc-title">目录</h2>
        ${items}
      </div>
    `;
  }

  /**
   * 生成正文
   */
  private generateBody(
    content: UnifiedContent,
    _theme: ThemeConfig,
    _options: ExportOptions,
  ): string {
    return content.sections
      .map((section) => this.renderSection(section))
      .join("");
  }

  /**
   * 渲染单个内容节
   */
  private renderSection(section: ContentSection): string {
    switch (section.type) {
      case "heading":
        const level = Math.min(section.level || 1, 6);
        return `<h${level}>${this.escapeHtml(section.content || "")}</h${level}>`;

      case "paragraph":
        return `<p>${this.formatContent(section.content || "")}</p>`;

      case "list":
        const tag = section.ordered ? "ol" : "ul";
        const items = section.items
          ?.map((item) => `<li>${this.escapeHtml(item.content)}</li>`)
          .join("");
        return `<${tag}>${items}</${tag}>`;

      case "table":
        return this.renderTable(section);

      case "code":
        return `<pre><code class="language-${section.codeLanguage || ""}">${this.escapeHtml(section.content || "")}</code></pre>`;

      case "quote":
        return `<blockquote>${this.escapeHtml(section.content || "")}</blockquote>`;

      case "divider":
        return "<hr>";

      case "callout":
        return `<div class="callout callout-${section.calloutType || "info"}">${this.escapeHtml(section.content || "")}</div>`;

      case "image":
        return `<figure><img src="${section.imageUrl}" alt="${section.imageAlt || ""}" style="max-width: 100%"><figcaption>${section.imageCaption || ""}</figcaption></figure>`;

      default:
        return `<p>${this.escapeHtml(section.content || "")}</p>`;
    }
  }

  /**
   * 渲染表格
   */
  private renderTable(section: ContentSection): string {
    const headers = section.headers
      ?.map((h) => `<th>${this.escapeHtml(h)}</th>`)
      .join("");
    const rows = section.rows
      ?.map(
        (row) =>
          `<tr>${row.cells.map((c) => `<td>${this.escapeHtml(c)}</td>`).join("")}</tr>`,
      )
      .join("");

    return `
      <table>
        ${headers ? `<thead><tr>${headers}</tr></thead>` : ""}
        <tbody>${rows}</tbody>
      </table>
    `;
  }

  /**
   * 生成参考文献
   */
  private generateReferences(references: any[]): string {
    const items = references
      .map(
        (ref) => `
      <div class="reference-item">
        <span class="reference-number">[${ref.id}]</span>
        <div class="reference-content">
          <div class="reference-title">${this.escapeHtml(ref.title)}</div>
          ${ref.url ? `<div class="reference-url">${this.escapeHtml(ref.url)}</div>` : ""}
          ${ref.snippet ? `<div class="reference-snippet">${this.escapeHtml(ref.snippet.slice(0, 150))}...</div>` : ""}
        </div>
      </div>
    `,
      )
      .join("");

    return `
      <div class="references">
        <h2 class="references-title">参考文献</h2>
        ${items}
      </div>
    `;
  }

  /**
   * 生成水印
   */
  private generateWatermark(text: string, opacity?: number): string {
    const opacityValue = opacity || 0.05;
    return `<div class="watermark" style="opacity: ${opacityValue}">${this.escapeHtml(text)}</div>`;
  }

  /**
   * 格式化内容（处理引用标记等）
   */
  private formatContent(content: string): string {
    // 处理引用标记 [1], [2] 等
    return this.escapeHtml(content).replace(
      /\[(\d+)\]/g,
      '<span class="citation">[$1]</span>',
    );
  }

  /**
   * 转义 HTML
   */
  private escapeHtml(text: string): string {
    const map: Record<string, string> = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#039;",
    };
    return text.replace(/[&<>"']/g, (m) => map[m]);
  }

  /**
   * 映射页面大小
   */
  private mapPageSize(size: string): string {
    const sizeMap: Record<string, string> = {
      A4: "A4",
      A3: "A3",
      Letter: "Letter",
      Legal: "Legal",
    };
    return sizeMap[size] || "A4";
  }
}
