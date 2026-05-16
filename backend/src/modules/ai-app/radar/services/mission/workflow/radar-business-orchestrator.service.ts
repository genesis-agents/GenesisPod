/**
 * RadarBusinessOrchestrator —— stage hook 闭包工厂
 *
 * 9 个 step 全部走 persist primitive（hook name=persist，返回 void）。业务输出
 * 副作用写到 SessionEntry.ctx.state；dispatcher 在 mission 结束时从 ctx.state
 * 读 metrics + insightPayload / discoveryCandidates。
 *
 * SystemPrompt 加载：通过 SkillLoaderService.getSkillById('ai-radar.xxx') 拿
 * SKILL.md content（systemPrompt）。在 dispatcher.onModuleInit 时预加载 + cache
 * 到 stepId→prompt map。
 */
import { Injectable, Logger } from "@nestjs/common";
import type {
  ResolvedStageHooks,
  StageRunArgs,
} from "@/modules/ai-harness/facade";
import { SkillLoaderService } from "@/modules/ai-engine/facade";
import type {
  RadarMissionContext,
  RadarStageRunner,
} from "../stages/radar-stage-types";
import { RadarS1SourceResolveStage } from "../stages/s1-source-resolve.stage";
import { RadarS2CollectStage } from "../stages/s2-collect.stage";
import { RadarS3DedupeStage } from "../stages/s3-dedupe.stage";
import { RadarS4RelevanceStage } from "../stages/s4-relevance.stage";
import { RadarS5QualityStage } from "../stages/s5-quality.stage";
import { RadarS6EntityStage } from "../stages/s6-entity.stage";
import { RadarS7InsightStage } from "../stages/s7-insight.stage";
import { RadarS8PersistStage } from "../stages/s8-persist.stage";
import { RadarDiscoveryStage } from "../stages/radar-discovery.stage";

export type SessionLookup = (missionId: string) => RadarMissionContext;

/** stepId → SKILL.md skill id（必须与 SKILL.md frontmatter.id 完全一致） */
const STEP_TO_SKILL_ID: Record<string, string | null> = {
  "s1-source-resolve": null, // 无 LLM
  "s2-collect": null, // 无 LLM
  "s3-dedupe": null, // 无 LLM
  "s4-relevance": "ai-radar.relevance-judge",
  "s5-quality": "ai-radar.quality-rater",
  "s6-entity": "ai-radar.entity-extractor",
  "s7-insight": "ai-radar.signal-analyst",
  "s8-persist": null, // 无 LLM
  "s1-discover": "ai-radar.source-curator",
};

@Injectable()
export class RadarBusinessOrchestrator {
  private readonly log = new Logger(RadarBusinessOrchestrator.name);
  private sessionLookup: SessionLookup | null = null;
  private readonly promptCache = new Map<string, string>();

  constructor(
    private readonly skillLoader: SkillLoaderService,
    private readonly s1: RadarS1SourceResolveStage,
    private readonly s2: RadarS2CollectStage,
    private readonly s3: RadarS3DedupeStage,
    private readonly s4: RadarS4RelevanceStage,
    private readonly s5: RadarS5QualityStage,
    private readonly s6: RadarS6EntityStage,
    private readonly s7: RadarS7InsightStage,
    private readonly s8: RadarS8PersistStage,
    private readonly discovery: RadarDiscoveryStage,
  ) {}

  bindSessionLookup(lookup: SessionLookup): void {
    this.sessionLookup = lookup;
  }

  /**
   * 预加载所有 LLM step 的 systemPrompt（dispatcher 在 onModuleInit register
   * pipeline 之前调用）。SKILL.md 加载是 fs 同步，但 SkillLoaderService 自己
   * 是 OnApplicationBootstrap，所以等 module init 后再调用最安全。
   */
  async preloadSystemPrompts(): Promise<void> {
    for (const [stepId, skillId] of Object.entries(STEP_TO_SKILL_ID)) {
      if (!skillId) continue;
      const skill = await this.skillLoader.getSkillById(skillId);
      if (!skill) {
        this.log.warn(
          `[radar-business-orch] skill "${skillId}" not loaded (stepId=${stepId})`,
        );
        continue;
      }
      this.promptCache.set(stepId, skill.content);
    }
    this.log.log(
      `[radar-business-orch] preloaded ${this.promptCache.size} skill prompts`,
    );
  }

  /**
   * 给 stepId 构造 ResolvedStageHooks（persist primitive 期望 hooks.persist）。
   * 业务 output 副作用写到 ctx.state；hook return Promise<void>。
   */
  /**
   * 给 stepId 构造 ResolvedStageHooks（persist primitive 期望 hooks.persist 返回
   * Promise<void>）。ResolvedStageHooks 实际类型是 index signature
   * `[hookName: string]: StageHookFn | undefined`（见 ai-harness/.../stage-primitive.interface.ts:97），
   * 直接 satisfies 即可，无需 `as unknown as` lying assertion。
   */
  buildHooksForStep(stepId: string): ResolvedStageHooks {
    const runner = this.resolveStageRunner(stepId);
    if (!runner) {
      const hooks: ResolvedStageHooks = {
        persist: async (): Promise<void> => undefined,
      };
      return hooks;
    }
    const systemPrompt = this.promptCache.get(stepId) ?? "";
    const lookup = this.sessionLookup;
    const hooks: ResolvedStageHooks = {
      persist: async (args): Promise<void> => {
        if (!lookup) {
          throw new Error(
            "RadarBusinessOrchestrator.sessionLookup not bound (dispatcher onModuleInit 顺序错)",
          );
        }
        const stageArgs = args as {
          ctx: StageRunArgs["ctx"];
          previousOutputs: StageRunArgs["previousOutputs"];
          crossStageState: StageRunArgs["crossStageState"];
        };
        const ctx = lookup(stageArgs.ctx.missionId);
        await runner.run(
          {
            ctx: stageArgs.ctx,
            previousOutputs: stageArgs.previousOutputs,
            crossStageState: stageArgs.crossStageState,
            systemPrompt,
          },
          ctx,
        );
      },
    };
    return hooks;
  }

  private resolveStageRunner(stepId: string): RadarStageRunner | null {
    switch (stepId) {
      case "s1-source-resolve":
        return this.s1;
      case "s2-collect":
        return this.s2;
      case "s3-dedupe":
        return this.s3;
      case "s4-relevance":
        return this.s4;
      case "s5-quality":
        return this.s5;
      case "s6-entity":
        return this.s6;
      case "s7-insight":
        return this.s7;
      case "s8-persist":
        return this.s8;
      case "s1-discover":
        return this.discovery;
      default:
        this.log.warn(`No stage runner for step "${stepId}"`);
        return null;
    }
  }
}
