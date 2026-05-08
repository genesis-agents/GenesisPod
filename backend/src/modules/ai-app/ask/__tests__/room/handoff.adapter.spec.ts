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
import { ChatFacade } from "@/modules/ai-harness/facade";
import { HandoffAdapter } from "../../adapters/handoff.adapter";
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
    content: "Need expert advice",
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
    mode: AskRoomMode.HANDOFF,
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

describe("HandoffAdapter", () => {
  let adapter: HandoffAdapter;
  let chat: jest.Mock;

  beforeEach(async () => {
    chat = jest.fn();
    const module = await Test.createTestingModule({
      providers: [HandoffAdapter, { provide: ChatFacade, useValue: { chat } }],
    }).compile();
    adapter = module.get(HandoffAdapter);
  });

  it("single agent answers without handoff tag → chain length 1", async () => {
    chat.mockResolvedValueOnce({ content: "Final answer.", tokensUsed: 5 });
    const a = mkMember({ id: "a", role: AskRoomMemberRole.LEADER });
    const b = mkMember({ id: "b" });
    const result = await adapter.execute(mkContext([a, b]), () => {});
    expect(result.metadata.chain).toEqual(["a"]);
    expect(result.metadata.depth).toBe(1);
    expect(result.messages).toHaveLength(1);
    expect(result.messages[0].content).toBe("Final answer.");
  });

  it("hands off via [HANDOFF: id] tag; emits handoff.request + accepted", async () => {
    chat
      .mockResolvedValueOnce({
        content: "I cannot answer.\n[HANDOFF: b]",
        tokensUsed: 3,
      })
      .mockResolvedValueOnce({ content: "I can: ...", tokensUsed: 5 });
    const a = mkMember({ id: "a", role: AskRoomMemberRole.LEADER });
    const b = mkMember({ id: "b", displayName: "Specialist" });
    const events: AskRoomServerEvent[] = [];
    const result = await adapter.execute(mkContext([a, b]), (e) =>
      events.push(e),
    );
    expect(result.metadata.chain).toEqual(["a", "b"]);
    expect(events.find((e) => e.kind === "handoff.request")).toBeDefined();
    expect(events.find((e) => e.kind === "handoff.accepted")).toBeDefined();
    // a 的消息内容已剥除标记
    expect(result.messages[0].content).not.toContain("HANDOFF");
  });

  it("rejects handoff to unknown target id", async () => {
    chat.mockResolvedValueOnce({
      content: "passing.\n[HANDOFF: nonexistent]",
      tokensUsed: 1,
    });
    const a = mkMember({ id: "a", role: AskRoomMemberRole.LEADER });
    const b = mkMember({ id: "b" });
    const events: AskRoomServerEvent[] = [];
    const result = await adapter.execute(mkContext([a, b]), (e) =>
      events.push(e),
    );
    expect(events.find((e) => e.kind === "handoff.rejected")).toBeDefined();
    expect(result.metadata.chain).toEqual(["a"]);
  });

  it("rejects handoff back to already-visited member (cycle prevention)", async () => {
    chat
      .mockResolvedValueOnce({
        content: "first\n[HANDOFF: b]",
        tokensUsed: 1,
      })
      .mockResolvedValueOnce({
        content: "back\n[HANDOFF: a]",
        tokensUsed: 1,
      });
    const a = mkMember({ id: "a", role: AskRoomMemberRole.LEADER });
    const b = mkMember({ id: "b" });
    const events: AskRoomServerEvent[] = [];
    const result = await adapter.execute(mkContext([a, b]), (e) =>
      events.push(e),
    );
    expect(result.metadata.chain).toEqual(["a", "b"]);
    expect(events.find((e) => e.kind === "handoff.rejected")).toBeDefined();
  });

  it("prevents indirect cycle A→B→C→B", async () => {
    chat
      .mockResolvedValueOnce({ content: "to b\n[HANDOFF: b]", tokensUsed: 1 })
      .mockResolvedValueOnce({ content: "to c\n[HANDOFF: c]", tokensUsed: 1 })
      .mockResolvedValueOnce({
        content: "back to b\n[HANDOFF: b]",
        tokensUsed: 1,
      });
    const a = mkMember({ id: "a", role: AskRoomMemberRole.LEADER, order: 0 });
    const b = mkMember({ id: "b", order: 1 });
    const c = mkMember({ id: "c", order: 2 });
    const events: AskRoomServerEvent[] = [];
    const result = await adapter.execute(mkContext([a, b, c]), (e) =>
      events.push(e),
    );
    expect(result.metadata.chain).toEqual(["a", "b", "c"]);
    // c 试图 handoff 到已访问的 b → rejected
    const rejected = events.filter((e) => e.kind === "handoff.rejected");
    expect(rejected.length).toBeGreaterThan(0);
  });

  it("rejects ambiguous displayName when two members share name", async () => {
    chat.mockResolvedValueOnce({
      content: "to expert\n[HANDOFF: Expert]",
      tokensUsed: 1,
    });
    const a = mkMember({
      id: "a",
      role: AskRoomMemberRole.LEADER,
      displayName: "Leader",
    });
    const b = mkMember({ id: "b", displayName: "Expert" });
    const c = mkMember({ id: "c", displayName: "Expert" }); // 同名
    const events: AskRoomServerEvent[] = [];
    const result = await adapter.execute(mkContext([a, b, c]), (e) =>
      events.push(e),
    );
    // 因为 Expert 有歧义，应被 rejected 而不是路由到 b 或 c
    expect(events.find((e) => e.kind === "handoff.rejected")).toBeDefined();
    expect(result.metadata.chain).toEqual(["a"]);
  });

  it("respects modeOptions.startMemberId", async () => {
    chat.mockResolvedValueOnce({ content: "Hi.", tokensUsed: 1 });
    const a = mkMember({ id: "a", role: AskRoomMemberRole.LEADER });
    const b = mkMember({ id: "b" });
    const c = mkMember({ id: "c" });
    const result = await adapter.execute(
      mkContext([a, b, c], { startMemberId: "c" }),
      () => {},
    );
    expect(result.metadata.chain).toEqual(["c"]);
  });

  it("stops at MAX_HANDOFF_DEPTH=5", async () => {
    // 7 个成员，每个都把传给下一个
    const members = ["a", "b", "c", "d", "e", "f", "g"].map((id, i) =>
      mkMember({ id, order: i }),
    );
    const next = ["b", "c", "d", "e", "f", "g"];
    for (const target of next) {
      chat.mockResolvedValueOnce({
        content: `bridge\n[HANDOFF: ${target}]`,
        tokensUsed: 1,
      });
    }
    chat.mockResolvedValueOnce({ content: "tail", tokensUsed: 1 });
    const result = await adapter.execute(mkContext(members), () => {});
    // depth=5 → chain a→b→c→d→e→f (6 个 member)
    expect(result.metadata.depth).toBeLessThanOrEqual(6);
    expect(result.metadata.chain[0]).toBe("a");
  });
});
