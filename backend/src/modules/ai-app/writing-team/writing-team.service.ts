/**
 * WritingTeamService —— wrap MissionPipelineOrchestrator (v5.1 §4 R3-A demo)
 *
 * 责任：
 *   1. onModuleInit 注册 PipelineConfig（含 hooks 闭包，闭包引用 this.hooks
 *      的当前值；setHooks() 替换可立即生效）
 *   2. run(input, userId)：
 *        store.create → orchestrator.run → store.updateStatus → 返回 result
 *
 * Hooks 闭包从 ctx.input + previousOutputs 取数据；service 状态唯一可变成员
 * 是 hooks 引用 —— 无 per-run mutable，并发安全。
 */
import { Injectable, Logger, OnModuleInit } from "@nestjs/common";
import { randomUUID } from "crypto";
import {
  type IMissionStore,
  type MissionPipelineConfig,
  MissionPipelineOrchestrator,
  MissionPipelineRegistry,
  InMemoryMissionStore,
  type ResolvedStageHooks,
  type StageRunArgs,
} from "@/modules/ai-harness/facade";
import { WRITING_TEAM_PIPELINE } from "./writing-team.config";
import type {
  WritingTeamDraftOutput,
  WritingTeamInput,
  WritingTeamPlanOutput,
  WritingTeamResult,
  WritingTeamSignoffOutput,
} from "./abstractions/writing-team.types";

/** 业务 hook 注入接口（spec / 真实 LLM 替换）*/
export interface WritingTeamHooks {
  planOutline(args: {
    input: WritingTeamInput;
  }): Promise<WritingTeamPlanOutput>;
  draftFullText(args: {
    input: WritingTeamInput;
    plan: WritingTeamPlanOutput;
  }): Promise<WritingTeamDraftOutput>;
  editorSignoff(args: {
    input: WritingTeamInput;
    draft: WritingTeamDraftOutput;
  }): Promise<WritingTeamSignoffOutput>;
}

/** Demo 默认 hooks（纯函数，无 LLM）—— 真实部署替换为 LLM 实现 */
export const DEFAULT_WRITING_TEAM_HOOKS: WritingTeamHooks = {
  async planOutline({ input }) {
    return {
      outline: [
        `Introduction：${input.topic}`,
        `Body：core arguments`,
        `Conclusion：summary`,
      ],
    };
  },
  async draftFullText({ input, plan }) {
    const body = plan.outline
      .map((section) => `## ${section}\n\nContent on ${input.topic}.`)
      .join("\n\n");
    const draftMarkdown = `# ${input.topic}\n\n${body}`;
    return { draftMarkdown, wordCount: draftMarkdown.split(/\s+/).length };
  },
  async editorSignoff({ input, draft }) {
    const target = input.targetWords ?? 200;
    const tooShort = draft.wordCount < target * 0.3;
    return {
      approved: !tooShort,
      notes: tooShort
        ? `wordCount=${draft.wordCount} < 30% of target (${target})`
        : undefined,
    };
  },
};

@Injectable()
export class WritingTeamService implements OnModuleInit {
  private readonly logger = new Logger(WritingTeamService.name);
  private hooks: WritingTeamHooks = DEFAULT_WRITING_TEAM_HOOKS;
  private readonly store: IMissionStore = new InMemoryMissionStore();

  constructor(
    private readonly registry: MissionPipelineRegistry,
    private readonly orchestrator: MissionPipelineOrchestrator,
  ) {}

  onModuleInit(): void {
    if (this.registry.has(WRITING_TEAM_PIPELINE.id)) return;
    this.registry.register(this.buildPipelineWithHooks());
    this.logger.log(
      `[writing-team] pipeline "${WRITING_TEAM_PIPELINE.id}" registered`,
    );
  }

  /** spec / 集成点用：替换 hooks（闭包引用本字段，立即生效）*/
  setHooks(hooks: WritingTeamHooks): void {
    this.hooks = hooks;
  }

  /** spec 用：访问内置 InMemoryMissionStore 验证 mission record */
  getStoreForTest(): IMissionStore {
    return this.store;
  }

  /**
   * Run 一次 writing mission（fire-and-wait，同步等结果）
   */
  async run(
    input: WritingTeamInput,
    userId?: string,
  ): Promise<WritingTeamResult> {
    const missionId = randomUUID();
    await this.store.create({
      missionId,
      userId,
      pipelineId: WRITING_TEAM_PIPELINE.id,
      input,
    });

    const result = await this.orchestrator.run({
      missionId,
      pipelineId: WRITING_TEAM_PIPELINE.id,
      input,
      userId,
    });

    const status = result.status;
    await this.store.updateStatus(missionId, {
      status: status === "completed" ? "completed" : "failed",
      completedAt: new Date(),
      result: status === "completed" ? result.stageOutputs : undefined,
      error: status !== "completed" ? result.error : undefined,
    });

    const planOutput = result.stageOutputs["plan-outline"] as
      | { raw: WritingTeamPlanOutput }
      | undefined;
    const draftOutput = result.stageOutputs["write-draft"] as
      | { artifact: WritingTeamDraftOutput }
      | undefined;
    const signoffOutput = result.stageOutputs["editor-signoff"] as
      | { signoff: WritingTeamSignoffOutput }
      | undefined;

    return {
      missionId,
      status,
      plan: planOutput?.raw,
      draft: draftOutput?.artifact,
      signoff: signoffOutput?.signoff,
      error: result.error,
    };
  }

  // ── helpers ────────────────────────────────────────────────────────────

  /**
   * 构造 PipelineConfig，每 step 嵌入 hooks 闭包；闭包从 ctx.input +
   * previousOutputs 取数据，并 delegate 到 this.hooks（setHooks 立即生效）。
   *
   * Note: ResolvedStageHooks 是 generic catch-all map（[hookName]: StageHookFn）；
   * primitive 内部 cast 回具体 hook 接口（参考 plan.primitive.ts hooks as
   * PlanStageHooks）。这里我们构造具体形态，向上 cast 给 generic config 类型。
   */
  private buildPipelineWithHooks(): MissionPipelineConfig {
    const planHooks = {
      runRole: async (args: { ctx: StageRunArgs["ctx"] }) => {
        const input = args.ctx.input as WritingTeamInput;
        return this.hooks.planOutline({ input });
      },
      extractPlanFields: (raw: unknown) => ({
        dimensions: (raw as WritingTeamPlanOutput).outline,
      }),
    };
    const draftHooks = {
      draftOnce: async (args: {
        ctx: StageRunArgs["ctx"];
        previousOutputs: StageRunArgs["previousOutputs"];
      }) => {
        const input = args.ctx.input as WritingTeamInput;
        const planResult = args.previousOutputs["plan-outline"] as
          | { raw: WritingTeamPlanOutput }
          | undefined;
        if (!planResult) {
          throw new Error(
            "[writing-team] write-draft 未拿到 plan-outline 输出（pipeline 顺序异常）",
          );
        }
        return this.hooks.draftFullText({ input, plan: planResult.raw });
      },
    };
    const signoffHooks = {
      runRole: async (args: {
        ctx: StageRunArgs["ctx"];
        previousOutputs: StageRunArgs["previousOutputs"];
      }) => {
        const input = args.ctx.input as WritingTeamInput;
        const draftResult = args.previousOutputs["write-draft"] as
          | { artifact: WritingTeamDraftOutput }
          | undefined;
        if (!draftResult) {
          throw new Error(
            "[writing-team] editor-signoff 未拿到 write-draft 输出（pipeline 顺序异常）",
          );
        }
        return this.hooks.editorSignoff({
          input,
          draft: draftResult.artifact,
        });
      },
    };

    const stepHooks: Record<string, ResolvedStageHooks> = {
      "plan-outline": planHooks as unknown as ResolvedStageHooks,
      "write-draft": draftHooks as unknown as ResolvedStageHooks,
      "editor-signoff": signoffHooks as unknown as ResolvedStageHooks,
    };

    return {
      ...WRITING_TEAM_PIPELINE,
      steps: WRITING_TEAM_PIPELINE.steps.map((s) => ({
        ...s,
        hooks: stepHooks[s.id] ?? {},
      })),
    };
  }
}
