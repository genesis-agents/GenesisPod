/**
 * stage-view-process-trace.spec.ts —— T75 backend derive
 *
 * 验证 stage-view.projector 把 agent:thought/action/observation/reflection/error
 * 事件按 agentId → stageId 模式归到对应 stage 的 processTrace。
 *
 * 覆盖路径：
 *   1. reconciler agent → s5-reconciler
 *   2. analyst.retry agent prefix → s6-analyst
 *   3. writer#1 agent prefix → s8-writer-draft
 *   4. outline-planner → s7-writer-outline
 *   5. critic → s9-critic-l4（首匹配）
 *   6. leader 共享 agentId → s2-leader-plan first claim 独占
 *   7. observation 含 tokensUsed / latencyMs → totalTokens / totalDurationMs 累计
 *   8. reconciliation:completed → outputPeek.factCount/conflictCount/...
 *   9. stage 无 agent 事件 → processTrace undefined（不污染）
 *  10. stage:lifecycle 事件不被误判为 trace（不影响 status 派生）
 */

import { projectStages } from "../stage-view.projector";

interface E {
  type: string;
  payload: unknown;
  timestamp: number;
}

function find(stages: ReturnType<typeof projectStages>, id: string) {
  const s = stages.find((x) => x.id === id);
  if (!s) throw new Error(`stage ${id} missing`);
  return s;
}

describe("§ stage-view processTrace (T75)", () => {
  it("(1) reconciler agent 事件归入 s5-reconciler.processTrace", () => {
    const evs: E[] = [
      {
        type: "agent-playground.agent:thought",
        payload: {
          agentId: "reconciler",
          text: "scanning facts",
          tokenCount: 120,
          modelId: "gpt-4o",
        },
        timestamp: 100,
      },
    ];
    const stages = projectStages(evs);
    const s5 = find(stages, "s5-reconciler");
    expect(s5.processTrace?.reactTrace).toHaveLength(1);
    expect(s5.processTrace?.reactTrace?.[0].kind).toBe("thought");
    expect(s5.processTrace?.totalTokens).toBe(120);
    expect(s5.processTrace?.stepCount).toBe(1);
    expect(s5.processTrace?.llmCalls?.[0].modelId).toBe("gpt-4o");
  });

  it("(2) analyst.retry prefix → s6-analyst", () => {
    const stages = projectStages([
      {
        type: "agent-playground.agent:action",
        payload: { agentId: "analyst.retry", toolId: "search" },
        timestamp: 100,
      },
    ]);
    const s6 = find(stages, "s6-analyst");
    expect(s6.processTrace?.reactTrace?.[0].toolId).toBe("search");
  });

  it("(3) writer#1 prefix → s8-writer-draft", () => {
    const stages = projectStages([
      {
        type: "agent-playground.agent:thought",
        payload: { agentId: "writer#1", text: "drafting" },
        timestamp: 100,
      },
    ]);
    const s8 = find(stages, "s8-writer-draft");
    expect(s8.processTrace?.reactTrace).toHaveLength(1);
  });

  it("(4) outline-planner → s7-writer-outline", () => {
    const stages = projectStages([
      {
        type: "agent-playground.agent:thought",
        payload: { agentId: "outline-planner" },
        timestamp: 100,
      },
    ]);
    const s7 = find(stages, "s7-writer-outline");
    expect(s7.processTrace).toBeDefined();
  });

  it("(5) critic → s9-critic-l4（first stage match wins）", () => {
    const stages = projectStages([
      {
        type: "agent-playground.agent:thought",
        payload: { agentId: "critic" },
        timestamp: 100,
      },
    ]);
    const s9 = find(stages, "s9-critic-l4");
    expect(s9.processTrace).toBeDefined();
  });

  it("(6) leader 共享 agentId → s2-leader-plan claims first (first-stage-wins)", () => {
    const stages = projectStages([
      {
        type: "agent-playground.agent:thought",
        payload: { agentId: "leader", text: "planning" },
        timestamp: 100,
      },
      {
        type: "agent-playground.agent:thought",
        payload: { agentId: "leader", text: "signing off" },
        timestamp: 200,
      },
    ]);
    const s2 = find(stages, "s2-leader-plan");
    const s10 = find(stages, "s10-leader-signoff");
    expect(s2.processTrace?.reactTrace).toHaveLength(2);
    expect(s10.processTrace).toBeUndefined();
  });

  it("(7) observation 累计 totalTokens / totalDurationMs", () => {
    const stages = projectStages([
      {
        type: "agent-playground.agent:observation",
        payload: {
          agentId: "reconciler",
          toolId: "search",
          tokensUsed: 50,
          latencyMs: 1200,
        },
        timestamp: 100,
      },
      {
        type: "agent-playground.agent:observation",
        payload: {
          agentId: "reconciler",
          toolId: "search",
          tokensUsed: 80,
          latencyMs: 900,
        },
        timestamp: 200,
      },
    ]);
    const s5 = find(stages, "s5-reconciler");
    expect(s5.processTrace?.totalTokens).toBe(130);
    expect(s5.processTrace?.totalDurationMs).toBe(2100);
  });

  it("(8) reconciliation:completed → outputPeek 数值", () => {
    const stages = projectStages([
      {
        type: "agent-playground.reconciliation:completed",
        payload: {
          factCount: 47,
          conflictCount: 3,
          overlapCount: 1,
          gapCount: 2,
          figureCandidateCount: 5,
        },
        timestamp: 100,
      },
    ]);
    const s5 = find(stages, "s5-reconciler");
    expect(s5.processTrace?.outputPeek).toEqual({
      factCount: 47,
      conflictCount: 3,
      overlapCount: 1,
      gapCount: 2,
      figureCandidateCount: 5,
    });
  });

  it("(9) 无 agent 事件的 stage → processTrace undefined", () => {
    const stages = projectStages([
      {
        type: "agent-playground.agent:thought",
        payload: { agentId: "reconciler" },
        timestamp: 100,
      },
    ]);
    const s1 = find(stages, "s1-budget");
    expect(s1.processTrace).toBeUndefined();
  });

  it("(10) stage:lifecycle 不被误判为 agent trace", () => {
    const stages = projectStages([
      {
        type: "agent-playground.stage:lifecycle",
        payload: { stepId: "s5-reconciler", status: "started" },
        timestamp: 100,
      },
    ]);
    const s5 = find(stages, "s5-reconciler");
    expect(s5.status).toBe("running");
    expect(s5.processTrace).toBeUndefined();
  });

  it("(11) reflection / error 事件被纳入 reactTrace", () => {
    const stages = projectStages([
      {
        type: "agent-playground.agent:reflection",
        payload: { agentId: "reconciler", verdict: "ok" },
        timestamp: 100,
      },
      {
        type: "agent-playground.agent:error",
        payload: { agentId: "reconciler", error: "timeout" },
        timestamp: 200,
      },
    ]);
    const s5 = find(stages, "s5-reconciler");
    expect(s5.processTrace?.reactTrace).toHaveLength(2);
    expect(s5.processTrace?.reactTrace?.[0].kind).toBe("reflection");
    expect(s5.processTrace?.reactTrace?.[1].kind).toBe("error");
  });
});
