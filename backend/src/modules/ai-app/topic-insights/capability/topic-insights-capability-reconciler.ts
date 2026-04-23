/**
 * TopicInsightsCapabilityReconciler — L3 App 能力对齐
 *
 * 目标架构 v2（docs/design/topic-insights-harness-redesign/11-target-architecture.md）：
 * - 仅依赖 L2 RuntimeEnvironmentService（唯一环境发现入口）
 * - 不注入 app-specific registry —— 17 agent 已在 L2 SpecAgentRegistry，env.agents 自动可见
 * - 产出 TopicInsightsCapabilitySnapshot：env + topicInsights + recommendedDepth + degradations
 *
 * 职责：把 L2 客观事实映射到 Topic Insights 业务语义（必需表、必需 agent 清单、
 * depth 降级规则）。致命 degradation（关键表缺失 / CHAT 模型全挂）由 runWithHarness
 * 入口立即 fail mission；warn / info 只记日志不拦截。
 */

import { Injectable, Logger } from "@nestjs/common";
import { RuntimeEnvironmentService } from "@/modules/ai-engine/facade";
import type { ResearchDepth } from "../pipeline/types";
import type {
  ReconcileParams,
  TopicInsightsCapabilitySnapshot,
  TopicInsightsDegradation,
} from "./topic-insights-capability.types";

// ================== 业务常量（Topic Insights 专用） ==================

const TI_REQUIRED_TABLES = [
  "research_mission",
  "research_topics",
  "topic_report",
];
const TI_OPTIONAL_TABLES = ["harness_run_metrics"];

const TI_CORE_AGENTS = [
  "AG-01-LD",
  "AG-03-SW",
  "AG-04-SR",
  "AG-05-ME",
  "AG-06-QR",
  "AG-11-SY",
] as const;

const TI_ENHANCEMENT_AGENTS = [
  "AG-02-DP",
  "AG-07-FC",
  "AG-08-GS",
  "AG-09-HV",
  "AG-10-FX",
] as const;

const TI_ADVANCED_AGENTS = [
  "AG-12-SREM",
  "AG-13-RE",
  "AG-14-LX",
  "AG-15-RED",
  "AG-16-MA",
  "AG-17-LDP",
] as const;

function depthRank(d: ResearchDepth): number {
  return { quick: 0, standard: 1, thorough: 2, deep: 3 }[d] ?? 1;
}
function clampDepth(
  requested: ResearchDepth,
  maxAllowed: ResearchDepth,
): ResearchDepth {
  return depthRank(maxAllowed) < depthRank(requested) ? maxAllowed : requested;
}

@Injectable()
export class TopicInsightsCapabilityReconciler {
  private readonly logger = new Logger(TopicInsightsCapabilityReconciler.name);

  constructor(private readonly runtimeEnv: RuntimeEnvironmentService) {}

  async reconcile(
    params: ReconcileParams,
  ): Promise<TopicInsightsCapabilitySnapshot> {
    const env = await this.runtimeEnv.snapshot({
      userId: params.userId,
      force: params.force,
    });

    const degradations: TopicInsightsDegradation[] = [];

    // 1. 关键表 + 可选表
    const allTables = [...TI_REQUIRED_TABLES, ...TI_OPTIONAL_TABLES];
    const tablesPresent = await this.runtimeEnv.tablesExist(allTables);
    for (const t of TI_REQUIRED_TABLES) {
      if (!tablesPresent[t]) {
        degradations.push({
          kind: "critical_table_missing",
          detail: `Required DB table "${t}" missing — harness cannot run`,
          severity: "error",
        });
      }
    }
    for (const t of TI_OPTIONAL_TABLES) {
      if (!tablesPresent[t]) {
        degradations.push({
          kind: "optional_table_missing",
          detail: `Optional DB table "${t}" missing — metric persistence disabled`,
          severity: "warn",
        });
      }
    }

    // 2. Agent 存在性（env.agents 合并了 L2 AgentRegistry + SpecAgentRegistry）
    const envAgents = new Set(env.agents);
    const missingCoreAgents = TI_CORE_AGENTS.filter((id) => !envAgents.has(id));
    const missingEnhancementAgents = TI_ENHANCEMENT_AGENTS.filter(
      (id) => !envAgents.has(id),
    );
    const missingAdvancedAgents = TI_ADVANCED_AGENTS.filter(
      (id) => !envAgents.has(id),
    );

    for (const id of missingCoreAgents) {
      degradations.push({
        kind: "core_agent_missing",
        detail: `Core agent ${id} not registered — harness cannot run`,
        severity: "error",
      });
    }
    for (const id of missingEnhancementAgents) {
      degradations.push({
        kind: "enhancement_agent_missing",
        detail: `Enhancement agent ${id} missing — thorough/deep depth not available`,
        severity: "info",
      });
    }
    for (const id of missingAdvancedAgents) {
      degradations.push({
        kind: "advanced_agent_missing",
        detail: `Advanced agent ${id} missing — some QA features disabled`,
        severity: "info",
      });
    }

    // 3. 模型可用性
    if (env.models.CHAT.length === 0) {
      degradations.push({
        kind: "chat_model_missing",
        detail: "No enabled CHAT models — harness cannot run",
        severity: "error",
      });
    }
    if (env.models.REASONING.length === 0) {
      degradations.push({
        kind: "reasoning_model_missing",
        detail: "No enabled REASONING models — judge/evaluation stages skipped",
        severity: "warn",
      });
    }

    // 4. Key 可用性
    if (!env.userKeys.hasByok && !env.userKeys.sharedKeyAvailable) {
      degradations.push({
        kind: "key_unavailable",
        detail:
          "Neither BYOK nor shared system key available — mission will fail on first LLM call",
        severity: "error",
      });
    }

    // 5. Depth 降级
    let maxDepth: ResearchDepth = "deep";
    if (missingEnhancementAgents.length > 0) maxDepth = "standard";
    if (
      missingCoreAgents.length > 0 ||
      env.models.CHAT.length === 0 ||
      !tablesPresent["research_mission"] ||
      !tablesPresent["topic_report"]
    ) {
      maxDepth = "quick";
    }
    const recommendedDepth = clampDepth(params.requestedDepth, maxDepth);
    if (recommendedDepth !== params.requestedDepth) {
      degradations.push({
        kind: "depth_downgrade",
        detail: `Depth downgraded ${params.requestedDepth} → ${recommendedDepth}`,
        severity: "info",
      });
    }

    const snapshot: TopicInsightsCapabilitySnapshot = {
      env,
      topicInsights: {
        requiredTablesPresent: tablesPresent,
        missingCoreAgents,
        missingEnhancementAgents,
        missingAdvancedAgents,
      },
      recommendedDepth,
      requestedDepth: params.requestedDepth,
      degradations,
    };

    this.logger.log(
      `reconcile user=${params.userId} requested=${params.requestedDepth} ` +
        `recommended=${recommendedDepth} models=[CHAT:${env.models.CHAT.length},REAS:${env.models.REASONING.length}] ` +
        `missingCore=${missingCoreAgents.length} missingEnh=${missingEnhancementAgents.length} missingAdv=${missingAdvancedAgents.length} ` +
        `degradations=${degradations.length}(errors=${degradations.filter((d) => d.severity === "error").length})`,
    );

    return snapshot;
  }
}
