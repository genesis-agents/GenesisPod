import { Logger } from "@nestjs/common";
import { AiWritingGateway } from "../ai-writing.gateway";

describe("AiWritingGateway", () => {
  let gateway: AiWritingGateway;
  let eventEmitter: { registerEmitHandler: jest.Mock };
  let server: {
    in: jest.Mock;
    to: jest.Mock;
  };
  let toRoom: { emit: jest.Mock };
  let inRoom: { fetchSockets: jest.Mock };

  beforeEach(() => {
    jest.spyOn(Logger.prototype, "log").mockImplementation();
    jest.spyOn(Logger.prototype, "error").mockImplementation();
    jest.spyOn(Logger.prototype, "debug").mockImplementation();

    eventEmitter = { registerEmitHandler: jest.fn() };
    toRoom = { emit: jest.fn() };
    inRoom = { fetchSockets: jest.fn() };
    server = {
      in: jest.fn().mockReturnValue(inRoom),
      to: jest.fn().mockReturnValue(toRoom),
    };

    gateway = new AiWritingGateway(eventEmitter as never);
    (gateway as unknown as { server: typeof server }).server = server;
  });

  it("afterInit registers emit handler that delegates to emitToProject", () => {
    gateway.afterInit();
    expect(eventEmitter.registerEmitHandler).toHaveBeenCalledWith(
      expect.any(Function),
    );

    // Trigger registered handler
    inRoom.fetchSockets.mockResolvedValue([{ id: "s1" }]);
    const handler = eventEmitter.registerEmitHandler.mock.calls[0][0];
    return handler("p1", "ev", { x: 1 }).then(() => {
      expect(server.to).toHaveBeenCalledWith("writing:p1");
      expect(toRoom.emit).toHaveBeenCalledWith("ev", { x: 1 });
    });
  });

  it("handleConnection logs the client id", () => {
    gateway.handleConnection({ id: "c1" } as never);
  });

  it("handleDisconnect logs the client id", () => {
    gateway.handleDisconnect({ id: "c1" } as never);
  });

  describe("handleJoinProject", () => {
    it("joins room writing:<projectId>", async () => {
      const client = { id: "c1", join: jest.fn().mockResolvedValue(undefined) };
      const result = await gateway.handleJoinProject(client as never, {
        projectId: "p1",
      });
      expect(client.join).toHaveBeenCalledWith("writing:p1");
      expect(result).toEqual({ success: true, room: "writing:p1" });
    });

    it("emits error and returns failure on exception", async () => {
      const client = {
        id: "c1",
        join: jest.fn().mockRejectedValue(new Error("oops")),
        emit: jest.fn(),
      };
      const result = await gateway.handleJoinProject(client as never, {
        projectId: "p1",
      });
      expect(result).toEqual({ success: false });
      expect(client.emit).toHaveBeenCalledWith("error", {
        message: "Operation failed",
      });
    });
  });

  describe("handleLeaveProject", () => {
    it("leaves room writing:<projectId>", async () => {
      const client = {
        id: "c1",
        leave: jest.fn().mockResolvedValue(undefined),
      };
      const result = await gateway.handleLeaveProject(client as never, {
        projectId: "p1",
      });
      expect(client.leave).toHaveBeenCalledWith("writing:p1");
      expect(result).toEqual({ success: true });
    });

    it("emits error and returns failure on exception", async () => {
      const client = {
        id: "c1",
        leave: jest.fn().mockRejectedValue(new Error("oops")),
        emit: jest.fn(),
      };
      const result = await gateway.handleLeaveProject(client as never, {
        projectId: "p1",
      });
      expect(result).toEqual({ success: false });
      expect(client.emit).toHaveBeenCalledWith("error", {
        message: "Operation failed",
      });
    });
  });

  describe("emitToProject", () => {
    it("emits when room has sockets", async () => {
      inRoom.fetchSockets.mockResolvedValue([{ id: "s1" }, { id: "s2" }]);
      await gateway.emitToProject("p1", "ev", { value: 1 });
      expect(server.to).toHaveBeenCalledWith("writing:p1");
      expect(toRoom.emit).toHaveBeenCalledWith("ev", { value: 1 });
    });

    it("does not emit when room is empty", async () => {
      inRoom.fetchSockets.mockResolvedValue([]);
      await gateway.emitToProject("p1", "ev", { value: 1 });
      expect(toRoom.emit).not.toHaveBeenCalled();
    });
  });
});
