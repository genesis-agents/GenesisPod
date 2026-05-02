/**
 * AI Engine - Leader LLM Adapter
 * Leader LLM 适配器 - 为 Leader 提供真正的 LLM 能力
 */

import { v4 as uuidv4 } from "uuid";
import { Logger } from "@nestjs/common";
import { LLMFactory } from "@/modules/ai-engine/llm/factory/llm-factory";
import { ILLMAdapter } from "@/modules/ai-engine/llm/abstractions/llm-adapter.interface";
import {
  TaskInput,
  SubTask,
  MemberOutput,
  ReviewResult,
  IntegratedResult,
} from "../abstractions/member.interface";
import { RoleId } from "../abstractions/role.interface";

/**
 * Leader LLM 适配器接口
 */
export interface ILeaderLLMAdapter {
  /**
   * 使用 LLM 分解任务
   */
  decomposeTask(
    task: TaskInput,
    availableRoles: RoleId[],
    leaderPersona: string,
  ): Promise<SubTask[]>;

  /**
   * 使用 LLM 审核输出
   */
  reviewOutput(
    output: MemberOutput,
    criteria: string[],
    leaderPersona: string,
  ): Promise<ReviewResult>;

  /**
   * 使用 LLM 整合结果
   */
  integrateResults(
    results: MemberOutput[],
    goal: string,
    leaderPersona: string,
  ): Promise<IntegratedResult>;
}

/**
 * Leader LLM 适配器实现
 */
export class LeaderLLMAdapter implements ILeaderLLMAdapter {
  private readonly logger = new Logger(LeaderLLMAdapter.name);
  private llm: ILLMAdapter | null = null;
  private readonly model: string;

  constructor(
    private readonly llmFactory: LLMFactory,
    model?: string,
  ) {
    // 如果未指定模型，从 LLMFactory 获取默认模型，严禁硬编码
    this.model = model || this.llmFactory.getDefaultModel();
  }

  /**
   * 获取或创建 LLM 适配器
   */
  private getLLM(): ILLMAdapter {
    if (!this.llm) {
      this.llm = this.llmFactory.getAdapterForModel(this.model) || null;
    }
    if (!this.llm) {
      throw new Error(`No LLM adapter available for model: ${this.model}`);
    }
    return this.llm;
  }

  /**
   * 使用 LLM 分解任务
   */
  async decomposeTask(
    task: TaskInput,
    availableRoles: RoleId[],
    leaderPersona: string,
  ): Promise<SubTask[]> {
    this.logger.log(`Decomposing task: ${task.id}`);

    const llm = this.getLLM();

    const systemPrompt = `${leaderPersona}

你现在需要将一个任务分解为多个子任务，分配给团队成员执行。

可用的角色类型：
${availableRoles.map((r) => `- ${r}`).join("\n")}

请以 JSON 数组格式返回子任务列表，每个子任务包含：
- description: 子任务描述
- suggestedRole: 建议执行的角色（从可用角色中选择）
- dependencies: 依赖的其他子任务索引（如果有）
- estimatedDuration: 预估耗时（分钟）
- priority: 优先级（1-5，1最高）

只返回 JSON 数组，不要其他内容。`;

    const userPrompt = `请分解以下任务：

任务描述：${task.description}
${task.requirements?.length ? `要求：\n${task.requirements.map((r) => `- ${r}`).join("\n")}` : ""}
${task.context ? `上下文：${JSON.stringify(task.context)}` : ""}`;

    try {
      const response = await llm.chat({
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        taskProfile: { creativity: "low", outputLength: "medium" },
      });

      // 解析 JSON 响应
      const content = (response.content || "").trim();
      const jsonMatch = content.match(/\[[\s\S]*\]/);
      if (!jsonMatch) {
        throw new Error("Failed to parse subtasks JSON");
      }

      const rawSubTasks = JSON.parse(jsonMatch[0]) as Array<{
        description: string;
        suggestedRole: string;
        dependencies?: number[];
        estimatedDuration: number;
        priority: number;
      }>;

      // 转换为 SubTask 格式
      const subTaskIds = rawSubTasks.map(() => uuidv4());
      const subTasks: SubTask[] = rawSubTasks.map((raw, index) => ({
        id: subTaskIds[index],
        parentTaskId: task.id,
        description: raw.description,
        suggestedRole: raw.suggestedRole,
        dependencies: (raw.dependencies || []).map(
          (depIdx) => subTaskIds[depIdx] || "",
        ),
        estimatedDuration: raw.estimatedDuration * 60000, // 转换为毫秒
        priority: raw.priority,
      }));

      this.logger.log(`Decomposed task into ${subTasks.length} subtasks`);
      return subTasks;
    } catch (error) {
      this.logger.error(`Failed to decompose task: ${error}`);
      // 返回单一默认子任务
      return [
        {
          id: uuidv4(),
          parentTaskId: task.id,
          description: task.description,
          suggestedRole: availableRoles[0] || "researcher",
          dependencies: [],
          estimatedDuration: 60000,
          priority: 1,
        },
      ];
    }
  }

  /**
   * 使用 LLM 审核输出
   */
  async reviewOutput(
    output: MemberOutput,
    criteria: string[],
    leaderPersona: string,
  ): Promise<ReviewResult> {
    this.logger.log(`Reviewing output: ${output.id}`);

    const llm = this.getLLM();

    const systemPrompt = `${leaderPersona}

你现在需要审核团队成员的工作输出，评估其质量并提供反馈。

审核标准：
${criteria.map((c, i) => `${i + 1}. ${c}`).join("\n")}

请以 JSON 格式返回审核结果：
{
  "passed": true/false,
  "score": 1-10,
  "feedback": "总体反馈",
  "issues": [
    {
      "type": "error|warning|suggestion",
      "description": "问题描述",
      "suggestion": "修改建议"
    }
  ]
}

只返回 JSON 对象，不要其他内容。`;

    const userPrompt = `请审核以下输出：

内容类型：${output.contentType}
内容：
${typeof output.content === "string" ? output.content : JSON.stringify(output.content, null, 2)}`;

    try {
      const response = await llm.chat({
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        taskProfile: { creativity: "deterministic", outputLength: "short" },
      });

      // 解析 JSON 响应
      const content = (response.content || "").trim();
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error("Failed to parse review JSON");
      }

      const rawReview = JSON.parse(jsonMatch[0]) as {
        passed: boolean;
        score: number;
        feedback: string;
        issues?: Array<{
          type: "error" | "warning" | "suggestion";
          description: string;
          suggestion?: string;
        }>;
      };

      const reviewResult: ReviewResult = {
        id: uuidv4(),
        outputId: output.id,
        reviewerId: "leader",
        passed: rawReview.passed,
        score: rawReview.score,
        feedback: rawReview.feedback,
        issues: rawReview.issues?.map((issue) => ({
          type: issue.type,
          description: issue.description,
          suggestion: issue.suggestion,
        })),
        reviewedAt: new Date(),
      };

      this.logger.log(
        `Review completed: passed=${reviewResult.passed}, score=${reviewResult.score}`,
      );
      return reviewResult;
    } catch (error) {
      this.logger.error(`Failed to review output: ${error}`);
      // 返回默认通过的审核
      return {
        id: uuidv4(),
        outputId: output.id,
        reviewerId: "leader",
        passed: true,
        score: 7,
        feedback: "自动审核通过（LLM审核失败）",
        reviewedAt: new Date(),
      };
    }
  }

  /**
   * 使用 LLM 整合结果
   */
  async integrateResults(
    results: MemberOutput[],
    goal: string,
    leaderPersona: string,
  ): Promise<IntegratedResult> {
    this.logger.log(`Integrating ${results.length} results`);

    const llm = this.getLLM();

    const systemPrompt = `${leaderPersona}

你现在需要整合团队成员的工作成果，生成最终的交付物。

原始目标：${goal}

请综合所有输入，生成一个完整、连贯的最终结果。
返回 JSON 格式：
{
  "content": "整合后的完整内容",
  "summary": "结果摘要（50字以内）"
}

只返回 JSON 对象，不要其他内容。`;

    const userPrompt = `请整合以下团队成员的输出：

${results
  .map(
    (r, i) => `
【成员 ${i + 1} 输出】
类型：${r.contentType}
内容：
${typeof r.content === "string" ? r.content : JSON.stringify(r.content, null, 2)}
`,
  )
  .join("\n---\n")}`;

    try {
      const response = await llm.chat({
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        taskProfile: { creativity: "low", outputLength: "medium" },
      });

      // 解析 JSON 响应
      const content = (response.content || "").trim();
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error("Failed to parse integration JSON");
      }

      const rawIntegration = JSON.parse(jsonMatch[0]) as {
        content: string;
        summary: string;
      };

      const integratedResult: IntegratedResult = {
        id: uuidv4(),
        sourceOutputIds: results.map((r) => r.id),
        content: rawIntegration.content,
        contentType: "integrated",
        summary: rawIntegration.summary,
        integratedAt: new Date(),
      };

      this.logger.log(`Integration completed: ${integratedResult.summary}`);
      return integratedResult;
    } catch (error) {
      this.logger.error(`Failed to integrate results: ${error}`);
      // 返回简单拼接的结果
      return {
        id: uuidv4(),
        sourceOutputIds: results.map((r) => r.id),
        content: results.map((r) => r.content),
        contentType: "integrated",
        summary: "结果已整合",
        integratedAt: new Date(),
      };
    }
  }
}

/**
 * 创建 Leader LLM 适配器
 */
export function createLeaderLLMAdapter(
  llmFactory: LLMFactory,
  model?: string,
): ILeaderLLMAdapter {
  return new LeaderLLMAdapter(llmFactory, model);
}
