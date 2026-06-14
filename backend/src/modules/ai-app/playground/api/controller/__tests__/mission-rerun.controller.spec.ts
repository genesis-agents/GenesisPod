/**
 * MissionRerunController — unit tests
 *
 * Covers every handler (happy path + guard/error branches):
 *   - rerunMission (no userId, assertOwnership miss, success fresh/incremental)
 *   - rerunTodo (no userId, assertOwnership miss, success)
 *   - localRerunTodo (no userId, assertOwnership miss, success with body mapping)
 *   - sendLeaderChat (no userId, empty content, content > 4000 chars, success)
 */

import {
  BadRequestException,
  ForbiddenException,
  Logger,
} from "@nestjs/common";
import { MissionRerunController } from "../mission-rerun.controller";

beforeAll(() => {
  jest.spyOn(Logger.prototype, "log").mockImplementation(() => {});
  jest.spyOn(Logger.prototype, "warn").mockImplementation(() => {});
  jest.spyOn(Logger.prototype, "error").mockImplementation(() => {});
});

// ── helpers ──────────────────────────────────────────────────────────────────

function makeOwnership(ownerId: string | null = "u1") {
  return {
    getOwner: jest.fn().mockReturnValue(ownerId),
    assign: jest.fn(),
    release: jest.fn(),
  };
}

function makeStore(mission: Record<string, unknown> | null = { id: "m1" }) {
  return {
    getById: jest.fn().mockResolvedValue(mission),
    getAccessMetaById: jest.fn().mockResolvedValue(null),
  };
}

function makeBuffer() {
  return { broadcast: jest.fn().mockResolvedValue(undefined) };
}

function makeLeaderChat() {
  return {
    send: jest.fn().mockResolvedValue({
      user: { content: "hi" },
      assistant: { content: "hello" },
    }),
  };
}

function makeLocalRerun() {
  return {
    run: jest.fn().mockResolvedValue({
      ok: true,
      missionId: "m1",
      scope: "dimension",
      durationMs: 123,
    }),
  };
}

function makeRerunOrchestrator() {
  return {
    rerunFullMission: jest
      .fn()
      .mockResolvedValue({ missionId: "m2", streamNamespace: "playground" }),
    rerunFromTodo: jest
      .fn()
      .mockResolvedValue({ missionId: "m3", streamNamespace: "playground" }),
  };
}

function makeController(
  overrides: {
    ownership?: ReturnType<typeof makeOwnership>;
    store?: ReturnType<typeof makeStore>;
    buffer?: ReturnType<typeof makeBuffer>;
    leaderChat?: ReturnType<typeof makeLeaderChat>;
    localRerun?: ReturnType<typeof makeLocalRerun>;
    rerunOrchestrator?: ReturnType<typeof makeRerunOrchestrator>;
  } = {},
) {
  return new MissionRerunController(
    (overrides.ownership ?? makeOwnership()) as never,
    (overrides.store ?? makeStore()) as never,
    (overrides.buffer ?? makeBuffer()) as never,
    (overrides.leaderChat ?? makeLeaderChat()) as never,
    (overrides.localRerun ?? makeLocalRerun()) as never,
    (overrides.rerunOrchestrator ?? makeRerunOrchestrator()) as never,
  );
}

function makeReq(userId?: string) {
  return { user: userId ? { id: userId } : undefined } as never;
}

// ── rerunMission ─────────────────────────────────────────────────────────────

describe("rerunMission", () => {
  it("throws ForbiddenException when no userId", async () => {
    const ctrl = makeController();
    await expect(
      ctrl.rerunMission("m1", undefined, makeReq()),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it("throws ForbiddenException when ownership fails (DB miss)", async () => {
    const ownership = makeOwnership(null);
    const store = makeStore(null);
    const ctrl = makeController({ ownership, store });
    await expect(
      ctrl.rerunMission("m1", undefined, makeReq("u1")),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it("defaults to incremental mode when mode is undefined", async () => {
    const orchestrator = makeRerunOrchestrator();
    const ctrl = makeController({ rerunOrchestrator: orchestrator });
    await ctrl.rerunMission("m1", undefined, makeReq("u1"));
    expect(orchestrator.rerunFullMission).toHaveBeenCalledWith(
      "m1",
      "u1",
      "incremental",
    );
  });

  it("uses fresh mode when mode='fresh'", async () => {
    const orchestrator = makeRerunOrchestrator();
    const ctrl = makeController({ rerunOrchestrator: orchestrator });
    await ctrl.rerunMission("m1", "fresh", makeReq("u1"));
    expect(orchestrator.rerunFullMission).toHaveBeenCalledWith(
      "m1",
      "u1",
      "fresh",
    );
  });

  it("uses incremental mode when mode is any other string", async () => {
    const orchestrator = makeRerunOrchestrator();
    const ctrl = makeController({ rerunOrchestrator: orchestrator });
    await ctrl.rerunMission("m1", "other-mode", makeReq("u1"));
    expect(orchestrator.rerunFullMission).toHaveBeenCalledWith(
      "m1",
      "u1",
      "incremental",
    );
  });

  it("returns orchestrator result", async () => {
    const orchestrator = makeRerunOrchestrator();
    orchestrator.rerunFullMission.mockResolvedValue({
      missionId: "new-m",
      streamNamespace: "playground",
    });
    const ctrl = makeController({ rerunOrchestrator: orchestrator });
    const result = await ctrl.rerunMission("m1", "incremental", makeReq("u1"));
    expect(result).toEqual({
      missionId: "new-m",
      streamNamespace: "playground",
    });
  });
});

// ── rerunTodo ─────────────────────────────────────────────────────────────────

describe("rerunTodo", () => {
  it("throws ForbiddenException when no userId", async () => {
    const ctrl = makeController();
    await expect(
      ctrl.rerunTodo("m1", "todo1", {}, makeReq()),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it("throws ForbiddenException when ownership DB miss", async () => {
    const ownership = makeOwnership(null);
    const store = makeStore(null);
    const ctrl = makeController({ ownership, store });
    await expect(
      ctrl.rerunTodo("m1", "todo1", {}, makeReq("u1")),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it("delegates to orchestrator.rerunFromTodo with correct args", async () => {
    const orchestrator = makeRerunOrchestrator();
    const ctrl = makeController({ rerunOrchestrator: orchestrator });
    const body = {
      origin: "manual",
      scope: "dimension" as const,
      dimensionRef: "dim-A",
      chapterIndex: 2,
      todoTitle: "Fix dim A",
      reasonText: "Insufficient coverage",
    };
    await ctrl.rerunTodo("m1", "todo1", body, makeReq("u1"));
    expect(orchestrator.rerunFromTodo).toHaveBeenCalledWith({
      sourceMissionId: "m1",
      userId: "u1",
      todoId: "todo1",
      body,
    });
  });

  it("returns orchestrator result", async () => {
    const orchestrator = makeRerunOrchestrator();
    orchestrator.rerunFromTodo.mockResolvedValue({
      missionId: "m-new",
      streamNamespace: "playground",
    });
    const ctrl = makeController({ rerunOrchestrator: orchestrator });
    const result = await ctrl.rerunTodo("m1", "todo1", {}, makeReq("u1"));
    expect(result).toEqual({
      missionId: "m-new",
      streamNamespace: "playground",
    });
  });
});

// ── localRerunTodo ────────────────────────────────────────────────────────────

describe("localRerunTodo", () => {
  it("throws ForbiddenException when no userId", async () => {
    const ctrl = makeController();
    await expect(
      ctrl.localRerunTodo("m1", "todo1", {}, makeReq()),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it("throws ForbiddenException when ownership DB miss", async () => {
    const ownership = makeOwnership(null);
    const store = makeStore(null);
    const ctrl = makeController({ ownership, store });
    await expect(
      ctrl.localRerunTodo("m1", "todo1", {}, makeReq("u1")),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it("calls localRerun.run with correctly mapped body and emit fn", async () => {
    const localRerun = makeLocalRerun();
    const buffer = makeBuffer();
    const ctrl = makeController({ localRerun, buffer });
    const body = {
      origin: "  manual  ",
      scope: "chapter" as const,
      dimensionRef: "  dim-B  ",
      chapterIndex: 3,
      todoTitle: "  Fix chapter  ",
      reasonText: "  Too short  ",
      stepId: "  s8-writer  ",
    };
    await ctrl.localRerunTodo("m1", "todo1", body, makeReq("u1"));
    const callArgs = localRerun.run.mock.calls[0][0];
    expect(callArgs.missionId).toBe("m1");
    expect(callArgs.userId).toBe("u1");
    expect(callArgs.todoId).toBe("todo1");
    expect(callArgs.origin).toBe("manual");
    expect(callArgs.scope).toBe("chapter");
    expect(callArgs.dimensionRef).toBe("dim-B");
    expect(callArgs.chapterIndex).toBe(3);
    expect(callArgs.todoTitle).toBe("Fix chapter");
    expect(callArgs.reasonText).toBe("Too short");
    expect(callArgs.stepId).toBe("s8-writer");
  });

  it("emit fn forwards to buffer.broadcast with correct shape", async () => {
    const localRerun = makeLocalRerun();
    const buffer = makeBuffer();
    localRerun.run.mockImplementation(
      async (
        _input: unknown,
        emit: (args: {
          type: string;
          missionId: string;
          userId: string;
          payload: Record<string, unknown>;
        }) => Promise<void>,
      ) => {
        await emit({
          type: "playground.mission:rerun-started",
          missionId: "m1",
          userId: "u1",
          payload: { todoId: "t1" },
        });
        return {
          ok: true,
          missionId: "m1",
          scope: "dimension",
          durationMs: 50,
        };
      },
    );
    const ctrl = makeController({ localRerun, buffer });
    await ctrl.localRerunTodo("m1", "todo1", {}, makeReq("u1"));
    expect(buffer.broadcast).toHaveBeenCalledWith(
      expect.objectContaining({ type: "playground.mission:rerun-started" }),
    );
  });

  it("handles undefined optional body fields gracefully", async () => {
    const localRerun = makeLocalRerun();
    const ctrl = makeController({ localRerun });
    await ctrl.localRerunTodo(
      "m1",
      "todo1",
      {
        // no dimensionRef, todoTitle, reasonText, stepId
        origin: "auto",
        scope: "mission" as const,
      },
      makeReq("u1"),
    );
    const callArgs = localRerun.run.mock.calls[0][0];
    expect(callArgs.dimensionRef).toBeUndefined();
    expect(callArgs.todoTitle).toBeUndefined();
    expect(callArgs.reasonText).toBeUndefined();
    expect(callArgs.stepId).toBeUndefined();
  });

  it("returns localRerun.run result", async () => {
    const localRerun = makeLocalRerun();
    localRerun.run.mockResolvedValue({
      ok: true,
      missionId: "m1",
      scope: "dimension",
      durationMs: 999,
      cascade: { completed: ["s8-writer"], abortedAt: undefined },
    });
    const ctrl = makeController({ localRerun });
    const result = await ctrl.localRerunTodo("m1", "todo1", {}, makeReq("u1"));
    expect(result.durationMs).toBe(999);
    expect(result.ok).toBe(true);
  });
});

// ── sendLeaderChat ────────────────────────────────────────────────────────────

describe("sendLeaderChat", () => {
  it("throws ForbiddenException when no userId", async () => {
    const ctrl = makeController();
    await expect(
      ctrl.sendLeaderChat("m1", { content: "hello" }, makeReq()),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it("throws ForbiddenException when ownership DB miss", async () => {
    const ownership = makeOwnership(null);
    const store = makeStore(null);
    const ctrl = makeController({ ownership, store });
    await expect(
      ctrl.sendLeaderChat("m1", { content: "hello" }, makeReq("u1")),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it("throws BadRequestException for empty content (after trim)", async () => {
    const ctrl = makeController();
    await expect(
      ctrl.sendLeaderChat("m1", { content: "   " }, makeReq("u1")),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it("throws BadRequestException for undefined content", async () => {
    const ctrl = makeController();
    await expect(
      ctrl.sendLeaderChat("m1", {}, makeReq("u1")),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it("throws BadRequestException when content exceeds 4000 chars", async () => {
    const ctrl = makeController();
    await expect(
      ctrl.sendLeaderChat("m1", { content: "x".repeat(4001) }, makeReq("u1")),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it("delegates to leaderChat.send with trimmed content and returns result", async () => {
    const leaderChat = makeLeaderChat();
    leaderChat.send.mockResolvedValue({
      user: { content: "  hello  " },
      assistant: { content: "world" },
    });
    const ctrl = makeController({ leaderChat });
    const result = await ctrl.sendLeaderChat(
      "m1",
      { content: "  hello world  " },
      makeReq("u1"),
    );
    expect(leaderChat.send).toHaveBeenCalledWith("m1", "u1", "hello world");
    expect(result).toHaveProperty("user");
    expect(result).toHaveProperty("assistant");
  });
});
