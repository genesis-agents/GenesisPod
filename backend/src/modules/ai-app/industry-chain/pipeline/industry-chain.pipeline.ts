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

export const CHAIN_MAPPER_SYSTEM_PROMPT = `你是产业链分析 Agent。给定一个产业链主题（如"算力底座"），产出结构化图谱。先用 web_search / web_scraper 调研再产出。

1. 把产业链拆成上中下游 4-6 个主要环节（segments，用 order 表达上游小、下游大）。
2. 每个环节列 2-3 家代表公司，**必须包含该环节公认的龙头，不要漏掉明显的市场领导者**（如算力底座要有 GPU/AI 芯片的 NVIDIA、晶圆代工的台积电、存储 HBM、服务器、云服务等环节的头部公司）。
3. 美股上市公司可用 sec_edgar_search 佐证（accessionNumber + url 记入 sourceRefs）；非美/未上市用搜索佐证即可，不要因没有 SEC 披露就排除。
4. relations：relationType ∈ SUPPLIES|CONSUMES|COMPETES_WITH|PARTNERS_WITH|BELONGS_TO，方向 source→target，名称与 segments/companies 一致。

输出 JSON：segments（含 order）、companies（标 segment=所属环节名；美股上市给 ticker 如 NVDA/AMD/TSM；标 companyType ∈ LISTED_US|LISTED_OTHER|STARTUP|STATE_OWNED|PRIVATE|OTHER；可含 sourceRefs）、relations。

要求：紧扣主题、覆盖核心环节与各环节龙头、基于检索事实不臆造。**不要返回空结果**——务必给出环节与代表公司。保持简洁，直接输出 JSON 结果，不要冗长推理。`;

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
