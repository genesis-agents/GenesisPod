/**
 * Puppeteer Browser Pool Service
 * 集中管理 Puppeteer 浏览器实例，支持本地启动和远程 Browserless 连接
 *
 * 环境变量：
 * - BROWSERLESS_URL: 远程 Browserless WebSocket 地址（如 wss://chrome.browserless.io?token=xxx）
 *   设置后使用远程浏览器，不设置则使用本地 Chromium
 */

import { Injectable, Logger, OnModuleDestroy } from "@nestjs/common";
import puppeteer, { Browser } from "puppeteer";

const DEFAULT_LAUNCH_ARGS = [
  "--no-sandbox",
  "--disable-setuid-sandbox",
  "--disable-dev-shm-usage",
  "--disable-gpu",
  "--font-render-hinting=none",
];

@Injectable()
export class PuppeteerPoolService implements OnModuleDestroy {
  private readonly logger = new Logger(PuppeteerPoolService.name);
  private browserPromise: Promise<Browser> | null = null;

  private get browserlessUrl(): string | undefined {
    return process.env.BROWSERLESS_URL;
  }

  private get isRemote(): boolean {
    return !!this.browserlessUrl;
  }

  async onModuleDestroy(): Promise<void> {
    await this.closeBrowser();
  }

  /**
   * 获取共享浏览器实例（Promise 缓存模式避免并发启动）
   * - BROWSERLESS_URL 存在时通过 WebSocket 连接远程浏览器
   * - 否则本地启动 Chromium
   */
  async getBrowser(): Promise<Browser> {
    if (!this.browserPromise) {
      this.browserPromise = this.createBrowser().catch((err) => {
        this.browserPromise = null;
        throw err;
      });
    }

    const browser = await this.browserPromise;
    if (!browser.connected) {
      this.logger.warn("Browser disconnected, reconnecting...");
      this.browserPromise = this.createBrowser().catch((err) => {
        this.browserPromise = null;
        throw err;
      });
      return this.browserPromise;
    }
    return browser;
  }

  /**
   * 关闭当前浏览器实例
   */
  async closeBrowser(): Promise<void> {
    if (this.browserPromise) {
      try {
        const browser = await this.browserPromise;
        await browser.close();
      } catch {
        // Ignore close errors
      }
      this.browserPromise = null;
      this.logger.log("Browser pool cleaned up");
    }
  }

  private async createBrowser(): Promise<Browser> {
    if (this.isRemote) {
      return this.connectRemote();
    }
    return this.launchLocal();
  }

  private async connectRemote(): Promise<Browser> {
    const url = this.browserlessUrl!;
    this.logger.log(
      `Connecting to remote browser: ${url.replace(/token=[^&]+/, "token=***")}`,
    );

    const browser = await puppeteer.connect({
      browserWSEndpoint: url,
    });

    this.logger.log("Remote browser connected successfully");
    return browser;
  }

  private async launchLocal(): Promise<Browser> {
    const executablePath = process.env.PUPPETEER_EXECUTABLE_PATH || undefined;

    this.logger.log(
      `Launching local Chromium${executablePath ? ` from: ${executablePath}` : " (bundled)"}`,
    );

    const browser = await puppeteer.launch({
      headless: true,
      executablePath,
      args: DEFAULT_LAUNCH_ARGS,
    });

    this.logger.log("Local Chromium launched successfully");
    return browser;
  }
}
