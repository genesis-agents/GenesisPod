/**
 * Industry Chain Mission Pipeline 配置
 *
 * chain-mapper agent 经合法 stage primitive 编排（M1：用 research/synthesize/review/persist，
 * 而非不存在的 map/resolve/verify）。skillSpec 内联（self-contained，outputSchema 用真 zod
 * ChainExtractionResultSchema，不伪造 always-success 断言）。
 *
 * ⚠️ 集成待确认（见 review-minutes 后续）：框架 persist primitive 落的是 mission store，
 *   产业链领域持久化由 IndustryChainService.persistExtraction 承担——二者衔接方式
 *   （hook / 单 agent 直跑）属运行时/部署态集成决策。
 */

import {
  defineMissionPipeline,
  type MissionPipelineConfig,
} from "@/modules/ai-harness/facade";
import { z } from "zod";
import { ChainExtractionResultSchema } from "../chain-extraction";

export const INDUSTRY_CHAIN_PIPELINE_ID = "industry-chain";

const CHAIN_MAPPER_SYSTEM_PROMPT = `你是产业链分析 Agent。给定一个产业链主题（如"算力底座"），你的任务是：
1. 用 web_search / web_scraper 搜索该产业链的上中下游环节结构。
2. 对每个候选参与者公司，用 sec_edgar_search 取其 SEC 披露作为权威背书（记录 accessionNumber + url 作为 sourceRefs）。
3. 输出结构化 JSON：segments（环节）、companies（公司，含 cik/segment/sourceRefs）、relations（上下游关系，relationType ∈ SUPPLIES|CONSUMES|COMPETES_WITH|PARTNERS_WITH|BELONGS_TO，方向 source→target）。

只输出可由 SEC / 搜索结果支撑的事实，不臆造公司或关系。relations 必须给明方向。`;

/**
 * chain-mapper skillSpec（内联，不依赖 SKILL.md 文件加载，避免跨模块 loader 路径耦合）。
 * outputSchema = 真 ChainExtractionResultSchema（框架可据此校验 agent 输出）。
 */
const CHAIN_MAPPER_SKILL_SPEC = {
  id: "chain-mapper-v1",
  systemPrompt: CHAIN_MAPPER_SYSTEM_PROMPT,
  allowedToolIds: ["web-search", "web-scraper", "sec-edgar-search"],
  allowedModels: [] as string[], // 空 → runner 退回 TaskProfile（不硬编码模型）
  outputSchema: ChainExtractionResultSchema as unknown as z.ZodType,
  meta: { skillVersion: "1.0", skillDomain: "industry-chain" },
};

export const INDUSTRY_CHAIN_PIPELINE: MissionPipelineConfig = defineMissionPipeline({
  id: INDUSTRY_CHAIN_PIPELINE_ID,
  roles: [{ id: "chain-mapper", skillSpec: CHAIN_MAPPER_SKILL_SPEC, stateful: false }],
  steps: [
    // 抽取：chain-mapper 走 ReAct loop 调 web/sec 工具产出结构化产业链
    { primitive: "research", id: "extract", roleId: "chain-mapper" },
    // 组图/消歧：实体消歧 + 关系映射（IndustryChainService.persistExtraction 承担落库）
    { primitive: "synthesize", id: "resolve", roleId: "chain-mapper", mode: "reconcile" },
    // 校验：JudgeService 共识 + 确定性结构校验（M8）
    { primitive: "review", id: "verify", roleId: "chain-mapper" },
    // 落库
    { primitive: "persist", id: "persist" },
  ],
  meta: { app: "industry-chain", version: "1.0" },
});
