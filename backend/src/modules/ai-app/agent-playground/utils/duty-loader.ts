/**
 * Duty Loader —— Agent 灵魂 (soul.md) + 职责说明书 (duties/*.md) 加载器
 *
 * 设计原则：
 *   • Agent class 持有 schema + loop 等工程契约
 *   • soul.md 持有"该 agent 是谁 / 价值观 / 风格 / 红线"，每个 phase 都注入
 *   • duty markdown 持有"该 agent 在某个 phase / mode 下做什么"
 *   • buildPromptFromDuty 自动 prefix soul.md + 拼 duty 一起渲染
 *
 * 文件位置规约：
 *   agents/<agent-dir>/soul.md                    （可选）
 *   agents/<agent-dir>/duties/<duty-name>.md      （必须）
 *
 * 模板语法：
 *   {{var}}                    简单变量替换
 *   {{a.b.c}}                  嵌套字段（点访问）
 *   {{#if condition}}...{{/if}} 条件块（值非空 / 非 false / 非 0 / 非空数组）
 *   {{#each array}}...{{/each}} 循环（{{this}} 当前项，{{@index}} 索引；
 *                                若 array 是对象数组用 {{field}} 直接引）
 *
 * 不依赖 handlebars / mustache —— 这是最小子集，避免引入第三方包。
 */

import * as fs from "fs";
import * as path from "path";

const dutyCache = new Map<string, string>();
const soulCache = new Map<string, string | null>();

/**
 * 加载 agent 子目录下的 duty markdown。
 *
 * 例：loadDuty("leader", "plan") → agents/leader/duties/plan.md
 *
 * 缓存到内存，运行时无 I/O 开销。
 */
export function loadDuty(agentDir: string, dutyName: string): string {
  const key = `${agentDir}:${dutyName}`;
  const cached = dutyCache.get(key);
  if (cached !== undefined) return cached;
  const filePath = path.resolve(
    __dirname,
    "..",
    "agents",
    agentDir,
    "duties",
    `${dutyName}.md`,
  );
  if (!fs.existsSync(filePath)) {
    throw new Error(
      `Duty file not found: ${filePath} (agent=${agentDir}, duty=${dutyName})`,
    );
  }
  const content = fs.readFileSync(filePath, "utf8");
  dutyCache.set(key, content);
  return content;
}

/**
 * 加载某 agent 的 soul.md（可选 —— 不存在返回 null）。
 * Soul 描述 agent 的身份 / 价值观 / 风格 / 红线，每个 phase 都自动 prefix。
 */
export function loadSoul(agentDir: string): string | null {
  if (soulCache.has(agentDir)) return soulCache.get(agentDir)!;
  const filePath = path.resolve(__dirname, "..", "agents", agentDir, "soul.md");
  if (!fs.existsSync(filePath)) {
    soulCache.set(agentDir, null);
    return null;
  }
  const content = fs.readFileSync(filePath, "utf8");
  soulCache.set(agentDir, content);
  return content;
}

/** 测试用：清缓存 */
export function clearDutyCache(): void {
  dutyCache.clear();
  soulCache.clear();
}

// ───────────────────────────────────────────────────────────────────
// 模板渲染
// ───────────────────────────────────────────────────────────────────

/**
 * 渲染 duty markdown 模板，替换变量 + 处理 if / each。
 *
 * 顺序：
 *   1. {{#each}}...{{/each}} 先处理（避免 each 内部的 var 被外层先消费）
 *   2. {{#if}}...{{/if}}     再处理
 *   3. {{var}}              最后简单替换
 */
export function renderDuty(
  template: string,
  vars: Record<string, unknown>,
): string {
  let out = expandEach(template, vars);
  out = expandIf(out, vars);
  out = expandVars(out, vars);
  return out;
}

// ── 简单变量 / 点访问 ──
function getNested(vars: Record<string, unknown>, key: string): unknown {
  return key
    .trim()
    .split(".")
    .reduce<unknown>(
      (acc, k) =>
        acc != null && typeof acc === "object"
          ? (acc as Record<string, unknown>)[k]
          : undefined,
      vars,
    );
}

function expandVars(input: string, vars: Record<string, unknown>): string {
  return input.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (m, key: string) => {
    if (key === "this" || key === "@index") return m; // 留给 each 上下文
    const v = getNested(vars, key);
    if (v == null) return "";
    if (typeof v === "string") return v;
    if (typeof v === "number" || typeof v === "boolean") return String(v);
    return JSON.stringify(v);
  });
}

// ── {{#if}}...{{/if}} ──
function isTruthy(v: unknown): boolean {
  if (v == null) return false;
  if (typeof v === "boolean") return v;
  if (typeof v === "number") return v !== 0;
  if (typeof v === "string") return v.length > 0;
  if (Array.isArray(v)) return v.length > 0;
  if (typeof v === "object") return Object.keys(v).length > 0;
  return Boolean(v);
}

function expandIf(input: string, vars: Record<string, unknown>): string {
  // 非贪婪匹配，支持嵌套需要多次 pass
  const re = /\{\{#if\s+([\w.]+)\s*\}\}([\s\S]*?)\{\{\/if\}\}/g;
  let prev = "";
  let cur = input;
  // 多次 pass 处理嵌套（最多 8 层防死循环）
  let i = 0;
  for (; i < 8 && prev !== cur; i++) {
    prev = cur;
    cur = cur.replace(re, (_m, key: string, body: string) => {
      const v = getNested(vars, key);
      return isTruthy(v) ? body : "";
    });
  }
  // ★ P2-NEW-3 (round 2): 达到 8 层上限但仍未稳定 → 模板可能有问题，留 telemetry
  if (i >= 8 && prev !== cur) {
    // eslint-disable-next-line no-console
    console.warn(
      `[duty-loader] expandIf hit 8-pass cap, may have unresolved nesting`,
    );
  }
  return cur;
}

// ── {{#each array}}...{{/each}} ──
function expandEach(input: string, vars: Record<string, unknown>): string {
  const re = /\{\{#each\s+([\w.]+)\s*\}\}([\s\S]*?)\{\{\/each\}\}/g;
  let prev = "";
  let cur = input;
  let _i = 0;
  for (; _i < 8 && prev !== cur; _i++) {
    prev = cur;
    cur = cur.replace(re, (_m, key: string, body: string) => {
      const arr = getNested(vars, key);
      if (!Array.isArray(arr) || arr.length === 0) return "";
      return arr
        .map((item, idx) => {
          // 对每一项构建本轮 vars：item 字段 + this + @index
          const itemVars: Record<string, unknown> =
            item != null && typeof item === "object"
              ? { ...vars, ...(item as Record<string, unknown>) }
              : { ...vars };
          itemVars["this"] = item;
          itemVars["@index"] = idx;
          // body 内可能还有嵌套 each / if / var，递归
          let rendered = expandEach(body, itemVars);
          rendered = expandIf(rendered, itemVars);
          rendered = expandVars(rendered, itemVars);
          return rendered;
        })
        .join("");
    });
  }
  // ★ P2-NEW-3 (round 2): 同 expandIf — 达到 8 层上限留 telemetry
  if (_i >= 8 && prev !== cur) {
    // eslint-disable-next-line no-console
    console.warn(
      `[duty-loader] expandEach hit 8-pass cap, may have unresolved nesting`,
    );
  }
  return cur;
}

// ───────────────────────────────────────────────────────────────────
// 便捷封装：load + render 一步到位
// ───────────────────────────────────────────────────────────────────

/**
 * 加载 agent 的 soul + duty，拼接后渲染成最终 systemPrompt。
 *
 * 顺序：
 *   [soul.md content]
 *   ---
 *   [duties/<dutyName>.md content]
 *
 * soul 部分给 LLM 角色身份（"你是 Leader / Researcher / ..."），
 * duty 部分给当前 phase 任务（"现在做 plan / assess-research / ..."）。
 *
 * 如果 agent 没有 soul.md（旧 agent 还没迁移），只返回 duty。
 */
export function buildPromptFromDuty(
  agentDir: string,
  dutyName: string,
  vars: Record<string, unknown>,
): string {
  const soul = loadSoul(agentDir);
  const duty = loadDuty(agentDir, dutyName);
  const combined = soul ? `${soul.trim()}\n\n---\n\n${duty}` : duty;
  return renderDuty(combined, vars);
}
