import { Injectable, Logger } from "@nestjs/common";
import { Prisma, SimulationRunStatus, SimulationTeam } from "@prisma/client";
import { PrismaService } from "../../common/prisma/prisma.service";
import { ExternalDataService } from "./external-data.service";

interface AdjudicationResult {
  ruling: string;
  notes?: string;
  evidenceRefs?: any[];
  worldDelta?: Record<string, any>;
  blackSwanEvent?: BlackSwanEvent;
}

// 黑天鹅事件类型 - 基于PRD事件库
interface BlackSwanEvent {
  type: string;
  name: string;
  description: string;
  impact: "high" | "medium" | "low";
  affectedTeams: string[];
  probability: number;
  triggered: boolean;
}

// 黑天鹅事件库
const BLACK_SWAN_EVENTS: Omit<BlackSwanEvent, "triggered" | "probability">[] = [
  {
    type: "supply_chain",
    name: "供应链中断",
    description: "关键供应商遭遇不可抗力，交付周期延长50%+",
    impact: "high",
    affectedTeams: ["BLUE", "RED"],
  },
  {
    type: "regulation",
    name: "监管政策突变",
    description: "新出口管制/反垄断政策出台，限制部分业务",
    impact: "high",
    affectedTeams: ["BLUE", "RED", "GREEN"],
  },
  {
    type: "competitor_move",
    name: "竞争对手突击",
    description: "主要竞争对手宣布重大价格下调或技术突破",
    impact: "medium",
    affectedTeams: ["BLUE"],
  },
  {
    type: "customer_change",
    name: "大客户变动",
    description: "关键客户大单签约或解约",
    impact: "medium",
    affectedTeams: ["BLUE", "RED"],
  },
  {
    type: "media_exposure",
    name: "媒体曝光事件",
    description: "负面新闻曝光，舆情危机爆发",
    impact: "medium",
    affectedTeams: ["BLUE", "RED"],
  },
  {
    type: "tech_breakthrough",
    name: "技术突破/失败",
    description: "关键技术研发取得突破或遭遇重大挫折",
    impact: "high",
    affectedTeams: ["BLUE", "RED"],
  },
  {
    type: "financial_shock",
    name: "金融市场冲击",
    description: "融资环境恶化、汇率剧烈波动或信贷紧缩",
    impact: "high",
    affectedTeams: ["BLUE", "RED"],
  },
  {
    type: "talent_crisis",
    name: "人才危机",
    description: "核心团队离职或招聘困难",
    impact: "medium",
    affectedTeams: ["BLUE", "RED"],
  },
  {
    type: "natural_disaster",
    name: "自然灾害/疫情",
    description: "不可抗力导致运营中断",
    impact: "high",
    affectedTeams: ["BLUE", "RED", "GREEN"],
  },
];

@Injectable()
export class SimulationEngineService {
  private readonly logger = new Logger(SimulationEngineService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly externalData: ExternalDataService,
  ) {}

  /**
   * Execute a full run synchronously for now (MVP).
   * Steps: initialize -> per-round submissions -> adjudication -> summary.
   */
  async executeRun(runId: string, options?: { resume?: boolean }) {
    const run = await this.prisma.simulationRun.findUnique({
      where: { id: runId },
      include: {
        scenario: {
          include: { companies: true, agents: true },
        },
        turns: true,
      },
    });
    if (!run) return;

    const rounds = run.rounds ?? 2;

    // Initialization: fetch external data snapshot
    const evidenceTrail: any[] = [];
    const state: Record<string, any> = {};

    const { snapshot, evidence } = await this.externalData.getSnapshot();
    evidenceTrail.push(...evidence);
    Object.assign(state, snapshot);

    // Save initial world state
    await this.prisma.simulationRun.update({
      where: { id: run.id },
      data: {
        worldState: state,
        evidenceTrail,
      },
    });

    let currentRound = options?.resume ? run.currentRound || 0 : 0;
    const humanBreakEvery =
      (run.params as any)?.humanBreakEvery !== undefined
        ? (run.params as any)?.humanBreakEvery
        : 2;

    while (currentRound < rounds) {
      currentRound += 1;
      const turn = await this.processRound(run.id, currentRound);
      this.logger.log(
        `[Simulation] Run ${run.id} finished round ${currentRound}, ruling=${(turn.adjudication as any)?.ruling}`,
      );

      if (
        humanBreakEvery &&
        currentRound % humanBreakEvery === 0 &&
        currentRound < rounds
      ) {
        await this.prisma.simulationRun.update({
          where: { id: run.id },
          data: {
            status: SimulationRunStatus.PAUSED,
            currentRound,
            summary: {
              ...(run.summary as object),
              humanBreak: `Paused at round ${currentRound} for human-in-the-loop`,
            } as Prisma.InputJsonValue,
          },
        });
        return;
      }
    }

    const debrief = await this.computeDebrief(run.id);

    await this.prisma.simulationRun.update({
      where: { id: run.id },
      data: {
        status: SimulationRunStatus.COMPLETED,
        currentRound: rounds,
        summary: debrief as Prisma.InputJsonValue,
        completedAt: new Date(),
      },
    });
  }

  private async processRound(runId: string, roundNumber: number) {
    const run = await this.prisma.simulationRun.findUnique({
      where: { id: runId },
      include: {
        scenario: {
          include: { agents: true, companies: true },
        },
      },
    });
    if (!run) {
      throw new Error(`Run ${runId} not found when processing round`);
    }

    // Collect submissions: enforce CoT (inner monologue + blind public action scaffold)
    const submissions: any[] = [];
    const worldState = (run.worldState as Record<string, any> | null) || {};
    const irrationalProb =
      (run.params as any)?.irrationalProb !== undefined
        ? (run.params as any)?.irrationalProb
        : 0.2;
    const chaosInjectedTeam =
      run.scenario.agents.some((a) => a.team === SimulationTeam.CHAOS) || false;
    for (const agent of run.scenario.agents) {
      const isChaos = agent.team === SimulationTeam.CHAOS;
      const baseVisibility =
        isChaos || agent.team === SimulationTeam.ARBITER ? "global" : "team";

      const irrationalTriggered = Math.random() < irrationalProb;
      const chaosInjected =
        chaosInjectedTeam &&
        isChaos &&
        Math.random() < ((run.params as any)?.chaosProb ?? 0.3);
      const irrationalNote = irrationalTriggered
        ? "非理性波动：情绪化/短视/误判。"
        : "";

      const monologueParts = [
        `角色: ${agent.role} (${agent.team})`,
        agent.persona ? `Persona: ${JSON.stringify(agent.persona)}` : "",
        agent.memoryPublic
          ? `公共记忆: ${JSON.stringify(agent.memoryPublic)}`
          : "",
        agent.memoryPrivate
          ? `私有记忆: ${JSON.stringify(agent.memoryPrivate)}`
          : "",
        `外部态势: market=${!!worldState.market}, finance=${!!worldState.finance}, news=${!!worldState.news}, regulation=${!!worldState.regulation}`,
        irrationalNote,
        chaosInjected ? "Chaos Agent: 模拟市场恐慌/突发随机行动" : "",
      ]
        .filter(Boolean)
        .join(" | ");

      const submission = {
        agentId: agent.id,
        companyId: agent.companyId,
        team: agent.team,
        role: agent.role,
        innerMonologue: monologueParts,
        publicAction: "盲注：行动已提交，等待裁判判定",
        visibility: baseVisibility,
        timestamp: new Date().toISOString(),
        tools: agent.tools,
        systemPrompt:
          "You represent opposing interests. Consensus is NOT the goal. Your goal is to maximize YOUR utility even at the expense of others. Act with your own team's bias and constraints.",
        irrational: irrationalTriggered,
        chaosInjected,
      };
      submissions.push(submission);
    }

    const adjudication: AdjudicationResult = await this.simpleAdjudication(
      run,
      submissions,
    );

    const evidenceRefs = adjudication.evidenceRefs || [];

    const turn = await this.prisma.simulationTurn.create({
      data: {
        runId,
        roundNumber,
        submissions: submissions as Prisma.InputJsonValue,
        adjudication: adjudication as unknown as Prisma.InputJsonValue,
        evidence: evidenceRefs as Prisma.InputJsonValue,
        worldState: adjudication.worldDelta as Prisma.InputJsonValue,
      },
    });

    const prevTrail = (run.evidenceTrail as Record<string, any> | null) || {};

    await this.prisma.simulationRun.update({
      where: { id: runId },
      data: {
        currentRound: roundNumber,
        worldState: adjudication.worldDelta as Prisma.InputJsonValue,
        evidenceTrail: {
          ...prevTrail,
          [`round_${roundNumber}`]: evidenceRefs,
        } as Prisma.InputJsonValue,
      },
    });

    return turn;
  }

  /**
   * Very lightweight adjudication that relies on external data snapshots.
   * If any provider missing data, mark ruling as "insufficient_evidence".
   */
  private async simpleAdjudication(
    run: any,
    submissions: any[],
  ): Promise<AdjudicationResult> {
    const evidenceRefs: any[] = [];
    const worldDelta: Record<string, any> = {};
    const worldState = (run.worldState as Record<string, any>) || {};
    worldDelta["publicMemory"] = worldState;

    // Basic resource sanity check: if a submission declares cost but公司现金不足则驳回
    const companyCashMap: Record<string, number> = {};
    (run.scenario.companies || []).forEach((c: any) => {
      const cash = c.metrics?.cash;
      if (typeof cash === "number") {
        companyCashMap[c.id] = cash;
      }
    });

    for (const sub of submissions) {
      const intentCost =
        (sub.intent && typeof sub.intent.cost === "number"
          ? sub.intent.cost
          : undefined) ||
        (sub.tools && typeof sub.tools?.plannedCost === "number"
          ? sub.tools.plannedCost
          : undefined);
      if (intentCost !== undefined && sub.companyId) {
        const available = companyCashMap[sub.companyId];
        if (typeof available === "number" && intentCost > available) {
          evidenceRefs.push({
            provider: "arbiter",
            status: "rejected",
            reason: "insufficient_funds",
            detail: `plannedCost=${intentCost} > cash=${available}`,
          });
          return {
            ruling: "rejected_insufficient_funds",
            notes: "裁判驳回：资金不足以支撑该行动。",
            evidenceRefs,
            worldDelta,
          };
        }
      }
    }

    const providers = ["market", "finance", "news", "regulation"];
    const missing = providers.filter(
      (p) => !worldState[p] || (worldState[p] as any)?.error,
    );

    if (missing.length > 0) {
      missing.forEach((p) => {
        evidenceRefs.push({
          provider: p,
          status: "missing",
          note: "依据不足",
        });
      });
      return {
        ruling: "insufficient_evidence",
        notes: "部分外部数据缺失，需补充后再判定。",
        evidenceRefs,
        worldDelta: worldState,
      };
    }

    // Minimal heuristic: mirror current state + submissions count
    worldDelta["last_submissions"] = submissions.length;

    // Chaos / Black Swan toggle based on params
    const chaosProb =
      (run.params as any)?.chaosProb ??
      (run.params as any)?.blackSwanProb ??
      0.1;
    const chaosTriggered = Math.random() < chaosProb;
    // 非理性因素：对部分队别施加随机偏置
    const irrationalBias = Math.random() < 0.3 ? "irrational_spike" : null;

    let blackSwanEvent: BlackSwanEvent | undefined;

    if (chaosTriggered) {
      // 从事件库中随机选择一个黑天鹅事件
      const randomIndex = Math.floor(Math.random() * BLACK_SWAN_EVENTS.length);
      const selectedEvent = BLACK_SWAN_EVENTS[randomIndex];
      blackSwanEvent = {
        ...selectedEvent,
        probability: chaosProb,
        triggered: true,
      };

      evidenceRefs.push({
        provider: "chaos",
        status: "triggered",
        event: blackSwanEvent,
        timestamp: new Date().toISOString(),
      });

      worldDelta["blackSwan"] = blackSwanEvent;
      worldDelta["blackSwanHistory"] = [
        ...((worldState["blackSwanHistory"] as any[]) || []),
        {
          ...blackSwanEvent,
          triggeredAt: new Date().toISOString(),
        },
      ];

      this.logger.warn(
        `[Black Swan] ${blackSwanEvent.name}: ${blackSwanEvent.description}`,
      );
    }

    if (irrationalBias) {
      evidenceRefs.push({
        provider: "arbiter",
        status: "irrational_bias",
        note: "Inject slight non-rational behavior to avoid echo chamber",
        timestamp: new Date().toISOString(),
      });
      worldDelta["irrationalBias"] = irrationalBias;
    }

    // 基于外部数据进行证据链记录
    const evidenceSummary: string[] = [];
    if (worldState.market) {
      evidenceSummary.push("市场数据已验证");
    }
    if (worldState.finance) {
      evidenceSummary.push("财务数据已验证");
    }
    if (worldState.news) {
      evidenceSummary.push("新闻舆情已检索");
    }
    if (worldState.regulation) {
      evidenceSummary.push("监管政策已核查");
    }

    evidenceRefs.push({
      provider: "arbiter",
      status: "ok",
      note: `裁判判定完成: ${evidenceSummary.join(", ")}`,
      timestamp: new Date().toISOString(),
    });

    // 生成裁判结论
    let ruling = "proceed";
    let notes =
      "数据齐备，所有行动可行性已验证，可继续下一回合或等待人类干预。";

    if (chaosTriggered && blackSwanEvent) {
      ruling = "black_swan";
      notes = `黑天鹅事件触发: 【${blackSwanEvent.name}】${blackSwanEvent.description}。影响级别: ${blackSwanEvent.impact}，受影响阵营: ${blackSwanEvent.affectedTeams.join("/")}。建议人类介入评估影响范围。`;
    }

    return {
      ruling,
      notes,
      evidenceRefs,
      worldDelta,
      blackSwanEvent,
    };
  }

  private async computeDebrief(runId: string) {
    const run = await this.prisma.simulationRun.findUnique({
      where: { id: runId },
      include: {
        turns: true,
        scenario: { include: { agents: true, companies: true } },
      },
    });
    if (!run) return {};

    const keyFindings: string[] = [];
    const monologueLog: any[] = [];
    const causalChain: any[] = []; // 因果链
    const biasesDetected: any[] = []; // 偏见识别
    const blindspots: any[] = []; // 盲点
    const counterfactuals: any[] = []; // 反事实推理
    const blackSwanEvents: any[] = []; // 黑天鹅事件历史

    // Missing data
    const worldState = (run.worldState as Record<string, any>) || {};
    const missing = ["market", "finance", "news", "regulation"].filter(
      (p) => !worldState[p] || (worldState[p] as any)?.error,
    );
    if (missing.length > 0) {
      keyFindings.push(`外部数据缺失：${missing.join(",")}，裁判标记依据不足`);
      blindspots.push({
        type: "data_gap",
        description: `外部数据源 [${missing.join(", ")}] 未配置或数据获取失败`,
        recommendation: "建议在Settings -> External API配置相关数据源",
      });
    }

    // Black swan history
    if (worldState["blackSwanHistory"]) {
      blackSwanEvents.push(...(worldState["blackSwanHistory"] as any[]));
    }
    if (worldState["blackSwan"]) {
      const bs = worldState["blackSwan"] as BlackSwanEvent;
      keyFindings.push(`黑天鹅触发：【${bs.name}】${bs.description}`);
    }

    // Scan turns and build analysis
    const teamActions: Record<string, any[]> = {};
    let prevWorldState: any = null;

    for (const turn of run.turns) {
      const adjudication = turn.adjudication as any;
      const currentWorldState = turn.worldState as any;

      // Track state changes for causal chain
      if (prevWorldState && currentWorldState) {
        const stateChange = this.detectStateChange(
          prevWorldState,
          currentWorldState,
        );
        if (stateChange) {
          causalChain.push({
            round: turn.roundNumber,
            cause: `回合${turn.roundNumber}各方行动`,
            effect: stateChange,
            timestamp: turn.createdAt,
          });
        }
      }
      prevWorldState = currentWorldState;

      if (adjudication?.ruling === "rejected_insufficient_funds") {
        keyFindings.push(
          `回合${turn.roundNumber} 裁判驳回：资金不足 (${adjudication?.notes || ""})`,
        );
        // 检测决策偏见：资金不足仍尝试大额投入
        biasesDetected.push({
          round: turn.roundNumber,
          type: "overconfidence",
          description: "过度自信偏见：在资金不足的情况下仍尝试大额投入",
          recommendation: "建议重新评估资源约束后制定保守策略",
        });
      }

      if (adjudication?.ruling === "insufficient_evidence") {
        keyFindings.push(`回合${turn.roundNumber} 数据不足，需补充外部证据`);
      }

      if (adjudication?.ruling === "black_swan") {
        keyFindings.push(
          `回合${turn.roundNumber} 黑天鹅事件：${adjudication?.notes || ""}`,
        );
        // 生成反事实推理
        const blackSwanEvent = adjudication.blackSwanEvent as BlackSwanEvent;
        if (blackSwanEvent) {
          counterfactuals.push({
            round: turn.roundNumber,
            scenario: `如果【${blackSwanEvent.name}】未发生`,
            potentialOutcome: `${blackSwanEvent.affectedTeams.join("/")}阵营可能按原计划推进，市场格局不会剧变`,
            probability: "假设性分析",
          });
        }
      }

      const submissions = (turn.submissions as any[]) || [];
      submissions.forEach((s) => {
        const agent = run.scenario.agents.find((a) => a.id === s.agentId);

        // Build team action history
        if (!teamActions[s.team]) teamActions[s.team] = [];
        teamActions[s.team].push({
          round: turn.roundNumber,
          role: s.role,
          action: s.publicAction,
          irrational: s.irrational,
        });

        // Detect irrational behavior
        if (s.irrational) {
          biasesDetected.push({
            round: turn.roundNumber,
            team: s.team,
            role: s.role,
            type: "irrational_spike",
            description: `${s.role}在本回合表现出非理性决策倾向（情绪化/短视/误判）`,
            recommendation: "建议在人类干预环节重点审视该角色决策",
          });
        }

        monologueLog.push({
          round: turn.roundNumber,
          team: s.team,
          role: s.role,
          agentId: s.agentId,
          companyId: s.companyId,
          innerMonologue: s.innerMonologue,
          visibility: s.visibility,
          timestamp: s.timestamp,
          agentName: agent?.role || s.role,
          irrational: s.irrational,
          chaosInjected: s.chaosInjected,
        });
      });
    }

    // Analyze team behavior patterns
    for (const [team, actions] of Object.entries(teamActions)) {
      const irrationalCount = actions.filter((a) => a.irrational).length;
      if (irrationalCount > actions.length * 0.3) {
        blindspots.push({
          type: "team_behavior",
          team,
          description: `${team}阵营在${irrationalCount}/${actions.length}回合表现出非理性决策`,
          recommendation: "建议重新审视该阵营Persona设置的风险容忍度和偏见配置",
        });
      }
    }

    // Generate counterfactual for key turning points
    const turningPoints = causalChain.filter(
      (c) => c.effect?.significance === "high",
    );
    turningPoints.forEach((tp) => {
      counterfactuals.push({
        round: tp.round,
        scenario: `如果回合${tp.round}采取不同策略`,
        potentialOutcome: "市场格局可能产生显著不同的演变路径",
        probability: "假设性分析",
      });
    });

    return {
      // 公开版报告
      publicReport: {
        keyFindings: Array.from(new Set(keyFindings)),
        causalChain: causalChain.slice(0, 5), // 公开版只展示主要因果链
        blackSwanEvents,
      },
      // 内部版报告
      internalReport: {
        keyFindings: Array.from(new Set(keyFindings)),
        causalChain,
        biasesDetected,
        blindspots,
        counterfactuals,
        blackSwanEvents,
        monologueLog,
      },
      // 原始数据
      worldState,
      teamActions,
    };
  }

  /**
   * 检测状态变化以构建因果链
   */
  private detectStateChange(
    prev: Record<string, any>,
    current: Record<string, any>,
  ): any | null {
    const changes: string[] = [];
    let significance: "high" | "medium" | "low" = "low";

    // Check for black swan
    if (!prev.blackSwan && current.blackSwan) {
      changes.push(`黑天鹅事件: ${(current.blackSwan as any).name}`);
      significance = "high";
    }

    // Check for irrational bias
    if (!prev.irrationalBias && current.irrationalBias) {
      changes.push("非理性波动注入");
      if (significance === "low") significance = "medium";
    }

    // Check submissions count change
    if (
      prev.last_submissions !== current.last_submissions &&
      current.last_submissions
    ) {
      changes.push(`提交数: ${current.last_submissions}`);
    }

    if (changes.length === 0) return null;

    return {
      changes,
      significance,
    };
  }
}
