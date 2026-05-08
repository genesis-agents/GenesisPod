import { Test } from "@nestjs/testing";
import {
  AskRoomMember,
  AskRoomMemberRole,
  AskRoomMemberType,
  AskRoomMode,
  AskRoomTurn,
  AskSession,
  AskSenderType,
  AskMessage,
  AskTurnStatus,
  AskSessionMode,
} from "@prisma/client";
import { ChatFacade, VotingManager } from "@/modules/ai-harness/facade";
import { VoteAdapter } from "../../adapters/vote.adapter";
import type { ModeContext } from "../../adapters/mode-adapter.interface";
import type { AskRoomServerEvent } from "../../gateway/ask-room-events.types";

const mkMember = (overrides: Partial<AskRoomMember> = {}): AskRoomMember => ({
  id: overrides.id ?? "m-1",
  sessionId: "s-1",
  memberType: AskRoomMemberType.VIRTUAL,
  agentId: null,
  modelId: overrides.modelId ?? "model-x",
  displayName: overrides.displayName ?? "Alice",
  role: overrides.role ?? AskRoomMemberRole.MEMBER,
  systemPrompt: null,
  persona: null,
  order: overrides.order ?? 0,
  enabled: overrides.enabled ?? true,
  deletedAt: overrides.deletedAt ?? null,
  createdAt: new Date(),
  updatedAt: new Date(),
});

const mkContext = (
  members: AskRoomMember[],
  modeOptions?: Record<string, unknown>,
): ModeContext => ({
  session: {
    id: "s-1",
    userId: "u-1",
    title: "Room",
    summary: null,
    modelId: null,
    isBookmarked: false,
    createdAt: new Date(),
    updatedAt: new Date(),
    mode: AskSessionMode.ROOM,
    roomConfig: {},
  } as AskSession,
  members,
  triggerMessage: {
    id: "msg-user-1",
    sessionId: "s-1",
    role: "user",
    content: "Should we adopt X?",
    modelId: null,
    modelName: null,
    tokens: 0,
    webSearch: false,
    createdAt: new Date(),
    senderType: AskSenderType.USER,
    senderMemberId: null,
    mentionedMemberIds: [],
    turnId: null,
    parentMessageId: null,
    sequenceNum: 1,
  } as AskMessage,
  history: [],
  turn: {
    id: "t-1",
    sessionId: "s-1",
    triggerMessageId: "msg-user-1",
    mode: AskRoomMode.VOTE,
    status: AskTurnStatus.RUNNING,
    participantIds: [],
    partialDeltas: null,
    metadata: null,
    startedAt: new Date(),
    endedAt: null,
  } as AskRoomTurn,
  modeOptions,
  userId: "u-1",
  sequenceNumStart: 1,
  signal: new AbortController().signal,
});

describe("VoteAdapter", () => {
  let adapter: VoteAdapter;
  let chat: jest.Mock;

  beforeEach(async () => {
    chat = jest.fn();
    const module = await Test.createTestingModule({
      providers: [
        VoteAdapter,
        { provide: ChatFacade, useValue: { chat } },
        { provide: VotingManager, useValue: new VotingManager() },
      ],
    }).compile();
    adapter = module.get(VoteAdapter);
  });

  it("uses explicit voteOptions and tallies majority winner", async () => {
    chat
      .mockResolvedValueOnce({
        content: "VOTE: a\nREASON: A is better",
        tokensUsed: 5,
      })
      .mockResolvedValueOnce({
        content: "VOTE: a\nREASON: agree",
        tokensUsed: 4,
      })
      .mockResolvedValueOnce({
        content: "VOTE: b\nREASON: prefer B",
        tokensUsed: 4,
      });
    const leader = mkMember({ id: "leader", role: AskRoomMemberRole.LEADER });
    const v1 = mkMember({ id: "v1", displayName: "V1" });
    const v2 = mkMember({ id: "v2", displayName: "V2" });
    const v3 = mkMember({ id: "v3", displayName: "V3" });
    const events: AskRoomServerEvent[] = [];

    const result = await adapter.execute(
      mkContext([leader, v1, v2, v3], {
        voteOptions: [
          { id: "a", label: "Adopt" },
          { id: "b", label: "Reject" },
        ],
      }),
      (e) => events.push(e),
    );

    expect(events.find((e) => e.kind === "vote.open")).toBeDefined();
    const closed = events.find((e) => e.kind === "vote.closed");
    expect(closed).toBeDefined();
    expect(result.metadata.winner).toBe("a");
    expect(result.metadata.consensus).toBe(true);
    // 3 voters + 1 conclusion = 4 messages
    expect(result.messages).toHaveLength(4);
  });

  it("generates options via leader chat when no explicit voteOptions", async () => {
    chat.mockReset();
    chat
      .mockResolvedValueOnce({
        content: "- [a] Adopt\n- [b] Reject",
        tokensUsed: 3,
      })
      .mockResolvedValueOnce({ content: "VOTE: a\nREASON: r", tokensUsed: 2 })
      .mockResolvedValueOnce({ content: "VOTE: b\nREASON: r", tokensUsed: 2 });
    const leader = mkMember({ id: "leader", role: AskRoomMemberRole.LEADER });
    const v1 = mkMember({ id: "v1" });
    const v2 = mkMember({ id: "v2" });
    const result = await adapter.execute(mkContext([leader, v1, v2]), () => {});
    // 1 options gen + 2 voters + 1 conclusion = 4
    expect(result.messages).toHaveLength(4);
    expect(result.metadata.voteCount).toBe(2);
  });

  it("rejects with insufficient_members when only 1 enabled", async () => {
    const m = mkMember({ id: "m" });
    const result = await adapter.execute(mkContext([m]), () => {});
    expect(result.metadata.reason).toBe("insufficient_members");
  });

  it("invalid optionId returned by member is recorded but not counted", async () => {
    chat.mockReset();
    chat
      .mockResolvedValueOnce({ content: "VOTE: a\nREASON: ok", tokensUsed: 1 })
      .mockResolvedValueOnce({
        content: "VOTE: zzz\nREASON: bad",
        tokensUsed: 1,
      });
    const leader = mkMember({ id: "leader", role: AskRoomMemberRole.LEADER });
    const v1 = mkMember({ id: "v1" });
    const v2 = mkMember({ id: "v2" });
    const result = await adapter.execute(
      mkContext([leader, v1, v2], {
        voteOptions: [
          { id: "a", label: "A" },
          { id: "b", label: "B" },
        ],
      }),
      () => {},
    );
    // 仅 v1 的投票被计数（v2 invalid）
    expect(result.metadata.voteCount).toBe(1);
  });

  it("emits monotonically increasing sequenceNum", async () => {
    chat
      .mockResolvedValueOnce({ content: "VOTE: a\nREASON: r", tokensUsed: 1 })
      .mockResolvedValueOnce({ content: "VOTE: b\nREASON: r", tokensUsed: 1 });
    const leader = mkMember({ id: "leader", role: AskRoomMemberRole.LEADER });
    const v1 = mkMember({ id: "v1" });
    const v2 = mkMember({ id: "v2" });
    const events: AskRoomServerEvent[] = [];
    await adapter.execute(
      mkContext([leader, v1, v2], {
        voteOptions: [
          { id: "a", label: "A" },
          { id: "b", label: "B" },
        ],
      }),
      (e) => events.push(e),
    );
    const seqs = events.map((e) => e.sequenceNum);
    for (let i = 1; i < seqs.length; i += 1) {
      expect(seqs[i]).toBeGreaterThan(seqs[i - 1]);
    }
  });
});
