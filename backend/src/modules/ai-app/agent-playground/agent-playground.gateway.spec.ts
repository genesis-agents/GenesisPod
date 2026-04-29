/**
 * AgentPlaygroundGateway unit tests
 *
 * Tests: afterInit adapter registration, handleJoin, handleLeave, extractUserId
 */

import { UnauthorizedException } from "@nestjs/common";
import { AgentPlaygroundGateway } from "./agent-playground.gateway";
import { SocketBroadcastAdapter } from "./adapters/socket-broadcast.adapter";

jest.mock("./adapters/socket-broadcast.adapter");

function makeMockEventBus() {
  return {
    registerAdapter: jest.fn(),
    emit: jest.fn().mockResolvedValue(undefined),
  };
}

function makeMockOwnership() {
  return {
    assign: jest.fn(),
    getOwner: jest.fn(),
    release: jest.fn(),
  };
}

function makeMockStore() {
  return {
    getById: jest.fn().mockResolvedValue(null),
  };
}

function makeMockJwt(
  payload: Record<string, unknown> | null = { sub: "user-1" },
) {
  return {
    verify: jest.fn().mockImplementation(() => {
      if (payload === null) throw new Error("invalid token");
      return payload;
    }),
  };
}

function makeMockSocket(
  auth: Record<string, unknown> = { token: "valid-token" },
) {
  return {
    id: "socket-id-1",
    handshake: { auth },
    join: jest.fn().mockResolvedValue(undefined),
    leave: jest.fn().mockResolvedValue(undefined),
  };
}

describe("AgentPlaygroundGateway", () => {
  let gateway: AgentPlaygroundGateway;
  let eventBus: ReturnType<typeof makeMockEventBus>;
  let ownership: ReturnType<typeof makeMockOwnership>;
  let jwt: ReturnType<typeof makeMockJwt>;
  let store: ReturnType<typeof makeMockStore>;
  let mockIo: { to: jest.Mock };

  beforeEach(() => {
    eventBus = makeMockEventBus();
    ownership = makeMockOwnership();
    jwt = makeMockJwt();
    store = makeMockStore();
    gateway = new AgentPlaygroundGateway(
      eventBus as never,
      ownership as never,
      jwt as never,
      store as never,
    );
    mockIo = { to: jest.fn().mockReturnValue({ emit: jest.fn() }) };
    // inject io server
    (gateway as unknown as { io: unknown }).io = mockIo;
  });

  describe("afterInit", () => {
    it("registers SocketBroadcastAdapter on the eventBus", () => {
      gateway.afterInit();
      expect(eventBus.registerAdapter).toHaveBeenCalledTimes(1);
      expect(eventBus.registerAdapter).toHaveBeenCalledWith(
        expect.any(SocketBroadcastAdapter),
      );
    });

    it("passes the io server to SocketBroadcastAdapter constructor", () => {
      const MockAdapter = SocketBroadcastAdapter as jest.MockedClass<
        typeof SocketBroadcastAdapter
      >;
      MockAdapter.mockClear();
      gateway.afterInit();
      expect(MockAdapter).toHaveBeenCalledWith(mockIo);
    });
  });

  describe("handleJoin", () => {
    it("returns error when missionId is missing", async () => {
      const socket = makeMockSocket();
      const result = await gateway.handleJoin(socket as never, {
        missionId: "",
      });
      expect(result.ok).toBe(false);
      expect(result.error).toBe("missionId required");
    });

    it("returns error when payload is null-ish", async () => {
      const socket = makeMockSocket();
      const result = await gateway.handleJoin(
        socket as never,
        null as unknown as { missionId: string },
      );
      expect(result.ok).toBe(false);
    });

    it("returns auth error when token is missing", async () => {
      const socket = makeMockSocket({});
      const result = await gateway.handleJoin(socket as never, {
        missionId: "m-1",
      });
      expect(result.ok).toBe(false);
      expect(result.error).toContain("auth");
    });

    it("returns auth error when JWT is invalid", async () => {
      jwt.verify.mockImplementation(() => {
        throw new UnauthorizedException("bad token");
      });
      const socket = makeMockSocket({ token: "bad" });
      const result = await gateway.handleJoin(socket as never, {
        missionId: "m-1",
      });
      expect(result.ok).toBe(false);
      expect(result.error).toBeDefined();
    });

    it("returns mission not found when ownership registry returns no owner", async () => {
      ownership.getOwner.mockReturnValue(undefined);
      const socket = makeMockSocket({ token: "valid" });
      const result = await gateway.handleJoin(socket as never, {
        missionId: "m-1",
      });
      expect(result.ok).toBe(false);
      expect(result.error).toBe("mission not found");
    });

    it("returns forbidden when owner does not match userId", async () => {
      ownership.getOwner.mockReturnValue("other-user");
      jwt.verify.mockReturnValue({ sub: "user-1" });
      const socket = makeMockSocket({ token: "valid" });
      const result = await gateway.handleJoin(socket as never, {
        missionId: "m-1",
      });
      expect(result.ok).toBe(false);
      expect(result.error).toBe("forbidden");
    });

    it("joins room and returns ok when ownership matches", async () => {
      ownership.getOwner.mockReturnValue("user-1");
      jwt.verify.mockReturnValue({ sub: "user-1" });
      const socket = makeMockSocket({ token: "valid" });
      const result = await gateway.handleJoin(socket as never, {
        missionId: "m-abc",
      });
      expect(result.ok).toBe(true);
      expect(socket.join).toHaveBeenCalledWith("playground:m-abc");
    });

    it("extracts userId from Authorization Bearer header", async () => {
      ownership.getOwner.mockReturnValue("user-2");
      jwt.verify.mockReturnValue({ sub: "user-2" });
      const socket = makeMockSocket({
        Authorization: "Bearer my-token",
      });
      const result = await gateway.handleJoin(socket as never, {
        missionId: "m-1",
      });
      expect(result.ok).toBe(true);
      expect(jwt.verify).toHaveBeenCalledWith("my-token");
    });

    it("extracts userId from id field in JWT payload when sub missing", async () => {
      ownership.getOwner.mockReturnValue("user-from-id");
      jwt.verify.mockReturnValue({ id: "user-from-id" });
      const socket = makeMockSocket({ token: "valid" });
      const result = await gateway.handleJoin(socket as never, {
        missionId: "m-1",
      });
      expect(result.ok).toBe(true);
    });

    it("extracts userId from userId field in JWT payload when sub and id missing", async () => {
      ownership.getOwner.mockReturnValue("user-from-userId");
      jwt.verify.mockReturnValue({ userId: "user-from-userId" });
      const socket = makeMockSocket({ token: "valid" });
      const result = await gateway.handleJoin(socket as never, {
        missionId: "m-1",
      });
      expect(result.ok).toBe(true);
    });

    it("returns error when JWT has no user fields", async () => {
      jwt.verify.mockReturnValue({});
      const socket = makeMockSocket({ token: "valid" });
      const result = await gateway.handleJoin(socket as never, {
        missionId: "m-1",
      });
      expect(result.ok).toBe(false);
      expect(result.error).toContain("no user");
    });
  });

  describe("handleLeave", () => {
    it("returns ok=false when missionId is missing", async () => {
      const socket = makeMockSocket();
      const result = await gateway.handleLeave(socket as never, {
        missionId: "",
      });
      expect(result.ok).toBe(false);
    });

    it("calls socket.leave with correct room name", async () => {
      const socket = makeMockSocket();
      const result = await gateway.handleLeave(socket as never, {
        missionId: "m-xyz",
      });
      expect(result.ok).toBe(true);
      expect(socket.leave).toHaveBeenCalledWith("playground:m-xyz");
    });

    it("returns ok when missionId provided", async () => {
      const socket = makeMockSocket();
      const result = await gateway.handleLeave(socket as never, {
        missionId: "some-id",
      });
      expect(result.ok).toBe(true);
    });
  });
});
