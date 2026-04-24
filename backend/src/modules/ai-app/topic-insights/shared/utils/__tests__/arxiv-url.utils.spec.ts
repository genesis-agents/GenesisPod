/**
 * arxiv-url.utils.ts · unit tests
 *
 * baseline data-enrichment.ts L445-L491 arXiv 升级回归防护。
 */

import { resolveArxivFetchTarget } from "../arxiv-url.utils";

describe("resolveArxivFetchTarget", () => {
  it("passes through non-arXiv URLs unchanged", () => {
    const r = resolveArxivFetchTarget("https://example.com/page");
    expect(r.fetchUrl).toBe("https://example.com/page");
    expect(r.baseUrl).toBe("https://example.com/page");
    expect(r.upgraded).toBe(false);
  });

  it("upgrades /abs/ to /html/ with trailing slash", () => {
    const r = resolveArxivFetchTarget("https://arxiv.org/abs/2601.13671");
    expect(r.fetchUrl).toBe("https://arxiv.org/html/2601.13671/");
    expect(r.baseUrl).toBe("https://arxiv.org/html/2601.13671/");
    expect(r.upgraded).toBe(true);
  });

  it("upgrades /abs/ with version (v1) to /html/ with trailing slash", () => {
    const r = resolveArxivFetchTarget("https://arxiv.org/abs/2601.13671v1");
    expect(r.fetchUrl).toBe("https://arxiv.org/html/2601.13671v1/");
    expect(r.upgraded).toBe(true);
  });

  it("appends trailing slash to /html/{id} (no upgrade flag)", () => {
    const r = resolveArxivFetchTarget("https://arxiv.org/html/2601.13671v1");
    expect(r.fetchUrl).toBe("https://arxiv.org/html/2601.13671v1/");
    expect(r.baseUrl).toBe("https://arxiv.org/html/2601.13671v1/");
    expect(r.upgraded).toBe(false);
  });

  it("leaves /html/{id}/ unchanged (already correct)", () => {
    const r = resolveArxivFetchTarget("https://arxiv.org/html/2601.13671/");
    expect(r.fetchUrl).toBe("https://arxiv.org/html/2601.13671/");
    expect(r.baseUrl).toBe("https://arxiv.org/html/2601.13671/");
  });

  it("relative URL resolution works correctly after trailing slash fix", () => {
    // 这是 baseline 修 bug 的关键：没尾部斜杠时 new URL("x.png", base) 解析错
    const r = resolveArxivFetchTarget("https://arxiv.org/abs/2601.13671");
    const resolved = new URL("Figure1.png", r.baseUrl).toString();
    expect(resolved).toBe("https://arxiv.org/html/2601.13671/Figure1.png");
  });

  it("without arXiv upgrade, relative URL would be wrong (negative proof)", () => {
    // 证明 baseline bug 的反面：不升级时 base 解析错误
    const wrongBase = "https://arxiv.org/html/2601.13671"; // 无斜杠
    const wrongResolved = new URL("Figure1.png", wrongBase).toString();
    // new URL 把 /html/2601.13671 视为 "文件"，相对路径解析到 /html/Figure1.png
    expect(wrongResolved).toBe("https://arxiv.org/html/Figure1.png");
  });
});
