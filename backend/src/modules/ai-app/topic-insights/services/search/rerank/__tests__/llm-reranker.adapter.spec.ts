import { LlmRerankerAdapter } from "../llm-reranker.adapter";
import type { RerankCandidate } from "../rerank.types";
import type { ChatFacade } from "@/modules/ai-engine/facade";
import { DataSourceType } from "../../../../types/data-source.types";

jest.mock("@/modules/ai-engine/facade", () => ({}));

function makeCandidate(i: number, title: string): RerankCandidate {
  return {
    originalIndex: i,
    item: {
      sourceType: DataSourceType.WEB,
      title,
      url: `https://example.com/${i}`,
      snippet: `snippet ${i}: content for ${title}`,
    },
  };
}

describe("LlmRerankerAdapter", () => {
  let chatFacade: jest.Mocked<ChatFacade>;
  let adapter: LlmRerankerAdapter;

  beforeEach(() => {
    chatFacade = {
      chat: jest.fn(),
    } as unknown as jest.Mocked<ChatFacade>;
    adapter = new LlmRerankerAdapter(chatFacade);
  });

  it("exposes id 'llm'", () => {
    expect(adapter.id).toBe("llm");
  });

  describe("passthrough", () => {
    it("returns original order when candidates.length <= topK (no LLM call)", async () => {
      const candidates = [
        makeCandidate(0, "a"),
        makeCandidate(1, "b"),
        makeCandidate(2, "c"),
      ];
      const result = await adapter.rerank({
        query: "test",
        candidates,
        topK: 5,
      });

      expect(result).toHaveLength(3);
      expect(result.map((r) => r.originalIndex)).toEqual([0, 1, 2]);
      expect(chatFacade.chat).not.toHaveBeenCalled();
    });
  });

  describe("LLM-backed rerank", () => {
    it("sorts by LLM scores and returns top K", async () => {
      const candidates = [
        makeCandidate(0, "low"),
        makeCandidate(1, "high"),
        makeCandidate(2, "mid"),
        makeCandidate(3, "zero"),
      ];
      chatFacade.chat.mockResolvedValue({
        content: JSON.stringify({
          scores: [
            { id: 0, score: 3 },
            { id: 1, score: 9 },
            { id: 2, score: 6 },
            { id: 3, score: 1 },
          ],
        }),
        isError: false,
      } as never);

      const result = await adapter.rerank({
        query: "test",
        candidates,
        topK: 2,
      });

      expect(result).toHaveLength(2);
      expect(result[0].originalIndex).toBe(1); // highest
      expect(result[1].originalIndex).toBe(2); // second highest
      expect(result[0].rerankScore).toBeCloseTo(0.9, 2);
      expect(result[1].rerankScore).toBeCloseTo(0.6, 2);
    });

    it("fails open when LLM returns isError", async () => {
      const candidates = [
        makeCandidate(0, "a"),
        makeCandidate(1, "b"),
        makeCandidate(2, "c"),
        makeCandidate(3, "d"),
      ];
      chatFacade.chat.mockResolvedValue({
        content: "api error",
        isError: true,
      } as never);

      const result = await adapter.rerank({
        query: "test",
        candidates,
        topK: 2,
      });

      expect(result).toHaveLength(2);
      // fail-open 保留 fusion 顺序前 K
      expect(result.map((r) => r.originalIndex)).toEqual([0, 1]);
    });

    it("fails open when LLM returns malformed JSON", async () => {
      const candidates = [
        makeCandidate(0, "a"),
        makeCandidate(1, "b"),
        makeCandidate(2, "c"),
        makeCandidate(3, "d"),
      ];
      chatFacade.chat.mockResolvedValue({
        content: "not json at all",
        isError: false,
      } as never);

      const result = await adapter.rerank({
        query: "test",
        candidates,
        topK: 2,
      });

      expect(result).toHaveLength(2);
      expect(result.map((r) => r.originalIndex)).toEqual([0, 1]);
    });

    it("fails open when LLM throws", async () => {
      const candidates = [
        makeCandidate(0, "a"),
        makeCandidate(1, "b"),
        makeCandidate(2, "c"),
        makeCandidate(3, "d"),
      ];
      chatFacade.chat.mockRejectedValue(new Error("network down"));

      const result = await adapter.rerank({
        query: "test",
        candidates,
        topK: 2,
      });

      expect(result).toHaveLength(2);
      expect(result.map((r) => r.originalIndex)).toEqual([0, 1]);
    });

    it("survives partial LLM score list (uses fallback for missing)", async () => {
      const candidates = [
        makeCandidate(0, "a"),
        makeCandidate(1, "b"),
        makeCandidate(2, "c"),
        makeCandidate(3, "d"),
      ];
      // LLM only scored 2 out of 4
      chatFacade.chat.mockResolvedValue({
        content: JSON.stringify({
          scores: [
            { id: 2, score: 9 },
            { id: 3, score: 8 },
          ],
        }),
        isError: false,
      } as never);

      const result = await adapter.rerank({
        query: "test",
        candidates,
        topK: 3,
      });

      expect(result).toHaveLength(3);
      // scored 高的优先（id=2 得 0.9, id=3 得 0.8）
      expect(result[0].originalIndex).toBe(2);
      expect(result[1].originalIndex).toBe(3);
    });

    it("ignores out-of-range ids from LLM", async () => {
      const candidates = [makeCandidate(0, "a"), makeCandidate(1, "b")];
      chatFacade.chat.mockResolvedValue({
        content: JSON.stringify({
          scores: [
            { id: 99, score: 10 }, // out of range
            { id: -1, score: 10 }, // negative
            { id: 0, score: 5 },
            { id: 1, score: 7 },
          ],
        }),
        isError: false,
      } as never);

      const result = await adapter.rerank({
        query: "test",
        candidates,
        topK: 1,
      });

      expect(result).toHaveLength(1);
      // candidates.length === topK so passthrough anyway (2 == 1 → false, 2 > 1 → calls LLM)
      // Actually 2 candidates, topK=1 → calls LLM
      expect(result[0].originalIndex).toBe(1); // id=1 → score 0.7
    });
  });
});
