/**
 * RadarS8PersistStage 单元测试 — 重点锁 nextDueAt fallback +1h 防 scheduler 风暴
 *
 * 2026-05-17 R4-C 补：R3 P1 #7 修了 computeNextCronTick 返回 null 时
 * nextDueAt 旧逻辑写 undefined → Prisma 跳过该字段 → DB nextDueAt 维持上轮
 * due 时间 → scheduler 每分钟扫到立即重发刷新 → 烧 budget。修后应 fallback
 * now+1h，本 spec 直接断言关键 invariant 防回归。
 *
 * 其他覆盖：
 *  - accepted 阈值（rel>=60 && qual>=50）
 *  - insight 创建条件（payload + accepted size > 0）
 *  - abort guard
 *  - 没有 newItems 时仍正确更新 topic.lastRunAt
 */

import { Test } from "@nestjs/testing";
import { PrismaService } from "@/common/prisma/prisma.service";
import { RadarS8PersistStage } from "../s8-persist.stage";
import * as cronUtil from "../../../scheduler/cron-util";
import type {
  RadarMissionContext,
  RadarStageHookArgs,
} from "../radar-stage-types";

describe("RadarS8PersistStage", () => {
  let stage: RadarS8PersistStage;
  let prisma: {
    $transaction: jest.Mock;
    radarItem: { update: jest.Mock };
    radarInsight: { create: jest.Mock };
    radarTopic: { update: jest.Mock };
  };

  beforeEach(async () => {
    prisma = {
      $transaction: jest.fn((ops) => Promise.all(ops)),
      radarItem: { update: jest.fn().mockResolvedValue({}) },
      radarInsight: { create: jest.fn().mockResolvedValue({}) },
      radarTopic: { update: jest.fn().mockResolvedValue({}) },
    };
    const moduleRef = await Test.createTestingModule({
      providers: [
        RadarS8PersistStage,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();
    stage = moduleRef.get(RadarS8PersistStage);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  function makeCtx(
    overrides: Partial<RadarMissionContext["state"]> = {},
  ): RadarMissionContext {
    return {
      missionId: "m-1",
      userId: "u-1",
      signal: { aborted: false } as AbortSignal,
      state: {
        topic: {
          id: "topic-1",
          refreshCron: "0 */6 * * *",
          lastRunAt: new Date("2026-05-15T00:00:00Z"),
        },
        newItemIds: [],
        relevanceScores: new Map(),
        qualityScores: new Map(),
        insightPayload: undefined,
        metrics: {},
        ...overrides,
      },
    } as unknown as RadarMissionContext;
  }

  const args = {} as RadarStageHookArgs;

  it("fallback to now + 1h when computeNextCronTick returns null (P1 #7 防回归)", async () => {
    jest.spyOn(cronUtil, "computeNextCronTick").mockReturnValueOnce(null);
    const before = Date.now();
    await stage.run(args, makeCtx());
    expect(prisma.radarTopic.update).toHaveBeenCalledTimes(1);
    const updateArg = prisma.radarTopic.update.mock.calls[0]?.[0];
    expect(updateArg.where.id).toBe("topic-1");
    const nextDueAt = updateArg.data.nextDueAt as Date;
    expect(nextDueAt).toBeInstanceOf(Date);
    const diff = nextDueAt.getTime() - before;
    // 1h fallback ± 5s 容差（jest 异步开销）
    expect(diff).toBeGreaterThanOrEqual(60 * 60 * 1000 - 5000);
    expect(diff).toBeLessThanOrEqual(60 * 60 * 1000 + 5000);
  });

  it("uses computeNextCronTick result when cron parses successfully", async () => {
    const cronNext = new Date("2026-05-17T18:00:00Z");
    jest.spyOn(cronUtil, "computeNextCronTick").mockReturnValueOnce(cronNext);
    await stage.run(args, makeCtx());
    const updateArg = prisma.radarTopic.update.mock.calls[0]?.[0];
    expect(updateArg.data.nextDueAt).toBe(cronNext);
  });

  it("aborts immediately when ctx.signal.aborted", async () => {
    const ctx = makeCtx();
    (ctx as { signal: AbortSignal }).signal = { aborted: true } as AbortSignal;
    await expect(stage.run(args, ctx)).rejects.toThrow(
      /aborted_during_persist/,
    );
    expect(prisma.radarTopic.update).not.toHaveBeenCalled();
  });

  it("throws when ctx.state.topic missing", async () => {
    const ctx = makeCtx();
    (ctx.state as { topic?: unknown }).topic = undefined;
    await expect(stage.run(args, ctx)).rejects.toThrow(/topic 缺失/);
  });

  it("marks item accepted only when rel>=60 && qual>=50", async () => {
    const rel = new Map([
      ["i1", { score: 60 }],
      ["i2", { score: 59 }],
      ["i3", { score: 80 }],
    ]);
    const qual = new Map([
      ["i1", { score: 50 }],
      ["i2", { score: 80 }],
      ["i3", { score: 49 }],
    ]);
    jest
      .spyOn(cronUtil, "computeNextCronTick")
      .mockReturnValueOnce(new Date(Date.now() + 3600_000));
    await stage.run(
      args,
      makeCtx({
        newItemIds: ["i1", "i2", "i3"],
        relevanceScores: rel,
        qualityScores: qual,
      }),
    );
    const calls = prisma.radarItem.update.mock.calls.map((c) => c[0]);
    expect(calls.find((c) => c.where.id === "i1")?.data.accepted).toBe(true);
    expect(calls.find((c) => c.where.id === "i2")?.data.accepted).toBe(false);
    expect(calls.find((c) => c.where.id === "i3")?.data.accepted).toBe(false);
  });

  it("does NOT create insight when no accepted items even if payload exists", async () => {
    jest
      .spyOn(cronUtil, "computeNextCronTick")
      .mockReturnValueOnce(new Date(Date.now() + 3600_000));
    await stage.run(
      args,
      makeCtx({
        newItemIds: ["i1"],
        relevanceScores: new Map([["i1", { score: 10 }]]),
        qualityScores: new Map([["i1", { score: 10 }]]),
        insightPayload: {
          summary: "test",
          highlights: [],
          signals: [],
          topEntities: [],
        },
      }),
    );
    expect(prisma.radarInsight.create).not.toHaveBeenCalled();
  });

  it("creates insight when payload present and >=1 item accepted", async () => {
    jest
      .spyOn(cronUtil, "computeNextCronTick")
      .mockReturnValueOnce(new Date(Date.now() + 3600_000));
    await stage.run(
      args,
      makeCtx({
        newItemIds: ["i1"],
        relevanceScores: new Map([["i1", { score: 80 }]]),
        qualityScores: new Map([["i1", { score: 80 }]]),
        insightPayload: {
          summary: "test",
          highlights: [],
          signals: [],
          topEntities: [],
        },
      }),
    );
    expect(prisma.radarInsight.create).toHaveBeenCalledTimes(1);
  });

  it("updates topic.lastRunAt even when newItemIds empty (idempotent persist)", async () => {
    jest
      .spyOn(cronUtil, "computeNextCronTick")
      .mockReturnValueOnce(new Date(Date.now() + 3600_000));
    await stage.run(args, makeCtx({ newItemIds: [] }));
    expect(prisma.radarTopic.update).toHaveBeenCalledTimes(1);
    expect(
      prisma.radarTopic.update.mock.calls[0]?.[0].data.lastRunAt,
    ).toBeInstanceOf(Date);
  });
});
