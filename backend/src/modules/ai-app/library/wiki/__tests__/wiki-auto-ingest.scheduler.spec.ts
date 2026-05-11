/**
 * WikiAutoIngestScheduler spec — PR-1, the "compounding" half of Karpathy's
 * LLM Wiki philosophy.
 *
 * Gates exercised (each test isolates one):
 *  - eligibility: only wikiEnabled + autoIngestEnabled != false KBs
 *  - coverage: only docs whose updatedAt is newer than APPLIED coverage are ingested
 *  - placeholder docs (metadata.pendingFetch=true) are filtered out
 *  - off-loaded docs (rawContentUri set) are always considered ready
 *  - debounce window pre-empts a tick
 *  - daily budget caps auto-ingest count per KB per day
 *  - pending diffs do not suppress auto-ingest by themselves
 *  - per-KB failure does not abort the loop
 *  - top-level catch keeps the cron alive
 */

import { WikiAutoIngestScheduler } from "../wiki-auto-ingest.scheduler";
import { AUTO_INGEST_SYSTEM_USER_ID } from "../wiki-ingest.service";

function makePrismaMock() {
  return {
    knowledgeBase: { findMany: jest.fn() },
    wikiDiff: {
      findFirst: jest.fn(),
      count: jest.fn(),
    },
    wikiDocumentCoverage: { findMany: jest.fn() },
    knowledgeBaseDocument: { findMany: jest.fn() },
  } as any;
}

function makeIngestMock() {
  return {
    ingestAsCron: jest.fn().mockResolvedValue({ id: "diff-auto-1" } as any),
  } as any;
}

const KB_DEFAULT = {
  id: "kb-1",
  userId: "user-1",
  wikiConfig: {
    autoIngestEnabled: true,
    autoIngestDailyBudgetCalls: 20,
    autoIngestDebounceSeconds: 300,
  },
};

function setupNoBlockers(prisma: any) {
  prisma.wikiDiff.findFirst.mockResolvedValueOnce(null); // debounce probe
  prisma.wikiDiff.count.mockResolvedValue(0); // budget
  prisma.wikiDocumentCoverage.findMany.mockResolvedValue([]);
}

describe("WikiAutoIngestScheduler", () => {
  let prisma: any;
  let ingest: any;
  let scheduler: WikiAutoIngestScheduler;

  beforeEach(() => {
    prisma = makePrismaMock();
    ingest = makeIngestMock();
    scheduler = new WikiAutoIngestScheduler(prisma, ingest);
  });

  it("skips KBs whose autoIngestEnabled is explicitly false", async () => {
    prisma.knowledgeBase.findMany.mockResolvedValue([
      {
        id: "kb-off",
        userId: "user-off",
        wikiConfig: {
          autoIngestEnabled: false,
          autoIngestDailyBudgetCalls: 20,
          autoIngestDebounceSeconds: 300,
        },
      },
    ]);

    await scheduler.tick();

    expect(ingest.ingestAsCron).not.toHaveBeenCalled();
    expect(prisma.wikiDiff.findFirst).not.toHaveBeenCalled();
  });

  it("treats missing wikiConfig row as autoIngestEnabled (defaults true)", async () => {
    prisma.knowledgeBase.findMany.mockResolvedValue([
      { id: "kb-legacy", userId: "user-legacy", wikiConfig: null },
    ]);
    setupNoBlockers(prisma);
    prisma.knowledgeBaseDocument.findMany.mockResolvedValue([
      { id: "doc-1", metadata: {}, rawContentUri: null },
    ]);

    await scheduler.tick();

    expect(ingest.ingestAsCron).toHaveBeenCalledWith(
      "kb-legacy",
      ["doc-1"],
      "user-legacy",
    );
  });

  it("ingests docs that changed after the cursor", async () => {
    prisma.knowledgeBase.findMany.mockResolvedValue([KB_DEFAULT]);
    setupNoBlockers(prisma);
    prisma.knowledgeBaseDocument.findMany.mockResolvedValue([
      { id: "doc-new", metadata: {}, rawContentUri: null },
      { id: "doc-changed", metadata: null, rawContentUri: null },
    ]);

    await scheduler.tick();

    expect(ingest.ingestAsCron).toHaveBeenCalledWith(
      "kb-1",
      ["doc-new", "doc-changed"],
      "user-1",
    );
  });

  it("filters out placeholder docs (metadata.pendingFetch=true)", async () => {
    prisma.knowledgeBase.findMany.mockResolvedValue([KB_DEFAULT]);
    setupNoBlockers(prisma);
    prisma.knowledgeBaseDocument.findMany.mockResolvedValue([
      { id: "doc-real", metadata: {}, rawContentUri: null },
      {
        id: "doc-placeholder",
        metadata: { pendingFetch: true },
        rawContentUri: null,
      },
    ]);

    await scheduler.tick();

    expect(ingest.ingestAsCron).toHaveBeenCalledWith(
      "kb-1",
      ["doc-real"],
      "user-1",
    );
  });

  it("treats off-loaded docs (rawContentUri set) as always ready", async () => {
    prisma.knowledgeBase.findMany.mockResolvedValue([KB_DEFAULT]);
    setupNoBlockers(prisma);
    prisma.knowledgeBaseDocument.findMany.mockResolvedValue([
      // metadata is null but content lives in R2 → ready
      {
        id: "doc-offloaded",
        metadata: null,
        rawContentUri: "s3://kb-1/doc-offloaded.txt",
      },
    ]);

    await scheduler.tick();

    expect(ingest.ingestAsCron).toHaveBeenCalledWith(
      "kb-1",
      ["doc-offloaded"],
      "user-1",
    );
  });

  it("does not call ingestAsCron when no docs changed since cursor", async () => {
    prisma.knowledgeBase.findMany.mockResolvedValue([KB_DEFAULT]);
    setupNoBlockers(prisma);
    prisma.knowledgeBaseDocument.findMany.mockResolvedValue([]);

    await scheduler.tick();

    expect(ingest.ingestAsCron).not.toHaveBeenCalled();
  });

  it("debounce: skips KB when an auto-ingest WikiDiff exists within the window", async () => {
    prisma.knowledgeBase.findMany.mockResolvedValue([KB_DEFAULT]);
    // First findFirst (debounce probe) returns a recent auto diff.
    prisma.wikiDiff.findFirst.mockResolvedValueOnce({ id: "diff-recent" });

    await scheduler.tick();

    expect(prisma.wikiDiff.count).not.toHaveBeenCalled();
    expect(prisma.knowledgeBaseDocument.findMany).not.toHaveBeenCalled();
    expect(ingest.ingestAsCron).not.toHaveBeenCalled();
  });

  it("daily budget: skips KB when today's auto-ingest count >= budget", async () => {
    prisma.knowledgeBase.findMany.mockResolvedValue([KB_DEFAULT]);
    prisma.wikiDiff.findFirst.mockResolvedValueOnce(null); // debounce clear
    prisma.wikiDiff.count.mockResolvedValueOnce(20); // budget exhausted

    await scheduler.tick();

    expect(prisma.knowledgeBaseDocument.findMany).not.toHaveBeenCalled();
    expect(ingest.ingestAsCron).not.toHaveBeenCalled();
  });

  it("queries the budget count with the AUTO_INGEST sentinel userId", async () => {
    prisma.knowledgeBase.findMany.mockResolvedValue([KB_DEFAULT]);
    setupNoBlockers(prisma);
    prisma.knowledgeBaseDocument.findMany.mockResolvedValue([]);

    await scheduler.tick();

    const countArgs = prisma.wikiDiff.count.mock.calls[0][0];
    expect(countArgs.where.createdByUserId).toBe(AUTO_INGEST_SYSTEM_USER_ID);
  });

  it("isolates per-KB failures so the scan loop continues", async () => {
    prisma.knowledgeBase.findMany.mockResolvedValue([
      KB_DEFAULT,
      { ...KB_DEFAULT, id: "kb-2" },
    ]);
    // First KB blows up at the debounce probe.
    prisma.wikiDiff.findFirst
      .mockRejectedValueOnce(new Error("DB hiccup"))
      // Second KB: clean run.
      .mockResolvedValueOnce(null); // debounce
    prisma.wikiDiff.count.mockResolvedValue(0);
    prisma.wikiDocumentCoverage.findMany.mockResolvedValue([]);
    prisma.knowledgeBaseDocument.findMany.mockResolvedValue([
      { id: "doc-x", metadata: {}, rawContentUri: null },
    ]);

    await expect(scheduler.tick()).resolves.toBeUndefined();

    // kb-2 still got ingested.
    expect(ingest.ingestAsCron).toHaveBeenCalledWith(
      "kb-2",
      ["doc-x"],
      expect.any(String),
    );
  });

  it("does not let pending diffs suppress docs with no applied coverage", async () => {
    prisma.knowledgeBase.findMany.mockResolvedValue([KB_DEFAULT]);
    setupNoBlockers(prisma);
    prisma.knowledgeBaseDocument.findMany.mockResolvedValue([
      {
        id: "doc-after-pending",
        metadata: {},
        rawContentUri: null,
        updatedAt: new Date("2026-05-10T10:00:00.000Z"),
      },
    ]);

    await scheduler.tick();

    expect(ingest.ingestAsCron).toHaveBeenCalledWith(
      "kb-1",
      ["doc-after-pending"],
      "user-1",
    );
  });

  it("skips docs already covered by an applied coverage watermark", async () => {
    prisma.knowledgeBase.findMany.mockResolvedValue([KB_DEFAULT]);
    setupNoBlockers(prisma);
    prisma.knowledgeBaseDocument.findMany.mockResolvedValue([
      {
        id: "doc-covered",
        metadata: {},
        rawContentUri: null,
        updatedAt: new Date("2026-05-10T10:00:00.000Z"),
      },
      {
        id: "doc-newer",
        metadata: {},
        rawContentUri: null,
        updatedAt: new Date("2026-05-10T11:00:00.000Z"),
      },
    ]);
    prisma.wikiDocumentCoverage.findMany.mockResolvedValue([
      {
        documentId: "doc-covered",
        lastCoveredDocumentUpdatedAt: new Date("2026-05-10T10:00:00.000Z"),
      },
      {
        documentId: "doc-newer",
        lastCoveredDocumentUpdatedAt: new Date("2026-05-10T10:30:00.000Z"),
      },
    ]);

    await scheduler.tick();

    expect(ingest.ingestAsCron).toHaveBeenCalledWith(
      "kb-1",
      ["doc-newer"],
      "user-1",
    );
  });

  it("does not throw if the top-level scan query itself fails", async () => {
    prisma.knowledgeBase.findMany.mockRejectedValue(new Error("DB down"));

    await expect(scheduler.tick()).resolves.toBeUndefined();

    expect(ingest.ingestAsCron).not.toHaveBeenCalled();
  });
});
