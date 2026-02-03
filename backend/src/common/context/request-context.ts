import { AsyncLocalStorage } from "async_hooks";

export interface RequestContextData {
  userId?: string;
}

class RequestContextStore {
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
}

export const RequestContext = new RequestContextStore();
