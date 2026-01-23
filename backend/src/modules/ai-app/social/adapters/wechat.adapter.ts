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

      // 详细检查 cookies 状态
      const now = Date.now() / 1000; // 当前时间戳（秒）
      const validCookies = sessionData.cookies.filter((cookie: any) => {
        // 检查 cookie 是否过期
        if (cookie.expires && cookie.expires > 0 && cookie.expires < now) {
          this.logger.warn(
            `Cookie expired: ${cookie.name}, expired at: ${new Date(cookie.expires * 1000).toISOString()}`,
          );
          return false;
        }
        return true;
      });

      this.logger.log(
        `Cookie analysis: total=${sessionData.cookies.length}, valid=${validCookies.length}, expired=${sessionData.cookies.length - validCookies.length}`,
      );

      // 检查关键 cookies 是否存在
      const keyCookieNames = [
        "slave_user",
        "slave_sid",
        "bizuin",
        "data_bizuin",
        "data_ticket",
      ];
      const keyCookies = validCookies.filter((c: any) =>
        keyCookieNames.includes(c.name),
      );
      this.logger.log(
        `Key cookies found: ${keyCookies.map((c: any) => c.name).join(", ") || "none"}`,
      );

      // 如果所有关键 cookies 都过期了，直接返回错误
      if (keyCookies.length === 0) {
        this.logger.error(
          "All key authentication cookies are missing or expired",
        );
        return {
          success: false,
          errorMessage:
            "微信公众号登录已过期（所有认证Cookie已失效），请在连接管理中重新扫码登录",
        };
      }

      // 使用有效的 cookies 进行恢复
      const sessionDataWithValidCookies = {
        ...sessionData,
        cookies: validCookies,
      };
      await this.playwright.restoreSession(
        contextId,
        sessionDataWithValidCookies,
      );
      this.logger.log("Session restored with valid cookies");

      // Step 3: 创建页面
      this.logger.log("Creating page...");
      page = await this.playwright.createPage(contextId);
      this.logger.log("Page created successfully");

      // Step 4: 访问公众号后台
      // 先访问根路径，让 WeChat 自动重定向（包含 token）
      this.logger.log("Navigating to WeChat MP root for auto-redirect...");
      await page.goto(this.MP_URL, {
        waitUntil: "networkidle",
        timeout: 30000,
      });
      this.logger.log(`After root navigation, URL: ${page.url()}`);

      // 如果被重定向到登录页或没有 token，尝试直接访问 home
      let currentUrl = page.url();
      if (!currentUrl.includes("token=") || currentUrl.includes("token=&")) {
        this.logger.log("No token after root redirect, trying direct home...");
        await page.goto(`${this.MP_URL}/cgi-bin/home?t=home/index&lang=zh_CN`, {
          waitUntil: "networkidle",
          timeout: 30000,
        });
        currentUrl = page.url();
        this.logger.log(`After home navigation, URL: ${currentUrl}`);
      }

      // 等待 URL 包含 token（最多等待 15 秒）
      let tokenInUrl = false;
      for (let i = 0; i < 15; i++) {
        currentUrl = page.url();
        if (currentUrl.includes("token=") && !currentUrl.includes("token=&")) {
          tokenInUrl = true;
          this.logger.log(`Token found in URL after ${i + 1}s: ${currentUrl}`);
          break;
        }
        // 尝试刷新页面触发重定向
        if (i === 5) {
          this.logger.log("Refreshing page to trigger redirect...");
          await page.reload({ waitUntil: "networkidle" });
        }
        this.logger.log(
          `Waiting for token, attempt ${i + 1}/15, URL: ${currentUrl}`,
        );
        await page.waitForTimeout(1000);
      }

      if (!tokenInUrl) {
        this.logger.error(
          "CRITICAL: No token in URL after 15s - session may be invalid",
        );
        // 尝试从页面 JS 中提取 token 作为最后手段
        const pageToken = await page
          .evaluate(() => {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const w = window as any;
            return w.wx?.commonData?.t || w.cgiData?.t || "";
          })
          .catch(() => "");
        if (pageToken) {
          this.logger.log(`Found token from page JS: ${pageToken}`);
          currentUrl = `${this.MP_URL}/cgi-bin/home?token=${pageToken}`;
        }
      }

      // 验证 cookies 是否被正确设置到浏览器上下文
      const pageContext = page.context();
      const browserCookies = await pageContext.cookies();
      this.logger.log(
        `Browser context cookies after navigation: ${browserCookies.length}`,
      );
      const mpCookies = browserCookies.filter(
        (c: any) =>
          c.domain.includes("mp.weixin.qq.com") || c.domain.includes(".qq.com"),
      );
      this.logger.log(
        `WeChat MP related cookies in browser: ${mpCookies.length}`,
      );
      if (mpCookies.length > 0) {
        this.logger.log(
          `Cookie names in browser: ${mpCookies.map((c: any) => c.name).join(", ")}`,
        );
      }

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

      // Step 6: 获取 token 并进入编辑器
      // Token 已在 Step 4 中提取
      this.logger.log("Extracting token from current URL...");

      let token = "";
      const tokenMatch = currentUrl.match(/token=(\d+)/);
      if (tokenMatch) {
        token = tokenMatch[1];
        this.logger.log(`Token extracted from URL: ${token}`);
      }

      // 获取 browser context 用于监听新页面
      const context = page.context();
      let editorPage = page; // 默认使用当前页面
      let clickSucceeded = false;

      // 尝试点击 Photo/图文 按钮进入编辑器
      // 基于 Playwright 实际分析：按钮结构是 div.new-creation__menu-content 包含文本
      this.logger.log("Looking for Photo/图文 button on home page...");

      const buttonTexts = ["Photo", "图文", "Article", "文章"];

      for (const buttonText of buttonTexts) {
        if (clickSucceeded) break;

        try {
          this.logger.log(`Looking for button with text: "${buttonText}"...`);

          // 方法1: 使用正确的选择器 - .new-creation__menu-content 包含文本
          // Playwright 实际使用: div:nth-child(N) > .new-creation__menu-content
          const menuContent = page.locator(
            `.new-creation__menu-content:has-text("${buttonText}")`,
          );
          const count = await menuContent.count();
          this.logger.log(
            `Found ${count} .new-creation__menu-content with text "${buttonText}"`,
          );

          if (count > 0) {
            this.logger.log(
              `Clicking .new-creation__menu-content for "${buttonText}"...`,
            );
            const [newPage] = await Promise.all([
              context.waitForEvent("page", { timeout: 15000 }),
              menuContent.first().click(),
            ]);

            this.logger.log("New tab opened, waiting for it to load...");
            await newPage.waitForLoadState("networkidle", { timeout: 30000 });
            editorPage = newPage;
            clickSucceeded = true;
            this.logger.log(`Editor page URL: ${editorPage.url()}`);
          }
        } catch (clickError) {
          this.logger.warn(
            `Click for "${buttonText}" failed: ${(clickError as Error).message}`,
          );
        }
      }

      // 如果点击方式失败，尝试通过 "New creation" 区域定位
      if (!clickSucceeded) {
        this.logger.log(
          "Menu content click failed, trying New creation section...",
        );
        try {
          // 查找 "New creation" 标题，然后找到其下的第三个或第四个按钮（Photo）
          const newCreationSection = page.locator(
            'text="New creation" >> xpath=../following-sibling::*',
          );
          const sectionCount = await newCreationSection.count();
          this.logger.log(`Found ${sectionCount} elements after New creation`);

          // 尝试点击包含 Photo 的元素
          const photoInSection = page
            .locator('[class*="new-creation"]')
            .filter({ hasText: /Photo|图文/ });
          const photoCount = await photoInSection.count();
          this.logger.log(`Found ${photoCount} Photo elements in section`);

          if (photoCount > 0) {
            const [newPage] = await Promise.all([
              context
                .waitForEvent("page", { timeout: 15000 })
                .catch(() => null),
              photoInSection.first().click(),
            ]);
            if (newPage) {
              await newPage.waitForLoadState("networkidle", { timeout: 30000 });
              editorPage = newPage;
              clickSucceeded = true;
              this.logger.log(`Editor page URL (section): ${editorPage.url()}`);
            }
          }
        } catch (sectionError) {
          this.logger.warn(
            `Section approach failed: ${(sectionError as Error).message}`,
          );
        }
      }

      // 最后尝试：直接文本匹配
      if (!clickSucceeded) {
        this.logger.log("Trying direct text match as last resort...");
        for (const buttonText of buttonTexts) {
          if (clickSucceeded) break;

          try {
            const textLocator = page.getByText(buttonText, { exact: true });
            const textCount = await textLocator.count();
            this.logger.log(
              `Direct text search found ${textCount} for "${buttonText}"`,
            );

            if (textCount > 0) {
              const [newPage] = await Promise.all([
                context
                  .waitForEvent("page", { timeout: 15000 })
                  .catch(() => null),
                textLocator.first().click(),
              ]);

              if (newPage) {
                await newPage.waitForLoadState("networkidle", {
                  timeout: 30000,
                });
                editorPage = newPage;
                clickSucceeded = true;
                this.logger.log(
                  `Editor page URL (text match): ${editorPage.url()}`,
                );
              }
            }
          } catch {
            continue;
          }
        }
      }

      // 如果仍然没有打开编辑器页面，尝试直接导航（最后手段）
      const editPageUrl = editorPage.url();
      if (!editPageUrl.includes("appmsg_edit") && !clickSucceeded) {
        this.logger.warn(
          "Editor page not opened via click, trying direct navigation...",
        );

        if (token) {
          const editorUrl = `${this.MP_URL}/cgi-bin/appmsg?t=media/appmsg_edit_v2&action=edit&isNew=1&type=77&createType=8&token=${token}`;
          this.logger.log(`Direct navigation to: ${editorUrl}`);
          await editorPage.goto(editorUrl, {
            waitUntil: "networkidle",
            timeout: 30000,
          });
        } else {
          // 最后尝试：从页面链接中提取 token
          this.logger.log("Trying to find token from page links...");
          const links = await page.evaluate(() => {
            const anchors = Array.from(document.querySelectorAll("a[href]"));
            return anchors
              .map((a) => a.getAttribute("href"))
              .filter((href) => href && href.includes("token="))
              .slice(0, 5);
          });
          this.logger.log(`Found links with token: ${JSON.stringify(links)}`);

          if (links.length > 0) {
            const linkTokenMatch = links[0]?.match(/token=(\d+)/);
            if (linkTokenMatch) {
              token = linkTokenMatch[1];
              const editorUrl = `${this.MP_URL}/cgi-bin/appmsg?t=media/appmsg_edit_v2&action=edit&isNew=1&type=77&createType=8&token=${token}`;
              this.logger.log(
                `Found token from link, direct navigation to: ${editorUrl}`,
              );
              await editorPage.goto(editorUrl, {
                waitUntil: "networkidle",
                timeout: 30000,
              });
            } else {
              this.logger.error(
                "No token found anywhere, cannot navigate to editor",
              );
              await this.captureDebugInfo(page, "no_token_found");
              return {
                success: false,
                errorMessage: "无法获取微信公众号 token，请重新连接",
              };
            }
          } else {
            this.logger.error("No token found in URL or page links");
            await this.captureDebugInfo(page, "no_token_found");
            return {
              success: false,
              errorMessage: "无法获取微信公众号 token，请重新连接",
            };
          }
        }
      }

      // 更新 page 引用为编辑器页面
      page = editorPage;
      const finalEditorUrl = page.url();
      this.logger.log(`Current URL after navigation: ${finalEditorUrl}`);

      // Step 7: 检查是否成功进入编辑页面
      if (
        finalEditorUrl.includes("bizlogin") ||
        finalEditorUrl.includes("action=login")
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

    // 等待编辑器加载 - 基于 Playwright 实际访问发现的选择器
    // Photo 编辑器：标题是 textbox，placeholder="Enter title here (optional)"
    this.logger.log("Waiting for editor to load...");

    const editorReadySelectors = [
      // Photo 编辑器 - 基于实际 Playwright 分析
      '[placeholder*="Enter title here"]', // 英文 Photo 编辑器
      '[placeholder*="title"]', // 通用英文
      '[placeholder*="标题"]', // 中文
      // Article 编辑器 - 旧版选择器
      "#title",
      ".js_title",
      ".js_article_title",
      "textarea.frm_input",
      // 通用 input/textarea
      'input[placeholder*="title"]',
      'textarea[placeholder*="title"]',
    ];

    let editorReady = false;
    for (const selector of editorReadySelectors) {
      try {
        this.logger.log(`Waiting for editor selector: ${selector}`);
        await page.waitForSelector(selector, { timeout: 15000 });
        this.logger.log(`Editor ready - found: ${selector}`);
        editorReady = true;
        break;
      } catch {
        this.logger.log(`Selector ${selector} not found, trying next...`);
        continue;
      }
    }

    if (!editorReady) {
      this.logger.warn(
        "Could not find editor with specific selectors, waiting 5 more seconds...",
      );
      await page.waitForTimeout(5000);
    }

    // 额外等待确保 UI 完全渲染
    await page.waitForTimeout(1000);

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

    // 填写标题 - 基于 Playwright 1:1 模拟实际操作 (2026-01-22)
    if (content.title) {
      this.logger.log("Looking for title input using getByRole...");

      let titleFilled = false;

      // 方法1: 使用 getByRole - 这是 Playwright 实际使用的方式
      // page.getByRole('textbox', { name: 'Input a title here' }).fill(...)
      try {
        const titleTextbox = page.getByRole("textbox", {
          name: /Input a title here|请在这里输入标题|标题/i,
        });
        const count = await titleTextbox.count();
        this.logger.log(`Found ${count} title textbox via getByRole`);
        if (count > 0) {
          await titleTextbox.first().fill(content.title);
          titleFilled = true;
          this.logger.log("Title filled via getByRole");
        }
      } catch (roleError) {
        this.logger.warn(`getByRole failed: ${(roleError as Error).message}`);
      }

      // 方法2: 使用 placeholder 选择器
      if (!titleFilled) {
        const titleSelectors = [
          '[placeholder="Enter title here (optional)"]',
          '[placeholder*="Enter title here"]',
          '[placeholder*="title"]',
          '[placeholder*="标题"]',
          "#title",
          ".js_article_title",
          "textarea",
          'input[type="text"]',
        ];

        for (const selector of titleSelectors) {
          try {
            const titleInput = await page.$(selector);
            if (titleInput) {
              this.logger.log(`Found title input with selector: ${selector}`);
              await titleInput.fill(content.title);
              titleFilled = true;
              break;
            }
          } catch {
            continue;
          }
        }
      }

      if (titleFilled) {
        this.logger.log("Title filled successfully");
      } else {
        this.logger.warn("Could not find title input element");
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

    let saveClicked = false;

    // 方法1: 使用 getByRole - 这是 Playwright 实际使用的方式
    // page.getByRole('button', { name: 'Save as draft' }).click()
    try {
      const saveButton = page.getByRole("button", {
        name: /Save as draft|保存为草稿|保存草稿/i,
      });
      const count = await saveButton.count();
      this.logger.log(`Found ${count} save button via getByRole`);
      if (count > 0) {
        await saveButton.first().click();
        saveClicked = true;
        this.logger.log("Save button clicked via getByRole");
      }
    } catch (roleError) {
      this.logger.warn(
        `getByRole for save button failed: ${(roleError as Error).message}`,
      );
    }

    // 方法2: 使用选择器
    if (!saveClicked) {
      const saveSelectors = [
        'button:has-text("Save as draft")',
        'button:has-text("保存为草稿")',
        'button:has-text("保存")',
        ".js_save",
      ];

      for (const selector of saveSelectors) {
        try {
          const btn = await page.waitForSelector(selector, { timeout: 3000 });
          if (btn) {
            await btn.click();
            saveClicked = true;
            this.logger.log(`Save button clicked with selector: ${selector}`);
            break;
          }
        } catch {
          continue;
        }
      }
    }

    if (!saveClicked) {
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
