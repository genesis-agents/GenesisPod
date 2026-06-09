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
}

/** 执行流事件（消费方桥到自己的 WS / 进度）。 */
export interface CapabilityRunEvent {
  readonly type:
    | "started"
    | "stage:started"
    | "stage:completed"
    | "stage:failed"
    | "agent-lifecycle"
    | "completed"
    | "failed";
  readonly stepId?: string;
  readonly label?: string;
  readonly timestamp: number;
  /** agent-lifecycle 事件的补充载荷（含 agentId / tokensUsed / costCents / modelTrail 等）。 */
  readonly payload?: Record<string, unknown>;
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
