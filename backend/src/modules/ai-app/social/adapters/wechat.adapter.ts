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
    this.logger.log(
      `Connection ID: ${connection.id}, Platform: ${connection.platformType}`,
    );

    const contextId = `wechat-${connection.id}`;
    let page: any = null;

    try {
      // Step 1: 检查 session 数据是否存在
      if (!connection.sessionData) {
        this.logger.error("No session data found for connection");
        return {
          success: false,
          errorMessage:
            "微信公众号未连接或登录已过期，请在连接管理中重新扫码登录",
        };
      }

      // Parse sessionData - it's stored as JSON string in database
      const sessionData =
        typeof connection.sessionData === "string"
          ? JSON.parse(connection.sessionData)
          : connection.sessionData;
      const cookiesCount = sessionData?.cookies?.length || 0;
      this.logger.log(`Session data found, cookies count: ${cookiesCount}`);

      // 检查 cookies 数量，如果为 0 则无法恢复有效会话
      if (cookiesCount === 0) {
        this.logger.error(
          "Session has no cookies - cannot restore valid login session",
        );
        return {
          success: false,
          errorMessage:
            "微信公众号会话数据无效（无Cookie），请断开连接后重新扫码登录",
        };
      }

      // Step 2: 恢复登录会话
      this.logger.log("Restoring session...");
      await this.playwright.restoreSession(contextId, sessionData);
      this.logger.log("Session restored successfully");

      // Step 3: 创建页面
      this.logger.log("Creating page...");
      page = await this.playwright.createPage(contextId);
      this.logger.log("Page created successfully");

      // Step 4: 访问公众号后台
      this.logger.log("Navigating to WeChat MP home...");
      await page.goto(`${this.MP_URL}/cgi-bin/home`, {
        waitUntil: "networkidle",
        timeout: 30000,
      });
      this.logger.log(`Navigation complete, current URL: ${page.url()}`);

      // Step 5: 检查登录状态
      this.logger.log("Checking login status...");
      const isLoggedIn = await this.checkLoginStatus(page);
      if (!isLoggedIn) {
        // 捕获截图用于调试
        await this.captureDebugInfo(page, "login_check_failed");
        return {
          success: false,
          errorMessage:
            "微信公众号登录已过期，请在 AI Social 连接管理中重新扫码登录",
        };
      }
      this.logger.log("Login status verified: logged in");

      // Step 6: 在首页找到并点击"图文"按钮进入编辑器
      // 微信公众号首页有"新的创作"区域，包含图标：文章、选择已有内容、图文、视频等
      this.logger.log("Looking for '图文' button on home page...");

      // 等待首页加载完成
      await page.waitForTimeout(3000);

      // 诊断首页内容
      const homeDiagnosis = await page.evaluate(() => {
        const pageText = document.body?.innerText?.substring(0, 500) || "";
        const links = Array.from(document.querySelectorAll("a"))
          .slice(0, 20)
          .map((a) => ({
            text: a.textContent?.trim().substring(0, 30),
            href: a.href?.substring(0, 100),
          }));
        return { pageText, links };
      });
      this.logger.log(
        `Home page diagnosis: ${JSON.stringify(homeDiagnosis).substring(0, 500)}`,
      );

      // 查找"图文"按钮 - 它在"新的创作"区域，通常是一个带图标的链接
      const tuWenButton = await page.evaluate(() => {
        // 策略1: 查找所有链接，找到精确匹配"图文"的
        const links = Array.from(document.querySelectorAll("a"));
        for (const link of links) {
          const text = link.textContent?.trim() || "";
          // 精确匹配 "图文"（两个字）
          if (text === "图文") {
            return {
              found: true,
              text,
              href: link.href || "",
              tagName: "A",
              strategy: "exact_match",
            };
          }
        }

        // 策略2: 查找包含"图文"但不包含干扰词的链接
        for (const link of links) {
          const text = link.textContent?.trim() || "";
          if (
            text.includes("图文") &&
            !text.includes("选择") &&
            !text.includes("已有") &&
            text.length < 10
          ) {
            return {
              found: true,
              text,
              href: link.href || "",
              tagName: "A",
              strategy: "contains_match",
            };
          }
        }

        // 策略3: 查找带有appmsg_edit链接的元素
        for (const link of links) {
          if (
            link.href?.includes("appmsg_edit") &&
            link.href?.includes("type=77")
          ) {
            return {
              found: true,
              text: link.textContent?.trim() || "",
              href: link.href,
              tagName: "A",
              strategy: "url_match",
            };
          }
        }

        return { found: false, strategy: "none" };
      });

      this.logger.log(
        `图文 button search result: ${JSON.stringify(tuWenButton)}`,
      );

      // 从当前 URL 提取 token
      const currentUrl = page.url();
      const tokenMatch = currentUrl.match(/token=(\d+)/);
      const token = tokenMatch ? tokenMatch[1] : "";
      this.logger.log(`Extracted token from URL: ${token}`);

      if (tuWenButton.found && tuWenButton.href) {
        this.logger.log(
          `Found 图文 link via ${tuWenButton.strategy}, navigating to: ${tuWenButton.href}`,
        );
        await page.goto(tuWenButton.href, {
          waitUntil: "networkidle",
          timeout: 30000,
        });
      } else {
        // 如果找不到图文按钮，使用正确的 v2 编辑器 URL（基于截图分析）
        // URL 格式: /cgi-bin/appmsg?t=media/appmsg_edit_v2&action=edit&isNew=1&type=77&createType=8&token=xxx
        const editorUrl = token
          ? `${this.MP_URL}/cgi-bin/appmsg?t=media/appmsg_edit_v2&action=edit&isNew=1&type=77&createType=8&token=${token}`
          : `${this.MP_URL}/cgi-bin/appmsg?t=media/appmsg_edit_v2&action=edit&isNew=1&type=77&createType=8`;
        this.logger.log(
          `图文 button not found, trying direct URL: ${editorUrl}`,
        );
        await page.goto(editorUrl, {
          waitUntil: "networkidle",
          timeout: 30000,
        });
      }

      const editPageUrl = page.url();
      this.logger.log(`Current URL after navigation: ${editPageUrl}`);

      // Step 7: 检查是否成功进入编辑页面
      if (
        editPageUrl.includes("bizlogin") ||
        editPageUrl.includes("action=login")
      ) {
        await this.captureDebugInfo(page, "redirected_to_login");
        return {
          success: false,
          errorMessage: "访问编辑页面时被重定向到登录页，请重新连接微信公众号",
        };
      }

      // Step 8: 填写内容
      this.logger.log("Filling content...");
      await this.fillContent(page, content);
      this.logger.log("Content filled successfully");

      // Step 9: 保存为草稿
      this.logger.log("Saving as draft...");
      const draftUrl = await this.saveDraft(page);
      this.logger.log(`WeChat article saved as draft: ${draftUrl}`);

      return {
        success: true,
        externalUrl: draftUrl,
      };
    } catch (error) {
      const err = error as Error;
      this.logger.error(`WeChat publish failed: ${err.message}`, err.stack);

      // 捕获调试信息
      if (page) {
        await this.captureDebugInfo(page, "publish_error");
      }

      // 返回更详细的错误信息
      let errorMessage = `发布失败: ${err.message}`;
      if (err.message.includes("timeout") || err.message.includes("Timeout")) {
        errorMessage = "发布超时，微信公众号后台响应过慢，请稍后重试";
      } else if (
        err.message.includes("navigation") ||
        err.message.includes("Navigation")
      ) {
        errorMessage = "页面导航失败，微信公众号后台可能不可用，请稍后重试";
      } else if (
        err.message.includes("登录") ||
        err.message.includes("login")
      ) {
        errorMessage = "微信公众号登录状态异常，请重新连接";
      }

      return {
        success: false,
        errorMessage,
      };
    } finally {
      await this.playwright.closeContext(contextId);
    }
  }

  /**
   * 捕获调试信息用于问题排查
   */
  private async captureDebugInfo(page: any, context: string): Promise<void> {
    try {
      this.logger.error(`[${context}] Capturing debug info...`);
      this.logger.error(`[${context}] Current URL: ${page.url()}`);

      // 截图
      const screenshot = await page
        .screenshot({ fullPage: true })
        .catch(() => null);
      if (screenshot) {
        this.logger.error(
          `[${context}] Screenshot captured (base64 length: ${screenshot.toString("base64").length})`,
        );
      }

      // 页面标题
      const title = await page.title().catch(() => "unknown");
      this.logger.error(`[${context}] Page title: ${title}`);

      // 页面 HTML 片段
      const bodyHtml = await page
        .evaluate(() => document.body?.innerHTML?.substring(0, 1000) || "empty")
        .catch(() => "failed to get HTML");
      this.logger.error(
        `[${context}] Page body preview: ${bodyHtml.substring(0, 500)}...`,
      );

      // 检查是否有登录相关的元素
      const hasLoginForm = await page
        .$(".login__type__qrcode")
        .catch(() => null);
      const hasLoginBtn = await page.$('[class*="login"]').catch(() => null);
      this.logger.error(
        `[${context}] Has login form: ${!!hasLoginForm}, Has login button: ${!!hasLoginBtn}`,
      );
    } catch (debugError) {
      this.logger.error(
        `[${context}] Failed to capture debug info: ${(debugError as Error).message}`,
      );
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

    // 详细诊断当前页面状态
    const pageState = await page.evaluate(() => {
      return {
        url: window.location.href,
        title: document.title,
        bodyText: document.body?.innerText?.substring(0, 300) || "",
      };
    });
    this.logger.log(
      `Page state: URL=${pageState.url}, Title=${pageState.title}`,
    );
    this.logger.log(
      `Page body preview: ${pageState.bodyText.substring(0, 200)}`,
    );

    // 微信编辑器 v2 的容器选择器
    const editorContainerSelectors = [
      // v2 编辑器容器
      ".weui-desktop-editor-form",
      ".weui-desktop-form__bd",
      ".appmsg_edit_area",
      ".js_editor_area",
      "#js_article_content",
      ".editor-container",
      ".weui-desktop-editor",
      // 检查是否有任何表单元素
      "form",
      "[class*='editor']",
    ];

    let editorContainerFound = false;
    for (const selector of editorContainerSelectors) {
      try {
        const element = await page.$(selector);
        if (element) {
          this.logger.log(`Editor container found with selector: ${selector}`);
          editorContainerFound = true;
          break;
        }
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

    // 详细诊断页面上的所有输入元素
    const allInputs = await page.evaluate(() => {
      const inputs = Array.from(
        document.querySelectorAll("input, textarea, [contenteditable='true']"),
      );
      return inputs.map((el, idx) => ({
        index: idx,
        tag: el.tagName,
        type: (el as HTMLInputElement).type || "",
        placeholder: el.getAttribute("placeholder") || "",
        className: el.className?.substring(0, 100) || "",
        id: el.id || "",
        name: el.getAttribute("name") || "",
        visible: (el as HTMLElement).offsetParent !== null,
      }));
    });
    this.logger.log(`All input elements on page: ${JSON.stringify(allInputs)}`);

    // 填写标题 - 新版编辑器 (appmsg_edit_v2)
    if (content.title) {
      this.logger.log("Looking for title input in new editor...");

      const titleSelectors = [
        // 新版 v2 编辑器选择器 - 基于截图分析
        // 截图显示标题输入框有 placeholder "请在这里输入标题（选填）"
        '[placeholder*="请在这里输入标题"]',
        '[placeholder*="输入标题"]',
        '[placeholder*="标题"]',
        'input[placeholder*="选填"]',
        // weui 组件选择器
        ".weui-desktop-form-input__input",
        ".weui-desktop-form__input",
        "input.weui-desktop-form__input-text",
        // 通用选择器
        ".title-input",
        "#js_article_title",
        ".js_title",
        // 第一个可见的 text input 通常是标题
        'input[type="text"]:not([hidden])',
        // contenteditable 元素（标题可能是 contenteditable）
        '.weui-desktop-form__bd [contenteditable="true"]',
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

      // 如果还找不到，尝试通过 placeholder 文本查找
      if (!titleInput) {
        this.logger.log("Trying to find title input by placeholder text...");
        titleInput = await page.evaluate(() => {
          const el = document.querySelector(
            '[placeholder*="标题"]',
          ) as HTMLInputElement;
          return el ? true : false;
        });
        if (titleInput) {
          titleInput = await page.$('[placeholder*="标题"]');
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
          const currentUrl = page.url();

          this.logger.error(`Page diagnosis - no inputs found:`);
          this.logger.error(`- Page title: ${pageTitle}`);
          this.logger.error(`- Current URL: ${currentUrl}`);
          this.logger.error(`- Has login form: ${!!hasLoginForm}`);
          this.logger.error(`- Has error message: ${!!hasErrorMsg}`);

          // 只有当页面被重定向到登录页或有明确的登录表单时才认为登录过期
          // 不再使用 pageText.includes 检测，因为正常页面也可能包含这些词
          const isOnLoginPage =
            currentUrl.includes("bizlogin") ||
            currentUrl.includes("action=login") ||
            currentUrl.includes("auth") ||
            hasLoginForm;

          if (isOnLoginPage) {
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
    this.logger.log("Looking for save button...");

    // 先诊断页面上的按钮
    const allButtons = await page.evaluate(() => {
      const buttons = Array.from(
        document.querySelectorAll("button, a[class*='btn'], [class*='button']"),
      );
      return buttons.slice(0, 15).map((btn) => ({
        text: btn.textContent?.trim().substring(0, 30),
        className: (btn as HTMLElement).className?.substring(0, 60),
        tagName: btn.tagName,
      }));
    });
    this.logger.log(`All buttons on page: ${JSON.stringify(allButtons)}`);

    // 尝试多个保存按钮选择器 - 基于截图，按钮文本是"保存为草稿"
    const saveSelectors = [
      // v2 编辑器的保存按钮（基于截图分析）
      'button:has-text("保存为草稿")',
      'a:has-text("保存为草稿")',
      '[class*="btn"]:has-text("保存为草稿")',
      // 通用保存按钮
      'button:has-text("保存草稿")',
      'button:has-text("保存")',
      ".js_save",
      ".weui-desktop-btn_primary",
      ".weui-desktop-btn_default",
      '[class*="save"]',
      ".tool_bar .preview",
    ];

    let saveButton = null;
    for (const selector of saveSelectors) {
      try {
        saveButton = await page.waitForSelector(selector, { timeout: 5000 });
        if (saveButton) {
          this.logger.log(`Found save button with selector: ${selector}`);
          break;
        }
      } catch {
        continue;
      }
    }

    if (!saveButton) {
      // 记录所有按钮用于调试
      const buttons = await page.$$eval("button", (els: Element[]) =>
        els.map((el) => ({
          text: el.textContent?.trim().substring(0, 50),
          class: el.className?.substring(0, 50),
        })),
      );
      this.logger.error(`Available buttons: ${JSON.stringify(buttons)}`);
      throw new Error("找不到保存按钮，微信后台界面可能已更新");
    }

    // 点击保存按钮
    this.logger.log("Clicking save button...");
    await saveButton.click();

    // 等待保存完成 - 使用多种检测方式
    this.logger.log("Waiting for save response...");
    try {
      await Promise.race([
        // 方式1: 等待 API 响应
        page.waitForResponse(
          (response: any) =>
            response.url().includes("operate_appmsg") &&
            response.status() === 200,
          { timeout: 30000 },
        ),
        // 方式2: 等待成功提示
        page.waitForSelector(".weui-desktop-toast__content", {
          timeout: 30000,
        }),
        // 方式3: 等待 URL 变化
        page.waitForURL(/appmsg.*aid=/, { timeout: 30000 }),
      ]);
      this.logger.log("Save operation completed");
    } catch (waitError) {
      this.logger.warn(
        `Save wait timed out, checking current state: ${(waitError as Error).message}`,
      );
      // 即使超时，也检查是否已保存成功
      await page.waitForTimeout(2000);
    }

    // 返回当前页面 URL 作为草稿链接
    const draftUrl = page.url();
    this.logger.log(`Draft URL: ${draftUrl}`);
    return draftUrl;
  }
}
