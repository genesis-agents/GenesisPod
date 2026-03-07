/**
 * 微信公众号群发服务
 *
 * 实现完整的发布流程：编辑 -> 保存草稿 -> 群发
 */

import { Injectable, Logger } from "@nestjs/common";
import {
  tryClick,
  tryFill,
  humanDelay,
  trySelectors,
} from "../../config/selectors.config";
import {
  SessionData,
  PublishResult,
  PublishMode,
} from "../../types/platform.types";
import { SocialContent } from "../../types";

import type { Page } from "puppeteer";

// 微信公众号选择器配置
const WECHAT_SELECTORS = {
  // 登录状态检测
  loginIndicators: [
    ".weui-desktop-account__nickname",
    ".weui-desktop-account__info",
    ".menu_item.selected",
    "#menuBar",
    ".main_bd",
  ],
  loginForm: ".login__type__qrcode",

  // 导航
  newCreation: {
    photo: [
      '.new-creation__menu-content:has-text("Photo")',
      '.new-creation__menu-content:has-text("图文")',
      '.new-creation__menu-content:has-text("Article")',
    ],
  },

  // 编辑器
  editor: {
    title: [
      '[placeholder*="Enter title here"]',
      '[placeholder*="title"]',
      '[placeholder*="标题"]',
      "#title",
      ".js_title",
    ],
    content: [
      ".ProseMirror",
      "#js_editor",
      ".editor-content",
      '[contenteditable="true"]',
    ],
    digest: ["#js_description", "#digest", 'textarea[name="digest"]'],
  },

  // 保存和发布按钮
  buttons: {
    saveDraft: [
      'button:has-text("Save as draft")',
      'button:has-text("保存为草稿")',
      'button:has-text("保存")',
      ".js_save",
    ],
    massPublish: [
      'button:has-text("群发")',
      'button:has-text("Mass Send")',
      ".js_send_btn",
      '[class*="send-btn"]',
    ],
    confirmSend: [
      'button:has-text("确定")',
      'button:has-text("Confirm")',
      ".weui-desktop-btn_primary",
    ],
  },

  // 草稿管理
  drafts: {
    list: ".draft-item",
    selectFirst: ".draft-item:first-child",
    checkbox: 'input[type="checkbox"]',
  },

  // Toast/提示消息
  toast: ".weui-desktop-toast__content",
};

export interface MassPublishOptions {
  mode: PublishMode;
  scheduledAt?: Date; // For future scheduled publishing support
  targetGroups?: string[];
}

@Injectable()
export class WechatPublisherService {
  private readonly logger = new Logger(WechatPublisherService.name);
  private readonly MP_URL = "https://mp.weixin.qq.com";

  /**
   * 完整发布流程：编辑 -> 保存草稿 -> 群发
   */
  async publishWithMassSend(
    page: Page,
    content: SocialContent,
    sessionData: SessionData,
    options: MassPublishOptions,
  ): Promise<PublishResult> {
    try {
      // Step 1: 验证登录状态
      const isLoggedIn = await this.checkLoginStatus(page);
      if (!isLoggedIn) {
        return {
          success: false,
          type: "draft",
          errorMessage: "微信公众号登录已过期，请重新扫码登录",
        };
      }

      // Step 2: 获取 token
      const token = await this.extractToken(page, sessionData);
      if (!token) {
        return {
          success: false,
          type: "draft",
          errorMessage: "无法获取微信公众号 token，请重新连接",
        };
      }

      // Step 3: 进入编辑器
      const editorPage = await this.navigateToEditor(page, token);
      if (!editorPage) {
        return {
          success: false,
          type: "draft",
          errorMessage: "无法打开文章编辑器",
        };
      }

      // Step 4: 填写内容
      await this.fillContent(editorPage, content);

      // Step 5: 保存草稿并获取草稿 ID
      const draftResult = await this.saveDraft(editorPage);
      if (!draftResult.success) {
        return {
          success: false,
          type: "draft",
          errorMessage: draftResult.error || "保存草稿失败",
        };
      }

      this.logger.log(`Draft saved: ${draftResult.draftId}`);

      // Step 6: 根据模式决定是否群发
      if (options.mode === "draft") {
        return {
          success: true,
          type: "draft",
          externalId: draftResult.draftId,
          externalUrl: draftResult.draftUrl,
        };
      }

      // Step 7: 执行群发
      await humanDelay(1000, 2000);
      const massResult = await this.executeMassSend(
        editorPage,
        draftResult.draftId!,
        token,
        options,
      );

      if (!massResult.success) {
        return {
          success: false,
          type: "published",
          errorMessage: massResult.error || "群发失败",
          externalId: draftResult.draftId,
        };
      }

      return {
        success: true,
        type: "published",
        externalId: massResult.msgId,
        externalUrl: massResult.articleUrl,
      };
    } catch (error) {
      const err = error as Error;
      this.logger.error(`Publish failed: ${err.message}`, err.stack);
      return {
        success: false,
        type: "draft",
        errorMessage: `发布失败: ${err.message}`,
      };
    }
  }

  /**
   * 检查登录状态
   */
  private async checkLoginStatus(page: Page): Promise<boolean> {
    try {
      await page
        .waitForNetworkIdle({ idleTime: 500, timeout: 10000 })
        .catch((err: Error) => {
          this.logger.debug(
            `waitForNetworkIdle timed out (non-critical): ${err.message}`,
          );
        });

      const url = page.url();
      if (url.includes("/cgi-bin/bizlogin") || url.includes("action=login")) {
        return false;
      }

      if (url.includes("/cgi-bin/home") || url.includes("/cgi-bin/frame")) {
        return true;
      }

      // 检查登录后的元素
      for (const selector of WECHAT_SELECTORS.loginIndicators) {
        const element = await page.$(selector);
        if (element) {
          return true;
        }
      }

      // 检查是否有登录表单
      const loginForm = await page.$(WECHAT_SELECTORS.loginForm);
      if (loginForm) {
        return false;
      }

      return false;
    } catch (error) {
      this.logger.error(`Login check failed: ${(error as Error).message}`);
      return false;
    }
  }

  /**
   * 提取 token
   */
  private async extractToken(
    page: Page,
    sessionData: SessionData,
  ): Promise<string | null> {
    // 优先使用保存的 token
    if (sessionData.wechatToken) {
      return sessionData.wechatToken;
    }

    // 从 URL 提取
    const url = page.url();
    const tokenMatch = url.match(/token=(\d+)/);
    if (tokenMatch) {
      return tokenMatch[1];
    }

    // 从页面 JS 提取
    try {
      const pageToken = await page.evaluate(() => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- browser window interop
        const w = window as any;
        return w.wx?.commonData?.t || w.cgiData?.t || "";
      });
      if (pageToken) {
        return pageToken;
      }
    } catch {
      // 忽略
    }

    // 从页面链接提取
    try {
      const links = await page.evaluate(() => {
        const anchors = Array.from(document.querySelectorAll("a[href]"));
        return anchors
          .map((a) => a.getAttribute("href"))
          .filter((href) => href && href.includes("token="))
          .slice(0, 5);
      });
      for (const link of links) {
        const match = link?.match(/token=(\d+)/);
        if (match) {
          return match[1];
        }
      }
    } catch {
      // 忽略
    }

    return null;
  }

  /**
   * 导航到编辑器
   */
  private async navigateToEditor(
    page: Page,
    token: string,
  ): Promise<Page | null> {
    // 尝试点击 Photo/图文 按钮
    for (const selector of WECHAT_SELECTORS.newCreation.photo) {
      try {
        const menuContent = await page.$(selector);
        if (menuContent) {
          const newPagePromise = new Promise<Page | null>((resolve) => {
            const timer = setTimeout(() => resolve(null), 15000);
            page.browser().once("targetcreated", async (target) => {
              clearTimeout(timer);
              const p = await target.page();
              resolve(p);
            });
          });
          await menuContent.click();
          const newPage = await newPagePromise;
          if (newPage) {
            await newPage.waitForNetworkIdle({
              idleTime: 500,
              timeout: 30000,
            });
            return newPage;
          }
        }
      } catch {
        continue;
      }
    }

    // 直接导航到编辑器
    const editorUrl = `${this.MP_URL}/cgi-bin/appmsg?t=media/appmsg_edit_v2&action=edit&isNew=1&type=77&createType=8&token=${token}`;
    await page.goto(editorUrl, { waitUntil: "networkidle0", timeout: 30000 });
    return page;
  }

  /**
   * 填写内容
   */
  private async fillContent(page: Page, content: SocialContent): Promise<void> {
    await page.waitForNetworkIdle({ idleTime: 500 }).catch(() => {
      this.logger.debug("waitForNetworkIdle timed out, continuing...");
    });
    await humanDelay(1000, 2000);

    // 填写标题
    if (content.title) {
      const titleFilled = await tryFill(
        page,
        WECHAT_SELECTORS.editor.title,
        content.title,
      );
      if (!titleFilled) {
        // 使用 evaluateHandle 查找标题 textbox 作为后备
        try {
          const handle = await page.evaluateHandle(() => {
            const re = /Input a title here|请在这里输入标题|标题/i;
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
          });
          const el = handle.asElement();
          if (el) {
            await (el as import("puppeteer").ElementHandle<Element>).click({
              clickCount: 3,
            });
            await page.keyboard.type(content.title);
          } else {
            throw new Error("找不到标题输入框");
          }
        } catch {
          throw new Error("找不到标题输入框");
        }
      }
    }

    // 填写正文
    if (content.content) {
      const editorResult = await trySelectors(
        page,
        WECHAT_SELECTORS.editor.content,
      );
      if (editorResult.success && editorResult.element) {
        const editorElement = editorResult.element as {
          click: () => Promise<void>;
        };
        await editorElement.click();

        // 将文本转换为 HTML 段落
        const htmlContent = content.content
          .split("\n")
          .filter((line) => line.trim())
          .map((line) => `<p>${line}</p>`)
          .join("");

        // 使用多种方式填充内容
        const filled = await page.evaluate(
          ({ html }: { html: string }) => {
            const editor = document.querySelector(
              ".ProseMirror",
            ) as HTMLElement;
            if (!editor) return false;

            editor.focus();
            const selection = window.getSelection();
            if (selection) {
              selection.selectAllChildren(editor);
              selection.deleteFromDocument();
            }

            const success = document.execCommand("insertHTML", false, html);
            if (success) {
              editor.dispatchEvent(new Event("input", { bubbles: true }));
              return true;
            }

            editor.innerHTML = html;
            editor.dispatchEvent(new Event("input", { bubbles: true }));
            return true;
          },
          { html: htmlContent },
        );

        if (!filled) {
          // 键盘输入作为后备
          await page.keyboard.down("Control");
          await page.keyboard.press("a");
          await page.keyboard.up("Control");
          await page.keyboard.press("Backspace");
          const lines = content.content.split("\n").filter((l) => l.trim());
          for (let i = 0; i < lines.length; i++) {
            await page.keyboard.type(lines[i], { delay: 0 });
            if (i < lines.length - 1) {
              await page.keyboard.press("Enter");
            }
          }
        }
      }
    }

    // 填写摘要（可选）
    if (content.digest) {
      await tryFill(page, WECHAT_SELECTORS.editor.digest, content.digest);
    }

    await humanDelay(500, 1000);
  }

  /**
   * 保存草稿
   */
  private async saveDraft(page: Page): Promise<{
    success: boolean;
    draftId?: string;
    draftUrl?: string;
    error?: string;
  }> {
    // 点击保存按钮
    const clicked = await tryClick(page, WECHAT_SELECTORS.buttons.saveDraft);
    if (!clicked) {
      // 查找按钮并匹配文本作为后备
      try {
        const buttons = await page.$$("button");
        let found = false;
        for (const btn of buttons) {
          const text = await btn.evaluate(
            (el: Element) => el.textContent?.trim() || "",
          );
          if (/Save as draft|保存为草稿|保存/i.test(text)) {
            await btn.click();
            found = true;
            break;
          }
        }
        if (!found) {
          return { success: false, error: "找不到保存按钮" };
        }
      } catch {
        return { success: false, error: "找不到保存按钮" };
      }
    }

    // 等待 API 响应
    try {
      const response = await page.waitForResponse(
        (res: { url: () => string; status: () => number }) => {
          const url = res.url();
          return (
            (url.includes("operate_appmsg") || url.includes("draft")) &&
            res.status() === 200
          );
        },
        { timeout: 30000 },
      );

      const responseBody = await response.json().catch(() => ({}));

      if (responseBody.base_resp?.ret === 0 || responseBody.ret === 0) {
        const draftId = responseBody.appMsgId || responseBody.aid;
        return {
          success: true,
          draftId: draftId?.toString(),
          draftUrl: page.url(),
        };
      } else {
        const errMsg =
          responseBody.base_resp?.err_msg ||
          responseBody.errmsg ||
          "Unknown error";
        return { success: false, error: errMsg };
      }
    } catch (error) {
      // 检查 URL 中的 aid
      await humanDelay(2000, 3000);
      const url = page.url();
      const aidMatch = url.match(/aid=(\d+)/);
      if (aidMatch && aidMatch[1] !== "0") {
        return {
          success: true,
          draftId: aidMatch[1],
          draftUrl: url,
        };
      }

      return { success: false, error: (error as Error).message };
    }
  }

  /**
   * 执行群发
   */
  private async executeMassSend(
    page: Page,
    draftId: string,
    token: string,
    options: MassPublishOptions,
  ): Promise<{
    success: boolean;
    msgId?: string;
    articleUrl?: string;
    error?: string;
  }> {
    this.logger.log(`Starting mass send for draft: ${draftId}`);

    // 方式1: 从编辑器页面直接群发
    const massSendClicked = await tryClick(
      page,
      WECHAT_SELECTORS.buttons.massPublish,
    );

    if (!massSendClicked) {
      // 方式2: 导航到草稿管理页面
      const draftManageUrl = `${this.MP_URL}/cgi-bin/appmsg?t=media/appmsg_list&type=10&action=list_card&token=${token}`;
      await page.goto(draftManageUrl, {
        waitUntil: "networkidle0",
        timeout: 30000,
      });

      // 选择对应的草稿
      const draftSelector = `[data-id="${draftId}"], [data-aid="${draftId}"]`;
      const draftItem = await page.$(draftSelector);
      if (draftItem) {
        const checkbox = await draftItem.$('input[type="checkbox"]');
        if (checkbox) {
          await checkbox.click();
        }
      }

      // 点击群发按钮
      await tryClick(page, WECHAT_SELECTORS.buttons.massPublish);
    }

    await humanDelay(500, 1000);

    // 处理定时发布（如果有 scheduledAt 则使用定时发布）
    if (options.scheduledAt) {
      // 查找定时发布选项
      // Find "定时群发" text element via evaluate
      const scheduleOption = await page
        .evaluateHandle(() => {
          const els = Array.from(document.querySelectorAll("span, div"));
          return (
            els.find((el) => el.textContent?.trim() === "定时群发") || null
          );
        })
        .then(
          (h) =>
            h.asElement() as import("puppeteer").ElementHandle<Element> | null,
        );
      if (scheduleOption) {
        await scheduleOption.click();

        // 设置时间（需要根据实际 UI 实现）
        const dateStr = options.scheduledAt.toISOString().split("T")[0];
        const timeStr = options.scheduledAt.toTimeString().slice(0, 5);

        const dateInput = await page.$(
          'input[type="date"], .date-picker input',
        );
        if (dateInput) {
          await dateInput.click({ clickCount: 3 });
          await page.keyboard.type(dateStr);
        }

        const timeInput = await page.$(
          'input[type="time"], .time-picker input',
        );
        if (timeInput) {
          await timeInput.click({ clickCount: 3 });
          await page.keyboard.type(timeStr);
        }
      }
    }

    // 确认群发
    const confirmed = await tryClick(
      page,
      WECHAT_SELECTORS.buttons.confirmSend,
    );
    if (!confirmed) {
      return { success: false, error: "无法确认群发" };
    }

    // 等待群发结果
    try {
      const response = await page.waitForResponse(
        (res: { url: () => string; status: () => number }) => {
          const url = res.url();
          return (
            (url.includes("masssend") ||
              url.includes("mass") ||
              url.includes("send")) &&
            res.status() === 200
          );
        },
        { timeout: 60000 },
      );

      const responseBody = await response.json().catch(() => ({}));

      if (responseBody.base_resp?.ret === 0 || responseBody.ret === 0) {
        const msgId = responseBody.msg_id || responseBody.msgid;
        // 文章 URL 通常在群发成功后才能获取
        const articleUrl =
          responseBody.article_url || `${this.MP_URL}/s/${msgId}`;

        this.logger.log(`Mass send successful: msgId=${msgId}`);
        return {
          success: true,
          msgId: msgId?.toString(),
          articleUrl,
        };
      } else {
        const errMsg =
          responseBody.base_resp?.err_msg || responseBody.errmsg || "群发失败";
        return { success: false, error: errMsg };
      }
    } catch (error) {
      // 检查页面上是否有成功提示
      const toast = await page.$(WECHAT_SELECTORS.toast);
      if (toast) {
        const toastText = await toast.evaluate(
          (el: Element) => el.textContent || "",
        );
        if (toastText?.includes("成功") || toastText?.includes("success")) {
          return { success: true };
        }
      }

      return { success: false, error: (error as Error).message };
    }
  }
}
