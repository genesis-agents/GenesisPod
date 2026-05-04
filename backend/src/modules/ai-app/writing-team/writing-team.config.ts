/**
 * writing-team pipeline config（v5.1 §4 R3-A demo）
 *
 * 3 stage：plan (outline) → draft (write markdown) → signoff (editor approves)
 * 全部用 R1-A 的 generic primitive；业务逻辑通过 hooks 注入（service 提供）。
 */
import { defineMissionPipeline } from "@/modules/ai-harness/facade";
import type {
  MissionPipelineConfig,
  ResolvedRole,
} from "@/modules/ai-harness/facade";
import type { ZodType } from "zod";

/**
 * 不依赖外部 OutputSchemaRegistry：demo 用 inline z.unknown() placeholder（通过
 * SkillSpecBuilder 时业务可换）；这里直接构造 ResolvedRole.skillSpec 给
 * orchestrator 用。
 */
function makeSkillSpec(
  id: string,
  systemPrompt: string,
): ResolvedRole["skillSpec"] {
  return {
    id,
    systemPrompt,
    allowedToolIds: [],
    allowedModels: [],
    outputSchema: {
      safeParse: (value: unknown) => ({ success: true as const, data: value }),
    } as unknown as ZodType,
    meta: { skillVersion: "1.0", skillDomain: "writing-team" },
  };
}

/**
 * Pipeline declaration —— 3 stage / 2 role（writer + editor）
 */
export const WRITING_TEAM_PIPELINE: MissionPipelineConfig =
  defineMissionPipeline({
    id: "writing-team",
    roles: [
      {
        id: "writer",
        skillSpec: makeSkillSpec(
          "writing-team.writer",
          [
            "你是 writing-team 的 writer。",
            "Plan 阶段输出 markdown outline；Draft 阶段把 outline 扩展成完整文章。",
            "保持 Topic 一致 + 控制字数贴近 targetWords。",
          ].join("\n"),
        ),
        stateful: false,
      },
      {
        id: "editor",
        skillSpec: makeSkillSpec(
          "writing-team.editor",
          [
            "你是 writing-team 的 editor。",
            "Signoff 阶段审 draft；通过 = approved=true，否则给出修改 notes。",
          ].join("\n"),
        ),
        stateful: true,
      },
    ],
    steps: [
      {
        primitive: "plan",
        id: "plan-outline",
        roleId: "writer",
      },
      {
        primitive: "draft",
        id: "write-draft",
        roleId: "writer",
        mode: "full",
      },
      {
        primitive: "signoff",
        id: "editor-signoff",
        roleId: "editor",
      },
    ],
    defaultStepTimeoutMs: 60_000,
    meta: { description: "writing-team R3-A demo (v5.1)" },
  });
