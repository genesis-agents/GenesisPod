import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from "@nestjs/common";
import { v4 as uuidv4 } from "uuid";

// Playwright types - will be properly typed when playwright-core is installed
type Browser = any;
type BrowserContext = any;
type Page = any;

export interface SessionData {
  cookies: any[];
  localStorage: Record<string, string>;
  sessionStorage: Record<string, string>;
}

// Platform login configuration
export interface PlatformLoginConfig {
  loginUrl: string;
  loginSuccessIndicator: string; // CSS selector or URL pattern
  qrCodeSelector?: string;
  needClickLogin?: boolean; // 是否需要先点击登录按钮
  loginButtonSelector?: string; // 登录按钮选择器
}

// Pending login session
export interface PendingLoginSession {
  contextId: string;
  platformType: string;
  userId: string;
  createdAt: Date;
  page: Page;
}

// Platform configs
const PLATFORM_CONFIGS: Record<string, PlatformLoginConfig> = {
  WECHAT_MP: {
    loginUrl: "https://mp.weixin.qq.com/",
    loginSuccessIndicator: ".weui-desktop-account__nickname", // 登录后显示的昵称
    qrCodeSelector:
      ".login__type__container__scan__qrcode img, .qrcode img, [class*='qrcode'] img, canvas[class*='qr']", // 二维码元素 - 多个选择器
  },
  XIAOHONGSHU: {
    loginUrl: "https://www.xiaohongshu.com/explore",
    loginSuccessIndicator: ".user-info, .user-name, .header-user", // 登录后显示的用户信息
    qrCodeSelector: ".qrcode-image img, [class*='qrcode'] img, canvas", // 主站二维码选择器
    needClickLogin: true, // 需要先点击登录按钮
    loginButtonSelector: ".login-btn, .login-button, button:has-text('登录')", // 登录按钮选择器
  },
};

// Export for use in other services
export { PLATFORM_CONFIGS };

@Injectable()
export class PlaywrightService implements OnModuleDestroy, OnModuleInit {
  private readonly logger = new Logger(PlaywrightService.name);
  private browser: Browser | null = null;
  private contexts: Map<string, BrowserContext> = new Map();
  private pendingLogins: Map<string, PendingLoginSession> = new Map();
  private cleanupInterval: NodeJS.Timeout | null = null;

  onModuleInit() {
    // Start periodic cleanup of expired sessions (every 2 minutes)
    this.cleanupInterval = setInterval(
      () => {
        this.cleanupExpiredSessions().catch((err) => {
          this.logger.error("Failed to cleanup expired sessions", err);
        });
      },
      2 * 60 * 1000,
    );
    this.logger.log("Playwright service initialized with session cleanup");
  }

  async onModuleDestroy() {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
    await this.cleanup();
  }

  private async getBrowser(): Promise<Browser> {
    if (!this.browser) {
      try {
        // Dynamic import to avoid issues if playwright-core not installed
        const playwright = await import("playwright-core").catch(() => null);
        if (!playwright) {
          throw new Error("playwright-core is not installed");
        }

        // Use system Chromium if available (Docker environment)
        // Falls back to bundled Chromium if not set
        const executablePath =
          process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ||
          process.env.PUPPETEER_EXECUTABLE_PATH ||
          undefined;

        this.browser = await playwright.chromium.launch({
          headless: true,
          executablePath,
          args: ["--no-sandbox", "--disable-setuid-sandbox"],
        });
        this.logger.log(
          `Playwright browser launched${executablePath ? ` (using: ${executablePath})` : ""}`,
        );
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

  // ==================== 登录会话管理 ====================

  /**
   * 开始登录会话 - 打开平台登录页面
   */
  async startLoginSession(
    userId: string,
    platformType: string,
  ): Promise<{ sessionKey: string; screenshot: string }> {
    const config = PLATFORM_CONFIGS[platformType];
    if (!config) {
      throw new Error(`Unknown platform: ${platformType}`);
    }

    const sessionKey = `login-${userId}-${platformType}-${uuidv4()}`;
    this.logger.log(`Starting login session: ${sessionKey}`);

    try {
      const page = await this.createPage(sessionKey);

      // 导航到登录页
      await page.goto(config.loginUrl, { waitUntil: "networkidle" });

      // 等待页面加载
      await page.waitForTimeout(2000);

      // 如果需要先点击登录按钮
      if (config.needClickLogin && config.loginButtonSelector) {
        try {
          // 先尝试关闭任何现有的遮罩层
          const mask = await page.$(".reds-mask, [class*='mask']");
          if (mask) {
            await mask.click({ force: true });
            await page.waitForTimeout(500);
          }

          const loginBtn = await page.$(config.loginButtonSelector);
          if (loginBtn) {
            // 使用 force: true 绕过遮罩层
            await loginBtn.click({ force: true, timeout: 5000 });
            await page.waitForTimeout(2000); // 等待登录弹窗出现
            this.logger.log(`Clicked login button for ${platformType}`);
          }
        } catch (e) {
          this.logger.warn(`Failed to click login button: ${e}`);
        }
      }

      // 截取二维码区域（如果有配置选择器）
      let screenshotBuffer: Buffer;
      if (config.qrCodeSelector) {
        try {
          // 等待二维码元素出现
          await page.waitForSelector(config.qrCodeSelector, { timeout: 10000 });
          const qrElement = await page.$(config.qrCodeSelector);
          if (qrElement) {
            screenshotBuffer = await qrElement.screenshot({ type: "png" });
            this.logger.log(
              `QR code element screenshot taken for ${platformType}`,
            );
          } else {
            // 降级到全页截图
            screenshotBuffer = await page.screenshot({ type: "png" });
            this.logger.warn(
              `QR code element not found, using full page screenshot`,
            );
          }
        } catch {
          // 降级到全页截图
          screenshotBuffer = await page.screenshot({ type: "png" });
          this.logger.warn(
            `Failed to screenshot QR code element, using full page`,
          );
        }
      } else {
        screenshotBuffer = await page.screenshot({ type: "png" });
      }
      const screenshotBase64 = `data:image/png;base64,${screenshotBuffer.toString("base64")}`;

      // 保存待验证的登录会话
      this.pendingLogins.set(sessionKey, {
        contextId: sessionKey,
        platformType,
        userId,
        createdAt: new Date(),
        page,
      });

      this.logger.log(`Login session started: ${sessionKey}`);

      return {
        sessionKey,
        screenshot: screenshotBase64,
      };
    } catch (error) {
      this.logger.error(`Failed to start login session: ${error}`);
      await this.closeContext(sessionKey);
      throw error;
    }
  }

  /**
   * 检查登录状态
   */
  async checkLoginStatus(sessionKey: string): Promise<{
    loggedIn: boolean;
    accountName?: string;
    screenshot?: string;
    sessionData?: SessionData;
  }> {
    const session = this.pendingLogins.get(sessionKey);
    if (!session) {
      throw new Error(`Login session not found: ${sessionKey}`);
    }

    const config = PLATFORM_CONFIGS[session.platformType];
    if (!config) {
      throw new Error(`Unknown platform: ${session.platformType}`);
    }

    try {
      const { page } = session;

      // 检查是否有登录成功的指示器
      const loggedIn = await page
        .$(config.loginSuccessIndicator)
        .then((el: unknown) => !!el)
        .catch(() => false);

      if (loggedIn) {
        // 尝试获取账号名称
        let accountName = "";
        try {
          accountName = await page.$eval(
            config.loginSuccessIndicator,
            (el: Element) => el.textContent?.trim() || "",
          );
        } catch {
          // 忽略获取账号名称的错误
        }

        // 保存会话数据
        const sessionData = await this.saveSession(sessionKey);

        this.logger.log(`Login successful for session: ${sessionKey}`);

        return {
          loggedIn: true,
          accountName,
          sessionData: sessionData || undefined,
        };
      }

      // 未登录，返回新截图（优先截取二维码区域）
      let screenshotBuffer: Buffer;
      if (config.qrCodeSelector) {
        try {
          const qrElement = await page.$(config.qrCodeSelector);
          if (qrElement) {
            screenshotBuffer = await qrElement.screenshot({
              type: "png",
              timeout: 10000,
            });
          } else {
            screenshotBuffer = await page.screenshot({
              type: "png",
              timeout: 10000,
            });
          }
        } catch {
          screenshotBuffer = await page.screenshot({
            type: "png",
            timeout: 10000,
          });
        }
      } else {
        screenshotBuffer = await page.screenshot({
          type: "png",
          timeout: 10000,
        });
      }
      const screenshot = `data:image/png;base64,${screenshotBuffer.toString("base64")}`;

      return {
        loggedIn: false,
        screenshot,
      };
    } catch (error) {
      this.logger.error(`Failed to check login status: ${error}`);
      throw error;
    }
  }

  /**
   * 获取登录页面截图（优先截取二维码区域）
   */
  async getLoginScreenshot(sessionKey: string): Promise<string> {
    const session = this.pendingLogins.get(sessionKey);
    if (!session) {
      throw new Error(`Login session not found: ${sessionKey}`);
    }

    const config = PLATFORM_CONFIGS[session.platformType];
    const { page } = session;

    let screenshotBuffer: Buffer;
    if (config?.qrCodeSelector) {
      try {
        const qrElement = await page.$(config.qrCodeSelector);
        if (qrElement) {
          screenshotBuffer = await qrElement.screenshot({
            type: "png",
            timeout: 10000,
          });
        } else {
          screenshotBuffer = await page.screenshot({
            type: "png",
            timeout: 10000,
          });
        }
      } catch {
        screenshotBuffer = await page.screenshot({
          type: "png",
          timeout: 10000,
        });
      }
    } else {
      screenshotBuffer = await page.screenshot({ type: "png", timeout: 10000 });
    }
    return `data:image/png;base64,${screenshotBuffer.toString("base64")}`;
  }

  /**
   * 结束登录会话
   */
  async endLoginSession(sessionKey: string): Promise<void> {
    const session = this.pendingLogins.get(sessionKey);
    if (session) {
      this.pendingLogins.delete(sessionKey);
      await this.closeContext(sessionKey);
      this.logger.log(`Login session ended: ${sessionKey}`);
    }
  }

  /**
   * 清理过期的登录会话（超过10分钟）
   */
  async cleanupExpiredSessions(): Promise<void> {
    const now = new Date();
    const expireMs = 10 * 60 * 1000; // 10 minutes

    for (const [key, session] of this.pendingLogins) {
      if (now.getTime() - session.createdAt.getTime() > expireMs) {
        this.logger.log(`Cleaning up expired session: ${key}`);
        await this.endLoginSession(key);
      }
    }
  }
}
