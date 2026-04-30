/**
 * AgentPlaygroundController unit tests
 *
 * Tests all endpoints: listMissions, getMission, exportMission,
 * devTriggerMission, runTeam, rerunMission, rerunTodo, cancelMission,
 * deleteMission, updateMission, replay, listLeaderChat, sendLeaderChat
 */

import { BadRequestException, ForbiddenException } from "@nestjs/common";
import { AgentPlaygroundController } from "../agent-playground.controller";

function makeReq(userId?: string) {
  return { user: userId !== undefined ? { id: userId } : undefined } as never;
}

function _makeAuthReq() {
  return makeReq("user-1");
}

function makeOrchestrator() {
  return {
    runMission: jest.fn().mockResolvedValue({}),
  };
}

function makeBuffer() {
  return {
    read: jest.fn().mockReturnValue([]),
    readPersisted: jest.fn().mockResolvedValue([]),
    broadcast: jest.fn().mockResolvedValue(undefined),
  };
}

function makeOwnership() {
  return {
    assign: jest.fn(),
    getOwner: jest.fn(),
    release: jest.fn(),
  };
}

function makeStore() {
  return {
    listByUser: jest.fn().mockResolvedValue([]),
    getById: jest.fn().mockResolvedValue(null),
    markCancelled: jest.fn().mockResolvedValue(undefined),
    deleteByUser: jest.fn().mockResolvedValue(undefined),
    updateTopicByUser: jest.fn().mockResolvedValue(undefined),
    create: jest.fn().mockResolvedValue(undefined),
  };
}

function makeLeaderChat() {
  return {
    list: jest.fn().mockResolvedValue([]),
    send: jest.fn().mockResolvedValue({ user: {}, assistant: {} }),
  };
}

function makeAbortRegistry() {
  return {
    abort: jest.fn(),
    register: jest.fn().mockReturnValue(new AbortController()),
    unregister: jest.fn(),
  };
}

function makePrisma() {
  return {
    userApiKey: {
      findUnique: jest.fn().mockResolvedValue(null),
    },
  };
}

function buildController() {
  const orchestrator = makeOrchestrator();
  const buffer = makeBuffer();
  const ownership = makeOwnership();
  const store = makeStore();
  const leaderChat = makeLeaderChat();
  const abortRegistry = makeAbortRegistry();
  const prisma = makePrisma();
  const checkpoint = {
    cloneCheckpoint: jest.fn().mockResolvedValue(false),
  };

  const controller = new AgentPlaygroundController(
    orchestrator as never,
    buffer as never,
    ownership as never,
    store as never,
    leaderChat as never,
    abortRegistry as never,
    prisma as never,
    checkpoint as never,
  );

  return {
    controller,
    orchestrator,
    buffer,
    ownership,
    store,
    leaderChat,
    abortRegistry,
    prisma,
  };
}

const VALID_INPUT = {
  topic: "AI trends 2024",
  depth: "deep",
  language: "zh-CN",
};

describe("AgentPlaygroundController", () => {
  describe("listMissions", () => {
    it("throws ForbiddenException when no userId", async () => {
      const { controller } = buildController();
      await expect(controller.listMissions(makeReq(undefined))).rejects.toThrow(
        ForbiddenException,
      );
    });

    it("returns items from store", async () => {
      const { controller, store } = buildController();
      store.listByUser.mockResolvedValue([{ id: "m1" }]);
      const result = await controller.listMissions(makeReq("user-1"));
      expect(result).toEqual({ items: [{ id: "m1" }] });
    });
  });

  describe("getMission", () => {
    it("throws ForbiddenException when no userId", async () => {
      const { controller } = buildController();
      await expect(
        controller.getMission("m-1", makeReq(undefined)),
      ).rejects.toThrow(ForbiddenException);
    });

    it("throws ForbiddenException when mission not found", async () => {
      const { controller, store } = buildController();
      store.getById.mockResolvedValue(null);
      await expect(
        controller.getMission("m-1", makeReq("user-1")),
      ).rejects.toThrow(ForbiddenException);
    });

    it("returns mission when found", async () => {
      const { controller, store } = buildController();
      store.getById.mockResolvedValue({ id: "m-1", topic: "test" });
      const result = await controller.getMission("m-1", makeReq("user-1"));
      expect(result).toEqual({ mission: { id: "m-1", topic: "test" } });
    });
  });

  describe("exportMission", () => {
    it("throws ForbiddenException when no userId", async () => {
      const { controller } = buildController();
      await expect(
        controller.exportMission("m-1", "csv-facts", makeReq(undefined)),
      ).rejects.toThrow(ForbiddenException);
    });

    it("throws ForbiddenException when mission not found", async () => {
      const { controller, store } = buildController();
      store.getById.mockResolvedValue(null);
      await expect(
        controller.exportMission("m-1", "csv-facts", makeReq("user-1")),
      ).rejects.toThrow(ForbiddenException);
    });

    it("throws BadRequestException when mission has no reportFull", async () => {
      const { controller, store } = buildController();
      store.getById.mockResolvedValue({ id: "m-1", topic: "test" });
      await expect(
        controller.exportMission("m-1", "csv-facts", makeReq("user-1")),
      ).rejects.toThrow(BadRequestException);
    });

    it("exports csv-facts with correct MIME type", async () => {
      const { controller, store } = buildController();
      store.getById.mockResolvedValue({
        id: "m-1",
        topic: "AI",
        reportFull: {
          factTable: [
            { entity: "E", attribute: "A", value: "V", sources: [1, 2] },
          ],
          metadata: { topic: "AI test" },
        },
      });
      const result = await controller.exportMission(
        "m-1",
        "csv-facts",
        makeReq("user-1"),
      );
      expect(result.mimeType).toContain("text/csv");
      expect(result.filename).toMatch(/\.csv$/);
      expect(result.content).toContain("entity,attribute,value");
    });

    it("exports csv-citations with correct MIME type", async () => {
      const { controller, store } = buildController();
      store.getById.mockResolvedValue({
        id: "m-1",
        topic: "AI",
        reportFull: {
          citations: [
            {
              index: 1,
              title: "Test",
              url: "https://x.com",
              domain: "x.com",
              sourceType: "web",
              credibilityScore: 80,
              publishedAt: "2024-01-01",
            },
          ],
          metadata: {},
        },
      });
      const result = await controller.exportMission(
        "m-1",
        "csv-citations",
        makeReq("user-1"),
      );
      expect(result.mimeType).toContain("text/csv");
      expect(result.content).toContain("index,title");
    });

    it("exports markdown format", async () => {
      const { controller, store } = buildController();
      store.getById.mockResolvedValue({
        id: "m-1",
        topic: "AI test",
        reportFull: {
          content: { fullMarkdown: "# Report\n\ncontent" },
          metadata: { topic: "AI test", generatedAt: "2024-01-01" },
          citations: [],
        },
      });
      const result = await controller.exportMission(
        "m-1",
        "markdown",
        makeReq("user-1"),
      );
      expect(result.mimeType).toContain("text/markdown");
      expect(result.filename).toMatch(/\.md$/);
      expect(result.content).toContain("# Report");
    });

    it("exports json format", async () => {
      const { controller, store } = buildController();
      store.getById.mockResolvedValue({
        id: "m-1",
        topic: "AI",
        reportFull: { metadata: {}, content: {} },
      });
      const result = await controller.exportMission(
        "m-1",
        "json",
        makeReq("user-1"),
      );
      expect(result.mimeType).toContain("application/json");
      expect(result.filename).toMatch(/\.json$/);
    });

    it("throws BadRequestException for unsupported format", async () => {
      const { controller, store } = buildController();
      store.getById.mockResolvedValue({
        id: "m-1",
        reportFull: { metadata: {} },
      });
      await expect(
        controller.exportMission("m-1", "excel", makeReq("user-1")),
      ).rejects.toThrow(BadRequestException);
    });

    it("includes L4 warnings section in markdown when l4- warnings present", async () => {
      const { controller, store } = buildController();
      store.getById.mockResolvedValue({
        id: "m-1",
        topic: "AI",
        reportFull: {
          content: { fullMarkdown: "body" },
          metadata: {},
          quality: {
            warnings: [
              { dimension: "l4-blindspot", message: "Missing X" },
              { dimension: "l4-bias", message: "Confirmation bias" },
              { dimension: "l4-suggestion", message: "Add Y" },
              { dimension: "l4-critic", message: "Overall ok" },
            ],
          },
        },
      });
      const result = await controller.exportMission(
        "m-1",
        "markdown",
        makeReq("user-1"),
      );
      expect(result.content).toContain("独立审查（Critic L4）");
    });
  });

  describe("devTriggerMission", () => {
    it("throws BadRequestException when userApiKeyId is missing", async () => {
      const { controller } = buildController();
      await expect(
        controller.devTriggerMission({ userApiKeyId: "", input: {} }),
      ).rejects.toThrow(BadRequestException);
    });

    it("throws ForbiddenException when apiKey not found in DB", async () => {
      const { controller, prisma } = buildController();
      prisma.userApiKey.findUnique.mockResolvedValue(null);
      await expect(
        controller.devTriggerMission({
          userApiKeyId: "some-id",
          input: VALID_INPUT,
        }),
      ).rejects.toThrow(ForbiddenException);
    });

    it("throws BadRequestException for invalid input schema", async () => {
      const { controller, prisma } = buildController();
      prisma.userApiKey.findUnique.mockResolvedValue({ userId: "user-1" });
      await expect(
        controller.devTriggerMission({
          userApiKeyId: "some-id",
          input: { topic: "x" }, // topic < 2 chars at validation time? let's use empty
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it("returns missionId and userId for valid request", async () => {
      const { controller, prisma, orchestrator } = buildController();
      prisma.userApiKey.findUnique.mockResolvedValue({ userId: "user-42" });
      orchestrator.runMission.mockResolvedValue({});
      const result = await controller.devTriggerMission({
        userApiKeyId: "some-id",
        input: VALID_INPUT,
      });
      expect(result.missionId).toBeDefined();
      expect(result.userId).toBe("user-42");
    });
  });

  describe("runTeam", () => {
    it("throws ForbiddenException when no userId", () => {
      const { controller } = buildController();
      expect(() => controller.runTeam(VALID_INPUT, makeReq(undefined))).toThrow(
        ForbiddenException,
      );
    });

    it("throws BadRequestException for invalid input", () => {
      const { controller } = buildController();
      expect(() =>
        controller.runTeam({ topic: "" }, makeReq("user-1")),
      ).toThrow(BadRequestException);
    });

    it("returns missionId and streamNamespace for valid input", () => {
      const { controller } = buildController();
      const result = controller.runTeam(VALID_INPUT, makeReq("user-1"));
      expect(result.missionId).toBeDefined();
      expect(result.streamNamespace).toBe("agent-playground");
    });

    it("assigns ownership to the user", () => {
      const { controller, ownership } = buildController();
      controller.runTeam(VALID_INPUT, makeReq("user-1"));
      expect(ownership.assign).toHaveBeenCalledWith(
        expect.any(String),
        "user-1",
      );
    });
  });

  describe("rerunMission", () => {
    it("throws ForbiddenException when no userId", async () => {
      const { controller } = buildController();
      await expect(
        controller.rerunMission("m-1", makeReq(undefined)),
      ).rejects.toThrow(ForbiddenException);
    });

    it("throws ForbiddenException when mission not found (ownership miss + store miss)", async () => {
      const { controller, ownership, store } = buildController();
      ownership.getOwner.mockReturnValue(undefined);
      store.getById.mockResolvedValue(null);
      await expect(
        controller.rerunMission("m-1", makeReq("user-1")),
      ).rejects.toThrow(ForbiddenException);
    });

    it("returns new missionId when mission found", async () => {
      const { controller, ownership, store } = buildController();
      ownership.getOwner.mockReturnValue("user-1");
      store.getById.mockResolvedValue({
        id: "m-1",
        topic: "test",
        depth: "deep",
        language: "zh-CN",
        status: "completed",
        userProfile: null,
      });
      const result = await controller.rerunMission("m-1", makeReq("user-1"));
      expect(result.missionId).toBeDefined();
      expect(result.streamNamespace).toBe("agent-playground");
    });
  });

  describe("rerunTodo", () => {
    it("throws ForbiddenException when no userId", async () => {
      const { controller } = buildController();
      await expect(
        controller.rerunTodo("m-1", "todo-1", {}, makeReq(undefined)),
      ).rejects.toThrow(ForbiddenException);
    });

    it("throws BadRequestException when source mission is still running", async () => {
      const { controller, ownership, store } = buildController();
      ownership.getOwner.mockReturnValue("user-1");
      store.getById.mockResolvedValue({
        id: "m-1",
        topic: "test",
        depth: "deep",
        language: "zh-CN",
        status: "running",
        userProfile: null,
      });
      await expect(
        controller.rerunTodo("m-1", "todo-1", {}, makeReq("user-1")),
      ).rejects.toThrow(BadRequestException);
    });

    it("throws BadRequestException for leader-assess-abort origin", async () => {
      const { controller, ownership, store } = buildController();
      ownership.getOwner.mockReturnValue("user-1");
      store.getById.mockResolvedValue({
        id: "m-1",
        topic: "test",
        depth: "deep",
        language: "zh-CN",
        status: "completed",
        userProfile: null,
      });
      await expect(
        controller.rerunTodo(
          "m-1",
          "todo-1",
          { origin: "leader-assess-abort" },
          makeReq("user-1"),
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it("throws BadRequestException for s11-persist system stage", async () => {
      const { controller, ownership, store } = buildController();
      ownership.getOwner.mockReturnValue("user-1");
      store.getById.mockResolvedValue({
        id: "m-1",
        topic: "test",
        depth: "deep",
        language: "zh-CN",
        status: "completed",
        userProfile: null,
      });
      await expect(
        controller.rerunTodo(
          "m-1",
          "sys:s11-persist",
          { origin: "system-stage" },
          makeReq("user-1"),
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it("returns new missionId for valid rerun-todo request", async () => {
      const { controller, ownership, store, buffer } = buildController();
      ownership.getOwner.mockReturnValue("user-1");
      store.getById.mockResolvedValue({
        id: "m-1",
        topic: "test topic",
        depth: "deep",
        language: "zh-CN",
        status: "completed",
        userProfile: { depth: "deep", language: "zh-CN" },
      });
      buffer.broadcast.mockResolvedValue(undefined);
      const result = await controller.rerunTodo(
        "m-1",
        "todo-abc",
        { scope: "dimension", dimensionRef: "Finance" },
        makeReq("user-1"),
      );
      expect(result.missionId).toBeDefined();
      expect(result.streamNamespace).toBe("agent-playground");
    });
  });

  describe("cancelMission", () => {
    it("throws ForbiddenException when no userId", async () => {
      const { controller } = buildController();
      await expect(
        controller.cancelMission("m-1", makeReq(undefined)),
      ).rejects.toThrow(ForbiddenException);
    });

    it("throws ForbiddenException when mission not found", async () => {
      const { controller, ownership, store } = buildController();
      ownership.getOwner.mockReturnValue(undefined);
      store.getById.mockResolvedValue(null);
      await expect(
        controller.cancelMission("m-1", makeReq("user-1")),
      ).rejects.toThrow(ForbiddenException);
    });

    it("throws BadRequestException when mission is not running", async () => {
      const { controller, ownership, store } = buildController();
      ownership.getOwner.mockReturnValue("user-1");
      store.getById.mockResolvedValue({
        id: "m-1",
        topic: "test",
        status: "completed",
      });
      await expect(
        controller.cancelMission("m-1", makeReq("user-1")),
      ).rejects.toThrow(BadRequestException);
    });

    it("cancels running mission successfully", async () => {
      const { controller, ownership, store, abortRegistry, buffer } =
        buildController();
      ownership.getOwner.mockReturnValue("user-1");
      store.getById.mockResolvedValue({
        id: "m-1",
        topic: "test",
        status: "running",
      });
      const result = await controller.cancelMission("m-1", makeReq("user-1"));
      expect(result).toEqual({ ok: true, status: "cancelled" });
      expect(abortRegistry.abort).toHaveBeenCalledWith("m-1", "user_cancelled");
      expect(store.markCancelled).toHaveBeenCalledWith("m-1");
      expect(buffer.broadcast).toHaveBeenCalled();
    });
  });

  describe("deleteMission", () => {
    it("throws ForbiddenException when no userId", async () => {
      const { controller } = buildController();
      await expect(
        controller.deleteMission("m-1", makeReq(undefined)),
      ).rejects.toThrow(ForbiddenException);
    });

    it("throws ForbiddenException when mission not found", async () => {
      const { controller, store } = buildController();
      store.getById.mockResolvedValue(null);
      await expect(
        controller.deleteMission("m-1", makeReq("user-1")),
      ).rejects.toThrow(ForbiddenException);
    });

    it("deletes mission and returns ok", async () => {
      const { controller, store, ownership } = buildController();
      store.getById.mockResolvedValue({ id: "m-1", topic: "test" });
      const result = await controller.deleteMission("m-1", makeReq("user-1"));
      expect(result).toEqual({ ok: true });
      expect(store.deleteByUser).toHaveBeenCalledWith("m-1", "user-1");
      expect(ownership.release).toHaveBeenCalledWith("m-1");
    });
  });

  describe("updateMission", () => {
    it("throws ForbiddenException when no userId", async () => {
      const { controller } = buildController();
      await expect(
        controller.updateMission("m-1", { topic: "new" }, makeReq(undefined)),
      ).rejects.toThrow(ForbiddenException);
    });

    it("throws BadRequestException when topic is empty", async () => {
      const { controller } = buildController();
      await expect(
        controller.updateMission("m-1", { topic: "  " }, makeReq("user-1")),
      ).rejects.toThrow(BadRequestException);
    });

    it("throws BadRequestException when topic exceeds 500 chars", async () => {
      const { controller } = buildController();
      await expect(
        controller.updateMission(
          "m-1",
          { topic: "a".repeat(501) },
          makeReq("user-1"),
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it("throws ForbiddenException when mission not found", async () => {
      const { controller, store } = buildController();
      store.getById.mockResolvedValue(null);
      await expect(
        controller.updateMission(
          "m-1",
          { topic: "valid topic" },
          makeReq("user-1"),
        ),
      ).rejects.toThrow(ForbiddenException);
    });

    it("updates topic successfully", async () => {
      const { controller, store } = buildController();
      store.getById.mockResolvedValue({ id: "m-1", topic: "old" });
      const result = await controller.updateMission(
        "m-1",
        { topic: "new topic" },
        makeReq("user-1"),
      );
      expect(result).toEqual({ ok: true });
      expect(store.updateTopicByUser).toHaveBeenCalledWith(
        "m-1",
        "user-1",
        "new topic",
      );
    });
  });

  describe("replay", () => {
    it("returns in-memory events when available", async () => {
      const { controller, buffer, ownership } = buildController();
      ownership.getOwner.mockReturnValue("user-1");
      buffer.read.mockReturnValue([{ type: "evt", timestamp: 100 }]);
      const result = await controller.replay(
        "m-1",
        undefined,
        makeReq("user-1"),
      );
      expect(result.events).toHaveLength(1);
      expect(result.serverNow).toBeGreaterThan(0);
    });

    it("falls back to DB persisted events when memory empty", async () => {
      const { controller, buffer, ownership } = buildController();
      ownership.getOwner.mockReturnValue("user-1");
      buffer.read.mockReturnValue([]);
      buffer.readPersisted.mockResolvedValue([{ type: "evt", timestamp: 200 }]);
      const result = await controller.replay(
        "m-1",
        undefined,
        makeReq("user-1"),
      );
      expect(result.events).toHaveLength(1);
    });

    it("filters by sinceTs when provided", async () => {
      const { controller, buffer, ownership } = buildController();
      ownership.getOwner.mockReturnValue("user-1");
      buffer.read.mockReturnValue([]);
      buffer.readPersisted.mockResolvedValue([]);
      await controller.replay("m-1", "12345", makeReq("user-1"));
      expect(buffer.read).toHaveBeenCalledWith("m-1", 12345);
    });

    it("throws ForbiddenException when ownership rejected", async () => {
      const { controller, ownership } = buildController();
      ownership.getOwner.mockReturnValue("other-user");
      await expect(
        controller.replay("m-1", undefined, makeReq("user-1")),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe("listLeaderChat", () => {
    it("returns messages from leaderChat.list", async () => {
      const { controller, ownership, leaderChat } = buildController();
      ownership.getOwner.mockReturnValue("user-1");
      leaderChat.list.mockResolvedValue([{ id: "msg-1" }]);
      const result = await controller.listLeaderChat("m-1", makeReq("user-1"));
      expect(result).toEqual({ messages: [{ id: "msg-1" }] });
    });
  });

  describe("sendLeaderChat", () => {
    it("throws ForbiddenException when no userId", async () => {
      const { controller } = buildController();
      await expect(
        controller.sendLeaderChat(
          "m-1",
          { content: "hello" },
          makeReq(undefined),
        ),
      ).rejects.toThrow(ForbiddenException);
    });

    it("throws BadRequestException when content is empty", async () => {
      const { controller, ownership } = buildController();
      ownership.getOwner.mockReturnValue("user-1");
      await expect(
        controller.sendLeaderChat("m-1", { content: "  " }, makeReq("user-1")),
      ).rejects.toThrow(BadRequestException);
    });

    it("throws BadRequestException when content exceeds 4000 chars", async () => {
      const { controller, ownership } = buildController();
      ownership.getOwner.mockReturnValue("user-1");
      await expect(
        controller.sendLeaderChat(
          "m-1",
          { content: "a".repeat(4001) },
          makeReq("user-1"),
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it("returns user and assistant messages from leaderChat.send", async () => {
      const { controller, ownership, leaderChat } = buildController();
      ownership.getOwner.mockReturnValue("user-1");
      leaderChat.send.mockResolvedValue({
        user: { id: "u1", content: "hello" },
        assistant: { id: "a1", content: "response" },
      });
      const result = await controller.sendLeaderChat(
        "m-1",
        { content: "hello" },
        makeReq("user-1"),
      );
      expect(result.user).toBeDefined();
      expect(result.assistant).toBeDefined();
    });
  });

  describe("exportMission — additional markdown coverage", () => {
    it("includes leaderForeword with whatWeAnswered in markdown export", async () => {
      const { controller, store } = buildController();
      store.getById.mockResolvedValue({
        id: "m-1",
        topic: "AI",
        reportFull: {
          content: { fullMarkdown: "body" },
          metadata: {
            topic: "AI",
            audienceProfile: "expert",
            leaderForeword: {
              whatWeAnswered: [
                {
                  criterion: "ROI",
                  addressed: "yes",
                  evidence: "Data shows...",
                },
                {
                  criterion: "Risk",
                  addressed: "partial",
                  evidence: "Partially...",
                },
                {
                  criterion: "Unknown",
                  addressed: "no",
                  evidence: "Not found",
                },
              ],
              whatRemainsUnclear: ["Topic A", "Topic B"],
              howToRead: "Start with the executive summary",
              recommendedFollowUp: ["Deep dive on X", "Survey Y"],
            },
          },
        },
      });
      const result = await controller.exportMission(
        "m-1",
        "markdown",
        makeReq("user-1"),
      );
      expect(result.content).toContain("Foreword by Lead");
      expect(result.content).toContain("我们回答了什么");
      expect(result.content).toContain("没回答 / 证据不足");
      expect(result.content).toContain("如何阅读本报告");
      expect(result.content).toContain("建议的后续研究方向");
      expect(result.content).toContain("audienceProfile");
    });

    it("includes citations with sourceType and credibilityScore in markdown", async () => {
      const { controller, store } = buildController();
      store.getById.mockResolvedValue({
        id: "m-1",
        topic: "AI",
        reportFull: {
          content: { fullMarkdown: "content" },
          metadata: {},
          citations: [
            {
              index: 1,
              title: "Report Title",
              url: "https://example.com/report",
              domain: "example.com",
              sourceType: "academic",
              credibilityScore: 90,
              publishedAt: "2024-06-15",
            },
          ],
        },
      });
      const result = await controller.exportMission(
        "m-1",
        "markdown",
        makeReq("user-1"),
      );
      expect(result.content).toContain("参考文献");
      expect(result.content).toContain("academic");
      expect(result.content).toContain("可信度 90/100");
    });

    it("includes reconciliation report in markdown export", async () => {
      const { controller, store } = buildController();
      store.getById.mockResolvedValue({
        id: "m-1",
        topic: "AI",
        reportFull: {
          content: { fullMarkdown: "body" },
          metadata: {},
        },
        reconciliationReport: {
          reconciliationReport: "Full reconciliation text here",
          deduplicationStats: {
            duplicatesRemoved: 5,
            termVariantsUnified: 3,
            dataInconsistenciesFlagged: 1,
          },
          termGlossary: [
            { canonical: "AI", variants: ["Artificial Intelligence", "A.I."] },
          ],
        },
      });
      const result = await controller.exportMission(
        "m-1",
        "markdown",
        makeReq("user-1"),
      );
      expect(result.content).toContain("附录：对账总览");
      expect(result.content).toContain("去重统计");
      expect(result.content).toContain("术语对照表");
      expect(result.content).toContain("Full reconciliation text");
    });

    it("markdown export with no metadata does not include frontmatter", async () => {
      const { controller, store } = buildController();
      store.getById.mockResolvedValue({
        id: "m-1",
        topic: "AI",
        reportFull: {
          content: { fullMarkdown: "minimal content" },
        },
      });
      const result = await controller.exportMission(
        "m-1",
        "markdown",
        makeReq("user-1"),
      );
      expect(result.content).not.toContain("---\n\ntopic:");
      expect(result.content).toContain("minimal content");
    });
  });

  describe("rerunMission — ownership fallback path", () => {
    it("re-registers ownership when found only in DB (railway recycle scenario)", async () => {
      const { controller, ownership, store } = buildController();
      // ownership cache miss
      ownership.getOwner.mockReturnValue(undefined);
      // DB hit (assertOwnership fallback)
      store.getById
        .mockResolvedValueOnce({ id: "m-1", topic: "test", userId: "user-1" }) // assertOwnership
        .mockResolvedValueOnce({
          id: "m-1",
          topic: "test",
          depth: "deep",
          language: "zh-CN",
          status: "completed",
          userProfile: null,
        }); // rerunMission body
      const result = await controller.rerunMission("m-1", makeReq("user-1"));
      expect(result.missionId).toBeDefined();
      // ownership.assign should have been called for re-registration + new mission
      expect(ownership.assign).toHaveBeenCalled();
    });
  });

  describe("rerunTodo — scope branches", () => {
    async function setupRerunTodo(overrides: Record<string, unknown> = {}) {
      const { controller, ownership, store, buffer } = buildController();
      ownership.getOwner.mockReturnValue("user-1");
      store.getById.mockResolvedValue({
        id: "m-1",
        topic: "test topic",
        depth: "deep",
        language: "zh-CN",
        status: "completed",
        userProfile: { depth: "deep", language: "zh-CN" },
        ...overrides,
      });
      buffer.broadcast.mockResolvedValue(undefined);
      return { controller, ownership, store, buffer };
    }

    it("scope=chapter adds chapter hint to topic", async () => {
      const { controller } = await setupRerunTodo();
      const result = await controller.rerunTodo(
        "m-1",
        "todo-1",
        { scope: "chapter", dimensionRef: "Finance", chapterIndex: 0 },
        makeReq("user-1"),
      );
      expect(result.missionId).toBeDefined();
    });

    it("scope=review adds review hint", async () => {
      const { controller } = await setupRerunTodo();
      const result = await controller.rerunTodo(
        "m-1",
        "todo-review",
        { scope: "review", todoTitle: "Fix citation" },
        makeReq("user-1"),
      );
      expect(result.missionId).toBeDefined();
    });

    it("scope=system adds system hint", async () => {
      const { controller } = await setupRerunTodo();
      const result = await controller.rerunTodo(
        "m-1",
        "todo-sys",
        { scope: "system", todoTitle: "Redo writer" },
        makeReq("user-1"),
      );
      expect(result.missionId).toBeDefined();
    });

    it("reasonText appended to hint lines when provided", async () => {
      const { controller } = await setupRerunTodo();
      // Should not throw - reasonText is purely additive
      const result = await controller.rerunTodo(
        "m-1",
        "todo-1",
        {
          scope: "dimension",
          dimensionRef: "Tech",
          reasonText: "More depth needed",
        },
        makeReq("user-1"),
      );
      expect(result.missionId).toBeDefined();
    });
  });

  describe("ownership — DB fallback registers in-memory", () => {
    it("assertOwnership DB fallback calls ownership.assign for future hot path", async () => {
      const { controller, ownership, store } = buildController();
      ownership.getOwner.mockReturnValue(undefined); // cache miss
      store.getById.mockResolvedValue({ id: "m-1", topic: "test" }); // DB hit
      // replay uses assertOwnership
      const result = await controller.replay(
        "m-1",
        undefined,
        makeReq("user-1"),
      );
      expect(result.events).toBeDefined();
      expect(ownership.assign).toHaveBeenCalledWith("m-1", "user-1");
    });
  });
});
