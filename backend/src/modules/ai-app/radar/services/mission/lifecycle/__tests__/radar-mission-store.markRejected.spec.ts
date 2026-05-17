/**
 * RadarMissionStore.markRejected 单元测试
 *
 * 2026-05-17 R3 评审 P0：JSDoc 第 13 行声明 markRejected 但方法缺失，让
 * framework 真的 reject mission 时无对应方法可调，DB 行卡 running 不可恢复。
 * 本 spec 锁定 markRejected：
 *   - 仅作用于 status='running' 的 mission（updateMany where 守）
 *   - 写入 status='rejected' + completedAt + durationMs + error (≤4000)
 *   - 不消耗用户额度（不写 metrics）
 *   - 不存在的 mission 静默忽略（updateMany 行为）
 *   - reason >4000 字符自动截断
 */

import { Test } from "@nestjs/testing";
import { PrismaService } from "@/common/prisma/prisma.service";
import { RadarMissionStore } from "../radar-mission-store.service";

describe("RadarMissionStore.markRejected", () => {
  let store: RadarMissionStore;
  let prisma: {
    radarRun: {
      findUnique: jest.Mock;
      updateMany: jest.Mock;
    };
  };

  beforeEach(async () => {
    prisma = {
      radarRun: {
        findUnique: jest.fn(),
        updateMany: jest.fn(),
      },
    };
    const moduleRef = await Test.createTestingModule({
      providers: [
        RadarMissionStore,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();
    store = moduleRef.get(RadarMissionStore);
  });

  it("writes status='rejected' with completedAt + durationMs + error", async () => {
    const startedAt = new Date("2026-05-17T09:00:00Z");
    prisma.radarRun.findUnique.mockResolvedValueOnce({ startedAt });
    prisma.radarRun.updateMany.mockResolvedValueOnce({ count: 1 });

    await store.markRejected("mid-1", "budget exceeded");

    expect(prisma.radarRun.updateMany).toHaveBeenCalledTimes(1);
    const arg = prisma.radarRun.updateMany.mock.calls[0]?.[0];
    expect(arg.where).toEqual({ id: "mid-1", status: "running" });
    expect(arg.data.status).toBe("rejected");
    expect(arg.data.completedAt).toBeInstanceOf(Date);
    expect(arg.data.durationMs).toBeGreaterThanOrEqual(0);
    expect(arg.data.error).toBe("budget exceeded");
  });

  it("truncates reason to 4000 chars", async () => {
    prisma.radarRun.findUnique.mockResolvedValueOnce({ startedAt: new Date() });
    prisma.radarRun.updateMany.mockResolvedValueOnce({ count: 1 });

    const longReason = "x".repeat(5000);
    await store.markRejected("mid-1", longReason);

    const arg = prisma.radarRun.updateMany.mock.calls[0]?.[0];
    expect((arg.data.error as string).length).toBe(4000);
  });

  it("uses now as startedAt fallback when mission row not found", async () => {
    prisma.radarRun.findUnique.mockResolvedValueOnce(null);
    prisma.radarRun.updateMany.mockResolvedValueOnce({ count: 0 });

    await store.markRejected("missing-id", "framework rejected");

    const arg = prisma.radarRun.updateMany.mock.calls[0]?.[0];
    expect(arg.data.durationMs).toBeGreaterThanOrEqual(0);
    expect(arg.data.error).toBe("framework rejected");
  });

  it("only targets running rows (status guard prevents overwriting terminal states)", async () => {
    prisma.radarRun.findUnique.mockResolvedValueOnce({ startedAt: new Date() });
    prisma.radarRun.updateMany.mockResolvedValueOnce({ count: 0 });

    await store.markRejected("mid-1", "test");

    expect(prisma.radarRun.updateMany.mock.calls[0]?.[0].where.status).toBe(
      "running",
    );
  });

  it("does NOT write metrics field (rejected = mission never ran, no cost)", async () => {
    prisma.radarRun.findUnique.mockResolvedValueOnce({ startedAt: new Date() });
    prisma.radarRun.updateMany.mockResolvedValueOnce({ count: 1 });

    await store.markRejected("mid-1", "test");

    const data = prisma.radarRun.updateMany.mock.calls[0]?.[0].data;
    expect(data.metrics).toBeUndefined();
  });
});
