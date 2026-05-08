import { Test } from "@nestjs/testing";
import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from "@nestjs/common";
import {
  AskRoomMemberType,
  AskRoomMode,
  AskSessionMode,
  AskTurnStatus,
} from "@prisma/client";
import { PrismaService } from "@/common/prisma/prisma.service";
import { AskRoomService } from "../../ai-ask-room.service";

function makePrismaMock() {
  return {
    askSession: {
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    askRoomMember: {
      create: jest.fn(),
      findFirst: jest.fn(),
      findMany: jest.fn(),
      update: jest.fn(),
      count: jest.fn(),
    },
    askRoomTurn: {
      create: jest.fn(),
      findFirst: jest.fn(),
      findMany: jest.fn(),
      update: jest.fn(),
    },
    askMessage: {
      create: jest.fn(),
      aggregate: jest.fn(),
    },
    $transaction: jest.fn(),
  };
}

type PrismaMock = ReturnType<typeof makePrismaMock>;

describe("AskRoomService", () => {
  let service: AskRoomService;
  let prisma: PrismaMock;

  beforeEach(async () => {
    prisma = makePrismaMock();
    prisma.$transaction.mockImplementation((cb: unknown) => {
      if (typeof cb === "function") {
        return Promise.resolve((cb as (tx: PrismaMock) => unknown)(prisma));
      }
      return Promise.resolve(cb);
    });
    const module = await Test.createTestingModule({
      providers: [AskRoomService, { provide: PrismaService, useValue: prisma }],
    }).compile();
    service = module.get(AskRoomService);
  });

  describe("createRoom (fresh)", () => {
    it("creates ROOM session with initial members", async () => {
      prisma.askSession.create.mockResolvedValue({
        id: "s-1",
        userId: "u-1",
        mode: AskSessionMode.ROOM,
      });
      prisma.askRoomMember.create.mockResolvedValue({});

      await service.createRoom("u-1", {
        title: "Team",
        initialMembers: [
          {
            memberType: AskRoomMemberType.VIRTUAL,
            modelId: "model-x",
            displayName: "A",
          },
        ],
      });

      expect(prisma.askSession.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            userId: "u-1",
            title: "Team",
            mode: AskSessionMode.ROOM,
          }),
        }),
      );
      expect(prisma.askRoomMember.create).toHaveBeenCalledTimes(1);
    });

    it("rejects REGISTERED member without agentId", async () => {
      await expect(
        service.createRoom("u-1", {
          initialMembers: [
            {
              memberType: AskRoomMemberType.REGISTERED,
              modelId: "model-x",
              displayName: "A",
            },
          ],
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe("createRoom (upgrade)", () => {
    it("upgrades a SOLO session to ROOM", async () => {
      prisma.askSession.findFirst.mockResolvedValue({
        id: "s-1",
        userId: "u-1",
        mode: AskSessionMode.SOLO,
      });
      prisma.askSession.update.mockResolvedValue({
        id: "s-1",
        mode: AskSessionMode.ROOM,
      });

      const result = await service.createRoom("u-1", {
        fromSessionId: "s-1",
      });
      expect(prisma.askSession.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: "s-1" },
          data: expect.objectContaining({ mode: AskSessionMode.ROOM }),
        }),
      );
      expect(result.mode).toBe(AskSessionMode.ROOM);
    });

    it("rejects upgrading a session that is already ROOM", async () => {
      prisma.askSession.findFirst.mockResolvedValue({
        id: "s-1",
        userId: "u-1",
        mode: AskSessionMode.ROOM,
      });
      await expect(
        service.createRoom("u-1", { fromSessionId: "s-1" }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it("rejects upgrading a session that does not belong to user", async () => {
      prisma.askSession.findFirst.mockResolvedValue(null);
      await expect(
        service.createRoom("u-1", { fromSessionId: "s-1" }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe("findUserRoom", () => {
    it("rejects non-ROOM session", async () => {
      prisma.askSession.findFirst.mockResolvedValue({
        id: "s-1",
        userId: "u-1",
        mode: AskSessionMode.SOLO,
      });
      await expect(service.findUserRoom("s-1", "u-1")).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    it("rejects session of another user", async () => {
      prisma.askSession.findFirst.mockResolvedValue({
        id: "s-1",
        userId: "u-2",
        mode: AskSessionMode.ROOM,
      });
      await expect(service.findUserRoom("s-1", "u-1")).rejects.toBeInstanceOf(
        ForbiddenException,
      );
    });
  });

  describe("addMember", () => {
    beforeEach(() => {
      prisma.askSession.findFirst.mockResolvedValue({
        id: "s-1",
        userId: "u-1",
        mode: AskSessionMode.ROOM,
      });
      prisma.askSession.findUnique.mockResolvedValue({
        id: "s-1",
        userId: "u-1",
        mode: AskSessionMode.ROOM,
        roomConfig: { maxParticipants: 8 },
      });
    });

    it("rejects when room is at max capacity", async () => {
      prisma.askRoomMember.count.mockResolvedValue(8);
      await expect(
        service.addMember("s-1", "u-1", {
          memberType: AskRoomMemberType.VIRTUAL,
          modelId: "model-x",
          displayName: "X",
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it("creates VIRTUAL member with agentId stripped", async () => {
      prisma.askRoomMember.count.mockResolvedValue(0);
      prisma.askRoomMember.create.mockResolvedValue({ id: "m-x" });

      await service.addMember("s-1", "u-1", {
        memberType: AskRoomMemberType.VIRTUAL,
        agentId: "should-be-ignored",
        modelId: "model-x",
        displayName: "X",
      });

      expect(prisma.askRoomMember.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            memberType: AskRoomMemberType.VIRTUAL,
            agentId: null,
          }),
        }),
      );
    });
  });

  describe("removeMember (soft-delete)", () => {
    it("sets deletedAt + enabled=false instead of physical delete", async () => {
      prisma.askSession.findFirst.mockResolvedValue({
        id: "s-1",
        userId: "u-1",
        mode: AskSessionMode.ROOM,
      });
      prisma.askRoomMember.findFirst.mockResolvedValue({
        id: "m-1",
        sessionId: "s-1",
      });
      await service.removeMember("s-1", "m-1", "u-1");
      expect(prisma.askRoomMember.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: "m-1" },
          data: expect.objectContaining({
            enabled: false,
            deletedAt: expect.any(Date),
          }),
        }),
      );
    });
  });

  describe("appendUserMessage", () => {
    it("uses next sequenceNum starting from 1 when room is empty", async () => {
      prisma.askMessage.aggregate.mockResolvedValue({
        _max: { sequenceNum: null },
      });
      prisma.askMessage.create.mockResolvedValue({ id: "m" });

      await service.appendUserMessage("s-1", "hi", []);
      expect(prisma.askMessage.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ sequenceNum: 1 }),
        }),
      );
    });

    it("increments sequenceNum from current max", async () => {
      prisma.askMessage.aggregate.mockResolvedValue({
        _max: { sequenceNum: 42 },
      });
      prisma.askMessage.create.mockResolvedValue({ id: "m" });

      await service.appendUserMessage("s-1", "hi", []);
      expect(prisma.askMessage.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ sequenceNum: 43 }),
        }),
      );
    });
  });

  describe("cancelTurn", () => {
    it("rejects cancelling a turn that already terminated", async () => {
      prisma.askSession.findFirst.mockResolvedValue({
        id: "s-1",
        userId: "u-1",
        mode: AskSessionMode.ROOM,
      });
      prisma.askRoomTurn.findFirst.mockResolvedValue({
        id: "t-1",
        sessionId: "s-1",
        status: AskTurnStatus.COMPLETED,
      });
      await expect(
        service.cancelTurn("s-1", "t-1", "u-1"),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe("createTurn", () => {
    it("inserts AskRoomTurn with status RUNNING", async () => {
      prisma.askRoomTurn.create.mockResolvedValue({});
      await service.createTurn({
        sessionId: "s-1",
        triggerMessageId: "msg-1",
        mode: AskRoomMode.FREECHAT,
        participantIds: ["m-1"],
      });
      expect(prisma.askRoomTurn.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            sessionId: "s-1",
            triggerMessageId: "msg-1",
            mode: AskRoomMode.FREECHAT,
            status: AskTurnStatus.RUNNING,
          }),
        }),
      );
    });
  });
});
