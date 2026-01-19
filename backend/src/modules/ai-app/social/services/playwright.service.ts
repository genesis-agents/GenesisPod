import { Injectable, Logger, OnModuleDestroy } from "@nestjs/common";

// Playwright types - will be properly typed when playwright-core is installed
type Browser = any;
type BrowserContext = any;
type Page = any;

export interface SessionData {
  cookies: any[];
  localStorage: Record<string, string>;
  sessionStorage: Record<string, string>;
}

@Injectable()
export class PlaywrightService implements OnModuleDestroy {
  private readonly logger = new Logger(PlaywrightService.name);
  private browser: Browser | null = null;
  private contexts: Map<string, BrowserContext> = new Map();

  async onModuleDestroy() {
    await this.cleanup();
  }

  private async getBrowser(): Promise<Browser> {
    if (!this.browser) {
      try {
        // Dynamic import to avoid issues if playwright-core not installed
        // @ts-expect-error playwright-core may not be installed yet
        const playwright = await import("playwright-core").catch(() => null);
        if (!playwright) {
          throw new Error("playwright-core is not installed");
        }
        this.browser = await playwright.chromium.launch({
          headless: true,
          args: ["--no-sandbox", "--disable-setuid-sandbox"],
        });
        this.logger.log("Playwright browser launched");
      } catch (error) {
        this.logger.error("Failed to launch browser", error);
        throw new Error(
          "Playwright browser launch failed. Please ensure playwright-core is installed.",
        );
      }
    }
    return this.browser;
  }

  async createContext(contextId: string): Promise<BrowserContext> {
    const browser = await this.getBrowser();
    const context = await browser.newContext({
      viewport: { width: 1280, height: 720 },
      userAgent:
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    });
    this.contexts.set(contextId, context);
    return context;
  }

  async getContext(contextId: string): Promise<BrowserContext | null> {
    return this.contexts.get(contextId) || null;
  }

  async createPage(contextId: string): Promise<Page> {
    let context = this.contexts.get(contextId);
    if (!context) {
      context = await this.createContext(contextId);
    }
    return context.newPage();
  }

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

  async closeContext(contextId: string): Promise<void> {
    const context = this.contexts.get(contextId);
    if (context) {
      await context.close();
      this.contexts.delete(contextId);
    }
  }

  async cleanup(): Promise<void> {
    for (const [id, context] of this.contexts) {
      await context.close();
      this.contexts.delete(id);
    }

    if (this.browser) {
      await this.browser.close();
      this.browser = null;
    }

    this.logger.log("Playwright cleanup completed");
  }

  async screenshot(page: Page, path: string): Promise<void> {
    await page.screenshot({ path, fullPage: true });
  }
}
