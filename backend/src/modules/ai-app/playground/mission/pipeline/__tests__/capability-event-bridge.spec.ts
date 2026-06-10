/**
 * bridgeCapabilityEventToPlayground 富化回归 spec（2026-06-10 回归审计
 * #1/#2/#5/#7/#9/#10/#14/#15 + 契约矩阵表 3）。
 *
 * 锁定的契约：
 *   1. action_planned → action 条目（tool-call 卡来源；parallel 用
 *      toolId='parallel_tool_call' + input=calls[] 触发 Drawer 并发调用卡）；
 *   2. action_executed → observation 条目（透传 toolId/output 对象/latencyMs/
 *      tokensUsed/error；output 保形不字符串化）；payload 过 AgentTraceSchema；
 *   3. narrative 收敛：thinking/action 不再机械转 narrative，仅 error 类发；
 *   4. mission:completed payload 过 MissionCompletedSchema 且 appBasePath/
 *      relatedType 非空（完成通知 adapter 硬条件）；mission:started 带 input 档位；
 *   5. stage:stalled/degraded 透传 reason/elapsedMs 到 playground.stage:* 事件。
 */
import { PlaygroundPipelineDispatcher } from "../playground.pipeline";
import {
  AgentTraceSchema,
  MissionCompletedSchema,
  MissionStartedSchema,
} from "../../../events/playground.event-schemas";
import type { CapabilityRunEvent } from "@/modules/ai-app/marketplace/capability";

interface EmittedEvent {
  type: string;
  payload: Record<string, unknown>;
}

function makeBridge(): {
  bridge: (event: CapabilityRunEvent) => Promise<void>;
  emitted: EmittedEvent[];
} {
  const emitted: EmittedEvent[] = [];
  const fakeEventBus = {
    emit: jest.fn((e: { type: string; payload: unknown }) => {
      emitted.push({
        type: e.type,
        payload: e.payload as Record<string, unknown>,
      });
      return Promise.resolve(true);
    }),
    registerAdapter: jest.fn(),
    unregisterAdapter: jest.fn(),
  };
  const fakeMissionSpan = {
    startStageSpan: jest.fn(),
    endStageSpan: jest.fn(),
  };
  const stub = {} as never;
  const dispatcher = new PlaygroundPipelineDispatcher(
    stub, // runtimeShell
    stub, // leaderService
    stub, // invoker
    stub, // leaderInvocationFactory
    stub, // missionCheckpoint
    stub, // store
    stub, // electionTracker
    fakeEventBus as never,
    stub, // businessOrch
    stub, // lifecycleManager
    fakeMissionSpan as never,
  );
  const priv = dispatcher as unknown as {
    bridgeCapabilityEventToPlayground(
      event: CapabilityRunEvent,
      missionId: string,
      userId: string,
    ): Promise<void>;
  };
  return {
    bridge: (event) =>
      priv.bridgeCapabilityEventToPlayground(event, "m1", "u1"),
    emitted,
  };
}

describe("bridgeCapabilityEventToPlayground (capability → playground 事件富化)", () => {
  it("action_executed → observation 条目：output 对象保形 + latencyMs/tokensUsed/error 透传，过 AgentTraceSchema", async () => {
    const { bridge, emitted } = makeBridge();
    const output = { results: [{ title: "AMD Q1", url: "https://e.com/1" }] };
    await bridge({
      type: "agent-trace",
      stepId: "s3-researcher-collect",
      timestamp: 1000,
      payload: {
        kind: "action_executed",
        text: "调用 web-search：AMD 财报",
        role: "researcher",
        dimension: "维度A",
        toolId: "web-search",
        input: { query: "AMD 财报" },
        output,
        latencyMs: 123,
        tokensUsed: 45,
        error: "partial timeout",
        agentId: "playground.researcher",
        stepId: "s3-researcher-collect",
      },
    });
    expect(emitted).toHaveLength(1);
    expect(emitted[0].type).toBe("playground.agent:trace");
    const parsed = AgentTraceSchema.safeParse(emitted[0].payload);
    expect(parsed.success).toBe(true);
    const payload = emitted[0].payload as {
      agentId: string;
      items: Array<Record<string, unknown>>;
    };
    // Fix 1 命名空间映射：specId + dimension → researcher#维度A
    expect(payload.agentId).toBe("researcher#维度A");
    expect(payload.items).toHaveLength(1);
    const item = payload.items[0];
    expect(item.kind).toBe("observation");
    expect(item.toolId).toBe("web-search");
    expect(item.output).toEqual(output); // 保形，非字符串
    expect(item.latencyMs).toBe(123);
    expect(item.tokensUsed).toBe(45);
    expect(item.error).toBe("partial timeout");
  });

  it("action_planned + calls[] → action 条目 toolId='parallel_tool_call' input=calls（并发调用卡复活）", async () => {
    const { bridge, emitted } = makeBridge();
    const calls = [
      { kind: "tool_call", toolId: "web-search", input: { query: "a" } },
      {
        kind: "tool_call",
        toolId: "web-scraper",
        input: { url: "https://e.com" },
      },
    ];
    await bridge({
      type: "agent-trace",
      stepId: "s3-researcher-collect",
      timestamp: 1,
      payload: {
        kind: "action_planned",
        text: "并发调用 2 个工具",
        role: "researcher",
        calls,
        agentId: "playground.researcher",
        stepId: "s3-researcher-collect",
      },
    });
    expect(emitted).toHaveLength(1);
    expect(AgentTraceSchema.safeParse(emitted[0].payload).success).toBe(true);
    const item = (
      emitted[0].payload as { items: Array<Record<string, unknown>> }
    ).items[0];
    expect(item.kind).toBe("action");
    expect(item.toolId).toBe("parallel_tool_call");
    expect(item.input).toEqual(calls);
  });

  it("narrative 收敛：thinking 只发 trace thought（带 modelId）不发 narrative；error 只发 narrative 不发 trace", async () => {
    const { bridge, emitted } = makeBridge();
    await bridge({
      type: "agent-trace",
      stepId: "s2-leader-plan",
      timestamp: 1,
      payload: {
        kind: "thinking",
        text: "原始内心独白".repeat(50),
        role: "leader",
        modelId: "test-model-1",
        agentId: "playground.leader",
        stepId: "s2-leader-plan",
      },
    });
    expect(emitted.map((e) => e.type)).toEqual(["playground.agent:trace"]);
    const thought = (
      emitted[0].payload as { items: Array<Record<string, unknown>> }
    ).items[0];
    expect(thought.kind).toBe("thought");
    expect(thought.modelId).toBe("test-model-1");

    emitted.length = 0;
    await bridge({
      type: "agent-trace",
      stepId: "s3-researcher-collect",
      timestamp: 2,
      payload: {
        kind: "error",
        tag: "warning",
        text: "预算警告：已用 90000 tokens（soft）",
        role: "researcher",
        agentId: "playground.researcher",
        stepId: "s3-researcher-collect",
      },
    });
    expect(emitted.map((e) => e.type)).toEqual(["playground.agent:narrative"]);
    expect(emitted[0].payload.tag).toBe("warning");
    expect(emitted[0].payload.text).toContain("预算警告");
  });

  it("completed → playground.mission:completed：统计透传 + appBasePath/relatedType 非空，过 MissionCompletedSchema", async () => {
    const { bridge, emitted } = makeBridge();
    await bridge({
      type: "completed",
      timestamp: 99,
      payload: {
        costUsd: 2.5,
        tokensUsed: 12345,
        elapsedWallTimeMs: 60_000,
        reviewScore: 87,
        leaderSigned: true,
        verifierVerdicts: [{ dimension: "市场", score: 80 }],
        missionTitle: "AMD 深度研究",
      },
    });
    expect(emitted).toHaveLength(1);
    expect(emitted[0].type).toBe("playground.mission:completed");
    const p = emitted[0].payload;
    expect(MissionCompletedSchema.safeParse(p).success).toBe(true);
    // MissionCompletionBroadcastAdapter 硬条件：缺任一则静默 skip 完成通知
    expect(p.appBasePath).toBe("/agent-playground");
    expect(p.relatedType).toBe("playground-mission");
    expect(p.missionTitle).toBe("AMD 深度研究");
    expect(p.costUsd).toBe(2.5);
    expect(p.reviewScore).toBe(87);
    expect(p.leaderSigned).toBe(true);
  });

  it("completed 无 payload（兜底）→ 仍发事件且 appBasePath/relatedType 在场", async () => {
    const { bridge, emitted } = makeBridge();
    await bridge({ type: "completed", timestamp: 2 });
    expect(emitted[0].type).toBe("playground.mission:completed");
    expect(emitted[0].payload.appBasePath).toBe("/agent-playground");
    expect(emitted[0].payload.relatedType).toBe("playground-mission");
  });

  it("started → playground.mission:started：payload.input 携带 topic + 档位，过 MissionStartedSchema", async () => {
    const { bridge, emitted } = makeBridge();
    await bridge({
      type: "started",
      timestamp: 7,
      payload: { topic: "AMD topic", depth: "deep", language: "zh-CN" },
    });
    expect(emitted[0].type).toBe("playground.mission:started");
    expect(MissionStartedSchema.safeParse(emitted[0].payload).success).toBe(
      true,
    );
    expect(emitted[0].payload.startedAt).toBe(7);
    expect(emitted[0].payload.input).toEqual({
      topic: "AMD topic",
      depth: "deep",
      language: "zh-CN",
    });
  });

  it("stage:stalled / stage:degraded → reason/elapsedMs 透传到 playground.stage:* payload", async () => {
    const { bridge, emitted } = makeBridge();
    await bridge({
      type: "stage:stalled",
      stepId: "s3-researcher-collect",
      timestamp: 5,
      payload: { reason: "no heartbeat", elapsedMs: 300_000 },
    });
    await bridge({
      type: "stage:degraded",
      stepId: "s8b-quality-enhancement",
      timestamp: 6,
      payload: { reason: "section eval skipped" },
    });
    const stalled = emitted.find((e) => e.type === "playground.stage:stalled");
    expect(stalled).toBeDefined();
    expect(stalled?.payload.reason).toBe("no heartbeat");
    expect(stalled?.payload.elapsedMs).toBe(300_000);
    const degraded = emitted.find(
      (e) => e.type === "playground.stage:degraded",
    );
    expect(degraded).toBeDefined();
    expect(degraded?.payload.reason).toBe("section eval skipped");
  });
});
