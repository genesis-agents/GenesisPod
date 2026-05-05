/**
 * Unit tests for LlmTracingService
 */

import { Test, TestingModule } from "@nestjs/testing";
import { Logger } from "@nestjs/common";
import { LlmTracingService } from "../observability/llm-tracing.service";

describe("LlmTracingService", () => {
  let service: LlmTracingService;

  beforeEach(async () => {
    jest.clearAllMocks();
    jest.spyOn(Logger.prototype, "log").mockReturnValue(undefined);
    jest.spyOn(Logger.prototype, "error").mockReturnValue(undefined);
    jest.spyOn(Logger.prototype, "warn").mockReturnValue(undefined);
    jest.spyOn(Logger.prototype, "debug").mockReturnValue(undefined);

    const module: TestingModule = await Test.createTestingModule({
      providers: [LlmTracingService],
    }).compile();

    service = module.get<LlmTracingService>(LlmTracingService);
  });

  describe("traceLLMCall", () => {
    it("returns the result of the wrapped function on success", async () => {
      const fn = jest.fn().mockResolvedValue({ content: "Hello" });

      const result = await service.traceLLMCall(
        "test-operation",
        { model: "gpt-4o" },
        fn,
      );

      expect(result).toEqual({ content: "Hello" });
      expect(fn).toHaveBeenCalledTimes(1);
    });

    it("passes through non-Error values returned by fn", async () => {
      const fn = jest.fn().mockResolvedValue("simple string");

      const result = await service.traceLLMCall(
        "translate",
        { model: "gemini-flash", provider: "google" },
        fn,
      );

      expect(result).toBe("simple string");
    });

    it("rethrows errors from the wrapped function", async () => {
      const error = new Error("LLM timeout");
      const fn = jest.fn().mockRejectedValue(error);

      await expect(
        service.traceLLMCall("failing-op", { model: "gpt-4o" }, fn),
      ).rejects.toThrow("LLM timeout");
    });

    it("works with optional metadata fields (provider, inputTokens, userId)", async () => {
      const fn = jest.fn().mockResolvedValue(42);

      const result = await service.traceLLMCall(
        "operation",
        {
          model: "claude-3",
          provider: "anthropic",
          inputTokens: 100,
          userId: "user-1",
        },
        fn,
      );

      expect(result).toBe(42);
    });

    it("returns correct type T from generic", async () => {
      interface MyResult {
        value: number;
      }
      const fn = jest.fn().mockResolvedValue({ value: 99 });

      const result = await service.traceLLMCall<MyResult>(
        "op",
        { model: "gpt-4o" },
        fn,
      );

      expect(result.value).toBe(99);
    });
  });

  describe("traceToolExecution", () => {
    it("returns the result of the wrapped function on success", async () => {
      const fn = jest.fn().mockResolvedValue({ data: "tool result" });

      const result = await service.traceToolExecution(
        "web-search",
        { category: "information" },
        fn,
      );

      expect(result).toEqual({ data: "tool result" });
    });

    it("rethrows errors from the wrapped function", async () => {
      const error = new Error("Tool execution failed");
      const fn = jest.fn().mockRejectedValue(error);

      await expect(
        service.traceToolExecution("broken-tool", {}, fn),
      ).rejects.toThrow("Tool execution failed");
    });

    it("works with empty metadata", async () => {
      const fn = jest.fn().mockResolvedValue(null);

      const result = await service.traceToolExecution("simple-tool", {}, fn);

      expect(result).toBeNull();
    });

    it("includes userId in metadata without affecting execution", async () => {
      const fn = jest.fn().mockResolvedValue("done");

      const result = await service.traceToolExecution(
        "my-tool",
        { userId: "user-42" },
        fn,
      );

      expect(result).toBe("done");
    });
  });

  describe("traceAgentExecution", () => {
    it("returns the result of the wrapped function on success", async () => {
      const fn = jest.fn().mockResolvedValue({ summary: "Agent completed" });

      const result = await service.traceAgentExecution(
        "research-agent",
        { taskType: "deep-research" },
        fn,
      );

      expect(result).toEqual({ summary: "Agent completed" });
    });

    it("rethrows errors from the wrapped function", async () => {
      const error = new Error("Agent crashed");
      const fn = jest.fn().mockRejectedValue(error);

      await expect(
        service.traceAgentExecution("broken-agent", {}, fn),
      ).rejects.toThrow("Agent crashed");
    });

    it("works with optional metadata (taskType, userId)", async () => {
      const fn = jest.fn().mockResolvedValue(true);

      const result = await service.traceAgentExecution(
        "my-agent",
        { taskType: "summarize", userId: "user-5" },
        fn,
      );

      expect(result).toBe(true);
    });

    it("calls the fn exactly once", async () => {
      const fn = jest.fn().mockResolvedValue("ok");

      await service.traceAgentExecution("agent-1", {}, fn);

      expect(fn).toHaveBeenCalledTimes(1);
    });
  });

  describe("traceMissionExecution", () => {
    it("returns the result of the wrapped function on success", async () => {
      const fn = jest
        .fn()
        .mockResolvedValue({ deliverables: ["report.md"], tokensUsed: 500 });

      const result = await service.traceMissionExecution(
        "mission-abc",
        { missionType: "research", userId: "user-1", topicId: "topic-1" },
        fn,
      );

      expect(result).toEqual({
        deliverables: ["report.md"],
        tokensUsed: 500,
      });
    });

    it("rethrows errors from the wrapped function", async () => {
      const error = new Error("Mission failed");
      const fn = jest.fn().mockRejectedValue(error);

      await expect(
        service.traceMissionExecution("mission-fail", {}, fn),
      ).rejects.toThrow("Mission failed");
    });

    it("works with empty metadata", async () => {
      const fn = jest.fn().mockResolvedValue("mission done");

      const result = await service.traceMissionExecution(
        "mission-simple",
        {},
        fn,
      );

      expect(result).toBe("mission done");
    });

    it("calls the fn exactly once per invocation", async () => {
      const fn = jest.fn().mockResolvedValue(null);

      await service.traceMissionExecution("mission-1", {}, fn);
      await service.traceMissionExecution("mission-2", {}, fn);

      expect(fn).toHaveBeenCalledTimes(2);
    });
  });

  describe("recordMetric", () => {
    it("does not throw when recording a metric", () => {
      expect(() => service.recordMetric("llm.tokens", 1500)).not.toThrow();
    });

    it("does not throw when recording a metric with tags", () => {
      expect(() =>
        service.recordMetric("llm.latency", 250, {
          model: "gpt-4o",
          provider: "openai",
        }),
      ).not.toThrow();
    });

    it("does not throw when recording a metric without tags", () => {
      expect(() => service.recordMetric("tools.called", 3)).not.toThrow();
    });

    it("accepts zero as a valid metric value", () => {
      expect(() =>
        service.recordMetric("errors.count", 0, { service: "research" }),
      ).not.toThrow();
    });
  });

  describe("generic type inference", () => {
    it("traceLLMCall preserves complex return types", async () => {
      interface ComplexResult {
        content: string;
        tokens: number;
        model: string;
      }
      const expected: ComplexResult = {
        content: "Hello",
        tokens: 100,
        model: "gpt-4o",
      };
      const fn = jest.fn().mockResolvedValue(expected);

      const result = await service.traceLLMCall<ComplexResult>(
        "complex-op",
        { model: "gpt-4o" },
        fn,
      );

      expect(result).toEqual(expected);
    });
  });
});
