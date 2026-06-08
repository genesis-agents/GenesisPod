/**
 * marketplace-catalog.service.spec.ts —— Agent 货架投影验收（红线②③）
 *
 * getAgents() 的 sedimented 部分只读 SEDIMENTED_AGENT_SPECS + readDefineAgentMeta，
 * 不碰任何注入的 registry → 可用空依赖实例化直接验证投影输出。
 *
 * 验收：
 *   - 6 个已沉淀角色都出现，id === spec id（契约②）
 *   - researcher 的 skillIds / toolIds 非空（红线③：带出真技能/工具，非硬编码空）
 */
import { MarketplaceCatalogService } from "../marketplace-catalog.service";

describe("MarketplaceCatalogService.getAgents — sedimented 投影", () => {
  const svc = new MarketplaceCatalogService(
    null as never,
    null as never,
    null as never,
    null as never,
    null as never,
  );
  const agents = svc.getAgents();
  const byId = new Map(agents.map((a) => [a.id, a]));

  const SEDIMENTED_IDS = [
    "playground.researcher",
    "playground.reconciler",
    "playground.analyst",
    "playground.writer",
    "playground.reviewer",
    "playground.verifier",
  ];

  it("6 个已沉淀角色都进货架，id === spec id（契约②）", () => {
    for (const id of SEDIMENTED_IDS) {
      expect(byId.has(id)).toBe(true);
      expect(byId.get(id)!.id).toBe(id);
    }
  });

  it("Leader/Steward 不单独上架（粒度法）", () => {
    expect(byId.has("playground.leader")).toBe(false);
    expect(byId.has("playground.steward")).toBe(false);
  });

  it("红线③：researcher 投影带出真 skillIds + toolIds", () => {
    const researcher = byId.get("playground.researcher")!;
    expect(researcher.skillIds.length).toBeGreaterThan(0);
    expect(researcher.toolIds.length).toBeGreaterThan(0);
    // toolIds 来自 @DefineAgent.tools 真白名单（含 web-search）
    expect(researcher.toolIds).toContain("web-search");
  });
});
