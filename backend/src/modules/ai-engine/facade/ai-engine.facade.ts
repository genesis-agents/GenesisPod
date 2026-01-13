/**
 * AI Engine Facade
 * AI 引擎统一入口
 *
 * 设计原则：
 * 1. 单一入口：所有 AI Apps 通过此 Facade 消费 AI 能力
 * 2. 语义化配置：使用 TaskProfile 描述任务，而非硬编码参数
 * 3. 能力聚合：整合 LLM、Search、Agent、Team、Context 等核心能力
 * 4. 向下委托：Facade 只做路由和适配，具体实现委托给内部服务
 */

import { Injectable, Logger, Optional } from "@nestjs/common";
import { AIModelType } from "@prisma/client";
import { AiChatService } from "../llm/services/ai-chat.service";
import { SearchService } from "../search/search.service";
import {
  TeamsService,
  CreateMissionDto,
  MissionStatus,
} from "../teams/services/teams.service";
import { ShortTermMemoryService } from "../memory/stores/short-term-memory.service";
import { LongTermMemoryService } from "../memory/stores/long-term-memory.service";
import {
  CircuitBreakerService,
  TaskCompletionType,
} from "../orchestration/services/circuit-breaker.service";
import { AgentExecutorService } from "../orchestration/services/agent-executor.service";
import { ToolRegistry } from "../tools/registry/tool-registry";
import { PrismaService } from "../../../common/prisma/prisma.service";
import type {
  ChatRequest,
  ChatResponse,
  SearchRequest,
  SearchResponse,
  SearchResultItem,
  MissionInput,
  MissionResult,
  ProgressCallback,
  TeamType,
  TeamConfig,
  BuildContextRequest,
  StoreMemoryRequest,
  RetrieveMemoryRequest,
  MemoryItem,
  ConstraintConfig,
  ConstraintResult,
  ModelInfo,
  ModelSelectionOptions,
  AgentExecutionRequest,
  AgentExecutionResult,
  ToolExecutionRequest,
  ToolExecutionResult,
  ToolInfo,
  ToolCategory,
} from "./types";
import { TeamId } from "../teams/abstractions/team.interface";

/** 敏感词过滤列表（基础版） */
const SENSITIVE_PATTERNS = [
  /password\s*[:=]\s*\S+/gi,
  /api[_-]?key\s*[:=]\s*\S+/gi,
  /secret\s*[:=]\s*\S+/gi,
  /token\s*[:=]\s*\S+/gi,
  /bearer\s+\S+/gi,
];

/**
 * AI Engine 统一入口
 *
 * 所有 AI Apps 应该通过此 Facade 消费 AI 能力，而不是直接依赖内部服务。
 */
@Injectable()
export class AIEngineFacade {
  private readonly logger = new Logger(AIEngineFacade.name);

  constructor(
    private readonly aiChatService: AiChatService,
    private readonly searchService: SearchService,
    @Optional() private readonly circuitBreaker?: CircuitBreakerService,
    @Optional() private readonly prisma?: PrismaService,
    @Optional() private readonly teamsService?: TeamsService,
    @Optional() private readonly shortTermMemory?: ShortTermMemoryService,
    @Optional() private readonly longTermMemory?: LongTermMemoryService,
    @Optional() private readonly agentExecutor?: AgentExecutorService,
    @Optional() private readonly toolRegistry?: ToolRegistry,
  ) {
    this.logger.log("AIEngineFacade initialized");
  }

  // ==================== LLM 能力 ====================

  /**
   * 统一对话入口（带熔断器保护）
   *
   * ★ P0 增强：内置熔断器，自动处理模型故障和限速
   */
  async chat(request: ChatRequest): Promise<ChatResponse> {
    const modelId = request.model || request.modelType || "default";
    const entityId = `chat:${modelId}`;

    this.logger.debug(
      `[chat] modelType=${request.modelType}, messages=${request.messages.length}`,
    );

    // 熔断器检查
    if (this.circuitBreaker && !this.circuitBreaker.canExecute(entityId)) {
      const cooldown = this.circuitBreaker.getCooldownRemaining(entityId);
      this.logger.warn(
        `[chat] Circuit breaker OPEN for ${entityId}, cooldown=${cooldown}ms`,
      );
      return {
        content: `Service temporarily unavailable. Please try again in ${Math.ceil(cooldown / 1000)} seconds.`,
        model: modelId,
        tokensUsed: 0,
        isError: true,
      };
    }

    const startTime = Date.now();

    try {
      // 增加负载计数
      this.circuitBreaker?.incrementLoad(entityId);

      const result = await this.aiChatService.chat({
        messages: request.messages,
        systemPrompt: request.systemPrompt,
        modelType: request.modelType || AIModelType.CHAT,
        taskProfile: request.taskProfile,
        model: request.model,
        maxTokens: request.maxTokens,
        temperature: request.temperature,
        strictMode: request.strictMode,
      });

      const duration = Date.now() - startTime;

      // 记录成功
      if (!result.isError) {
        this.circuitBreaker?.recordSuccess(entityId, duration);
      } else {
        // API 返回错误内容（非严格模式）
        this.circuitBreaker?.recordFailure(
          entityId,
          TaskCompletionType.API_ERROR,
          result.content.slice(0, 100),
        );
      }

      return {
        content: result.content,
        model: result.model,
        tokensUsed: result.usage?.totalTokens || 0,
        isError: result.isError,
      };
    } catch (error) {
      const duration = Date.now() - startTime;
      const errorMsg = error instanceof Error ? error.message : String(error);

      // 解析错误类型并记录失败
      const errorType =
        this.circuitBreaker?.parseErrorType(errorMsg) ||
        TaskCompletionType.API_ERROR;
      this.circuitBreaker?.recordFailure(entityId, errorType, errorMsg);

      this.logger.error(`[chat] Failed after ${duration}ms: ${errorMsg}`);

      // 严格模式抛出异常
      if (request.strictMode) {
        throw error;
      }

      // 非严格模式返回错误内容
      return {
        content: `Error: ${errorMsg}`,
        model: modelId,
        tokensUsed: 0,
        isError: true,
      };
    } finally {
      // 减少负载计数
      this.circuitBreaker?.decrementLoad(entityId);
    }
  }

  /**
   * 流式对话
   * ★ P2.1.1：实现真正的 SSE 流式输出
   *
   * 支持 OpenAI 兼容格式和 Anthropic Claude 的流式响应
   */
  async *chatStream(
    request: ChatRequest,
  ): AsyncGenerator<
    { content: string; done: boolean; error?: string },
    void,
    unknown
  > {
    this.logger.debug(
      `[chatStream] modelType=${request.modelType}, messages=${request.messages.length}`,
    );

    const modelId = request.model || request.modelType || "default";
    const entityId = `chat:${modelId}`;

    // 熔断器检查
    if (this.circuitBreaker && !this.circuitBreaker.canExecute(entityId)) {
      const cooldown = this.circuitBreaker.getCooldownRemaining(entityId);
      this.logger.warn(
        `[chatStream] Circuit breaker OPEN for ${entityId}, cooldown=${cooldown}ms`,
      );
      yield {
        content: `Service temporarily unavailable. Please try again in ${Math.ceil(cooldown / 1000)} seconds.`,
        done: true,
        error: "CIRCUIT_BREAKER_OPEN",
      };
      return;
    }

    try {
      // 增加负载计数
      this.circuitBreaker?.incrementLoad(entityId);

      // 使用 AiChatService 的真正流式输出
      for await (const chunk of this.aiChatService.chatStream({
        messages: request.messages.map((m) => ({
          role: m.role,
          content: m.content,
        })),
        model: request.model,
        modelType: request.modelType,
        taskProfile: request.taskProfile,
        systemPrompt: request.systemPrompt,
        maxTokens: request.maxTokens,
        temperature: request.temperature,
      })) {
        yield chunk;

        // 如果有错误，记录失败
        if (chunk.error) {
          this.circuitBreaker?.recordFailure(
            entityId,
            TaskCompletionType.API_ERROR,
            chunk.error,
          );
        }
      }

      // 流式完成，记录成功
      this.circuitBreaker?.recordSuccess(entityId, 0);
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      this.circuitBreaker?.recordFailure(
        entityId,
        TaskCompletionType.API_ERROR,
        errorMsg,
      );

      this.logger.error(`[chatStream] Stream failed: ${errorMsg}`);
      yield { content: "", done: true, error: errorMsg };
    } finally {
      // 减少负载计数
      this.circuitBreaker?.decrementLoad(entityId);
    }
  }

  /**
   * ★ P0 新增：智能模型选择
   *
   * 根据条件选择最佳模型：
   * - 考虑熔断器状态（排除不可用模型）
   * - 考虑负载均衡（优先选择低负载模型）
   * - 考虑推理需求（自动选择推理模型）
   */
  async selectModel(
    options: ModelSelectionOptions = {},
  ): Promise<ModelInfo | null> {
    this.logger.debug(`[selectModel] options=${JSON.stringify(options)}`);

    const models = await this.getAvailableModelsExtended(
      options.modelType || AIModelType.CHAT,
    );

    if (models.length === 0) {
      this.logger.warn("[selectModel] No models available");
      return null;
    }

    // 过滤条件
    let candidates = models;

    // 1. 过滤推理模型
    if (options.requireReasoning) {
      candidates = candidates.filter((m) => m.isReasoning);
      if (candidates.length === 0) {
        this.logger.warn("[selectModel] No reasoning models available");
        candidates = models; // 回退到所有模型
      }
    }

    // 2. 过滤提供商
    if (options.preferredProvider) {
      const preferred = candidates.filter(
        (m) =>
          m.provider.toLowerCase() === options.preferredProvider?.toLowerCase(),
      );
      if (preferred.length > 0) {
        candidates = preferred;
      }
    }

    // 3. 过滤 maxTokens
    if (options.minMaxTokens) {
      const filtered = candidates.filter(
        (m) => (m.maxTokens || 0) >= (options.minMaxTokens || 0),
      );
      if (filtered.length > 0) {
        candidates = filtered;
      }
    }

    // 4. 考虑熔断器状态选择最佳模型
    if (this.circuitBreaker) {
      const entityIds = candidates.map((m) => `chat:${m.id}`);
      const bestEntityId = this.circuitBreaker.selectBest(entityIds);

      if (bestEntityId) {
        const modelId = bestEntityId.replace("chat:", "");
        const selected = candidates.find((m) => m.id === modelId);
        if (selected) {
          this.logger.debug(
            `[selectModel] Selected by circuit breaker: ${modelId}`,
          );
          return selected;
        }
      }
    }

    // 5. 默认返回第一个可用的
    return candidates[0] || null;
  }

  /**
   * ★ P0 新增：获取推理模型
   *
   * 快捷方法，获取可用的推理模型（o1, o3, deepseek-r1 等）
   */
  async getReasoningModel(): Promise<ModelInfo | null> {
    return this.selectModel({ requireReasoning: true });
  }

  /**
   * ★ P0 新增：获取扩展的模型信息
   */
  async getAvailableModelsExtended(
    modelType: AIModelType = AIModelType.CHAT,
  ): Promise<ModelInfo[]> {
    this.logger.debug(`[getAvailableModelsExtended] modelType=${modelType}`);

    if (!this.prisma) {
      const modelNames = await this.aiChatService.getAvailableModelsAsync();
      return modelNames.map((name) => ({
        id: name,
        name: name,
        provider: this.inferProviderFromModel(name),
        isReasoning: this.aiChatService.isReasoningModel(name),
        isAvailable: this.circuitBreaker?.canExecute(`chat:${name}`) ?? true,
      }));
    }

    const models = await this.prisma.aIModel.findMany({
      where: {
        modelType: modelType,
        isEnabled: true,
      },
      select: {
        modelId: true,
        displayName: true,
        provider: true,
        maxTokens: true,
      },
    });

    return models.map((m) => ({
      id: m.modelId,
      name: m.displayName,
      provider: m.provider,
      isReasoning: this.aiChatService.isReasoningModel(m.modelId),
      isAvailable: this.circuitBreaker?.canExecute(`chat:${m.modelId}`) ?? true,
      maxTokens: m.maxTokens,
    }));
  }

  /**
   * 获取可用模型列表
   */
  async getAvailableModels(
    modelType: AIModelType = AIModelType.CHAT,
  ): Promise<Array<{ id: string; name: string; provider: string }>> {
    this.logger.debug(`[getAvailableModels] modelType=${modelType}`);

    if (!this.prisma) {
      // 从 AiChatService 缓存获取模型名称列表
      const modelNames = await this.aiChatService.getAvailableModelsAsync();
      return modelNames.map((name) => ({
        id: name,
        name: name,
        provider: this.inferProviderFromModel(name),
      }));
    }

    // 从数据库获取完整模型信息
    const models = await this.prisma.aIModel.findMany({
      where: {
        modelType: modelType,
        isEnabled: true,
      },
      select: {
        modelId: true,
        displayName: true,
        provider: true,
      },
    });

    return models.map((m) => ({
      id: m.modelId,
      name: m.displayName,
      provider: m.provider,
    }));
  }

  /**
   * 根据模型名推断提供商
   */
  private inferProviderFromModel(modelName: string): string {
    const lower = modelName.toLowerCase();
    if (lower.includes("gpt") || lower.includes("o1") || lower.includes("o3")) {
      return "openai";
    }
    if (lower.includes("claude")) return "anthropic";
    if (lower.includes("gemini")) return "google";
    if (lower.includes("grok")) return "xai";
    if (lower.includes("deepseek")) return "deepseek";
    if (lower.includes("llama") || lower.includes("mixtral")) return "meta";
    return "unknown";
  }

  // ==================== 搜索能力 ====================

  /**
   * 智能搜索
   */
  async search(request: SearchRequest): Promise<SearchResponse> {
    this.logger.debug(
      `[search] query="${request.query}", maxResults=${request.maxResults}`,
    );

    const result = await this.searchService.search(
      request.query,
      request.maxResults || 5,
    );

    const items: SearchResultItem[] = result.results.map((r) => ({
      title: r.title,
      url: r.url,
      content: r.content,
      score: r.score,
      publishedDate: r.publishedDate,
      domain: r.domain,
    }));

    return {
      success: result.success,
      results: items,
      error: result.error,
    };
  }

  /**
   * 格式化搜索结果为上下文
   */
  formatSearchResultsForContext(results: SearchResultItem[]): string {
    return this.searchService.formatResultsForContext(
      results.map((r) => ({
        title: r.title,
        url: r.url,
        content: r.content,
        score: r.score,
        publishedDate: r.publishedDate,
        domain: r.domain,
      })),
    );
  }

  // ==================== 团队协作能力 ====================

  /**
   * 启动团队任务
   */
  async startTeamMission(request: {
    teamType: TeamType | string;
    teamConfig?: TeamConfig;
    missionInput: MissionInput;
    progressCallback?: ProgressCallback;
  }): Promise<MissionResult> {
    if (!this.teamsService) {
      this.logger.warn("[startTeamMission] TeamsService not available");
      return {
        success: false,
        output: null,
        error: "TeamsService not available",
      };
    }

    this.logger.debug(
      `[startTeamMission] teamType=${request.teamType}, goal="${request.missionInput.goal}"`,
    );

    const teamId = this.mapTeamTypeToId(request.teamType);

    const createDto: CreateMissionDto = {
      teamId,
      goal: request.missionInput.goal,
      context: request.missionInput.context,
      userId: request.missionInput.userId,
      sessionId: request.missionInput.sessionId,
      metadata: request.missionInput.metadata,
    };

    try {
      // 执行任务
      const missionId = await this.teamsService.executeMission(createDto);

      // 轮询等待任务完成
      const result = await this.waitForMissionCompletion(
        missionId,
        request.progressCallback,
      );

      return result;
    } catch (error) {
      this.logger.error(`[startTeamMission] Failed: ${error}`);
      return {
        success: false,
        output: null,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * 等待任务完成
   */
  private async waitForMissionCompletion(
    missionId: string,
    progressCallback?: ProgressCallback,
    timeoutMs: number = 300000, // 5 分钟超时
    pollIntervalMs: number = 1000,
  ): Promise<MissionResult> {
    const startTime = Date.now();

    while (Date.now() - startTime < timeoutMs) {
      const status = this.getMissionStatus(missionId);

      if (!status) {
        return {
          success: false,
          output: null,
          error: `Mission ${missionId} not found`,
        };
      }

      // 发送进度回调
      if (progressCallback) {
        progressCallback({
          missionId,
          phase: status.currentPhase || status.status,
          progress: status.progress,
          message: `Status: ${status.status}`,
        });
      }

      // 检查是否完成
      if (status.status === "completed") {
        return {
          success: true,
          output: { missionId, status: "completed" },
          summary: "Mission completed successfully",
          executionTime: Date.now() - startTime,
        };
      }

      if (status.status === "failed") {
        return {
          success: false,
          output: null,
          error: status.error || "Mission failed",
          executionTime: Date.now() - startTime,
        };
      }

      if (status.status === "cancelled") {
        return {
          success: false,
          output: null,
          error: "Mission was cancelled",
          executionTime: Date.now() - startTime,
        };
      }

      // 等待后继续轮询
      await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
    }

    // 超时
    return {
      success: false,
      output: null,
      error: `Mission ${missionId} timed out after ${timeoutMs}ms`,
      executionTime: timeoutMs,
    };
  }

  /**
   * 取消团队任务
   */
  cancelMission(missionId: string): boolean {
    if (!this.teamsService) {
      this.logger.warn("[cancelMission] TeamsService not available");
      return false;
    }

    this.logger.debug(`[cancelMission] missionId=${missionId}`);
    return this.teamsService.cancelMission(missionId);
  }

  /**
   * 获取任务状态
   */
  getMissionStatus(missionId: string): MissionStatus | null {
    if (!this.teamsService) {
      return null;
    }

    return this.teamsService.getMissionStatus(missionId);
  }

  /**
   * 映射团队类型到团队 ID
   */
  private mapTeamTypeToId(teamType: TeamType | string): TeamId {
    const mapping: Record<string, TeamId> = {
      research: "research-team",
      debate: "debate-team",
      review: "review-team",
      report: "report-team",
    };
    return (mapping[teamType] || teamType) as TeamId;
  }

  // ==================== 上下文能力 ====================

  /**
   * 构建上下文
   */
  async buildContext(request: BuildContextRequest): Promise<string> {
    this.logger.debug(
      `[buildContext] sources=${request.sources.length}, maxTokens=${request.maxTokens}`,
    );

    const parts: string[] = [];

    for (const source of request.sources) {
      switch (source.type) {
        case "custom":
          if (source.content) {
            parts.push(source.content);
          }
          break;

        case "memory":
          if (source.id && this.shortTermMemory) {
            const memory = await this.shortTermMemory.getWithSession(
              source.id,
              "context",
            );
            if (memory && typeof memory === "string") {
              parts.push(`## Recent Memory\n${memory}`);
            }
          }
          break;

        case "search":
          if (source.content) {
            const searchResult = await this.search({
              query: source.content,
              maxResults: 5,
            });
            if (searchResult.success && searchResult.results.length > 0) {
              parts.push(
                this.formatSearchResultsForContext(searchResult.results),
              );
            }
          }
          break;

        case "topic":
          if (source.id && this.prisma) {
            const topic = await this.prisma.researchTopic.findUnique({
              where: { id: source.id },
              include: {
                dimensions: true,
              },
            });
            if (topic) {
              let topicContext = `## Research Topic: ${topic.name}\n`;
              topicContext += `Type: ${topic.type}\n`;
              if (topic.description) {
                topicContext += `Description: ${topic.description}\n`;
              }
              if (topic.dimensions && topic.dimensions.length > 0) {
                topicContext += `\nDimensions:\n`;
                for (const dim of topic.dimensions) {
                  topicContext += `- ${dim.name}: ${dim.description || "No description"}\n`;
                }
              }
              parts.push(topicContext);
            }
          }
          break;

        case "resource":
          if (source.id && this.prisma) {
            const resource = await this.prisma.resource.findUnique({
              where: { id: source.id },
            });
            if (resource) {
              let resourceContext = `## Resource: ${resource.title}\n`;
              if (resource.aiSummary) {
                resourceContext += `Summary: ${resource.aiSummary}\n`;
              }
              if (resource.content) {
                // 截取前 2000 字符
                const text =
                  resource.content.length > 2000
                    ? resource.content.substring(0, 2000) + "..."
                    : resource.content;
                resourceContext += `\nContent:\n${text}`;
              }
              parts.push(resourceContext);
            }
          }
          break;

        default:
          if (source.content) {
            parts.push(source.content);
          }
      }
    }

    let context = parts.join("\n\n---\n\n");

    // Token 限制处理
    if (request.maxTokens && request.compress) {
      const estimatedTokens = this.estimateTokens(context);
      if (estimatedTokens > request.maxTokens) {
        context = this.compressContext(context, request.maxTokens);
      }
    }

    return context;
  }

  /**
   * 估算 token 数量
   */
  private estimateTokens(text: string): number {
    // 中文每字约 2 token，英文每 4 字符约 1 token
    const chineseChars = (text.match(/[\u4e00-\u9fa5]/g) || []).length;
    const otherChars = text.length - chineseChars;
    return Math.ceil(chineseChars * 2 + otherChars / 4);
  }

  /**
   * 压缩上下文到指定 token 数
   */
  private compressContext(context: string, maxTokens: number): string {
    const currentTokens = this.estimateTokens(context);
    if (currentTokens <= maxTokens) {
      return context;
    }

    // 计算需要保留的比例
    const ratio = maxTokens / currentTokens;
    const targetLength = Math.floor(context.length * ratio * 0.9); // 留 10% 余量

    // 优先保留开头和结尾
    const headLength = Math.floor(targetLength * 0.6);
    const tailLength = Math.floor(targetLength * 0.3);

    const head = context.substring(0, headLength);
    const tail = context.substring(context.length - tailLength);

    return `${head}\n\n[... content compressed ...]\n\n${tail}`;
  }

  // ==================== 约束能力 ====================

  /**
   * 检查约束
   */
  checkConstraints(request: {
    content: string;
    constraints: ConstraintConfig;
  }): ConstraintResult {
    this.logger.debug(
      `[checkConstraints] contentLength=${request.content.length}`,
    );

    const violations: Array<{
      type: "token_limit" | "content_filter" | "json_schema";
      message: string;
    }> = [];

    // 1. 检查 token 限制
    if (request.constraints.maxTokens) {
      const estimatedTokens = this.estimateTokens(request.content);
      if (estimatedTokens > request.constraints.maxTokens) {
        violations.push({
          type: "token_limit",
          message: `Content exceeds token limit: ${estimatedTokens} > ${request.constraints.maxTokens}`,
        });
      }
    }

    // 2. 内容过滤（敏感信息检测）
    if (request.constraints.contentFilter?.enabled) {
      for (const pattern of SENSITIVE_PATTERNS) {
        if (pattern.test(request.content)) {
          violations.push({
            type: "content_filter",
            message: `Content contains potentially sensitive information matching pattern: ${pattern.source}`,
          });
        }
      }

      // 自定义规则
      if (request.constraints.contentFilter.rules) {
        for (const rule of request.constraints.contentFilter.rules) {
          try {
            const regex = new RegExp(rule, "gi");
            if (regex.test(request.content)) {
              violations.push({
                type: "content_filter",
                message: `Content matches custom filter rule: ${rule}`,
              });
            }
          } catch {
            this.logger.warn(`Invalid regex rule: ${rule}`);
          }
        }
      }
    }

    // 3. JSON Schema 验证
    if (request.constraints.jsonSchema) {
      try {
        const parsed = JSON.parse(request.content);
        const schemaValid = this.validateJsonSchema(
          parsed,
          request.constraints.jsonSchema,
        );
        if (!schemaValid) {
          violations.push({
            type: "json_schema",
            message: "Content does not match the required JSON schema",
          });
        }
      } catch {
        violations.push({
          type: "json_schema",
          message: "Content is not valid JSON",
        });
      }
    }

    // 如果有违规，尝试生成调整后的内容
    let adjustedContent: string | undefined;
    if (violations.some((v) => v.type === "token_limit")) {
      adjustedContent = this.compressContext(
        request.content,
        request.constraints.maxTokens || 4000,
      );
    }

    return {
      passed: violations.length === 0,
      violations: violations.length > 0 ? violations : undefined,
      adjustedContent,
    };
  }

  /**
   * 简单的 JSON Schema 验证
   */
  private validateJsonSchema(data: unknown, schema: object): boolean {
    // 基础实现：检查必需字段和类型
    const schemaObj = schema as {
      type?: string;
      required?: string[];
      properties?: Record<string, { type?: string }>;
    };

    if (schemaObj.type === "object" && typeof data !== "object") {
      return false;
    }

    if (schemaObj.type === "array" && !Array.isArray(data)) {
      return false;
    }

    if (schemaObj.required && typeof data === "object" && data !== null) {
      const dataObj = data as Record<string, unknown>;
      for (const field of schemaObj.required) {
        if (!(field in dataObj)) {
          return false;
        }
      }
    }

    return true;
  }

  // ==================== 记忆能力 ====================

  /**
   * 存储记忆
   */
  async storeMemory(request: StoreMemoryRequest): Promise<void> {
    this.logger.debug(
      `[storeMemory] sessionId=${request.sessionId}, type=${request.type}`,
    );

    if (request.type === "short" && this.shortTermMemory) {
      await this.shortTermMemory.setWithSession(
        request.sessionId,
        "memory",
        request.content,
      );
    } else if (request.type === "long" && this.longTermMemory) {
      await this.longTermMemory.setWithUser(
        request.sessionId,
        "memory",
        request.content,
      );
    } else {
      this.logger.warn(
        `[storeMemory] Memory service not available for type=${request.type}`,
      );
    }
  }

  /**
   * 检索记忆
   */
  async retrieveMemory(request: RetrieveMemoryRequest): Promise<MemoryItem[]> {
    this.logger.debug(
      `[retrieveMemory] sessionId=${request.sessionId}, topK=${request.topK}`,
    );

    const items: MemoryItem[] = [];

    // 从短期记忆检索
    if (this.shortTermMemory) {
      const memory = await this.shortTermMemory.getWithSession(
        request.sessionId,
        "memory",
      );
      if (memory) {
        items.push({
          id: `short-${request.sessionId}`,
          content: typeof memory === "string" ? memory : JSON.stringify(memory),
          type: "short",
          createdAt: new Date(),
        });
      }
    }

    // 从长期记忆检索
    if (this.longTermMemory && request.query) {
      const results = await this.longTermMemory.search(request.query, {
        userId: request.sessionId,
        limit: request.topK,
      });
      for (const result of results) {
        items.push({
          id: result.key,
          content:
            typeof result.value === "string"
              ? result.value
              : JSON.stringify(result.value),
          type: "long",
          score: result.score,
          createdAt: new Date(),
        });
      }
    }

    return items;
  }

  /**
   * 清除记忆
   */
  async clearMemory(sessionId: string): Promise<void> {
    this.logger.debug(`[clearMemory] sessionId=${sessionId}`);

    if (this.shortTermMemory) {
      await this.shortTermMemory.deleteWithSession(sessionId, "memory");
    }
  }

  // ==================== Agent 执行能力 ====================

  /**
   * ★ P1 新增：执行 Agent 任务
   *
   * 统一的 Agent 执行入口，支持：
   * - 自动重试和熔断器保护
   * - 搜索增强
   * - 任务画像配置
   */
  async executeAgent(
    request: AgentExecutionRequest,
  ): Promise<AgentExecutionResult> {
    this.logger.debug(
      `[executeAgent] agentType=${request.agentType}, task="${request.task.slice(0, 50)}..."`,
    );

    if (!this.agentExecutor) {
      return {
        success: false,
        content: "",
        tokensUsed: 0,
        duration: 0,
        error: "AgentExecutorService not available",
        retryable: false,
      };
    }

    const startTime = Date.now();

    // 构建执行上下文
    const executionContext = {
      missionId:
        (request.metadata?.missionId as string) || `agent-${Date.now()}`,
      topicId: (request.metadata?.topicId as string) || "default",
      task: {
        id: `task-${Date.now()}`,
        title: request.task.slice(0, 100),
        description: request.task,
        assigneeId: request.agentType,
      },
      executor: {
        id: request.agentType,
        agentName: request.agentType,
        displayName: request.agentType,
        aiModel: request.model || "gpt-4o",
        isLeader: false,
        systemPrompt: request.systemPrompt,
      },
      systemPrompt: request.systemPrompt || "You are a helpful AI assistant.",
      userPrompt: request.task,
      searchContext: request.context,
    };

    // 映射 taskProfile 到参数
    const config = {
      maxTokens: request.config?.maxTokens,
      temperature: request.config?.temperature,
      enableSearch: request.config?.enableSearch ?? false,
      maxRetries: request.config?.maxRetries ?? 3,
      timeout: request.config?.timeout,
    };

    // 根据 taskProfile 设置参数
    if (request.taskProfile) {
      const creativityMap: Record<string, number> = {
        deterministic: 0.1,
        low: 0.3,
        medium: 0.7,
        high: 0.9,
      };
      const outputLengthMap: Record<string, number> = {
        minimal: 500,
        short: 1500,
        medium: 4000,
        standard: 6000,
        long: 8000,
        extended: 16000,
      };

      if (!config.temperature && request.taskProfile.creativity) {
        config.temperature =
          creativityMap[request.taskProfile.creativity] || 0.7;
      }
      if (!config.maxTokens && request.taskProfile.outputLength) {
        config.maxTokens =
          outputLengthMap[request.taskProfile.outputLength] || 4000;
      }
    }

    try {
      const result = await this.agentExecutor.executeTask(
        executionContext,
        config,
      );

      return {
        success: result.success,
        content: result.content,
        tokensUsed: result.tokensUsed,
        duration: result.duration,
        error: result.error,
        retryable: result.retryable,
        searchResults: result.searchResults,
      };
    } catch (error) {
      const duration = Date.now() - startTime;
      const errorMsg = error instanceof Error ? error.message : String(error);

      this.logger.error(
        `[executeAgent] Failed after ${duration}ms: ${errorMsg}`,
      );

      return {
        success: false,
        content: "",
        tokensUsed: 0,
        duration,
        error: errorMsg,
        retryable: true,
      };
    }
  }

  /**
   * 检查 Agent 是否可用
   */
  isAgentAvailable(agentId: string): boolean {
    if (!this.agentExecutor) {
      return false;
    }
    return this.agentExecutor.isAgentAvailable(agentId);
  }

  // ==================== Tool 执行能力 ====================

  /**
   * ★ P1 新增：执行工具
   *
   * 统一的工具执行入口，支持：
   * - 工具注册表查找
   * - 输入验证
   * - 超时控制
   */
  async executeTool<T = unknown>(
    request: ToolExecutionRequest,
  ): Promise<ToolExecutionResult<T>> {
    const executionId = `tool-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const startTime = Date.now();

    this.logger.debug(
      `[executeTool] toolId=${request.toolId}, executionId=${executionId}`,
    );

    if (!this.toolRegistry) {
      return {
        success: false,
        error: {
          code: "TOOL_REGISTRY_NOT_AVAILABLE",
          message: "ToolRegistry not available",
          retryable: false,
        },
        metadata: {
          executionId,
          duration: Date.now() - startTime,
        },
      };
    }

    // 查找工具
    const tool = this.toolRegistry.tryGet(request.toolId);
    if (!tool) {
      return {
        success: false,
        error: {
          code: "TOOL_NOT_FOUND",
          message: `Tool "${request.toolId}" not found in registry`,
          retryable: false,
        },
        metadata: {
          executionId,
          duration: Date.now() - startTime,
        },
      };
    }

    // 检查工具是否启用
    if (tool.enabled === false) {
      return {
        success: false,
        error: {
          code: "TOOL_DISABLED",
          message: `Tool "${request.toolId}" is disabled`,
          retryable: false,
        },
        metadata: {
          executionId,
          duration: Date.now() - startTime,
        },
      };
    }

    // 构建执行上下文
    const toolContext = {
      executionId,
      toolId: request.toolId,
      userId: request.context?.userId,
      sessionId: request.context?.sessionId,
      workspaceId: request.context?.workspaceId,
      timeout: request.timeout || tool.defaultTimeout || 30000,
      createdAt: new Date(),
    };

    try {
      // 执行工具
      const result = await tool.execute(request.input, toolContext);
      const duration = Date.now() - startTime;

      return {
        success: result.success,
        data: result.data as T,
        error: result.error
          ? {
              code: result.error.code,
              message: result.error.message,
              retryable: result.error.retryable,
            }
          : undefined,
        metadata: {
          executionId,
          duration,
          tokensUsed: result.metadata.tokensUsed,
        },
      };
    } catch (error) {
      const duration = Date.now() - startTime;
      const errorMsg = error instanceof Error ? error.message : String(error);

      this.logger.error(
        `[executeTool] Tool ${request.toolId} failed after ${duration}ms: ${errorMsg}`,
      );

      return {
        success: false,
        error: {
          code: "TOOL_EXECUTION_ERROR",
          message: errorMsg,
          retryable: true,
        },
        metadata: {
          executionId,
          duration,
        },
      };
    }
  }

  /**
   * 获取可用工具列表
   */
  getAvailableTools(category?: ToolCategory): ToolInfo[] {
    if (!this.toolRegistry) {
      return [];
    }

    let tools = category
      ? this.toolRegistry.getByCategory(category)
      : this.toolRegistry.getEnabled();

    return tools.map((tool) => ({
      id: tool.id,
      name: tool.name,
      description: tool.description,
      category: tool.category,
      enabled: tool.enabled !== false,
      tags: tool.tags,
    }));
  }

  /**
   * 检查工具是否可用
   */
  isToolAvailable(toolId: string): boolean {
    if (!this.toolRegistry) {
      return false;
    }
    return this.toolRegistry.isAvailable(toolId);
  }

  /**
   * 获取工具的 Function Definition（用于 LLM Function Calling）
   */
  getToolFunctionDefinitions(toolIds?: string[]): Array<{
    name: string;
    description: string;
    parameters: object;
  }> {
    if (!this.toolRegistry) {
      return [];
    }

    const definitions = toolIds
      ? this.toolRegistry.getFunctionDefinitions(toolIds)
      : this.toolRegistry.getAllFunctionDefinitions();

    return definitions;
  }
}
