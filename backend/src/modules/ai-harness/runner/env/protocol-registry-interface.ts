/**
 * ProtocolRegistry 接口 — taskType → Protocol 路由抽象
 *
 * 归属：L2 ai-engine/harness/runtime/ — 通用
 * 具体实现（注册哪些 protocol）由 App 层完成。
 */

import type { TaskExecutionProtocol } from "./react-runner";

export interface ProtocolRegistry<
  TMetadata extends Record<string, unknown> = Record<string, unknown>,
> {
  get<TResult = unknown>(
    taskType: string,
  ): TaskExecutionProtocol<TResult, TMetadata> | undefined;

  mustGet<TResult = unknown>(
    taskType: string,
  ): TaskExecutionProtocol<TResult, TMetadata>;

  listTypes(): string[];
}
