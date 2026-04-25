/**
 * LeaderChatService —— mission Leader 对话
 *
 * 用户点击 mission 详情页的 Leader 节点 → 弹出 chat 浮窗 → 与该 mission
 * 的 Leader（拥有完整 topic / dimensions / report 上下文）讨论。
 *
 * 模型选择走 Harness 同款链路：modelType=CHAT + userId（BYOK），
 * 不硬编码任何 provider/模型。
 */

import { Injectable, Logger } from "@nestjs/common";
import { AIModelType } from "@prisma/client";
import { PrismaService } from "../../../../common/prisma/prisma.service";
import { AiChatService } from "../../../ai-engine/facade";
import { MissionStore } from "./mission-store.service";

export interface LeaderChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  tokensUsed: number | null;
  createdAt: Date;
}

@Injectable()
export class LeaderChatService {
  private readonly log = new Logger(LeaderChatService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly chat: AiChatService,
    private readonly store: MissionStore,
  ) {}

  async list(missionId: string): Promise<LeaderChatMessage[]> {
    const rows = await this.prisma.agentPlaygroundLeaderChat.findMany({
      where: { missionId },
      orderBy: { createdAt: "asc" },
      take: 200,
    });
    return rows.map((r) => ({
      id: r.id,
      role: r.role === "assistant" ? "assistant" : "user",
      content: r.content,
      tokensUsed: r.tokensUsed,
      createdAt: r.createdAt,
    }));
  }

  /**
   * 用户发送一条消息 → 拼装上下文 → LLM 回复 → 持久化两条记录。
   */
  async send(
    missionId: string,
    userId: string,
    content: string,
  ): Promise<{ user: LeaderChatMessage; assistant: LeaderChatMessage }> {
    const trimmed = content.trim();
    if (!trimmed) {
      throw new Error("Message content cannot be empty");
    }

    // 1) 持久化用户消息
    const userMsg = await this.prisma.agentPlaygroundLeaderChat.create({
      data: {
        missionId,
        userId,
        role: "user",
        content: trimmed.slice(0, 4000),
      },
    });

    // 2) 拉取 mission 上下文（topic / dimensions / report summary）
    const mission = await this.store.getById(missionId, userId);
    const previous = await this.list(missionId);

    const systemPrompt = this.buildSystemPrompt(mission);

    // 3) 调用 LLM —— 历史对话（不含本次刚插入的 userMsg？包含）作为 messages
    const messages = previous.map((m) => ({
      role: m.role,
      content: m.content,
    }));

    let assistantText = "";
    let usedTokens: number | undefined;
    try {
      const result = await this.chat.chat({
        systemPrompt,
        messages,
        modelType: AIModelType.CHAT,
        userId,
        taskProfile: { creativity: "medium", outputLength: "medium" },
        operationName: "agent-playground.leader-chat",
      });
      assistantText = result.content?.trim() || "(Leader did not respond)";
      usedTokens = result.usage?.totalTokens;
    } catch (err) {
      this.log.error(
        `[send ${missionId}] LLM call failed: ${err instanceof Error ? err.message : String(err)}`,
      );
      assistantText = `Leader 暂时无法回复（${err instanceof Error ? err.message : "unknown error"}）。请稍后重试。`;
    }

    // 4) 持久化 assistant 回复
    const assistantMsg = await this.prisma.agentPlaygroundLeaderChat.create({
      data: {
        missionId,
        userId,
        role: "assistant",
        content: assistantText.slice(0, 8000),
        tokensUsed: usedTokens ?? null,
      },
    });

    return {
      user: this.toDto(userMsg),
      assistant: this.toDto(assistantMsg),
    };
  }

  private buildSystemPrompt(
    mission: Awaited<ReturnType<MissionStore["getById"]>>,
  ): string {
    if (!mission) {
      return [
        "You are the Research Leader of an agent-playground research mission.",
        "The mission record was not found. Politely tell the user there is no context.",
      ].join("\n");
    }

    const lang = mission.language;
    const dims = (mission.dimensions ?? []) as {
      name?: string;
      rationale?: string;
    }[];
    const dimsText = dims.length
      ? dims
          .map(
            (d, i) =>
              `${i + 1}. ${d.name ?? "(unnamed)"}` +
              (d.rationale ? ` — ${d.rationale}` : ""),
          )
          .join("\n")
      : "(no dimensions yet)";

    const reportFull = mission.reportFull as
      | {
          title?: string;
          summary?: string;
          conclusion?: string;
          sections?: { heading: string }[];
        }
      | null
      | undefined;

    const reportSnippet = reportFull
      ? [
          `Report title: ${reportFull.title ?? "(untitled)"}`,
          `Summary: ${reportFull.summary ?? ""}`,
          reportFull.sections?.length
            ? `Sections: ${reportFull.sections.map((s) => s.heading).join(" / ")}`
            : "",
          reportFull.conclusion ? `Conclusion: ${reportFull.conclusion}` : "",
        ]
          .filter(Boolean)
          .join("\n")
      : "(report not yet produced)";

    const intro =
      lang === "zh-CN"
        ? "你是这个 agent-playground 研究 mission 的 Research Leader。基于以下完整上下文，与用户开放讨论 mission 的相关情况、决策、不足与改进。"
        : "You are the Research Leader for this agent-playground research mission. Discuss the mission openly with the user using the full context below.";

    return [
      intro,
      "",
      `## Mission`,
      `- Topic: ${mission.topic}`,
      `- Depth: ${mission.depth}`,
      `- Status: ${mission.status}`,
      mission.finalScore != null
        ? `- Final consensus score: ${mission.finalScore} / 100`
        : "",
      mission.themeSummary ? `- Theme summary: ${mission.themeSummary}` : "",
      "",
      `## Dimensions plan`,
      dimsText,
      "",
      `## Report snapshot`,
      reportSnippet,
      "",
      lang === "zh-CN"
        ? "回答风格：精炼、专业、有据可依；引用上述上下文中的具体内容；用中文。"
        : "Answer style: concise, professional, evidence-based; cite specifics from the above context; reply in English.",
    ]
      .filter(Boolean)
      .join("\n");
  }

  private toDto(row: {
    id: string;
    role: string;
    content: string;
    tokensUsed: number | null;
    createdAt: Date;
  }): LeaderChatMessage {
    return {
      id: row.id,
      role: row.role === "assistant" ? "assistant" : "user",
      content: row.content,
      tokensUsed: row.tokensUsed,
      createdAt: row.createdAt,
    };
  }
}
