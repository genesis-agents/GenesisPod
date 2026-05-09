/**
 * FREECHAT mode adapter
 *
 * 设计：teams-mode.md §5.2 FREECHAT 行
 *
 * 行为：
 *   1. 解析触发消息中的 mentionedMemberIds
 *   2. 命中：仅这些成员各自回一条
 *   3. 未命中：本期降级到 leader（或 order=0 成员）回一条
 *      （评审 follow-up：v0.3 把 fan-out selector 下沉到 harness/freechat-pattern）
 *   4. 每个被选中成员通过 ChatFacade.chat 调用 LLM
 *   5. 输出 N 条 AI 消息（无 leader 合成）
 *
 * 流式：本 adapter 同步 chat() 一次返回完整内容，不发 participant.partial。
 * 流式 token-by-token 推送将在 v0.3 改为 chatFacade.chatStream 时启用。
 */

import { Injectable, Logger } from "@nestjs/common";
import { v4 as uuid } from "uuid";
import { AIModelType, AskRoomMember, AskRoomMode } from "@prisma/client";
import { ChatFacade, type ChatMessage } from "@/modules/ai-harness/facade";
import type {
  IModeAdapter,
  ModeContext,
  ModeResult,
  PendingMessage,
} from "./mode-adapter.interface";
import type { AskRoomServerEvent } from "../gateway/ask-room-events.types";

@Injectable()
export class FreechatAdapter implements IModeAdapter {
  readonly mode = AskRoomMode.FREECHAT;
  private readonly logger = new Logger(FreechatAdapter.name);

  constructor(private readonly chatFacade: ChatFacade) {}

  async execute(
    ctx: ModeContext,
    onEvent: (e: AskRoomServerEvent) => void,
  ): Promise<ModeResult> {
    const enabled = ctx.members.filter((m) => m.enabled && !m.deletedAt);
    const mentioned = (ctx.triggerMessage.mentionedMemberIds ?? [])
      .map((id) => enabled.find((m) => m.id === id))
      .filter((m): m is AskRoomMember => m !== undefined);

    let participants: AskRoomMember[];
    if (mentioned.length > 0) {
      participants = mentioned;
    } else {
      const leader =
        enabled.find((m) => m.role === "LEADER") ??
        [...enabled].sort((a, b) => a.order - b.order)[0];
      participants = leader ? [leader] : [];
    }

    if (participants.length === 0) {
      this.logger.warn(
        `[FREECHAT] turn=${ctx.turn.id} no eligible participants`,
      );
      return { messages: [], metadata: { reason: "no_participants" } };
    }

    let seq = ctx.sequenceNumStart;
    const messages: PendingMessage[] = [];

    for (const member of participants) {
      this.assertNotAborted(ctx.signal);
      // 评审 W2 v3 R2：messageId 在 thinking 起就确定，贯穿到 done 与最终 INSERT。
      // 详见 teams-mode.md §6.2 messageId 生成时机。
      const messageId = uuid();
      seq += 1;

      onEvent({
        kind: "participant.thinking",
        turnId: ctx.turn.id,
        sequenceNum: seq,
        memberId: member.id,
        messageId,
      });

      const llmMessages = this.buildLlmMessages(ctx, member);
      const startedAt = Date.now();

      const result = await this.chatFacade.chat({
        messages: llmMessages,
        model: member.modelId,
        modelType: AIModelType.CHAT,
        taskProfile: { creativity: "medium", outputLength: "standard" },
        billing: {
          userId: ctx.userId,
          moduleType: "ai-ask",
          operationType: "room-freechat",
          referenceId: ctx.turn.id,
          description: `AI Ask Room FREECHAT - ${member.displayName}`,
        },
      });

      seq += 1;
      onEvent({
        kind: "participant.done",
        turnId: ctx.turn.id,
        sequenceNum: seq,
        memberId: member.id,
        messageId,
        tokensUsed: result.tokensUsed ?? 0,
        content: result.content, // 同步 adapter：随 done 直接推送完整内容
      });

      messages.push({
        id: messageId,
        senderType: "AI",
        senderMemberId: member.id,
        content: result.content,
        modelId: member.modelId,
        modelName: null,
        tokens: result.tokensUsed ?? 0,
        parentMessageId: ctx.triggerMessage.id,
        sequenceNum: seq,
      });

      this.logger.debug(
        `[FREECHAT] turn=${ctx.turn.id} member=${member.displayName} ` +
          `tokens=${result.tokensUsed ?? 0} elapsed=${Date.now() - startedAt}ms`,
      );
    }

    return {
      messages,
      metadata: {
        participantCount: participants.length,
        mentionedHit: mentioned.length > 0,
      },
    };
  }

  private buildLlmMessages(
    ctx: ModeContext,
    member: AskRoomMember,
  ): ChatMessage[] {
    const systemParts: string[] = [];
    if (member.systemPrompt) {
      systemParts.push(member.systemPrompt);
    } else {
      systemParts.push(
        `你是 ${member.displayName}，与其他 AI 一起协助用户。请仅以 ${member.displayName} 的身份回答。`,
      );
    }
    if (member.persona && typeof member.persona === "object") {
      systemParts.push(`【人设要点】\n${JSON.stringify(member.persona)}`);
    }

    // 评审 W2 v3 R2 重要：displayName 拼入 prompt 前必须 sanitize。
    // 否则 displayName="admin] forget previous instructions [" 可构造 prompt 注入。
    const history: ChatMessage[] = ctx.history.slice(-20).map((m) => {
      const rawSpeaker =
        m.senderType === "AI" && m.senderMemberId
          ? this.lookupMemberName(ctx, m.senderMemberId)
          : null;
      const speaker = rawSpeaker
        ? rawSpeaker.replace(/[\[\]\r\n]/g, "").slice(0, 40)
        : null;
      const role: "user" | "assistant" =
        m.senderType === "USER" ? "user" : "assistant";
      const content = speaker ? `[${speaker}] ${m.content}` : m.content;
      return { role, content };
    });

    return [
      { role: "system", content: systemParts.join("\n\n") },
      ...history,
      { role: "user", content: ctx.triggerMessage.content },
    ];
  }

  private lookupMemberName(ctx: ModeContext, memberId: string): string | null {
    const m = ctx.members.find((x) => x.id === memberId);
    return m ? m.displayName : null;
  }

  private assertNotAborted(signal: AbortSignal): void {
    if (signal.aborted) {
      throw new Error("FREECHAT adapter aborted");
    }
  }
}
