/**
 * LeaderChatService — public methods: list() and send()
 *
 * Tests the full send() pipeline and list() mapping.
 * Parser tests are in __tests__/leader-chat.service.spec.ts.
 */

import { LeaderChatService } from "../leader-chat.service";
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
    // ★ 全覆盖审计修 (2026-05-06): send() 现在要求 running/starting 状态，默认改为 running
    status: "running",
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

  // PR-F: SKILL.md skill catalog mock — let send() use the SKILL.md body or fallback
  const skillCatalog = {
    get: jest.fn().mockReturnValue(undefined), // falls back to LEADER_CHAT_SKILL_FALLBACK
  };

  const service = new LeaderChatService(
    prisma as never,
    chat as never,
    store as never,
    eventBus as never,
    skillCatalog as never,
  );

  return { service, prisma, chat, store, eventBus, skillCatalog };
}

// ── consolidation injection branch (lines 173-178) ───────────────────────────

describe("LeaderChatService.send — consolidation injection", () => {
  function mkPrismaFull() {
    return {
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
  }

  it("consolidation present + getRulesForMission succeeds → snippet injected (lines 174-176)", async () => {
    const chat = {
      chat: jest.fn().mockResolvedValue({
        content: '{"decisionType":"DIRECT_ANSWER","response":"OK"}',
        usage: { totalTokens: 10 },
      }),
    };
    const store = {
      getById: jest.fn().mockResolvedValue(makeMission()),
      appendDimensions: jest.fn().mockResolvedValue([]),
    };
    const consolidation = {
      getRulesForMission: jest
        .fn()
        .mockResolvedValue({ promptSnippet: "Rule: always cite sources" }),
    };
    const service = new LeaderChatService(
      mkPrismaFull() as never,
      chat as never,
      store as never,
      { emit: jest.fn().mockResolvedValue(undefined) } as never,
      { get: jest.fn().mockReturnValue(undefined) } as never,
      consolidation as never,
    );

    const result = await service.send("m-1", "u-1", "hello");
    expect(consolidation.getRulesForMission).toHaveBeenCalledWith([]);
    // The systemPrompt used in chat should include the consolidation snippet
    const callArg = chat.chat.mock.calls[0][0] as { systemPrompt: string };
    expect(callArg.systemPrompt).toContain("Rule: always cite sources");
    expect(result.assistant).toBeDefined();
  });

  it("consolidation present + getRulesForMission throws → warns + continues (line 177-180)", async () => {
    const chat = {
      chat: jest.fn().mockResolvedValue({
        content: '{"decisionType":"DIRECT_ANSWER","response":"OK"}',
        usage: { totalTokens: 10 },
      }),
    };
    const store = {
      getById: jest.fn().mockResolvedValue(makeMission()),
      appendDimensions: jest.fn().mockResolvedValue([]),
    };
    const consolidation = {
      getRulesForMission: jest
        .fn()
        .mockRejectedValue(new Error("rule service down")),
    };
    const service = new LeaderChatService(
      mkPrismaFull() as never,
      chat as never,
      store as never,
      { emit: jest.fn().mockResolvedValue(undefined) } as never,
      { get: jest.fn().mockReturnValue(undefined) } as never,
      consolidation as never,
    );

    // Should not throw, should degrade gracefully
    const result = await service.send("m-1", "u-1", "hello");
    expect(consolidation.getRulesForMission).toHaveBeenCalled();
    expect(result.assistant.content).toBe("OK");
  });

  it("appendDimensions throws → logs warn, does not propagate (line 316)", async () => {
    const chat = {
      chat: jest.fn().mockResolvedValue({
        content:
          '{"decisionType":"CREATE_TODO","response":"Added","todo":[{"name":"NewDim","rationale":"why"}]}',
        usage: { totalTokens: 10 },
      }),
    };
    const store = {
      getById: jest.fn().mockResolvedValue(makeMission({ status: "running" })),
      appendDimensions: jest
        .fn()
        .mockRejectedValue(new Error("DB write failed")),
    };
    const service = new LeaderChatService(
      mkPrismaFull() as never,
      chat as never,
      store as never,
      { emit: jest.fn().mockResolvedValue(undefined) } as never,
      { get: jest.fn().mockReturnValue(undefined) } as never,
    );

    // Should not throw, appendedDimensionIds should be undefined
    const result = await service.send("m-1", "u-1", "add a dimension");
    expect(result.appendedDimensionIds).toBeUndefined();
    // the response text is unchanged (no re-throw)
    expect(result.assistant).toBeDefined();
  });

  it("appendDimensions throws non-Error string → String(err) branch at line 317", async () => {
    // The catch at line 315-318 has `err instanceof Error ? err.message : String(err)`
    // Throw a non-Error (string) to cover the [1] false branch
    const chat = {
      chat: jest.fn().mockResolvedValue({
        content:
          '{"decisionType":"CREATE_TODO","response":"Added","todo":[{"name":"D2","rationale":"r"}]}',
        usage: { totalTokens: 10 },
      }),
    };
    const store = {
      getById: jest.fn().mockResolvedValue(makeMission({ status: "running" })),
      appendDimensions: jest.fn().mockRejectedValue("plain-string-error"), // non-Error → String(err) branch
    };
    const service = new LeaderChatService(
      mkPrismaFull() as never,
      chat as never,
      store as never,
      { emit: jest.fn().mockResolvedValue(undefined) } as never,
      { get: jest.fn().mockReturnValue(undefined) } as never,
    );
    // Should not throw; appendedDimensionIds should be undefined
    const result = await service.send("m-1", "u-1", "add dim");
    expect(result.assistant).toBeDefined();
    expect(result.appendedDimensionIds).toBeUndefined();
  });

  it("failover provider: listUserEnabledModelsByType throws → returns null (line 214-215)", async () => {
    const chat = {
      chat: jest.fn(async (opts: { model?: string }) => {
        if (!opts.model) {
          throw Object.assign(new Error("NO_AVAILABLE_KEY"), {
            code: "NO_AVAILABLE_KEY",
          });
        }
        return {
          content:
            '{"decisionType":"DIRECT_ANSWER","response":"OK via fallback"}',
          usage: { totalTokens: 5 },
        };
      }),
    };
    const store = {
      getById: jest.fn().mockResolvedValue(makeMission()),
      appendDimensions: jest.fn().mockResolvedValue([]),
    };
    const modelConfig = {
      listUserEnabledModelsByType: jest
        .fn()
        .mockRejectedValue(new Error("DB error")),
    };
    const service = new LeaderChatService(
      mkPrismaFull() as never,
      chat as never,
      store as never,
      { emit: jest.fn().mockResolvedValue(undefined) } as never,
      { get: jest.fn().mockReturnValue(undefined) } as never,
      undefined,
      modelConfig as never,
    );

    // listUserEnabledModelsByType throws → catch returns null → failover provider returns null
    // executeWithModelFailover will then fail (no model) → LLM error path
    const result = await service.send("m-1", "u-1", "hello");
    expect(modelConfig.listUserEnabledModelsByType).toHaveBeenCalled();
    // result is defined (error degraded gracefully)
    expect(result.assistant).toBeDefined();
  });
});

// ── Additional branch coverage ────────────────────────────────────────────────

describe("LeaderChatService.send — additional branch coverage", () => {
  function mkPrismaFull2() {
    return {
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
  }

  it("consolidation.getRulesForMission throws non-Error → String(err) branch (line 179)", async () => {
    // line 179: `err instanceof Error ? err.message : String(err)` - the String(err) branch
    const consolidation = {
      getRulesForMission: jest.fn().mockRejectedValue("string-error"),
    };
    const chat = {
      chat: jest.fn().mockResolvedValue({
        content: '{"decisionType":"DIRECT_ANSWER","response":"OK"}',
        usage: { totalTokens: 5 },
      }),
    };
    const store = {
      getById: jest.fn().mockResolvedValue(makeMission()),
      appendDimensions: jest.fn().mockResolvedValue([]),
    };
    const service = new LeaderChatService(
      mkPrismaFull2() as never,
      chat as never,
      store as never,
      { emit: jest.fn().mockResolvedValue(undefined) } as never,
      { get: jest.fn().mockReturnValue(undefined) } as never,
      consolidation as never,
    );
    // Should not throw (string error is handled gracefully)
    const result = await service.send("m-1", "u-1", "hello");
    expect(result.assistant).toBeDefined();
  });

  it("failover provider: models array empty → models[0]?.modelId is undefined → ?? null (line 213)", async () => {
    // models = [] → models[0] is undefined → ?.modelId is undefined → ?? null fires
    const chat = {
      chat: jest.fn(async (opts: { model?: string }) => {
        if (!opts.model) {
          throw Object.assign(new Error("NO_KEY"), {
            code: "NO_AVAILABLE_KEY",
          });
        }
        return {
          content: '{"decisionType":"DIRECT_ANSWER","response":"OK"}',
          usage: { totalTokens: 5 },
        };
      }),
    };
    const store = {
      getById: jest.fn().mockResolvedValue(makeMission()),
      appendDimensions: jest.fn().mockResolvedValue([]),
    };
    const modelConfig = {
      listUserEnabledModelsByType: jest.fn().mockResolvedValue([]), // empty → models[0] undefined
    };
    const service = new LeaderChatService(
      mkPrismaFull2() as never,
      chat as never,
      store as never,
      { emit: jest.fn().mockResolvedValue(undefined) } as never,
      { get: jest.fn().mockReturnValue(undefined) } as never,
      undefined,
      modelConfig as never,
    );
    // provider returns null (no available model) → failover fails → LLM error fallback
    const result = await service.send("m-1", "u-1", "hi");
    expect(result.assistant.content).toContain("Leader 暂时无法回复");
  });

  it("LLM result.content is null → content?.trim() || '' fallback (line 241)", async () => {
    // result.content is null → content?.trim() is undefined → || '' fires
    const chat = {
      chat: jest.fn().mockResolvedValue({
        content: null, // null triggers ?.trim() || "" branch
        model: "gemini",
        usage: { totalTokens: 5 },
      }),
    };
    const store = {
      getById: jest.fn().mockResolvedValue(makeMission()),
      appendDimensions: jest.fn().mockResolvedValue([]),
    };
    const service = new LeaderChatService(
      mkPrismaFull2() as never,
      chat as never,
      store as never,
      { emit: jest.fn().mockResolvedValue(undefined) } as never,
      { get: jest.fn().mockReturnValue(undefined) } as never,
    );
    const result = await service.send("m-1", "u-1", "hello");
    // Empty raw text → parseLeaderDecisionResponse fallback → DIRECT_ANSWER type
    expect(result.assistant).toBeDefined();
  });

  it("inspectResult: res.content is undefined → ?? '' branch (line 238)", async () => {
    // Return a result with no content field → res.content is undefined → ?? '' fires
    // Also tests result.content?.trim() || '' branch (line 241)
    const chat = {
      chat: jest.fn().mockResolvedValue({
        // No content field → res.content === undefined → inspectResult: message = undefined ?? '' = ''
        model: "model-a",
        usage: { totalTokens: 0 },
      }),
    };
    const store = {
      getById: jest.fn().mockResolvedValue(makeMission()),
      appendDimensions: jest.fn().mockResolvedValue([]),
    };
    const service = new LeaderChatService(
      mkPrismaFull2() as never,
      chat as never,
      store as never,
      { emit: jest.fn().mockResolvedValue(undefined) } as never,
      { get: jest.fn().mockReturnValue(undefined) } as never,
    );
    // When content is absent, raw = '' → parseLeaderDecisionResponse('') → DIRECT_ANSWER
    // → parsed.response = '' → assistantText = '(Leader did not respond)'
    const result = await service.send("m-1", "u-1", "hello");
    expect(result.assistant).toBeDefined();
    // Either the fallback text or whatever the parser returns for empty input
  });

  it("parsed.response is empty → || '(Leader did not respond)' fallback (line 245)", async () => {
    // When LLM returns a result with no usable response text
    // null content → raw = '' → parseLeaderDecisionResponse('') → response = ''
    // → '' || '(Leader did not respond)' fires
    const chat = {
      chat: jest.fn().mockResolvedValue({
        content: null, // null → ?.trim() is undefined → || '' fires → raw = ''
        usage: { totalTokens: 5 },
      }),
    };
    const store = {
      getById: jest.fn().mockResolvedValue(makeMission()),
      appendDimensions: jest.fn().mockResolvedValue([]),
    };
    const service = new LeaderChatService(
      mkPrismaFull2() as never,
      chat as never,
      store as never,
      { emit: jest.fn().mockResolvedValue(undefined) } as never,
      { get: jest.fn().mockReturnValue(undefined) } as never,
    );
    const result = await service.send("m-1", "u-1", "hello");
    // raw = '' → parseLeaderDecisionResponse('') → DIRECT_ANSWER with raw as response
    // Since raw = '', and response is raw (''), '' || '(Leader did not respond)' fires
    expect(result.assistant.content).toContain("(Leader did not respond)");
  });

  it("LLM throws non-Error value → String(err) in log and assistant text (lines 249, 251)", async () => {
    const chat = {
      chat: jest.fn().mockRejectedValue("raw string error"),
    };
    const store = {
      getById: jest.fn().mockResolvedValue(makeMission()),
      appendDimensions: jest.fn().mockResolvedValue([]),
    };
    const service = new LeaderChatService(
      mkPrismaFull2() as never,
      chat as never,
      store as never,
      { emit: jest.fn().mockResolvedValue(undefined) } as never,
      { get: jest.fn().mockReturnValue(undefined) } as never,
    );
    const result = await service.send("m-1", "u-1", "hello");
    // When err is not an Error, assistantText uses "unknown error" (from line 251)
    expect(result.assistant.content).toContain("unknown error");
  });

  it("eventBus.emit throws non-Error → String(e) branch in broadcastAppendedDimensions (lines 317, 351, 385)", async () => {
    // Throw a non-Error (string) to hit String(e) branch in all 3 .catch handlers
    const chat = {
      chat: jest.fn().mockResolvedValue({
        content:
          '{"decisionType":"CREATE_TODO","response":"added","todo":[{"name":"D","rationale":"r"}]}',
        usage: { totalTokens: 5 },
      }),
    };
    const store = {
      getById: jest.fn().mockResolvedValue(makeMission({ status: "running" })),
      appendDimensions: jest.fn().mockResolvedValue(["dim-new-1"]),
    };
    const eventBus = {
      emit: jest.fn().mockRejectedValue("non-error-string"),
    };
    const service = new LeaderChatService(
      mkPrismaFull2() as never,
      chat as never,
      store as never,
      eventBus as never,
      { get: jest.fn().mockReturnValue(undefined) } as never,
    );
    // Should not throw; non-Error rejection is caught and String()-ed
    const result = await service.send("m-1", "u-1", "add dim");
    expect(result.assistant).toBeDefined();
  });
});

describe("LeaderChatService.send — model-level failover", () => {
  function mkPrisma() {
    return {
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
  }

  it("BYOK provider error on default model → fails over to user's next model", async () => {
    const chat = {
      chat: jest.fn(async (opts: { model?: string }) => {
        if (!opts.model) {
          const e = new Error(
            'No API Key available for provider "deepseek"',
          ) as Error & { code: string };
          e.code = "NO_AVAILABLE_KEY";
          throw e;
        }
        return {
          content: '{"decisionType":"DIRECT_ANSWER","response":"OK"}',
          usage: { totalTokens: 10 },
        };
      }),
    };
    const store = {
      getById: jest.fn().mockResolvedValue(makeMission()),
      appendDimensions: jest.fn().mockResolvedValue([]),
    };
    const modelConfig = {
      listUserEnabledModelsByType: jest
        .fn()
        .mockResolvedValue([{ modelId: "grok-4" }]),
    };
    const service = new LeaderChatService(
      mkPrisma() as never,
      chat as never,
      store as never,
      { emit: jest.fn().mockResolvedValue(undefined) } as never,
      { get: jest.fn().mockReturnValue(undefined) } as never,
      undefined,
      modelConfig as never,
    );

    await service.send("m-1", "u-1", "hi");

    // failover provider consulted (excluding nothing/failed) → second chat used grok-4
    expect(modelConfig.listUserEnabledModelsByType).toHaveBeenCalledWith(
      "u-1",
      AIModelType.CHAT,
      expect.any(Array),
    );
    expect(chat.chat).toHaveBeenCalledTimes(2);
    expect(chat.chat.mock.calls[1][0].model).toBe("grok-4");
  });

  it("no modelConfig (failover disabled) → single attempt, legacy fallback message", async () => {
    const chat = {
      chat: jest.fn(async () => {
        throw new Error("503 service unavailable");
      }),
    };
    const store = {
      getById: jest.fn().mockResolvedValue(makeMission()),
      appendDimensions: jest.fn().mockResolvedValue([]),
    };
    const service = new LeaderChatService(
      mkPrisma() as never,
      chat as never,
      store as never,
      { emit: jest.fn().mockResolvedValue(undefined) } as never,
      { get: jest.fn().mockReturnValue(undefined) } as never,
    );

    const res = await service.send("m-1", "u-1", "hi");
    expect(chat.chat).toHaveBeenCalledTimes(1);
    // degrades to the user-facing retry message (unchanged legacy behavior)
    expect(JSON.stringify(res)).toMatch(/暂时无法回复|reply/i);
  });
});

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

  it("safeParseStoredDecision: decision with understanding string → preserved (line 112 cond-expr true-branch)", async () => {
    // Branch 12[0]: `typeof o.understanding === 'string'` is TRUE → return o.understanding
    const { service, prisma } = buildService();
    prisma.agentPlaygroundLeaderChat.findMany.mockResolvedValue([
      makeRow({
        role: "assistant",
        decision: {
          type: "DIRECT_ANSWER",
          understanding: "The user wants X",
        },
      }),
    ]);
    const result = await service.list("m-1");
    expect(result[0].decision?.understanding).toBe("The user wants X");
  });

  it("safeParseStoredDecision: decision with clarifyOptions array → preserved (line 126 cond-expr true-branch)", async () => {
    // Branch 15[0]: `Array.isArray(o.clarifyOptions)` is TRUE → filter and return
    const { service, prisma } = buildService();
    prisma.agentPlaygroundLeaderChat.findMany.mockResolvedValue([
      makeRow({
        role: "assistant",
        decision: {
          type: "CLARIFY",
          clarifyOptions: ["Option A", "Option B"],
        },
      }),
    ]);
    const result = await service.list("m-1");
    expect(result[0].decision?.clarifyOptions).toEqual([
      "Option A",
      "Option B",
    ]);
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
        operationName: "playground.leader-chat",
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

  // ★ 2026-05-25：completed mission 现在允许对话（跑完后追问报告）；CREATE_TODO 类
  //   决策由下游优雅降级（不追加 + 提示），不再在状态检查阶段硬拒 400。
  it("allows chat on completed mission and gracefully declines todo append", async () => {
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
    expect(result.assistant.content).toContain("不会自动并入本次运行");
  });

  it("does NOT append dimensions after S3 has already dispatched research", async () => {
    const { service, prisma, chat, store } = buildService();
    prisma.agentPlaygroundLeaderChat.findMany.mockResolvedValue([]);
    store.getById.mockResolvedValue(
      makeMission({ status: "running", lastCompletedStage: 3 }),
    );
    chat.chat.mockResolvedValue({
      content:
        '{"decisionType":"CREATE_TODO","response":"Added dim","todo":[{"name":"LateDim","rationale":"why"}]}',
      usage: { totalTokens: 100 },
    });
    const result = await service.send("m-1", "u-1", "add a late dimension");
    expect(store.appendDimensions).not.toHaveBeenCalled();
    expect(result.appendedDimensionIds).toBeUndefined();
    expect(result.assistant.content).toContain("不会自动并入本次运行");
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

  // ★ 全覆盖审计修 (2026-05-06): send() 现在 getById=null 时抛 BadRequestException（不再静默降级）
  it("throws BadRequestException when mission is not found", async () => {
    const { service, store } = buildService();
    store.getById.mockResolvedValue(null);
    await expect(service.send("m-1", "u-1", "hello")).rejects.toThrow(
      "mission m-1 not found",
    );
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
