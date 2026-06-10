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
  ReportArtifactAssembler,
  SectionSelfEvalService,
  SectionRemediationService,
  ReportEvaluationService,
  QualityTraceComputeService,
  FigureRelevanceService,
  PostmortemClassifierService,
  type CapabilityManifest,
  type ICapabilityRunner,
  type CapabilityRunInput,
  type CapabilityRunContext,
  type CapabilityRunResult,
  type PipelineMissionEvent,
  type MissionPersistencePort,
  type MissionTerminalDetails,
} from "./runner-deps";
import {
  fireSelfEvolutionPostlude,
  type SelfEvolutionPostludeDeps,
} from "./postlude/self-evolution.postlude";
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

/** env3 事件 ring buffer 上限（防超大 mission 内存压力）。run() 与 bridgeMissionEvent 共享单一源。 */
const EVENT_BUFFER_MAX = 500;

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
    // ★ W2.5 富增强：harness 评判 / 富组装原语（全 @Global HarnessModule 提供，DI 自动注入）。
    private readonly reportArtifactAssembler: ReportArtifactAssembler,
    private readonly sectionSelfEval: SectionSelfEvalService,
    private readonly sectionRemediation: SectionRemediationService,
    private readonly reportEvaluation: ReportEvaluationService,
    private readonly qualityTrace: QualityTraceComputeService,
    // ★ figure re-home：embedding 相关性精排（engine 层，经 facade 注入，R1-safe）。
    private readonly figureRelevance: FigureRelevanceService,
    // ★ S12 自进化 postlude：postmortem 分类（harness 共享，@Global HarnessModule 提供）。
    private readonly postmortemClassifier: PostmortemClassifierService,
  ) {
    void this.chatFacade; // 保留注入（plan 等结构化抽取的未来用途）；当前 14 步全走 AgentRunner。
    this.bindings = new DeepInsightStageBindings(this.agentRunner, {
      reportArtifactAssembler: this.reportArtifactAssembler,
      sectionSelfEval: this.sectionSelfEval,
      sectionRemediation: this.sectionRemediation,
      reportEvaluation: this.reportEvaluation,
      qualityTrace: this.qualityTrace,
      figureRelevance: this.figureRelevance,
    });
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
    const persistence: MissionPersistencePort =
      ctx.persistence ?? new InMemoryPersistencePort();
    // S12 postlude 需要 run 起始时间（用于 wallTimeMs 计算）。
    const runStartedAt = Date.now();

    // ★ env5 recall + checkpoint：两个独立 IO 可并行，节省 run() 启动延迟。
    // ★ Fix C5/5c（2026-06-09）：Promise.all 并行跑，仅在两者都完成后再继续。
    let priorPostmortems: ReadonlyArray<{
      missionId: string;
      topic: string;
      summary: string;
      recommendations: string[];
      leaderSigned: boolean | null;
      qualityScore: number | null;
      createdAt: string;
    }> = [];
    let checkpointResult: {
      lastStepId: string;
      topic: string;
      crossState: Readonly<Record<string, unknown>>;
    } | null = null;

    const [recallOutcome, checkpointOutcome] = await Promise.allSettled([
      persistence.recallPostmortems?.({ userId, topic, limit: 3 }),
      persistence.loadCheckpoint(missionId),
    ]);

    if (recallOutcome.status === "fulfilled") {
      priorPostmortems = recallOutcome.value ?? [];
    } else {
      this.log.warn(
        `[deep-insight ${missionId}] recallPostmortems failed (best-effort, ignore): ${this.errMsg(recallOutcome.reason)}`,
      );
    }
    if (checkpointOutcome.status === "fulfilled") {
      checkpointResult = checkpointOutcome.value ?? null;
    } else {
      this.log.warn(
        `[deep-insight ${missionId}] loadCheckpoint failed (ignore, run fresh): ${this.errMsg(checkpointOutcome.reason)}`,
      );
    }

    // ★ env3 事件缓冲：runner 在 run() 期间缓冲 mission/agent 事件（轻量 ring buffer），
    // postlude 时把缓冲的事件流传给 postmortemClassifier，让 DEEP_INSIGHT_POSTMORTEM_PATTERNS
    // 的 substring patterns 真正生效。
    // ★ Fix C5/5a（2026-06-09）：classifier 只读 e.type，故只存 { type, ts }；
    // 消除冗余 payload 存储（大型 agent 输出不再占 ring buffer 内存）。
    const bufferedEvents: Array<{ type: string; ts: number }> = [];

    /** ring buffer push helper（满了丢最旧的一条）。 */
    const pushBuffered = (type: string): void => {
      if (bufferedEvents.length >= EVENT_BUFFER_MAX) bufferedEvents.shift();
      bufferedEvents.push({ type, ts: Date.now() });
    };

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
      // ★ 4 档位透传（task 5）：audienceProfile / styleProfile / lengthProfile / auditLayers
      ...(input.audienceProfile
        ? { audienceProfile: input.audienceProfile }
        : {}),
      ...(input.styleProfile ? { styleProfile: input.styleProfile } : {}),
      ...(input.lengthProfile ? { lengthProfile: input.lengthProfile } : {}),
      ...(input.auditLayers?.length
        ? { auditLayers: [...input.auditLayers] }
        : {}),
      // ★ env5 priorPostmortems 透传（task 3）：让 leader plan 看到历史教训
      ...(priorPostmortems.length > 0 ? { priorPostmortems } : {}),
      onAgentEvent: (stepId, role, dimension, ev) => {
        try {
          // ★ env3 缓冲 agent 事件（ring buffer，满了丢头；只存 type+ts）
          pushBuffered(ev.type);
          this.relayAgentEvent(ctx, stepId, role, dimension, ev);
        } catch {
          // relay 失败不拖死 run。
        }
      },
      // ★ #16b domain 事件：透传 ctx.onEvent，让 bindings 经 emitDomain 发中性 domain 事件。
      onEvent: ctx.onEvent,
    };

    const pipelineInput: DeepInsightPipelineInput = {
      topic,
      language,
      invocation,
    };

    // 中间态 crossStageState：缺省新建；有 checkpoint 则 hydrate（crash-resume）。
    // ★ Fix C5/5c：checkpoint 已在上方与 recallPostmortems 并行取回，直接用 checkpointResult。
    let crossStageState = new CrossStageState();
    let resumeFromStepId: string | undefined;
    if (checkpointResult) {
      crossStageState = CrossStageState.fromJSON({
        ...checkpointResult.crossState,
      });
      resumeFromStepId = checkpointResult.lastStepId;
    }

    // ★ #16a 增量复用：消费方注入 inheritedBaseline 时，把上次 mission 可复用产物 seed 进
    //   crossStageState，让 S2/S3 命中即跳过重算。仅在非 crash-resume（无 checkpoint）时生效——
    //   crash-resume 已 hydrate 全量中间态且经 resumeFromStepId 整步跳过，不再需要 inherit。
    if (!resumeFromStepId && input.inheritedBaseline) {
      const { plan, researcherResults, sourceDepth } = input.inheritedBaseline;
      // Fix5：若 sourceDepth 存在且与本次 depth 不同，跳过 plan seed（强制 S2 重规划）。
      // 原因：维度数量与 depth 档位强相关（quick=2, standard=4, deep=6），跨档复用旧 plan
      //   会导致维度数量错配（如 quick plan 只有 2 维但 deep run 需要 6 维）。
      const currentDepth = input.depth ?? "standard";
      const depthChanged =
        sourceDepth !== undefined && sourceDepth !== currentDepth;
      if (depthChanged) {
        this.log.log(
          `[deep-insight ${missionId}] Fix5 depth 档位变更 ${sourceDepth} → ${currentDepth}：跳过 plan seed，强制 S2 重规划`,
        );
      }
      if (
        plan &&
        !depthChanged &&
        crossStageState.get(CS_KEY.plan) === undefined
      ) {
        crossStageState.set(CS_KEY.plan, plan);
      }
      if (Array.isArray(researcherResults) && researcherResults.length > 0) {
        // 暂存桶（按 dimension 索引由 S3 perItemPipeline 消费）；不直接进 researcherResults
        //   避免与 S3 fresh append 重复。
        crossStageState.set(CS_KEY.inheritedResearch, [...researcherResults]);
      }
      this.log.log(
        `[deep-insight ${missionId}] 增量复用：inheritedBaseline 已 seed（plan=${plan && !depthChanged ? "y" : "n(skipped)"}, ` +
          `research=${Array.isArray(researcherResults) ? researcherResults.length : 0} dims）`,
      );
    }

    // ★ W2.5：记录 run 起始时间戳（assembler generationTimeMs 计算用），不覆盖 resume 值。
    if (crossStageState.get<number>(CS_KEY.startedAt) === undefined) {
      crossStageState.set(CS_KEY.startedAt, Date.now());
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
          this.bridgeMissionEvent(
            ctx,
            persistence,
            crossStageState,
            ev,
            topic,
            pushBuffered,
          ),
      });

      // 终态产物全在 runner 持有的 crossStageState（bindings 全程写它，经 attachState
      // 据 missionId 取回同一引用）；orchestrator 内部那份只承载 primitive 自身的
      // decision 记账，不含业务产物，故直接用 runner 这份。
      const finalState = crossStageState;

      const postludeDeps: SelfEvolutionPostludeDeps = {
        postmortemClassifier: this.postmortemClassifier,
        log: this.log,
      };

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
          // ★ Fix C1：零 researcher 也跑 postlude（失败路径；leaderSignOff=null → mode=failed）。
          fireSelfEvolutionPostlude(
            {
              missionId,
              userId,
              topic,
              leaderSignOff: null,
              reportArtifact: null,
              plan: null,
              tokensUsed: this.usage(finalState).totalTokens,
              costCents: this.usage(finalState).totalCostCents,
              startedAt: runStartedAt,
              persistence,
              bufferedEvents,
              onEvent: ctx.onEvent,
            },
            postludeDeps,
          );
          return {
            status: "failed",
            stageOutputs: this.collectStageOutputs(finalState),
            usage: this.usage(finalState),
            error: errorMessage,
          };
        }
        return await this.assembleCompleted(
          missionId,
          userId,
          topic,
          finalState,
          persistence,
          runStartedAt,
          bufferedEvents,
          ctx.onEvent,
        );
      }
      // failed / aborted
      const outcome = result.status === "aborted" ? "cancelled" : "failed";
      const errorMessage = this.errMsg(result.error);
      await this.applyTerminal(persistence, missionId, outcome, {
        errorMessage,
        tokensUsed: finalState.get<number>(CS_KEY.tokensUsed) ?? 0,
        costCents: finalState.get<number>(CS_KEY.costCents) ?? 0,
      });
      // ★ Fix C1：failed / aborted 路径也跑 postlude（与旧 dispatcher 语义一致）。
      fireSelfEvolutionPostlude(
        {
          missionId,
          userId,
          topic,
          leaderSignOff:
            finalState.get<{ signed?: boolean }>(CS_KEY.leaderSignOff) ?? null,
          reportArtifact: null,
          plan: finalState.get(CS_KEY.plan) ?? null,
          tokensUsed: finalState.get<number>(CS_KEY.tokensUsed) ?? 0,
          costCents: finalState.get<number>(CS_KEY.costCents) ?? 0,
          startedAt: runStartedAt,
          persistence,
          bufferedEvents,
          onEvent: ctx.onEvent,
        },
        postludeDeps,
      );
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
      // ★ Fix C1：catch 路径也跑 postlude（best-effort，postlude 本身不会再抛）。
      fireSelfEvolutionPostlude(
        {
          missionId,
          userId,
          topic,
          leaderSignOff: null,
          reportArtifact: null,
          plan: null,
          tokensUsed: 0,
          costCents: 0,
          startedAt: runStartedAt,
          persistence,
          bufferedEvents,
          onEvent: ctx.onEvent,
        },
        { postmortemClassifier: this.postmortemClassifier, log: this.log },
      );
      return {
        status: "failed",
        stageOutputs: {},
        error: errorMessage,
      };
    } finally {
      detachState(missionId);
    }
  }

  /**
   * 终态组装（completed）：从 crossStageState 取产物 + 落库 + fire S12 postlude +
   * 返回 CapabilityRunResult。
   */
  private async assembleCompleted(
    missionId: string,
    userId: string,
    topic: string,
    state: CrossStageState,
    persistence: MissionPersistencePort,
    runStartedAt: number,
    bufferedEvents?: ReadonlyArray<{ type: string; ts: number }>,
    onEvent?: CapabilityRunContext["onEvent"],
  ): Promise<CapabilityRunResult> {
    const report = state.get(CS_KEY.report);
    const reportArtifact = state.get(CS_KEY.reportArtifact);
    const plan = state.get<{
      themeSummary?: string;
      dimensions?: unknown[];
      goals?: { qualityBar?: { minCoverage?: number } };
    }>(CS_KEY.plan);
    const researcherResults =
      state.get<unknown[]>(CS_KEY.researcherResults) ?? [];
    const reviewVerdict = state.get<{
      score?: number;
      verdict?: "approve" | "revise" | "reject";
      notes?: string[];
    }>(CS_KEY.reviewVerdict);
    const leaderSignOff = state.get<{ signed?: boolean }>(CS_KEY.leaderSignOff);
    const verdicts = state.get(CS_KEY.verifierVerdicts);
    const usage = this.usage(state);
    // ★ W2.5：finalScore 优先用 s10 QualityTrace 客观计算（10 维评估融合），缺则回退 reviewScore。
    const finalScore =
      state.get<number>(CS_KEY.finalScore) ?? reviewVerdict?.score;

    await this.applyTerminal(persistence, missionId, "completed", {
      report,
      reportArtifact,
      themeSummary: plan?.themeSummary,
      dimensions: plan?.dimensions,
      verdicts,
      leaderSignOff,
      ...(finalScore !== undefined ? { finalScore } : {}),
      tokensUsed: usage.totalTokens,
      costCents: usage.totalCostCents,
    });
    await persistence.clearCheckpoint(missionId).catch((err) => {
      this.log.warn(
        `[deep-insight ${missionId}] clearCheckpoint failed (non-fatal): ${this.errMsg(err)}`,
      );
    });

    // ★ trajectory 持久化（可选端口，fire-and-forget）：报告版本快照 + 逐维 research
    //   结果。没有它们：版本历史恒空、"更新"按钮的 loadBaselineResearchResults 查空
    //   → 静默退化全量重跑 S3、Drawer 关键发现无持久层。
    if (persistence.saveReportVersion && report !== undefined) {
      const ra = reportArtifact as {
        title?: string;
        summary?: string;
      } | null;
      void persistence
        .saveReportVersion({
          missionId,
          triggerType: "initial",
          reportFull: report,
          ...(ra?.title ? { reportTitle: ra.title } : {}),
          ...(ra?.summary ? { reportSummary: ra.summary } : {}),
          ...(finalScore !== undefined ? { finalScore } : {}),
          ...(leaderSignOff?.signed !== undefined
            ? { leaderSigned: leaderSignOff.signed }
            : {}),
        })
        .catch((err) => {
          this.log.warn(
            `[deep-insight ${missionId}] saveReportVersion failed (non-fatal): ${this.errMsg(err)}`,
          );
        });
    }
    if (persistence.saveResearchResult) {
      for (const raw of researcherResults) {
        const r = raw as {
          dimension?: string;
          findings?: ReadonlyArray<unknown>;
          summary?: string;
        };
        if (!r?.dimension) continue;
        void persistence
          .saveResearchResult({
            missionId,
            dimension: r.dimension,
            findings: r.findings ?? [],
            summary: r.summary ?? "",
            state: "completed",
          })
          .catch((err) => {
            this.log.warn(
              `[deep-insight ${missionId}] saveResearchResult(${r.dimension}) failed (non-fatal): ${this.errMsg(err)}`,
            );
          });
      }
    }

    // ★ S12 自进化 postlude（fire-and-forget，不阻塞终态返回）。
    // 沉淀到 harness_vector_memory（经 persistence.recordPostmortem? 端口由消费方实现）。
    fireSelfEvolutionPostlude(
      {
        missionId,
        userId,
        topic,
        leaderSignOff: leaderSignOff ?? null,
        reportArtifact: reportArtifact as {
          quality?: { overall?: number };
        } | null,
        plan: plan ?? null,
        finalScore,
        tokensUsed: usage.totalTokens,
        costCents: usage.totalCostCents,
        startedAt: runStartedAt,
        persistence,
        // ★ env3 事件流传给 postlude（让 DEEP_INSIGHT_POSTMORTEM_PATTERNS 真生效）。
        bufferedEvents,
        // ★ Fix C10：透传 onEvent，postlude 经 domain 桥发 mission:postlude:* 生命周期事件。
        onEvent,
      },
      { postmortemClassifier: this.postmortemClassifier, log: this.log },
    );

    return {
      status: "completed",
      // ★ W2.5：终稿优先用 reportArtifact.content.fullMarkdown（assembler 富组装 +
      //   50+ 格式修复 + 参考文献段），缺则回退 writer 原始 report（不退化既有契约）。
      report: this.assembleReport(reportArtifact ?? report),
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
    pushBuffered?: (type: string) => void,
  ): void {
    // ★ env3 缓冲 mission/stage 事件（ring buffer，通过外部 pushBuffered helper 写）
    pushBuffered?.(ev.type);
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
          // ★ task 4 维度持久化：s2 plan 完成后 best-effort 落维度（消费方写 store，运行中即显）。
          if (stepId === "s2-leader-plan" && persistence.recordPlanDimensions) {
            const plan = crossStageState.get<{
              dimensions?: Array<{
                id?: string;
                name: string;
                rationale?: string;
              }>;
            }>(CS_KEY.plan);
            if (plan?.dimensions?.length) {
              void persistence
                .recordPlanDimensions(ctx.missionId, plan.dimensions)
                .catch((err: unknown) => {
                  this.log.warn(
                    `[deep-insight ${ctx.missionId}] recordPlanDimensions failed (best-effort, ignore): ${this.errMsg(err)}`,
                  );
                });
            }
          }
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

  /** IAgentEvent → CapabilityRunEvent(agent-trace) relay。
   *
   * Fix3：payload 携带结构化字段（bridge 用于 tool-call timeline）：
   *   { kind, text?, toolId?, input?, output?, role, dimension?, stepId }
   * action_executed 从 IActionResult 透传 toolId + input，output 截断至 500 字。
   */
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
    let toolInput: unknown;
    let toolOutput: unknown;

    switch (ev.type) {
      case "thinking": {
        kind = "thinking";
        const p = ev.payload as { text?: string; content?: string } | undefined;
        text = p?.text ?? p?.content;
        break;
      }
      case "action_planned": {
        kind = "action_planned";
        // IActionPlannedEvent.payload 是 IAction（有 kind / toolId / input 字段）。
        const p = ev.payload as
          | {
              kind?: string;
              toolId?: string;
              input?: unknown;
              description?: string;
            }
          | undefined;
        toolId = p?.toolId;
        text =
          (p as { description?: string } | undefined)?.description ?? toolId;
        break;
      }
      case "action_executed": {
        kind = "action_executed";
        // IActionExecutedEvent.payload 是 IActionResult（action.toolId / action.input / output）。
        const p = ev.payload as
          | {
              action?: { kind?: string; toolId?: string; input?: unknown };
              output?: unknown;
            }
          | undefined;
        toolId = p?.action?.toolId;
        toolInput = p?.action?.input;
        // output 截断至 500 字（大型 observation 不洪泛 WS 总线）。
        const rawOut = p?.output;
        if (rawOut !== undefined) {
          const s =
            typeof rawOut === "string" ? rawOut : JSON.stringify(rawOut);
          toolOutput = s.length > 500 ? s.slice(0, 500) + "…" : s;
        }
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
        ...(toolInput !== undefined ? { input: toolInput } : {}),
        ...(toolOutput !== undefined ? { output: toolOutput } : {}),
        stepId,
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
      // ★ #16b S12 postlude 等价：消费方（playground）据此回灌 entry.crossState.lastReportArtifact，
      //   让 fireSelfEvolutionPostlude 拿到富报告产物（sections/quality）而非空数据。
      reportArtifact: state.get(CS_KEY.reportArtifact) ?? null,
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
      content?: { fullMarkdown?: string };
      sections?: {
        heading?: string;
        title?: string;
        body?: string;
        content?: string;
      }[];
    } | null;
    // ★ W2.5：reportArtifact 有 content.fullMarkdown（assembler 富组装产物）则直接用。
    if (
      typeof r?.content?.fullMarkdown === "string" &&
      r.content.fullMarkdown
    ) {
      return r.content.fullMarkdown;
    }
    if (r?.sections && Array.isArray(r.sections)) {
      const parts: string[] = [];
      if (r.title) parts.push(`# ${r.title}`);
      for (const s of r.sections) {
        const heading = s.heading ?? s.title;
        if (heading) parts.push(`## ${heading}`);
        const body = s.body ?? s.content;
        if (body) parts.push(body);
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
