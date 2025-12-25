import {
  ICapability,
  CapabilityMetadata,
  CapabilityContext,
  CapabilityResult,
  CapabilityEvent,
  CapabilityMode,
  CapabilityCategory,
} from "../interfaces/capability.interface";

/**
 * 能力基类 - 提供通用实现
 */
export abstract class BaseCapability<TInput = unknown, TOutput = unknown>
  implements ICapability<TInput, TOutput>
{
  protected abstract readonly id: string;
  protected abstract readonly name: string;
  protected abstract readonly description: string;
  protected abstract readonly category: CapabilityCategory;
  protected abstract readonly provider: string;

  protected readonly mode: CapabilityMode = CapabilityMode.SYNC;
  protected readonly version: string = "1.0.0";
  protected readonly tags: string[] = [];

  getMetadata(): CapabilityMetadata {
    return {
      id: this.id,
      name: this.name,
      description: this.description,
      category: this.category,
      provider: this.provider,
      mode: this.mode,
      inputSchema: this.getInputSchema(),
      outputSchema: this.getOutputSchema(),
      tags: this.tags,
      version: this.version,
      enabled: true,
    };
  }

  protected getInputSchema(): Record<string, unknown> {
    return { type: "object" };
  }

  protected getOutputSchema(): Record<string, unknown> {
    return { type: "object" };
  }

  abstract execute(
    input: TInput,
    context: CapabilityContext,
  ): Promise<CapabilityResult<TOutput>>;

  executeStream?(
    input: TInput,
    context: CapabilityContext,
  ): AsyncGenerator<CapabilityEvent<TOutput>>;

  validateInput?(input: TInput): { valid: boolean; errors?: string[] };

  /**
   * 创建成功结果
   */
  protected success(
    data: TOutput,
    metadata?: { duration: number; tokensUsed?: number },
  ): CapabilityResult<TOutput> {
    return {
      success: true,
      data,
      metadata,
    };
  }

  /**
   * 创建失败结果
   */
  protected failure(
    code: string,
    message: string,
    details?: unknown,
  ): CapabilityResult<TOutput> {
    return {
      success: false,
      error: { code, message, details },
    };
  }

  /**
   * 创建进度事件
   */
  protected progressEvent(
    progress: number,
    message?: string,
  ): CapabilityEvent<TOutput> {
    return { type: "progress", progress, message };
  }

  /**
   * 创建数据事件
   */
  protected dataEvent(data: Partial<TOutput>): CapabilityEvent<TOutput> {
    return { type: "data", data: data as TOutput };
  }

  /**
   * 创建完成事件
   */
  protected completeEvent(data: TOutput): CapabilityEvent<TOutput> {
    return { type: "complete", data };
  }

  /**
   * 创建错误事件
   */
  protected errorEvent(
    code: string,
    message: string,
  ): CapabilityEvent<TOutput> {
    return { type: "error", error: { code, message } };
  }
}
