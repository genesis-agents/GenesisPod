/**
 * Industry Chain Mission Pipeline（方案 B：复用 mission-pipeline 框架壳）
 *
 * stage primitive 是通用编排壳，不自己跑 agent，而是调注入的 hook：
 *   - research.perItemPipeline：跑 chain-mapper agent（ReAct + 工具）产出结构化抽取（= 方案 A 的 agent 跑法）
 *   - persist.persist：回调 IndustryChainService.persistExtraction 落领域表（M2 映射 + M8 校验在内）
 * 框架白送：mission 生命周期/事件流/checkpoint/cost。
 *
 * 实体消歧（synthesize）+ 结构校验（review/M8）已内含于 persistExtraction，故 pipeline
 * 精简为 research→persist 两步；JudgeService 共识 review step 为后续可选增强。
 */

import {
  defineMissionPipeline,
  defineStageHooks,
  type MissionPipelineConfig,
  type StageHookShape,
} from "@/modules/ai-harness/facade";
import { z } from "zod";
import { ChainExtractionResultSchema } from "../chain-extraction";

export const INDUSTRY_CHAIN_PIPELINE_ID = "industry-chain";

export const CHAIN_MAPPER_TOOL_IDS = [
  "web-search",
  "web-scraper",
  "sec-edgar-search",
] as const;

export const CHAIN_MAPPER_SYSTEM_PROMPT = `你是产业链分析 Agent。给定一个产业链主题（如"算力底座"），产出该产业链的结构化图谱：

1. 用 web_search / web_scraper 调研该产业链的上中下游环节（segments）结构。
2. 识别每个环节的代表性公司。对**美股上市公司**可用 sec_edgar_search 取 SEC 披露作权威佐证（accessionNumber + url 记入 sourceRefs）；**非美国 / 未上市公司用搜索结果佐证即可——不要因为没有 SEC 披露就排除一家本属于该产业链的公司**。
3. 给出上下游关系（relations），relationType ∈ SUPPLIES|CONSUMES|COMPETES_WITH|PARTNERS_WITH|BELONGS_TO，方向 source→target。

输出结构化 JSON：segments（含 order：上游小、下游大）、companies（每家尽量标注 segment = 所属环节名，与 segments 的 name 对应；可含 cik / sourceRefs）、relations。

要求：
- 聚焦真正参与本产业链的公司，避免明显无关者；relations 的 source/target 用与 segments/companies 一致的名称并给明方向。
- 基于检索到的事实，不臆造。
- **务必给出该产业链的核心环节与主要公司，不要返回空结果**；信息不足时也要给出已知的环节与代表公司。`;

const CHAIN_MAPPER_SKILL_SPEC = {
  id: "chain-mapper-v1",
  systemPrompt: CHAIN_MAPPER_SYSTEM_PROMPT,
  allowedToolIds: [...CHAIN_MAPPER_TOOL_IDS],
  allowedModels: [] as string[], // 空 → runner 退回 TaskProfile（不硬编码模型）
  outputSchema: ChainExtractionResultSchema as unknown as z.ZodType,
  meta: { skillVersion: "1.0", skillDomain: "industry-chain" },
};

/** research 步 hook（fanOut + perItemPipeline 跑 agent）。 */
export interface ResearchHooks {
  fanOut: (args: { ctx: { input: unknown } }) => ReadonlyArray<unknown>;
  perItemPipeline: (args: {
    item: unknown;
    role: unknown;
    ctx: { input: unknown; userId?: string; signal?: AbortSignal };
  }) => Promise<unknown>;
}

/** persist 步 hook（落领域表）。 */
export interface PersistHook {
  persist: (args: {
    ctx: { input: unknown };
    previousOutputs: Record<string, unknown>;
    crossStageState: unknown;
  }) => Promise<void>;
}

/**
 * 用注入的 hook 构建可注册的 pipeline 配置。hook 闭包由 IndustryChainService 提供
 * （需引用 HarnessFacade + persistExtraction），故 pipeline 在运行时构建而非静态 const。
 */
export function buildIndustryChainPipeline(
  researchHooks: ResearchHooks,
  persistHook: PersistHook,
): MissionPipelineConfig {
  return defineMissionPipeline({
    id: INDUSTRY_CHAIN_PIPELINE_ID,
    roles: [
      {
        id: "chain-mapper",
        skillSpec: CHAIN_MAPPER_SKILL_SPEC,
        stateful: false,
      },
    ],
    steps: [
      {
        primitive: "research",
        id: "extract",
        roleId: "chain-mapper",
        hooks: defineStageHooks(
          researchHooks as unknown as Record<string, StageHookShape>,
        ),
      },
      {
        primitive: "persist",
        id: "persist",
        hooks: defineStageHooks(
          persistHook as unknown as Record<string, StageHookShape>,
        ),
      },
    ],
    meta: { app: "industry-chain", version: "1.0" },
  });
}
