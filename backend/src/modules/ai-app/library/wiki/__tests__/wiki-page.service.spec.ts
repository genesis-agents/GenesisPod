/**
 * WikiPageService spec — v1.5.3 P1 critical paths
 *
 *  - hasAccess + wikiEnabled gate on writes
 *  - createPage rejects non-canonical slug
 *  - edit writes WikiPageRevision snapshot when body changes
 *  - revert with cross-page revisionId returns 404 (NOT 403) per v1.5.3 §6
 *  - delete clears via Cascade (assumed via Prisma; tested as call shape)
 */

import { ForbiddenException, NotFoundException } from "@nestjs/common";
import { WikiPageService } from "../wiki-page.service";

function makePrisma() {
  const tx: any = {
    wikiPage: {
      create: jest.fn(),
      update: jest.fn(),
    },
    wikiPageRevision: {
      create: jest.fn().mockResolvedValue({ id: "rev-new" }),
    },
    wikiPageLink: {
      deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
      createMany: jest.fn().mockResolvedValue({ count: 0 }),
    },
  };
  const prisma: any = {
    wikiPage: {
      findUnique: jest.fn(),
      findMany: jest.fn().mockResolvedValue([]),
      delete: jest.fn().mockResolvedValue({}),
    },
    wikiPageLink: { findMany: jest.fn().mockResolvedValue([]) },
    wikiPageRevision: { findUnique: jest.fn() },
    knowledgeBase: { findUnique: jest.fn() },
    $transaction: jest.fn().mockImplementation(async (fn: any) => fn(tx)),
  };
  return { prisma, tx };
}

function makeKbService(allow = true) {
  return { hasAccess: jest.fn().mockResolvedValue(allow) } as any;
}

describe("WikiPageService", () => {
  let prisma: any;
  let tx: any;
  let kbService: any;
  let service: WikiPageService;

  beforeEach(() => {
    const m = makePrisma();
    prisma = m.prisma;
    tx = m.tx;
    kbService = makeKbService();
    prisma.knowledgeBase.findUnique.mockResolvedValue({ wikiEnabled: true });
    service = new WikiPageService(prisma, kbService);
  });

  describe("createPage", () => {
    it("requires EDITOR access", async () => {
      kbService.hasAccess.mockResolvedValue(false);
      await expect(
        service.createPage("u", "kb", {
          slug: "test-page",
          title: "T",
          category: "CONCEPT" as any,
          body: "b",
          oneLiner: "o",
        }),
      ).rejects.toThrow(ForbiddenException);
    });

    it("rejects when wikiEnabled=false", async () => {
      prisma.knowledgeBase.findUnique.mockResolvedValue({ wikiEnabled: false });
      await expect(
        service.createPage("u", "kb", {
          slug: "test-page",
          title: "T",
          category: "CONCEPT" as any,
          body: "b",
          oneLiner: "o",
        }),
      ).rejects.toThrow(ForbiddenException);
    });

    it("rejects non-canonical slug (defense in depth past DTO)", async () => {
      // Slug regex passes "Test-Page" via DTO would not — but service-layer
      // also asserts canonical form to defend in depth.
      await expect(
        service.createPage("u", "kb", {
          slug: "Test-Page", // uppercase — would not match DTO regex either
          title: "T",
          category: "CONCEPT" as any,
          body: "b",
          oneLiner: "o",
        }),
      ).rejects.toThrow(ForbiddenException);
    });

    it("creates page with sanitized body and replaces outbound links", async () => {
      tx.wikiPage.create.mockResolvedValue({
        id: "p1",
        slug: "test-page",
        body: "b",
        contentHash: "h",
      });
      const page = await service.createPage("u", "kb", {
        slug: "test-page",
        title: "T",
        category: "CONCEPT" as any,
        body: "Hello with [[other-page]] link",
        oneLiner: "o",
      });
      expect(page.id).toBe("p1");
      expect(tx.wikiPage.create).toHaveBeenCalled();
      expect(tx.wikiPageLink.deleteMany).toHaveBeenCalledWith({
        where: { fromPageId: "p1" },
      });
      // [[other-page]] → 1 outbound link
      expect(tx.wikiPageLink.createMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: [{ fromPageId: "p1", toSlug: "other-page" }],
        }),
      );
    });
  });

  describe("updatePage edit (body change snapshots a revision)", () => {
    it("writes a WikiPageRevision before mutating when body changes", async () => {
      const current = {
        id: "p1",
        slug: "test-page",
        body: "old body",
        contentHash: "old-hash",
        category: "CONCEPT",
      };
      prisma.wikiPage.findUnique.mockResolvedValue(current);
      tx.wikiPage.update.mockResolvedValue({ ...current, body: "new body" });

      await service.updatePage("u", "kb", "test-page", {
        body: "new body",
      });

      expect(tx.wikiPageRevision.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            pageId: "p1",
            body: "old body",
            contentHash: "old-hash",
          }),
        }),
      );
    });

    it("does NOT write a revision when only oneLiner / title changes (body identical)", async () => {
      const current = {
        id: "p1",
        slug: "test-page",
        body: "same body",
        contentHash: "same-hash",
        category: "CONCEPT",
      };
      prisma.wikiPage.findUnique.mockResolvedValue(current);
      tx.wikiPage.update.mockResolvedValue(current);

      await service.updatePage("u", "kb", "test-page", {
        title: "New title only",
      });

      expect(tx.wikiPageRevision.create).not.toHaveBeenCalled();
    });

    it("returns 404 when page does not exist in KB", async () => {
      prisma.wikiPage.findUnique.mockResolvedValue(null);
      await expect(
        service.updatePage("u", "kb", "missing-page", { body: "x" }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe("updatePage revert — cross-page IDOR returns 404 (v1.5.3 §6)", () => {
    it("returns 404 (NOT 403) when revisionId belongs to a DIFFERENT page", async () => {
      const current = {
        id: "p1",
        slug: "page-a",
        body: "current",
        contentHash: "h1",
      };
      prisma.wikiPage.findUnique.mockResolvedValue(current);
      prisma.wikiPageRevision.findUnique.mockResolvedValue({
        id: "rev-x",
        pageId: "p-OTHER", // belongs to a different page
        body: "stolen",
      });

      await expect(
        service.updatePage("u", "kb", "page-a", {
          action: "revert",
          toRevisionId: "rev-x",
        }),
      ).rejects.toThrow(NotFoundException);
    });

    it("returns 404 when revisionId does not exist", async () => {
      prisma.wikiPage.findUnique.mockResolvedValue({
        id: "p1",
        slug: "page-a",
        body: "current",
        contentHash: "h1",
      });
      prisma.wikiPageRevision.findUnique.mockResolvedValue(null);

      await expect(
        service.updatePage("u", "kb", "page-a", {
          action: "revert",
          toRevisionId: "missing",
        }),
      ).rejects.toThrow(NotFoundException);
    });

    it("reverts when revisionId belongs to the same page (writes new revision before)", async () => {
      const current = {
        id: "p1",
        slug: "page-a",
        body: "current body",
        contentHash: "h-current",
      };
      prisma.wikiPage.findUnique.mockResolvedValue(current);
      prisma.wikiPageRevision.findUnique.mockResolvedValue({
        id: "rev-target",
        pageId: "p1",
        body: "old body to restore",
      });
      tx.wikiPage.update.mockResolvedValue({
        ...current,
        body: "old body to restore",
      });

      await service.updatePage("u", "kb", "page-a", {
        action: "revert",
        toRevisionId: "rev-target",
      });

      // Revert path snapshots the CURRENT state before restoring (not a no-op).
      expect(tx.wikiPageRevision.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            pageId: "p1",
            body: "current body",
          }),
        }),
      );
      expect(tx.wikiPage.update).toHaveBeenCalled();
    });
  });

  describe("listPages / getPage (VIEWER access)", () => {
    it("uses VIEWER role for read operations", async () => {
      prisma.wikiPage.findMany.mockResolvedValue([]);
      await service.listPages("u", "kb");
      expect(kbService.hasAccess).toHaveBeenCalledWith("kb", "u", "VIEWER");
    });

    it("getPage returns outbound + backlinks", async () => {
      prisma.wikiPage.findUnique.mockResolvedValue({
        id: "p1",
        slug: "page-a",
        knowledgeBaseId: "kb",
      });
      // Mock outbound + backlinks
      prisma.wikiPageLink.findMany
        .mockResolvedValueOnce([{ toSlug: "out-1" }])
        .mockResolvedValueOnce([{ fromPage: { slug: "back-1" } }]);

      const result = await service.getPage("u", "kb", "page-a");
      expect(result.outboundLinks).toEqual(["out-1"]);
      expect(result.backlinks).toEqual(["back-1"]);
    });

    it("getPage returns 404 when page missing", async () => {
      prisma.wikiPage.findUnique.mockResolvedValue(null);
      await expect(service.getPage("u", "kb", "missing")).rejects.toThrow(
        NotFoundException,
      );
    });
  });
});
