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

      for (const agent of agents) {
        const phasePrompt = this.buildPhasePrompt(
          meta,
          phase,
          agent.displayName,
          agent.roleDescription || "",
          previousContext,
          topic.name,
          searchContext,
        );

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

        agentOutputs.push(`### ${agent.displayName}\n\n${response.content}`);
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
      const summary = agentOutputs.join("\n\n---\n\n");
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
      5: `请综合前述所有阶段的成果，整合出最优方案，形成结构化的策划框架。`,
      6: `请将综合方案转化为可执行的最终策划文档，包含具体步骤、时间规划和关键指标。`,
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

    if (previousContext) {
      prompt += `---\n\n${previousContext}\n\n---\n\n`;
    }

    prompt += `请以 Markdown 格式输出你的分析和成果。`;

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

    // Phases 1, 2, 5 need more analytical/structured thinking
    const creativity =
      phase === 3
        ? ("high" as const) // brainstorm
        : phase === 4
          ? ("medium" as const) // debate
          : ("medium" as const); // analysis, synthesis, delivery

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
      // Generate diverse search queries from the goal
      const queries = this.generateSearchQueries(goal, planName);
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

              allResults.push({
                id: `ref-${allResults.length + 1}`,
                title: result.title,
                url: result.url,
                domain: result.domain || new URL(result.url).hostname,
                snippet: result.content,
                publishedDate: result.publishedDate,
                score: result.score,
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
   * Generate diverse search queries from planning goal.
   * Creates targeted queries covering different aspects of the goal.
   */
  private generateSearchQueries(goal: string, planName: string): string[] {
    const queries: string[] = [];
    const currentYear = new Date().getFullYear();

    // Core topic query
    queries.push(`${planName} ${currentYear}`);

    // Extract key concepts: split on common delimiters
    const goalKeywords = goal
      .replace(/[，。、；：！？\s]+/g, " ")
      .split(" ")
      .filter((w) => w.length > 1)
      .slice(0, 6);

    if (goalKeywords.length >= 2) {
      // Industry trend query
      queries.push(
        `${goalKeywords.slice(0, 3).join(" ")} 行业趋势 ${currentYear}`,
      );
      // Data/report query
      queries.push(`${goalKeywords.slice(0, 3).join(" ")} 数据报告 最新`);
    }

    // Full goal as query (trimmed)
    if (goal.length <= 80) {
      queries.push(goal);
    } else {
      queries.push(goal.slice(0, 80));
    }

    return queries.slice(0, 4); // Max 4 queries
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
          "你是一位资深策划总监，擅长目标分析、方案设计和团队协调。",
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
        roleDescription: "撰写策划文档，优化表达",
        systemPrompt:
          "你是一位资深文案专家，擅长策划撰写、文档优化和创意表达。",
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
