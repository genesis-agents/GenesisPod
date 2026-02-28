/**
 * Kernel Context - AsyncLocalStorage carrier for processId propagation
 *
 * Similar to BillingContext, this provides transparent processId propagation
 * so that AiChatService and AgentOrchestrator automatically pick up the
 * Kernel processId without explicit parameter threading.
 */
import { AsyncLocalStorage } from "async_hooks";

export interface KernelContextData {
  processId: string;
  userId?: string;
  agentId?: string;
}

class KernelContextStore {
  private storage = new AsyncLocalStorage<KernelContextData>();

  run<T>(data: KernelContextData, fn: () => T): T {
    return this.storage.run(data, fn);
  }

  get(): KernelContextData | undefined {
    return this.storage.getStore();
  }

  getProcessId(): string | undefined {
    return this.storage.getStore()?.processId;
  }
}

export const KernelContext = new KernelContextStore();
