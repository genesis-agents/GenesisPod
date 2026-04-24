/**
 * Leader Agent Selection Service
 *
 * 来源：baseline `38347e2a7:services/core/leader/leader-agent-selection.service.ts` (419 行)
 *
 * 用途：用户新增 TODO 时（Leader 对话场景）规则驱动地为 task 分配 agent。
 *   - 优先复用 mission 已有 researcher agent 中工作负载**最低**的
 *   - 无现成 agent → 新建 `researcher_user_${timestamp}`
 *   - modelId：随机挑选 chat（非推理）模型，实现多元化
 *   - skills / tools：按关键词分类（selectSkillsAndToolsForTask）
 *
 * 业务不变量：
 *   - 纯规则驱动，**不调 LLM**（响应快）
 *   - agent 复用时选 minLoad
 *   - skills ≤ 5, tools ≤ 3（硬上限）
 *   - decision 记录到 leaderDecision 表（ADJUST 类型）
 */

import { Injectable, Logger } from "@nestjs/common";
import { LeaderDecisionType, AIModelType } from "@prisma/client";
import { PrismaService } from "@/common/prisma/prisma.service";
import { ChatFacade } from "@/modules/ai-engine/facade";
import { toPrismaJson } from "@/common/utils/prisma-json.utils";
import type { AgentAssignment } from "@/modules/ai-app/topic-insights/agents/specs/schemas";
import { selectSkillsAndToolsForTask } from "@/modules/ai-app/topic-insights/shared/config/task-keyword-routing";

@Injectable()
export class LeaderAgentSelectionService {
  private readonly logger = new Logger(LeaderAgentSelectionService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly chatFacade: ChatFacade,
  ) {}

  /**
   * 为用户请求的任务选择合适的 Agent（baseline L39-L172 对齐）。
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

    // 1. 读 mission 的 researcher 工作负载
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

    // 2. 可用模型（过滤 isAvailable + 去掉 reasoning，只要 chat）
    const allModelsRaw = await this.chatFacade
      .getAvailableModelsExtended(AIModelType.CHAT)
      .catch((err: unknown) => {
        this.logger.warn(
          `[selectAgentForTask] getAvailableModelsExtended failed: ${err instanceof Error ? err.message : String(err)}`,
        );
        return [] as Array<{
          id: string;
          isAvailable?: boolean;
          isReasoning?: boolean;
        }>;
      });
    const availableModels = allModelsRaw.filter((m) => m.isAvailable !== false);
    const chatModels = availableModels.filter((m) => !m.isReasoning);

    // 3. 工作负载统计
    const agentWorkload = new Map<string, number>();
    const agentModels = new Map<string, string>();
    if (mission?.tasks) {
      for (const task of mission.tasks) {
        const agentId = task.assignedAgent;
        agentWorkload.set(agentId, (agentWorkload.get(agentId) || 0) + 1);
        if (task.modelId) {
          agentModels.set(agentId, task.modelId);
        }
      }
    }

    const modelsToUse = chatModels.length > 0 ? chatModels : availableModels;
    const defaultModel = modelsToUse[0]?.id || "";

    let selectedAgentId: string;
    let selectedModelId: string;
    let agentName: string;

    if (agentWorkload.size > 0) {
      // 选 minLoad agent
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

      const idMatch = selectedAgentId.match(/(\d+)$/);
      const agentNum = idMatch ? idMatch[1] : String(agentWorkload.size);
      agentName = `研究员 ${agentNum}`;

      this.logger.log(
        `[selectAgentForTask] Reusing agent: ${selectedAgentId} (load=${minLoad}) model=${selectedModelId}`,
      );
    } else {
      // 新建 agent
      selectedAgentId = `researcher_user_${Date.now()}`;
      if (modelsToUse.length > 0) {
        selectedModelId =
          modelsToUse[Math.floor(Math.random() * modelsToUse.length)].id;
      } else {
        selectedModelId = "";
      }
      agentName = "新研究员";

      this.logger.log(
        `[selectAgentForTask] Created new agent: ${selectedAgentId} model=${selectedModelId}`,
      );
    }

    // 4. skills / tools 路由
    const { skills, tools } = selectSkillsAndToolsForTask(
      taskTitle,
      taskDescription,
    );
    this.logger.log(
      `[selectAgentForTask] skills=[${skills.join(",")}] tools=[${tools.join(",")}]`,
    );

    // 5. 记录 decision
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
      this.logger.error(
        `[recordDecision] Failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
}
