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

  describe("pre-cleanup (no LLM needed)", () => {
    it("strips $1 artifacts from old regex bug", async () => {
      const input =
        "Formula: $$$1$$$1$$TTLT=t_{in}+t_{d1}+t_{out}$$$1$$$1$$ end.";
      const result = await service.repairMarkdown(input);
      expect(result.repaired).not.toContain("$1");
      expect(mockChatFacade.chat).not.toHaveBeenCalled();
    });

    it("strips $$ misplaced inside subscript brace", async () => {
      const input = "起点 $t_0$, 终点 $t_{\\mathrm{end}$$}$";
      const result = await service.repairMarkdown(input);
      expect(result.repaired).not.toContain("{\\mathrm{end}$$}");
      expect(result.repaired).toContain("{\\mathrm{end}}");
    });

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
});
