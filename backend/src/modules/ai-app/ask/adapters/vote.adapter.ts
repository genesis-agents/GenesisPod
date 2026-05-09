/**
 * VOTE mode adapter
 *
 * 设计：teams-mode.md §5.2 VOTE 行
 *
 * 行为：
 *   1. 选项来源：modeOptions.voteOptions 显式给出 / 或 leader chat 生成 2-4 个
 *   2. emit vote.open，所有 enabled 成员各 chat 一次投票（结构化输出 optionId + 理由）
 *   3. emit vote.cast；末轮 leader 不投票（仅主持）
 *   4. closeVote 计票（majority 默认）；emit vote.closed
 *   5. 输出消息：N 条成员理由 + 1 条 leader 结论（N+1）
 *
 * 备注：harness `VotingManager` 在 ai-harness/teams/collaboration/patterns/voting-pattern。
 */

import { Injectable, Logger } from "@nestjs/common";
import { v4 as uuid } from "uuid";
import { AIModelType, AskRoomMember, AskRoomMode } from "@prisma/client";
import {
  ChatFacade,
  VotingManager,
  type ChatMessage,
} from "@/modules/ai-harness/facade";
import {
  emitSystemNotice,
  type IModeAdapter,
  type ModeContext,
  type ModeResult,
  type PendingMessage,
} from "./mode-adapter.interface";
import type {
  AskRoomServerEvent,
  VoteOption,
} from "../gateway/ask-room-events.types";

interface VoteOptionsInput {
  voteOptions?: Array<{ id: string; label: string }>;
}

interface MemberVote {
  member: AskRoomMember;
  messageId: string;
  optionId: string;
  reason: string;
  doneSeq: number;
  tokensUsed: number;
  error?: string;
}

@Injectable()
export class VoteAdapter implements IModeAdapter {
  readonly mode = AskRoomMode.VOTE;
  private readonly logger = new Logger(VoteAdapter.name);

  constructor(
    private readonly chatFacade: ChatFacade,
    private readonly votingManager: VotingManager,
  ) {}

  async execute(
    ctx: ModeContext,
    onEvent: (e: AskRoomServerEvent) => void,
  ): Promise<ModeResult> {
    const enabled = ctx.members.filter((m) => m.enabled && !m.deletedAt);
    let earlySeq = ctx.sequenceNumStart;
    if (enabled.length < 2) {
      earlySeq += 1;
      const notice = emitSystemNotice(
        onEvent,
        ctx.turn.id,
        earlySeq,
        "VOTE 模式至少需要 2 名启用成员（1 主持 + 1 投票）。请添加或启用更多成员后重试。",
      );
      return {
        messages: [notice],
        metadata: { reason: "insufficient_members" },
      };
    }

    const leader = this.pickLeader(enabled);
    const voters = enabled.filter((m) => m.id !== leader.id);
    if (voters.length === 0) {
      earlySeq += 1;
      const notice = emitSystemNotice(
        onEvent,
        ctx.turn.id,
        earlySeq,
        "VOTE 模式没有可参与投票的成员。请确保除 LEADER 外至少还有 1 名启用成员。",
      );
      return {
        messages: [notice],
        metadata: { reason: "no_voters" },
      };
    }

    const seq = ctx.sequenceNumStart;
    let voteSessionIdForCleanup: string | null = null;

    try {
      const result = await this.executeInner(
        ctx,
        leader,
        voters,
        seq,
        onEvent,
        (id) => {
          voteSessionIdForCleanup = id;
        },
      );
      return result;
    } catch (err) {
      // 评审 W4 v5 阻塞：异常路径主动取消 vote session，避免 VotingManager 内存泄漏
      if (voteSessionIdForCleanup) {
        this.votingManager.cancelVote(voteSessionIdForCleanup);
      }
      throw err;
    }
  }

  private async executeInner(
    ctx: ModeContext,
    leader: AskRoomMember,
    voters: AskRoomMember[],
    seqStart: number,
    onEvent: (e: AskRoomServerEvent) => void,
    setVoteSessionId: (id: string) => void,
  ): Promise<ModeResult> {
    let seq = seqStart;

    // 1. 准备选项
    let options = this.parseOptions(ctx.modeOptions);
    let optionsGenerationMessage: PendingMessage | null = null;
    if (!options) {
      // 2026-05-08 R2 评审：generateOptions 内部 chat() 失败之前裸抛，
      // 让整 turn FAIL 用户看不到原因。改为 catch + fallback 选项 +
      // system.notice，与其他 adapter 错误兜底一致。
      let generated: {
        options: VoteOption[];
        content: string;
        tokensUsed: number;
      } | null = null;
      try {
        generated = await this.generateOptions(leader, ctx);
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : String(err);
        this.logger.warn(
          `[VOTE] generateOptions failed: ${errMsg}; using default options`,
        );
      }
      if (generated) {
        options = generated.options;
        // leader 先发一条消息说明候选项（可选输出）
        if (generated.content) {
          seq += 1;
          const optsMessageId = uuid();
          onEvent({
            kind: "participant.thinking",
            turnId: ctx.turn.id,
            sequenceNum: seq,
            memberId: leader.id,
            messageId: optsMessageId,
          });
          seq += 1;
          onEvent({
            kind: "participant.done",
            turnId: ctx.turn.id,
            sequenceNum: seq,
            memberId: leader.id,
            messageId: optsMessageId,
            tokensUsed: generated.tokensUsed,
            content: generated.content,
          });
          optionsGenerationMessage = {
            id: optsMessageId,
            senderType: "AI",
            senderMemberId: leader.id,
            content: generated.content,
            modelId: leader.modelId,
            modelName: null,
            tokens: generated.tokensUsed,
            parentMessageId: ctx.triggerMessage.id,
            sequenceNum: seq,
          };
        }
      } else {
        // generateOptions 失败：用默认 a/支持 b/反对 + emit notice
        options = [
          { id: "a", label: "支持" },
          { id: "b", label: "反对" },
        ];
        seq += 1;
        optionsGenerationMessage = emitSystemNotice(
          onEvent,
          ctx.turn.id,
          seq,
          "投票主持暂不可用，已使用默认选项（支持/反对）继续投票。",
        );
      }
    }

    // 2. 创建投票会话
    const voteSession = this.votingManager.createVote({
      topic: ctx.triggerMessage.content,
      options,
      strategy: "majority",
      initiator: leader.id,
    });
    setVoteSessionId(voteSession.id);
    seq += 1;
    onEvent({
      kind: "vote.open",
      turnId: ctx.turn.id,
      sequenceNum: seq,
      voteId: voteSession.id,
      options: options.map((o) => ({ id: o.id, label: o.label })),
    });

    // 3. 各成员投票
    const votes: MemberVote[] = [];
    for (const voter of voters) {
      this.assertNotAborted(ctx.signal);
      const messageId = uuid();
      seq += 1;
      onEvent({
        kind: "participant.thinking",
        turnId: ctx.turn.id,
        sequenceNum: seq,
        memberId: voter.id,
        messageId,
      });
      try {
        const decision = await this.askMemberVote(voter, options, ctx);
        const valid = options.find((o) => o.id === decision.optionId);
        if (valid) {
          this.votingManager.castVote(
            voteSession.id,
            voter.id,
            decision.optionId,
          );
          seq += 1;
          onEvent({
            kind: "vote.cast",
            turnId: ctx.turn.id,
            sequenceNum: seq,
            voteId: voteSession.id,
            voterMemberId: voter.id,
            optionId: decision.optionId,
          });
        } else {
          this.logger.warn(
            `[VOTE] member ${voter.displayName} returned unknown optionId=${decision.optionId}`,
          );
        }
        seq += 1;
        const partialVote = {
          member: voter,
          messageId,
          optionId: decision.optionId,
          reason: decision.reason,
          doneSeq: seq,
          tokensUsed: decision.tokensUsed,
        };
        onEvent({
          kind: "participant.done",
          turnId: ctx.turn.id,
          sequenceNum: seq,
          memberId: voter.id,
          messageId,
          tokensUsed: decision.tokensUsed,
          content: this.formatVoteContent(partialVote, options),
        });
        votes.push(partialVote);
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : String(err);
        seq += 1;
        onEvent({
          kind: "participant.done",
          turnId: ctx.turn.id,
          sequenceNum: seq,
          memberId: voter.id,
          messageId,
          tokensUsed: 0,
          content: "[error] AI 服务暂时不可用，请稍后重试",
        });
        votes.push({
          member: voter,
          messageId,
          optionId: "",
          reason: "",
          doneSeq: seq,
          tokensUsed: 0,
          error: errMsg,
        });
      }
    }

    // 4. 计票
    // 4. 计票（评审 W4 v5 阻塞：vote.session 内存清理已由 execute() 外层 try/catch
    //    在异常路径调用 cancelVote 兜底；正常路径 closeVote 把 session.status 置为 closed）
    const result = this.votingManager.closeVote(voteSession.id, voters.length);
    seq += 1;
    onEvent({
      kind: "vote.closed",
      turnId: ctx.turn.id,
      sequenceNum: seq,
      voteId: voteSession.id,
      result: result ?? {
        voteId: voteSession.id,
        winner: undefined,
        tally: {},
        consensus: false,
      },
    });

    // 5. 输出消息：成员投票理由 + 结论
    const messages: PendingMessage[] = [];
    if (optionsGenerationMessage) messages.push(optionsGenerationMessage);
    for (const v of votes) {
      messages.push({
        id: v.messageId,
        senderType: "AI",
        senderMemberId: v.member.id,
        content: v.error
          ? "[error] AI 服务暂时不可用，请稍后重试"
          : this.formatVoteContent(v, options),
        modelId: v.member.modelId,
        modelName: null,
        tokens: v.tokensUsed,
        parentMessageId: ctx.triggerMessage.id,
        sequenceNum: v.doneSeq,
      });
    }
    if (result) {
      const conclusionId = uuid();
      const winnerLabel = result.winner
        ? (options.find((o) => o.id === result.winner)?.label ?? result.winner)
        : "无定论";
      const conclusionContent = this.formatConclusion(
        winnerLabel,
        result.consensus,
        result.tally,
        options,
      );

      // 2026-05-08：之前结论只 push 到 messages[]（DB 持久化），从未通过
      // participant.done 推流，导致前端 UI 永远看不到投票最终结果（user
      // screenshot 39："投票和评审，前端没有任何显示"）。修法：与其他终
      // 端消息保持一致，emit thinking + done 让结论作为 leader 的 AI 气泡
      // 自然渲染；vote.closed 仍单独 emit 用于未来 tally UI。
      seq += 1;
      onEvent({
        kind: "participant.thinking",
        turnId: ctx.turn.id,
        sequenceNum: seq,
        memberId: leader.id,
        messageId: conclusionId,
      });
      seq += 1;
      onEvent({
        kind: "participant.done",
        turnId: ctx.turn.id,
        sequenceNum: seq,
        memberId: leader.id,
        messageId: conclusionId,
        tokensUsed: 0,
        content: conclusionContent,
      });

      messages.push({
        id: conclusionId,
        senderType: "AI",
        senderMemberId: leader.id,
        content: conclusionContent,
        modelId: leader.modelId,
        modelName: null,
        tokens: 0,
        parentMessageId: ctx.triggerMessage.id,
        sequenceNum: seq,
      });
    }

    return {
      messages,
      metadata: {
        voteId: voteSession.id,
        winner: result?.winner ?? null,
        consensus: result?.consensus ?? false,
        voteCount: result?.voteCount ?? 0,
        participantCount: voters.length,
      },
    };
  }

  // ============ 内部 ============

  private pickLeader(enabled: AskRoomMember[]): AskRoomMember {
    return (
      enabled.find((m) => m.role === "LEADER") ??
      [...enabled].sort(
        (a, b) => a.order - b.order || a.id.localeCompare(b.id),
      )[0]
    );
  }

  private parseOptions(
    modeOptions: ModeContext["modeOptions"],
  ): VoteOption[] | null {
    if (!modeOptions) return null;
    const opts = (modeOptions as VoteOptionsInput).voteOptions;
    if (!Array.isArray(opts) || opts.length < 2) return null;
    return opts.map((o) => ({ id: o.id, label: o.label }));
  }

  private async generateOptions(
    leader: AskRoomMember,
    ctx: ModeContext,
  ): Promise<{
    options: VoteOption[];
    content: string;
    tokensUsed: number;
  }> {
    const messages: ChatMessage[] = [
      {
        role: "system",
        content:
          `你是 ${leader.displayName}，主持本次投票。请为用户问题列出 2-4 个候选答案选项。\n` +
          "格式（严格，每行一个）：\n" +
          "- [选项id] 选项简短文本\n" +
          "id 用 a/b/c/d 单字母。",
      },
      { role: "user", content: ctx.triggerMessage.content },
    ];
    const result = await this.chatFacade.chat({
      messages,
      model: leader.modelId,
      modelType: AIModelType.CHAT,
      taskProfile: { creativity: "low", outputLength: "short" },
      billing: {
        userId: ctx.userId,
        moduleType: "ai-ask",
        operationType: "room-vote-options",
        referenceId: ctx.turn.id,
        description: `AI Ask Room VOTE options - ${leader.displayName}`,
      },
    });

    const options = this.extractOptions(result.content);
    if (options.length < 2) {
      // fallback: 用两个标准选项
      return {
        options: [
          { id: "a", label: "支持" },
          { id: "b", label: "反对" },
        ],
        content: result.content,
        tokensUsed: result.tokensUsed ?? 0,
      };
    }
    return {
      options,
      content: result.content,
      tokensUsed: result.tokensUsed ?? 0,
    };
  }

  private extractOptions(text: string): VoteOption[] {
    const lines = text.split(/\r?\n/);
    const opts: VoteOption[] = [];
    for (const line of lines) {
      const m = line.match(
        /^[-*]\s*\[?([a-zA-Z0-9_-]{1,12})\]?\s*[:：\.\)]?\s*(.+)/,
      );
      if (m) {
        opts.push({
          id: m[1].toLowerCase(),
          label: m[2].trim().slice(0, 200),
        });
        if (opts.length >= 4) break;
      }
    }
    return opts;
  }

  private async askMemberVote(
    voter: AskRoomMember,
    options: VoteOption[],
    ctx: ModeContext,
  ): Promise<{ optionId: string; reason: string; tokensUsed: number }> {
    const sysParts: string[] = [];
    if (voter.systemPrompt) sysParts.push(voter.systemPrompt);
    sysParts.push(
      `你是 ${voter.displayName}，正在为用户问题投票。\n请按下面格式输出（不要其他内容）：\n` +
        "VOTE: <optionId>\n" +
        "REASON: <一句话理由>",
    );
    sysParts.push(
      "可选项：\n" + options.map((o) => `- ${o.id}: ${o.label}`).join("\n"),
    );

    const result = await this.chatFacade.chat({
      messages: [
        { role: "system", content: sysParts.join("\n\n") },
        { role: "user", content: ctx.triggerMessage.content },
      ],
      model: voter.modelId,
      modelType: AIModelType.CHAT,
      taskProfile: { creativity: "low", outputLength: "short" },
      billing: {
        userId: ctx.userId,
        moduleType: "ai-ask",
        operationType: "room-vote",
        referenceId: ctx.turn.id,
        description: `AI Ask Room VOTE - ${voter.displayName}`,
      },
    });

    const parsed = this.parseVoteResponse(result.content);
    return {
      optionId: parsed.optionId,
      reason: parsed.reason,
      tokensUsed: result.tokensUsed ?? 0,
    };
  }

  private parseVoteResponse(text: string): {
    optionId: string;
    reason: string;
  } {
    const voteMatch = text.match(/VOTE\s*[:：]\s*([a-zA-Z0-9_-]{1,12})/i);
    const reasonMatch = text.match(/REASON\s*[:：]\s*(.+)/i);
    return {
      optionId: voteMatch ? voteMatch[1].toLowerCase() : "",
      reason: reasonMatch
        ? reasonMatch[1].trim().slice(0, 500)
        : text.slice(0, 200),
    };
  }

  private formatVoteContent(v: MemberVote, options: VoteOption[]): string {
    const label = options.find((o) => o.id === v.optionId)?.label ?? v.optionId;
    return `投票：${label}\n理由：${v.reason}`;
  }

  private formatConclusion(
    winnerLabel: string,
    consensus: boolean,
    tally: Record<string, number>,
    options: VoteOption[],
  ): string {
    const lines: string[] = [];
    lines.push(
      `投票结果：**${winnerLabel}**${consensus ? "（达成多数共识）" : "（未达成共识）"}`,
    );
    lines.push("");
    lines.push("票数分布：");
    for (const [id, count] of Object.entries(tally)) {
      const label = options.find((o) => o.id === id)?.label ?? id;
      lines.push(`- ${label}: ${count}`);
    }
    return lines.join("\n");
  }

  private assertNotAborted(signal: AbortSignal): void {
    if (signal.aborted) {
      throw new Error("VOTE adapter aborted");
    }
  }
}
