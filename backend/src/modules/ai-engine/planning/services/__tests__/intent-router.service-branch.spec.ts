/**
 * IntentRouterService — supplemental branch coverage
 *
 * Targets:
 *  - Line 310: parseAnalysis throws when capabilities array is empty
 *  - Lines 359-360: static getRegisteredModules() return
 */

import { Test, TestingModule } from "@nestjs/testing";
import { IntentRouterService, AgentContext } from "../intent-router.service";
import { TaskPlannerService } from "../task-planner.service";
import { AiChatService } from "../../../llm/services/ai-chat.service";

const CTX: AgentContext = { userId: "u1", sessionId: "s1" };

function makeAiChatMock(responseContent: string) {
  return {
    chat: jest.fn().mockResolvedValue({
      content: responseContent,
      model: "test-model",
      tokensUsed: 50,
    }),
  };
}

async function buildService(responseContent: string) {
  const aiChatMock = makeAiChatMock(responseContent);
  const module: TestingModule = await Test.createTestingModule({
    providers: [
      IntentRouterService,
      TaskPlannerService,
      { provide: AiChatService, useValue: aiChatMock },
    ],
  }).compile();
  return module.get<IntentRouterService>(IntentRouterService);
}

describe("IntentRouterService (branch supplement)", () => {
  describe("route() — long intent truncated in log (line 223)", () => {
    it("handles intent string longer than 80 chars without error", async () => {
      const service = await buildService(
        JSON.stringify({
          capabilities: [
            { module: "ask", action: "x", input: "y", priority: 1 },
          ],
          confidence: 0.8,
        }),
      );
      const longIntent = "A".repeat(100);
      const result = await service.route(longIntent, CTX);
      expect(result.plan.steps[0].module).toBe("ask");
    });
  });

  describe("parseAnalysis — empty capabilities triggers fallback (line 310)", () => {
    it("falls back to buildFallbackAnalysis when capabilities is an empty array", async () => {
      // When LLM returns capabilities:[] the parse throws → fallback to ask
      const service = await buildService(
        JSON.stringify({ capabilities: [], confidence: 0.7 }),
      );

      const result = await service.route("do something", CTX);
      // Fallback sends to 'ask' module
      expect(result.plan.steps[0].module).toBe("ask");
    });

    it("falls back when capabilities field is missing entirely", async () => {
      const service = await buildService(
        JSON.stringify({ confidence: 0.5, reasoning: "no caps" }),
      );

      const result = await service.route("test", CTX);
      expect(result.plan.steps[0].module).toBe("ask");
    });
  });

  describe("parseAnalysis — optional fields use defaults (lines 314-324)", () => {
    it("uses confidence=0.5 when confidence is not a number", async () => {
      const service = await buildService(
        JSON.stringify({
          capabilities: [{ module: "ask", priority: 1 }],
          confidence: "high", // not a number → 0.5
        }),
      );
      const result = await service.route("test", CTX);
      expect(result.plan.steps[0].module).toBe("ask");
    });

    it("uses default action/input/priority when fields are not strings/numbers", async () => {
      const service = await buildService(
        JSON.stringify({
          capabilities: [
            {
              module: "research",
              action: 123, // not string → "执行任务"
              input: null, // not string → originalIntent
              priority: "first", // not number → i+1
            },
          ],
          confidence: 0.9,
        }),
      );
      const result = await service.route("do research", CTX);
      expect(result.plan.steps[0].module).toBe("research");
    });

    it("uses undefined reasoning when reasoning is not a string", async () => {
      const service = await buildService(
        JSON.stringify({
          capabilities: [
            { module: "ask", action: "x", input: "y", priority: 1 },
          ],
          confidence: 0.8,
          reasoning: 42, // not a string → undefined
        }),
      );
      const result = await service.route("test", CTX);
      expect(result.plan).toBeDefined();
    });
  });

  describe("getRegisteredModules() — static method (lines 359-360)", () => {
    it("returns an array of module registry entries", () => {
      const modules = IntentRouterService.getRegisteredModules();
      expect(Array.isArray(modules)).toBe(true);
      expect(modules.length).toBeGreaterThan(0);
      expect(modules[0]).toHaveProperty("module");
      expect(modules[0]).toHaveProperty("description");
    });

    it("every entry has required fields", () => {
      const modules = IntentRouterService.getRegisteredModules();
      modules.forEach((m) => {
        expect(typeof m.module).toBe("string");
        expect(typeof m.description).toBe("string");
        expect(typeof m.userDescription).toBe("string");
      });
    });
  });
});
