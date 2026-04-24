/**
 * F5 · Search quality + evidence sync unit tests
 */

import { Test } from "@nestjs/testing";

import { DataSourceType } from "@/modules/ai-app/topic-insights/shared/types/data-source.types";

import { ContentEnrichmentService } from "../content-enrichment.service";
import { EvidenceEvaluationService } from "../evidence-evaluation.service";
import { ResultFilterService } from "../result-filter.service";
import { UrlValidationService } from "../url-validation.service";
import type { UrlFetcher } from "../url-validation.service";

const sample = (overrides = {}) => ({
  sourceType: DataSourceType.WEB,
  title: "A title",
  url: "https://example.com/a",
  snippet: "This is a sufficiently long snippet so it passes the filter.",
  ...overrides,
});

describe("ContentEnrichmentService", () => {
  let svc: ContentEnrichmentService;
  beforeEach(() => {
    svc = new ContentEnrichmentService();
  });

  it("derives a title from URL when missing", () => {
    const out = svc.enrich([
      sample({ title: "", url: "https://example.com/hello-world" }),
    ]);
    expect(out[0].title).toBe("hello world");
  });

  it("extracts domain when missing", () => {
    const out = svc.enrich([sample({ domain: undefined })]);
    expect(out[0].domain).toBe("example.com");
  });

  it("fills placeholder snippet when empty", () => {
    const out = svc.enrich([sample({ snippet: "" })]);
    expect(out[0].snippet).toContain("无摘要");
  });
});

describe("EvidenceEvaluationService", () => {
  let svc: EvidenceEvaluationService;
  beforeEach(() => {
    svc = new EvidenceEvaluationService();
  });

  it("assigns a higher base score to academic sources", () => {
    const [result] = svc.evaluate(
      [sample({ url: "https://arxiv.org/abs/1" })],
      DataSourceType.ACADEMIC,
    );
    expect(result.credibilityPre).toBeGreaterThan(0.85);
  });

  it("penalises very old publications", () => {
    const [fresh] = svc.evaluate(
      [sample({ publishedAt: new Date() })],
      DataSourceType.WEB,
    );
    const [old] = svc.evaluate(
      [
        sample({
          publishedAt: new Date(Date.now() - 6 * 365 * 24 * 60 * 60 * 1000),
        }),
      ],
      DataSourceType.WEB,
    );
    expect(fresh.credibilityPre).toBeGreaterThan(old.credibilityPre);
  });
});

describe("ResultFilterService", () => {
  let svc: ResultFilterService;
  beforeEach(() => {
    svc = new ResultFilterService();
  });

  it("drops rows with missing url / short snippet / duplicate url", () => {
    const input = [
      sample(),
      sample({ url: "" }),
      sample({ snippet: "short" }),
      sample({ url: "https://example.com/a" }), // duplicate
      sample({ url: "https://pinterest.com/x" }), // blocklisted
    ];
    const kept = svc.filterValid(input);
    expect(kept).toHaveLength(1);
    expect(kept[0].url).toBe("https://example.com/a");
  });

  it("respects a custom minSnippetLength", () => {
    const kept = svc.filterValid([sample({ snippet: "tiny" })], {
      minSnippetLength: 2,
    });
    expect(kept).toHaveLength(1);
  });
});

describe("UrlValidationService", () => {
  it("drops URLs returning 4xx when dropOnClientError=true (default)", async () => {
    const fetcher: UrlFetcher = async (url) => ({
      ok: url.includes("live"),
      status: url.includes("live") ? 200 : 404,
    });
    const svc = new UrlValidationService(fetcher as unknown as undefined);
    const kept = await svc.filterAlive(
      [
        sample({ url: "https://example.com/live" }),
        sample({ url: "https://example.com/dead" }),
      ],
      { concurrency: 2 },
    );
    expect(kept).toHaveLength(1);
    expect(kept[0].url).toBe("https://example.com/live");
  });

  it("fails open when fetcher rejects", async () => {
    const fetcher: UrlFetcher = async () => {
      throw new Error("network");
    };
    const svc = new UrlValidationService(fetcher as unknown as undefined);
    const kept = await svc.filterAlive([sample()]);
    expect(kept).toHaveLength(1);
  });
});

describe("EvidenceSyncCompensationService", () => {
  it("removes post-checkpoint orphans and reports missing evidence on reconcile", async () => {
    const prisma = {
      topicEvidence: {
        findMany: jest
          .fn()
          .mockResolvedValueOnce([{ id: "e1" }, { id: "e2" }]) // snapshot time
          .mockResolvedValueOnce([{ id: "e2" }, { id: "e3" }]), // reconcile time
        deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
    };
    const { EvidenceSyncCompensationService } =
      await import("../../../evidence-sync/compensation.service");
    const { PrismaService } = await import("@/common/prisma/prisma.service");
    const mod = await Test.createTestingModule({
      providers: [
        EvidenceSyncCompensationService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    const svc = mod.get(EvidenceSyncCompensationService);

    const snap = await svc.snapshot("report-1");
    expect(snap.evidenceIds).toEqual(["e1", "e2"]);

    const reconcile = await svc.reconcile("report-1");
    expect(reconcile.removedOrphans).toBe(1);
    expect(reconcile.missingEvidence).toEqual(["e1"]);
    expect(prisma.topicEvidence.deleteMany).toHaveBeenCalledWith({
      where: { id: { in: ["e3"] } },
    });
  });

  it("reconcile is a no-op when no snapshot exists", async () => {
    const prisma = {
      topicEvidence: { findMany: jest.fn(), deleteMany: jest.fn() },
    };
    const { EvidenceSyncCompensationService } =
      await import("../../../evidence-sync/compensation.service");
    const { PrismaService } = await import("@/common/prisma/prisma.service");
    const mod = await Test.createTestingModule({
      providers: [
        EvidenceSyncCompensationService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();
    const svc = mod.get(EvidenceSyncCompensationService);
    const result = await svc.reconcile("nope");
    expect(result.removedOrphans).toBe(0);
    expect(prisma.topicEvidence.findMany).not.toHaveBeenCalled();
  });
});
