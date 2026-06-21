/**
 * research-liveness-adapter.spec.ts —— Insight/Research MissionLivenessGuard 适配器行为
 *
 * 验证（强成功标准：scan() 能杀掉今天会永远跑下去的 over-wall-time research mission）：
 *   (a) running mission startedAt 超 wall-time → researchMission.updateMany(FAILED)，killed=1；
 *   (b) updateMany count 0 → researchTask 级联 updateMany 不调用（幂等 no-op）；
 *   (c) getMostRecentEventTs 从 mocked agentStep.groupBy 返回按 missionId 的 Map。
 *
 * 适配器逻辑与 insight.module.ts onModuleInit 内联注册保持一致；内联重建隔离测试。
 */

import { ResearchMissionStatus, ResearchTaskStatus } from "@prisma/client";
import { MissionLivenessGuard } from "@/modules/ai-harness/facade";
import type { MissionLivenessAdapter } from "@/modules/ai-harness/lifecycle/mission-lifecycle/mission-liveness-guard.service";

type MockPrisma = {
  researchMission: {
    findMany: jest.Mock;
    updateMany: jest.Mock;
  };
  researchTask: { updateMany: jest.Mock };
  agentStep: { groupBy: jest.Mock };
};

function buildAdapter(prisma: MockPrisma): MissionLivenessAdapter {
  const RUNNING = [
    ResearchMissionStatus.PLANNING,
    ResearchMissionStatus.PLAN_READY,
    ResearchMissionStatus.EXECUTING,
    ResearchMissionStatus.REVIEWING,
  ];
  return {
    fetchRunningMissions: async () => {
      const rows = await prisma.researchMission.findMany({
        where: { status: { in: RUNNING } },
        select: { id: true, startedAt: true, createdAt: true },
        take: 200,
      });
      return rows.map(
        (r: { id: string; startedAt: Date | null; createdAt: Date }) => ({
          id: r.id,
          userId: "",
          startedAt: r.startedAt ?? r.createdAt,
          heartbeatAt: null,
        }),
      );
    },
    getMostRecentEventTs: async (missionIds, sinceMs) => {
      const out = new Map<string, number>();
      const grouped = await prisma.agentStep.groupBy({
        by: ["missionId"],
        where: {
          missionId: { in: missionIds as string[] },
          createdAt: { gte: new Date(sinceMs) },
        },
        _max: { createdAt: true },
      });
      for (const g of grouped as Array<{
        missionId: string;
        _max: { createdAt: Date | null };
      }>) {
        const ts = g._max.createdAt;
        if (ts) out.set(g.missionId, ts.getTime());
      }
      return out;
    },
    markFailed: async (missionId, _reason, errorMessage) => {
      const res = await prisma.researchMission.updateMany({
        where: { id: missionId, status: { in: RUNNING } },
        data: {
          status: ResearchMissionStatus.FAILED,
          completedAt: new Date(),
        },
      });
      if (res.count > 0) {
        await prisma.researchTask.updateMany({
          where: {
            missionId,
            status: {
              in: [
                ResearchTaskStatus.PENDING,
                ResearchTaskStatus.ASSIGNED,
                ResearchTaskStatus.EXECUTING,
              ],
            },
          },
          data: {
            status: ResearchTaskStatus.FAILED,
            resultSummary: errorMessage.slice(0, 4000),
            completedAt: new Date(),
          },
        });
      }
    },
  };
}

describe("Research MissionLivenessGuard adapter", () => {
  let guard: MissionLivenessGuard;

  beforeEach(() => {
    guard = new MissionLivenessGuard();
  });

  afterEach(() => {
    guard.stopScanLoop();
  });

  it("(a) kills an over-wall-time running mission via researchMission.updateMany(FAILED)", async () => {
    const prisma: MockPrisma = {
      researchMission: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: "rm-1",
            startedAt: new Date(Date.now() - 5 * 60 * 60 * 1000),
            createdAt: new Date(Date.now() - 5 * 60 * 60 * 1000),
          },
        ]),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      researchTask: { updateMany: jest.fn().mockResolvedValue({ count: 3 }) },
      agentStep: { groupBy: jest.fn().mockResolvedValue([]) },
    };
    guard.registerAdapter("research", buildAdapter(prisma), {
      wallTimeCapMs: 1,
      startupGraceMs: 0,
    });
    const r = await guard.forceScan("research");
    expect(r?.killed).toBe(1);
    expect(prisma.researchMission.updateMany).toHaveBeenCalledTimes(1);
    const arg = prisma.researchMission.updateMany.mock.calls[0][0];
    expect(arg.data.status).toBe(ResearchMissionStatus.FAILED);
    expect(arg.where.id).toBe("rm-1");
    expect(prisma.researchTask.updateMany).toHaveBeenCalledTimes(1);
  });

  it("(b) idempotent no-op: updateMany count 0 → researchTask cascade NOT called", async () => {
    const prisma: MockPrisma = {
      researchMission: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: "rm-2",
            startedAt: new Date(Date.now() - 5 * 60 * 60 * 1000),
            createdAt: new Date(Date.now() - 5 * 60 * 60 * 1000),
          },
        ]),
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
      researchTask: { updateMany: jest.fn().mockResolvedValue({ count: 0 }) },
      agentStep: { groupBy: jest.fn().mockResolvedValue([]) },
    };
    guard.registerAdapter("research", buildAdapter(prisma), {
      wallTimeCapMs: 1,
      startupGraceMs: 0,
    });
    await guard.forceScan("research");
    expect(prisma.researchMission.updateMany).toHaveBeenCalledTimes(1);
    expect(prisma.researchTask.updateMany).not.toHaveBeenCalled();
  });

  it("(c) getMostRecentEventTs returns Map keyed by missionId from agentStep.groupBy", async () => {
    const ts = new Date("2026-06-21T00:00:00.000Z");
    const prisma: MockPrisma = {
      researchMission: {
        findMany: jest.fn().mockResolvedValue([]),
        updateMany: jest.fn(),
      },
      researchTask: { updateMany: jest.fn() },
      agentStep: {
        groupBy: jest
          .fn()
          .mockResolvedValue([{ missionId: "rm-9", _max: { createdAt: ts } }]),
      },
    };
    const adapter = buildAdapter(prisma);
    const out = await adapter.getMostRecentEventTs(["rm-9"], Date.now() - 1000);
    expect(out.get("rm-9")).toBe(ts.getTime());
  });
});
