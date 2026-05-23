/**
 * LlmExecutor — model-level failover unit tests
 *
 * Covers:
 *   - PROVIDER_API_ERROR on model A triggers re-election (excludeModelIds contains A)
 *     and the call succeeds on model B
 *   - AbortError does NOT trigger model-failover
 *   - Budget/quota exhaustion does NOT trigger model-failover
 *   - All models fail → last error is re-thrown
 *   - isModelLevelFailoverError() classifier for all relevant patterns
 */

import { Logger } from "@nestjs/common";
import { LlmExecutor, isModelLevelFailoverError } from "../llm-executor";

// Suppress logger noise in tests
jest.spyOn(Logger.prototype, "warn").mockImplementation();
jest.spyOn(Logger.prototype, "error").mockImplementation();

// ─── isModelLevelFailoverError classifier ─────────────────────────────────

describe("isModelLevelFailoverError()", () => {
  it("returns true for 5xx / provider API error strings", () => {
    expect(
      isModelLevelFailoverError(new Error("503 Service Unavailable")),
    ).toBe(true);
    expect(isModelLevelFailoverError(new Error("502 bad gateway"))).toBe(true);
    expect(
      isModelLevelFailoverError(
        new Error("PROVIDER_API_ERROR: upstream failed"),
      ),
    ).toBe(true);
    expect(isModelLevelFailoverError(new Error("internal server error"))).toBe(
      true,
    );
  });

  it("returns true for model-not-found errors", () => {
    expect(isModelLevelFailoverError(new Error("model not found"))).toBe(true);
    expect(isModelLevelFailoverError(new Error("invalid_model provided"))).toBe(
      true,
    );
    expect(
      isModelLevelFailoverError(
        new Error("The requested resource was not found"),
      ),
    ).toBe(true);
  });

  it("returns true for timeout errors", () => {
    expect(
      isModelLevelFailoverError(new Error("request timeout after 30s")),
    ).toBe(true);
    expect(isModelLevelFailoverError(new Error("ECONNABORTED"))).toBe(true);
  });

  it("returns true for AllKeysFailed", () => {
    expect(
      isModelLevelFailoverError(new Error("AllKeysFailed: no valid key")),
    ).toBe(true);
  });

  it("returns true for rate-limit / 429", () => {
    expect(isModelLevelFailoverError(new Error("rate_limit exceeded"))).toBe(
      true,
    );
    expect(isModelLevelFailoverError(new Error("429 Too Many Requests"))).toBe(
      true,
    );
  });

  it("returns false for AbortError (DOMException)", () => {
    const abortErr = new DOMException("user cancelled", "AbortError");
    expect(isModelLevelFailoverError(abortErr)).toBe(false);
  });

  it("returns false for abort message string", () => {
    expect(
      isModelLevelFailoverError(new Error("Request aborted by signal")),
    ).toBe(false);
  });

  it("returns false for budget / billing exhaustion errors", () => {
    expect(
      isModelLevelFailoverError(
        new Error("insufficient_quota: you exceeded your current quota"),
      ),
    ).toBe(false);
    expect(
      isModelLevelFailoverError(new Error("insufficient credit balance")),
    ).toBe(false);
    expect(
      isModelLevelFailoverError(
        new Error("payment required — billing details outdated"),
      ),
    ).toBe(false);
  });
});

// ─── Helpers ──────────────────────────────────────────────────────────────

const TASK_PROFILE = {
  creativity: "low" as const,
  outputLength: "medium" as const,
};

/** Build a chat mock that throws on model A and returns JSON on model B. */
function mkFailoverChat(
  failOnModel: string,
  successModel: string,
  failError: Error,
  successContent: string,
) {
  return {
    chat: jest.fn(async (opts: { model?: string }) => {
      if (opts.model === failOnModel) throw failError;
      if (opts.model === successModel) {
        return {
          content: successContent,
          isError: false,
          model: successModel,
          usage: { inputTokens: 10, outputTokens: 5 },
        };
      }
      throw new Error(`Unexpected model: ${String(opts.model)}`);
    }),
  };
}

// ─── Model-level failover happy path ──────────────────────────────────────

describe("LlmExecutor — model-level failover", () => {
  it("re-elects to model B when model A throws PROVIDER_API_ERROR and succeeds", async () => {
    const providerError = new Error("PROVIDER_API_ERROR: xai 503");
    const chat = mkFailoverChat(
      "model-a",
      "model-b",
      providerError,
      '{"ok":true}',
    );
    const executor = new LlmExecutor(chat as never);

    const excludedIds: ReadonlyArray<string>[] = [];
    const failoverProvider = jest.fn(
      async (excluded: ReadonlyArray<string>) => {
        excludedIds.push(excluded);
        return "model-b";
      },
    );

    const result = await executor.execute({
      agentId: "test-agent",
      systemPrompt: "sys",
      userPrompt: "usr",
      taskProfile: TASK_PROFILE,
      model: "model-a",
      modelFailoverProvider: failoverProvider,
    });

    // Should succeed on model-b
    expect(result.model).toBe("model-b");
    expect((result.output as { ok: boolean }).ok).toBe(true);

    // failoverProvider called once, with model-a in excluded list
    expect(failoverProvider).toHaveBeenCalledTimes(1);
    expect(excludedIds[0]).toContain("model-a");

    // chat called twice: once for model-a (fails), once for model-b (succeeds)
    expect(chat.chat).toHaveBeenCalledTimes(2);
    expect(chat.chat.mock.calls[0][0].model).toBe("model-a");
    expect(chat.chat.mock.calls[1][0].model).toBe("model-b");
  });

  it("AbortError does NOT trigger model-failover", async () => {
    const abortError = new DOMException("aborted", "AbortError");
    const chat = {
      chat: jest.fn().mockRejectedValue(abortError),
    };
    const executor = new LlmExecutor(chat as never);
    const failoverProvider = jest.fn().mockResolvedValue("model-b");

    await expect(
      executor.execute({
        agentId: "test-agent",
        systemPrompt: "sys",
        userPrompt: "usr",
        taskProfile: TASK_PROFILE,
        model: "model-a",
        modelFailoverProvider: failoverProvider,
      }),
    ).rejects.toThrow("aborted");

    // failoverProvider must NOT have been called
    expect(failoverProvider).not.toHaveBeenCalled();
    // chat called only once (no retry on abort)
    expect(chat.chat).toHaveBeenCalledTimes(1);
  });

  it("budget/quota exhaustion does NOT trigger model-failover", async () => {
    const quotaError = new Error(
      "insufficient_quota: you exceeded your current quota",
    );
    const chat = {
      chat: jest.fn().mockRejectedValue(quotaError),
    };
    const executor = new LlmExecutor(chat as never);
    const failoverProvider = jest.fn().mockResolvedValue("model-b");

    await expect(
      executor.execute({
        agentId: "test-agent",
        systemPrompt: "sys",
        userPrompt: "usr",
        taskProfile: TASK_PROFILE,
        model: "model-a",
        modelFailoverProvider: failoverProvider,
      }),
    ).rejects.toThrow(/insufficient_quota/);

    expect(failoverProvider).not.toHaveBeenCalled();
  });

  it("re-throws last error when failoverProvider returns null (no more candidates)", async () => {
    const providerError = new Error("503 internal server error");
    const chat = {
      chat: jest.fn().mockRejectedValue(providerError),
    };
    const executor = new LlmExecutor(chat as never);
    // Provider returns null → no more models available
    const failoverProvider = jest.fn().mockResolvedValue(null);

    await expect(
      executor.execute({
        agentId: "test-agent",
        systemPrompt: "sys",
        userPrompt: "usr",
        taskProfile: TASK_PROFILE,
        model: "model-a",
        modelFailoverProvider: failoverProvider,
      }),
    ).rejects.toThrow("503 internal server error");

    // failoverProvider called once, chat called once
    expect(failoverProvider).toHaveBeenCalledTimes(1);
    expect(chat.chat).toHaveBeenCalledTimes(1);
  });

  it("works without modelFailoverProvider — provider error propagates immediately", async () => {
    const providerError = new Error("PROVIDER_API_ERROR: model down");
    const chat = {
      chat: jest.fn().mockRejectedValue(providerError),
    };
    const executor = new LlmExecutor(chat as never);

    await expect(
      executor.execute({
        agentId: "test-agent",
        systemPrompt: "sys",
        userPrompt: "usr",
        taskProfile: TASK_PROFILE,
        model: "model-a",
        // no modelFailoverProvider
      }),
    ).rejects.toThrow("PROVIDER_API_ERROR");

    expect(chat.chat).toHaveBeenCalledTimes(1);
  });

  it("accumulates tokens from both models across failover", async () => {
    const providerError = new Error("503 bad gateway");
    const chat = {
      chat: jest
        .fn()
        .mockRejectedValueOnce(providerError)
        .mockResolvedValueOnce({
          content: '{"val":1}',
          isError: false,
          model: "model-b",
          usage: { inputTokens: 20, outputTokens: 30 },
        }),
    };
    const executor = new LlmExecutor(chat as never);

    const result = await executor.execute({
      agentId: "test-agent",
      systemPrompt: "sys",
      userPrompt: "usr",
      taskProfile: TASK_PROFILE,
      model: "model-a",
      modelFailoverProvider: jest.fn().mockResolvedValue("model-b"),
    });

    // Tokens from the successful model-b call counted
    expect(result.inputTokens).toBe(20);
    expect(result.outputTokens).toBe(30);
    expect(result.model).toBe("model-b");
  });
});
