/**
 * agent-spec-catalog.ts —— 已沉淀 agent 的「单一源」解析表（spec id → @DefineAgent 类）
 *
 * 智能体市场 agent 沉淀的单一真相：把 playground 等模块里「可被其他团队复用」的
 * @DefineAgent 角色，按其 spec id 登记成 id → 类 的解析表。
 *
 * 两个消费方共用这一张表（契约：SKU id === spec id === CompanyHiredAgent.listingId）：
 *   1. 市场投影（company MarketplaceCatalogService）：对每个类 readDefineAgentMeta()
 *      取出真 id / role / description / skills / tools 投影成 AgentCatalogItem。
 *   2. 执行解析（company mission runner）：resolveAgentSpec(listingId) → 类 →
 *      AgentRunner.run(类, input) 真跑（与 playground 同一执行路径，tool-recall/env/BYOK 全保留）。
 *
 * 设计原则（标准沿用 agent-catalog.ts 同范式）：
 *   • 只登记「脱离原 pipeline 仍可独立复用」的角色（标准 28 §3 粒度法）。
 *     Leader/Steward 死绑 mission 上下文 → 不登记、不单独上架。
 *   • ai-app → harness 只经 facade（readDefineAgentMeta / AgentSpec），单向不穿透。
 *   • 这是「id → 可跑类」的解析表，不是展示台账：展示字段一律 readDefineAgentMeta 派生。
 */
import type { z } from "zod";
import type { AgentSpec } from "@/modules/ai-harness/facade";
import { ResearcherAgent } from "../playground/mission/agents/researcher/researcher.agent";
import { ReconcilerAgent } from "../playground/mission/agents/reconciler/reconciler.agent";
import { AnalystAgent } from "../playground/mission/agents/analyst/analyst.agent";
import { SingleShotWriterAgent } from "../playground/mission/agents/writer/single-shot-writer.agent";
import { MissionReviewerAgent } from "../playground/mission/agents/reviewer/mission-reviewer.agent";
import { VerifierAgent } from "../playground/mission/agents/verifier/verifier.agent";

/** 一个可被 AgentRunner.run 直接执行的 @DefineAgent 类。 */
export type AgentSpecClass = new () => AgentSpec<z.ZodType, z.ZodType>;

/**
 * 已沉淀的 playground 角色（spec id → 类）。
 * 只登记「脱离 mission pipeline 仍可独立复用」的 6 个通用角色（标准 28 §3）。
 * Leader/Steward 死绑 mission 上下文 → 不登记。
 * 每个 key 必须 === 对应类 @DefineAgent 的 id（契约②，spec 守护）。
 */
export const PLAYGROUND_AGENT_SPECS: Readonly<Record<string, AgentSpecClass>> =
  {
    "playground.researcher": ResearcherAgent,
    "playground.reconciler": ReconcilerAgent,
    "playground.analyst": AnalystAgent,
    "playground.writer": SingleShotWriterAgent,
    "playground.reviewer": MissionReviewerAgent,
    "playground.verifier": VerifierAgent,
  };

/** 所有已沉淀 agent 的解析表（未来其他模块的角色并入此处）。 */
export const SEDIMENTED_AGENT_SPECS: Readonly<Record<string, AgentSpecClass>> =
  {
    ...PLAYGROUND_AGENT_SPECS,
  };

/** 按 SKU id / listingId 解析出可跑的 @DefineAgent 类；未沉淀返回 undefined。 */
export function resolveAgentSpec(id: string): AgentSpecClass | undefined {
  return SEDIMENTED_AGENT_SPECS[id];
}

/**
 * 「可从单条任务文本独立跑」的叶子 agent（标准 28 §3 粒度法）。
 *
 * 只有输入 = {topic, dimension, language} 这类、不依赖 pipeline 上游产物的叶子
 * agent 才能被其他团队的执行层直接 AgentRunner.run 真跑（researcher：单维度调研 +
 * 真 web-search）。中段 agent（analyst 吃 findings / writer 吃 outline / reviewer
 * 吃成稿）的输入是 pipeline 上游结构化产物，无法从单条任务独立构造 → 不在此集合，
 * 执行层对它们退回「注入真技能指令的通用 chat」。
 */
export const STANDALONE_RUNNABLE_AGENT_IDS: ReadonlySet<string> = new Set([
  "playground.researcher",
]);
