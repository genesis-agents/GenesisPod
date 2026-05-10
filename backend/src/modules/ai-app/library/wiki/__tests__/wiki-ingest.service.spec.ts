/**
 * WikiIngestService spec — v1.5.3 §8 P1 critical paths
 *
 * Mocks PrismaService + KnowledgeBaseService + WikiDiffService + AiChatService;
 * focuses on the 8 contractual gates of the ingest pipeline:
 *
 *  1. wrapExternalContent is invoked with explicit maxLength derived from
 *     ingestMaxTokens × 4 / docCount / 2 (security R2 P2 — must NOT default to 2000)
 *  2. LLM output failing WikiDiffItemsSchema → BadRequestException (retry msg)
 *  3. baselineHash deterministic across two ingests on same KB state
 *  4. Documents not belonging to kbId → NotFoundException
 *  5. PENDING WikiDiff persisted with affectedSlugs computed from validated
 *     items (NOT echoed from LLM output)
 *  6. Empty documentIds → BadRequestException
 *  7. wikiEnabled=false → ForbiddenException
 *  8. EDITOR access required — hasAccess=false → ForbiddenException
 */

import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from "@nestjs/common";
import { WikiDiffStatus } from "@prisma/client";

// ★ Mock the engine facade so we can spy on wrapExternalContent
jest.mock("../../../../ai-engine/facade", () => {
  const actual = jest.requireActual("../../../../ai-engine/facade");
  return {
    ...actual,
    wrapExternalContent: jest.fn((content: string, opts: any) => {
      return `<external_source title="${opts?.title ?? ""}" maxLength="${opts?.maxLength ?? "default"}">${content}</external_source>`;
    }),
  };
});

import { wrapExternalContent } from "../../../../ai-engine/facade";
import { WikiIngestService } from "../wiki-ingest.service";

const wrapExternalContentMock = wrapExternalContent as unknown as jest.Mock;

function makePrismaMock() {
  const prisma: any = {
    $queryRaw: jest.fn().mockResolvedValue([]),
    knowledgeBaseDocument: {
      findMany: jest.fn().mockResolvedValue([]),
    },
    wikiKnowledgeBaseConfig: {
      findUnique: jest.fn().mockResolvedValue(null),
    },
    wikiPage: {
      findMany: jest.fn().mockResolvedValue([]),
    },
    wikiDiff: {
      create: jest.fn().mockImplementation(async ({ data }: any) => ({
        id: "diff-new",
        ...data,
      })),
    },
    knowledgeBase: {
      findUnique: jest.fn().mockResolvedValue({ wikiEnabled: true }),
    },
  };
  return prisma;
}

function makeKbService(allow = true) {
  return { hasAccess: jest.fn().mockResolvedValue(allow) } as any;
}

function makeDiffService(baselineHash = "baseline-h-1") {
  return {
    computeKbBaselineHash: jest.fn().mockResolvedValue(baselineHash),
  } as any;
}

function makeChat(content: string) {
  return {
    chat: jest.fn().mockResolvedValue({
      content,
      model: "test-model",
      usage: { totalTokens: 100 },
    }),
  } as any;
}

const VALID_LLM_OUTPUT = JSON.stringify({
  creates: [
    {
      slug: "alpha-page",
      title: "Alpha",
      category: "ENTITY",
      body: "Alpha body content",
      oneLiner: "Alpha one liner",
      sources: [],
    },
  ],
  updates: [
    {
      slug: "beta-page",
      newBody: "Updated beta body",
    },
  ],
  deletes: ["gamma-page"],
});

describe("WikiIngestService", () => {
  let prisma: any;
  let kbService: any;
  let diffService: any;
  let chat: any;
  let service: WikiIngestService;

  beforeEach(() => {
    wrapExternalContentMock.mockClear();
    prisma = makePrismaMock();
    kbService = makeKbService();
    diffService = makeDiffService();
    chat = makeChat(VALID_LLM_OUTPUT);
    service = new WikiIngestService(prisma, kbService, diffService, chat);
  });

  // ─── Gate 6: empty documentIds ─────────────────────────────────────────────
  describe("input validation", () => {
    it("rejects empty documentIds with BadRequestException", async () => {
      await expect(service.ingest("u-1", "kb-1", [])).rejects.toThrow(
        BadRequestException,
      );
      // Must short-circuit BEFORE access checks / DB reads.
      expect(kbService.hasAccess).not.toHaveBeenCalled();
      expect(prisma.knowledgeBaseDocument.findMany).not.toHaveBeenCalled();
    });
  });

  // ─── Gate 8: EDITOR access ─────────────────────────────────────────────────
  describe("EDITOR access guard", () => {
    it("throws ForbiddenException when hasAccess returns false", async () => {
      kbService.hasAccess.mockResolvedValue(false);
      await expect(service.ingest("u-1", "kb-1", ["doc-1"])).rejects.toThrow(
        ForbiddenException,
      );
      expect(kbService.hasAccess).toHaveBeenCalledWith("kb-1", "u-1", "EDITOR");
      // No documents loaded if access denied.
      expect(prisma.knowledgeBaseDocument.findMany).not.toHaveBeenCalled();
    });
  });

  // ─── Gate 7: wikiEnabled=false ─────────────────────────────────────────────
  describe("wikiEnabled gate", () => {
    it("throws ForbiddenException when KB has wikiEnabled=false", async () => {
      prisma.knowledgeBase.findUnique.mockResolvedValue({
        wikiEnabled: false,
      });
      await expect(service.ingest("u-1", "kb-1", ["doc-1"])).rejects.toThrow(
        ForbiddenException,
      );
    });

    it("throws NotFoundException when KB does not exist", async () => {
      prisma.knowledgeBase.findUnique.mockResolvedValue(null);
      await expect(service.ingest("u-1", "kb-1", ["doc-1"])).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  // ─── Gate 4: cross-KB document IDOR ────────────────────────────────────────
  describe("document ownership validation", () => {
    it("throws NotFoundException when some docs do not belong to KB", async () => {
      // Caller asks for 2, prisma returns 1 (one belongs to a different KB or
      // does not exist). The where clause already filters by knowledgeBaseId,
      // so a length mismatch IS the IDOR signal.
      prisma.knowledgeBaseDocument.findMany.mockResolvedValue([
        { id: "doc-1", title: "T1", rawContent: "content-1" },
      ]);
      await expect(
        service.ingest("u-1", "kb-1", ["doc-1", "doc-2"]),
      ).rejects.toThrow(NotFoundException);

      // Confirm we DID query with knowledgeBaseId filter (defense-in-depth).
      expect(prisma.knowledgeBaseDocument.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            knowledgeBaseId: "kb-1",
            id: { in: ["doc-1", "doc-2"] },
          }),
        }),
      );
    });
  });

  // ─── Gate 1: wrapExternalContent explicit maxLength ────────────────────────
  describe("wrapExternalContent budget (security R2 P2)", () => {
    it("invokes wrapExternalContent with explicit maxLength derived from ingestMaxTokens × 4 / docCount / 2", async () => {
      // Provide explicit ingestMaxTokens=10_000 and 2 docs.
      // Expected: totalCharBudget = 10_000 × 4 = 40_000
      //           perDoc           = 40_000 / 2 = 20_000
      //           maxLength        = floor(perDoc / 2) = 10_000
      prisma.wikiKnowledgeBaseConfig.findUnique.mockResolvedValue({
        ingestMaxTokens: 10_000,
      });
      prisma.knowledgeBaseDocument.findMany.mockResolvedValue([
        { id: "doc-1", title: "Doc One", rawContent: "raw-1" },
        { id: "doc-2", title: "Doc Two", rawContent: "raw-2" },
      ]);

      await service.ingest("u-1", "kb-1", ["doc-1", "doc-2"]);

      expect(wrapExternalContentMock).toHaveBeenCalledTimes(2);
      // Both calls MUST pass an explicit maxLength (NOT default 2000).
      const [, opts1] = wrapExternalContentMock.mock.calls[0];
      const [, opts2] = wrapExternalContentMock.mock.calls[1];
      expect(opts1.maxLength).toBe(10_000);
      expect(opts2.maxLength).toBe(10_000);
      // Source / title forwarded for downstream tag-rendering.
      expect(opts1.source).toBe("kb_document");
      expect(opts1.title).toBe("Doc One");
      expect(opts2.title).toBe("Doc Two");
    });

    it("falls back to ingestMaxTokens=80_000 when no config row exists", async () => {
      // No config → default 80_000. With 1 doc:
      //   totalCharBudget = 80_000 × 4 = 320_000
      //   perDoc          = 320_000 / 1 = 320_000
      //   maxLength       = floor(320_000 / 2) = 160_000
      prisma.wikiKnowledgeBaseConfig.findUnique.mockResolvedValue(null);
      prisma.knowledgeBaseDocument.findMany.mockResolvedValue([
        { id: "doc-1", title: "Solo", rawContent: "raw-solo" },
      ]);

      await service.ingest("u-1", "kb-1", ["doc-1"]);

      expect(wrapExternalContentMock).toHaveBeenCalledTimes(1);
      const [, opts] = wrapExternalContentMock.mock.calls[0];
      expect(opts.maxLength).toBe(160_000);
      // Sanity: must NOT be the global default of 2000.
      expect(opts.maxLength).not.toBe(2000);
    });

    it("enforces a minimum maxLength of 500 chars per doc", async () => {
      // Tiny ingestMaxTokens with many docs would otherwise compute < 500.
      // Service clamps to Math.max(500, ...).
      prisma.wikiKnowledgeBaseConfig.findUnique.mockResolvedValue({
        ingestMaxTokens: 100, // 100 × 4 = 400 total chars / 1 / 2 = 200 → clamped to 500
      });
      prisma.knowledgeBaseDocument.findMany.mockResolvedValue([
        { id: "doc-1", title: "Doc", rawContent: "raw" },
      ]);

      await service.ingest("u-1", "kb-1", ["doc-1"]);

      const [, opts] = wrapExternalContentMock.mock.calls[0];
      expect(opts.maxLength).toBe(500);
    });
  });

  // ─── Gate 2: LLM schema-validation failure ─────────────────────────────────
  describe("LLM output schema validation", () => {
    it("throws BadRequestException when LLM returns malformed JSON shape", async () => {
      prisma.knowledgeBaseDocument.findMany.mockResolvedValue([
        { id: "doc-1", title: "T", rawContent: "raw" },
      ]);
      // Malformed: creates is missing required fields (title/category/body/oneLiner/sources).
      chat = makeChat(
        JSON.stringify({
          creates: [{ slug: "ok-slug" }],
          updates: [],
          deletes: [],
        }),
      );
      service = new WikiIngestService(prisma, kbService, diffService, chat);

      await expect(service.ingest("u-1", "kb-1", ["doc-1"])).rejects.toThrow(
        BadRequestException,
      );
      // No diff written when schema fails.
      expect(prisma.wikiDiff.create).not.toHaveBeenCalled();
    });

    it("throws BadRequestException with retry message when LLM call itself errors", async () => {
      prisma.knowledgeBaseDocument.findMany.mockResolvedValue([
        { id: "doc-1", title: "T", rawContent: "raw" },
      ]);
      chat = {
        chat: jest.fn().mockRejectedValue(new Error("upstream LLM 500")),
      } as any;
      service = new WikiIngestService(prisma, kbService, diffService, chat);

      await expect(service.ingest("u-1", "kb-1", ["doc-1"])).rejects.toThrow(
        /Wiki ingest LLM call failed; please retry/,
      );
    });

    it("throws BadRequestException when LLM output is not even valid JSON", async () => {
      prisma.knowledgeBaseDocument.findMany.mockResolvedValue([
        { id: "doc-1", title: "T", rawContent: "raw" },
      ]);
      // extractJson yields {} on parse failure → schema parse fails.
      chat = makeChat("not json at all, just prose");
      service = new WikiIngestService(prisma, kbService, diffService, chat);

      await expect(service.ingest("u-1", "kb-1", ["doc-1"])).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  // ─── Gate 3: baselineHash deterministic ────────────────────────────────────
  describe("baselineHash determinism", () => {
    it("produces the same baselineHash on two ingests over identical KB state", async () => {
      prisma.knowledgeBaseDocument.findMany.mockResolvedValue([
        { id: "doc-1", title: "T", rawContent: "raw" },
      ]);

      const diff1 = await service.ingest("u-1", "kb-1", ["doc-1"]);
      const diff2 = await service.ingest("u-1", "kb-1", ["doc-1"]);

      // diffService.computeKbBaselineHash returns the same value for identical
      // KB state (same wikiPage rows). We assert determinism by checking that
      // both calls observed the same hash.
      expect(diffService.computeKbBaselineHash).toHaveBeenCalledTimes(2);
      expect((diff1 as any).baselineHash).toBe("baseline-h-1");
      expect((diff2 as any).baselineHash).toBe("baseline-h-1");
      expect((diff1 as any).baselineHash).toBe((diff2 as any).baselineHash);
    });
  });

  // ─── Gate 5: PENDING diff with affectedSlugs from validated items ──────────
  describe("PENDING WikiDiff persistence", () => {
    it("persists PENDING diff with affectedSlugs deduped from creates+updates+deletes", async () => {
      prisma.knowledgeBaseDocument.findMany.mockResolvedValue([
        { id: "doc-1", title: "T", rawContent: "raw" },
      ]);
      // LLM returns overlapping slugs to assert dedup behavior.
      chat = makeChat(
        JSON.stringify({
          creates: [
            {
              slug: "alpha-page",
              title: "Alpha",
              category: "ENTITY",
              body: "body",
              oneLiner: "one",
              sources: [],
            },
          ],
          updates: [
            { slug: "beta-page", newBody: "new beta body" },
            // Overlap with creates — must dedupe.
            { slug: "alpha-page", newBody: "should-dedupe" },
          ],
          deletes: ["gamma-page", "beta-page"], // beta overlaps with updates
        }),
      );
      service = new WikiIngestService(prisma, kbService, diffService, chat);

      const result = await service.ingest("u-1", "kb-1", ["doc-1"]);

      expect(prisma.wikiDiff.create).toHaveBeenCalledTimes(1);
      const [createArgs] = prisma.wikiDiff.create.mock.calls[0];
      expect(createArgs.data.status).toBe(WikiDiffStatus.PENDING);
      expect(createArgs.data.knowledgeBaseId).toBe("kb-1");
      expect(createArgs.data.createdByUserId).toBe("u-1");
      expect(createArgs.data.baselineHash).toBe("baseline-h-1");
      // Deduped union: alpha + beta + gamma (3 unique slugs)
      expect(new Set(createArgs.data.affectedSlugs)).toEqual(
        new Set(["alpha-page", "beta-page", "gamma-page"]),
      );
      expect(createArgs.data.affectedSlugs).toHaveLength(3);
      // Returned object carries the diff id.
      expect((result as any).id).toBe("diff-new");
    });

    it("strips fenced ```json blocks before schema-parsing LLM output", async () => {
      prisma.knowledgeBaseDocument.findMany.mockResolvedValue([
        { id: "doc-1", title: "T", rawContent: "raw" },
      ]);
      chat = makeChat(
        "```json\n" +
          JSON.stringify({
            creates: [
              {
                slug: "fenced-slug",
                title: "F",
                category: "CONCEPT",
                body: "b",
                oneLiner: "o",
                sources: [],
              },
            ],
            updates: [],
            deletes: [],
          }) +
          "\n```",
      );
      service = new WikiIngestService(prisma, kbService, diffService, chat);

      await service.ingest("u-1", "kb-1", ["doc-1"]);

      const [createArgs] = prisma.wikiDiff.create.mock.calls[0];
      expect(createArgs.data.affectedSlugs).toEqual(["fenced-slug"]);
    });
  });

  // ─── BLOCKED gate: now content-based, NOT chunking-based ─────────────────
  //
  // Wiki ingest only consumes rawContent — it never reads chunks or
  // embeddings. So a doc that has rawContent but is still PENDING (because
  // the user hasn't clicked the KB-level "向量化" button) must be ingestable.
  // The gate is: ERROR → BLOCKED, pendingFetch placeholder → BLOCKED, else
  // READY_NEW / STALE / COVERED based on wiki page reference history.
  describe("listIngestCandidates — content-availability gate", () => {
    function mockKbReady() {
      prisma.knowledgeBase.findUnique.mockResolvedValue({ wikiEnabled: true });
    }

    it("PENDING doc with real rawContent is READY_NEW (was BLOCKED before)", async () => {
      mockKbReady();
      prisma.knowledgeBaseDocument.findMany.mockResolvedValue([
        {
          id: "doc-pending",
          title: "Real upload",
          sourceType: "MANUAL",
          mimeType: "text/plain",
          status: "PENDING", // user has NOT clicked 向量化
          createdAt: new Date(),
          updatedAt: new Date(),
          processedAt: null,
          chunkCount: 0,
          lastError: null,
          metadata: {},
          rawContentUri: null,
        },
      ]);

      const result = await service.listIngestCandidates("u-1", "kb-1");

      expect(result).toHaveLength(1);
      expect(result[0].ingestState).toBe("READY_NEW");
      expect(result[0].recommended).toBe(true);
    });

    it("placeholder doc (metadata.pendingFetch=true) stays BLOCKED", async () => {
      mockKbReady();
      prisma.knowledgeBaseDocument.findMany.mockResolvedValue([
        {
          id: "doc-pending-fetch",
          title: "Awaiting Notion sync",
          sourceType: "NOTION",
          mimeType: null,
          status: "PENDING",
          createdAt: new Date(),
          updatedAt: new Date(),
          processedAt: null,
          chunkCount: 0,
          lastError: null,
          metadata: { pendingFetch: true, externalSource: "NOTION" },
          rawContentUri: null,
        },
      ]);

      const result = await service.listIngestCandidates("u-1", "kb-1");

      expect(result[0].ingestState).toBe("BLOCKED");
      expect(result[0].reason).toContain("not been fetched yet");
    });

    it("ERROR doc stays BLOCKED with the existing reason", async () => {
      mockKbReady();
      prisma.knowledgeBaseDocument.findMany.mockResolvedValue([
        {
          id: "doc-broken",
          title: "Broken parser",
          sourceType: "MANUAL",
          mimeType: "application/pdf",
          status: "ERROR",
          createdAt: new Date(),
          updatedAt: new Date(),
          processedAt: null,
          chunkCount: 0,
          lastError: "PDF parser crashed",
          metadata: {},
          rawContentUri: null,
        },
      ]);

      const result = await service.listIngestCandidates("u-1", "kb-1");

      expect(result[0].ingestState).toBe("BLOCKED");
      expect(result[0].reason).toContain("processing failed");
    });

    it("off-loaded doc (rawContentUri set) is treated as ready even if metadata is missing", async () => {
      mockKbReady();
      prisma.knowledgeBaseDocument.findMany.mockResolvedValue([
        {
          id: "doc-offloaded",
          title: "Big PDF in R2",
          sourceType: "MANUAL",
          mimeType: "application/pdf",
          status: "PENDING",
          createdAt: new Date(),
          updatedAt: new Date(),
          processedAt: null,
          chunkCount: 0,
          lastError: null,
          metadata: null,
          rawContentUri: "s3://bucket/kb-1/doc-offloaded.txt",
        },
      ]);

      const result = await service.listIngestCandidates("u-1", "kb-1");

      expect(result[0].ingestState).toBe("READY_NEW");
    });
  });
});
