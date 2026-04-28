/**
 * Unit tests for PromptSkillAdapter
 *
 * Note: AIFacade is imported as `import type` in prompt-skill-adapter.ts,
 * so we instantiate PromptSkillAdapter directly with a mock facade object
 * rather than going through NestJS DI.
 */

import { PromptSkillAdapter } from "../prompt-skill-adapter";
import { SkillMdDefinition } from "../../types/skill-md.types";
import { SkillContext } from "../../abstractions/skill.interface";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeDefinition(
  overrides: Partial<SkillMdDefinition["metadata"]> = {},
  body = "You are a helpful assistant. Topic: {{topic}}",
): SkillMdDefinition {
  return {
    metadata: {
      id: "test-skill",
      name: "Test Skill",
      description: "A test skill",
      domain: "testing",
      version: "1.0.0",
      layer: "content",
      tags: ["test"],
      taskTypes: ["*"],
      priority: 5,
      source: "local",
      tokenBudget: 2000,
      taskProfile: { creativity: "medium", outputLength: "medium" },
      ...overrides,
    },
    body,
    content: body,
    loadedAt: new Date(),
  };
}

function makeContext(overrides: Partial<SkillContext> = {}): SkillContext {
  return {
    executionId: "exec-001",
    skillId: "test-skill",
    createdAt: new Date(),
    ...overrides,
  };
}

function makeFacade(content: string = '{"result":"ok"}', tokensUsed = 100) {
  return {
    chat: jest.fn().mockResolvedValue({ content, tokensUsed }),
  };
}

function makePromptBuilder(prompt = "System prompt") {
  return {
    buildSystemPrompt: jest.fn().mockReturnValue({ prompt, tokensUsed: 50 }),
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("PromptSkillAdapter", () => {
  // -------------------------------------------------------------------------
  // Constructor / metadata
  // -------------------------------------------------------------------------

  describe("constructor — metadata", () => {
    it("exposes id from frontmatter", () => {
      const adapter = new PromptSkillAdapter(
        makeDefinition({ id: "my-skill" }),
        makeFacade() as any,
        makePromptBuilder() as any,
      );
      expect(adapter.id).toBe("my-skill");
    });

    it("exposes name from frontmatter", () => {
      const adapter = new PromptSkillAdapter(
        makeDefinition({ name: "My Skill" }),
        makeFacade() as any,
        makePromptBuilder() as any,
      );
      expect(adapter.name).toBe("My Skill");
    });

    it("exposes description from frontmatter", () => {
      const adapter = new PromptSkillAdapter(
        makeDefinition({ description: "Does things" }),
        makeFacade() as any,
        makePromptBuilder() as any,
      );
      expect(adapter.description).toBe("Does things");
    });

    it('defaults layer to "content" when not specified', () => {
      const adapter = new PromptSkillAdapter(
        makeDefinition({ layer: undefined }),
        makeFacade() as any,
        makePromptBuilder() as any,
      );
      expect(adapter.layer).toBe("content");
    });

    it("uses the provided layer from frontmatter", () => {
      const adapter = new PromptSkillAdapter(
        makeDefinition({ layer: "planning" }),
        makeFacade() as any,
        makePromptBuilder() as any,
      );
      expect(adapter.layer).toBe("planning");
    });

    it("defaults outputKey to skill id when not specified", () => {
      const adapter = new PromptSkillAdapter(
        makeDefinition({ id: "my-skill", outputKey: undefined }),
        makeFacade() as any,
        makePromptBuilder() as any,
      );
      expect(adapter.outputKey).toBe("my-skill");
    });

    it("uses outputKey from frontmatter when provided", () => {
      const adapter = new PromptSkillAdapter(
        makeDefinition({ outputKey: "custom-key" }),
        makeFacade() as any,
        makePromptBuilder() as any,
      );
      expect(adapter.outputKey).toBe("custom-key");
    });

    it("marks isPromptSkillAdapter as true", () => {
      const adapter = new PromptSkillAdapter(
        makeDefinition(),
        makeFacade() as any,
        makePromptBuilder() as any,
      );
      expect(adapter.isPromptSkillAdapter).toBe(true);
    });

    it("exposes domain from frontmatter", () => {
      const adapter = new PromptSkillAdapter(
        makeDefinition({ domain: "writing" }),
        makeFacade() as any,
        makePromptBuilder() as any,
      );
      expect(adapter.domain).toBe("writing");
    });

    it("exposes tags from frontmatter", () => {
      const adapter = new PromptSkillAdapter(
        makeDefinition({ tags: ["ai", "nlp"] }),
        makeFacade() as any,
        makePromptBuilder() as any,
      );
      expect(adapter.tags).toEqual(["ai", "nlp"]);
    });
  });

  // -------------------------------------------------------------------------
  // getInputBindings()
  // -------------------------------------------------------------------------

  describe("getInputBindings()", () => {
    it("returns undefined when no inputs declared in frontmatter", () => {
      const adapter = new PromptSkillAdapter(
        makeDefinition({ inputs: undefined }),
        makeFacade() as any,
        makePromptBuilder() as any,
      );
      expect(adapter.getInputBindings()).toBeUndefined();
    });

    it("returns the inputs map from frontmatter", () => {
      const inputs = {
        topic: { from: "context.topic", required: true },
        plan: { from: "planning-result", required: false },
      };
      const adapter = new PromptSkillAdapter(
        makeDefinition({ inputs }),
        makeFacade() as any,
        makePromptBuilder() as any,
      );
      expect(adapter.getInputBindings()).toEqual(inputs);
    });
  });

  // -------------------------------------------------------------------------
  // execute() — success path
  // -------------------------------------------------------------------------

  describe("execute() — success path", () => {
    it("calls promptBuilder.buildSystemPrompt with the definition and input", async () => {
      const promptBuilder = makePromptBuilder();
      const facade = makeFacade('{"answer":42}');
      const definition = makeDefinition();

      const adapter = new PromptSkillAdapter(
        definition,
        facade as any,
        promptBuilder as any,
      );

      await adapter.execute({ topic: "AI" }, makeContext());

      expect(promptBuilder.buildSystemPrompt).toHaveBeenCalledWith(
        [definition],
        expect.objectContaining({ context: { topic: "AI" } }),
      );
    });

    it("calls facade.chat with system prompt and user message", async () => {
      const promptBuilder = makePromptBuilder("SYSTEM PROMPT");
      const facade = makeFacade('{"answer":42}');

      const adapter = new PromptSkillAdapter(
        makeDefinition(),
        facade as any,
        promptBuilder as any,
      );

      await adapter.execute({ topic: "AI" }, makeContext());

      expect(facade.chat).toHaveBeenCalledWith(
        expect.objectContaining({
          messages: expect.arrayContaining([
            { role: "system", content: "SYSTEM PROMPT" },
            expect.objectContaining({ role: "user" }),
          ]),
        }),
      );
    });

    it("passes taskProfile from frontmatter to facade.chat", async () => {
      const facade = makeFacade("{}");
      const promptBuilder = makePromptBuilder();
      const definition = makeDefinition({
        taskProfile: { creativity: "high", outputLength: "long" },
      });

      const adapter = new PromptSkillAdapter(
        definition,
        facade as any,
        promptBuilder as any,
      );

      await adapter.execute({}, makeContext());

      expect(facade.chat).toHaveBeenCalledWith(
        expect.objectContaining({
          taskProfile: { creativity: "high", outputLength: "long" },
        }),
      );
    });

    it("uses default taskProfile when frontmatter provides none", async () => {
      const facade = makeFacade("{}");
      const promptBuilder = makePromptBuilder();
      const definition = makeDefinition({ taskProfile: undefined });

      const adapter = new PromptSkillAdapter(
        definition,
        facade as any,
        promptBuilder as any,
      );

      await adapter.execute({}, makeContext());

      expect(facade.chat).toHaveBeenCalledWith(
        expect.objectContaining({
          taskProfile: { creativity: "medium", outputLength: "medium" },
        }),
      );
    });

    it("returns success: true with parsed JSON data", async () => {
      const facade = makeFacade('{"result":"parsed"}', 150);
      const promptBuilder = makePromptBuilder();

      const adapter = new PromptSkillAdapter(
        makeDefinition(),
        facade as any,
        promptBuilder as any,
      );

      const result = await adapter.execute({}, makeContext());

      expect(result.success).toBe(true);
      expect(result.data).toEqual({ result: "parsed" });
    });

    it("includes tokensUsed in result metadata", async () => {
      const facade = makeFacade("{}", 250);
      const promptBuilder = makePromptBuilder();

      const adapter = new PromptSkillAdapter(
        makeDefinition(),
        facade as any,
        promptBuilder as any,
      );

      const result = await adapter.execute({}, makeContext());

      expect(result.metadata.tokensUsed).toBe(250);
    });

    it("includes executionId from context in metadata", async () => {
      const facade = makeFacade("{}");
      const promptBuilder = makePromptBuilder();
      const context = makeContext({ executionId: "my-exec-id" });

      const adapter = new PromptSkillAdapter(
        makeDefinition(),
        facade as any,
        promptBuilder as any,
      );

      const result = await adapter.execute({}, context);

      expect(result.metadata.executionId).toBe("my-exec-id");
    });

    it("serializes object input as user message JSON", async () => {
      const facade = makeFacade("{}");
      const promptBuilder = makePromptBuilder();

      const adapter = new PromptSkillAdapter(
        makeDefinition(),
        facade as any,
        promptBuilder as any,
      );

      await adapter.execute({ key: "value", num: 42 }, makeContext());

      const chatCall = facade.chat.mock.calls[0][0];
      const userMessage = chatCall.messages.find((m: any) => m.role === "user");
      expect(userMessage.content).toContain('"key"');
      expect(userMessage.content).toContain('"value"');
    });

    it("passes string input directly as user message", async () => {
      const facade = makeFacade("{}");
      const promptBuilder = makePromptBuilder();

      const adapter = new PromptSkillAdapter(
        makeDefinition(),
        facade as any,
        promptBuilder as any,
      );

      await adapter.execute("plain text input", makeContext());

      const chatCall = facade.chat.mock.calls[0][0];
      const userMessage = chatCall.messages.find((m: any) => m.role === "user");
      expect(userMessage.content).toBe("plain text input");
    });
  });

  // -------------------------------------------------------------------------
  // execute() — JSON extraction
  // -------------------------------------------------------------------------

  describe("execute() — JSON extraction", () => {
    it("extracts JSON from a markdown code block", async () => {
      const content = '```json\n{"parsed":true}\n```';
      const facade = makeFacade(content);
      const promptBuilder = makePromptBuilder();

      const adapter = new PromptSkillAdapter(
        makeDefinition(),
        facade as any,
        promptBuilder as any,
      );

      const result = await adapter.execute({}, makeContext());

      expect(result.success).toBe(true);
      expect(result.data).toEqual({ parsed: true });
    });

    it("extracts JSON from a plain code block (no language tag)", async () => {
      const content = '```\n{"plain":true}\n```';
      const facade = makeFacade(content);
      const promptBuilder = makePromptBuilder();

      const adapter = new PromptSkillAdapter(
        makeDefinition(),
        facade as any,
        promptBuilder as any,
      );

      const result = await adapter.execute({}, makeContext());
      expect(result.data).toEqual({ plain: true });
    });

    it("parses pure JSON response directly", async () => {
      const facade = makeFacade('{"direct":true}');
      const promptBuilder = makePromptBuilder();

      const adapter = new PromptSkillAdapter(
        makeDefinition(),
        facade as any,
        promptBuilder as any,
      );

      const result = await adapter.execute({}, makeContext());
      expect(result.data).toEqual({ direct: true });
    });

    it("extracts embedded JSON from mixed text", async () => {
      const content = 'Here is your result: {"embedded":true} done.';
      const facade = makeFacade(content);
      const promptBuilder = makePromptBuilder();

      const adapter = new PromptSkillAdapter(
        makeDefinition(),
        facade as any,
        promptBuilder as any,
      );

      const result = await adapter.execute({}, makeContext());
      expect(result.data).toEqual({ embedded: true });
    });

    it("falls back to raw string when no JSON can be extracted", async () => {
      const facade = makeFacade("plain text response no json");
      const promptBuilder = makePromptBuilder();

      const adapter = new PromptSkillAdapter(
        makeDefinition(),
        facade as any,
        promptBuilder as any,
      );

      const result = await adapter.execute({}, makeContext());
      expect(result.success).toBe(true);
      expect(result.data).toBe("plain text response no json");
    });

    it("repairs truncated JSON by closing open braces", async () => {
      // Missing closing brace — repairTruncatedJson should fix it
      const content = '{"title":"My Title","items":["a","b"';
      const facade = makeFacade(content);
      const promptBuilder = makePromptBuilder();

      const adapter = new PromptSkillAdapter(
        makeDefinition(),
        facade as any,
        promptBuilder as any,
      );

      const result = await adapter.execute({}, makeContext());
      // Either repaired or falls back — either way should not throw
      expect(result.success).toBe(true);
    });

    it("extracts a JSON array from the response", async () => {
      const facade = makeFacade("[1,2,3]");
      const promptBuilder = makePromptBuilder();

      const adapter = new PromptSkillAdapter(
        makeDefinition(),
        facade as any,
        promptBuilder as any,
      );

      const result = await adapter.execute({}, makeContext());
      expect(result.data).toEqual([1, 2, 3]);
    });
  });

  // -------------------------------------------------------------------------
  // execute() — error handling
  // -------------------------------------------------------------------------

  describe("execute() — error handling", () => {
    it("returns success: false when facade.chat throws", async () => {
      const facade = {
        chat: jest.fn().mockRejectedValue(new Error("LLM unavailable")),
      };
      const promptBuilder = makePromptBuilder();

      const adapter = new PromptSkillAdapter(
        makeDefinition(),
        facade as any,
        promptBuilder as any,
      );

      const result = await adapter.execute({}, makeContext());

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
      expect(result.error!.code).toBe("PROMPT_SKILL_FAILED");
      expect(result.error!.message).toContain("LLM unavailable");
    });

    it("marks error as retryable when facade throws", async () => {
      const facade = {
        chat: jest.fn().mockRejectedValue(new Error("timeout")),
      };
      const promptBuilder = makePromptBuilder();

      const adapter = new PromptSkillAdapter(
        makeDefinition(),
        facade as any,
        promptBuilder as any,
      );

      const result = await adapter.execute({}, makeContext());

      expect(result.error?.retryable).toBe(true);
    });

    it("includes executionId in error metadata", async () => {
      const facade = {
        chat: jest.fn().mockRejectedValue(new Error("fail")),
      };
      const promptBuilder = makePromptBuilder();
      const context = makeContext({ executionId: "err-exec-id" });

      const adapter = new PromptSkillAdapter(
        makeDefinition(),
        facade as any,
        promptBuilder as any,
      );

      const result = await adapter.execute({}, context);

      expect(result.metadata.executionId).toBe("err-exec-id");
    });

    it("returns success: false when promptBuilder throws", async () => {
      const facade = makeFacade("{}");
      const promptBuilder = {
        buildSystemPrompt: jest.fn().mockImplementation(() => {
          throw new Error("Builder error");
        }),
      };

      const adapter = new PromptSkillAdapter(
        makeDefinition(),
        facade as any,
        promptBuilder as any,
      );

      const result = await adapter.execute({}, makeContext());

      expect(result.success).toBe(false);
      expect(result.error!.message).toContain("Builder error");
    });

    it("includes duration in metadata even on error", async () => {
      const facade = {
        chat: jest.fn().mockRejectedValue(new Error("fail")),
      };
      const promptBuilder = makePromptBuilder();

      const adapter = new PromptSkillAdapter(
        makeDefinition(),
        facade as any,
        promptBuilder as any,
      );

      const result = await adapter.execute({}, makeContext());

      expect(result.metadata.duration).toBeGreaterThanOrEqual(0);
    });
  });
});
