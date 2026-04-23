/**
 * HarnessDispatcherService 单元测试
 */

import { HarnessDispatcherService } from "../harness-dispatcher.service";

function mkAgentRegistry(
  decision:
    | "new_research"
    | "refine_report"
    | "answer_followup"
    | "restart_mission"
    | null,
  opts?: { throws?: Error },
) {
  const executeSpec = jest.fn();
  if (opts?.throws) {
    executeSpec.mockRejectedValue(opts.throws);
  } else if (decision != null) {
    executeSpec.mockResolvedValue({
      output: {
        intent: decision,
        confidence: 0.9,
        reasoning: "agent decision reasoning",
      },
      state: "completed",
      iterations: 1,
      tokensUsed: 0,
      costUsd: 0,
      model: "stub",
      wallTimeMs: 0,
    });
  }
  return {
    get: jest.fn((id: string) =>
      id === "AG-17-LDP" && decision != null ? { executeSpec } : undefined,
    ),
  } as any;
}

describe("HarnessDispatcherService", () => {
  it("无 agentRegistry → fallback（new_research 当无 report）", async () => {
    const svc = new HarnessDispatcherService();
    const res = await svc.dispatch({
      userPrompt: "研究量子计算前沿",
      hasExistingReport: false,
    });
    expect(res.intent).toBe("new_research");
    expect(res.fromAgent).toBe(false);
  });

  it("无 agentRegistry + hasExistingReport → fallback refine_report", async () => {
    const svc = new HarnessDispatcherService();
    const res = await svc.dispatch({
      userPrompt: "continue",
      hasExistingReport: true,
    });
    expect(res.intent).toBe("refine_report");
    expect(res.fromAgent).toBe(false);
  });

  it("agent 返回 decision → 透传", async () => {
    const svc = new HarnessDispatcherService(
      mkAgentRegistry("answer_followup"),
    );
    const res = await svc.dispatch({
      userPrompt: "Q1 的数据来源？",
      hasExistingReport: true,
      lastReportSummary: "关于气候变化的概述",
    });
    expect(res.intent).toBe("answer_followup");
    expect(res.fromAgent).toBe(true);
    expect(res.confidence).toBe(0.9);
  });

  it("agent 抛错 → fallback，不扩散", async () => {
    const svc = new HarnessDispatcherService(
      mkAgentRegistry(null, { throws: new Error("LLM timeout") }),
    );
    const res = await svc.dispatch({
      userPrompt: "x",
      hasExistingReport: false,
    });
    expect(res.fromAgent).toBe(false);
    expect(res.intent).toBe("new_research");
  });

  it("agent 存在但 executeSpec 抛错 → fallback", async () => {
    const throwExec = jest.fn().mockRejectedValue(new Error("boom"));
    const reg = {
      get: jest.fn(() => ({ executeSpec: throwExec })),
    } as any;
    const svc = new HarnessDispatcherService(reg);
    const res = await svc.dispatch({
      userPrompt: "x",
      hasExistingReport: true,
    });
    expect(res.intent).toBe("refine_report");
    expect(res.fromAgent).toBe(false);
  });
});
