/**
 * event-schema-contract.spec — schema 声明 × 发送方实发形状契约回归
 *
 * 背景（2026-06-10 回归审计 #13 + 契约矩阵表 3）：EventBus.emit 对注册 schema
 * 做 safeParse，失败即 log + drop（不广播不持久化）。schema 声明落后于发送方
 * 实发形状时，事件整条静默消失——critic:verdict（warnings 实发对象数组 vs
 * 声明 string[]）与 dimensions:appended（source 'user-chat' 不在枚举）都曾因此
 * 全灭。本 spec 用各发送方的实发形状 fixture 锁住契约。
 */
import {
  AgentTraceItemSchema,
  AgentTraceSchema,
  CostTickSchema,
  CriticVerdictSchema,
  DimensionsAppendedSchema,
  LeaderDecisionSchema,
  LeaderGoalsSetSchema,
  MemoryIndexedSchema,
  MissionWarningSchema,
  ReconciliationCompletedSchema,
  StageLifecycleSchema,
} from "../playground.event-schemas";

describe("critic:verdict — bindings 实发形状（deep-insight-stage-bindings buildCriticHooks）", () => {
  // 形状照抄 bindings:1193-1217 emit 实文（warnings 为对象数组）。
  const bindingsEmitFixture = {
    verdict: "concerns",
    overall: "concerns",
    blindspotCount: 2,
    biasCount: 1,
    suggestionCount: 1,
    rationale: "样本偏窄，结论外推需谨慎",
    warnings: [
      { kind: "l4-blindspot", message: "未覆盖监管风险", severity: "warning" },
      { kind: "l4-blindspot", message: "缺少反方数据", severity: "warning" },
      { kind: "l4-bias", message: "来源集中于厂商白皮书", severity: "warning" },
      { kind: "l4-suggestion", message: "补充第三方测评", severity: "info" },
    ],
  };

  it("对象 warnings 数组通过 safeParse（曾因 string[] 声明被整条 drop）", () => {
    const r = CriticVerdictSchema.safeParse(bindingsEmitFixture);
    expect(r.success).toBe(true);
  });

  it("verdict/blindspotCount/biasCount/suggestionCount/rationale 在 parsed.data 中保留（防 EventBus 改广播 parsed.data 时剥离）", () => {
    const r = CriticVerdictSchema.safeParse(bindingsEmitFixture);
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.verdict).toBe("concerns");
      expect(r.data.blindspotCount).toBe(2);
      expect(r.data.biasCount).toBe(1);
      expect(r.data.suggestionCount).toBe(1);
      expect(r.data.rationale).toBe("样本偏窄，结论外推需谨慎");
      expect(r.data.warnings).toHaveLength(4);
      expect(r.data.warnings?.[0]).toMatchObject({
        kind: "l4-blindspot",
        message: "未覆盖监管风险",
        severity: "warning",
      });
    }
  });

  it("旧代 string[] warnings 仍兼容（union 双代）", () => {
    const r = CriticVerdictSchema.safeParse({
      agentId: "critic",
      warnings: ["旧形状字符串警告"],
    });
    expect(r.success).toBe(true);
  });

  it("warnings 为空数组（critic 零发现）照常通过", () => {
    expect(
      CriticVerdictSchema.safeParse({ verdict: "pass", warnings: [] }).success,
    ).toBe(true);
  });
});

describe("dimensions:appended — leader-chat 实发 source 词表", () => {
  const items = [{ id: "dim-new-1", name: "政策对比", rationale: "补缺" }];

  it("source 'leader-chat' 通过（leader-chat.service 已收敛到该词）", () => {
    const r = DimensionsAppendedSchema.safeParse({
      items,
      source: "leader-chat",
      appendedIds: ["dim-new-1"],
    });
    expect(r.success).toBe(true);
  });

  it("source 'user-chat' 不在枚举 → 失败（emit 侧已改词，防止回退）", () => {
    const r = DimensionsAppendedSchema.safeParse({
      items,
      source: "user-chat",
    });
    expect(r.success).toBe(false);
  });
});

describe("memory:indexed — postlude 实发形状 × 前端 dvDeriveMemoryFromEvents 读取面", () => {
  it("postlude payload { chunks, namespace, tags } 通过且字段名与前端一致", () => {
    // 前端 useMissionLegacyView dvDeriveMemoryFromEvents 要求
    // chunks: number（必读）、namespace: string、tags: string[]。
    const r = MemoryIndexedSchema.safeParse({
      chunks: 1,
      namespace: "harness_vector_memory",
      tags: ["deep-insight", "mission-postmortem", "signed"],
    });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(typeof r.data.chunks).toBe("number");
      expect(r.data.namespace).toBe("harness_vector_memory");
      expect(r.data.tags).toContain("deep-insight");
    }
  });
});

describe("reconciliation:completed — bindings/旧 s5 stage 同形实发", () => {
  it("figureCandidateCount/alternativeHypothesisCount 在声明内且保留", () => {
    const r = ReconciliationCompletedSchema.safeParse({
      factCount: 12,
      conflictCount: 2,
      overlapCount: 3,
      gapCount: 1,
      figureCandidateCount: 4,
      alternativeHypothesisCount: 2,
    });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.figureCandidateCount).toBe(4);
      expect(r.data.alternativeHypothesisCount).toBe(2);
    }
  });
});

describe("leader:goals-set / leader:decision — bindings 实发扩展字段声明", () => {
  it("goals-set 带 dimensions（含 toolHint/facet 扩展键）通过且 dimensions 保留", () => {
    const r = LeaderGoalsSetSchema.safeParse({
      goals: { successCriteria: ["覆盖三大主流方案"] },
      initialRisks: [],
      dimensions: [
        {
          id: "d1",
          name: "技术路线",
          rationale: "核心",
          toolHint: { categories: ["general"] },
          facet: "tech",
        },
      ],
    });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.dimensions).toHaveLength(1);
      expect(r.data.dimensions?.[0]?.name).toBe("技术路线");
    }
  });

  it("decision 带 decision/perDimension 通过且保留", () => {
    const r = LeaderDecisionSchema.safeParse({
      phase: "assess-research",
      decision: "accept-all",
      perDimension: [{ dimension: "技术路线", verdict: "accept" }],
    });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.decision).toBe("accept-all");
      expect(r.data.perDimension).toHaveLength(1);
    }
  });
});

describe("mission:warning — runtime shell 实发形状（SINGLE_MODEL_NO_FALLBACK）", () => {
  it("{ code, modelId, userMessage } 通过且字段保留", () => {
    const r = MissionWarningSchema.safeParse({
      code: "SINGLE_MODEL_NO_FALLBACK",
      modelId: "model-x",
      userMessage: "当前仅启用 1 个模型",
    });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.code).toBe("SINGLE_MODEL_NO_FALLBACK");
      expect(r.data.userMessage).toBe("当前仅启用 1 个模型");
    }
  });

  it("liveness guard 形状 { source, message, ageMs } 照常通过", () => {
    expect(
      MissionWarningSchema.safeParse({
        source: "liveness-guard",
        message: "Mission 长时间无心跳",
        ageMs: 60000,
      }).success,
    ).toBe(true);
  });
});

describe("cost:tick — 仅增量字段（累计 costUsd/tokensUsed 无发送方，已删声明）", () => {
  it("agent-invoke.helper 实发 { stage, deltaTokens, deltaCostUsd } 通过", () => {
    expect(
      CostTickSchema.safeParse({
        stage: "s3-researcher-collect",
        deltaTokens: 1200,
        deltaCostUsd: 0.03,
      }).success,
    ).toBe(true);
  });

  it("历史含累计字段的 payload 经 passthrough 不被 drop", () => {
    const r = CostTickSchema.safeParse({
      stage: "s3",
      deltaTokens: 10,
      deltaCostUsd: 0.01,
      costUsd: 1.2,
      tokensUsed: 5000,
    });
    expect(r.success).toBe(true);
  });
});

describe("stage:lifecycle — s12 postlude 自桥三相", () => {
  it.each(["started", "completed", "failed"] as const)(
    "s12 %s 相通过 StageLifecycleSchema",
    (status) => {
      const r = StageLifecycleSchema.safeParse({
        stepId: "s12-self-evolution",
        stage: "s12-self-evolution",
        status,
        ...(status === "failed" ? { error: "postlude 异常" } : {}),
      });
      expect(r.success).toBe(true);
    },
  );
});

describe("agent:trace item kind — reflection / error 放开（前端 reflection 卡复活）", () => {
  it.each(["thought", "action", "observation", "reflection", "error"] as const)(
    "kind '%s' 通过 AgentTraceItemSchema.safeParse",
    (kind) => {
      const r = AgentTraceItemSchema.safeParse({
        kind,
        ts: 123,
        ...(kind === "reflection" ? { text: "重新审视检索覆盖度" } : {}),
        ...(kind === "error" ? { error: "tool timeout" } : {}),
      });
      expect(r.success).toBe(true);
    },
  );

  it("含 reflection item 的 agent:trace 批量事件整体通过（前端 dvCollectAgentTraces 读 items[]）", () => {
    const r = AgentTraceSchema.safeParse({
      agentId: "researcher#dim-a",
      role: "researcher",
      items: [
        { kind: "thought", ts: 1, text: "规划查询" },
        { kind: "reflection", ts: 2, text: "证据不足，需补一轮检索" },
        { kind: "error", ts: 3, error: "search 超时" },
      ],
    });
    expect(r.success).toBe(true);
  });
});
