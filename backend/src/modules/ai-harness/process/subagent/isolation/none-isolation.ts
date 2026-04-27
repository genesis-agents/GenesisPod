/**
 * NoneIsolation — 共享父 envelope
 *
 * 子 agent 直接拿到父 envelope 的引用（只换 system prompt）。
 * 适合：轻量委托（把一个子任务交给另一个 role 做），不需要独立状态。
 */

import type { IContextEnvelope } from "../../../kernel/abstractions";
import { ContextEnvelope } from "../../../kernel/core/context-envelope";
import type { IsolationPolicy } from "./isolation.types";

export class NoneIsolation implements IsolationPolicy {
  readonly kind = "none" as const;

  derive(
    parent: IContextEnvelope,
    options: { subagentSystemPrompt: string },
  ): IContextEnvelope {
    // Clone messages/reminders/tools but keep memory/budget pointers
    return new ContextEnvelope({
      system: options.subagentSystemPrompt,
      messages: [...parent.messages],
      reminders: [...parent.reminders],
      tools: [...parent.tools],
      memory: parent.memory,
      budget: parent.budget,
      metadata: parent.metadata,
    });
  }
}
