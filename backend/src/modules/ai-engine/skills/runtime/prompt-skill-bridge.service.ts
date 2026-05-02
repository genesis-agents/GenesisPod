/**
 * AI Engine - Prompt Skill Bridge
 *
 * 将 SkillLoaderService 加载的 SKILL.md 定义桥接到 SkillRegistry。
 * - 只创建 PromptSkillAdapter (prompt 模式)
 * - code-based skills (已在 SkillRegistry 中) 自动优先
 * - SkillsMP 安装的 skills 通过此桥接自动进入执行管线
 */

import { Injectable, Logger, Inject } from "@nestjs/common";
import { SkillRegistry } from "../registry/skill-registry";
import { SkillLoaderService } from "../loader/skill-loader.service";
import { SkillPromptBuilder } from "../builder/skill-prompt-builder.service";
import { SkillContentService } from "../content/skill-content.service";
import { CHAT_PROVIDER_PORT, type IChatProvider } from "../../facade";
import { SkillMdDefinition } from "../types/skill-md.types";
import {
  PromptSkillAdapter,
  PromptSkillExecutionCallback,
} from "./prompt-skill-adapter";
import { ISkill } from "../abstractions/skill.interface";
import { PrismaService } from "@/common/prisma/prisma.service";

export interface BridgeRegistrationResult {
  registered: string[];
  skipped: string[];
  errors: Array<{ id: string; error: string }>;
}

@Injectable()
export class PromptSkillBridge {
  private readonly logger = new Logger(PromptSkillBridge.name);

  /** Execution metrics callback shared by all adapters */
  private executionCallback: PromptSkillExecutionCallback;

  constructor(
    private readonly skillRegistry: SkillRegistry,
    private readonly skillLoader: SkillLoaderService,
    private readonly promptBuilder: SkillPromptBuilder,
    private readonly prisma: PrismaService,
    private readonly skillContentService: SkillContentService,
    @Inject(CHAT_PROVIDER_PORT)
    private readonly facade: IChatProvider,
  ) {
    // Create a shared callback that logs execution to AIUsageLog + updates usage count
    this.executionCallback = (params) => {
      // Fire-and-forget: log to AIUsageLog
      void this.prisma.aIUsageLog
        .create({
          data: {
            capabilityType: "skill",
            capabilityId: params.skillId,
            success: params.success,
            duration: params.duration,
            errorCode: params.errorCode ?? null,
            modelUsed: params.modelUsed ?? null,
            skillVersion: params.skillVersion ?? null,
            inputTokens: params.inputTokens ?? null,
            outputTokens: params.outputTokens ?? null,
            domain: params.domain ?? null,
            userId: params.userId ?? null,
            tokensUsed:
              (params.inputTokens ?? 0) + (params.outputTokens ?? 0) || null,
          },
        })
        .catch((err: Error) =>
          this.logger.debug(`AIUsageLog write failed: ${err.message}`),
        );

      // Fire-and-forget: update usage count
      void this.skillContentService.recordUsage(params.skillId);
    };
  }

  /**
   * 注册指定域的所有 SKILL.md 为 PromptSkillAdapter
   * 已有 code-based skill 的 ID 自动跳过
   */
  async registerDomain(domain: string): Promise<BridgeRegistrationResult> {
    const skills = await this.skillLoader.loadLocalSkills(domain);
    return this.registerDefinitions(skills);
  }

  /**
   * 注册一批 SkillMdDefinition
   */
  registerDefinitions(
    definitions: SkillMdDefinition[],
  ): BridgeRegistrationResult {
    const result: BridgeRegistrationResult = {
      registered: [],
      skipped: [],
      errors: [],
    };

    for (const def of definitions) {
      const skillId = def.metadata.id;

      try {
        // Skip skills marked as 'provider' (have NestJS code implementation)
        if (def.metadata.executionMode === "provider") {
          result.skipped.push(skillId);
          continue;
        }

        // Skip if code-based skill already registered (code-based takes priority)
        const existing = this.skillRegistry.tryGet(skillId);
        if (existing && !this.isPromptAdapter(existing)) {
          this.logger.debug(`Skip "${skillId}": code-based skill exists`);
          result.skipped.push(skillId);
          continue;
        }

        // Skip if already registered as PromptSkillAdapter (avoid duplicate)
        if (existing && this.isPromptAdapter(existing)) {
          result.skipped.push(skillId);
          continue;
        }

        // Create PromptSkillAdapter and register
        const adapter = new PromptSkillAdapter(
          def,
          this.facade,
          this.promptBuilder,
          this.executionCallback,
        );
        this.skillRegistry.register(adapter);
        result.registered.push(skillId);
      } catch (error) {
        this.logger.error(
          `Failed to register "${skillId}": ${(error as Error).message}`,
        );
        result.errors.push({ id: skillId, error: (error as Error).message });
      }
    }

    this.logger.log(
      `[Bridge] registered=${result.registered.length}, ` +
        `skipped=${result.skipped.length}, errors=${result.errors.length}`,
    );
    return result;
  }

  private isPromptAdapter(skill: ISkill): boolean {
    return (skill as PromptSkillAdapter).isPromptSkillAdapter === true;
  }
}
