import { Injectable, Logger } from "@nestjs/common";
import { Prisma, SimulationRunStatus, SimulationTeam } from "@prisma/client";
import { PrismaService } from "../../common/prisma/prisma.service";
import { ExternalDataService } from "./external-data.service";

interface AdjudicationResult {
  ruling: string;
  notes?: string;
  evidenceRefs?: any[];
  worldDelta?: Record<string, any>;
}

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
  async executeRun(runId: string) {
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

    let currentRound = 0;
    while (currentRound < rounds) {
      currentRound += 1;
      const turn = await this.processRound(run.id, currentRound);
      this.logger.log(
        `[Simulation] Run ${run.id} finished round ${currentRound}, ruling=${(turn.adjudication as any)?.ruling}`,
      );
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
    if (chaosTriggered) {
      const event = {
        type: "black_swan",
        description: "随机黑天鹅触发：供应链/监管/价格战等干扰",
        probability: chaosProb,
      };
      evidenceRefs.push({
        provider: "chaos",
        status: "triggered",
        event,
      });
      worldDelta["blackSwan"] = event;
    }
    if (irrationalBias) {
      evidenceRefs.push({
        provider: "arbiter",
        status: "irrational_bias",
        note: "Inject slight non-rational behavior to avoid echo chamber",
      });
      worldDelta["irrationalBias"] = irrationalBias;
    }

    evidenceRefs.push({
      provider: "compiled",
      status: "ok",
      note: "使用已配置的真实数据进行最小判定",
    });

    return {
      ruling: chaosTriggered ? "black_swan" : "proceed",
      notes: chaosTriggered
        ? "黑天鹅随机事件已触发，需人类/裁判评估影响。"
        : "数据齐备，可继续下一回合或人类干预。",
      evidenceRefs,
      worldDelta,
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

    // Missing data
    const worldState = (run.worldState as Record<string, any>) || {};
    const missing = ["market", "finance", "news", "regulation"].filter(
      (p) => !worldState[p] || (worldState[p] as any)?.error,
    );
    if (missing.length > 0) {
      keyFindings.push(`外部数据缺失：${missing.join(",")}，裁判标记依据不足`);
    }

    // Black swan
    if (worldState["blackSwan"]) {
      keyFindings.push(
        `黑天鹅触发：${JSON.stringify(worldState["blackSwan"])}`,
      );
    }

    // Scan turns
    for (const turn of run.turns) {
      const adjudication = turn.adjudication as any;
      if (adjudication?.ruling === "rejected_insufficient_funds") {
        keyFindings.push(
          `回合${turn.roundNumber} 裁判驳回：资金不足 (${adjudication?.notes || ""})`,
        );
      }
      if (adjudication?.ruling === "insufficient_evidence") {
        keyFindings.push(`回合${turn.roundNumber} 数据不足，需补充外部证据`);
      }
      if (adjudication?.ruling === "black_swan") {
        keyFindings.push(
          `回合${turn.roundNumber} 黑天鹅事件：${adjudication?.notes || ""}`,
        );
      }

      const submissions = (turn.submissions as any[]) || [];
      submissions.forEach((s) => {
        const agent = run.scenario.agents.find((a) => a.id === s.agentId);
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
        });
      });
    }

    return {
      keyFindings: Array.from(new Set(keyFindings)), // 去重
      monologueLog,
      worldState,
    };
  }
}
