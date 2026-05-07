/**
 * Stage S8.5 — Revise single chapter (PR-7 v1.6 D5 revise-chapter intent)
 *
 * 仅在 RerunIntent === "revise-chapter" 时触发；正常 mission 路径不调本 stage。
 *
 * Input contract（v1.6 § 12 P-A6）：
 *   - chapterId: 目标章节（必属于该 user 的 mission，CWE-639 隔离）
 *   - reviseInstruction: 用户输入的修订指引
 *   - styleOverride?: 本次修订改 style
 *   - preserveFigures: 默认 true 保留原 figures；false 触发 figure-curator 重跑
 *
 * Output contract:
 *   - newAttemptId: chapter_attempts 表新增 attempt_no = N+1
 *   - publishedChapterId: chapters 表（更新原行，不创建新行）
 *   - wordCount: backend countCJKWords 真值
 *
 * DB 写入语义（防数据废墟）:
 *   transaction:
 *     1. 校验所有权（chapter_id + user_id 双重 WHERE）
 *     2. 调 chapter-writer.revise(original, instruction)
 *     3. backend 重算 countCJKWords
 *     4. 写 chapter_drafts 表（attempt_no = N+1）
 *     5. update chapters 表 content/word_count（原地替换 publishedChapterId 不变）
 *     6. preserveFigures=false → 删 figures 触发 figure-curator 重跑
 *
 * Liveness emit（防 mission 卡 #11）:
 *   - chapter:revise-started
 *   - chapter:revise-llm-call
 *   - chapter:revise-llm-completed
 *   - chapter:revise-persisted
 *   - chapter:revise-completed | chapter:revise-failed
 *
 * 当前实现：lifecycle 框架 + DB schema 就绪；chapter-writer.revise() 与
 * RerunIntent revise-chapter handler wire 待 PR-119 (handler) 完成。
 *
 * 见 docs/architecture/ai-app/agent-playground/agent-playground-overhaul-v1.6.md § 12 P-A6
 */

import type { MissionInvariants } from "../mission-context";
import type { MissionDeps } from "../mission-deps";

const STAGE_ID = "s8-5-revise-single-chapter";

export type ReviseSingleChapterInput = {
  chapterId: string;
  reviseInstruction: string;
  styleOverride?: string;
  preserveFigures?: boolean;
  preserveCitations?: boolean;
};

export type ReviseSingleChapterOutput = {
  newAttemptId: string;
  publishedChapterId: string;
  wordCount: number;
  figureCount: number;
  citationCount: number;
  durationMs: number;
};

/**
 * 正常 mission 路径调用 → 立即 no-op（本 stage 仅供 RerunIntent revise-chapter 使用）。
 */
export async function runReviseSingleChapterStage(
  ctx: MissionInvariants,
  deps: MissionDeps,
): Promise<void> {
  const { missionId, userId } = ctx;
  await deps
    .emit({
      type: `agent-playground.${STAGE_ID}:skipped`,
      missionId,
      userId,
      payload: {
        reason: "main-pipeline-noop",
        note: "本 stage 仅供 revise-chapter rerun intent 使用",
      },
    })
    .catch((err: unknown) => {
      deps.log.warn(
        `[${missionId}] emit ${STAGE_ID}:skipped failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    });
}
