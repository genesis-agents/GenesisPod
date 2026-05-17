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

/** discovery stage 输出的单个候选源 */
export interface RadarSourceCandidate {
  type: "X" | "YOUTUBE" | "RSS" | "CUSTOM";
  identifier: string;
  label?: string;
  rationale?: string;
  confidence?: number;
}

/** stage output 结构（也写入 ctx 供外层取） */
export interface RadarDiscoveryOutput {
  candidates: RadarSourceCandidate[];
}

const VALID_SOURCE_TYPES = new Set(["X", "YOUTUBE", "RSS", "CUSTOM"]);

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
- type 必须是 4 种之一：X（推特/X 账号）/ YOUTUBE（YouTube 频道）/ RSS（RSS 订阅）/ CUSTOM（网页/API）
- identifier：X 填 @handle（不含 @）/ YOUTUBE 填频道 ID 或 @handle / RSS 填 URL / CUSTOM 填 URL
- 优先推荐权威信源、行业媒体、关键 KOL
- confidence 为 0-1 浮点数（推荐把握度）

请严格按以下 JSON schema 返回（无 markdown 围栏）：
{
  "candidates": [
    {
      "type": "X|YOUTUBE|RSS|CUSTOM",
      "identifier": "账号/URL",
      "label": "来源名称",
      "rationale": "≤80 字推荐理由",
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

      return parsed.candidates
        .filter(
          (c): c is Record<string, unknown> =>
            c !== null && typeof c === "object",
        )
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
        .filter((c) => c.identifier.length > 0);
    } catch (err) {
      this.log.error(`Discovery LLM err: ${(err as Error).message}`);
      return [];
    }
  }
}

function normalizeSourceType(raw: unknown): RadarSourceCandidate["type"] {
  if (typeof raw === "string" && VALID_SOURCE_TYPES.has(raw)) {
    return raw as RadarSourceCandidate["type"];
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
