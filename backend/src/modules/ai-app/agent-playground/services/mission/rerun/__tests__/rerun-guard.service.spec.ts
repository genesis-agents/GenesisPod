/**
 * RerunGuardService spec — 16 case 覆盖 design v1.1 §3.1.1 9-cell 决策矩阵 +
 * §3.2 zombieCleanup + §7 反向证据 RV-1~RV-9 全锁定。
 *
 * 4 路 R1+R2 共识 P0 全嵌入：
 *   - heartbeat 三态 × event 三态 × status 显式（R1 tester P0-T1）
 *   - 0 BUSINESS 事件场景（R1 tester P0-T3）
 *   - userId 隔离（R1 security P0）
 *   - 不裸 UPDATE / 走 store.markFailed (R1 reviewer P0-2)
 *   - DB 异常 fail-closed（R1 architect P1-3）
 *   - RV-6 纯读不变量
 *   - R2 security medium：markFailed 跨用户 missionId 时 cleanup skip
 */

import { BadRequestException } from "@nestjs/common";
import { RerunGuardService } from "../rerun-guard.service";

interface MissionRow {
  id: string;
  userId: string;
  status: string;
  heartbeatAt: Date | null;
}

function mkPrisma(opts: {
  missions: MissionRow[];
  latestBusinessTs?: number | null;
  queryThrows?: boolean;
}) {
  const events: Array<{
    missionId: string;
    type: string;
    payload: unknown;
    ts: bigint;
  }> = [];
  return {
    $queryRawUnsafe: jest.fn(async () => {
      if (opts.queryThrows) throw new Error("DB connection refused");
      const ts = opts.latestBusinessTs;
      return ts == null ? [] : [{ ts: BigInt(ts) }];
    }),
    agentPlaygroundMissionEvent: {
      create: jest.fn(async ({ data }: { data: (typeof events)[number] }) => {
        events.push(data);
        return data;
      }),
    },
    __events: events,
  };
}

function mkStore(opts: { missions: MissionRow[] }) {
  return {
    getById: jest.fn(async (missionId: string, userId: string) => {
      const m = opts.missions.find(
        (x) => x.id === missionId && x.userId === userId,
      );
      return m ?? null;
    }),
    markFailed: jest.fn(async () => undefined),
    clearHeartbeat: jest.fn(async () => undefined),
  };
}

const NOW = new Date("2026-05-07T12:00:00Z").getTime();
beforeAll(() => {
  jest.useFakeTimers().setSystemTime(NOW);
});
afterAll(() => {
  jest.useRealTimers();
});

function makeGuard(prisma: unknown, store: unknown): RerunGuardService {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return new RerunGuardService(prisma as any, store as any);
}

describe("RerunGuardService", () => {
  // ─────────────────────────────────────────────────────────────
  // status 短路（终态直放过）
  // ─────────────────────────────────────────────────────────────
  describe("checkInFlight — status 短路", () => {
    it.each([["completed"], ["failed"], ["quality-failed"], ["cancelled"]])(
      "status=%s → inFlight=false 直放过（不查 heartbeat / event）",
      async (status) => {
        const prisma = mkPrisma({
          missions: [
            {
              id: "m1",
              userId: "u1",
              status,
              heartbeatAt: new Date(NOW - 1000),
            },
          ],
        });
        const store = mkStore({
          missions: [
            {
              id: "m1",
              userId: "u1",
              status,
              heartbeatAt: new Date(NOW - 1000),
            },
          ],
        });
        const guard = makeGuard(prisma, store);

        const result = await guard.checkInFlight("m1", "u1");

        expect(result.inFlight).toBe(false);
        expect(result.zombieDetected).toBe(false);
        expect(result.status).toBe(status);
        // 终态短路：不查 events 表（性能 + 行为正确性）
        expect(prisma.$queryRawUnsafe).not.toHaveBeenCalled();
      },
    );
  });

  // ─────────────────────────────────────────────────────────────
  // status=running + heartbeat 三态 × event 三态（R1 tester P0-T1 + P0-T3）
  // ─────────────────────────────────────────────────────────────
  describe("checkInFlight — status=running + heartbeat × event 矩阵", () => {
    function setup(opts: {
      hbAgeMs: number | null;
      eventAgeMs: number | null;
    }) {
      const heartbeatAt =
        opts.hbAgeMs == null ? null : new Date(NOW - opts.hbAgeMs);
      const latestBusinessTs =
        opts.eventAgeMs == null ? null : NOW - opts.eventAgeMs;
      const missions = [
        { id: "m1", userId: "u1", status: "running", heartbeatAt },
      ];
      const prisma = mkPrisma({ missions, latestBusinessTs });
      const store = mkStore({ missions });
      return { guard: makeGuard(prisma, store), prisma, store };
    }

    it("hb=null + event=null → inFlight=false（reopen 后未刷 + 0 BUSINESS 事件）", async () => {
      const { guard } = setup({ hbAgeMs: null, eventAgeMs: null });
      const r = await guard.checkInFlight("m1", "u1");
      expect(r.inFlight).toBe(false);
      expect(r.zombieDetected).toBe(false);
      expect(r.heartbeatAgeMs).toBeNull();
      expect(r.latestBusinessEventAgeMs).toBeNull();
    });

    it("hb=null + event=5s ago → inFlight=false（heartbeat 缺位 → 永不 inFlight=true）", async () => {
      const { guard } = setup({ hbAgeMs: null, eventAgeMs: 5_000 });
      const r = await guard.checkInFlight("m1", "u1");
      expect(r.inFlight).toBe(false);
      expect(r.zombieDetected).toBe(false);
    });

    it("hb=5s ago + event=null → zombieDetected=true（zombie + 0 BUSINESS 事件，R1 tester P0-T3）", async () => {
      const { guard } = setup({ hbAgeMs: 5_000, eventAgeMs: null });
      const r = await guard.checkInFlight("m1", "u1");
      expect(r.inFlight).toBe(false);
      expect(r.zombieDetected).toBe(true);
    });

    it("hb=5s ago + event=10s ago → inFlight=true（真活）", async () => {
      const { guard } = setup({ hbAgeMs: 5_000, eventAgeMs: 10_000 });
      const r = await guard.checkInFlight("m1", "u1");
      expect(r.inFlight).toBe(true);
      expect(r.zombieDetected).toBe(false);
      expect(r.reason).toMatch(/heartbeat 5s ago.*business event 10s ago/);
    });

    it("hb=5s ago + event=10min ago → zombieDetected=true（zombie pod，event 已 stale）", async () => {
      const { guard } = setup({ hbAgeMs: 5_000, eventAgeMs: 10 * 60_000 });
      const r = await guard.checkInFlight("m1", "u1");
      expect(r.inFlight).toBe(false);
      expect(r.zombieDetected).toBe(true);
    });

    it("hb=120s ago + event=10s ago → inFlight=false（hb 漏 / 长间隔）", async () => {
      const { guard } = setup({ hbAgeMs: 120_000, eventAgeMs: 10_000 });
      const r = await guard.checkInFlight("m1", "u1");
      expect(r.inFlight).toBe(false);
      expect(r.zombieDetected).toBe(false);
    });

    it("hb=120s ago + event=null → inFlight=false（真死 / LivenessGuard 漏）", async () => {
      const { guard } = setup({ hbAgeMs: 120_000, eventAgeMs: null });
      const r = await guard.checkInFlight("m1", "u1");
      expect(r.inFlight).toBe(false);
      expect(r.zombieDetected).toBe(false);
    });
  });

  // ─────────────────────────────────────────────────────────────
  // userId 隔离（R1 security P0 + R2 medium）
  // ─────────────────────────────────────────────────────────────
  describe("checkInFlight — userId 隔离", () => {
    it("不同 userId 调相同 missionId → mission-not-found 路径，不泄露其他用户 status", async () => {
      const missions = [
        {
          id: "m1",
          userId: "u1",
          status: "running",
          heartbeatAt: new Date(NOW - 1000),
        },
      ];
      const prisma = mkPrisma({ missions, latestBusinessTs: NOW - 1000 });
      const store = mkStore({ missions });
      const guard = makeGuard(prisma, store);

      const result = await guard.checkInFlight("m1", "u-other");

      expect(result.inFlight).toBe(false);
      expect(result.zombieDetected).toBe(false);
      // 关键：跨用户访问没触发 events 表查询（短路在 store.getById 返 null）
      expect(prisma.$queryRawUnsafe).not.toHaveBeenCalled();
    });
  });

  // ─────────────────────────────────────────────────────────────
  // RV-6: checkInFlight 纯读不变量
  // ─────────────────────────────────────────────────────────────
  describe("checkInFlight — RV-6 纯读不变量", () => {
    it("连续 100 次 → store.markFailed / clearHeartbeat / event.create 0 调用", async () => {
      const missions = [
        {
          id: "m1",
          userId: "u1",
          status: "running",
          heartbeatAt: new Date(NOW - 5000),
        },
      ];
      const prisma = mkPrisma({ missions, latestBusinessTs: NOW - 1000 });
      const store = mkStore({ missions });
      const guard = makeGuard(prisma, store);

      for (let i = 0; i < 100; i++) {
        await guard.checkInFlight("m1", "u1");
      }

      expect(store.markFailed).not.toHaveBeenCalled();
      expect(store.clearHeartbeat).not.toHaveBeenCalled();
      expect(prisma.agentPlaygroundMissionEvent.create).not.toHaveBeenCalled();
    });
  });

  // ─────────────────────────────────────────────────────────────
  // ensureRerunable + zombieCleanup（R1 reviewer P0-2 + R2 security）
  // ─────────────────────────────────────────────────────────────
  describe("ensureRerunable — zombieCleanup 行为", () => {
    it("zombieDetected=true → markFailed(userId) + clearHeartbeat(userId) + emit zombie-cleanup 事件", async () => {
      const missions = [
        {
          id: "m1",
          userId: "u1",
          status: "running",
          heartbeatAt: new Date(NOW - 5000),
        },
      ];
      const prisma = mkPrisma({
        missions,
        latestBusinessTs: NOW - 10 * 60_000,
      });
      const store = mkStore({ missions });
      const guard = makeGuard(prisma, store);

      await guard.ensureRerunable("m1", "u1");

      // 走 store.markFailed（不裸 prisma.update）—— RV-4 + R1 reviewer P0-2
      expect(store.markFailed).toHaveBeenCalledTimes(1);
      expect(store.markFailed).toHaveBeenCalledWith(
        "m1",
        { errorMessage: "zombie-heartbeat-cleanup" },
        "u1",
      );
      // store.clearHeartbeat 同样走唯一写源
      expect(store.clearHeartbeat).toHaveBeenCalledTimes(1);
      expect(store.clearHeartbeat).toHaveBeenCalledWith("m1", "u1");
      // emit zombie-cleanup 事件（observability）
      expect(prisma.agentPlaygroundMissionEvent.create).toHaveBeenCalledTimes(
        1,
      );
      const evt = prisma.agentPlaygroundMissionEvent.create.mock.calls[0][0]
        .data as { type: string };
      expect(evt.type).toBe("agent-playground.mission:zombie-cleanup");
    });

    it("RV-4: zombieCleanup 后业务字段保留 —— store.markFailed 调用参数只含 errorMessage（不含 dimensions/outline_plan/report_full）", async () => {
      const missions = [
        {
          id: "m1",
          userId: "u1",
          status: "running",
          heartbeatAt: new Date(NOW - 5000),
        },
      ];
      const prisma = mkPrisma({
        missions,
        latestBusinessTs: NOW - 10 * 60_000,
      });
      const store = mkStore({ missions });
      const guard = makeGuard(prisma, store);

      await guard.ensureRerunable("m1", "u1");

      const callArgs = store.markFailed.mock.calls[0];
      const data = callArgs[1] as Record<string, unknown>;
      // 关键：业务字段必须不在 markFailed payload 里
      expect(data).not.toHaveProperty("dimensions");
      expect(data).not.toHaveProperty("outlinePlan");
      expect(data).not.toHaveProperty("report");
      expect(data).not.toHaveProperty("themeSummary");
      expect(data).not.toHaveProperty("reconciliationReport");
      expect(data).toEqual({ errorMessage: "zombie-heartbeat-cleanup" });
    });

    it("R2 security medium: 跨用户 missionId 触发 zombie 时 cleanup skip（不调 markFailed）", async () => {
      // 故意：u-other 调 missionId=m1，但 m1 属于 u1
      const missions = [
        {
          id: "m1",
          userId: "u1",
          status: "running",
          heartbeatAt: new Date(NOW - 5000),
        },
      ];
      const prisma = mkPrisma({
        missions,
        latestBusinessTs: NOW - 10 * 60_000,
      });
      const store = mkStore({ missions });
      const guard = makeGuard(prisma, store);

      await guard.ensureRerunable("m1", "u-other");

      // store.getById(missionId, userId='u-other') → null → checkInFlight 短路 status=failed
      // → zombieDetected=false → ensureRerunable 不进入 zombieCleanup 路径
      expect(store.markFailed).not.toHaveBeenCalled();
      expect(store.clearHeartbeat).not.toHaveBeenCalled();
    });

    it("status 在 race 间已变 final → cleanup skip", async () => {
      // 微妙场景：checkInFlight 拿到 status=running zombie，调 zombieCleanup 时
      // store.getById 内部又看一眼 status 已变 failed（race 解决）→ skip
      const initialMissions = [
        {
          id: "m1",
          userId: "u1",
          status: "running",
          heartbeatAt: new Date(NOW - 5000),
        },
      ];
      const prisma = mkPrisma({
        missions: initialMissions,
        latestBusinessTs: NOW - 10 * 60_000,
      });
      const store = mkStore({ missions: initialMissions });
      // 模拟 race：第二次调 store.getById 时 status 已变 failed
      let callCount = 0;
      store.getById = jest.fn(async () => {
        callCount++;
        if (callCount === 1) return initialMissions[0]; // checkInFlight 看到 running
        return { ...initialMissions[0], status: "failed" }; // zombieCleanup 看到 failed
      });
      const guard = makeGuard(prisma, store);

      await guard.ensureRerunable("m1", "u1");

      expect(store.markFailed).not.toHaveBeenCalled();
      expect(store.clearHeartbeat).not.toHaveBeenCalled();
    });

    it("inFlight=true → 抛 BadRequest 不调 cleanup", async () => {
      const missions = [
        {
          id: "m1",
          userId: "u1",
          status: "running",
          heartbeatAt: new Date(NOW - 5000),
        },
      ];
      const prisma = mkPrisma({ missions, latestBusinessTs: NOW - 10_000 }); // BUSINESS event 10s ago
      const store = mkStore({ missions });
      const guard = makeGuard(prisma, store);

      await expect(guard.ensureRerunable("m1", "u1")).rejects.toThrow(
        BadRequestException,
      );
      expect(store.markFailed).not.toHaveBeenCalled();
    });
  });

  // ─────────────────────────────────────────────────────────────
  // DB 异常 fail-closed（R1 architect P1-3 / R11）
  // ─────────────────────────────────────────────────────────────
  describe("ensureRerunable — DB 异常 fail-closed", () => {
    it("$queryRawUnsafe 抛错 → BadRequest，不放行（fail-closed）", async () => {
      const missions = [
        {
          id: "m1",
          userId: "u1",
          status: "running",
          heartbeatAt: new Date(NOW - 5000),
        },
      ];
      const prisma = mkPrisma({ missions, queryThrows: true });
      const store = mkStore({ missions });
      const guard = makeGuard(prisma, store);

      await expect(guard.ensureRerunable("m1", "u1")).rejects.toThrow(
        /rerun guard 服务异常/,
      );
      expect(store.markFailed).not.toHaveBeenCalled();
    });
  });
});
