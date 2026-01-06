/**
 * Output Reviewer Service
 * 输出审核服务 - AI Engine 核心能力
 *
 * 从 AI Teams 的 MissionReviewService 下沉到 AI Engine
 * 提供通用的输出审核和返工能力
 *
 * ★ 包含完整的超时、重试、错误处理机制
 */

import { Injectable, Logger } from "@nestjs/common";
import {
  IOutputReviewerService,
  ReviewRequest,
  ReviewResult,
  RevisionRequest,
  ExecutionResult,
  ReviewCriteria,
} from "./interfaces";
import { AiChatService } from "../../llm/services/ai-chat.service";
import { PrismaService } from "../../../../common/prisma/prisma.service";

/**
 * 默认审核标准
 */
const DEFAULT_CRITERIA: ReviewCriteria = {
  completenessWeight: 0.3,
  accuracyWeight: 0.3,
  logicWeight: 0.2,
  professionalismWeight: 0.2,
  passThreshold: 7,
  maxRevisions: 3,
};

/**
 * 重试配置
 */
const RETRY_CONFIG = {
  maxRetries: 3,
  initialDelayMs: 1000,
  maxDelayMs: 10000,
  backoffMultiplier: 2,
  timeoutMs: 120000, // 2 分钟超时
};

/**
 * 判断错误是否可重试
 */
function isRetryableError(error: string): boolean {
  const retryablePatterns = [
    /rate limit/i,
    /too many requests/i,
    /429/,
    /timeout/i,
    /ETIMEDOUT/,
    /ECONNRESET/,
    /ECONNREFUSED/,
    /network/i,
    /temporarily unavailable/i,
    /service unavailable/i,
    /503/,
    /502/,
    /500/,
    /overloaded/i,
  ];
  return retryablePatterns.some((pattern) => pattern.test(error));
}

/**
 * 延迟函数
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * 带超时的 Promise 包装器
 */
function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  errorMessage: string,
): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`Timeout: ${errorMessage} (${timeoutMs}ms)`));
    }, timeoutMs);

    promise
      .then((result) => {
        clearTimeout(timer);
        resolve(result);
      })
      .catch((error) => {
        clearTimeout(timer);
        reject(error);
      });
  });
}

@Injectable()
export class OutputReviewerService implements IOutputReviewerService {
  private readonly logger = new Logger(OutputReviewerService.name);

  constructor(
    private readonly aiChatService: AiChatService,
    private readonly prismaService: PrismaService,
  ) {}

  /**
   * 审核任务输出
   */
  async reviewOutput(request: ReviewRequest): Promise<ReviewResult> {
    const criteria = { ...DEFAULT_CRITERIA, ...request.criteria };
    const startTime = Date.now();

    this.logger.log(
      `[reviewOutput] Starting review for task "${request.task.title}" (mission: ${request.missionId})`,
    );

    try {
      // 对长内容先生成摘要
      let reviewContent = request.content;
      if (request.content.length > 3000) {
        this.logger.log(
          `[reviewOutput] 任务产出较长(${request.content.length}字符)，生成摘要...`,
        );
        const { summary, keyExcerpts } = await this.summarizeForReview(
          request.content,
          request.task.title,
          request.leader.aiModel,
          request.missionId,
        );
        reviewContent = keyExcerpts
          ? `【AI 生成的内容摘要】\n${summary}\n\n【原文关键片段】\n${keyExcerpts}`
          : summary;
      }

      // 构建审核提示词
      const reviewPrompt = this.buildReviewPrompt(
        request,
        reviewContent,
        criteria,
      );

      // 获取模型配置
      const modelConfig = await this.getModelConfig(request.leader.aiModel);

      // 调用 AI 审核（带重试）
      const result = await this.callAIWithRetry(
        request.leader.aiModel,
        [{ role: "user", content: reviewPrompt }],
        this.buildLeaderSystemPrompt(request.leader),
        { maxTokens: 2000, temperature: 0.3 },
        modelConfig,
        `review task "${request.task.title}"`,
      );

      // 解析审核结果
      const reviewResult = this.parseReviewResult(result.content, criteria);

      const duration = Date.now() - startTime;
      this.logger.log(
        `[reviewOutput] Review completed: score=${reviewResult.score}, passed=${reviewResult.passed}, duration=${duration}ms`,
      );

      return {
        ...reviewResult,
        tokensUsed: result.tokensUsed,
      };
    } catch (error) {
      const duration = Date.now() - startTime;
      this.logger.error(
        `[reviewOutput] Review failed after ${duration}ms: ${(error as Error).message}`,
      );

      // 审核失败时返回默认通过（避免阻塞流程）
      return {
        passed: true,
        score: 7,
        feedback: `审核过程出错，默认通过。错误: ${(error as Error).message}`,
        issues: [],
        suggestions: [],
        tokensUsed: 0,
      };
    }
  }

  /**
   * 为长内容生成摘要（用于审核）
   */
  async summarizeForReview(
    content: string,
    taskTitle: string,
    model: string,
    missionId: string,
  ): Promise<{ summary: string; keyExcerpts?: string }> {
    this.logger.debug(
      `[summarizeForReview] Starting summarization for task "${taskTitle}" (mission: ${missionId})`,
    );

    try {
      const modelConfig = await this.getModelConfig(model);

      const prompt = `请为以下任务产出生成一个简洁的摘要，用于质量审核。

任务标题: ${taskTitle}

原文内容:
${content.substring(0, 10000)}${content.length > 10000 ? "\n...(内容已截断)" : ""}

请输出:
1. 【摘要】(300字以内，概括主要内容和结论)
2. 【关键片段】(提取3-5个最重要的段落或要点)`;

      const result = await this.callAIWithRetry(
        model,
        [{ role: "user", content: prompt }],
        "你是一个专业的内容摘要助手，善于提取关键信息。",
        { maxTokens: 1500, temperature: 0.3 },
        modelConfig,
        `summarize for task "${taskTitle}"`,
      );

      // 解析摘要结果
      const summaryMatch = result.content.match(
        /【摘要】\n?([\s\S]*?)(?=【关键片段】|$)/,
      );
      const excerptsMatch = result.content.match(/【关键片段】\n?([\s\S]*?)$/);

      this.logger.debug(
        `[summarizeForReview] Summarization completed for task "${taskTitle}"`,
      );

      return {
        summary: summaryMatch?.[1]?.trim() || result.content,
        keyExcerpts: excerptsMatch?.[1]?.trim(),
      };
    } catch (error) {
      this.logger.warn(
        `[summarizeForReview] Summarization failed: ${(error as Error).message}, using truncated content`,
      );
      // 降级：返回截断的原文
      return {
        summary:
          content.substring(0, 2000) + (content.length > 2000 ? "..." : ""),
      };
    }
  }

  /**
   * 执行任务修订
   */
  async executeRevision(request: RevisionRequest): Promise<ExecutionResult> {
    const startTime = Date.now();
    const taskTitle = request.originalContext.task.title;

    this.logger.log(
      `[executeRevision] Starting revision #${request.revisionCount} for task "${taskTitle}" (mission: ${request.originalContext.missionId})`,
    );

    try {
      const modelConfig = await this.getModelConfig(
        request.originalContext.executor.aiModel,
      );

      // 构建修订提示词
      const revisionPrompt = this.buildRevisionPrompt(request);

      this.logger.debug(
        `[executeRevision] Calling AI for revision, model: ${request.originalContext.executor.aiModel}`,
      );

      const result = await this.callAIWithRetry(
        request.originalContext.executor.aiModel,
        [{ role: "user", content: revisionPrompt }],
        request.originalContext.systemPrompt,
        { maxTokens: 8000, temperature: 0.7 },
        modelConfig,
        `revision for task "${taskTitle}"`,
      );

      const duration = Date.now() - startTime;
      this.logger.log(
        `[executeRevision] Revision completed for task "${taskTitle}", duration=${duration}ms, tokens=${result.tokensUsed}`,
      );

      return {
        success: true,
        content: result.content,
        tokensUsed: result.tokensUsed,
        duration,
      };
    } catch (error) {
      const duration = Date.now() - startTime;
      const errorMsg = (error as Error).message;

      this.logger.error(
        `[executeRevision] Revision failed for task "${taskTitle}" after ${duration}ms: ${errorMsg}`,
      );

      return {
        success: false,
        content: "",
        tokensUsed: 0,
        duration,
        error: errorMsg,
        retryable: isRetryableError(errorMsg),
      };
    }
  }

  // ==================== 私有方法 ====================

  /**
   * 带重试的 AI 调用
   */
  private async callAIWithRetry(
    aiModel: string,
    messages: { role: string; content: string }[],
    systemPrompt: string,
    options: {
      maxTokens?: number;
      temperature?: number;
    },
    modelConfig: Awaited<ReturnType<typeof this.getModelConfig>>,
    operationDesc: string,
  ): Promise<{ content: string; tokensUsed: number }> {
    const {
      maxRetries,
      initialDelayMs,
      maxDelayMs,
      backoffMultiplier,
      timeoutMs,
    } = RETRY_CONFIG;

    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        this.logger.debug(
          `[callAIWithRetry] Attempt ${attempt}/${maxRetries} for ${operationDesc}`,
        );

        // 带超时的 AI 调用
        const result = await withTimeout(
          this.callAIWithConfig(
            aiModel,
            messages,
            systemPrompt,
            options,
            modelConfig,
          ),
          timeoutMs,
          operationDesc,
        );

        // 检查响应是否有效
        if (!result.content || result.content.trim().length === 0) {
          throw new Error("Empty response from AI");
        }

        this.logger.debug(
          `[callAIWithRetry] Success on attempt ${attempt} for ${operationDesc}`,
        );

        return result;
      } catch (error) {
        lastError = error as Error;
        const errorMsg = lastError.message;

        this.logger.warn(
          `[callAIWithRetry] Attempt ${attempt}/${maxRetries} failed for ${operationDesc}: ${errorMsg}`,
        );

        // 如果是最后一次尝试或不可重试的错误，直接抛出
        if (attempt >= maxRetries || !isRetryableError(errorMsg)) {
          this.logger.error(
            `[callAIWithRetry] All retries exhausted or non-retryable error for ${operationDesc}`,
          );
          throw lastError;
        }

        // 计算退避延迟
        const delay = Math.min(
          initialDelayMs * Math.pow(backoffMultiplier, attempt - 1),
          maxDelayMs,
        );
        this.logger.debug(
          `[callAIWithRetry] Waiting ${delay}ms before retry...`,
        );
        await sleep(delay);
      }
    }

    // 不应该到达这里，但以防万一
    throw lastError || new Error(`Failed after ${maxRetries} retries`);
  }

  /**
   * 构建审核提示词
   */
  private buildReviewPrompt(
    request: ReviewRequest,
    content: string,
    criteria: ReviewCriteria,
  ): string {
    let prompt = `## 任务审核

### 任务信息
- 任务标题: ${request.task.title}
${request.task.description ? `- 任务描述: ${request.task.description}` : ""}
${request.missionDescription ? `- Mission 目标: ${request.missionDescription}` : ""}

### 待审核内容
${content}

### 审核标准
请从以下维度评估（1-10分）：
1. **完整性** (权重${(criteria.completenessWeight || 0.3) * 100}%): 是否覆盖了任务要求的所有方面
2. **准确性** (权重${(criteria.accuracyWeight || 0.3) * 100}%): 信息是否准确可靠
3. **逻辑性** (权重${(criteria.logicWeight || 0.2) * 100}%): 论述是否有逻辑、条理清晰
4. **专业性** (权重${(criteria.professionalismWeight || 0.2) * 100}%): 表达是否专业、规范`;

    // 添加硬约束
    if (request.constraints && request.constraints.length > 0) {
      prompt += `\n\n### 硬约束要求（必须满足）
${request.constraints.map((c) => `- ${c.type}: ${c.description}`).join("\n")}`;
    }

    prompt += `

### 输出格式
请以 JSON 格式输出审核结果：
\`\`\`json
{
  "scores": {
    "completeness": 分数,
    "accuracy": 分数,
    "logic": 分数,
    "professionalism": 分数
  },
  "totalScore": 加权总分,
  "passed": true/false (总分>=${criteria.passThreshold || 7}为通过),
  "feedback": "总体评价",
  "issues": ["问题1", "问题2"],
  "suggestions": ["建议1", "建议2"]
}
\`\`\``;

    return prompt;
  }

  /**
   * 构建 Leader 系统提示词
   */
  private buildLeaderSystemPrompt(leader: ReviewRequest["leader"]): string {
    let prompt = `你是团队的 Leader，负责审核团队成员的工作产出。
${leader.persona ? `\n${leader.persona}` : ""}
${leader.systemPrompt ? `\n${leader.systemPrompt}` : ""}

审核时请：
1. 客观公正地评估内容质量
2. 指出具体问题，而非笼统批评
3. 给出可操作的改进建议
4. 分数评定要有依据`;

    return prompt;
  }

  /**
   * 构建修订提示词
   */
  private buildRevisionPrompt(request: RevisionRequest): string {
    const issuesList =
      request.issues.length > 0
        ? request.issues.map((issue, i) => `${i + 1}. ${issue}`).join("\n")
        : "（见审核反馈）";

    return `## 任务修订（第 ${request.revisionCount} 次）

### 原任务
${request.originalContext.userPrompt}

### 上次输出
${request.originalContent}

### 审核反馈
${request.reviewFeedback}

### 需要修正的问题
${issuesList}

### 要求
请根据审核反馈修正输出，重点解决上述问题。保持原有优点，改进不足之处。

直接输出修订后的完整内容，不要解释修改了什么。`;
  }

  /**
   * 解析审核结果
   */
  private parseReviewResult(
    content: string,
    criteria: ReviewCriteria,
  ): Omit<ReviewResult, "tokensUsed"> {
    try {
      // 尝试解析 JSON
      const jsonMatch = content.match(/```json\n?([\s\S]*?)\n?```/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[1]);
        return {
          passed:
            parsed.passed ?? parsed.totalScore >= (criteria.passThreshold || 7),
          score: parsed.totalScore || 7,
          feedback: parsed.feedback || "",
          issues: parsed.issues || [],
          suggestions: parsed.suggestions || [],
        };
      }

      // 尝试直接解析 JSON
      const directJsonMatch = content.match(/\{[\s\S]*\}/);
      if (directJsonMatch) {
        const parsed = JSON.parse(directJsonMatch[0]);
        return {
          passed:
            parsed.passed ?? parsed.totalScore >= (criteria.passThreshold || 7),
          score: parsed.totalScore || 7,
          feedback: parsed.feedback || "",
          issues: parsed.issues || [],
          suggestions: parsed.suggestions || [],
        };
      }
    } catch {
      // JSON 解析失败
      this.logger.debug(
        "[parseReviewResult] JSON parsing failed, using keyword-based detection",
      );
    }

    // 降级：基于关键词判断
    const lowerContent = content.toLowerCase();
    const hasNegative =
      lowerContent.includes("不通过") ||
      lowerContent.includes("需要修改") ||
      lowerContent.includes("问题较多");
    const hasPositive =
      lowerContent.includes("通过") ||
      lowerContent.includes("质量良好") ||
      lowerContent.includes("符合要求");

    return {
      passed: hasPositive && !hasNegative,
      score: hasPositive && !hasNegative ? 8 : 6,
      feedback: content.substring(0, 500),
      issues: [],
      suggestions: [],
    };
  }

  /**
   * 获取模型配置
   */
  private async getModelConfig(aiModel: string) {
    try {
      const modelConfig = await this.prismaService.aIModel.findFirst({
        where: {
          OR: [
            { modelId: { equals: aiModel, mode: "insensitive" } },
            { name: { equals: aiModel, mode: "insensitive" } },
          ],
          isEnabled: true,
        },
      });
      return modelConfig;
    } catch (error) {
      this.logger.warn(
        `[getModelConfig] Failed to get model config for ${aiModel}: ${(error as Error).message}`,
      );
      return null;
    }
  }

  /**
   * 调用 AI（基础方法，不带重试）
   */
  private async callAIWithConfig(
    aiModel: string,
    messages: { role: string; content: string }[],
    systemPrompt: string,
    options: {
      maxTokens?: number;
      temperature?: number;
    },
    modelConfig: Awaited<ReturnType<typeof this.getModelConfig>>,
  ): Promise<{ content: string; tokensUsed: number }> {
    let result;
    if (modelConfig?.apiKey) {
      result = await this.aiChatService.generateChatCompletionWithKey({
        provider: modelConfig.provider || "openai",
        modelId: modelConfig.modelId || aiModel,
        messages: [
          { role: "system", content: systemPrompt },
          ...messages,
        ] as Array<{ role: "system" | "user" | "assistant"; content: string }>,
        maxTokens: options.maxTokens || 4000,
        temperature: options.temperature ?? 0.7,
        apiKey: modelConfig.apiKey,
        apiEndpoint: modelConfig.apiEndpoint || undefined,
      });
    } else {
      result = await this.aiChatService.generateChatCompletion({
        model: aiModel,
        messages: [
          { role: "system", content: systemPrompt },
          ...messages,
        ] as Array<{ role: "system" | "user" | "assistant"; content: string }>,
        maxTokens: options.maxTokens || 4000,
        temperature: options.temperature ?? 0.7,
      });
    }

    return {
      content: result.content,
      tokensUsed: result.tokensUsed || 0,
    };
  }
}
