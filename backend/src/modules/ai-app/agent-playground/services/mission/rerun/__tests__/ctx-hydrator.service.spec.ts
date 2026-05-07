/**
 * CtxHydratorService spec —— PR-R2
 *
 * 上游：docs/architecture/ai-harness/runner/per-task-rerun-with-cascade.md v1.2 §3.2 §8.1
 *
 * 反向证据：
 *   - happy: completed mission 全字段重建（含 outline_plan / analyst_output / researcherResults）
 *   - retry_label: 同 dim 多 retry_label 取 latest
 *   - zod 校验：reportFull 损坏 / 字段缺失 → throw BadRequest
 *   - size guard: reportFull > 2MB → throw
 *   - heartbeat 时间窗：< 60s 拒（in-flight），≥ 60s 允许（reopen 等待）
 *   - 不存在 mission → NotFound
 */

import { BadRequestException, NotFoundException } from "@nestjs/common";
import { CtxHydratorService } from "../ctx-hydrator.service";
import type {
  MissionStore,
  MissionDetail,
} from "../../lifecycle/mission-store.service";

function buildValidArtifact() {
  return {
    content: { fullMarkdown: "## Report", fullReportSize: 10 },
    sections: [
      {
        id: "sec-1",
        type: "executive_summary",
        level: 2,
        title: "执行摘要",
        anchor: "exec",
        startOffset: 0,
        endOffset: 10,
        wordCount: 5,
        readingTimeMinutes: 1,
        citations: [],
        figureIds: [],
        factIds: [],
      },
    ],
    citations: [],
    figures: [],
    factTable: [],
    quickView: {
      executiveSummary: { markdown: "x", wordCount: 1 },
      estimatedReadingTime: 1,
      topHighlights: [],
      topTrends: [],
      keyRisks: [],
      topRecommendations: [],
      keyCitations: [],
      keyFigures: [],
      whatYouWillLearn: [],
    },
    metadata: {
      topic: "T",
      generatedAt: new Date().toISOString(),
      generationTimeMs: 1000,
      version: 1,
      isIncremental: false,
      dimensionCount: 1,
      sourceCount: 0,
      factCount: 0,
      figureCount: 0,
      wordCount: 5,
      readingTimeMinutes: 1,
      styleProfile: "analytical",
      lengthProfile: "standard",
      audienceProfile: "professional",
      language: "zh-CN",
      totalTokens: { prompt: 0, completion: 0, total: 0 },
      costCents: 0,
      modelTrail: [],
    },
    quality: {
      overall: 80,
      dimensions: { traceability: 80 },
      hardGateViolations: [],
      warnings: [],
      qualityTrace: [],
      finalVerdict: "good",
    },
  };
}

function buildDetail(overrides: Partial<MissionDetail> = {}): MissionDetail {
  return {
    id: "m1",
    topic: "T",
    depth: "deep",
    language: "zh-CN",
    status: "completed",
    startedAt: new Date(),
    completedAt: new Date(),
    wallTimeMs: 1000,
    finalScore: 80,
    tokensUsed: 100,
    costUsd: 0.01,
    reportTitle: "X",
    reportSummary: "Y",
    errorMessage: null,
    maxCredits: 300,
    themeSummary: "ts",
    dimensions: [{ id: "d1", name: "维度一", rationale: "r" }],
    reportFull: buildValidArtifact(),
    verdicts: null,
    trajectoryStored: 0,
    reportArtifactVersion: 2,
    userProfile: { depth: "deep", language: "zh-CN" },
    reconciliationReport: null,
    leaderJournal: null,
    leaderOverallScore: null,
    leaderSigned: null,
    leaderVerdict: null,
    lastCompletedStage: 10,
    outlinePlan: null,
    analystOutput: null,
    heartbeatAt: null,
    ...overrides,
  };
}

function makeMockStore(detail: MissionDetail | null) {
  return {
    getById: jest.fn().mockResolvedValue(detail),
  } as unknown as MissionStore;
}

function makeMockPrisma(
  opts: {
    rrRows?: Array<{
      dimension: string;
      findings: unknown;
      summary: string | null;
    }>;
    cdRows?: Array<{
      dimension: string;
      chapterIndex: number;
      heading: string;
      content: string;
      wordCount: number | null;
    }>;
  } = {},
) {
  return {
    $queryRawUnsafe: jest.fn().mockResolvedValue(opts.rrRows ?? []),
    agentPlaygroundChapterDraft: {
      findMany: jest.fn().mockResolvedValue(opts.cdRows ?? []),
    },
  } as never;
}

describe("CtxHydratorService.hydrate", () => {
  describe("happy path", () => {
    it("completed mission 全字段重建", async () => {
      const store = makeMockStore(buildDetail());
      const prisma = makeMockPrisma();
      const hydrator = new CtxHydratorService(store, prisma);
      const ctx = await hydrator.hydrate("m1", "u1");
      expect(ctx.__hydrated).toBe(true);
      expect(ctx.missionId).toBe("m1");
      expect(ctx.userId).toBe("u1");
      expect(ctx.input.depth).toBe("deep");
      expect(ctx.plan?.dimensions.length).toBe(1);
      expect(ctx.reportArtifact?.sections.length).toBe(1);
    });

    it("重建 outlinePlan / analystOutput 字段（PR-R0 新列）", async () => {
      const detail = buildDetail({
        outlinePlan: {
          chapterOutlines: [
            {
              sectionId: "s1",
              heading: "H",
              subheadings: [],
              thesis: "T",
              keyPointsToCover: [],
            },
          ],
        },
        analystOutput: { themeSummary: "AS", insights: [] },
      });
      const store = makeMockStore(detail);
      const prisma = makeMockPrisma();
      const hydrator = new CtxHydratorService(store, prisma);
      const ctx = await hydrator.hydrate("m1", "u1");
      expect(ctx.outlinePlan).toBeDefined();
      expect(ctx.analystOutput).toBeDefined();
    });
  });

  describe("zod 校验（v1.2 类别 E1）", () => {
    it("reportFull 缺 metadata.topic → throw BadRequest", async () => {
      const broken = buildValidArtifact();
      delete (broken.metadata as { topic?: string }).topic;
      const detail = buildDetail({ reportFull: broken });
      const store = makeMockStore(detail);
      const prisma = makeMockPrisma();
      const hydrator = new CtxHydratorService(store, prisma);
      await expect(hydrator.hydrate("m1", "u1")).rejects.toThrow(
        BadRequestException,
      );
    });

    it("reportFull > 2MB → throw BadRequest（size guard）", async () => {
      const huge = buildValidArtifact();
      // 加超大 metadata 字段（key 数量 50+ 也会 fail，但我们要测 size guard 先于 zod 触发）
      (huge.metadata as Record<string, unknown>).hugeField = "x".repeat(
        4_000_000,
      );
      const detail = buildDetail({ reportFull: huge });
      const store = makeMockStore(detail);
      const prisma = makeMockPrisma();
      const hydrator = new CtxHydratorService(store, prisma);
      await expect(hydrator.hydrate("m1", "u1")).rejects.toThrow(
        /2.000.000|DoS/,
      );
    });

    it("reportFull=null + reportArtifactVersion=null → 无错（report 也为 undefined）", async () => {
      const detail = buildDetail({
        reportFull: null,
        reportArtifactVersion: null,
      });
      const store = makeMockStore(detail);
      const prisma = makeMockPrisma();
      const hydrator = new CtxHydratorService(store, prisma);
      const ctx = await hydrator.hydrate("m1", "u1");
      expect(ctx.reportArtifact).toBeUndefined();
      expect(ctx.report).toBeUndefined();
    });
  });

  describe("heartbeat 时间窗（v1.2 类别 B2）", () => {
    it("status=running 且 heartbeat 5s 前 → throw（in-flight）", async () => {
      const detail = buildDetail({
        status: "running",
        heartbeatAt: new Date(Date.now() - 5_000),
      });
      const store = makeMockStore(detail);
      const prisma = makeMockPrisma();
      const hydrator = new CtxHydratorService(store, prisma);
      await expect(hydrator.hydrate("m1", "u1")).rejects.toThrow(/in-flight/);
    });

    it("status=running 且 heartbeat 120s 前 → 允许（reopen 等待）", async () => {
      const detail = buildDetail({
        status: "running",
        heartbeatAt: new Date(Date.now() - 120_000),
      });
      const store = makeMockStore(detail);
      const prisma = makeMockPrisma();
      const hydrator = new CtxHydratorService(store, prisma);
      const ctx = await hydrator.hydrate("m1", "u1");
      expect(ctx.__hydrated).toBe(true);
    });

    it("status=running 且 heartbeatAt=null → 允许（reopen 后 hb 还没刷）", async () => {
      const detail = buildDetail({ status: "running", heartbeatAt: null });
      const store = makeMockStore(detail);
      const prisma = makeMockPrisma();
      const hydrator = new CtxHydratorService(store, prisma);
      const ctx = await hydrator.hydrate("m1", "u1");
      expect(ctx.__hydrated).toBe(true);
    });

    it("status=failed → 允许（cascade rerun 正常路径）", async () => {
      const detail = buildDetail({ status: "failed" });
      const store = makeMockStore(detail);
      const prisma = makeMockPrisma();
      const hydrator = new CtxHydratorService(store, prisma);
      const ctx = await hydrator.hydrate("m1", "u1");
      expect(ctx.__hydrated).toBe(true);
    });
  });

  describe("mission 不存在", () => {
    it("getById 返回 null → NotFound", async () => {
      const store = makeMockStore(null);
      const prisma = makeMockPrisma();
      const hydrator = new CtxHydratorService(store, prisma);
      await expect(hydrator.hydrate("m1", "u1")).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe("researcherResults 重建（v1.2 类别 D1+D2）", () => {
    it("DISTINCT ON dimension：同 dim 多 retry_label 不重复 entry", async () => {
      // mock $queryRawUnsafe 已应用 DISTINCT ON 的结果（每 dim 一行）
      const rrRows = [
        {
          dimension: "维度一",
          findings: [{ claim: "c1", evidence: "e1", source: "s1" }],
          summary: "ok1",
        },
        {
          dimension: "维度二",
          findings: [{ claim: "c2", evidence: "e2", source: "s2" }],
          summary: "ok2",
        },
      ];
      const detail = buildDetail();
      const store = makeMockStore(detail);
      const prisma = makeMockPrisma({ rrRows });
      const hydrator = new CtxHydratorService(store, prisma);
      const ctx = await hydrator.hydrate("m1", "u1");
      expect(ctx.researcherResults?.length).toBe(2);
      expect(ctx.researcherResults?.[0].dimension).toBe("维度一");
    });

    it("dim 字符串作 chapter join key（不依赖数组 index）", async () => {
      const rrRows = [
        { dimension: "维度一", findings: [], summary: "" },
        { dimension: "维度二", findings: [], summary: "" },
      ];
      // chapter rows 顺序与 dim 不同，验证按 dim 字符串 join
      const cdRows = [
        {
          dimension: "维度二",
          chapterIndex: 1,
          heading: "h2-1",
          content: "body 维度二 ch1",
          wordCount: 5,
        },
        {
          dimension: "维度一",
          chapterIndex: 1,
          heading: "h1-1",
          content: "body 维度一 ch1",
          wordCount: 5,
        },
      ];
      const detail = buildDetail();
      const store = makeMockStore(detail);
      const prisma = makeMockPrisma({ rrRows, cdRows });
      const hydrator = new CtxHydratorService(store, prisma);
      const ctx = await hydrator.hydrate("m1", "u1");
      const r1 = ctx.researcherResults?.find((r) => r.dimension === "维度一");
      const r2 = ctx.researcherResults?.find((r) => r.dimension === "维度二");
      expect(
        (r1 as { chapters?: Array<{ body: string }> })?.chapters?.[0].body,
      ).toContain("维度一");
      expect(
        (r2 as { chapters?: Array<{ body: string }> })?.chapters?.[0].body,
      ).toContain("维度二");
    });

    it("无 chapter_drafts 时不带 chapters 字段", async () => {
      const rrRows = [{ dimension: "维度一", findings: [], summary: "" }];
      const detail = buildDetail();
      const store = makeMockStore(detail);
      const prisma = makeMockPrisma({ rrRows, cdRows: [] });
      const hydrator = new CtxHydratorService(store, prisma);
      const ctx = await hydrator.hydrate("m1", "u1");
      expect(ctx.researcherResults?.length).toBe(1);
      expect(
        (ctx.researcherResults?.[0] as { fullMarkdown?: string }).fullMarkdown,
      ).toBeUndefined();
    });

    it("rrRows 为空 → researcherResults=undefined", async () => {
      const detail = buildDetail();
      const store = makeMockStore(detail);
      const prisma = makeMockPrisma({ rrRows: [] });
      const hydrator = new CtxHydratorService(store, prisma);
      const ctx = await hydrator.hydrate("m1", "u1");
      expect(ctx.researcherResults).toBeUndefined();
    });
  });

  describe("stateless / 并发", () => {
    it("Promise.all 并发 hydrate 两个 mission 互不污染", async () => {
      const store = {
        getById: jest
          .fn()
          .mockResolvedValueOnce(buildDetail({ id: "m1", topic: "T1" }))
          .mockResolvedValueOnce(buildDetail({ id: "m2", topic: "T2" })),
      } as unknown as MissionStore;
      const prisma = makeMockPrisma();
      const hydrator = new CtxHydratorService(store, prisma);
      const [c1, c2] = await Promise.all([
        hydrator.hydrate("m1", "u1"),
        hydrator.hydrate("m2", "u1"),
      ]);
      expect(c1.input.topic).toBe("T1");
      expect(c2.input.topic).toBe("T2");
    });
  });
});
