/**
 * Pipeline Identity Context
 *
 * 顶层 context：所有 stage 可读，整个 mission 生命周期不变。
 * 替代原 god-object PipelineContext（见 02-target-architecture §2.1）。
 *
 * 不含业务数据（outline / sections / evidence 等）—— 那些走 StageResults。
 */

import type { TopicInsightsCapabilitySnapshot } from "@/modules/ai-app/topic-insights/agents/capability/types";
import type { PipelineBudget } from "./budget";
import type { ResearchDepth } from "./depth-config";

export interface PipelineIdentityContext {
  readonly missionId: string;
  readonly topicId: string;
  /** Draft report id，在 ST-00-INIT 创建，后续 stage 用于挂证据/章节 */
  readonly reportId: string;
  readonly userId: string;
  /** Per-mission prompt cache prefix */
  readonly cachePrefix: string;
  /** 端到端 cancel 信号（Budget 超限 / 用户取消 / SLO 超时都走这里） */
  readonly abortController: AbortController;
  readonly budget: PipelineBudget;
  readonly depth: ResearchDepth;
  readonly mode: "fresh" | "incremental";
  /** Degradation 模式：Budget 80% 触发，后续 stage 跳过 optional */
  degradationMode: boolean;
  /**
   * ★ 目标架构 v2（2026-04-23）：能力快照
   * runWithHarness 入口通过 TopicInsightsCapabilityReconciler.reconcile 产出注入，
   * ST-00-INIT / Leader / 其它 stage 读 capabilities.env 而不自己重查环境。
   * Optional 保留以兼容纯单元测试；runtime 路径保证填充。
   */
  readonly capabilities?: TopicInsightsCapabilitySnapshot;
  /**
   * H3 primitive: 单维度刷新模式。
   * 若存在，RESEARCH / WRITE / REVIEW / INTEGRATE / REMEDIATE 只处理 dimension id
   * 在此列表里的部分。空数组 = 全维度（等价于不传）。
   * 由 /dimensions/:id/refresh 端点驱动。
   */
  readonly dimensionScope?: readonly string[];
}
