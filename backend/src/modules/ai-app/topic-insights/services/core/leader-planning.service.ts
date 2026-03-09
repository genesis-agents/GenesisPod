/**
 * Leader Planning Service
 *
 * 负责研究规划相关功能：
 * - 研究规划（planResearch）
 * - 全局大纲规划（planGlobalOutline）
 * - 维度大纲规划（planDimensionOutline）
 */

import { Injectable, Logger, Inject, forwardRef } from "@nestjs/common";
import { PrismaService } from "@/common/prisma/prisma.service";
import { ChatFacade } from "@/modules/ai-engine/facade";
import { extractJsonFromAIResponse } from "@/common/utils/json-extraction.utils";
import { sanitize } from "../../utils/prompt-sanitizer";
import {
  LEADER_PLAN_PROMPT,
  GLOBAL_OUTLINE_PROMPT,
  DIMENSION_OUTLINE_PROMPT,
  getLanguageInstruction,
} from "../../prompts";
import type {
  LeaderPlan,
  LeaderModelInfo,
  DimensionOutline,
  GlobalOutline,
} from "../../types/leader.types";
import { ResearchMemoryService } from "./research-memory.service";

@Injectable()
export class LeaderPlanningService {
  private readonly logger = new Logger(LeaderPlanningService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly chatFacade: ChatFacade,
    @Inject(forwardRef(() => ResearchMemoryService))
    private readonly researchMemory: ResearchMemoryService,
  ) {}

  /**
   * 获取推理模型信息
   * ★ 委托给 AIEngineFacade 处理模型选择逻辑
   */
  async getReasoningModel(): Promise<LeaderModelInfo | null> {
    this.logger.debug("[getReasoningModel] Starting model selection");

    const allModels = await this.chatFacade.getAvailableModelsExtended();
    this.logger.debug(
      `[getReasoningModel] Found ${allModels.length} available models`,
    );

    // 使用 AIEngineFacade 的能力获取推理模型
    const modelInfo = await this.chatFacade.getReasoningModel();

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
   * Leader 规划研究任务
   * 分析用户需求，自主决定维度和执行策略
   */
  async planResearch(
    topicId: string,
    userPrompt?: string,
  ): Promise<LeaderPlan> {
    this.logger.log(`[planResearch] Starting planning for topic ${topicId}`);

    // 1. 获取专题信息
    const topic = await this.prisma.researchTopic.findUnique({
      where: { id: topicId },
      include: { dimensions: true },
    });

    if (!topic) {
      throw new Error(`Topic ${topicId} not found`);
    }

    // 2. 获取推理模型
    const leaderModel = await this.getReasoningModel();
    if (!leaderModel) {
      throw new Error("No reasoning model available for Leader");
    }

    // 3. 获取可用的 CHAT 模型列表（供 Leader 为 Agent 分配）
    const availableModels = await this.chatFacade.getAvailableModelsExtended();
    // ★ 过滤不可用模型（如 API key 过期、熔断器打开），并对重复 modelId 去重
    const reachableModels = availableModels.filter(
      (m) => m.isAvailable !== false,
    );
    const uniqueModels = reachableModels.filter(
      (m, i, arr) => arr.findIndex((x) => x.id === m.id) === i,
    );
    if (reachableModels.length < availableModels.length) {
      this.logger.warn(
        `[planResearch] Filtered out ${availableModels.length - reachableModels.length} unavailable models`,
      );
    }

    // ★ 构建模型名称到真实 modelId 的映射（供后处理还原）
    // 当 displayName 与 modelId 不同时（如 ep-xxx 接入点），用 displayName 作为 prompt 展示名
    const modelNameToIdMap = new Map<string, string>();
    const nameCountMap = new Map<string, number>();
    const uniqueModelsForPrompt = uniqueModels.map((m) => {
      let promptName = m.name !== m.id ? m.name : m.id;

      // ★ 处理同名模型（如多个 Doubao 接入点），用能力类型区分
      const nameKey = promptName.toLowerCase();
      const count = nameCountMap.get(nameKey) || 0;
      nameCountMap.set(nameKey, count + 1);
      if (count > 0) {
        const suffix = m.isReasoning ? "reasoning" : `variant-${count + 1}`;
        promptName = `${promptName} (${suffix})`;
      }

      modelNameToIdMap.set(promptName.toLowerCase(), m.id);
      // 同时映射原始 id，以兼容 AI 直接使用 id 的情况
      modelNameToIdMap.set(m.id.toLowerCase(), m.id);
      return { ...m, promptName };
    });

    const availableModelsText =
      uniqueModelsForPrompt.length > 0
        ? uniqueModelsForPrompt
            .map((m) => `- ${m.promptName}（${m.provider}）`)
            .join("\n")
        : "- 使用默认模型";
    this.logger.log(
      `[planResearch] Available models for agents: ${uniqueModelsForPrompt.map((m) => m.promptName).join(", ")} (${availableModels.length} total, ${uniqueModels.length} unique)`,
    );

    // 4. 构建已有维度信息
    let existingDimensionsText = "无已有维度（首次研究）";
    if (topic.dimensions && topic.dimensions.length > 0) {
      existingDimensionsText = topic.dimensions
        .map(
          (d, i) =>
            `${i + 1}. **${d.name}**\n   - 描述：${d.description || "无"}\n   - 状态：${d.status}\n   - 搜索词：${(d.searchQueries as string[])?.join("、") || "待设定"}`,
        )
        .join("\n");
    }

    // ★ 4.5. 获取先前研究记忆（轻量集成）
    let priorFindingsText = "";
    try {
      const sanitizedQuery = sanitize(userPrompt || topic.name);
      const memories = await this.researchMemory.getRelevantMemories(
        sanitizedQuery,
        topicId,
        5,
      );
      if (memories.length > 0) {
        priorFindingsText = `\n\n## 先前研究发现\n\n以下是相关的先前研究发现，可作为参考：\n\n${memories.map((m) => `- **${m.entity}**: ${m.finding} (${m.category}, 置信度: ${m.confidence})`).join("\n")}`;
      }
    } catch (error) {
      this.logger.warn(
        `[planResearch] Failed to retrieve prior findings: ${error instanceof Error ? error.message : "Unknown error"}`,
      );
    }

    // 5. 构建 prompt
    // ★ 获取当前日期和年份，确保搜索词使用正确的年份
    const now = new Date();
    const currentYear = now.getFullYear().toString();
    const currentDate = now.toISOString().split("T")[0]; // YYYY-MM-DD 格式

    // ★ Security: 对所有用户输入进行消毒，防止 Prompt Injection
    const sanitizedTopicName = sanitize(topic.name);
    const sanitizedDescription = sanitize(topic.description || "无");
    const sanitizedUserPrompt = sanitize(userPrompt || "请进行全面研究");

    const prompt =
      LEADER_PLAN_PROMPT.replace("{topic}", sanitizedTopicName)
        .replace("{topicType}", topic.type)
        .replace("{description}", sanitizedDescription)
        .replace("{userPrompt}", sanitizedUserPrompt)
        .replace("{availableModels}", availableModelsText)
        .replace("{existingDimensions}", existingDimensionsText)
        .replace(/{currentDate}/g, currentDate)
        .replace(/{currentYear}/g, currentYear)
        .replace(
          "{languageInstruction}",
          getLanguageInstruction(topic.language || "zh"),
        ) + priorFindingsText;

    // 6. 调用 AI 获取规划
    const startTime = Date.now();
    let response;
    try {
      response = await this.chatFacade.chatWithSkills({
        messages: [
          {
            role: "system",
            content: "你是专业的研究协调专家，请输出 JSON 格式的研究规划。",
          },
          { role: "user", content: prompt },
        ],
        additionalSkills: ["research-planning"],
        model: leaderModel.modelId,
        taskProfile: {
          creativity: "medium",
          outputLength: "extended",
        },
      });
    } catch (aiError) {
      this.logger.error(
        `[planResearch] AI call failed: ${aiError instanceof Error ? aiError.message : aiError}`,
      );
      throw new Error(
        `AI 调用失败: ${aiError instanceof Error ? aiError.message : "未知错误"}`,
      );
    }
    const latencyMs = Date.now() - startTime;

    // 6. 验证响应
    if (!response?.content) {
      this.logger.error("[planResearch] AI returned empty response");
      throw new Error("AI 返回空响应，请稍后重试");
    }

    this.logger.log(
      `[planResearch] AI response received in ${latencyMs}ms, length: ${response.content.length}`,
    );

    // 7. 解析响应
    const plan = this.extractJsonFromResponse<LeaderPlan>(
      response.content,
      "dimensions", // requiredKey for validation
    );

    if (!plan) {
      this.logger.error(
        `[planResearch] Failed to parse Leader plan. Response preview: ${response.content.slice(0, 500)}`,
      );
      throw new Error("无法解析 AI 规划响应，请稍后重试");
    }

    // ★ 后处理：确保每个 Agent 都有 modelId、skills、tools
    if (plan.agentAssignments) {
      let modelIndex = 0;

      // ★ 创建模型 ID 到完整信息的映射，用于生成有意义的 modelReason
      const modelInfoMap = new Map(uniqueModels.map((m) => [m.id, m]));

      // ★ 辅助函数：根据模型特点生成有意义的理由
      const getModelReasonText = (
        modelId: string,
        taskType: "research" | "review" | "write",
      ): string => {
        const model = modelInfoMap.get(modelId);
        if (!model) {
          return `使用 ${modelId} 模型处理此任务`;
        }

        const { name, provider, isReasoning } = model;
        const modelName = name || modelId;

        // 根据模型特点和任务类型生成描述
        if (isReasoning) {
          if (taskType === "research") {
            return `选择 ${modelName}（${provider}）推理模型，其深度思考能力适合复杂信息分析和逻辑推理`;
          } else if (taskType === "review") {
            return `选择 ${modelName}（${provider}）推理模型，其严谨的逻辑推理能力适合质量审核`;
          } else {
            return `选择 ${modelName}（${provider}）推理模型，其结构化思维能力适合报告撰写`;
          }
        }

        // 根据 provider 生成描述
        const providerLower = provider.toLowerCase();
        if (providerLower.includes("openai") || modelId.includes("gpt")) {
          return `选择 ${modelName}（${provider}），其在${taskType === "research" ? "信息理解和内容生成" : taskType === "review" ? "文本分析和一致性检查" : "长文本生成和结构组织"}方面表现出色`;
        } else if (
          providerLower.includes("anthropic") ||
          modelId.includes("claude")
        ) {
          return `选择 ${modelName}（${provider}），其在${taskType === "research" ? "深度阅读和信息提取" : taskType === "review" ? "细节审查和逻辑验证" : "专业写作和内容整合"}方面表现优异`;
        } else if (
          providerLower.includes("google") ||
          modelId.includes("gemini")
        ) {
          return `选择 ${modelName}（${provider}），其在${taskType === "research" ? "多模态理解和知识整合" : taskType === "review" ? "事实核查和一致性检验" : "内容生成和格式优化"}方面具有优势`;
        } else if (
          providerLower.includes("deepseek") ||
          modelId.includes("deepseek")
        ) {
          return `选择 ${modelName}（${provider}），其在${taskType === "research" ? "中文理解和专业分析" : taskType === "review" ? "逻辑推理和质量评估" : "技术写作和内容组织"}方面表现突出`;
        } else if (providerLower.includes("xai") || modelId.includes("grok")) {
          return `选择 ${modelName}（${provider}），其在${taskType === "research" ? "实时信息获取和趋势分析" : taskType === "review" ? "批判性思维和验证" : "创意写作和观点整合"}方面有独特优势`;
        }

        // 默认描述
        return `选择 ${modelName}（${provider}），其综合能力适合处理${taskType === "research" ? "研究分析" : taskType === "review" ? "质量审核" : "报告撰写"}任务`;
      };

      for (const assignment of plan.agentAssignments) {
        // 0. ★ 将 AI 填写的 displayName 还原为真实 modelId
        if (assignment.modelId) {
          const aiModelId = assignment.modelId.toLowerCase();
          let realId = modelNameToIdMap.get(aiModelId);

          // ★ 模糊匹配：AI 可能返回不完整的名称（如 "Doubao" 而非 "Doubao (豆包)"）
          // 选择最长前缀匹配，避免 "gpt" 误匹配到 "gpt-4o" 而非 "gpt-5.1"
          if (!realId) {
            let bestMatchLen = 0;
            for (const [key, id] of modelNameToIdMap.entries()) {
              if (key.startsWith(aiModelId) || aiModelId.startsWith(key)) {
                const matchLen = Math.min(key.length, aiModelId.length);
                if (matchLen > bestMatchLen) {
                  bestMatchLen = matchLen;
                  realId = id;
                }
              }
            }
          }

          if (realId && realId !== assignment.modelId) {
            this.logger.log(
              `[planResearch] Resolved model name "${assignment.modelId}" → "${realId}" for ${assignment.agentName || assignment.agentId}`,
            );
            assignment.modelId = realId;
          }
        }

        // 1. 为缺少 modelId 的 Agent 自动轮询分配
        if (!assignment.modelId && availableModels.length > 0) {
          const model = availableModels[modelIndex % availableModels.length];
          assignment.modelId = model.id;
          this.logger.log(
            `[planResearch] Auto-assigned model ${model.id} to ${assignment.agentName || assignment.agentId}`,
          );
          modelIndex++;
        }

        // 2. 为研究员确保有 skills（若 AI 未返回则根据维度内容智能选择）
        if (assignment.agentType === "dimension_researcher") {
          if (!assignment.skills || assignment.skills.length === 0) {
            assignment.skills = this.selectDefaultSkillsForDimension(
              assignment,
              plan.dimensions,
            );
            this.logger.debug(
              `[planResearch] Auto-assigned skills [${assignment.skills.join(", ")}] to ${assignment.agentName || assignment.agentId}`,
            );
          }
          if (!assignment.tools || assignment.tools.length === 0) {
            assignment.tools = ["web-search"];
            this.logger.debug(
              `[planResearch] Auto-assigned default tools to ${assignment.agentName || assignment.agentId}`,
            );
          }
          // ★ 为研究员确保有 assignmentReason（包括 modelReason）
          const dimensionNames =
            assignment.assignedDimensions
              ?.map((dimId) => {
                const dim = plan.dimensions.find((d) => d.id === dimId);
                return dim?.name || dimId;
              })
              .join("、") || "相关领域";

          if (!assignment.assignmentReason) {
            assignment.assignmentReason = {
              agentReason: `${assignment.agentName || "研究员"}专注于「${dimensionNames}」领域的深度调研，具备该领域的信息收集和分析能力`,
              modelReason: assignment.modelId
                ? getModelReasonText(assignment.modelId, "research")
                : "使用擅长信息检索和内容分析的模型",
            };
            this.logger.debug(
              `[planResearch] Auto-assigned default assignmentReason to ${assignment.agentName || assignment.agentId}`,
            );
          } else {
            // ★ 确保 agentReason 不为空
            if (!assignment.assignmentReason.agentReason) {
              assignment.assignmentReason.agentReason = `${assignment.agentName || "研究员"}专注于「${dimensionNames}」领域的深度调研`;
            }
          }
          // ★ 强制用具体模型信息覆盖 AI 返回的通用 modelReason
          if (assignment.modelId) {
            assignment.assignmentReason.modelReason = getModelReasonText(
              assignment.modelId,
              "research",
            );
          }
        }

        // 3. 为质量审核员确保有 skills
        if (assignment.agentType === "quality_reviewer") {
          if (!assignment.skills || assignment.skills.length === 0) {
            assignment.skills = ["critical_thinking", "synthesis"];
          }
          // ★ 为审核员确保有 assignmentReason
          if (!assignment.assignmentReason) {
            assignment.assignmentReason = {
              agentReason: `${assignment.agentName || "质量审核员"}负责全面审核研究成果，确保内容准确性、逻辑一致性和完整性`,
              modelReason: "使用擅长一致性检查和质量评估的模型",
            };
          } else if (!assignment.assignmentReason.agentReason) {
            assignment.assignmentReason.agentReason = `${assignment.agentName || "质量审核员"}负责全面审核研究成果，确保内容准确性、逻辑一致性和完整性`;
          }
          // ★ 强制用具体模型信息覆盖 AI 返回的通用 modelReason
          if (assignment.modelId) {
            assignment.assignmentReason.modelReason = getModelReasonText(
              assignment.modelId,
              "review",
            );
          }
        }

        // 4. 为报告撰写员确保有 skills
        if (assignment.agentType === "report_writer") {
          if (!assignment.skills || assignment.skills.length === 0) {
            assignment.skills = ["synthesis"];
          }
          // ★ 为撰写员确保有 assignmentReason
          if (!assignment.assignmentReason) {
            assignment.assignmentReason = {
              agentReason: `${assignment.agentName || "报告撰写员"}负责整合多维度研究成果，生成结构清晰、逻辑连贯的专业报告`,
              modelReason: "使用具有强大语言生成和内容整合能力的模型",
            };
          } else if (!assignment.assignmentReason.agentReason) {
            assignment.assignmentReason.agentReason = `${assignment.agentName || "报告撰写员"}负责整合多维度研究成果，生成结构清晰、逻辑连贯的专业报告`;
          }
          // ★ 强制用具体模型信息覆盖 AI 返回的通用 modelReason
          if (assignment.modelId) {
            assignment.assignmentReason.modelReason = getModelReasonText(
              assignment.modelId,
              "write",
            );
          }
        }
      }
    }

    this.logger.log(
      `[planResearch] Plan created with ${plan.dimensions.length} dimensions in ${latencyMs}ms`,
    );

    // ★ 打印 Agent 分配情况（包含模型、技能、工具）
    const researcherSummary = plan.agentAssignments
      ?.filter((a) => a.agentType === "dimension_researcher")
      .map((a) => {
        const parts = [a.agentName || a.agentId];
        if (a.modelId) parts.push(`model=${a.modelId}`);
        if (a.skills?.length) parts.push(`skills=[${a.skills.join(",")}]`);
        if (a.tools?.length) parts.push(`tools=[${a.tools.join(",")}]`);
        return parts.join(" ");
      })
      .join(" | ");
    this.logger.log(`[planResearch] Agent assignments: ${researcherSummary}`);

    return plan;
  }

  /**
   * Leader 规划全局协调大纲（Phase 2）
   *
   * 核心职责：
   * 1. 全局视角 - 同时查看所有维度的搜索结果
   * 2. 协调去重 - 确保各维度之间分工明确，避免重复
   * 3. 规划大纲 - 为每个维度规划完整章节结构
   *
   * @param topic 研究专题
   * @param dimensionSearchResults 所有维度的搜索结果摘要
   * @returns 全局协调的大纲
   */
  async planGlobalOutline(
    topic: {
      name: string;
      type: string;
      description?: string | null;
      language?: string | null;
    },
    dimensionSearchResults: Array<{
      dimensionId: string;
      dimensionName: string;
      dimensionDescription?: string | null;
      evidenceSummary: string;
      figuresSummary: string;
      searchQueries?: string[] | unknown;
    }>,
  ): Promise<GlobalOutline> {
    this.logger.log(
      `[planGlobalOutline] Planning global coordinated outline for ${dimensionSearchResults.length} dimensions`,
    );

    // 构建所有维度的搜索结果摘要（限制每个维度摘要长度，避免 token 溢出）
    const MAX_EVIDENCE_CHARS = 1200;
    const MAX_FIGURES_CHARS = 300;
    const dimensionSearchResultsText = dimensionSearchResults
      .map((d, index) => {
        const queries = Array.isArray(d.searchQueries)
          ? (d.searchQueries as string[]).join(", ")
          : "无";
        const evidenceText = (d.evidenceSummary || "").substring(
          0,
          MAX_EVIDENCE_CHARS,
        );
        const figuresText = (d.figuresSummary || "").substring(
          0,
          MAX_FIGURES_CHARS,
        );
        return `### 维度 ${index + 1}: ${d.dimensionName}

**描述**: ${d.dimensionDescription || "无"}
**搜索重点**: ${queries}

**搜索结果摘要**:
${evidenceText}

${figuresText ? `**可用图表**:\n${figuresText}` : ""}

---`;
      })
      .join("\n\n");

    const prompt = GLOBAL_OUTLINE_PROMPT.replace("{topicName}", topic.name)
      .replace("{topicType}", topic.type)
      .replace("{topicDescription}", topic.description || "无")
      .replace("{dimensionSearchResults}", dimensionSearchResultsText)
      .replace(
        "{languageInstruction}",
        getLanguageInstruction(topic.language || "zh"),
      );

    // 重试机制
    const MAX_RETRIES = 3;
    const RETRY_DELAY_MS = 2000;
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      try {
        const leaderModel = await this.getReasoningModel();
        if (!leaderModel) {
          throw new Error("No reasoning model available for Leader");
        }
        this.logger.log(
          `[planGlobalOutline] Attempt ${attempt}/${MAX_RETRIES}: Using model ${leaderModel.modelId}`,
        );

        const startTime = Date.now();
        const response = await this.chatFacade.chatWithSkills({
          messages: [
            {
              role: "system",
              content:
                "你是研究协调专家 Leader，负责全局协调各维度的研究大纲。请输出 JSON 格式。",
            },
            { role: "user", content: prompt },
          ],
          additionalSkills: ["research-planning"],
          model: leaderModel.modelId,
          taskProfile: {
            creativity: "medium",
            outputLength: "extended",
          },
        });
        const latencyMs = Date.now() - startTime;

        if (response.isError) {
          const errorContent = response.content.slice(0, 200);
          this.logger.warn(
            `[planGlobalOutline] Attempt ${attempt}/${MAX_RETRIES}: API returned error: ${errorContent}`,
          );
          const isQuotaError =
            errorContent.includes("429") ||
            errorContent.includes("quota") ||
            errorContent.includes("rate limit") ||
            errorContent.includes("temporarily unavailable");
          lastError = new Error(`API error: ${response.content.slice(0, 100)}`);
          if (attempt < MAX_RETRIES) {
            await this.delay(isQuotaError ? 500 : RETRY_DELAY_MS * attempt);
            continue;
          }
        }

        if (
          response.content.includes("<!DOCTYPE") ||
          response.content.includes("<html")
        ) {
          this.logger.warn(
            `[planGlobalOutline] Attempt ${attempt}/${MAX_RETRIES}: API returned HTML error page, retrying...`,
          );
          lastError = new Error("API returned HTML error page instead of JSON");
          if (attempt < MAX_RETRIES) {
            await this.delay(RETRY_DELAY_MS * attempt);
            continue;
          }
        }

        const globalOutline = this.extractJsonFromResponse<GlobalOutline>(
          response.content,
          "dimensions",
        );

        if (
          !globalOutline?.dimensions ||
          globalOutline.dimensions.length === 0
        ) {
          this.logger.warn(
            `[planGlobalOutline] Attempt ${attempt}/${MAX_RETRIES}: Failed to parse JSON, retrying...`,
          );
          lastError = new Error("Failed to parse global outline JSON");
          if (attempt < MAX_RETRIES) {
            await this.delay(RETRY_DELAY_MS * attempt);
            continue;
          }
        } else {
          // Validate: ensure all input dimensions have corresponding outline entries
          const inputNames = new Set(
            dimensionSearchResults.map((d) => d.dimensionName),
          );
          const outlineNames = new Set(
            globalOutline.dimensions.map((d) => d.dimensionName),
          );
          const missing = [...inputNames].filter((n) => !outlineNames.has(n));
          if (missing.length > 0) {
            this.logger.warn(
              `[planGlobalOutline] Outline missing ${missing.length} dimensions: ${missing.join(", ")}. Adding stubs.`,
            );
            // Add stub outlines for missing dimensions
            const APPENDIX_KEYWORDS =
              /附录|方法论|参考文献|指标体系|术语|工具清单|glossary|appendix|methodology/i;
            for (const name of missing) {
              const inputDim = dimensionSearchResults.find(
                (d) => d.dimensionName === name,
              );
              // ★ B4: 附录类维度字数减半
              const isAppendixLike = APPENDIX_KEYWORDS.test(name);
              const stubWords = isAppendixLike ? 400 : 800;
              globalOutline.dimensions.push({
                dimensionId: inputDim?.dimensionId || "",
                dimensionName: name,
                crossDimensionNotes: "",
                outline: {
                  intentUnderstanding: {
                    coreQuestion: name,
                    scope: { included: [name], excluded: [] },
                    expectedDepth: isAppendixLike ? "overview" : "detailed",
                    targetAudience: "general",
                    keyFocusAreas: [name],
                  },
                  sections: [
                    {
                      id: `stub-${name}`,
                      title: name,
                      description: "综合分析",
                      keyPoints: ["综合分析"],
                      targetWords: stubWords,
                      evidenceRequirements: { minReferences: 2 },
                    },
                  ],
                  executionPlan: {
                    parallelGroups: [[`stub-${name}`]],
                    estimatedTotalWords: stubWords,
                  },
                },
              });
            }
          }

          this.logger.log(
            `[planGlobalOutline] Created global outline for ${globalOutline.dimensions.length} dimensions in ${latencyMs}ms (attempt ${attempt})`,
          );
          return globalOutline;
        }
      } catch (error) {
        this.logger.warn(
          `[planGlobalOutline] Attempt ${attempt}/${MAX_RETRIES} failed: ${error instanceof Error ? error.message : "Unknown error"}`,
        );
        lastError =
          error instanceof Error ? error : new Error("Unknown API error");
        if (attempt < MAX_RETRIES) {
          await this.delay(RETRY_DELAY_MS * attempt);
        }
      }
    }

    this.logger.error(`[planGlobalOutline] All ${MAX_RETRIES} attempts failed`);
    throw new Error(
      `Failed to parse global outline after ${MAX_RETRIES} attempts: ${lastError?.message || "Unknown error"}`,
    );
  }

  /**
   * Leader 规划维度分析大纲
   *
   * 核心职责：
   * 1. 理解用户意图
   * 2. 规划完整章节结构
   * 3. 确保广度和覆盖度
   */
  async planDimensionOutline(
    topic: {
      name: string;
      type: string;
      description?: string | null;
      language?: string | null;
    },
    dimension: {
      name: string;
      description?: string | null;
      searchQueries?: string[] | unknown;
    },
    evidenceSummary: string,
    figuresSummary?: string, // ★ 新增：可用图表列表
    otherDimensions?: Array<{ name: string; description?: string | null }>,
  ): Promise<DimensionOutline> {
    this.logger.log(
      `[planDimensionOutline] Planning outline for dimension: ${dimension.name}`,
    );

    const focusAreas = Array.isArray(dimension.searchQueries)
      ? (dimension.searchQueries as string[]).join(", ")
      : "无";

    const otherDimensionsInfo =
      otherDimensions && otherDimensions.length > 0
        ? otherDimensions
            .filter((d) => d.name !== dimension.name)
            .map(
              (d) =>
                `- **${d.name}**${d.description ? `：${d.description}` : ""}`,
            )
            .join("\n")
        : "无其他维度";

    const prompt = DIMENSION_OUTLINE_PROMPT.replace("{topicName}", topic.name)
      .replace("{topicType}", topic.type)
      .replace("{topicDescription}", topic.description || "无")
      .replace(/\{dimensionName\}/g, () => dimension.name)
      .replace("{dimensionDescription}", dimension.description || "无")
      .replace("{focusAreas}", focusAreas)
      .replace("{evidenceSummary}", evidenceSummary)
      .replace("{otherDimensionsInfo}", otherDimensionsInfo)
      .replace(
        "{languageInstruction}",
        getLanguageInstruction(topic.language || "zh"),
      );

    // ★ 注入图表分配信息
    const figuresSection = figuresSummary
      ? `\n\n## 可用图表资源\n${figuresSummary}\n\n**图表分配指令**：\n1. 为每个 section 分配 0-2 个**内容直接相关**的图表\n2. 每张图只能分配给一个 section\n3. 在 sections 的每个条目中新增 "allocatedFigures" 字段\n\n**相关性判断标准（严格遵守）**：\n- 图表的标题/描述中的**核心主题词**必须与 section 的标题或 keyPoints 直接相关\n- 例如："硬件演进"图表 → 只能分配给讨论硬件/算力的 section，不能分配给讨论注意力机制的 section\n- 例如："机器人基础模型"图表 → 只能分配给讨论机器人/具身智能的 section，不能分配给讨论 GPT 的 section\n- 如果没有直接相关的图表，该 section 的 allocatedFigures 留空数组 []\n- **宁缺勿滥**：不确定是否相关时，不分配\n\n**relevanceReason 必须具体说明**：图表中的哪个关键词/主题与 section 的哪个要点直接对应`
      : "";
    const finalPrompt = prompt + figuresSection;

    // ★ 添加重试机制，处理 API 临时故障
    const MAX_RETRIES = 3;
    const RETRY_DELAY_MS = 2000;
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      try {
        // ★ 最后一次尝试时回退到非推理模型，增加容错性
        const useReasoning = attempt < MAX_RETRIES;
        const leaderModel = useReasoning
          ? await this.getReasoningModel()
          : await this.chatFacade.selectModel({ requireReasoning: false });
        if (!leaderModel) {
          throw new Error("No model available for Leader");
        }
        const modelId =
          "modelId" in leaderModel ? leaderModel.modelId : leaderModel.id;
        this.logger.log(
          `[planDimensionOutline] Attempt ${attempt}/${MAX_RETRIES}: Using model ${modelId}${!useReasoning ? " (non-reasoning fallback)" : ""}`,
        );

        const startTime = Date.now();
        const response = await this.chatFacade.chatWithSkills({
          messages: [
            {
              role: "system",
              content:
                '你是研究协调专家 Leader，负责规划维度分析大纲。你必须只输出合法的 JSON 对象，不要输出任何解释文字、markdown 代码块标记或其他非 JSON 内容。JSON 必须包含 "sections" 数组。',
            },
            { role: "user", content: finalPrompt },
          ],
          additionalSkills: ["research-planning"],
          model: modelId,
          taskProfile: {
            creativity: "medium",
            outputLength: "long",
          },
        });
        const latencyMs = Date.now() - startTime;

        // ★ 关键修复：检查 API 是否返回了错误
        if (response.isError) {
          const errorContent = response.content.slice(0, 200);
          this.logger.warn(
            `[planDimensionOutline] Attempt ${attempt}/${MAX_RETRIES}: API returned error: ${errorContent}`,
          );
          // ★ 检测配额超限错误，这类错误切换模型后可能成功
          const isQuotaError =
            errorContent.includes("429") ||
            errorContent.includes("quota") ||
            errorContent.includes("rate limit") ||
            errorContent.includes("temporarily unavailable");
          lastError = new Error(`API error: ${response.content.slice(0, 100)}`);
          if (attempt < MAX_RETRIES) {
            // 配额错误不需要等太久，快速切换到下一个模型
            await this.delay(isQuotaError ? 500 : RETRY_DELAY_MS * attempt);
            continue;
          }
        }

        // ★ 检测是否返回了 HTML 错误页面（API 故障特征）
        if (
          response.content.includes("<!DOCTYPE") ||
          response.content.includes("<html")
        ) {
          this.logger.warn(
            `[planDimensionOutline] Attempt ${attempt}/${MAX_RETRIES}: API returned HTML error page, retrying...`,
          );
          lastError = new Error("API returned HTML error page instead of JSON");
          if (attempt < MAX_RETRIES) {
            await this.delay(RETRY_DELAY_MS * attempt);
            continue;
          }
        }

        const outline = this.extractJsonFromResponse<DimensionOutline>(
          response.content,
          "sections", // requiredKey for validation
        );

        if (!outline?.sections || outline.sections.length === 0) {
          // ★ 记录原始输出前500字符，帮助诊断 JSON 解析失败原因
          this.logger.warn(
            `[planDimensionOutline] Attempt ${attempt}/${MAX_RETRIES}: Failed to parse JSON. Raw output (first 500 chars): ${response.content.slice(0, 500)}`,
          );
          lastError = new Error("Failed to parse dimension outline JSON");
          if (attempt < MAX_RETRIES) {
            await this.delay(RETRY_DELAY_MS * attempt);
            continue;
          }
        } else {
          // ★ 成功
          this.logger.log(
            `[planDimensionOutline] Created outline with ${outline.sections.length} sections in ${latencyMs}ms (attempt ${attempt})`,
          );
          return outline;
        }
      } catch (error) {
        this.logger.warn(
          `[planDimensionOutline] Attempt ${attempt}/${MAX_RETRIES} failed: ${error instanceof Error ? error.message : "Unknown error"}`,
        );
        lastError =
          error instanceof Error ? error : new Error("Unknown API error");
        if (attempt < MAX_RETRIES) {
          await this.delay(RETRY_DELAY_MS * attempt);
        }
      }
    }

    // ★ 所有重试都失败
    this.logger.error(
      `[planDimensionOutline] All ${MAX_RETRIES} attempts failed for dimension: ${dimension.name}`,
    );
    throw new Error(
      `Failed to parse dimension outline after ${MAX_RETRIES} attempts: ${lastError?.message || "Unknown error"}`,
    );
  }

  /**
   * 根据维度内容智能选择默认技能
   * 当 AI 未返回 skills 时，基于维度名称和描述选择合适的技能
   */
  private selectDefaultSkillsForDimension(
    assignment: { assignedDimensions?: string[] },
    dimensions: Array<{ id: string; name: string; description?: string }>,
  ): string[] {
    // 基础技能（始终包含）
    const skills = new Set(["deep_dive", "synthesis"]);

    // 收集该 Agent 负责的维度名称和描述
    const dimTexts = (assignment.assignedDimensions || [])
      .map((dimId) => {
        const dim = dimensions.find((d) => d.id === dimId);
        return dim ? `${dim.name} ${dim.description || ""}` : "";
      })
      .join(" ")
      .toLowerCase();

    // 无维度信息时使用通用默认
    if (!dimTexts) {
      skills.add("data_interpretation");
      return [...skills];
    }

    // 关键词 → 技能映射
    const keywordSkillMap: Array<{
      keywords: string[];
      skill: string;
    }> = [
      {
        keywords: ["趋势", "走势", "变化", "增长", "下降", "trend", "growth"],
        skill: "trend_analysis",
      },
      {
        keywords: [
          "竞争",
          "竞品",
          "对手",
          "格局",
          "market share",
          "competitor",
          "competition",
        ],
        skill: "competitive_analysis",
      },
      {
        keywords: [
          "对比",
          "比较",
          "差异",
          "versus",
          "vs",
          "compare",
          "comparison",
        ],
        skill: "comparison",
      },
      {
        keywords: [
          "数据",
          "指标",
          "统计",
          "data",
          "metric",
          "statistics",
          "分析",
        ],
        skill: "data_interpretation",
      },
      {
        keywords: ["未来", "预测", "展望", "forecast", "outlook", "projection"],
        skill: "future_projection",
      },
      {
        keywords: [
          "原因",
          "影响",
          "因果",
          "驱动",
          "cause",
          "effect",
          "impact",
          "driver",
        ],
        skill: "cause_effect",
      },
      {
        keywords: [
          "评估",
          "优劣",
          "利弊",
          "风险",
          "swot",
          "strength",
          "weakness",
          "优势",
          "劣势",
          "机遇",
          "威胁",
        ],
        skill: "swot_analysis",
      },
      {
        keywords: [
          "审视",
          "批判",
          "反思",
          "质疑",
          "critical",
          "evaluate",
          "问题",
          "挑战",
        ],
        skill: "critical_thinking",
      },
    ];

    for (const { keywords, skill } of keywordSkillMap) {
      if (keywords.some((kw) => dimTexts.includes(kw))) {
        skills.add(skill);
      }
    }

    // 限制最多 5 个技能（避免 prompt 膨胀）
    const result = [...skills];
    return result.length > 5 ? result.slice(0, 5) : result;
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

  /** 延迟函数 */
  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
