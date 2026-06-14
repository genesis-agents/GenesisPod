/**
 * module-di-wiring.spec.ts
 *
 * **DI 反模式 grep guard** — 检测 `@Optional()` 注入 + 函数体里 `if (!this.x) throw "未注入"`
 * 的逻辑悖论。这是"强依赖却标 Optional"的反模式，typecheck / lint / spec mock 三层全过
 * 但 prod 第一次接到用户请求就 throw。
 *
 * 背景（2026-05-12 事故，commit bdd0fc791 → 补丁 c0eed7c71）：
 *   EmbeddingService 标 `@Optional() keyResolver?: KeyResolverService`，又写
 *   `if (!this.keyResolver) throw "未注入"`。这两条同时存在 = 矛盾：
 *     - @Optional() 告诉 DI 容器"可以没有"
 *     - throw 告诉运行时"必须有"
 *
 *   spec 单测用 `Test.createTestingModule({providers:[{provide:X,useValue:mock}]})` 直接注 mock，
 *   永远拿到 mock；prod NestFactory 走 module imports 图，AiEngineKnowledgeModule 没 import
 *   KeyResolverModule → @Optional 拿 undefined → throw → 用户看到 ServiceUnavailable。
 *
 *   纯静态防护（typecheck/lint/build/spec）拦不住 — 因为 spec 绕过 DI 图。
 *
 * 本 guard 的工作：
 *   1. grep 所有 ts 文件，找 `@Optional()` 装饰器
 *   2. 拿到 Optional 字段名
 *   3. 同文件搜 `if (!this.<字段名>)` ... `throw` 模式
 *   4. 命中即反模式 → 修法二选一：
 *      a. 该依赖确实必需 → 删 `@Optional()`，让 module imports 配错时启动直接失败
 *      b. 该依赖确实可选 → 改 throw 为 logger.warn + 早返回 / 降级路径
 */

import * as fs from "fs";
import * as path from "path";

const SRC_ROOT = path.resolve(__dirname, "../../..");

function listAllTsFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith(".")) continue;
    if (entry.name === "node_modules" || entry.name === "__tests__") continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...listAllTsFiles(full));
    } else if (
      entry.isFile() &&
      entry.name.endsWith(".ts") &&
      !entry.name.endsWith(".spec.ts") &&
      !entry.name.endsWith(".d.ts")
    ) {
      out.push(full);
    }
  }
  return out;
}

interface AntiPatternFinding {
  file: string;
  field: string;
  optionalLine: number;
  throwLine: number;
  throwMsg: string;
}

/**
 * 从单个 .ts 文件提取反模式实例
 *
 * 规则：
 *   - 有 `@Optional()` 装饰器
 *   - 同行或下一行声明 `private readonly <field>?: <Type>` 或 `private <field>?: <Type>`
 *   - 同文件 body 里有 `if (!this.<field>)` 且 ~5 行内 `throw ...`
 *   - throw 的消息含"未注入"/"not injected"/"未配置"/"required" 等强约束词
 */
function findAntiPatterns(
  content: string,
  filePath: string,
): AntiPatternFinding[] {
  const lines = content.split("\n");
  const optionalFields: Array<{ field: string; line: number }> = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!line.includes("@Optional()")) continue;
    // 找紧接的字段声明（同行或下面 1-3 行）
    for (let j = i; j < Math.min(i + 4, lines.length); j++) {
      // 例: private readonly keyResolver?: KeyResolverService
      // 例: @Optional() private readonly hook?: Hook,
      const m = lines[j].match(
        /(?:private|protected|public)\s+(?:readonly\s+)?(\w+)\?:/,
      );
      if (m) {
        optionalFields.push({ field: m[1], line: i + 1 });
        break;
      }
    }
  }

  const findings: AntiPatternFinding[] = [];
  for (const { field, line: optLine } of optionalFields) {
    // 找 `if (!this.<field>)` ... throw
    const guardRe = new RegExp(`if\\s*\\(\\s*!\\s*this\\.${field}\\b\\s*\\)`);
    for (let i = 0; i < lines.length; i++) {
      if (!guardRe.test(lines[i])) continue;
      // 看接下来 5 行是否有 throw + 强约束词
      for (let j = i; j < Math.min(i + 5, lines.length); j++) {
        const t = lines[j];
        if (!t.includes("throw")) continue;
        // 抓 throw 整段（可能多行），最简取该行
        if (
          /未注入|not\s+injected|未配置|is\s+required|missing/i.test(t) ||
          // 看下一行有没有这些词（throw new X(\n "msg" \n)）
          (j + 1 < lines.length &&
            /未注入|not\s+injected|未配置|is\s+required|missing/i.test(
              lines[j + 1],
            ))
        ) {
          findings.push({
            file: path.relative(SRC_ROOT, filePath).replace(/\\/g, "/"),
            field,
            optionalLine: optLine,
            throwLine: j + 1,
            throwMsg: t.trim().slice(0, 120),
          });
          break;
        }
      }
    }
  }
  return findings;
}

/**
 * Known-pending 白名单：已识别但本 PR 不处理的反模式实例
 *
 * 新增条目要在 description 里写：(a) 计划的修法 (b) 拖延的原因 (c) tracking issue/task。
 * 不允许"留作 TODO"——这就是 TODO，加进来意味着承诺修。
 */
const KNOWN_PENDING: Array<{ file: string; field: string; reason: string }> = [
  {
    file: "modules/ai-engine/content/fetch/content-fetch.service.ts",
    field: "youtubeService",
    reason:
      "YoutubeService 通过 token 注入避免循环依赖。修法：上游每个使用 ContentFetchService 的模块都 provide YOUTUBE_SERVICE_TOKEN，或者 throw 改为优雅降级（返回空 transcript）。pending: 2026-05-12 EmbeddingService 严格 BYOK PR 后续单独 PR 处理。",
  },
];

describe("DI Anti-Pattern Guard (@Optional + throw 'not injected')", () => {
  it("禁止 @Optional() 字段 + if(!this.field) throw '未注入' 反模式", () => {
    const allFiles = listAllTsFiles(SRC_ROOT);
    const violations: AntiPatternFinding[] = [];

    for (const file of allFiles) {
      const content = fs.readFileSync(file, "utf-8");
      // 快速过滤：没 @Optional 就 skip
      if (!content.includes("@Optional()")) continue;
      violations.push(...findAntiPatterns(content, file));
    }

    // 过滤掉 known-pending
    const novel = violations.filter(
      (v) =>
        !KNOWN_PENDING.some((p) => p.file === v.file && p.field === v.field),
    );

    if (novel.length > 0) {
      const msg = novel
        .map(
          (v) =>
            `  ${v.file}:${v.optionalLine} field="${v.field}" 被标 @Optional()，但 line ${v.throwLine} 又 throw "未注入"：\n    ${v.throwMsg}`,
        )
        .join("\n");
      throw new Error(
        `发现 ${novel.length} 处新 DI 反模式：@Optional() + throw "未注入" 是逻辑悖论。\n` +
          `修法二选一：\n` +
          `  (a) 该依赖确实必需 → 删 @Optional()，让 module imports 配错时启动直接失败\n` +
          `  (b) 该依赖确实可选 → 改 throw 为 logger.warn + 降级 / 早返回\n\n` +
          `违规列表：\n${msg}`,
      );
    }

    expect(novel.length).toBe(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Guard 2：@Optional() + 可空联合类型 + 无 @Inject → DI 元数据擦除 → 静默 undefined
// ─────────────────────────────────────────────────────────────────────────────
//
// 背景（2026-06-14 知识本体回填空转事故）：
//   构造参数写成 `private readonly x: SomeClass | undefined`（显式联合类型）时，
//   TS emitDecoratorMetadata 会把 design:paramtypes 退化成 `Object`——联合类型一律
//   序列化为 Object。Nest 拿到的注入 token 变成 Object、解析不到该 provider，
//   叠加 @Optional() 就**永远注入 undefined**，且 typecheck / lint / 单测（spec 直接
//   注 mock，绕过 DI 图）三层全过，prod 静默降级。
//
//   实例：OntologyBuilderSkill / ReportOntologyFillService 把 AiChatService、
//   OntologyService、OntologyBuilderSkill、ToolRegistry 全写成 `类 | undefined`，
//   回填 doExecute 第一关 if(!aiChatService) 直接 skip，本体页一直"暂无实体"。
//
// 修法二选一：
//   (a) 显式 `@Inject(类)` 钉死注入 token，绕开被擦的元数据（保留联合类型也行）
//   (b) 改 `x?: Class`（注解节点是裸类 → 元数据=类，不擦）；注意可选参数须放参数表末尾
//
// 注：本 guard 只盯"可空联合 `| undefined` / `| null`"这一最常见擦除形态。裸接口类型
//   （`x: ISomething`）同样擦成 Object，但静态难与裸类区分，不在本 guard 范围。

interface ErasureFinding {
  file: string;
  field: string;
  line: number;
  typeText: string;
}

/**
 * 提取"@Optional() + 可空联合类型参数 + 无 @Inject"实例。
 *   - 命中 `@Optional()` 装饰器
 *   - 其关联构造参数类型形如 `: T | undefined` 或 `: T | null`（显式联合注解）
 *   - @Optional 上方 3 行至参数行之间没有 `@Inject(...)`
 */
function findErasureAntiPatterns(
  content: string,
  filePath: string,
): ErasureFinding[] {
  const lines = content.split("\n");
  const findings: ErasureFinding[] = [];

  for (let i = 0; i < lines.length; i++) {
    if (!lines[i].includes("@Optional()")) continue;
    // 在 @Optional 当行 .. 下 4 行内找可空联合类型的参数声明
    for (let j = i; j < Math.min(i + 5, lines.length); j++) {
      const m = lines[j].match(
        /(?:private|protected|public)\s+(?:readonly\s+)?(\w+)\s*:\s*([^,)=]*\|\s*(?:undefined|null)\b[^,)=]*)/,
      );
      if (!m) continue;
      const field = m[1];
      const typeText = m[2].trim();
      // @Inject 可能在 @Optional 之前（如 @Inject\n@Optional\nparam）或之后，
      // 扫 [i-3 .. j] 窗口
      let hasInject = false;
      for (let k = Math.max(0, i - 3); k <= j; k++) {
        if (/@Inject\s*\(/.test(lines[k])) {
          hasInject = true;
          break;
        }
      }
      if (!hasInject) {
        findings.push({
          file: path.relative(SRC_ROOT, filePath).replace(/\\/g, "/"),
          field,
          line: j + 1,
          typeText: typeText.slice(0, 80),
        });
      }
      break; // 该 @Optional 的参数已定位
    }
  }
  return findings;
}

/**
 * 已知安全例外：静态扫描会命中、但经人工确认无擦除风险的实例。
 * 新增条目必须写清为什么安全（否则就是在掩盖真 bug）。
 */
const KNOWN_SAFE_ERASURE: Array<{
  file: string;
  field: string;
  reason: string;
}> = [
  {
    file: "modules/ai-harness/teams/business-team/span/business-team-mission-span.framework.ts",
    field: "tracer",
    reason:
      "非 DI 基类：构造器含未装饰的 `namespace: string` 必选参（DI 容器无法提供裸 string），" +
      "由各业务子类手动 super(tracer, namespace) 构造，@Optional 仅表意、不经容器解析，无元数据擦除风险。",
  },
];

describe("DI Anti-Pattern Guard (@Optional + 可空联合类型 + 无 @Inject)", () => {
  it("禁止 @Optional() 参数写 `类 | undefined/null` 却不带 @Inject（DI 元数据擦除→静默 undefined）", () => {
    const allFiles = listAllTsFiles(SRC_ROOT);
    const violations: ErasureFinding[] = [];

    for (const file of allFiles) {
      const content = fs.readFileSync(file, "utf-8");
      if (!content.includes("@Optional()")) continue;
      violations.push(...findErasureAntiPatterns(content, file));
    }

    const novel = violations.filter(
      (v) =>
        !KNOWN_SAFE_ERASURE.some(
          (s) => s.file === v.file && s.field === v.field,
        ),
    );

    if (novel.length > 0) {
      const msg = novel
        .map(
          (v) =>
            `  ${v.file}:${v.line} field="${v.field}" 类型 "${v.typeText}" 带 @Optional() 但无 @Inject`,
        )
        .join("\n");
      throw new Error(
        `发现 ${novel.length} 处 DI 元数据擦除反模式：@Optional() + \`类 | undefined/null\` 联合类型 + 无 @Inject。\n` +
          `联合类型令 TS design:paramtypes 退化成 Object，Nest 解析不到 → @Optional 永远注入 undefined（prod 静默降级）。\n` +
          `修法二选一：\n` +
          `  (a) 加显式 @Inject(类) 钉死注入 token（可保留联合类型）\n` +
          `  (b) 改 \`x?: Class\`（注解节点=裸类，元数据不擦；可选参数须置于参数表末尾）\n\n` +
          `违规列表：\n${msg}`,
      );
    }

    expect(novel.length).toBe(0);
  });
});
