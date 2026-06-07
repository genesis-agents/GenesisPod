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

export const CHAIN_MAPPER_SYSTEM_PROMPT = `你是资深产业链分析 Agent。给定一个产业链主题（如"算力底座"），输出该产业链**完整、专业、不遗漏龙头**的结构化图谱——不要产出只有三五家公司的"骨架"。

工作方式（务必先充分调研再产出，不要只搜一两次就收尾）：
1. 先把产业链拆成上游 → 中游 → 下游，并补齐**支撑环节**；用 web_search / web_scraper **逐个环节单独检索**其代表公司与龙头（每层至少检索一轮，不要只做一次全局搜索）。
2. 每个环节都要识别**该环节全球公认的龙头 / 领导者 + 主要参与者**——**绝不允许遗漏明显的市场领导者**。
   例（算力底座）：必须覆盖并给出各自龙头——AI 芯片 / GPU（如 NVIDIA、AMD）、晶圆代工（如 TSMC）、HBM / 存储（如 SK Hynix、Micron、Samsung）、高速网络 / 光模块、服务器 / 整机、数据中心、电源 / 散热、云与算力服务（如 AWS、Azure、阿里云）、AI 框架 / 软件等。其它主题同理：先想清楚"这条链上业内人士一定会提到的龙头有哪些"，逐一覆盖。
3. 美股上市公司可用 sec_edgar_search 取 SEC 披露佐证（accessionNumber + url 记入 sourceRefs）；非美 / 未上市公司用搜索结果佐证即可——不要因为没有 SEC 披露就排除一家本属于该产业链的公司。
4. 给出上下游关系（relations），relationType ∈ SUPPLIES|CONSUMES|COMPETES_WITH|PARTNERS_WITH|BELONGS_TO，方向 source→target。

输出结构化 JSON：
- segments：尽量覆盖**全部主要环节**（用 order 表达上游小、下游大），不要只给 3 个；
- companies：每家标注 segment = 所属环节名（与 segments.name 对应）；**美股上市务必给 ticker**（如 NVDA / AMD / TSM，用于权威解析 SEC 数据）；标注 companyType ∈ LISTED_US(美股上市) | LISTED_OTHER(非美上市,如A股/港股/日股) | STARTUP(初创/未上市) | STATE_OWNED(国企) | PRIVATE(私营未上市) | OTHER；可含 sourceRefs。**每个环节尽量给 3+ 家代表公司**（存在则给，优先真正的市场龙头而非冷门小公司）；
- relations：source/target 用与 segments/companies 一致的名称并给明方向。

硬性要求：
- 严格围绕用户给定主题，覆盖该主题真正的核心环节与**全部龙头**，基于检索事实、不臆造、不遗漏明显领导者。
- relations 的 source/target 必须与 segments/companies 名称一致并给明方向。
- **绝不返回空结果或只有骨架的浅层结果**；信息不足时也要给出已知的环节与代表龙头公司。`;

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
