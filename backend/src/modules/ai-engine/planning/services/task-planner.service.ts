/**
 * TaskPlannerService
 *
 * 支柱二：GenesisAgent 编排层 — 任务规划器
 *
 * 接收 IntentRouterService 解析出的能力需求列表，
 * 构建有向无环图（DAG）形式的 TaskPlan，供 DagExecutor 驱动执行。
 *
 * 规划策略：
 *   - 同类型模块互相并行（两个 research → parallel）
 *   - 下游依赖上游输出的模块串行（research → writing）
 *   - 信息收集类（research/ask）优先于内容生成类（writing/teams）
 */

import { Injectable, Logger } from "@nestjs/common";

// ─────────────────────────────────────────────────────────
// Public types
// ─────────────────────────────────────────────────────────

/** 可用的 AI App 模块标识 */
export type AppModule =
  | "research"
  | "writing"
  | "teams"
  | "ask"
  | "image"
  | "office"
  | "insight";

/**
 * 单个任务步骤
 */
export interface TaskStep {
  /** 步骤唯一 ID（step-0, step-1, ...） */
  id: string;
  /** 目标 AI App 模块 */
  module: AppModule;
  /** 步骤动作描述（例："深度研究 OpenAI o3 影响"） */
  action: string;
  /** 传给模块的输入（通常是 query 字符串） */
  input: string;
  /** 依赖的步骤 ID 列表（空 = 可立即启动） */
  dependsOn: string[];
  /** 步骤重要性（原始意图中的优先级分数，1=最高） */
  priority: number;
}

/**
 * DAG 任务计划
 */
export interface TaskPlan {
  /** 计划唯一 ID */
  id: string;
  /** 用户原始意图 */
  originalIntent: string;
  /** 所有步骤（按 DAG 拓扑顺序排列） */
  steps: TaskStep[];
  /**
   * 执行模式
   *   sequential - 所有步骤串行
   *   parallel   - 所有步骤可并行
   *   dag        - 混合有依赖关系
   */
  executionMode: "sequential" | "parallel" | "dag";
  /**
   * 路由置信度（来自 IntentRouter）
   * 低于 0.6 时建议向用户确认
   */
  confidence: number;
  /** 规划时间戳 */
  plannedAt: Date;
}

/**
 * 能力需求项（IntentRouter 解析结果的单项）
 */
export interface CapabilityRequirement {
  module: AppModule;
  action: string;
  input: string;
  priority: number;
}

// ─────────────────────────────────────────────────────────
// Internal constants
// ─────────────────────────────────────────────────────────

/**
 * 模块执行阶段：信息收集型先于内容生成型
 * phase 1 → phase 2 串行依赖
 */
const MODULE_PHASE: Record<AppModule, 1 | 2> = {
  research: 1,
  ask: 1,
  insight: 1,
  writing: 2,
  teams: 2,
  image: 2,
  office: 2,
};

// ─────────────────────────────────────────────────────────
// Service
// ─────────────────────────────────────────────────────────

@Injectable()
export class TaskPlannerService {
  private readonly logger = new Logger(TaskPlannerService.name);

  /**
   * 根据能力需求列表构建 DAG TaskPlan
   */
  buildPlan(
    requirements: CapabilityRequirement[],
    originalIntent: string,
    confidence: number,
  ): TaskPlan {
    const planId = `plan-${Date.now()}`;

    if (requirements.length === 0) {
      // 降级：使用 ask 模块直接回答
      return this.buildFallbackPlan(planId, originalIntent, confidence);
    }

    const steps = this.buildSteps(requirements);
    const executionMode = this.deriveExecutionMode(steps);

    this.logger.debug(
      `[buildPlan] id=${planId} steps=${steps.length} mode=${executionMode} confidence=${confidence.toFixed(2)}`,
    );

    return {
      id: planId,
      originalIntent,
      steps,
      executionMode,
      confidence,
      plannedAt: new Date(),
    };
  }

  // ─── private ───────────────────────────────────────────

  private buildSteps(requirements: CapabilityRequirement[]): TaskStep[] {
    // 按优先级排序，同优先级按 phase 排序
    const sorted = [...requirements].sort((a, b) => {
      if (a.priority !== b.priority) return a.priority - b.priority;
      return MODULE_PHASE[a.module] - MODULE_PHASE[b.module];
    });

    // 记录各 phase 中已创建的步骤 ID（用于建立跨 phase 依赖）
    const phase1Ids: string[] = [];

    return sorted.map((req, idx) => {
      const id = `step-${idx}`;
      const phase = MODULE_PHASE[req.module];

      // phase 2 步骤依赖全部 phase 1 步骤（串行：先研究再写作）
      const dependsOn = phase === 2 ? [...phase1Ids] : [];

      if (phase === 1) {
        phase1Ids.push(id);
      }

      return {
        id,
        module: req.module,
        action: req.action,
        input: req.input,
        dependsOn,
        priority: req.priority,
      };
    });
  }

  private deriveExecutionMode(
    steps: TaskStep[],
  ): "sequential" | "parallel" | "dag" {
    if (steps.length <= 1) return "sequential";

    const hasDependencies = steps.some((s) => s.dependsOn.length > 0);
    if (!hasDependencies) return "parallel";

    // 检查是否所有步骤都串行依赖前一步（纯顺序链）
    const isPureSequential = steps.every(
      (s, i) =>
        i === 0 ||
        (s.dependsOn.length === 1 && s.dependsOn[0] === steps[i - 1].id),
    );

    return isPureSequential ? "sequential" : "dag";
  }

  private buildFallbackPlan(
    planId: string,
    originalIntent: string,
    confidence: number,
  ): TaskPlan {
    return {
      id: planId,
      originalIntent,
      steps: [
        {
          id: "step-0",
          module: "ask",
          action: "直接问答",
          input: originalIntent,
          dependsOn: [],
          priority: 1,
        },
      ],
      executionMode: "sequential",
      confidence,
      plannedAt: new Date(),
    };
  }
}
