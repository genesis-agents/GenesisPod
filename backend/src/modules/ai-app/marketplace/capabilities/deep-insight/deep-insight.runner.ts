/**
 * DeepInsightDefaultRunner —— deep-insight 能力的**默认执行实现**（平台共享）。
 *
 * W2（2026-06-09 能力即产品）重构：run() 从「手写 6 阶段」升级为
 * 「MissionPipelineOrchestrator + recipe(13-step config) + 共享 @DefineAgent」跑
 * 真 14 阶段执行内核。
 *
 * 定位（docs/architecture/capability-execution-architecture.md §1 / §2 / §4）：
 *   - 执行内核（StageBindings）住能力家 pipeline/，跑 harness 原语 + 共享 agent，
 *     **零 app import**；中间态全程走 harness CrossStageState（deep-insight.* 前缀），
 *     零 app DB。
 *   - 消费方（company / playground / 未来 app）只经 ICapabilityRunner 消费，注入
 *     自己的 MissionPersistencePort + onEvent；缺 persistence → 用内存端口纯跑不落库。
 *   - 持久化（checkpoint/resume + 终态仲裁）经 ctx.persistence 端口由消费方落库；
 *     能力内核不直连任何 store。
 */
import { Injectable, Logger, type OnModuleInit } from "@nestjs/common";
import {
  AgentRunner,
  ChatFacade,
  CapabilityRegistry,
  MissionPipelineOrchestrator,
  MissionPipelineRegistry,
  CrossStageState,
  type CapabilityManifest,
  type ICapabilityRunner,
  type CapabilityRunInput,
  type CapabilityRunContext,
  type CapabilityRunResult,
  type PipelineMissionEvent,
  type MissionPersistencePort,
  type MissionTerminalDetails,
} from "./runner-deps";
import { DEEP_INSIGHT_PIPELINE } from "./recipe/deep-insight.recipe";
import {
  DeepInsightStageBindings,
  attachState,
  detachState,
} from "./pipeline/bindings";
import {
  CS_KEY,
  type AgentInvocation,
  type DeepInsightPipelineInput,
} from "./pipeline/ports";

/** 能力家自洽的 pipeline 注册 id（与 playground 私有注册 id="playground" 区分）。 */
const DEEP_INSIGHT_PIPELINE_ID = "deep-insight";

const MANIFEST: CapabilityManifest = {
  id: "deep-insight",
  version: "1.0.0",
  kind: "workflow",
  title: "深度洞察研究",
  description:
    "Leader 领衔的多角色深度研究 14 阶段执行内核：预算闸 → 规划 → 并行调研 → " +
    "Leader 评估 → 跨维对账 → 综合分析 → 大纲 → 成稿 → 质量增强 → 元批评 → " +
    "客观评估 → Leader 序言签发 → 持久化。",
  roles: [
    "leader",
    "researcher",
    "reconciler",
    "analyst",
    "writer",
    "reviewer",
    "verifier",
    "steward",
  ],
  stages: [
    "预算闸",
    "Leader 规划",
    "并行调研",
    "Leader 评估",
    "跨维对账",
    "综合分析",
    "大纲规划",
    "报告初稿",
    "质量增强",
    "元批评",
    "客观评估",
    "Leader 序言签发",
    "最终持久化",
  ],
  missionType: "deep-insight",
  permissions: ["web-search"],
  rubric: { passThreshold: 60, maxAttempts: 2 },
};

/** stepId（recipe 13 step）→ 中文 label（事件展示用）。 */
const STEP_LABEL: Record<string, string> = {
  "s1-budget": "预算闸",
  "s2-leader-plan": "Leader 规划",
  "s3-researcher-collect": "并行调研",
  "s4-leader-assess": "Leader 评估",
  "s5-reconciler": "跨维对账",
  "s6-analyst": "综合分析",
  "s7-writer-outline": "大纲规划",
  "s8-writer": "报告初稿",
  "s8b-quality-enhancement": "质量增强",
  "s9-critic": "元批评",
  "s9b-objective-eval": "客观评估",
  "s10-leader-foreword-signoff": "Leader 序言签发",
  "s11-persist": "最终持久化",
};

@Injectable()
export class DeepInsightDefaultRunner
  implements ICapabilityRunner, OnModuleInit
{
  readonly manifest = MANIFEST;
  private readonly log = new Logger(DeepInsightDefaultRunner.name);
  private readonly bindings: DeepInsightStageBindings;
  private pipelineRegistered = false;

  constructor(
    private readonly agentRunner: AgentRunner,
    private readonly chatFacade: ChatFacade,
    private readonly capabilityRegistry: CapabilityRegistry,
    private readonly pipelineRegistry: MissionPipelineRegistry,
    private readonly orchestrator: MissionPipelineOrchestrator,
  ) {
    void this.chatFacade; // 保留注入（plan 等结构化抽取的未来用途）；当前 14 步全走 AgentRunner。
    this.bindings = new DeepInsightStageBindings(this.agentRunner);
  }

  onModuleInit(): void {
    this.capabilityRegistry.register(this);
    this.registerPipeline();
  }

  /**
   * 据 recipe 派生 id="deep-insight" 的 config（挂能力家 bindings hooks），注册进
   * MissionPipelineRegistry（一次性）。
   *
   * 不直接注册 recipe 本体（其 id="playground" 由 playground onModuleInit 注册，
   * W2 不接消费方 → 避免重复注册同 id 碰撞）。hooks 内部从 ctx.input.invocation 取
   * per-run 数据，故 bindings 无状态、config 只注册一次。
   */
  private registerPipeline(): void {
    if (
      this.pipelineRegistered ||
      this.pipelineRegistry.has(DEEP_INSIGHT_PIPELINE_ID)
    ) {
      this.pipelineRegistered = true;
      return;
    }
    const stepsWithHooks = DEEP_INSIGHT_PIPELINE.steps.map((step) => ({
      ...step,
      hooks: this.bindings.buildHooksForStep(step.id),
    }));
    this.pipelineRegistry.register({
      ...DEEP_INSIGHT_PIPELINE,
      id: DEEP_INSIGHT_PIPELINE_ID,
      steps: stepsWithHooks,
    });
    this.pipelineRegistered = true;
  }

  async run(
    input: CapabilityRunInput,
    ctx: CapabilityRunContext,
  ): Promise<CapabilityRunResult> {
    const topic = input.topic;
    const language = input.language ?? "zh-CN";
    const { userId, missionId } = ctx;
    const persistence = ctx.persistence ?? new InMemoryPersistencePort();

    // per-run agent 调用上下文（透传 RunOptions + 实时 agent 事件 relay）。
    const invocation: AgentInvocation = {
      userId,
      ...(input.preferredModelId
        ? { preferredModelId: input.preferredModelId }
        : {}),
      ...(input.withFigures !== undefined
        ? { withFigures: input.withFigures }
        : {}),
      ...(input.knowledgeBaseIds?.length
        ? { knowledgeBaseIds: [...input.knowledgeBaseIds] }
        : {}),
      ...(input.searchTimeRange
        ? { searchTimeRange: input.searchTimeRange }
        : {}),
      ...(input.description ? { description: input.description } : {}),
      ...(input.depth ? { depth: input.depth } : {}),
      onAgentEvent: (stepId, role, dimension, ev) => {
        try {
          this.relayAgentEvent(ctx, stepId, role, dimension, ev);
        } catch {
          // relay 失败不拖死 run。
        }
      },
    };

    const pipelineInput: DeepInsightPipelineInput = {
      topic,
      language,
      invocation,
    };

    // 中间态 crossStageState：缺省新建；有 checkpoint 则 hydrate（crash-resume）。
    let crossStageState = new CrossStageState();
    let resumeFromStepId: string | undefined;
    try {
      const cp = await persistence.loadCheckpoint(missionId);
      if (cp) {
        crossStageState = CrossStageState.fromJSON({ ...cp.crossState });
        resumeFromStepId = cp.lastStepId;
      }
    } catch (err) {
      this.log.warn(
        `[deep-insight ${missionId}] loadCheckpoint failed (ignore, run fresh): ${this.errMsg(err)}`,
      );
    }

    // 把 crossStageState 绑到 missionId，hooks 内据 ctx.missionId 取回。
    attachState(missionId, crossStageState);

    try {
      const result = await this.orchestrator.run<DeepInsightPipelineInput>({
        missionId,
        pipelineId: DEEP_INSIGHT_PIPELINE_ID,
        input: pipelineInput,
        userId,
        ...(ctx.signal ? { signal: ctx.signal } : {}),
        ...(resumeFromStepId ? { resumeFromStepId } : {}),
        initialCrossStageState: crossStageState.toJSON(),
        onEvent: (ev) =>
          this.bridgeMissionEvent(ctx, persistence, crossStageState, ev, topic),
      });

      // 终态产物全在 runner 持有的 crossStageState（bindings 全程写它，经 attachState
      // 据 missionId 取回同一引用）；orchestrator 内部那份只承载 primitive 自身的
      // decision 记账，不含业务产物，故直接用 runner 这份。
      const finalState = crossStageState;

      if (result.status === "completed") {
        // 调研全失败兜底：research primitive 用 allSettled 吞单维失败，整 stage 仍
        // completed；但无任何有效 researcher 产出时不能伪装成功（与旧 6 步契约一致）。
        const researcherResults =
          finalState.get<unknown[]>(CS_KEY.researcherResults) ?? [];
        if (researcherResults.length === 0) {
          const errorMessage =
            "调研阶段未产出有效结果：所有 researcher 都没拿到可用资料" +
            "（通常是网页搜索全部不可用 / 模型未在限定步数内完成）。";
          await this.applyTerminal(persistence, missionId, "failed", {
            errorMessage,
            tokensUsed: this.usage(finalState).totalTokens,
            costCents: this.usage(finalState).totalCostCents,
          });
          return {
            status: "failed",
            stageOutputs: this.collectStageOutputs(finalState),
            usage: this.usage(finalState),
            error: errorMessage,
          };
        }
        return await this.assembleCompleted(missionId, finalState, persistence);
      }
      // failed / aborted
      const outcome = result.status === "aborted" ? "cancelled" : "failed";
      const errorMessage = this.errMsg(result.error);
      await this.applyTerminal(persistence, missionId, outcome, {
        errorMessage,
        tokensUsed: finalState.get<number>(CS_KEY.tokensUsed) ?? 0,
        costCents: finalState.get<number>(CS_KEY.costCents) ?? 0,
      });
      return {
        status: "failed",
        stageOutputs: this.collectStageOutputs(finalState),
        usage: this.usage(finalState),
        error: errorMessage || "deep-insight pipeline 未完成",
      };
    } catch (err) {
      const errorMessage = this.errMsg(err);
      this.log.error(`[deep-insight ${missionId}] run failed: ${errorMessage}`);
      await this.applyTerminal(persistence, missionId, "failed", {
        errorMessage,
      });
      return {
        status: "failed",
        stageOutputs: {},
        error: errorMessage,
      };
    } finally {
      detachState(missionId);
    }
  }

  /** 终态组装（completed）：从 crossStageState 取产物 + 落库 + 返回 CapabilityRunResult。 */
  private async assembleCompleted(
    missionId: string,
    state: CrossStageState,
    persistence: MissionPersistencePort,
  ): Promise<CapabilityRunResult> {
    const report = state.get(CS_KEY.report);
    const reportArtifact = state.get(CS_KEY.reportArtifact);
    const plan = state.get<{
      themeSummary?: string;
      dimensions?: unknown[];
    }>(CS_KEY.plan);
    const researcherResults =
      state.get<unknown[]>(CS_KEY.researcherResults) ?? [];
    const reviewVerdict = state.get<{
      score?: number;
      verdict?: "approve" | "revise" | "reject";
      notes?: string[];
    }>(CS_KEY.reviewVerdict);
    const leaderSignOff = state.get(CS_KEY.leaderSignOff);
    const verdicts = state.get(CS_KEY.verifierVerdicts);
    const usage = this.usage(state);

    await this.applyTerminal(persistence, missionId, "completed", {
      report,
      reportArtifact,
      themeSummary: plan?.themeSummary,
      dimensions: plan?.dimensions,
      verdicts,
      leaderSignOff,
      ...(reviewVerdict?.score !== undefined
        ? { finalScore: reviewVerdict.score }
        : {}),
      tokensUsed: usage.totalTokens,
      costCents: usage.totalCostCents,
    });
    await persistence.clearCheckpoint(missionId).catch((err) => {
      this.log.warn(
        `[deep-insight ${missionId}] clearCheckpoint failed (non-fatal): ${this.errMsg(err)}`,
      );
    });

    return {
      status: "completed",
      report: this.assembleReport(report),
      references: this.extractReferences(researcherResults),
      stageOutputs: this.collectStageOutputs(state),
      usage,
      ...(verdicts ? { verdicts: this.normalizeVerdicts(verdicts) } : {}),
      ...(reviewVerdict ? { reviewVerdict } : {}),
    };
  }

  /** 把 harness MissionEvent 翻译成 CapabilityRunEvent，调 ctx.onEvent 上抛 + 推进 checkpoint。 */
  private bridgeMissionEvent(
    ctx: CapabilityRunContext,
    persistence: MissionPersistencePort,
    crossStageState: CrossStageState,
    ev: PipelineMissionEvent,
    topic: string,
  ): void {
    const stepId = ev.stepId;
    const label = stepId ? STEP_LABEL[stepId] : undefined;
    const baseTelemetry = stepId ? { systemStageId: stepId } : undefined;
    switch (ev.type) {
      case "mission:started":
        void ctx.onEvent?.({ type: "started", timestamp: ev.timestamp });
        break;
      case "stage:started":
        void ctx.onEvent?.({
          type: "stage:started",
          ...(stepId ? { stepId } : {}),
          ...(label ? { label } : {}),
          timestamp: ev.timestamp,
          ...(baseTelemetry ? { telemetry: baseTelemetry } : {}),
        });
        break;
      case "stage:completed":
        void ctx.onEvent?.({
          type: "stage:completed",
          ...(stepId ? { stepId } : {}),
          ...(label ? { label } : {}),
          timestamp: ev.timestamp,
          ...(baseTelemetry ? { telemetry: baseTelemetry } : {}),
        });
        // milestone checkpoint：每个 stage 完成后存盘（crash-resume 用，fire-and-forget）。
        if (stepId) {
          void persistence
            .markStageProgress(ctx.missionId, stepId)
            .catch(() => undefined);
          void persistence
            .saveCheckpoint(ctx.missionId, {
              lastStepId: stepId,
              topic,
              crossState: crossStageState.toJSON(),
            })
            .catch(() => undefined);
        }
        break;
      case "stage:failed":
        void ctx.onEvent?.({
          type: "stage:failed",
          ...(stepId ? { stepId } : {}),
          ...(label ? { label } : {}),
          timestamp: ev.timestamp,
          ...(baseTelemetry ? { telemetry: baseTelemetry } : {}),
        });
        break;
      case "stage:degraded":
        void ctx.onEvent?.({
          type: "stage:degraded",
          ...(stepId ? { stepId } : {}),
          ...(label ? { label } : {}),
          timestamp: ev.timestamp,
          ...(ev.reason ? { payload: { reason: ev.reason } } : {}),
          ...(baseTelemetry ? { telemetry: baseTelemetry } : {}),
        });
        break;
      case "stage:stalled":
        void ctx.onEvent?.({
          type: "stage:stalled",
          ...(stepId ? { stepId } : {}),
          ...(label ? { label } : {}),
          timestamp: ev.timestamp,
          ...(ev.reason ? { payload: { reason: ev.reason } } : {}),
          ...(baseTelemetry ? { telemetry: baseTelemetry } : {}),
        });
        break;
      case "mission:completed":
        void ctx.onEvent?.({ type: "completed", timestamp: ev.timestamp });
        break;
      case "mission:failed":
      case "mission:aborted":
        void ctx.onEvent?.({ type: "failed", timestamp: ev.timestamp });
        break;
      default:
        break;
    }
  }

  /** IAgentEvent → CapabilityRunEvent(agent-trace) relay。 */
  private relayAgentEvent(
    ctx: CapabilityRunContext,
    stepId: string,
    role: string,
    dimension: string | undefined,
    ev: import("./runner-deps").IAgentEvent,
  ): void {
    let kind: string;
    let text: string | undefined;
    let tag: string | undefined;
    let toolId: string | undefined;
    switch (ev.type) {
      case "thinking": {
        kind = "thinking";
        const p = ev.payload as { text?: string; content?: string } | undefined;
        text = p?.text ?? p?.content;
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
        const p = ev.payload as { action?: { toolId?: string } } | undefined;
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
        return;
    }
    void ctx.onEvent?.({
      type: "agent-trace",
      stepId,
      ...(dimension ? { label: dimension } : {}),
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
      telemetry: { systemStageId: stepId, ...(dimension ? { dimension } : {}) },
    });
  }

  private async applyTerminal(
    persistence: MissionPersistencePort,
    missionId: string,
    outcome: "completed" | "failed" | "cancelled",
    details: MissionTerminalDetails,
  ): Promise<void> {
    try {
      await persistence.applyTerminalIfRunning(missionId, outcome, details);
    } catch (err) {
      this.log.warn(
        `[deep-insight ${missionId}] applyTerminalIfRunning(${outcome}) failed (non-fatal): ${this.errMsg(err)}`,
      );
    }
  }

  private usage(state: CrossStageState): {
    totalTokens: number;
    totalCostCents: number;
  } {
    return {
      totalTokens: state.get<number>(CS_KEY.tokensUsed) ?? 0,
      totalCostCents: state.get<number>(CS_KEY.costCents) ?? 0,
    };
  }

  private collectStageOutputs(
    state: CrossStageState,
  ): Readonly<Record<string, unknown>> {
    return {
      plan: state.get(CS_KEY.plan) ?? null,
      researcherResults: state.get(CS_KEY.researcherResults) ?? [],
      reconciliation: state.get(CS_KEY.reconciliationReport) ?? null,
      analysis: state.get(CS_KEY.analystOutput) ?? null,
      report: state.get(CS_KEY.report) ?? null,
      reviewScore: state.get(CS_KEY.reviewScore) ?? null,
      leaderSignOff: state.get(CS_KEY.leaderSignOff) ?? null,
    };
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
          ...(f.sourceTitle ? { title: f.sourceTitle } : {}),
          ...(f.sourceSnippet ? { snippet: f.sourceSnippet } : {}),
        });
      }
    }
    return refs;
  }

  private normalizeVerdicts(
    verdicts: unknown,
  ): Array<{ dimension?: string; score?: number; comment?: string }> {
    if (!verdicts || typeof verdicts !== "object") return [];
    const arr = Array.isArray(verdicts)
      ? verdicts
      : (verdicts as { verdicts?: unknown[] }).verdicts;
    if (!Array.isArray(arr)) return [];
    return arr
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

  private assembleReport(report: unknown): string {
    const r = report as {
      title?: string;
      sections?: { heading?: string; title?: string; body?: string }[];
    } | null;
    if (r?.sections && Array.isArray(r.sections)) {
      const parts: string[] = [];
      if (r.title) parts.push(`# ${r.title}`);
      for (const s of r.sections) {
        const heading = s.heading ?? s.title;
        if (heading) parts.push(`## ${heading}`);
        if (s.body) parts.push(s.body);
      }
      if (parts.length) return parts.join("\n\n");
    }
    return typeof report === "string" ? report : JSON.stringify(report ?? null);
  }

  private errMsg(err: unknown): string {
    return err instanceof Error ? err.message : String(err ?? "");
  }
}

/**
 * 内存持久化端口（缺 ctx.persistence 时的纯跑 fallback）。
 *
 * 不落任何 app DB：checkpoint 存内存 Map，终态仲裁恒返回 true（无并发竞争）。
 * 用于「无消费方宿主」的纯执行 / 单测探针（断言 0 真实 DB 写）。
 */
class InMemoryPersistencePort implements MissionPersistencePort {
  private readonly checkpoints = new Map<
    string,
    {
      lastStepId: string;
      topic: string;
      crossState: Readonly<Record<string, unknown>>;
    }
  >();

  markStageProgress(): Promise<void> {
    // no-op（内存纯跑无需进度索引）。
    return Promise.resolve();
  }

  saveCheckpoint(
    missionId: string,
    snapshot: {
      lastStepId: string;
      topic: string;
      crossState: Readonly<Record<string, unknown>>;
    },
  ): Promise<boolean> {
    this.checkpoints.set(missionId, snapshot);
    return Promise.resolve(true);
  }

  loadCheckpoint(missionId: string): Promise<{
    lastStepId: string;
    topic: string;
    crossState: Readonly<Record<string, unknown>>;
  } | null> {
    return Promise.resolve(this.checkpoints.get(missionId) ?? null);
  }

  clearCheckpoint(missionId: string): Promise<void> {
    this.checkpoints.delete(missionId);
    return Promise.resolve();
  }

  applyTerminalIfRunning(): Promise<boolean> {
    return Promise.resolve(true);
  }
}
