/**
 * AI Engine - Prompt Skill Adapter
 *
 * 将 SKILL.md 定义转为 ISkill 实例。
 * 执行逻辑: SKILL.md body → System Prompt → LLM → 解析 JSON → SkillResult
 *
 * 适用于所有 prompt 型 skills (Slides 15 个, SkillsMP 安装的, 社区贡献的)
 */

import { Logger } from "@nestjs/common";
import {
  ISkill,
  SkillContext,
  SkillResult,
  SkillLayer,
  JsonSchema,
} from "../abstractions/skill.interface";
import { SkillMdDefinition, SkillInputBinding } from "../types/skill-md.types";
import type { IChatProvider } from "../../facade";
import { SkillPromptBuilder } from "../builder/skill-prompt-builder.service";

/** Callback for recording execution metrics after each run */
export interface PromptSkillExecutionCallback {
  (params: {
    skillId: string;
    success: boolean;
    duration: number;
    errorCode?: string;
    modelUsed?: string;
    skillVersion?: string;
    inputTokens?: number;
    outputTokens?: number;
    domain?: string;
    userId?: string;
  }): void;
}

export class PromptSkillAdapter implements ISkill<unknown, unknown> {
  private readonly logger: Logger;

  // ========== ISkill metadata ==========
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly layer: SkillLayer;
  readonly domain: string;
  readonly tags?: string[];
  readonly version?: string;
  readonly outputKey?: string;
  readonly requiredSkills?: string[];
  readonly requiredTools?: string[];
  readonly inputSchema?: JsonSchema;
  readonly outputSchema?: JsonSchema;

  /** Marker: this is a SKILL.md adapter, not a code-based skill */
  readonly isPromptSkillAdapter = true;

  /**
   * Get declarative input bindings from SKILL.md frontmatter.
   * Used by InputBindingResolver to auto-resolve inputs.
   */
  getInputBindings(): Record<string, SkillInputBinding> | undefined {
    return this.definition.metadata.inputs;
  }

  /**
   * Get the raw prompt content from the underlying SKILL.md definition.
   * Used by admin UI to display/edit prompt content.
   */
  getPromptContent(): string {
    return this.definition.content;
  }

  /**
   * Get the underlying SKILL.md definition metadata.
   * Used by admin UI to display frontmatter.
   */
  getDefinitionMetadata(): SkillMdDefinition["metadata"] {
    return this.definition.metadata;
  }

  constructor(
    private readonly definition: SkillMdDefinition,
    private readonly facade: IChatProvider,
    private readonly promptBuilder: SkillPromptBuilder,
    private readonly onExecutionComplete?: PromptSkillExecutionCallback,
  ) {
    const fm = definition.metadata;
    this.id = fm.id;
    this.name = fm.name;
    this.description = fm.description;
    this.layer = fm.layer ?? "content";
    this.domain = fm.domain;
    this.tags = fm.tags;
    this.version = fm.version;
    this.outputKey = fm.outputKey ?? fm.id;
    this.requiredSkills = fm.requiredSkills;
    this.requiredTools = fm.requiredTools;
    this.inputSchema = fm.inputSchema as JsonSchema | undefined;
    this.outputSchema = fm.outputSchema as JsonSchema | undefined;
    this.logger = new Logger(`PromptSkill:${fm.id}`);
  }

  async execute(
    input: unknown,
    context: SkillContext,
  ): Promise<SkillResult<unknown>> {
    const startTime = Date.now();
    const fm = this.definition.metadata;

    try {
      // 1. Build system prompt (SKILL.md body + variable substitution)
      const buildResult = this.promptBuilder.buildSystemPrompt(
        [this.definition],
        {
          context: input as Record<string, unknown>,
          maxTokens: fm.tokenBudget ?? 4000,
        },
      );

      // 2. Serialize input as user message
      const userMessage =
        typeof input === "string" ? input : JSON.stringify(input, null, 2);

      // 3. Call LLM via AIEngineFacade
      const taskProfile = fm.taskProfile ?? {
        creativity: "medium",
        outputLength: "medium",
      };
      const response = await this.facade.chat({
        messages: [
          { role: "system", content: buildResult.prompt },
          { role: "user", content: userMessage },
        ],
        taskProfile,
      });

      // 4. Always try JSON extraction (extractJson has safe fallback to raw content)
      // Most prompt skills expect JSON output; extractJson returns raw content
      // if no valid JSON is found, so this is safe for text-based skills too.
      const data = this.extractJson(response.content);

      const duration = Date.now() - startTime;

      // 5. Fire-and-forget execution metrics callback
      if (this.onExecutionComplete) {
        this.onExecutionComplete({
          skillId: this.id,
          success: true,
          duration,
          modelUsed: response.model || undefined,
          skillVersion: fm.version,
          inputTokens: response.tokensUsed
            ? Math.ceil(response.tokensUsed * 0.7)
            : undefined,
          outputTokens: response.tokensUsed
            ? Math.ceil(response.tokensUsed * 0.3)
            : undefined,
          domain: fm.domain,
          userId: context.userId,
        });
      }

      return {
        success: true,
        data,
        metadata: {
          executionId: context.executionId,
          startTime: new Date(startTime),
          endTime: new Date(),
          duration,
          tokensUsed: response.tokensUsed,
        },
      };
    } catch (error) {
      const duration = Date.now() - startTime;
      this.logger.error(`Execution failed: ${(error as Error).message}`);

      // Fire-and-forget execution metrics callback
      if (this.onExecutionComplete) {
        this.onExecutionComplete({
          skillId: this.id,
          success: false,
          duration,
          errorCode: "PROMPT_SKILL_FAILED",
          skillVersion: fm.version,
          domain: fm.domain,
          userId: context.userId,
        });
      }

      return {
        success: false,
        error: {
          code: "PROMPT_SKILL_FAILED",
          message: (error as Error).message,
          retryable: true,
        },
        metadata: {
          executionId: context.executionId,
          startTime: new Date(startTime),
          endTime: new Date(),
          duration,
        },
      };
    }
  }

  /**
   * Extract JSON from LLM response
   * Supports: pure JSON / markdown code block / mixed text / truncated JSON
   */
  private extractJson(content: string): unknown {
    // Attempt 1: markdown code block
    const codeBlockMatch = content.match(/```(?:json)?\s*\n([\s\S]*?)\n```/);
    if (codeBlockMatch) {
      try {
        return JSON.parse(codeBlockMatch[1].trim());
      } catch {
        /* continue */
      }
    }

    // Attempt 2: direct parse
    try {
      return JSON.parse(content.trim());
    } catch {
      /* continue */
    }

    // Attempt 3: find outermost { } or [ ]
    const braceMatch = content.match(/(\{[\s\S]*\}|\[[\s\S]*\])/);
    if (braceMatch) {
      try {
        return JSON.parse(braceMatch[1]);
      } catch {
        /* continue */
      }
    }

    // Attempt 4: repair truncated JSON (LLM output cut off)
    const repaired = this.repairTruncatedJson(content);
    if (repaired) return repaired;

    // Fallback: return raw content
    this.logger.warn(`JSON extraction failed, returning raw content`);
    return content;
  }

  /**
   * Repair truncated JSON by completing missing brackets
   */
  private repairTruncatedJson(content: string): unknown {
    const jsonStart = content.indexOf("{");
    if (jsonStart === -1) return null;

    let jsonStr = content.slice(jsonStart);
    const openBraces = (jsonStr.match(/{/g) ?? []).length;
    const closeBraces = (jsonStr.match(/}/g) ?? []).length;
    const openBrackets = (jsonStr.match(/\[/g) ?? []).length;
    const closeBrackets = (jsonStr.match(/]/g) ?? []).length;

    jsonStr += "]".repeat(Math.max(0, openBrackets - closeBrackets));
    jsonStr += "}".repeat(Math.max(0, openBraces - closeBraces));

    try {
      return JSON.parse(jsonStr);
    } catch {
      return null;
    }
  }
}
