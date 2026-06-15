import {
  DEFAULT_RETRIEVAL_TOOL_IDS,
  resolveDefaultRetrievalTools,
} from "../default-retrieval-tools";

describe("default-retrieval-tools", () => {
  it("bundle 含四层互补检索能力（顺序稳定）", () => {
    expect(DEFAULT_RETRIEVAL_TOOL_IDS).toEqual([
      "web-search",
      "explore-search",
      "rag-search",
      "radar-signal-search",
    ]);
  });

  it("resolveDefaultRetrievalTools 只返回已注册的 id", () => {
    const registered = new Set(["web-search", "explore-search"]);
    const registry = { has: (id: string) => registered.has(id) };
    expect(resolveDefaultRetrievalTools(registry)).toEqual([
      "web-search",
      "explore-search",
    ]);
  });

  it("全部注册时返回完整 bundle；全部缺席时返回空", () => {
    expect(resolveDefaultRetrievalTools({ has: () => true })).toEqual([
      ...DEFAULT_RETRIEVAL_TOOL_IDS,
    ]);
    expect(resolveDefaultRetrievalTools({ has: () => false })).toEqual([]);
  });
});
