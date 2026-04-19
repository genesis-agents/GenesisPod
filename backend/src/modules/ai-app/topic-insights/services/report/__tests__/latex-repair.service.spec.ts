import { Test } from "@nestjs/testing";
import { LatexRepairService } from "../latex-repair.service";
import { ChatFacade } from "@/modules/ai-engine/facade";

describe("LatexRepairService", () => {
  let service: LatexRepairService;
  let mockChatFacade: { chat: jest.Mock };

  beforeEach(async () => {
    mockChatFacade = { chat: jest.fn() };
    const moduleRef = await Test.createTestingModule({
      providers: [
        LatexRepairService,
        { provide: ChatFacade, useValue: mockChatFacade },
      ],
    }).compile();
    service = moduleRef.get(LatexRepairService);
  });

  describe("early exit (no LLM needed)", () => {
    it("leaves clean markdown untouched without calling LLM", async () => {
      const input = "Good formula: $\\alpha + \\beta$ here.";
      const result = await service.repairMarkdown(input);
      expect(result.changed).toBe(false);
      expect(result.repaired).toBe(input);
      expect(mockChatFacade.chat).not.toHaveBeenCalled();
    });
  });

  describe("LLM repair path", () => {
    it("calls LLM when pre-cleanup does not fully resolve issues", async () => {
      const input = "Bare TTLT_r=\\sum_{s \\in S_r} T_{r,s} in prose.";
      mockChatFacade.chat.mockResolvedValue({
        content: "Bare $TTLT_r=\\sum_{s \\in S_r} T_{r,s}$ in prose.",
        isError: false,
      });
      const result = await service.repairMarkdown(input);
      expect(mockChatFacade.chat).toHaveBeenCalledTimes(1);
      expect(result.changed).toBe(true);
      expect(result.repaired).toContain("$TTLT_r=");
    });

    it("rejects LLM response that lengthens content excessively", async () => {
      const input = "Bare \\frac{a}{b} here.";
      mockChatFacade.chat.mockResolvedValue({
        content: "LONG REWRITE ".repeat(100),
        isError: false,
      });
      const result = await service.repairMarkdown(input);
      expect(result.changed).toBe(false);
      expect(result.failureReason).toBe("llm_response_length_out_of_bounds");
    });

    it("rejects LLM response that does not reduce issues", async () => {
      const input = "Bare \\frac{a}{b} here.";
      mockChatFacade.chat.mockResolvedValue({
        content: "Still \\frac{a}{b} bare.",
        isError: false,
      });
      const result = await service.repairMarkdown(input);
      expect(result.changed).toBe(false);
      expect(result.failureReason).toBe("no_improvement");
    });

    it("keeps original when LLM throws", async () => {
      const input = "Bare \\frac{a}{b} formula.";
      mockChatFacade.chat.mockRejectedValue(new Error("api timeout"));
      const result = await service.repairMarkdown(input);
      expect(result.changed).toBe(false);
      expect(result.failureReason).toContain("llm_error");
    });

    it("strips leading/trailing code fence from LLM response", async () => {
      const input =
        "A paragraph mentioning \\frac{a}{b} in text, without wrappers, quite long.";
      mockChatFacade.chat.mockResolvedValue({
        content:
          "```markdown\nA paragraph mentioning $\\frac{a}{b}$ in text, without wrappers, quite long.\n```",
        isError: false,
      });
      const result = await service.repairMarkdown(input);
      expect(result.repaired).not.toContain("```");
      expect(result.repaired).toContain("$\\frac{a}{b}$");
    });
  });

  // ==================== Boundary-marker defense ====================
  //
  // The user prompt wraps the payload in `--- DOCUMENT START ---` /
  // `--- DOCUMENT END ---`. Some LLMs echo these markers back (and
  // sometimes continue hallucinating new content past the end marker).
  // stripBoundaryMarkers is the safety net — see the cleanup incident
  // where 22 stored reports had up to 2.8 MB of hallucinated tail content.
  describe("boundary-marker stripping", () => {
    it("truncates at first --- DOCUMENT END --- and drops hallucinated tail", async () => {
      const input =
        "Intro with bare \\frac{a}{b} formula embedded inside some prose.";
      // LLM correctly repairs the body but echoes the end marker then
      // hallucinates a whole new section afterward.
      const hallucination =
        "\n\n## 3. New Hallucinated Chapter\n\nThis should never be kept. ".repeat(
          20,
        );
      mockChatFacade.chat.mockResolvedValue({
        content:
          "Intro with bare $\\frac{a}{b}$ formula embedded inside some prose.\n\n--- DOCUMENT END ---" +
          hallucination,
        isError: false,
      });

      const result = await service.repairMarkdown(input);

      expect(result.changed).toBe(true);
      expect(result.repaired).not.toContain("--- DOCUMENT END ---");
      expect(result.repaired).not.toContain("Hallucinated Chapter");
      expect(result.repaired).toContain("$\\frac{a}{b}$");
    });

    it("strips leading --- DOCUMENT START --- prefix without damaging body", async () => {
      const input = "Body with bare \\frac{a}{b} that needs fixing please.";
      mockChatFacade.chat.mockResolvedValue({
        content:
          "--- DOCUMENT START ---\nBody with bare $\\frac{a}{b}$ that needs fixing please.",
        isError: false,
      });

      const result = await service.repairMarkdown(input);

      expect(result.changed).toBe(true);
      expect(result.repaired).not.toContain("DOCUMENT START");
      expect(result.repaired.startsWith("Body with bare")).toBe(true);
    });

    it("handles BOTH markers: strips prefix + truncates at end marker", async () => {
      const input = "Some text with \\frac{x}{y} inline inside this prose.";
      mockChatFacade.chat.mockResolvedValue({
        content:
          "--- DOCUMENT START ---\nSome text with $\\frac{x}{y}$ inline inside this prose.\n--- DOCUMENT END ---\n\nStuff that must be dropped.",
        isError: false,
      });

      const result = await service.repairMarkdown(input);

      expect(result.changed).toBe(true);
      expect(result.repaired).not.toContain("DOCUMENT START");
      expect(result.repaired).not.toContain("DOCUMENT END");
      expect(result.repaired).not.toContain("must be dropped");
      expect(result.repaired).toContain("$\\frac{x}{y}$");
    });

    it("does not strip a non-prefix DOCUMENT START (keeps the body intact)", async () => {
      // If the marker appears mid-body (unusual but possible), leave it —
      // truncating could eat legitimate content. Only prefix matches strip.
      // Input padded so the echoed marker phrase stays within the 85%-120%
      // length-guard envelope.
      const input =
        "Report paragraph one with \\frac{p}{q} embedded in some technical prose. " +
        "The phrase DOCUMENT START is literally quoted inside this sentence body. " +
        "Continuing the paragraph with additional context and filler characters.";
      mockChatFacade.chat.mockResolvedValue({
        content:
          "Report paragraph one with $\\frac{p}{q}$ embedded in some technical prose. " +
          "The phrase --- DOCUMENT START --- is quoted inside this sentence body. " +
          "Continuing the paragraph with additional context and filler characters.",
        isError: false,
      });

      const result = await service.repairMarkdown(input);

      // The quoted marker survived (we only strip leading prefix).
      expect(result.repaired).toContain("DOCUMENT START");
    });

    it("passes through clean responses (no markers) unchanged", async () => {
      const input = "Plain \\frac{a}{b} formula needs repair please here now.";
      mockChatFacade.chat.mockResolvedValue({
        content: "Plain $\\frac{a}{b}$ formula needs repair please here now.",
        isError: false,
      });

      const result = await service.repairMarkdown(input);

      expect(result.changed).toBe(true);
      expect(result.repaired).toBe(
        "Plain $\\frac{a}{b}$ formula needs repair please here now.",
      );
    });

    it("truncates at the FIRST end marker (multiple markers guard)", async () => {
      const input = "Source with \\frac{m}{n} inline in a paragraph here.";
      mockChatFacade.chat.mockResolvedValue({
        content:
          "Source with $\\frac{m}{n}$ inline in a paragraph here.\n--- DOCUMENT END ---\nDROP-1\n--- DOCUMENT END ---\nDROP-2",
        isError: false,
      });

      const result = await service.repairMarkdown(input);

      expect(result.repaired).not.toContain("DROP-1");
      expect(result.repaired).not.toContain("DROP-2");
      expect(result.repaired).not.toContain("DOCUMENT END");
    });
  });
});
