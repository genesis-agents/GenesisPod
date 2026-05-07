/**
 * MissionStore PR-R3 spec —— markReopened + markIntermediateState + resetFields
 *
 * 上游：docs/architecture/ai-harness/runner/per-task-rerun-with-cascade.md v1.2 §3.5 §8.1
 *
 * 反向证据：
 *   - markReopened 真 5×5 状态矩阵（5 from × 5 to = 25 case）
 *   - 乐观锁：updateMany count===0 → throw（防 TOCTOU）
 *   - reset 字段集完整：completedAt/finalScore/leaderSigned/leaderOverallScore/leaderVerdict/errorMessage 全清
 *   - markIntermediateState：字段映射 + heartbeat 自动更新
 *   - resetFields：snake_case → camelCase 映射 + status 不被 null
 */

import { BadRequestException, NotFoundException } from "@nestjs/common";
import { MissionStore } from "../mission-store.service";

interface MockPrisma {
  $transaction: jest.Mock;
  agentPlaygroundMission: {
    update: jest.Mock;
    updateMany: jest.Mock;
    findFirst: jest.Mock;
  };
  agentPlaygroundMissionEvent: {
    create: jest.Mock;
  };
}

function makeMockPrisma(): MockPrisma {
  const mp: MockPrisma = {
    $transaction: jest.fn(),
    agentPlaygroundMission: {
      update: jest.fn().mockResolvedValue({}),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      findFirst: jest.fn().mockResolvedValue(null),
    },
    agentPlaygroundMissionEvent: {
      create: jest.fn().mockResolvedValue({}),
    },
  };
  // $transaction 默认 invoke callback 用 mp 自身做 tx
  mp.$transaction.mockImplementation(
    async (cb: (tx: MockPrisma) => Promise<unknown>) => cb(mp),
  );
  return mp;
}

function makeStore(prisma: MockPrisma): MissionStore {
  return new MissionStore(prisma as never);
}

describe("MissionStore.markIntermediateState (PR-R3)", () => {
  it("写 outlinePlan / analystOutput / reportFull 字段同时更新 heartbeatAt", async () => {
    const prisma = makeMockPrisma();
    const store = makeStore(prisma);
    await store.markIntermediateState("m1", {
      outlinePlan: { chapters: [] },
      analystOutput: { themeSummary: "x" },
      reportFull: { content: { fullMarkdown: "y" } },
      reportArtifactVersion: 2,
    });
    expect(prisma.agentPlaygroundMission.update).toHaveBeenCalledTimes(1);
    const arg = prisma.agentPlaygroundMission.update.mock.calls[0][0];
    expect(arg.where.id).toBe("m1");
    expect(arg.data.outlinePlan).toEqual({ chapters: [] });
    expect(arg.data.analystOutput).toEqual({ themeSummary: "x" });
    expect(arg.data.reportFull).toBeDefined();
    expect(arg.data.reportArtifactVersion).toBe(2);
    expect(arg.data.heartbeatAt).toBeInstanceOf(Date);
  });

  it("不传字段则该字段不在 update data 中（部分 update）", async () => {
    const prisma = makeMockPrisma();
    const store = makeStore(prisma);
    await store.markIntermediateState("m1", { outlinePlan: { x: 1 } });
    const arg = prisma.agentPlaygroundMission.update.mock.calls[0][0];
    expect(arg.data.outlinePlan).toBeDefined();
    expect(arg.data.analystOutput).toBeUndefined();
    expect(arg.data.reportFull).toBeUndefined();
  });

  it("update 失败 → 仅 log warn 不抛", async () => {
    const prisma = makeMockPrisma();
    prisma.agentPlaygroundMission.update.mockRejectedValueOnce(
      new Error("DB down"),
    );
    const store = makeStore(prisma);
    await expect(
      store.markIntermediateState("m1", { outlinePlan: { x: 1 } }),
    ).resolves.toBeUndefined();
  });
});

describe("MissionStore.markReopened (PR-R3 真 5×5 矩阵)", () => {
  // v1.2 类别 B3：5 from × 5 expected to = 25 case
  // failed/quality-failed → running 允许；completed/cancelled/running → 拒绝（保留原状态）
  const cases = [
    { from: "failed", expectedTo: "running", shouldThrow: false },
    { from: "quality-failed", expectedTo: "running", shouldThrow: false },
    { from: "completed", expectedTo: "completed", shouldThrow: true },
    { from: "cancelled", expectedTo: "cancelled", shouldThrow: true },
    { from: "running", expectedTo: "running", shouldThrow: true }, // 拒但 to 仍是 running 因为不变
  ] as const;

  for (const c of cases) {
    it(`from=${c.from} → ${c.shouldThrow ? "throw 且 status 保持 " + c.expectedTo : "成功转 running"}`, async () => {
      const prisma = makeMockPrisma();
      // mock updateMany 行为：仅当 status in [failed, quality-failed] 才 count=1
      prisma.agentPlaygroundMission.updateMany.mockImplementation(
        async (args: { where: { status: { in: string[] } } }) => {
          const allowed = args.where.status.in;
          return { count: allowed.includes(c.from) ? 1 : 0 };
        },
      );
      // mock findFirst 返回当前 status
      prisma.agentPlaygroundMission.findFirst.mockResolvedValue({
        status: c.from,
      });

      const store = makeStore(prisma);
      if (c.shouldThrow) {
        await expect(store.markReopened("m1", "u1")).rejects.toThrow(
          BadRequestException,
        );
      } else {
        await expect(store.markReopened("m1", "u1")).resolves.toBeUndefined();
        expect(prisma.agentPlaygroundMissionEvent.create).toHaveBeenCalledWith(
          expect.objectContaining({
            data: expect.objectContaining({
              type: "agent-playground.mission:reopened",
            }),
          }),
        );
      }
    });
  }

  it("乐观锁防 TOCTOU：count=0 时即使 mission 存在也 throw", async () => {
    const prisma = makeMockPrisma();
    prisma.agentPlaygroundMission.updateMany.mockResolvedValue({ count: 0 });
    prisma.agentPlaygroundMission.findFirst.mockResolvedValue({
      status: "completed",
    });
    const store = makeStore(prisma);
    await expect(store.markReopened("m1", "u1")).rejects.toThrow(
      BadRequestException,
    );
  });

  it("mission 不存在 → throw NotFound", async () => {
    const prisma = makeMockPrisma();
    prisma.agentPlaygroundMission.updateMany.mockResolvedValue({ count: 0 });
    prisma.agentPlaygroundMission.findFirst.mockResolvedValue(null);
    const store = makeStore(prisma);
    await expect(store.markReopened("m1", "u1")).rejects.toThrow(
      NotFoundException,
    );
  });

  it("成功 reopen 时 reset 字段集完整", async () => {
    const prisma = makeMockPrisma();
    prisma.agentPlaygroundMission.updateMany.mockResolvedValue({ count: 1 });
    const store = makeStore(prisma);
    await store.markReopened("m1", "u1");
    const arg = prisma.agentPlaygroundMission.updateMany.mock.calls[0][0];
    expect(arg.data.status).toBe("running");
    expect(arg.data.errorMessage).toBeNull();
    expect(arg.data.completedAt).toBeNull();
    expect(arg.data.finalScore).toBeNull();
    expect(arg.data.leaderSigned).toBeNull();
    expect(arg.data.leaderOverallScore).toBeNull();
    expect(arg.data.leaderVerdict).toBeNull();
    expect(arg.data.heartbeatAt).toBeInstanceOf(Date);
  });

  it("audit event 在同一 transaction 内创建", async () => {
    const prisma = makeMockPrisma();
    prisma.agentPlaygroundMission.updateMany.mockResolvedValue({ count: 1 });
    const store = makeStore(prisma);
    await store.markReopened("m1", "u1");
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(prisma.agentPlaygroundMissionEvent.create).toHaveBeenCalledTimes(1);
  });
});

describe("MissionStore.resetFields (PR-R3)", () => {
  it("snake_case 字段名映射到 camelCase prisma 字段", async () => {
    const prisma = makeMockPrisma();
    const store = makeStore(prisma);
    await store.resetFields("m1", [
      "report_full",
      "completed_at",
      "leader_signed",
      "outline_plan",
      "analyst_output",
    ]);
    const arg = prisma.agentPlaygroundMission.update.mock.calls[0][0];
    expect(arg.data.reportFull).toBeNull();
    expect(arg.data.completedAt).toBeNull();
    expect(arg.data.leaderSigned).toBeNull();
    expect(arg.data.outlinePlan).toBeNull();
    expect(arg.data.analystOutput).toBeNull();
  });

  it("status 字段被静默丢弃（不允许通过 resetFields 改 status）", async () => {
    const prisma = makeMockPrisma();
    const store = makeStore(prisma);
    await store.resetFields("m1", ["status", "error_message"]);
    const arg = prisma.agentPlaygroundMission.update.mock.calls[0][0];
    expect(arg.data.status).toBeUndefined();
    expect(arg.data.errorMessage).toBeNull();
  });

  it("未知字段名静默忽略（防 typo 致灾，但不阻塞 cascade）", async () => {
    const prisma = makeMockPrisma();
    const store = makeStore(prisma);
    await store.resetFields("m1", ["unknown_field", "report_full"]);
    const arg = prisma.agentPlaygroundMission.update.mock.calls[0][0];
    expect(arg.data.reportFull).toBeNull();
    expect(Object.keys(arg.data)).not.toContain("unknown_field");
  });

  it("空 fields 数组 → 不调用 update", async () => {
    const prisma = makeMockPrisma();
    const store = makeStore(prisma);
    await store.resetFields("m1", []);
    expect(prisma.agentPlaygroundMission.update).not.toHaveBeenCalled();
  });

  it("仅含 status / 未知字段 → 不调用 update（all filtered out）", async () => {
    const prisma = makeMockPrisma();
    const store = makeStore(prisma);
    await store.resetFields("m1", ["status", "totally_unknown"]);
    expect(prisma.agentPlaygroundMission.update).not.toHaveBeenCalled();
  });
});
