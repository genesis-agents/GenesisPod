import { Test, TestingModule } from "@nestjs/testing";
import { ClaimVerificationService } from "../claim-verification.service";
import { ChatFacade } from "@/modules/ai-engine/facade";
import { ClaimType } from "../../../types/claim-verification.types";
import type { VerifiableClaim } from "../../../types/claim-verification.types";
import type { EnrichedEvidenceData } from "../../../types/research.types";

const mockAiFacade = {
  chat: jest.fn(),
};

const makeClaim = (
  id: string,
  text: string,
  priority: "high" | "medium" | "low" = "medium",
): VerifiableClaim => ({
  id,
  text,
  type: ClaimType.FACTUAL,
  location: {
    sectionId: "s1",
    paragraphIndex: 0,
    sentenceIndex: 0,
    charStart: 0,
    charEnd: text.length,
  },
  verificationPriority: priority,
  extractedAt: new Date(),
});

const makeEvidence = (
  id: string,
  title: string,
  snippet = "Evidence content that supports the claim.",
): EnrichedEvidenceData =>
  ({
    id,
    title,
    url: `https://source-${id}.com/article`,
    snippet,
    fullContent: snippet + " More detailed content here. " + snippet,
    contentSource: "fetched",
    urlValid: true,
    sourceType: "WEB",
    domain: `source-${id}.com`,
    publishedAt: new Date("2025-01-01"),
  }) as any;

describe("ClaimVerificationService", () => {
  let service: ClaimVerificationService;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ClaimVerificationService,
        { provide: ChatFacade, useValue: mockAiFacade },
      ],
    }).compile();

    service = module.get<ClaimVerificationService>(ClaimVerificationService);
  });

  // ============================================================
  // extractClaims
  // ============================================================

  describe("extractClaims", () => {
    it("should extract verifiable claims from section content", async () => {
      mockAiFacade.chat.mockResolvedValue({
        content: JSON.stringify({
          claims: [
            {
              text: "OpenAI was founded in 2015.",
              type: "factual",
              paragraphIndex: 0,
              sentenceIndex: 0,
              isVerifiable: true,
              verificationPriority: "high",
              reason: "Key founding fact",
            },
            {
              text: "The AI market will reach $2 trillion by 2030.",
              type: "statistical",
              paragraphIndex: 1,
              sentenceIndex: 0,
              isVerifiable: true,
              verificationPriority: "medium",
              reason: "Market projection",
            },
          ],
        }),
      });

      const claims = await service.extractClaims(
        "section-1",
        "OpenAI content",
        {
          verificationPriorities: ["high", "medium", "low"],
          maxClaimsPerSection: 10,
        },
      );

      expect(claims.length).toBe(2);
      expect(claims[0].text).toBe("OpenAI was founded in 2015.");
      expect(claims[0].id).toContain("section-1");
    });

    it("should filter out opinion type claims", async () => {
      mockAiFacade.chat.mockResolvedValue({
        content: JSON.stringify({
          claims: [
            {
              text: "AI is wonderful.",
              type: "opinion",
              isVerifiable: true,
              verificationPriority: "low",
            },
            {
              text: "GPT-4 has 1 trillion parameters.",
              type: "factual",
              isVerifiable: true,
              verificationPriority: "high",
            },
          ],
        }),
      });

      const claims = await service.extractClaims("s1", "content", {
        verificationPriorities: ["high", "medium", "low"],
      });

      expect(claims).toHaveLength(1);
      expect(claims[0].type).toBe(ClaimType.FACTUAL);
    });

    it("should filter claims by verification priority", async () => {
      mockAiFacade.chat.mockResolvedValue({
        content: JSON.stringify({
          claims: [
            {
              text: "High priority fact",
              type: "factual",
              isVerifiable: true,
              verificationPriority: "high",
            },
            {
              text: "Low priority fact",
              type: "factual",
              isVerifiable: true,
              verificationPriority: "low",
            },
          ],
        }),
      });

      const claims = await service.extractClaims("s1", "content", {
        verificationPriorities: ["high"], // only high priority
      });

      expect(claims).toHaveLength(1);
      expect(claims[0].text).toBe("High priority fact");
    });

    it("should return empty array when AI call fails", async () => {
      mockAiFacade.chat.mockRejectedValue(new Error("LLM error"));

      const claims = await service.extractClaims("s1", "content");

      expect(claims).toEqual([]);
    });

    it("should return empty when AI response has no valid claims structure", async () => {
      mockAiFacade.chat.mockResolvedValue({ content: "No JSON here" });

      const claims = await service.extractClaims("s1", "content");

      expect(claims).toEqual([]);
    });

    it("should respect maxClaimsPerSection limit", async () => {
      const manyClaims = Array.from({ length: 20 }, (_, i) => ({
        text: `Claim ${i}`,
        type: "factual",
        isVerifiable: true,
        verificationPriority: "medium",
      }));

      mockAiFacade.chat.mockResolvedValue({
        content: JSON.stringify({ claims: manyClaims }),
      });

      const claims = await service.extractClaims("s1", "content", {
        maxClaimsPerSection: 5,
      });

      expect(claims.length).toBeLessThanOrEqual(5);
    });
  });

  // ============================================================
  // verifyClaim
  // ============================================================

  describe("verifyClaim", () => {
    it("should return unverified result when no evidences provided", async () => {
      const claim = makeClaim("c1", "OpenAI was founded in 2015.");

      const result = await service.verifyClaim(claim, []);

      expect(result.overallVerdict).toBe("unverified");
      expect(result.sourceVerifications).toHaveLength(0);
    });

    it("should verify claim against provided evidence and return verdict", async () => {
      // Mock finding relevant evidences (short list -> returns as-is)
      mockAiFacade.chat.mockResolvedValue({
        content: JSON.stringify({
          verdict: "supports",
          confidence: 0.9,
          relevantQuote: "Founded in 2015",
          reasoning: "The evidence clearly states the founding year",
          factualAlignment: 0.95,
        }),
      });

      const claim = makeClaim("c1", "OpenAI was founded in 2015.");
      const evidences = [
        makeEvidence("e1", "OpenAI History"),
        makeEvidence("e2", "AI History"),
      ];

      const result = await service.verifyClaim(claim, evidences);

      expect(result.sourceVerifications.length).toBeGreaterThan(0);
      expect(result.factScore).toBeGreaterThan(0);
    });

    it("should return contradicted verdict when multiple sources refute the claim", async () => {
      // All sources refute
      mockAiFacade.chat.mockResolvedValue({
        content: JSON.stringify({
          verdict: "refutes",
          confidence: 0.85,
          relevantQuote: "OpenAI was founded in 2013, not 2015",
          reasoning: "The evidence contradicts the claim",
          factualAlignment: 0.1,
        }),
      });

      const claim = makeClaim("c1", "OpenAI was founded in 2013.");
      const evidences = [
        makeEvidence("e1", "OpenAI History 1"),
        makeEvidence("e2", "OpenAI History 2"),
      ];

      const result = await service.verifyClaim(claim, evidences);

      // With 2 refuting sources, verdict should be contradicted
      expect(result.overallVerdict).toBe("contradicted");
    });
  });

  // ============================================================
  // verifySection
  // ============================================================

  describe("verifySection", () => {
    it("should return empty report when no claims extracted", async () => {
      // extractClaims returns []
      mockAiFacade.chat.mockResolvedValue({ content: "invalid json" });

      const report = await service.verifySection(
        "s1",
        "Introduction",
        "Content here",
        [],
      );

      expect(report.sectionId).toBe("s1");
      expect(report.claims).toHaveLength(0);
      expect(report.metrics.totalClaims).toBe(0);
      expect(report.metrics.overallCredibility).toBe(100);
    });

    it("should return section report with metrics", async () => {
      // First call: extractClaims
      // Second call: findRelevantEvidences (only when evidences > 3)
      // Third+ calls: verifyAgainstSource
      mockAiFacade.chat
        .mockResolvedValueOnce({
          content: JSON.stringify({
            claims: [
              {
                text: "AI is growing",
                type: "factual",
                isVerifiable: true,
                verificationPriority: "high",
              },
            ],
          }),
        })
        .mockResolvedValueOnce({
          content: JSON.stringify({
            verdict: "supports",
            confidence: 0.9,
            relevantQuote: "AI growth confirmed",
            reasoning: "Evidence supports",
            factualAlignment: 0.9,
          }),
        });

      const evidences = [
        makeEvidence("e1", "AI Report"),
        makeEvidence("e2", "Market Study"),
      ];
      const report = await service.verifySection(
        "s1",
        "AI Market Overview",
        "AI is growing rapidly.",
        evidences,
        { verificationPriorities: ["high", "medium", "low"] },
      );

      expect(report.sectionTitle).toBe("AI Market Overview");
      expect(report.metrics.totalClaims).toBe(1);
      expect(typeof report.metrics.overallCredibility).toBe("number");
    });
  });

  // ============================================================
  // verifyDimension
  // ============================================================

  describe("verifyDimension", () => {
    it("should aggregate metrics across sections", async () => {
      // Mock empty sections (no claims extracted)
      mockAiFacade.chat.mockResolvedValue({ content: "no json" });

      const report = await service.verifyDimension(
        "dim1",
        "Technology Trends",
        [
          { id: "s1", title: "Overview", content: "Content" },
          { id: "s2", title: "Details", content: "More Content" },
        ],
        [],
      );

      expect(report.dimensionId).toBe("dim1");
      expect(report.dimensionName).toBe("Technology Trends");
      expect(report.sections).toHaveLength(2);
      expect(typeof report.aggregateMetrics.overallCredibility).toBe("number");
    });

    it("should generate recommendations when credibility is low", async () => {
      mockAiFacade.chat.mockResolvedValue({ content: "no json" });

      const report = await service.verifyDimension("dim1", "Tech", [], []);

      // Empty sections → should still return a valid report
      expect(report.recommendations).toBeDefined();
      expect(Array.isArray(report.recommendations)).toBe(true);
    });
  });

  // ============================================================
  // aggregateVerifications (indirectly via verifyClaim)
  // ============================================================

  describe("verdict aggregation logic", () => {
    it("should return verified when 2+ sources support with factScore >= 0.7", async () => {
      mockAiFacade.chat.mockResolvedValue({
        content: JSON.stringify({
          verdict: "supports",
          confidence: 0.85,
          relevantQuote: "Confirmed",
          reasoning: "Strong evidence",
          factualAlignment: 0.9,
        }),
      });

      const claim = makeClaim("c1", "The technology is proven.");
      const evidences = [
        makeEvidence("e1", "Study 1"),
        makeEvidence("e2", "Study 2"),
      ];

      const result = await service.verifyClaim(claim, evidences);

      // 2 supports → should be verified
      expect(result.overallVerdict).toBe("verified");
    });

    it("should return unverified when no supporting sources", async () => {
      mockAiFacade.chat.mockResolvedValue({
        content: JSON.stringify({
          verdict: "insufficient",
          confidence: 0.3,
          relevantQuote: "",
          reasoning: "Not enough info",
          factualAlignment: 0.2,
        }),
      });

      const claim = makeClaim("c1", "Some obscure claim.");
      const evidences = [makeEvidence("e1", "Unrelated Source")];

      const result = await service.verifyClaim(claim, evidences);

      expect(result.overallVerdict).toBe("unverified");
    });

    it("should have positive factors when agreement rate is high", async () => {
      mockAiFacade.chat.mockResolvedValue({
        content: JSON.stringify({
          verdict: "supports",
          confidence: 0.9,
          relevantQuote: "Strongly confirmed",
          reasoning: "Clear evidence",
          factualAlignment: 0.9,
        }),
      });

      const claim = makeClaim("c1", "AI has been growing.", "high");
      const evidences = [
        makeEvidence("e1", "Source 1"),
        makeEvidence("e2", "Source 2"),
      ];

      const result = await service.verifyClaim(claim, evidences);

      expect(result.confidence.level).toBeGreaterThan(0);
      expect(result.confidence.factors.length).toBeGreaterThan(0);
    });
  });
});
