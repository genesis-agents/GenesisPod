/**
 * playground-frontend-contract spec —— 后→前 byte-equal 契约守护（v5.1 §3.7 R1-D）
 *
 * 背景：
 *   v5.1 重构期间（R1 → R2-A 双轨 → R2-C 删旧实现）playground 业务事件 type
 *   字符串 / REST 端点路径必须保持完全等于现状。任何改动 = 前端 socket
 *   handler / API client 跑红 = 用户看不到结果。
 *
 * 守护范围：
 *   1. AGENT_PLAYGROUND_EVENTS 注册的全部 event type（list + 元素 byte-equal）
 *   2. AgentPlaygroundController 的 (HTTP method, path) 完整集合
 *
 * 守护方式：
 *   1. 事件：从 agent-playground.events.ts 导入运行时 const，sorted 后与 baseline 数组比对
 *   2. 端点：源码文本正则提取 @Get / @Post / @Patch / @Delete 装饰器 + 路径，
 *      与 baseline 数组比对（避开 Nest reflection 走 DI 导入大依赖树）
 *
 * 改 baseline 时：
 *   - 同步前端 socket handler / API client 改动 PR
 *   - PR 描述写明哪个事件 / 端点变了
 *   - 不允许 sneak-in：本 spec 跑红 = 不能合并
 */
import * as fs from "fs";
import * as path from "path";
import { AGENT_PLAYGROUND_EVENTS } from "../../modules/ai-app/agent-playground/agent-playground.events";

const CONTROLLER_FILE = path.resolve(
  __dirname,
  "../../modules/ai-app/agent-playground/agent-playground.controller.ts",
);

// ── Baseline 1: 事件 type（v5.1 R1-D 锁定基线）──────────────────────────────
//
// 70 events from agent-playground.events.ts (2026-05-04)。改本数组前先确认
// 前端 socket handler 已同步（grep frontend `agent-playground.${suffix}`）。
const EVENT_BASELINE: ReadonlyArray<string> = [
  "agent-playground.agent:action",
  "agent-playground.agent:error",
  "agent-playground.agent:lifecycle",
  "agent-playground.agent:narrative",
  "agent-playground.agent:observation",
  "agent-playground.agent:reflection",
  "agent-playground.agent:thought",
  "agent-playground.agent:validation-rejected",
  "agent-playground.budget:exhausted",
  "agent-playground.budget:warning-hard",
  "agent-playground.budget:warning-soft",
  "agent-playground.chapter:done",
  "agent-playground.chapter:review:completed",
  "agent-playground.chapter:review:started",
  "agent-playground.chapter:revision",
  "agent-playground.chapter:rewritten",
  "agent-playground.chapter:writing:completed",
  "agent-playground.chapter:writing:started",
  "agent-playground.cost:tick",
  "agent-playground.critic:verdict",
  "agent-playground.dimension:degraded",
  "agent-playground.dimension:graded",
  "agent-playground.dimension:integrating:completed",
  "agent-playground.dimension:integrating:failed",
  "agent-playground.dimension:integrating:started",
  "agent-playground.dimension:outline:planned",
  "agent-playground.dimension:research:completed",
  "agent-playground.dimension:research:started",
  "agent-playground.dimension:retry-failed",
  "agent-playground.dimension:retry-phase:completed",
  "agent-playground.dimension:retry-phase:started",
  "agent-playground.dimension:retrying",
  "agent-playground.dimensions:appended",
  "agent-playground.draft:completed",
  "agent-playground.event:dropped",
  "agent-playground.event:oversized",
  "agent-playground.failure-pattern:pre-applied",
  "agent-playground.iteration:progress",
  "agent-playground.leader:decision",
  "agent-playground.leader:foreword",
  "agent-playground.leader:goals-set",
  "agent-playground.leader:rejected-revision-recommended",
  "agent-playground.leader:signed",
  "agent-playground.memory:indexed",
  "agent-playground.mission:budget-warning-hard",
  "agent-playground.mission:budget-warning-soft",
  "agent-playground.mission:cancelled",
  "agent-playground.mission:completed",
  "agent-playground.mission:degraded",
  "agent-playground.mission:evolved",
  "agent-playground.mission:execution-aborted",
  "agent-playground.mission:failed",
  "agent-playground.mission:manual-rerun-from-todo",
  "agent-playground.mission:persist-failed",
  "agent-playground.mission:postlude:completed",
  "agent-playground.mission:postlude:failed",
  "agent-playground.mission:postlude:started",
  "agent-playground.mission:rejected",
  "agent-playground.mission:reopened",
  "agent-playground.mission:rerun-completed",
  "agent-playground.mission:rerun-failed",
  "agent-playground.mission:rerun-started",
  "agent-playground.mission:started",
  "agent-playground.mission:warning",
  "agent-playground.reconciliation:completed",
  "agent-playground.reconciliation:skipped",
  "agent-playground.reconciliation:warnings-orphaned",
  "agent-playground.report:assembled",
  "agent-playground.report:draft",
  "agent-playground.researcher:completed",
  "agent-playground.rerun:cascade-aborted",
  "agent-playground.rerun:stage-started",
  "agent-playground.section:remediation:summary",
  "agent-playground.stage:completed",
  "agent-playground.stage:degraded",
  "agent-playground.stage:failed",
  "agent-playground.stage:lifecycle",
  "agent-playground.stage:metrics",
  "agent-playground.stage:stalled",
  "agent-playground.stage:started",
  "agent-playground.tools:recalled",
  "agent-playground.verifier:verdict",
];

// ── Baseline 2: REST 端点（v5.1 R1-D 锁定基线）─────────────────────────────
//
// 15 endpoints from agent-playground.controller.ts (2026-05-04)。前缀 controller
// 路径 "agent-playground" 是 NestJS @Controller("agent-playground") 注册的；
// 真实 URL = `/api/v1/agent-playground/${path}`（其中 /api/v1 是 Nest global prefix）。
//
// 元组 = [HTTP_METHOD, route_path（不含 controller prefix）]
type EndpointSpec = readonly [string, string];
const ENDPOINT_BASELINE: ReadonlyArray<EndpointSpec> = [
  ["DELETE", "missions/:id"],
  ["GET", "missions"],
  ["GET", "missions/:id"],
  ["GET", "missions/:id/export"],
  ["GET", "missions/:id/leader-chat"],
  ["GET", "missions/:id/report-versions"],
  ["GET", "missions/:id/report-versions/:version"],
  ["GET", "missions/resumable"],
  ["GET", "replay/:missionId"],
  ["PATCH", "missions/:id"],
  ["POST", "dev/trigger-mission"],
  ["POST", "error-report"],
  ["POST", "missions/:id/cancel"],
  ["POST", "missions/:id/leader-chat"],
  ["POST", "missions/:id/rerun"],
  ["POST", "missions/:id/todos/:todoId/local-rerun"],
  ["POST", "missions/:id/todos/:todoId/rerun"],
  ["POST", "team/run"],
];

// ── 实现 ────────────────────────────────────────────────────────────────

function loadEventTypes(): string[] {
  return [...AGENT_PLAYGROUND_EVENTS.map((e) => e.type)].sort();
}

/**
 * 解析 controller 源码提取 (HTTP_METHOD, path) 列表。
 *
 * 支持的装饰器形式：
 *   @Get("path")
 *   @Post("path")
 *   @Patch("path")
 *   @Delete("path")
 *   @Put("path")
 *   @Get()  → path = ""
 *
 * 仅识别紧贴方法定义的 HTTP method 装饰器；忽略 @UseGuards / @RateLimit / @Public 等
 * 元装饰器（它们不映射到独立路由）。
 */
function loadEndpointsFromSource(): EndpointSpec[] {
  const src = fs.readFileSync(CONTROLLER_FILE, "utf-8");
  const re = /@(Get|Post|Patch|Delete|Put)\(\s*"([^"]*)"\s*\)/g;
  const out: EndpointSpec[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(src)) !== null) {
    const method = m[1].toUpperCase();
    const route = m[2];
    out.push([method, route]);
  }
  // 兼容 @Get() 无参（极少见，但别漏）
  const reEmpty = /@(Get|Post|Patch|Delete|Put)\(\s*\)/g;
  while ((m = reEmpty.exec(src)) !== null) {
    out.push([m[1].toUpperCase(), ""]);
  }
  // sort by [method, path]
  out.sort((a, b) => (a[0] + " " + a[1]).localeCompare(b[0] + " " + b[1]));
  return out;
}

// ── Specs ───────────────────────────────────────────────────────────────

describe("playground frontend contract (v5.1 R1-D)", () => {
  describe("event types byte-equal", () => {
    const observed = loadEventTypes();
    const baseline = [...EVENT_BASELINE].sort();

    it("baseline 数量等于实际注册数", () => {
      expect(observed.length).toBe(baseline.length);
    });

    it("每个 event type 都在 baseline 中（防新增 sneak-in）", () => {
      const baseSet = new Set(baseline);
      const novel = observed.filter((t) => !baseSet.has(t));
      // 不允许 sneak-in：novel = [] 表示无新增 event 未声明在 baseline
      expect(novel).toEqual([]);
    });

    it("每个 baseline 都仍被注册（防误删）", () => {
      const observedSet = new Set(observed);
      const missing = baseline.filter((t) => !observedSet.has(t));
      expect(missing).toEqual([]);
    });

    it("byte-equal 字符串数组完全相等（最严守护）", () => {
      expect(observed).toEqual(baseline);
    });
  });

  describe("REST endpoints byte-equal", () => {
    const observed = loadEndpointsFromSource();
    const baseline = [...ENDPOINT_BASELINE].sort((a, b) =>
      (a[0] + " " + a[1]).localeCompare(b[0] + " " + b[1]),
    );

    it("baseline 数量等于实际定义数", () => {
      expect(observed.length).toBe(baseline.length);
    });

    it("每个 (method, path) 都在 baseline 中（防新增 sneak-in）", () => {
      const baseSet = new Set(baseline.map((b) => b.join(" ")));
      const novel = observed
        .map((o) => o.join(" "))
        .filter((s) => !baseSet.has(s));
      expect(novel).toEqual([]);
    });

    it("每个 baseline 都仍存在（防误删）", () => {
      const observedSet = new Set(observed.map((o) => o.join(" ")));
      const missing = baseline
        .map((b) => b.join(" "))
        .filter((s) => !observedSet.has(s));
      expect(missing).toEqual([]);
    });

    it("byte-equal 元组数组完全相等（最严守护）", () => {
      expect(observed).toEqual(baseline);
    });
  });
});
