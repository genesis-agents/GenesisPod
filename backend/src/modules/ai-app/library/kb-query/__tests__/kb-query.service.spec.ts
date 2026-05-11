/**
 * KbQueryService spec — wiki-aware KB query facade (PR-2).
 *
 * Routing matrix exercised:
 *   - non-wiki KB                    → straight chunk-RAG passthrough
 *   - wiki KB + confident wiki hit   → wiki short-circuit (no chunk RAG call)
 *   - wiki KB + low-score hits       → fallback to chunk RAG
 *   - wiki KB + zero hits            → fallback to chunk RAG
 *   - response shape parity (wiki short-circuit produces the same
 *     RAGResponse fields consumers already render: context.text /
 *     context.sources[].documentTitle/excerpt/score / searchResults)
 *   - wiki search failure does not block fallback to chunk RAG
 */

import { KbQueryService } from "../kb-query.service";

function makePrismaMock() {
  return {
    knowledgeBase: { findMany: jest.fn() },
  } as any;
}

function makeWikiProviderMock() {
  return { search: jest.fn() } as any;
}

function makeRagPipelineMock() {
  return {
    query: jest.fn().mockResolvedValue({
      context: { text: "[chunk-rag context]", sources: [], totalTokens: 100 },
      searchResults: [],
      processingTime: { search: 5, total: 5 },
      quality: "full",
    }),
  } as any;
}

function strongWikiHit(score: number, slug = "alpha") {
  return {
    pageId: `p-${slug}`,
    slug,
    title: `Title ${slug}`,
    oneLiner: `Summary of ${slug}`,
    body: `Long markdown body about ${slug}.`,
    category: "ENTITY",
    score,
    sources: [
      { documentId: `doc-${slug}`, spanStart: 0, spanEnd: 10, quote: "x" },
    ],
  };
}

describe("KbQueryService", () => {
  let prisma: any;
  let wiki: any;
  let rag: any;
  let service: KbQueryService;

  beforeEach(() => {
    prisma = makePrismaMock();
    wiki = makeWikiProviderMock();
    rag = makeRagPipelineMock();
    service = new KbQueryService(prisma, wiki, rag);
  });

  it("falls through to chunk RAG when no KB has wikiEnabled", async () => {
    prisma.knowledgeBase.findMany.mockResolvedValue([]); // no wiki-enabled rows

    const response = await service.query({
      query: "what is X",
      knowledgeBaseIds: ["kb-1", "kb-2"],
    });

    expect(wiki.search).not.toHaveBeenCalled();
    expect(rag.query).toHaveBeenCalledWith({
      query: "what is X",
      knowledgeBaseIds: ["kb-1", "kb-2"],
    });
    expect(response.context.text).toBe("[chunk-rag context]");
  });

  it("short-circuits to wiki when wiki returns confident hits", async () => {
    prisma.knowledgeBase.findMany.mockResolvedValue([{ id: "kb-1" }]);
    wiki.search.mockResolvedValue([
      strongWikiHit(2.5, "alpha"),
      strongWikiHit(1.0, "beta"),
    ]);

    const response = await service.query({
      query: "tell me about alpha",
      knowledgeBaseIds: ["kb-1"],
    });

    expect(rag.query).not.toHaveBeenCalled();
    expect(response.context.sources).toHaveLength(2);
    expect(response.context.sources[0].documentTitle).toBe("Title alpha");
    expect(response.context.sources[0].metadata?.source).toBe("wiki");
    expect(response.searchResults[0].metadata?.source).toBe("wiki");
  });

  it("falls back to chunk RAG when wiki hits are below the cumulative threshold", async () => {
    prisma.knowledgeBase.findMany.mockResolvedValue([{ id: "kb-1" }]);
    // Top score < 0.5 minimum → confidence gate fails.
    wiki.search.mockResolvedValue([strongWikiHit(0.2, "vague")]);

    const response = await service.query({
      query: "fuzzy question",
      knowledgeBaseIds: ["kb-1"],
    });

    expect(rag.query).toHaveBeenCalled();
    expect(response.context.text).toBe("[chunk-rag context]");
  });

  it("falls back to chunk RAG when wiki returns zero hits", async () => {
    prisma.knowledgeBase.findMany.mockResolvedValue([{ id: "kb-1" }]);
    wiki.search.mockResolvedValue([]);

    const response = await service.query({
      query: "no hits",
      knowledgeBaseIds: ["kb-1"],
    });

    expect(rag.query).toHaveBeenCalled();
    expect(response.context.text).toBe("[chunk-rag context]");
  });

  it("merges wiki hits across multiple wiki-enabled KBs and re-sorts by score", async () => {
    prisma.knowledgeBase.findMany.mockResolvedValue([
      { id: "kb-a" },
      { id: "kb-b" },
    ]);
    wiki.search.mockImplementation(async (kbId: string) =>
      kbId === "kb-a"
        ? [strongWikiHit(1.2, "from-a")]
        : [strongWikiHit(2.7, "from-b")],
    );

    const response = await service.query({
      query: "cross-kb",
      knowledgeBaseIds: ["kb-a", "kb-b"],
      options: { topK: 5 },
    });

    expect(wiki.search).toHaveBeenCalledTimes(2);
    expect(response.context.sources[0].documentTitle).toBe("Title from-b");
    expect(rag.query).not.toHaveBeenCalled();
  });

  it("ignores per-KB wiki failure and still considers other KBs / fallback", async () => {
    prisma.knowledgeBase.findMany.mockResolvedValue([
      { id: "kb-bad" },
      { id: "kb-good" },
    ]);
    wiki.search.mockImplementation(async (kbId: string) => {
      if (kbId === "kb-bad") throw new Error("wiki query crashed");
      return [strongWikiHit(2.0, "saved-by-good")];
    });

    const response = await service.query({
      query: "with one broken kb",
      knowledgeBaseIds: ["kb-bad", "kb-good"],
    });

    expect(rag.query).not.toHaveBeenCalled();
    expect(response.context.sources[0].metadata?.slug).toBe("saved-by-good");
  });

  it("response shape stays drop-in compatible with chunk-RAG response", async () => {
    prisma.knowledgeBase.findMany.mockResolvedValue([{ id: "kb-1" }]);
    wiki.search.mockResolvedValue([strongWikiHit(3.0, "alpha")]);

    const response = await service.query({
      query: "shape check",
      knowledgeBaseIds: ["kb-1"],
    });

    // ai-ask reads these fields directly — no shape regression allowed.
    expect(response.context).toBeDefined();
    expect(response.context.text).toBeTruthy();
    expect(response.context.totalTokens).toBeGreaterThan(0);
    expect(response.context.sources[0]).toMatchObject({
      documentTitle: expect.any(String),
      excerpt: expect.any(String),
      score: expect.any(Number),
    });
    expect(response.searchResults).toBeDefined();
    expect(response.processingTime.total).toBeGreaterThanOrEqual(0);
    expect(response.quality).toBe("full");
  });
});
