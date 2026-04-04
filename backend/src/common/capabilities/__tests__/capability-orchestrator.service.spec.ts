import { Test, TestingModule } from "@nestjs/testing";
import { Logger } from "@nestjs/common";
import { CapabilityOrchestratorService } from "../capability-orchestrator.service";
import { CapabilityRegistryService } from "../capability-registry.service";
import {
  ICapability,
  CapabilityMetadata,
  CapabilityCategory,
  CapabilityMode,
  CapabilityResult,
  CapabilityEvent,
} from "../interfaces/capability.interface";

// ============================================================================
// Helpers
// ============================================================================

function makeMetadata(
  overrides: Partial<CapabilityMetadata> = {},
): CapabilityMetadata {
  return {
    id: "test-cap",
    name: "Test Capability",
    description: "desc",
    category: CapabilityCategory.RESEARCH,
    provider: "test",
    mode: CapabilityMode.SYNC,
    inputSchema: {},
    outputSchema: {},
    tags: [],
    version: "1.0.0",
    enabled: true,
    ...overrides,
  };
}

function makeCapability(
  overrides: Partial<ICapability> & {
    metadataOverrides?: Partial<CapabilityMetadata>;
  } = {},
): ICapability {
  const { metadataOverrides, ...rest } = overrides;
  const metadata = makeMetadata(metadataOverrides);
  return {
    getMetadata: jest.fn().mockReturnValue(metadata),
    execute: jest
      .fn()
      .mockResolvedValue({ success: true, data: "output" } as CapabilityResult),
    ...rest,
  };
}

// ============================================================================
// Tests
// ============================================================================

describe("CapabilityOrchestratorService", () => {
  let service: CapabilityOrchestratorService;
  let registry: jest.Mocked<CapabilityRegistryService>;

  beforeEach(async () => {
    jest.spyOn(Logger.prototype, "log").mockImplementation();
    jest.spyOn(Logger.prototype, "warn").mockImplementation();
    jest.spyOn(Logger.prototype, "error").mockImplementation();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CapabilityOrchestratorService,
        {
          provide: CapabilityRegistryService,
          useValue: {
            get: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<CapabilityOrchestratorService>(
      CapabilityOrchestratorService,
    );
    registry = module.get(CapabilityRegistryService);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  // ---------- call ----------

  describe("call", () => {
    it("returns CAPABILITY_NOT_FOUND when capability is not registered", async () => {
      registry.get.mockReturnValue(undefined);

      const result = await service.call({
        capabilityId: "missing",
        input: {},
      });

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe("CAPABILITY_NOT_FOUND");
    });

    it("executes a capability and returns its result", async () => {
      const cap = makeCapability();
      registry.get.mockReturnValue(cap);

      const result = await service.call({
        capabilityId: "test-cap",
        input: { q: 1 },
      });

      expect(result.success).toBe(true);
      expect(result.data).toBe("output");
      expect(cap.execute).toHaveBeenCalledTimes(1);
    });

    it("builds a context with defaults when no context is provided", async () => {
      const cap = makeCapability();
      registry.get.mockReturnValue(cap);

      await service.call({ capabilityId: "test-cap", input: {} });

      const [, context] = (cap.execute as jest.Mock).mock.calls[0];
      expect(context.userId).toBe("system");
      expect(context.timeout).toBe(60000);
      expect(context.requestId).toMatch(/^req_/);
    });

    it("uses provided context values", async () => {
      const cap = makeCapability();
      registry.get.mockReturnValue(cap);

      await service.call({
        capabilityId: "test-cap",
        input: {},
        context: { userId: "user-42", requestId: "req-custom", timeout: 5000 },
      });

      const [, context] = (cap.execute as jest.Mock).mock.calls[0];
      expect(context.userId).toBe("user-42");
      expect(context.requestId).toBe("req-custom");
      expect(context.timeout).toBe(5000);
    });

    it("returns VALIDATION_ERROR when validateInput fails", async () => {
      const cap = makeCapability({
        validateInput: jest.fn().mockReturnValue({
          valid: false,
          errors: ["field is required"],
        }),
      });
      registry.get.mockReturnValue(cap);

      const result = await service.call({
        capabilityId: "test-cap",
        input: {},
      });

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe("VALIDATION_ERROR");
      expect(result.error?.details).toEqual(["field is required"]);
    });

    it("proceeds when validateInput returns valid=true", async () => {
      const cap = makeCapability({
        validateInput: jest.fn().mockReturnValue({ valid: true }),
      });
      registry.get.mockReturnValue(cap);

      const result = await service.call({
        capabilityId: "test-cap",
        input: {},
      });

      expect(result.success).toBe(true);
    });

    it("returns EXECUTION_ERROR when execute throws", async () => {
      const cap = makeCapability({
        execute: jest.fn().mockRejectedValue(new Error("boom")),
      });
      registry.get.mockReturnValue(cap);

      const result = await service.call({
        capabilityId: "test-cap",
        input: {},
      });

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe("EXECUTION_ERROR");
      expect(result.error?.message).toBe("boom");
    });

    it("handles non-Error thrown values", async () => {
      const cap = makeCapability({
        execute: jest.fn().mockRejectedValue("string error"),
      });
      registry.get.mockReturnValue(cap);

      const result = await service.call({
        capabilityId: "test-cap",
        input: {},
      });

      expect(result.error?.message).toBe("Unknown error");
    });
  });

  // ---------- callStream ----------

  describe("callStream", () => {
    it("yields CAPABILITY_NOT_FOUND error when capability is missing", async () => {
      registry.get.mockReturnValue(undefined);

      const events: CapabilityEvent[] = [];
      for await (const event of service.callStream({
        capabilityId: "missing",
        input: {},
      })) {
        events.push(event);
      }

      expect(events).toHaveLength(1);
      expect(events[0].type).toBe("error");
      expect(events[0].error?.code).toBe("CAPABILITY_NOT_FOUND");
    });

    it("yields STREAMING_NOT_SUPPORTED when mode is not STREAMING", async () => {
      const cap = makeCapability({
        metadataOverrides: { mode: CapabilityMode.SYNC },
      });
      registry.get.mockReturnValue(cap);

      const events: CapabilityEvent[] = [];
      for await (const event of service.callStream({
        capabilityId: "test-cap",
        input: {},
      })) {
        events.push(event);
      }

      expect(events[0].error?.code).toBe("STREAMING_NOT_SUPPORTED");
    });

    it("yields STREAMING_NOT_SUPPORTED when executeStream is not defined", async () => {
      const cap = makeCapability({
        metadataOverrides: { mode: CapabilityMode.STREAMING },
        // No executeStream defined
      });
      registry.get.mockReturnValue(cap);

      const events: CapabilityEvent[] = [];
      for await (const event of service.callStream({
        capabilityId: "test-cap",
        input: {},
      })) {
        events.push(event);
      }

      expect(events[0].error?.code).toBe("STREAMING_NOT_SUPPORTED");
    });

    it("forwards events from executeStream", async () => {
      async function* fakeStream(): AsyncGenerator<CapabilityEvent> {
        yield { type: "progress", progress: 50, message: "halfway" };
        yield { type: "data", data: "chunk1" };
        yield { type: "complete" };
      }

      const cap = makeCapability({
        metadataOverrides: { mode: CapabilityMode.STREAMING },
        executeStream: jest.fn().mockReturnValue(fakeStream()),
      });
      registry.get.mockReturnValue(cap);

      const events: CapabilityEvent[] = [];
      for await (const event of service.callStream({
        capabilityId: "test-cap",
        input: {},
      })) {
        events.push(event);
      }

      expect(events).toHaveLength(3);
      expect(events[0].type).toBe("progress");
      expect(events[1].type).toBe("data");
      expect(events[2].type).toBe("complete");
    });

    it("yields STREAM_ERROR when executeStream throws", async () => {
      async function* errorStream(): AsyncGenerator<CapabilityEvent> {
        throw new Error("stream failure");
        // eslint-disable-next-line no-unreachable
        yield { type: "complete" };
      }

      const cap = makeCapability({
        metadataOverrides: { mode: CapabilityMode.STREAMING },
        executeStream: jest.fn().mockReturnValue(errorStream()),
      });
      registry.get.mockReturnValue(cap);

      const events: CapabilityEvent[] = [];
      for await (const event of service.callStream({
        capabilityId: "test-cap",
        input: {},
      })) {
        events.push(event);
      }

      expect(events[0].error?.code).toBe("STREAM_ERROR");
      expect(events[0].error?.message).toBe("stream failure");
    });
  });

  // ---------- callParallel ----------

  describe("callParallel", () => {
    it("calls all capabilities in parallel and returns keyed results", async () => {
      const capA = makeCapability({
        execute: jest.fn().mockResolvedValue({ success: true, data: "A" }),
        metadataOverrides: { id: "cap-a" },
      });
      const capB = makeCapability({
        execute: jest.fn().mockResolvedValue({ success: true, data: "B" }),
        metadataOverrides: { id: "cap-b" },
      });

      registry.get.mockReturnValueOnce(capA).mockReturnValueOnce(capB);

      const results = await service.callParallel({
        resultA: { capabilityId: "cap-a", input: {} },
        resultB: { capabilityId: "cap-b", input: {} },
      });

      expect(results.resultA.success).toBe(true);
      expect(results.resultA.data).toBe("A");
      expect(results.resultB.data).toBe("B");
    });

    it("returns CAPABILITY_NOT_FOUND for any missing capability", async () => {
      registry.get.mockReturnValue(undefined);

      const results = await service.callParallel({
        missing: { capabilityId: "no-such", input: {} },
      });

      expect(results.missing.success).toBe(false);
      expect(results.missing.error?.code).toBe("CAPABILITY_NOT_FOUND");
    });
  });

  // ---------- executePipeline ----------

  describe("executePipeline", () => {
    it("returns the output of the last step on success", async () => {
      const cap = makeCapability({
        execute: jest.fn().mockResolvedValue({ success: true, data: "final" }),
      });
      registry.get.mockReturnValue(cap);

      const result = await service.executePipeline({
        name: "test-pipeline",
        steps: [{ capabilityId: "test-cap" }],
        initialInput: "start",
      });

      expect(result.success).toBe(true);
      expect(result.data).toBe("final");
    });

    it("passes previous output as next step input", async () => {
      const executeMock = jest
        .fn()
        .mockResolvedValueOnce({ success: true, data: "step-1-out" })
        .mockResolvedValueOnce({ success: true, data: "step-2-out" });

      const cap = makeCapability({ execute: executeMock });
      registry.get.mockReturnValue(cap);

      await service.executePipeline({
        name: "pipe",
        steps: [{ capabilityId: "test-cap" }, { capabilityId: "test-cap" }],
        initialInput: "initial",
      });

      // Second call should receive the output of the first step
      const [secondInput] = executeMock.mock.calls[1];
      expect(secondInput).toBe("step-1-out");
    });

    it("applies inputTransform before calling the step", async () => {
      const executeMock = jest
        .fn()
        .mockResolvedValue({ success: true, data: "done" });

      const cap = makeCapability({ execute: executeMock });
      registry.get.mockReturnValue(cap);

      await service.executePipeline({
        name: "transform-pipe",
        steps: [
          {
            capabilityId: "test-cap",
            inputTransform: (prev) => `transformed:${prev}`,
          },
        ],
        initialInput: "raw",
      });

      const [firstInput] = executeMock.mock.calls[0];
      expect(firstInput).toBe("transformed:raw");
    });

    it("skips a step when condition returns false", async () => {
      const executeMock = jest
        .fn()
        .mockResolvedValue({ success: true, data: "done" });

      const cap = makeCapability({ execute: executeMock });
      registry.get.mockReturnValue(cap);

      const result = await service.executePipeline({
        name: "conditional-pipe",
        steps: [
          {
            capabilityId: "test-cap",
            condition: () => false, // always skip
          },
        ],
        initialInput: "start",
      });

      expect(executeMock).not.toHaveBeenCalled();
      expect(result.success).toBe(true);
      expect(result.data).toBe("start"); // unchanged
    });

    it("stops the pipeline and returns failure when a step fails", async () => {
      const executeMock = jest.fn().mockResolvedValueOnce({
        success: false,
        error: { code: "ERR", message: "step failed" },
      });

      const cap = makeCapability({ execute: executeMock });
      registry.get.mockReturnValue(cap);

      const result = await service.executePipeline({
        name: "fail-pipe",
        steps: [
          { capabilityId: "test-cap" },
          { capabilityId: "test-cap" }, // should not be reached
        ],
        initialInput: {},
      });

      expect(result.success).toBe(false);
      expect(executeMock).toHaveBeenCalledTimes(1); // second step was not executed
    });

    it("injects pipeline metadata into context", async () => {
      const executeMock = jest
        .fn()
        .mockResolvedValue({ success: true, data: "ok" });

      const cap = makeCapability({ execute: executeMock });
      registry.get.mockReturnValue(cap);

      await service.executePipeline({
        name: "meta-pipe",
        steps: [{ capabilityId: "test-cap" }],
        initialInput: {},
      });

      const [, context] = executeMock.mock.calls[0];
      expect(context.metadata?.pipelineName).toBe("meta-pipe");
      expect(context.metadata?.pipelineStep).toBe(1);
      expect(context.metadata?.pipelineTotalSteps).toBe(1);
    });

    it("handles an empty steps array and returns initialInput", async () => {
      const result = await service.executePipeline({
        name: "empty-pipe",
        steps: [],
        initialInput: "untouched",
      });

      expect(result.success).toBe(true);
      expect(result.data).toBe("untouched");
    });
  });

  // ---------- callWithRetry ----------

  describe("callWithRetry", () => {
    beforeEach(() => {
      // Speed up retries for tests
      jest
        .spyOn(
          service as unknown as { delay: (ms: number) => Promise<void> },
          "delay",
        )
        .mockResolvedValue(undefined);
    });

    it("returns immediately on first success", async () => {
      const cap = makeCapability();
      registry.get.mockReturnValue(cap);

      const result = await service.callWithRetry(
        { capabilityId: "test-cap", input: {} },
        { maxRetries: 3, retryDelay: 0 },
      );

      expect(result.success).toBe(true);
      expect(cap.execute).toHaveBeenCalledTimes(1);
    });

    it("retries on retryable error codes", async () => {
      const executeMock = jest
        .fn()
        .mockResolvedValueOnce({
          success: false,
          error: { code: "TIMEOUT", message: "timed out" },
        })
        .mockResolvedValueOnce({ success: true, data: "recovered" });

      const cap = makeCapability({ execute: executeMock });
      registry.get.mockReturnValue(cap);

      const result = await service.callWithRetry(
        { capabilityId: "test-cap", input: {} },
        { maxRetries: 3, retryDelay: 0 },
      );

      expect(result.success).toBe(true);
      expect(executeMock).toHaveBeenCalledTimes(2);
    });

    it("does not retry on non-retryable error codes", async () => {
      const executeMock = jest.fn().mockResolvedValue({
        success: false,
        error: { code: "VALIDATION_ERROR", message: "invalid" },
      });

      const cap = makeCapability({ execute: executeMock });
      registry.get.mockReturnValue(cap);

      const result = await service.callWithRetry(
        { capabilityId: "test-cap", input: {} },
        { maxRetries: 3, retryDelay: 0 },
      );

      expect(result.success).toBe(false);
      expect(executeMock).toHaveBeenCalledTimes(1);
    });

    it("exhausts retries and returns the last failure", async () => {
      const executeMock = jest.fn().mockResolvedValue({
        success: false,
        error: { code: "RATE_LIMIT", message: "rate limited" },
      });

      const cap = makeCapability({ execute: executeMock });
      registry.get.mockReturnValue(cap);

      const result = await service.callWithRetry(
        { capabilityId: "test-cap", input: {} },
        { maxRetries: 2, retryDelay: 0 },
      );

      expect(result.success).toBe(false);
      expect(executeMock).toHaveBeenCalledTimes(2);
    });

    it("uses defaults of maxRetries=3 when not specified", async () => {
      const executeMock = jest.fn().mockResolvedValue({
        success: false,
        error: { code: "RATE_LIMIT", message: "rate limited" },
      });

      const cap = makeCapability({ execute: executeMock });
      registry.get.mockReturnValue(cap);

      await service.callWithRetry({ capabilityId: "test-cap", input: {} });

      expect(executeMock).toHaveBeenCalledTimes(3);
    });

    it("retries on SERVICE_UNAVAILABLE and NETWORK_ERROR codes", async () => {
      for (const code of ["SERVICE_UNAVAILABLE", "NETWORK_ERROR"]) {
        registry.get.mockReturnValue(
          makeCapability({
            execute: jest
              .fn()
              .mockResolvedValueOnce({
                success: false,
                error: { code, message: "err" },
              })
              .mockResolvedValueOnce({ success: true, data: "ok" }),
          }),
        );

        const result = await service.callWithRetry(
          { capabilityId: "test-cap", input: {} },
          { maxRetries: 2, retryDelay: 0 },
        );

        expect(result.success).toBe(true);
      }
    });
  });
});
