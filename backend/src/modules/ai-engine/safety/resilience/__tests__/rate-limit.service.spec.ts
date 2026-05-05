/**
 * RateLimitService spec（v5.1 R0.5-E rate-limit 回归 ai-engine 核心 service）
 */
import { RateLimitService } from "../rate-limit.service";
import { InMemoryTokenBucketStore } from "../token-bucket";

describe("RateLimitService (v5.1 R0.5-E core service)", () => {
  let svc: RateLimitService;
  let store: InMemoryTokenBucketStore;

  beforeEach(() => {
    svc = new RateLimitService();
    store = new InMemoryTokenBucketStore();
    svc.setStore(store);
  });

  it("default RPM：quota 内透传 allowed=true", async () => {
    svc.configure({ globalRpm: 60 });
    const r = await svc.checkAndConsume("tool", {});
    expect(r.allowed).toBe(true);
  });

  it("global quota 耗尽 → allowed=false + scope=global", async () => {
    svc.configure({ globalRpm: 60 });
    store.setForTest("global:tool", 0);
    const r = await svc.checkAndConsume("tool", {});
    expect(r.allowed).toBe(false);
    expect(r.scope).toBe("global");
    expect(r.retryAfterMs).toBe(1000);
  });

  it("per-tenant：tenantA 耗尽不影响 tenantB", async () => {
    svc.configure({ globalRpm: 1000, perTenantRpm: 60 });
    store.setForTest("tenant:tenantA:tool", 0);

    const a = await svc.checkAndConsume("tool", { tenantId: "tenantA" });
    const b = await svc.checkAndConsume("tool", { tenantId: "tenantB" });
    expect(a.allowed).toBe(false);
    expect(a.scope).toBe("tenant");
    expect(a.tenantId).toBe("tenantA");
    expect(b.allowed).toBe(true);
  });

  it("per-agentType：业务无关标签限流", async () => {
    svc.configure({
      globalRpm: 1000,
      perAgentTypeRpm: { "research-style": 30 },
    });
    store.setForTest("agentType:research-style:tool", 0);

    const r = await svc.checkAndConsume("tool", {
      agentType: "research-style",
    });
    expect(r.allowed).toBe(false);
    expect(r.scope).toBe("agentType");
    expect(r.agentType).toBe("research-style");
  });

  it("defaultAgentTypeRpm：未列出的 agentType 走默认", async () => {
    svc.configure({
      globalRpm: 1000,
      defaultAgentTypeRpm: 30,
    });
    store.setForTest("agentType:other:tool", 0);

    const r = await svc.checkAndConsume("tool", { agentType: "other" });
    expect(r.allowed).toBe(false);
    expect(r.scope).toBe("agentType");
  });

  it("store 故障 → fail-open（不阻塞主流程）", async () => {
    const broken = {
      tryConsume: async () => {
        throw new Error("redis down");
      },
    };
    svc.setStore(broken);
    svc.configure({ globalRpm: 60 });
    const r = await svc.checkAndConsume("tool", {});
    expect(r.allowed).toBe(true);
  });

  it("严禁在 manifest/console output 出现 ai-app 名（业务无关）", () => {
    const j = JSON.stringify(svc);
    expect(j).not.toMatch(/playground|research|writing|topic-insights|office/i);
  });
});
