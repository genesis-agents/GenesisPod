/**
 * Team Collaboration Service
 * 桥接 ai-agents 协作工具与 ai-teams 成员系统
 */

import { Injectable, Logger, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../../../../../common/prisma/prisma.service";
import { AiResponseService } from "../ai/ai-response.service";
import { randomUUID } from "crypto";

// ============================================================================
// Types
// ============================================================================

/**
 * 任务委派请求
 */
export interface HandoffRequest {
  topicId: string;
  fromMemberId: string; // 发起委派的成员
  toMemberId: string; // 目标成员
  task: string; // 任务描述
  context?: Record<string, unknown>;
  waitForResult?: boolean;
}

/**
 * 任务委派结果
 */
export interface HandoffResult {
  success: boolean;
  handoffId: string;
  targetMemberName: string;
  status: "delegated" | "completed" | "failed";
  responseMessageId?: string;
  error?: string;
}

/**
 * 投票请求
 */
export interface VoteRequest {
  topicId: string;
  proposalId: string;
  title: string;
  description: string;
  initiatorId: string; // 发起者（AI成员ID）
  voterIds: string[]; // 参与投票的成员ID列表
  strategy: "MAJORITY" | "SUPERMAJORITY" | "UNANIMOUS";
  options?: string[];
}

/**
 * 投票结果
 */
export interface VoteResult {
  success: boolean;
  proposalId: string;
  consensusReached: boolean;
  decision: string;
  votes: Array<{
    voterId: string;
    voterName: string;
    value: string;
    reason?: string;
  }>;
}

/**
 * 存储的提案数据
 */
interface StoredProposal extends VoteRequest {
  votes: Array<{
    voterId: string;
    voterName: string;
    value: "APPROVE" | "REJECT" | "ABSTAIN";
    reason?: string;
    timestamp: string;
  }>;
  status: "OPEN" | "CLOSED";
  createdAt: string;
}

// ============================================================================
// Service Implementation
// ============================================================================

@Injectable()
export class TeamCollaborationService {
  private readonly logger = new Logger(TeamCollaborationService.name);

  // 存储活跃的提案
  private proposals = new Map<string, StoredProposal>();

  constructor(
    private prisma: PrismaService,
    private aiResponseService: AiResponseService,
  ) {}

  /**
   * 委派任务给其他AI成员
   */
  async delegateTask(request: HandoffRequest): Promise<HandoffResult> {
    const handoffId = randomUUID();
    const {
      topicId,
      fromMemberId,
      toMemberId,
      task,
      context,
      waitForResult = false,
    } = request;

    this.logger.log(
      `[delegateTask] ${fromMemberId} -> ${toMemberId}: ${task.substring(0, 50)}...`,
    );

    try {
      // 1. 验证成员存在
      const [fromMember, toMember] = await Promise.all([
        this.prisma.topicAIMember.findFirst({
          where: { id: fromMemberId, topicId },
          select: { id: true, displayName: true },
        }),
        this.prisma.topicAIMember.findFirst({
          where: { id: toMemberId, topicId },
          select: { id: true, displayName: true, aiModel: true },
        }),
      ]);

      if (!fromMember) {
        throw new NotFoundException(
          `From member ${fromMemberId} not found in topic`,
        );
      }

      if (!toMember) {
        throw new NotFoundException(
          `To member ${toMemberId} not found in topic`,
        );
      }

      // 2. 创建委派消息
      const delegationMessage = await this.prisma.topicMessage.create({
        data: {
          topicId,
          aiMemberId: fromMemberId,
          content: `[任务委派] 委派给 @${toMember.displayName}\n\n**任务**：${task}\n\n${context ? `**上下文**：\n\`\`\`json\n${JSON.stringify(context, null, 2)}\n\`\`\`` : ""}`,
          contentType: "TEXT",
          modelUsed: "system",
          tokensUsed: 0,
        },
      });

      this.logger.log(
        `[delegateTask] Created delegation message ${delegationMessage.id}`,
      );

      // 3. 如果 waitForResult=true，调用目标 AI 生成响应
      if (waitForResult) {
        try {
          // 构造任务消息作为上下文
          const taskContextMessage = await this.prisma.topicMessage.create({
            data: {
              topicId,
              senderId: null, // 系统消息
              content: `@${toMember.displayName}\n\n${task}`,
              contentType: "TEXT",
            },
          });

          this.logger.log(
            `[delegateTask] Waiting for AI response from ${toMember.displayName}...`,
          );

          // 调用 AI 生成响应
          const response = await this.aiResponseService.generateAIResponse(
            topicId,
            "system", // 系统用户
            toMemberId,
            [taskContextMessage.id],
          );

          return {
            success: true,
            handoffId,
            targetMemberName: toMember.displayName,
            status: "completed",
            responseMessageId: response.id,
          };
        } catch (error) {
          this.logger.error(
            `[delegateTask] AI response generation failed:`,
            error,
          );

          return {
            success: false,
            handoffId,
            targetMemberName: toMember.displayName,
            status: "failed",
            error: error instanceof Error ? error.message : "Unknown error",
          };
        }
      }

      // 异步模式：立即返回
      return {
        success: true,
        handoffId,
        targetMemberName: toMember.displayName,
        status: "delegated",
      };
    } catch (error) {
      this.logger.error(`[delegateTask] Failed:`, error);

      return {
        success: false,
        handoffId,
        targetMemberName: "Unknown",
        status: "failed",
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }

  /**
   * 发起共识投票
   */
  async createVoteProposal(
    request: VoteRequest,
  ): Promise<{ proposalId: string; status: string }> {
    const {
      topicId,
      proposalId,
      title,
      description,
      initiatorId,
      voterIds,
      strategy,
      options,
    } = request;

    this.logger.log(
      `[createVoteProposal] Creating proposal ${proposalId} in topic ${topicId}`,
    );

    try {
      // 1. 验证发起者
      const initiator = await this.prisma.topicAIMember.findFirst({
        where: { id: initiatorId, topicId },
        select: { id: true, displayName: true },
      });

      if (!initiator) {
        throw new NotFoundException(
          `Initiator ${initiatorId} not found in topic`,
        );
      }

      // 2. 验证所有投票者
      const voters = await this.prisma.topicAIMember.findMany({
        where: {
          id: { in: voterIds },
          topicId,
        },
        select: { id: true, displayName: true },
      });

      if (voters.length !== voterIds.length) {
        const foundIds = voters.map((v) => v.id);
        const missingIds = voterIds.filter((id) => !foundIds.includes(id));
        throw new Error(
          `Some voters not found in topic: ${missingIds.join(", ")}`,
        );
      }

      // 3. 创建并存储提案
      const proposal: StoredProposal = {
        ...request,
        votes: [],
        status: "OPEN",
        createdAt: new Date().toISOString(),
      };

      this.proposals.set(proposalId, proposal);

      // 4. 创建提案消息
      const optionsText =
        options && options.length > 0
          ? `\n\n**选项**：\n${options.map((opt, i) => `${i + 1}. ${opt}`).join("\n")}`
          : "";

      await this.prisma.topicMessage.create({
        data: {
          topicId,
          aiMemberId: initiatorId,
          content: `📊 **[共识投票]**\n\n**提案**：${title}\n\n**描述**：${description}${optionsText}\n\n**策略**：${strategy}\n**投票者**：${voters.map((v) => `@${v.displayName}`).join(", ")}\n\n提案ID: \`${proposalId}\``,
          contentType: "TEXT",
          modelUsed: "system",
          tokensUsed: 0,
        },
      });

      this.logger.log(
        `[createVoteProposal] Proposal ${proposalId} created successfully`,
      );

      return {
        proposalId,
        status: "OPEN",
      };
    } catch (error) {
      this.logger.error(`[createVoteProposal] Failed:`, error);
      throw error;
    }
  }

  /**
   * AI成员投票
   */
  async castMemberVote(
    proposalId: string,
    memberId: string,
    value: "APPROVE" | "REJECT" | "ABSTAIN",
    reason?: string,
  ): Promise<{ success: boolean; statistics: any }> {
    this.logger.log(
      `[castMemberVote] Member ${memberId} voting ${value} on proposal ${proposalId}`,
    );

    try {
      const proposal = this.proposals.get(proposalId);

      if (!proposal) {
        throw new Error("Proposal not found");
      }

      if (proposal.status === "CLOSED") {
        throw new Error("Voting is closed");
      }

      // 验证投票者权限
      if (!proposal.voterIds.includes(memberId)) {
        throw new Error("Member is not in voter list");
      }

      // 检查是否已投票
      const existingVote = proposal.votes.find((v) => v.voterId === memberId);
      if (existingVote) {
        throw new Error("Member has already voted");
      }

      // 获取成员信息
      const member = await this.prisma.topicAIMember.findFirst({
        where: { id: memberId, topicId: proposal.topicId },
        select: { displayName: true },
      });

      if (!member) {
        throw new Error("Member not found");
      }

      // 记录投票
      proposal.votes.push({
        voterId: memberId,
        voterName: member.displayName,
        value,
        reason,
        timestamp: new Date().toISOString(),
      });

      // 计算统计
      const statistics = this.calculateStatistics(proposal);

      this.logger.log(
        `[castMemberVote] Vote recorded: ${member.displayName} -> ${value}`,
      );

      return {
        success: true,
        statistics,
      };
    } catch (error) {
      this.logger.error(`[castMemberVote] Failed:`, error);
      throw error;
    }
  }

  /**
   * 自动收集所有AI成员的投票
   * 让每个AI成员基于上下文自主决定投票
   */
  async collectAIVotes(proposalId: string): Promise<VoteResult> {
    this.logger.log(
      `[collectAIVotes] Collecting votes for proposal ${proposalId}`,
    );

    try {
      const proposal = this.proposals.get(proposalId);

      if (!proposal) {
        throw new Error("Proposal not found");
      }

      const { topicId, title, description, voterIds, options } = proposal;

      // 构造投票提示词
      const votePrompt = this.buildVotePrompt(title, description, options);

      // 为每个投票者生成投票
      const votePromises = voterIds.map(async (memberId) => {
        // 跳过已投票的成员
        if (proposal.votes.some((v) => v.voterId === memberId)) {
          return null;
        }

        try {
          // 获取成员信息
          const member = await this.prisma.topicAIMember.findFirst({
            where: { id: memberId, topicId },
            select: { id: true, displayName: true, roleDescription: true },
          });

          if (!member) {
            this.logger.warn(`[collectAIVotes] Member ${memberId} not found`);
            return null;
          }

          // 创建投票提示消息
          const voteMessage = await this.prisma.topicMessage.create({
            data: {
              topicId,
              senderId: null,
              content: `@${member.displayName}\n\n${votePrompt}`,
              contentType: "TEXT",
            },
          });

          // 调用 AI 获取投票意见
          const response = await this.aiResponseService.generateAIResponse(
            topicId,
            "system",
            memberId,
            [voteMessage.id],
          );

          // 解析 AI 响应提取投票意见
          const vote = this.parseVoteFromResponse(response.content);

          // 记录投票
          proposal.votes.push({
            voterId: memberId,
            voterName: member.displayName,
            value: vote.value,
            reason: vote.reason,
            timestamp: new Date().toISOString(),
          });

          this.logger.log(
            `[collectAIVotes] ${member.displayName} voted: ${vote.value}`,
          );

          return {
            voterId: memberId,
            voterName: member.displayName,
            value: vote.value,
            reason: vote.reason,
          };
        } catch (error) {
          this.logger.error(
            `[collectAIVotes] Failed to get vote from member ${memberId}:`,
            error,
          );
          return null;
        }
      });

      const votes = (await Promise.all(votePromises)).filter(
        (v) => v !== null,
      ) as VoteResult["votes"];

      // 计算最终结果
      const result = this.calculateConsensus(proposal);

      // 关闭投票
      proposal.status = "CLOSED";

      return {
        success: true,
        proposalId,
        consensusReached: result.consensusReached,
        decision: result.decision,
        votes,
      };
    } catch (error) {
      this.logger.error(`[collectAIVotes] Failed:`, error);

      return {
        success: false,
        proposalId,
        consensusReached: false,
        decision: "ERROR",
        votes: [],
      };
    }
  }

  /**
   * 获取投票结果
   */
  getVoteResult(proposalId: string): VoteResult | null {
    const proposal = this.proposals.get(proposalId);

    if (!proposal) {
      return null;
    }

    const result = this.calculateConsensus(proposal);

    return {
      success: true,
      proposalId,
      consensusReached: result.consensusReached,
      decision: result.decision,
      votes: proposal.votes.map((v) => ({
        voterId: v.voterId,
        voterName: v.voterName,
        value: v.value,
        reason: v.reason,
      })),
    };
  }

  /**
   * 获取提案状态
   */
  getProposalStatus(proposalId: string): {
    exists: boolean;
    status?: string;
    statistics?: any;
  } {
    const proposal = this.proposals.get(proposalId);

    if (!proposal) {
      return { exists: false };
    }

    return {
      exists: true,
      status: proposal.status,
      statistics: this.calculateStatistics(proposal),
    };
  }

  // ============================================================================
  // Private Helpers
  // ============================================================================

  /**
   * 构造投票提示词
   */
  private buildVotePrompt(
    title: string,
    description: string,
    options?: string[],
  ): string {
    let prompt = `请对以下提案进行投票：\n\n`;
    prompt += `**提案标题**：${title}\n\n`;
    prompt += `**提案描述**：${description}\n\n`;

    if (options && options.length > 0) {
      prompt += `**可选项**：\n${options.map((opt, i) => `${i + 1}. ${opt}`).join("\n")}\n\n`;
    }

    prompt += `请基于你的角色和专业知识，明确表达你的投票意见：\n`;
    prompt += `- 赞成（APPROVE）\n`;
    prompt += `- 反对（REJECT）\n`;
    prompt += `- 弃权（ABSTAIN）\n\n`;
    prompt += `并简要说明你的理由。`;

    return prompt;
  }

  /**
   * 从AI响应中解析投票意见
   */
  private parseVoteFromResponse(content: string): {
    value: "APPROVE" | "REJECT" | "ABSTAIN";
    reason?: string;
  } {
    const lowerContent = content.toLowerCase();

    // 检测投票意向
    let value: "APPROVE" | "REJECT" | "ABSTAIN" = "ABSTAIN";

    if (
      lowerContent.includes("赞成") ||
      lowerContent.includes("同意") ||
      lowerContent.includes("支持") ||
      lowerContent.includes("approve")
    ) {
      value = "APPROVE";
    } else if (
      lowerContent.includes("反对") ||
      lowerContent.includes("拒绝") ||
      lowerContent.includes("reject")
    ) {
      value = "REJECT";
    } else if (
      lowerContent.includes("弃权") ||
      lowerContent.includes("中立") ||
      lowerContent.includes("abstain")
    ) {
      value = "ABSTAIN";
    }

    // 提取理由（简单实现：取前200字符）
    const reason =
      content.length > 200 ? content.substring(0, 200) + "..." : content;

    return { value, reason };
  }

  /**
   * 计算投票统计
   */
  private calculateStatistics(proposal: StoredProposal): {
    totalVoters: number;
    votesReceived: number;
    participationRate: number;
    approves: number;
    rejects: number;
    abstains: number;
  } {
    const totalVoters = proposal.voterIds.length;
    const votesReceived = proposal.votes.length;

    const approves = proposal.votes.filter((v) => v.value === "APPROVE").length;
    const rejects = proposal.votes.filter((v) => v.value === "REJECT").length;
    const abstains = proposal.votes.filter((v) => v.value === "ABSTAIN").length;

    return {
      totalVoters,
      votesReceived,
      participationRate:
        totalVoters > 0 ? (votesReceived / totalVoters) * 100 : 0,
      approves,
      rejects,
      abstains,
    };
  }

  /**
   * 计算共识结果
   */
  private calculateConsensus(proposal: StoredProposal): {
    consensusReached: boolean;
    decision: string;
  } {
    const stats = this.calculateStatistics(proposal);
    const { approves, rejects, votesReceived } = stats;
    const { strategy } = proposal;

    let consensusReached = false;
    let decision = "REJECT";

    switch (strategy) {
      case "MAJORITY":
        // 简单多数（>50%）
        consensusReached = approves > votesReceived / 2;
        decision = consensusReached ? "APPROVE" : "REJECT";
        break;

      case "SUPERMAJORITY":
        // 超级多数（>66%）
        consensusReached = approves >= votesReceived * 0.667;
        decision = consensusReached ? "APPROVE" : "REJECT";
        break;

      case "UNANIMOUS":
        // 全票通过
        consensusReached = approves === proposal.voterIds.length;
        decision = consensusReached ? "APPROVE" : "REJECT";
        break;

      default:
        consensusReached = approves > rejects;
        decision = consensusReached ? "APPROVE" : "REJECT";
    }

    return { consensusReached, decision };
  }
}
