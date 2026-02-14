/**
 * WYSIWYG 渲染服务
 * 使用 Puppeteer 将前端捕获的 HTML+CSS 渲染为各种导出格式
 */

import { Injectable, Logger, OnModuleDestroy } from "@nestjs/common";
import puppeteer, { Browser } from "puppeteer";
import { ExportOptions } from "../types/export-options";

export interface WysiwygOptions {
  pageSize?: "A4" | "A3" | "Letter" | "Legal";
  orientation?: "portrait" | "landscape";
  includePageNumbers?: boolean;
  watermark?: string;
  watermarkOpacity?: number;
  marginTop?: number;
  marginRight?: number;
  marginBottom?: number;
  marginLeft?: number;
}

export interface ScreenshotOptions extends WysiwygOptions {
  width?: number;
  height?: number;
  deviceScaleFactor?: number;
}

@Injectable()
export class WysiwygRenderService implements OnModuleDestroy {
  private readonly logger = new Logger(WysiwygRenderService.name);
  private browserPromise: Promise<Browser> | null = null;

  private readonly launchOptions = {
    headless: true as const,
    executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined,
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
      "--disable-gpu",
      "--font-render-hinting=none",
    ],
  };

  async onModuleDestroy(): Promise<void> {
    await this.closeBrowser();
  }

  /**
   * 根据格式分发渲染
   */
  async renderByFormat(
    format: string,
    html: string,
    css: string | undefined,
    options: ExportOptions,
  ): Promise<Buffer> {
    const wysiwygOptions: WysiwygOptions = {
      pageSize: options.pageSize,
      orientation: options.orientation,
      includePageNumbers: options.includePageNumbers,
      watermark: options.watermark,
      watermarkOpacity: options.watermarkOpacity,
    };

    switch (format) {
      case "PDF":
        return this.renderToPdf(html, css || "", wysiwygOptions);
      case "HTML":
        return this.renderToStandaloneHtml(html, css || "", options);
      case "PPTX":
        return this.renderToScreenshots(html, css || "", wysiwygOptions);
      case "DOCX":
        return this.renderToScreenshots(html, css || "", wysiwygOptions);
      default:
        throw new Error(`WYSIWYG mode not supported for format: ${format}`);
    }
  }

  /**
   * 渲染 HTML+CSS 为 PDF
   */
  async renderToPdf(
    html: string,
    css: string,
    options: WysiwygOptions,
  ): Promise<Buffer> {
    this.logger.debug("WYSIWYG: Rendering HTML to PDF...");
    const browser = await this.getBrowser();
    const page = await browser.newPage();

    try {
      await page.setJavaScriptEnabled(false);
      await page.setRequestInterception(true);
      page.on("request", (request) => {
        const url = request.url();
        if (url.startsWith("data:") || url === "about:blank") {
          request.continue();
        } else {
          request.abort("blockedbyclient");
        }
      });

      const fullHtml = this.wrapHtml(html, css, {});
      await page.setContent(fullHtml, {
        waitUntil: "networkidle0",
        timeout: 30000,
      });

      const pageFormat = this.mapPageSize(options.pageSize);
      const margin = {
        top: `${options.marginTop || 40}px`,
        right: `${options.marginRight || 40}px`,
        bottom: `${options.marginBottom || 40}px`,
        left: `${options.marginLeft || 40}px`,
      };

      const pdfOptions: Parameters<typeof page.pdf>[0] = {
        format: pageFormat as "A4" | "A3" | "Letter" | "Legal",
        landscape: options.orientation === "landscape",
        margin,
        printBackground: true,
      };

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
      this.logger.debug(`WYSIWYG PDF generated: ${pdfBuffer.length} bytes`);
      return Buffer.from(pdfBuffer);
    } finally {
      await page.close();
    }
  }

  /**
   * 渲染 HTML+CSS 为 PNG 截图（用于 PPTX/DOCX 嵌入）
   * 返回一组 Buffer，每个代表一页的截图
   */
  async renderToScreenshots(
    html: string,
    css: string,
    options: WysiwygOptions,
  ): Promise<Buffer> {
    this.logger.debug("WYSIWYG: Rendering HTML to screenshots...");
    const browser = await this.getBrowser();
    const page = await browser.newPage();

    try {
      await page.setJavaScriptEnabled(false);
      await page.setRequestInterception(true);
      page.on("request", (request) => {
        const url = request.url();
        if (url.startsWith("data:") || url === "about:blank") {
          request.continue();
        } else {
          request.abort("blockedbyclient");
        }
      });

      // 设置视口 - 标准 16:9 宽度
      const viewportWidth = options.orientation === "landscape" ? 1280 : 960;
      await page.setViewport({
        width: viewportWidth,
        height: 720,
        deviceScaleFactor: 2, // 高分辨率截图
      });

      const fullHtml = this.wrapHtml(html, css, {});
      await page.setContent(fullHtml, {
        waitUntil: "networkidle0",
        timeout: 30000,
      });

      // 单张全页截图
      const screenshot = await page.screenshot({
        type: "png",
        fullPage: true,
      });

      this.logger.debug(
        `WYSIWYG screenshot generated: ${screenshot.length} bytes`,
      );
      return Buffer.from(screenshot);
    } finally {
      await page.close();
    }
  }

  /**
   * 渲染为独立 HTML 文件
   */
  async renderToStandaloneHtml(
    html: string,
    css: string,
    options: ExportOptions,
  ): Promise<Buffer> {
    this.logger.debug("WYSIWYG: Generating standalone HTML...");
    const fullHtml = this.wrapHtml(html, css, {
      title: options.fileName || "Export",
      watermark: options.watermark,
      watermarkOpacity: options.watermarkOpacity,
    });
    return Buffer.from(fullHtml, "utf-8");
  }

  /**
   * 将分页内容截图为多张图片
   * 用于 PPTX 每一张幻灯片一页
   */
  async paginateAndScreenshot(
    html: string,
    css: string,
    pageHeight: number,
    options: ScreenshotOptions,
  ): Promise<Buffer[]> {
    this.logger.debug("WYSIWYG: Paginating and capturing screenshots...");
    const browser = await this.getBrowser();
    const page = await browser.newPage();

    try {
      await page.setJavaScriptEnabled(false);
      await page.setRequestInterception(true);
      page.on("request", (request) => {
        const url = request.url();
        if (url.startsWith("data:") || url === "about:blank") {
          request.continue();
        } else {
          request.abort("blockedbyclient");
        }
      });

      const viewportWidth = options.width || 960;
      await page.setViewport({
        width: viewportWidth,
        height: pageHeight,
        deviceScaleFactor: options.deviceScaleFactor || 2,
      });

      const fullHtml = this.wrapHtml(html, css, {});
      await page.setContent(fullHtml, {
        waitUntil: "networkidle0",
        timeout: 30000,
      });

      // 获取内容总高度
      const contentHeight = await page.evaluate(
        () => document.body.scrollHeight,
      );
      const pageCount = Math.ceil(contentHeight / pageHeight);
      const screenshots: Buffer[] = [];

      for (let i = 0; i < pageCount; i++) {
        const screenshot = await page.screenshot({
          type: "png",
          clip: {
            x: 0,
            y: i * pageHeight,
            width: viewportWidth,
            height: Math.min(pageHeight, contentHeight - i * pageHeight),
          },
        });
        screenshots.push(Buffer.from(screenshot));
      }

      this.logger.debug(
        `WYSIWYG: Generated ${screenshots.length} page screenshots`,
      );
      return screenshots;
    } finally {
      await page.close();
    }
  }

  /**
   * 包装捕获的 HTML 为完整文档
   */
  private wrapHtml(
    html: string,
    css: string,
    metadata: {
      title?: string;
      watermark?: string;
      watermarkOpacity?: number;
    },
  ): string {
    const safeHtml = this.sanitizeHtml(html);
    const safeCss = this.sanitizeCss(css);

    const watermarkHtml = metadata.watermark
      ? `<div style="
          position: fixed; top: 50%; left: 50%;
          transform: translate(-50%, -50%) rotate(-45deg);
          font-size: 72px; font-weight: bold;
          color: rgba(0, 0, 0, ${metadata.watermarkOpacity || 0.05});
          pointer-events: none; white-space: nowrap; z-index: 10000;
          user-select: none;
        ">${this.escapeHtml(metadata.watermark)}</div>`
      : "";

    return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${this.escapeHtml(metadata.title || "Export")}</title>
  <style>
    /* Reset for export rendering */
    *, *::before, *::after {
      box-sizing: border-box;
    }
    body {
      margin: 0;
      padding: 20px;
      font-family: 'Inter', 'Noto Sans SC', system-ui, -apple-system, sans-serif;
      -webkit-font-smoothing: antialiased;
      -moz-osx-font-smoothing: grayscale;
    }
    /* Ensure SVGs render correctly */
    svg { max-width: 100%; }
    /* Captured styles */
    ${safeCss}
  </style>
</head>
<body>
  ${safeHtml}
  ${watermarkHtml}
</body>
</html>`;
  }

  /**
   * 获取或创建 Puppeteer 浏览器实例（Promise 缓存模式避免并发启动泄漏）
   * Public so PdfRenderer can reuse the shared browser instead of launching its own.
   */
  async getBrowser(): Promise<Browser> {
    if (!this.browserPromise) {
      this.browserPromise = puppeteer
        .launch(this.launchOptions)
        .catch((err) => {
          this.browserPromise = null;
          throw err;
        });
    }

    const browser = await this.browserPromise;
    if (!browser.connected) {
      this.browserPromise = puppeteer
        .launch(this.launchOptions)
        .catch((err) => {
          this.browserPromise = null;
          throw err;
        });
      return this.browserPromise;
    }
    return browser;
  }

  /**
   * 关闭浏览器
   */
  private async closeBrowser(): Promise<void> {
    if (this.browserPromise) {
      try {
        const browser = await this.browserPromise;
        await browser.close();
      } catch {
        // Ignore close errors
      }
      this.browserPromise = null;
    }
  }

  /**
   * 映射页面大小
   */
  private mapPageSize(size?: string): string {
    const sizeMap: Record<string, string> = {
      A4: "A4",
      A3: "A3",
      Letter: "Letter",
      Legal: "Legal",
    };
    return sizeMap[size || "A4"] || "A4";
  }

  /**
   * 清洗 CSS，移除可能的外部资源引用和危险表达式
   */
  private sanitizeCss(css: string): string {
    return css
      .replace(/@import\s+[^;]+;/gi, "/* @import removed */")
      .replace(
        /url\s*\(\s*['"]?\s*(https?:|file:|ftp:|\/\/)[^)]*\)/gi,
        "url(about:blank)",
      )
      .replace(/expression\s*\(/gi, "/* expression removed */(");
  }

  /**
   * 清洗 HTML，移除危险标签和属性
   */
  private sanitizeHtml(html: string): string {
    return html
      .replace(/<script[\s\S]*?<\/script>/gi, "")
      .replace(/<iframe[\s\S]*?<\/iframe>/gi, "")
      .replace(/<object[\s\S]*?<\/object>/gi, "")
      .replace(/<embed[\s\S]*?>/gi, "")
      .replace(/<link[^>]*>/gi, "")
      .replace(/<meta[^>]*>/gi, "")
      .replace(/<base[^>]*>/gi, "")
      .replace(/\bon\w+\s*=\s*(['"]?)[\s\S]*?\1/gi, "")
      .replace(/javascript\s*:/gi, "blocked:");
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
}
