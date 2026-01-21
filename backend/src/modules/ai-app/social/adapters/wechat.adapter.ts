import { Injectable, Logger } from "@nestjs/common";
import { PlaywrightService } from "../services/playwright.service";
import { PublishResult } from "../services/publish-executor.service";
import { SocialContent, SocialPlatformConnection } from "../types";

@Injectable()
export class WechatAdapter {
  private readonly logger = new Logger(WechatAdapter.name);
  private readonly MP_URL = "https://mp.weixin.qq.com";

  constructor(private readonly playwright: PlaywrightService) {}

  /**
   * 发布内容到微信公众号
   */
  async publish(
    content: SocialContent,
    connection: SocialPlatformConnection,
  ): Promise<PublishResult> {
    this.logger.log(`Publishing to WeChat MP: ${content.title}`);

    const contextId = `wechat-${connection.id}`;

    try {
      // 恢复登录会话
      if (connection.sessionData) {
        await this.playwright.restoreSession(
          contextId,
          connection.sessionData as any,
        );
      }

      const page = await this.playwright.createPage(contextId);

      // 1. 访问公众号后台
      await page.goto(`${this.MP_URL}/cgi-bin/home`);

      // 2. 检查登录状态
      const isLoggedIn = await this.checkLoginStatus(page);
      if (!isLoggedIn) {
        return {
          success: false,
          errorMessage: "微信公众号登录已过期，请重新连接",
        };
      }

      // 3. 进入图文编辑页面
      await page.goto(`${this.MP_URL}/cgi-bin/appmsg?t=media/appmsg_edit`);
      await page.waitForLoadState("networkidle");

      // 4. 填写内容
      await this.fillContent(page, content);

      // 5. 保存为草稿（安全起见，先保存草稿，不直接发布）
      const draftUrl = await this.saveDraft(page);

      this.logger.log(`WeChat article saved as draft: ${draftUrl}`);

      return {
        success: true,
        externalUrl: draftUrl,
      };
    } catch (error) {
      const err = error as Error;
      this.logger.error(`WeChat publish failed: ${err.message}`, err.stack);
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
    const contextId = `wechat-login-${connectionId}`;

    try {
      const page = await this.playwright.createPage(contextId);
      await page.goto(`${this.MP_URL}/`);

      // 等待二维码出现
      const qrCodeElement = await page.waitForSelector(
        ".login__type__qrcode img",
        {
          timeout: 10000,
        },
      );

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
    const contextId = `wechat-login-${connectionId}`;
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
      // 保存会话数据
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
      if (url.includes("/cgi-bin/bizlogin") || url.includes("action=login")) {
        this.logger.debug("Login check: URL indicates not logged in");
        return false;
      }

      // 方法2: 检查是否在后台首页
      if (url.includes("/cgi-bin/home") || url.includes("/cgi-bin/frame")) {
        this.logger.debug("Login check: URL indicates logged in");
        return true;
      }

      // 方法3: 检查多个可能的登录后元素
      const selectors = [
        ".weui-desktop-account__nickname",
        ".weui-desktop-account__info",
        ".menu_item.selected", // 左侧菜单选中项
        "#menuBar", // 菜单栏
        ".main_bd", // 主内容区
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

      // 方法4: 检查是否有登录表单（表示未登录）
      const loginForm = await page.$(".login__type__qrcode");
      if (loginForm) {
        this.logger.debug("Login check: Found login form, not logged in");
        return false;
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

  private async fillContent(page: any, content: SocialContent): Promise<void> {
    // 填写标题
    if (content.title) {
      const titleInput = await page.waitForSelector("#title");
      await titleInput.fill(content.title);
    }

    // 填写正文
    if (content.content) {
      // 微信编辑器是富文本，需要特殊处理
      const editor = await page.waitForSelector("#edui1_contentplaceholder");
      await editor.click();
      await page.keyboard.type(content.content);
    }

    // 填写摘要
    if (content.digest) {
      const digestInput = await page.$("#digest");
      if (digestInput) {
        await digestInput.fill(content.digest);
      }
    }
  }

  private async saveDraft(page: any): Promise<string> {
    // 点击保存草稿按钮
    const saveButton = await page.waitForSelector(".js_save");
    await saveButton.click();

    // 等待保存完成
    await page.waitForResponse(
      (response: any) =>
        response.url().includes("operate_appmsg") && response.status() === 200,
    );

    // 返回当前页面URL作为草稿链接
    return page.url();
  }
}
