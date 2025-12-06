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

    const externalFetches = await Promise.all([
      this.externalData.fetchFromProvider("market", "pricing"),
      this.externalData.fetchFromProvider("finance", "filings"),
      this.externalData.fetchFromProvider("news", "latest"),
      this.externalData.fetchFromProvider("regulation", "policies"),
    ]);

    externalFetches.forEach((res) => {
      evidenceTrail.push({
        provider: res.providerId,
        endpoint: res.endpoint,
        ok: res.ok,
        error: res.error,
        timestamp: new Date().toISOString(),
      });
      state[res.providerId] = res.ok ? res.data : { error: res.error };
    });

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

    await this.prisma.simulationRun.update({
      where: { id: run.id },
      data: {
        status: SimulationRunStatus.COMPLETED,
        currentRound: rounds,
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

    // Collect submissions: for MVP, auto-generate minimal CoT + action prompt using real state/evidence
    const submissions: any[] = run.scenario.agents.map((agent) => {
      const baseVisibility =
        agent.team === SimulationTeam.CHAOS ||
        agent.team === SimulationTeam.ARBITER
          ? "global"
          : "team";
      return {
        agentId: agent.id,
        team: agent.team,
        role: agent.role,
        innerMonologue: `Analyzing round ${roundNumber} with current world state references. (${baseVisibility} view)`,
        publicAction: "Awaiting human/LLM action input in next iteration.",
        visibility: baseVisibility,
        timestamp: new Date().toISOString(),
      };
    });

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
    evidenceRefs.push({
      provider: "compiled",
      status: "ok",
      note: "使用已配置的真实数据进行最小判定",
    });

    return {
      ruling: "proceed",
      notes: "数据齐备，可继续下一回合或人类干预。",
      evidenceRefs,
      worldDelta,
    };
  }
}
