import { Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../../common/prisma/prisma.service";
import { SimulationRunStatus, SimulationTeam } from "@prisma/client";
import { SimulationEngineService } from "./simulation.engine";

export interface CreateScenarioInput {
  name: string;
  industry: string;
  region?: string;
  goals?: any;
  constraints?: any;
  dataSources?: any;
  createdById?: string;
  companies?: Array<{
    name: string;
    type?: string;
    market?: string;
    metrics?: any;
    publicData?: any;
    privateData?: any;
  }>;
  agents?: Array<{
    companyName?: string;
    team: SimulationTeam;
    role: string;
    persona?: any;
    memoryPublic?: any;
    memoryPrivate?: any;
    tools?: any;
  }>;
}

export interface StartRunInput {
  scenarioId: string;
  rounds?: number;
  params?: any;
  startedById?: string;
}

@Injectable()
export class SimulationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly engine: SimulationEngineService,
  ) {}

  async createScenario(input: CreateScenarioInput) {
    const companies = input.companies || [];
    const agents = input.agents || [];

    const scenario = await this.prisma.simulationScenario.create({
      data: {
        name: input.name,
        industry: input.industry,
        region: input.region,
        goals: input.goals,
        constraints: input.constraints,
        dataSources: input.dataSources,
        createdById: input.createdById,
        companies: {
          create: companies.map((c) => ({
            name: c.name,
            type: c.type,
            market: c.market,
            metrics: c.metrics,
            publicData: c.publicData,
            privateData: c.privateData,
          })),
        },
      },
      include: {
        companies: true,
      },
    });

    // attach agents after companies created (resolve companyId by name if provided)
    if (agents.length > 0) {
      const companyMap = new Map(
        scenario.companies.map((c) => [c.name.toLowerCase(), c.id]),
      );
      await this.prisma.simulationAgent.createMany({
        data: agents.map((a) => ({
          scenarioId: scenario.id,
          companyId: a.companyName
            ? companyMap.get(a.companyName.toLowerCase()) || null
            : null,
          team: a.team,
          role: a.role,
          persona: a.persona,
          memoryPublic: a.memoryPublic,
          memoryPrivate: a.memoryPrivate,
          tools: a.tools,
        })),
      });
    }

    return this.getScenarioById(scenario.id);
  }

  async getScenarioById(id: string) {
    const scenario = await this.prisma.simulationScenario.findUnique({
      where: { id },
      include: {
        companies: true,
        agents: true,
      },
    });
    if (!scenario) {
      throw new NotFoundException(`Scenario ${id} not found`);
    }
    return scenario;
  }

  async deleteScenario(id: string) {
    const scenario = await this.prisma.simulationScenario.findUnique({
      where: { id },
    });
    if (!scenario) {
      throw new NotFoundException(`Scenario ${id} not found`);
    }

    // Delete related records first (cascading delete)
    await this.prisma.simulationAgent.deleteMany({
      where: { scenarioId: id },
    });
    await this.prisma.simulationCompany.deleteMany({
      where: { scenarioId: id },
    });

    // Delete the scenario
    await this.prisma.simulationScenario.delete({
      where: { id },
    });

    return { success: true, message: "Scenario deleted successfully" };
  }

  async listScenarios() {
    return this.prisma.simulationScenario.findMany({
      orderBy: { updatedAt: "desc" },
      include: {
        companies: true,
        agents: true,
        runs: {
          orderBy: { createdAt: "desc" },
          take: 1,
        },
      },
    });
  }

  async startRun(input: StartRunInput) {
    const scenario = await this.getScenarioById(input.scenarioId);
    const run = await this.prisma.simulationRun.create({
      data: {
        scenarioId: scenario.id,
        status: SimulationRunStatus.RUNNING,
        params: input.params,
        rounds: input.rounds ?? 2,
        startedById: input.startedById,
      },
    });

    // run loop (synchronous for now)
    await this.engine.executeRun(run.id);
    return this.getRunById(run.id);
  }

  async resumeRun(runId: string) {
    const run = await this.getRunById(runId);
    if (run.status !== SimulationRunStatus.PAUSED) {
      return run;
    }
    await this.prisma.simulationRun.update({
      where: { id: runId },
      data: { status: SimulationRunStatus.RUNNING },
    });
    await this.engine.executeRun(runId, { resume: true });
    return this.getRunById(runId);
  }

  async pauseRun(runId: string) {
    const run = await this.getRunById(runId);
    if (run.status !== SimulationRunStatus.RUNNING) {
      return run;
    }
    await this.prisma.simulationRun.update({
      where: { id: runId },
      data: { status: SimulationRunStatus.PAUSED },
    });
    return this.getRunById(runId);
  }

  async interveneRun(
    runId: string,
    intervention: { message: string; injectEvent?: any },
  ) {
    const run = await this.getRunById(runId);
    // Store intervention in run params or create a turn record
    const updatedParams = {
      ...(run.params as any),
      interventions: [
        ...((run.params as any)?.interventions || []),
        {
          timestamp: new Date().toISOString(),
          message: intervention.message,
          injectEvent: intervention.injectEvent,
        },
      ],
    };
    await this.prisma.simulationRun.update({
      where: { id: runId },
      data: { params: updatedParams },
    });
    return this.getRunById(runId);
  }

  async getRunById(id: string) {
    const run = await this.prisma.simulationRun.findUnique({
      where: { id },
      include: {
        scenario: {
          include: { companies: true, agents: true },
        },
        turns: true,
      },
    });
    if (!run) {
      throw new NotFoundException(`Run ${id} not found`);
    }
    return run;
  }
}
