/**
 * ST-01-PLAN · Leader 全局规划
 *
 * 调 AG-01-LD 产出 LeaderPlan。Input 源自 identity + Topic context
 * （通过 PlanContextProvider 注入，Group E 集成时接入 PrismaService）。
 */

import { Injectable, Logger, Optional } from "@nestjs/common";
import { PrismaService } from "@/common/prisma/prisma.service";
import { toPrismaJson } from "@/common/utils/prisma-json.utils";
import { SpecAgentRegistry } from "@/modules/ai-engine/facade";
import type { LeaderPlannerInput } from "@/modules/ai-app/topic-insights/agents/specs";
import type { LeaderPlan } from "@/modules/ai-app/topic-insights/agents/specs/schemas";
import {
  postProcessLeaderPlan,
  summarizeResearcherAssignments,
} from "@/modules/ai-app/topic-insights/shared/config";
import { LeaderToolService } from "@/modules/ai-app/topic-insights/knowledge/leader-tools";
import { sanitize } from "@/modules/ai-app/topic-insights/shared/utils/prompt-sanitizer.utils";
// F-1: ResearchTaskStatus default=PENDING handled by Prisma — no runtime import needed.
import type { PipelineIdentityContext, Stage, StageResults } from "../types";
import type { PlanStageOutput } from "./stage-context";

/**
 * 已有维度摘要（供 LEADER_PLAN_PROMPT {existingDimensions} 展开）
 */
export interface ExistingDimensionSummary {
  readonly id: string;
  readonly name: string;
  readonly description?: string | null;
  readonly status?: string;
  readonly searchQueries?: ReadonlyArray<string>;
}

/**
 * Topic 元信息提供者 — baseline `planResearch:L189-L251` 对齐契约。
 *
 * 必须返回：
 *  - topicName / topicType / language（用于 {topic}/{topicType}/语言指令）
 *  - topicDescription（{description} 占位符，baseline L287）
 *  - userPrompt（{userPrompt}；sanitize 在 Stage 内统一处理）
 *  - availableModels（已过滤 isAvailable !== false 并按 id 去重，baseline L209-L219）
 *  - existingDimensions（{existingDimensions}，baseline L253-L262）
 *  - anchorContent（EVENT 专属，baseline formatAnchorContentForPrompt）
 */
export abstract class PlanContextProvider {
  abstract load(identity: PipelineIdentityContext): Promise<{
    readonly topicName: string;
    readonly topicType: "MACRO" | "TECHNOLOGY" | "COMPANY" | "EVENT";
    readonly topicDescription?: string;
    readonly userPrompt?: string;
    readonly availableModels: ReadonlyArray<string>;
    readonly language: string;
    readonly existingDimensions?: ReadonlyArray<ExistingDimensionSummary>;
    readonly anchorContent?: string;
  }>;
}

/** Stub 实现 — 测试用 */
export class StubPlanContextProvider extends PlanContextProvider {
  load(_identity: PipelineIdentityContext): Promise<{
    readonly topicName: string;
    readonly topicType: "MACRO" | "TECHNOLOGY" | "COMPANY" | "EVENT";
    readonly topicDescription?: string;
    readonly userPrompt?: string;
    readonly availableModels: ReadonlyArray<string>;
    readonly language: string;
    readonly existingDimensions?: ReadonlyArray<ExistingDimensionSummary>;
    readonly anchorContent?: string;
  }> {
    return Promise.resolve({
      topicName: "Stub Topic",
      topicType: "MACRO" as const,
      topicDescription: "stub description",
      userPrompt: "stub prompt",
      availableModels: ["stub-model-1", "stub-model-2"],
      language: "zh",
      existingDimensions: [],
      anchorContent: "",
    });
  }
}

@Injectable()
export class PlanStage implements Stage<LeaderPlannerInput, PlanStageOutput> {
  readonly id = "ST-01-PLAN" as const;
  readonly name = "Leader plan";
  readonly dependsOn = ["ST-00-INIT" as const];
  readonly runsWhen = "always" as const;
  readonly slo = {
    p95Ms: 60_000,
    tokenBudget: 30_000,
    targetSuccessRate: 0.95,
  };
  readonly emitsEvents = ["leader:planning", "leader:plan_ready"];

  private readonly logger = new Logger(PlanStage.name);

  constructor(
    private readonly agentRegistry: SpecAgentRegistry,
    @Optional()
    private readonly contextProvider: PlanContextProvider = new StubPlanContextProvider(),
    @Optional() private readonly prisma?: PrismaService,
    @Optional() private readonly leaderTool?: LeaderToolService,
  ) {}

  async prepare(
    identity: PipelineIdentityContext,
    _upstream: StageResults,
  ): Promise<LeaderPlannerInput> {
    const meta = await this.contextProvider.load(identity);
    // ★ v2: 能力快照优先：有 capabilities 就透出给 Leader（models/agents/tools/降级建议）
    const caps = identity.capabilities;
    const envChatModels = caps
      ? [
          ...caps.env.models.CHAT.map((m) => m.modelId),
          ...caps.env.models.REASONING.map((m) => m.modelId),
        ]
      : meta.availableModels;

    // F-7 · Baseline leader-tool.searchLatestData — Leader 规划前跑一次
    // 轻量 WEB 搜索把"最新数据速览"塞进 userPrompt，让规划基于最新现实
    // 而不是训练数据里的旧状态。失败降级为"只用训练数据规划"。
    let userPrompt = meta.userPrompt;
    if (this.leaderTool) {
      try {
        const preCtx = await this.leaderTool.generateEnhancedPlanningContext(
          meta.topicName,
          {
            maxResults: 6,
            language: meta.language === "en" ? "en" : "zh",
          },
        );
        if (preCtx) {
          userPrompt = [userPrompt ?? "", "", preCtx].join("\n").trim();
          this.logger.log(
            `[${identity.missionId}] Leader pre-planning context injected (${preCtx.length} chars)`,
          );
        }
      } catch (err) {
        this.logger.warn(
          `[${identity.missionId}] Leader pre-planning search failed: ${(err as Error).message} — planning without it`,
        );
      }
    }

    // ★ baseline L271：Prompt Injection 防护（用户输入必须 sanitize）。
    // Leader pre-planning 注入的 preCtx 已是内部可信内容，只对原始 userPrompt 头部 sanitize。
    const sanitizedUserPrompt = userPrompt
      ? sanitize(userPrompt, 3000)
      : undefined;

    return {
      missionId: identity.missionId,
      topicId: identity.topicId,
      topicName: meta.topicName,
      topicType: meta.topicType,
      topicDescription: meta.topicDescription,
      userPrompt: sanitizedUserPrompt,
      availableModels:
        envChatModels.length > 0 ? envChatModels : meta.availableModels,
      language: meta.language,
      researchDepth: caps?.requestedDepth ?? identity.depth,
      maxDimensions: 6,
      existingDimensions: meta.existingDimensions,
      anchorContent: meta.anchorContent,
      availableAgentIds: caps?.env.agents,
      availableToolIds: caps?.env.tools
        .filter((t) => t.healthy)
        .map((t) => t.toolId),
      recommendedDepth: caps?.recommendedDepth,
    };
  }

  async execute(
    identity: PipelineIdentityContext,
    input: LeaderPlannerInput,
    _signal: AbortSignal,
  ): Promise<PlanStageOutput> {
    const runner = this.agentRegistry.get<LeaderPlannerInput, LeaderPlan>(
      "AG-01-LD",
    );
    if (!runner)
      throw new Error("AG-01-LD not registered in SpecAgentRegistry");
    const res = await runner.executeSpec(input, identity.capabilities?.env);
    if (res.state !== "completed") {
      throw new Error(
        `AG-01-LD failed: ${res.errors?.join("; ") ?? "unknown"}`,
      );
    }
    const plan = res.output;

    // ★ baseline L358-L527 后处理 16 项业务不变量（恢复丢失的 Leader 业务语义）：
    // - modelId 反解（lower-case + 最长前缀模糊匹配）
    // - skills 白名单过滤（LLM 幻觉 skill 丢弃）
    // - 缺 modelId 轮询分配
    // - dimension_researcher/quality_reviewer/report_writer 专属 skill/tool/reason 补齐
    postProcessLeaderPlan(plan, input.topicType, input.availableModels, {
      log: (msg) => this.logger.log(`[${identity.missionId}] ${msg}`),
      debug: (msg) => this.logger.debug(`[${identity.missionId}] ${msg}`),
    });

    this.logger.log(
      `[${identity.missionId}] Plan ready: ${plan.dimensions.length} dim | ` +
        summarizeResearcherAssignments(plan.agentAssignments),
    );

    return { plan };
  }

  async persist(
    identity: PipelineIdentityContext,
    output: PlanStageOutput,
  ): Promise<void> {
    if (!this.prisma) return; // 单测环境可无 Prisma，安全 skip
    const prisma = this.prisma;

    // ★ P0 修复：维度堆积 bug
    //   之前按 name 精确匹配 findFirst，LLM 每次产的 name 略异（如"TTLT定义与边界" vs
    //   "TTLT定义边界与参考模型"）就会新建，跑 N 次 mission 累积 6N 个 dim 垃圾数据。
    //
    //   新策略（对齐 baseline dimension-mission 替换逻辑）：
    //   1. FRESH mode 或 topic 已有 dim 数 == plan dim 数：按 sortOrder 顺序 1:1 更新
    //      （复用现有 id，只改 name/desc/queries/sources）
    //   2. 数量不匹配（用户加/减维度）：按 name 精确匹配 upsert，其他保留
    //   3. 尾部多余的旧 dim 不删（保留历史分析），但不会被新 plan 引用
    //
    //   dimensionScope 模式（增量刷新单 dim）不走这条路径，直接按 id 匹配。
    const existingDims = await prisma.topicDimension.findMany({
      where: { topicId: identity.topicId },
      orderBy: { sortOrder: "asc" },
      select: { id: true, name: true, sortOrder: true },
    });

    let upserted: Array<{ id: string }>;
    const isFreshReplace =
      identity.mode === "fresh" &&
      (!identity.dimensionScope || identity.dimensionScope.length === 0);
    const countMatches = existingDims.length === output.plan.dimensions.length;

    if (isFreshReplace && countMatches && existingDims.length > 0) {
      // ★ 数量匹配的重跑：按 sortOrder 逐位更新，**复用现有 id**，避免堆积新 dim
      upserted = await Promise.all(
        output.plan.dimensions.map(async (d, idx) => {
          const existing = existingDims[idx];
          await prisma.topicDimension.update({
            where: { id: existing.id },
            data: {
              name: d.name,
              description: d.description,
              searchQueries: toPrismaJson(d.searchQueries),
              searchSources: toPrismaJson(d.dataSources),
              sortOrder: idx,
            },
          });
          return { id: existing.id };
        }),
      );
      this.logger.log(
        `[${identity.missionId}] Replaced ${existingDims.length} existing dims by sortOrder (no new dims created)`,
      );
    } else {
      // 数量不匹配 / 增量 / 首次：按 name 匹配 upsert（原有行为）
      upserted = await Promise.all(
        output.plan.dimensions.map(async (d, idx) => {
          const existing = await prisma.topicDimension.findFirst({
            where: { topicId: identity.topicId, name: d.name },
            select: { id: true },
          });
          if (existing) {
            await prisma.topicDimension.update({
              where: { id: existing.id },
              data: {
                description: d.description,
                searchQueries: toPrismaJson(d.searchQueries),
                searchSources: toPrismaJson(d.dataSources),
                sortOrder: idx,
              },
            });
            return { id: existing.id };
          }
          return prisma.topicDimension.create({
            data: {
              topicId: identity.topicId,
              name: d.name,
              description: d.description,
              searchQueries: toPrismaJson(d.searchQueries),
              searchSources: toPrismaJson(d.dataSources),
              sortOrder: idx,
            },
            select: { id: true },
          });
        }),
      );
    }

    // Mutate plan.dimensions in place to carry真 DB id（后续 stage 依赖）
    const mutablePlan = output.plan as {
      dimensions: Array<{ id: string } & Record<string, unknown>>;
    };
    for (let i = 0; i < mutablePlan.dimensions.length; i++) {
      mutablePlan.dimensions[i].id = upserted[i].id;
    }

    // H3 single-dimension scope: after IDs are assigned, prune plan.dimensions
    // to just the scoped ids so all downstream stages (RESEARCH/WRITE/REVIEW/
    // INTEGRATE/REMEDIATE) naturally operate on the subset.
    if (identity.dimensionScope && identity.dimensionScope.length > 0) {
      const wanted = new Set(identity.dimensionScope);
      const filtered = mutablePlan.dimensions.filter(
        (d) =>
          (typeof d.id === "string" && wanted.has(d.id)) ||
          (typeof d.name === "string" && wanted.has(d.name)),
      );
      mutablePlan.dimensions.length = 0;
      mutablePlan.dimensions.push(...filtered);
    }

    await prisma.researchMission.update({
      where: { id: identity.missionId },
      data: {
        leaderPlan: toPrismaJson(output.plan),
        totalTasks: output.plan.dimensions.length,
      },
    });

    // F-1 · 同步 ResearchTask 行（前端"任务列表"数据源）
    // harness pipeline 取代了 LifecycleService.approvePlanAndExecute 的路径，
    // 但 LifecycleService.createTasksFromPlan 的 ResearchTask 持久化从未被重新接上。
    // 这里用 Prisma 直接 seed 维度任务 + 质量审核 + 报告撰写三类 task row，
    // 与 baseline lifecycle.service.ts:501+ 行为保持一致（幂等：已存在就跳过）。
    await this.seedResearchTasks(prisma, identity.missionId, output.plan);
  }

  /**
   * 为 mission 创建 ResearchTask 行（幂等）。
   * 前端 `/api/v1/topic-insights/topics/:id/todos` 读这些行渲染"任务列表"。
   *
   * ★ baseline `mission-execution.executeTask:L429-L434` 对齐：
   *   每个 dimension 根据 assignment.assignedDimensions 找到**对应的 researcher**，
   *   而非所有 dim 共享单一 dimension_researcher。这样前端任务列表
   *   在 6 个 dim 下会展示 6 个不同的 agentName/role，复原 baseline 的
   *   "多样化研究员"能力。
   */
  private async seedResearchTasks(
    prisma: PrismaService,
    missionId: string,
    plan: LeaderPlan,
  ): Promise<void> {
    const existing = await prisma.researchTask.count({ where: { missionId } });
    if (existing > 0) {
      return; // 幂等：已 seed 过（ST-01-PLAN 重跑时直接返回）
    }

    const researchers = plan.agentAssignments.filter(
      (a) => a.agentType === "dimension_researcher",
    );
    const fallbackResearcher = researchers[0]; // 退化：无 assignedDimensions 时用首个

    const dimensionTasks = plan.dimensions.map((d, idx) => {
      // per-dim 分配：优先 assignedDimensions 精确匹配，无匹配退化为轮询
      const assignment =
        researchers.find((a) => a.assignedDimensions?.includes(d.id)) ||
        researchers[idx % Math.max(1, researchers.length)] ||
        fallbackResearcher;

      return {
        missionId,
        title: `研究: ${d.name}`,
        description: d.description,
        taskType: "dimension_research",
        dimensionId: d.id,
        dimensionName: d.name,
        // ★ per-dim 绑定真实 agentId（baseline mission-execution L429）
        assignedAgent: assignment?.agentId || "researcher_default",
        // baseline 用 role（9 种 specialist role）而非粗粒度 agentType
        assignedAgentType: assignment?.role || "dimension_researcher",
        modelId: assignment?.modelId || undefined,
        skills: assignment?.skills ?? [],
        tools: assignment?.tools ?? [],
        priority: d.priority ?? idx,
      };
    });
    await prisma.researchTask.createMany({ data: dimensionTasks });

    const reviewer = plan.agentAssignments.find(
      (a) => a.agentType === "quality_reviewer",
    );
    const reviewTask = await prisma.researchTask.create({
      data: {
        missionId,
        title: "质量审核",
        description: "审核所有维度研究结果的质量",
        taskType: "quality_review",
        assignedAgent: reviewer?.agentId || "reviewer_default",
        assignedAgentType: reviewer?.role || "quality_reviewer",
        modelId: reviewer?.modelId || undefined,
        skills: reviewer?.skills ?? [],
        tools: reviewer?.tools ?? [],
        priority: 100,
      },
      select: { id: true },
    });

    const writer = plan.agentAssignments.find(
      (a) => a.agentType === "report_writer",
    );
    await prisma.researchTask.create({
      data: {
        missionId,
        title: "报告撰写",
        description: "整合研究结果，生成最终报告",
        taskType: "report_synthesis",
        assignedAgent: writer?.agentId || "writer_default",
        assignedAgentType: writer?.role || "report_writer",
        modelId: writer?.modelId || undefined,
        skills: writer?.skills ?? [],
        tools: writer?.tools ?? [],
        priority: 101,
        dependencies: [reviewTask.id],
      },
    });
  }
}
