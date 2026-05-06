/**
 * playground-event-contract.spec.ts
 *
 * **第五层防护网**：架构级 contract drift spec，强制扫前后端事件契约一致性。
 *
 * 历史教训：2026-05-06 mission detail 不更新真因 = 0996e8672 单轨化删了 backend
 * stage:started/completed emit 但 derive.ts 还在监听。typecheck/spec/fixture 都
 * 没拦下来，因为 dead listener 不破坏类型。本 spec 用静态分析机械检测：
 *
 *   1. frontend listened events ⊆ backend AGENT_PLAYGROUND_EVENTS (防 typo / dead listener)
 *   2. backend AGENT_PLAYGROUND_EVENTS each 至少有一处 emit (防 dead registration)
 *   3. backend 实际 emit 的 type ⊆ AGENT_PLAYGROUND_EVENTS (防 unregistered emit 被 bus drop)
 *
 * 触发条件：单轨化删事件 / 重命名事件 / 引入新 event handler 时必须跑过这个 spec
 * 才能 push（pre-push hook 会跑全栈 spec）。
 */

import * as fs from "fs";
import * as path from "path";

// __dirname = backend/src/__tests__/architecture → 4 层到 repo root
const REPO_ROOT = path.resolve(__dirname, "../../../..");
const BACKEND_SRC = path.join(REPO_ROOT, "backend/src");
const FRONTEND = path.join(REPO_ROOT, "frontend");
const PLAYGROUND_PREFIX = "agent-playground.";

// ----- 数据采集（静态分析）-----

function readBackendRegisteredEvents(): Set<string> {
  const eventsFile = path.join(
    BACKEND_SRC,
    "modules/ai-app/agent-playground/agent-playground.events.ts",
  );
  const src = fs.readFileSync(eventsFile, "utf8");
  // T("xxx:yyy") or S("xxx:yyy", schema) → "agent-playground.xxx:yyy"
  const re = /\b[ST]\("([^"]+)"/g;
  const out = new Set<string>();
  let m;
  while ((m = re.exec(src)) !== null) {
    out.add(`${PLAYGROUND_PREFIX}${m[1]}`);
  }
  return out;
}

/** 递归读所有 ts 文件 */
function walkTsFiles(dir: string, files: string[] = []): string[] {
  if (!fs.existsSync(dir)) return files;
  for (const entry of fs.readdirSync(dir)) {
    if (
      entry === "node_modules" ||
      entry === ".next" ||
      entry === "dist" ||
      entry === "__fixtures__" ||
      entry === "__tests__"
    )
      continue;
    const full = path.join(dir, entry);
    const stat = fs.statSync(full);
    if (stat.isDirectory()) {
      walkTsFiles(full, files);
    } else if (
      entry.endsWith(".ts") ||
      entry.endsWith(".tsx") ||
      entry.endsWith(".js")
    ) {
      // skip generated
      if (entry.endsWith(".d.ts")) continue;
      files.push(full);
    }
  }
  return files;
}

function readFrontendListenedEvents(): {
  events: Set<string>;
  source: Record<string, string[]>;
} {
  const events = new Set<string>();
  const source: Record<string, string[]> = {};
  const dirs = [
    path.join(FRONTEND, "lib/agent-playground"),
    path.join(FRONTEND, "components/agent-playground"),
    path.join(FRONTEND, "app/agent-playground"),
    path.join(FRONTEND, "hooks"),
  ];
  // 只匹配事件 type（含至少 1 个冒号），排除 adapter id / namespace 字符串
  const re =
    /['"`]agent-playground\.([a-zA-Z][a-zA-Z0-9_-]*(?::[a-zA-Z][a-zA-Z0-9_-]*)+)['"`]/g;
  for (const d of dirs) {
    for (const file of walkTsFiles(d)) {
      const src = fs.readFileSync(file, "utf8");
      let m;
      while ((m = re.exec(src)) !== null) {
        const ev = `${PLAYGROUND_PREFIX}${m[1]}`;
        events.add(ev);
        if (!source[ev]) source[ev] = [];
        if (!source[ev].includes(file)) source[ev].push(file);
      }
    }
  }
  return { events, source };
}

function readBackendEmittedEvents(): Set<string> {
  const events = new Set<string>();
  const dirs = [
    path.join(BACKEND_SRC, "modules/ai-app/agent-playground"),
    path.join(BACKEND_SRC, "modules/ai-harness"),
  ];
  // 只匹配事件 type（含至少 1 个冒号），排除 adapter id / namespace 字符串
  const re =
    /['"`]agent-playground\.([a-zA-Z][a-zA-Z0-9_-]*(?::[a-zA-Z][a-zA-Z0-9_-]*)+)['"`]/g;
  for (const d of dirs) {
    for (const file of walkTsFiles(d)) {
      // skip events.ts itself（注册不算 emit）+ event-schemas.ts
      if (
        file.endsWith("agent-playground.events.ts") ||
        file.endsWith("agent-playground.event-schemas.ts")
      )
        continue;
      const src = fs.readFileSync(file, "utf8");
      let m;
      while ((m = re.exec(src)) !== null) {
        events.add(`${PLAYGROUND_PREFIX}${m[1]}`);
      }
    }
  }
  return events;
}

// ----- 已知豁免（合法的 dead handler / dead registration / 内部事件）-----

/** 这些事件是合法保留的（向后兼容 fixture / 内部 socket 降级 / 故意未实现） */
const FRONTEND_LEGACY_LISTENERS_OK = new Set<string>([
  // 单轨化前 fixture 兼容
  "agent-playground.stage:started",
  "agent-playground.stage:completed",
]);

/** 这些 backend 注册但暂未 emit（为未来预留 / 测试用 / 兼容历史 fixture） */
const BACKEND_DEAD_REGISTRATION_OK = new Set<string>([
  // SocketBroadcastAdapter 内部降级用，不是业务 emit
  "agent-playground.event:dropped",
  "agent-playground.event:oversized",
  // 暂未 emit 但 frontend 监听（保留事件位等业务实现）
  "agent-playground.chapter:rewritten",
  "agent-playground.dimension:integrating:failed",
  "agent-playground.leader:rejected-revision-recommended",
  // 单轨化前的旧事件 — backend 0996e8672 删 emit，但 frontend derive.ts 保留
  // 兼容 listener 让旧 fixture mission 仍能 deriveView。新 mission 走 stage:lifecycle。
  "agent-playground.stage:started",
  "agent-playground.stage:completed",
  "agent-playground.stage:failed",
  "agent-playground.stage:metrics",
]);

// ----- specs -----

describe("Playground Event Contract — Frontend ↔ Backend", () => {
  const registered = readBackendRegisteredEvents();
  const { events: listened, source: listenedSource } =
    readFrontendListenedEvents();
  const emitted = readBackendEmittedEvents();

  it("frontend 监听的每个事件都在 backend AGENT_PLAYGROUND_EVENTS 注册（防 typo / dead listener）", () => {
    const orphaned: { event: string; files: string[] }[] = [];
    for (const ev of listened) {
      if (FRONTEND_LEGACY_LISTENERS_OK.has(ev)) continue;
      if (!registered.has(ev)) {
        orphaned.push({ event: ev, files: listenedSource[ev] ?? [] });
      }
    }
    if (orphaned.length > 0) {
      const msg = orphaned
        .map(
          (o) =>
            `  ✗ ${o.event}\n      listened in:\n${o.files.map((f) => `        ${path.relative(REPO_ROOT, f)}`).join("\n")}`,
        )
        .join("\n");
      throw new Error(
        `Frontend 监听的下列事件 backend 未注册（orphaned listener / typo）:\n${msg}\n\n` +
          `修法：要么在 backend agent-playground.events.ts 加 T(/S(...))，` +
          `要么删掉 frontend 的死 handler。`,
      );
    }
  });

  it("backend 注册的每个事件至少有一处 emit（防 dead registration）", () => {
    const dead: string[] = [];
    for (const ev of registered) {
      if (BACKEND_DEAD_REGISTRATION_OK.has(ev)) continue;
      if (!emitted.has(ev)) {
        dead.push(ev);
      }
    }
    if (dead.length > 0) {
      throw new Error(
        `Backend 注册了下列事件但代码里找不到 emit 调用（dead registration）:\n` +
          dead.map((e) => `  ✗ ${e}`).join("\n") +
          `\n\n修法：在 backend 加 emit 调用，或从 events.ts 删除注册（需同时删 frontend listener），` +
          `或加入 BACKEND_DEAD_REGISTRATION_OK 豁免名单（注释说明保留原因）。`,
      );
    }
  });

  it("backend 实际 emit 的每个事件类型都在 AGENT_PLAYGROUND_EVENTS 注册（防 DomainEventBus drop）", () => {
    const unregistered: string[] = [];
    for (const ev of emitted) {
      if (!registered.has(ev)) {
        unregistered.push(ev);
      }
    }
    if (unregistered.length > 0) {
      throw new Error(
        `Backend 代码 emit 下列事件但 events.ts 未注册（DomainEventBus 会 drop + warn）:\n` +
          unregistered.map((e) => `  ✗ ${e}`).join("\n") +
          `\n\n修法：在 backend agent-playground.events.ts 用 T(...) 或 S(..., schema) 注册。`,
      );
    }
  });

  it("【prevention】不会再发生 stage:lifecycle 类型的单轨化漏 consumer", () => {
    // 现在 derive.ts 已加 stage:lifecycle handler，新 stage:lifecycle 事件
    // 必然有 frontend listener。如果有人未来再把 stage:lifecycle 改名 / 删除，
    // 上面 3 条 spec 之一会失败。
    expect(registered.has("agent-playground.stage:lifecycle")).toBe(true);
    expect(listened.has("agent-playground.stage:lifecycle")).toBe(true);
    expect(emitted.has("agent-playground.stage:lifecycle")).toBe(true);
  });
});
