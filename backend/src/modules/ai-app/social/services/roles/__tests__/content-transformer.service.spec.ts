/**
 * Unit tests for ContentTransformerService
 *
 * Mirrors composer.service.spec.ts pattern.
 * SocialAgentInvoker is fully mocked.
 */

import { Test, TestingModule } from "@nestjs/testing";
import { ContentTransformerService } from "../content-transformer.service";
import {
  SocialAgentInvoker,
  type SocialInvocationContext,
} from "../social-agent-invoker.service";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeCtx(
  overrides: Partial<SocialInvocationContext> = {},
): SocialInvocationContext {
  return {
    missionId: "mission-ct",
    userId: "user-ct",
    agentId: "agent-ct",
    role: "content-transformer",
    ...overrides,
  };
}

function makeInvokeResult(state = "completed") {
  return {
    state,
    output: {
      platform: "WECHAT_MP",
      transformedTitle: "WeChat Adapted Title",
      transformedBody: "Adapted content for WeChat.",
      transformedDigest: "Short summary",
      changes: ["tone adjusted", "length trimmed"],
    },
    events: [{ type: "token_usage", tokensIn: 150, tokensOut: 300 }],
    iterations: 1,
    wallTimeMs: 2500,
  };
}

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockInvoker = {
  invoke: jest.fn(),
  tickCost: jest.fn(),
};

// ---------------------------------------------------------------------------
// Suite
// ---------------------------------------------------------------------------

describe("ContentTransformerService", () => {
  let service: ContentTransformerService;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ContentTransformerService,
        { provide: SocialAgentInvoker, useValue: mockInvoker },
      ],
    }).compile();

    service = module.get<ContentTransformerService>(ContentTransformerService);
  });

  // -------------------------------------------------------------------------
  // Success path — no pool
  // -------------------------------------------------------------------------

  describe("run — success without pool", () => {
    it("should invoke ContentTransformerAgent and return normalized result", async () => {
      const invokeResult = makeInvokeResult("completed");
      mockInvoker.invoke.mockResolvedValue(invokeResult);

      const result = await service.run({
        input: {
          platform: "WECHAT_MP",
          title: "Original Title",
          body: "Original body",
        },
        ctx: makeCtx(),
      });

      expect(mockInvoker.invoke).toHaveBeenCalledTimes(1);
      expect(result.state).toBe("completed");
      expect(result.output).toBe(invokeResult.output);
      expect(result.wallTimeMs).toBe(2500);
    });

    it("should not call tickCost when pool is absent", async () => {
      mockInvoker.invoke.mockResolvedValue(makeInvokeResult());

      await service.run({
        input: { platform: "XIAOHONGSHU", title: "Title", body: "Body" },
        ctx: makeCtx(),
      });

      expect(mockInvoker.tickCost).not.toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // Success path — with pool
  // -------------------------------------------------------------------------

  describe("run — success with pool", () => {
    it("should call tickCost with content-transform-<platform> label", async () => {
      mockInvoker.invoke.mockResolvedValue(makeInvokeResult());
      mockInvoker.tickCost.mockResolvedValue(undefined);

      const pool = {} as Parameters<typeof service.run>[0]["pool"];

      await service.run({
        input: { platform: "XIAOHONGSHU", title: "Title", body: "Body" },
        ctx: makeCtx({ missionId: "m-10", userId: "u-10" }),
        pool,
      });

      expect(mockInvoker.tickCost).toHaveBeenCalledWith(
        "m-10",
        "u-10",
        "content-transform-XIAOHONGSHU",
        pool,
        expect.any(Number),
      );
    });
  });

  // -------------------------------------------------------------------------
  // Error handling
  // -------------------------------------------------------------------------

  describe("run — error handling", () => {
    it("should return failed state when invoker result state is failed", async () => {
      mockInvoker.invoke.mockResolvedValue({
        ...makeInvokeResult("failed"),
        output: undefined,
      });

      const result = await service.run({
        input: { platform: "WECHAT_MP", title: "T", body: "B" },
        ctx: makeCtx(),
      });

      expect(result.state).toBe("failed");
      expect(result.output).toBeUndefined();
    });

    it("should propagate thrown error from invoker", async () => {
      mockInvoker.invoke.mockRejectedValue(new Error("network timeout"));

      await expect(
        service.run({
          input: { platform: "WECHAT_MP", title: "T", body: "B" },
          ctx: makeCtx(),
        }),
      ).rejects.toThrow("network timeout");
    });

    it("should return degraded state when invoker returns degraded", async () => {
      mockInvoker.invoke.mockResolvedValue(makeInvokeResult("degraded"));

      const result = await service.run({
        input: { platform: "WECHAT_MP", title: "T", body: "B" },
        ctx: makeCtx(),
      });

      expect(result.state).toBe("degraded");
    });
  });

  // -------------------------------------------------------------------------
  // Events passthrough
  // -------------------------------------------------------------------------

  describe("run — events passthrough", () => {
    it("should return events array unchanged from invoker", async () => {
      const events = [{ type: "step", content: "analyzing content" }];
      mockInvoker.invoke.mockResolvedValue({ ...makeInvokeResult(), events });

      const result = await service.run({
        input: { platform: "WECHAT_MP", title: "T", body: "B" },
        ctx: makeCtx(),
      });

      expect(result.events).toBe(events);
    });
  });
});
