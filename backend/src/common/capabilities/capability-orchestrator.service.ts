import { Injectable, Logger } from "@nestjs/common";
import { CapabilityRegistryService } from "./capability-registry.service";
import {
  CapabilityContext,
  CapabilityResult,
  CapabilityEvent,
  CapabilityMode,
} from "./interfaces/capability.interface";

interface CallOptions {
  capabilityId: string;
  input: unknown;
  context?: Partial<CapabilityContext>;
}

interface PipelineStep {
  capabilityId: string;
  inputTransform?: (prevOutput: unknown) => unknown;
  condition?: (prevOutput: unknown) => boolean;
}

interface PipelineOptions {
  name: string;
  steps: PipelineStep[];
  initialInput: unknown;
  context?: Partial<CapabilityContext>;
}

@Injectable()
export class CapabilityOrchestratorService {
  private readonly logger = new Logger(CapabilityOrchestratorService.name);

  constructor(private readonly registry: CapabilityRegistryService) {}

  /**
   * 调用单个能力
   */
  async call<TOutput = unknown>(
    options: CallOptions,
  ): Promise<CapabilityResult<TOutput>> {
    const { capabilityId, input, context } = options;
    const startTime = Date.now();

    const capability = this.registry.get(capabilityId);
    if (!capability) {
      return {
        success: false,
        error: {
          code: "CAPABILITY_NOT_FOUND",
          message: `Capability ${capabilityId} not found`,
        },
      };
    }

    const fullContext = this.buildContext(context);

    try {
      // 验证输入
      if (capability.validateInput) {
        const validation = capability.validateInput(input);
        if (!validation.valid) {
          return {
            success: false,
            error: {
              code: "VALIDATION_ERROR",
              message: "Input validation failed",
              details: validation.errors,
            },
          };
        }
      }

      // 执行能力
      const result = await capability.execute(input, fullContext);

      this.logger.log(
        `Capability ${capabilityId} executed in ${Date.now() - startTime}ms`,
      );

      return result as CapabilityResult<TOutput>;
    } catch (error) {
      this.logger.error(`Capability ${capabilityId} failed:`, error);
      return {
        success: false,
        error: {
          code: "EXECUTION_ERROR",
          message: error instanceof Error ? error.message : "Unknown error",
        },
        metadata: {
          duration: Date.now() - startTime,
        },
      };
    }
  }

  /**
   * 流式调用
   */
  async *callStream<TOutput = unknown>(
    options: CallOptions,
  ): AsyncGenerator<CapabilityEvent<TOutput>> {
    const { capabilityId, input, context } = options;

    const capability = this.registry.get(capabilityId);
    if (!capability) {
      yield {
        type: "error",
        error: {
          code: "CAPABILITY_NOT_FOUND",
          message: `Capability ${capabilityId} not found`,
        },
      };
      return;
    }

    const metadata = capability.getMetadata();
    if (
      metadata.mode !== CapabilityMode.STREAMING ||
      !capability.executeStream
    ) {
      yield {
        type: "error",
        error: {
          code: "STREAMING_NOT_SUPPORTED",
          message: `Capability ${capabilityId} does not support streaming`,
        },
      };
      return;
    }

    const fullContext = this.buildContext(context);

    try {
      for await (const event of capability.executeStream(input, fullContext)) {
        yield event as CapabilityEvent<TOutput>;
      }
    } catch (error) {
      yield {
        type: "error",
        error: {
          code: "STREAM_ERROR",
          message: error instanceof Error ? error.message : "Unknown error",
        },
      };
    }
  }

  /**
   * 并行调用多个能力
   */
  async callParallel<T extends Record<string, CallOptions>>(
    calls: T,
  ): Promise<{ [K in keyof T]: CapabilityResult }> {
    const entries = Object.entries(calls);
    const results = await Promise.all(
      entries.map(([key, options]) =>
        this.call(options).then((result) => [key, result] as const),
      ),
    );

    return Object.fromEntries(results) as { [K in keyof T]: CapabilityResult };
  }

  /**
   * 执行能力管道
   */
  async executePipeline<TOutput = unknown>(
    options: PipelineOptions,
  ): Promise<CapabilityResult<TOutput>> {
    const { name, steps, initialInput, context } = options;
    const startTime = Date.now();

    this.logger.log(`Starting pipeline: ${name} with ${steps.length} steps`);

    let currentInput = initialInput;

    for (let i = 0; i < steps.length; i++) {
      const step = steps[i];

      // 检查条件
      if (step.condition && !step.condition(currentInput)) {
        this.logger.log(
          `Pipeline ${name} step ${i + 1} skipped due to condition`,
        );
        continue;
      }

      // 应用输入转换
      const stepInput = step.inputTransform
        ? step.inputTransform(currentInput)
        : currentInput;

      // 执行当前步骤
      const result = await this.call({
        capabilityId: step.capabilityId,
        input: stepInput,
        context: {
          ...context,
          metadata: {
            ...context?.metadata,
            pipelineName: name,
            pipelineStep: i + 1,
            pipelineTotalSteps: steps.length,
          },
        },
      });

      if (!result.success) {
        this.logger.error(
          `Pipeline ${name} failed at step ${i + 1}: ${step.capabilityId}`,
        );
        return result as CapabilityResult<TOutput>;
      }

      currentInput = result.data;
    }

    this.logger.log(
      `Pipeline ${name} completed in ${Date.now() - startTime}ms`,
    );

    return {
      success: true,
      data: currentInput as TOutput,
      metadata: {
        duration: Date.now() - startTime,
      },
    };
  }

  /**
   * 带重试的调用
   */
  async callWithRetry<TOutput = unknown>(
    options: CallOptions,
    retryOptions: { maxRetries?: number; retryDelay?: number } = {},
  ): Promise<CapabilityResult<TOutput>> {
    const { maxRetries = 3, retryDelay = 1000 } = retryOptions;
    let lastResult: CapabilityResult<TOutput> | undefined;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      lastResult = await this.call<TOutput>(options);

      if (lastResult.success) {
        return lastResult;
      }

      // 检查是否可重试的错误
      const isRetryable = this.isRetryableError(lastResult.error?.code);
      if (!isRetryable || attempt === maxRetries) {
        break;
      }

      this.logger.warn(
        `Capability ${options.capabilityId} failed, retrying (${attempt}/${maxRetries})...`,
      );
      await this.delay(retryDelay * attempt);
    }

    return lastResult!;
  }

  private buildContext(
    partial?: Partial<CapabilityContext>,
  ): CapabilityContext {
    return {
      userId: partial?.userId ?? "system",
      requestId:
        partial?.requestId ??
        `req_${Date.now()}_${Math.random().toString(36).slice(2)}`,
      traceId: partial?.traceId,
      timeout: partial?.timeout ?? 60000,
      metadata: partial?.metadata,
    };
  }

  private isRetryableError(code?: string): boolean {
    const retryableCodes = [
      "TIMEOUT",
      "RATE_LIMIT",
      "SERVICE_UNAVAILABLE",
      "NETWORK_ERROR",
    ];
    return code ? retryableCodes.includes(code) : false;
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
