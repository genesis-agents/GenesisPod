import { Test } from "@nestjs/testing";
import { NotificationBroadcastAdapter } from "../notification-broadcast-adapter";
import { NotificationPresetsService } from "@/modules/ai-infra/facade";
import { PrismaService } from "@/common/prisma/prisma.service";
import type { DomainEvent } from "@/modules/ai-harness/facade";

describe("NotificationBroadcastAdapter", () => {
  let adapter: NotificationBroadcastAdapter;
  let presets: jest.Mocked<NotificationPresetsService>;
  let prisma: { agentPlaygroundMission: { findUnique: jest.Mock } };

  beforeEach(async () => {
    presets = {
      notifyMissionCompleted: jest.fn().mockResolvedValue(undefined),
    } as unknown as jest.Mocked<NotificationPresetsService>;

    prisma = {
      agentPlaygroundMission: {
        findUnique: jest.fn(),
      },
    };

    const moduleRef = await Test.createTestingModule({
      providers: [
        NotificationBroadcastAdapter,
        { provide: NotificationPresetsService, useValue: presets },
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    adapter = moduleRef.get(NotificationBroadcastAdapter);
  });

  // ─── accepts ──────────────────────────────────────────────────────

  describe("accepts", () => {
    it("accepts agent-playground.mission:completed", () => {
      const event: DomainEvent = {
        type: "agent-playground.mission:completed",
        scope: { userId: "u1" },
        payload: {},
        timestamp: Date.now(),
      };
      expect(adapter.accepts(event)).toBe(true);
    });

    it("rejects events of other types (e.g. agent:thought)", () => {
      const event: DomainEvent = {
        type: "agent-playground.agent:thought",
        scope: { userId: "u1" },
        payload: {},
        timestamp: Date.now(),
      };
      expect(adapter.accepts(event)).toBe(false);
    });

    it("rejects mission:failed (only completion = signed success triggers notification)", () => {
      const event: DomainEvent = {
        type: "agent-playground.mission:failed",
        scope: { userId: "u1" },
        payload: {},
        timestamp: Date.now(),
      };
      expect(adapter.accepts(event)).toBe(false);
    });
  });

  // ─── broadcast ────────────────────────────────────────────────────

  describe("broadcast — mission:completed", () => {
    const baseEvent: DomainEvent = {
      type: "agent-playground.mission:completed",
      scope: { userId: "u1", missionId: "m1" },
      payload: {
        leaderSigned: true,
        reviewScore: 87,
      },
      timestamp: Date.now(),
    };

    it("calls notifyMissionCompleted with reportTitle from DB", async () => {
      prisma.agentPlaygroundMission.findUnique.mockResolvedValue({
        reportTitle: "Anthropic 产品策略分析",
        themeSummary: "secondary fallback",
      });

      await adapter.broadcast(baseEvent);

      expect(presets.notifyMissionCompleted).toHaveBeenCalledTimes(1);
      expect(presets.notifyMissionCompleted).toHaveBeenCalledWith({
        userId: "u1",
        missionId: "m1",
        missionTitle: "Anthropic 产品策略分析",
        appBasePath: "/playground",
        relatedType: "agent-playground-mission",
        reviewScore: 87,
      });
    });

    it("falls back to themeSummary when reportTitle is null", async () => {
      prisma.agentPlaygroundMission.findUnique.mockResolvedValue({
        reportTitle: null,
        themeSummary: "Theme summary text",
      });

      await adapter.broadcast(baseEvent);

      expect(presets.notifyMissionCompleted).toHaveBeenCalledWith(
        expect.objectContaining({ missionTitle: "Theme summary text" }),
      );
    });

    it("falls back to missionId when both title fields empty", async () => {
      prisma.agentPlaygroundMission.findUnique.mockResolvedValue({
        reportTitle: "  ",
        themeSummary: null,
      });

      await adapter.broadcast(baseEvent);

      expect(presets.notifyMissionCompleted).toHaveBeenCalledWith(
        expect.objectContaining({ missionTitle: "m1" }),
      );
    });

    it("skips notification when leaderSigned=false (rejected mission)", async () => {
      const event: DomainEvent = {
        ...baseEvent,
        payload: { leaderSigned: false, reviewScore: 30 },
      };

      await adapter.broadcast(event);

      expect(presets.notifyMissionCompleted).not.toHaveBeenCalled();
    });

    it("skips notification when scope has no userId", async () => {
      const event: DomainEvent = {
        ...baseEvent,
        scope: { missionId: "m1" }, // no userId
      };

      await adapter.broadcast(event);

      expect(presets.notifyMissionCompleted).not.toHaveBeenCalled();
    });

    it("skips notification when scope has no missionId", async () => {
      const event: DomainEvent = {
        ...baseEvent,
        scope: { userId: "u1" }, // no missionId
      };

      await adapter.broadcast(event);

      expect(presets.notifyMissionCompleted).not.toHaveBeenCalled();
    });

    it("swallows preset errors (logs only, never throws)", async () => {
      prisma.agentPlaygroundMission.findUnique.mockResolvedValue({
        reportTitle: "T",
        themeSummary: null,
      });
      presets.notifyMissionCompleted.mockRejectedValue(new Error("DB down"));

      await expect(adapter.broadcast(baseEvent)).resolves.toBeUndefined();
    });

    it("swallows DB lookup errors (uses missionId fallback)", async () => {
      prisma.agentPlaygroundMission.findUnique.mockRejectedValue(
        new Error("DB unreachable"),
      );

      await adapter.broadcast(baseEvent);

      expect(presets.notifyMissionCompleted).toHaveBeenCalledWith(
        expect.objectContaining({ missionTitle: "m1" }),
      );
    });
  });
});
