/**
 * ICapabilityRunner —— 能力执行端口（平台共享，面向未来可插拔实现）。
 *
 * 消费方（company / 任何 app）只依赖本端口 + manifest，**不依赖具体实现**：
 *   - 今天：进程内 runner（跑 harness 通用编排器 + 共享 agent）。
 *   - 未来：同一端口可换成沙箱 / 远程 / MCP server 实现，消费方零改动。
 *
 * 执行契约刻意"纯"：runner 产出结果 + 流式事件；**持久化归消费方**（消费方拿
 * 结果写自己的库 + 把事件桥到自己的 WS）。这样 runner 不耦合任何 app 的 store。
 */
import type { CapabilityManifest } from "./capability-manifest";

/** 能力执行入参（深度洞察类工作流的最小语义输入；其余档位由能力默认值兜底）。 */
export interface CapabilityRunInput {
  readonly topic: string;
  readonly description?: string;
  readonly depth?: "quick" | "standard" | "deep";
  readonly language?: "zh-CN" | "en-US";
  /**
   * 用户选定的真实 model id（透传到 agentRunner.run RunOptions.preferredModelId）。
   * 命中 resolvePreferredModel 第一优先，bypass election，走用户 BYOK 默认解析链。
   * 不传时与 playground 默认行为一致（按 TaskProfile + BYOK 选模型）。
   */
  readonly preferredModelId?: string;
  /** researcher 抽图开关（withFigures=true → web-scraper extractImages）。 */
  readonly withFigures?: boolean;
  /** 本地知识库 ids（researcher rag-search 召回限定；空/缺省 → 纯 web）。 */
  readonly knowledgeBaseIds?: readonly string[];
  /** 搜索时效窗口（透传 researcher + envelope.metadata，给 search tool 兜底）。 */
  readonly searchTimeRange?: "30d" | "90d" | "180d" | "365d" | "730d" | "all";
  /**
   * ★ #16a 增量复用（消费方"更新/续作"场景）：注入上次 mission 的可复用产物，让能力核
   *   跳过对应阶段的重算，等价 playground OFF 路 hydrateInherited* 的"跳过 S2/S3 重跑"。
   *
   *   - plan：上次拆解的维度规划 → S2 命中即直接复用，跳过 leader plan LLM。
   *   - researcherResults：上次各维 researcher 产物（按 dimension 索引）→ S3 perItemPipeline
   *     命中即复用，跳过 web 检索（增量复用最贵/最慢的一段）。
   *
   *   形状中性（消费方无需知道能力内部 CrossStageState/CS_KEY），能力核负责映射进内部状态。
   *   缺省/空 → 全量新跑（与首次运行一致）。仅在非 crash-resume（无 checkpoint）时生效。
   *
   *   注：章节级复用（writer 重写跳过）暂未覆盖，属后续波；当前复用 plan+research 已回收
   *   增量场景的主要 token/时延成本（web 检索 + ReAct 循环）。
   */
  readonly inheritedBaseline?: {
    readonly plan?: unknown;
    readonly researcherResults?: readonly unknown[];
  };
}

/** 执行流事件（消费方桥到自己的 WS / 进度）。 */
export interface CapabilityRunEvent {
  readonly type:
    | "started"
    | "stage:started"
    | "stage:completed"
    | "stage:failed"
    | "stage:degraded"
    | "stage:stalled"
    | "agent-lifecycle"
    /**
     * 过程级 agent 事件（流式中间态，区别于完成快照 'agent-lifecycle'）。
     * 来自 IAgentEvent relay，纯流式不落库。
     * payload 承载翻译后的 {kind, text, role, tag, dimension, toolId}。
     * kind 值：
     *   - 'lifecycle-started'    agent 启动卡片（phase='started'）
     *   - 'lifecycle-completed'  agent 完成卡片（phase='completed'）
     *   - 'lifecycle-failed'     agent 失败卡片（phase='failed'）
     *   - 'thinking'             LLM 思考步骤
     *   - 'action_planned'       决定调用工具
     *   - 'action_executed'      工具调用完成
     *   - 'error'                错误事件（tag='error'）
     */
    | "agent-trace"
    | "completed"
    | "failed";
  readonly stepId?: string;
  readonly label?: string;
  readonly timestamp: number;
  /** agent-lifecycle / agent-trace 事件的补充载荷（含 agentId / tokensUsed / costCents / modelTrail 等）。 */
  readonly payload?: Record<string, unknown>;
  /**
   * 结构化阶段元数据（消费方可选消费；14 阶段点亮 + 计费用）。
   * systemStageId 是前端 14-chip 点亮锚点（如 s1-budget … s11-persist）。
   */
  readonly telemetry?: {
    readonly systemStageId?: string;
    readonly tokensUsed?: number;
    readonly costCents?: number;
    readonly dimension?: string;
    readonly agentId?: string;
    readonly phase?: "started" | "completed" | "failed";
  };
}

/** 终态写入细节（消费方落库 + 终态仲裁用）。 */
export interface MissionTerminalDetails {
  readonly report?: unknown;
  readonly reportArtifact?: unknown;
  readonly themeSummary?: string;
  readonly dimensions?: ReadonlyArray<unknown>;
  readonly verdicts?: unknown;
  readonly leaderSignOff?: unknown;
  readonly finalScore?: number;
  readonly elapsedWallTimeMs?: number;
  readonly tokensUsed?: number;
  readonly costCents?: number;
  readonly errorMessage?: string;
  readonly failureCode?: string;
}

/**
 * MissionPersistencePort —— 多阶段执行的持久化契约（**消费方注入**）。
 *
 * 能力内核执行期不碰任何 app DB：中间态走 harness CrossStageState；
 * 仅 checkpoint/resume + 终态仲裁经此端口由消费方落库（company 落 company 库、
 * playground 落 MissionStore）。是 harness IMissionStore 的"能力侧最小投影 +
 * terminal arbiter 扩展"——消费方可让自家 store 一套实现同时满足两个视图。
 *
 * 缺省（不注入）→ runner 用内存实现纯跑、不落库。
 */
export interface MissionPersistencePort {
  // ── 核心：crash-resume（MUST）──
  markStageProgress(missionId: string, stepId: string): Promise<void>;
  saveCheckpoint(
    missionId: string,
    snapshot: {
      lastStepId: string;
      topic: string;
      crossState: Readonly<Record<string, unknown>>;
    },
  ): Promise<boolean>;
  loadCheckpoint(missionId: string): Promise<{
    lastStepId: string;
    topic: string;
    crossState: Readonly<Record<string, unknown>>;
  } | null>;
  clearCheckpoint(missionId: string): Promise<void>;

  // ── 终态：条件写仲裁（MUST；WHERE status='running' 首写赢）──
  applyTerminalIfRunning(
    missionId: string,
    outcome: "completed" | "failed" | "cancelled",
    details: MissionTerminalDetails,
  ): Promise<boolean>;

  // ── 可选：trajectory（UI 展示 / 重跑复用，能力内核不依赖）──
  saveResearchResult?(args: {
    missionId: string;
    dimension: string;
    findings: ReadonlyArray<unknown>;
    summary: string;
    state: "completed" | "failed";
  }): Promise<boolean>;
  saveReportVersion?(args: {
    missionId: string;
    triggerType: "initial" | "rerun-fresh";
    reportFull?: unknown;
    reportTitle?: string;
    reportSummary?: string;
    finalScore?: number;
    leaderSigned?: boolean;
  }): Promise<number>;
}

/** 执行上下文（归属 + 关联 + 流式回调 + 取消）。 */
export interface CapabilityRunContext {
  /** BYOK / billing / ownership 归属。 */
  readonly userId: string;
  /** 消费方生成的 mission id（用于关联自己的运行记录）。 */
  readonly missionId: string;
  /** 流式事件回调。 */
  readonly onEvent?: (event: CapabilityRunEvent) => void | Promise<void>;
  readonly signal?: AbortSignal;
  /**
   * 消费方注入的持久化端口（checkpoint/resume + 终态仲裁）。
   * 缺省 → runner 用内存实现纯跑、不落库。事件仍全过 onEvent，不另加注入对象。
   */
  readonly persistence?: MissionPersistencePort;
}

/** 能力执行结果（消费方据此写自己的运行记录）。 */
export interface CapabilityRunResult {
  readonly status: "completed" | "failed";
  /** 报告正文（markdown）。 */
  readonly report?: string;
  /** 归一引用列表。 */
  readonly references?: ReadonlyArray<{
    source: string;
    title?: string;
    snippet?: string;
  }>;
  /** 各阶段原始产物（按 step id 索引，消费方可深取）。 */
  readonly stageOutputs: Readonly<Record<string, unknown>>;
  /** 算力汇总。 */
  readonly usage?: { totalTokens: number; totalCostCents: number };
  readonly error?: string;
  /** 各维度研究流水线状态（按 dimension id 索引，可选富产出）。 */
  readonly dimensionPipelines?: Readonly<
    Record<
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
    >
  >;
  /** reviewer 抽取的质量评审结论（可选）。 */
  readonly verdicts?: ReadonlyArray<{
    dimension?: string;
    score?: number;
    comment?: string;
  }>;
  /** 各阶段富输出快照（by step id）。 */
  readonly byStage?: Readonly<Record<string, unknown>>;
  /**
   * 内部评审合成判定（runner 从内部 reviewer/critic 已有产出直接映射，
   * 无额外 LLM 调用）。消费方据此对接验收 gate。
   */
  readonly reviewVerdict?: {
    /** 0-100 综合分（来自内部 reviewer score）。 */
    readonly score?: number;
    /** 内部 reviewer 三档判定。 */
    readonly verdict?: "approve" | "revise" | "reject";
    /** reviewer 备注 / critic 盲点（展示用）。 */
    readonly notes?: readonly string[];
  };
}

/**
 * 能力执行端口。实现方在能力家内提供，注册进 CapabilityRegistry；消费方按
 * manifest.id 解析后调用。
 */
export interface ICapabilityRunner {
  readonly manifest: CapabilityManifest;
  run(
    input: CapabilityRunInput,
    ctx: CapabilityRunContext,
  ): Promise<CapabilityRunResult>;
}
