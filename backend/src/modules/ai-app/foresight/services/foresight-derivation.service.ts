/**
 * ForesightDerivationService — 洞察结论派生（2026-06-15）
 *
 * 背景：洞察结论（ForesightConclusion）此前只有 demo 种子会写，全模块无任何
 * 生成/重算入口。导入数据 → 判断图谱（卡片/边）更新，但洞察结论冻结不刷新。
 *
 * 本服务用一次 deterministic LLM，把主题当前的假设卡聚合成决策级洞察结论，
 * 整体替换该主题的 conclusions（幂等重算）。由「导入后自动」+「手动重生成」触发。
 */

import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import { AIModelType, Prisma } from "@prisma/client";
import { PrismaService } from "../../../../common/prisma/prisma.service";
import { AiChatService } from "@/modules/ai-engine/facade";

interface DerivedConclusion {
  title: string;
  body: string;
  decisions: string[];
  trigger: string;
  upstreamKeys: string[];
  conf: number;
  horizon: number;
}

@Injectable()
export class ForesightDerivationService {
  private readonly logger = new Logger(ForesightDerivationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly aiChat: AiChatService,
  ) {}

  /**
   * 从主题当前假设卡派生洞察结论，整体替换库内 conclusions。
   * 无卡片 → 清空结论返回 0。返回 { derived }。
   */
  async deriveConclusions(
    userId: string,
    topicId: string,
  ): Promise<{ derived: number }> {
    const topic = await this.prisma.foresightTopic.findFirst({
      where: { id: topicId, userId },
      select: { id: true, name: true },
    });
    if (!topic) {
      throw new NotFoundException("foresight topic not found");
    }

    const cards = await this.prisma.foresightCard.findMany({
      where: { topicId },
      select: {
        cardKey: true,
        layer: true,
        title: true,
        claim: true,
        conf: true,
        horizon: true,
        falsifiers: true,
      },
      orderBy: { cardKey: "asc" },
    });

    if (cards.length === 0) {
      // 没有假设卡 → 没有可派生的结论，清空存量保持一致
      await this.prisma.foresightConclusion.deleteMany({ where: { topicId } });
      return { derived: 0 };
    }

    const validKeys = new Set(cards.map((c) => c.cardKey));
    // 结论 horizon 缺省回退：取卡片最大地平线（无则当前年 +5）
    const defaultHorizon =
      cards.reduce((mx, c) => Math.max(mx, c.horizon), 0) ||
      new Date().getFullYear() + 5;
    const prompt = this.buildPrompt(topic.name, cards);
    const parsed = await this.chatJson<{ conclusions?: DerivedConclusion[] }>(
      prompt,
      { creativity: "deterministic", outputLength: "long" },
    );
    if (parsed === null) {
      throw new BadRequestException(
        "结论生成模型返回异常（空输出或非 JSON，已自动重试 1 次）—— 稍后再试",
      );
    }

    const rows = (parsed.conclusions ?? [])
      .filter(
        (c) =>
          c &&
          typeof c.title === "string" &&
          c.title.trim().length > 0 &&
          typeof c.body === "string",
      )
      .slice(0, 8)
      .map((c, i) => {
        const upstreamKeys = Array.isArray(c.upstreamKeys)
          ? c.upstreamKeys.filter((k) => validKeys.has(k))
          : [];
        const decisions = Array.isArray(c.decisions)
          ? c.decisions
              .filter((d) => typeof d === "string" && d.trim())
              .slice(0, 6)
          : [];
        const conf =
          typeof c.conf === "number" && c.conf >= 0 && c.conf <= 1
            ? +c.conf.toFixed(2)
            : 0.6;
        const horizon =
          Number.isInteger(c.horizon) && c.horizon > 0
            ? c.horizon
            : defaultHorizon;
        return {
          userId,
          topicId,
          conclKey: `C-${String(i + 1).padStart(2, "0")}`,
          title: c.title.trim().slice(0, 300),
          body: c.body.trim(),
          decisions: decisions as unknown as Prisma.InputJsonValue,
          trigger:
            typeof c.trigger === "string" && c.trigger.trim()
              ? c.trigger.trim()
              : "上游假设置信度发生显著变化时重估。",
          upstreamKeys,
          conf,
          horizon,
        };
      });

    await this.prisma.$transaction([
      this.prisma.foresightConclusion.deleteMany({ where: { topicId } }),
      this.prisma.foresightConclusion.createMany({ data: rows }),
    ]);

    this.logger.log(
      `foresight derive: topic=${topicId} cards=${cards.length} conclusions=${rows.length}`,
    );
    return { derived: rows.length };
  }

  private buildPrompt(
    topicName: string,
    cards: Array<{
      cardKey: string;
      layer: string;
      title: string;
      claim: string;
      conf: number;
      horizon: number;
      falsifiers: unknown;
    }>,
  ): string {
    const cardLines = cards.map((c) => {
      const fals = Array.isArray(c.falsifiers)
        ? (c.falsifiers as unknown[])
            .filter((f): f is string => typeof f === "string")
            .slice(0, 2)
            .join("；")
        : "";
      return `- ${c.cardKey} [${c.layer}] 「${c.title}」conf=${c.conf.toFixed(2)} H·${c.horizon} 主张：${String(c.claim).slice(0, 140)}${fals ? ` 证伪：${fals}` : ""}`;
    });
    return [
      `你是战略洞察系统的「结论合成器」。下面是主题「${topicName}」的全部假设卡。`,
      `任务：把相关假设聚合成 4-8 条**决策级**洞察结论（不要每张卡一条，聚焦最有决策价值的判断）。`,
      `每条结论包含：`,
      `- title：一句话决策级判断`,
      `- body：2-4 句量化依据（引用关键数字/假设主张），不空泛`,
      `- decisions：2-4 条可执行决策建议，尽量带量化阈值与时间窗`,
      `- trigger：什么信号出现需要重估本结论`,
      `- upstreamKeys：本结论依赖的假设卡 cardKey 列表（必须取自下方卡片，不得编造）`,
      `- conf：0-1 综合置信度（参考上游卡片 conf）`,
      `- horizon：时间地平线年份（整数，如 2030）`,
      ``,
      `## 假设卡`,
      ...cardLines,
      ``,
      `输出严格 JSON：{"conclusions":[{"title":"...","body":"...","decisions":["..."],"trigger":"...","upstreamKeys":["..."],"conf":0.7,"horizon":2030}]}`,
    ].join("\n");
  }

  private async chatJson<T>(
    prompt: string,
    taskProfile: {
      creativity: "deterministic" | "low";
      outputLength: "medium" | "long";
    },
  ): Promise<T | null> {
    const suppress =
      "\n\n（重要：直接输出 JSON 结果本身。禁止输出任何思考过程、推理步骤、解释或 markdown 围栏——第一个字符必须是 { 。）";
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
        responseFormat: "json",
        skipGuardrails: true,
      });
      const content = response.content?.trim() ?? "";
      if (!content) {
        this.logger.warn(
          `foresight derive: LLM empty (attempt=${attempt + 1})`,
        );
        continue;
      }
      const parsed = this.parseJson<T | null>(content, null);
      if (parsed !== null) return parsed;
      this.logger.warn(
        `foresight derive: LLM JSON parse failed (attempt=${attempt + 1})`,
      );
    }
    return null;
  }

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
