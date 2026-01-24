import { Injectable, Logger } from "@nestjs/common";
import * as puppeteer from "puppeteer";

/**
 * Puppeteer 渲染服务
 * 负责：浏览器管理、HTML 转图片
 */
@Injectable()
export class InfographicRenderService {
  private readonly logger = new Logger(InfographicRenderService.name);
  private browser: puppeteer.Browser | null = null;

  /**
   * 初始化 Puppeteer 浏览器实例
   * 支持通过环境变量 PUPPETEER_EXECUTABLE_PATH 指定 Chrome/Chromium 路径
   */
  private async getBrowser(): Promise<puppeteer.Browser> {
    if (!this.browser) {
      const executablePath = process.env.PUPPETEER_EXECUTABLE_PATH;

      this.logger.log(
        `Launching Puppeteer with executable: ${executablePath || "bundled chromium"}`,
      );

      this.browser = await puppeteer.launch({
        headless: true,
        executablePath: executablePath || undefined,
        args: [
          "--no-sandbox",
          "--disable-setuid-sandbox",
          "--disable-dev-shm-usage",
          "--disable-gpu",
          "--font-render-hinting=none",
          "--disable-software-rasterizer",
          "--single-process", // 更好的容器兼容性
        ],
      });
    }
    return this.browser;
  }

  /**
   * 清理浏览器实例
   */
  async cleanup(): Promise<void> {
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
    }
  }

  /**
   * 渲染 HTML 为图片
   * 严格按照指定的 width x height 尺寸渲染
   */
  async renderToImage(
    html: string,
    width: number = 1200,
    height: number = 800,
  ): Promise<string> {
    const browser = await this.getBrowser();
    const page = await browser.newPage();

    this.logger.log(
      `[renderToImage] Rendering with dimensions: ${width}x${height}`,
    );

    try {
      // 设置视口为目标尺寸
      await page.setViewport({ width, height, deviceScaleFactor: 2 });

      // 加载 HTML
      await page.setContent(html, {
        waitUntil: "networkidle0",
        timeout: 30000,
      });

      // 等待字体加载
      await page.evaluate(() => document.fonts.ready);

      // 截图 - 使用 clip 确保精确尺寸，不使用 fullPage
      const screenshot = await page.screenshot({
        type: "png",
        encoding: "base64",
        clip: {
          x: 0,
          y: 0,
          width: width,
          height: height,
        },
      });

      this.logger.log(
        `[renderToImage] Screenshot completed with exact dimensions: ${width}x${height}`,
      );

      return `data:image/png;base64,${screenshot}`;
    } finally {
      await page.close();
    }
  }
}
