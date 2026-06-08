/**
 * agent-spec-catalog.spec.ts —— STEP 1 装配路探通 + 契约守护
 *
 * 验收（标准 28 / reviewer 硬门槛）：
 *   - resolveAgentSpec('playground.researcher') 返回可跑的 @DefineAgent 类
 *   - 该类的 @DefineAgent 元数据：id === SKU id，skills / tools 非空（红线③有真料）
 */
import { readDefineAgentMeta } from "@/modules/ai-harness/facade";
import {
  resolveAgentSpec,
  SEDIMENTED_AGENT_SPECS,
  STANDALONE_RUNNABLE_AGENT_IDS,
} from "../agent-spec-catalog";
import { ResearcherAgent } from "../../playground/mission/agents/researcher/researcher.agent";

describe("agent-spec-catalog（市场 agent 沉淀单一源）", () => {
  it("resolveAgentSpec('playground.researcher') 返回 ResearcherAgent 类", () => {
    expect(resolveAgentSpec("playground.researcher")).toBe(ResearcherAgent);
  });

  it("未沉淀 id 返回 undefined", () => {
    expect(resolveAgentSpec("playground.leader")).toBeUndefined();
    expect(resolveAgentSpec("nope")).toBeUndefined();
  });

  it("契约②：每个已沉淀类的 @DefineAgent id === 解析键", () => {
    for (const [id, SpecClass] of Object.entries(SEDIMENTED_AGENT_SPECS)) {
      const meta = readDefineAgentMeta(SpecClass);
      expect(meta).not.toBeNull();
      expect(meta!.id).toBe(id);
    }
  });

  it("红线③：researcher 投影带出真 skills + tools（非硬编码空）", () => {
    const meta = readDefineAgentMeta(ResearcherAgent);
    expect((meta!.skills ?? []).length).toBeGreaterThan(0);
    expect((meta!.tools ?? []).length).toBeGreaterThan(0);
  });

  it("⑤：STANDALONE 集合仅含 researcher，且都能解析（防误标中段 agent 可独立跑）", () => {
    expect([...STANDALONE_RUNNABLE_AGENT_IDS]).toEqual([
      "playground.researcher",
    ]);
    for (const id of STANDALONE_RUNNABLE_AGENT_IDS) {
      expect(resolveAgentSpec(id)).toBeDefined();
    }
  });
});
