/**
 * Isolation Types — 3 级子 Agent 隔离策略
 *
 * - none:     共享父 envelope（同一 session，同一工具集）
 * - context:  独立 envelope（新 session id）；memory binding 继承（共享 userId）
 * - worktree: 独立 envelope + 独立 session + session-level memory 隔绝
 *             (文件系统级 worktree 预留给 code-executing subagent，本 phase 不实际开 worktree)
 */

import type { IContextEnvelope, SubagentIsolation } from "../../../kernel/abstractions";

export interface IsolationPolicy {
  readonly kind: SubagentIsolation;
  /** 从父 envelope 派生出子 envelope */
  derive(
    parent: IContextEnvelope,
    options: {
      subagentSessionId: string;
      subagentSystemPrompt: string;
      budgetOverride?: {
        maxTokens?: number;
        maxIterations?: number;
        maxWallTimeMs?: number;
      };
    },
  ): IContextEnvelope;
}
