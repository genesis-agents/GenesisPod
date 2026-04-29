/**
 * NarrativeEmitter —— 人话叙事事件辅助
 *
 * 用法：在 stage 函数里 narrate(deps, missionId, userId, { stage, role, tag, text }).
 *
 * 设计原则：
 *   - text 必须是给人看的自然语言，禁止 JSON 字符串拼接
 *   - 模板化 + 关键参数填空（不调 LLM，避免成本和不稳定）
 *   - tag 决定前端图标 / 颜色（thinking / searching / analyzing / writing / reviewing / signing）
 *   - stage 一定要给（前端按 stage 把 narrative 归到对应的 todo）
 *   - 失败 emit 不抛错（best-effort）
 */

import type { EmitFn } from "../mission-deps";

export type NarrativeTag =
  | "thinking"
  | "planning"
  | "searching"
  | "scraping"
  | "analyzing"
  | "writing"
  | "reviewing"
  | "judging"
  | "signing"
  | "warning"
  | "success"
  | "info";

export type NarrativeStage =
  | "s1-budget"
  | "s2-leader-plan"
  | "s3-researchers"
  | "s4-leader-assess"
  | "s5-reconciler"
  | "s6-analyst"
  | "s7-writer-outline"
  | "s8-writer-draft"
  | "s8b-quality-enhancement"
  | "s9-critic-l4"
  | "s9b-objective-evaluation"
  | "s10-leader-signoff"
  | "s11-persist";

export interface NarrativeEvent {
  stage: NarrativeStage;
  role:
    | "leader"
    | "researcher"
    | "analyst"
    | "writer"
    | "reviewer"
    | "reconciler"
    | "critic"
    | "mission";
  tag: NarrativeTag;
  text: string;
  /** dimension name（researcher / chapter 相关 narrative 必带） */
  dimension?: string;
  /** chapter index（章节级 narrative 必带） */
  chapterIndex?: number;
  /** 关联 agentId（让前端能把 narrative 归到具体 agent 的 todo） */
  agentId?: string;
}

export async function narrate(
  emit: EmitFn,
  missionId: string,
  userId: string,
  ev: NarrativeEvent,
): Promise<void> {
  await emit({
    type: "agent-playground.agent:narrative",
    missionId,
    userId,
    agentId: ev.agentId,
    payload: {
      stage: ev.stage,
      role: ev.role,
      tag: ev.tag,
      text: ev.text,
      dimension: ev.dimension,
      chapterIndex: ev.chapterIndex,
    },
  }).catch(() => {
    /* narrative best-effort */
  });
}
