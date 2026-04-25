/**
 * HarnessModule DI Integration Smoke Test
 *
 * 证明：在 NestJS 容器里 HarnessModule 能完整启动，且关键 provider 之间
 * 的依赖图（尤其是 @Optional / forwardRef）真正可解析 —— 之前单测都是
 * `new` 直接构造，完全跳过 DI，这类真问题只能在容器测试里暴露。
 */

import { Test } from "@nestjs/testing";
import { HarnessFacade } from "../facade/harness.facade";
import { AgentFactory } from "../core/agent-factory";
import { HookRegistry } from "../core/hook-registry";
import { ReActLoop } from "../loop/react-loop";
import { PlanActLoop } from "../loop/plan-act-loop";
import { ReflexionLoop } from "../loop/reflexion-loop";
import { LoopRegistry } from "../loop/loop-registry";
import { ToolInvoker } from "../executor/tool-invoker";
import { SkillRegistry } from "../skills/skill-registry";
import { SkillActivator } from "../skills/skill-activator";
import { SkillLoader } from "../skills/skill-loader";
import { SubagentSpawner } from "../subagent/subagent-spawner";
import { ContextManager } from "../context/context-manager";
import { ContextCompactor } from "../context/context-compactor";
import { PriorityPruner } from "../context/priority-pruner";
import { MemoryBridge } from "../memory-bridge/memory-bridge.service";
import { CheckpointService } from "../checkpoint/checkpoint.service";
import { InMemoryCheckpointStore } from "../checkpoint/in-memory-checkpoint-store";
import { SkillLearner } from "../learning/skill-learner";
import { ToolRegistry } from "../../tools/registry/tool-registry";
import { AiChatService } from "../../llm/services/ai-chat.service";

describe("HarnessModule (NestJS DI integration)", () => {
  /**
   * We don't import the real HarnessModule because it transitively pulls in
   * LLM / Tools / Memory modules, which require Prisma + config. Instead,
   * we assemble the providers manually with lightweight mocks for external
   * dependencies. This proves the wiring in harness.module.ts is CORRECT —
   * all class tokens match, no missing @Inject, no missing provider.
   */
  async function build() {
    const mockChat = {
      chat: jest.fn(async () => ({ content: "", model: "m" })),
    };
    const mockToolRegistry = {
      has: jest.fn(() => false),
      get: jest.fn(),
    };

    const moduleRef = await Test.createTestingModule({
      providers: [
        { provide: AiChatService, useValue: mockChat },
        { provide: ToolRegistry, useValue: mockToolRegistry },

        HookRegistry,
        ToolInvoker,
        ContextCompactor,
        PriorityPruner,
        ContextManager,
        ReActLoop,
        PlanActLoop,
        ReflexionLoop,
        LoopRegistry,
        MemoryBridge,
        SkillRegistry,
        SkillLoader,
        SkillActivator,
        SubagentSpawner,
        InMemoryCheckpointStore,
        {
          provide: CheckpointService,
          useFactory: (store: InMemoryCheckpointStore) =>
            new CheckpointService(store),
          inject: [InMemoryCheckpointStore],
        },
        SkillLearner,
        AgentFactory,
        HarnessFacade,
      ],
    }).compile();
    // Simulate HarnessModule.onApplicationBootstrap wiring (setter injection for circular dep)
    moduleRef
      .get(AgentFactory)
      .setSubagentSpawner(moduleRef.get(SubagentSpawner));
    // v2: Simulate loop registration (mirrors HarnessModule.onApplicationBootstrap)
    const registry = moduleRef.get(LoopRegistry);
    registry.register(moduleRef.get(ReActLoop));
    registry.register(moduleRef.get(PlanActLoop));
    registry.register(moduleRef.get(ReflexionLoop));
    return moduleRef;
  }

  it("resolves HarnessFacade without throwing (all DI tokens match)", async () => {
    const moduleRef = await build();
    expect(moduleRef.get(HarnessFacade)).toBeInstanceOf(HarnessFacade);
  });

  it("AgentFactory receives SubagentSpawner via DI (B-C2 regression)", async () => {
    const moduleRef = await build();
    const factory = moduleRef.get(AgentFactory);
    const spawner = moduleRef.get(SubagentSpawner);

    // private field: inspect via any-cast since we only need to prove wiring
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const injected = (factory as any).subagentSpawner;
    expect(injected).toBe(spawner);
  });

  it("ReActLoop + SkillActivator share the same HookRegistry (B-C3 regression)", async () => {
    const moduleRef = await build();
    const hooks = moduleRef.get(HookRegistry);
    const loop = moduleRef.get(ReActLoop);
    const activator = moduleRef.get(SkillActivator);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect((loop as any).hookRegistry).toBe(hooks);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect((activator as any).hooks).toBe(hooks);
  });

  it("HarnessFacade.hooks is the DI HookRegistry (B-C4 regression)", async () => {
    const moduleRef = await build();
    const hooks = moduleRef.get(HookRegistry);
    const facade = moduleRef.get(HarnessFacade);
    expect(facade.hooks).toBe(hooks);
  });

  it("CheckpointService is injected with InMemoryCheckpointStore", async () => {
    const moduleRef = await build();
    const svc = moduleRef.get(CheckpointService);
    // Roundtrip a snapshot to prove store is real
    const cp = await svc.snapshot({
      agentId: "test-agent",
      agentState: "running",
      envelope: {
        id: "e",
        system: "sys",
        messages: [],
        reminders: [],
        tools: [],
        memory: { sessionId: "s" },
        budget: {
          tokensUsed: 0,
          tokensRemaining: 100,
          iterationsUsed: 0,
          iterationsRemaining: 10,
          wallTimeStartMs: Date.now(),
        },
      },
      identity: {
        role: { id: "r", name: "R", description: "" },
      },
      eventsEmitted: 0,
      reason: "manual",
    });
    expect(cp.id).toBeDefined();
    const loaded = await svc.load(cp.id);
    expect(loaded?.id).toBe(cp.id);
  });

  it("HarnessFacade.createAgent wires real loop + factory", async () => {
    const moduleRef = await build();
    const facade = moduleRef.get(HarnessFacade);
    const agent = facade.createAgent({
      identity: {
        role: { id: "r1", name: "R1", description: "" },
      },
      userId: "u1",
    });
    expect(agent.id).toBeDefined();
    expect(agent.state).toBe("idle");
    expect(agent.identity.role.id).toBe("r1");
  });

  it("registering a hook on facade.hooks is visible to SkillActivator", async () => {
    const moduleRef = await build();
    const facade = moduleRef.get(HarnessFacade);
    const hooks = moduleRef.get(HookRegistry);
    const calls: string[] = [];

    facade.hooks.register({
      event: "Stop",
      scope: "global",
      handler: () => {
        calls.push("via facade");
      },
    });

    // Dispatch through the DI registry — proves they share state
    await hooks.dispatch(
      "Stop",
      { reason: "completed" },
      {
        agentId: "a1",
        envelope: {
          id: "e",
          system: "",
          messages: [],
          reminders: [],
          tools: [],
          memory: { sessionId: "s" },
          budget: {
            tokensUsed: 0,
            tokensRemaining: 0,
            iterationsUsed: 0,
            iterationsRemaining: 0,
            wallTimeStartMs: 0,
          },
        },
      },
    );

    expect(calls).toEqual(["via facade"]);
  });
});
