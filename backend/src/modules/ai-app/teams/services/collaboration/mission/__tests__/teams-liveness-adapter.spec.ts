/**
 * teams-liveness-adapter.spec.ts —— Teams MissionLivenessGuard 适配器行为
 *
 * 验证（强成功标准：scan() 能杀掉今天会永远跑下去的 over-wall-time mission）：
 *   (a) running mission 的 startedAt 在过去（超 wall-time）→ 触发
 *       prisma.teamMission.updateMany(status=FAILED)，killed=1；
 *   (b) updateMany 返回 {count:0}（他写已抢先终态）→ 级联 agentTask.updateMany 不调用；
 *   (c) getMostRecentEventTs 从 mocked missionLog.groupBy 返回按 missionId 的 Map。
 *
 * 适配器逻辑与 ai-teams.module.ts onModuleInit 内联注册保持一致；此处内联重建
 * 以隔离 guard 算法 × 适配器 Prisma 调用，不引入整个 NestModule 启动。
 */

import { MissionStatus, AgentTaskStatus } from "@prisma/client";
import { MissionLivenessGuard } from "@/modules/ai-harness/facade";
import type { MissionLivenessAdapter } from "@/modules/ai-harness/lifecycle/mission-lifecycle/mission-liveness-guard.service";

type MockPrisma = {
  teamMission: {
    findMany: jest.Mock;
    updateMany: jest.Mock;
  };
  agentTask: { updateMany: jest.Mock };
  missionLog: { groupBy: jest.Mock };
};

function buildAdapter(prisma: MockPrisma): MissionLivenessAdapter {
  const RUNNING = [
    MissionStatus.PLANNING,
    MissionStatus.IN_PROGRESS,
    MissionStatus.REVIEW,
  ];
  return {
    fetchRunningMissions: async () => {
      const rows = await prisma.teamMission.findMany({
        where: { status: { in: RUNNING } },
        select: {
          id: true,
          createdById: true,
          startedAt: true,
          createdAt: true,
        },
        take: 200,
      });
      return rows.map(
        (r: {
          id: string;
          createdById: string;
          startedAt: Date | null;
          createdAt: Date;
        }) => ({
          id: r.id,
          userId: r.createdById,
          startedAt: r.startedAt ?? r.createdAt,
          heartbeatAt: null,
        }),
      );
    },
    getMostRecentEventTs: async (missionIds, sinceMs) => {
      const out = new Map<string, number>();
      const grouped = await prisma.missionLog.groupBy({
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
      const res = await prisma.teamMission.updateMany({
        where: { id: missionId, status: { in: RUNNING } },
        data: {
          status: MissionStatus.FAILED,
          completedAt: new Date(),
          summary: errorMessage.slice(0, 4000),
        },
      });
      if (res.count > 0) {
        await prisma.agentTask.updateMany({
          where: {
            missionId,
            status: {
              in: [AgentTaskStatus.PENDING, AgentTaskStatus.IN_PROGRESS],
            },
          },
          data: { status: AgentTaskStatus.CANCELLED },
        });
      }
    },
  };
}

describe("Teams MissionLivenessGuard adapter", () => {
  let guard: MissionLivenessGuard;

  beforeEach(() => {
    guard = new MissionLivenessGuard();
  });

  afterEach(() => {
    guard.stopScanLoop();
  });

  it("(a) kills an over-wall-time running mission via teamMission.updateMany(FAILED)", async () => {
    const prisma: MockPrisma = {
      teamMission: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: "tm-1",
            createdById: "u-1",
            // 起跑 5 小时前，超过 wallTimeCapMs(1ms 测试值)
            startedAt: new Date(Date.now() - 5 * 60 * 60 * 1000),
            createdAt: new Date(Date.now() - 5 * 60 * 60 * 1000),
          },
        ]),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      agentTask: { updateMany: jest.fn().mockResolvedValue({ count: 2 }) },
      missionLog: { groupBy: jest.fn().mockResolvedValue([]) },
    };
    guard.registerAdapter("ai-teams", buildAdapter(prisma), {
      wallTimeCapMs: 1,
      startupGraceMs: 0,
    });
    const r = await guard.forceScan("ai-teams");
    expect(r?.killed).toBe(1);
    expect(prisma.teamMission.updateMany).toHaveBeenCalledTimes(1);
    const arg = prisma.teamMission.updateMany.mock.calls[0][0];
    expect(arg.data.status).toBe(MissionStatus.FAILED);
    expect(arg.where.id).toBe("tm-1");
    // 级联取消子任务
    expect(prisma.agentTask.updateMany).toHaveBeenCalledTimes(1);
  });

  it("(b) idempotent no-op: updateMany count 0 → agentTask cascade NOT called", async () => {
    const prisma: MockPrisma = {
      teamMission: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: "tm-2",
            createdById: "u-2",
            startedAt: new Date(Date.now() - 5 * 60 * 60 * 1000),
            createdAt: new Date(Date.now() - 5 * 60 * 60 * 1000),
          },
        ]),
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
      agentTask: { updateMany: jest.fn().mockResolvedValue({ count: 0 }) },
      missionLog: { groupBy: jest.fn().mockResolvedValue([]) },
    };
    guard.registerAdapter("ai-teams", buildAdapter(prisma), {
      wallTimeCapMs: 1,
      startupGraceMs: 0,
    });
    await guard.forceScan("ai-teams");
    expect(prisma.teamMission.updateMany).toHaveBeenCalledTimes(1);
    expect(prisma.agentTask.updateMany).not.toHaveBeenCalled();
  });

  it("(c) getMostRecentEventTs returns Map keyed by missionId from missionLog.groupBy", async () => {
    const ts = new Date("2026-06-21T00:00:00.000Z");
    const prisma: MockPrisma = {
      teamMission: {
        findMany: jest.fn().mockResolvedValue([]),
        updateMany: jest.fn(),
      },
      agentTask: { updateMany: jest.fn() },
      missionLog: {
        groupBy: jest
          .fn()
          .mockResolvedValue([{ missionId: "tm-9", _max: { createdAt: ts } }]),
      },
    };
    const adapter = buildAdapter(prisma);
    const out = await adapter.getMostRecentEventTs(["tm-9"], Date.now() - 1000);
    expect(out.get("tm-9")).toBe(ts.getTime());
  });
});
