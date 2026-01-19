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
      // 检查是否有登录后的元素
      const loggedInIndicator = await page.$(".weui-desktop-account__nickname");
      return loggedInIndicator !== null;
    } catch {
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
