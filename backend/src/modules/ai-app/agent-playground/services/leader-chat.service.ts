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
import {
  AiChatService,
  DomainEventBus,
  type DomainEvent,
} from "../../../ai-engine/facade";
import { MissionStore } from "./mission-store.service";

export type LeaderDecisionType =
  | "DIRECT_ANSWER" // 直接回答（讨论 / 解释）
  | "CREATE_TODO" // 用户提了新任务 → 追加 dimension
  | "CLARIFY" // 信息不足 → 提供选项让用户选
  | "ACKNOWLEDGE"; // 致谢 / 闲聊

export interface LeaderDecision {
  type: LeaderDecisionType;
  /** 一句话理解："我理解你想要…" — chip 显示 */
  understanding?: string;
  /** CREATE_TODO 时真任务列表 */
  todo?: { name: string; rationale: string }[];
  /** CLARIFY 时按钮选项 */
  clarifyOptions?: string[];
}

export interface LeaderChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  tokensUsed: number | null;
  createdAt: Date;
  /** assistant-only：LLM 输出的结构化决策 */
  decision?: LeaderDecision | null;
}

export interface LeaderChatSendResult {
  user: LeaderChatMessage;
  assistant: LeaderChatMessage;
  /** CREATE_TODO 时已追加到 mission.dimensions 的新任务 ids */
  appendedDimensionIds?: string[];
}

@Injectable()
export class LeaderChatService {
  private readonly log = new Logger(LeaderChatService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly chat: AiChatService,
    private readonly store: MissionStore,
    private readonly eventBus: DomainEventBus,
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
      // 旧消息 / 解析失败 → null
      decision: this.safeParseDecision((r as { decision?: unknown }).decision),
    }));
  }

  private safeParseDecision(raw: unknown): LeaderDecision | null {
    if (!raw || typeof raw !== "object") return null;
    const o = raw as Record<string, unknown>;
    if (typeof o.type !== "string") return null;
    return {
      type: o.type as LeaderDecisionType,
      understanding:
        typeof o.understanding === "string" ? o.understanding : undefined,
      todo: Array.isArray(o.todo)
        ? (o.todo as { name?: unknown; rationale?: unknown }[])
            .filter(
              (t) =>
                t &&
                typeof t.name === "string" &&
                typeof t.rationale === "string",
            )
            .map((t) => ({
              name: t.name as string,
              rationale: t.rationale as string,
            }))
        : undefined,
      clarifyOptions: Array.isArray(o.clarifyOptions)
        ? (o.clarifyOptions as unknown[]).filter(
            (s): s is string => typeof s === "string",
          )
        : undefined,
    };
  }

  /**
   * 用户发送一条消息 → 拼装上下文 → LLM 回复 (JSON 决策) → 持久化 + 触发动作
   *
   * 决策类型动作：
   *   DIRECT_ANSWER  → 仅展示文本
   *   CREATE_TODO    → 追加 dimensions 到 mission（若 mission 仍 running）
   *   CLARIFY        → 前端展示选项按钮
   *   ACKNOWLEDGE    → 仅展示文本
   */
  async send(
    missionId: string,
    userId: string,
    content: string,
  ): Promise<LeaderChatSendResult> {
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

    // 2) 拉取 mission 上下文 + 历史对话
    const mission = await this.store.getById(missionId, userId);
    const previous = await this.list(missionId);

    const systemPrompt = this.buildSystemPrompt(mission);

    const messages = previous.map((m) => ({
      role: m.role,
      content: m.content,
    }));

    let assistantText = "";
    let decision: LeaderDecision | null = null;
    let usedTokens: number | undefined;
    try {
      const result = await this.chat.chat({
        systemPrompt,
        messages,
        modelType: AIModelType.CHAT,
        userId,
        taskProfile: { creativity: "low", outputLength: "medium" },
        operationName: "agent-playground.leader-chat",
      });
      const raw = result.content?.trim() || "";
      usedTokens = result.usage?.totalTokens;
      // 3) 解析 JSON 决策
      const parsed = this.parseDecisionResponse(raw);
      assistantText = parsed.response || "(Leader did not respond)";
      decision = parsed.decision;
    } catch (err) {
      this.log.error(
        `[send ${missionId}] LLM call failed: ${err instanceof Error ? err.message : String(err)}`,
      );
      assistantText = `Leader 暂时无法回复（${err instanceof Error ? err.message : "unknown error"}）。请稍后重试。`;
    }

    // 4) 持久化 assistant 回复（含 decision JSON）—— Prisma JSON 字段
    //    上游 prisma generate 后 decision 字段类型可知；保持显式 unknown→Prisma cast
    const assistantMsg = await this.prisma.agentPlaygroundLeaderChat.create({
      data: {
        missionId,
        userId,
        role: "assistant",
        content: assistantText.slice(0, 8000),
        tokensUsed: usedTokens ?? null,
        decision: (decision ?? null) as unknown as never,
      },
    });

    // 5) CREATE_TODO 动作：mission 仍 running 时追加 dimensions
    let appendedIds: string[] | undefined;
    if (
      decision?.type === "CREATE_TODO" &&
      decision.todo &&
      decision.todo.length > 0 &&
      mission?.status === "running"
    ) {
      try {
        appendedIds = await this.store.appendDimensions(
          missionId,
          decision.todo,
        );
        this.log.log(
          `[send ${missionId}] appended ${appendedIds.length} dimension(s) from leader chat`,
        );
        // 广播追加事件给前端 → TaskListPanel + SVG 自动 refresh dimensions
        if (appendedIds.length > 0) {
          const event: DomainEvent = {
            type: "agent-playground.dimensions:appended",
            scope: { missionId, userId },
            payload: {
              appendedIds,
              source: "user-chat",
              items: decision.todo.map((t, i) => ({
                id: appendedIds![i],
                name: t.name,
                rationale: t.rationale,
              })),
            },
            timestamp: Date.now(),
          };
          await this.eventBus.emit(event).catch((e: unknown) => {
            this.log.warn(
              `[send ${missionId}] broadcast dimensions:appended failed: ${e instanceof Error ? e.message : String(e)}`,
            );
          });
        }
      } catch (err) {
        this.log.warn(
          `[send ${missionId}] appendDimensions failed: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }

    return {
      user: this.toDto(userMsg),
      assistant: { ...this.toDto(assistantMsg), decision },
      appendedDimensionIds: appendedIds,
    };
  }

  /**
   * 解析 LLM 输出 —— 期望 JSON {response, decisionType, understanding, todo, clarifyOptions}
   * 容错：如果不是合法 JSON 或缺字段，降级为 DIRECT_ANSWER + 原文展示。
   */
  private parseDecisionResponse(raw: string): {
    response: string;
    decision: LeaderDecision | null;
  } {
    const trimmed = raw.trim();
    // 找 JSON 块（```json fence 或纯 JSON）
    let jsonStr = trimmed;
    const fenceMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
    if (fenceMatch) jsonStr = fenceMatch[1].trim();
    if (!jsonStr.startsWith("{") && !jsonStr.startsWith("[")) {
      // 不是 JSON → 整段当 DIRECT_ANSWER
      return {
        response: raw,
        decision: { type: "DIRECT_ANSWER" },
      };
    }
    try {
      const parsed = JSON.parse(jsonStr) as Record<string, unknown>;
      const decisionType = (parsed.decisionType ?? parsed.type) as
        | string
        | undefined;
      const response =
        typeof parsed.response === "string"
          ? parsed.response
          : typeof parsed.message === "string"
            ? parsed.message
            : raw;
      const validTypes: LeaderDecisionType[] = [
        "DIRECT_ANSWER",
        "CREATE_TODO",
        "CLARIFY",
        "ACKNOWLEDGE",
      ];
      const safeType: LeaderDecisionType = validTypes.includes(
        decisionType as LeaderDecisionType,
      )
        ? (decisionType as LeaderDecisionType)
        : "DIRECT_ANSWER";
      const todoRaw = parsed.todo ?? parsed.tasks;
      const todo = Array.isArray(todoRaw)
        ? (todoRaw as { name?: unknown; rationale?: unknown }[])
            .filter(
              (t) =>
                t &&
                typeof t === "object" &&
                typeof (t as { name?: unknown }).name === "string",
            )
            .map((t) => ({
              name: (t as { name: string }).name,
              rationale:
                typeof (t as { rationale?: unknown }).rationale === "string"
                  ? (t as { rationale: string }).rationale
                  : "(no rationale)",
            }))
        : undefined;
      const clarifyOptions = Array.isArray(parsed.clarifyOptions)
        ? (parsed.clarifyOptions as unknown[]).filter(
            (s): s is string => typeof s === "string",
          )
        : undefined;
      return {
        response,
        decision: {
          type: safeType,
          understanding:
            typeof parsed.understanding === "string"
              ? parsed.understanding
              : undefined,
          todo,
          clarifyOptions,
        },
      };
    } catch {
      return { response: raw, decision: { type: "DIRECT_ANSWER" } };
    }
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
        ? "你是这个 agent-playground 研究 mission 的 Research Leader。基于以下完整上下文，与用户讨论 mission 并必要时追加研究维度。"
        : "You are the Research Leader for this agent-playground research mission. Discuss with the user and append research dimensions when needed.";

    const decisionGuide =
      lang === "zh-CN"
        ? [
            ``,
            `## 关键：你必须返回 JSON 决策（用 \`\`\`json fence 包裹），格式严格如下：`,
            `\`\`\`json`,
            `{`,
            `  "decisionType": "DIRECT_ANSWER" | "CREATE_TODO" | "CLARIFY" | "ACKNOWLEDGE",`,
            `  "response": "<对话气泡显示的 markdown 文本（必填）>",`,
            `  "understanding": "<一句话理解：我理解你想要 X（强烈建议）>",`,
            `  "todo": [ { "name": "<新维度名>", "rationale": "<为什么要研究>" }, ... ],   // 仅 CREATE_TODO 必填`,
            `  "clarifyOptions": ["<选项1>", "<选项2>", ...]                              // 仅 CLARIFY 必填`,
            `}`,
            `\`\`\``,
            ``,
            `## 决策规则：`,
            `- 用户 *提了新研究方向 / 任务 / 角度* → CREATE_TODO（todo 数组里给出 1-3 个新维度，与已有维度互斥）`,
            `- 用户 *问 mission 现状 / 解释报告 / 讨论结论* → DIRECT_ANSWER`,
            `- 用户表述模糊 / 你需要 user 在几个方向之间选 → CLARIFY（提供 2-4 个 clarifyOptions）`,
            `- 用户 *仅闲聊 / 致谢 / 确认* → ACKNOWLEDGE`,
            ``,
            `## CREATE_TODO 注意事项：`,
            `- 仅当 mission 状态 = running 时建议追加 dimension（其它状态会被前端拒绝）`,
            `- 新 dimension 必须与 ## Dimensions plan 中已有的不重叠`,
            `- name 简短（≤ 12 字），rationale 1-2 句解释为何重要`,
            ``,
            `## 风格：精炼、专业、有据可依；引用上述上下文中的具体内容；response 字段用中文。`,
          ].join("\n")
        : [
            ``,
            `## CRITICAL: Return JSON decision wrapped in \`\`\`json fence:`,
            `\`\`\`json`,
            `{`,
            `  "decisionType": "DIRECT_ANSWER" | "CREATE_TODO" | "CLARIFY" | "ACKNOWLEDGE",`,
            `  "response": "<markdown shown in chat bubble (required)>",`,
            `  "understanding": "<one-line understanding (strongly recommended)>",`,
            `  "todo": [ { "name": "<new dim>", "rationale": "<why>" } ],  // CREATE_TODO only`,
            `  "clarifyOptions": ["<opt1>", "<opt2>"]                       // CLARIFY only`,
            `}`,
            `\`\`\``,
            ``,
            `## Decision rules:`,
            `- User proposes a new research angle/task → CREATE_TODO (1-3 new dimensions, no overlap)`,
            `- User asks about current mission / report → DIRECT_ANSWER`,
            `- User intent is ambiguous → CLARIFY (2-4 clarifyOptions)`,
            `- User just acknowledges / thanks → ACKNOWLEDGE`,
            ``,
            `## CREATE_TODO notes:`,
            `- Only suggest when mission status = running (other states will be rejected by frontend)`,
            `- New dim must NOT overlap with existing ## Dimensions plan`,
            `- name short (≤ 8 words), rationale 1-2 sentences`,
            ``,
            `## Style: concise, professional, evidence-based; cite specifics; response in English.`,
          ].join("\n");

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
      decisionGuide,
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
    decision?: unknown;
  }): LeaderChatMessage {
    return {
      id: row.id,
      role: row.role === "assistant" ? "assistant" : "user",
      content: row.content,
      tokensUsed: row.tokensUsed,
      createdAt: row.createdAt,
      decision: this.safeParseDecision(row.decision),
    };
  }
}
