/**
 * HandlebarsRendererService —— FU2 邮件 .hbs 模板渲染
 *
 * 来源：daily-briefing-redesign-2026-05-18.md §8.6 邮件模板需求 + B14 helpers
 *
 * 职责：
 *   - 启动时 import handlebars + 注册 radar 邮件模板需要的 helpers
 *     （eq/gt/length/join/lookup 是 Handlebars 内置；urlEncode/truncate/tierBadge/
 *      detailUrl/evidenceSources/add 来自 B14 设计）
 *   - 提供 render(filename, locale, ctx) → HTML 字符串
 *   - 模板路径：`backend/src/modules/ai-infra/email/templates/<name>.<locale>.hbs`
 *     dev 模式 = 源码；prod 模式 = dist 复制（webpack/tsc 需 include .hbs）
 *
 * 暂时与 ai-engine/tools/template-render.tool.ts 的 helpers 重复实现（B14）：
 *   - tool 是 LLM-facing 工具（runtime 输入任意模板）
 *   - 本 service 是邮件专用（启动加载固定文件）
 *   - 重复合并到下一个 PR（lift helpers 到 ai-engine/abstractions），现在保持局部
 */
import { Injectable, Logger, OnModuleInit } from "@nestjs/common";
import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";

interface HbsCompiled {
  (ctx: Record<string, unknown>): string;
}
interface Hbs {
  compile(src: string, opts?: { noEscape?: boolean }): HbsCompiled;
  registerHelper(name: string, fn: (...args: unknown[]) => unknown): void;
  create(): Hbs;
}

@Injectable()
export class HandlebarsRendererService implements OnModuleInit {
  private readonly log = new Logger(HandlebarsRendererService.name);
  private hbs!: Hbs;
  private readonly cache = new Map<string, HbsCompiled>();
  private readonly templatesDir = join(__dirname, "..", "templates");

  async onModuleInit(): Promise<void> {
    const mod = await import("handlebars");
    // 用 isolated 实例避免污染全局 handlebars helpers
    this.hbs = (mod as unknown as { default: Hbs }).default.create();
    this.registerHelpers();
    this.log.log(
      `HandlebarsRendererService ready, templatesDir=${this.templatesDir}`,
    );
  }

  /**
   * 渲染模板
   * @param name 文件名 stem（如 "radar-daily-briefing"）
   * @param locale 'zh-CN' | 'en-US'（取前缀 zh/en 拼接文件名）
   * @param ctx 上下文变量
   */
  async render(
    name: string,
    locale: "zh-CN" | "en-US",
    ctx: Record<string, unknown>,
  ): Promise<string> {
    const lang = locale === "en-US" ? "en" : "zh";
    const key = `${name}.${lang}`;
    let compiled = this.cache.get(key);
    if (!compiled) {
      const filePath = join(this.templatesDir, `${key}.hbs`);
      if (!existsSync(filePath)) {
        // 回退：缺中文用英文，缺英文报错
        const fallbackLang = lang === "zh" ? "en" : null;
        if (fallbackLang) {
          const fallback = join(
            this.templatesDir,
            `${name}.${fallbackLang}.hbs`,
          );
          if (existsSync(fallback)) {
            const src = await readFile(fallback, "utf8");
            compiled = this.hbs.compile(src, { noEscape: false });
            this.cache.set(key, compiled);
            this.log.warn(
              `template ${key} missing, fallback to ${name}.${fallbackLang}`,
            );
          }
        }
        if (!compiled) {
          throw new Error(`email template not found: ${filePath}`);
        }
      } else {
        const src = await readFile(filePath, "utf8");
        compiled = this.hbs.compile(src, { noEscape: false });
        this.cache.set(key, compiled);
      }
    }
    return compiled(ctx);
  }

  private registerHelpers(): void {
    const hbs = this.hbs;

    // length: 数组 / 字符串长度
    hbs.registerHelper("length", (v: unknown) =>
      Array.isArray(v) || typeof v === "string" ? v.length : 0,
    );

    // eq / gt: 比较
    hbs.registerHelper("eq", (a: unknown, b: unknown) => a === b);
    hbs.registerHelper("gt", (a: unknown, b: unknown) =>
      typeof a === "number" && typeof b === "number" ? a > b : false,
    );

    // join: 数组 → 分隔字符串
    hbs.registerHelper("join", (arr: unknown, sep: unknown) => {
      if (!Array.isArray(arr)) return "";
      return arr.join(typeof sep === "string" ? sep : ", ");
    });

    // add: 整型加（模板算术用）
    hbs.registerHelper("add", (a: unknown, b: unknown) => {
      const na = typeof a === "number" ? a : Number(a) || 0;
      const nb = typeof b === "number" ? b : Number(b) || 0;
      return na + nb;
    });

    // B14: urlEncode — RFC 3986 + strip CRLF/Tab（SMTP header injection 防御）
    hbs.registerHelper("urlEncode", (v: unknown) => {
      if (typeof v !== "string") return "";
      return encodeURIComponent(v).replace(/[\r\n\t]/g, "");
    });

    // B14: truncate — codepoint aware（避免 emoji 截断）
    hbs.registerHelper("truncate", (s: unknown, n: unknown) => {
      if (typeof s !== "string") return "";
      const max = typeof n === "number" ? n : Number(n) || 80;
      const arr = Array.from(s);
      return arr.length > max ? arr.slice(0, max).join("") + "…" : s;
    });

    // B14: tierBadge — 1/2/3 → ⭐ string
    hbs.registerHelper("tierBadge", (tier: unknown) => {
      if (tier === 3) return "⭐⭐⭐";
      if (tier === 2) return "⭐⭐";
      if (tier === 1) return "⭐";
      return "⭐";
    });

    // B14: detailUrl — signalId → FRONTEND_URL/signal detail
    hbs.registerHelper(
      "detailUrl",
      (signalId: unknown, topicId: unknown, baseUrl: unknown) => {
        if (typeof signalId !== "string" || typeof topicId !== "string")
          return "";
        const base =
          typeof baseUrl === "string" ? baseUrl : "https://app.example.com";
        return `${base}/ai-radar/topic/${topicId}/signal/${signalId}`;
      },
    );

    // B14: evidenceSources — array of {name} → "A / B / C"（name-only no raw HTML）
    hbs.registerHelper("evidenceSources", (sources: unknown) => {
      if (!Array.isArray(sources)) return "";
      return sources
        .map((s) =>
          typeof s === "object" &&
          s &&
          "name" in s &&
          typeof (s as { name: unknown }).name === "string"
            ? (s as { name: string }).name
            : "",
        )
        .filter(Boolean)
        .join(" / ");
    });
  }
}
