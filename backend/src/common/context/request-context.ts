import { AsyncLocalStorage } from "async_hooks";
import { randomUUID } from "crypto";

export interface RequestContextData {
  userId?: string;
  requestId?: string;
  traceId?: string;
  spanId?: string;
  startTime?: number;
  path?: string;
  method?: string;
}

export class RequestContextStore {
  private storage = new AsyncLocalStorage<RequestContextData>();

  run<T>(data: RequestContextData, fn: () => T): T {
    return this.storage.run(data, fn);
  }

  get(): RequestContextData | undefined {
    return this.storage.getStore();
  }

  getUserId(): string | undefined {
    return this.storage.getStore()?.userId;
  }

  getRequestId(): string | undefined {
    return this.storage.getStore()?.requestId;
  }

  getTraceId(): string | undefined {
    return this.storage.getStore()?.traceId;
  }

  /**
   * 生成新的请求 ID
   */
  static generateRequestId(): string {
    return randomUUID();
  }

  /**
   * 获取当前上下文的日志元数据
   */
  getLogContext(): Record<string, string | undefined> {
    const ctx = this.storage.getStore();
    if (!ctx) return {};

    return {
      requestId: ctx.requestId,
      traceId: ctx.traceId,
      userId: ctx.userId,
    };
  }
}

export const RequestContext = new RequestContextStore();
