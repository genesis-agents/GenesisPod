/**
 * DeepInsightDefaultRunner —— deep-insight 能力的**默认执行实现**（平台共享）。
 *
 * 定位（对照 design.md §4.3 + 能力 manifest/port 设计）：
 *   - 能力本体住在共享层；本 runner 是它的**默认进程内实现**，注册进 CapabilityRegistry。
 *   - 任意消费方（company / 其他 app）按 `manifest.id` 解析到本 runner 真跑——**用同一批
 *     共享 @DefineAgent（researcher/reconciler/analyst/writer/reviewer），跑在 harness 的
 *     AgentRunner 上**，模型解析与 playground 一致（带 billing.userId，不掉默认网关）。
 *   - **纯执行**：产出结果 + 流式事件，不碰任何 app 的库；持久化归消费方。
 *   - 未来公开市场：同一 ICapabilityRunner 端口可换成沙箱/远程/MCP 实现，消费方不变。
 *
 * 与 playground 的关系（历史能力不退化）：playground 仍跑自己注册的 14 阶段富 pipeline
 * （含 checkpoint / 记忆 / foresight / 质量地板等增强），**本 runner 不动它**；本 runner 是
 * 给"无 playground 宿主"的消费方用的**精简但真实**的默认执行（plan→并发研究→对账→综合
 * →写作→评审）。
 */
import { Injectable, Logger, type OnModuleInit } from "@nestjs/common";
import {
  AgentRunner,
  ChatFacade,
  CapabilityRegistry,
  AIModelType,
  type IAgentEvent,
  type CapabilityManifest,
  type ICapabilityRunner,
  type CapabilityRunInput,
  type CapabilityRunContext,
  type CapabilityRunResult,
} from "./runner-deps";
import { resolveAgentSpec } from "@/modules/ai-app/contracts/agent-spec-catalog";

/** plan 阶段产物（维度拆解）。 */
interface PlanResult {
  themeSummary: string;
  dimensions: { id: string; name: string; rationale: string }[];
  tokens: number;
}

/** reconcile 阶段产物（可降级 → null）。 */
interface ReconResult {
  reconciliationReport?: string;
  factTable?: unknown[];
  overlaps?: unknown[];
  gaps?: unknown[];
}

const MANIFEST: CapabilityManifest = {
  id: "deep-insight",
  version: "1.0.0",
  kind: "workflow",
  title: "深度洞察研究",
  description:
    "Leader 领衔的多角色深度研究：拆解维度 → 并发调研 → 跨维对账 → 综合分析 → 撰写报告 → 质量评审。",
  roles: ["researcher", "reconciler", "analyst", "writer", "reviewer"],
  stages: [
    "拆解维度",
    "并发调研",
    "跨维对账",
    "综合分析",
    "撰写报告",
    "质量评审",
  ],
  missionType: "deep-insight",
  permissions: ["web-search"],
};

@Injectable()
export class DeepInsightDefaultRunner
  implements ICapabilityRunner, OnModuleInit
{
  readonly manifest = MANIFEST;
  private readonly log = new Logger(DeepInsightDefaultRunner.name);

  constructor(
    private readonly agentRunner: AgentRunner,
    private readonly chatFacade: ChatFacade,
    private readonly registry: CapabilityRegistry,
  ) {}

  onModuleInit(): void {
    this.registry.register(this);
  }

  async run(
    input: CapabilityRunInput,
    ctx: CapabilityRunContext,
  ): Promise<CapabilityRunResult> {
    const topic = input.topic;
    const language = input.language ?? "zh-CN";
    const depth = input.depth ?? "standard";
    const { userId } = ctx;
    // 用户选定的 model id 透传到每个 agentRunner.run，与 playground 共享同一
    // resolvePreferredModel 路径（第一优先，bypass election，走 BYOK 默认解析链）
    const preferredModelId = input.preferredModelId;
    const billing = (operationType: string) => ({
      userId,
      moduleType: "marketplace-deep-insight",
      operationType,
    });
    const emit = (
      type: Parameters<NonNullable<CapabilityRunContext["onEvent"]>>[0]["type"],
      stepId?: string,
      label?: string,
      payload?: Record<string, unknown>,
    ) => ctx.onEvent?.({ type, stepId, label, timestamp: Date.now(), payload });

    /**
     * IAgentEvent → CapabilityRunEvent(agent-trace) relay。
     * 把 harness 真实 agent 事件（thinking/action_planned/action_executed/error）
     * 翻译成 agent-trace 类型事件经 ctx.onEvent 上抛。
     * relay 内部 try-catch 吞错，失败不拖死 run。
     */
    const relayAgentEvent = (
      stepId: string,
      role: string,
      dimension: string | undefined,
      ev: IAgentEvent,
    ) => {
      try {
        let kind: string;
        let text: string | undefined;
        let tag: string | undefined;
        let toolId: string | undefined;

        switch (ev.type) {
          case "thinking": {
            kind = "thinking";
            const p = ev.payload as
              | { text?: string; content?: string }
              | undefined;
            text = p?.text ?? p?.content ?? undefined;
            break;
          }
          case "action_planned": {
            kind = "action_planned";
            const p = ev.payload as
              | { action?: { toolId?: string; description?: string } }
              | undefined;
            toolId = p?.action?.toolId;
            text = p?.action?.description ?? toolId;
            break;
          }
          case "action_executed": {
            kind = "action_executed";
            const p = ev.payload as
              | { action?: { toolId?: string }; result?: unknown }
              | undefined;
            toolId = p?.action?.toolId;
            text = toolId ? `Tool ${toolId} executed` : "Action executed";
            break;
          }
          case "error": {
            kind = "error";
            tag = "error";
            const p = ev.payload as { message?: string } | undefined;
            text = p?.message ?? "Agent error";
            break;
          }
          default:
            // 其余事件类型（output/terminated/tools_recalled 等）不向上传
            return;
        }

        void ctx.onEvent?.({
          type: "agent-trace",
          stepId,
          label: dimension,
          timestamp: ev.timestamp ?? Date.now(),
          payload: {
            kind,
            ...(text !== undefined ? { text } : {}),
            role,
            ...(tag !== undefined ? { tag } : {}),
            ...(dimension !== undefined ? { dimension } : {}),
            ...(toolId !== undefined ? { toolId } : {}),
            agentId: ev.agentId,
          },
        });
      } catch {
        // relay 失败不拖死 run
      }
    };

    const Researcher = resolveAgentSpec("playground.researcher");
    const Reconciler = resolveAgentSpec("playground.reconciler");
    const Analyst = resolveAgentSpec("playground.analyst");
    const Writer = resolveAgentSpec("playground.writer");
    const Reviewer = resolveAgentSpec("playground.reviewer");
    if (!Researcher || !Analyst || !Writer) {
      return {
        status: "failed",
        stageOutputs: {},
        error: "deep-insight core agents unavailable in registry",
      };
    }

    let totalTokens = 0;
    let totalCostCents = 0;
    const tally = (t: { total: number }, c: number) => {
      totalTokens += t.total;
      totalCostCents += c;
    };

    try {
      void emit("started");

      // ── plan：拆解研究维度 ───────────────────────────────────────────────────
      void emit("stage:started", "plan", "拆解维度");
      const plan = await this.planDimensions(
        topic,
        billing("plan"),
        preferredModelId,
      );
      totalTokens += plan.tokens;
      void emit("stage:completed", "plan", "拆解维度");

      // ── research：并发调研（真 web-search）────────────────────────────────────
      void emit("stage:started", "research", "并发调研");
      const outcomes = await Promise.all(
        plan.dimensions.map(async (d) => {
          // 发送 lifecycle-started 启动卡片
          void ctx.onEvent?.({
            type: "agent-trace",
            stepId: "research",
            label: d.name,
            timestamp: Date.now(),
            payload: {
              kind: "lifecycle-started",
              role: "researcher",
              dimension: d.name,
              phase: "started",
            },
          });
          try {
            const r = await this.agentRunner.run(
              Researcher,
              { topic, dimension: d.name, language, withFigures: false },
              {
                userId,
                ...(preferredModelId ? { preferredModelId } : {}),
                onEvent: (ev: IAgentEvent) => {
                  relayAgentEvent("research", "researcher", d.name, ev);
                },
              },
            );
            void emit("agent-lifecycle", "research", d.name, {
              agentId: "researcher",
              dimension: d.name,
              role: "researcher",
              phase: r.state === "completed" ? "completed" : "failed",
              state: r.state,
              tokensUsed: r.tokensUsed.total,
              costCents: r.costCents,
              modelTrail: r.modelTrail,
            });
            return { dimension: d.name, output: r.output, ok: true, t: r };
          } catch (err) {
            this.log.warn(
              `researcher "${d.name}" failed: ${err instanceof Error ? err.message : String(err)}`,
            );
            void emit("agent-lifecycle", "research", d.name, {
              agentId: "researcher",
              dimension: d.name,
              role: "researcher",
              phase: "failed",
              state: "failed",
            });
            return { dimension: d.name, output: null, ok: false, t: null };
          }
        }),
      );
      for (const o of outcomes)
        if (o.ok && o.t) tally(o.t.tokensUsed, o.t.costCents);
      const researcherResults = outcomes
        .filter((o) => o.ok)
        .map((o) => o.output);
      if (researcherResults.length === 0) {
        void emit("stage:failed", "research", "并发调研");
        return {
          status: "failed",
          stageOutputs: { plan },
          error: "deep-insight: all researchers failed",
        };
      }
      void emit("stage:completed", "research", "并发调研");

      // ── reconcile：跨维对账（可降级）──────────────────────────────────────────
      void emit("stage:started", "reconcile", "跨维对账");
      let rec: ReconResult | null = null;
      if (Reconciler) {
        void ctx.onEvent?.({
          type: "agent-trace",
          stepId: "reconcile",
          label: "跨维对账",
          timestamp: Date.now(),
          payload: {
            kind: "lifecycle-started",
            role: "reconciler",
            phase: "started",
          },
        });
        try {
          const r = await this.agentRunner.run(
            Reconciler,
            { topic, language, plan, researcherResults },
            {
              userId,
              ...(preferredModelId ? { preferredModelId } : {}),
              onEvent: (ev: IAgentEvent) => {
                relayAgentEvent("reconcile", "reconciler", undefined, ev);
              },
            },
          );
          rec = r.output as ReconResult;
          tally(r.tokensUsed, r.costCents);
          void emit("agent-lifecycle", "reconcile", "跨维对账", {
            agentId: "reconciler",
            role: "reconciler",
            phase: r.state === "completed" ? "completed" : "failed",
            state: r.state,
            tokensUsed: r.tokensUsed.total,
            costCents: r.costCents,
            modelTrail: r.modelTrail,
          });
        } catch (err) {
          this.log.warn(
            `reconciler failed (degrade): ${err instanceof Error ? err.message : String(err)}`,
          );
        }
      }
      void emit("stage:completed", "reconcile", "跨维对账");

      // ── analyze：综合洞察 ────────────────────────────────────────────────────
      void emit("stage:started", "analyze", "综合分析");
      void ctx.onEvent?.({
        type: "agent-trace",
        stepId: "analyze",
        label: "综合分析",
        timestamp: Date.now(),
        payload: {
          kind: "lifecycle-started",
          role: "analyst",
          phase: "started",
        },
      });
      const analystRes = await this.agentRunner.run(
        Analyst,
        {
          topic,
          language,
          researcherResults,
          reconciliationReport: {
            reconciliationReport: rec?.reconciliationReport ?? "",
            factTable: rec?.factTable ?? [],
            overlaps: rec?.overlaps ?? [],
            gaps: rec?.gaps ?? [],
          },
        },
        {
          userId,
          ...(preferredModelId ? { preferredModelId } : {}),
          onEvent: (ev: IAgentEvent) => {
            relayAgentEvent("analyze", "analyst", undefined, ev);
          },
        },
      );
      tally(analystRes.tokensUsed, analystRes.costCents);
      void emit("agent-lifecycle", "analyze", "综合分析", {
        agentId: "analyst",
        role: "analyst",
        phase: analystRes.state === "completed" ? "completed" : "failed",
        state: analystRes.state,
        tokensUsed: analystRes.tokensUsed.total,
        costCents: analystRes.costCents,
        modelTrail: analystRes.modelTrail,
      });
      const analysis = analystRes.output as {
        insights: unknown[];
        themeSummary?: string;
        contradictions?: unknown[];
      };
      void emit("stage:completed", "analyze", "综合分析");

      // ── write：撰写报告 ──────────────────────────────────────────────────────
      void emit("stage:started", "write", "撰写报告");
      void ctx.onEvent?.({
        type: "agent-trace",
        stepId: "write",
        label: "撰写报告",
        timestamp: Date.now(),
        payload: {
          kind: "lifecycle-started",
          role: "writer",
          phase: "started",
        },
      });
      const writerRes = await this.agentRunner.run(
        Writer,
        {
          topic,
          depth,
          language,
          insights: analysis.insights,
          themeSummary: analysis.themeSummary ?? plan.themeSummary,
          ...(analysis.contradictions
            ? { contradictions: analysis.contradictions }
            : {}),
        },
        {
          userId,
          ...(preferredModelId ? { preferredModelId } : {}),
          onEvent: (ev: IAgentEvent) => {
            relayAgentEvent("write", "writer", undefined, ev);
          },
        },
      );
      tally(writerRes.tokensUsed, writerRes.costCents);
      void emit("agent-lifecycle", "write", "撰写报告", {
        agentId: "writer",
        role: "writer",
        phase: writerRes.state === "completed" ? "completed" : "failed",
        state: writerRes.state,
        tokensUsed: writerRes.tokensUsed.total,
        costCents: writerRes.costCents,
        modelTrail: writerRes.modelTrail,
      });
      const report = writerRes.output;
      void emit("stage:completed", "write", "撰写报告");

      // ── review：质量评审（可降级）────────────────────────────────────────────
      void emit("stage:started", "review", "质量评审");
      let reviewerOutput: unknown = null;
      if (Reviewer) {
        void ctx.onEvent?.({
          type: "agent-trace",
          stepId: "review",
          label: "质量评审",
          timestamp: Date.now(),
          payload: {
            kind: "lifecycle-started",
            role: "reviewer",
            phase: "started",
          },
        });
        try {
          const r = await this.agentRunner.run(
            Reviewer,
            { topic, language, draftReport: report },
            {
              userId,
              ...(preferredModelId ? { preferredModelId } : {}),
              onEvent: (ev: IAgentEvent) => {
                relayAgentEvent("review", "reviewer", undefined, ev);
              },
            },
          );
          tally(r.tokensUsed, r.costCents);
          reviewerOutput = r.output;
          void emit("agent-lifecycle", "review", "质量评审", {
            agentId: "reviewer",
            role: "reviewer",
            phase: r.state === "completed" ? "completed" : "failed",
            state: r.state,
            tokensUsed: r.tokensUsed.total,
            costCents: r.costCents,
            modelTrail: r.modelTrail,
          });
        } catch (err) {
          this.log.warn(
            `reviewer failed (degrade): ${err instanceof Error ? err.message : String(err)}`,
          );
        }
      }
      void emit("stage:completed", "review", "质量评审");

      void emit("completed");

      // 组装各维度 pipeline 状态（按 dimension id 索引）
      const dimensionPipelines: Record<
        string,
        {
          agentId: string;
          state: string;
          tokensUsed?: number;
          costCents?: number;
          modelTrail?: readonly {
            modelId: string;
            promptTokens: number;
            completionTokens: number;
          }[];
        }
      > = {};
      for (const o of outcomes) {
        if (o.ok && o.t) {
          dimensionPipelines[o.dimension] = {
            agentId: "researcher",
            state: o.t.state,
            tokensUsed: o.t.tokensUsed.total,
            costCents: o.t.costCents,
            modelTrail: o.t.modelTrail,
          };
        }
      }

      // 从 reviewer 产出中抽取 verdicts（结构不定，保持容错）
      const verdicts = this.extractVerdicts(reviewerOutput);

      return {
        status: "completed",
        report: this.assembleReport(report),
        references: this.extractReferences(researcherResults),
        stageOutputs: {
          plan,
          report,
          reconciliation: rec,
          analysis,
        },
        usage: { totalTokens, totalCostCents },
        dimensionPipelines,
        verdicts,
        byStage: {
          plan,
          reconciliation: rec,
          analysis,
          review: reviewerOutput,
        },
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : "unknown error";
      this.log.error(`deep-insight run failed: ${message}`);
      void emit("failed");
      return {
        status: "failed",
        stageOutputs: {},
        usage: { totalTokens, totalCostCents },
        error: message,
      };
    }
  }

  /** plan：把 topic 拆成 2–4 个研究维度（结构化 LLM；带 billing.userId 走严格 BYOK）。 */
  private async planDimensions(
    topic: string,
    billing: { userId: string; moduleType: string; operationType: string },
    preferredModelId?: string,
  ): Promise<PlanResult> {
    const systemPrompt = [
      "You are a research lead. Break the topic into 2-4 distinct, non-overlapping research dimensions.",
      'Respond ONLY with JSON: {"themeSummary": string, "dimensions": [{"id": string, "name": string, "rationale": string}]}.',
    ].join(" ");
    const res = await this.chatFacade.chat({
      messages: [{ role: "user", content: `Topic: ${topic}` }],
      systemPrompt,
      taskProfile: { creativity: "low", outputLength: "short" },
      modelType: AIModelType.CHAT,
      operationName: "deep-insight-plan",
      billing,
      // 用户选定的真实 model id 透传（空字符串视为未设置，符合"fallback 用空串"红线）
      ...(preferredModelId ? { model: preferredModelId } : {}),
    });
    const parsed = this.safeParseJson(res.content);
    const rawDims = Array.isArray(parsed?.dimensions) ? parsed.dimensions : [];
    const dimensions = rawDims
      .filter(
        (d): d is { id?: unknown; name: string; rationale?: unknown } =>
          !!d && typeof (d as { name?: unknown }).name === "string",
      )
      .slice(0, 4)
      .map((d, i) => ({
        id: typeof d.id === "string" ? d.id : `dim-${i + 1}`,
        name: String(d.name),
        rationale: typeof d.rationale === "string" ? d.rationale : "",
      }));
    if (dimensions.length === 0)
      dimensions.push({ id: "dim-1", name: topic, rationale: "" });
    return {
      themeSummary:
        typeof parsed?.themeSummary === "string" ? parsed.themeSummary : topic,
      dimensions,
      tokens: res.tokensUsed ?? 0,
    };
  }

  private safeParseJson(
    text: string,
  ): { themeSummary?: unknown; dimensions?: unknown } | null {
    try {
      const m = text.match(/\{[\s\S]*\}/);
      return m ? (JSON.parse(m[0]) as Record<string, unknown>) : null;
    } catch {
      return null;
    }
  }

  private extractReferences(
    researcherResults: unknown[],
  ): Array<{ source: string; title?: string; snippet?: string }> {
    const seen = new Set<string>();
    const refs: Array<{ source: string; title?: string; snippet?: string }> =
      [];
    for (const rr of researcherResults) {
      const r = rr as {
        findings?: Array<{
          source?: string;
          sourceTitle?: string;
          sourceSnippet?: string;
        }>;
      };
      for (const f of r.findings ?? []) {
        const src = f.source;
        if (!src || seen.has(src)) continue;
        seen.add(src);
        refs.push({
          source: src,
          title: f.sourceTitle,
          snippet: f.sourceSnippet,
        });
      }
    }
    return refs;
  }

  /** 从 reviewer 输出中容错提取 verdict 列表。 */
  private extractVerdicts(
    reviewerOutput: unknown,
  ): Array<{ dimension?: string; score?: number; comment?: string }> {
    if (!reviewerOutput || typeof reviewerOutput !== "object") return [];
    const r = reviewerOutput as Record<string, unknown>;
    if (Array.isArray(r.verdicts)) {
      return (r.verdicts as unknown[])
        .filter((v) => !!v && typeof v === "object")
        .map((v) => {
          const vr = v as Record<string, unknown>;
          return {
            ...(typeof vr.dimension === "string"
              ? { dimension: vr.dimension }
              : {}),
            ...(typeof vr.score === "number" ? { score: vr.score } : {}),
            ...(typeof vr.comment === "string" ? { comment: vr.comment } : {}),
          };
        });
    }
    return [];
  }

  private assembleReport(report: unknown): string {
    const r = report as {
      title?: string;
      sections?: { heading?: string; body?: string }[];
    } | null;
    if (r?.sections && Array.isArray(r.sections)) {
      const parts: string[] = [];
      if (r.title) parts.push(`# ${r.title}`);
      for (const s of r.sections) {
        if (s.heading) parts.push(`## ${s.heading}`);
        if (s.body) parts.push(s.body);
      }
      if (parts.length) return parts.join("\n\n");
    }
    return typeof report === "string" ? report : JSON.stringify(report ?? null);
  }
}
