/**
 * AI Coding Agent 执行服务
 *
 * 负责：
 * 1. Leader Agent 看护整个软件工程流程
 * 2. 真实的 AI 调用执行任务
 * 3. 输出验证和质量检查
 * 4. 错误处理和重试机制
 * 5. 任务执行协调
 */

import { Injectable, Logger } from "@nestjs/common";
import { AiChatService, ChatMessage } from "../../ai-core/ai-chat.service";
import { CodingTeamService, DefaultAIModel } from "./coding-team.service";
import {
  CodingMissionService,
  TaskBreakdownResult,
} from "./coding-mission.service";
import {
  CodingAgentTask,
  CodingAgentMemberStatus,
  CodingTaskType,
  CodingAgentRole,
  CodingMessageType,
  CodingTeamMember,
} from "@prisma/client";
import { TASK_PROMPTS, TASK_BREAKDOWN_PROMPT } from "../constants/task-prompts";

/**
 * Agent 执行结果
 */
export interface AgentExecutionResult {
  success: boolean;
  output?: Record<string, unknown>;
  error?: string;
  rawContent?: string;
  tokensUsed?: number;
}

/**
 * Leader 审查结果
 */
export interface LeaderReviewResult {
  approved: boolean;
  feedback: string;
  issues: string[];
  suggestions: string[];
}

/**
 * 任务执行上下文
 */
export interface TaskExecutionContext {
  projectId: string;
  missionId: string;
  task: CodingAgentTask;
  member: CodingTeamMember;
  aiModel: DefaultAIModel;
  previousOutputs: Record<string, unknown>;
}

@Injectable()
export class CodingAgentService {
  private readonly logger = new Logger(CodingAgentService.name);

  // 最大重试次数
  private readonly MAX_RETRIES = 3;

  constructor(
    private readonly aiChatService: AiChatService,
    private readonly teamService: CodingTeamService,
    private readonly missionService: CodingMissionService,
  ) {}

  /**
   * 执行任务分解（由 Leader/PM 执行）
   */
  async executeTaskBreakdown(
    projectId: string,
    _missionId: string, // Prefixed with _ to indicate intentionally unused
    requirement: string,
    techStack: Record<string, string>,
  ): Promise<TaskBreakdownResult> {
    this.logger.log(`[${projectId}] Leader executing task breakdown...`);

    // 获取 Leader（PM）
    const leader = await this.teamService.getLeader(projectId);
    if (!leader) {
      throw new Error("Team not initialized or Leader not found");
    }

    // 更新 Leader 状态
    await this.teamService.updateMemberStatus(
      leader.id,
      CodingAgentMemberStatus.WORKING,
      { currentTask: "任务分解" },
    );

    // 发送消息
    await this.teamService.sendMessage({
      projectId,
      senderId: leader.id,
      senderRole: leader.agentRole,
      content: "开始分析需求并分解任务...",
      messageType: CodingMessageType.THINKING,
    });

    try {
      // 获取 Leader 的 AI 模型
      const aiModel = await this.teamService.getMemberAIModel(leader.id);
      if (!aiModel) {
        throw new Error("Leader AI model not configured");
      }

      // 构建提示词
      const systemPrompt = `${leader.systemPrompt}\n\n${TASK_BREAKDOWN_PROMPT}`;
      const userMessage = `
需求描述：
${requirement}

技术栈：
${JSON.stringify(techStack, null, 2)}

请分析需求，输出任务分解 JSON。`;

      // 调用 AI
      const result = await this.callAI(aiModel, systemPrompt, userMessage);

      // 解析结果
      const breakdown = this.parseTaskBreakdown(result.content);

      // 发送结果消息
      await this.teamService.sendMessage({
        projectId,
        senderId: leader.id,
        senderRole: leader.agentRole,
        content: `任务分解完成：
- 理解：${breakdown.understanding}
- 任务数：${breakdown.tasks.length}
- 执行计划：${breakdown.executionPlan}`,
        messageType: CodingMessageType.OUTPUT,
        metadata: { breakdown },
      });

      // 更新 Leader 状态
      await this.teamService.updateMemberStatus(
        leader.id,
        CodingAgentMemberStatus.IDLE,
      );
      await this.teamService.incrementTasksCompleted(leader.id);

      return breakdown;
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);

      await this.teamService.updateMemberStatus(
        leader.id,
        CodingAgentMemberStatus.ERROR,
        { lastError: errorMessage },
      );

      await this.teamService.sendMessage({
        projectId,
        senderId: leader.id,
        senderRole: leader.agentRole,
        content: `任务分解失败：${errorMessage}`,
        messageType: CodingMessageType.ERROR,
      });

      throw error;
    }
  }

  /**
   * 执行单个任务
   */
  async executeTask(
    context: TaskExecutionContext,
  ): Promise<AgentExecutionResult> {
    const { projectId, task, member, aiModel, previousOutputs } = context;

    this.logger.log(
      `[${projectId}] Executing task: ${task.id} (${task.taskType}) by ${member.agentRole}`,
    );

    // 更新成员状态
    await this.teamService.updateMemberStatus(
      member.id,
      CodingAgentMemberStatus.WORKING,
      { currentTask: task.title },
    );

    // 发送开始消息
    await this.teamService.sendMessage({
      projectId,
      senderId: member.id,
      senderRole: member.agentRole,
      content: `开始执行：${task.title}`,
      messageType: CodingMessageType.THINKING,
    });

    // 更新任务状态
    await this.missionService.startTask(task.id);

    try {
      // 获取任务类型的提示词配置
      const promptConfig = TASK_PROMPTS[task.taskType];
      if (!promptConfig) {
        throw new Error(`Unknown task type: ${task.taskType}`);
      }

      // 构建系统提示词
      const systemPrompt = `${member.systemPrompt}

${promptConfig.systemPromptAddition}

请按以下格式输出：
${promptConfig.outputFormat}`;

      // 构建用户消息
      const userMessage = this.buildTaskUserMessage(task, previousOutputs);

      // 调用 AI
      const result = await this.callAI(aiModel, systemPrompt, userMessage);

      // 解析和验证输出
      const output = this.parseTaskOutput(
        result.content,
        task.taskType,
        promptConfig.validationRules,
      );

      // 发送成功消息
      await this.teamService.sendMessage({
        projectId,
        senderId: member.id,
        senderRole: member.agentRole,
        content: `任务完成：${task.title}`,
        messageType: CodingMessageType.OUTPUT,
        metadata: { output, tokensUsed: result.tokensUsed },
      });

      // 更新成员状态
      await this.teamService.updateMemberStatus(
        member.id,
        CodingAgentMemberStatus.IDLE,
      );
      await this.teamService.incrementTasksCompleted(member.id);

      return {
        success: true,
        output,
        rawContent: result.content,
        tokensUsed: result.tokensUsed,
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);

      // 更新成员状态
      await this.teamService.updateMemberStatus(
        member.id,
        CodingAgentMemberStatus.ERROR,
        { lastError: errorMessage },
      );

      // 发送错误消息
      await this.teamService.sendMessage({
        projectId,
        senderId: member.id,
        senderRole: member.agentRole,
        content: `任务执行失败：${errorMessage}`,
        messageType: CodingMessageType.ERROR,
      });

      return {
        success: false,
        error: errorMessage,
      };
    }
  }

  /**
   * Leader 审查任务产出
   */
  async leaderReviewTask(
    projectId: string,
    task: CodingAgentTask,
    output: Record<string, unknown>,
  ): Promise<LeaderReviewResult> {
    this.logger.log(`[${projectId}] Leader reviewing task: ${task.id}`);

    const leader = await this.teamService.getLeader(projectId);
    if (!leader) {
      throw new Error("Leader not found");
    }

    // 更新 Leader 状态
    await this.teamService.updateMemberStatus(
      leader.id,
      CodingAgentMemberStatus.WORKING,
      { currentTask: `审查: ${task.title}` },
    );

    try {
      const aiModel = await this.teamService.getMemberAIModel(leader.id);
      if (!aiModel) {
        throw new Error("Leader AI model not configured");
      }

      const promptConfig = TASK_PROMPTS[task.taskType];
      const reviewSystemPrompt = `${leader.systemPrompt}

你现在需要审查团队成员的产出。

审查标准：
${promptConfig.validationRules.join("\n")}

请评估以下内容：
1. 是否完整满足任务要求
2. 是否有明显的错误或遗漏
3. 质量是否达到标准
4. 是否需要修改

输出 JSON 格式：
{
  "approved": true/false,
  "feedback": "反馈意见",
  "issues": ["问题1", "问题2"],
  "suggestions": ["建议1", "建议2"]
}`;

      const userMessage = `
任务：${task.title}
描述：${task.description}
类型：${task.taskType}

产出：
${JSON.stringify(output, null, 2)}

请审查并给出评估。`;

      const result = await this.callAI(
        aiModel,
        reviewSystemPrompt,
        userMessage,
      );
      const review = this.parseReviewResult(result.content);

      // 发送审查结果消息
      await this.teamService.sendMessage({
        projectId,
        senderId: leader.id,
        senderRole: leader.agentRole,
        content: review.approved
          ? `审查通过：${task.title}\n${review.feedback}`
          : `需要修改：${task.title}\n问题：${review.issues.join(", ")}`,
        messageType: review.approved
          ? CodingMessageType.APPROVAL
          : CodingMessageType.FEEDBACK,
        metadata: { review },
      });

      // 更新 Leader 状态
      await this.teamService.updateMemberStatus(
        leader.id,
        CodingAgentMemberStatus.IDLE,
      );

      return review;
    } catch (error) {
      await this.teamService.updateMemberStatus(
        leader.id,
        CodingAgentMemberStatus.IDLE,
      );
      throw error;
    }
  }

  /**
   * 执行完整的 Mission（由 Leader 协调）
   */
  async executeMission(
    projectId: string,
    missionId: string,
    onProgress?: (progress: number, message: string) => void,
  ): Promise<void> {
    this.logger.log(`[${projectId}] Starting mission execution: ${missionId}`);

    // 更新 Mission 状态
    await this.missionService.updateMissionStatus(
      missionId,
      "IN_PROGRESS" as any,
    );

    // 发送系统消息
    await this.teamService.broadcastSystemMessage(
      projectId,
      "Mission 开始执行，Leader 开始协调任务...",
    );

    const previousOutputs: Record<string, unknown> = {};
    let completedCount = 0;

    try {
      // 循环执行任务直到完成
      while (true) {
        // 获取下一个可执行的任务
        const nextTask =
          await this.missionService.getNextExecutableTask(missionId);

        if (!nextTask) {
          // 检查是否所有任务都完成
          const progress =
            await this.missionService.getMissionProgress(missionId);
          if (progress.pending === 0 && progress.inProgress === 0) {
            this.logger.log(`[${projectId}] Mission completed!`);
            break;
          }
          // 等待其他任务完成
          await this.delay(1000);
          continue;
        }

        // 获取负责此任务的团队成员
        if (!nextTask.assigneeRole) {
          throw new Error(`Task ${nextTask.id} has no assignee role`);
        }

        const member = await this.teamService.getMemberByRole(
          projectId,
          nextTask.assigneeRole,
        );

        if (!member) {
          throw new Error(
            `No team member found for role: ${nextTask.assigneeRole}`,
          );
        }

        // 获取成员的 AI 模型
        const aiModel = await this.teamService.getMemberAIModel(member.id);
        if (!aiModel) {
          throw new Error(`AI model not configured for member: ${member.id}`);
        }

        // 执行任务
        const context: TaskExecutionContext = {
          projectId,
          missionId,
          task: nextTask,
          member,
          aiModel,
          previousOutputs,
        };

        const result = await this.executeTask(context);

        if (!result.success) {
          // 任务失败，尝试重试
          const retryCount = (nextTask.retryCount || 0) + 1;

          if (retryCount <= this.MAX_RETRIES) {
            this.logger.warn(
              `[${projectId}] Task failed, retrying (${retryCount}/${this.MAX_RETRIES})`,
            );
            await this.missionService.retryTask(nextTask.id);

            // 发送重试消息
            await this.teamService.broadcastSystemMessage(
              projectId,
              `任务 "${nextTask.title}" 失败，正在重试 (${retryCount}/${this.MAX_RETRIES})...`,
            );

            continue;
          } else {
            // 重试次数用尽，任务失败
            await this.missionService.failTask(
              nextTask.id,
              result.error || "Unknown error",
            );
            throw new Error(
              `Task failed after ${this.MAX_RETRIES} retries: ${result.error}`,
            );
          }
        }

        // 任务成功
        if (result.output) {
          // Leader 审查（可选，根据任务类型决定）
          const needsReview = this.shouldLeaderReview(nextTask.taskType);

          if (needsReview) {
            const review = await this.leaderReviewTask(
              projectId,
              nextTask,
              result.output,
            );

            if (!review.approved) {
              // 审查不通过，需要重做
              await this.missionService.retryTask(nextTask.id);

              // 发送反馈消息
              await this.teamService.sendMessage({
                projectId,
                senderRole: CodingAgentRole.PM,
                content: `任务 "${nextTask.title}" 需要修改：${review.feedback}`,
                messageType: CodingMessageType.FEEDBACK,
              });

              continue;
            }
          }

          // 保存输出
          previousOutputs[nextTask.taskType] = result.output;
          await this.missionService.completeTask(nextTask.id, result.output);
        }

        completedCount++;

        // 报告进度
        const progress =
          await this.missionService.getMissionProgress(missionId);
        if (onProgress) {
          onProgress(progress.progress, `完成任务: ${nextTask.title}`);
        }
      }

      // Mission 完成
      await this.teamService.broadcastSystemMessage(
        projectId,
        `Mission 执行完成！共完成 ${completedCount} 个任务。`,
      );
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);

      await this.teamService.broadcastSystemMessage(
        projectId,
        `Mission 执行失败：${errorMessage}`,
        { error: errorMessage },
      );

      await this.missionService.updateMissionStatus(missionId, "FAILED" as any);
      throw error;
    }
  }

  /**
   * 调用 AI 服务
   */
  private async callAI(
    model: DefaultAIModel,
    systemPrompt: string,
    userMessage: string,
  ): Promise<{ content: string; tokensUsed: number }> {
    if (!model.apiKey) {
      throw new Error(`API Key not configured for model: ${model.displayName}`);
    }

    const messages: ChatMessage[] = [{ role: "user", content: userMessage }];

    const result = await this.aiChatService.generateChatCompletionWithKey({
      provider: model.provider,
      modelId: model.modelId,
      apiKey: model.apiKey,
      apiEndpoint: model.apiEndpoint ?? undefined,
      systemPrompt,
      messages,
      maxTokens: 8192,
      temperature: 0.7,
    });

    return {
      content: result.content,
      tokensUsed: result.tokensUsed,
    };
  }

  /**
   * 构建任务用户消息
   */
  private buildTaskUserMessage(
    task: CodingAgentTask,
    previousOutputs: Record<string, unknown>,
  ): string {
    let message = `任务：${task.title}\n描述：${task.description}\n\n`;

    // 添加相关的前置输出
    const input = task.input as Record<string, unknown> | null;

    if (previousOutputs.PRD) {
      message += `PRD 文档：\n${JSON.stringify(previousOutputs.PRD, null, 2)}\n\n`;
    }

    if (previousOutputs.ARCHITECTURE && task.taskType !== CodingTaskType.PRD) {
      message += `架构设计：\n${JSON.stringify(previousOutputs.ARCHITECTURE, null, 2)}\n\n`;
    }

    if (
      previousOutputs.TASK_BREAKDOWN &&
      (task.taskType === CodingTaskType.CODE ||
        task.taskType === CodingTaskType.TEST)
    ) {
      message += `任务列表：\n${JSON.stringify(previousOutputs.TASK_BREAKDOWN, null, 2)}\n\n`;
    }

    if (previousOutputs.CODE && task.taskType === CodingTaskType.TEST) {
      message += `代码文件：\n${JSON.stringify(previousOutputs.CODE, null, 2)}\n\n`;
    }

    if (input) {
      message += `输入参数：\n${JSON.stringify(input, null, 2)}\n\n`;
    }

    message += "请执行任务并按要求格式输出。";

    return message;
  }

  /**
   * 解析任务分解结果
   */
  private parseTaskBreakdown(content: string): TaskBreakdownResult {
    try {
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        return {
          understanding: parsed.understanding || "",
          tasks: parsed.tasks || [],
          executionPlan: parsed.executionPlan || "",
          risks: parsed.risks || [],
        };
      }
    } catch (e) {
      this.logger.warn("Failed to parse task breakdown as JSON");
    }

    // Fallback：创建默认的任务分解
    return {
      understanding: content.slice(0, 200),
      tasks: [
        {
          title: "编写 PRD",
          description: "根据需求编写产品需求文档",
          taskType: CodingTaskType.PRD,
          assigneeRole: CodingAgentRole.PM,
          priority: 2,
          dependsOn: [],
        },
        {
          title: "系统架构设计",
          description: "设计系统架构和技术方案",
          taskType: CodingTaskType.ARCHITECTURE,
          assigneeRole: CodingAgentRole.ARCHITECT,
          priority: 2,
          dependsOn: ["task_0"],
        },
        {
          title: "任务拆分",
          description: "将设计拆分为具体开发任务",
          taskType: CodingTaskType.TASK_BREAKDOWN,
          assigneeRole: CodingAgentRole.PM_LEAD,
          priority: 1,
          dependsOn: ["task_1"],
        },
        {
          title: "代码实现",
          description: "实现功能代码",
          taskType: CodingTaskType.CODE,
          assigneeRole: CodingAgentRole.ENGINEER,
          priority: 1,
          dependsOn: ["task_2"],
        },
        {
          title: "测试",
          description: "编写测试用例",
          taskType: CodingTaskType.TEST,
          assigneeRole: CodingAgentRole.QA,
          priority: 0,
          dependsOn: ["task_3"],
        },
      ],
      executionPlan: "按顺序执行：PRD -> 架构 -> 任务拆分 -> 代码 -> 测试",
      risks: ["需求可能不够清晰"],
    };
  }

  /**
   * 解析任务输出
   */
  private parseTaskOutput(
    content: string,
    taskType: CodingTaskType,
    validationRules: string[],
  ): Record<string, unknown> {
    let output: Record<string, unknown> = {};

    try {
      // 尝试解析 JSON
      const jsonMatch = content.match(/[\[{][\s\S]*[\]}]/);
      if (jsonMatch) {
        output = JSON.parse(jsonMatch[0]);

        // 如果是数组，包装为对象
        if (Array.isArray(output)) {
          output = { items: output };
        }
      } else {
        // 非 JSON 输出，保存原始内容
        output = { content };
      }
    } catch (e) {
      this.logger.warn(
        `Failed to parse task output as JSON for ${taskType}, using raw content`,
      );
      output = { content, parseError: true };
    }

    // 验证输出
    const validationErrors = this.validateOutput(output, validationRules);
    if (validationErrors.length > 0) {
      this.logger.warn(
        `Output validation warnings: ${validationErrors.join(", ")}`,
      );
      output._validationWarnings = validationErrors;
    }

    return output;
  }

  /**
   * 验证输出
   */
  private validateOutput(
    output: Record<string, unknown>,
    rules: string[],
  ): string[] {
    const errors: string[] = [];

    for (const rule of rules) {
      const ruleLower = rule.toLowerCase();

      if (ruleLower.includes("必须存在") || ruleLower.includes("必须是")) {
        // 解析字段名
        const fieldMatch = rule.match(/^(\w+)/);
        if (fieldMatch) {
          const field = fieldMatch[1];
          if (
            !(field in output) ||
            output[field] === null ||
            output[field] === undefined
          ) {
            errors.push(`字段 ${field} 缺失`);
          }
        }
      }

      if (ruleLower.includes("不能包含错误")) {
        const content = JSON.stringify(output);
        if (
          content.includes("错误") ||
          content.includes("error") ||
          content.includes("failed")
        ) {
          errors.push("输出可能包含错误信息");
        }
      }
    }

    return errors;
  }

  /**
   * 解析 Leader 审查结果
   */
  private parseReviewResult(content: string): LeaderReviewResult {
    try {
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        return {
          approved: Boolean(parsed.approved),
          feedback: parsed.feedback || "",
          issues: parsed.issues || [],
          suggestions: parsed.suggestions || [],
        };
      }
    } catch (e) {
      this.logger.warn("Failed to parse review result as JSON");
    }

    // Fallback：默认通过
    return {
      approved: true,
      feedback: content.slice(0, 200),
      issues: [],
      suggestions: [],
    };
  }

  /**
   * 判断任务是否需要 Leader 审查
   */
  private shouldLeaderReview(taskType: CodingTaskType): boolean {
    // PRD 和 ARCHITECTURE 需要审查
    return (
      taskType === CodingTaskType.PRD ||
      taskType === CodingTaskType.ARCHITECTURE
    );
  }

  /**
   * 延迟
   */
  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
