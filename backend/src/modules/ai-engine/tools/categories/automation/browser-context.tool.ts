/**
 * Browser Context Tool
 *
 * 统一 puppeteer 原子操作入口，对齐 ITool 形态供所有平台 PublishExecutor 共用。
 *
 * 设计要点：
 * - 通过 contextId 从 BrowserService 拿同一个 Page，不持有 Page 状态
 * - 只暴露 generic primitives；平台特定 page.evaluate(业务 fetch) 由 adapter 自行处理
 * - sideEffect='idempotent'：调用方可重入（无平台直发 op）
 */

import { Injectable } from "@nestjs/common";
import type { Page, BrowserContext } from "puppeteer";
import { BrowserService } from "@/common/browser/browser.service";
import { BaseTool } from "../../base/base-tool";
import {
  ToolContext,
  JSONSchema,
  ToolCategory,
} from "../../abstractions/tool.interface";

export type BrowserOp =
  | "openPage"
  | "goto"
  | "click"
  | "type"
  | "press"
  | "waitForSelector"
  | "waitForFunction"
  | "getCookies"
  | "setCookies"
  | "screenshot"
  | "evaluate"
  | "closePage";

export interface BrowserCookie {
  name: string;
  value: string;
  domain?: string;
  path?: string;
  expires?: number;
  httpOnly?: boolean;
  secure?: boolean;
  sameSite?: "Strict" | "Lax" | "None";
}

export interface BrowserContextInput {
  /** 浏览器 context 标识，跨 op 复用同一个 Page */
  contextId: string;

  /** 原子操作类型 */
  op: BrowserOp;

  /** goto: 目标 URL */
  url?: string;

  /** click / type / press / waitForSelector: 选择器 */
  selector?: string;

  /** type: 文本 */
  text?: string;

  /** press: 按键名（如 'Enter'） */
  key?: string;

  /**
   * evaluate / waitForFunction: 表达式或函数源码字符串
   *
   * 注意：puppeteer page.evaluate(string) 接受表达式；如需复杂函数请传序列化后的 IIFE。
   */
  fnSource?: string;

  /** evaluate: 序列化参数（必须 JSON-safe） */
  args?: ReadonlyArray<unknown>;

  /** setCookies: cookie 数组 */
  cookies?: ReadonlyArray<BrowserCookie>;

  /** 等待超时（ms），默认 30000 */
  timeout?: number;

  /** goto.waitUntil */
  waitUntil?: "load" | "domcontentloaded" | "networkidle0" | "networkidle2";

  /** screenshot 选项 */
  screenshotOpts?: {
    type?: "png" | "jpeg";
    fullPage?: boolean;
    quality?: number;
  };
}

export interface BrowserContextOutput {
  op: BrowserOp;
  contextId: string;

  /** evaluate / waitForFunction 返回值（JSON-safe） */
  result?: unknown;

  /** getCookies 返回值 */
  cookies?: ReadonlyArray<BrowserCookie>;

  /** screenshot 返回 base64 字符串 */
  screenshotBase64?: string;

  /** goto / 当前 URL */
  url?: string;
}

@Injectable()
export class BrowserContextTool extends BaseTool<
  BrowserContextInput,
  BrowserContextOutput
> {
  readonly id = "browser-context";
  readonly sideEffect = "idempotent" as const;
  readonly category: ToolCategory = "automation";
  readonly tags = ["automation", "browser", "puppeteer", "social"];
  readonly name = "浏览器上下文操作";
  readonly description =
    "puppeteer 原子操作统一入口：导航/点击/输入/等待/cookies/截图/执行表达式。所有平台 PublishExecutor 共用此 tool。";
  readonly defaultTimeout: number = 60_000;

  readonly inputSchema: JSONSchema = {
    type: "object",
    required: ["contextId", "op"],
    properties: {
      contextId: { type: "string", description: "浏览器 context 标识" },
      op: {
        type: "string",
        enum: [
          "openPage",
          "goto",
          "click",
          "type",
          "press",
          "waitForSelector",
          "waitForFunction",
          "getCookies",
          "setCookies",
          "screenshot",
          "evaluate",
          "closePage",
        ],
        description: "原子操作类型",
      },
      url: { type: "string" },
      selector: { type: "string" },
      text: { type: "string" },
      key: { type: "string" },
      fnSource: { type: "string" },
      args: { type: "array" },
      cookies: { type: "array" },
      timeout: { type: "number" },
      waitUntil: {
        type: "string",
        enum: ["load", "domcontentloaded", "networkidle0", "networkidle2"],
      },
      screenshotOpts: { type: "object" },
    },
  };

  readonly outputSchema: JSONSchema = {
    type: "object",
    properties: {
      op: { type: "string" },
      contextId: { type: "string" },
      result: {},
      cookies: { type: "array" },
      screenshotBase64: { type: "string" },
      url: { type: "string" },
    },
  };

  constructor(private readonly browserService: BrowserService) {
    super();
  }

  validateInput(input: BrowserContextInput): boolean {
    if (!input?.contextId || !input?.op) return false;
    switch (input.op) {
      case "goto":
        return typeof input.url === "string" && input.url.length > 0;
      case "click":
      case "waitForSelector":
        return typeof input.selector === "string" && input.selector.length > 0;
      case "type":
        return (
          typeof input.selector === "string" && typeof input.text === "string"
        );
      case "press":
        return typeof input.key === "string" && input.key.length > 0;
      case "evaluate":
      case "waitForFunction":
        return typeof input.fnSource === "string" && input.fnSource.length > 0;
      case "setCookies":
        return Array.isArray(input.cookies) && input.cookies.length > 0;
      default:
        return true;
    }
  }

  protected async doExecute(
    input: BrowserContextInput,
    _ctx: ToolContext,
  ): Promise<BrowserContextOutput> {
    const { contextId, op } = input;

    if (op === "openPage") {
      const page = await this.browserService.createPage(contextId);
      return { op, contextId, url: page.url() };
    }

    if (op === "closePage") {
      await this.browserService.closeContext(contextId);
      return { op, contextId };
    }

    const page = await this.requirePage(contextId);

    switch (op) {
      case "goto": {
        const response = await page.goto(input.url!, {
          waitUntil: input.waitUntil ?? "load",
          timeout: input.timeout ?? this.defaultTimeout,
        });
        return {
          op,
          contextId,
          url: response?.url() ?? page.url(),
        };
      }

      case "click": {
        await page.click(input.selector!);
        return { op, contextId };
      }

      case "type": {
        await page.type(input.selector!, input.text!);
        return { op, contextId };
      }

      case "press": {
        await page.keyboard.press(
          input.key as Parameters<Page["keyboard"]["press"]>[0],
        );
        return { op, contextId };
      }

      case "waitForSelector": {
        await page.waitForSelector(input.selector!, {
          timeout: input.timeout ?? this.defaultTimeout,
        });
        return { op, contextId };
      }

      case "waitForFunction": {
        const handle = await page.waitForFunction(input.fnSource!, {
          timeout: input.timeout ?? this.defaultTimeout,
        });
        const result = await handle.jsonValue();
        return { op, contextId, result };
      }

      case "getCookies": {
        const ctx = await this.requireContext(contextId);
        const cookies = await ctx.cookies();
        return { op, contextId, cookies: cookies as BrowserCookie[] };
      }

      case "setCookies": {
        const ctx = await this.requireContext(contextId);
        await ctx.setCookie(
          ...(input.cookies! as Parameters<BrowserContext["setCookie"]>),
        );
        return { op, contextId };
      }

      case "screenshot": {
        const buf = await page.screenshot({
          type: input.screenshotOpts?.type ?? "png",
          fullPage: input.screenshotOpts?.fullPage ?? false,
          ...(input.screenshotOpts?.quality !== undefined
            ? { quality: input.screenshotOpts.quality }
            : {}),
        });
        return {
          op,
          contextId,
          screenshotBase64: Buffer.from(buf).toString("base64"),
        };
      }

      case "evaluate": {
        const result = await page.evaluate(
          input.fnSource!,
          ...(input.args ?? []),
        );
        return { op, contextId, result };
      }

      default:
        throw new Error(`Unsupported BrowserContext op: ${op as string}`);
    }
  }

  private async requirePage(contextId: string): Promise<Page> {
    const ctx = await this.browserService.getContext(contextId);
    if (!ctx) {
      throw new Error(`Browser context not found: ${contextId}`);
    }
    const pages = await ctx.pages();
    const page = pages[0];
    if (!page) {
      throw new Error(`No page in browser context: ${contextId}`);
    }
    return page;
  }

  private async requireContext(contextId: string): Promise<BrowserContext> {
    const ctx = await this.browserService.getContext(contextId);
    if (!ctx) {
      throw new Error(`Browser context not found: ${contextId}`);
    }
    return ctx;
  }
}
