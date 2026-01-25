import { Injectable, Logger } from "@nestjs/common";
import { PlaywrightService } from "../services/playwright.service";
import { PublishResult } from "../services/publish-executor.service";
import { SocialContent, SocialPlatformConnection } from "../types";
import { decryptSession } from "../utils/session-crypto";
import { SessionData } from "../types/platform.types";

@Injectable()
export class XiaohongshuAdapter {
  private readonly logger = new Logger(XiaohongshuAdapter.name);
  private readonly CREATOR_URL = "https://creator.xiaohongshu.com";

  constructor(private readonly playwright: PlaywrightService) {}

  /**
   * 发布内容到小红书
   */
  async publish(
    content: SocialContent,
    connection: SocialPlatformConnection,
  ): Promise<PublishResult> {
    this.logger.log(`Publishing to Xiaohongshu: ${content.title}`);

    const contextId = `xhs-${connection.id}`;

    try {
      // 恢复登录会话 - 解密 sessionData
      if (connection.sessionData) {
        const sessionDataStr =
          typeof connection.sessionData === "string"
            ? connection.sessionData
            : JSON.stringify(connection.sessionData);
        const sessionData = decryptSession<SessionData>(sessionDataStr);
        await this.playwright.restoreSession(contextId, sessionData);
      }

      const page = await this.playwright.createPage(contextId);

      // 1. 访问创作者中心
      await page.goto(`${this.CREATOR_URL}/publish/publish`);
      await page.waitForLoadState("networkidle");

      // 2. 检查登录状态
      const isLoggedIn = await this.checkLoginStatus(page);
      if (!isLoggedIn) {
        return {
          success: false,
          errorMessage: "小红书登录已过期，请重新连接",
        };
      }

      // 3. 选择发布类型（图文笔记）
      await this.selectPostType(page, "image-text");

      // 4. 上传图片
      if (content.images && content.images.length > 0) {
        await this.uploadImages(page, content.images);
      }

      // 5. 填充内容（使用平台适配版本，无需截断）
      await this.fillContent(page, content);

      // 6. 发布（或保存草稿）
      const result = await this.submitPost(page, false); // false = 保存草稿

      this.logger.log(`Xiaohongshu post saved: ${result}`);

      return {
        success: true,
        externalUrl: result,
      };
    } catch (error) {
      const err = error as Error;
      this.logger.error(
        `Xiaohongshu publish failed: ${err.message}`,
        err.stack,
      );
      return {
        success: false,
        errorMessage: `发布失败: ${err.message}`,
      };
    } finally {
      await this.playwright.closeContext(contextId);
    }
  }

  /**
   * 获取登录二维码
   */
  async getLoginQrCode(connectionId: string): Promise<string | null> {
    const contextId = `xhs-login-${connectionId}`;

    try {
      const page = await this.playwright.createPage(contextId);
      await page.goto(`${this.CREATOR_URL}/login`);

      // 等待二维码出现
      const qrCodeElement = await page.waitForSelector(".qrcode-img", {
        timeout: 10000,
      });

      if (qrCodeElement) {
        const qrCodeSrc = await qrCodeElement.getAttribute("src");
        return qrCodeSrc;
      }

      return null;
    } catch (error) {
      const err = error as Error;
      this.logger.error(`Failed to get QR code: ${err.message}`);
      return null;
    }
  }

  /**
   * 检查登录状态并保存会话
   */
  async checkAndSaveLogin(connectionId: string): Promise<boolean> {
    const contextId = `xhs-login-${connectionId}`;
    const context = await this.playwright.getContext(contextId);

    if (!context) {
      return false;
    }

    const pages = context.pages();
    if (pages.length === 0) {
      return false;
    }

    const page = pages[0];
    const isLoggedIn = await this.checkLoginStatus(page);

    if (isLoggedIn) {
      const sessionData = await this.playwright.saveSession(contextId);
      return sessionData !== null;
    }

    return false;
  }

  private async checkLoginStatus(page: any): Promise<boolean> {
    try {
      // 等待页面稳定
      await page
        .waitForLoadState("networkidle", { timeout: 10000 })
        .catch(() => {});

      // 方法1: 检查 URL - 如果重定向到登录页面则未登录
      const url = page.url();
      if (url.includes("/login") || url.includes("login.xiaohongshu.com")) {
        this.logger.debug("Login check: URL indicates not logged in");
        return false;
      }

      // 方法2: 检查是否在创作者中心
      if (url.includes("creator.xiaohongshu.com/publish")) {
        // 可能已登录，继续检查页面元素
        this.logger.debug(
          "Login check: URL is creator center, checking elements",
        );
      }

      // 方法3: 检查多个可能的登录后元素
      const selectors = [
        ".user-avatar",
        ".creator-avatar", // 创作者头像
        ".publish-container", // 发布容器
        ".upload-wrapper", // 上传区域
        ".draftItem", // 草稿项
        "[class*='userInfo']", // 用户信息区
      ];

      for (const selector of selectors) {
        try {
          const element = await page.$(selector);
          if (element) {
            this.logger.debug(
              `Login check: Found logged-in indicator: ${selector}`,
            );
            return true;
          }
        } catch {
          // Continue to next selector
        }
      }

      // 方法4: 检查是否有登录按钮/表单
      const loginIndicators = [
        ".login-btn",
        ".login-button",
        "[class*='LoginButton']",
        "text=登录",
      ];

      for (const selector of loginIndicators) {
        try {
          const element = await page.$(selector);
          if (element) {
            this.logger.debug(
              `Login check: Found login indicator: ${selector}, not logged in`,
            );
            return false;
          }
        } catch {
          // Continue
        }
      }

      this.logger.warn(
        "Login check: Could not determine login status, assuming not logged in",
      );
      return false;
    } catch (error) {
      this.logger.error(`Login check failed: ${(error as Error).message}`);
      return false;
    }
  }

  private async selectPostType(
    page: any,
    type: "image-text" | "video",
  ): Promise<void> {
    // 小红书创作中心默认是图文发布页面
    if (type === "video") {
      const videoTab = await page.$('[data-type="video"]');
      if (videoTab) {
        await videoTab.click();
      }
    }
  }

  private async uploadImages(page: any, imageUrls: string[]): Promise<void> {
    // TODO: 实现图片上传
    // 小红书需要本地文件上传，需要先下载远程图片
    this.logger.log(`Would upload ${imageUrls.length} images`);

    // 找到上传按钮
    const uploadInput = await page.$('input[type="file"]');
    if (uploadInput && imageUrls.length > 0) {
      // 实际实现需要先下载图片到本地临时目录
      // await uploadInput.setInputFiles(localImagePaths);
    }
  }

  private async fillContent(page: any, content: SocialContent): Promise<void> {
    // 填写标题
    if (content.title) {
      const titleInput = await page.waitForSelector(
        'input[placeholder*="标题"]',
      );
      await titleInput.fill(content.title);
    }

    // 填写正文
    if (content.content) {
      const contentEditor = await page.waitForSelector(
        '[contenteditable="true"]',
      );
      await contentEditor.click();
      await page.keyboard.type(content.content);
    }

    // 添加话题标签
    if (content.tags && content.tags.length > 0) {
      for (const tag of content.tags) {
        // 输入 # 触发话题选择
        await page.keyboard.type(tag.startsWith("#") ? tag : `#${tag}`);
        await page.keyboard.press("Space");
      }
    }

    // 添加位置
    if (content.location) {
      const locationBtn = await page.$('[class*="location"]');
      if (locationBtn) {
        await locationBtn.click();
        // TODO: 选择位置
      }
    }
  }

  private async submitPost(
    page: any,
    publishImmediately: boolean,
  ): Promise<string> {
    if (publishImmediately) {
      // 点击发布按钮
      const publishButton = await page.waitForSelector(
        'button:has-text("发布")',
      );
      await publishButton.click();
    } else {
      // 点击存草稿按钮
      const draftButton = await page.$('button:has-text("存草稿")');
      if (draftButton) {
        await draftButton.click();
      }
    }

    // 等待操作完成
    await page.waitForTimeout(2000);

    // 返回当前URL
    return page.url();
  }
}
