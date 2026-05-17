/**
 * NarrativeEmitter for social SocialPublishMission.
 *
 * 在 stage 函数里 narrate(deps.emit, missionId, userId, { stage, role, tag, text }).
 *
 * 设计原则（mirror playground narrative.util）：
 *   - text 必须是给人看的自然语言，禁止 JSON 字符串拼接
 *   - 模板化 + 关键参数填空（不调 LLM，避免成本和不稳定）
 *   - tag 决定前端图标 / 颜色
 *   - stage 一定要给（前端按 stage 把 narrative 归到对应 stepper）
 *   - 失败 emit 不抛错（best-effort）
 */

import type { EmitFn } from "./mission-deps";

export type NarrativeTag =
  | "thinking"
  | "planning"
  | "searching"
  | "analyzing"
  | "writing"
  | "reviewing"
  | "publishing"
  | "verifying"
  | "signing"
  | "warning"
  | "success"
  | "info";

export type NarrativeStage =
  | "s1-budget-eval"
  | "s2-platform-probe"
  | "s3-content-transform"
  | "s4-leader-assess-transform"
  | "s5-cover-craft"
  | "s6-body-compose"
  | "s7-polish-review"
  | "s8-publish-execute"
  | "s8b-publish-retry"
  | "s9-publish-verify"
  | "s10-leader-signoff"
  | "s11-mission-persist"
  | "s12-self-evolution";

export type NarrativeRole =
  | "leader"
  | "steward"
  | "platform-probe"
  | "content-transformer"
  | "cover-artist"
  | "composer"
  | "polish-reviewer"
  | "publish-executor"
  | "publish-verifier"
  | "mission";

export interface NarrativeEvent {
  stage: NarrativeStage;
  role: NarrativeRole;
  tag: NarrativeTag;
  text: string;
  /** 平台名（多平台 mission 时定位单平台子事件） */
  platform?: string;
  /** 关联 agentId（让前端把 narrative 归到具体 agent 行） */
  agentId?: string;
}

export async function narrate(
  emit: EmitFn,
  missionId: string,
  userId: string,
  ev: NarrativeEvent,
): Promise<void> {
  await emit({
    type: "social.agent:narrative",
    missionId,
    userId,
    agentId: ev.agentId,
    payload: {
      stage: ev.stage,
      role: ev.role,
      tag: ev.tag,
      text: ev.text,
      platform: ev.platform,
      agentId: ev.agentId,
    },
  }).catch(() => {
    /* narrative best-effort */
  });
}
