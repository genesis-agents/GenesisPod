/**
 * Browser Service
 * AI Engine 核心能力 - 通用浏览器生命周期管理
 *
 * 提供通用的浏览器操作能力：
 * - 浏览器懒初始化（动态导入 playwright-core）
 * - 浏览器上下文管理
 * - 页面管理
 * - 会话保存与恢复
 * - 截图
 * - 资源清理
 */

import { Injectable, Logger, OnModuleDestroy } from "@nestjs/common";
import { BrowserPageOptions, SessionData } from "./browser.types";

// Playwright types - properly typed when playwright-core is installed
type Browser = any;
type BrowserContext = any;
type Page = any;

@Injectable()
export class BrowserService implements OnModuleDestroy {
  private readonly logger = new Logger(BrowserService.name);
  private browser: Browser | null = null;
  private contexts: Map<string, BrowserContext> = new Map();

  async onModuleDestroy() {
    await this.cleanup();
  }

  /**
   * 懒初始化浏览器实例（使用动态导入，playwright-core 为可选依赖）
   */
  async getBrowser(): Promise<Browser> {
    if (this.browser) return this.browser;

    try {
      const { chromium } = await import("playwright-core");

      // Use system Chromium if available (Docker environment)
      // Falls back to bundled Chromium if not set
      const executablePath =
        process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ||
        process.env.PUPPETEER_EXECUTABLE_PATH ||
        undefined;

      this.logger.log(
        `Attempting to launch Chromium${executablePath ? ` from: ${executablePath}` : " (using bundled)"}`,
      );

      // Check if executable exists when path is specified
      if (executablePath) {
        const fs = await import("fs");
        if (!fs.existsSync(executablePath)) {
          throw new Error(
            `Chromium not found at: ${executablePath}. Please install Chromium or set correct path.`,
          );
        }
      }

      this.browser = await chromium.launch({
        headless: true,
        executablePath,
        args: [
          "--no-sandbox",
          "--disable-setuid-sandbox",
          "--disable-dev-shm-usage",
          "--disable-gpu",
        ],
      });

      this.logger.log(
        `Playwright browser launched successfully${executablePath ? ` (using: ${executablePath})` : ""}`,
      );
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      this.logger.error(`Failed to launch browser: ${errorMsg}`);
      throw new Error(
        "playwright-core is not installed. Install it with: npm install playwright-core",
      );
    }

    return this.browser;
  }

  /**
   * 创建浏览器上下文
   */
  async createContext(
    contextId: string,
    options?: BrowserPageOptions,
  ): Promise<BrowserContext> {
    const browser = await this.getBrowser();
    const context = await browser.newContext({
      viewport: options?.viewport ?? { width: 1280, height: 720 },
      userAgent:
        options?.userAgent ??
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      locale: options?.locale,
      timezoneId: options?.timezoneId,
    });
    this.contexts.set(contextId, context);
    return context;
  }

  /**
   * 获取已有的浏览器上下文
   */
  async getContext(contextId: string): Promise<BrowserContext | null> {
    return this.contexts.get(contextId) ?? null;
  }

  /**
   * 在指定上下文中创建新页面（上下文不存在时自动创建）
   */
  async createPage(contextId: string): Promise<Page> {
    let context = this.contexts.get(contextId);
    if (!context) {
      context = await this.createContext(contextId);
    }
    return context.newPage();
  }

  /**
   * 关闭指定上下文
   */
  async closeContext(contextId: string): Promise<void> {
    const context = this.contexts.get(contextId);
    if (context) {
      await context.close();
      this.contexts.delete(contextId);
    }
  }

  /**
   * 保存会话数据（cookies + localStorage + sessionStorage）
   */
  async saveSession(contextId: string): Promise<SessionData | null> {
    const context = this.contexts.get(contextId);
    if (!context) {
      return null;
    }

    const pages = context.pages();
    if (pages.length === 0) {
      return null;
    }

    const page = pages[0];
    const cookies = await context.cookies();

    // Get storage data
    const localStorage = await page.evaluate(() => {
      const data: Record<string, string> = {};
      for (let i = 0; i < window.localStorage.length; i++) {
        const key = window.localStorage.key(i);
        if (key) {
          data[key] = window.localStorage.getItem(key) || "";
        }
      }
      return data;
    });

    const sessionStorage = await page.evaluate(() => {
      const data: Record<string, string> = {};
      for (let i = 0; i < window.sessionStorage.length; i++) {
        const key = window.sessionStorage.key(i);
        if (key) {
          data[key] = window.sessionStorage.getItem(key) || "";
        }
      }
      return data;
    });

    return { cookies, localStorage, sessionStorage };
  }

  /**
   * 恢复会话数据到指定上下文（上下文不存在时自动创建）
   */
  async restoreSession(
    contextId: string,
    sessionData: SessionData,
  ): Promise<void> {
    let context = this.contexts.get(contextId);
    if (!context) {
      context = await this.createContext(contextId);
    }

    // Restore cookies
    if (sessionData.cookies && sessionData.cookies.length > 0) {
      await context.addCookies(sessionData.cookies);
    }

    // Storage will be restored when page navigates
  }

  /**
   * 截取页面截图（保存到指定路径）
   */
  async screenshot(page: Page, path: string): Promise<void> {
    await page.screenshot({ path, fullPage: true });
  }

  /**
   * 清理所有上下文和浏览器实例
   */
  async cleanup(): Promise<void> {
    for (const [id, context] of this.contexts) {
      try {
        await context.close();
      } catch (error) {
        this.logger.warn(`Failed to close context ${id}: ${error}`);
      }
      this.contexts.delete(id);
    }

    if (this.browser) {
      try {
        await this.browser.close();
      } catch (error) {
        this.logger.warn(`Failed to close browser: ${error}`);
      }
      this.browser = null;
    }

    this.logger.log("Browser cleanup completed");
  }
}
