/**
 * tool-timeout plugin 实现（v5.1 R0.5-E W1-a）
 *
 * 设计：
 *   - TOOL_WRAP 包裹 terminal 执行；race(ctx.next(), setTimeout)
 *   - 超时 → reject HookAbortError('timeout')；ToolPipeline 在 abort 路径仍 fire TOOL_AFTER
 *     让 billing/audit 记录 timeout 事件（HIGH-3 abort 生命周期）
 *   - 超时阈值优先级：contextMeta.timeout > timeoutByToolId > defaultTimeoutMs
 *   - terminal 在 timer 后仍可能继续（调度层不可中断），但其结果被丢弃；与
 *     legacy TimeoutMiddleware.wrapExecution 行为一致
 */
import type {
  IPlugin,
  IPluginContext,
  HookHandler,
  PluginHealth,
  ToolWrapPayload,
} from "@/plugins/core/abstractions";
import { CORE_HOOKS, HookAbortError } from "@/plugins/core/abstractions";
import { TOOL_TIMEOUT_MANIFEST } from "./manifest";

export interface ToolTimeoutConfig {
  /** 默认超时（毫秒），未匹配任何 toolId 时使用。默认 30s。 */
  readonly defaultTimeoutMs?: number;
  /** 按 toolId override（可读性优于 number key map） */
  readonly timeoutByToolId?: Readonly<Record<string, number>>;
}

export class ToolTimeoutPlugin implements IPlugin<ToolTimeoutConfig> {
  readonly manifest = TOOL_TIMEOUT_MANIFEST;

  private defaultTimeoutMs = 30_000;
  private timeoutByToolId: Record<string, number> = {};
  private logger?: IPluginContext["logger"];

  async init(ctx: IPluginContext, config: ToolTimeoutConfig): Promise<void> {
    this.logger = ctx.logger;
    this.defaultTimeoutMs = config.defaultTimeoutMs ?? 30_000;
    this.timeoutByToolId = { ...(config.timeoutByToolId ?? {}) };

    ctx.hooks.register(CORE_HOOKS.TOOL_WRAP, this.onToolWrap, {
      // 高 priority：race 在最外层，比 sandbox/retry 先建立 deadline
      priority: 80,
    });
  }

  async healthCheck(): Promise<PluginHealth> {
    return { status: "healthy" };
  }

  // ── hook handler ──

  private onToolWrap: HookHandler<ToolWrapPayload> = async (ctx) => {
    const callTyped = ctx.payload.call as
      | {
          toolId?: string;
          contextMeta?: { metadata?: { timeout?: number } } & {
            timeout?: number;
          };
        }
      | undefined;
    const toolId = callTyped?.toolId ?? "unknown";

    const timeoutMs = this.resolveTimeout(toolId, callTyped?.contextMeta);

    return new Promise((resolve, reject) => {
      let settled = false;
      const timer = setTimeout(() => {
        if (settled) return;
        settled = true;
        this.logger?.warn(
          `[tool-timeout] tool '${toolId}' exceeded ${timeoutMs}ms — aborting`,
        );
        reject(
          new HookAbortError("timeout", this.manifest.id, {
            toolId,
            timeoutMs,
          }),
        );
      }, timeoutMs);
      timer.unref?.();

      ctx
        .next()
        .then((result) => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          resolve(result);
        })
        .catch((err) => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          reject(err);
        });
    });
  };

  // ── helpers ──

  private resolveTimeout(
    toolId: string,
    contextMeta:
      | ({ metadata?: { timeout?: number } } & { timeout?: number })
      | undefined,
  ): number {
    // 优先 1：context-level override（runtime per-call 配置）
    const ctxTimeout = contextMeta?.timeout ?? contextMeta?.metadata?.timeout;
    if (typeof ctxTimeout === "number" && ctxTimeout > 0) {
      return ctxTimeout;
    }
    // 优先 2：plugin config 的 toolId map
    const fromMap = this.timeoutByToolId[toolId];
    if (typeof fromMap === "number" && fromMap > 0) {
      return fromMap;
    }
    // 优先 3：默认
    return this.defaultTimeoutMs;
  }
}
