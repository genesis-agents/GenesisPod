/**
 * Browser Service
 * 通用浏览器生命周期管理（共享基础设施）
 *
 * 提供通用的浏览器操作能力：
 * - 基于 PuppeteerPoolService 的浏览器复用
 * - 浏览器上下文（incognito context）管理
 * - 页面管理
 * - 会话保存与恢复
 * - 截图
 * - 资源清理
 */

import { Injectable, Logger, OnModuleDestroy } from "@nestjs/common";
import { BrowserContext, Page } from "puppeteer";
import { BrowserPageOptions, SessionData } from "./browser.types";
import { PuppeteerPoolService } from "./puppeteer-pool.service";

@Injectable()
export class BrowserService implements OnModuleDestroy {
  private readonly logger = new Logger(BrowserService.name);
  private contexts: Map<string, BrowserContext> = new Map();

  constructor(private readonly puppeteerPool: PuppeteerPoolService) {}

  async onModuleDestroy() {
    await this.cleanup();
  }

  /**
   * 创建浏览器上下文（Puppeteer incognito context）
   */
  async createContext(
    contextId: string,
    _options?: BrowserPageOptions,
  ): Promise<BrowserContext> {
    const browser = await this.puppeteerPool.getBrowser();
    const context = await browser.createBrowserContext();
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
  async createPage(
    contextId: string,
    options?: BrowserPageOptions,
  ): Promise<Page> {
    let context = this.contexts.get(contextId);
    if (!context) {
      context = await this.createContext(contextId, options);
    }
    const page = await context.newPage();

    // Apply viewport and userAgent
    const viewport = options?.viewport ?? { width: 1280, height: 720 };
    await page.setViewport(viewport);

    const userAgent =
      options?.userAgent ??
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";
    await page.setUserAgent(userAgent);

    return page;
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

    const pages = await context.pages();
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
      await context.setCookie(...sessionData.cookies);
    }
  }

  /**
   * 截取页面截图（保存到指定路径）
   */
  async screenshot(page: Page, path: string): Promise<void> {
    await page.screenshot({ path, fullPage: true });
  }

  /**
   * 清理所有上下文（浏览器实例由 PuppeteerPoolService 管理）
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

    this.logger.log("Browser contexts cleanup completed");
  }
}
