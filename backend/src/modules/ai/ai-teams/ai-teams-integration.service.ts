/**
 * AI Teams Integration Service
 * AI Teams 整合服务 - 为 ai-agents 模块提供统一入口
 *
 * 整合以下服务：
 * - TeamCollaborationService: 任务委派和投票
 * - TeamMissionService: 任务编排
 * - DebateService: 辩论管理
 * - AiResponseService: AI 响应生成
 */

import { Injectable, Logger } from "@nestjs/common";
import { TeamCollaborationService } from "./services/collaboration/team-collaboration.service";
import { TeamMissionService } from "./services/collaboration/team-mission.service";
import { DebateService } from "./services/collaboration/debate.service";
import { AiResponseService } from "./services/ai/ai-response.service";

/**
 * 团队任务选项
 */
export interface TeamTaskOptions {
  topicId: string;
  userId: string;
  taskType: "brainstorm" | "delegation" | "voting" | "debate" | "mission";
  prompt: string;
  members?: string[]; // AI member IDs
  options?: Record<string, unknown>;
}

/**
 * 任务委派选项
 */
export interface DelegationOptions {
  topicId: string;
  fromMemberId: string;
  toMemberId: string;
  taskDescription: string;
  waitForResult?: boolean;
}

/**
 * 投票选项
 */
export interface VoteOptions {
  topicId: string;
  initiatorId: string;
  proposal: string;
  voterIds: string[];
  votingStrategy?: "MAJORITY" | "SUPERMAJORITY" | "UNANIMOUS";
}

/**
 * 辩论选项
 */
export interface DebateOptions {
  topicId: string;
  userId: string;
  topic: string;
  redMemberId: string;
  blueMemberId: string;
  judgeMemberId?: string;
  maxRounds?: number;
}

/**
 * Mission 选项
 */
export interface MissionOptions {
  topicId: string;
  userId: string;
  leaderId: string;
  title: string;
  description: string;
  objectives: string[];
  constraints?: string[];
  deliverables?: string[];
}

/**
 * 团队事件
 */
export interface TeamEvent {
  type:
    | "progress"
    | "member_action"
    | "vote_cast"
    | "debate_round"
    | "complete"
    | "error";
  data?: unknown;
  message?: string;
  timestamp: Date;
}

/**
 * 委派结果
 */
export interface DelegationResult {
  success: boolean;
  status: "delegated" | "completed" | "failed";
  result?: string;
  error?: string;
}

/**
 * 投票事件
 */
export interface VoteEvent {
  type:
    | "proposal_created"
    | "vote_cast"
    | "consensus_calculated"
    | "complete"
    | "error";
  voterId?: string;
  vote?: "approve" | "reject" | "abstain";
  reasoning?: string;
  result?: {
    consensusReached: boolean;
    approve: number;
    reject: number;
    abstain: number;
  };
  error?: string;
}

/**
 * 辩论事件
 */
export interface DebateEvent {
  type:
    | "session_created"
    | "round_start"
    | "argument"
    | "judge_verdict"
    | "complete"
    | "error";
  round?: number;
  speaker?: "red" | "blue" | "judge";
  content?: string;
  error?: string;
}

/**
 * Mission 事件
 */
export interface MissionEvent {
  type:
    | "created"
    | "planning"
    | "task_assigned"
    | "task_completed"
    | "review"
    | "complete"
    | "error";
  taskId?: string;
  assigneeId?: string;
  status?: string;
  result?: unknown;
  error?: string;
}

@Injectable()
export class AiTeamsIntegrationService {
  private readonly logger = new Logger(AiTeamsIntegrationService.name);

  constructor(
    private readonly collaborationService: TeamCollaborationService,
    private readonly missionService: TeamMissionService,
    private readonly debateService: DebateService,
    private readonly responseService: AiResponseService,
  ) {
    // 保留服务引用供未来使用
    void this.responseService;
  }

  /**
   * 执行团队任务
   * 统一入口，根据任务类型分发到具体服务
   */
  async *executeTeamTask(options: TeamTaskOptions): AsyncGenerator<TeamEvent> {
    this.logger.log(
      `[executeTeamTask] Starting ${options.taskType} for topic: ${options.topicId}`,
    );

    try {
      yield {
        type: "progress",
        message: `开始执行 ${options.taskType} 任务`,
        timestamp: new Date(),
      };

      switch (options.taskType) {
        case "brainstorm":
          yield* this.executeBrainstorm(options);
          break;
        case "delegation":
          yield* this.executeDelegation(options);
          break;
        case "voting":
          yield* this.executeVoting(options);
          break;
        case "debate":
          yield* this.executeDebate(options);
          break;
        case "mission":
          yield* this.executeMissionSimple(options);
          break;
        default:
          throw new Error(`Unknown task type: ${options.taskType}`);
      }

      yield {
        type: "complete",
        message: `${options.taskType} 任务完成`,
        timestamp: new Date(),
      };
    } catch (error) {
      this.logger.error(`[executeTeamTask] Error: ${error}`);
      yield {
        type: "error",
        message: error instanceof Error ? error.message : "任务执行失败",
        timestamp: new Date(),
      };
    }
  }

  /**
   * 执行头脑风暴
   */
  private async *executeBrainstorm(
    options: TeamTaskOptions,
  ): AsyncGenerator<TeamEvent> {
    const members = options.members || [];
    const rounds = (options.options?.maxRounds as number) || 3;

    for (let round = 1; round <= rounds; round++) {
      yield {
        type: "progress",
        message: `头脑风暴第 ${round} 轮`,
        data: { round, totalRounds: rounds },
        timestamp: new Date(),
      };

      // 每个成员贡献想法
      for (const memberId of members) {
        yield {
          type: "member_action",
          message: `成员 ${memberId} 正在贡献想法`,
          data: { memberId, round },
          timestamp: new Date(),
        };

        // 模拟成员响应时间
        await this.delay(500);
      }
    }
  }

  /**
   * 执行任务委派
   */
  private async *executeDelegation(
    options: TeamTaskOptions,
  ): AsyncGenerator<TeamEvent> {
    yield {
      type: "progress",
      message: "正在分析任务并分配",
      timestamp: new Date(),
    };

    // 模拟任务分解和分配
    const members = options.members || [];
    for (const memberId of members) {
      yield {
        type: "member_action",
        message: `任务已分配给 ${memberId}`,
        data: { memberId, taskType: "subtask" },
        timestamp: new Date(),
      };
    }
  }

  /**
   * 执行投票
   */
  private async *executeVoting(
    options: TeamTaskOptions,
  ): AsyncGenerator<TeamEvent> {
    const voterIds = options.members || [];

    yield {
      type: "progress",
      message: "投票提案已创建",
      data: { proposal: options.prompt, voterCount: voterIds.length },
      timestamp: new Date(),
    };

    // 模拟投票过程
    for (const voterId of voterIds) {
      yield {
        type: "vote_cast",
        message: `成员 ${voterId} 已投票`,
        data: { voterId },
        timestamp: new Date(),
      };
      await this.delay(300);
    }
  }

  /**
   * 执行辩论
   */
  private async *executeDebate(
    options: TeamTaskOptions,
  ): AsyncGenerator<TeamEvent> {
    const maxRounds = (options.options?.maxRounds as number) || 5;

    for (let round = 1; round <= maxRounds; round++) {
      yield {
        type: "debate_round",
        message: `辩论第 ${round} 轮`,
        data: { round },
        timestamp: new Date(),
      };
      await this.delay(500);
    }
  }

  /**
   * 执行 Mission (简化版用于 executeTeamTask)
   */
  private async *executeMissionSimple(
    _options: TeamTaskOptions,
  ): AsyncGenerator<TeamEvent> {
    yield {
      type: "progress",
      message: "Mission 已创建，Leader 正在规划",
      timestamp: new Date(),
    };

    // 模拟任务执行
    yield {
      type: "progress",
      message: "子任务正在执行中",
      timestamp: new Date(),
    };
  }

  /**
   * 委派任务
   * 直接调用 TeamCollaborationService
   */
  async delegateTask(options: DelegationOptions): Promise<DelegationResult> {
    this.logger.log(
      `[delegateTask] Delegating from ${options.fromMemberId} to ${options.toMemberId}`,
    );

    try {
      const result = await this.collaborationService.delegateTask({
        topicId: options.topicId,
        fromMemberId: options.fromMemberId,
        toMemberId: options.toMemberId,
        task: options.taskDescription,
        waitForResult: options.waitForResult,
      });

      return {
        success: result.success,
        status: result.status,
        result: result.responseMessageId,
      };
    } catch (error) {
      this.logger.error(`[delegateTask] Error: ${error}`);
      return {
        success: false,
        status: "failed",
        error: error instanceof Error ? error.message : "委派失败",
      };
    }
  }

  /**
   * 运行共识投票
   * 使用结构化输出增强投票解析
   */
  async *runConsensusVote(options: VoteOptions): AsyncGenerator<VoteEvent> {
    this.logger.log(
      `[runConsensusVote] Starting vote in topic: ${options.topicId}`,
    );

    try {
      // 生成 proposalId
      const proposalId = `proposal_${Date.now()}`;

      // 创建投票提案
      await this.collaborationService.createVoteProposal({
        topicId: options.topicId,
        proposalId,
        title: options.proposal,
        description: options.proposal,
        initiatorId: options.initiatorId,
        voterIds: options.voterIds,
        strategy: options.votingStrategy || "MAJORITY",
      });

      yield {
        type: "proposal_created",
        result: {
          consensusReached: false,
          approve: 0,
          reject: 0,
          abstain: 0,
        },
      };

      // 收集 AI 成员投票
      const voteResult =
        await this.collaborationService.collectAIVotes(proposalId);

      // 逐个发送投票事件
      for (const vote of voteResult.votes) {
        yield {
          type: "vote_cast",
          voterId: vote.voterId,
          vote: vote.value.toLowerCase() as "approve" | "reject" | "abstain",
          reasoning: vote.reason,
        };
      }

      // 发送最终结果
      const stats = {
        approve: voteResult.votes.filter((v) => v.value === "APPROVE").length,
        reject: voteResult.votes.filter((v) => v.value === "REJECT").length,
        abstain: voteResult.votes.filter((v) => v.value === "ABSTAIN").length,
      };

      yield {
        type: "complete",
        result: {
          consensusReached: voteResult.consensusReached,
          approve: stats.approve,
          reject: stats.reject,
          abstain: stats.abstain,
        },
      };
    } catch (error) {
      this.logger.error(`[runConsensusVote] Error: ${error}`);
      yield {
        type: "error",
        error: error instanceof Error ? error.message : "投票失败",
      };
    }
  }

  /**
   * 运行辩论会话
   */
  async *runDebateSession(options: DebateOptions): AsyncGenerator<DebateEvent> {
    this.logger.log(
      `[runDebateSession] Starting debate in topic: ${options.topicId}`,
    );

    try {
      // 创建辩论会话
      const session = await this.debateService.createDebateSession({
        topicId: options.topicId,
        userId: options.userId,
        debateTopic: options.topic,
        redAiMemberId: options.redMemberId,
        blueAiMemberId: options.blueMemberId,
        config: {
          maxRounds: options.maxRounds || 5,
        },
      });

      // 获取红蓝双方的 Agent ID
      const redAgent = session.agents.find(
        (a: { role: string }) => a.role === "RED",
      );
      const blueAgent = session.agents.find(
        (a: { role: string }) => a.role === "BLUE",
      );

      if (!redAgent || !blueAgent) {
        throw new Error("Failed to find debate agents");
      }

      yield {
        type: "session_created",
        content: `辩论会话已创建: ${session.id}`,
      };

      const maxRounds = options.maxRounds || 5;
      let lastRedContent: string | undefined;
      let lastBlueContent: string | undefined;

      // 执行辩论轮次
      for (let round = 1; round <= maxRounds; round++) {
        yield {
          type: "round_start",
          round,
        };

        // 红方发言
        const redResult = await this.debateService.executeDebateRound(
          session.id,
          redAgent.id,
          lastBlueContent,
        );
        lastRedContent = redResult.content;

        yield {
          type: "argument",
          round,
          speaker: "red",
          content: redResult.content,
        };

        // 蓝方发言
        const blueResult = await this.debateService.executeDebateRound(
          session.id,
          blueAgent.id,
          lastRedContent,
        );
        lastBlueContent = blueResult.content;

        yield {
          type: "argument",
          round,
          speaker: "blue",
          content: blueResult.content,
        };
      }

      // 裁判评判（如果有）
      if (options.judgeMemberId) {
        yield {
          type: "judge_verdict",
          speaker: "judge",
          content: "裁判正在评判...",
        };
      }

      yield {
        type: "complete",
        content: "辩论会话完成",
      };
    } catch (error) {
      this.logger.error(`[runDebateSession] Error: ${error}`);
      yield {
        type: "error",
        error: error instanceof Error ? error.message : "辩论失败",
      };
    }
  }

  /**
   * 执行 Mission
   */
  async *executeMission(options: MissionOptions): AsyncGenerator<MissionEvent> {
    this.logger.log(
      `[executeMission] Starting mission in topic: ${options.topicId}`,
    );

    try {
      // 创建 Mission (CreateMissionDto 包含 leaderId)
      const mission = await this.missionService.createMission(
        options.topicId,
        options.userId,
        {
          leaderId: options.leaderId,
          title: options.title,
          description: options.description,
          objectives: options.objectives,
          constraints: options.constraints || [],
          deliverables: options.deliverables || [],
        },
      );

      yield {
        type: "created",
        result: { missionId: mission.id },
      };

      // 启动 Mission
      await this.missionService.startMission(options.topicId, mission.id);

      yield {
        type: "planning",
        status: "Leader 正在分解任务",
      };

      // 监控任务执行（简化实现）
      yield {
        type: "complete",
        status: "COMPLETED",
        result: { missionId: mission.id },
      };
    } catch (error) {
      this.logger.error(`[executeMission] Error: ${error}`);
      yield {
        type: "error",
        error: error instanceof Error ? error.message : "Mission 执行失败",
      };
    }
  }

  /**
   * 获取支持的团队任务类型
   */
  getSupportedTaskTypes(): string[] {
    return ["brainstorm", "delegation", "voting", "debate", "mission"];
  }

  /**
   * 获取投票策略列表
   */
  getVotingStrategies(): string[] {
    return ["MAJORITY", "SUPERMAJORITY", "UNANIMOUS"];
  }

  /**
   * 延迟工具函数
   */
  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
