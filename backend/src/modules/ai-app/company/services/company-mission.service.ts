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
// ★ ⑤ 真用（工具/ReAct 级）：把招进来的 playground 叶子 agent 解析回真 @DefineAgent 类，
//   用 AgentRunner 真跑（researcher 带真 web-search），而非仅注入技能文本。
import {
  resolveAgentSpec,
  STANDALONE_RUNNABLE_AGENT_IDS,
} from "@/modules/ai-app/contracts/agent-spec-catalog";

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
      // ★ 深度研究团队 → 真实类型化流水线（researcher→reconciler→analyst→writer→reviewer，
      //   上游 typed 产物串接进下游 typed 入参，全程真跑 Agent + 真工具）。
      //   非深度研究团队 → 走下方通用 chat 三阶段。
      if (this.teamRunsDeepdive(team)) {
        await this.runDeepdiveMission(missionId, userId, mission.title, team);
        return;
      }

      // ── Stage 1: planning ───────────────────────────────────────────────
      await this.emit("company.stage:lifecycle", missionId, userId, {
        stage: "planning",
        status: "started",
      });

      const planningResult = await this.runPlanning(mission.title, team);

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

  // ── 真实深度研究流水线（typed 串接）─────────────────────────────────────────

  /** 团队是否为"深度研究"阵型（含 researcher 叶子）→ 走真实流水线。 */
  private teamRunsDeepdive(team: CompanyTeamForMission | null): boolean {
    if (!team) return false;
    return team.members.some(
      (m) => m.hiredAgent?.listingId === "playground.researcher",
    );
  }

  /** 从文本里抽第一段 JSON 对象，解析失败返回 null。 */
  private safeParseJson(
    text: string,
  ): { themeSummary?: unknown; dimensions?: unknown } | null {
    try {
      const m = text.match(/\{[\s\S]*\}/);
      return m ? (JSON.parse(m[0]) as Record<string, unknown>) : null;
    } catch {
      return null;
    }
  }

  /** 规划：把 topic 拆成 2–4 个研究维度（结构化 LLM 调用，喂 researcher / reconciler）。 */
  private async planDimensions(topic: string): Promise<{
    themeSummary: string;
    dimensions: { id: string; name: string; rationale: string }[];
    tokens: number;
  }> {
    const systemPrompt = [
      "You are a research lead. Break the topic into 2-4 distinct, non-overlapping research dimensions.",
      'Respond ONLY with JSON: {"themeSummary": string, "dimensions": [{"id": string, "name": string, "rationale": string}]}.',
    ].join(" ");

    const res = await this.chatFacade.chat({
      messages: [{ role: "user", content: `Topic: ${topic}` }],
      systemPrompt,
      taskProfile: { creativity: "low", outputLength: "short" },
      modelType: AIModelType.CHAT,
      operationName: "company-deepdive-plan",
    });

    const parsed = this.safeParseJson(res.content);
    const rawDims = Array.isArray(parsed?.dimensions) ? parsed.dimensions : [];
    const dimensions = rawDims
      .filter(
        (d): d is { id?: unknown; name: string; rationale?: unknown } =>
          !!d && typeof (d as { name?: unknown }).name === "string",
      )
      .slice(0, 4)
      .map((d, i) => ({
        id: typeof d.id === "string" ? d.id : `dim-${i + 1}`,
        name: String(d.name),
        rationale: typeof d.rationale === "string" ? d.rationale : "",
      }));
    if (dimensions.length === 0) {
      dimensions.push({ id: "dim-1", name: topic, rationale: "" });
    }
    return {
      themeSummary:
        typeof parsed?.themeSummary === "string" ? parsed.themeSummary : topic,
      dimensions,
      tokens: res.tokensUsed ?? 0,
    };
  }

  /** 从 researcher findings 聚合去重的引用列表（供前端引用面板）。 */
  private extractReferences(researcherResults: unknown[]): Array<{
    source: string;
    title?: string;
    snippet?: string;
    publishedAt?: string;
    dimension?: string;
    claim?: string;
  }> {
    const seen = new Set<string>();
    const refs: Array<{
      source: string;
      title?: string;
      snippet?: string;
      publishedAt?: string;
      dimension?: string;
      claim?: string;
    }> = [];
    for (const rr of researcherResults) {
      const r = rr as {
        dimension?: string;
        findings?: Array<{
          source?: string;
          sourceTitle?: string;
          sourceSnippet?: string;
          sourcePublishedAt?: string;
          claim?: string;
        }>;
      };
      for (const f of r.findings ?? []) {
        const src = f.source;
        if (!src || seen.has(src)) continue;
        seen.add(src);
        refs.push({
          source: src,
          title: f.sourceTitle,
          snippet: f.sourceSnippet,
          publishedAt: f.sourcePublishedAt,
          dimension: r.dimension,
          claim: f.claim,
        });
      }
    }
    return refs;
  }

  /** 把 Writer 的 ResearchReportSchema 产物拼成 markdown（兜底 JSON 串）。 */
  private assembleReport(report: unknown): string {
    const r = report as {
      title?: string;
      sections?: { heading?: string; body?: string }[];
    } | null;
    if (r?.sections && Array.isArray(r.sections)) {
      const parts: string[] = [];
      if (r.title) parts.push(`# ${r.title}`);
      for (const s of r.sections) {
        if (s.heading) parts.push(`## ${s.heading}`);
        if (s.body) parts.push(s.body);
      }
      if (parts.length) return parts.join("\n\n");
    }
    return this.stringifyAgentOutput(report);
  }

  /**
   * 真实深度研究流水线：规划 → 并发研究 → 对账 → 综合 → 写作 → 评审。
   * 每个 worker 都是真 @DefineAgent 经 AgentRunner 真跑（researcher 带真 web-search），
   * 上游 typed 产物直接串接进下游 typed 入参；映射到 planning/execution/review 三个
   * 前端已知 stage 事件。reconciler / reviewer 失败可降级（不阻断 mission）。
   */
  private async runDeepdiveMission(
    missionId: string,
    userId: string,
    topic: string,
    _team: CompanyTeamForMission | null,
  ): Promise<void> {
    const Researcher = resolveAgentSpec("playground.researcher");
    const Reconciler = resolveAgentSpec("playground.reconciler");
    const Analyst = resolveAgentSpec("playground.analyst");
    const Writer = resolveAgentSpec("playground.writer");
    const Reviewer = resolveAgentSpec("playground.reviewer");
    if (!Researcher || !Analyst || !Writer) {
      throw new Error("deepdive core agents unavailable");
    }
    const language = "zh-CN" as const;
    const depth = "standard" as const;

    // ── planning: 拆维度 + 并发研究 ───────────────────────────────────────────
    await this.emit("company.stage:lifecycle", missionId, userId, {
      stage: "planning",
      status: "started",
    });
    // 逐步骤执行记录（前端任务详情的"执行步骤"表）
    const steps: Array<{
      label: string;
      role: string;
      dimension?: string;
      status: "done" | "failed" | "skipped";
      tokens: number;
      costCents: number;
    }> = [];

    const plan = await this.planDimensions(topic);
    steps.push({
      label: "拆解研究维度",
      role: "Leader",
      status: "done",
      tokens: plan.tokens,
      costCents: 0,
    });

    const researchOutcomes = await Promise.all(
      plan.dimensions.map(async (d) => {
        try {
          const r = await this.agentRunner.run(
            Researcher,
            { topic, dimension: d.name, language, withFigures: false },
            { userId },
          );
          return {
            dimension: d.name,
            output: r.output,
            ok: true,
            tokens: r.tokensUsed.total,
            costCents: r.costCents,
          };
        } catch (err: unknown) {
          this.log.warn(
            `deepdive researcher "${d.name}" failed: ${err instanceof Error ? err.message : String(err)}`,
          );
          return {
            dimension: d.name,
            output: null,
            ok: false,
            tokens: 0,
            costCents: 0,
          };
        }
      }),
    );
    for (const o of researchOutcomes) {
      steps.push({
        label: `研究：${o.dimension}`,
        role: "Researcher",
        dimension: o.dimension,
        status: o.ok ? "done" : "failed",
        tokens: o.tokens,
        costCents: o.costCents,
      });
    }
    const researcherResults = researchOutcomes
      .filter((o) => o.ok)
      .map((o) => o.output);
    if (researcherResults.length === 0) {
      throw new Error("deepdive: all researchers failed");
    }
    await this.updateMission(missionId, { progress: 40 });
    await this.emit("company.stage:lifecycle", missionId, userId, {
      stage: "planning",
      status: "completed",
    });

    // ── execution: 对账 + 综合 + 写作 ─────────────────────────────────────────
    await this.emit("company.stage:lifecycle", missionId, userId, {
      stage: "execution",
      status: "started",
    });

    let reconciliation: unknown = null;
    let recTokens = 0;
    let recCost = 0;
    if (Reconciler) {
      try {
        const r = await this.agentRunner.run(
          Reconciler,
          { topic, language, plan, researcherResults },
          { userId },
        );
        reconciliation = r.output;
        recTokens = r.tokensUsed.total;
        recCost = r.costCents;
      } catch (err: unknown) {
        this.log.warn(
          `deepdive reconciler failed (degrade): ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }
    const rec = reconciliation as {
      reconciliationReport?: string;
      factTable?: unknown[];
      overlaps?: unknown[];
      gaps?: unknown[];
    } | null;
    steps.push({
      label: "跨维事实对账",
      role: "Reconciler",
      status: reconciliation ? "done" : "skipped",
      tokens: recTokens,
      costCents: recCost,
    });

    const analystRes = await this.agentRunner.run(
      Analyst,
      {
        topic,
        language,
        researcherResults,
        reconciliationReport: {
          reconciliationReport: rec?.reconciliationReport ?? "",
          factTable: rec?.factTable ?? [],
          overlaps: rec?.overlaps ?? [],
          gaps: rec?.gaps ?? [],
        },
      },
      { userId },
    );
    const analysis = analystRes.output as {
      insights: unknown[];
      themeSummary?: string;
      contradictions?: unknown[];
    };
    steps.push({
      label: "综合洞察",
      role: "Analyst",
      status: "done",
      tokens: analystRes.tokensUsed.total,
      costCents: analystRes.costCents,
    });

    const writerRes = await this.agentRunner.run(
      Writer,
      {
        topic,
        depth,
        language,
        insights: analysis.insights,
        themeSummary: analysis.themeSummary ?? plan.themeSummary,
        ...(analysis.contradictions
          ? { contradictions: analysis.contradictions }
          : {}),
      },
      { userId },
    );
    const report = writerRes.output;
    steps.push({
      label: "撰写研究报告",
      role: "Writer",
      status: "done",
      tokens: writerRes.tokensUsed.total,
      costCents: writerRes.costCents,
    });
    await this.updateMission(missionId, { progress: 80 });
    await this.emit("company.stage:lifecycle", missionId, userId, {
      stage: "execution",
      status: "completed",
    });

    // ── review ────────────────────────────────────────────────────────────────
    await this.emit("company.stage:lifecycle", missionId, userId, {
      stage: "review",
      status: "started",
    });
    let review: unknown = null;
    let revTokens = 0;
    let revCost = 0;
    if (Reviewer) {
      try {
        const r = await this.agentRunner.run(
          Reviewer,
          { topic, language, draftReport: report },
          { userId },
        );
        review = r.output;
        revTokens = r.tokensUsed.total;
        revCost = r.costCents;
      } catch (err: unknown) {
        this.log.warn(
          `deepdive reviewer failed (degrade): ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }
    steps.push({
      label: "质量评审",
      role: "Reviewer",
      status: review ? "done" : "skipped",
      tokens: revTokens,
      costCents: revCost,
    });

    // agent 产物是 Zod 校验过的 JSON；JSON-clone 成 Prisma 可存的 JsonValue
    const toJson = (v: unknown): Prisma.InputJsonValue =>
      JSON.parse(JSON.stringify(v ?? null)) as Prisma.InputJsonValue;
    await this.updateMission(missionId, {
      status: "done",
      progress: 100,
      result: {
        summary: this.assembleReport(report),
        report: toJson(report),
        review: toJson(review),
        // Tier 2 展示数据：引用（来自 researcher findings）+ 事实表 + 对账小结（来自 reconciler）
        references: toJson(this.extractReferences(researcherResults)),
        factTable: toJson(rec?.factTable ?? []),
        reconciliationReport: rec?.reconciliationReport ?? "",
        // 逐步骤执行表（前端任务详情）
        steps: toJson(steps),
        // 算力消耗汇总（token / 估算成本，来自各 Agent RunResult）
        usage: {
          totalTokens: steps.reduce((s, st) => s + st.tokens, 0),
          totalCostCents: steps.reduce((s, st) => s + st.costCents, 0),
        },
        themeSummary: analysis.themeSummary ?? plan.themeSummary,
        dimensions: plan.dimensions.map((d) => d.name),
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
    this.log.log(`CompanyMission ${missionId} completed (real deepdive)`);
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
