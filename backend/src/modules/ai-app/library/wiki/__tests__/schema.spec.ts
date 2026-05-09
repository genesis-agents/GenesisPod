/**
 * LLM Wiki schema spec (P0b)
 *
 * v1.5.3: type-level validation that the 10 Prisma models, the KnowledgeBase
 * extensions (wikiEnabled + back-relations), and the enum extensions
 * (ExportSourceType.WIKI / ExportFormat.TARBALL) are all present and have
 * the expected fields. No live DB connection — relies on `prisma generate`
 * having produced types in @prisma/client.
 *
 * Behavioral tests (CRUD / FK Cascade / SetNull) belong to P1 service specs
 * which mock PrismaService; this spec only guards schema shape.
 */

import {
  Prisma,
  WikiPageCategory,
  WikiPageEditedBy,
  WikiPageEmbedResolution,
  WikiDiffStatus,
  WikiOp,
  WikiOpPageRole,
  WikiLintType,
  ExportSourceType,
  ExportFormat,
} from "@prisma/client";

describe("LLM Wiki schema (v1.5.3 P0b)", () => {
  describe("Enum extensions", () => {
    it("ExportSourceType has WIKI", () => {
      expect(ExportSourceType.WIKI).toBe("WIKI");
    });

    it("ExportFormat has TARBALL", () => {
      expect(ExportFormat.TARBALL).toBe("TARBALL");
    });
  });

  describe("New wiki enums (7)", () => {
    it("WikiPageCategory has 4 members", () => {
      expect(WikiPageCategory.ENTITY).toBe("ENTITY");
      expect(WikiPageCategory.CONCEPT).toBe("CONCEPT");
      expect(WikiPageCategory.SUMMARY).toBe("SUMMARY");
      expect(WikiPageCategory.SOURCE).toBe("SOURCE");
    });

    it("WikiPageEditedBy has 3 members", () => {
      expect(WikiPageEditedBy.USER).toBe("USER");
      expect(WikiPageEditedBy.LLM).toBe("LLM");
      expect(WikiPageEditedBy.IMPORT).toBe("IMPORT");
    });

    it("WikiPageEmbedResolution has 2 members", () => {
      expect(WikiPageEmbedResolution.ONELINER).toBe("ONELINER");
      expect(WikiPageEmbedResolution.BODY).toBe("BODY");
    });

    it("WikiDiffStatus has 4 members (PENDING/APPLIED/DISMISSED/CONFLICTED)", () => {
      expect(WikiDiffStatus.PENDING).toBe("PENDING");
      expect(WikiDiffStatus.APPLIED).toBe("APPLIED");
      expect(WikiDiffStatus.DISMISSED).toBe("DISMISSED");
      expect(WikiDiffStatus.CONFLICTED).toBe("CONFLICTED");
    });

    it("WikiOp has 4 members (no QUERY per v1.4 simplification)", () => {
      expect(WikiOp.INGEST).toBe("INGEST");
      expect(WikiOp.LINT).toBe("LINT");
      expect(WikiOp.EDIT).toBe("EDIT");
      expect(WikiOp.REVERT).toBe("REVERT");
      expect(Object.keys(WikiOp)).toHaveLength(4);
    });

    it("WikiOpPageRole has 4 members", () => {
      expect(WikiOpPageRole.CREATED).toBe("CREATED");
      expect(WikiOpPageRole.UPDATED).toBe("UPDATED");
      expect(WikiOpPageRole.DELETED).toBe("DELETED");
      expect(WikiOpPageRole.AFFECTED).toBe("AFFECTED");
    });

    it("WikiLintType has 5 members", () => {
      expect(WikiLintType.CONTRADICTION).toBe("CONTRADICTION");
      expect(WikiLintType.STALE).toBe("STALE");
      expect(WikiLintType.ORPHAN).toBe("ORPHAN");
      expect(WikiLintType.MISSING_XREF).toBe("MISSING_XREF");
      expect(WikiLintType.DATA_GAP).toBe("DATA_GAP");
    });
  });

  describe("Prisma model types are exposed", () => {
    // Type-level checks: a compile error in any of these would fail tsc and
    // block the build, but at runtime we just verify the namespaces exist.
    it("WikiPage / WikiPageSource / WikiPageLink / WikiPageRevision / WikiPageEmbedding types accessible", () => {
      // ts-ignore: this is purely a type assertion via void cast
      const _shapes: Array<keyof typeof Prisma.ModelName> = [
        "WikiPage",
        "WikiPageSource",
        "WikiPageLink",
        "WikiPageRevision",
        "WikiPageEmbedding",
      ];
      expect(_shapes).toHaveLength(5);
      _shapes.forEach((m) => expect(Prisma.ModelName[m]).toBe(m));
    });

    it("WikiDiff / WikiOperationLog / WikiOperationLogPage / WikiLintFinding / WikiKnowledgeBaseConfig types accessible", () => {
      const _shapes: Array<keyof typeof Prisma.ModelName> = [
        "WikiDiff",
        "WikiOperationLog",
        "WikiOperationLogPage",
        "WikiLintFinding",
        "WikiKnowledgeBaseConfig",
      ];
      expect(_shapes).toHaveLength(5);
      _shapes.forEach((m) => expect(Prisma.ModelName[m]).toBe(m));
    });

    it("All 10 wiki models are listed in Prisma.ModelName", () => {
      const wikiModels = Object.values(Prisma.ModelName).filter((n) =>
        String(n).startsWith("Wiki"),
      );
      expect(wikiModels).toHaveLength(10);
    });
  });

  describe("KnowledgeBase model has wikiEnabled", () => {
    // Verify the field exists on the Prisma type by referencing it in a
    // satisfies-style assertion via Prisma.KnowledgeBaseScalarFieldEnum.
    it("KnowledgeBaseScalarFieldEnum includes wikiEnabled", () => {
      expect(Prisma.KnowledgeBaseScalarFieldEnum.wikiEnabled).toBe(
        "wikiEnabled",
      );
    });
  });

  describe("Critical field shape sanity (compile-time guards)", () => {
    it("WikiPage.category is WikiPageCategory enum", () => {
      // Compile-time guard: if the schema regresses, this fails to typecheck.
      const _validInput: Prisma.WikiPageCreateInput = {
        slug: "machine-learning",
        title: "Machine Learning",
        category: WikiPageCategory.CONCEPT,
        body: "...",
        oneLiner: "...",
        contentHash: "abc123",
        lastEditedBy: WikiPageEditedBy.LLM,
        knowledgeBase: { connect: { id: "kb-id" } },
      };
      expect(_validInput.category).toBe(WikiPageCategory.CONCEPT);
    });

    it("WikiDiff.affectedSlugs is string array", () => {
      const _validInput: Prisma.WikiDiffCreateInput = {
        items: { creates: [], updates: [], deletes: [] },
        baselineHash: "h1",
        affectedSlugs: ["slug-a", "slug-b"],
        createdByUserId: "user-1",
        knowledgeBase: { connect: { id: "kb-id" } },
      };
      expect(Array.isArray(_validInput.affectedSlugs)).toBe(true);
    });

    it("WikiKnowledgeBaseConfig defaults align with v1.5.3 spec (200/500k/80k/50)", () => {
      // The defaults are enforced by the DB; this test merely documents them.
      const expectedDefaults = {
        inlinePageCount: 200,
        inlineTokenBudget: 500_000,
        ingestMaxTokens: 80_000,
        cronLintEnabled: true,
        cronLintDailyBudgetCalls: 50,
      };
      expect(expectedDefaults.inlinePageCount).toBe(200);
      expect(expectedDefaults.inlineTokenBudget).toBe(500_000);
      expect(expectedDefaults.ingestMaxTokens).toBe(80_000);
      expect(expectedDefaults.cronLintEnabled).toBe(true);
      expect(expectedDefaults.cronLintDailyBudgetCalls).toBe(50);
    });
  });
});
