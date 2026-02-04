/**
 * Specialized Agent Coordinator Service
 *
 * P1 优化：专业角色协调服务
 * 参考：Multi-Agent Debate (Du et al., 2023)
 *
 * 功能：
 * 1. 协调多个专业角色的协作
 * 2. 组织结构化辩论
 * 3. 综合多角色观点
 */

import { Injectable, Logger } from "@nestjs/common";
import { AIEngineFacade } from "@/modules/ai-engine/facade";
import { extractJsonFromAIResponse } from "@/common/utils/json-extraction.utils";
import {
  SpecializedAgentType,
  AgentRoleDefinition,
  AgentInteraction,
  DebateRound,
  DebateResult,
  MultiRoleCollaborationResult,
  SpecializedAgentConfig,
  SpecializedAnalysisResult,
  DEFAULT_SPECIALIZED_AGENT_CONFIG,
} from "../../types/specialized-agents.types";
import { AGENT_ROLE_REGISTRY } from "../../constants/agent-roles";

export interface CollaborationRequest {
  topic: string;
  content: string;
  context: {
    topicName: string;
    dimensionName: string;
    evidences?: Array<{
      id: string;
      content: string;
      source: string;
    }>;
  };
  roles?: SpecializedAgentType[];
  config?: Partial<SpecializedAgentConfig>;
}

export interface DebateRequest {
  proposition: string;
  context: {
    topicName: string;
    dimensionName: string;
    evidences?: Array<{
      id: string;
      content: string;
      source: string;
    }>;
  };
  config?: Partial<SpecializedAgentConfig>;
}

@Injectable()
export class SpecializedAgentCoordinatorService {
  private readonly logger = new Logger(SpecializedAgentCoordinatorService.name);

  constructor(private readonly aiFacade: AIEngineFacade) {}

  /**
   * 执行多角色协作
   */
  async runCollaboration(
    request: CollaborationRequest,
  ): Promise<MultiRoleCollaborationResult> {
    const startTime = Date.now();
    const roles = request.roles || this.selectDefaultRoles();

    this.logger.log(
      `[runCollaboration] Starting with ${roles.length} roles for: ${request.topic.substring(0, 50)}...`,
    );

    // 1. 收集各角色的分析
    const roleResults: Record<SpecializedAgentType, SpecializedAnalysisResult> =
      {} as Record<SpecializedAgentType, SpecializedAnalysisResult>;
    const interactions: AgentInteraction[] = [];

    for (const roleType of roles) {
      const role = this.getRoleDefinition(roleType);
      if (!role) continue;

      const analysis = await this.getAgentAnalysis(
        role,
        request.content,
        request.context,
        Object.values(roleResults),
      );

      if (analysis) {
        roleResults[roleType] = analysis;
        interactions.push(...analysis.interactions);
      }
    }

    // 2. 综合所有观点
    const synthesizedInsights = await this.synthesizeViews(
      request.topic,
      Object.values(roleResults),
      request.context,
    );

    const result: MultiRoleCollaborationResult = {
      participatingRoles: roles,
      roleResults,
      interactions,
      synthesizedInsights,
      metadata: {
        totalAgents: roles.length,
        totalInteractions: interactions.length,
        executionTimeMs: Date.now() - startTime,
        tokensUsed: 0,
      },
    };

    this.logger.log(
      `[runCollaboration] Completed in ${result.metadata.executionTimeMs}ms: ` +
        `${interactions.length} interactions`,
    );

    return result;
  }

  /**
   * 执行结构化辩论
   */
  async runDebate(request: DebateRequest): Promise<DebateResult> {
    const startTime = Date.now();
    const config = { ...DEFAULT_SPECIALIZED_AGENT_CONFIG, ...request.config };

    this.logger.log(
      `[runDebate] Starting debate on: ${request.proposition.substring(0, 50)}...`,
    );

    const rounds: DebateRound[] = [];
    let currentProposition = request.proposition;

    for (let roundNum = 1; roundNum <= config.debateRounds; roundNum++) {
      this.logger.log(`[runDebate] Round ${roundNum}/${config.debateRounds}`);

      const round = await this.runDebateRound(
        roundNum,
        currentProposition,
        request.context,
        rounds,
      );

      rounds.push(round);

      // 如果法官认为已经足够清晰，可以提前结束
      if (
        round.judgeAssessment.currentLeaning !== "undecided" &&
        round.judgeAssessment.pointsToAddress.length === 0
      ) {
        this.logger.log(
          `[runDebate] Reached clear verdict at round ${roundNum}`,
        );
        break;
      }
    }

    // 生成最终结论
    const finalVerdict = await this.generateFinalVerdict(
      request.proposition,
      rounds,
      request.context,
    );

    const result: DebateResult = {
      proposition: request.proposition,
      rounds,
      totalRounds: rounds.length,
      finalVerdict,
      metadata: {
        startTime: new Date(startTime),
        endTime: new Date(),
        totalTokensUsed: 0,
      },
    };

    this.logger.log(
      `[runDebate] Completed: ${rounds.length} rounds, verdict: ${finalVerdict.winningPosition}`,
    );

    return result;
  }

  /**
   * 执行单轮辩论
   */
  private async runDebateRound(
    roundNumber: number,
    proposition: string,
    context: DebateRequest["context"],
    previousRounds: DebateRound[],
  ): Promise<DebateRound> {
    const previousRoundsContext =
      previousRounds.length > 0
        ? previousRounds
            .map(
              (r) =>
                `第 ${r.roundNumber} 轮:\n正方: ${r.proArgument.argument.substring(0, 200)}...\n反方: ${r.conArgument.argument.substring(0, 200)}...`,
            )
            .join("\n\n")
        : "";

    // 正方论证
    const proArgument = await this.generateDebateArgument(
      "pro",
      proposition,
      context,
      previousRoundsContext,
    );

    // 反方论证
    const conArgument = await this.generateDebateArgument(
      "con",
      proposition,
      context,
      previousRoundsContext,
      proArgument.argument,
    );

    // 法官评估
    const judgeAssessment = await this.generateJudgeAssessment(
      proposition,
      proArgument,
      conArgument,
      context,
    );

    return {
      roundNumber,
      proposition,
      proArgument,
      conArgument,
      judgeAssessment,
    };
  }

  /**
   * 生成辩论论点
   */
  private async generateDebateArgument(
    side: "pro" | "con",
    proposition: string,
    context: DebateRequest["context"],
    previousRoundsContext: string,
    opposingArgument?: string,
  ): Promise<DebateRound["proArgument"]> {
    const roleDesc = side === "pro" ? "支持方" : "反对方";
    const opposingContext = opposingArgument
      ? `\n\n## 对方论点（需要反驳）\n${opposingArgument}`
      : "";

    const prompt = `你是一个专业的辩论者，作为${roleDesc}参与辩论。

## 命题
${proposition}

## 研究背景
- 主题：${context.topicName}
- 维度：${context.dimensionName}

${previousRoundsContext ? `## 之前的辩论\n${previousRoundsContext}` : ""}
${opposingContext}

## 任务
作为${roleDesc}，请提供有力的论证。${side === "pro" ? "支持" : "反对"}这个命题。

## 输出格式（JSON）
{
  "argument": "详细的论证（200-400字）",
  "evidenceUsed": ["使用的证据1", "使用的证据2"],
  "confidence": 0.8
}

只输出 JSON。`;

    try {
      const response = await this.aiFacade.chat({
        messages: [{ role: "user", content: prompt }],
        taskProfile: { creativity: "medium", outputLength: "medium" },
      });

      const result = extractJsonFromAIResponse<{
        argument: string;
        evidenceUsed: string[];
        confidence: number;
      }>(response.content);

      if (result.success && result.data) {
        return {
          agentId: `agent-${side}`,
          argument: result.data.argument,
          evidenceUsed: result.data.evidenceUsed || [],
          confidence: Math.max(0, Math.min(1, result.data.confidence || 0.7)),
        };
      }
    } catch (error) {
      this.logger.error(`[generateDebateArgument] Error for ${side}: ${error}`);
    }

    return {
      agentId: `agent-${side}`,
      argument: `${roleDesc}论证生成失败`,
      evidenceUsed: [],
      confidence: 0.5,
    };
  }

  /**
   * 生成法官评估
   */
  private async generateJudgeAssessment(
    proposition: string,
    proArgument: DebateRound["proArgument"],
    conArgument: DebateRound["conArgument"],
    context: DebateRequest["context"],
  ): Promise<DebateRound["judgeAssessment"]> {
    const prompt = `你是一个公正的辩论裁判，请评估以下辩论。

## 命题
${proposition}

## 研究背景
- 主题：${context.topicName}
- 维度：${context.dimensionName}

## 正方论点（置信度 ${proArgument.confidence.toFixed(2)}）
${proArgument.argument}
证据：${proArgument.evidenceUsed.join("、")}

## 反方论点（置信度 ${conArgument.confidence.toFixed(2)}）
${conArgument.argument}
证据：${conArgument.evidenceUsed.join("、")}

## 任务
请公正评估双方论点的优缺点。

## 输出格式（JSON）
{
  "proStrengths": ["正方优点1", "正方优点2"],
  "proWeaknesses": ["正方弱点1"],
  "conStrengths": ["反方优点1", "反方优点2"],
  "conWeaknesses": ["反方弱点1"],
  "currentLeaning": "pro|con|undecided",
  "pointsToAddress": ["需要进一步讨论的点"]
}

只输出 JSON。`;

    try {
      const response = await this.aiFacade.chat({
        messages: [{ role: "user", content: prompt }],
        taskProfile: { creativity: "low", outputLength: "medium" },
      });

      const result = extractJsonFromAIResponse<{
        proStrengths: string[];
        proWeaknesses: string[];
        conStrengths: string[];
        conWeaknesses: string[];
        currentLeaning: string;
        pointsToAddress: string[];
      }>(response.content);

      if (result.success && result.data) {
        return {
          proStrengths: result.data.proStrengths || [],
          proWeaknesses: result.data.proWeaknesses || [],
          conStrengths: result.data.conStrengths || [],
          conWeaknesses: result.data.conWeaknesses || [],
          currentLeaning: this.parseLeaning(result.data.currentLeaning),
          pointsToAddress: result.data.pointsToAddress || [],
        };
      }
    } catch (error) {
      this.logger.error(`[generateJudgeAssessment] Error: ${error}`);
    }

    return {
      proStrengths: [],
      proWeaknesses: [],
      conStrengths: [],
      conWeaknesses: [],
      currentLeaning: "undecided",
      pointsToAddress: ["评估生成失败，需要人工审核"],
    };
  }

  /**
   * 生成最终裁决
   */
  private async generateFinalVerdict(
    proposition: string,
    rounds: DebateRound[],
    context: DebateRequest["context"],
  ): Promise<DebateResult["finalVerdict"]> {
    const roundsSummary = rounds
      .map(
        (r) =>
          `第 ${r.roundNumber} 轮:\n正方: ${r.proArgument.argument.substring(0, 150)}...\n反方: ${r.conArgument.argument.substring(0, 150)}...\n法官倾向: ${r.judgeAssessment.currentLeaning}`,
      )
      .join("\n\n");

    const prompt = `请为以下辩论做出最终裁决。

## 命题
${proposition}

## 研究背景
- 主题：${context.topicName}
- 维度：${context.dimensionName}

## 辩论过程
${roundsSummary}

## 任务
综合所有轮次的论点，做出最终裁决。

## 输出格式（JSON）
{
  "conclusion": "最终结论（100-200字）",
  "confidence": 0.8,
  "winningPosition": "pro|con|nuanced",
  "keyArguments": ["关键论点1", "关键论点2"],
  "remainingContention": ["仍有争议的点"],
  "synthesizedView": "综合视角（考虑双方观点的平衡结论）"
}

只输出 JSON。`;

    try {
      const response = await this.aiFacade.chat({
        messages: [{ role: "user", content: prompt }],
        taskProfile: { creativity: "low", outputLength: "medium" },
      });

      const result = extractJsonFromAIResponse<{
        conclusion: string;
        confidence: number;
        winningPosition: string;
        keyArguments: string[];
        remainingContention: string[];
        synthesizedView: string;
      }>(response.content);

      if (result.success && result.data) {
        return {
          conclusion: result.data.conclusion,
          confidence: Math.max(0, Math.min(1, result.data.confidence || 0.7)),
          winningPosition: this.parseWinningPosition(
            result.data.winningPosition,
          ),
          keyArguments: result.data.keyArguments || [],
          remainingContention: result.data.remainingContention || [],
          synthesizedView: result.data.synthesizedView || "",
        };
      }
    } catch (error) {
      this.logger.error(`[generateFinalVerdict] Error: ${error}`);
    }

    return {
      conclusion: "最终裁决生成失败",
      confidence: 0.5,
      winningPosition: "nuanced",
      keyArguments: [],
      remainingContention: ["需要人工审核"],
      synthesizedView: "",
    };
  }

  /**
   * 获取角色定义
   */
  private getRoleDefinition(
    type: SpecializedAgentType,
  ): AgentRoleDefinition | null {
    const role = AGENT_ROLE_REGISTRY[type];
    if (!role) {
      this.logger.warn(`[getRoleDefinition] Unknown role type: ${type}`);
      return null;
    }
    return role;
  }

  /**
   * 选择默认角色
   */
  private selectDefaultRoles(): SpecializedAgentType[] {
    return [
      SpecializedAgentType.DOMAIN_EXPERT,
      SpecializedAgentType.FACT_CHECKER,
      SpecializedAgentType.SYNTHESIZER,
    ];
  }

  /**
   * 获取代理分析
   */
  private async getAgentAnalysis(
    role: AgentRoleDefinition,
    content: string,
    context: CollaborationRequest["context"],
    previousResults: SpecializedAnalysisResult[],
  ): Promise<SpecializedAnalysisResult | null> {
    const previousContext =
      previousResults.length > 0
        ? `\n\n## 其他角色的分析\n${previousResults.map((r) => `- ${r.agentName}: ${r.analysis.mainFindings.slice(0, 2).join("；")}`).join("\n")}`
        : "";

    const prompt = `${role.systemPrompt}

## 研究背景
- 主题：${context.topicName}
- 维度：${context.dimensionName}

## 待分析内容
${content}
${previousContext}

## 任务
请从你的专业角度（${role.displayName}）分析以上内容。

## 输出格式（JSON）
{
  "mainFindings": ["主要发现1", "主要发现2", "主要发现3"],
  "supportingEvidence": ["支持证据1", "支持证据2"],
  "caveats": ["注意事项1"],
  "confidence": 0.85,
  "suggestedActions": [
    {
      "action": "建议行动",
      "priority": "high|medium|low"
    }
  ]
}

只输出 JSON。`;

    try {
      const response = await this.aiFacade.chat({
        messages: [{ role: "user", content: prompt }],
        taskProfile: role.taskProfile,
      });

      const result = extractJsonFromAIResponse<{
        mainFindings: string[];
        supportingEvidence: string[];
        caveats: string[];
        confidence: number;
        suggestedActions: Array<{
          action: string;
          priority: string;
        }>;
      }>(response.content);

      if (result.success && result.data) {
        return {
          agentType: role.type,
          agentName: role.displayName,
          analysis: {
            mainFindings: result.data.mainFindings || [],
            supportingEvidence: result.data.supportingEvidence || [],
            caveats: result.data.caveats || [],
            confidence: Math.max(0, Math.min(1, result.data.confidence || 0.7)),
          },
          interactions: [],
          suggestedActions: (result.data.suggestedActions || []).map((a) => ({
            action: a.action,
            priority: this.parsePriority(a.priority),
          })),
        };
      }
    } catch (error) {
      this.logger.error(`[getAgentAnalysis] Error for ${role.type}: ${error}`);
    }

    return null;
  }

  /**
   * 综合多角色观点
   */
  private async synthesizeViews(
    topic: string,
    results: SpecializedAnalysisResult[],
    context: CollaborationRequest["context"],
  ): Promise<MultiRoleCollaborationResult["synthesizedInsights"]> {
    if (results.length === 0) {
      return {
        keyFindings: [],
        consensusPoints: [],
        divergencePoints: [],
        overallConfidence: 0,
      };
    }

    const viewsText = results
      .map(
        (r) =>
          `### ${r.agentName}\n主要发现：${r.analysis.mainFindings.join("；")}\n置信度：${r.analysis.confidence.toFixed(2)}`,
      )
      .join("\n\n");

    const prompt = `请综合以下多个专业角色的分析观点。

## 主题
${topic}

## 研究背景
- 主题：${context.topicName}
- 维度：${context.dimensionName}

## 各角色观点
${viewsText}

## 任务
综合所有观点，识别共识和分歧。

## 输出格式（JSON）
{
  "keyFindings": ["关键发现1", "关键发现2", "关键发现3"],
  "consensusPoints": ["共识点1", "共识点2"],
  "divergencePoints": ["分歧点1"],
  "overallConfidence": 0.8
}

只输出 JSON。`;

    try {
      const response = await this.aiFacade.chat({
        messages: [{ role: "user", content: prompt }],
        taskProfile: { creativity: "low", outputLength: "medium" },
      });

      const result = extractJsonFromAIResponse<{
        keyFindings: string[];
        consensusPoints: string[];
        divergencePoints: string[];
        overallConfidence: number;
      }>(response.content);

      if (result.success && result.data) {
        return {
          keyFindings: result.data.keyFindings || [],
          consensusPoints: result.data.consensusPoints || [],
          divergencePoints: result.data.divergencePoints || [],
          overallConfidence: Math.max(
            0,
            Math.min(1, result.data.overallConfidence || 0.7),
          ),
        };
      }
    } catch (error) {
      this.logger.error(`[synthesizeViews] Error: ${error}`);
    }

    // 回退：从结果中提取
    const allFindings = results.flatMap((r) => r.analysis.mainFindings);
    const avgConfidence =
      results.reduce((sum, r) => sum + r.analysis.confidence, 0) /
      results.length;

    return {
      keyFindings: [...new Set(allFindings)].slice(0, 5),
      consensusPoints: [],
      divergencePoints: [],
      overallConfidence: avgConfidence,
    };
  }

  /**
   * 解析法官倾向
   */
  private parseLeaning(leaning: string): "pro" | "con" | "undecided" {
    const normalized = leaning?.toLowerCase();
    if (normalized === "pro") return "pro";
    if (normalized === "con") return "con";
    return "undecided";
  }

  /**
   * 解析获胜立场
   */
  private parseWinningPosition(position: string): "pro" | "con" | "nuanced" {
    const normalized = position?.toLowerCase();
    if (normalized === "pro") return "pro";
    if (normalized === "con") return "con";
    return "nuanced";
  }

  /**
   * 解析优先级
   */
  private parsePriority(priority: string): "high" | "medium" | "low" {
    const normalized = priority?.toLowerCase();
    if (normalized === "high") return "high";
    if (normalized === "low") return "low";
    return "medium";
  }
}
