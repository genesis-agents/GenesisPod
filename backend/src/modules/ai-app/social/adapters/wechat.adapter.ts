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
    let page: any = null;

    try {
      // 恢复登录会话
      if (connection.sessionData) {
        await this.playwright.restoreSession(
          contextId,
          connection.sessionData as any,
        );
      }

      page = await this.playwright.createPage(contextId);

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
      this.logger.log("Navigating to article edit page...");
      await page.goto(`${this.MP_URL}/cgi-bin/appmsg?t=media/appmsg_edit`);
      await page.waitForLoadState("networkidle");

      // 记录当前页面 URL 和状态用于调试
      const editPageUrl = page.url();
      this.logger.log(`Edit page URL: ${editPageUrl}`);

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

      // 捕获截图用于调试
      if (page) {
        try {
          const screenshot = await page.screenshot({ fullPage: true });
          this.logger.error(
            `Debug screenshot captured (base64 length: ${screenshot.toString("base64").length})`,
          );
          // 记录当前页面 URL
          this.logger.error(`Current page URL: ${page.url()}`);
          // 记录页面 HTML 片段用于调试
          const bodyHtml = await page.evaluate(
            () => document.body?.innerHTML?.substring(0, 2000) || "empty",
          );
          this.logger.error(
            `Page body preview: ${bodyHtml.substring(0, 500)}...`,
          );
        } catch (screenshotError) {
          this.logger.error(
            `Failed to capture debug screenshot: ${(screenshotError as Error).message}`,
          );
        }
      }

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

      // 方法5: 检查是否有登录超时提示（session 过期）
      const pageText = await page.evaluate(
        () => document.body?.innerText || "",
      );
      if (
        pageText.includes("Login timeout") ||
        pageText.includes("登录超时") ||
        pageText.includes("Please Log in") ||
        pageText.includes("请重新登录")
      ) {
        this.logger.debug("Login check: Found login timeout message");
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
    this.logger.log("Starting to fill content...");

    // 等待页面完全加载（包括动态内容）
    await page.waitForLoadState("networkidle");
    this.logger.log(
      "Network idle reached, waiting for editor to initialize...",
    );

    // 微信编辑器是动态加载的，需要等待编辑器容器出现
    const editorContainerSelectors = [
      ".appmsg_edit_area",
      ".js_editor_area",
      "#js_article_content",
      ".editor-container",
      ".weui-desktop-editor",
    ];

    let editorContainerFound = false;
    for (const selector of editorContainerSelectors) {
      try {
        await page.waitForSelector(selector, { timeout: 5000 });
        this.logger.log(`Editor container found with selector: ${selector}`);
        editorContainerFound = true;
        break;
      } catch {
        continue;
      }
    }

    if (!editorContainerFound) {
      this.logger.warn(
        "Could not find editor container, waiting additional 3 seconds...",
      );
      await page.waitForTimeout(3000);
    }

    // 额外等待确保 UI 完全渲染
    await page.waitForTimeout(2000);

    // 填写标题 - 尝试多个可能的选择器（微信后台界面经常更新）
    if (content.title) {
      const titleSelectors = [
        // 新版微信公众号编辑器选择器
        "#js_article_title",
        ".js_title",
        ".title_inner input",
        ".weui-desktop-form-input__input",
        '[data-type="title"]',
        ".editor-title input",
        ".article-title-input",
        ".appmsg_edit_title input",
        ".js_title_input",
        // 旧版选择器保留兼容
        "#title",
        'input[name="title"]',
        ".title-input",
        '[placeholder*="标题"]',
        '[placeholder*="请在这里输入标题"]',
        ".weui-desktop-form__input",
        'input[type="text"]:first-of-type',
        // 通用后备选择器
        ".title input",
        "input.title",
        '[class*="title"] input',
        '[id*="title"]',
      ];

      let titleInput = null;
      for (const selector of titleSelectors) {
        try {
          titleInput = await page.$(selector);
          if (titleInput) {
            this.logger.log(`Found title input with selector: ${selector}`);
            break;
          }
        } catch {
          continue;
        }
      }

      if (titleInput) {
        await titleInput.fill(content.title);
        this.logger.log("Title filled successfully");
      } else {
        this.logger.warn("Could not find title input element");
        // 记录页面上所有 input 元素用于调试
        const inputs = await page.$$eval("input", (els: Element[]) =>
          els.map((el) => ({
            id: el.id,
            name: el.getAttribute("name"),
            class: el.className,
            placeholder: el.getAttribute("placeholder"),
            type: el.getAttribute("type"),
          })),
        );
        this.logger.warn(
          `Available inputs: ${JSON.stringify(inputs, null, 2)}`,
        );

        // 如果没有 input 元素，检查是否是登录问题
        if (inputs.length === 0) {
          const pageTitle = await page.title();
          const hasLoginForm = await page.$(".login__type__qrcode");
          const hasErrorMsg = await page.$(".weui-desktop-msg__title");
          const pageText = await page.evaluate(
            () => document.body?.innerText || "",
          );

          this.logger.error(`Page diagnosis - no inputs found:`);
          this.logger.error(`- Page title: ${pageTitle}`);
          this.logger.error(`- Has login form: ${!!hasLoginForm}`);
          this.logger.error(`- Has error message: ${!!hasErrorMsg}`);

          // 检查登录表单或登录超时提示
          const isLoginTimeout =
            pageText.includes("Login timeout") ||
            pageText.includes("登录超时") ||
            pageText.includes("Please Log in") ||
            pageText.includes("请重新登录");

          if (hasLoginForm || isLoginTimeout) {
            throw new Error(
              "微信公众号登录已过期，请在 AI Social 连接管理中重新连接",
            );
          }
        }

        // 记录页面上所有 contenteditable 元素
        const editables = await page.$$eval(
          "[contenteditable]",
          (els: Element[]) =>
            els.map((el) => ({
              tag: el.tagName,
              id: el.id,
              class: el.className?.substring?.(0, 100) || "",
            })),
        );
        this.logger.warn(
          `Available contenteditable elements: ${JSON.stringify(editables, null, 2)}`,
        );

        // 记录当前页面 URL
        const currentUrl = page.url();
        this.logger.error(
          `Current page URL when error occurred: ${currentUrl}`,
        );

        throw new Error(
          `找不到标题输入框，微信后台界面可能已更新。当前页面: ${currentUrl}`,
        );
      }
    }

    // 填写正文 - 尝试多个可能的选择器（微信后台界面经常更新）
    if (content.content) {
      const editorSelectors = [
        // 新版微信公众号编辑器选择器
        "#js_editor",
        ".js_editor",
        ".editor-content",
        ".ProseMirror",
        ".rich_media_content",
        ".appmsg_edit_area [contenteditable='true']",
        ".js_content",
        ".weui-desktop-editor__textarea",
        // 旧版选择器保留兼容
        "#edui1_contentplaceholder",
        ".edui-editor-body",
        ".ql-editor",
        '[contenteditable="true"]',
        ".rich-text-editor",
        ".weui-desktop-editor__content",
        // 通用后备选择器
        "[data-editor]",
        ".editor [contenteditable]",
        '[class*="editor"] [contenteditable]',
      ];

      let editor = null;
      for (const selector of editorSelectors) {
        try {
          editor = await page.$(selector);
          if (editor) {
            this.logger.log(`Found editor with selector: ${selector}`);
            break;
          }
        } catch {
          continue;
        }
      }

      if (editor) {
        await editor.click();
        // 使用 Ctrl+A 清空，然后输入内容
        await page.keyboard.press("Control+a");
        await page.keyboard.type(content.content, { delay: 10 });
        this.logger.log("Content filled successfully");
      } else {
        this.logger.warn(
          "Could not find editor element, trying alternative approach",
        );
        // 尝试通过 iframe 找到编辑器
        const frames = page.frames();
        for (const frame of frames) {
          const frameEditor = await frame.$('[contenteditable="true"]');
          if (frameEditor) {
            await frameEditor.click();
            await frame.keyboard.type(content.content);
            this.logger.log("Content filled via iframe");
            break;
          }
        }
      }
    }

    // 填写摘要
    if (content.digest) {
      const digestSelectors = [
        "#digest",
        'textarea[name="digest"]',
        ".digest-input",
      ];
      for (const selector of digestSelectors) {
        const digestInput = await page.$(selector);
        if (digestInput) {
          await digestInput.fill(content.digest);
          this.logger.log("Digest filled successfully");
          break;
        }
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
