import { Injectable, Logger, NotFoundException } from "@nestjs/common";
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
  private readonly logger = new Logger(SimulationService.name);

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

  async updateScenario(id: string, input: Partial<CreateScenarioInput>) {
    const existing = await this.prisma.simulationScenario.findUnique({
      where: { id },
      include: { companies: true, agents: true },
    });
    if (!existing) {
      throw new NotFoundException(`Scenario ${id} not found`);
    }

    // Update basic scenario fields
    await this.prisma.simulationScenario.update({
      where: { id },
      data: {
        name: input.name ?? existing.name,
        industry: input.industry ?? existing.industry,
        region: input.region ?? existing.region,
        goals: input.goals ?? existing.goals,
        constraints: input.constraints ?? existing.constraints,
        dataSources: input.dataSources ?? existing.dataSources,
      },
    });

    // If companies are provided, replace them all
    if (input.companies) {
      // Delete existing companies first
      await this.prisma.simulationCompany.deleteMany({
        where: { scenarioId: id },
      });
      // Create new companies
      if (input.companies.length > 0) {
        await this.prisma.simulationCompany.createMany({
          data: input.companies.map((c) => ({
            scenarioId: id,
            name: c.name,
            type: c.type,
            market: c.market,
            metrics: c.metrics,
            publicData: c.publicData,
            privateData: c.privateData,
          })),
        });
      }
    }

    // If agents are provided, replace them all
    if (input.agents) {
      // First delete existing agents
      await this.prisma.simulationAgent.deleteMany({
        where: { scenarioId: id },
      });

      // Get updated companies to map names to IDs
      const updatedCompanies = await this.prisma.simulationCompany.findMany({
        where: { scenarioId: id },
      });
      const companyMap = new Map(
        updatedCompanies.map((c) => [c.name.toLowerCase(), c.id]),
      );

      // Create new agents
      if (input.agents.length > 0) {
        await this.prisma.simulationAgent.createMany({
          data: input.agents.map((a) => ({
            scenarioId: id,
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
    }

    return this.getScenarioById(id);
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

    // 立即返回run ID，后台异步执行推演
    // 前端通过轮询 /runs/:id 获取进度更新
    // 不使用 await，让推演在后台运行
    this.engine.executeRun(run.id).catch((err) => {
      this.logger.error(`[Simulation] Run ${run.id} failed: ${err.message}`);
      // 更新状态为失败
      this.prisma.simulationRun
        .update({
          where: { id: run.id },
          data: { status: SimulationRunStatus.FAILED },
        })
        .catch(() => {});
    });

    // 立即返回，让前端可以导航到run页面
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

    // 后台异步执行推演，不阻塞
    this.engine.executeRun(runId, { resume: true }).catch((err) => {
      this.logger.error(
        `[Simulation] Run ${runId} resume failed: ${err.message}`,
      );
      this.prisma.simulationRun
        .update({
          where: { id: runId },
          data: { status: SimulationRunStatus.FAILED },
        })
        .catch(() => {});
    });

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

    const interventionRecord = {
      timestamp: new Date().toISOString(),
      message: intervention.message,
      injectEvent: intervention.injectEvent,
      round: run.currentRound,
    };

    // Store intervention in run params
    const updatedParams = {
      ...(run.params as any),
      interventions: [
        ...((run.params as any)?.interventions || []),
        interventionRecord,
      ],
    };

    // Also store in worldState for frontend display
    const updatedWorldState = {
      ...(run.worldState as any),
      interventions: [
        ...((run.worldState as any)?.interventions || []),
        interventionRecord,
      ],
      lastIntervention: interventionRecord,
    };

    await this.prisma.simulationRun.update({
      where: { id: runId },
      data: {
        params: updatedParams,
        worldState: updatedWorldState,
      },
    });

    this.logger.log(
      `[Simulation] Run ${runId} received intervention at round ${run.currentRound}: ${intervention.message.substring(0, 50)}...`,
    );

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
