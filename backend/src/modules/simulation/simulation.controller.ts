import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  UseGuards,
  Patch,
} from "@nestjs/common";
import { JwtAuthGuard } from "../../common/guards/jwt-auth.guard";
import { AdminGuard } from "../../common/guards/admin.guard";
import { SimulationService } from "./simulation.service";
import { SimulationTeam } from "@prisma/client";

@Controller("simulation")
@UseGuards(JwtAuthGuard, AdminGuard)
export class SimulationController {
  constructor(private readonly simulationService: SimulationService) {}

  @Post("scenarios")
  async createScenario(
    @Body()
    body: {
      name: string;
      industry: string;
      region?: string;
      goals?: any;
      constraints?: any;
      dataSources?: any;
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
    },
  ) {
    return this.simulationService.createScenario(body);
  }

  @Get("scenarios/:id")
  async getScenario(@Param("id") id: string) {
    return this.simulationService.getScenarioById(id);
  }

  @Post("runs")
  async startRun(
    @Body()
    body: {
      scenarioId: string;
      rounds?: number;
      params?: any;
    },
  ) {
    return this.simulationService.startRun({
      scenarioId: body.scenarioId,
      rounds: body.rounds,
      params: body.params,
    });
  }

  @Get("runs/:id")
  async getRun(@Param("id") id: string) {
    return this.simulationService.getRunById(id);
  }

  @Patch("runs/:id/resume")
  async resumeRun(@Param("id") id: string) {
    return this.simulationService.resumeRun(id);
  }
}
