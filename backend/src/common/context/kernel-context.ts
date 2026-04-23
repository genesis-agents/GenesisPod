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
  /** 活跃的时延跟踪会话 ID */
  latencySessionId?: string;
  /** 当前活跃的时延跟踪阶段 ID */
  latencyPhaseId?: string;
  /**
   * Topic Insights mission ID（用于 BaselineRecorder 过滤 + 分组）
   * 只在 topic-insights 的 mission execution 流程中设置
   */
  missionId?: string;
  /** 用于 fixture 分组的 topicId + depth 标签（topic-insights baseline 录制使用） */
  baselineTag?: string;
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

  getMissionId(): string | undefined {
    return this.storage.getStore()?.missionId;
  }

  getBaselineTag(): string | undefined {
    return this.storage.getStore()?.baselineTag;
  }
}

export const KernelContext = new KernelContextStore();
