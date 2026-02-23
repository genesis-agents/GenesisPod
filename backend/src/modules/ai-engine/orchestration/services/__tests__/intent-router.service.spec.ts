import { Test, TestingModule } from "@nestjs/testing";
import { IntentRouterService, AgentContext } from "../intent-router.service";
import { TaskPlannerService } from "../task-planner.service";
import { AiChatService } from "../../../llm/services/ai-chat.service";

// ─── Helpers ──────────────────────────────────────────────

function makeAiChatMock(responseContent: string) {
  return {
    chat: jest.fn().mockResolvedValue({
      content: responseContent,
      model: "test-model",
      tokensUsed: 50,
    }),
  };
}

const CTX: AgentContext = { userId: "user-1", sessionId: "sess-1" };

describe("IntentRouterService", () => {
  let service: IntentRouterService;
  let aiChatMock: ReturnType<typeof makeAiChatMock>;

  async function build(responseContent: string) {
    aiChatMock = makeAiChatMock(responseContent);
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        IntentRouterService,
        TaskPlannerService,
        { provide: AiChatService, useValue: aiChatMock },
      ],
    }).compile();

    service = module.get(IntentRouterService);
  }

  describe("route() — happy path", () => {
    it("single research module → sequential plan, no confirmation", async () => {
      await build(
        JSON.stringify({
          capabilities: [
            {
              module: "research",
              action: "深度研究",
              input: "OpenAI o3",
              priority: 1,
            },
          ],
          confidence: 0.9,
          reasoning: "user wants research",
        }),
      );

      const result = await service.route("研究 OpenAI o3", CTX);
      expect(result.plan.steps).toHaveLength(1);
      expect(result.plan.steps[0].module).toBe("research");
      expect(result.requiresConfirmation).toBe(false);
      expect(result.plan.confidence).toBe(0.9);
    });

    it("research + writing → dag plan with dependency", async () => {
      await build(
        JSON.stringify({
          capabilities: [
            { module: "research", action: "研究", input: "o3", priority: 1 },
            {
              module: "writing",
              action: "写报告",
              input: "o3分析",
              priority: 2,
            },
          ],
          confidence: 0.85,
        }),
      );

      const result = await service.route("研究 o3 然后写投资人简报", CTX);
      expect(result.plan.steps).toHaveLength(2);
      const writing = result.plan.steps.find((s) => s.module === "writing")!;
      expect(writing.dependsOn.length).toBeGreaterThan(0);
      expect(result.plan.executionMode).not.toBe("parallel");
    });

    it("low confidence → requiresConfirmation=true", async () => {
      await build(
        JSON.stringify({
          capabilities: [
            { module: "ask", action: "问答", input: "?", priority: 1 },
          ],
          confidence: 0.45,
        }),
      );

      const result = await service.route("嗯...不知道", CTX);
      expect(result.requiresConfirmation).toBe(true);
    });
  });

  describe("route() — insight module", () => {
    it("'洞察一下 Agent OS' → insight module, no confirmation", async () => {
      await build(
        JSON.stringify({
          capabilities: [
            {
              module: "insight",
              action: "专题洞察",
              input: "Agent OS",
              priority: 1,
            },
          ],
          confidence: 0.85,
          reasoning: "user wants deep insights into Agent OS",
        }),
      );

      const result = await service.route("洞察一下 Agent OS", CTX);
      expect(result.plan.steps).toHaveLength(1);
      expect(result.plan.steps[0].module).toBe("insight");
      expect(result.requiresConfirmation).toBe(false);
      expect(result.plan.confidence).toBe(0.85);
    });

    it("insight + writing → dag plan with dependency", async () => {
      await build(
        JSON.stringify({
          capabilities: [
            {
              module: "insight",
              action: "专题洞察",
              input: "Agent OS",
              priority: 1,
            },
            {
              module: "writing",
              action: "写分析报告",
              input: "Agent OS 洞察报告",
              priority: 2,
            },
          ],
          confidence: 0.88,
        }),
      );

      const result = await service.route(
        "洞察 Agent OS 然后写一篇分析报告",
        CTX,
      );
      expect(result.plan.steps).toHaveLength(2);
      const writingStep = result.plan.steps.find(
        (s) => s.module === "writing",
      )!;
      expect(writingStep.dependsOn.length).toBeGreaterThan(0);
    });
  });

  describe("route() — error resilience", () => {
    it("LLM returns malformed JSON → fallback to ask plan", async () => {
      await build("Sorry, I cannot process this request.");

      const result = await service.route("任意输入", CTX);
      expect(result.plan.steps).toHaveLength(1);
      expect(result.plan.steps[0].module).toBe("ask");
      expect(result.requiresConfirmation).toBe(true);
    });

    it("LLM throws → fallback to ask plan without throwing", async () => {
      aiChatMock = { chat: jest.fn().mockRejectedValue(new Error("timeout")) };
      const module: TestingModule = await Test.createTestingModule({
        providers: [
          IntentRouterService,
          TaskPlannerService,
          { provide: AiChatService, useValue: aiChatMock },
        ],
      }).compile();
      service = module.get(IntentRouterService);

      const result = await service.route("任意输入", CTX);
      expect(result.plan.steps[0].module).toBe("ask");
      expect(result.requiresConfirmation).toBe(true);
    });

    it("unknown module in LLM response → coerced to ask", async () => {
      await build(
        JSON.stringify({
          capabilities: [
            {
              module: "unknownModule",
              action: "做事",
              input: "x",
              priority: 1,
            },
          ],
          confidence: 0.8,
        }),
      );

      const result = await service.route("某个请求", CTX);
      expect(result.plan.steps[0].module).toBe("ask");
    });
  });

  describe("getplan()", () => {
    it("returns the same plan as route()", async () => {
      await build(
        JSON.stringify({
          capabilities: [
            { module: "ask", action: "问答", input: "hi", priority: 1 },
          ],
          confidence: 0.8,
        }),
      );

      const plan = await service.getPlan("hi", CTX);
      expect(plan.steps).toHaveLength(1);
      expect(plan.steps[0].module).toBe("ask");
    });
  });
});
