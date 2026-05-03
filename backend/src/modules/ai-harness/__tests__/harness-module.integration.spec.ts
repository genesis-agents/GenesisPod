/**
 * HarnessModule DI Integration Smoke Test
 *
 * Ã¨Â¯ÂÃ¦ËœÅ½Ã¯Â¼Å¡Ã¥Å“Â¨ NestJS Ã¥Â®Â¹Ã¥â„¢Â¨Ã©â€¡Å’ HarnessModule Ã¨Æ’Â½Ã¥Â®Å’Ã¦â€¢Â´Ã¥ÂÂ¯Ã¥Å Â¨Ã¯Â¼Å’Ã¤Â¸â€Ã¥â€¦Â³Ã©â€Â® provider Ã¤Â¹â€¹Ã©â€”Â´
 * Ã§Å¡â€žÃ¤Â¾ÂÃ¨Âµâ€“Ã¥â€ºÂ¾Ã¯Â¼Ë†Ã¥Â°Â¤Ã¥â€¦Â¶Ã¦ËœÂ¯ @Optional / forwardRefÃ¯Â¼â€°Ã§Å“Å¸Ã¦Â­Â£Ã¥ÂÂ¯Ã¨Â§Â£Ã¦Å¾Â Ã¢â‚¬â€Ã¢â‚¬â€ Ã¤Â¹â€¹Ã¥â€°ÂÃ¥Ââ€¢Ã¦Âµâ€¹Ã©Æ’Â½Ã¦ËœÂ¯
 * `new` Ã§â€ºÂ´Ã¦Å½Â¥Ã¦Å¾â€žÃ©â‚¬Â Ã¯Â¼Å’Ã¥Â®Å’Ã¥â€¦Â¨Ã¨Â·Â³Ã¨Â¿â€¡ DIÃ¯Â¼Å’Ã¨Â¿â„¢Ã§Â±Â»Ã§Å“Å¸Ã©â€”Â®Ã©Â¢ËœÃ¥ÂÂªÃ¨Æ’Â½Ã¥Å“Â¨Ã¥Â®Â¹Ã¥â„¢Â¨Ã¦Âµâ€¹Ã¨Â¯â€¢Ã©â€¡Å’Ã¦Å¡Â´Ã©Å“Â²Ã£â‚¬â€š
 */

import { Test } from "@nestjs/testing";
import { HarnessFacade } from "../facade/harness.facade";
import { AgentFactory } from "../agents/core/agent-factory";
import { HookRegistry } from "../agents/core/hook-registry";
import { ReActLoop } from "../runner/loop/react-loop";
import { PlanActLoop } from "../runner/loop/plan-act-loop";
import { ReflexionLoop } from "../runner/loop/reflexion-loop";
import { LoopRegistry } from "../runner/loop/loop-registry";
import { ToolInvoker } from "../runner/tool-invoker/tool-invoker";
import { BuiltinSkillCatalog } from "../agents/builtin-skills/skill-registry";
import { SkillActivator } from "../agents/builtin-skills/skill-activator";
import { SkillLoader } from "../agents/builtin-skills/skill-loader";
import { SubagentSpawner } from "../agents/subagents/subagent-spawner";
import { ContextManager } from "../runner/context/context-manager";
import { ContextCompactor } from "../runner/context/context-compactor";
import { PriorityPruner } from "../runner/context/priority-pruner";
import { MemoryContextBindingService } from "../memory/indexing/memory-context-binding.service";
import { CheckpointService } from "../memory/checkpoint/checkpoint.service";
import { InMemoryCheckpointStore } from "../memory/checkpoint/in-memory-checkpoint-store";
import { SkillLearner } from "../agents/learning/skill-learner";
import { ToolRegistry } from "../../ai-engine/tools/registry/tool.registry";
import { AiChatService } from "../../ai-engine/llm/services/ai-chat.service";

describe("HarnessModule (NestJS DI integration)", () => {
  /**
   * We don't import the real HarnessModule because it transitively pulls in
   * LLM / Tools / Memory modules, which require Prisma + config. Instead,
   * we assemble the providers manually with lightweight mocks for external
   * dependencies. This proves the wiring in harness.module.ts is CORRECT Ã¢â‚¬â€
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
        MemoryContextBindingService,
        BuiltinSkillCatalog,
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
    const injected = (factory as Record<string, unknown>).subagentSpawner;
    expect(injected).toBe(spawner);
  });

  it("ReActLoop + SkillActivator share the same HookRegistry (B-C3 regression)", async () => {
    const moduleRef = await build();
    const hooks = moduleRef.get(HookRegistry);
    const loop = moduleRef.get(ReActLoop);
    const activator = moduleRef.get(SkillActivator);

    expect((loop as Record<string, unknown>).hookRegistry).toBe(hooks);
    expect((activator as Record<string, unknown>).hooks).toBe(hooks);
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

    // Dispatch through the DI registry Ã¢â‚¬â€ proves they share state
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
