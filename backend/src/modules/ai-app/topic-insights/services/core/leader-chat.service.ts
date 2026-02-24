/**
 * Leader Chat Service
 *
 * 负责用户交互相关功能：
 * - 处理用户消息（handleUserMessage）
 * - 解码用户输入（decodeUserInput）
 * - 选择任务Agent（selectAgentForTask）
 * - 获取决策历史（getDecisionHistory）
 */

import { Injectable, Logger, forwardRef, Inject } from "@nestjs/common";
import { PrismaService } from "@/common/prisma/prisma.service";
import { AIEngineFacade } from "@/modules/ai-engine/facade";
import { UserIntent } from "@/modules/ai-engine/facade";
import { LeaderDecisionType, ResearchTaskStatus } from "@prisma/client";
import { ResearchEventEmitterService } from "./research-event-emitter.service";
import { sanitize } from "../../utils/prompt-sanitizer";
import { toPrismaJson } from "@/common/utils/prisma-json.utils";
import { extractJsonFromAIResponse } from "@/common/utils/json-extraction.utils";
import {
  LeaderToolService,
  LeaderActionType,
  LeaderActionResult,
} from "../data/leader-tool.service";
import { TASK_PRIORITY } from "../../types/mission.types";
import { LEADER_DECODE_PROMPT, LEADER_INTERVENE_PROMPT } from "../../prompts";
import {
  ANALYSIS_SKILL_DEFINITIONS,
  type AgentAssignment,
  type LeaderModelInfo,
} from "../../types/leader.types";

@Injectable()
export class LeaderChatService {
  private readonly logger = new Logger(LeaderChatService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly aiFacade: AIEngineFacade,
    private readonly eventEmitter: ResearchEventEmitterService,
    @Inject(forwardRef(() => LeaderToolService))
    private readonly leaderToolService: LeaderToolService,
  ) {}

  /**
   * 获取推理模型信息
   * ★ 委托给 AIEngineFacade 处理模型选择逻辑
   */
  async getReasoningModel(): Promise<LeaderModelInfo | null> {
    this.logger.debug("[getReasoningModel] Starting model selection");

    const allModels = await this.aiFacade.getAvailableModelsExtended();
    this.logger.debug(
      `[getReasoningModel] Found ${allModels.length} available models`,
    );

    // 使用 AIEngineFacade 的能力获取推理模型
    const modelInfo = await this.aiFacade.getReasoningModel();

    if (!modelInfo) {
      this.logger.error("[getReasoningModel] AI Engine returned no model");
      return null;
    }

    this.logger.log(
      `[getReasoningModel] AI Engine selected: ${modelInfo.id} (${modelInfo.provider}, isReasoning: ${modelInfo.isReasoning})`,
    );

    // 警告：如果选择的不是推理模型
    if (!modelInfo.isReasoning) {
      this.logger.warn(
        `[getReasoningModel] Selected model ${modelInfo.id} is not a reasoning model, fallback occurred`,
      );
    }

    return {
      modelId: modelInfo.id,
      modelName: modelInfo.name,
      provider: modelInfo.provider,
      isReasoning: modelInfo.isReasoning ?? false,
    };
  }

  /**
   * 处理用户的 @Leader 消息
   * ★ 使用 IntentDetectionService 预检测意图，优化简单请求的响应
   */
  async handleUserMessage(
    topicId: string,
    missionId: string,
    userMessage: string,
  ): Promise<{ response: string; actionResults?: LeaderActionResult[] }> {
    this.logger.log(
      `[handleUserMessage] Processing @Leader message for topic ${topicId}`,
    );

    // ★ Security: 对用户输入进行消毒，防止 Prompt Injection
    const sanitizedMessage = sanitize(userMessage);

    // ★ 保存用户消息到数据库（对话历史）
    await this.eventEmitter.saveUserMessage(
      topicId,
      missionId,
      sanitizedMessage,
    );

    // 0. 使用 AI Engine 的意图检测服务进行快速预检测
    const intentResult =
      this.aiFacade.intentDetector!.detectIntent(sanitizedMessage);
    this.logger.log(
      `[handleUserMessage] Intent detected: ${intentResult.intent} (confidence: ${intentResult.confidence})`,
    );

    // 1. 获取当前状态（包含 dimensions 用于显示当前维度列表）
    const mission = await this.prisma.researchMission.findUnique({
      where: { id: missionId },
      include: {
        topic: {
          include: {
            dimensions: true,
          },
        },
        tasks: true,
      },
    });

    if (!mission) {
      throw new Error(`Mission ${missionId} not found`);
    }

    // 2. 计算进度
    const completedTasks = mission.tasks.filter(
      (t) => t.status === "COMPLETED",
    );
    const inProgressTasks = mission.tasks.filter(
      (t) => t.status === "EXECUTING",
    );
    const progress =
      mission.tasks.length > 0
        ? Math.round((completedTasks.length / mission.tasks.length) * 100)
        : 0;

    // 3. 对于高置信度的简单意图，快速响应（无需调用推理模型）
    if (intentResult.confidence >= 0.75) {
      const quickResponse = this.handleQuickIntent(
        intentResult.intent,
        mission,
        progress,
        completedTasks.length,
        inProgressTasks.length,
      );
      if (quickResponse) {
        this.logger.log(
          `[handleUserMessage] Quick response for intent: ${intentResult.intent}`,
        );
        await this.recordDecision(
          missionId,
          LeaderDecisionType.INTERVENE,
          {
            userMessage: sanitizedMessage,
            detectedIntent: intentResult.intent,
          },
          { action: "quick_response" },
          quickResponse.response,
          "intent_detection_service",
          0,
        );
        // ★ 发射 WebSocket 事件到团队互动区
        await this.eventEmitter.emitLeaderResponse(
          topicId,
          missionId,
          quickResponse.response,
        );
        return quickResponse;
      }
    }

    // 4. 复杂意图：调用推理模型处理
    const leaderModel = await this.getReasoningModel();
    if (!leaderModel) {
      throw new Error("No reasoning model available for Leader");
    }

    // 5. 构建维度列表（供 Leader 了解当前有哪些维度）
    const dimensionList =
      mission.topic.dimensions && mission.topic.dimensions.length > 0
        ? mission.topic.dimensions
            .map((d, i) => `${i + 1}. ${d.name}（${d.status}）`)
            .join("\n")
        : "无维度";

    // 6. 构建 prompt（添加检测到的意图信息）
    const prompt = LEADER_INTERVENE_PROMPT.replace(
      "{topic}",
      mission.topic.name,
    )
      .replace("{progress}", String(progress))
      .replace("{stage}", mission.status)
      .replace(
        "{completedDimensions}",
        completedTasks
          .map((t) => t.dimensionName)
          .filter(Boolean)
          .join(", ") || "无",
      )
      .replace(
        "{inProgressDimensions}",
        inProgressTasks
          .map((t) => t.dimensionName)
          .filter(Boolean)
          .join(", ") || "无",
      )
      .replace("{dimensionList}", dimensionList)
      .replace("{userMessage}", sanitizedMessage);

    // 7. 调用 AI
    const startTime = Date.now();
    const response = await this.aiFacade.chat({
      messages: [
        {
          role: "system",
          content:
            "你是研究协调专家 Leader，请回应用户的指令并输出 JSON 格式的响应。",
        },
        { role: "user", content: prompt },
      ],
      model: leaderModel.modelId,
      taskProfile: {
        creativity: "medium",
        outputLength: "medium",
      },
    });
    const latencyMs = Date.now() - startTime;

    // 8. 解析响应
    const result = this.extractJsonFromResponse<{
      understanding?: string;
      actions?: Array<{
        type: string;
        params?: Record<string, unknown>;
      }>;
      response: string;
      planAdjustments?: unknown;
    }>(response.content, "response"); // requiredKey for validation

    if (!result) {
      const fallbackResponse = "收到您的指令，我会继续推进研究工作。";
      // ★ 发射 WebSocket 事件到团队互动区
      await this.eventEmitter.emitLeaderResponse(
        topicId,
        missionId,
        fallbackResponse,
      );
      return {
        response: fallbackResponse,
      };
    }

    // ★★★ 9. 执行 actions 数组中的动作 ★★★
    const actionResults: LeaderActionResult[] = [];
    if (result.actions && Array.isArray(result.actions)) {
      this.logger.log(
        `[handleUserMessage] Executing ${result.actions.length} actions`,
      );

      for (const action of result.actions) {
        const actionType = action.type as LeaderActionType;
        const params = action.params || {};

        this.logger.log(`[handleUserMessage] Executing action: ${actionType}`);

        try {
          let actionResult: LeaderActionResult;

          switch (actionType) {
            case LeaderActionType.CREATE_DIMENSION: {
              // 创建维度（拆分由 AI 根据用户明确意图决定，代码不强制拆分）
              actionResult = await this.leaderToolService.createDimension({
                topicId,
                name: params.name as string,
                description: params.description as string | undefined,
              });

              // ★ v8.2: 创建维度成功后，自动创建 ResearchTask 并恢复 Mission 执行
              if (actionResult.success && actionResult.data?.dimensionId) {
                const dimensionId = actionResult.data.dimensionId as string;
                const dimensionName = actionResult.data.name as string;

                try {
                  // 为新维度创建 ResearchTask
                  const sanitizedDimName = dimensionName
                    .replace(/[^a-zA-Z0-9\u4e00-\u9fa5]/g, "_")
                    .substring(0, 30);
                  const newAgentId = `researcher_${sanitizedDimName}_${Date.now()}`;

                  const task = await this.prisma.researchTask.create({
                    data: {
                      missionId,
                      title: `研究: ${dimensionName}`,
                      description:
                        (params.description as string) ||
                        `Leader 创建的新维度研究：${dimensionName}`,
                      taskType: "dimension_research",
                      dimensionName: dimensionName,
                      dimensionId: dimensionId,
                      assignedAgent: newAgentId,
                      assignedAgentType: "dimension_researcher",
                      priority: TASK_PRIORITY.DIMENSION_RESEARCH_DYNAMIC,
                      status: ResearchTaskStatus.PENDING,
                    },
                  });

                  // 更新 Mission 的 totalTasks 计数
                  await this.prisma.researchMission.update({
                    where: { id: missionId },
                    data: {
                      totalTasks: { increment: 1 },
                    },
                  });

                  // 更新质量审核任务的依赖
                  const qualityReviewTask =
                    await this.prisma.researchTask.findFirst({
                      where: {
                        missionId,
                        taskType: "quality_review",
                      },
                    });

                  if (qualityReviewTask) {
                    const currentDeps = qualityReviewTask.dependencies || [];
                    if (!currentDeps.includes(task.id)) {
                      await this.prisma.researchTask.update({
                        where: { id: qualityReviewTask.id },
                        data: {
                          dependencies: [...currentDeps, task.id],
                        },
                      });
                    }
                  }

                  this.logger.log(
                    `[handleUserMessage] Created ResearchTask ${task.id} for dimension "${dimensionName}"`,
                  );

                  // 触发 Mission 恢复执行（通过事件解耦，避免循环依赖）
                  this.eventEmitter.emitResumeMissionExecution(
                    missionId,
                    topicId,
                  );
                } catch (taskError) {
                  this.logger.error(
                    `[handleUserMessage] Failed to create ResearchTask: ${taskError}`,
                  );
                  // 不影响主流程，只记录错误
                }
              }
              break;
            }

            case LeaderActionType.DELETE_DIMENSION:
              actionResult = await this.leaderToolService.deleteDimension({
                topicId,
                dimensionName: params.dimensionName as string,
              });
              break;

            case LeaderActionType.CANCEL_TASK:
              actionResult = await this.leaderToolService.cancelTask({
                topicId,
                dimensionName: params.dimensionName as string | undefined,
                taskName: params.taskName as string | undefined,
              });
              break;

            case LeaderActionType.UPDATE_DIMENSION:
              actionResult = await this.leaderToolService.updateDimension({
                topicId,
                dimensionName: params.dimensionName as string,
                newName: params.newName as string | undefined,
                newDescription: params.newDescription as string | undefined,
              });
              break;

            case LeaderActionType.MERGE_DIMENSIONS:
              actionResult = await this.leaderToolService.mergeDimensions({
                topicId,
                sourceDimensionNames: params.sourceDimensionNames as string[],
                targetDimensionName: params.targetDimensionName as string,
              });
              break;

            case LeaderActionType.NO_ACTION:
              actionResult = {
                success: true,
                action: LeaderActionType.NO_ACTION,
                message: "无需执行动作",
              };
              break;

            default:
              this.logger.warn(
                `[handleUserMessage] Unknown action type: ${actionType}`,
              );
              actionResult = {
                success: false,
                action: actionType,
                message: `未知的动作类型: ${actionType}`,
              };
          }

          actionResults.push(actionResult);
          this.logger.log(
            `[handleUserMessage] Action result: ${actionResult.success ? "SUCCESS" : "FAILED"} - ${actionResult.message}`,
          );
        } catch (error) {
          this.logger.error(
            `[handleUserMessage] Action execution failed: ${error}`,
          );
          actionResults.push({
            success: false,
            action: actionType,
            message: `执行失败: ${error instanceof Error ? error.message : String(error)}`,
          });
        }
      }
    }

    // ★ Fix: 代码级别的删除意图检测和强制执行
    // 如果用户消息明确包含删除意图但 AI 没有输出 DELETE_DIMENSION action，强制执行
    const deleteKeywords = ["删除", "移除", "取消", "去掉", "不要"];
    const hasDeleteIntent = deleteKeywords.some((kw) =>
      sanitizedMessage.includes(kw),
    );
    const hasDeleteAction = actionResults.some(
      (r) => r.action === LeaderActionType.DELETE_DIMENSION,
    );

    if (hasDeleteIntent && !hasDeleteAction) {
      this.logger.warn(
        `[handleUserMessage] Detected delete intent but no DELETE_DIMENSION action, attempting fallback delete`,
      );

      // 尝试从消息中提取维度名称
      // 模式: "删除维度：X" / "删除 X 维度" / "把 X 删除" / "删除「X」"
      const dimensionPatterns = [
        /删除[维度章节]*[：:「\s]*([^」\s,，。]+)/,
        /移除[维度章节]*[：:「\s]*([^」\s,，。]+)/,
        /把[「\s]*([^」\s,，。]+)[」\s]*删除/,
        /不要[「\s]*([^」\s,，。]+)/,
        /取消[「\s]*([^」\s,，。]+)/,
      ];

      let extractedDimensionName: string | null = null;
      for (const pattern of dimensionPatterns) {
        const match = sanitizedMessage.match(pattern);
        if (match && match[1]) {
          extractedDimensionName = match[1].replace(/[「」]/g, "").trim();
          break;
        }
      }

      if (extractedDimensionName) {
        this.logger.log(
          `[handleUserMessage] Fallback: Attempting to delete dimension "${extractedDimensionName}"`,
        );

        try {
          const deleteResult = await this.leaderToolService.deleteDimension({
            topicId,
            dimensionName: extractedDimensionName,
          });
          actionResults.push(deleteResult);

          if (deleteResult.success) {
            this.logger.log(
              `[handleUserMessage] Fallback delete successful: ${deleteResult.message}`,
            );
            // 更新响应以反映删除操作
            result.response = deleteResult.message;
          }
        } catch (error) {
          this.logger.error(
            `[handleUserMessage] Fallback delete failed: ${error}`,
          );
        }
      } else {
        this.logger.warn(
          `[handleUserMessage] Could not extract dimension name from delete intent`,
        );
      }
    }

    // 10. 记录决策（包含动作执行结果）
    await this.recordDecision(
      missionId,
      LeaderDecisionType.INTERVENE,
      { userMessage: sanitizedMessage, detectedIntent: intentResult.intent },
      { ...result, actionResults },
      result.response,
      leaderModel.modelId,
      latencyMs,
    );

    // 11. 构建最终响应（如果有动作执行失败，附加错误信息）
    const failedActions = actionResults.filter((r) => !r.success);
    let finalResponse = result.response;
    if (failedActions.length > 0) {
      const errorMessages = failedActions.map((r) => r.message).join("; ");
      finalResponse += `\n\n⚠️ 部分操作未成功: ${errorMessages}`;
    }

    // ★ 发射 WebSocket 事件到团队互动区
    await this.eventEmitter.emitLeaderResponse(
      topicId,
      missionId,
      finalResponse,
    );

    return {
      response: finalResponse,
      actionResults,
    };
  }

  /**
   * ★ Leader 解码用户输入
   * 类似 Claude Code CLI：先理解用户意图，再决定如何响应
   *
   * @param topicId 专题ID
   * @param userMessage 用户消息
   * @param missionId 可选的任务ID（如果已有进行中的任务）
   * @returns 解码结果，包含决策类型和响应
   */
  async decodeUserInput(
    topicId: string,
    userMessage: string,
    missionId?: string,
  ): Promise<{
    decisionType: "DIRECT_ANSWER" | "CREATE_TODO" | "CLARIFY" | "ACKNOWLEDGE";
    understanding: string;
    response: string;
    todoTitle?: string;
    todoDescription?: string;
    clarifyQuestion?: string;
    clarifyOptions?: string[];
  }> {
    // ★ Security: 对用户输入进行消毒，防止 Prompt Injection
    const sanitizedMessage = sanitize(userMessage);

    this.logger.log(
      `[decodeUserInput] Decoding user input for topic ${topicId}: "${sanitizedMessage.substring(0, 50)}..."`,
    );

    // 1. 获取专题信息
    const topic = await this.prisma.researchTopic.findUnique({
      where: { id: topicId },
      include: { dimensions: true },
    });

    if (!topic) {
      throw new Error(`Topic ${topicId} not found`);
    }

    // 2. 获取任务状态（如果有 missionId）
    let mission = null;
    let progress = 0;
    let completedDimensions: string[] = [];
    let inProgressDimensions: string[] = [];
    let todoList = "暂无任务";

    if (missionId) {
      mission = await this.prisma.researchMission.findUnique({
        where: { id: missionId },
        include: { tasks: true },
      });

      if (mission) {
        const completedTasks = mission.tasks.filter(
          (t) => t.status === "COMPLETED",
        );
        const inProgressTasks = mission.tasks.filter(
          (t) => t.status === "EXECUTING",
        );
        progress =
          mission.tasks.length > 0
            ? Math.round((completedTasks.length / mission.tasks.length) * 100)
            : 0;

        completedDimensions = completedTasks
          .map((t) => t.dimensionName)
          .filter(Boolean) as string[];
        inProgressDimensions = inProgressTasks
          .map((t) => t.dimensionName)
          .filter(Boolean) as string[];

        // 构建 TODO 列表摘要
        const pendingTasks = mission.tasks.filter(
          (t) => t.status === "PENDING" || t.status === "ASSIGNED",
        );
        todoList =
          [
            inProgressTasks.length > 0
              ? `进行中: ${inProgressTasks.map((t) => t.title).join(", ")}`
              : null,
            pendingTasks.length > 0
              ? `待处理: ${pendingTasks.map((t) => t.title).join(", ")}`
              : null,
            completedTasks.length > 0
              ? `已完成: ${completedTasks.length} 个`
              : null,
          ]
            .filter(Boolean)
            .join("\n") || "暂无任务";
      }
    }

    // 3. ★ v8.1: 构建项目配置上下文（让 Leader 了解自己的能力和团队配置）
    const projectContext = await this.buildProjectContext(topicId, missionId);

    // 4. 快速意图检测（简单情况不需要调用 AI）
    // ★ 跳过快速检测如果用户询问项目配置相关问题
    const isProjectConfigQuestion =
      sanitizedMessage.includes("工具") ||
      sanitizedMessage.includes("技能") ||
      sanitizedMessage.includes("团队") ||
      sanitizedMessage.includes("成员") ||
      sanitizedMessage.includes("知识库") ||
      sanitizedMessage.includes("配置") ||
      sanitizedMessage.includes("你能") ||
      sanitizedMessage.includes("你有");

    if (!isProjectConfigQuestion) {
      const quickResult = this.quickDecodeIntent(
        sanitizedMessage,
        progress,
        topic.name,
      );
      if (quickResult) {
        this.logger.log(
          `[decodeUserInput] Quick decode result: ${quickResult.decisionType}`,
        );
        return quickResult;
      }
    }

    // 5. 复杂情况：调用 AI 解码
    const leaderModel = await this.getReasoningModel();
    if (!leaderModel) {
      // 无推理模型时的降级处理
      return {
        decisionType: "ACKNOWLEDGE",
        understanding: "收到您的消息",
        response: `收到！我会处理您的请求："${sanitizedMessage}"`,
      };
    }

    // 6. 构建 prompt（包含项目配置上下文）
    const prompt = LEADER_DECODE_PROMPT.replace("{topic}", topic.name)
      .replace("{topicDescription}", topic.description || "无")
      .replace("{progress}", String(progress))
      .replace("{stage}", mission?.status || "未开始")
      .replace("{todoList}", todoList)
      .replace("{completedDimensions}", completedDimensions.join(", ") || "无")
      .replace(
        "{inProgressDimensions}",
        inProgressDimensions.join(", ") || "无",
      )
      .replace("{projectContext}", projectContext)
      .replace("{userMessage}", sanitizedMessage);

    // 6.5 ★ 获取对话历史（多轮上下文）
    const conversationHistory =
      await this.eventEmitter.getLeaderConversationHistory(
        topicId,
        missionId,
        5, // 最近 5 轮对话
      );

    // 7. 调用 AI（包含对话历史）
    const startTime = Date.now();

    // 构建消息数组：系统提示 + 对话历史 + 当前用户消息
    const messages: Array<{
      role: "system" | "user" | "assistant";
      content: string;
    }> = [
      {
        role: "system",
        content:
          "你是研究团队的 AI Leader。请理解用户意图并输出 JSON 格式的响应。",
      },
    ];

    // 添加对话历史（不包括当前消息，当前消息通过 prompt 发送）
    if (conversationHistory.length > 0) {
      this.logger.debug(
        `[decodeUserInput] Including ${conversationHistory.length} messages from conversation history`,
      );
      messages.push(...conversationHistory);
    }

    // 添加当前用户消息（包含完整上下文的 prompt）
    messages.push({ role: "user", content: prompt });

    const response = await this.aiFacade.chat({
      messages,
      model: leaderModel.modelId,
      taskProfile: {
        creativity: "low", // 解码任务需要准确性
        outputLength: "short",
      },
    });
    const latencyMs = Date.now() - startTime;

    this.logger.log(
      `[decodeUserInput] AI response in ${latencyMs}ms (with ${conversationHistory.length} history messages)`,
    );

    // 7. 解析响应
    const result = this.extractJsonFromResponse<{
      decisionType: string;
      understanding: string;
      response: string;
      todoTitle?: string;
      todoDescription?: string;
      clarifyQuestion?: string;
      clarifyOptions?: string[];
    }>(response.content, "decisionType"); // requiredKey for validation

    if (!result) {
      // 解析失败时的降级处理
      return {
        decisionType: "ACKNOWLEDGE",
        understanding: "收到您的消息",
        response: `收到！我会处理您的请求。`,
      };
    }

    // 8. 验证并返回结果
    const validTypes = [
      "DIRECT_ANSWER",
      "CREATE_TODO",
      "CLARIFY",
      "ACKNOWLEDGE",
    ];
    const decisionType = validTypes.includes(result.decisionType)
      ? (result.decisionType as
          | "DIRECT_ANSWER"
          | "CREATE_TODO"
          | "CLARIFY"
          | "ACKNOWLEDGE")
      : "ACKNOWLEDGE";

    return {
      decisionType,
      understanding: result.understanding || "收到您的消息",
      response: result.response || "收到！",
      todoTitle: result.todoTitle,
      todoDescription: result.todoDescription,
      clarifyQuestion: result.clarifyQuestion,
      clarifyOptions: result.clarifyOptions,
    };
  }

  /**
   * ★ v7.2: 为用户请求的任务选择合适的 Agent
   *
   * 功能：
   * 1. 从当前 Mission 的已有 Agent 中选择合适的
   * 2. 如果没有合适的，动态创建新 Agent
   * 3. 返回 Agent 分配信息（包含模型）
   *
   * @param topicId 专题 ID
   * @param missionId 任务 ID
   * @param taskTitle 任务标题
   * @param taskDescription 任务描述
   * @returns Agent 分配信息
   */
  async selectAgentForTask(
    _topicId: string,
    missionId: string,
    taskTitle: string,
    taskDescription?: string,
  ): Promise<AgentAssignment> {
    this.logger.log(
      `[selectAgentForTask] Selecting agent for task: "${taskTitle}"`,
    );

    // 1. 获取当前 Mission 的任务列表，了解已有 Agent
    const mission = await this.prisma.researchMission.findUnique({
      where: { id: missionId },
      include: {
        tasks: {
          where: { assignedAgentType: "dimension_researcher" },
          select: {
            assignedAgent: true,
            assignedAgentType: true,
            modelId: true,
            status: true,
          },
        },
      },
    });

    // 2. 获取可用模型列表（过滤不可用模型，优先用于对话的模型）
    const allModelsRaw = await this.aiFacade.getAvailableModelsExtended();
    const availableModels = allModelsRaw.filter((m) => m.isAvailable !== false);
    // 过滤掉推理模型（用于研究任务的应是普通对话模型）
    const chatModels = availableModels.filter((m) => !m.isReasoning);

    // 3. 统计已有 Agent 的工作负载
    const agentWorkload = new Map<string, number>();
    const agentModels = new Map<string, string>();

    if (mission?.tasks) {
      for (const task of mission.tasks) {
        const agentId = task.assignedAgent;
        const currentLoad = agentWorkload.get(agentId) || 0;
        agentWorkload.set(agentId, currentLoad + 1);
        if (task.modelId) {
          agentModels.set(agentId, task.modelId);
        }
      }
    }

    // 4. 选择策略：优先选择工作负载最少的已有 Agent
    let selectedAgentId: string;
    let selectedModelId: string;
    let agentName: string;

    // 确保有可用模型（如果没有 chat 模型，使用所有可用模型）
    const modelsToUse = chatModels.length > 0 ? chatModels : availableModels;
    const defaultModel = modelsToUse[0]?.id || "gpt-4o";

    if (agentWorkload.size > 0) {
      // 找出工作负载最少的 Agent
      let minLoad = Infinity;
      let minLoadAgent = "";

      for (const [agentId, load] of agentWorkload.entries()) {
        if (load < minLoad) {
          minLoad = load;
          minLoadAgent = agentId;
        }
      }

      selectedAgentId = minLoadAgent;
      selectedModelId = agentModels.get(minLoadAgent) || defaultModel;

      // 从 agentId 提取 Agent 编号用于命名
      // 格式如: researcher_1, researcher_market_trends 等
      const idMatch = selectedAgentId.match(/(\d+)$/);
      const agentNum = idMatch ? idMatch[1] : String(agentWorkload.size);
      agentName = `研究员 ${agentNum}`;

      this.logger.log(
        `[selectAgentForTask] Selected existing agent: ${selectedAgentId} (load: ${minLoad}) with model: ${selectedModelId}`,
      );
    } else {
      // 没有已有 Agent，创建新的
      const timestamp = Date.now();
      selectedAgentId = `researcher_user_${timestamp}`;

      // 随机选择模型实现多元化（确保有模型可选）
      if (modelsToUse.length > 0) {
        const modelIndex = Math.floor(Math.random() * modelsToUse.length);
        selectedModelId = modelsToUse[modelIndex].id;
      } else {
        selectedModelId = "gpt-4o";
      }
      agentName = "新研究员";

      this.logger.log(
        `[selectAgentForTask] Created new agent: ${selectedAgentId} with model: ${selectedModelId}`,
      );
    }

    // 5. 根据任务内容智能选择技能和工具
    const { skills, tools } = this.selectSkillsAndToolsForTask(
      taskTitle,
      taskDescription,
    );

    this.logger.log(
      `[selectAgentForTask] Selected skills: [${skills.join(", ")}], tools: [${tools.join(", ")}]`,
    );

    // 6. 记录 Leader 决策（使用 ADJUST 类型表示动态调整任务分配）
    await this.recordDecision(
      missionId,
      LeaderDecisionType.ADJUST,
      { taskTitle, taskDescription },
      {
        agentId: selectedAgentId,
        agentName,
        modelId: selectedModelId,
        skills,
        tools,
      },
      `Leader 为任务「${taskTitle}」选择了 ${agentName}（${selectedModelId}），技能：[${skills.join(", ")}]，工具：[${tools.join(", ")}]`,
    );

    return {
      agentId: selectedAgentId,
      agentName,
      agentType: "dimension_researcher",
      role: "用户请求研究员",
      modelId: selectedModelId,
      skills,
      tools,
    };
  }

  /**
   * 获取 Leader 决策历史
   */
  async getDecisionHistory(
    missionId: string,
  ): Promise<Record<string, unknown>[]> {
    return this.prisma.leaderDecision.findMany({
      where: { missionId },
      orderBy: { createdAt: "desc" },
    });
  }

  /**
   * 快速处理简单意图（无需调用推理模型）
   * ★ 使用 IntentDetectionService 检测结果
   */
  private handleQuickIntent(
    intent: UserIntent,
    mission: { topic: { name: string }; status: string },
    progress: number,
    completedCount: number,
    inProgressCount: number,
  ): { response: string; actionResults?: LeaderActionResult[] } | null {
    switch (intent) {
      case UserIntent.CONTINUE:
        // 继续研究：返回当前进度并确认继续
        return {
          response: `好的，继续推进「${mission.topic.name}」的研究工作。当前进度：${progress}%，已完成 ${completedCount} 个维度，${inProgressCount} 个维度正在进行中。`,
        };

      case UserIntent.SUMMARIZE:
        // 总结请求：提供当前状态摘要（详细总结仍需调用AI）
        if (progress < 50) {
          return {
            response: `研究「${mission.topic.name}」进度 ${progress}%，目前还在收集资料阶段。已完成 ${completedCount} 个维度，${inProgressCount} 个正在进行。建议等待更多维度完成后再生成详细总结。`,
          };
        }
        // 进度较高时，需要详细总结，交给AI处理
        return null;

      case UserIntent.GENERAL_CHAT:
        // 一般聊天：简短友好回复
        return {
          response: `您好！我是负责「${mission.topic.name}」研究的 Leader。当前研究进度 ${progress}%。有什么我可以帮您的吗？`,
        };

      default:
        // 其他意图需要AI处理
        return null;
    }
  }

  /**
   * ★ v8.1: 构建项目配置上下文
   * 让 Leader 了解当前项目的完整配置，包括：
   * - 知识库配置
   * - 可用工具列表（动态从 AI Engine 获取）
   * - 团队成员配置
   * - 搜索时间范围
   */
  private async buildProjectContext(
    topicId: string,
    missionId?: string,
  ): Promise<string> {
    try {
      // ★ 优化: 使用 Promise.all 并行查询，减少数据库往返
      const [topic, mission] = await Promise.all([
        // 1. 获取专题信息和配置
        this.prisma.researchTopic.findUnique({
          where: { id: topicId },
          include: { dimensions: true },
        }),
        // 2. 获取任务信息（如果有 missionId）
        missionId
          ? this.prisma.researchMission.findUnique({
              where: { id: missionId },
              select: { leaderPlan: true },
            })
          : Promise.resolve(null),
      ]);

      if (!topic) {
        return "## 项目配置\n暂无项目配置信息";
      }

      const topicConfig = (topic.topicConfig as Record<string, unknown>) || {};

      // 3. 获取知识库名称（如果配置了）
      let knowledgeBaseText = "未配置";
      const knowledgeBaseIds = topicConfig.knowledgeBaseIds as
        | string[]
        | undefined;
      if (
        Array.isArray(knowledgeBaseIds) &&
        knowledgeBaseIds.length > 0 &&
        knowledgeBaseIds.every((id) => typeof id === "string" && id.length > 0)
      ) {
        try {
          const knowledgeBases = await this.prisma.knowledgeBase.findMany({
            where: { id: { in: knowledgeBaseIds } },
            select: { id: true, name: true },
          });
          if (knowledgeBases.length > 0) {
            knowledgeBaseText = knowledgeBases
              .map((kb) => `「${kb.name}」`)
              .join(", ");
          }
        } catch (e) {
          this.logger.warn(
            `[buildProjectContext] Failed to fetch knowledge bases: ${e}`,
          );
        }
      }

      // 4. ★ 动态获取可用工具列表（从 AI Engine）- 添加空值防护
      const availableTools = this.aiFacade.getAvailableTools() || [];
      const toolsText =
        availableTools.length > 0
          ? availableTools
              .filter((t) => t && t.name) // 过滤无效工具
              .map(
                (t) =>
                  `- ${t.name}${t.description ? `: ${t.description}` : ""}`,
              )
              .join("\n")
          : "- 暂无可用工具";

      // 5. 获取搜索时间范围配置
      const searchTimeRange =
        (topicConfig.searchTimeRange as string) || "不限（搜索所有时间的内容）";

      // 6. 获取团队成员配置（从 LeaderPlan）
      let teamMembersText = "团队尚未组建";
      const leaderPlan = mission?.leaderPlan as Record<string, unknown> | null;
      if (
        leaderPlan?.agentAssignments &&
        Array.isArray(leaderPlan.agentAssignments) &&
        leaderPlan.agentAssignments.length > 0
      ) {
        teamMembersText = (
          leaderPlan.agentAssignments as Record<string, unknown>[]
        )
          .map((a) => {
            const parts = [
              `- **${a.agentName || a.agentId}** (${a.agentType})`,
            ];
            if (a.modelId) parts.push(`  - 模型: ${a.modelId}`);
            const skills = a.skills as string[] | undefined;
            const tools = a.tools as string[] | undefined;
            if (skills?.length) parts.push(`  - 技能: ${skills.join(", ")}`);
            if (tools?.length) parts.push(`  - 工具: ${tools.join(", ")}`);
            if (a.role) parts.push(`  - 职责: ${a.role}`);
            return parts.join("\n");
          })
          .join("\n");
      }

      // 7. 获取研究维度列表
      const dimensionsText =
        topic.dimensions && topic.dimensions.length > 0
          ? topic.dimensions
              .map(
                (d, i) =>
                  `${i + 1}. ${d.name}${d.status === "COMPLETED" ? " ✓" : d.status === "RESEARCHING" ? " ⏳" : ""}`,
              )
              .join("\n")
          : "暂无研究维度";

      // 8. ★ 获取可用分析技能
      const skillsText = ANALYSIS_SKILL_DEFINITIONS.map(
        (s) => `- ${s.name}: ${s.description}`,
      ).join("\n");

      // 构建完整的项目配置上下文
      return `## 项目配置

### 知识库
${knowledgeBaseText}

### 搜索时间范围
${searchTimeRange}

### 可用研究工具
${toolsText}

### 可用分析技能
${skillsText}

### 研究维度
${dimensionsText}

### 研究团队
${teamMembersText}`;
    } catch (error) {
      this.logger.error(
        `[buildProjectContext] Failed to build context: ${error}`,
      );
      return "## 项目配置\n暂无项目配置信息";
    }
  }

  /**
   * 快速意图解码（无需调用 AI）
   * 处理简单、明确的用户输入
   */
  private quickDecodeIntent(
    message: string,
    progress: number,
    topicName: string,
  ): {
    decisionType: "DIRECT_ANSWER" | "CREATE_TODO" | "CLARIFY" | "ACKNOWLEDGE";
    understanding: string;
    response: string;
  } | null {
    if (!message) return null;
    const lowerMessage = message.toLowerCase().trim();

    // 进度查询
    if (
      lowerMessage.includes("进度") ||
      lowerMessage.includes("状态") ||
      lowerMessage === "怎么样了"
    ) {
      return {
        decisionType: "DIRECT_ANSWER",
        understanding: "用户询问研究进度",
        response: `「${topicName}」研究进度：${progress}%`,
      };
    }

    // 感谢/确认
    if (
      lowerMessage === "好" ||
      lowerMessage === "好的" ||
      lowerMessage === "谢谢" ||
      lowerMessage === "收到" ||
      lowerMessage === "ok" ||
      lowerMessage === "知道了"
    ) {
      return {
        decisionType: "ACKNOWLEDGE",
        understanding: "用户表示确认",
        response: "好的，有需要随时告诉我！",
      };
    }

    // 模糊请求需要澄清
    if (
      lowerMessage === "再研究一下" ||
      lowerMessage === "改一下" ||
      lowerMessage === "不太好"
    ) {
      return {
        decisionType: "CLARIFY",
        understanding: "用户请求模糊，需要澄清",
        response: "请告诉我具体希望改进哪个方面？",
      };
    }

    // 其他情况需要 AI 处理
    return null;
  }

  /**
   * 根据任务标题和描述智能选择技能和工具
   * 用于 Leader 对话创建的任务
   */
  private selectSkillsAndToolsForTask(
    taskTitle: string,
    taskDescription?: string,
  ): { skills: string[]; tools: string[] } {
    const content = `${taskTitle || ""} ${taskDescription || ""}`.toLowerCase();

    // 政策法规类关键词
    const policyKeywords = [
      "政策",
      "法规",
      "监管",
      "立法",
      "法案",
      "法律",
      "policy",
      "regulation",
      "regulatory",
      "legislation",
      "law",
      "compliance",
      "执法",
      "合规",
      "框架",
      "framework",
      "白宫",
      "国会",
      "联邦",
      "行政命令",
    ];

    // 市场分析类关键词
    const marketKeywords = [
      "市场",
      "竞争",
      "格局",
      "份额",
      "趋势",
      "投资",
      "融资",
      "资本",
      "商业",
      "market",
      "competition",
      "trend",
      "investment",
      "business",
      "产业",
      "行业",
      "企业",
      "公司",
    ];

    // 技术研究类关键词
    const techKeywords = [
      "技术",
      "研发",
      "创新",
      "算法",
      "架构",
      "系统",
      "technology",
      "research",
      "innovation",
      "algorithm",
      "infrastructure",
      "基础设施",
      "底层",
      "核心",
    ];

    // 数据分析类关键词
    const dataKeywords = [
      "数据",
      "统计",
      "分析",
      "指标",
      "报告",
      "data",
      "statistics",
      "metrics",
      "analysis",
      "report",
      "增长",
      "下降",
      "百分比",
    ];

    // 战略/综合类关键词
    const strategyKeywords = [
      "战略",
      "布局",
      "发展",
      "规划",
      "展望",
      "预测",
      "未来",
      "strategy",
      "development",
      "outlook",
      "forecast",
      "思想",
      "哲学",
      "根源",
      "动向",
    ];

    let skills: string[] = [];
    let tools: string[] = [];

    // 判断任务类型并选择技能和工具
    const isPolicyRelated = policyKeywords.some((kw) => content.includes(kw));
    const isMarketRelated = marketKeywords.some((kw) => content.includes(kw));
    const isTechRelated = techKeywords.some((kw) => content.includes(kw));
    const isDataRelated = dataKeywords.some((kw) => content.includes(kw));
    const isStrategyRelated = strategyKeywords.some((kw) =>
      content.includes(kw),
    );

    // 政策法规类
    if (isPolicyRelated) {
      skills.push(
        "policy_analysis",
        "regulatory_impact",
        "legislative_tracking",
      );
      tools.push("federal-register", "congress-gov", "whitehouse-news");
    }

    // 市场分析类
    if (isMarketRelated) {
      skills.push(
        "trend_analysis",
        "competitive_analysis",
        "data_interpretation",
      );
      tools.push("web-search", "data-analysis");
    }

    // 技术研究类
    if (isTechRelated) {
      skills.push("deep_dive", "comparison", "synthesis");
      tools.push("academic-search", "web-search");
    }

    // 数据分析类
    if (isDataRelated) {
      skills.push("data_interpretation", "trend_analysis");
      tools.push("data-analysis", "web-search");
    }

    // 战略/综合类
    if (isStrategyRelated) {
      skills.push("future_projection", "cause_effect", "synthesis");
      tools.push("web-search", "news");
    }

    // 去重
    skills = [...new Set(skills)];
    tools = [...new Set(tools)];

    // 如果没有匹配到任何关键词，使用默认值
    if (skills.length === 0) {
      skills = ["deep_dive", "synthesis", "data_interpretation"];
    }
    if (tools.length === 0) {
      tools = ["web-search"];
    }

    // 限制数量：skills 2-4 个，tools 1-3 个
    if (skills.length > 4) {
      skills = skills.slice(0, 4);
    }
    if (tools.length > 3) {
      tools = tools.slice(0, 3);
    }

    return { skills, tools };
  }

  /**
   * 从 AI 响应中提取 JSON
   * 使用增强的 extractJsonFromAIResponse 工具，支持截断响应修复
   */
  private extractJsonFromResponse<T>(
    response: string,
    requiredKey?: string,
  ): T | null {
    // 处理空响应
    if (!response || response.trim().length === 0) {
      this.logger.warn("[extractJsonFromResponse] Empty response received");
      return null;
    }

    const result = extractJsonFromAIResponse<T>(response, { requiredKey });

    if (result.success && result.data) {
      this.logger.debug(
        `[extractJsonFromResponse] Extracted via method: ${result.method}`,
      );
      return result.data;
    }

    this.logger.error(
      `[extractJsonFromResponse] Could not extract JSON: ${result.error || "unknown error"}`,
    );
    return null;
  }

  /**
   * 记录 Leader 决策
   */
  private async recordDecision(
    missionId: string,
    type: LeaderDecisionType,
    input: Record<string, unknown>,
    decision: Record<string, unknown>,
    reasoning: string,
    modelUsed?: string,
    latencyMs?: number,
  ): Promise<void> {
    try {
      await this.prisma.leaderDecision.create({
        data: {
          missionId,
          type,
          input: toPrismaJson(input),
          decision: toPrismaJson(decision),
          reasoning,
          modelUsed,
          latencyMs,
        },
      });
    } catch (error) {
      this.logger.error(`[recordDecision] Failed to record decision: ${error}`);
    }
  }
}
