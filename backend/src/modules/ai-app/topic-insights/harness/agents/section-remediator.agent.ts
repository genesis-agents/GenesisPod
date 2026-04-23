/**
 * AG-12-SREM · SectionRemediator
 *
 * 基于 QGATE / SectionReview 的 issues，对单个 section 做修订。
 * Access matrix：rag-search 只读；严禁 TL-02-EVSAVE。
 */

import { Injectable, Optional } from "@nestjs/common";
import type { TaskProfile } from "@/modules/ai-engine/facade";
import { BaseAgentRunner } from "./base-agent-runner";
import { RemediatedSectionSchema, type RemediatedSection } from "./schemas";
import type { AccessToolId, AgentRunContext } from "./types";
import { LlmInvokerService } from "../llm";

export interface SectionRemediatorInput {
  readonly sectionId: string;
  readonly sectionTitle: string;
  readonly originalContent: string;
  readonly issues: ReadonlyArray<string>;
  readonly revisionInstructions: ReadonlyArray<string>;
  readonly targetWords: number;
}

@Injectable()
export class SectionRemediatorAgent extends BaseAgentRunner<
  SectionRemediatorInput,
  RemediatedSection
> {
  readonly id = "AG-12-SREM";
  readonly name = "Section Remediator";
  readonly tools: ReadonlyArray<AccessToolId> = ["rag-search"];
  readonly forbiddenTools: ReadonlyArray<AccessToolId> = ["TL-02-EVSAVE"];
  readonly outputSchema = RemediatedSectionSchema;
  protected readonly taskProfile: TaskProfile = {
    creativity: "medium",
    outputLength: "long",
  };

  constructor(@Optional() llmInvoker?: LlmInvokerService) {
    super(llmInvoker);
  }

  protected buildSystemPrompt(
    _ctx: AgentRunContext<SectionRemediatorInput>,
  ): string {
    return [
      "你是 section 修订员。基于 issues + revisionInstructions 修改原 section。",
      "约束：",
      "1. 保留原 section 的引用 [N]，不得删除或改编号",
      "2. 不创造新 evidence（只能基于原 content 的引用）",
      "3. resolvedIssues 列出你实际解决的问题编号",
      "4. wordCount 必须接近 targetWords（± 15%）",
      "",
      "严格 JSON 输出。",
    ].join("\n");
  }

  protected buildUserPrompt(
    ctx: AgentRunContext<SectionRemediatorInput>,
  ): string {
    const { input } = ctx;
    return [
      `sectionId: ${input.sectionId}`,
      `title: ${input.sectionTitle}`,
      `targetWords: ${input.targetWords}`,
      "",
      "issues:",
      ...input.issues.map((i, idx) => `  ${idx + 1}. ${i}`),
      "",
      "revisionInstructions:",
      ...input.revisionInstructions.map((i, idx) => `  ${idx + 1}. ${i}`),
      "",
      "originalContent:",
      input.originalContent.slice(0, 6000),
      "",
      "请输出 RemediatedSection JSON。",
    ].join("\n");
  }

  protected stubOutput(
    ctx: AgentRunContext<SectionRemediatorInput>,
  ): Promise<{ output: unknown; tokensUsed: number; costUsd: number }> {
    const { input } = ctx;
    const result: RemediatedSection = {
      sectionId: input.sectionId,
      newContent: input.originalContent + "\n\n（stub 修订：已处理 issues）",
      wordCount: input.originalContent.length + 30,
      resolvedIssues: input.issues.map((_, i) => String(i + 1)),
    };
    return Promise.resolve({ output: result, tokensUsed: 0, costUsd: 0 });
  }
}
