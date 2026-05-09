/**
 * WikiDiffService spec — v1.5.3 P1 critical security paths
 *
 * Mocks PrismaService + KnowledgeBaseService; focuses on:
 *  - cross-KB diff IDOR returns 404 (not 403) per v1.5.3 §6
 *  - dismiss requires PENDING status; double-dismiss → 409
 *  - apply zod parse failure → 403 ForbiddenException
 *  - apply with no items → no-op APPLIED (not transaction failure)
 *  - apply collision against other PENDING diff → 409
 *  - apply baseline mismatch → CONFLICTED + 409
 *  - access checks (VIEWER for getDiff, EDITOR + wikiEnabled for write)
 */

import {
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from "@nestjs/common";
import { WikiDiffService } from "../wiki-diff.service";
import { WikiDiffStatus } from "@prisma/client";

function makePrismaMock() {
  const tx: any = {
    wikiPage: {
      findMany: jest.fn().mockResolvedValue([]),
      findUnique: jest.fn(),
      upsert: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      create: jest.fn(),
    },
    wikiPageRevision: {
      create: jest.fn().mockResolvedValue({ id: "rev-1" }),
      updateMany: jest.fn().mockResolvedValue({ count: 0 }),
    },
    wikiPageLink: {
      deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
      createMany: jest.fn().mockResolvedValue({ count: 0 }),
    },
    wikiPageSource: {
      deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
      createMany: jest.fn().mockResolvedValue({ count: 0 }),
    },
    wikiOperationLog: {
      create: jest.fn().mockResolvedValue({ id: "op-1" }),
    },
    wikiOperationLogPage: {
      createMany: jest.fn().mockResolvedValue({ count: 0 }),
    },
    wikiDiff: {
      update: jest.fn().mockImplementation(async ({ data }: any) => ({
        id: "diff-1",
        knowledgeBaseId: "kb-1",
        status: data.status ?? "PENDING",
        ...data,
      })),
    },
    $queryRaw: jest.fn().mockResolvedValue([]),
  };

  const prisma: any = {
    wikiDiff: {
      findUnique: jest.fn(),
      findMany: jest.fn().mockResolvedValue([]),
      update: jest.fn().mockImplementation(async ({ data }: any) => ({
        id: "diff-1",
        knowledgeBaseId: "kb-1",
        status: data.status ?? "PENDING",
      })),
      create: jest.fn(),
    },
    wikiPage: { findMany: jest.fn().mockResolvedValue([]) },
    knowledgeBase: { findUnique: jest.fn() },
    $transaction: jest.fn().mockImplementation(async (fn: any) => fn(tx)),
  };

  return { prisma, tx };
}

function makeKbService() {
  return {
    hasAccess: jest.fn().mockResolvedValue(true),
  } as any;
}

function makePageService() {
  return {
    hashBody: (b: string) => `hash-${b.length}`,
    replaceOutboundLinks: jest.fn().mockResolvedValue(undefined),
  } as any;
}

describe("WikiDiffService", () => {
  let service: WikiDiffService;
  let prisma: any;
  let kbService: any;

  beforeEach(() => {
    const m = makePrismaMock();
    prisma = m.prisma;
    kbService = makeKbService();
    service = new WikiDiffService(prisma, kbService, makePageService());
  });

  describe("getDiff IDOR (v1.5.3 §6)", () => {
    it("returns 404 when diff does not exist", async () => {
      prisma.wikiDiff.findUnique.mockResolvedValue(null);
      await expect(
        service.getDiff("user-1", "kb-1", "missing"),
      ).rejects.toThrow(NotFoundException);
    });

    it("returns 404 (NOT 403) when diff belongs to a DIFFERENT KB", async () => {
      prisma.wikiDiff.findUnique.mockResolvedValue({
        id: "diff-1",
        knowledgeBaseId: "kb-OTHER",
        status: WikiDiffStatus.PENDING,
      });
      // user has access to kb-1 (mock returns true)
      await expect(service.getDiff("user-1", "kb-1", "diff-1")).rejects.toThrow(
        NotFoundException,
      );
    });

    it("returns the diff when KB matches and user has VIEWER access", async () => {
      prisma.wikiDiff.findUnique.mockResolvedValue({
        id: "diff-1",
        knowledgeBaseId: "kb-1",
        status: WikiDiffStatus.PENDING,
      });
      const result = await service.getDiff("user-1", "kb-1", "diff-1");
      expect(result.id).toBe("diff-1");
    });

    it("throws Forbidden when VIEWER access is denied", async () => {
      kbService.hasAccess.mockResolvedValue(false);
      await expect(service.getDiff("user-1", "kb-1", "diff-1")).rejects.toThrow(
        ForbiddenException,
      );
    });
  });

  describe("dismissDiff", () => {
    beforeEach(() => {
      prisma.knowledgeBase.findUnique.mockResolvedValue({ wikiEnabled: true });
    });

    it("404 on cross-KB diff", async () => {
      prisma.wikiDiff.findUnique.mockResolvedValue({
        id: "d1",
        knowledgeBaseId: "kb-OTHER",
        status: WikiDiffStatus.PENDING,
      });
      await expect(service.dismissDiff("user-1", "kb-1", "d1")).rejects.toThrow(
        NotFoundException,
      );
    });

    it("409 on already-applied diff", async () => {
      prisma.wikiDiff.findUnique.mockResolvedValue({
        id: "d1",
        knowledgeBaseId: "kb-1",
        status: WikiDiffStatus.APPLIED,
      });
      await expect(service.dismissDiff("user-1", "kb-1", "d1")).rejects.toThrow(
        ConflictException,
      );
    });

    it("requires wikiEnabled=true for write access", async () => {
      prisma.knowledgeBase.findUnique.mockResolvedValue({ wikiEnabled: false });
      prisma.wikiDiff.findUnique.mockResolvedValue({
        id: "d1",
        knowledgeBaseId: "kb-1",
        status: WikiDiffStatus.PENDING,
      });
      await expect(service.dismissDiff("user-1", "kb-1", "d1")).rejects.toThrow(
        ForbiddenException,
      );
    });

    it("dismisses a PENDING diff", async () => {
      prisma.wikiDiff.findUnique.mockResolvedValue({
        id: "d1",
        knowledgeBaseId: "kb-1",
        status: WikiDiffStatus.PENDING,
      });
      await service.dismissDiff("user-1", "kb-1", "d1");
      expect(prisma.wikiDiff.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: "d1" },
          data: expect.objectContaining({ status: WikiDiffStatus.DISMISSED }),
        }),
      );
    });
  });

  describe("applyDiff zod / collision / no-op paths", () => {
    beforeEach(() => {
      prisma.knowledgeBase.findUnique.mockResolvedValue({ wikiEnabled: true });
    });

    it("rejects with 403 when items fail schema validation (illegal slug)", async () => {
      prisma.wikiDiff.findUnique.mockResolvedValue({
        id: "d1",
        knowledgeBaseId: "kb-1",
        status: WikiDiffStatus.PENDING,
        baselineHash: "h",
        items: {
          creates: [
            {
              slug: "INVALID UPPERCASE",
              title: "x",
              category: "ENTITY",
              body: "x",
              oneLiner: "y",
              sources: [],
            },
          ],
          updates: [],
          deletes: [],
        },
      });
      await expect(service.applyDiff("user-1", "kb-1", "d1")).rejects.toThrow(
        ForbiddenException,
      );
    });

    it("returns APPLIED no-op when no items match selection", async () => {
      prisma.wikiDiff.findUnique.mockResolvedValue({
        id: "d1",
        knowledgeBaseId: "kb-1",
        status: WikiDiffStatus.PENDING,
        baselineHash: "h",
        items: {
          creates: [
            {
              slug: "page-a",
              title: "A",
              category: "ENTITY",
              body: "x",
              oneLiner: "y",
              sources: [],
            },
          ],
          updates: [],
          deletes: [],
        },
      });
      const result = await service.applyDiff("user-1", "kb-1", "d1", [
        "nonexistent-slug",
      ]);
      expect(result.status).toBe(WikiDiffStatus.APPLIED);
      // Did NOT enter the transaction (no $transaction call needed for no-op)
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it("409 on slug collision with another PENDING diff (live recompute, NOT DB column)", async () => {
      prisma.wikiDiff.findUnique.mockResolvedValue({
        id: "d1",
        knowledgeBaseId: "kb-1",
        status: WikiDiffStatus.PENDING,
        baselineHash: "h",
        items: {
          creates: [
            {
              slug: "shared-slug",
              title: "T",
              category: "CONCEPT",
              body: "x",
              oneLiner: "y",
              sources: [],
            },
          ],
          updates: [],
          deletes: [],
        },
      });
      prisma.wikiDiff.findMany.mockResolvedValue([
        {
          id: "d2",
          // affectedSlugs DB column is intentionally empty → must be ignored
          // and recomputed from items
          items: {
            creates: [],
            updates: [
              {
                slug: "shared-slug",
                newBody: "z",
              },
            ],
            deletes: [],
          },
        },
      ]);
      await expect(service.applyDiff("user-1", "kb-1", "d1")).rejects.toThrow(
        ConflictException,
      );
    });

    it("404 when diff is in a different KB (IDOR)", async () => {
      prisma.wikiDiff.findUnique.mockResolvedValue({
        id: "d1",
        knowledgeBaseId: "kb-OTHER",
        status: WikiDiffStatus.PENDING,
        baselineHash: "h",
        items: { creates: [], updates: [], deletes: [] },
      });
      await expect(service.applyDiff("user-1", "kb-1", "d1")).rejects.toThrow(
        NotFoundException,
      );
    });
  });
});
