import { Injectable, Logger } from "@nestjs/common";
import { Page } from "puppeteer";
import { SocialBrowserService } from "../services/social-browser.service";
import { PublishResult } from "../services/publish-executor.service";
import { SocialContent, SocialPlatformConnection } from "../types";
import { decryptSession } from "../utils/session-crypto";
import { SessionData } from "../types/platform.types";
import {
  runSaveDraftAttempts,
  type SaveDraftApiResult,
} from "./wechat-save-draft.helper";

/** Puppeteer-compatible delay helper (replaces Playwright's page.waitForTimeout) */
const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

@Injectable()
export class WechatAdapter {
  private readonly logger = new Logger(WechatAdapter.name);
  private readonly MP_URL = "https://mp.weixin.qq.com";

  constructor(private readonly playwright: SocialBrowserService) {}

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

    // 根据内容长度选择文章类型
    // type=10: 普通图文消息（无字数限制，适合长文章）
    // type=77: 小绿书/图文笔记（限制 1000 字，适合短内容）
    const contentLength = content.content.length;
    const articleType = contentLength > 1000 ? "10" : "77";
    this.logger.log(
      `Content length: ${contentLength} chars, using article type: ${articleType} (${articleType === "10" ? "普通图文" : "小绿书"})`,
    );

    const contextId = `wechat-${connection.id}`;
    let page: Page | null = null;

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

      // Decrypt sessionData - it's stored encrypted in database
      const sessionDataStr =
        typeof connection.sessionData === "string"
          ? connection.sessionData
          : JSON.stringify(connection.sessionData);
      const sessionData = decryptSession<SessionData>(sessionDataStr);
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
      const validCookies = sessionData.cookies.filter(
        (cookie: { name: string; expires?: number }) => {
          // 检查 cookie 是否过期
          if (cookie.expires && cookie.expires > 0 && cookie.expires < now) {
            this.logger.warn(
              `Cookie expired: ${cookie.name}, expired at: ${new Date(cookie.expires * 1000).toISOString()}`,
            );
            return false;
          }
          return true;
        },
      );

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
      const keyCookies = validCookies.filter((c: { name: string }) =>
        keyCookieNames.includes(c.name),
      );
      this.logger.log(
        `Key cookies found: ${keyCookies.map((c: { name: string }) => c.name).join(", ") || "none"}`,
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

      // 2026-05-16 PR #98: fingerprint sniffer —— 真鼠标侧拦截 WeChat 自身出站
      //   请求（pre_load_sentence / spellcheck / auto-save 等都带 32-hex
      //   fingerprint），把它存进闭包传给 saveDraftViaApi 替代 window scrape
      //   方案（PR #97 显示 window.wx.commonData.fingerprint=undefined）。
      //   编辑器页可能是新 tab，所以提供 attach 助手反复调用。
      const sniffState = { fingerprint: "" };
      const attachSniffer = (p: Page) => {
        p.on(
          "request",
          (request: {
            url: () => string;
            postData: () => string | undefined;
          }) => {
            if (sniffState.fingerprint) return;
            try {
              const url = request.url();
              if (!url.includes("mp.weixin.qq.com")) return;
              const body = request.postData?.() ?? "";
              const haystack = `${url}&${body}`;
              const m = haystack.match(/[?&]fingerprint=([a-f0-9]{32})/i);
              if (m) {
                sniffState.fingerprint = m[1];
                this.logger.log(
                  `[fingerprint sniff] captured: ${sniffState.fingerprint} from ${url.slice(0, 120)}`,
                );
              }
            } catch {
              // listener 不能抛
            }
          },
        );
      };
      attachSniffer(page);

      // Step 4: 访问公众号后台
      // 先访问根路径，让 WeChat 自动重定向（包含 token）
      this.logger.log("Navigating to WeChat MP root for auto-redirect...");
      await page.goto(this.MP_URL, {
        waitUntil: "networkidle0",
        timeout: 30000,
      });
      this.logger.log(`After root navigation, URL: ${page.url()}`);

      // 如果被重定向到登录页或没有 token，尝试直接访问 home
      let currentUrl = page.url();
      if (!currentUrl.includes("token=") || currentUrl.includes("token=&")) {
        this.logger.log("No token after root redirect, trying direct home...");
        await page.goto(`${this.MP_URL}/cgi-bin/home?t=home/index&lang=zh_CN`, {
          waitUntil: "networkidle0",
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
          await page.reload({ waitUntil: "networkidle0" });
        }
        this.logger.log(
          `Waiting for token, attempt ${i + 1}/15, URL: ${currentUrl}`,
        );
        await delay(1000);
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
      const browserCookies = await page.cookies();
      this.logger.log(
        `Browser context cookies after navigation: ${browserCookies.length}`,
      );
      const mpCookies = browserCookies.filter(
        (c: { domain: string; name: string }) =>
          c.domain.includes("mp.weixin.qq.com") || c.domain.includes(".qq.com"),
      );
      this.logger.log(
        `WeChat MP related cookies in browser: ${mpCookies.length}`,
      );
      if (mpCookies.length > 0) {
        this.logger.log(
          `Cookie names in browser: ${mpCookies.map((c: { name: string }) => c.name).join(", ")}`,
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
      // 优先使用登录时保存的 token，因为恢复 cookies 后 URL 中通常没有 token
      this.logger.log("Getting token for editor navigation...");

      let token = "";

      // 优先使用保存的 wechatToken
      if (sessionData.wechatToken) {
        token = sessionData.wechatToken;
        this.logger.log(`Using saved wechatToken: ${token}`);
      } else {
        // 尝试从当前 URL 提取
        const tokenMatch = currentUrl.match(/token=(\d+)/);
        if (tokenMatch) {
          token = tokenMatch[1];
          this.logger.log(`Token extracted from URL: ${token}`);
        }
      }

      let editorPage: Page = page; // 默认使用当前页面
      let clickSucceeded = false;

      // 2026-05-16: 长文 (articleType=10, 普通图文) 走 type=10 直链，跳过 home 按钮点击
      //   背景：WeChat 新版 home 页只剩"文章"按钮（→ 打开 type=77 小绿书编辑器，
      //   ≤1000 字限制，且"保存为草稿"按钮 silently no-op），让 2299 字长文必然
      //   超限失败。articleType 计算了却没用是反模式，这里把它真正用起来。
      //   短笔记 (type=77) 继续走原 button 点击流程兼容。
      if (articleType === "10" && token) {
        // 2026-05-16: 去掉 createType=0 —— PR #95 API 直发暴露真根因：
        //   createType=0 让微信识别成"编辑旧版图文素材"模式，返回 ret=444002
        //   "旧版图文素材不可再保存。如需使用，可在网页版新建草稿并从'旧版图文
        //   素材'选择"。用户 manual 截图 18 的 URL 完全没有 createType 参数。
        const directType10Url = `${this.MP_URL}/cgi-bin/appmsg?t=media/appmsg_edit_v2&action=edit&isNew=1&type=10&token=${token}&lang=zh_CN&timestamp=${Date.now()}`;
        this.logger.log(
          `[fast-path] Long article (${contentLength} chars) → direct nav to type=10 editor: ${directType10Url}`,
        );
        try {
          await page.goto(directType10Url, {
            waitUntil: "networkidle0",
            timeout: 30000,
          });
          const navigatedUrl = page.url();
          this.logger.log(`[fast-path] After navigation, URL: ${navigatedUrl}`);
          // 验证真的落到 type=10 编辑器（如果 WeChat deprecate 了 type=10 会重定向走）
          if (
            navigatedUrl.includes("appmsg_edit") &&
            navigatedUrl.includes("type=10")
          ) {
            editorPage = page;
            clickSucceeded = true;
            this.logger.log(
              "[fast-path] type=10 editor confirmed, skipping home button click",
            );
          } else {
            this.logger.warn(
              `[fast-path] Direct nav did not land on type=10 (got ${navigatedUrl}), falling back to home button click`,
            );
          }
        } catch (navError) {
          this.logger.warn(
            `[fast-path] Direct nav to type=10 failed, falling back: ${(navError as Error).message}`,
          );
        }
      }

      // 尝试点击 图文/Photo 按钮进入编辑器
      // 基于 Playwright 实际分析：按钮结构是 div.new-creation__menu-content 包含文本
      // 中文优先 - 微信公众号默认中文界面
      if (!clickSucceeded) {
        this.logger.log("Looking for 图文/Photo button on home page...");
      }

      const buttonTexts = ["图文", "图文消息", "文章", "Photo", "Article"];

      for (const buttonText of buttonTexts) {
        if (clickSucceeded) break;

        try {
          this.logger.log(`Looking for button with text: "${buttonText}"...`);

          // 方法1: 查找 .new-creation__menu-content 元素并匹配文本
          const menuElements = await page.$$(".new-creation__menu-content");
          let matchedMenu = null;
          for (const el of menuElements) {
            const text = await el.evaluate(
              (node: Element) => node.textContent || "",
            );
            if (text.includes(buttonText)) {
              matchedMenu = el;
              break;
            }
          }
          const count = matchedMenu ? 1 : 0;
          this.logger.log(
            `Found ${count} .new-creation__menu-content with text "${buttonText}"`,
          );

          if (matchedMenu) {
            this.logger.log(
              `Clicking .new-creation__menu-content for "${buttonText}"...`,
            );
            if (!page) throw new Error("Page not initialized");
            const currentPage = page;
            const newPagePromise = new Promise<Page>((resolve, reject) => {
              const timer = setTimeout(
                () => reject(new Error("Timeout waiting for new page")),
                15000,
              );
              currentPage.browser().once("targetcreated", async (target) => {
                clearTimeout(timer);
                const p = await target.page();
                resolve(p!);
              });
            });
            await matchedMenu.click();
            const newPage = await newPagePromise;

            this.logger.log("New tab opened, waiting for it to load...");
            await newPage.waitForNetworkIdle({ idleTime: 500, timeout: 30000 });
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
          // 查找包含 Photo/图文 的 new-creation 元素
          const photoElements = await page.$$('[class*="new-creation"]');
          let matchedElement = null;
          for (const el of photoElements) {
            const text = await el.evaluate(
              (node: Element) => node.textContent || "",
            );
            if (/Photo|图文/.test(text)) {
              matchedElement = el;
              break;
            }
          }
          const photoCount = matchedElement ? 1 : 0;
          this.logger.log(`Found ${photoCount} Photo elements in section`);

          if (matchedElement) {
            if (!page) throw new Error("Page not initialized");
            const currentPage2 = page;
            const newPagePromise = new Promise<Page | null>((resolve) => {
              const timer = setTimeout(() => resolve(null), 15000);
              currentPage2.browser().once("targetcreated", async (target) => {
                clearTimeout(timer);
                const p = await target.page();
                resolve(p);
              });
            });
            await matchedElement.click();
            const newPage = await newPagePromise;
            if (newPage) {
              await newPage.waitForNetworkIdle({
                idleTime: 500,
                timeout: 30000,
              });
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
            // Find elements matching exact text
            const allElements = await page.$$("*");
            let matchedEl = null;
            for (const el of allElements) {
              const text = await el
                .evaluate((node: Element) => node.textContent?.trim() || "")
                .catch(() => "");
              if (text === buttonText) {
                matchedEl = el;
                break;
              }
            }

            if (matchedEl) {
              this.logger.log(
                `Direct text search found match for "${buttonText}"`,
              );
              if (!page) throw new Error("Page not initialized");
              const currentPage3 = page;
              const newPagePromise = new Promise<Page | null>((resolve) => {
                const timer = setTimeout(() => resolve(null), 15000);
                currentPage3.browser().once("targetcreated", async (target) => {
                  clearTimeout(timer);
                  const p = await target.page();
                  resolve(p);
                });
              });
              await matchedEl.click();
              const newPage = await newPagePromise;

              if (newPage) {
                await newPage.waitForNetworkIdle({
                  idleTime: 500,
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
          const editorUrl = `${this.MP_URL}/cgi-bin/appmsg?t=media/appmsg_edit_v2&action=edit&isNew=1&type=${articleType}&createType=8&token=${token}`;
          this.logger.log(`Direct navigation to: ${editorUrl}`);
          await editorPage.goto(editorUrl, {
            waitUntil: "networkidle0",
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
              const editorUrl = `${this.MP_URL}/cgi-bin/appmsg?t=media/appmsg_edit_v2&action=edit&isNew=1&type=${articleType}&createType=8&token=${token}`;
              this.logger.log(
                `Found token from link, direct navigation to: ${editorUrl}`,
              );
              await editorPage.goto(editorUrl, {
                waitUntil: "networkidle0",
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

      // 编辑器若是新 tab，给它也挂上 fingerprint sniffer（编辑器才会发
      // pre_load_sentence/spellcheck，初始 home 页通常没这些请求）。
      // 重复挂同一 page 是幂等的（puppeteer 允许多 listener），但同一 page
      // 不会被附两次因为 `page = editorPage` 后引用相同。
      attachSniffer(page);

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

      // Step 8: 填充内容（使用平台适配版本，无需截断）
      this.logger.log("Filling content...");
      await this.fillContent(page, content);
      this.logger.log("Content filled successfully");

      // Step 9: 先保存草稿（确保内容持久化，防止群发失败丢失内容）
      this.logger.log("Saving as draft first...");
      // fillContent 时编辑器会发 pre_load_sentence/spellcheck 等带 fingerprint
      // 的请求，已被 attachSniffer 抓住。若仍为空再等 2s 等慢请求漏网，
      // saveDraftViaApi 内 fallback 链兜底（window.wx / inline script / outerHTML）。
      if (!sniffState.fingerprint) {
        this.logger.log(
          "[fingerprint sniff] not captured yet after fillContent, waiting 2s for late requests",
        );
        await delay(2000);
      }
      const draftUrl = await this.saveDraft(
        page,
        content,
        sniffState.fingerprint,
      );
      this.logger.log(`Draft saved: ${draftUrl}`);

      // Step 10: 群发 — 点击"群发"按钮实际发布文章
      this.logger.log("Starting mass send (群发)...");
      const publishResult = await this.massSend(page);

      if (publishResult.success) {
        this.logger.log(
          `WeChat article published successfully: ${publishResult.externalUrl || draftUrl}`,
        );
        return {
          success: true,
          externalUrl: publishResult.externalUrl || draftUrl,
          externalId: publishResult.externalId,
        };
      }

      // 群发失败，但草稿已保存
      this.logger.warn(
        `Mass send failed: ${publishResult.errorMessage}. Draft was saved at: ${draftUrl}`,
      );
      return {
        success: false,
        externalUrl: draftUrl,
        errorMessage: `群发失败: ${publishResult.errorMessage}（草稿已保存，可在公众号后台手动群发）`,
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
  private async captureDebugInfo(page: Page, context: string): Promise<void> {
    try {
      this.logger.error(`[${context}] Capturing debug info...`);
      this.logger.error(`[${context}] Current URL: ${page.url()}`);

      // 截图
      const screenshot = await page
        .screenshot({ fullPage: true })
        .catch(() => null);
      if (screenshot) {
        this.logger.error(
          `[${context}] Screenshot captured (base64 length: ${Buffer.from(screenshot).toString("base64").length})`,
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
        const qrCodeSrc = await qrCodeElement.evaluate((el: Element) =>
          el.getAttribute("src"),
        );
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

    const pages = await context.pages();
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

  private async checkLoginStatus(page: Page): Promise<boolean> {
    try {
      // 等待页面稳定
      await page
        .waitForNetworkIdle({ idleTime: 500, timeout: 10000 })
        .catch((err: Error) =>
          this.logger.debug(`Page load timeout: ${err?.message}`),
        );

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

  private async fillContent(page: Page, content: SocialContent): Promise<void> {
    this.logger.log("Starting to fill content...");

    // 等待页面完全加载（包括动态内容）
    await page.waitForNetworkIdle({ idleTime: 500 }).catch(() => {
      this.logger.debug("waitForNetworkIdle timed out, continuing...");
    });
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
      // 中文 Photo/Article 编辑器 - 微信公众号默认中文界面（优先）
      '[placeholder*="请输入标题"]', // 中文标题输入
      '[placeholder*="填写标题"]', // 中文标题
      '[placeholder*="填写描述"]', // 描述输入框
      '[placeholder*="标题"]', // 通用中文标题
      // 根据字数限制特征匹配
      'input[maxlength="20"]', // 图文标题限制20字
      'textarea[maxlength="1000"]', // 正文限制1000字
      // 英文 Photo 编辑器 - 基于实际 Playwright 分析
      '[placeholder*="Enter title here"]', // 英文 Photo 编辑器
      '[placeholder*="title"]', // 通用英文
      // Article 编辑器 - 旧版选择器
      "#title",
      ".js_title",
      ".js_article_title",
      "textarea.frm_input",
      // 通用后备 - 查找任何可编辑元素
      '[contenteditable="true"]',
      "textarea",
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
      await delay(5000);
    }

    // 额外等待确保 UI 完全渲染
    await delay(1000);

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
      this.logger.log("Looking for title input...");

      let titleFilled = false;

      // 方法1: 查找 textbox 类型的 input/textarea 并匹配 aria-label 或 placeholder
      try {
        const titlePattern =
          /请在这里输入标题|请输入标题|标题|Input a title here|title/i;
        const titleTextbox = await page.evaluateHandle((pattern: string) => {
          const re = new RegExp(pattern, "i");
          const inputs = Array.from(
            document.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>(
              'input[type="text"], textarea, [role="textbox"]',
            ),
          );
          return (
            inputs.find(
              (el) =>
                re.test(el.getAttribute("aria-label") || "") ||
                re.test(el.getAttribute("placeholder") || ""),
            ) || null
          );
        }, titlePattern.source);
        const element = titleTextbox.asElement() as
          | import("puppeteer").ElementHandle<Element>
          | null;
        if (element) {
          // Clear and type (Puppeteer equivalent of Playwright's fill)
          await element.click({ clickCount: 3 });
          await page.keyboard.type(content.title);
          titleFilled = true;
          this.logger.log("Title filled via aria-label/placeholder match");
        }
      } catch (roleError) {
        this.logger.warn(
          `Title textbox search failed: ${(roleError as Error).message}`,
        );
      }

      // 方法2: 使用 placeholder 选择器 - 中文优先
      if (!titleFilled) {
        const titleSelectors = [
          // 中文界面 - 微信公众号默认
          '[placeholder*="请输入标题"]',
          '[placeholder*="填写标题"]',
          '[placeholder*="标题"]',
          // 英文界面
          '[placeholder="Enter title here (optional)"]',
          '[placeholder*="Enter title here"]',
          '[placeholder*="title"]',
          // 通用选择器
          "#title",
          ".js_article_title",
          // 根据字数限制特征匹配 - 图文消息标题限制20字
          'input[maxlength="20"]',
          'textarea[maxlength="20"]',
          // 最后尝试通用元素
          "textarea",
          'input[type="text"]',
        ];

        for (const selector of titleSelectors) {
          try {
            const titleInput = await page.$(selector);
            if (titleInput) {
              this.logger.log(`Found title input with selector: ${selector}`);
              await titleInput.click({ count: 3 });
              await page.keyboard.type(content.title);
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
        this.logger.log(`Filling content (${content.content.length} chars)...`);

        const editorSelector = await editor.evaluate(
          (el: Element) => el.className || el.id || el.tagName,
        );
        this.logger.log(`Editor element: ${editorSelector}`);

        // 检测内容是否已经是 HTML 格式
        const isHtml = /<[a-z][\s\S]*>/i.test(content.content);

        let htmlContent: string;
        if (isHtml) {
          // 内容已经是 HTML 格式，直接使用
          this.logger.log("Content is already HTML format, using as-is");
          htmlContent = content.content;
        } else {
          // 纯文本转换为 HTML 段落
          this.logger.log(
            "Content is plain text, converting to HTML paragraphs",
          );
          htmlContent = content.content
            .split("\n")
            .filter((line) => line.trim())
            .map((line) => `<p>${line}</p>`)
            .join("");
        }

        this.logger.log(
          `HTML content length: ${htmlContent.length} chars (original: ${content.content.length})`,
        );

        // ProseMirror 内容注入策略：
        // 1. 先尝试 clipboard paste（ProseMirror 原生支持，不会截断）
        // 2. 回退到 innerHTML 直接设置（比 execCommand 更可靠）
        // 3. 最后尝试 execCommand（在 ProseMirror 上容易截断内容）
        const fillResult: {
          success: boolean;
          selector: string | null;
          method: string | null;
        } = await page.evaluate(
          ({
            html,
          }: {
            html: string;
          }): {
            success: boolean;
            selector: string | null;
            method: string | null;
          } => {
            const selectors = [
              ".ProseMirror",
              "#js_editor",
              '[contenteditable="true"]',
              ".editor-content",
            ];

            for (const sel of selectors) {
              const editorEl = document.querySelector(sel);
              if (editorEl && (editorEl as HTMLElement).isContentEditable) {
                // 聚焦编辑器
                (editorEl as HTMLElement).focus();

                // 方法1: 使用 clipboard paste 事件（ProseMirror 原生处理，最可靠）
                try {
                  const selection = window.getSelection();
                  if (selection) {
                    selection.selectAllChildren(editorEl);
                    selection.deleteFromDocument();
                  }
                  const dt = new DataTransfer();
                  dt.setData("text/html", html);
                  dt.setData("text/plain", html.replace(/<[^>]*>/g, "\n"));
                  const pasteEvent = new ClipboardEvent("paste", {
                    clipboardData: dt,
                    bubbles: true,
                    cancelable: true,
                  });
                  const handled = editorEl.dispatchEvent(pasteEvent);
                  // ProseMirror 会 preventDefault 来处理 paste，所以 handled=false 表示成功处理
                  if (!handled) {
                    editorEl.dispatchEvent(
                      new Event("input", { bubbles: true }),
                    );
                    return { success: true, selector: sel, method: "paste" };
                  }
                  // 如果 paste 没有被 ProseMirror 处理（handled=true 意味着没有 preventDefault），
                  // 检查内容是否已经被填入
                  if (
                    editorEl.textContent &&
                    editorEl.textContent.length > 100
                  ) {
                    return {
                      success: true,
                      selector: sel,
                      method: "paste-fallthrough",
                    };
                  }
                } catch {
                  // paste 事件可能失败，继续
                }

                // 方法2: 直接设置 innerHTML（比 execCommand 更可靠，不会截断）
                try {
                  const selection = window.getSelection();
                  if (selection) {
                    selection.selectAllChildren(editorEl);
                    selection.deleteFromDocument();
                  }
                  (editorEl as HTMLElement).innerHTML = html;
                  editorEl.dispatchEvent(new Event("input", { bubbles: true }));
                  editorEl.dispatchEvent(
                    new Event("change", { bubbles: true }),
                  );
                  // ProseMirror 可能需要手动触发更新
                  // 通过 MutationObserver 或 input 事件通知 ProseMirror state
                  return {
                    success: true,
                    selector: sel,
                    method: "innerHTML",
                  };
                } catch {
                  // innerHTML 设置失败
                }

                // 方法3: execCommand（最后手段，ProseMirror 上可能截断长内容）
                try {
                  const selection = window.getSelection();
                  if (selection) {
                    selection.selectAllChildren(editorEl);
                    selection.deleteFromDocument();
                  }
                  const success = document.execCommand(
                    "insertHTML",
                    false,
                    html,
                  );
                  if (success) {
                    editorEl.dispatchEvent(
                      new Event("input", { bubbles: true }),
                    );
                    return {
                      success: true,
                      selector: sel,
                      method: "execCommand",
                    };
                  }
                } catch {
                  // execCommand 失败
                }
              }
            }
            return { success: false, selector: null, method: null };
          },
          { html: htmlContent },
        );

        if (fillResult.success) {
          this.logger.log(
            `Content filled via ${fillResult.method} on ${fillResult.selector}`,
          );

          // 验证内容是否被正确填入
          await delay(500);
          const contentLength = await page.evaluate(() => {
            const pm = document.querySelector(".ProseMirror");
            return pm ? pm.textContent?.length || 0 : 0;
          });
          this.logger.log(
            `Editor content length after fill: ${contentLength} chars`,
          );

          // 如果内容长度远小于原始内容，说明填充失败/被截断，使用键盘输入重新填写
          // 阈值从 0.5 提高到 0.8：ProseMirror 的 execCommand 常截断 ~50% 内容
          if (contentLength < content.content.length * 0.8) {
            this.logger.warn(
              `Content truncated or incomplete (got ${contentLength}, expected ~${content.content.length}), retrying with keyboard input...`,
            );
            await page.keyboard.down("Control");
            await page.keyboard.press("a");
            await page.keyboard.up("Control");
            await page.keyboard.press("Backspace");
            await delay(200);

            // 使用键盘逐段输入
            const lines = content.content.split("\n").filter((l) => l.trim());
            for (let i = 0; i < lines.length; i++) {
              await page.keyboard.type(lines[i], { delay: 0 });
              if (i < lines.length - 1) {
                await page.keyboard.press("Enter");
              }
              // 每隔一定行数等待一下
              if (i % 10 === 9) {
                await delay(100);
              }
            }
            this.logger.log("Content filled via keyboard input");
          }
        } else {
          // 所有方法失败，使用纯键盘输入
          this.logger.warn("All fill methods failed, using keyboard input...");
          await page.keyboard.down("Control");
          await page.keyboard.press("a");
          await page.keyboard.up("Control");
          await page.keyboard.press("Backspace");
          await delay(200);

          const lines = content.content.split("\n").filter((l) => l.trim());
          for (let i = 0; i < lines.length; i++) {
            await page.keyboard.type(lines[i], { delay: 0 });
            if (i < lines.length - 1) {
              await page.keyboard.press("Enter");
            }
            if (i % 10 === 9) {
              await delay(100);
            }
          }
          this.logger.log("Content filled via keyboard input");
        }

        await delay(1000); // 等待内容渲染
        this.logger.log("Content fill completed");
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
            await page.keyboard.type(content.content);
            this.logger.log("Content filled via iframe");
            break;
          }
        }
      }
    }

    // 填写作者 - 2026-05-16: prod 实测发现 type=77 v2 编辑器 #author 为必填字段，
    //   不填会让 "保存为草稿" click 静默取消（37 个网络请求里没一个 save endpoint）。
    //   DOM 中 INPUT#author placeholder="请输入作者" visible:true 已确认。
    //   优先 content.author，否则用合理默认值"系统"；填写失败不阻塞，留给 dialog probe。
    try {
      const authorValue = content.author?.trim() || "系统";
      const authorInput = await page.$("#author, .js_author");
      if (authorInput) {
        await authorInput.click({ count: 3 });
        await page.keyboard.type(authorValue);
        this.logger.log(`Author filled: "${authorValue}"`);
      } else {
        this.logger.warn("Author input #author not found, skipping");
      }
    } catch (authorError) {
      this.logger.warn(
        `Author fill skipped due to error: ${(authorError as Error).message}`,
      );
    }

    // 填写摘要/描述 - 摘要是可选的，如果填写失败不应该阻止发布
    if (content.digest) {
      try {
        const digestSelectors = [
          // 中文界面 - 基于日志 "填写描述信息，让大家了解更多内容"
          '[placeholder*="填写描述"]',
          '[placeholder*="描述信息"]',
          '[placeholder*="摘要"]',
          // 根据字数限制匹配
          'textarea[maxlength="120"]', // 微信公众号摘要限制120字
          // 英文界面 / ID 选择器
          "#js_description", // 微信公众号实际使用的 ID
          "#digest",
          'textarea[name="digest"]',
          ".js_desc",
          ".digest-input",
          '[placeholder*="description"]',
        ];
        for (const selector of digestSelectors) {
          try {
            const digestInput = await page.$(selector);
            if (digestInput) {
              // 使用较短的超时，避免阻塞整个流程
              await digestInput.click({ count: 3 });
              await page.keyboard.type(content.digest);
              this.logger.log("Digest filled successfully");
              break;
            }
          } catch (fillError) {
            this.logger.warn(
              `Failed to fill digest with selector ${selector}: ${(fillError as Error).message}`,
            );
            continue;
          }
        }
      } catch (digestError) {
        // 摘要填写失败不应该阻止发布
        this.logger.warn(
          `Digest fill skipped due to error: ${(digestError as Error).message}`,
        );
      }
    }
  }

  /**
   * 2026-05-16: 通过 page.evaluate(fetch) 在浏览器上下文直接 POST 到
   * `/cgi-bin/operate_appmsg?sub=create`，绕开 UI click。浏览器自动带
   * 当前 session cookies + Origin + Referer，对 WeChat 后端跟用户手动点击
   * 的请求 indistinguishable，理论上 100% 等价于真人保存。
   *
   * 返回 V1 编辑器 URL（含 appmsgid）表示成功；null 表示需要回退 UI click。
   */
  private async saveDraftViaApi(
    page: Page,
    content: SocialContent,
    sniffedFingerprint: string,
  ): Promise<string | null> {
    // 从当前 page URL 提取 token（fast-path 已 navigate 到 type=10 编辑器）
    const currentUrl = page.url();
    const tokenMatch = currentUrl.match(/[?&]token=(\d+)/);
    if (!tokenMatch) {
      this.logger.warn("[saveDraft API] No token in page URL, skip API path");
      return null;
    }
    const token = tokenMatch[1];

    // 在浏览器上下文里发起 POST，自动复用 cookies + Origin / Referer。
    //   多 schema 尝试 + fingerprint fallback 链已抽到 wechat-save-draft.helper.ts
    //   以避免 god-class size guard 拒推（>2500 行单次 +50 行）。
    const result: SaveDraftApiResult = await page.evaluate(
      runSaveDraftAttempts,
      {
        token,
        title: content.title || "",
        author: content.author || "系统",
        digest: content.digest || "",
        content: content.content || "",
        sniffedFingerprint,
      },
    );

    this.logger.log(
      `[saveDraft API] status=${result.status} fingerprint=${result.fingerprint || "(none)"} source=${result.fpSource || "(none)"}`,
    );
    this.logger.log(`[saveDraft API] attempts: ${result.bodyPreview}`);

    const json = result.json;
    const ret = json?.base_resp?.ret ?? json?.ret;
    const appMsgId = json?.appMsgId;

    if (ret === 0 && appMsgId) {
      return `https://mp.weixin.qq.com/cgi-bin/appmsg?action=edit&appmsgid=${appMsgId}&token=${token}&lang=zh_CN`;
    }

    if (json?.base_resp?.err_msg) {
      this.logger.warn(
        `[saveDraft API] WeChat returned err_msg=${json.base_resp.err_msg}`,
      );
    }
    return null;
  }

  private async saveDraft(
    page: Page,
    content: SocialContent,
    sniffedFingerprint: string,
  ): Promise<string> {
    // 2026-05-16: API 直发路径优先 —— 跳过 UI click 模拟，从 page 上下文里
    //   直接 fetch POST 到微信内部 save endpoint。基于 PR #94 的 POST 拦截
    //   ground truth：endpoint `/cgi-bin/operate_appmsg?t=ajax-response&sub=create`
    //   schema（从同源 pre_load_sentence body 反推）：token / lang / f /
    //   ajax / fingerprint / random / AppMsgId='' / count=1 / title0 /
    //   author0 / digest0 / content0 / show_cover_pic0=0 / need_open_comment0=1
    //   / copyright_type=0。绕开 click 反爬 / React state / DOM 操作问题。
    //   API 失败回退原 UI click 路径（PR #87~#94 累积的 3 method 兜底）。
    //   2026-05-16 #98: sniffedFingerprint 来自 publish() 顶部装的 request
    //   listener —— window scrape 失败时用真鼠标侧 sniff 到的 32-hex。
    try {
      const apiUrl = await this.saveDraftViaApi(
        page,
        content,
        sniffedFingerprint,
      );
      if (apiUrl) {
        this.logger.log(`[saveDraft] API direct save succeeded: ${apiUrl}`);
        return apiUrl;
      }
      this.logger.warn(
        "[saveDraft] API direct returned no appMsgId, falling to UI click",
      );
    } catch (apiError) {
      this.logger.warn(
        `[saveDraft] API direct threw, falling to UI click: ${(apiError as Error).message}`,
      );
    }

    this.logger.log("Looking for save button...");

    // 2026-05-15: 用户在 prod 真复现 saveDraft 30s timeout 后，发现现有 matcher
    //   (operate_appmsg?sub=create|update|submit / /draft/add / /draft/update)
    //   没匹配到微信现在真用的 endpoint（可能 type=77 小绿书或 API 改版）。
    //   增加 network 全量日志：click 前挂 page.on('response')，把 mp.weixin
    //   域的 200 响应 URL 全部收集起来；失败时打 log 看真路径，下次精准补 matcher。
    const capturedUrls: string[] = [];
    const captureHandler = (response: {
      url: () => string;
      status: () => number;
    }) => {
      const url = response.url();
      if (response.status() !== 200) return;
      // 只关心 mp.weixin.qq.com 业务接口，过滤静态资源 / 第三方
      if (!/mp\.weixin\.qq\.com/.test(url)) return;
      if (
        /\.(js|css|png|jpg|jpeg|gif|svg|woff2?|ttf|ico)(\?|$)/i.test(url) ||
        url.includes("/htmledition/") ||
        url.includes("/res.wx.qq.com/")
      ) {
        return;
      }
      capturedUrls.push(url);
    };
    page.on(
      "response",
      captureHandler as unknown as Parameters<typeof page.on>[1],
    );

    // 2026-05-16: 额外加 request body 拦截 —— 6 个 PR 后仍 silent fail，
    //   光看 response URL 不够，要知道 React handler 究竟尝试 POST 什么、
    //   或者根本没发任何 POST。捕获所有 mp.weixin POST 请求（method + url
    //   + body 前 800 字节），失败时一起 dump。
    const capturedPosts: Array<{ method: string; url: string; body: string }> =
      [];
    const requestHandler = (request: {
      method: () => string;
      url: () => string;
      postData: () => string | undefined;
      resourceType: () => string;
    }) => {
      const method = request.method();
      const url = request.url();
      if (method === "GET" || method === "OPTIONS") return;
      if (!/mp\.weixin\.qq\.com/.test(url)) return;
      // 2026-05-16 PR #99: bump 800→3500 chars。PR #98 实测 WeChat 把它
      //   自己的 mplog 内部 trace（"this is fail save path + terminal three:
      //   postDataReturnFun" 等）发到 /advanced/mplog?action=up，body 含
      //   urlencoded JSON 嵌套 JSON，800 chars 切到中间就乱码看不出 root cause。
      const body = (request.postData?.() ?? "").slice(0, 3500);
      capturedPosts.push({ method, url, body });
    };
    page.on(
      "request",
      requestHandler as unknown as Parameters<typeof page.on>[1],
    );

    let saveClicked = false;

    // 2026-05-16: PR #92 mouse.click(905,687) 真发了但 save 仍 0 endpoint。
    //   captured URL list 出现 /misc/jslog?1=1 微信 JS 错误上报，强烈怀疑
    //   click 击中按钮但 React handler 读 form state 时发现 title/author/content
    //   未真同步（puppeteer keyboard.type 只触发 native input event，React
    //   controlled component 不认账），handler 静默 abort 不发请求也不弹 modal。
    //
    //   多防策略：先 blur+change 强同步 React state，再依次跑 3 种触发
    //     方式（Ctrl+S / mouse.click 修正坐标 / elementHandle.click），每种
    //     之间小停顿。waitForResponse 在 30s 窗口内捕到任一 save endpoint
    //     即视为成功；都没命中再 throw。

    // Step 0: 让 title / author / digest / content 已填字段 blur + change
    //   让 React controlled component 把 native input 值真正写入 state
    try {
      await page.evaluate(() => {
        const fields = [
          document.querySelector("textarea#title.js_article_title"),
          document.querySelector("input#author.js_author"),
          document.querySelector("textarea#js_description"),
          document.querySelector(".ProseMirror"),
        ];
        for (const el of fields) {
          if (!el) continue;
          (el as HTMLElement).focus();
          el.dispatchEvent(new Event("input", { bubbles: true }));
          el.dispatchEvent(new Event("change", { bubbles: true }));
          (el as HTMLElement).blur();
          el.dispatchEvent(new Event("blur", { bubbles: true }));
        }
      });
      this.logger.log(
        "[saveDraft] dispatched input/change/blur on filled fields",
      );
    } catch (syncError) {
      this.logger.warn(
        `[saveDraft] field sync failed: ${(syncError as Error).message}`,
      );
    }
    await delay(200);

    // Step 1: Ctrl+S 主路径 —— 绕开所有 click 坐标 / DOM 选择器问题，最接近真人
    try {
      this.logger.log("[saveDraft] Method 1: keyboard Ctrl+S");
      await page.keyboard.down("Control");
      await page.keyboard.press("s");
      await page.keyboard.up("Control");
      saveClicked = true;
    } catch (kbError) {
      this.logger.warn(
        `[saveDraft] Ctrl+S failed: ${(kbError as Error).message}`,
      );
    }
    await delay(500);

    // Step 2: 找真按钮 mouse.click（修正 scroll 坐标 bug）
    //   PR #92 bug: 用了 scrollTo + 陈旧 bbox 坐标，导致 click 点空气。
    //   修：scroll 后 re-fetch bbox，再 mouse.click 用新坐标 + elementFromPoint 验证
    let clickedTargetInfo = "";
    try {
      const candidates: Array<{
        tag: string;
        className: string;
        role: string;
        outerHTML: string;
        pageY: number;
      }> = await page.evaluate(() => {
        const targets: Array<{
          tag: string;
          className: string;
          role: string;
          outerHTML: string;
          pageY: number;
        }> = [];
        const all = Array.from(document.querySelectorAll("*"));
        for (const el of all) {
          if (el.children.length > 0) continue;
          const text = (el.textContent || "").trim();
          if (!/^(保存为草稿|存为草稿|保存草稿)$/.test(text)) continue;
          let clickable: Element = el;
          for (let depth = 0; depth < 5; depth++) {
            const parent = clickable.parentElement;
            if (!parent) break;
            const tag = parent.tagName;
            const role = parent.getAttribute("role") || "";
            const style = window.getComputedStyle(parent);
            if (
              tag === "BUTTON" ||
              tag === "A" ||
              role === "button" ||
              style.cursor === "pointer"
            ) {
              clickable = parent;
              break;
            }
            clickable = parent;
          }
          const rect = clickable.getBoundingClientRect();
          if (rect.width < 5 || rect.height < 5) continue;
          if ((clickable as HTMLElement).offsetParent === null) continue;
          targets.push({
            tag: clickable.tagName,
            className: (clickable as HTMLElement).className?.toString() || "",
            role: clickable.getAttribute("role") || "",
            outerHTML: (clickable as HTMLElement).outerHTML.slice(0, 400),
            pageY: rect.top + window.scrollY,
          });
        }
        return targets;
      });

      this.logger.log(
        `[saveDraft] Found ${candidates.length} "保存为草稿" candidate(s)`,
      );
      for (const c of candidates) {
        this.logger.log(
          `[saveDraft] candidate: tag=${c.tag} class="${c.className}" role="${c.role}" pageY=${c.pageY} outerHTML=${c.outerHTML}`,
        );
      }

      const target = candidates[candidates.length - 1];
      if (target) {
        // 用 scrollIntoView 让浏览器自己处理（避免坐标计算错位）
        const clickResult: {
          freshX: number;
          freshY: number;
          atPoint: string;
          viewport: string;
        } = await page.evaluate((pageY: number) => {
          // 滚到 button 居中
          window.scrollTo({
            top: Math.max(0, pageY - window.innerHeight / 2),
            behavior: "instant" as ScrollBehavior,
          });
          // re-find button & 取 fresh bbox
          const all = Array.from(document.querySelectorAll("*"));
          let btn: Element | null = null;
          for (const el of all) {
            if (el.children.length > 0) continue;
            const text = (el.textContent || "").trim();
            if (!/^(保存为草稿|存为草稿|保存草稿)$/.test(text)) continue;
            let clickable: Element = el;
            for (let depth = 0; depth < 5; depth++) {
              const parent = clickable.parentElement;
              if (!parent) break;
              if (
                parent.tagName === "BUTTON" ||
                parent.tagName === "A" ||
                parent.getAttribute("role") === "button"
              ) {
                clickable = parent;
                break;
              }
              clickable = parent;
            }
            btn = clickable;
          }
          if (!btn) {
            return {
              freshX: -1,
              freshY: -1,
              atPoint: "(no button found after scroll)",
              viewport: `${window.innerWidth}x${window.innerHeight}`,
            };
          }
          const rect = btn.getBoundingClientRect();
          const cx = rect.left + rect.width / 2;
          const cy = rect.top + rect.height / 2;
          const atPoint = document.elementFromPoint(cx, cy);
          return {
            freshX: cx,
            freshY: cy,
            atPoint: atPoint
              ? `${atPoint.tagName}.${(atPoint as HTMLElement).className?.toString().slice(0, 40)}`
              : "(null)",
            viewport: `${window.innerWidth}x${window.innerHeight}`,
          };
        }, target.pageY);

        this.logger.log(
          `[saveDraft] post-scroll: viewport=${clickResult.viewport} freshBbox=(${clickResult.freshX},${clickResult.freshY}) elementFromPoint=${clickResult.atPoint}`,
        );

        if (clickResult.freshX > 0 && clickResult.freshY > 0) {
          clickedTargetInfo = `${target.tag}.${target.className.slice(0, 40)}@fresh(${clickResult.freshX},${clickResult.freshY})`;
          await delay(150);
          await page.mouse.move(clickResult.freshX, clickResult.freshY);
          await delay(50);
          await page.mouse.click(clickResult.freshX, clickResult.freshY, {
            delay: 30,
          });
          saveClicked = true;
          this.logger.log(
            `[saveDraft] Method 2: mouse.click fired at fresh (${clickResult.freshX}, ${clickResult.freshY}) on ${clickedTargetInfo}`,
          );
        }
      }
    } catch (mouseError) {
      this.logger.warn(
        `[saveDraft] mouse-click strategy failed: ${(mouseError as Error).message}`,
      );
    }
    await delay(500);

    // Step 3: ElementHandle.click() 作为最后兜底
    try {
      const savePattern = /保存为草稿|保存草稿|存为草稿/;
      const buttons = await page.$$("button");
      for (const btn of buttons) {
        const text = await btn.evaluate(
          (el: Element) => el.textContent?.trim() || "",
        );
        if (savePattern.test(text)) {
          await btn.click();
          saveClicked = true;
          this.logger.log(
            `[saveDraft] Method 3: ElementHandle.click on <button> text="${text}"`,
          );
          break;
        }
      }
    } catch (handleError) {
      this.logger.warn(
        `[saveDraft] ElementHandle.click failed: ${(handleError as Error).message}`,
      );
    }

    if (!saveClicked) {
      const buttons = await page.$$eval("button", (els: Element[]) =>
        els.map((el) => ({
          text: el.textContent?.trim().substring(0, 50),
          class: el.className?.substring(0, 50),
        })),
      );
      this.logger.error(`Available buttons: ${JSON.stringify(buttons)}`);
      throw new Error("找不到保存按钮，微信后台界面可能已更新");
    }

    // 2026-05-16: click 后立即探测 weui-dialog/tooltip —— 微信新版编辑器对
    //   必填校验失败（作者/封面图/标题等）不发任何 network 请求，只弹一个
    //   非阻塞 dialog，旧代码看不到所以表现成"save 静默无响应 30s timeout"。
    //   先 300ms 让 dialog 渲染，然后扫描常见 toast/dialog 容器，把文案打到
    //   log 里，后续根据真实文案精准补必填字段填写。
    await delay(300);
    try {
      const dialogText = await page.evaluate(() => {
        const selectors = [
          ".weui-desktop-dialog__bd",
          ".weui-desktop-dialog__title",
          ".weui-mask",
          ".tooltip__content",
          ".dialog_bd",
          ".js_dialog",
          '[role="alertdialog"]',
          '[role="alert"]',
        ];
        for (const sel of selectors) {
          const nodes = Array.from(document.querySelectorAll(sel));
          for (const node of nodes) {
            const el = node as HTMLElement;
            if (el.offsetParent === null) continue;
            const text = el.innerText?.trim();
            if (text && text.length > 0 && text.length < 500) {
              return `${sel}: ${text}`;
            }
          }
        }
        return null;
      });
      if (dialogText) {
        this.logger.warn(
          `[saveDraft] Dialog detected after click: ${dialogText}`,
        );
      }
    } catch (probeError) {
      this.logger.debug(
        `[saveDraft] Dialog probe failed: ${(probeError as Error).message}`,
      );
    }

    // 等待保存完成 - 使用多种检测方式，并验证结果
    this.logger.log("Waiting for save response...");
    let saveSucceeded = false;
    let saveResponse: Awaited<ReturnType<typeof page.waitForResponse>> | null =
      null;

    try {
      // 监听 API 响应 — 必须精确匹配保存/更新草稿的 API
      // 排除 pre_load_sentence、get_appmsg_ext_info 等预检查请求
      const responsePromise = page.waitForResponse(
        (response: { url: () => string; status: () => number }) => {
          const url = response.url();
          if (response.status() !== 200) return false;

          // 排除已知的非保存请求
          if (
            url.includes("pre_load_sentence") ||
            url.includes("get_appmsg_ext_info") ||
            url.includes("checkoriginal") ||
            url.includes("getappmsgext")
          ) {
            return false;
          }

          // 精确匹配保存草稿的 API（按观察到的 prod 真实 endpoint 持续补全）：
          // 老版：
          //   - operate_appmsg?t=ajax-response&sub=create (新建草稿)
          //   - operate_appmsg?t=ajax-response&sub=update (更新草稿)
          //   - /cgi-bin/draft/add (新版接口)
          //   - /cgi-bin/draft/update (新版接口)
          // 2026-05-15 拓宽（type=77 小绿书 / 微信 API 改版后候选）：
          //   - operate_mass_msg / operate_masssend
          //   - freepublish/submit / freepublish/draft
          //   - save_appmsg / submit_appmsg
          //   - note_save / save_note (小绿书 type=77 可能走 note 路径)
          //   - draft/save / draft/submit (新版 draft API)
          //   实际真路径以 prod log 里 `[saveDraft] Captured URLs (no matcher hit)`
          //   打出来的列表为准，未命中的 endpoint 出现后即时加 case。
          if (url.includes("operate_appmsg")) {
            return (
              url.includes("sub=create") ||
              url.includes("sub=update") ||
              url.includes("sub=submit")
            );
          }
          if (
            url.includes("operate_mass_msg") ||
            url.includes("operate_masssend")
          ) {
            return true;
          }
          if (url.includes("freepublish")) {
            return (
              url.includes("submit") ||
              url.includes("draft") ||
              url.includes("save")
            );
          }
          if (
            url.includes("save_appmsg") ||
            url.includes("submit_appmsg") ||
            url.includes("save_note") ||
            url.includes("note_save")
          ) {
            return true;
          }

          return (
            url.includes("/draft/add") ||
            url.includes("/draft/update") ||
            url.includes("/draft/save") ||
            url.includes("/draft/submit")
          );
        },
        { timeout: 30000 },
      );

      // 等待响应
      saveResponse = await responsePromise;
      this.logger.log(`Got save response from: ${saveResponse.url()}`);

      // 解析响应内容验证是否真的成功
      try {
        const responseBody = await saveResponse.json();
        this.logger.log(`Save response body: ${JSON.stringify(responseBody)}`);

        // 微信 API 通常返回 { base_resp: { ret: 0 } } 表示成功
        if (responseBody.base_resp?.ret === 0 || responseBody.ret === 0) {
          saveSucceeded = true;
          this.logger.log("Save API returned success (ret=0)");
        } else if (responseBody.errcode === 0 || responseBody.errmsg === "ok") {
          saveSucceeded = true;
          this.logger.log("Save API returned success (errcode=0)");
        } else {
          const errMsg =
            responseBody.base_resp?.err_msg ||
            responseBody.errmsg ||
            JSON.stringify(responseBody);
          this.logger.error(`Save API returned error: ${errMsg}`);
          throw new Error(`保存草稿失败: ${errMsg}`);
        }
      } catch (parseError) {
        // 如果无法解析 JSON，尝试其他验证方式
        this.logger.warn(
          `Could not parse save response: ${(parseError as Error).message}`,
        );
      }
    } catch (waitError) {
      this.logger.warn(
        `Save response wait failed: ${(waitError as Error).message}`,
      );
      // 2026-05-15: 把 click 后捕获的 mp.weixin 域 200 URL 全部打 log，
      // 用来反向定位真正的 saveDraft endpoint，下次精准补 matcher。
      if (capturedUrls.length > 0) {
        this.logger.warn(
          `[saveDraft] Captured URLs (no matcher hit, n=${capturedUrls.length}):`,
        );
        capturedUrls.forEach((u, i) => {
          this.logger.warn(`  [${i}] ${u}`);
        });
      } else {
        this.logger.warn(
          "[saveDraft] No mp.weixin.qq.com responses captured during wait — " +
            "button click may have triggered no network request (front-end-only save?)",
        );
      }
      // 2026-05-16: 把所有 POST 请求 body dump 出来 —— 这是 ground truth：
      //   如果 React handler 真发了 POST 但 URL 不匹配 save matcher，body 会
      //   立刻告诉我们真实 endpoint + form 参数结构；如果完全没 POST，则
      //   说明 handler 静默 abort 了（多半是反爬检测）。
      if (capturedPosts.length > 0) {
        this.logger.warn(
          `[saveDraft] Captured POST requests (n=${capturedPosts.length}):`,
        );
        capturedPosts.forEach((p, i) => {
          this.logger.warn(
            `  POST[${i}] ${p.method} ${p.url} body=${p.body || "(empty)"}`,
          );
          // 2026-05-16 PR #99: mplog 内是 WeChat 编辑器自己的内部 trace。
          //   PR #98 实测看到 "this is fail save path + terminal three:
          //   postDataReturnFun" + "the first step: click 保存为草..."
          //   → click 真到了，但 WeChat 本地校验 postDataReturnFun 失败终止。
          //   解码出 msg / description 字段单独打 log 才能看到完整 trace。
          if (/mplog\?action=up/.test(p.url) && p.body) {
            try {
              const params = new URLSearchParams(p.body);
              const logParam = params.get("log");
              if (logParam) {
                const outer = JSON.parse(logParam) as {
                  data?: Array<{ data?: string }>;
                };
                const innerStr = outer?.data?.[0]?.data;
                if (typeof innerStr === "string") {
                  const inner = JSON.parse(innerStr) as {
                    description?: string;
                    msg?: string;
                  };
                  this.logger.warn(
                    `    ↳ mplog description=${inner.description || "(none)"}`,
                  );
                  if (inner.msg) {
                    const msgPreview = String(inner.msg).slice(0, 1500);
                    this.logger.warn(`    ↳ mplog msg=${msgPreview}`);
                  }
                }
              }
            } catch (decodeErr) {
              this.logger.warn(
                `    ↳ mplog decode failed: ${(decodeErr as Error).message}`,
              );
            }
          }
        });
      } else {
        this.logger.warn(
          "[saveDraft] NO POST requests captured — handler did not attempt any save. " +
            "Strong evidence of anti-bot detection silently aborting.",
        );
      }
    }

    // 如果没有通过 API 响应验证，尝试其他方式验证
    if (!saveSucceeded) {
      this.logger.log("Checking save success via alternative methods...");

      // 等待一下让 UI 更新
      await delay(3000);

      // 方法1: 检查是否有成功提示
      try {
        const toast = await page.$(".weui-desktop-toast__content");
        if (toast) {
          const toastText = await toast.evaluate(
            (el: Element) => el.textContent || "",
          );
          this.logger.log(`Found toast message: ${toastText}`);
          if (
            toastText?.includes("成功") ||
            toastText?.includes("success") ||
            toastText?.includes("saved")
          ) {
            saveSucceeded = true;
            this.logger.log("Save confirmed via toast message");
          }
        }
      } catch {
        // 忽略
      }

      // 方法2: 检查 URL 是否包含 aid（草稿ID）
      const currentUrl = page.url();
      if (currentUrl.includes("aid=") && !currentUrl.includes("aid=&")) {
        const aidMatch = currentUrl.match(/aid=(\d+)/);
        if (aidMatch && aidMatch[1] !== "0") {
          saveSucceeded = true;
          this.logger.log(`Save confirmed via URL aid: ${aidMatch[1]}`);
        }
      }

      // 方法3: 检查页面标题或内容是否显示已保存状态
      try {
        const pageTitle = await page.title();
        this.logger.log(`Page title after save: ${pageTitle}`);
      } catch {
        // 忽略
      }
    }

    // 卸载 network 监听（不论成功/失败都要清理，避免后续 page 操作累积 handler）
    page.off(
      "response",
      captureHandler as unknown as Parameters<typeof page.off>[1],
    );

    // 最终验证
    if (!saveSucceeded) {
      // 截图用于调试（capturedUrls 已在 waitError 分支打过 log，这里不重复）
      await this.captureDebugInfo(page, "save_failed");
      throw new Error(
        "草稿保存失败：未能确认保存操作成功完成。请检查微信公众号后台是否正常。",
      );
    }

    // 返回当前页面 URL 作为草稿链接
    const draftUrl = page.url();
    this.logger.log(`Draft saved successfully, URL: ${draftUrl}`);
    return draftUrl;
  }

  /**
   * 群发文章 — 在编辑器中点击"群发"按钮完成实际发布
   *
   * 微信公众号编辑器顶部通常有两个按钮：
   * - "保存为草稿" (Save as draft)
   * - "群发" / "发表" (Mass send / Publish)
   *
   * 点击"群发"后会弹出确认弹窗，需要再次点击确认。
   */
  private async massSend(page: Page): Promise<PublishResult> {
    this.logger.log("Looking for mass send (群发) button...");

    let sendClicked = false;

    // 方法1: 按钮文本匹配 — 微信公众号编辑器群发按钮
    const sendPattern = /^群发$|^发表$|^Send|^Publish/i;
    try {
      const buttons = await page.$$("button");
      for (const btn of buttons) {
        const text = await btn.evaluate(
          (el: Element) => el.textContent?.trim() || "",
        );
        if (sendPattern.test(text)) {
          this.logger.log(`Found send button with text: "${text}"`);
          await btn.click();
          sendClicked = true;
          this.logger.log(`Send button clicked: "${text}"`);
          break;
        }
      }
    } catch (btnError) {
      this.logger.warn(
        `Button text search failed: ${(btnError as Error).message}`,
      );
    }

    // 方法2: CSS 选择器匹配
    if (!sendClicked) {
      const sendSelectors = [
        ".js_send",
        '[class*="send"]',
        ".js_publish",
        '[class*="publish"]',
      ];
      for (const selector of sendSelectors) {
        try {
          const btn = await page.$(selector);
          if (btn) {
            const text = await btn.evaluate(
              (el: Element) => el.textContent?.trim() || "",
            );
            // 排除"保存"相关按钮
            if (/保存|save/i.test(text)) continue;
            await btn.click();
            sendClicked = true;
            this.logger.log(
              `Send button clicked with selector: ${selector}, text: "${text}"`,
            );
            break;
          }
        } catch {
          continue;
        }
      }
    }

    // 方法3: 查找工具栏区域中非"保存"的主要按钮
    if (!sendClicked) {
      try {
        const toolbarButtons = await page.$$(
          ".editor-toolbar button, .appmsg_edit_area button, .tool_bar button, .weui-desktop-btn_primary",
        );
        for (const btn of toolbarButtons) {
          const text = await btn.evaluate(
            (el: Element) => el.textContent?.trim() || "",
          );
          if (
            /群发|发表|Publish|Send/i.test(text) &&
            !/保存|save/i.test(text)
          ) {
            await btn.click();
            sendClicked = true;
            this.logger.log(`Send button clicked from toolbar: "${text}"`);
            break;
          }
        }
      } catch {
        // ignore
      }
    }

    if (!sendClicked) {
      // 记录所有可用按钮，方便调试
      const allButtons = await page
        .$$eval("button", (els: Element[]) =>
          els.map((el) => ({
            text: el.textContent?.trim().substring(0, 60),
            class: el.className?.substring(0, 60),
          })),
        )
        .catch(() => []);
      this.logger.error(
        `No send button found. Available buttons: ${JSON.stringify(allButtons)}`,
      );
      return {
        success: false,
        errorMessage: "找不到群发按钮，微信后台界面可能已更新",
      };
    }

    // 等待确认弹窗出现
    this.logger.log("Waiting for confirmation dialog...");
    await delay(2000);

    // 处理确认弹窗 — 微信群发通常有确认弹窗
    let confirmed = false;
    try {
      // 查找弹窗中的确认按钮
      const confirmPatterns = [
        // weui 弹窗确认按钮
        ".weui-desktop-dialog .weui-desktop-btn_primary",
        ".weui-desktop-dialog__ft .weui-desktop-btn_primary",
        // 通用确认按钮
        '.weui-desktop-dialog button:not([class*="default"])',
        ".dialog-footer .btn-primary",
        ".modal-footer .btn-primary",
      ];

      for (const selector of confirmPatterns) {
        try {
          const confirmBtn = await page.$(selector);
          if (confirmBtn) {
            const text = await confirmBtn.evaluate(
              (el: Element) => el.textContent?.trim() || "",
            );
            this.logger.log(
              `Found confirm button: "${text}" (selector: ${selector})`,
            );
            // 确保是确认按钮，不是取消
            if (/确定|确认|发送|群发|OK|Confirm|Send/i.test(text)) {
              await confirmBtn.click();
              confirmed = true;
              this.logger.log(`Confirmation clicked: "${text}"`);
              break;
            }
          }
        } catch {
          continue;
        }
      }

      // 如果通过选择器没找到，尝试按文本搜索弹窗内按钮
      if (!confirmed) {
        const dialogButtons = await page.$$(
          ".weui-desktop-dialog button, .modal button, [role='dialog'] button",
        );
        for (const btn of dialogButtons) {
          const text = await btn.evaluate(
            (el: Element) => el.textContent?.trim() || "",
          );
          if (/确定|确认|发送|群发|OK|Confirm/i.test(text)) {
            await btn.click();
            confirmed = true;
            this.logger.log(`Confirmation clicked via text search: "${text}"`);
            break;
          }
        }
      }
    } catch (confirmError) {
      this.logger.warn(
        `Confirm dialog handling: ${(confirmError as Error).message}`,
      );
    }

    // 有些情况下没有确认弹窗（如果点击群发直接发送了）
    if (!confirmed) {
      this.logger.log(
        "No confirmation dialog found — send may have been triggered directly",
      );
    }

    // 等待群发 API 响应
    this.logger.log("Waiting for mass send API response...");
    let sendSucceeded = false;
    let externalUrl: string | undefined;

    try {
      const sendResponse = await page.waitForResponse(
        (response: { url: () => string; status: () => number }) => {
          const url = response.url();
          if (response.status() !== 200) return false;
          // 群发 API 匹配：
          // - /cgi-bin/masssend (群发接口)
          // - operate_appmsg?...sub=submit (提交群发)
          // - /cgi-bin/freepublish/submit (发表接口)
          return (
            url.includes("masssend") ||
            url.includes("freepublish") ||
            (url.includes("operate_appmsg") && url.includes("sub=submit"))
          );
        },
        { timeout: 30000 },
      );

      this.logger.log(`Got send response from: ${sendResponse.url()}`);

      try {
        const responseBody = await sendResponse.json();
        this.logger.log(`Send response body: ${JSON.stringify(responseBody)}`);

        if (responseBody.base_resp?.ret === 0 || responseBody.ret === 0) {
          sendSucceeded = true;
          // 尝试提取发布后的文章链接
          externalUrl =
            responseBody.url || responseBody.link || responseBody.article_url;
          this.logger.log("Mass send API returned success (ret=0)");
        } else if (responseBody.errcode === 0 || responseBody.errmsg === "ok") {
          sendSucceeded = true;
          this.logger.log("Mass send API returned success (errcode=0)");
        } else {
          const errMsg =
            responseBody.base_resp?.err_msg ||
            responseBody.errmsg ||
            JSON.stringify(responseBody);
          this.logger.error(`Mass send API returned error: ${errMsg}`);
          return { success: false, errorMessage: errMsg };
        }
      } catch (parseError) {
        this.logger.warn(
          `Could not parse send response: ${(parseError as Error).message}`,
        );
      }
    } catch (waitError) {
      this.logger.warn(`Send response wait: ${(waitError as Error).message}`);
    }

    // 如果没有通过 API 验证，通过 UI 状态判断
    if (!sendSucceeded) {
      await delay(3000);

      // 检查成功提示
      try {
        const toast = await page.$(".weui-desktop-toast__content");
        if (toast) {
          const toastText = await toast.evaluate(
            (el: Element) => el.textContent || "",
          );
          this.logger.log(`Toast after send: "${toastText}"`);
          if (
            toastText.includes("成功") ||
            toastText.includes("已群发") ||
            toastText.includes("已发表")
          ) {
            sendSucceeded = true;
          }
        }
      } catch {
        // ignore
      }

      // 检查是否跳转到了已发表/已群发页面
      const currentUrl = page.url();
      this.logger.log(`URL after send: ${currentUrl}`);
      if (
        currentUrl.includes("appmsg_publish") ||
        currentUrl.includes("masssend") ||
        currentUrl.includes("published")
      ) {
        sendSucceeded = true;
      }

      // 检查是否出现错误弹窗
      try {
        const errorDialog = await page.$(".weui-desktop-dialog__bd");
        if (errorDialog) {
          const errorText = await errorDialog.evaluate(
            (el: Element) => el.textContent?.trim() || "",
          );
          if (
            errorText &&
            !errorText.includes("成功") &&
            errorText.length > 5
          ) {
            this.logger.error(`Error dialog after send: "${errorText}"`);
            await this.captureDebugInfo(page, "mass_send_error_dialog");
            return { success: false, errorMessage: errorText };
          }
        }
      } catch {
        // ignore
      }
    }

    if (!sendSucceeded) {
      await this.captureDebugInfo(page, "mass_send_unverified");
      return {
        success: false,
        errorMessage: "群发操作已执行但未能确认成功，请登录公众号后台检查",
      };
    }

    return {
      success: true,
      externalUrl,
    };
  }
}
