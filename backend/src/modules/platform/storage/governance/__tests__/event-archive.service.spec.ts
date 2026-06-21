import { EventArchiveService } from "../event-archive.service";
import type { PrismaService } from "../../../../../common/prisma/prisma.service";
import type { ConfigService } from "@nestjs/config";
import type { ObjectStorageService } from "../../object-store/object-storage.service";

/**
 * EventArchiveService —— 无损归档（archive-to-R2-then-delete）核心安全保证测试。
 */
describe("EventArchiveService", () => {
  const mkRows = (n: number, prefix: string) =>
    Array.from({ length: n }, (_, i) => ({
      id: `${prefix}-${i}`,
      createdAt: new Date("2026-01-01T00:00:00Z"),
      emittedAt: new Date("2026-01-01T00:00:00Z"),
      takenAt: new Date("2026-01-01T00:00:00Z"),
      payload: { i },
    }));

  const mk = (opts?: {
    uploadOk?: boolean;
    rowsPerTable?: number;
    storageEnabled?: boolean;
  }) => {
    const uploadOk = opts?.uploadOk ?? true;
    const total = opts?.rowsPerTable ?? 0;

    // 每张表一个"剩余行"计数器，select 返回当前剩余、delete 扣减 —— 模拟真实排空循环
    const remaining: Record<string, number> = {};
    const model = (name: string) => ({
      count: jest.fn(async () => remaining[name] ?? (remaining[name] = total)),
      findMany: jest.fn(async (args: { take: number }) => {
        const left = remaining[name] ?? (remaining[name] = total);
        return mkRows(Math.min(args.take, left), name);
      }),
      deleteMany: jest.fn(async (args: { where: { id: { in: string[] } } }) => {
        const c = args.where.id.in.length;
        remaining[name] = Math.max(0, (remaining[name] ?? total) - c);
        return { count: c };
      }),
    });

    const prisma = {
      harnessAgentEvent: model("harnessAgentEvent"),
      harnessCheckpoint: model("harnessCheckpoint"),
      agentPlaygroundMissionEvent: model("agentPlaygroundMissionEvent"),
      aIEngineMetric: model("aIEngineMetric"),
      harnessRunMetric: model("harnessRunMetric"),
      researchAgentActivity: model("researchAgentActivity"),
      agentSpan: model("agentSpan"),
      agentTrace: model("agentTrace"),
      $queryRawUnsafe: jest.fn(async (sql: string) =>
        sql.includes("pg_try_advisory_lock") ? [{ locked: true }] : [{}],
      ),
    } as unknown as PrismaService;

    const uploadBufferToKey = jest.fn(async (_buf: Buffer, key: string) =>
      uploadOk ? { success: true, key } : { success: false, error: "r2 down" },
    );
    const storage = {
      isEnabled: () => opts?.storageEnabled ?? true,
      uploadBufferToKey,
    } as unknown as ObjectStorageService;

    const config = {
      get: () => undefined,
    } as unknown as ConfigService;

    return {
      svc: new EventArchiveService(prisma, storage, config),
      prisma,
      uploadBufferToKey,
    };
  };

  it("dry-run 只统计、不上传不删除", async () => {
    const { svc, prisma, uploadBufferToKey } = mk({ rowsPerTable: 10 });
    const results = await svc.runOnce({ dryRun: true });
    expect(results).toHaveLength(8);
    for (const r of results) {
      expect(r.dryRun).toBe(true);
      expect(r.rows).toBe(10);
      expect(r.bytesArchived).toBe(0);
    }
    expect(uploadBufferToKey).not.toHaveBeenCalled();
    const p = prisma as unknown as Record<string, { deleteMany: jest.Mock }>;
    expect(p.harnessAgentEvent.deleteMany).not.toHaveBeenCalled();
  });

  it("真实模式：先上传成功才删除，分批排空", async () => {
    const { svc, prisma, uploadBufferToKey } = mk({ rowsPerTable: 1200 });
    const results = await svc.runOnce({ dryRun: false });
    const harness = results.find((r) => r.table === "harness_agent_events");
    expect(harness?.rows).toBe(1200); // 全部归档并删除
    expect(harness?.objects).toBe(3); // 1200 / BATCH(500) = 3 个对象
    expect(harness?.bytesArchived).toBeGreaterThan(0);
    expect(uploadBufferToKey).toHaveBeenCalled();
    const p = prisma as unknown as Record<string, { deleteMany: jest.Mock }>;
    expect(p.harnessAgentEvent.deleteMany).toHaveBeenCalled();
  });

  it("上传失败时绝不删除（数据安全第一）", async () => {
    const { svc, prisma } = mk({ rowsPerTable: 10, uploadOk: false });
    const results = await svc.runOnce({ dryRun: false });
    const harness = results.find((r) => r.table === "harness_agent_events");
    expect(harness?.error).toContain("upload failed");
    expect(harness?.rows).toBe(0);
    const p = prisma as unknown as Record<string, { deleteMany: jest.Mock }>;
    expect(p.harnessAgentEvent.deleteMany).not.toHaveBeenCalled();
  });

  it("getStatus 反映开关、目标表与最近一次执行", async () => {
    const prev = process.env.ENABLE_EVENT_ARCHIVE;
    process.env.ENABLE_EVENT_ARCHIVE = "true";
    try {
      const { svc } = mk({ rowsPerTable: 5 });
      const before = svc.getStatus();
      expect(before.enabled).toBe(true);
      expect(before.r2Configured).toBe(true);
      expect(before.targets.length).toBe(8);
      expect(before.targets.map((t) => t.table)).toContain(
        "harness_agent_events",
      );
      expect(before.lastRun).toBeNull();

      await svc.runOnce({ dryRun: true });
      expect(svc.getStatus().lastRun?.results).toHaveLength(8);
    } finally {
      process.env.ENABLE_EVENT_ARCHIVE = prev;
    }
  });
});
