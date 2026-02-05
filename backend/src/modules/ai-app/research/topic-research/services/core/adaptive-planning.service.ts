/**
 * Adaptive Planning Service
 *
 * 负责在任务完成后评估研究进度并动态调整计划：
 * - 评估任务完成质量
 * - 检测研究缺口、矛盾和新发现
 * - 使用 AI 生成计划调整建议
 * - 应用批准的调整到 LeaderPlan
 */

import { Injectable, Logger, OnModuleDestroy } from "@nestjs/common";
import { OnEvent } from "@nestjs/event-emitter";
import { PrismaService } from "@/common/prisma/prisma.service";
import { AIEngineFacade } from "@/modules/ai-engine/facade";
import { AIModelType } from "@prisma/client";
import type { LeaderPlan } from "../../types/leader.types";
import {
  ResearchEventEmitterService,
  ResearchEventType,
} from "./research-event-emitter.service";
import { extractJsonFromAIResponse } from "@/common/utils/json-extraction.utils";
import { toPrismaJson } from "@/common/utils/prisma-json.utils";

/**
 * 任务完成评估结果
 */
export interface TaskEvaluation {
  taskId: string;
  dimensionName: string;
  qualityScore: number; // 0-100
  gaps: Array<{
    description: string;
    severity: "low" | "medium" | "high";
  }>;
  contradictions: Array<{
    description: string;
    conflictingPoints: string[];
  }>;
  newAngles: Array<{
    description: string;
    potential: "low" | "medium" | "high";
  }>;
  overallAssessment: string;
}

/**
 * 计划调整建议
 */
export interface PlanAdjustments {
  addTasks: Array<{
    title: string;
    description: string;
    dimensionName?: string;
    priority: number;
    reasoning: string;
  }>;
  removeTasks: Array<{
    taskId: string;
    reasoning: string;
  }>;
  reorderTasks: Array<{
    taskId: string;
    newPriority: number;
    reasoning: string;
  }>;
  adjustmentRationale: string;
}

@Injectable()
export class AdaptivePlanningService implements OnModuleDestroy {
  private readonly logger = new Logger(AdaptivePlanningService.name);
  private readonly missionLocks = new Map<string, Promise<void>>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly aiFacade: AIEngineFacade,
    private readonly eventEmitter: ResearchEventEmitterService,
  ) {}

  /**
   * 清理资源
   */
  onModuleDestroy(): void {
    // Clear mission locks
    this.missionLocks.clear();
    this.logger.debug("[onModuleDestroy] Adaptive planning service destroyed");
  }

  /**
   * 监听任务完成事件，触发自适应规划评估
   */
  @OnEvent(ResearchEventType.TASK_COMPLETED)
  async handleTaskCompleted(payload: {
    taskId: string;
    taskType: string;
    topicId?: string;
  }): Promise<void> {
    // 只对维度研究任务进行自适应规划
    if (payload.taskType !== "dimension_research") {
      return;
    }

    // Get missionId for lock key
    const task = await this.prisma.researchTask.findUnique({
      where: { id: payload.taskId },
      select: { missionId: true },
    });

    if (!task?.missionId) {
      this.logger.debug(
        `[handleTaskCompleted] Task ${payload.taskId} not found or has no mission`,
      );
      return;
    }

    const missionId = task.missionId;

    // Wait for any existing lock on this mission
    const existingLock = this.missionLocks.get(missionId);
    if (existingLock) {
      await existingLock;
    }

    // Set new lock
    let releaseLock: () => void;
    const lockPromise = new Promise<void>((resolve) => {
      releaseLock = resolve;
    });
    this.missionLocks.set(missionId, lockPromise);

    try {
      // Re-fetch task with full details since we moved the first fetch above
      const fullTask = await this.prisma.researchTask.findUnique({
        where: { id: payload.taskId },
        include: { mission: true },
      });

      if (!fullTask) {
        this.logger.debug(
          `[handleTaskCompleted] Task ${payload.taskId} not found`,
        );
        return;
      }

      const topicId = payload.topicId || fullTask.mission.topicId;

      // 评估任务完成情况
      const evaluation = await this.evaluateTaskCompletion(
        missionId,
        payload.taskId,
        topicId,
      );

      // 判断是否需要调整计划
      if (this.shouldAdaptPlan(evaluation)) {
        this.logger.log(
          `[handleTaskCompleted] Adaptive planning triggered for task ${payload.taskId}`,
        );

        // 生成调整建议
        const adjustments = await this.generatePlanAdjustments(
          missionId,
          topicId,
          evaluation,
        );

        // 如果有实质性调整，应用到计划
        if (
          adjustments.addTasks.length > 0 ||
          adjustments.removeTasks.length > 0 ||
          adjustments.reorderTasks.length > 0
        ) {
          await this.applyPlanAdjustments(missionId, adjustments);
        }
      }
    } catch (error) {
      this.logger.warn(
        `[handleTaskCompleted] Adaptive planning failed (non-fatal): ${error}`,
      );
    } finally {
      releaseLock!();
      this.missionLocks.delete(missionId);
    }
  }

  /**
   * 评估任务完成质量
   */
  async evaluateTaskCompletion(
    missionId: string,
    taskId: string,
    _topicId: string,
  ): Promise<TaskEvaluation> {
    this.logger.log(
      `[evaluateTaskCompletion] Evaluating task ${taskId} for mission ${missionId}`,
    );

    // 获取任务结果
    const task = await this.prisma.researchTask.findUnique({
      where: { id: taskId },
      select: {
        id: true,
        title: true,
        dimensionName: true,
        result: true,
        resultSummary: true,
      },
    });

    if (!task) {
      throw new Error(`Task ${taskId} not found`);
    }

    // 提取结果数据
    const result = task.result as {
      summary?: string;
      keyFindings?: Array<string | { finding: string }>;
      confidenceLevel?: string;
      evidenceUsed?: number;
      analysisResult?: {
        summary?: string;
        keyFindings?: Array<string | { finding: string }>;
      };
    } | null;

    const summary =
      result?.summary || result?.analysisResult?.summary || "无摘要";
    const keyFindings =
      result?.keyFindings || result?.analysisResult?.keyFindings || [];
    const findingsText = keyFindings
      .map((f) => (typeof f === "string" ? f : f.finding))
      .join("\n- ");

    // 使用 AI 进行质量评估
    const prompt = `你是研究质量评估专家，请评估以下维度研究任务的完成情况：

**任务信息**
- 维度：${task.dimensionName || task.title}
- 摘要：${summary}
- 关键发现：
${findingsText || "无"}

**评估要求**
1. **qualityScore**: 评估研究质量（0-100分），考虑：
   - 信息完整性
   - 证据充分性
   - 分析深度
   - 逻辑连贯性

2. **gaps**: 识别研究缺口（信息不足的地方），每个缺口包含：
   - description: 缺口描述
   - severity: 严重程度 (low/medium/high)

3. **contradictions**: 识别逻辑矛盾或冲突信息，每个矛盾包含：
   - description: 矛盾描述
   - conflictingPoints: 冲突的具体内容（字符串数组）

4. **newAngles**: 识别值得深入探索的新发现，每个新角度包含：
   - description: 新角度描述
   - potential: 潜在价值 (low/medium/high)

5. **overallAssessment**: 总体评估（1-2句话）

**输出格式**
返回 JSON：
{
  "taskId": "${taskId}",
  "dimensionName": "${task.dimensionName || task.title}",
  "qualityScore": 85,
  "gaps": [
    {
      "description": "缺少关于X的数据",
      "severity": "medium"
    }
  ],
  "contradictions": [],
  "newAngles": [
    {
      "description": "发现Y趋势值得关注",
      "potential": "high"
    }
  ],
  "overallAssessment": "研究质量良好，但需补充X相关数据"
}`;

    try {
      const response = await this.aiFacade.chat({
        messages: [
          {
            role: "system",
            content: "你是研究质量评估专家，请输出 JSON 格式的评估结果。",
          },
          { role: "user", content: prompt },
        ],
        taskProfile: {
          creativity: "low", // 确定性分析
          outputLength: "medium",
        },
        modelType: AIModelType.CHAT, // 使用 CHAT 模型进行分析
      });

      // 解析 JSON 响应
      const extractResult = extractJsonFromAIResponse<TaskEvaluation>(
        response.content,
        { requiredKey: "qualityScore" },
      );

      if (!extractResult.success || !extractResult.data) {
        this.logger.warn(
          `[evaluateTaskCompletion] Failed to parse AI evaluation, using default`,
        );
        return this.createDefaultEvaluation(taskId, task.dimensionName);
      }

      this.logger.log(
        `[evaluateTaskCompletion] Task ${taskId} quality score: ${extractResult.data.qualityScore}`,
      );
      return extractResult.data;
    } catch (error) {
      this.logger.error(
        `[evaluateTaskCompletion] AI evaluation failed: ${error}`,
      );
      return this.createDefaultEvaluation(taskId, task.dimensionName);
    }
  }

  /**
   * 判断是否需要调整计划
   */
  shouldAdaptPlan(evaluation: TaskEvaluation): boolean {
    // 质量评分低于 60 分，说明研究不充分
    if (evaluation.qualityScore < 60) {
      this.logger.log(
        `[shouldAdaptPlan] Quality score ${evaluation.qualityScore} < 60, adaptation needed`,
      );
      return true;
    }

    // 有高严重性的缺口
    const highSeverityGaps = evaluation.gaps.filter(
      (g) => g.severity === "high",
    );
    if (highSeverityGaps.length > 0) {
      this.logger.log(
        `[shouldAdaptPlan] ${highSeverityGaps.length} high severity gaps found`,
      );
      return true;
    }

    // 有矛盾需要解决
    if (evaluation.contradictions.length > 0) {
      this.logger.log(
        `[shouldAdaptPlan] ${evaluation.contradictions.length} contradictions found`,
      );
      return true;
    }

    // 有高潜力的新角度
    const highPotentialAngles = evaluation.newAngles.filter(
      (a) => a.potential === "high",
    );
    if (highPotentialAngles.length > 0) {
      this.logger.log(
        `[shouldAdaptPlan] ${highPotentialAngles.length} high potential new angles found`,
      );
      return true;
    }

    this.logger.debug(`[shouldAdaptPlan] No adaptation needed`);
    return false;
  }

  /**
   * 生成计划调整建议
   */
  async generatePlanAdjustments(
    missionId: string,
    topicId: string,
    evaluation: TaskEvaluation,
  ): Promise<PlanAdjustments> {
    this.logger.log(
      `[generatePlanAdjustments] Generating adjustments for mission ${missionId}`,
    );

    // 发送 Leader 思考事件
    await this.eventEmitter.emitLeaderThinking(topicId, {
      missionId,
      phase: "analyzing",
      content: `正在分析「${evaluation.dimensionName}」的研究结果，评估是否需要调整计划...`,
      progress: 10,
    });

    // 获取当前 LeaderPlan 和已完成的任务
    const mission = await this.prisma.researchMission.findUnique({
      where: { id: missionId },
      select: {
        leaderPlan: true,
        tasks: {
          select: {
            id: true,
            title: true,
            dimensionName: true,
            status: true,
            resultSummary: true,
          },
        },
      },
    });

    if (!mission) {
      throw new Error(`Mission ${missionId} not found`);
    }

    const leaderPlan = mission.leaderPlan as LeaderPlan | null;
    const completedTasks = mission.tasks.filter(
      (t) => t.status === "COMPLETED",
    );

    // 构建 AI 分析 prompt
    const prompt = `你是研究协调专家 Leader，请根据以下信息提出计划调整建议：

**当前研究主题**
${leaderPlan?.taskUnderstanding?.topic || "未知主题"}

**原始计划维度**
${leaderPlan?.dimensions?.map((d) => `- ${d.name}: ${d.description}`).join("\n") || "无"}

**已完成任务**
${completedTasks.map((t) => `- ${t.title} (${t.dimensionName || "通用"})`).join("\n")}

**最近完成任务评估**
- 维度：${evaluation.dimensionName}
- 质量评分：${evaluation.qualityScore}/100
- 研究缺口：${evaluation.gaps.map((g) => `${g.description} (${g.severity})`).join("; ") || "无"}
- 矛盾点：${evaluation.contradictions.map((c) => c.description).join("; ") || "无"}
- 新发现：${evaluation.newAngles.map((a) => `${a.description} (${a.potential})`).join("; ") || "无"}
- 总体评估：${evaluation.overallAssessment}

**调整要求**
基于评估结果，提出计划调整建议：
1. **addTasks**: 需要新增的任务（补充缺口、深入新角度）
2. **removeTasks**: 可以移除的冗余任务
3. **reorderTasks**: 需要调整优先级的任务
4. **adjustmentRationale**: 调整的总体理由

**输出格式**
返回 JSON：
{
  "addTasks": [
    {
      "title": "任务标题",
      "description": "任务描述",
      "dimensionName": "所属维度（可选）",
      "priority": 1,
      "reasoning": "为什么添加这个任务"
    }
  ],
  "removeTasks": [],
  "reorderTasks": [],
  "adjustmentRationale": "总体调整理由"
}

注意：
- 只在必要时调整，避免过度干预
- 新增任务应明确、可执行
- 优先级：1=最高，越大越低`;

    try {
      const response = await this.aiFacade.chat({
        messages: [
          {
            role: "system",
            content: "你是研究协调专家，请输出 JSON 格式的计划调整建议。",
          },
          { role: "user", content: prompt },
        ],
        taskProfile: {
          creativity: "low", // 确定性分析
          outputLength: "medium",
        },
        modelType: AIModelType.CHAT,
      });

      // 解析 JSON 响应
      const extractResult = extractJsonFromAIResponse<PlanAdjustments>(
        response.content,
        { requiredKey: "adjustmentRationale" },
      );

      if (!extractResult.success || !extractResult.data) {
        this.logger.warn(
          `[generatePlanAdjustments] Failed to parse AI response, using empty adjustments`,
        );
        return this.createEmptyAdjustments();
      }

      await this.eventEmitter.emitLeaderThinking(topicId, {
        missionId,
        phase: "planning",
        content: `计划调整建议：${extractResult.data.adjustmentRationale}`,
        progress: 50,
      });

      this.logger.log(
        `[generatePlanAdjustments] Generated ${extractResult.data.addTasks.length} new tasks, ` +
          `${extractResult.data.removeTasks.length} removals, ` +
          `${extractResult.data.reorderTasks.length} reorderings`,
      );

      return extractResult.data;
    } catch (error) {
      this.logger.error(`[generatePlanAdjustments] AI call failed: ${error}`);
      return this.createEmptyAdjustments();
    }
  }

  /**
   * 应用计划调整
   */
  async applyPlanAdjustments(
    missionId: string,
    adjustments: PlanAdjustments,
  ): Promise<void> {
    this.logger.log(
      `[applyPlanAdjustments] Applying adjustments to mission ${missionId}`,
    );

    const mission = await this.prisma.researchMission.findUnique({
      where: { id: missionId },
      select: { leaderPlan: true, topicId: true },
    });

    if (!mission) {
      throw new Error(`Mission ${missionId} not found`);
    }

    const leaderPlan = (mission.leaderPlan as LeaderPlan | null) || {
      taskUnderstanding: { topic: "", scope: "", objectives: [] },
      dimensions: [],
      executionStrategy: { parallelism: 5, priorityOrder: [] },
      agentAssignments: [],
    };

    // 1. 添加新任务到数据库
    for (const newTask of adjustments.addTasks) {
      await this.prisma.researchTask.create({
        data: {
          missionId,
          taskType: "dimension_research",
          title: newTask.title,
          description: newTask.description,
          dimensionName: newTask.dimensionName,
          priority: newTask.priority,
          status: "PENDING",
          assignedAgent: `researcher-adaptive-${Date.now()}`,
        },
      });

      this.logger.log(`[applyPlanAdjustments] Added task: ${newTask.title}`);
    }

    // 2. 移除任务（标记为 FAILED）
    for (const removal of adjustments.removeTasks) {
      await this.prisma.researchTask.updateMany({
        where: {
          id: removal.taskId,
          missionId,
          status: "PENDING", // 只能移除待处理的任务
        },
        data: {
          status: "FAILED",
          resultSummary: `已取消: ${removal.reasoning}`,
        },
      });

      this.logger.log(`[applyPlanAdjustments] Removed task: ${removal.taskId}`);
    }

    // 3. 重新排序任务
    for (const reorder of adjustments.reorderTasks) {
      await this.prisma.researchTask.updateMany({
        where: {
          id: reorder.taskId,
          missionId,
        },
        data: {
          priority: reorder.newPriority,
        },
      });

      this.logger.log(
        `[applyPlanAdjustments] Reordered task: ${reorder.taskId} to priority ${reorder.newPriority}`,
      );
    }

    // 4. 更新 LeaderPlan 记录调整
    await this.prisma.researchMission.update({
      where: { id: missionId },
      data: {
        leaderPlan: toPrismaJson({
          ...leaderPlan,
          adaptiveAdjustments: [
            ...((leaderPlan as { adaptiveAdjustments?: unknown[] })
              .adaptiveAdjustments || []),
            {
              timestamp: new Date().toISOString(),
              rationale: adjustments.adjustmentRationale,
              addedTasks: adjustments.addTasks.length,
              removedTasks: adjustments.removeTasks.length,
              reorderedTasks: adjustments.reorderTasks.length,
            },
          ],
        }),
      },
    });

    // 5. 发送 WebSocket 事件通知前端
    await this.eventEmitter.emitLeaderThinking(mission.topicId, {
      missionId,
      phase: "planning",
      content: `已应用自适应调整：新增 ${adjustments.addTasks.length} 个任务`,
      progress: 100,
    });

    this.logger.log(
      `[applyPlanAdjustments] Successfully applied adjustments to mission ${missionId}`,
    );
  }

  /**
   * 创建默认评估（当 AI 失败时）
   */
  private createDefaultEvaluation(
    taskId: string,
    dimensionName: string | null,
  ): TaskEvaluation {
    return {
      taskId,
      dimensionName: dimensionName || "未知维度",
      qualityScore: 70, // 默认合格
      gaps: [],
      contradictions: [],
      newAngles: [],
      overallAssessment: "评估暂时不可用，默认为合格",
    };
  }

  /**
   * 创建空调整（当 AI 失败或无需调整时）
   */
  private createEmptyAdjustments(): PlanAdjustments {
    return {
      addTasks: [],
      removeTasks: [],
      reorderTasks: [],
      adjustmentRationale: "当前计划无需调整",
    };
  }
}
