import { Injectable, Logger, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../../../../common/prisma/prisma.service";
import { AiTeamsService } from "../../teams/ai-teams.service";
import { AiResponseService } from "../../teams/services/ai/ai-response.service";
import { PlanningTemplateService } from "./planning-template.service";
import { CreatePlanDto, PlanningDepth } from "../dto/create-plan.dto";
import { UpdatePlanDto } from "../dto/update-plan.dto";
import { Prisma, TopicType, AIModelType } from "@prisma/client";
import { AIEngineFacade } from "../../../ai-engine/facade";
import type { ChatMessage, TaskProfile } from "../../../ai-engine/facade";

export interface PlanPhaseStatus {
  status: "pending" | "active" | "completed" | "skipped" | "failed";
  missionId?: string;
  debateSessionId?: string;
  summary?: string;
  completedAt?: string;
  error?: string;
}

export interface PlanReference {
  id: string;
  title: string;
  url: string;
  domain: string;
  snippet: string;
  publishedDate?: string;
  score?: number;
  credibilityScore?: number;
  sourceType?: string;
  sourcePhase: number;
}

export interface PlanningTopicMetadata {
  planningMode: true;
  templateId: string;
  currentPhase: number;
  phaseStatus: Record<number, PlanPhaseStatus>;
  planConfig: {
    goal: string;
    depth: PlanningDepth;
    autoAdvance: boolean;
  };
  references?: PlanReference[];
}

export interface PlanSummary {
  id: string;
  name: string;
  goal: string;
  templateId: string;
  currentPhase: number;
  totalPhases: number;
  phaseStatus: Record<number, PlanPhaseStatus>;
  createdAt: Date;
  updatedAt: Date;
  memberCount: number;
}

export interface PlanDetail extends PlanSummary {
  description: string | null;
  depth: PlanningDepth;
  autoAdvance: boolean;
  members: Array<{ id: string; displayName: string; aiModel: string }>;
  references: PlanReference[];
}

const PHASE_NAMES = [
  "",
  "goal-analysis",
  "research",
  "brainstorm",
  "debate",
  "synthesis",
  "delivery",
];

const PHASE_LABELS = [
  "",
  "目标分析",
  "调研洞察",
  "头脑风暴",
  "辩论推演",
  "方案综合",
  "输出交付",
];

/** Maps phase number → indices into the AI members array */
const PHASE_AGENT_INDICES: Record<number, number[]> = {
  1: [0, 2], // leader + analyst
  2: [1, 2], // researcher + analyst
  3: [0, 1, 3], // leader + researcher + copywriter
  4: [4, 5], // debaters (comprehensive) — falls back to [0, 2] if missing
  5: [0, 2, 3], // leader + analyst + copywriter
  6: [0, 3], // leader + copywriter
};

/** Role name → model category: "reasoning" or "chat" */
const ROLE_MODEL_TYPE: Record<string, "reasoning" | "chat"> = {
  策划总监: "reasoning",
  分析师: "reasoning",
  研究员: "chat",
  文案专家: "chat",
  正方辩手: "chat",
  反方辩手: "chat",
};

const TOTAL_PHASES = 6;

const DEFAULT_FALLBACK_MODEL = "claude-sonnet-4-20250514";

@Injectable()
export class PlanningOrchestratorService {
  private readonly logger = new Logger(PlanningOrchestratorService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly aiTeamsService: AiTeamsService,
    private readonly aiResponseService: AiResponseService,
    private readonly templateService: PlanningTemplateService,
    private readonly aiFacade: AIEngineFacade,
  ) {}

  // ==================== Plan CRUD ====================

  async createPlan(
    userId: string,
    dto: CreatePlanDto,
  ): Promise<{ planId: string }> {
    const template = dto.templateId
      ? this.templateService.getTemplate(dto.templateId)
      : this.templateService.getDefaultTemplate();

    if (!template) {
      throw new NotFoundException(`Template ${dto.templateId} not found`);
    }

    const depth = dto.depth || PlanningDepth.STANDARD;

    const phaseStatus: Record<number, PlanPhaseStatus> = {};
    for (let i = 1; i <= TOTAL_PHASES; i++) {
      phaseStatus[i] = { status: "pending" };
    }

    const metadata: PlanningTopicMetadata = {
      planningMode: true,
      templateId: template.id,
      currentPhase: 0,
      phaseStatus,
      planConfig: { goal: dto.goal, depth, autoAdvance: true },
    };

    // Fix 1: Dynamic model allocation via AIEngineFacade
    const aiMembers = await this.buildAIMembers(depth);

    const topic = await this.aiTeamsService.createTopic(userId, {
      name: dto.name,
      description: dto.goal,
      type: TopicType.PRIVATE,
      aiMembers,
    });

    await this.prisma.topic.update({
      where: { id: topic.id },
      data: { metadata: metadata as unknown as Prisma.InputJsonValue },
    });

    this.logger.log(`Planning created: ${topic.id}, template: ${template.id}`);
    return { planId: topic.id };
  }

  async getPlans(userId: string, search?: string): Promise<PlanSummary[]> {
    const topics = await this.prisma.topic.findMany({
      where: {
        members: { some: { userId } },
        metadata: { path: ["planningMode"], equals: true },
        archivedAt: null,
        ...(search
          ? { name: { contains: search, mode: "insensitive" as const } }
          : {}),
      },
      include: { _count: { select: { aiMembers: true } } },
      orderBy: { updatedAt: "desc" },
    });

    return topics.map((topic) => {
      const meta =
        (topic.metadata as unknown as PlanningTopicMetadata) ||
        ({} as PlanningTopicMetadata);
      return {
        id: topic.id,
        name: topic.name,
        goal: meta.planConfig?.goal || topic.description || "",
        templateId: meta.templateId || "general",
        currentPhase: meta.currentPhase || 0,
        totalPhases: TOTAL_PHASES,
        phaseStatus: meta.phaseStatus || {},
        createdAt: topic.createdAt,
        updatedAt: topic.updatedAt,
        memberCount: topic._count.aiMembers,
      };
    });
  }

  async getPlanDetail(planId: string, userId: string): Promise<PlanDetail> {
    const topic = await this.prisma.topic.findFirst({
      where: {
        id: planId,
        members: { some: { userId } },
        metadata: { path: ["planningMode"], equals: true },
      },
      include: {
        aiMembers: {
          select: { id: true, displayName: true, aiModel: true },
          orderBy: { createdAt: "asc" },
        },
        _count: { select: { aiMembers: true } },
      },
    });

    if (!topic) {
      throw new NotFoundException("Plan not found");
    }

    const meta =
      (topic.metadata as unknown as PlanningTopicMetadata) ||
      ({} as PlanningTopicMetadata);

    return {
      id: topic.id,
      name: topic.name,
      description: topic.description,
      goal: meta.planConfig?.goal || topic.description || "",
      templateId: meta.templateId || "general",
      currentPhase: meta.currentPhase || 0,
      totalPhases: TOTAL_PHASES,
      phaseStatus: meta.phaseStatus || {},
      depth: meta.planConfig?.depth || PlanningDepth.STANDARD,
      autoAdvance: meta.planConfig?.autoAdvance ?? true,
      createdAt: topic.createdAt,
      updatedAt: topic.updatedAt,
      memberCount: topic._count.aiMembers,
      members: topic.aiMembers,
      references: meta.references || [],
    };
  }

  async updatePlan(
    planId: string,
    userId: string,
    dto: UpdatePlanDto,
  ): Promise<PlanDetail> {
    const topic = await this.prisma.topic.findFirst({
      where: {
        id: planId,
        members: { some: { userId } },
        metadata: { path: ["planningMode"], equals: true },
      },
    });

    if (!topic) {
      throw new NotFoundException("Plan not found");
    }

    const meta =
      (topic.metadata as unknown as PlanningTopicMetadata) ||
      ({} as PlanningTopicMetadata);

    // Only allow updates when not currently running
    const isRunning = Object.values(meta.phaseStatus || {}).some(
      (s) => s.status === "active",
    );
    if (isRunning) {
      throw new NotFoundException("Cannot update plan while a phase is active");
    }

    const updatedConfig = { ...meta.planConfig };
    if (dto.goal !== undefined) updatedConfig.goal = dto.goal;
    if (dto.depth !== undefined) updatedConfig.depth = dto.depth;

    const updatedMetadata: PlanningTopicMetadata = {
      ...meta,
      planConfig: updatedConfig,
    };

    const updateData: Prisma.TopicUpdateInput = {
      metadata: updatedMetadata as unknown as Prisma.InputJsonValue,
    };
    if (dto.name !== undefined) updateData.name = dto.name;
    if (dto.goal !== undefined) updateData.description = dto.goal;

    await this.prisma.topic.update({
      where: { id: planId },
      data: updateData,
    });

    return this.getPlanDetail(planId, userId);
  }

  // ==================== Phase State Machine (Fix 2) ====================

  async advancePhase(
    planId: string,
    userId: string,
  ): Promise<{ currentPhase: number }> {
    const topic = await this.prisma.topic.findFirst({
      where: {
        id: planId,
        members: { some: { userId } },
        metadata: { path: ["planningMode"], equals: true },
      },
    });

    if (!topic) {
      throw new NotFoundException("Plan not found");
    }

    const meta =
      (topic.metadata as unknown as PlanningTopicMetadata) ||
      ({} as PlanningTopicMetadata);
    const currentPhase = meta.currentPhase || 0;
    const currentStatus = meta.phaseStatus?.[currentPhase];

    // State machine logic
    if (currentPhase === 0) {
      // Not started → start phase 1
      return this.activatePhase(planId, userId, meta, 1);
    }

    if (currentStatus?.status === "active") {
      // Already running → ignore (don't skip)
      this.logger.warn(
        `Plan ${planId} phase ${currentPhase} already active, ignoring advance`,
      );
      return { currentPhase };
    }

    if (currentStatus?.status === "pending") {
      // Was cancelled → re-activate current phase
      return this.activatePhase(planId, userId, meta, currentPhase);
    }

    if (currentStatus?.status === "completed") {
      // Completed → advance to next phase
      const nextPhase = currentPhase + 1;
      if (nextPhase > TOTAL_PHASES) {
        return { currentPhase }; // All done
      }
      return this.activatePhase(planId, userId, meta, nextPhase);
    }

    if (currentStatus?.status === "failed") {
      // Failed → re-activate current phase (retry on user click)
      return this.activatePhase(planId, userId, meta, currentPhase);
    }

    return { currentPhase };
  }

  private async activatePhase(
    planId: string,
    userId: string,
    _meta: PlanningTopicMetadata,
    targetPhase: number,
  ): Promise<{ currentPhase: number }> {
    // Read fresh metadata to prevent stale overwrites (Bug 1 fix)
    const topic = await this.prisma.topic.findFirst({
      where: { id: planId },
    });
    if (!topic) throw new NotFoundException("Plan not found");

    const freshMeta =
      (topic.metadata as unknown as PlanningTopicMetadata) ||
      ({} as PlanningTopicMetadata);

    const updatedPhaseStatus = { ...freshMeta.phaseStatus };
    updatedPhaseStatus[targetPhase] = {
      ...updatedPhaseStatus[targetPhase],
      status: "active",
    };

    const updatedMetadata: PlanningTopicMetadata = {
      ...freshMeta,
      currentPhase: targetPhase,
      phaseStatus: updatedPhaseStatus,
    };

    await this.prisma.topic.update({
      where: { id: planId },
      data: {
        metadata: updatedMetadata as unknown as Prisma.InputJsonValue,
      },
    });

    this.logger.log(
      `Plan ${planId} activated phase ${targetPhase}: ${PHASE_NAMES[targetPhase]}`,
    );

    // Fix 3: Trigger async AI execution
    this.executePhaseAsync(planId, userId, targetPhase).catch((err) => {
      this.logger.error(
        `Phase ${targetPhase} execution failed for plan ${planId}: ${err.message}`,
        err.stack,
      );
    });

    return { currentPhase: targetPhase };
  }

  async retryPhase(
    planId: string,
    phase: number,
    userId: string,
  ): Promise<void> {
    if (phase < 1 || phase > TOTAL_PHASES) {
      throw new NotFoundException("Invalid phase number");
    }

    const topic = await this.prisma.topic.findFirst({
      where: {
        id: planId,
        members: { some: { userId } },
        metadata: { path: ["planningMode"], equals: true },
      },
    });

    if (!topic) {
      throw new NotFoundException("Plan not found");
    }

    const meta =
      (topic.metadata as unknown as PlanningTopicMetadata) ||
      ({} as PlanningTopicMetadata);
    const updatedPhaseStatus = { ...meta.phaseStatus };
    updatedPhaseStatus[phase] = { status: "active" };

    const updatedMetadata: PlanningTopicMetadata = {
      ...meta,
      currentPhase: phase,
      phaseStatus: updatedPhaseStatus,
    };

    await this.prisma.topic.update({
      where: { id: planId },
      data: {
        metadata: updatedMetadata as unknown as Prisma.InputJsonValue,
      },
    });

    this.logger.log(
      `Plan ${planId} retrying phase ${phase}: ${PHASE_NAMES[phase]}`,
    );

    // Trigger async execution for retry
    this.executePhaseAsync(planId, userId, phase).catch((err) => {
      this.logger.error(
        `Phase ${phase} retry failed for plan ${planId}: ${err.message}`,
        err.stack,
      );
    });
  }

  async cancelPhase(planId: string, userId: string): Promise<void> {
    const topic = await this.prisma.topic.findFirst({
      where: {
        id: planId,
        members: { some: { userId } },
        metadata: { path: ["planningMode"], equals: true },
      },
    });

    if (!topic) {
      throw new NotFoundException("Plan not found");
    }

    const meta =
      (topic.metadata as unknown as PlanningTopicMetadata) ||
      ({} as PlanningTopicMetadata);

    const currentPhase = meta.currentPhase || 0;
    if (currentPhase === 0) {
      return;
    }

    const currentStatus = meta.phaseStatus?.[currentPhase];
    if (currentStatus?.status !== "active") {
      return;
    }

    const updatedPhaseStatus = { ...meta.phaseStatus };
    updatedPhaseStatus[currentPhase] = { status: "pending" };

    const updatedMetadata: PlanningTopicMetadata = {
      ...meta,
      phaseStatus: updatedPhaseStatus,
    };

    await this.prisma.topic.update({
      where: { id: planId },
      data: {
        metadata: updatedMetadata as unknown as Prisma.InputJsonValue,
      },
    });

    this.logger.log(
      `Plan ${planId} cancelled phase ${currentPhase}: ${PHASE_NAMES[currentPhase]}`,
    );
  }

  // ==================== AI Execution Engine (Fix 3) ====================

  private async executePhaseAsync(
    planId: string,
    userId: string,
    phase: number,
  ): Promise<void> {
    this.logger.log(`Executing phase ${phase} for plan ${planId}`);

    try {
      // 1. Load topic + AI members + metadata
      const topic = await this.prisma.topic.findFirst({
        where: { id: planId },
        include: {
          aiMembers: {
            select: {
              id: true,
              displayName: true,
              aiModel: true,
              systemPrompt: true,
              roleDescription: true,
            },
            orderBy: { createdAt: "asc" },
          },
        },
      });

      if (!topic) {
        throw new Error("Plan topic not found");
      }

      const meta =
        (topic.metadata as unknown as PlanningTopicMetadata) ||
        ({} as PlanningTopicMetadata);

      // Check if phase was cancelled while loading
      if (meta.phaseStatus?.[phase]?.status !== "active") {
        this.logger.log(
          `Phase ${phase} no longer active for plan ${planId}, skipping execution`,
        );
        return;
      }

      // 2. Web search for Research phase (Phase 2) — collect real-time references
      let searchContext = "";
      if (phase === 2) {
        const searchResults = await this.searchForResearchPhase(
          meta.planConfig.goal,
          topic.name,
          planId,
          phase,
        );
        if (searchResults.context) {
          searchContext = searchResults.context;
        }
      }

      // 3. Build context from previous phases
      const previousContext = this.buildPreviousPhaseContext(meta, phase);

      // 4. Get AI members for this phase
      const agentIndices = PHASE_AGENT_INDICES[phase] || [0];
      const agents = agentIndices
        .map((idx) => topic.aiMembers[idx])
        .filter(Boolean);

      // Fallback if debate phase but no debaters (non-comprehensive)
      if (agents.length === 0 && phase === 4) {
        const fallbackAgents = [topic.aiMembers[0], topic.aiMembers[2]].filter(
          Boolean,
        );
        agents.push(...fallbackAgents);
      }

      if (agents.length === 0) {
        throw new Error(`No agents available for phase ${phase}`);
      }

      // 5. Execute each agent
      const agentOutputs: string[] = [];
      // For Phase 6 (Delivery): use iterative refinement — each subsequent agent
      // refines the previous output instead of writing from scratch. This produces
      // a single polished report rather than multiple concatenated reports.
      let previousAgentOutput = "";

      for (const agent of agents) {
        let phasePrompt: string;

        if (phase === 6 && previousAgentOutput) {
          // Subsequent agents in Delivery phase refine the previous draft
          phasePrompt = this.buildDeliveryRefinementPrompt(
            meta,
            agent.displayName,
            agent.roleDescription || "",
            topic.name,
            previousAgentOutput,
          );
        } else {
          phasePrompt = this.buildPhasePrompt(
            meta,
            phase,
            agent.displayName,
            agent.roleDescription || "",
            previousContext,
            topic.name,
            searchContext,
          );
        }

        const messages: ChatMessage[] = [
          {
            role: "system",
            content: agent.systemPrompt || `你是${agent.displayName}。`,
          },
          { role: "user", content: phasePrompt },
        ];

        const taskProfile = this.getTaskProfileForPhase(
          phase,
          meta.planConfig.depth,
        );

        const response = await this.aiFacade.chat({
          messages,
          modelType: AIModelType.CHAT,
          taskProfile,
          model: agent.aiModel !== "default" ? agent.aiModel : undefined,
          billing: {
            userId,
            moduleType: "ai-planning",
            operationType: `phase-${phase}`,
            referenceId: planId,
          },
        });

        if (response.isError) {
          this.logger.error(
            `Agent ${agent.displayName} failed for phase ${phase} of plan ${planId}: ${response.content}`,
          );
          continue;
        }

        // Save AI response as topic message
        await this.aiResponseService.createAIMessage(
          planId,
          agent.id,
          response.content,
          response.model,
          response.tokensUsed,
        );

        agentOutputs.push(response.content);
        if (phase === 6) {
          previousAgentOutput = response.content;
        }
      }

      // 6. Handle no-output case as failure (Bug 2 fix)
      if (agentOutputs.length === 0) {
        this.logger.warn(
          `Phase ${phase} produced no output for plan ${planId}`,
        );
        await this.updatePhaseStatus(planId, phase, {
          status: "failed",
          error: "All agents failed to produce output for this phase.",
        });
        return; // Don't auto-advance
      }

      // 7. Build phase summary and mark completed
      // Phase 6 (Delivery): use only the final refined output (single report)
      // Other phases: concatenate all agent outputs with agent name headers
      const summary =
        phase === 6
          ? agentOutputs[agentOutputs.length - 1]
          : agentOutputs
              .map((output, i) => {
                const agent = agents[i];
                return agent ? `### ${agent.displayName}\n\n${output}` : output;
              })
              .join("\n\n---\n\n");
      await this.updatePhaseStatus(planId, phase, {
        status: "completed",
        summary,
        completedAt: new Date().toISOString(),
      });

      this.logger.log(`Phase ${phase} completed for plan ${planId}`);

      // 8. Auto-advance if enabled (with delay so frontend can catch up)
      if (meta.planConfig.autoAdvance && phase < TOTAL_PHASES) {
        // Wait 3s before auto-advancing so the UI can show phase completion
        await new Promise((resolve) => setTimeout(resolve, 3000));

        // Re-read metadata to check if cancelled during the delay
        const freshTopic = await this.prisma.topic.findFirst({
          where: { id: planId },
        });
        const freshMeta =
          (freshTopic?.metadata as unknown as PlanningTopicMetadata) || meta;

        if (freshMeta.phaseStatus?.[phase]?.status === "completed") {
          this.advancePhase(planId, userId).catch((err) => {
            this.logger.error(
              `Auto-advance failed after phase ${phase}: ${err.message}`,
              err.stack,
            );
          });
        }
      }
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      this.logger.error(
        `Phase ${phase} execution failed: ${errorMessage}`,
        error instanceof Error ? error.stack : undefined,
      );

      await this.updatePhaseStatus(planId, phase, {
        status: "failed",
        error: errorMessage,
      });
    }
  }

  private async updatePhaseStatus(
    planId: string,
    phase: number,
    update: Partial<PlanPhaseStatus>,
  ): Promise<void> {
    const topic = await this.prisma.topic.findFirst({
      where: { id: planId },
    });

    if (!topic) return;

    const meta =
      (topic.metadata as unknown as PlanningTopicMetadata) ||
      ({} as PlanningTopicMetadata);

    const updatedPhaseStatus = { ...meta.phaseStatus };
    updatedPhaseStatus[phase] = {
      ...updatedPhaseStatus[phase],
      ...update,
    };

    const updatedMetadata: PlanningTopicMetadata = {
      ...meta,
      phaseStatus: updatedPhaseStatus,
    };

    await this.prisma.topic.update({
      where: { id: planId },
      data: {
        metadata: updatedMetadata as unknown as Prisma.InputJsonValue,
      },
    });
  }

  /**
   * Build previous phase context for the current phase prompt.
   *
   * For phase 6 (Delivery): only include phase 5 (Synthesis) since it already
   * integrates all previous work. Including all 12 agent outputs from phases 1-5
   * would exceed model context limits.
   *
   * For other phases: include all previous phases but cap each summary to
   * prevent token overflow on long-running plans.
   */
  private buildPreviousPhaseContext(
    meta: PlanningTopicMetadata,
    currentPhase: number,
  ): string {
    const MAX_SUMMARY_CHARS = 8000;
    const contextParts: string[] = [];

    // Phase 6 (Delivery) only needs the Synthesis output (phase 5)
    // since it already integrates all previous phases
    const startPhase = currentPhase === 6 ? 5 : 1;

    for (let i = startPhase; i < currentPhase; i++) {
      const phaseStatus = meta.phaseStatus?.[i];
      if (phaseStatus?.status === "completed" && phaseStatus.summary) {
        let summary = phaseStatus.summary;
        if (summary.length > MAX_SUMMARY_CHARS) {
          summary =
            summary.slice(0, MAX_SUMMARY_CHARS) +
            "\n\n...(内容过长，已截断，请基于以上内容完成本阶段任务)";
        }
        contextParts.push(
          `## 阶段 ${i} — ${PHASE_LABELS[i]} (已完成)\n\n${summary}`,
        );
      }
    }

    return contextParts.length > 0
      ? `以下是前序阶段的成果摘要：\n\n${contextParts.join("\n\n---\n\n")}`
      : "";
  }

  private buildPhasePrompt(
    meta: PlanningTopicMetadata,
    phase: number,
    agentName: string,
    agentRole: string,
    previousContext: string,
    planName: string,
    searchContext?: string,
  ): string {
    const goal = meta.planConfig.goal;
    const depth = meta.planConfig.depth;
    const phaseName = PHASE_LABELS[phase];
    const currentDate = new Date().toISOString().split("T")[0];

    const depthInstruction =
      depth === PlanningDepth.QUICK
        ? "请简洁扼要地完成任务，重点突出关键信息。"
        : depth === PlanningDepth.COMPREHENSIVE
          ? "请进行深入全面的分析，不遗漏任何细节，提供详尽的论证和数据支持。"
          : "请按照标准深度进行分析，兼顾全面性和简洁性。";

    const phaseInstructions: Record<number, string> = {
      1: `请分析以下策划目标，拆解关键要素，明确核心问题和约束条件，并提出分析框架。`,
      2: searchContext
        ? `请基于以下实时搜索资料，围绕策划目标进行深入调研分析。你必须优先使用下方提供的搜索结果中的数据和信息，使用 [编号] 格式引用来源（如 [1]、[2]）。严禁编造或虚构任何引用来源、报告名称或数据。如果搜索资料中没有某方面的信息，请明确说明"该方面暂无实时数据"。`
        : `请围绕策划目标进行深入调研，收集相关数据、案例和行业趋势，提供有价值的洞察。注意：你没有实时搜索能力，请基于已知信息分析，不要编造具体的报告名称、机构引用或统计数据。`,
      3: `请基于前期分析和调研成果，进行头脑风暴，提出创新方案和多种可选路径。`,
      4: `请对提出的方案进行辩论推演，分析方案的优劣势、可行性和潜在风险。`,
      5: `请综合前述所有阶段的成果，整合出最优方案。要求使用"结论先行"结构，按以下框架输出：

## 执行摘要
（核心结论和推荐方案，2-3段即可）

## 关键发现
（从调研和分析中提炼的最重要洞察，列出5-8条）

## 推荐方案
（详细描述推荐的行动方案，包括具体策略和实施路径）

## 风险评估
（主要风险及缓解措施）

请使用 [编号] 格式引用调研阶段的参考资料（如 [1]、[2]），增强方案的可信度。`,
      6: `请将综合方案转化为可直接提交决策层的最终策划文档。这是一份正式的战略规划文档，需达到专业咨询公司（麦肯锡/BCG）级别的质量标准。

请严格按以下结构输出，每个章节都必须包含实质性内容，禁止使用占位符或泛泛而谈：

## 执行摘要
使用金字塔原理（结论先行）撰写。必须包含：
- **项目背景**（1-2句话概述为什么需要这个策划）
- **核心策略**（推荐方案的一句话概括）
- **预期量化成果**（具体数字，如增长百分比、时间节点、规模目标）
- **资源投入概估**（人力、预算量级）
- **推荐行动**（立即应执行的前3项优先事项）

## 背景与现状分析
- 问题或机遇的详细描述，当前痛点
- 市场环境与行业趋势分析
- 竞争格局概述（如适用）
- 适当使用 SWOT 或 PEST 等分析框架

## 战略方案
核心策略与子策略的完整分解。使用以下 Markdown 表格呈现策略矩阵：

| 策略方向 | 具体措施 | 目标成果 | 负责方 | 优先级 |
|---------|---------|---------|--------|--------|
| （具体填写） | （具体填写） | （具体填写） | （具体填写） | 高/中/低 |

每个策略需说明选择理由和预期效果。

## 详细行动计划
将策略转化为可执行的具体行动步骤，使用以下表格：

| 序号 | 行动项 | 负责人/团队 | 开始时间 | 完成时间 | 交付物 | 依赖关系 |
|-----|--------|-----------|---------|---------|--------|---------|
| 1 | （具体填写） | （具体填写） | （具体填写） | （具体填写） | （具体填写） | （具体填写） |

## 执行时间表
分阶段的实施路线图，标注关键里程碑：

| 阶段 | 时间范围 | 关键里程碑 | 主要交付物 | 负责方 |
|-----|---------|-----------|-----------|--------|
| 第一阶段（启动期） | （具体填写） | （具体填写） | （具体填写） | （具体填写） |

## 资源与预算
所需资源的详细估算：

| 资源类别 | 具体项目 | 数量/规格 | 预估费用 | 备注 |
|---------|---------|----------|---------|------|
| 人力资源 | （具体填写） | （具体填写） | （具体填写） | |
| 资金投入 | （具体填写） | （具体填写） | （具体填写） | |
| 工具/技术 | （具体填写） | （具体填写） | （具体填写） | |

## 关键绩效指标（KPI）
所有指标必须符合 SMART 标准（Specific具体、Measurable可衡量、Achievable可达成、Relevant相关、Time-bound有时限）：

| 指标名称 | 当前基线 | 目标值 | 衡量方式 | 考核周期 |
|---------|---------|--------|---------|---------|
| （具体填写） | （具体填写） | （具体填写） | （具体填写） | （具体填写） |

## 风险管理
风险登记册，使用概率×影响矩阵评估：

| 风险描述 | 概率 | 影响程度 | 风险等级 | 缓解措施 | 应急预案 | 责任人 |
|---------|------|---------|---------|---------|---------|--------|
| （具体填写） | 高/中/低 | 高/中/低 | （概率×影响） | （具体填写） | （具体填写） | （具体填写） |

## 治理与评审机制
- **评审节奏**：定期评审的频率和形式（周会/月度/季度）
- **决策升级**：问题升级路径和决策机制
- **干系人沟通**：沟通计划、报告频率、沟通渠道

## 参考文献
列出所有引用来源，格式：[编号] 标题 — URL

---
**输出质量要求**：
1. 所有表格必须填入与策划主题相关的具体内容，禁止留空或使用"待定"
2. 数据和指标必须具体、可量化，避免模糊表述（如"显著提升"应改为"提升20%"）
3. 使用 [编号] 格式引用调研阶段的参考资料增强可信度
4. 语言专业严谨，适合C-level高管审阅
5. 运用 MECE 原则（相互独立、完全穷尽）确保分析全面无遗漏`,
    };

    let prompt = `# 策划任务: ${planName}\n\n`;
    prompt += `**当前日期**: ${currentDate}\n\n`;
    prompt += `**策划目标**: ${goal}\n\n`;
    prompt += `**当前阶段**: 第 ${phase} 阶段 — ${phaseName}\n\n`;
    prompt += `**你的角色**: ${agentName} — ${agentRole}\n\n`;
    prompt += `**深度要求**: ${depthInstruction}\n\n`;
    prompt += `**任务指令**: ${phaseInstructions[phase] || "请完成本阶段的工作。"}\n\n`;

    // Inject web search results for Research phase
    if (phase === 2 && searchContext) {
      prompt += `---\n\n## 实时搜索资料\n\n${searchContext}\n\n---\n\n`;
    }

    // Inject numbered reference list for Phase 5 (Synthesis) and Phase 6 (Delivery)
    if ((phase === 5 || phase === 6) && meta.references?.length) {
      const refList = meta.references
        .map(
          (r, i) =>
            `[${i + 1}] ${r.title} — ${r.url}${r.sourceType ? ` (${r.sourceType})` : ""}`,
        )
        .join("\n");
      prompt += `---\n\n## 可引用的参考资料\n\n以下是调研阶段收集的参考资料，请在正文中使用 [编号] 格式引用（如 [1]、[2]）：\n\n${refList}\n\n---\n\n`;
    }

    if (previousContext) {
      prompt += `---\n\n${previousContext}\n\n---\n\n`;
    }

    prompt += `请以 Markdown 格式输出你的分析和成果。`;

    return prompt;
  }

  /**
   * Build a refinement prompt for Phase 6 subsequent agents.
   * Instead of writing from scratch, the agent polishes the previous draft
   * into a single cohesive delivery document.
   */
  private buildDeliveryRefinementPrompt(
    meta: PlanningTopicMetadata,
    agentName: string,
    agentRole: string,
    planName: string,
    previousDraft: string,
  ): string {
    const goal = meta.planConfig.goal;
    const currentDate = new Date().toISOString().split("T")[0];

    let prompt = `# 策划任务: ${planName}\n\n`;
    prompt += `**当前日期**: ${currentDate}\n\n`;
    prompt += `**策划目标**: ${goal}\n\n`;
    prompt += `**你的角色**: ${agentName} — ${agentRole}\n\n`;
    prompt += `**任务指令**: 以下是策划总监撰写的策划文档初稿。请以资深商业文档专家的视角进行全面审查和优化，使其成为一份可直接提交C-level决策层的正式交付文档。\n\n`;
    prompt += `**一、内容质量审查（必须逐项检查并修正）**：\n`;
    prompt += `- 所有表格是否包含具体、有意义的数据（发现"待定"、"XXX"、空白单元格必须补充具体内容）\n`;
    prompt += `- KPI指标是否符合SMART标准（Specific具体、Measurable可衡量、Achievable可达成、Relevant相关、Time-bound有时限）\n`;
    prompt += `- 执行摘要是否包含量化的预期成果（如百分比、金额、时间节点）\n`;
    prompt += `- 风险矩阵是否完整（每个风险都必须有：概率、影响、缓解措施、应急预案、责任人）\n`;
    prompt += `- 行动计划中每个步骤是否有明确的责任人和时间节点\n`;
    prompt += `- 资源预算是否有具体的数量和费用估算\n\n`;
    prompt += `**二、文档结构与逻辑**：\n`;
    prompt += `- 保持原有章节结构不变，确保10个章节完整\n`;
    prompt += `- 检查章节间的逻辑衔接和过渡是否自然\n`;
    prompt += `- 确保战略方案→行动计划→时间表→KPI之间的一致性和可追溯性\n`;
    prompt += `- 验证执行摘要准确反映文档核心内容\n\n`;
    prompt += `**三、语言与格式**：\n`;
    prompt += `- 优化语言表达，使其专业、严谨、简洁，适合高管审阅\n`;
    prompt += `- 确保数据引用 [编号] 准确保留\n`;
    prompt += `- 统一全文术语和格式风格\n`;
    prompt += `- 消除模糊表述（如"显著提升"→"提升20%"，"尽快完成"→"Q2结束前完成"）\n\n`;

    // Inject reference list so the agent can verify citations
    if (meta.references?.length) {
      const refList = meta.references
        .map(
          (r, i) =>
            `[${i + 1}] ${r.title} — ${r.url}${r.sourceType ? ` (${r.sourceType})` : ""}`,
        )
        .join("\n");
      prompt += `---\n\n## 可引用的参考资料\n\n${refList}\n\n`;
    }

    prompt += `---\n\n## 待润色的初稿\n\n${previousDraft}\n\n---\n\n`;
    prompt += `请输出完整的润色后文档（Markdown 格式），不要输出修改说明或对比，直接输出最终版本。`;

    return prompt;
  }

  private getTaskProfileForPhase(
    phase: number,
    depth: PlanningDepth,
  ): TaskProfile {
    const outputLength =
      depth === PlanningDepth.QUICK
        ? ("medium" as const)
        : depth === PlanningDepth.COMPREHENSIVE
          ? ("extended" as const)
          : ("long" as const);

    // Phase 3: brainstorm needs creativity; Phase 6: formal document needs structure
    const creativity =
      phase === 3
        ? ("high" as const) // brainstorm
        : phase === 6
          ? ("low" as const) // formal delivery document
          : phase === 4
            ? ("medium" as const) // debate
            : ("medium" as const); // analysis, synthesis

    return { creativity, outputLength };
  }

  // ==================== Export & Delete ====================

  async exportPlan(planId: string, userId: string): Promise<string> {
    const plan = await this.getPlanDetail(planId, userId);
    const phases = plan.phaseStatus;

    let markdown = `# ${plan.name}\n\n> ${plan.goal}\n\n---\n\n`;

    for (let i = 1; i <= TOTAL_PHASES; i++) {
      const status = phases[i];
      const icon =
        status?.status === "completed"
          ? "[x]"
          : status?.status === "active"
            ? "[-]"
            : "[ ]";
      markdown += `## ${icon} Phase ${i}: ${PHASE_LABELS[i]}\n\n`;
      markdown += status?.summary
        ? `${status.summary}\n\n`
        : `_No output yet_\n\n`;
    }

    return markdown;
  }

  async deletePlan(planId: string, userId: string): Promise<void> {
    const topic = await this.prisma.topic.findFirst({
      where: {
        id: planId,
        createdById: userId,
        metadata: { path: ["planningMode"], equals: true },
      },
    });

    if (!topic) {
      throw new NotFoundException("Plan not found");
    }

    await this.prisma.topic.update({
      where: { id: planId },
      data: { archivedAt: new Date() },
    });

    this.logger.log(`Plan ${planId} archived`);
  }

  // ==================== Web Search for Research Phase ====================

  /**
   * Search the web for real-time data related to the planning goal.
   * Generates multiple search queries, executes them via AIEngineFacade,
   * and stores results as references in the plan metadata.
   */
  private async searchForResearchPhase(
    goal: string,
    planName: string,
    planId: string,
    phase: number,
  ): Promise<{ context: string }> {
    try {
      // Generate diverse search queries from the goal (LLM-powered with fallback)
      const queries = await this.generateSearchQueries(goal, planName);
      this.logger.log(
        `Research phase: searching ${queries.length} queries for plan ${planId}`,
      );

      const allResults: PlanReference[] = [];
      const seenUrls = new Set<string>();

      for (const query of queries) {
        try {
          const searchResponse = await this.aiFacade.search({
            query,
            maxResults: 5,
          });

          if (searchResponse.success && searchResponse.results?.length > 0) {
            for (const result of searchResponse.results) {
              if (seenUrls.has(result.url)) continue;
              seenUrls.add(result.url);

              const domain = result.domain || new URL(result.url).hostname;
              const sourceType = this.classifySourceType(domain);
              const credibilityScore = this.calculateCredibilityScore({
                domain,
                snippet: result.content,
                publishedDate: result.publishedDate,
                sourceType,
              });

              allResults.push({
                id: `ref-${allResults.length + 1}`,
                title: result.title,
                url: result.url,
                domain,
                snippet: result.content,
                publishedDate: result.publishedDate,
                score: result.score,
                credibilityScore,
                sourceType,
                sourcePhase: phase,
              });
            }
          }
        } catch (err) {
          this.logger.warn(
            `Search query failed: "${query}" — ${err instanceof Error ? err.message : err}`,
          );
        }
      }

      if (allResults.length === 0) {
        this.logger.warn(`No search results for plan ${planId}`);
        return { context: "" };
      }

      // Store references in metadata
      const topic = await this.prisma.topic.findFirst({
        where: { id: planId },
      });
      if (topic) {
        const meta =
          (topic.metadata as unknown as PlanningTopicMetadata) ||
          ({} as PlanningTopicMetadata);

        const updatedMetadata: PlanningTopicMetadata = {
          ...meta,
          references: allResults,
        };

        await this.prisma.topic.update({
          where: { id: planId },
          data: {
            metadata: updatedMetadata as unknown as Prisma.InputJsonValue,
          },
        });
      }

      this.logger.log(
        `Research phase: collected ${allResults.length} references for plan ${planId}`,
      );

      // Format for prompt context
      const context = allResults
        .map(
          (r, i) =>
            `[${i + 1}] **${r.title}**\n${r.snippet}\n来源: ${r.url}${r.publishedDate ? ` (${r.publishedDate})` : ""}`,
        )
        .join("\n\n");

      return { context };
    } catch (error) {
      this.logger.error(
        `Research phase search failed: ${error instanceof Error ? error.message : error}`,
      );
      return { context: "" };
    }
  }

  /**
   * Generate diverse search queries using LLM for better coverage.
   * Falls back to deterministic approach on failure.
   */
  private async generateSearchQueries(
    goal: string,
    planName: string,
  ): Promise<string[]> {
    try {
      const currentYear = new Date().getFullYear();
      const prompt = `You are a search query generator. Given a planning goal, generate exactly 4 targeted web search queries that cover different angles of the topic. Each query should be specific and actionable.

Planning topic: ${planName}
Planning goal: ${goal}
Current year: ${currentYear}

Requirements:
- Query 1: Current trends and market dynamics
- Query 2: Key data, statistics, or research reports
- Query 3: Real-world case studies or best practices
- Query 4: Challenges, risks, or competitive landscape

Return ONLY a JSON array of 4 strings, no other text. Example:
["query 1", "query 2", "query 3", "query 4"]`;

      const response = await this.aiFacade.chat({
        messages: [{ role: "user", content: prompt }],
        modelType: AIModelType.CHAT_FAST,
        taskProfile: {
          creativity: "low" as const,
          outputLength: "minimal" as const,
        },
      });

      if (!response.isError && response.content) {
        const jsonMatch = response.content.match(/\[[\s\S]*?\]/);
        if (jsonMatch) {
          const queries = JSON.parse(jsonMatch[0]) as string[];
          if (
            Array.isArray(queries) &&
            queries.length >= 2 &&
            queries.every((q) => typeof q === "string")
          ) {
            this.logger.log(
              `LLM generated ${queries.length} search queries for plan`,
            );
            return queries.slice(0, 4);
          }
        }
      }
    } catch (err) {
      this.logger.warn(
        `LLM query generation failed, falling back to deterministic: ${err instanceof Error ? err.message : err}`,
      );
    }

    return this.generateSearchQueriesFallback(goal, planName);
  }

  /**
   * Deterministic fallback for search query generation.
   */
  private generateSearchQueriesFallback(
    goal: string,
    planName: string,
  ): string[] {
    const queries: string[] = [];
    const currentYear = new Date().getFullYear();

    queries.push(`${planName} ${currentYear}`);

    const goalKeywords = goal
      .replace(/[，。、；：！？\s]+/g, " ")
      .split(" ")
      .filter((w) => w.length > 1)
      .slice(0, 6);

    if (goalKeywords.length >= 2) {
      queries.push(
        `${goalKeywords.slice(0, 3).join(" ")} 行业趋势 ${currentYear}`,
      );
      queries.push(`${goalKeywords.slice(0, 3).join(" ")} 数据报告 最新`);
    }

    if (goal.length <= 80) {
      queries.push(goal);
    } else {
      queries.push(goal.slice(0, 80));
    }

    return queries.slice(0, 4);
  }

  // ==================== Credibility Scoring ====================

  /**
   * Classify source type based on domain patterns.
   * Mirrors the algorithm from evidence-management.service.ts.
   */
  private classifySourceType(domain: string): string {
    const d = domain.toLowerCase();

    // Academic
    if (
      d.includes("arxiv.org") ||
      d.includes("scholar.google") ||
      d.includes("pubmed") ||
      d.includes("doi.org") ||
      d.includes("researchgate") ||
      d.includes("springer.com") ||
      d.includes("nature.com") ||
      d.includes("sciencedirect") ||
      d.includes("ieee.org") ||
      d.includes("acm.org") ||
      d.includes(".edu")
    ) {
      return "academic";
    }

    // Official / Government (specific domains only — broad .org would misclassify wikipedia, mozilla, etc.)
    if (
      d.includes(".gov") ||
      d.includes("who.int") ||
      d.includes("worldbank.org") ||
      d.includes("un.org") ||
      d.includes("europa.eu") ||
      d.includes("imf.org") ||
      d.includes("oecd.org") ||
      d.includes("wto.org")
    ) {
      return "official";
    }

    // News
    if (
      d.includes("reuters.com") ||
      d.includes("bloomberg.com") ||
      d.includes("bbc.com") ||
      d.includes("nytimes.com") ||
      d.includes("wsj.com") ||
      d.includes("ft.com") ||
      d.includes("economist.com") ||
      d.includes("cnbc.com") ||
      d.includes("theguardian.com") ||
      d.includes("apnews.com") ||
      d.includes("xinhua") ||
      d.includes("chinadaily")
    ) {
      return "news";
    }

    // Reports / Consulting
    if (
      d.includes("mckinsey.com") ||
      d.includes("bcg.com") ||
      d.includes("bain.com") ||
      d.includes("deloitte.com") ||
      d.includes("pwc.com") ||
      d.includes("kpmg.com") ||
      d.includes("ey.com") ||
      d.includes("gartner.com") ||
      d.includes("forrester.com") ||
      d.includes("idc.com") ||
      d.includes("statista.com")
    ) {
      return "report";
    }

    return "web";
  }

  /**
   * Calculate credibility score (20-100) using 4-factor algorithm.
   * Mirrors the algorithm from evidence-management.service.ts.
   */
  private calculateCredibilityScore(ref: {
    domain: string;
    snippet: string;
    publishedDate?: string;
    sourceType: string;
  }): number {
    const d = ref.domain.toLowerCase();

    // Factor 1: Domain authority (0-40)
    let domainAuthority = 15;
    if (
      d.includes(".gov") ||
      d.includes(".edu") ||
      d.includes("arxiv.org") ||
      d.includes("pubmed") ||
      d.includes("nature.com") ||
      d.includes("sciencedirect")
    ) {
      domainAuthority = 40;
    } else if (
      d.includes("reuters.com") ||
      d.includes("bloomberg.com") ||
      d.includes("mckinsey.com") ||
      d.includes("bcg.com") ||
      d.includes("gartner.com") ||
      d.includes("who.int") ||
      d.includes("worldbank.org")
    ) {
      domainAuthority = 30;
    } else if (
      d.includes("techcrunch.com") ||
      d.includes("forbes.com") ||
      d.includes("wired.com") ||
      d.includes("bbc.com") ||
      d.includes("nytimes.com") ||
      d.includes("wsj.com") ||
      d.includes("economist.com") ||
      d.includes("ft.com") ||
      d.includes("cnbc.com") ||
      d.includes("statista.com")
    ) {
      domainAuthority = 22;
    }

    // Factor 2: Source type (0-30)
    const sourceTypeScores: Record<string, number> = {
      academic: 30,
      official: 28,
      news: 22,
      report: 20,
      web: 15,
    };
    const sourceTypeScore = sourceTypeScores[ref.sourceType] || 15;

    // Factor 3: Content depth (0-15)
    const contentLength = ref.snippet?.length || 0;
    let contentDepth = 0;
    if (contentLength > 500) contentDepth = 15;
    else if (contentLength > 200) contentDepth = 10;
    else if (contentLength > 50) contentDepth = 5;

    // Factor 4: Freshness (0-15)
    let freshness = 5;
    if (ref.publishedDate) {
      try {
        const pubDate = new Date(ref.publishedDate);
        const now = new Date();
        const daysDiff =
          (now.getTime() - pubDate.getTime()) / (1000 * 60 * 60 * 24);

        if (daysDiff <= 30) freshness = 15;
        else if (daysDiff <= 180) freshness = 12;
        else if (daysDiff <= 365) freshness = 8;
        else if (daysDiff <= 730) freshness = 5;
        else freshness = 3;
      } catch {
        freshness = 5;
      }
    }

    const total = domainAuthority + sourceTypeScore + contentDepth + freshness;
    return Math.max(20, Math.min(100, total));
  }

  // ==================== Model Allocation (Fix 1) ====================

  private async buildAIMembers(depth: PlanningDepth) {
    // Get reasoning model for leader/analyst
    const reasoningModel = await this.aiFacade.getReasoningModel();

    // Get available chat models
    const chatModels = await this.aiFacade.getAvailableModelsExtended(
      AIModelType.CHAT,
    );
    const availableChatModels = chatModels.filter(
      (m) => m.isAvailable !== false,
    );

    const leaderModelId =
      reasoningModel?.id ||
      availableChatModels[0]?.id ||
      DEFAULT_FALLBACK_MODEL;
    const chatModelId = availableChatModels[0]?.id || DEFAULT_FALLBACK_MODEL;

    this.logger.log(
      `Model allocation: reasoning=${leaderModelId}, chat=${chatModelId}`,
    );

    const resolveModel = (displayName: string): string => {
      const modelType = ROLE_MODEL_TYPE[displayName] || "chat";
      return modelType === "reasoning" ? leaderModelId : chatModelId;
    };

    const base = [
      {
        aiModel: resolveModel("策划总监"),
        displayName: "策划总监",
        roleDescription: "统筹策划流程，分析目标，整合方案",
        systemPrompt:
          "你是一位资深策划总监，具有麦肯锡级别的战略规划能力。你擅长：使用金字塔原理（结论先行）组织文档；MECE分析（相互独立、完全穷尽）确保逻辑严密；数据驱动的决策建议，所有结论都有量化支撑；制作专业的战略规划文档，适合C-level高管审阅。你的输出必须包含具体数据、明确的责任人和时间节点，禁止模糊表述。",
      },
      {
        aiModel: resolveModel("研究员"),
        displayName: "研究员",
        roleDescription: "深入调研，收集数据和案例",
        systemPrompt: "你是一位专业研究员，擅长市场调研、数据分析和趋势洞察。",
      },
      {
        aiModel: resolveModel("分析师"),
        displayName: "分析师",
        roleDescription: "分析评估，逻辑推理",
        systemPrompt: "你是一位数据分析师，擅长逻辑分析、风险评估和方案比较。",
      },
      {
        aiModel: resolveModel("文案专家"),
        displayName: "文案专家",
        roleDescription: "审查优化策划文档，确保专业质量",
        systemPrompt:
          "你是一位资深商业文档专家，专注于将策划方案优化为可直接提交决策层的正式文档。你擅长：确保文档结构严谨、逻辑自洽；验证所有表格包含具体、可量化的数据；检查KPI是否符合SMART标准；确保风险矩阵完整（概率×影响+缓解措施+应急预案+责任人）；验证行动计划有明确责任人和时间节点；消除模糊表述，用精确数据替代。",
      },
    ];

    if (depth === PlanningDepth.COMPREHENSIVE) {
      base.push(
        {
          aiModel: resolveModel("正方辩手"),
          displayName: "正方辩手",
          roleDescription: "为方案辩护，寻找支持论据",
          systemPrompt:
            "你是一位辩手，负责为策划方案辩护，提出支持论据和成功案例。",
        },
        {
          aiModel: resolveModel("反方辩手"),
          displayName: "反方辩手",
          roleDescription: "质疑方案，发现潜在风险",
          systemPrompt:
            "你是一位批判性思考者，负责质疑方案的可行性，发现潜在风险和不足。",
        },
      );
    }

    return base;
  }
}
