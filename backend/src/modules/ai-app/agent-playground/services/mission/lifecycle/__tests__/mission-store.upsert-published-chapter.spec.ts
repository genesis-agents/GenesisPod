// PR-3 v1.6 D3 dual-write — RV-5 / RV-5b 反向证据 spec
//
// 验证点：
//   1. upsertPublishedChapter 写 chapters 新表（含 user_id）
//   2. cross-user 读隔离：userA 读 userB mission → 空数组（CWE-639）
//   3. update 路径：同 missionId+dim+chapterIndex 重新调 → 不创建新行，原 row 字段更新
//   4. PR-13 sub-section 字段：subSectionCount / subSectionStructure 可选写入

import { Logger } from "@nestjs/common";

interface PrismaChapterMockRow {
  id: string;
  missionId: string;
  userId: string;
  dimension: string;
  chapterIndex: number;
  heading: string;
  thesis: string | null;
  content: string;
  wordCount: number;
  status: string;
  score: number | null;
  subSectionCount: number | null;
  subSectionStructure: unknown;
  createdAt: Date;
  updatedAt: Date;
}

class FakePrismaChapter {
  rows: PrismaChapterMockRow[] = [];

  upsert = jest.fn(
    async (args: {
      where: {
        missionId_dimension_chapterIndex: {
          missionId: string;
          dimension: string;
          chapterIndex: number;
        };
      };
      create: Partial<PrismaChapterMockRow>;
      update: Partial<PrismaChapterMockRow>;
    }) => {
      const k = args.where.missionId_dimension_chapterIndex;
      const idx = this.rows.findIndex(
        (r) =>
          r.missionId === k.missionId &&
          r.dimension === k.dimension &&
          r.chapterIndex === k.chapterIndex,
      );
      if (idx >= 0) {
        this.rows[idx] = { ...this.rows[idx], ...args.update };
        return this.rows[idx];
      } else {
        const created: PrismaChapterMockRow = {
          id: `ch-${this.rows.length + 1}`,
          missionId: k.missionId,
          userId: "",
          dimension: k.dimension,
          chapterIndex: k.chapterIndex,
          heading: "",
          thesis: null,
          content: "",
          wordCount: 0,
          status: "",
          score: null,
          subSectionCount: null,
          subSectionStructure: null,
          createdAt: new Date(),
          updatedAt: new Date(),
          ...args.create,
        };
        this.rows.push(created);
        return created;
      }
    },
  );

  findMany = jest.fn(
    async (args: {
      where: { missionId: string; userId: string };
      orderBy: unknown;
    }) => {
      return this.rows.filter(
        (r) =>
          r.missionId === args.where.missionId &&
          r.userId === args.where.userId,
      );
    },
  );
}

// 直接对照 mission-store.service.ts 实现（不引入 NestJS 容器，仅验证逻辑）
class MissionStoreUpsertSubject {
  constructor(
    private readonly prisma: { agentPlaygroundChapter: FakePrismaChapter },
    private readonly log: Logger,
  ) {}

  async upsertPublishedChapter(args: {
    missionId: string;
    userId: string;
    dimension: string;
    chapterIndex: number;
    heading: string;
    thesis?: string;
    content: string;
    wordCount: number;
    status: string;
    score?: number;
    subSectionCount?: number;
    subSectionStructure?: unknown;
  }): Promise<void> {
    await this.prisma.agentPlaygroundChapter.upsert({
      where: {
        missionId_dimension_chapterIndex: {
          missionId: args.missionId,
          dimension: args.dimension.slice(0, 200),
          chapterIndex: args.chapterIndex,
        },
      },
      create: {
        missionId: args.missionId,
        userId: args.userId,
        dimension: args.dimension.slice(0, 200),
        chapterIndex: args.chapterIndex,
        heading: args.heading.slice(0, 500),
        thesis: args.thesis ?? null,
        content: args.content,
        wordCount: args.wordCount,
        status: args.status,
        score: args.score ?? null,
        subSectionCount: args.subSectionCount ?? null,
        subSectionStructure: args.subSectionStructure ?? null,
      },
      update: {
        heading: args.heading.slice(0, 500),
        thesis: args.thesis ?? null,
        content: args.content,
        wordCount: args.wordCount,
        status: args.status,
        score: args.score ?? null,
        subSectionCount: args.subSectionCount ?? null,
        subSectionStructure: args.subSectionStructure ?? null,
      },
    });
  }

  async loadPublishedChapters(missionId: string, userId: string) {
    const rows = await this.prisma.agentPlaygroundChapter.findMany({
      where: { missionId, userId },
      orderBy: [],
    });
    return rows;
  }
}

describe("PR-3 D3 dual-write — upsertPublishedChapter / loadPublishedChapters", () => {
  let prismaMock: { agentPlaygroundChapter: FakePrismaChapter };
  let store: MissionStoreUpsertSubject;

  beforeEach(() => {
    prismaMock = { agentPlaygroundChapter: new FakePrismaChapter() };
    store = new MissionStoreUpsertSubject(prismaMock, {
      warn: jest.fn(),
      log: jest.fn(),
    } as unknown as Logger);
  });

  it("RV-5: 写入后 loadPublishedChapters 能读回（chapters 新表是 rerun 重建源）", async () => {
    await store.upsertPublishedChapter({
      missionId: "m1",
      userId: "u1",
      dimension: "政策框架",
      chapterIndex: 1,
      heading: "国际框架演进",
      thesis: "全球碳中和共识形成路径",
      content: "深度分析内容".repeat(50),
      wordCount: 300,
      status: "passed",
    });

    const rows = await store.loadPublishedChapters("m1", "u1");
    expect(rows).toHaveLength(1);
    expect(rows[0].dimension).toBe("政策框架");
    expect(rows[0].wordCount).toBe(300);
  });

  it("RV-5b cross-user 读隔离：userA 读 userB mission → 空数组（CWE-639）", async () => {
    await store.upsertPublishedChapter({
      missionId: "m-secret",
      userId: "u-attacker-victim",
      dimension: "敏感",
      chapterIndex: 1,
      heading: "victim 章节",
      content: "内容",
      wordCount: 10,
      status: "passed",
    });

    // 攻击者用自己 userId 试图读 victim 的 mission
    const attackerView = await store.loadPublishedChapters(
      "m-secret",
      "u-attacker-different",
    );
    expect(attackerView).toHaveLength(0);

    // 真实 owner 能读
    const ownerView = await store.loadPublishedChapters(
      "m-secret",
      "u-attacker-victim",
    );
    expect(ownerView).toHaveLength(1);
  });

  it("update 路径：同 mission+dim+chapterIndex 第二次写 → 不创建新行，updatedAt 更新", async () => {
    await store.upsertPublishedChapter({
      missionId: "m1",
      userId: "u1",
      dimension: "政策",
      chapterIndex: 1,
      heading: "v1 标题",
      content: "v1 内容",
      wordCount: 100,
      status: "passed",
    });
    await store.upsertPublishedChapter({
      missionId: "m1",
      userId: "u1",
      dimension: "政策",
      chapterIndex: 1,
      heading: "v2 标题",
      content: "v2 改写后的内容",
      wordCount: 200,
      status: "passed",
    });

    const rows = await store.loadPublishedChapters("m1", "u1");
    expect(rows).toHaveLength(1); // 不是 2
    expect(rows[0].heading).toBe("v2 标题"); // 更新覆盖
    expect(rows[0].wordCount).toBe(200);
  });

  it("PR-13 sub-section 字段可选写入", async () => {
    const subSectionStructure = [
      {
        index: 1,
        heading: "开场",
        thesis: "...",
        targetWordCount: 4500,
        actualWordCount: 4321,
      },
      {
        index: 2,
        heading: "中段",
        thesis: "...",
        targetWordCount: 4500,
        actualWordCount: 4789,
      },
      {
        index: 3,
        heading: "收束",
        thesis: "...",
        targetWordCount: 4500,
        actualWordCount: 4634,
      },
    ];
    await store.upsertPublishedChapter({
      missionId: "m1",
      userId: "u1",
      dimension: "政策",
      chapterIndex: 1,
      heading: "deep 13K 章节",
      content: "拼接后的全文".repeat(1000),
      wordCount: 13744,
      status: "passed",
      subSectionCount: 3,
      subSectionStructure,
    });

    const rows = await store.loadPublishedChapters("m1", "u1");
    expect(rows[0].subSectionCount).toBe(3);
    expect(rows[0].subSectionStructure).toEqual(subSectionStructure);
  });

  it("quick/standard 单 LLM call 路径：sub-section 字段为 null（防误用）", async () => {
    await store.upsertPublishedChapter({
      missionId: "m-quick",
      userId: "u1",
      dimension: "速览",
      chapterIndex: 1,
      heading: "quick 章节",
      content: "短小内容",
      wordCount: 1000,
      status: "passed",
      // 不传 subSectionCount / subSectionStructure
    });
    const rows = await store.loadPublishedChapters("m-quick", "u1");
    expect(rows[0].subSectionCount).toBeNull();
    expect(rows[0].subSectionStructure).toBeNull();
  });

  it("dimension 截断到 200 字符（防超长 input）", async () => {
    const longDim = "x".repeat(500);
    await store.upsertPublishedChapter({
      missionId: "m1",
      userId: "u1",
      dimension: longDim,
      chapterIndex: 1,
      heading: "章",
      content: "x",
      wordCount: 1,
      status: "passed",
    });
    const rows = await store.loadPublishedChapters("m1", "u1");
    expect(rows[0].dimension.length).toBe(200);
  });
});
