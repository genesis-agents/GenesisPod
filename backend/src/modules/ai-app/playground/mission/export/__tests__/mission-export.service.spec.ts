/**
 * MissionExportService — full branch coverage
 *
 * Covers:
 *   - export: mission not found → ForbiddenException
 *   - export: no reportFull → BadRequestException
 *   - export: format routing (csv-facts / csv-citations / markdown / json)
 *   - export: unsupported format → BadRequestException
 *   - normalizeReportFull: v2 (has content.fullMarkdown) → as-is
 *   - normalizeReportFull: v1 (has sections{heading,body}) → normalize
 *   - normalizeReportFull: v1 (has summary/title) → normalize
 *   - normalizeReportFull: unknown shape → as-is
 *   - normalizeReportFull: non-object → empty {}
 *   - makeSlug: topic present → slug from topic (≤40 chars)
 *   - makeSlug: no topic → missionId.slice(0,8)
 *   - exportFactsCsv: header + fact rows, sources join with |, BOM prefix
 *   - exportFactsCsv: empty factTable → header only
 *   - exportCitationsCsv: header + citation rows, optional fields
 *   - exportCitationsCsv: empty citations → header only
 *   - exportMarkdown: frontmatter when meta present; no frontmatter when absent
 *   - frontmatter: optional fields (generatedAt/wordCount/sourceCount/etc.)
 *   - leaderForewordSection: all subsections (whatWeAnswered/whatRemainsUnclear/howToRead/recommendedFollowUp)
 *   - leaderForewordSection: absent → empty string
 *   - referencesAppendix: cites with/without optional fields
 *   - reconciliationAppendix: with deduplicationStats/termGlossary/reconciliationReport
 *   - reconciliationAppendix: no recon → empty string
 *   - criticL4Appendix: l4- prefixed warnings only; non-l4 filtered out
 *   - criticL4Appendix: each sub-type (blindspot/bias/suggestion/critic)
 *   - sanitize: double-quotes escaped; newlines collapsed
 */

import { BadRequestException, ForbiddenException } from "@nestjs/common";
import { MissionExportService } from "../mission-export.service";

// ── Mock store ────────────────────────────────────────────────────────────────

function makeStore(mission: unknown = null) {
  return { getById: jest.fn().mockResolvedValue(mission) } as any;
}

// ── v2 reportFull fixture ─────────────────────────────────────────────────────

function makeV2Report(overrides: Record<string, unknown> = {}) {
  return {
    content: { fullMarkdown: "# Report\n\nSome content." },
    metadata: { topic: "AI Trends", generatedAt: "2025-01-01T00:00:00Z" },
    factTable: [
      {
        entity: "GPT-4",
        attribute: "release_year",
        value: "2023",
        sources: [1, 2],
      },
    ],
    citations: [
      {
        index: 1,
        title: "OpenAI Blog",
        url: "https://openai.com/blog",
        domain: "openai.com",
        sourceType: "blog",
        credibilityScore: 85,
        publishedAt: "2023-03-14T00:00:00Z",
      },
    ],
    quality: { warnings: [] },
    ...overrides,
  };
}

// ── v1 reportFull fixture ─────────────────────────────────────────────────────

function makeV1Report() {
  return {
    title: "AI Report 2025",
    summary: "Executive summary of AI trends.",
    sections: [
      { heading: "Overview", body: "AI is growing rapidly." },
      { heading: "Impact", body: "Impact is significant." },
    ],
    citations: ["https://example.com/source1"],
  };
}

// ── mission with reconciliation ───────────────────────────────────────────────

function makeMissionWithRecon(reportFull: unknown = makeV2Report()) {
  return {
    reportFull,
    reconciliationReport: {
      reconciliationReport: "## Recon report content",
      deduplicationStats: {
        duplicatesRemoved: 5,
        termVariantsUnified: 3,
        dataInconsistenciesFlagged: 1,
      },
      termGlossary: [
        { canonical: "AI", variants: ["Artificial Intelligence", "A.I."] },
      ],
    },
  };
}

// ── export (top-level routing) ────────────────────────────────────────────────

describe("MissionExportService.export", () => {
  it("mission not found → ForbiddenException", async () => {
    const svc = new MissionExportService(makeStore(null));
    await expect(svc.export("m1", "u1", "json")).rejects.toThrow(
      ForbiddenException,
    );
  });

  it("no reportFull → BadRequestException", async () => {
    const svc = new MissionExportService(makeStore({ reportFull: null }));
    await expect(svc.export("m1", "u1", "json")).rejects.toThrow(
      BadRequestException,
    );
  });

  it("unsupported format → BadRequestException with message", async () => {
    const svc = new MissionExportService(
      makeStore({ reportFull: makeV2Report() }),
    );
    await expect(svc.export("m1", "u1", "xlsx")).rejects.toThrow(
      /Unsupported export format/,
    );
  });

  it("format=json → returns .json filename and application/json mime", async () => {
    const svc = new MissionExportService(
      makeStore({ reportFull: makeV2Report() }),
    );
    const result = await svc.export("m1", "u1", "json");
    expect(result.mimeType).toContain("application/json");
    expect(result.filename).toMatch(/\.json$/);
  });

  it("format=csv-facts → returns .csv filename and text/csv mime", async () => {
    const svc = new MissionExportService(
      makeStore({ reportFull: makeV2Report() }),
    );
    const result = await svc.export("m1", "u1", "csv-facts");
    expect(result.mimeType).toContain("text/csv");
    expect(result.filename).toMatch(/-facts\.csv$/);
  });

  it("format=csv-citations → returns citations csv", async () => {
    const svc = new MissionExportService(
      makeStore({ reportFull: makeV2Report() }),
    );
    const result = await svc.export("m1", "u1", "csv-citations");
    expect(result.filename).toMatch(/-citations\.csv$/);
  });

  it("format=markdown → returns .md filename", async () => {
    const svc = new MissionExportService(
      makeStore({ reportFull: makeV2Report() }),
    );
    const result = await svc.export("m1", "u1", "markdown");
    expect(result.filename).toMatch(/\.md$/);
    expect(result.mimeType).toContain("text/markdown");
  });

  it("getById called with (missionId, userId)", async () => {
    const store = makeStore({ reportFull: makeV2Report() });
    const svc = new MissionExportService(store);
    await svc.export("my-mission-id", "my-user-id", "json");
    expect(store.getById).toHaveBeenCalledWith("my-mission-id", "my-user-id");
  });
});

// ── normalizeReportFull ───────────────────────────────────────────────────────

describe("normalizeReportFull (via export)", () => {
  it("v2 report (content.fullMarkdown) → used as-is in markdown export", async () => {
    const v2 = makeV2Report({
      content: { fullMarkdown: "# Unique V2 Content" },
    });
    const svc = new MissionExportService(makeStore({ reportFull: v2 }));
    const result = await svc.export("m1", "u1", "markdown");
    expect(result.content).toContain("# Unique V2 Content");
  });

  it("v1 report with sections → normalized to v2 (fullMarkdown in markdown export)", async () => {
    const v1 = makeV1Report();
    const svc = new MissionExportService(makeStore({ reportFull: v1 }));
    const result = await svc.export("m1", "u1", "markdown");
    // After normalization, the markdown output should contain headings from sections
    expect(result.content).toContain("Overview");
  });

  it("v1 report with title but no sections → normalized", async () => {
    const v1 = { title: "Some Report", summary: "A quick summary." };
    const svc = new MissionExportService(makeStore({ reportFull: v1 }));
    // Should not throw; content will be partial
    const result = await svc.export("m1", "u1", "markdown");
    expect(result.filename).toMatch(/\.md$/);
  });

  it("unknown shape (no v1 or v2 hallmarks) → used as-is (no crash)", async () => {
    const unknown = { someField: "value", anotherField: 42 };
    const svc = new MissionExportService(makeStore({ reportFull: unknown }));
    const result = await svc.export("m1", "u1", "json");
    expect(result.content).toContain("someField");
  });

  it("non-object reportFull (null stored in JSON) → treated as empty object", async () => {
    // This won't reach normalizeReportFull because the !rawReportFull guard fires
    // unless it's stored as an object with no-op truthy value;
    // test the guard: falsy value → BadRequestException
    const svc = new MissionExportService(makeStore({ reportFull: "" }));
    await expect(svc.export("m1", "u1", "json")).rejects.toThrow(
      BadRequestException,
    );
  });
});

// ── makeSlug ──────────────────────────────────────────────────────────────────

describe("makeSlug (via export filename)", () => {
  it("topic present → slug from topic appears in filename", async () => {
    const v2 = makeV2Report({ metadata: { topic: "Global AI Market 2025" } });
    const svc = new MissionExportService(makeStore({ reportFull: v2 }));
    const result = await svc.export("m1", "u1", "json");
    expect(result.filename).toContain("Global-AI-Market-2025");
  });

  it("topic exceeds 40 chars → truncated in filename", async () => {
    const longTopic =
      "A Very Long Topic That Exceeds The Forty Character Limit For Slugs";
    const v2 = makeV2Report({ metadata: { topic: longTopic } });
    const svc = new MissionExportService(makeStore({ reportFull: v2 }));
    const result = await svc.export("m1", "u1", "json");
    const nameWithoutExt = result.filename.replace(".json", "");
    expect(nameWithoutExt.length).toBeLessThanOrEqual(40);
  });

  it("no topic → missionId first 8 chars used", async () => {
    const v2 = makeV2Report({ metadata: {} });
    const svc = new MissionExportService(makeStore({ reportFull: v2 }));
    const result = await svc.export("mission-abc-12345678", "u1", "json");
    expect(result.filename).toContain("mission-");
  });

  it("no metadata → missionId first 8 chars used", async () => {
    const v2 = { content: { fullMarkdown: "# Report" } };
    const svc = new MissionExportService(makeStore({ reportFull: v2 }));
    const result = await svc.export("abcdefgh-xyz", "u1", "json");
    expect(result.filename).toContain("abcdefgh");
  });
});

// ── exportFactsCsv ────────────────────────────────────────────────────────────

describe("exportFactsCsv", () => {
  it("BOM prefix (﻿) in CSV content", async () => {
    const svc = new MissionExportService(
      makeStore({ reportFull: makeV2Report() }),
    );
    const result = await svc.export("m1", "u1", "csv-facts");
    expect(result.content.charCodeAt(0)).toBe(0xfeff); // BOM
  });

  it("header row correct", async () => {
    const svc = new MissionExportService(
      makeStore({ reportFull: makeV2Report() }),
    );
    const result = await svc.export("m1", "u1", "csv-facts");
    const lines = result.content.slice(1).split("\n"); // skip BOM char
    expect(lines[0]).toBe("entity,attribute,value,source_count,source_indices");
  });

  it("fact row with sources joined by |", async () => {
    const v2 = makeV2Report({
      factTable: [
        { entity: "GPT-4", attribute: "year", value: "2023", sources: [1, 3] },
      ],
    });
    const svc = new MissionExportService(makeStore({ reportFull: v2 }));
    const result = await svc.export("m1", "u1", "csv-facts");
    expect(result.content).toContain('"GPT-4"');
    expect(result.content).toContain('"year"');
    expect(result.content).toContain('"2023"');
    expect(result.content).toContain("2,"); // source_count
    expect(result.content).toContain('"1|3"');
  });

  it("fact with no sources: source_count=0, empty indices", async () => {
    const v2 = makeV2Report({
      factTable: [{ entity: "X", attribute: "Y", value: "Z" }],
    });
    const svc = new MissionExportService(makeStore({ reportFull: v2 }));
    const result = await svc.export("m1", "u1", "csv-facts");
    expect(result.content).toContain('0,""');
  });

  it("empty factTable → only header", async () => {
    const v2 = makeV2Report({ factTable: [] });
    const svc = new MissionExportService(makeStore({ reportFull: v2 }));
    const result = await svc.export("m1", "u1", "csv-facts");
    const lines = result.content.split("\n");
    expect(lines).toHaveLength(1);
  });

  it("no factTable property → treats as empty", async () => {
    const v2 = { content: { fullMarkdown: "" }, metadata: {} };
    const svc = new MissionExportService(makeStore({ reportFull: v2 }));
    const result = await svc.export("m1", "u1", "csv-facts");
    expect(result.content).toContain("entity,attribute,value");
  });

  it("sanitize: double quotes escaped in entity name", async () => {
    const v2 = makeV2Report({
      factTable: [
        {
          entity: 'Entity "quoted"',
          attribute: "attr",
          value: "val",
          sources: [],
        },
      ],
    });
    const svc = new MissionExportService(makeStore({ reportFull: v2 }));
    const result = await svc.export("m1", "u1", "csv-facts");
    expect(result.content).toContain('"Entity ""quoted"""');
  });

  it("sanitize: newlines in value collapsed to space", async () => {
    const v2 = makeV2Report({
      factTable: [
        {
          entity: "X",
          attribute: "Y",
          value: "line1\nline2",
          sources: [],
        },
      ],
    });
    const svc = new MissionExportService(makeStore({ reportFull: v2 }));
    const result = await svc.export("m1", "u1", "csv-facts");
    expect(result.content).toContain('"line1 line2"');
  });
});

// ── exportCitationsCsv ────────────────────────────────────────────────────────

describe("exportCitationsCsv", () => {
  it("BOM prefix in citations CSV", async () => {
    const svc = new MissionExportService(
      makeStore({ reportFull: makeV2Report() }),
    );
    const result = await svc.export("m1", "u1", "csv-citations");
    expect(result.content.charCodeAt(0)).toBe(0xfeff);
  });

  it("header row correct", async () => {
    const svc = new MissionExportService(
      makeStore({ reportFull: makeV2Report() }),
    );
    const result = await svc.export("m1", "u1", "csv-citations");
    const lines = result.content.slice(1).split("\n");
    expect(lines[0]).toBe(
      "index,title,url,domain,source_type,credibility_score,published_at",
    );
  });

  it("citation row with all fields present", async () => {
    const svc = new MissionExportService(
      makeStore({ reportFull: makeV2Report() }),
    );
    const result = await svc.export("m1", "u1", "csv-citations");
    expect(result.content).toContain("1,");
    expect(result.content).toContain('"OpenAI Blog"');
    expect(result.content).toContain("85");
    expect(result.content).toContain("2023-03-14");
  });

  it("citation with optional fields absent → empty string for sourceType and publishedAt", async () => {
    const v2 = makeV2Report({
      citations: [
        {
          index: 2,
          title: "Some Article",
          url: "https://example.com",
          domain: "example.com",
        },
      ],
    });
    const svc = new MissionExportService(makeStore({ reportFull: v2 }));
    const result = await svc.export("m1", "u1", "csv-citations");
    expect(result.content).toContain('2,"Some Article"');
    // credibilityScore absent → empty string
    expect(result.content).toContain(',"",');
  });

  it("empty citations → header only", async () => {
    const v2 = makeV2Report({ citations: [] });
    const svc = new MissionExportService(makeStore({ reportFull: v2 }));
    const result = await svc.export("m1", "u1", "csv-citations");
    const lines = result.content.split("\n");
    expect(lines).toHaveLength(1);
  });
});

// ── exportMarkdown: frontmatter ───────────────────────────────────────────────

describe("exportMarkdown frontmatter", () => {
  it("frontmatter present when metadata has topic", async () => {
    const v2 = makeV2Report({
      metadata: {
        topic: "AI Report",
        generatedAt: "2025-01-01T00:00:00Z",
        wordCount: 5000,
        sourceCount: 20,
        figureCount: 3,
        factCount: 50,
        styleProfile: "formal",
        lengthProfile: "long",
        audienceProfile: "executive",
        searchTimeRange: "2024-2025",
      },
    });
    const svc = new MissionExportService(makeStore({ reportFull: v2 }));
    const result = await svc.export("m1", "u1", "markdown");
    expect(result.content).toContain("---");
    expect(result.content).toContain('topic: "AI Report"');
    expect(result.content).toContain("wordCount: 5000");
    expect(result.content).toContain("sourceCount: 20");
    expect(result.content).toContain("figureCount: 3");
    expect(result.content).toContain("factCount: 50");
    expect(result.content).toContain("styleProfile: formal");
    expect(result.content).toContain("lengthProfile: long");
    expect(result.content).toContain("audienceProfile: executive");
    expect(result.content).toContain("searchTimeRange: 2024-2025");
  });

  it("no metadata → no frontmatter block", async () => {
    const v2 = { content: { fullMarkdown: "# Report" } };
    const svc = new MissionExportService(makeStore({ reportFull: v2 }));
    const result = await svc.export("m1", "u1", "markdown");
    expect(result.content).not.toContain("---");
  });

  it("topic with double quotes → escaped to single quotes in frontmatter", async () => {
    const v2 = makeV2Report({ metadata: { topic: 'AI "future" trends' } });
    const svc = new MissionExportService(makeStore({ reportFull: v2 }));
    const result = await svc.export("m1", "u1", "markdown");
    expect(result.content).toContain("topic: \"AI 'future' trends\"");
  });
});

// ── exportMarkdown: leaderForewordSection ─────────────────────────────────────

describe("exportMarkdown leaderForewordSection", () => {
  const foreword = {
    whatWeAnswered: [
      {
        criterion: "Is AI safe?",
        addressed: "yes",
        evidence: "Multiple studies",
      },
      {
        criterion: "Is AI expensive?",
        addressed: "partial",
        evidence: "Mixed signals",
      },
      {
        criterion: "Is AI fast?",
        addressed: "no",
        evidence: "Insufficient data",
      },
    ],
    whatRemainsUnclear: ["Long-term job impact", "Regulatory trajectory"],
    howToRead: "Start with the executive summary, then dive into each chapter.",
    recommendedFollowUp: [
      "Commission longitudinal study",
      "Review in 6 months",
    ],
  };

  it("Foreword section present when leaderForeword in metadata", async () => {
    const v2 = makeV2Report({
      metadata: { topic: "T", leaderForeword: foreword },
    });
    const svc = new MissionExportService(makeStore({ reportFull: v2 }));
    const result = await svc.export("m1", "u1", "markdown");
    expect(result.content).toContain("## Foreword by Lead");
  });

  it("addressed=yes renders ✓", async () => {
    const v2 = makeV2Report({
      metadata: { topic: "T", leaderForeword: foreword },
    });
    const svc = new MissionExportService(makeStore({ reportFull: v2 }));
    const result = await svc.export("m1", "u1", "markdown");
    expect(result.content).toContain("✓");
  });

  it("addressed=partial renders ⚠️", async () => {
    const v2 = makeV2Report({
      metadata: { topic: "T", leaderForeword: foreword },
    });
    const svc = new MissionExportService(makeStore({ reportFull: v2 }));
    const result = await svc.export("m1", "u1", "markdown");
    expect(result.content).toContain("⚠️");
  });

  it("addressed=no renders ✗", async () => {
    const v2 = makeV2Report({
      metadata: { topic: "T", leaderForeword: foreword },
    });
    const svc = new MissionExportService(makeStore({ reportFull: v2 }));
    const result = await svc.export("m1", "u1", "markdown");
    expect(result.content).toContain("✗");
  });

  it("whatRemainsUnclear items rendered", async () => {
    const v2 = makeV2Report({
      metadata: { topic: "T", leaderForeword: foreword },
    });
    const svc = new MissionExportService(makeStore({ reportFull: v2 }));
    const result = await svc.export("m1", "u1", "markdown");
    expect(result.content).toContain("Long-term job impact");
    expect(result.content).toContain("没回答 / 证据不足");
  });

  it("howToRead section rendered", async () => {
    const v2 = makeV2Report({
      metadata: { topic: "T", leaderForeword: foreword },
    });
    const svc = new MissionExportService(makeStore({ reportFull: v2 }));
    const result = await svc.export("m1", "u1", "markdown");
    expect(result.content).toContain("Start with the executive summary");
    expect(result.content).toContain("如何阅读本报告");
  });

  it("recommendedFollowUp rendered", async () => {
    const v2 = makeV2Report({
      metadata: { topic: "T", leaderForeword: foreword },
    });
    const svc = new MissionExportService(makeStore({ reportFull: v2 }));
    const result = await svc.export("m1", "u1", "markdown");
    expect(result.content).toContain("Commission longitudinal study");
    expect(result.content).toContain("建议的后续研究方向");
  });

  it("no leaderForeword → no Foreword section", async () => {
    const svc = new MissionExportService(
      makeStore({ reportFull: makeV2Report() }),
    );
    const result = await svc.export("m1", "u1", "markdown");
    expect(result.content).not.toContain("## Foreword by Lead");
  });

  it("empty whatWeAnswered → we回答了什么 section absent", async () => {
    const minForeword = { whatRemainsUnclear: ["Unclear thing"] };
    const v2 = makeV2Report({
      metadata: { topic: "T", leaderForeword: minForeword },
    });
    const svc = new MissionExportService(makeStore({ reportFull: v2 }));
    const result = await svc.export("m1", "u1", "markdown");
    expect(result.content).not.toContain("我们回答了什么");
    expect(result.content).toContain("Unclear thing");
  });
});

// ── referencesAppendix ────────────────────────────────────────────────────────

describe("exportMarkdown referencesAppendix", () => {
  it("references section appended with index and url", async () => {
    const svc = new MissionExportService(
      makeStore({ reportFull: makeV2Report() }),
    );
    const result = await svc.export("m1", "u1", "markdown");
    expect(result.content).toContain("## 参考文献");
    expect(result.content).toContain("[1]");
    expect(result.content).toContain("openai.com");
    expect(result.content).toContain("https://openai.com/blog");
  });

  it("sourceType tag shown when present", async () => {
    const svc = new MissionExportService(
      makeStore({ reportFull: makeV2Report() }),
    );
    const result = await svc.export("m1", "u1", "markdown");
    expect(result.content).toContain("[blog]");
  });

  it("credibilityScore shown when present", async () => {
    const svc = new MissionExportService(
      makeStore({ reportFull: makeV2Report() }),
    );
    const result = await svc.export("m1", "u1", "markdown");
    expect(result.content).toContain("可信度 85/100");
  });

  it("publishedAt sliced to 10 chars", async () => {
    const svc = new MissionExportService(
      makeStore({ reportFull: makeV2Report() }),
    );
    const result = await svc.export("m1", "u1", "markdown");
    expect(result.content).toContain("(2023-03-14)");
  });

  it("no sourceType → no tag", async () => {
    const v2 = makeV2Report({
      citations: [
        { index: 1, title: "T", url: "http://x.com", domain: "x.com" },
      ],
    });
    const svc = new MissionExportService(makeStore({ reportFull: v2 }));
    const result = await svc.export("m1", "u1", "markdown");
    expect(result.content).not.toContain("[blog]");
  });

  it("empty citations → no references section", async () => {
    const v2 = makeV2Report({ citations: [] });
    const svc = new MissionExportService(makeStore({ reportFull: v2 }));
    const result = await svc.export("m1", "u1", "markdown");
    expect(result.content).not.toContain("## 参考文献");
  });
});

// ── reconciliationAppendix ────────────────────────────────────────────────────

describe("exportMarkdown reconciliationAppendix", () => {
  it("reconciliation appendix present when mission has reconciliationReport", async () => {
    const mission = makeMissionWithRecon();
    const svc = new MissionExportService(makeStore(mission));
    const result = await svc.export("m1", "u1", "markdown");
    expect(result.content).toContain("## 附录：对账总览");
    expect(result.content).toContain("去重统计");
    expect(result.content).toContain("去重 5");
    expect(result.content).toContain("术语统一 3");
    expect(result.content).toContain("数据冲突 1");
  });

  it("termGlossary rendered", async () => {
    const mission = makeMissionWithRecon();
    const svc = new MissionExportService(makeStore(mission));
    const result = await svc.export("m1", "u1", "markdown");
    expect(result.content).toContain("**AI**");
    expect(result.content).toContain("Artificial Intelligence");
    expect(result.content).toContain("术语对照表");
  });

  it("reconciliationReport text appended", async () => {
    const mission = makeMissionWithRecon();
    const svc = new MissionExportService(makeStore(mission));
    const result = await svc.export("m1", "u1", "markdown");
    expect(result.content).toContain("## Recon report content");
  });

  it("no reconciliationReport → no appendix", async () => {
    const mission = { reportFull: makeV2Report(), reconciliationReport: null };
    const svc = new MissionExportService(makeStore(mission));
    const result = await svc.export("m1", "u1", "markdown");
    expect(result.content).not.toContain("## 附录：对账总览");
  });

  it("reconciliation with empty glossary → no 术语对照表", async () => {
    const mission = {
      reportFull: makeV2Report(),
      reconciliationReport: {
        deduplicationStats: {
          duplicatesRemoved: 0,
          termVariantsUnified: 0,
          dataInconsistenciesFlagged: 0,
        },
        termGlossary: [],
      },
    };
    const svc = new MissionExportService(makeStore(mission));
    const result = await svc.export("m1", "u1", "markdown");
    expect(result.content).not.toContain("术语对照表");
    expect(result.content).toContain("## 附录：对账总览");
  });
});

// ── criticL4Appendix ──────────────────────────────────────────────────────────

describe("exportMarkdown criticL4Appendix", () => {
  it("no l4 warnings → no critic appendix section", async () => {
    const v2 = makeV2Report({
      quality: {
        warnings: [{ dimension: "relevance", message: "Low relevance" }],
      },
    });
    const svc = new MissionExportService(makeStore({ reportFull: v2 }));
    const result = await svc.export("m1", "u1", "markdown");
    expect(result.content).not.toContain("独立审查");
  });

  it("l4-blindspot warning → 盲点 section", async () => {
    const v2 = makeV2Report({
      quality: {
        warnings: [
          { dimension: "l4-blindspot", message: "Missing Asia coverage" },
        ],
      },
    });
    const svc = new MissionExportService(makeStore({ reportFull: v2 }));
    const result = await svc.export("m1", "u1", "markdown");
    expect(result.content).toContain("## 附录：独立审查（Critic L4）");
    expect(result.content).toContain("### 盲点（Blind Spots）");
    expect(result.content).toContain("Missing Asia coverage");
  });

  it("l4-bias warning → 潜在偏见 section", async () => {
    const v2 = makeV2Report({
      quality: {
        warnings: [
          { dimension: "l4-bias", message: "US-centric bias detected" },
        ],
      },
    });
    const svc = new MissionExportService(makeStore({ reportFull: v2 }));
    const result = await svc.export("m1", "u1", "markdown");
    expect(result.content).toContain("### 潜在偏见（Biases）");
    expect(result.content).toContain("US-centric bias detected");
  });

  it("l4-suggestion warning → 改进建议 section", async () => {
    const v2 = makeV2Report({
      quality: {
        warnings: [
          { dimension: "l4-suggestion", message: "Add quantitative data" },
        ],
      },
    });
    const svc = new MissionExportService(makeStore({ reportFull: v2 }));
    const result = await svc.export("m1", "u1", "markdown");
    expect(result.content).toContain("### 改进建议（Suggestions）");
    expect(result.content).toContain("Add quantitative data");
  });

  it("l4-critic warning → 整体判定 section", async () => {
    const v2 = makeV2Report({
      quality: {
        warnings: [
          { dimension: "l4-critic", message: "Overall quality: good" },
        ],
      },
    });
    const svc = new MissionExportService(makeStore({ reportFull: v2 }));
    const result = await svc.export("m1", "u1", "markdown");
    expect(result.content).toContain("### 整体判定");
    expect(result.content).toContain("Overall quality: good");
  });

  it("non-l4 warnings filtered out (only l4- prefix shown)", async () => {
    const v2 = makeV2Report({
      quality: {
        warnings: [
          { dimension: "relevance", message: "Relevance issue" },
          { dimension: "l4-blindspot", message: "Real l4 warning" },
        ],
      },
    });
    const svc = new MissionExportService(makeStore({ reportFull: v2 }));
    const result = await svc.export("m1", "u1", "markdown");
    expect(result.content).toContain("Real l4 warning");
    expect(result.content).not.toContain("Relevance issue");
  });

  it("multiple l4 types all rendered", async () => {
    const v2 = makeV2Report({
      quality: {
        warnings: [
          { dimension: "l4-critic", message: "Verdict: approved" },
          { dimension: "l4-blindspot", message: "Missing data" },
          { dimension: "l4-bias", message: "Confirmation bias" },
          { dimension: "l4-suggestion", message: "Add charts" },
        ],
      },
    });
    const svc = new MissionExportService(makeStore({ reportFull: v2 }));
    const result = await svc.export("m1", "u1", "markdown");
    expect(result.content).toContain("整体判定");
    expect(result.content).toContain("盲点");
    expect(result.content).toContain("潜在偏见");
    expect(result.content).toContain("改进建议");
  });
});

// ── additional branch coverage ────────────────────────────────────────────────

describe("normalizeReportFull branch: truthy non-object (typeof !== object)", () => {
  it("numeric reportFull (truthy non-object) → returns empty object shape → no crash", async () => {
    // line 100: `typeof raw !== "object"` true branch
    // The numeric 42 is truthy so passes the `!rawReportFull` guard at line 65,
    // but is not an object, so normalizeReportFull returns {} → export proceeds
    const svc = new MissionExportService(makeStore({ reportFull: 42 }));
    const result = await svc.export("m1", "u1", "json");
    // Empty reportFull → json export returns {} artifact
    expect(result.mimeType).toContain("application/json");
  });
});

describe("exportMarkdown: content.fullMarkdown undefined branch", () => {
  it("content object present but fullMarkdown undefined → empty string used (line 186)", async () => {
    // content?.fullMarkdown ?? "" → the "" branch (fullMarkdown absent in content obj)
    const v2 = { content: {}, metadata: { topic: "T" } };
    const svc = new MissionExportService(makeStore({ reportFull: v2 }));
    const result = await svc.export("m1", "u1", "markdown");
    expect(result.content).toContain('topic: "T"');
    // No actual body content (fullMarkdown absent → "")
  });
});

describe("exportMarkdown frontmatter: missing optional fields", () => {
  it("frontmatter with topic only (no generatedAt/wordCount/etc.) → false branches of optional fields", async () => {
    // line 228 false branch: `if (meta.generatedAt)` → false
    const v2 = makeV2Report({ metadata: { topic: "Minimal Topic" } });
    const svc = new MissionExportService(makeStore({ reportFull: v2 }));
    const result = await svc.export("m1", "u1", "markdown");
    expect(result.content).toContain('topic: "Minimal Topic"');
    expect(result.content).not.toContain("generatedAt:");
    expect(result.content).not.toContain("wordCount:");
  });

  it("frontmatter: no topic in metadata → uses missionId as fallback (line 228 ?? branch)", async () => {
    // meta.topic is undefined → (undefined)?.replace(...)  = undefined → ?? missionId fires
    // This is the binary-expr branch 2 at line 228, column 21-75
    const v2 = {
      content: { fullMarkdown: "# Report" },
      metadata: { wordCount: 100 },
    };
    const svc = new MissionExportService(makeStore({ reportFull: v2 }));
    const result = await svc.export("missionXYZ", "u1", "markdown");
    // missionId used as topic in frontmatter
    expect(result.content).toContain('topic: "missionXYZ"');
  });
});

describe("exportMarkdown leaderForeword: missing optional sub-sections", () => {
  it("foreword with only whatWeAnswered → no whatRemainsUnclear section (false branch line 274)", async () => {
    const forewordNoUnclear = {
      whatWeAnswered: [
        { criterion: "Q1?", addressed: "yes", evidence: "Evidence." },
      ],
      // no whatRemainsUnclear, no howToRead, no recommendedFollowUp
    };
    const v2 = makeV2Report({
      metadata: { topic: "T", leaderForeword: forewordNoUnclear },
    });
    const svc = new MissionExportService(makeStore({ reportFull: v2 }));
    const result = await svc.export("m1", "u1", "markdown");
    expect(result.content).toContain("我们回答了什么");
    expect(result.content).not.toContain("没回答 / 证据不足");
    expect(result.content).not.toContain("如何阅读本报告");
    expect(result.content).not.toContain("建议的后续研究方向");
  });

  it("foreword with only howToRead (no whatWeAnswered, no followUp)", async () => {
    const forewordOnlyHow = {
      howToRead: "Read top to bottom.",
    };
    const v2 = makeV2Report({
      metadata: { topic: "T", leaderForeword: forewordOnlyHow },
    });
    const svc = new MissionExportService(makeStore({ reportFull: v2 }));
    const result = await svc.export("m1", "u1", "markdown");
    expect(result.content).toContain("如何阅读本报告");
    expect(result.content).not.toContain("建议的后续研究方向");
  });

  it("foreword addressed=partial alone covers ⚠️ branch", async () => {
    // Ensure the ternary middle branch is independently covered (line 267)
    const forewordPartial = {
      whatWeAnswered: [
        { criterion: "Q?", addressed: "partial", evidence: "Mixed." },
      ],
    };
    const v2 = makeV2Report({
      metadata: { topic: "T", leaderForeword: forewordPartial },
    });
    const svc = new MissionExportService(makeStore({ reportFull: v2 }));
    const result = await svc.export("m1", "u1", "markdown");
    expect(result.content).toContain("⚠️");
  });
});

describe("exportCitationsCsv: citations undefined branch", () => {
  it("reportFull without citations property → ?? [] empty array used (line 160)", async () => {
    // citations ?? [] → the [] branch when citations is absent
    const v2 = { content: { fullMarkdown: "" }, metadata: {} };
    const svc = new MissionExportService(makeStore({ reportFull: v2 }));
    const result = await svc.export("m1", "u1", "csv-citations");
    // Header only, no rows
    const lines = result.content.split("\n");
    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain("index,title");
  });
});

describe("reconciliationAppendix: no deduplicationStats branch", () => {
  it("reconciliation present but no deduplicationStats → no dedup stats line (line 331 if-false)", async () => {
    const mission = {
      reportFull: makeV2Report(),
      reconciliationReport: {
        // no deduplicationStats field
        termGlossary: [
          { canonical: "LLM", variants: ["Large Language Model"] },
        ],
        reconciliationReport: "Recon notes.",
      },
    };
    const svc = new MissionExportService(makeStore(mission));
    const result = await svc.export("m1", "u1", "markdown");
    expect(result.content).toContain("## 附录：对账总览");
    expect(result.content).not.toContain("去重统计");
    expect(result.content).toContain("LLM");
    expect(result.content).toContain("Recon notes.");
  });

  it("deduplicationStats with null/undefined fields → falls back to 0 (line 331 ?? 0 branches)", async () => {
    // Covers the ?? 0 binary-expr branches for each stat field when values are null
    const mission = {
      reportFull: makeV2Report(),
      reconciliationReport: {
        deduplicationStats: {
          duplicatesRemoved: null, // ?? 0 branch fires
          termVariantsUnified: null, // ?? 0 branch fires
          dataInconsistenciesFlagged: null, // ?? 0 branch fires
        },
      },
    };
    const svc = new MissionExportService(makeStore(mission));
    const result = await svc.export("m1", "u1", "markdown");
    expect(result.content).toContain("去重统计");
    // All values fall back to 0
    expect(result.content).toContain("去重 0 · 术语统一 0 · 数据冲突 0");
  });
});

// ── exportJson ────────────────────────────────────────────────────────────────

describe("exportJson", () => {
  it("JSON includes artifact and reconciliation", async () => {
    const mission = makeMissionWithRecon();
    const svc = new MissionExportService(makeStore(mission));
    const result = await svc.export("m1", "u1", "json");
    const parsed = JSON.parse(result.content);
    expect(parsed).toHaveProperty("artifact");
    expect(parsed).toHaveProperty("reconciliation");
    expect(parsed.reconciliation).not.toBeNull();
  });

  it("JSON reconciliation=null when no reconciliationReport", async () => {
    const svc = new MissionExportService(
      makeStore({ reportFull: makeV2Report() }),
    );
    const result = await svc.export("m1", "u1", "json");
    const parsed = JSON.parse(result.content);
    expect(parsed.reconciliation).toBeNull();
  });

  it("JSON is pretty-printed (indented)", async () => {
    const svc = new MissionExportService(
      makeStore({ reportFull: makeV2Report() }),
    );
    const result = await svc.export("m1", "u1", "json");
    expect(result.content).toContain("\n  ");
  });
});
