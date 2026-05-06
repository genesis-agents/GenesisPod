/**
 * playground.config.ts —— v5.1 §3.2 / §5 R2-A pipeline 声明（双轨第一阶段）
 *
 * 目的：把现有 13 stage（s1-budget → s12-self-evolution）映射到 R1 generic
 * primitive，让 MissionPipelineOrchestrator 可以替代 team.mission.ts 跑同样的
 * mission 流程。
 *
 * 双轨期（R2-A → R2-B 1 周观察）：
 *   - PLAYGROUND_RUNTIME=legacy（默认）   → 走 team.mission.ts（当前生产代码）
 *   - PLAYGROUND_RUNTIME=pipeline-v1     → 走本 config + Orchestrator
 *
 * R2-A 这一个 PR 仅落 scaffolding：
 *   1. pipeline 声明（13 step + 8 role + skillSpec from SKILL.md）
 *   2. hooks 暂为 NOT_YET_WIRED 占位 —— 真实迁移在 R2-A.1 ~ R2-A.13 增量推进
 *   3. registry 注册不抛错 + primitive id 解析正确（spec 守门）
 *
 * 未实现 hook 调用时 stage 会抛 NotYetWiredError，pipeline-v1 路径目前不能跑
 * 真实 mission；但 legacy 路径不受影响，feature flag=off 时永远不会走过来。
 */
import * as fs from "fs";
import * as path from "path";
import {
  defineMissionPipeline,
  type MissionPipelineConfig,
  type ResolvedRole,
} from "@/modules/ai-harness/facade";
import { loadSkill } from "./utils/skill-md-loader";
import type { ZodType } from "zod";

/**
 * Hook 暂未接入时抛此错；MissionPipelineOrchestrator 会把它包成
 * stage:failed event。R2-A.1 起把每个 stage hook 的 NOT_YET_WIRED 替换为
 * 真实业务实现。
 */
export class PlaygroundHookNotYetWiredError extends Error {
  constructor(stageId: string, hookName: string) {
    super(
      `[playground.config] stage "${stageId}" hook "${hookName}" not yet wired (R2-A.0 scaffolding)`,
    );
    this.name = "PlaygroundHookNotYetWiredError";
  }
}

/**
 * 把 SKILL.md frontmatter + 整个 markdown body 装成最小 IAgentSpec；
 * outputSchema 暂用 always-pass z.unknown() 占位（真实 SkillSpecBuilder 集成
 * 留给 R2-A.1 第一个 stage 迁移时补）。
 */
function buildSkillSpecFromMd(agentDir: string): ResolvedRole["skillSpec"] {
  const skillPath = path.resolve(__dirname, "agents", agentDir, "SKILL.md");
  if (!fs.existsSync(skillPath)) {
    throw new Error(`[playground.config] missing SKILL.md: ${skillPath}`);
  }
  const skill = loadSkill(agentDir);
  // systemPrompt = soul + 全部 duties 拼接；duty-loader 在真实 stage 内会按 phase
  // 选具体 duty 渲染；R2-A.0 阶段 systemPrompt 给完整 body 做占位。
  const sections: string[] = [];
  if (skill.soul) sections.push(skill.soul);
  for (const dutyName of skill.frontmatter.duties) {
    sections.push(skill.duties[dutyName]);
  }
  return {
    id: skill.frontmatter.id,
    systemPrompt: sections.join("\n\n---\n\n"),
    allowedToolIds: [...skill.frontmatter.allowedTools],
    allowedModels: [...skill.frontmatter.allowedModels],
    outputSchema: {
      safeParse: (value: unknown) => ({ success: true as const, data: value }),
    } as unknown as ZodType,
    meta: {
      skillVersion: skill.frontmatter.version,
      skillDomain: skill.frontmatter.domain,
    },
  };
}

/**
 * 完整 13-step pipeline 声明（v5.1 §5 stage 映射表）
 */
export const PLAYGROUND_PIPELINE: MissionPipelineConfig = defineMissionPipeline(
  {
    id: "agent-playground",
    roles: [
      {
        id: "leader",
        skillSpec: buildSkillSpecFromMd("leader"),
        stateful: true,
      },
      {
        id: "researcher",
        skillSpec: buildSkillSpecFromMd("researcher"),
        stateful: false,
      },
      {
        id: "reconciler",
        skillSpec: buildSkillSpecFromMd("reconciler"),
        stateful: false,
      },
      {
        id: "analyst",
        skillSpec: buildSkillSpecFromMd("analyst"),
        stateful: false,
      },
      {
        id: "writer",
        skillSpec: buildSkillSpecFromMd("writer"),
        stateful: false,
      },
      {
        id: "reviewer",
        skillSpec: buildSkillSpecFromMd("reviewer"),
        stateful: false,
      },
      {
        id: "verifier",
        skillSpec: buildSkillSpecFromMd("verifier"),
        stateful: false,
      },
      {
        id: "steward",
        skillSpec: buildSkillSpecFromMd("steward"),
        stateful: false,
      },
    ],
    steps: [
      // S1 — budget gate (no role, persist primitive in pre-mode)
      { primitive: "persist", id: "s1-budget", mode: "budget-pre" },
      // S2 — leader plan
      { primitive: "plan", id: "s2-leader-plan", roleId: "leader" },
      // S3 — researcher fan-out (per dimension chapter pipeline 在 hook 内做)
      {
        primitive: "research",
        id: "s3-researcher-collect",
        roleId: "researcher",
        mode: "byPlanDimensions",
      },
      // S4 — leader assess
      { primitive: "assess", id: "s4-leader-assess", roleId: "leader" },
      // S5 — reconciler
      {
        primitive: "synthesize",
        id: "s5-reconciler",
        roleId: "reconciler",
        mode: "reconcile",
      },
      // S6 — analyst
      {
        primitive: "synthesize",
        id: "s6-analyst",
        roleId: "analyst",
        mode: "analyze",
      },
      // S7 — writer outline (mission-level)
      {
        primitive: "draft",
        id: "s7-writer-outline",
        roleId: "writer",
        mode: "outline",
      },
      // S8 — writer full draft
      { primitive: "draft", id: "s8-writer", roleId: "writer", mode: "full" },
      // S8B — section quality enhancement (review primitive afterReview hook)
      {
        primitive: "review",
        id: "s8b-quality-enhancement",
        roleId: "reviewer",
        mode: "quality-enhance",
      },
      // S9 — meta critic
      {
        primitive: "review",
        id: "s9-critic",
        roleId: "reviewer",
        mode: "meta-critic",
      },
      // S9B — objective evaluation
      {
        primitive: "review",
        id: "s9b-objective-eval",
        roleId: "reviewer",
        mode: "objective",
      },
      // S10 — leader foreword + signoff
      {
        primitive: "signoff",
        id: "s10-leader-foreword-signoff",
        roleId: "leader",
      },
      // S11 — final persist
      { primitive: "persist", id: "s11-persist", mode: "final" },
      // ★ 2026-05-06 (A-7): S12 self-evolution 从 pipeline.steps 移除，改由 dispatcher
      //   在 mission terminal 后 fire-and-forget 触发，emit mission:postlude:* 事件流。
      //   原因：S12 是 best-effort 后置任务（postmortem 统计 + memory 索引），不该挂在
      //   stage:lifecycle 上让前端误以为是 mission 一部分进度。前端 todo-ledger 单独
      //   按 mission:postlude:* 推 s12 todo 状态。
    ],
    defaultStepTimeoutMs: 10 * 60_000, // 10 分钟 / step（playground 长任务保守值）
    meta: {
      description:
        "agent-playground full mission pipeline (v5.1 R2-A scaffolding)",
      eventPrefix: "agent-playground",
      runtimeVersion: "pipeline-v1",
    },
  },
);
