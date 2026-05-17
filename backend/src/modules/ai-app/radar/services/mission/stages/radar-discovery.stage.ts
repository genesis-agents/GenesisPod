/**
 * radar-discovery.stage.ts — source discovery stage adapter
 *
 * primitive=plan, roleId=source-curator
 *
 * 输入：ctx.input 为 RunRadarDiscoveryMissionInput（topicName / keywords /
 * description / entityType / existingSources）。
 *
 * 单次 LLM 调用，输出 source 候选列表：
 *   { candidates: [{type, identifier, label?, rationale?, confidence?}] }
 *
 * type 限定：X / YOUTUBE / RSS / CUSTOM
 * 结果通过 stage output 返回，不写库。
 * controller 负责后续让用户勾选入库（走 RadarSourceService）。
 */
import { Injectable, Logger } from "@nestjs/common";
import { AIModelType } from "@prisma/client";
import { AiChatService } from "@/modules/ai-engine/facade";
import type {
  RadarMissionContext,
  RadarStageHookArgs,
  RadarStageRunner,
} from "./radar-stage-types";
import type { RunRadarDiscoveryMissionInput } from "../../../dto/run-radar-refresh-mission.dto";

/**
 * discovery stage 输出的单个候选源
 *
 * type 只允许 LLM 推荐的 3 类；X 已从推荐路径彻底剔除（旧数据 + admin
 * 手动添加仍走 RadarSourceType enum，但 LLM/discovery 链路单源 = 这 3 类）。
 */
export interface RadarSourceCandidate {
  type: "YOUTUBE" | "RSS" | "CUSTOM";
  identifier: string;
  label?: string;
  rationale?: string;
  confidence?: number;
}

/** stage output 结构（也写入 ctx 供外层取） */
export interface RadarDiscoveryOutput {
  candidates: RadarSourceCandidate[];
}

// 2026-05-17 业务策略：source-curator 不再推荐 type=X（Nitter 全死，业界
// Feedly/Inoreader 已淡化 X 集成）。RECOMMENDABLE_TYPES = LLM/discovery
// 单一事实来源；prompt 限定 + normalize 兜底 + 入口前 normalize 全用它。
// Prisma RadarSourceType enum 仍含 X 是为兼容旧数据 + admin 手动加，但
// discovery 链路不再认 X — 不论 LLM 怎么写都会被 normalize 成 CUSTOM 后
// 走 URL 校验，进一步把异常输入挡在 bulkCreate 之前。
const RECOMMENDABLE_TYPES = new Set<RadarSourceCandidate["type"]>([
  "YOUTUBE",
  "RSS",
  "CUSTOM",
]);
const X_ALIASES = new Set(["X", "TWITTER", "TWEET"]);

@Injectable()
export class RadarDiscoveryStage implements RadarStageRunner {
  private readonly log = new Logger(RadarDiscoveryStage.name);

  constructor(private readonly chat: AiChatService) {}

  async run(args: RadarStageHookArgs, ctx: RadarMissionContext): Promise<void> {
    if (ctx.signal.aborted) throw new Error("aborted_during_discovery");

    // discovery mission 的 input 类型
    const input = ctx.input as RunRadarDiscoveryMissionInput;
    if (!input.topicName) throw new Error("Discovery stage: topicName 缺失");

    const systemPrompt =
      args.systemPrompt ||
      "你是 AI 雷达的信源策展专家，根据主题信息推荐高质量数据源。";

    const candidates = await this.discoverSources(
      systemPrompt,
      input,
      ctx.userId,
    );

    this.log.log(
      `[${ctx.missionId}] Discovery: topic="${input.topicName}" candidates=${candidates.length}`,
    );

    (
      ctx.state as { discoveryCandidates?: RadarSourceCandidate[] }
    ).discoveryCandidates = candidates;
    return;
  }

  private async discoverSources(
    systemPrompt: string,
    input: RunRadarDiscoveryMissionInput,
    userId: string,
  ): Promise<RadarSourceCandidate[]> {
    // 构建已有源列表（让 LLM 避免重复推荐）
    const existingList =
      input.existingSources.length > 0
        ? input.existingSources
            .slice(0, 20)
            .map((s) => `${s.type}:${s.identifier}`)
            .join(", ")
        : "无";

    const userPrompt = `请为以下主题推荐 5-10 个高质量数据源。

主题信息：
${JSON.stringify({
  name: input.topicName,
  description: truncate(input.description ?? "", 400),
  keywords: input.keywords.slice(0, 20),
  entityType: input.entityType ?? null,
})}

已有数据源（请勿重复推荐）：${existingList}

推荐要求：
- type **只能是 3 种**：YOUTUBE（YouTube 频道）/ RSS（公司官博 / 媒体 RSS / Substack / 个人 Newsletter）/ CUSTOM（网页列表）
- **绝对不输出 type=X / Twitter**（Nitter 全死 + X API 性价比低，业界 Feedly/Inoreader 已淡化 X 集成）
- 用户主题是 KOL 时，按以下**优先级**找等价一手源（**不要把"关注 Elon"直接换成 Tesla 公关稿**）：
  1. 本人 Substack / 个人 blog RSS / 本人主讲 YouTube
  2. 含本人的长访谈播客 YouTube（Lex Fridman / Dwarkesh / All-In / Joe Rogan 等）
  3. 本人所在组织的官方 YouTube / 官博 RSS（仅作工作内容补充）
  4. 同领域权威媒体深度报道 RSS（最远兜底，不要 paywall）
- 反模式（不要）：
  - "Elon" → 只给 Tesla 官博（个人 personality 内容全丢）
  - "SeekingAlpha" → 给公开 RSS（2022 起几乎空，有价值的全在 Premium，不要推）
- identifier：YOUTUBE 填频道 ID 或 https URL / RSS 填 https URL / CUSTOM 填 https URL（rationale 内简述 CSS selector）
- 不推荐 paywall / 需 auth token 的 RSS（SeekingAlpha Premium / WSJ / Bloomberg Terminal — 会 401）
- confidence 为 0-1 浮点数（推荐把握度）；KOL 找不到 1/2 级源时**输出空数组比硬凑公司公关稿好**

请严格按以下 JSON schema 返回（无 markdown 围栏）：
{
  "candidates": [
    {
      "type": "YOUTUBE|RSS|CUSTOM",
      "identifier": "URL",
      "label": "来源名称",
      "rationale": "≤80 字推荐理由（X 对象转换时说明映射）",
      "confidence": 0.85
    }
  ]
}`;

    try {
      const result = await this.chat.chat({
        systemPrompt,
        messages: [{ role: "user", content: userPrompt }],
        modelType: AIModelType.CHAT,
        taskProfile: {
          creativity: "low",
          outputLength: "medium",
        },
        userId,
        operationName: "radar.discovery",
        skipGuardrails: true,
      });

      const parsed = tryParseJson<{ candidates: unknown[] }>(result.content);
      if (!parsed || !Array.isArray(parsed.candidates)) {
        this.log.warn("Discovery LLM unparseable, returning empty candidates");
        return [];
      }

      return (
        parsed.candidates
          .filter(
            (c): c is Record<string, unknown> =>
              c !== null && typeof c === "object",
          )
          // 2026-05-17：业务策略 drop type=X 候选（prompt 失守防御）。
          // 大小写 / 别名（TWITTER/TWEET）都拦：LLM 实际可能吐 "x"/"X "/"twitter"。
          .filter((c) => !isXAlias(c["type"]))
          .map((c) => ({
            type: normalizeSourceType(c["type"]),
            // 2026-05-17 R3 spec 抓到：LLM 返回 "   " 全空白时不 trim 直接当合法
            // identifier 走 assertIdentifierShape，shape 校验侧才挡，浪费一次错误日志。
            identifier: truncate(String(c["identifier"] ?? "").trim(), 500),
            label:
              typeof c["label"] === "string"
                ? truncate(c["label"], 200)
                : undefined,
            rationale:
              typeof c["rationale"] === "string"
                ? truncate(c["rationale"], 80)
                : undefined,
            confidence:
              typeof c["confidence"] === "number" &&
              Number.isFinite(c["confidence"])
                ? Math.max(0, Math.min(1, c["confidence"]))
                : undefined,
          }))
          .filter((c) => c.identifier.length > 0)
      );
    } catch (err) {
      this.log.error(`Discovery LLM err: ${(err as Error).message}`);
      return [];
    }
  }
}

function normalizeType(raw: unknown): string {
  return typeof raw === "string" ? raw.trim().toUpperCase() : "";
}

function isXAlias(raw: unknown): boolean {
  return X_ALIASES.has(normalizeType(raw));
}

function normalizeSourceType(raw: unknown): RadarSourceCandidate["type"] {
  const normalized = normalizeType(raw);
  if (RECOMMENDABLE_TYPES.has(normalized as RadarSourceCandidate["type"])) {
    return normalized as RadarSourceCandidate["type"];
  }
  return "CUSTOM";
}

function tryParseJson<T>(raw: string): T | null {
  const stripped = raw
    .trim()
    .replace(/^```(?:json)?\s*/, "")
    .replace(/\s*```$/, "");
  const firstBrace = stripped.search(/[{[]/);
  const candidate = firstBrace >= 0 ? stripped.slice(firstBrace) : stripped;
  try {
    return JSON.parse(candidate) as T;
  } catch {
    return null;
  }
}

function truncate(s: string, max: number): string {
  if (!s) return "";
  if (s.length <= max) return s;
  return s.slice(0, Math.max(0, max - 3)) + "...";
}
