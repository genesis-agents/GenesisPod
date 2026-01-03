/**
 * Slides Team Member - 团队成员基类
 *
 * 封装 Skill 调用，提供统一的执行接口
 */

import { Injectable, Logger } from "@nestjs/common";
import { SkillRegistry } from "@/modules/ai-engine/skills/registry/skill-registry";
import { AiChatLLMAdapter } from "@/modules/ai-engine/llm/adapters/ai-chat-llm-adapter";
import {
  SlidesTask,
  SlidesTeamMemberRole,
  SLIDES_TEAM_MEMBERS,
  SkillExecutionContext,
} from "./types";

export interface TaskExecutionResult {
  success: boolean;
  result?: unknown;
  error?: string;
  duration: number;
}

@Injectable()
export class SlidesTeamMember {
  private readonly logger = new Logger(SlidesTeamMember.name);

  constructor(
    private readonly skillRegistry: SkillRegistry,
    private readonly llmAdapter: AiChatLLMAdapter,
  ) {}

  /**
   * 执行任务
   */
  async executeTask(
    task: SlidesTask,
    context: SkillExecutionContext,
  ): Promise<TaskExecutionResult> {
    const startTime = Date.now();

    // ★ 安全处理：如果 skillId 包含逗号，只取第一个并规范化
    let skillId = task.skillId;
    if (skillId.includes(",")) {
      skillId = skillId.split(",")[0].trim();
      this.logger.warn(
        `[executeTask] Skill ID contained comma, normalized: "${task.skillId}" → "${skillId}"`,
      );
    }

    this.logger.log(
      `[executeTask] Executing task ${task.id}: ${task.title} with skill ${skillId}`,
    );

    try {
      // 获取 Skill (使用 tryGet 避免抛出异常)
      let skill = this.skillRegistry.tryGet(skillId);

      if (!skill) {
        this.logger.log(
          `[executeTask] Skill not found: ${skillId}, trying slides-prefixed version`,
        );

        // 尝试带 slides- 前缀
        skill = this.skillRegistry.tryGet(`slides-${skillId}`);
        if (!skill) {
          this.logger.error(
            `[executeTask] Skill not found with both IDs: ${skillId}, slides-${skillId}`,
          );
          return {
            success: false,
            error: `Skill not found: ${skillId}`,
            duration: Date.now() - startTime,
          };
        }
        this.logger.log(
          `[executeTask] Found skill with slides- prefix: slides-${skillId}`,
        );
      }

      const targetSkill = skill;

      if (!targetSkill) {
        return {
          success: false,
          error: `Skill not found: ${task.skillId}`,
          duration: Date.now() - startTime,
        };
      }

      // 设置 LLM 适配器
      if ("setLLMAdapter" in targetSkill) {
        (
          targetSkill as { setLLMAdapter: (adapter: unknown) => void }
        ).setLLMAdapter(this.llmAdapter);
      }

      // 构建 Skill 输入
      const skillInput = this.buildSkillInput(task, context);

      // 执行 Skill
      const skillResult = await targetSkill.execute(skillInput, {
        executionId: context.executionId,
        skillId: task.skillId,
        sessionId: context.sessionId,
        userId: "",
        createdAt: new Date(),
      });

      if (!skillResult.success) {
        return {
          success: false,
          error: skillResult.error?.message || "Skill execution failed",
          duration: Date.now() - startTime,
        };
      }

      this.logger.log(
        `[executeTask] Task ${task.id} completed successfully in ${Date.now() - startTime}ms`,
      );

      return {
        success: true,
        result: skillResult.data,
        duration: Date.now() - startTime,
      };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      this.logger.error(`[executeTask] Task ${task.id} failed: ${errorMsg}`);

      return {
        success: false,
        error: errorMsg,
        duration: Date.now() - startTime,
      };
    }
  }

  /**
   * 构建 Skill 输入
   *
   * 使用 AI Engine 统一规范的 SkillOutputManager 获取之前的输出
   */
  private buildSkillInput(
    task: SlidesTask,
    context: SkillExecutionContext,
  ): unknown {
    // 优先使用 outputManager（新规范），回退到 previousOutputs（兼容）
    const getOutput = <T>(skillId: string): T | undefined => {
      if (context.outputManager) {
        return context.outputManager.get<T>(skillId);
      }
      // 兼容旧的 previousOutputs
      return (context.previousOutputs[skillId] ||
        context.previousOutputs[`slides-${skillId}`]) as T | undefined;
    };

    // 基础输入
    const baseInput = {
      task: task.description,
      context: {
        input: task.input,
        sourceText: context.globalContext.sourceText,
        outline: context.globalContext.outline,
        themeId: context.globalContext.themeId,
        stylePreference: context.globalContext.stylePreference,
      },
      previousOutputs: context.previousOutputs,
    };

    // 根据 Skill ID 进行特殊处理
    switch (task.skillId) {
      case "task-decomposition":
      case "slides-task-decomposition":
        return {
          sourceText: context.globalContext.sourceText,
          userRequirement:
            (task.input as Record<string, unknown>)?.userRequirement || "",
          targetPages: (task.input as Record<string, unknown>)?.targetPages,
          stylePreference: context.globalContext.stylePreference || "dark",
          sessionId: context.sessionId,
          ...baseInput,
        };

      case "outline-planning":
      case "slides-outline-planning":
        // 使用 outputManager 获取任务分解结果（自动处理 Key 规范化）
        const taskDecomposition = getOutput("task-decomposition");
        return {
          taskDecomposition,
          sourceText: context.globalContext.sourceText,
          targetPages: (task.input as Record<string, unknown>)?.targetPages,
          stylePreference: context.globalContext.stylePreference,
          sessionId: context.sessionId,
          ...baseInput,
        };

      case "page-type-selection":
      case "slides-page-type-selection":
        const outline = getOutput<{ slides?: unknown[] }>("outline");
        return outline?.slides || [];

      case "four-step-design":
      case "slides-four-step-design":
        return {
          pageOutline: (task.input as Record<string, unknown>)?.pageOutline,
          pageContent: (task.input as Record<string, unknown>)?.pageContent,
          globalStyles:
            (task.input as Record<string, unknown>)?.globalStyles || {},
          sessionId: context.sessionId,
          ...baseInput,
        };

      case "page-pipeline":
      case "slides-page-pipeline":
        // 使用 outputManager 获取大纲（自动处理 Key 规范化）
        const outlineResult =
          getOutput("outline-planning") || context.globalContext.outline;

        // 诊断日志
        const outlinePages = (outlineResult as { pages?: unknown[] })?.pages;
        this.logger.log(
          `[buildSkillInput] page-pipeline: outline exists=${!!outlineResult}, pages=${outlinePages?.length || 0}, outputManager keys=${context.outputManager?.keys().join(", ") || "N/A"}`,
        );

        return {
          outline: outlineResult,
          sourceText: context.globalContext.sourceText,
          themeId: context.globalContext.themeId || "genspark-dark",
          stylePreference: context.globalContext.stylePreference || "dark",
          sessionId: context.sessionId,
          ...baseInput,
        };

      case "quality-audit":
      case "slides-quality-audit":
        return {
          pages: getOutput("pages") || [],
          ...baseInput,
        };

      case "terminology-unifier":
      case "slides-terminology-unifier":
        return {
          pages: getOutput("pages") || [],
          ...baseInput,
        };

      case "transition-checker":
      case "slides-transition-checker":
        return {
          pages: getOutput("pages") || [],
          sessionId: context.sessionId,
          ...baseInput,
        };

      default:
        return baseInput;
    }
  }

  /**
   * 获取成员信息
   */
  getMemberInfo(role: SlidesTeamMemberRole) {
    return SLIDES_TEAM_MEMBERS[role];
  }

  /**
   * 检查成员是否有指定技能
   */
  hasSkill(role: SlidesTeamMemberRole, skillId: string): boolean {
    const member = SLIDES_TEAM_MEMBERS[role];
    return (
      member.skills.includes(skillId) ||
      member.skills.includes(`slides-${skillId}`)
    );
  }
}
