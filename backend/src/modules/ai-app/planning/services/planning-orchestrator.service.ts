import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
} from "@nestjs/common";
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

/** Delay before auto-advancing to next phase, allowing UI to catch up */
const AUTO_ADVANCE_DELAY_MS = 3000;

/** Maximum length for phase summary to prevent token overflow */
const MAX_PHASE_SUMMARY_LENGTH = 24000;

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

  async replanFromPhase(
    planId: string,
    startPhase: number,
    userId: string,
  ): Promise<{ currentPhase: number }> {
    if (startPhase < 1 || startPhase > TOTAL_PHASES) {
      throw new BadRequestException(
        `startPhase must be between 1 and ${TOTAL_PHASES}`,
      );
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

    // Check if any phase is currently active
    const hasActivePhase = Object.values(meta.phaseStatus || {}).some(
      (s) => s.status === "active",
    );

    if (hasActivePhase) {
      throw new BadRequestException(
        "A phase is currently running. Please cancel it before replanning.",
      );
    }

    // Reset phases from startPhase to TOTAL_PHASES
    const updatedPhaseStatus = { ...meta.phaseStatus };
    for (let i = startPhase; i <= TOTAL_PHASES; i++) {
      updatedPhaseStatus[i] = { status: "pending" };
    }

    // If replan from phase 1 or 2, clear references to force re-search
    const shouldClearReferences = startPhase <= 2;
    const updatedMetadata: PlanningTopicMetadata = {
      ...meta,
      currentPhase: startPhase,
      phaseStatus: updatedPhaseStatus,
      ...(shouldClearReferences ? { references: [] } : {}),
    };

    await this.prisma.topic.update({
      where: { id: planId },
      data: {
        metadata: updatedMetadata as unknown as Prisma.InputJsonValue,
      },
    });

    this.logger.log(
      `Plan ${planId} replanning from phase ${startPhase}: ${PHASE_NAMES[startPhase]}`,
    );

    // Trigger async execution from startPhase
    this.executePhaseAsync(planId, userId, startPhase).catch((err) => {
      this.logger.error(
        `Replan from phase ${startPhase} failed for plan ${planId}: ${err.message}`,
        err.stack,
      );
    });

    return { currentPhase: startPhase };
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

      // 5. Execute each agent with chain collaboration
      // - Phase 6 (Delivery): iterative refinement via buildDeliveryRefinementPrompt
      // - Phase 5 (Synthesis): iterative refinement via buildSynthesisRefinementPrompt
      // - Phase 1-4: later agents see ALL earlier agents' accumulated output
      // Each completed result is stored as { agentName, output } to keep agent
      // identity bound to its output even when earlier agents fail (skip via continue).
      const completedResults: Array<{ agentName: string; output: string }> = [];

      for (const agent of agents) {
        let phasePrompt: string;

        if (phase === 6 && completedResults.length > 0) {
          // Phase 6: subsequent agents refine into delivery document
          phasePrompt = this.buildDeliveryRefinementPrompt(
            meta,
            agent.displayName,
            agent.roleDescription || "",
            topic.name,
            completedResults[completedResults.length - 1].output,
          );
        } else if (phase === 5 && completedResults.length > 0) {
          // Phase 5: subsequent agents deepen the synthesis (not delivery formatting)
          phasePrompt = this.buildSynthesisRefinementPrompt(
            meta,
            agent.displayName,
            agent.roleDescription || "",
            topic.name,
            completedResults[completedResults.length - 1].output,
            previousContext,
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

          // Phase 1-4: append ALL previous agents' outputs for chain collaboration
          if (completedResults.length > 0 && phase <= 4) {
            const allPrevious = completedResults
              .map((r) => `### ${r.agentName}\n\n${r.output}`)
              .join("\n\n---\n\n");
            phasePrompt += `\n\n---\n\n## 本阶段其他成员的分析\n\n${allPrevious}\n\n---\n\n请在上述分析的基础上，补充、质疑或深化你的分析，避免重复已有内容。`;
          }
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

        completedResults.push({
          agentName: agent.displayName,
          output: response.content,
        });
      }

      // 6. Handle no-output case as failure (Bug 2 fix)
      if (completedResults.length === 0) {
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
      // - Phase 5, 6 (refinement): only the final agent's polished output
      // - Phase 1-4 (chain collaboration / debate): concatenate all with agent name headers
      const summary =
        phase >= 5
          ? completedResults[completedResults.length - 1].output
          : completedResults
              .map((r) => `### ${r.agentName}\n\n${r.output}`)
              .join("\n\n---\n\n");
      await this.updatePhaseStatus(planId, phase, {
        status: "completed",
        summary,
        completedAt: new Date().toISOString(),
      });

      this.logger.log(`Phase ${phase} completed for plan ${planId}`);

      // 8. Auto-advance if enabled (with delay so frontend can catch up)
      if (meta.planConfig.autoAdvance && phase < TOTAL_PHASES) {
        // Wait before auto-advancing so the UI can show phase completion
        await new Promise((resolve) =>
          setTimeout(resolve, AUTO_ADVANCE_DELAY_MS),
        );

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
   * For phase 6 (Delivery): include phase 2 (research data) + phase 4
   * (debate conclusions) + phase 5 (synthesis) — the three most valuable
   * upstream phases, each with a 20000-char limit.
   *
   * For other phases: include all previous phases, each capped at
   * MAX_PHASE_SUMMARY_LENGTH to prevent token overflow.
   */
  private buildPreviousPhaseContext(
    meta: PlanningTopicMetadata,
    currentPhase: number,
  ): string {
    const contextParts: string[] = [];

    // Phase 6 (Delivery): see Phase 2 (research data) + Phase 4 (debate conclusions)
    // + Phase 5 (synthesis) — the three most valuable upstream phases
    // Other phases: see all previous phases as before
    const phases =
      currentPhase === 6
        ? [2, 4, 5]
        : Array.from({ length: currentPhase - 1 }, (_, i) => i + 1);

    // Phase 6 gets a higher per-phase limit since it only reads 3 phases
    const perPhaseLimit = currentPhase === 6 ? 20000 : MAX_PHASE_SUMMARY_LENGTH;

    for (const i of phases) {
      const phaseStatus = meta.phaseStatus?.[i];
      if (phaseStatus?.status === "completed" && phaseStatus.summary) {
        let summary = phaseStatus.summary;
        if (summary.length > perPhaseLimit) {
          summary =
            summary.slice(0, perPhaseLimit) +
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
      1: `你的任务是**深度理解和拆解策划目标**，而非制定执行方案。

请完成以下分析工作：

### 1. 目标解读
- 这个策划目标的本质诉求是什么？
- 目标中有哪些模糊或待澄清的地方？
- 隐含的假设有哪些？

### 2. 关键维度拆解
- 将目标拆解为3-5个需要深入分析的子问题
- 每个子问题说明：为什么重要、需要什么信息来回答

### 3. 分析框架建议
- 针对该目标，推荐1-2个适用的分析框架（如SWOT、PESTEL、波特五力、价值链等）
- 说明为什么选择这些框架，但**不要在本阶段填写框架内容**

### 4. 信息缺口识别
- 列出当前信息不足、需要在调研阶段重点关注的领域

⚠️ **本阶段禁止事项**：
- 禁止输出时间表、预算、KPI、行动计划
- 禁止给出具体的执行建议或推荐方案
- 禁止编造数据或统计数字
- 本阶段的价值在于"问对问题"，而非"给出答案"`,
      2: searchContext
        ? `你的任务是**基于实时搜索资料进行调研分析**，梳理事实和洞察。

请使用下方提供的搜索结果，按以下结构组织调研发现：

### 1. 按维度整理的调研发现
针对第一阶段提出的每个分析维度/子问题，整理相关的事实、数据和案例。
- 使用 [编号] 格式引用来源（如 [1]、[2]）
- 区分"硬数据"（有出处的统计数字）和"软信息"（趋势判断、专家观点）

### 2. 关键洞察
- 提炼5-8条最重要的发现，每条用1-2句话概括
- 标注每条洞察的可信度（高/中/低）和数据来源

### 3. 行业对标与趋势
- 相关行业的基准数据和最佳实践
- 值得关注的趋势和变化信号

### 4. 信息缺口
- 哪些问题仍然缺乏可靠数据？
- 如果搜索资料中没有某方面的信息，明确说明"该方面暂无实时数据"

⚠️ **本阶段禁止事项**：
- 严禁编造或虚构任何引用来源、报告名称或数据
- 禁止给出推荐方案或行动建议——本阶段只呈现事实和洞察
- 禁止输出时间表、预算、KPI`
        : `你的任务是**围绕策划目标进行调研分析**，梳理已知信息和洞察。

注意：你没有实时搜索能力，请基于已有知识进行分析。

请按以下结构组织调研发现：

### 1. 按维度整理的调研发现
针对第一阶段提出的每个分析维度/子问题，整理相关的事实、数据和案例。
- 区分"确定性较高的信息"和"需要验证的推断"

### 2. 关键洞察
- 提炼5-8条最重要的发现，每条用1-2句话概括

### 3. 行业对标与趋势
- 相关行业的通用规律和最佳实践
- 值得关注的趋势和变化方向

### 4. 信息缺口
- 哪些问题需要进一步调研或实地验证？

⚠️ **本阶段禁止事项**：
- 不要编造具体的报告名称、机构引用或统计数据
- 禁止给出推荐方案或行动建议——本阶段只呈现事实和洞察
- 禁止输出时间表、预算、KPI`,
      3: `你的任务是**发散性思考**，提出多种截然不同的战略方向，而非输出一个确定的执行方案。

请完成以下工作：

### 战略方向探索
基于前期分析和调研成果，提出 **3-5个差异化的战略方向**。每个方向需包括：

**方向 N：[方向名称]**
- **核心思路**：用2-3句话描述这个方向的核心逻辑
- **优势**：这个方向的主要优点（2-3条）
- **劣势/风险**：这个方向的主要挑战（2-3条）
- **适用条件**：在什么情况下这个方向最优
- **创新点**：这个方向有什么独特或非常规之处

### 方向对比总览
用简表对比各方向在关键维度上的差异（如资源需求、见效速度、风险水平、创新程度等）。

### 组合可能性
是否有方向可以组合？哪些方向是互斥的？

⚠️ **本阶段禁止事项**：
- 禁止只给出一个"推荐方案"——必须呈现多个可选方向
- 禁止输出详细的执行计划、时间表、预算
- 禁止过早收敛——本阶段的价值在于充分探索可能性
- 鼓励包含至少一个"非常规/大胆"的方向`,
      4: `你的任务是**对第三阶段提出的战略方向进行辩论式推演**，通过正反对抗发现最优路径。

请按以下辩论格式输出：

### 辩论推演

对每个主要战略方向，进行正反方辩论：

**方向 N：[方向名称]**

🟢 **正方论点**（支持该方向的理由）：
- 论点1：[具体论据和推理]
- 论点2：[具体论据和推理]
- 支撑案例或数据

🔴 **反方质疑**（反对该方向的理由）：
- 质疑1：[具体的挑战和风险]
- 质疑2：[假设可能不成立的地方]
- 最坏情况推演

🔄 **正方回应**：
- 对反方核心质疑的回应和缓解方案

### 压力测试
对各方向进行"如果...会怎样"的情景推演：
- 如果市场环境突变？
- 如果资源不足预期？
- 如果竞争对手先行一步？

### 辩论结论
- 哪些方向经受住了考验？哪些暴露了致命弱点？
- 各方向的韧性排序

⚠️ **本阶段禁止事项**：
- 禁止输出为正式报告格式——必须保持辩论/对抗的结构
- 禁止跳过反方质疑，不允许"一边倒"地支持某方案
- 禁止输出详细的执行计划、预算、KPI`,
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

⚠️ **绝对禁止事项（违反任何一条即为不合格文档）**：
- 禁止出现任何占位符：[Your Name]、[公司名]、[填写]、（待定）、TBD、XXX、N/A
- 禁止出现模板提示语：如"具体填写"、"请在此填入"、"根据实际情况"
- 禁止使用模糊表述：如"显著提升"、"大幅增长"、"尽快完成"、"适当调整"
- 所有责任人必须使用具体的角色职位名称（如"市场部负责人"、"技术总监"、"项目经理"），不得使用 [Your Name] 等占位符
- 所有时间节点必须写明具体日期或时段（如"2026年Q2"、"第3-4周"），不得留空
- 所有数据必须给出合理的具体数值（基于行业常识和调研数据进行专业推算）

请严格按以下10个章节结构输出完整文档：

## 执行摘要
使用金字塔原理（结论先行）撰写。必须包含：
- **项目背景**（1-2句话概述为什么需要这个策划）
- **核心策略**（推荐方案的一句话概括）
- **预期量化成果**（具体数字，如"预计6个月内用户增长30%"、"年营收提升500万"）
- **资源投入概估**（如"需要5人核心团队，预算约50万"）
- **推荐行动**（立即应执行的前3项优先事项，每项含责任角色和完成时限）

## 背景与现状分析
- 问题或机遇的详细描述，量化当前痛点（数据支撑）
- 市场环境与行业趋势分析（引用调研数据 [编号]）
- 竞争格局概述（如适用），列出关键竞争者和差异化点
- 使用 SWOT 分析框架总结（用简洁的表格呈现）

## 战略方案
核心策略与子策略的完整分解。使用 Markdown 表格呈现策略矩阵（至少3-5行具体策略）：

| 策略方向 | 具体措施 | 目标成果 | 负责方 | 优先级 |
|---------|---------|---------|--------|--------|

表格后需对每个核心策略补充1-2段说明，解释选择理由和预期效果。

## 详细行动计划
将策略转化为可执行的具体行动步骤（至少8-12个行动项）：

| 序号 | 行动项 | 负责人/团队 | 开始时间 | 完成时间 | 交付物 | 依赖关系 |
|-----|--------|-----------|---------|---------|--------|---------|

## 执行时间表
分阶段的实施路线图（至少3个阶段），标注关键里程碑：

| 阶段 | 时间范围 | 关键里程碑 | 主要交付物 | 负责方 |
|-----|---------|-----------|-----------|--------|

## 资源与预算
按类别详细列出所需资源（每类至少2-3个具体项目）：

| 资源类别 | 具体项目 | 数量/规格 | 预估费用 | 备注 |
|---------|---------|----------|---------|------|

末尾附资源总计和预算汇总。

## 关键绩效指标（KPI）
所有指标必须符合 SMART 标准（至少5-8个KPI）：

| 指标名称 | 当前基线 | 目标值 | 衡量方式 | 考核周期 |
|---------|---------|--------|---------|---------|

## 风险管理
风险登记册（至少识别5个风险），使用概率×影响矩阵评估：

| 风险描述 | 概率 | 影响程度 | 风险等级 | 缓解措施 | 应急预案 | 责任人 |
|---------|------|---------|---------|---------|---------|--------|

## 治理与评审机制
- **评审节奏**：明确的评审频率、参与人员和形式（如"每两周一次项目进度会，由项目经理主持"）
- **决策升级**：分层级的问题升级路径（日常问题→项目经理，重大风险→管理委员会）
- **干系人沟通**：沟通矩阵（干系人、沟通内容、频率、渠道、责任人）

## 参考文献
仅列出正文中实际引用的参考来源，格式：[编号] 标题 — URL

---
**输出质量检查清单**：
1. ✅ 全文无任何占位符或模板提示语（搜索 [Your Name]、TBD、待定、具体填写 应返回零结果）
2. ✅ 所有表格行都填入了与主题直接相关的具体内容，无空白单元格
3. ✅ 所有数据指标都是具体数值（百分比、金额、人数、时间节点）
4. ✅ 所有责任人都使用了具体角色名称（部门+职位）
5. ✅ 正文中使用 [编号] 格式引用了调研参考资料
6. ✅ 文档语言专业严谨，适合C-level高管审阅
7. ✅ 运用 MECE 原则确保分析全面无遗漏`,
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

    // Universal anti-fabrication constraint for all phases
    prompt += `\n⚠️ **通用准则**：不要编造具体数据、统计数字或引用来源。如果没有实际数据支撑，请使用定性分析（如"较高/中等/较低"），并明确标注为推断而非事实。\n\n`;

    prompt += `请以 Markdown 格式输出你的分析和成果。`;

    return prompt;
  }

  /**
   * Build a refinement prompt for Phase 5 (Synthesis) subsequent agents.
   * The agent deepens the synthesis — adding analytical depth, data references,
   * and expression quality — while preserving access to previous phase context.
   */
  private buildSynthesisRefinementPrompt(
    meta: PlanningTopicMetadata,
    agentName: string,
    agentRole: string,
    planName: string,
    previousDraft: string,
    previousContext: string,
  ): string {
    const goal = meta.planConfig.goal;
    const currentDate = new Date().toISOString().split("T")[0];

    let prompt = `# 策划任务: ${planName}\n\n`;
    prompt += `**当前日期**: ${currentDate}\n\n`;
    prompt += `**策划目标**: ${goal}\n\n`;
    prompt += `**你的角色**: ${agentName} — ${agentRole}\n\n`;
    prompt += `**任务指令**: 以下是本阶段前一位成员撰写的综合方案初稿。请基于你的专业视角（${agentRole}）对方案进行深化和完善。\n\n`;
    prompt += `**你的具体任务**：\n`;
    prompt += `- 检查方案的分析深度是否足够，补充遗漏的关键维度\n`;
    prompt += `- 验证推荐方案是否有充分的调研数据支撑，补充 [编号] 引用\n`;
    prompt += `- 检查风险评估是否全面，补充遗漏的风险点\n`;
    prompt += `- 确保关键发现和推荐方案之间有清晰的逻辑链条\n`;
    prompt += `- 优化语言表达的专业性和清晰度\n\n`;
    prompt += `**注意**：保持综合方案的结构框架（执行摘要、关键发现、推荐方案、风险评估），在此基础上深化内容，不要改变为交付文档的10章节格式。\n\n`;

    // Inject reference list so the agent can add citations
    if (meta.references?.length) {
      const refList = meta.references
        .map(
          (r, i) =>
            `[${i + 1}] ${r.title} — ${r.url}${r.sourceType ? ` (${r.sourceType})` : ""}`,
        )
        .join("\n");
      prompt += `---\n\n## 可引用的参考资料\n\n以下是调研阶段收集的参考资料，请在正文中使用 [编号] 格式引用：\n\n${refList}\n\n`;
    }

    // Inject previous phase context so the agent can reference research data and debate conclusions
    if (previousContext) {
      prompt += `---\n\n${previousContext}\n\n`;
    }

    prompt += `---\n\n## 待深化的综合方案\n\n${previousDraft}\n\n---\n\n`;
    prompt += `请输出完整的深化后方案（Markdown 格式），直接输出最终版本，不要输出修改说明。`;

    return prompt;
  }

  /**
   * Build a refinement prompt for Phase 6 (Delivery) subsequent agents.
   * The agent polishes the previous draft into a single cohesive formal document
   * suitable for C-level review.
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
    prompt += `**⚠️ 最高优先级：消除所有占位符和模糊表述**\n`;
    prompt += `逐字扫描全文，发现以下内容必须替换为具体内容：\n`;
    prompt += `- [Your Name]、[公司名]、[填写]、（待定）、TBD、XXX、N/A → 替换为具体角色名称或数据\n`;
    prompt += `- "显著提升"、"大幅增长"、"适当调整" → 替换为"提升25%"、"增长200万"等具体数值\n`;
    prompt += `- "尽快完成"、"近期启动" → 替换为"2026年Q2前完成"等具体时间\n`;
    prompt += `- 空白表格单元格 → 必须填入与主题相关的具体内容\n\n`;
    prompt += `**一、内容质量审查（必须逐项检查并修正）**：\n`;
    prompt += `- 所有表格是否包含具体、有意义的数据（发现空白、占位符必须补充具体内容）\n`;
    prompt += `- 所有责任人是否使用了具体角色名称（如"市场部负责人"、"技术总监"），而非占位符\n`;
    prompt += `- KPI指标是否符合SMART标准（每个KPI都有具体基线值和目标数值）\n`;
    prompt += `- 执行摘要是否包含量化的预期成果（具体百分比、金额、时间节点）\n`;
    prompt += `- 风险矩阵是否完整（每个风险都必须有：概率、影响、缓解措施、应急预案、具体责任人角色）\n`;
    prompt += `- 行动计划中每个步骤是否有明确的责任人角色和具体时间节点\n`;
    prompt += `- 资源预算是否有具体的数量和费用估算数值\n\n`;
    prompt += `**二、文档结构与逻辑**：\n`;
    prompt += `- 保持原有章节结构不变，确保10个章节完整\n`;
    prompt += `- 检查章节间的逻辑衔接和过渡是否自然\n`;
    prompt += `- 确保战略方案→行动计划→时间表→KPI之间的一致性和可追溯性\n`;
    prompt += `- 验证执行摘要准确反映文档核心内容\n\n`;
    prompt += `**三、语言与格式**：\n`;
    prompt += `- 优化语言表达，使其专业、严谨、简洁，适合高管审阅\n`;
    prompt += `- 确保数据引用 [编号] 准确保留\n`;
    prompt += `- 统一全文术语和格式风格\n`;
    prompt += `- 最终质检：搜索 "Your Name"、"TBD"、"待定"、"具体填写" 确保零结果\n\n`;

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
          "你是一位资深策划总监，具有深厚的战略思维和分析能力。你擅长：拆解复杂问题，识别关键矛盾和核心驱动因素；MECE分析（相互独立、完全穷尽）确保逻辑严密；多角度评估方案的可行性和风险；根据不同阶段的要求调整输出——前期重分析和洞察，后期重方案和执行。你的核心价值在于战略判断力，而非文档格式。请严格按照每个阶段的具体指令行事，不要在分析阶段就输出执行方案。",
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
