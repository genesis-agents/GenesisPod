/**
 * LeaderChatService —— mission Leader 对话（编排）
 *
 * 用户点击 mission 详情页的 Leader 节点 → 弹出 chat 浮窗 → 与该 mission
 * 的 Leader（拥有完整 topic / dimensions / report 上下文）讨论。
 *
 * 模型选择走 Harness 同款链路：modelType=CHAT + userId（BYOK），
 * 不硬编码任何 provider/模型。
 *
 * ★ 2026-05-04 PR-10a (拆分为 < 500 行合规, standards/16 §六)：
 *   • leader-chat-prompt.ts            ← buildLeaderChatPrompt（system prompt 拼装）
 *   • leader-decision-parser.util.ts   ← parseLeaderDecisionResponse + safeParseStoredDecision
 *   • leader-chat.service.ts (本文件)  ← list / send / 持久化 / 业务事件 emit / Mission 装配
 *
 * 后续 PR-8 把 buildLeaderChatPrompt 整体迁到 SkillRegistry（playground.leader-chat skill）。
 */

import { Injectable, Logger } from "@nestjs/common";
import { AIModelType } from "@prisma/client";
import { PrismaService } from "../../../../../common/prisma/prisma.service";
import { AiChatService } from "@/modules/ai-harness/facade";
import { DomainEventBus, type DomainEvent } from "@/modules/ai-harness/facade";
import { MissionStore } from "../mission/lifecycle/mission-store.service";
import { buildLeaderChatPrompt } from "./leader-chat-prompt";
import {
  parseLeaderDecisionResponse,
  safeParseStoredDecision,
  type LeaderDecision,
  type LeaderDecisionType,
} from "./leader-decision-parser.util";

export type { LeaderDecision, LeaderDecisionType };

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
      decision: safeParseStoredDecision((r as { decision?: unknown }).decision),
    }));
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

    const systemPrompt = buildLeaderChatPrompt(mission);

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
      const parsed = parseLeaderDecisionResponse(raw);
      assistantText = parsed.response || "(Leader did not respond)";
      decision = parsed.decision;
    } catch (err) {
      this.log.error(
        `[send ${missionId}] LLM call failed: ${err instanceof Error ? err.message : String(err)}`,
      );
      assistantText = `Leader 暂时无法回复（${err instanceof Error ? err.message : "unknown error"}）。请稍后重试。`;
    }

    const wantsCreateTodo =
      decision?.type === "CREATE_TODO" &&
      decision.todo &&
      decision.todo.length > 0;
    const canAppendToCurrentRun =
      mission?.status === "running" && (mission.lastCompletedStage ?? 0) < 3;
    if (wantsCreateTodo && !canAppendToCurrentRun) {
      const reason =
        mission?.status !== "running"
          ? "mission 已不在运行中"
          : "当前 mission 已完成研究派发阶段";
      assistantText =
        `${assistantText}\n\n（${reason}，这些新研究方向不会自动并入本次运行。请通过重跑/新 mission 执行。）`.slice(
          0,
          8000,
        );
      decision = {
        ...decision,
        type: "DIRECT_ANSWER",
        todo: undefined,
      };
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
      canAppendToCurrentRun
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
          await this.broadcastAppendedDimensions(
            missionId,
            userId,
            appendedIds,
            decision.todo,
          );
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

  private async broadcastAppendedDimensions(
    missionId: string,
    userId: string,
    appendedIds: string[],
    todo: { name: string; rationale: string }[],
  ): Promise<void> {
    const event: DomainEvent = {
      type: "agent-playground.dimensions:appended",
      scope: { missionId, userId },
      payload: {
        appendedIds,
        source: "user-chat",
        items: todo.map((t, i) => ({
          id: appendedIds[i],
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
    // ★ BUG-E 部分修：让前端任务列表立即显示这些新 dim 处于 pending 状态
    //   每个新 dim 发一条 dimension:retrying 事件（reason=leader-chat-create）
    //   todo-ledger 已映射为 leader-chat-create origin，会创建任务行可见
    //   实际 Researcher 派遣由 orchestrator 在下一个 S5 boundary 检测 pending
    //   dim 时统一拉起（深度修法见 Task #23 追记）。
    // ★ P0-2: appendDimensions 可能部分失败返回 appendedIds.length < todo.length，
    //   越界访问会让 agentId=`researcher#chat-undefined` 污染前端任务列表。
    //   循环边界统一取 min(todo.length, appendedIds.length)，确保 1:1 对应。
    const safeLen = Math.min(todo.length, appendedIds.length);
    for (let i = 0; i < safeLen; i++) {
      const t = todo[i];
      await this.eventBus
        .emit({
          type: "agent-playground.dimension:retrying",
          scope: { missionId, userId },
          agentId: `researcher#chat-${appendedIds[i]}`,
          payload: {
            dimension: t.name,
            reason: "leader-chat-create",
            rationale: t.rationale,
            source: "user-chat",
            // ★ 关键：标 willExecute=false 让前端区分"已登记但暂未派遣"，
            //   不应在 UI 显示为"进行中"，应展示为"等待派遣"+ 提示用户
            //   重启 mission 或等 orchestrator boundary 拉起
            willExecute: false,
            note: "Leader Chat 已登记该维度，待 orchestrator 在下一阶段拉起或用户重启 mission",
          },
          timestamp: Date.now(),
        })
        .catch(() => {});
    }
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
      decision: safeParseStoredDecision(row.decision),
    };
  }
}
