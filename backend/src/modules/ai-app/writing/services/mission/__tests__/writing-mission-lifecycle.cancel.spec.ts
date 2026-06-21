/**
 * WritingMissionLifecycleService.cancelMission — abort ordering tests
 *
 * Verifies the in-memory orchestrator abort is hoisted to the FIRST action of
 * cancelMission (fires before any DB branching / terminal early-return) and is
 * not double-invoked on the normal success path.
 */

import { WritingMissionLifecycleService } from "../writing-mission-lifecycle.service";
import type { PrismaService } from "../../../../../../common/prisma/prisma.service";
import type { ChatFacade, TeamFacade } from "@/modules/ai-harness/facade";

function buildPrismaMock() {
  return {
    writingMission: {
      findUnique: jest.fn(),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    writingProject: {
      update: jest.fn().mockResolvedValue(undefined),
    },
  };
}

function buildTeamFacadeMock() {
  return {
    missionOrchestrator: {
      cancel: jest.fn().mockResolvedValue(undefined),
    },
  };
}

function buildService(
  prisma: ReturnType<typeof buildPrismaMock>,
  teamFacade: ReturnType<typeof buildTeamFacadeMock>,
): WritingMissionLifecycleService {
  return new WritingMissionLifecycleService(
    prisma as unknown as PrismaService,
    {} as unknown as ChatFacade,
    teamFacade as unknown as TeamFacade,
  );
}

describe("WritingMissionLifecycleService.cancelMission", () => {
  let prisma: ReturnType<typeof buildPrismaMock>;
  let teamFacade: ReturnType<typeof buildTeamFacadeMock>;
  let service: WritingMissionLifecycleService;

  beforeEach(() => {
    prisma = buildPrismaMock();
    teamFacade = buildTeamFacadeMock();
    service = buildService(prisma, teamFacade);
  });

  afterEach(() => jest.clearAllMocks());

  it("fires the orchestrator abort exactly once when mission is not found", async () => {
    prisma.writingMission.findUnique.mockResolvedValue(null);

    const result = await service.cancelMission("mission-1", "user-1");

    expect(teamFacade.missionOrchestrator.cancel).toHaveBeenCalledTimes(1);
    expect(teamFacade.missionOrchestrator.cancel).toHaveBeenCalledWith(
      "mission-1",
    );
    expect(result).toEqual({
      success: true,
      message: "Mission not found but cleanup attempted",
    });
  });

  it("fires the orchestrator abort exactly once on the normal success path (no double-cancel)", async () => {
    prisma.writingMission.findUnique.mockResolvedValue({
      id: "mission-1",
      project: { id: "project-1", ownerId: "user-1", currentWords: 0 },
    });

    await service.cancelMission("mission-1", "user-1");

    expect(teamFacade.missionOrchestrator.cancel).toHaveBeenCalledTimes(1);
    expect(teamFacade.missionOrchestrator.cancel).toHaveBeenCalledWith(
      "mission-1",
    );
  });
});
