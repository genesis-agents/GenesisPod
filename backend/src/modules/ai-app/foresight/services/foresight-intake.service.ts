import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from "@nestjs/common";
import { AIModelType } from "@prisma/client";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../../../../common/prisma/prisma.service";
import {
  AiChatService,
  ContentSourceRegistry,
} from "@/modules/ai-engine/facade";

interface TopicLayerDef {
  id: string;
  name: string;
}

export interface DraftCard {
  layer: string;
  title: string;
  claim: string;
  conf: number;
  sens: "high" | "mid" | "low";
  horizon: number;
  stage: "current" | "evolving" | "exploring" | "research";
  evidence: string[];
  falsifiers: string[];
  sources: Array<{ org: string; title: string; type: string; url: string }>;
}

/** 草稿影响边：LLM 在已有卡片间推断的关系，前端审核后逐条 createEdge 入库。 */
export interface DraftEdge {
  fromKey: string;
  toKey: string;
  metric: string;
  type: "flow" | "constrain";
  weight: number;
  reason: string;
}

/**
 * ForesightIntakeService —— 雷达/洞察 → 前瞻的供料通道（P2/P3，2026-06-12）。
 *
 * 两条线都走 engine ContentSourceRegistry（AI_RADAR / AI_PLAYGROUND），
 * 不直接 import 兄弟 app —— 与 CLAUDE.md「App 间经 registry 中转」红线一致。
 *
 * P2 scanRadar：拉用户雷达近期高分信号 → 与本主题全部 falsifier 做 LLM 匹配
 *   （deterministic）→ 命中的生成候选 ForesightSignal（强信号可注入/弱信号仅关注）。
 *   匹配判定是初筛，注入仍要人过依据档案 —— 人是信号确认的守门员。
 *
 * P3 extractFromMission：取一份已完成洞察 mission 报告 → LLM 按主题层级本体
 *   抽取 3-6 张草稿假设卡（falsifier 缺失的直接丢弃 —— 入库门槛）→ 返回给前端
 *   人工审核，逐张经 createCard 入库（originType=insight-mission）。
 */
@Injectable()
export class ForesightIntakeService {
  private readonly logger = new Logger(ForesightIntakeService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly registry: ContentSourceRegistry,
    private readonly aiChat: AiChatService,
  ) {}

  // ── P2: 雷达信号扫描 ──────────────────────────────────────────────────

  async scanRadar(
    userId: string,
    topicId: string,
    /** 只看最近 N 天的雷达信号（手动扫描默认全窗口 30 天；每日自动扫描传 3 减少重复输入） */
    sinceDays?: number,
  ): Promise<{ scanned: number; matched: number; created: number }> {
    return this.matchSignalsFromSource(userId, topicId, {
      sourceId: "AI_RADAR",
      sourceNoun: "雷达",
      sourceOrg: "AI 雷达",
      missingMsg: "雷达内容源未注册（后端未启用 RadarModule）",
      sinceDays,
    });
  }

  // ── P4: 前沿库信号扫描（2026-06-14）─────────────────────────────────────
  //
  // 与 scanRadar 同一条供料范式（前沿库资源 → 假设卡 falsifier LLM 匹配 → 候选信号），
  // 但**只手动触发**：刻意不接入每日自动扫描调度器，避免每天对全部主题批量调 LLM
  // 浪费资源。触发方式 = 前端按钮（controller 的 explore-scan 端点）。

  async scanExplore(
    userId: string,
    topicId: string,
    sinceDays?: number,
  ): Promise<{ scanned: number; matched: number; created: number }> {
    return this.matchSignalsFromSource(userId, topicId, {
      sourceId: "AI_EXPLORE",
      sourceNoun: "前沿库",
      sourceOrg: "AI 前沿库",
      missingMsg: "前沿库内容源未注册（后端未启用 ExploreModule）",
      sinceDays,
    });
  }

  /**
   * 通用「内容源信号 → 假设卡 falsifier 匹配 → 候选信号」匹配器（radar / explore 共用）。
   * 走 engine ContentSourceRegistry 取源（不直接 import 兄弟 app）；单次 1 个 deterministic
   * LLM 调用，命中建候选 ForesightSignal（仍需人过依据档案后注入 —— 人是守门员）。
   */
  private async matchSignalsFromSource(
    userId: string,
    topicId: string,
    opts: {
      sourceId: string;
      sourceNoun: string;
      sourceOrg: string;
      missingMsg: string;
      sinceDays?: number;
    },
  ): Promise<{ scanned: number; matched: number; created: number }> {
    const { sourceId, sourceNoun, sourceOrg, missingMsg, sinceDays } = opts;
    const topic = await this.requireTopic(userId, topicId);
    const cards = await this.prisma.foresightCard.findMany({
      where: { topicId },
      select: {
        id: true,
        cardKey: true,
        title: true,
        conf: true,
        falsifiers: true,
      },
    });
    const withFals = cards
      .map((c) => ({
        ...c,
        falsifiers: (c.falsifiers as string[] | null) ?? [],
      }))
      .filter((c) => c.falsifiers.length > 0);
    if (withFals.length === 0) {
      throw new BadRequestException(
        "主题还没有带证伪信号（falsifier）的假设卡 —— 先录入假设，扫描才有匹配目标",
      );
    }

    const source = this.registry.get(sourceId);
    if (!source) {
      throw new ServiceUnavailableException(missingMsg);
    }
    const { items } = await source.listItems(userId, {
      limit: 30,
      ...(sinceDays
        ? {
            dateRange: {
              from: new Date(
                Date.now() - sinceDays * 24 * 3600 * 1000,
              ).toISOString(),
              to: new Date().toISOString(),
            },
          }
        : {}),
    });
    if (items.length === 0) {
      return { scanned: 0, matched: 0, created: 0 };
    }

    const prompt = [
      `你是战略洞察系统的信号匹配器。下面是「${topic.name}」主题的假设卡证伪条件清单，以及用户${sourceNoun}最近采集的资讯信号。`,
      `任务：判断每条资讯是否命中某条预登记的证伪/监测条件。只有语义上确实构成该条件的证据（或强烈迹象）才算命中——主题相关但不构成条件命中的不算。`,
      ``,
      `## 假设卡证伪条件`,
      ...withFals.map(
        (c) =>
          `- ${c.cardKey}「${c.title}」: ${c.falsifiers.map((f, i) => `[${i}] ${f}`).join("； ")}`,
      ),
      ``,
      `## ${sourceNoun}信号（index 从 0 开始）`,
      ...items.map(
        (it, idx) =>
          `[${idx}] ${it.title}${it.preview ? ` — ${it.preview.slice(0, 160)}` : ""}`,
      ),
      ``,
      `输出严格 JSON（无其他文字）：`,
      `{"matches":[{"index":0,"cardKey":"A-L0-01","falsifier":"命中的条件原文","grade":"strong|weak","direction":"down|up","reason":"为何构成命中，一句话"}]}`,
      `grade 判定：单一来源/传闻=weak；明确事实/官方口径=strong。direction：证伪假设=down，强化约束类假设=up。无命中输出 {"matches":[]}。`,
    ].join("\n");

    const parsed = await this.chatJson<{
      matches?: Array<{
        index: number;
        cardKey: string;
        falsifier: string;
        grade: string;
        direction: string;
        reason: string;
      }>;
    }>(prompt, { creativity: "deterministic", outputLength: "medium" });
    if (parsed === null) {
      throw new BadRequestException(
        "信号匹配模型返回异常（空输出或非 JSON，已自动重试 1 次）—— 稍后再试，或在模型设置中避免推理型模型作默认",
      );
    }
    const matches = (parsed.matches ?? []).filter(
      (m) =>
        Number.isInteger(m.index) &&
        m.index >= 0 &&
        m.index < items.length &&
        withFals.some((c) => c.cardKey === m.cardKey),
    );

    /* 去重：同主题下同名信号不重复创建 */
    const existing = await this.prisma.foresightSignal.findMany({
      where: { topicId },
      select: { name: true },
    });
    const existingNames = new Set(existing.map((s) => s.name));

    let created = 0;
    for (const m of matches) {
      const item = items[m.index];
      const card = withFals.find((c) => c.cardKey === m.cardKey)!;
      if (existingNames.has(item.title)) continue;
      const direction = m.direction === "up" ? "up" : "down";
      const grade = m.grade === "strong" ? "strong" : "weak";
      const targetConf =
        direction === "up"
          ? Math.min(0.95, +(card.conf + 0.15).toFixed(2))
          : Math.max(0.05, +(card.conf - 0.2).toFixed(2));
      await this.prisma.foresightSignal.create({
        data: {
          userId,
          topicId,
          name: item.title,
          targetCardId: card.id,
          direction,
          targetConf,
          grade,
          effect:
            direction === "up"
              ? `约束收紧信号命中 ${card.cardKey}「${card.title}」— 裁定后置信度 ${card.conf.toFixed(2)} → ${targetConf.toFixed(2)}。`
              : `证伪信号命中 ${card.cardKey}「${card.title}」— 裁定后置信度 ${card.conf.toFixed(2)} → ${targetConf.toFixed(2)}。`,
          basis: {
            falsifier: m.falsifier,
            dir:
              direction === "up"
                ? "约束收紧方向 — 命中后置信度上调"
                : "证伪方向 — 命中后置信度下调",
            gradeNote: m.reason,
            observed: item.preview?.slice(0, 200) ?? item.title,
            sources: [
              {
                org: sourceOrg,
                title: item.title,
                type: "report",
                url: "",
              },
            ],
          } as Prisma.InputJsonValue,
        },
      });
      existingNames.add(item.title);
      created++;
    }

    this.logger.log(
      `foresight signal-scan[${sourceId}]: topic=${topicId} scanned=${items.length} matched=${matches.length} created=${created}`,
    );
    return { scanned: items.length, matched: matches.length, created };
  }

  // ── P3: 洞察 mission 抽取 ─────────────────────────────────────────────

  async listInsightMissions(userId: string) {
    const source = this.registry.get("AI_PLAYGROUND");
    if (!source) return [];
    const { items } = await source.listItems(userId, { limit: 20 });
    return items;
  }

  async extractFromMission(
    userId: string,
    topicId: string,
    sourceId: string,
  ): Promise<{ drafts: DraftCard[]; missionTitle: string }> {
    const topic = await this.requireTopic(userId, topicId);
    const layers = (topic.layers as TopicLayerDef[] | null) ?? [];
    if (layers.length === 0) {
      throw new BadRequestException("主题未定义层级本体");
    }
    const source = this.registry.get("AI_PLAYGROUND");
    if (!source) {
      throw new ServiceUnavailableException("洞察内容源未注册");
    }
    const bundles = await source.fetchBundle([sourceId], userId);
    const bundle = bundles[0];
    if (!bundle?.body) {
      throw new NotFoundException("mission 报告不存在或为空");
    }

    /* ★ 2026-06-12 修「报告只看了开头」：洞察报告常态 10 万字，单次调用截断会
       丢 90% 内容。改分片抽取（按章节边界切 ~9k 字/片，并发 3）+ 汇总去重，
       全文覆盖。片数上限 16（≈14 万字），超出截尾并在日志注明。 */
    const chunks = this.splitReport(bundle.body, 9000, 16);
    const layerIds = new Set(layers.map((l) => l.id));
    const candidateLists = await this.mapWithConcurrency(
      chunks,
      3,
      (chunk, i) =>
        this.extractChunk(topic.name, layers, chunk, i + 1, chunks.length).then(
          (cards) => this.sanitizeDrafts(cards, layerIds, layers),
        ),
    );
    const candidates = candidateLists.flat();
    this.logger.log(
      `foresight extract: topic=${topicId} mission=${sourceId} bodyLen=${bundle.body.length} chunks=${chunks.length} candidates=${candidates.length}`,
    );
    if (candidates.length === 0) {
      throw new BadRequestException(
        `全文 ${chunks.length} 个分片均未抽取到符合纪律的假设卡（falsifier 必填）—— 报告可能偏叙述性，或模型输出异常（已逐片重试）`,
      );
    }
    const drafts = await this.consolidate(candidates);
    // 信源补真实链接：保留研报正文里真实出现过的外部 url（剔除 LLM 幻觉），
    // 一张卡没有任何真实外部链接时回退附上「来源研报」内部链接。
    const reportUrls = this.collectUrls(bundle.body);
    const reportLink = {
      org: "来源研报",
      title: bundle.title || "深度洞察报告",
      type: "report",
      url: `/agent-playground/team/${sourceId}`,
    };
    const linked = drafts.map((d) => ({
      ...d,
      sources: this.attachRealSourceLinks(d.sources, reportUrls, reportLink),
    }));
    return { drafts: linked, missionTitle: bundle.title };
  }

  /** 收集文本里真实出现的 http(s) URL（用于校验 LLM 信源、剔除幻觉链接）。 */
  private collectUrls(text: string): Set<string> {
    const set = new Set<string>();
    const re = /https?:\/\/[^\s)\]"'<>]+/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null) {
      set.add(m[0].replace(/[.,;)]+$/, ""));
    }
    return set;
  }

  /**
   * 为信源补真实有效链接：
   *  - 保留 LLM 给的、且确实在研报正文出现过的外部 url（剔除编造/幻觉链接）；
   *  - 整张卡没有任何真实外部链接时，回退附上「来源研报」内部链接。
   */
  private attachRealSourceLinks(
    sources: DraftCard["sources"],
    reportUrls: Set<string>,
    reportLink: DraftCard["sources"][number],
  ): DraftCard["sources"] {
    const cleaned = (sources ?? []).map((s) => {
      const url = typeof s.url === "string" ? s.url.trim() : "";
      const real =
        url && reportUrls.has(url.replace(/[.,;)]+$/, "")) ? url : "";
      return { ...s, url: real };
    });
    const hasReal = cleaned.some((s) => s.url);
    return hasReal ? cleaned : [...cleaned, reportLink];
  }

  // ── 影响边自动生成 ────────────────────────────────────────────────────

  /**
   * 在主题现有卡片之间推断影响边（不落库；前端审核勾选后逐条 createEdge）。
   * 背景：extract/导入是纯卡片管线，从不产边，导入后图谱必然 0 连线。
   * 本方法补这一环：按层级本体方向（flow 自上而下 / constrain 自下而上）连边，
   * 严格约束到已存在 cardKey、去重（含与库内既有边去重）、weight/数量封顶。
   */
  async suggestEdges(
    userId: string,
    topicId: string,
  ): Promise<{ drafts: DraftEdge[] }> {
    const topic = await this.requireTopic(userId, topicId);
    const layers = (topic.layers as TopicLayerDef[] | null) ?? [];
    const cards = await this.prisma.foresightCard.findMany({
      where: { topicId },
      select: {
        id: true,
        cardKey: true,
        layer: true,
        title: true,
        claim: true,
      },
      orderBy: [{ layer: "asc" }, { cardKey: "asc" }],
    });
    if (cards.length < 2) {
      throw new BadRequestException(
        "主题卡片不足 2 张，无法生成影响边 —— 先录入更多假设卡",
      );
    }

    const keySet = new Set(cards.map((c) => c.cardKey));
    const idToKey = new Map(cards.map((c) => [c.id, c.cardKey]));
    const existing = await this.prisma.foresightEdge.findMany({
      where: { topicId },
      select: { fromCardId: true, toCardId: true },
    });
    const existingPairs = new Set(
      existing
        .map((e) => {
          const f = idToKey.get(e.fromCardId);
          const t = idToKey.get(e.toCardId);
          return f && t ? `${f}->${t}` : null;
        })
        .filter((x): x is string => x !== null),
    );

    const cap = Math.min(40, Math.ceil(cards.length * 1.5));
    const prompt = [
      `你是战略前瞻系统的影响关系抽取器。下面是「${topic.name}」主题的全部假设卡（按层级本体排列）。推断卡片之间真实存在的影响关系，输出影响边。`,
      ``,
      `## 层级本体（从需求侧到物理/约束侧）`,
      ...layers.map((l) => `- ${l.id}: ${l.name}`),
      ``,
      `## 假设卡（fromKey/toKey 只能取下面出现的编号）`,
      ...cards.map(
        (c) =>
          `- [${c.layer}] ${c.cardKey}「${c.title}」: ${c.claim.slice(0, 140)}`,
      ),
      ``,
      `## 影响边纪律`,
      `- 只在确有因果/传导关系的卡片间连边，宁缺毋滥，不要为连而连`,
      `- type=flow：需求自上而下传导（上游层→下游层）；type=constrain：物理/工程约束自下而上反压（下游层→上游层）`,
      `- metric 必填：影响通过什么可量化的量传导（如"HBM 带宽""专家并行通信量""单位算力功耗"），不要泛泛的"影响"`,
      `- weight 0.05–1：传导强度（强直接=0.7–1，弱间接=0.05–0.4）`,
      `- fromKey≠toKey，同一对卡片只连一条，最多 ${cap} 条`,
      ``,
      `输出严格 JSON（无其他文字）：`,
      `{"edges":[{"fromKey":"A-L0-01","toKey":"A-L1-02","metric":"专家并行通信量","type":"flow","weight":0.7,"reason":"为何构成传导，一句话"}]}`,
    ].join("\n");

    const parsed = await this.chatJson<{
      edges?: Array<{
        fromKey?: string;
        toKey?: string;
        metric?: string;
        type?: string;
        weight?: number;
        reason?: string;
      }>;
    }>(prompt, { creativity: "deterministic", outputLength: "long" });
    if (parsed === null) {
      throw new BadRequestException(
        "影响边生成模型返回异常（空输出或非 JSON，已自动重试 1 次）—— 稍后再试",
      );
    }

    const seen = new Set<string>();
    const drafts: DraftEdge[] = [];
    for (const e of parsed.edges ?? []) {
      const fromKey = String(e.fromKey ?? "").trim();
      const toKey = String(e.toKey ?? "").trim();
      const metric = String(e.metric ?? "").trim();
      if (!keySet.has(fromKey) || !keySet.has(toKey)) continue;
      if (fromKey === toKey || !metric) continue;
      const pairKey = `${fromKey}->${toKey}`;
      if (existingPairs.has(pairKey) || seen.has(pairKey)) continue;
      seen.add(pairKey);
      let weight = Number(e.weight);
      if (!Number.isFinite(weight)) weight = 0.7;
      weight = Math.min(1, Math.max(0.05, +weight.toFixed(2)));
      drafts.push({
        fromKey,
        toKey,
        metric: metric.slice(0, 120),
        type: e.type === "constrain" ? "constrain" : "flow",
        weight,
        reason: String(e.reason ?? "").slice(0, 200),
      });
      if (drafts.length >= cap) break;
    }

    this.logger.log(
      `foresight suggest-edges: topic=${topicId} cards=${cards.length} raw=${(parsed.edges ?? []).length} drafts=${drafts.length}`,
    );
    return { drafts };
  }

  /** 单片抽取（0-4 张；空片正常返回 []） */
  private async extractChunk(
    topicName: string,
    layers: TopicLayerDef[],
    chunk: string,
    part: number,
    total: number,
  ): Promise<Array<Partial<DraftCard>>> {
    const prompt = [
      `你是战略前瞻系统的假设卡抽取器。下面是「${topicName}」主题深度洞察报告的第 ${part}/${total} 部分，从中抽取 0-4 张可证伪的假设卡（本片段没有可证伪判断就输出空数组，不要硬凑）。`,
      ``,
      `## 层级本体（layer 字段只能取这些 id）`,
      ...layers.map((l) => `- ${l.id}: ${l.name}`),
      ``,
      `## 假设卡纪律`,
      `- claim 必须具体可检验，带量化指标和时间窗，不要"正确的废话"`,
      `- falsifiers 必填 ≥1 条：什么可观测信号出现说明该假设错了（写不出的不要输出这张卡）`,
      `- conf 0-1（基于报告证据强度），sens: high|mid|low（该假设翻了下游影响多大）`,
      `- stage: current(已落地)|evolving(演进中)|exploring(探索验证)|research(研究前沿)`,
      `- evidence 从报告中提炼 1-3 条要点`,
      `- sources：引用报告中真实出现的来源；url 必须逐字复制报告里出现过的真实链接（http/https 开头），报告未给链接就留空 url（系统会自动回退到研报链接），严禁编造 url`,
      ``,
      `## 报告片段（第 ${part}/${total} 部分）`,
      chunk,
      ``,
      `输出严格 JSON（无其他文字）：`,
      `{"cards":[{"layer":"","title":"","claim":"","conf":0.6,"sens":"mid","horizon":2028,"stage":"exploring","evidence":[""],"falsifiers":[""],"sources":[{"org":"","title":"","type":"report","url":""}]}]}`,
    ].join("\n");

    const parsed = await this.chatJson<{ cards?: Array<Partial<DraftCard>> }>(
      prompt,
      { creativity: "low", outputLength: "long" },
    );
    /* 单片失败不中断全文抽取（其余片照常），日志留痕 */
    if (parsed === null) {
      this.logger.warn(
        `foresight extract: chunk ${part}/${total} LLM failed after retry — skipped`,
      );
      return [];
    }
    return parsed.cards ?? [];
  }

  /** 候选卡校验/归一（falsifier 缺失直接丢弃 —— 入库纪律） */
  private sanitizeDrafts(
    raw: Array<Partial<DraftCard>>,
    layerIds: Set<string>,
    layers: TopicLayerDef[],
  ): DraftCard[] {
    return raw
      .filter(
        (c) =>
          typeof c.title === "string" &&
          typeof c.claim === "string" &&
          Array.isArray(c.falsifiers) &&
          c.falsifiers.length > 0,
      )
      .map((c) => ({
        layer: layerIds.has(c.layer ?? "") ? (c.layer as string) : layers[0].id,
        title: (c.title as string).slice(0, 200),
        claim: c.claim as string,
        conf: Math.min(0.95, Math.max(0.05, Number(c.conf) || 0.5)),
        sens: c.sens === "high" || c.sens === "low" ? c.sens : "mid",
        horizon:
          Number.isInteger(c.horizon) &&
          (c.horizon as number) >= 2024 &&
          (c.horizon as number) <= 2045
            ? (c.horizon as number)
            : 2028,
        stage:
          c.stage === "current" ||
          c.stage === "evolving" ||
          c.stage === "research"
            ? c.stage
            : "exploring",
        evidence: (c.evidence ?? []).filter((x) => typeof x === "string"),
        falsifiers: (c.falsifiers ?? []).filter((x) => typeof x === "string"),
        sources: (c.sources ?? []).filter(
          (s) => s && typeof s.org === "string" && typeof s.title === "string",
        ),
      }));
  }

  /** 多片候选汇总去重：LLM 挑出 ≤12 张互不重复的最强卡；失败回退标题前缀去重 */
  private async consolidate(candidates: DraftCard[]): Promise<DraftCard[]> {
    if (candidates.length <= 12) return this.dedupeByTitle(candidates, 12);
    const listing = candidates
      .map(
        (c, i) => `[${i}] (${c.layer}) ${c.title} — ${c.claim.slice(0, 120)}`,
      )
      .join("\n");
    const parsed = await this.chatJson<{ keep?: number[] }>(
      [
        `以下是从同一份报告各部分抽取的候选假设卡。去重（同一判断的不同表述只留最强一张）并挑选最有判断价值的至多 12 张。`,
        listing,
        `输出严格 JSON：{"keep":[0,3,5]}（保留的 index 数组）`,
      ].join("\n\n"),
      { creativity: "deterministic", outputLength: "medium" },
    );
    const keep = (parsed?.keep ?? []).filter(
      (i) => Number.isInteger(i) && i >= 0 && i < candidates.length,
    );
    if (keep.length === 0) return this.dedupeByTitle(candidates, 12);
    return this.dedupeByTitle(
      [...new Set(keep)].map((i) => candidates[i]),
      12,
    );
  }

  private dedupeByTitle(cards: DraftCard[], cap: number): DraftCard[] {
    const seen = new Set<string>();
    const out: DraftCard[] = [];
    for (const c of cards) {
      const key = c.title.replace(/\s+/g, "").slice(0, 24);
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(c);
      if (out.length >= cap) break;
    }
    return out;
  }

  /** 按章节边界（# 标题行）优先切片，单片 ≤ maxChars，至多 maxChunks 片 */
  private splitReport(
    body: string,
    maxChars: number,
    maxChunks: number,
  ): string[] {
    const lines = body.split("\n");
    const chunks: string[] = [];
    let buf: string[] = [];
    let len = 0;
    for (const line of lines) {
      const isHeading = /^#{1,3}\s/.test(line);
      if (
        len + line.length > maxChars &&
        buf.length > 0 &&
        (isHeading || len > maxChars * 0.8)
      ) {
        chunks.push(buf.join("\n"));
        buf = [];
        len = 0;
        if (chunks.length >= maxChunks) break;
      }
      buf.push(line);
      len += line.length + 1;
    }
    if (buf.length > 0 && chunks.length < maxChunks)
      chunks.push(buf.join("\n"));
    if (chunks.length === 0) chunks.push(body.slice(0, maxChars));
    if (body.length > chunks.reduce((s, c) => s + c.length, 0) + 100) {
      this.logger.warn(
        `foresight extract: report tail beyond ${maxChunks} chunks truncated (bodyLen=${body.length})`,
      );
    }
    return chunks;
  }

  /** 受限并发 map（保持原顺序） */
  private async mapWithConcurrency<T, R>(
    items: T[],
    limit: number,
    fn: (item: T, index: number) => Promise<R>,
  ): Promise<R[]> {
    const results: R[] = new Array(items.length);
    let cursor = 0;
    const workers = Array.from(
      { length: Math.min(limit, items.length) },
      async () => {
        for (;;) {
          const i = cursor++;
          if (i >= items.length) return;
          results[i] = await fn(items[i], i);
        }
      },
    );
    await Promise.all(workers);
    return results;
  }

  // ── helpers ───────────────────────────────────────────────────────────

  private async requireTopic(userId: string, id: string) {
    const topic = await this.prisma.foresightTopic.findFirst({
      where: { id, userId },
    });
    if (!topic) throw new NotFoundException("topic not found");
    return topic;
  }

  /**
   * 带重试的 JSON 对话：空输出或解析失败时自动重试 1 次（追加压制思考过程的指令）。
   * 返回 null = 重试后仍失败（调用方给用户可理解的错误）。
   * 背景：推理型默认模型会把输出预算耗在 CoT 导致 content 空
   * （2026-06-07 产业链空结果事故同款签名），必须显式压制 + 重试兜底。
   */
  private async chatJson<T>(
    prompt: string,
    taskProfile: {
      creativity: "deterministic" | "low";
      outputLength: "medium" | "long";
    },
  ): Promise<T | null> {
    const suppress =
      "\n\n（重要：直接输出 JSON 结果本身。禁止输出任何思考过程、推理步骤、解释或 markdown 围栏——第一个字符必须是 { 。）";
    /* 重试时追加 /no_think：Qwen3 系关闭 thinking 的原生指令，其他模型视为普通文本无副作用 */
    for (let attempt = 0; attempt < 2; attempt++) {
      const response = await this.aiChat.chat({
        messages: [
          {
            role: "system",
            content:
              "你是只输出 JSON 的结构化数据接口。任何情况下都不输出思考过程。",
          },
          {
            role: "user",
            content:
              attempt === 0
                ? prompt + suppress
                : `/no_think\n${prompt}${suppress}`,
          },
        ],
        modelType: AIModelType.CHAT,
        taskProfile,
        // ★ responseFormat:"json" 让 wantsJson=true，接入全站统一的推理模型兜底机制
        //   （openai-caller 在 content 空但 reasoning_content 含 JSON 时抢救 / 降级 /
        //   token-bump）。漏传时推理模型（如 deepseek-v4-flash）把结果写进
        //   reasoning_content、content 留空 → 直接抛"token 全用于内部思考"。
        responseFormat: "json",
        // 内部系统调用：抽取的是系统已生成的可信报告语料（非用户输入）。
        // 输入护栏(prompt-injection/llm-moderation)对报告内容高误报会整块丢弃，
        // 与 insight 各内部调用一致，跳过整体护栏。
        skipGuardrails: true,
      });
      const content = response.content?.trim() ?? "";
      if (!content) {
        this.logger.warn(
          `foresight intake: LLM empty content (attempt=${attempt + 1})`,
        );
        continue;
      }
      const parsed = this.parseJson<T | null>(content, null);
      if (parsed !== null) return parsed;
      this.logger.warn(
        `foresight intake: LLM JSON parse failed (attempt=${attempt + 1}, len=${content.length}, head="${content.slice(0, 120)}")`,
      );
    }
    return null;
  }

  /** 容错解析 LLM JSON 输出（剥 markdown 围栏 / 截取首尾对象边界），失败返回 fallback */
  private parseJson<T>(raw: string, fallback: T): T {
    const stripped = raw
      .replace(/```json/gi, "")
      .replace(/```/g, "")
      .trim();
    const start = stripped.indexOf("{");
    const end = stripped.lastIndexOf("}");
    if (start === -1 || end <= start) return fallback;
    try {
      return JSON.parse(stripped.slice(start, end + 1)) as T;
    } catch {
      return fallback;
    }
  }
}
