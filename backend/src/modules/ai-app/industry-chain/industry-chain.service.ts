/**
 * Industry Chain Service
 *
 * 产业链分析业务编排 + 落库（留 app 层）。
 *   - analyze：创建 chain + 经 ai-harness facade 发起动态编排 mission（运行时/部署态验证）。
 *   - persistExtraction：抽取结果 → 实体消歧去重 → 落库实体 + 关系（M2 映射 + M8 校验）。
 *   - getGraph / getEntity：带 ownerId 越权过滤（M6），输出 {nodes,edges,stats} 供 KnowledgeGraphView。
 *
 * 所有 engine/harness 能力经 facade 复用：
 *   - EntityResolutionService（实体消歧，engine facade）
 *   - MissionPipelineOrchestrator / Registry（动态编排，harness facade）
 */

import { Injectable, Logger, NotFoundException } from "@nestjs/common";
import { randomUUID } from "crypto";
import { z } from "zod";
import { PrismaService } from "@/common/prisma/prisma.service";
import {
  EntityResolutionService,
  ToolRegistry,
  type ToolContext,
} from "@/modules/ai-engine/facade";
import {
  MissionPipelineOrchestrator,
  MissionPipelineRegistry,
  HarnessFacade,
  type IAgentSpec,
  type IAgentTask,
} from "@/modules/ai-harness/facade";
import {
  ChainExtractionResult,
  ChainExtractionResultSchema,
  buildRelationRows,
  buildStructuralRows,
  mergeRelationRows,
  normalizeSegmentName,
  normalizeCompanyType,
  sanitizeSourceRefs,
  classifyFiling,
  ENTITY_TYPES,
} from "./chain-extraction";
import {
  INDUSTRY_CHAIN_PIPELINE_ID,
  CHAIN_MAPPER_SYSTEM_PROMPT,
  CHAIN_MAPPER_TOOL_IDS,
  buildIndustryChainPipeline,
} from "./pipeline/industry-chain.pipeline";

export interface ChainGraphNode {
  id: string;
  label: string;
  type: string; // SEGMENT | COMPANY | PRODUCT
  segment?: string | null;
  companyType?: string | null; // LISTED_US | LISTED_OTHER | STARTUP | STATE_OWNED | PRIVATE | OTHER
}
export interface ChainGraphEdge {
  source: string;
  target: string;
  type: string;
  weight?: number | null;
}
export interface ChainGraph {
  nodes: ChainGraphNode[];
  edges: ChainGraphEdge[];
  stats: {
    totalNodes: number;
    totalEdges: number;
    segments: number;
    companies: number;
  };
}

/** 实体行情（best-effort，依赖 finance-api / AV key + 美股 + ticker 可解析）。 */
export interface EntityFinance {
  available: boolean;
  ticker?: string;
  price?: number;
  change?: number;
  changePercent?: string;
  series?: Array<{ date: string; close: number }>;
}

// finance-api 工具输出的最小读取形（不跨界 import 引擎内部类型）。
interface FinPoint {
  date?: string;
  value?: string;
  close?: string;
}
interface FinToolOutput {
  success?: boolean;
  data?: FinPoint[];
  metadata?: Record<string, string>;
}
// StartupHubTool 的输出形（与 engine tool 的 StartupHubOutput 对齐，本地声明避免穿透内部路径）
interface StartupHubToolOutput {
  found: boolean;
  name?: string;
  oneLiner?: string;
  website?: string;
  hq?: string;
  foundedDate?: string;
  totalFunding?: number;
  employeeCount?: number;
  sectors?: string[];
  operatingStatus?: string;
  stealth?: boolean;
  profileUrl?: string;
}

// SEC ticker 映射缓存 TTL（cik→ticker，按天刷新）——finance-api 只认 ticker，库里存 cik。
const SEC_TICKER_TTL_MS = 24 * 60 * 60 * 1000;

/** 资本动态条目（来自 SEC 备案：内部人交易 / 并购 / 举牌等）。 */
export interface InvestmentItem {
  form: string;
  label: string;
  date: string;
  url: string;
}
export interface EntityInvestment {
  available: boolean;
  items: InvestmentItem[];
}

/** 初创/未上市公司档案（来自 StartupHub.ai，免费 AI 创投库）。 */
export interface EntityStartup {
  available: boolean;
  name?: string;
  oneLiner?: string;
  website?: string;
  hq?: string;
  foundedDate?: string;
  totalFunding?: number;
  employeeCount?: number;
  sectors?: string[];
  operatingStatus?: string;
  stealth?: boolean;
  profileUrl?: string;
}

@Injectable()
export class IndustryChainService {
  private readonly logger = new Logger(IndustryChainService.name);
  // SEC 名册缓存（双向 cik↔ticker，实例级：prod 单例长缓存，单测每实例隔离）。
  private secTickerCache: {
    at: number;
    cikToTicker: Map<string, string>;
    tickerToCik: Map<string, string>;
  } | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly entityResolution: EntityResolutionService,
    private readonly orchestrator: MissionPipelineOrchestrator,
    private readonly registry: MissionPipelineRegistry,
    private readonly harness: HarnessFacade,
    private readonly toolRegistry: ToolRegistry,
  ) {}

  /**
   * 构建产业链 pipeline（方案 B）：hook 闭包绑定本 service。
   *   - research.perItemPipeline：经 HarnessFacade 跑 chain-mapper agent（ReAct + 工具）→ 结构化抽取
   *   - persist.persist：读 research 输出 → persistExtraction 落领域表
   */
  buildPipeline() {
    return buildIndustryChainPipeline(
      {
        // 单条产业链 → 单 item
        fanOut: ({ ctx }) => [ctx.input],
        perItemPipeline: async ({ item, ctx }) => {
          // 阻断-2：从 item 读（research primitive 把 fanOut 的每个元素作为 item 传入），
          // 不读 ctx.input——未来 fanOut 产出多 item 时才不会全部分析同一 topic。
          const input = item as { topic: string; chainId: string };
          const spec: IAgentSpec = {
            identity: {
              role: {
                id: "chain-mapper",
                name: "Chain Mapper",
                description: "产业链分析 Agent",
              },
              tools: [...CHAIN_MAPPER_TOOL_IDS],
            },
            loop: "react",
            systemPrompt: CHAIN_MAPPER_SYSTEM_PROMPT,
            userId: ctx.userId,
            // spec 泛型 TOutput=unknown → outputSchema 需 z.ZodType<unknown>；
            // ChainExtractionResultSchema 是 ZodObject（不变型），收窄到 z.ZodType<unknown>
            outputSchema:
              ChainExtractionResultSchema as unknown as z.ZodType<unknown>,
          };
          const task: IAgentTask = {
            goal: `分析"${input.topic}"的产业链结构与参与者`,
            input: { topic: input.topic },
            signal: ctx.signal,
          };
          const result = await this.harness.execute(spec, task);
          return this.parseExtraction(result.output);
        },
      },
      {
        persist: async ({ ctx, previousOutputs }) => {
          const input = ctx.input as { chainId: string };
          const research = previousOutputs["extract"] as
            | { results?: unknown[] }
            | undefined;
          const extraction = research?.results?.[0];
          if (extraction) {
            await this.persistExtraction(input.chainId, extraction);
          }
        },
      },
    );
  }

  /** 容错解析 agent 输出（object 直解 / string 先 JSON.parse）为 ChainExtractionResult。 */
  private parseExtraction(
    output: string | Record<string, unknown>,
  ): ChainExtractionResult {
    let raw: unknown = output;
    if (typeof output === "string") {
      try {
        raw = JSON.parse(output);
      } catch {
        // agent 返回了非 JSON（多为 prose）——不再静默吞成空，记日志暴露真因。
        this.logger.warn(
          `[parseExtraction] agent output is not valid JSON (len=${output.length}): ${output.slice(0, 300)}`,
        );
        raw = {};
      }
    }
    const parsed = ChainExtractionResultSchema.parse(raw);
    this.logger.log(
      `[parseExtraction] segments=${parsed.segments.length} companies=${parsed.companies.length} relations=${parsed.relations.length}`,
    );
    return parsed;
  }

  /** 创建产业链 + 异步发起动态编排 mission。返回 {chainId, missionId}。 */
  async analyze(
    userId: string,
    topic: string,
  ): Promise<{ chainId: string; missionId: string }> {
    const missionId = randomUUID();
    const chain = await this.prisma.industryChain.create({
      data: { topic, status: "RUNNING", ownerId: userId, missionId },
    });

    // fire-and-forget：编排在后台跑，前端经事件/轮询看进度（运行时/部署态验证）
    void this.runMission(chain.id, missionId, userId, topic);

    return { chainId: chain.id, missionId };
  }

  /** 后台执行编排 mission（部署态行为：需 LLM + SEC egress）。 */
  private async runMission(
    chainId: string,
    missionId: string,
    userId: string,
    topic: string,
  ): Promise<void> {
    try {
      const result = await this.orchestrator.run<{
        topic: string;
        chainId: string;
      }>({
        pipelineId: INDUSTRY_CHAIN_PIPELINE_ID,
        missionId,
        userId,
        input: { topic, chainId },
      });
      // 编排产出在 persist 步已落库；收尾状态。
      // 空抽取（0 实体）= 业务失败：标 FAILED 让前端给可重试错误态，而不是静默"无数据"。
      const entityCount = await this.prisma.industryEntity.count({
        where: { chainId },
      });
      const failed = result?.status === "failed" || entityCount === 0;
      if (entityCount === 0) {
        this.logger.warn(
          `[runMission] chain=${chainId} topic="${topic}" produced 0 entities — marking FAILED (检查 chain-mapper 抽取/工具是否正常)`,
        );
      }
      await this.prisma.industryChain.update({
        where: { id: chainId },
        data: { status: failed ? "FAILED" : "COMPLETED" },
      });
    } catch (error) {
      this.logger.error(
        `[runMission] chain=${chainId} failed: ${error instanceof Error ? error.message : String(error)}`,
      );
      await this.prisma.industryChain
        .update({ where: { id: chainId }, data: { status: "FAILED" } })
        .catch((e) =>
          this.logger.error(`[runMission] status update failed: ${e}`),
        );
    }
  }

  /**
   * 抽取结果落库：实体消歧去重 → 落库实体 → 映射+校验关系 → 落库关系。
   * 供编排 persist 步调用，也可独立测试。
   */
  async persistExtraction(
    chainId: string,
    raw: unknown,
  ): Promise<{ entities: number; relations: number; dropped: number }> {
    const result: ChainExtractionResult =
      ChainExtractionResultSchema.parse(raw);

    // ── 1. 实体消歧（embedding 调用，放事务外，避免长事务持有连接）──────────
    const companyNames = result.companies.map((c) => c.name);
    const resolution = await this.entityResolution.resolve(companyNames);
    // SEC 名册（放事务外）：用 ticker 权威反查 CIK——LLM 直出的 cik 不可信（会"张冠李戴"
    // 给一个真实但错误的旧公司 cik，导致拉到 2006 年的备案）。无 ticker 或查不到 → 无 SEC 数据。
    const secMaps = await this.loadSecMaps().catch(() => null);
    // canonical → 合并后的公司元数据（纯计算）
    const byCanonical = new Map<string, (typeof result.companies)[number]>();
    for (const c of result.companies) {
      const canonical = resolution.canonicalOf[c.name] ?? c.name;
      const existing = byCanonical.get(canonical);
      if (!existing) {
        byCanonical.set(canonical, { ...c, name: canonical });
      } else {
        byCanonical.set(canonical, {
          ...existing,
          cik: existing.cik ?? c.cik,
          segment: existing.segment ?? c.segment,
          description: existing.description ?? c.description,
          sourceRefs: [...(existing.sourceRefs ?? []), ...(c.sourceRefs ?? [])],
        });
      }
    }

    // ── 2. 事务落库（阻断-1：原子 + 幂等）──────────────────────────────────
    // 幂等：先清该 chain 旧实体/关系，再全量重写——resume/重试产生干净状态，
    // 避免无唯一索引的实体产生幽灵重复 + 唯一约束关系二次 create 崩溃。
    return this.prisma.$transaction(async (tx) => {
      await tx.industryRelation.deleteMany({ where: { chainId } });
      await tx.industryEntity.deleteMany({ where: { chainId } });

      const canonicalToId = new Map<string, string>();
      // 归一环节名 → {id, order}：供公司归属匹配 + 脊柱排序
      const segByNorm = new Map<string, { id: string; order: number | null }>();

      // 2a. 环节实体（按 name 直接去重）
      for (const seg of result.segments) {
        const name = seg.name.trim();
        if (!name || canonicalToId.has(name)) continue;
        const ent = await tx.industryEntity.create({
          data: {
            chainId,
            name,
            type: "SEGMENT" satisfies (typeof ENTITY_TYPES)[number],
            segment: name,
            description: seg.description ?? null,
          },
        });
        canonicalToId.set(name, ent.id);
        segByNorm.set(normalizeSegmentName(name), {
          id: ent.id,
          order: seg.order ?? null,
        });
      }

      // 2b. 公司实体（语义消歧去重 + 必须归属某已声明环节）。
      // 产业链中的公司必须落在某个环节；无法归属者多为 LLM 串扰的离题公司（如半导体链
      // 误抽进涂料公司）→ 丢弃，既滤噪又保证连通。安全阀：一个环节都没声明时不启用此过滤，
      // 避免把整张图清空（LLM 偶发只给 companies 不给 segments）。
      const companySegmentPairs: Array<{
        companyId: string;
        segmentId: string;
      }> = [];
      const enforceSegmentMembership = segByNorm.size > 0;
      let orphanDropped = 0;
      for (const [canonical, c] of byCanonical) {
        if (canonicalToId.has(canonical)) continue;
        const seg = c.segment
          ? segByNorm.get(normalizeSegmentName(c.segment))
          : undefined;
        if (enforceSegmentMembership && !seg) {
          orphanDropped++;
          continue;
        }
        // 权威 CIK：用 ticker 反查 SEC（忽略 LLM 直出的 cik，它常张冠李戴）。
        // 无 ticker / 查不到 → 无 cik（非美或无法确认）→ 同时丢掉 LLM 杜撰的 sec.gov 来源。
        const cik =
          c.ticker && secMaps
            ? (secMaps.tickerToCik.get(c.ticker.toUpperCase()) ?? null)
            : null;
        let refs = sanitizeSourceRefs(c.sourceRefs);
        if (!cik) {
          refs = refs.filter((r) => !r.url || !/sec\.gov/i.test(r.url));
        }
        // 企业类型：有权威 cik（ticker 反查成功）→ 确定性 LISTED_US；否则用 LLM 标注（归一）。
        const companyType = cik
          ? "LISTED_US"
          : normalizeCompanyType(c.companyType);
        const ent = await tx.industryEntity.create({
          data: {
            chainId,
            name: canonical,
            type: "COMPANY" satisfies (typeof ENTITY_TYPES)[number],
            cik,
            companyType,
            segment: c.segment ?? null,
            description: c.description ?? null,
            sourceRefs: refs as object,
          },
        });
        canonicalToId.set(canonical, ent.id);
        if (seg)
          companySegmentPairs.push({ companyId: ent.id, segmentId: seg.id });
      }
      if (orphanDropped) {
        this.logger.warn(
          `[persistExtraction] chain=${chainId} dropped ${orphanDropped} off-topic companies (no matching segment)`,
        );
      }

      // 2c. 关系：合成结构骨架（环节脊柱 + 公司归属）∪ LLM 抽取关系，去重后落库。
      // 结构骨架确保图谱连通，不再依赖 LLM 是否吐出 relations（实测常吐空/对不上）。
      const orderedSegmentIds = [...segByNorm.values()]
        .sort(
          (a, b) =>
            (a.order ?? Number.MAX_SAFE_INTEGER) -
            (b.order ?? Number.MAX_SAFE_INTEGER),
        )
        .map((s) => s.id);
      const structural = buildStructuralRows(
        orderedSegmentIds,
        companySegmentPairs,
      );
      const { rows: llmRows, dropped } = buildRelationRows(
        result.relations,
        resolution.canonicalOf,
        canonicalToId,
      );
      if (dropped.length) {
        this.logger.warn(
          `[persistExtraction] chain=${chainId} dropped ${dropped.length} invalid relations`,
        );
      }
      const rows = mergeRelationRows(structural, llmRows);
      for (const row of rows) {
        await tx.industryRelation.create({
          data: {
            chainId,
            sourceId: row.sourceId,
            targetId: row.targetId,
            relationType: row.relationType,
            weight: row.weight,
            evidence: row.evidence,
            validFrom: new Date(),
          },
        });
      }

      return {
        entities: canonicalToId.size,
        relations: rows.length,
        dropped: dropped.length + orphanDropped,
      };
    });
  }

  /** 取图（M6 ownerId 越权过滤）。 */
  async getGraph(userId: string, chainId: string): Promise<ChainGraph> {
    const chain = await this.prisma.industryChain.findFirst({
      where: { id: chainId, ownerId: userId },
      include: { entities: true, relations: true },
    });
    if (!chain) {
      throw new NotFoundException("产业链不存在或无访问权限");
    }
    const nodes: ChainGraphNode[] = chain.entities.map((e) => ({
      id: e.id,
      label: e.name,
      type: e.type,
      segment: e.segment,
      companyType: e.companyType,
    }));
    const edges: ChainGraphEdge[] = chain.relations
      .filter((r) => r.validTo === null) // 仅当前有效边
      .map((r) => ({
        source: r.sourceId,
        target: r.targetId,
        type: r.relationType,
        weight: r.weight,
      }));
    return {
      nodes,
      edges,
      stats: {
        totalNodes: nodes.length,
        totalEdges: edges.length,
        segments: nodes.filter((n) => n.type === "SEGMENT").length,
        companies: nodes.filter((n) => n.type === "COMPANY").length,
      },
    };
  }

  /** 取单实体详情（M6 ownerId 越权过滤，经 chain 归属）。 */
  async getEntity(userId: string, entityId: string) {
    const entity = await this.prisma.industryEntity.findFirst({
      where: { id: entityId, chain: { ownerId: userId } },
    });
    if (!entity) {
      throw new NotFoundException("实体不存在或无访问权限");
    }
    return entity;
  }

  /** SEC 全量名册（company_tickers.json，双向 cik↔ticker，进程级缓存）。失败回退旧缓存/null。 */
  private async loadSecMaps(): Promise<{
    cikToTicker: Map<string, string>;
    tickerToCik: Map<string, string>;
  } | null> {
    if (
      !this.secTickerCache ||
      Date.now() - this.secTickerCache.at > SEC_TICKER_TTL_MS
    ) {
      try {
        const res = await fetch(
          "https://www.sec.gov/files/company_tickers.json",
          {
            headers: { "User-Agent": "IndustryChain industry-chain@gens.team" },
          },
        );
        if (!res.ok) return this.secTickerCache;
        const json = (await res.json()) as Record<
          string,
          { cik_str: number; ticker: string }
        >;
        const cikToTicker = new Map<string, string>();
        const tickerToCik = new Map<string, string>();
        for (const v of Object.values(json)) {
          if (!v?.ticker) continue;
          const cik = String(v.cik_str).padStart(10, "0");
          cikToTicker.set(cik, v.ticker);
          tickerToCik.set(v.ticker.toUpperCase(), cik);
        }
        this.secTickerCache = { at: Date.now(), cikToTicker, tickerToCik };
      } catch (e) {
        this.logger.warn(`[loadSecMaps] SEC tickers fetch failed: ${e}`);
        return this.secTickerCache;
      }
    }
    return this.secTickerCache;
  }

  /** cik→ticker。finance-api 只认 ticker。 */
  private async resolveTickerByCik(cik: string): Promise<string | null> {
    const maps = await this.loadSecMaps();
    return maps?.cikToTicker.get(cik) ?? null;
  }

  /**
   * 实体行情（M6 越权过滤）。best-effort：需 cik→ticker 可解析 + finance-api(AV key) + 美股。
   * 任一不满足返回 { available:false }，由前端退回深链入口（不报错、不空白）。
   */
  async getEntityFinance(
    userId: string,
    entityId: string,
  ): Promise<EntityFinance> {
    const entity = await this.prisma.industryEntity.findFirst({
      where: { id: entityId, chain: { ownerId: userId } },
    });
    if (!entity) {
      throw new NotFoundException("实体不存在或无访问权限");
    }
    if (!entity.cik) return { available: false };

    const ticker = await this.resolveTickerByCik(entity.cik);
    if (!ticker) return { available: false };

    const tool = this.toolRegistry.tryGet("finance-api");
    if (!tool) return { available: false };

    const ctx: ToolContext = {
      executionId: randomUUID(),
      toolId: "finance-api",
      createdAt: new Date(),
      userId,
    };
    try {
      const [quoteRes, dailyRes] = await Promise.all([
        tool.execute({ queryType: "stock_quote", symbol: ticker }, ctx),
        tool.execute({ queryType: "stock_daily", symbol: ticker }, ctx),
      ]);
      const quote = (quoteRes?.data as FinToolOutput | undefined) ?? undefined;
      const daily = (dailyRes?.data as FinToolOutput | undefined) ?? undefined;

      const priceStr = quote?.success ? quote.data?.[0]?.value : undefined;
      const price = priceStr ? Number(priceStr) : undefined;
      const change = quote?.metadata?.["09. change"]
        ? Number(quote.metadata["09. change"])
        : undefined;
      const changePercent = quote?.metadata?.["10. change percent"];

      // AV 日线最新在前；取近 30 点并反转为时间正序（左旧右新）供 sparkline。
      const series = daily?.success
        ? (daily.data ?? [])
            .slice(0, 30)
            .map((p) => ({
              date: p.date ?? "",
              close: Number(p.close ?? p.value ?? 0),
            }))
            .filter((p) => p.date && Number.isFinite(p.close) && p.close > 0)
            .reverse()
        : [];

      if (price === undefined && series.length === 0) {
        return { available: false, ticker };
      }
      return {
        available: true,
        ticker,
        price: Number.isFinite(price) ? price : undefined,
        change: Number.isFinite(change) ? change : undefined,
        changePercent,
        series,
      };
    } catch (e) {
      this.logger.warn(
        `[getEntityFinance] entity=${entityId} ticker=${ticker} failed: ${e}`,
      );
      return { available: false, ticker };
    }
  }

  /**
   * 资本/投资动态（M6 越权过滤）。直接拉 SEC submissions 拿 8-K 的 **items 代码**，
   * 提炼成一句话事件（完成并购 / 高管变动 / 业绩…）；内部人交易(Form 3/4/5)频繁且无明细，
   * **归并成一条带计数**（避免一排重复的"内部人交易"）。仅美股上市公司有数据。
   */
  async getEntityInvestment(
    userId: string,
    entityId: string,
  ): Promise<EntityInvestment> {
    const entity = await this.prisma.industryEntity.findFirst({
      where: { id: entityId, chain: { ownerId: userId } },
    });
    if (!entity) {
      throw new NotFoundException("实体不存在或无访问权限");
    }
    if (!entity.cik) return { available: false, items: [] };

    try {
      const res = await fetch(
        `https://data.sec.gov/submissions/CIK${entity.cik}.json`,
        {
          headers: { "User-Agent": "IndustryChain industry-chain@gens.team" },
        },
      );
      if (!res.ok) return { available: false, items: [] };
      const json = (await res.json()) as {
        filings?: {
          recent?: {
            form?: string[];
            filingDate?: string[];
            accessionNumber?: string[];
            primaryDocument?: string[];
            items?: string[];
          };
        };
      };
      const r = json?.filings?.recent;
      if (!r?.form) return { available: false, items: [] };

      // recency 兜底：filings.recent 为倒序，最新一条若已 > 2 年，说明该 cik 失效/张冠李戴
      // （活跃公司不会两年无任何备案，如旧数据里 NVIDIA 误挂到 2006 停更的旧 cik）→ 不展示。
      const newestYear = parseInt((r.filingDate?.[0] ?? "").slice(0, 4), 10);
      if (newestYear && new Date().getFullYear() - newestYear > 2) {
        return { available: false, items: [] };
      }

      const cikNum = String(parseInt(entity.cik, 10)); // URL 用去零 cik
      const buildUrl = (acc?: string, doc?: string): string =>
        acc && doc
          ? `https://www.sec.gov/Archives/edgar/data/${cikNum}/${acc.replace(/-/g, "")}/${doc}`
          : "";

      // 按事件类型归并：每类一条（笔数 + 最近日期 + 最近一笔链接），消除"一排同名"。
      const byLabel = new Map<
        string,
        { count: number; latest: string; url: string }
      >();
      for (let i = 0; i < r.form.length; i++) {
        const { label } = classifyFiling(r.form[i], r.items?.[i]);
        if (!label) continue;
        const date = r.filingDate?.[i] ?? "";
        const url = buildUrl(r.accessionNumber?.[i], r.primaryDocument?.[i]);
        const ex = byLabel.get(label);
        if (!ex) {
          byLabel.set(label, { count: 1, latest: date, url });
        } else {
          ex.count++;
          if (date > ex.latest) {
            ex.latest = date;
            ex.url = url;
          }
        }
      }
      const nowYear = new Date().getFullYear();
      const items: InvestmentItem[] = [...byLabel.entries()]
        .map(([label, v]) => ({ label, ...v }))
        // 丢弃 >5 年的陈旧类别（如老的内部人交易），只留近期资本动态
        .filter((v) => {
          const y = parseInt(v.latest.slice(0, 4), 10);
          return !y || nowYear - y <= 5;
        })
        // 最新在最上面
        .sort((a, b) => b.latest.localeCompare(a.latest))
        .slice(0, 8)
        .map((v) => ({
          form: "",
          label: v.count > 1 ? `${v.label}（${v.count} 笔）` : v.label,
          date: v.latest,
          url: v.url,
        }));
      return { available: items.length > 0, items };
    } catch (e) {
      this.logger.warn(`[getEntityInvestment] entity=${entityId} failed: ${e}`);
      return { available: false, items: [] };
    }
  }

  /**
   * 初创/未上市公司档案（M6 越权过滤）。免费源 StartupHub.ai（AI 创投库）。
   * 仅对**无 CIK 的公司节点**(非美上市 / 初创 / 私营)启用——美股上市走 SEC/行情。
   * 需配 STARTUPHUB_API_KEY；未配 / 名称对不上 / 查不到 → available:false（前端退回深链）。
   */
  async getEntityStartup(
    userId: string,
    entityId: string,
  ): Promise<EntityStartup> {
    const entity = await this.prisma.industryEntity.findFirst({
      where: { id: entityId, chain: { ownerId: userId } },
    });
    if (!entity) {
      throw new NotFoundException("实体不存在或无访问权限");
    }
    // 仅非美上市公司(无 cik)用 StartupHub；上市公司有 SEC/行情，不重复
    if (entity.type !== "COMPANY" || entity.cik) {
      return { available: false };
    }

    // 走 engine 注册的 StartupHubTool（key/名称匹配/档案抓取均在 tool 内统一管理）
    const tool = this.toolRegistry.tryGet("startuphub-startup");
    if (!tool) return { available: false };

    const ctx: ToolContext = {
      executionId: randomUUID(),
      toolId: "startuphub-startup",
      createdAt: new Date(),
      userId,
    };
    try {
      const res = await tool.execute({ query: entity.name }, ctx);
      const out = (res?.data as StartupHubToolOutput | undefined) ?? undefined;
      if (!out?.found) return { available: false };
      return {
        available: true,
        name: out.name ?? entity.name,
        oneLiner: out.oneLiner,
        website: out.website,
        hq: out.hq,
        foundedDate: out.foundedDate,
        totalFunding: out.totalFunding,
        employeeCount: out.employeeCount,
        sectors: out.sectors,
        operatingStatus: out.operatingStatus,
        stealth: out.stealth,
        profileUrl: out.profileUrl,
      };
    } catch (e) {
      this.logger.warn(`[getEntityStartup] entity=${entityId} failed: ${e}`);
      return { available: false };
    }
  }

  /** 取产业链元信息（M6 ownerId 越权过滤）。 */
  async getChain(userId: string, chainId: string) {
    const chain = await this.prisma.industryChain.findFirst({
      where: { id: chainId, ownerId: userId },
    });
    if (!chain) {
      throw new NotFoundException("产业链不存在或无访问权限");
    }
    return chain;
  }

  /** 列出本用户的历史产业链分析（M6 ownerId 过滤），含实体数，按时间倒序。 */
  async listChains(userId: string) {
    const chains = await this.prisma.industryChain.findMany({
      where: { ownerId: userId },
      orderBy: { createdAt: "desc" },
      take: 50,
      include: { _count: { select: { entities: true } } },
    });
    return chains.map((c) => ({
      id: c.id,
      topic: c.topic,
      status: c.status,
      createdAt: c.createdAt,
      entityCount: c._count.entities,
    }));
  }

  /** 删除产业链（M6 ownerId 过滤，级联删实体/关系）。 */
  async deleteChain(
    userId: string,
    chainId: string,
  ): Promise<{ deleted: boolean }> {
    const chain = await this.prisma.industryChain.findFirst({
      where: { id: chainId, ownerId: userId },
      select: { id: true },
    });
    if (!chain) {
      throw new NotFoundException("产业链不存在或无访问权限");
    }
    await this.prisma.industryChain.delete({ where: { id: chainId } });
    return { deleted: true };
  }

  /**
   * 确保产业链 pipeline 已注册（模块 onModuleInit 调用）。
   * 幂等：已注册则跳过；未注册则注册——配置校验/未知 primitive 错误**故意不吞**，
   * 让其在应用启动期 fail-fast 暴露（避免静默吞错后 analyze 时才报 "pipeline not found"）。
   */
  ensurePipelineRegistered(
    config: Parameters<MissionPipelineRegistry["register"]>[0],
  ): void {
    if (this.registry.has(config.id)) return;
    this.registry.register(config);
  }
}
