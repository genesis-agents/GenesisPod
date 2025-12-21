/**
 * Puppeteer 网页抓取服务
 * 用于处理需要 JavaScript 渲染或有 Cloudflare 保护的网页
 */

import { Injectable, Logger } from "@nestjs/common";
import * as puppeteer from "puppeteer";

export interface PuppeteerFetchResult {
  success: boolean;
  html?: string;
  title?: string;
  error?: string;
  loadTime?: number;
}

@Injectable()
export class PuppeteerFetcherService {
  private readonly logger = new Logger(PuppeteerFetcherService.name);

  // 浏览器实例池（可复用）
  private browser: puppeteer.Browser | null = null;
  private browserLaunchPromise: Promise<puppeteer.Browser> | null = null;

  /**
   * 获取或创建浏览器实例
   */
  private async getBrowser(): Promise<puppeteer.Browser> {
    // 如果已有浏览器实例且未关闭，直接返回
    if (this.browser && this.browser.connected) {
      return this.browser;
    }

    // 如果正在启动中，等待启动完成
    if (this.browserLaunchPromise) {
      return this.browserLaunchPromise;
    }

    // 启动新浏览器
    this.browserLaunchPromise = puppeteer.launch({
      headless: true,
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
        "--disable-accelerated-2d-canvas",
        "--disable-gpu",
        "--window-size=1920,1080",
        // 增加反检测能力
        "--disable-blink-features=AutomationControlled",
      ],
    });

    this.browser = await this.browserLaunchPromise;
    this.browserLaunchPromise = null;

    // 监听断开事件
    this.browser.on("disconnected", () => {
      this.browser = null;
    });

    return this.browser;
  }

  /**
   * 使用 Puppeteer 获取网页内容
   * 可以绕过 Cloudflare 等 JavaScript 挑战
   */
  async fetchPage(
    url: string,
    options: {
      timeout?: number;
      waitForSelector?: string;
      waitForNavigation?: boolean;
    } = {},
  ): Promise<PuppeteerFetchResult> {
    const {
      timeout = 30000,
      waitForSelector,
      waitForNavigation = true,
    } = options;
    const startTime = Date.now();

    let page: puppeteer.Page | null = null;

    try {
      this.logger.log(`Fetching page with Puppeteer: ${url}`);

      const browser = await this.getBrowser();
      page = await browser.newPage();

      // 设置 viewport 和 user agent
      await page.setViewport({ width: 1920, height: 1080 });
      await page.setUserAgent(
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      );

      // 设置额外的请求头
      await page.setExtraHTTPHeaders({
        "Accept-Language": "en-US,en;q=0.9,zh-CN;q=0.8,zh;q=0.7",
        Accept:
          "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",
      });

      // 绕过 webdriver 检测
      await page.evaluateOnNewDocument(() => {
        // 移除 webdriver 标记
        Object.defineProperty(navigator, "webdriver", {
          get: () => undefined,
        });

        // 模拟 chrome 对象
        (window as any).chrome = {
          runtime: {},
        };

        // 模拟权限
        const originalQuery = window.navigator.permissions.query;
        window.navigator.permissions.query = (parameters: any) =>
          parameters.name === "notifications"
            ? Promise.resolve({
                state: Notification.permission,
              } as PermissionStatus)
            : originalQuery(parameters);
      });

      // 导航到页面
      const response = await page.goto(url, {
        waitUntil: waitForNavigation ? "networkidle2" : "domcontentloaded",
        timeout,
      });

      if (!response) {
        throw new Error("No response received from page");
      }

      const status = response.status();
      if (status >= 400 && status !== 403) {
        // 403 可能是 Cloudflare 中间页面，继续等待
        throw new Error(`Page returned status ${status}`);
      }

      // 等待 Cloudflare 挑战完成（如果存在）
      // Cloudflare 会在验证后重定向或更新页面内容
      await this.waitForCloudflare(page, timeout);

      // 如果指定了等待选择器
      if (waitForSelector) {
        await page
          .waitForSelector(waitForSelector, { timeout: 10000 })
          .catch(() => {
            this.logger.warn(
              `Selector ${waitForSelector} not found, continuing anyway`,
            );
          });
      }

      // 获取页面 HTML
      const html = await page.content();
      const title = await page.title();

      const loadTime = Date.now() - startTime;
      this.logger.log(
        `Successfully fetched page with Puppeteer (${loadTime}ms): ${title}`,
      );

      return {
        success: true,
        html,
        title,
        loadTime,
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      this.logger.error(`Puppeteer fetch failed for ${url}: ${errorMessage}`);

      return {
        success: false,
        error: errorMessage,
        loadTime: Date.now() - startTime,
      };
    } finally {
      // 关闭页面但保留浏览器实例
      if (page) {
        await page.close().catch(() => {});
      }
    }
  }

  /**
   * 等待 Cloudflare 挑战完成
   */
  private async waitForCloudflare(
    page: puppeteer.Page,
    maxWait: number,
  ): Promise<void> {
    const startTime = Date.now();
    const checkInterval = 500;

    while (Date.now() - startTime < maxWait) {
      const html = await page.content();

      // 检测 Cloudflare 挑战页面的特征
      const isCloudflareChallenge =
        html.includes("Just a moment...") ||
        html.includes("Checking your browser") ||
        html.includes("Verify you are human") ||
        html.includes("cf-browser-verification") ||
        html.includes("challenge-platform");

      if (!isCloudflareChallenge) {
        // 不再是 Cloudflare 挑战页面，验证已通过
        this.logger.log("Cloudflare challenge passed or not present");
        return;
      }

      this.logger.debug("Waiting for Cloudflare challenge to complete...");
      await new Promise((resolve) => setTimeout(resolve, checkInterval));
    }

    this.logger.warn(
      "Cloudflare challenge timeout, continuing with current page",
    );
  }

  /**
   * 关闭浏览器（用于清理）
   */
  async closeBrowser(): Promise<void> {
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
    }
  }

  /**
   * 服务销毁时清理资源
   */
  async onModuleDestroy(): Promise<void> {
    await this.closeBrowser();
  }
}
