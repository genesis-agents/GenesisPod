/**
 * LeaderChatService — public methods: list() and send()
 *
 * Tests the full send() pipeline and list() mapping.
 * Parser tests are in __tests__/leader-chat.service.spec.ts.
 */

import { LeaderChatService } from "./leader-chat.service";
import { AIModelType } from "@prisma/client";

function makeRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "row-1",
    role: "user",
    content: "hello",
    tokensUsed: null,
    createdAt: new Date("2024-01-01"),
    decision: null,
    missionId: "m-1",
    userId: "u-1",
    ...overrides,
  };
}

function makeMission(overrides: Record<string, unknown> = {}) {
  return {
    id: "m-1",
    topic: "AI trends",
    depth: "deep",
    language: "zh-CN",
    status: "completed",
    dimensions: [],
    reportFull: null,
    finalScore: null,
    themeSummary: null,
    ...overrides,
  };
}

function buildService() {
  const prisma = {
    agentPlaygroundLeaderChat: {
      findMany: jest.fn().mockResolvedValue([]),
      create: jest
        .fn()
        .mockImplementation((args: { data: Record<string, unknown> }) =>
          Promise.resolve({
            id: `created-${args.data.role}`,
            role: args.data.role,
            content: args.data.content,
            tokensUsed: args.data.tokensUsed ?? null,
            createdAt: new Date(),
            decision: args.data.decision ?? null,
            missionId: args.data.missionId,
            userId: args.data.userId,
          }),
        ),
    },
  };

  const chatResult = {
    content: '{"decisionType":"DIRECT_ANSWER","response":"OK, understood."}',
    usage: { totalTokens: 123 },
  };
  const chat = {
    chat: jest.fn().mockResolvedValue(chatResult),
  };

  const store = {
    getById: jest.fn().mockResolvedValue(makeMission()),
    appendDimensions: jest.fn().mockResolvedValue(["dim-new-1"]),
  };

  const eventBus = {
    emit: jest.fn().mockResolvedValue(undefined),
  };

  const service = new LeaderChatService(
    prisma as never,
    chat as never,
    store as never,
    eventBus as never,
  );

  return { service, prisma, chat, store, eventBus };
}

describe("LeaderChatService.list", () => {
  it("returns empty array when no messages", async () => {
    const { service } = buildService();
    const result = await service.list("m-1");
    expect(result).toEqual([]);
  });

  it("maps database rows to LeaderChatMessage DTO", async () => {
    const { service, prisma } = buildService();
    prisma.agentPlaygroundLeaderChat.findMany.mockResolvedValue([
      makeRow({ role: "user", content: "hello", tokensUsed: null }),
      makeRow({
        id: "row-2",
        role: "assistant",
        content: "response",
        tokensUsed: 50,
        decision: { type: "DIRECT_ANSWER" },
      }),
    ]);

    const result = await service.list("m-1");
    expect(result).toHaveLength(2);
    expect(result[0].role).toBe("user");
    expect(result[0].content).toBe("hello");
    expect(result[1].role).toBe("assistant");
    expect(result[1].tokensUsed).toBe(50);
    expect(result[1].decision?.type).toBe("DIRECT_ANSWER");
  });

  it("sets decision to null for non-object decision field", async () => {
    const { service, prisma } = buildService();
    prisma.agentPlaygroundLeaderChat.findMany.mockResolvedValue([
      makeRow({ role: "assistant", decision: "invalid-string" }),
    ]);
    const result = await service.list("m-1");
    expect(result[0].decision).toBeNull();
  });

  it("sets decision to null when decision object has no type field", async () => {
    const { service, prisma } = buildService();
    prisma.agentPlaygroundLeaderChat.findMany.mockResolvedValue([
      makeRow({ role: "assistant", decision: { noType: true } }),
    ]);
    const result = await service.list("m-1");
    expect(result[0].decision).toBeNull();
  });

  it("maps unknown role to 'user'", async () => {
    const { service, prisma } = buildService();
    prisma.agentPlaygroundLeaderChat.findMany.mockResolvedValue([
      makeRow({ role: "system" }),
    ]);
    const result = await service.list("m-1");
    expect(result[0].role).toBe("user");
  });

  it("queries with correct missionId", async () => {
    const { service, prisma } = buildService();
    await service.list("specific-mission-id");
    expect(prisma.agentPlaygroundLeaderChat.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { missionId: "specific-mission-id" },
      }),
    );
  });
});

describe("LeaderChatService.send", () => {
  it("throws when content is empty string", async () => {
    const { service } = buildService();
    await expect(service.send("m-1", "u-1", "  ")).rejects.toThrow(
      "Message content cannot be empty",
    );
  });

  it("persists user message with trimmed content", async () => {
    const { service, prisma } = buildService();
    prisma.agentPlaygroundLeaderChat.findMany.mockResolvedValue([]);
    await service.send("m-1", "u-1", "  hello world  ");
    const createCalls = prisma.agentPlaygroundLeaderChat.create.mock.calls;
    const userCall = createCalls[0][0] as { data: Record<string, unknown> };
    expect(userCall.data.role).toBe("user");
    expect(userCall.data.content).toBe("hello world");
  });

  it("returns user and assistant messages", async () => {
    const { service, prisma } = buildService();
    prisma.agentPlaygroundLeaderChat.findMany.mockResolvedValue([]);
    const result = await service.send("m-1", "u-1", "what is AI?");
    expect(result.user).toBeDefined();
    expect(result.assistant).toBeDefined();
    expect(result.user.role).toBe("user");
    expect(result.assistant.role).toBe("assistant");
  });

  it("calls AiChatService with correct modelType and operationName", async () => {
    const { service, prisma, chat } = buildService();
    prisma.agentPlaygroundLeaderChat.findMany.mockResolvedValue([]);
    await service.send("m-1", "u-1", "tell me more");
    expect(chat.chat).toHaveBeenCalledWith(
      expect.objectContaining({
        modelType: AIModelType.CHAT,
        operationName: "agent-playground.leader-chat",
        userId: "u-1",
        taskProfile: { creativity: "low", outputLength: "medium" },
      }),
    );
  });

  it("persists assistant message with tokensUsed", async () => {
    const { service, prisma } = buildService();
    prisma.agentPlaygroundLeaderChat.findMany.mockResolvedValue([]);
    await service.send("m-1", "u-1", "hello");
    const createCalls = prisma.agentPlaygroundLeaderChat.create.mock.calls;
    // second create call is for assistant
    const assistantCall = createCalls[1][0] as {
      data: Record<string, unknown>;
    };
    expect(assistantCall.data.role).toBe("assistant");
    expect(assistantCall.data.tokensUsed).toBe(123);
  });

  it("handles LLM failure gracefully — returns error message instead of throwing", async () => {
    const { service, prisma, chat } = buildService();
    prisma.agentPlaygroundLeaderChat.findMany.mockResolvedValue([]);
    chat.chat.mockRejectedValue(new Error("LLM down"));
    const result = await service.send("m-1", "u-1", "hello");
    expect(result.assistant.content).toContain("Leader 暂时无法回复");
    expect(result.assistant.content).toContain("LLM down");
  });

  it("builds system prompt from mission context", async () => {
    const { service, prisma, store, chat } = buildService();
    store.getById.mockResolvedValue(
      makeMission({
        topic: "Custom topic",
        status: "running",
        dimensions: [{ name: "dim-1", rationale: "important" }],
      }),
    );
    prisma.agentPlaygroundLeaderChat.findMany.mockResolvedValue([]);
    await service.send("m-1", "u-1", "hello");
    const callArg = chat.chat.mock.calls[0][0] as { systemPrompt: string };
    expect(callArg.systemPrompt).toContain("Custom topic");
    expect(callArg.systemPrompt).toContain("dim-1");
  });

  it("handles CREATE_TODO decision when mission is running → appends dimensions", async () => {
    const { service, prisma, chat, store, eventBus } = buildService();
    prisma.agentPlaygroundLeaderChat.findMany.mockResolvedValue([]);
    store.getById.mockResolvedValue(makeMission({ status: "running" }));
    chat.chat.mockResolvedValue({
      content:
        '{"decisionType":"CREATE_TODO","response":"Added dim","todo":[{"name":"NewDim","rationale":"why"}]}',
      usage: { totalTokens: 200 },
    });
    const result = await service.send("m-1", "u-1", "add a dimension");
    expect(store.appendDimensions).toHaveBeenCalledWith("m-1", [
      { name: "NewDim", rationale: "why" },
    ]);
    expect(result.appendedDimensionIds).toBeDefined();
    expect(eventBus.emit).toHaveBeenCalled();
  });

  it("does NOT append dimensions when decision is CREATE_TODO but mission not running", async () => {
    const { service, prisma, chat, store } = buildService();
    prisma.agentPlaygroundLeaderChat.findMany.mockResolvedValue([]);
    store.getById.mockResolvedValue(makeMission({ status: "completed" }));
    chat.chat.mockResolvedValue({
      content:
        '{"decisionType":"CREATE_TODO","response":"Added dim","todo":[{"name":"NewDim","rationale":"why"}]}',
      usage: { totalTokens: 100 },
    });
    const result = await service.send("m-1", "u-1", "add a dimension");
    expect(store.appendDimensions).not.toHaveBeenCalled();
    expect(result.appendedDimensionIds).toBeUndefined();
  });

  it("truncates content > 4000 chars to 4000", async () => {
    const { service, prisma } = buildService();
    prisma.agentPlaygroundLeaderChat.findMany.mockResolvedValue([]);
    const longContent = "x".repeat(5000);
    await service.send("m-1", "u-1", longContent);
    const createCalls = prisma.agentPlaygroundLeaderChat.create.mock.calls;
    const userCall = createCalls[0][0] as { data: Record<string, unknown> };
    expect((userCall.data.content as string).length).toBe(4000);
  });

  it("builds system prompt in English when language is en-US", async () => {
    const { service, prisma, store, chat } = buildService();
    store.getById.mockResolvedValue(
      makeMission({ language: "en-US", topic: "Climate change" }),
    );
    prisma.agentPlaygroundLeaderChat.findMany.mockResolvedValue([]);
    await service.send("m-1", "u-1", "hello");
    const callArg = chat.chat.mock.calls[0][0] as { systemPrompt: string };
    expect(callArg.systemPrompt).toContain("Research Leader");
    expect(callArg.systemPrompt).toContain("Climate change");
  });

  it("handles null mission gracefully in system prompt", async () => {
    const { service, prisma, store, chat } = buildService();
    store.getById.mockResolvedValue(null);
    prisma.agentPlaygroundLeaderChat.findMany.mockResolvedValue([]);
    await service.send("m-1", "u-1", "hello");
    const callArg = chat.chat.mock.calls[0][0] as { systemPrompt: string };
    expect(callArg.systemPrompt).toContain("Research Leader");
    expect(callArg.systemPrompt).toContain("not found");
  });

  it("includes history messages in LLM call", async () => {
    const { service, prisma, chat } = buildService();
    prisma.agentPlaygroundLeaderChat.findMany.mockResolvedValue([
      makeRow({ role: "user", content: "previous question", id: "p1" }),
    ]);
    await service.send("m-1", "u-1", "follow up");
    const callArg = chat.chat.mock.calls[0][0] as {
      messages: { role: string; content: string }[];
    };
    // findMany is called twice (once in send → list, once in list itself)
    // messages passed to chat should include the previous user message
    expect(
      callArg.messages.some((m) => m.content === "previous question"),
    ).toBe(true);
  });

  it("eventBus emit failure does not throw", async () => {
    const { service, prisma, chat, store, eventBus } = buildService();
    prisma.agentPlaygroundLeaderChat.findMany.mockResolvedValue([]);
    store.getById.mockResolvedValue(makeMission({ status: "running" }));
    chat.chat.mockResolvedValue({
      content:
        '{"decisionType":"CREATE_TODO","response":"ok","todo":[{"name":"D","rationale":"r"}]}',
      usage: { totalTokens: 10 },
    });
    eventBus.emit.mockRejectedValue(new Error("bus error"));
    // Should not throw
    await expect(service.send("m-1", "u-1", "add dim")).resolves.toBeDefined();
  });
});
