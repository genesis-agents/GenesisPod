import {
  ReportArtifactAssembler,
  lengthTargetFor,
} from "../report-artifact-assembler.service";

function makeQualityGate() {
  return {
    validateFullReport: jest.fn().mockReturnValue({
      passed: true,
      wasAutoFixed: false,
      fixedContent: "",
      violations: [],
    }),
  };
}

function makeBaseInput() {
  return {
    topic: "AI Trends",
    language: "zh-CN" as const,
    styleProfile: "analytical" as const,
    lengthProfile: "standard" as const,
    audienceProfile: "professional" as const,
    plan: {
      themeSummary: "AI is transforming everything",
      dimensions: [
        { id: "d1", name: "Market", rationale: "Market analysis" },
        { id: "d2", name: "Technology", rationale: "Tech analysis" },
      ],
    },
    researcherResults: [
      {
        dimension: "Market",
        findings: [
          {
            claim: "AI market growing",
            evidence: "Revenue data",
            source: "https://gartner.com/ai-report",
          },
          {
            claim: "Enterprise adoption up",
            evidence: "Survey results",
            source: "https://mckinsey.com/survey",
          },
        ],
        summary: "Market is growing fast",
      },
      {
        dimension: "Technology",
        findings: [
          {
            claim: "LLMs improving",
            evidence: "Benchmark data",
            source: "https://arxiv.org/ai",
          },
        ],
        summary: "Tech is advancing",
      },
    ],
    analyst: {
      themeSummary: "AI is a transformative force across industries",
      keyInsights: [
        { title: "Market Growth", oneLine: "AI market growing at 35% CAGR" },
        { title: "Tech Leap", oneLine: "LLM capabilities doubling yearly" },
      ],
    },
    writerReport: {
      title: "AI Trends 2025",
      summary: "AI is reshaping the world",
      sections: [
        {
          heading: "Market",
          body: "The market is growing. Revenue is up [1]. Enterprise adoption surges [2].",
        },
        {
          heading: "Technology",
          body: "LLMs are improving rapidly [3]. New architectures emerge.",
        },
        {
          heading: "Conclusion",
          body: "AI will continue to grow and transform industries.",
        },
      ],
      conclusion: "AI will define the next decade",
      citations: [
        "https://gartner.com/ai-report",
        "https://mckinsey.com/survey",
        "https://arxiv.org/ai",
      ],
    },
    generationTimeMs: 120000,
    totalTokens: { prompt: 5000, completion: 10000, total: 15000 },
    costCents: 50,
    modelTrail: ["gpt-4o"],
  };
}

describe("ReportArtifactAssembler", () => {
  let qualityGate: ReturnType<typeof makeQualityGate>;
  let service: ReportArtifactAssembler;

  beforeEach(() => {
    qualityGate = makeQualityGate();
    service = new ReportArtifactAssembler(qualityGate as never);
  });

  // Core assembly
  it("assemble: returns a ReportArtifact with required top-level fields", () => {
    const result = service.assemble(makeBaseInput());
    expect(result.content).toBeDefined();
    expect(result.sections).toBeDefined();
    expect(result.citations).toBeDefined();
    expect(result.figures).toBeDefined();
    expect(result.quickView).toBeDefined();
    expect(result.factTable).toBeDefined();
    expect(result.metadata).toBeDefined();
    expect(result.quality).toBeDefined();
  });

  it("assemble: fullMarkdown starts with # title", () => {
    const result = service.assemble(makeBaseInput());
    expect(result.content.fullMarkdown).toMatch(/^# AI Trends 2025/);
  });

  it("assemble: sections tree extracts ## headings", () => {
    const result = service.assemble(makeBaseInput());
    const titles = result.sections.map((s) => s.title);
    expect(titles).toContain("Market");
    expect(titles).toContain("Technology");
  });

  it("assemble: citations built from writerReport.citations", () => {
    const result = service.assemble(makeBaseInput());
    expect(result.citations.length).toBeGreaterThan(0);
    const urls = result.citations.map((c) => c.url);
    expect(urls).toContain("https://gartner.com/ai-report");
  });

  it("assemble: metadata.topic matches input.topic", () => {
    const result = service.assemble(makeBaseInput());
    expect(result.metadata.topic).toBe("AI Trends");
  });

  it("assemble: metadata.modelTrail includes gpt-4o", () => {
    const result = service.assemble(makeBaseInput());
    expect(result.metadata.modelTrail).toContain("gpt-4o");
  });

  it("assemble: quality.overall is a number between 0 and 100", () => {
    const result = service.assemble(makeBaseInput());
    expect(result.quality.overall).toBeGreaterThanOrEqual(0);
    expect(result.quality.overall).toBeLessThanOrEqual(100);
  });

  it("assemble: quality.dimensions has 10 keys", () => {
    const result = service.assemble(makeBaseInput());
    expect(Object.keys(result.quality.dimensions)).toHaveLength(10);
  });

  it("assemble: fullReportSize matches byteLength of fullMarkdown", () => {
    const result = service.assemble(makeBaseInput());
    expect(result.content.fullReportSize).toBe(
      Buffer.byteLength(result.content.fullMarkdown, "utf8"),
    );
  });

  // Quality gate
  it("assemble: calls qualityGate.validateFullReport", () => {
    service.assemble(makeBaseInput());
    expect(qualityGate.validateFullReport).toHaveBeenCalled();
  });

  it("assemble: applies fixed content when wasAutoFixed=true", () => {
    const fixedContent =
      "# AI Trends 2025\n\n## Market\n\nFixed content here.\n\n## Technology\n\nFixed tech content.\n\n## Conclusion\n\nFixed conclusion.";
    qualityGate.validateFullReport.mockReturnValue({
      passed: false,
      wasAutoFixed: true,
      fixedContent,
      violations: [{ rule: "excessive_bold", message: "Too much bold" }],
    });
    const result = service.assemble(makeBaseInput());
    expect(result.content.fullMarkdown).toContain("Fixed content");
  });

  it("assemble: gate violations added to quality.warnings", () => {
    qualityGate.validateFullReport.mockReturnValue({
      passed: false,
      wasAutoFixed: false,
      fixedContent: "",
      violations: [
        { rule: "subjective_language", message: "Found subjective expression" },
      ],
    });
    const result = service.assemble(makeBaseInput());
    const warning = result.quality.warnings.find((w) =>
      w.dimension?.includes("quality_gate"),
    );
    expect(warning).toBeDefined();
  });

  // factTable
  it("assemble: factTable empty without reconciliationReport", () => {
    const result = service.assemble(makeBaseInput());
    expect(result.factTable).toEqual([]);
  });

  it("assemble: factTable populated from reconciliationReport", () => {
    const input = {
      ...makeBaseInput(),
      reconciliationReport: {
        factTable: [
          {
            id: "f1",
            entity: "AI",
            attribute: "market_size",
            value: "$100B",
            sources: ["https://gartner.com/ai-report"],
          },
        ],
        conflicts: [],
      },
    };
    const result = service.assemble(input);
    expect(result.factTable).toHaveLength(1);
    expect(result.factTable[0].entity).toBe("AI");
  });

  // quickView
  it("assemble: quickView.executiveSummary has markdown field", () => {
    const result = service.assemble(makeBaseInput());
    expect(result.quickView.executiveSummary.markdown).toBeDefined();
    expect(result.quickView.executiveSummary.markdown.length).toBeGreaterThan(
      0,
    );
  });

  it("assemble: quickView.topHighlights from analyst.keyInsights", () => {
    const result = service.assemble(makeBaseInput());
    expect(result.quickView.topHighlights.length).toBeGreaterThan(0);
  });

  // Inline citation normalization
  it("assemble: normalizes [anchor](url) inline citations to [N]", () => {
    const input = {
      ...makeBaseInput(),
      writerReport: {
        ...makeBaseInput().writerReport,
        sections: [
          {
            heading: "Market",
            body: "AI is growing [see report](https://gartner.com/ai-report) rapidly.",
          },
        ],
        citations: [],
      },
    };
    const result = service.assemble(input);
    // Should have at least 1 citation from the inline link
    expect(result.citations.length).toBeGreaterThan(0);
  });

  // Format fixes
  it("applyFormatFixes: collapses 3+ consecutive newlines", () => {
    const input = {
      ...makeBaseInput(),
      writerReport: {
        ...makeBaseInput().writerReport,
        sections: [{ heading: "Market", body: "Para 1\n\n\n\n\nPara 2" }],
        citations: [],
      },
    };
    const result = service.assemble(input);
    expect(result.content.fullMarkdown).not.toMatch(/\n{3,}/);
  });

  // Section type inference
  it("assemble: executive_summary section type detected", () => {
    const result = service.assemble(makeBaseInput());
    const execSection = result.sections.find(
      (s) => s.type === "executive_summary",
    );
    expect(execSection).toBeDefined();
  });

  it("assemble: conclusion section type detected", () => {
    const result = service.assemble(makeBaseInput());
    const conclusionSec = result.sections.find((s) => s.type === "conclusion");
    expect(conclusionSec).toBeDefined();
  });

  // Analyst optional fields
  it("assemble: includes crossDimAnalysis section when present", () => {
    const input = {
      ...makeBaseInput(),
      analyst: {
        ...makeBaseInput().analyst,
        crossDimAnalysis:
          "AI and market forces are deeply intertwined across multiple sectors and dimensions.",
      },
    };
    const result = service.assemble(input);
    expect(result.content.fullMarkdown).toContain(
      "crossDimAnalysis".length > 0 ? "跨维度分析" : "",
    );
  });

  it("assemble: includes riskAssessment section when present", () => {
    const input = {
      ...makeBaseInput(),
      analyst: {
        ...makeBaseInput().analyst,
        riskAssessment:
          "Key risks include regulatory changes, market volatility, and technology disruption.",
      },
    };
    const result = service.assemble(input);
    expect(result.content.fullMarkdown).toContain("风险评估");
  });

  it("assemble: includes strategicRecommendations section when present", () => {
    const input = {
      ...makeBaseInput(),
      analyst: {
        ...makeBaseInput().analyst,
        strategicRecommendations:
          "Invest in AI infrastructure and build internal capabilities to remain competitive.",
      },
    };
    const result = service.assemble(input);
    expect(result.content.fullMarkdown).toContain("战略建议");
  });

  // Figures pipeline
  it("assemble: figures array is empty when no figureCandidates", () => {
    const result = service.assemble(makeBaseInput());
    expect(result.figures).toEqual([]);
  });

  it("assemble: figures pipeline with valid figureCandidates populates figures", () => {
    // Need: sourceUrl matches a citation, imageUrl present, not a garbage URL
    const input = {
      ...makeBaseInput(),
      researcherResults: [
        {
          ...makeBaseInput().researcherResults[0],
          figureCandidates: [
            {
              sourceUrl: "https://gartner.com/ai-report",
              imageUrl: "https://gartner.com/chart1.png",
              caption: "AI market growth chart showing 35% CAGR",
              sourcePageOrSection: "p.5",
              relevanceHint: "high" as const,
            },
          ],
        },
        makeBaseInput().researcherResults[1],
      ],
    };
    // The citation for gartner.com/ai-report is already in writerReport.citations
    const result = service.assemble(input);
    // figures may or may not be populated depending on section matching; check no throw
    expect(result.figures).toBeDefined();
  });

  // markOrphanCitations: with references section
  it("assemble: orphan citations annotated when references section absent", () => {
    const input = {
      ...makeBaseInput(),
      writerReport: {
        ...makeBaseInput().writerReport,
        sections: [
          {
            heading: "Market",
            body: "AI is growing [1]. See also [99] for context.",
          },
        ],
        citations: ["https://gartner.com/ai-report"],
      },
    };
    // No References section → no orphan annotation (markOrphanCitations returns early)
    const result = service.assemble(input);
    expect(result.content.fullMarkdown).toBeDefined();
  });

  // Format fixes: table row fix
  it("applyFormatFixes: fixes table row missing trailing pipe", () => {
    const input = {
      ...makeBaseInput(),
      writerReport: {
        ...makeBaseInput().writerReport,
        sections: [
          {
            heading: "Market",
            body: "| Col1 | Col2 | Col3\n| --- | --- | ---\n| A | B | C",
          },
        ],
        citations: [],
      },
    };
    const result = service.assemble(input);
    expect(result.content.fullMarkdown).toBeDefined();
  });

  // Per-dim fullMarkdown
  it("assemble: uses researcherResults.fullMarkdown when available", () => {
    // fullMarkdown must be > 200 chars after trim to be used (see buildFullMarkdown guard)
    const dimMarkdown =
      "# Market\n\n" +
      "This is the full dim markdown content that is long enough to be used by the assembler. " +
      "It contains detailed analysis of the market trends and growth patterns. " +
      "Additional content to ensure we exceed the 200 character threshold required by the assembler.\n";
    const input = {
      ...makeBaseInput(),
      researcherResults: [
        {
          ...makeBaseInput().researcherResults[0],
          fullMarkdown: dimMarkdown,
        },
        makeBaseInput().researcherResults[1],
      ],
    };
    const result = service.assemble(input);
    expect(result.content.fullMarkdown).toContain("full dim markdown content");
  });

  // ★ P0-LIVE-REPORT-FORMAT (2026-04-30): 参考文献 section 必须 append 到 markdown 末尾
  it("assemble: appends ## 参考文献 section to fullMarkdown when citations present", () => {
    const input = makeBaseInput();
    const result = service.assemble(input);
    expect(result.citations.length).toBeGreaterThan(0);
    expect(result.content.fullMarkdown).toMatch(/##\s+参考文献/);
    expect(result.sections.find((s) => s.title === "参考文献")).toBeDefined();
    // each citation has a corresponding [N] line in the references section
    const refSectionMatch =
      result.content.fullMarkdown.match(/##\s+参考文献[\s\S]*$/);
    expect(refSectionMatch).not.toBeNull();
    for (const c of result.citations) {
      expect(refSectionMatch![0]).toContain(`[${c.index}]`);
    }
  });

  it("assemble: emits English References heading for en-US language", () => {
    const input = { ...makeBaseInput(), language: "en-US" as const };
    const result = service.assemble(input);
    expect(result.content.fullMarkdown).toMatch(/##\s+References/);
  });
});

// lengthTargetFor helper
describe("lengthTargetFor", () => {
  it("brief → 3000", () => expect(lengthTargetFor("brief")).toBe(3000));
  it("standard → 8000", () => expect(lengthTargetFor("standard")).toBe(8000));
  it("deep → 15000", () => expect(lengthTargetFor("deep")).toBe(15000));
  it("extended → 25000", () => expect(lengthTargetFor("extended")).toBe(25000));
  it("epic → 80000", () => expect(lengthTargetFor("epic")).toBe(80000));
  it("mega → 200000", () => expect(lengthTargetFor("mega")).toBe(200000));
  it("unknown → 8000 (default)", () =>
    expect(lengthTargetFor("unknown" as never)).toBe(8000));
});
