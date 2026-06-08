/**
 * DeepInsightDefaultRunner 单测 —— 验证：
 *   1. onModuleInit 自注册进 CapabilityRegistry，按 manifest.id 可解析。
 *   2. happy-path：plan(chat) → research/reconcile/analyze/write/review(AgentRunner)
 *      顺序真跑（mock 依赖），产出 completed + 报告 + 引用 + 算力汇总。
 *   3. 全 researcher 失败 → status failed（不伪装成功）。
 *   4. plan 的 chat 调用带 billing.userId（严格 BYOK 不掉默认网关）。
 */
import { CapabilityRegistry } from "../../../capability/capability-registry";
import { DeepInsightDefaultRunner } from "../deep-insight.runner";

type AnyFn = jest.Mock;

function makeRunner() {
  const agentRunner = { run: jest.fn() as AnyFn };
  const chatFacade = { chat: jest.fn() as AnyFn };
  const registry = new CapabilityRegistry();
  const runner = new DeepInsightDefaultRunner(
    agentRunner as never,
    chatFacade as never,
    registry,
  );
  return { runner, agentRunner, chatFacade, registry };
}

const PLAN_JSON =
  '{"themeSummary":"theme","dimensions":[{"id":"d1","name":"维度一","rationale":"r1"},{"id":"d2","name":"维度二","rationale":"r2"}]}';

describe("DeepInsightDefaultRunner", () => {
  it("onModuleInit 注册进 CapabilityRegistry，按 manifest.id 解析", () => {
    const { runner, registry } = makeRunner();
    runner.onModuleInit();
    expect(registry.resolve("deep-insight")).toBe(runner);
    expect(runner.manifest.kind).toBe("workflow");
    expect(runner.manifest.version).toBe("1.0.0");
  });

  it("happy-path：顺序跑通并产出 completed + 报告 + 引用 + 算力", async () => {
    const { runner, agentRunner, chatFacade } = makeRunner();
    chatFacade.chat.mockResolvedValue({ content: PLAN_JSON, tokensUsed: 10 });
    // researcher×2 → reconciler → analyst → writer → reviewer
    agentRunner.run
      .mockResolvedValueOnce({
        output: {
          findings: [
            { source: "https://a.com", sourceTitle: "A", claim: "c1" },
          ],
        },
        tokensUsed: { total: 5 },
        costCents: 1,
      })
      .mockResolvedValueOnce({
        output: {
          findings: [
            { source: "https://b.com", sourceTitle: "B", claim: "c2" },
          ],
        },
        tokensUsed: { total: 5 },
        costCents: 1,
      })
      .mockResolvedValueOnce({
        output: { reconciliationReport: "rec", factTable: [] },
        tokensUsed: { total: 3 },
        costCents: 1,
      })
      .mockResolvedValueOnce({
        output: { insights: [{ point: "i1" }], themeSummary: "theme" },
        tokensUsed: { total: 4 },
        costCents: 1,
      })
      .mockResolvedValueOnce({
        output: { title: "报告", sections: [{ heading: "H1", body: "B1" }] },
        tokensUsed: { total: 6 },
        costCents: 2,
      })
      .mockResolvedValueOnce({
        output: { score: 80 },
        tokensUsed: { total: 2 },
        costCents: 1,
      });

    const events: string[] = [];
    const res = await runner.run(
      { topic: "AI 2026", depth: "standard", language: "zh-CN" },
      {
        userId: "user-1",
        missionId: "m-1",
        onEvent: (e) => {
          events.push(e.type);
        },
      },
    );

    expect(res.status).toBe("completed");
    expect(res.report).toContain("# 报告");
    expect(res.report).toContain("## H1");
    expect(res.references).toHaveLength(2);
    expect(res.usage?.totalTokens).toBeGreaterThan(0);
    expect(events).toContain("started");
    expect(events).toContain("completed");
    // 2 researchers + reconciler + analyst + writer + reviewer = 6 agent runs
    expect(agentRunner.run).toHaveBeenCalledTimes(6);
  });

  it("plan 的 chat 带 billing.userId（严格 BYOK）", async () => {
    const { runner, agentRunner, chatFacade } = makeRunner();
    chatFacade.chat.mockResolvedValue({ content: PLAN_JSON, tokensUsed: 1 });
    agentRunner.run.mockResolvedValue({
      output: { findings: [], insights: [], sections: [] },
      tokensUsed: { total: 1 },
      costCents: 0,
    });
    await runner.run({ topic: "t" }, { userId: "user-9", missionId: "m" });
    const call = chatFacade.chat.mock.calls[0][0];
    expect(call.billing).toEqual(expect.objectContaining({ userId: "user-9" }));
  });

  it("全 researcher 失败 → failed（不伪装成功）", async () => {
    const { runner, agentRunner, chatFacade } = makeRunner();
    chatFacade.chat.mockResolvedValue({ content: PLAN_JSON, tokensUsed: 1 });
    agentRunner.run.mockRejectedValue(new Error("no key"));
    const res = await runner.run(
      { topic: "t" },
      { userId: "u", missionId: "m" },
    );
    expect(res.status).toBe("failed");
    expect(res.error).toMatch(/all researchers failed/);
  });
});
