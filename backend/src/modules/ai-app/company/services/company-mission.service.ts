/**
 * CompanyMissionService — W3 团队 Mission 持久化 + 真实 LLM 执行
 *
 * Responsibilities:
 *   - createMission(): 落库 company_missions 行，fire-and-forget 异步执行。
 *   - listMissions(): 按 userId / teamId 查询列表。
 *
 * 执行流程（真实 LLM 三阶段）：
 *   1. status → 'running'，emit company.mission:started
 *   2. Stage planning  — Leader 拆解任务，emit company.stage:lifecycle {stage:'planning', ...}
 *   3. Stage execution — 各成员依 workflow stages 轮流执行，emit company.stage:lifecycle {stage:'execution', ...}
 *   4. Stage review    — Leader 综合评审，emit company.stage:lifecycle {stage:'review', ...}
 *   5. status → 'done' / 'failed'，emit company.mission:completed / mission:failed
 *
 * 无可用 LLM Key / API 错误 → catch → status 'failed' + emit company.mission:failed {message}
 * 不得吞错伪装成功。
 */

import { Injectable, Logger } from "@nestjs/common";
import { PrismaService } from "@/common/prisma/prisma.service";
import { EventBus, ChatFacade, AgentRunner } from "@/modules/ai-harness/facade";
import { SkillRegistry } from "@/modules/ai-engine/facade";
import type { CompanyMission, Prisma } from "@prisma/client";
import { AIModelType } from "@prisma/client";
import type { CompanyHiredAgent } from "@prisma/client";
import {
  CompanyRepository,
  type CompanyTeamForMission,
} from "./company.repository";
// ★ 通用路径 ⑤ 真用：成员若是可独立跑的叶子 agent，用 AgentRunner 真跑（非能力化团队）。
import {
  resolveAgentSpec,
  STANDALONE_RUNNABLE_AGENT_IDS,
} from "@/modules/ai-app/contracts/agent-spec-catalog";
// ★ 能力化执行：团队套用的 workflow → 市场 SKU → CapabilityRegistry 解析到平台共享能力
//   runner，在 harness 上真跑（零 playground 依赖）。design.md §4.3 + 能力 manifest/port。
import { MarketplaceCatalogService } from "@/modules/ai-app/marketplace/catalog/marketplace-catalog.service";
import {
  CapabilityRegistry,
  type ICapabilityRunner,
  type CapabilityRunEvent,
} from "@/modules/ai-app/marketplace/capability";

// ── local type alias so we don't need to import ChatRequest from facade types ─

type TaskProfile = {
  creativity?: "deterministic" | "low" | "medium" | "high";
  outputLength?:
    | "minimal"
    | "short"
    | "medium"
    | "standard"
    | "long"
    | "extended";
};

/**
 * 前端模型档位（Opus/Sonnet/Haiku 展示名）→ 引擎 modelType。
 * 不把档位名当真实 model id 传（那会解析失败），统一走 modelType，由引擎按 TaskProfile + fallback 链选模型。
 */
const TIER_TO_MODEL_TYPE: Record<string, AIModelType> = {
  Opus: AIModelType.CHAT,
  Sonnet: AIModelType.CHAT_FAST,
  Haiku: AIModelType.CHAT_FAST,
};

// ── service ───────────────────────────────────────────────────────────────────

@Injectable()
export class CompanyMissionService {
  private readonly log = new Logger(CompanyMissionService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly eventBus: EventBus,
    private readonly chatFacade: ChatFacade,
    private readonly companyRepository: CompanyRepository,
    private readonly skillRegistry: SkillRegistry,
    private readonly agentRunner: AgentRunner,
    private readonly capabilityRegistry: CapabilityRegistry,
    private readonly catalogService: MarketplaceCatalogService,
  ) {}

  /**
   * 把 Agent 装配的技能（skillIds）解析回真实方法论正文，注入系统提示。
   * 这才让"选了技能"真生效——LLM 拿到的是方法论正文，不是技术 id 字符串。
   *
   * 数据源与市场货架一致：engine SkillRegistry 里的 prompt 型技能
   * （PromptSkillAdapter.getPromptContent() 返回 .skill.md 正文）。
   */
  private buildSkillInstructions(skillIds: string[]): string {
    if (!skillIds.length) return "";
    const blocks: string[] = [];
    for (const id of skillIds) {
      const skill = this.skillRegistry.tryGet(id) as unknown as
        | { name?: string; getPromptContent?: () => string }
        | undefined;
      const body = skill?.getPromptContent?.()?.trim();
      if (body) {
        blocks.push(`## Skill: ${skill?.name ?? id}\n${body}`);
      }
    }
    if (!blocks.length) {
      // 装配了技能但加载不到正文（如 code-backed 执行单元）：至少声明名字
      return `You are equipped with skills: ${skillIds.join(", ")}.`;
    }
    return `You are equipped with the following skills. Apply their methodology rigorously:\n\n${blocks.join("\n\n")}`;
  }

  // ── create + dispatch ──────────────────────────────────────────────────────

  async createMission(
    userId: string,
    teamId: string,
    title: string,
  ): Promise<CompanyMission> {
    const mission = await this.prisma.companyMission.create({
      data: { userId, teamId, title, status: "queued", progress: 0 },
    });

    // fire-and-forget: 异步执行，不等待，异常由 runMission 内部处理
    void this.runMission(mission.id, userId).catch((err: unknown) => {
      this.log.error(
        `CompanyMission ${mission.id} run failed (outer catch): ${err instanceof Error ? err.message : String(err)}`,
      );
    });

    return mission;
  }

  // ── list ───────────────────────────────────────────────────────────────────

  async listMissions(
    userId: string,
    teamId?: string,
  ): Promise<CompanyMission[]> {
    return this.prisma.companyMission.findMany({
      where: { userId, ...(teamId ? { teamId } : {}) },
      orderBy: { createdAt: "desc" },
    });
  }

  /** 删除一条 mission（按 userId 归属校验，防越权删他人任务）。 */
  async deleteMission(userId: string, missionId: string): Promise<void> {
    await this.prisma.companyMission.deleteMany({
      where: { id: missionId, userId },
    });
  }

  /** 重命名 mission 标题（按 userId 归属校验）。 */
  async renameMission(
    userId: string,
    missionId: string,
    title: string,
  ): Promise<void> {
    await this.prisma.companyMission.updateMany({
      where: { id: missionId, userId },
      data: { title },
    });
  }

  // ── internal runner ────────────────────────────────────────────────────────

  /**
   * 真实三阶段执行流：
   *   queued → running → emit started
   *   planning: Leader LLM 拆解子任务
   *   execution: 各成员依 workflow stages 顺序执行
   *   review:    Leader LLM 综合评审
   *   running → done/failed + emit completed/failed
   */
  private async runMission(missionId: string, userId: string): Promise<void> {
    // 1. 查 mission 基础信息
    const mission = await this.prisma.companyMission.findUnique({
      where: { id: missionId },
    });
    if (!mission) {
      this.log.warn(`CompanyMission ${missionId} not found, aborting run`);
      return;
    }

    // 2. 查团队 + 成员 agent + workflow
    const team = await this.companyRepository.findTeamForMission(
      mission.teamId,
      userId,
    );

    // 3. 状态 running
    await this.updateMission(missionId, { status: "running", progress: 0 });
    await this.emit("company.mission:started", missionId, userId, {
      missionId,
    });

    try {
      // ★ 采用引用 → 共享能力 → 在 harness 上真跑（design.md §4.3 + 能力 manifest/port）。
      //   团队套用的 workflow.sourceListingId → 市场 SKU.missionType → CapabilityRegistry
      //   解析到平台共享的能力 runner（用同一批共享 agent，纯执行）。解析到 → 真跑该能力；
      //   解析不到（非能力化团队）→ 退回下方通用 chat 三阶段。
      //   深度研究团队（含 researcher 成员）强制走能力 runner，不降级（见 resolveCapabilityRunner）。
      const runner = this.resolveCapabilityRunner(team);
      if (runner) {
        // 从 leader（或首个成员）取真实 model id 作为 preferredModelId：
        //   - 用户在 UI 选了具体模型（非档位名）→ 直接透传，bypass election，BYOK 解析链生效
        //   - 未选 / 档位名 → 空字符串，AgentRunner 按 TaskProfile + BYOK 默认选模型（正确）
        const leader = this.resolveLeader(team);
        const pref = leader?.models?.[0] ?? "";
        const preferredModelId = TIER_TO_MODEL_TYPE[pref]
          ? undefined
          : pref || undefined;
        await this.runViaCapability(
          missionId,
          userId,
          mission.title,
          runner,
          preferredModelId,
        );
        return;
      }

      // ── Stage 1: planning ───────────────────────────────────────────────
      await this.emit("company.stage:lifecycle", missionId, userId, {
        stage: "planning",
        status: "started",
      });

      const planningResult = await this.runPlanning(
        mission.title,
        team,
        userId,
      );

      await this.updateMission(missionId, { progress: 33 });
      await this.emit("company.stage:lifecycle", missionId, userId, {
        stage: "planning",
        status: "completed",
      });

      // ── Stage 2: execution ──────────────────────────────────────────────
      await this.emit("company.stage:lifecycle", missionId, userId, {
        stage: "execution",
        status: "started",
      });

      const executionResults = await this.runExecution(
        mission.title,
        planningResult,
        team,
        userId,
      );

      await this.updateMission(missionId, { progress: 66 });
      await this.emit("company.stage:lifecycle", missionId, userId, {
        stage: "execution",
        status: "completed",
      });

      // ── Stage 3: review ─────────────────────────────────────────────────
      await this.emit("company.stage:lifecycle", missionId, userId, {
        stage: "review",
        status: "started",
      });

      const reviewResult = await this.runReview(
        mission.title,
        planningResult,
        executionResults,
        team,
        userId,
      );

      // 4. 完成
      await this.updateMission(missionId, {
        status: "done",
        progress: 100,
        result: {
          summary: reviewResult,
          planningOutput: planningResult,
          executionOutputs: executionResults,
          completedAt: new Date().toISOString(),
        },
      });

      await this.emit("company.stage:lifecycle", missionId, userId, {
        stage: "review",
        status: "completed",
      });
      await this.emit("company.mission:completed", missionId, userId, {
        missionId,
      });

      this.log.log(`CompanyMission ${missionId} completed`);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "unknown error";
      this.log.error(`CompanyMission ${missionId} failed: ${message}`);

      await this.updateMission(missionId, {
        status: "failed",
        result: { error: message, failedAt: new Date().toISOString() },
      }).catch((dbErr: unknown) => {
        this.log.error(
          `Failed to persist failed status for ${missionId}: ${dbErr instanceof Error ? dbErr.message : String(dbErr)}`,
        );
      });

      await this.emit("company.mission:failed", missionId, userId, {
        missionId,
        message,
      });
    }
  }

  // ── 能力化执行（采用引用 → 共享能力 runner → 在 harness 真跑）──────────────────

  /**
   * 把团队套用的 workflow（sourceListingId → 市场 SKU.missionType）解析到平台共享的
   * 能力 runner（CapabilityRegistry）。
   *
   * 深度研究团队（含 researcher 成员 / 绑 deep-insight workflow）强制走能力 runner，
   * **不降级**到通用三阶段 chat——降级是模型用错（qwen3-max 偷跑）的根因。
   * 若 deep-insight runner 尚未注册（onModuleInit 未触发）→ warn + throw，
   * 而非静默 fallback，让问题可观测。
   */
  private resolveCapabilityRunner(
    team: CompanyTeamForMission | null,
  ): ICapabilityRunner | undefined {
    // 1) 正道：团队套用的 workflow → 市场 SKU.missionType → 能力。
    const sourceListingId = team?.workflow?.sourceListingId;
    if (sourceListingId) {
      const sku = this.catalogService
        .getWorkflows()
        .find((w) => w.id === sourceListingId);
      if (sku?.missionType) {
        const runner = this.capabilityRegistry.resolve(sku.missionType);
        if (runner) return runner;
        // workflow 绑定了 missionType 但 runner 未注册：硬失败，不降级
        this.log.error(
          `resolveCapabilityRunner: missionType "${sku.missionType}" for listing "${sourceListingId}" not found in CapabilityRegistry — deep-insight runner may not have initialized`,
        );
        throw new Error(
          `capability runner "${sku.missionType}" not registered; ensure DeepInsightDefaultRunner.onModuleInit ran`,
        );
      }
    }
    // 2) 存量兼容：未绑 workflow 但花名册含 researcher 叶子的团队 → 硬路由到 deep-insight。
    //    强制不降级：找不到 runner 抛错（可观测），不静默 fallback 到通用三阶段。
    if (
      team?.members.some(
        (m) => m.hiredAgent?.listingId === "playground.researcher",
      )
    ) {
      const runner = this.capabilityRegistry.resolve("deep-insight");
      if (runner) return runner;
      this.log.error(
        `resolveCapabilityRunner: deep-insight runner not found in CapabilityRegistry — cannot run deep-research team`,
      );
      throw new Error(
        `capability runner "deep-insight" not registered; ensure DeepInsightDefaultRunner.onModuleInit ran`,
      );
    }
    return undefined;
  }

  /**
   * 经能力 runner 真跑：runner 是平台共享、纯执行（用共享 agent，产出结果 + 流式事件），
   * **company 负责持久化 + 把事件桥到 company.* WS**。零 playground 依赖、零山寨重实现。
   *
   * preferredModelId 透传到 CapabilityRunInput，最终到达 agentRunner.run RunOptions，
   * 命中 resolvePreferredModel 第一优先，bypass election，走用户 BYOK 默认解析链。
   */
  private async runViaCapability(
    missionId: string,
    userId: string,
    topic: string,
    runner: ICapabilityRunner,
    preferredModelId?: string,
  ): Promise<void> {
    const result = await runner.run(
      { topic, ...(preferredModelId ? { preferredModelId } : {}) },
      {
        userId,
        missionId,
        onEvent: (e) => {
          void this.bridgeCapabilityEvent(missionId, userId, e);
        },
      },
    );

    const toJson = (v: unknown): Prisma.InputJsonValue =>
      JSON.parse(JSON.stringify(v ?? null)) as Prisma.InputJsonValue;

    if (result.status === "completed") {
      await this.updateMission(missionId, {
        status: "done",
        progress: 100,
        result: {
          summary: result.report ?? "",
          references: toJson(result.references ?? []),
          usage: {
            totalTokens: result.usage?.totalTokens ?? 0,
            totalCostCents: result.usage?.totalCostCents ?? 0,
          },
          capabilityId: runner.manifest.id,
          completedAt: new Date().toISOString(),
        },
      });
      await this.emit("company.mission:completed", missionId, userId, {
        missionId,
      });
      this.log.log(
        `CompanyMission ${missionId} completed via capability "${runner.manifest.id}"`,
      );
      return;
    }

    // failed —— 不伪装成功：真实 error 落库 + emit（前端失败空态据此显示真因）。
    const message = result.error ?? "capability run failed";
    await this.updateMission(missionId, {
      status: "failed",
      result: { error: message, failedAt: new Date().toISOString() },
    });
    await this.emit("company.mission:failed", missionId, userId, {
      missionId,
      message,
    });
  }

  /** 能力执行流事件 → company.stage:lifecycle + 进度（前端任务详情 WS 实时呈现）。 */
  private async bridgeCapabilityEvent(
    missionId: string,
    userId: string,
    event: CapabilityRunEvent,
  ): Promise<void> {
    const stageMap: Record<string, "planning" | "execution" | "review"> = {
      plan: "planning",
      research: "execution",
      reconcile: "execution",
      analyze: "execution",
      write: "execution",
      review: "review",
    };
    if (event.type === "stage:started" || event.type === "stage:completed") {
      const stage = event.stepId ? stageMap[event.stepId] : undefined;
      if (stage) {
        await this.emit("company.stage:lifecycle", missionId, userId, {
          stage,
          status: event.type === "stage:started" ? "started" : "completed",
          label: event.label,
        });
      }
    } else if (event.type === "agent-lifecycle") {
      // 完成快照：桥转到 company.agent:lifecycle 供前端实时展示 token/model 进度
      const p = event.payload ?? {};
      const state = typeof p.state === "string" ? p.state : undefined;
      const phase =
        typeof p.phase === "string"
          ? p.phase
          : state === "succeeded" || state === "completed"
            ? "completed"
            : state === "failed"
              ? "failed"
              : "completed";
      const role =
        typeof p.role === "string" ? p.role : (p.agentId as string | undefined);
      await this.emit("company.agent:lifecycle", missionId, userId, {
        stepId: event.stepId,
        label: event.label,
        phase,
        role,
        ...p,
      });
    } else if (event.type === "agent-trace") {
      // 过程级 agent 事件：按 kind 分流
      const p = event.payload ?? {};
      const kind = typeof p.kind === "string" ? p.kind : "";
      const role = typeof p.role === "string" ? p.role : undefined;
      const dimension =
        typeof p.dimension === "string" ? p.dimension : undefined;

      if (
        kind === "lifecycle-started" ||
        kind === "lifecycle-completed" ||
        kind === "lifecycle-failed"
      ) {
        // 生命周期节点 → company.agent:lifecycle
        const phase =
          kind === "lifecycle-started"
            ? "started"
            : kind === "lifecycle-completed"
              ? "completed"
              : "failed";
        await this.emit("company.agent:lifecycle", missionId, userId, {
          phase,
          role,
          ...(dimension !== undefined ? { dimension } : {}),
          ...(typeof p.agentId === "string" ? { agentId: p.agentId } : {}),
          ...(typeof p.tokensUsed === "number"
            ? { tokensUsed: p.tokensUsed }
            : {}),
          ...(p.modelTrail !== undefined ? { modelTrail: p.modelTrail } : {}),
        });
      } else {
        // thinking / action_planned / action_executed / error → company.agent:narrative
        const text = typeof p.text === "string" ? p.text : undefined;
        const tag = typeof p.tag === "string" ? p.tag : undefined;
        if (text !== undefined) {
          await this.emit("company.agent:narrative", missionId, userId, {
            text,
            ...(role !== undefined ? { role } : {}),
            ...(tag !== undefined ? { tag } : {}),
            ...(dimension !== undefined ? { dimension } : {}),
          });
        }
      }
    }
  }

  // ── Stage implementations ──────────────────────────────────────────────────

  /**
   * Stage 1: Leader 拆解任务。
   * 返回 planning 输出文本（可为 JSON 描述子任务列表，供 execution 使用）。
   * 无 leader 时用系统默认模型。
   */
  private async runPlanning(
    missionTitle: string,
    team: CompanyTeamForMission | null,
    userId: string,
  ): Promise<string> {
    const leader = this.resolveLeader(team);

    const systemPrompt = [
      [
        "You are the CEO and team leader of a consulting firm.",
        "Your task is to analyze the given mission and break it down into a structured execution plan.",
        "Identify 2–4 concrete subtasks for the team members, each with a clear objective and expected deliverable.",
        "If a workflow is defined, align subtasks to those stages.",
        "Output a concise plan in plain text or lightweight JSON.",
      ].join(" "),
      this.buildSkillInstructions(leader?.skillIds ?? []),
    ]
      .filter(Boolean)
      .join("\n\n");

    const userContent = [
      `Mission: ${missionTitle}`,
      team?.workflow
        ? `Team workflow stages: ${team.workflow.stages.join(", ")}`
        : "",
      team
        ? `Team members: ${this.describeMemberRoles(team)}`
        : "No team configured — use general best practices.",
    ]
      .filter(Boolean)
      .join("\n");

    const req = this.buildChatRequest(
      systemPrompt,
      userContent,
      leader,
      { creativity: "medium", outputLength: "medium" },
      "company-mission-planning",
      userId,
    );

    const result = await this.chatFacade.chat(req);
    if (result.isError) {
      throw new Error(`Planning stage LLM error: ${result.content}`);
    }
    return result.content;
  }

  /**
   * Stage 2: 各成员（或无成员时用 non-leader model）依 workflow stages 执行。
   * 返回每个成员/阶段的产出文本数组。
   */
  private async runExecution(
    missionTitle: string,
    planningOutput: string,
    team: CompanyTeamForMission | null,
    userId: string,
  ): Promise<string[]> {
    const executionStages = this.resolveExecutionStages(team);
    const nonLeaderMembers = this.resolveNonLeaderMembers(team);

    const outputs: string[] = [];

    for (let i = 0; i < executionStages.length; i++) {
      const stageName = executionStages[i];
      // Round-robin assign a member if available; otherwise fall back to leader/default
      const member =
        nonLeaderMembers.length > 0
          ? nonLeaderMembers[i % nonLeaderMembers.length]
          : this.resolveLeader(team);

      // ★ ⑤ 真用（工具/ReAct 级）：成员若是可独立跑的 playground 叶子 agent（researcher），
      //   解析回真 @DefineAgent 类用 AgentRunner 真跑（带真 web-search/ReAct）；
      //   失败或非叶子 → 退回下方「注入真技能指令的通用 chat」。
      const realOutput = await this.tryRunRealAgent(
        member,
        missionTitle,
        stageName,
        planningOutput,
        userId,
      );
      if (realOutput != null) {
        outputs.push(`[${stageName}]\n${realOutput}`);
        continue;
      }

      const systemPrompt = [
        member
          ? `You are a ${member.role} on a consulting team.`
          : "You are a specialist consultant.",
        `Your goal is to execute the "${stageName}" stage of the mission.`,
        "Be specific, thorough, and professional.",
        this.buildSkillInstructions(member?.skillIds ?? []),
      ]
        .filter(Boolean)
        .join("\n\n");

      const userContent = [
        `Mission: ${missionTitle}`,
        `Execution plan:\n${planningOutput}`,
        `Your focus for stage "${stageName}": produce a detailed, actionable output for this stage.`,
      ].join("\n\n");

      const req = this.buildChatRequest(
        systemPrompt,
        userContent,
        member,
        { creativity: "medium", outputLength: "long" },
        `company-mission-execution-${stageName}`,
        userId,
      );

      const result = await this.chatFacade.chat(req);
      if (result.isError) {
        throw new Error(
          `Execution stage "${stageName}" LLM error: ${result.content}`,
        );
      }
      outputs.push(`[${stageName}]\n${result.content}`);
    }

    return outputs;
  }

  /**
   * ⑤ 真用：成员若解析为「可独立跑的 playground 叶子 agent」，用 AgentRunner 真跑
   * 该 @DefineAgent 类（researcher → 真 web-search/ReAct，出结构化 findings）。
   * 非叶子 / 未沉淀 / 跑失败 → 返回 null，调用方退回通用 chat（不抛错、不阻断 mission）。
   */
  private async tryRunRealAgent(
    member: CompanyHiredAgent | null,
    topic: string,
    dimension: string,
    context: string,
    userId: string,
  ): Promise<string | null> {
    const listingId = member?.listingId;
    if (!listingId || !STANDALONE_RUNNABLE_AGENT_IDS.has(listingId))
      return null;
    const SpecClass = resolveAgentSpec(listingId);
    if (!SpecClass) return null;

    try {
      const result = await this.agentRunner.run(
        SpecClass,
        {
          topic,
          dimension,
          language: "zh-CN",
          description: context.slice(0, 4000),
          withFigures: false,
        },
        { userId },
      );
      const text = this.stringifyAgentOutput(result.output);
      this.log.log(
        `CompanyMission member "${listingId}" ran real agent (out ${text.length} chars)`,
      );
      return text;
    } catch (err) {
      this.log.warn(
        `real agent "${listingId}" run failed, fallback to chat: ${err instanceof Error ? err.message : String(err)}`,
      );
      return null;
    }
  }

  private stringifyAgentOutput(output: unknown): string {
    if (typeof output === "string") return output;
    try {
      return JSON.stringify(output, null, 2);
    } catch {
      return String(output);
    }
  }

  /**
   * Stage 3: Leader 综合评审并生成最终交付。
   * 返回综合后的 final summary 文本。
   */
  private async runReview(
    missionTitle: string,
    planningOutput: string,
    executionOutputs: string[],
    team: CompanyTeamForMission | null,
    userId: string,
  ): Promise<string> {
    const leader = this.resolveLeader(team);

    const systemPrompt = [
      [
        "You are the CEO reviewing your team's work.",
        "Synthesize all stage outputs into a cohesive final deliverable.",
        "Evaluate completeness, quality, and alignment with the original mission goal.",
        "Produce a clear, professional final summary and any key recommendations.",
      ].join(" "),
      this.buildSkillInstructions(leader?.skillIds ?? []),
    ]
      .filter(Boolean)
      .join("\n\n");

    const userContent = [
      `Mission: ${missionTitle}`,
      `Planning output:\n${planningOutput}`,
      "Team execution outputs:",
      ...executionOutputs.map((o, i) => `--- Output ${i + 1} ---\n${o}`),
      "\nSynthesize these into a final deliverable and provide your assessment.",
    ].join("\n\n");

    const req = this.buildChatRequest(
      systemPrompt,
      userContent,
      leader,
      { creativity: "low", outputLength: "long" },
      "company-mission-review",
      userId,
    );

    const result = await this.chatFacade.chat(req);
    if (result.isError) {
      throw new Error(`Review stage LLM error: ${result.content}`);
    }
    return result.content;
  }

  // ── helpers ────────────────────────────────────────────────────────────────

  /**
   * Build a chat request from a system prompt + user content.
   * Uses model from the agent's models array if provided, otherwise falls back to
   * AIModelType.CHAT (let the engine select the best available model).
   * TaskProfile is always semantic — never hardcodes temperature or maxTokens.
   */
  private buildChatRequest(
    systemPrompt: string,
    userContent: string,
    agent: CompanyHiredAgent | null,
    taskProfile: TaskProfile,
    operationName: string,
    userId: string,
  ): Parameters<ChatFacade["chat"]>[0] {
    // 成员模型偏好 = 用户「我的模型」里选的真实 model id（fallback 链取主模型）。
    // 旧档位名（Opus/Sonnet/Haiku）仅作向后兼容：识别为档位则走 modelType，不当真实 id 传。
    const pref = agent?.models?.[0] ?? "";
    const legacyType = TIER_TO_MODEL_TYPE[pref];
    const model = legacyType ? "" : pref;
    const modelType: AIModelType = legacyType ?? AIModelType.CHAT;

    return {
      messages: [{ role: "user" as const, content: userContent }],
      systemPrompt,
      taskProfile,
      operationName,
      // 真实 model id 优先；为空时由 modelType + TaskProfile 解析（符合"fallback 用空串"红线）
      ...(model ? { model } : {}),
      modelType,
      // ★ 后台 mission 任务无 RequestContext → 必须显式带 billing.userId，
      //   否则下游 AiChatService 严格 BYOK 防呆会抛 "[chat] Refused: no userId"。
      billing: {
        userId,
        moduleType: "company",
        operationType: operationName,
      },
    };
  }

  /** Resolve the leader agent (by leaderId → member lookup). Falls back to null. */
  private resolveLeader(
    team: CompanyTeamForMission | null,
  ): CompanyHiredAgent | null {
    if (!team) return null;
    if (team.leaderId) {
      const m = team.members.find((m) => m.hiredAgentId === team.leaderId);
      if (m) return m.hiredAgent;
    }
    // Fallback: first member as leader
    return team.members[0]?.hiredAgent ?? null;
  }

  /** Resolve non-leader members. */
  private resolveNonLeaderMembers(
    team: CompanyTeamForMission | null,
  ): CompanyHiredAgent[] {
    if (!team) return [];
    return team.members
      .filter((m) => m.hiredAgentId !== team.leaderId)
      .map((m) => m.hiredAgent);
  }

  /**
   * Execution stage IDs: use workflow.stages if defined, otherwise ["execution"].
   * We always emit "execution" as the stage:lifecycle event name for frontend compat.
   * The execution loop may cover one or more workflow stages internally.
   */
  private resolveExecutionStages(team: CompanyTeamForMission | null): string[] {
    if (team?.workflow?.stages.length) {
      return team.workflow.stages;
    }
    return ["execution"];
  }

  /** Human-readable member role summary for the leader's planning prompt. */
  private describeMemberRoles(team: CompanyTeamForMission): string {
    return team.members
      .map((m) => {
        const tag = m.hiredAgentId === team.leaderId ? "(leader)" : "";
        return `${m.hiredAgent.name} [${m.hiredAgent.role}]${tag}`;
      })
      .join(", ");
  }

  private async updateMission(
    id: string,
    data: Partial<
      Pick<CompanyMission, "status" | "progress"> & {
        result: Prisma.InputJsonValue;
      }
    >,
  ): Promise<void> {
    await this.prisma.companyMission
      .update({ where: { id }, data })
      .catch((err: unknown) => {
        this.log.warn(
          `updateMission ${id} db error: ${err instanceof Error ? err.message : String(err)}`,
        );
      });
  }

  private async emit(
    type: string,
    missionId: string,
    userId: string,
    payload: Record<string, unknown>,
  ): Promise<void> {
    await this.eventBus
      .emit({
        type,
        scope: { missionId, userId },
        payload,
        timestamp: Date.now(),
      })
      .catch((err: unknown) => {
        this.log.warn(
          `emit ${type} for ${missionId} failed: ${err instanceof Error ? err.message : String(err)}`,
        );
      });
  }
}
