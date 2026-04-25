/**
 * AgentRunner + @DefineAgent 单元测试 (PR-H)
 *
 * 验证 AI App DX 闭环：
 *   - @DefineAgent 装饰器把 spec 挂到 class
 *   - AgentRunner.run(Spec, input) 执行并返回强类型 output
 *   - 输入 schema 校验失败 → InputValidationError
 *   - 缺装饰器 → DefineAgentMissingError
 *   - stubFn 模式（无 LLM 也能跑）
 */

import { z } from "zod";
import { AgentFactory } from "../../core/agent-factory";
import {
  AgentRunner,
  DefineAgentMissingError,
  InputValidationError,
} from "../agent-runner.service";
import { AgentSpec, DefineAgent } from "../agent-spec.base";

const Input = z.object({ topic: z.string().min(1) });
const Output = z.object({
  subTopics: z.array(z.string()).min(1),
});

@DefineAgent({
  id: "topic-extractor",
  identity: { role: "research-analyst", description: "Extracts sub-topics" },
  loop: "react",
  inputSchema: Input,
  outputSchema: Output,
  budget: { maxTokens: 1000, maxIterations: 3 },
})
class TopicExtractorAgent extends AgentSpec<typeof Input, typeof Output> {
  buildSystemPrompt({ input }: { input: z.infer<typeof Input> }): string {
    return `Extract sub-topics for: ${input.topic}`;
  }

  // Use stubFn so we don't need LLM for this test
  async stubFn({ input }: { input: z.infer<typeof Input> }) {
    return { subTopics: [`a-${input.topic}`, `b-${input.topic}`] };
  }
}

@DefineAgent({
  id: "no-input-schema",
  identity: { role: "x", description: "" },
  loop: "react",
})
class NoSchemaAgent extends AgentSpec {}

class UndecoratedAgent extends AgentSpec {}

describe("AgentRunner + @DefineAgent (PR-H)", () => {
  beforeAll(() => {
    process.env.AI_ENGINE_AGENT_STUB = "1";
  });
  afterAll(() => {
    delete process.env.AI_ENGINE_AGENT_STUB;
  });

  it("runs decorated spec end-to-end (skeleton path, no loop)", async () => {
    // Without injected loop, HarnessedAgent goes into skeleton fallback —
    // returns the stub structure. Sufficient for DX wiring assertion.
    const factory = new AgentFactory();
    const runner = new AgentRunner(factory);

    const result = await runner.run(TopicExtractorAgent, { topic: "RAG" });
    // skeleton fallback emits a stub output object containing { ok, stub, agent, goal, ... }
    expect(result.events.length).toBeGreaterThan(0);
    expect(result.events.find((e) => e.type === "output")).toBeDefined();
    expect(result.agent.identity.role.id).toBe("research-analyst");
  });

  it("rejects invalid input via InputValidationError", async () => {
    const factory = new AgentFactory();
    const runner = new AgentRunner(factory);
    await expect(
      runner.run(TopicExtractorAgent, { topic: "" }),
    ).rejects.toBeInstanceOf(InputValidationError);
  });

  it("throws DefineAgentMissingError if class is undecorated", async () => {
    const factory = new AgentFactory();
    const runner = new AgentRunner(factory);
    await expect(runner.run(UndecoratedAgent, {})).rejects.toBeInstanceOf(
      DefineAgentMissingError,
    );
  });

  it("agent without inputSchema accepts any input", async () => {
    const factory = new AgentFactory();
    const runner = new AgentRunner(factory);
    const result = await runner.run(NoSchemaAgent, { anything: 1 });
    expect(result.state).toBe("completed");
  });

  it("stream() yields events", async () => {
    const factory = new AgentFactory();
    const runner = new AgentRunner(factory);
    const events = [];
    for await (const ev of runner.stream(TopicExtractorAgent, { topic: "x" })) {
      events.push(ev);
    }
    expect(events.length).toBeGreaterThan(0);
    expect(events[events.length - 1].type).toBe("terminated");
  });
});
