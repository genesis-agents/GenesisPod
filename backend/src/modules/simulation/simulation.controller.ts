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
import { ExternalDataService } from "./external-data.service";
import { AIAssistService } from "./ai-assist.service";

@Controller("simulation")
@UseGuards(JwtAuthGuard, AdminGuard)
export class SimulationController {
  constructor(
    private readonly simulationService: SimulationService,
    private readonly externalData: ExternalDataService,
    private readonly aiAssist: AIAssistService,
  ) {}

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

  @Get("scenarios")
  async listScenarios() {
    return this.simulationService.listScenarios();
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

  @Patch("runs/:id/pause")
  async pauseRun(@Param("id") id: string) {
    return this.simulationService.pauseRun(id);
  }

  @Post("runs/:id/intervene")
  async interveneRun(
    @Param("id") id: string,
    @Body() body: { message: string; injectEvent?: any },
  ) {
    return this.simulationService.interveneRun(id, body);
  }

  @Get("external/snapshot")
  async getExternalSnapshot(): Promise<any> {
    return this.externalData.getSnapshot();
  }

  // ========== AI Assist APIs ==========

  /**
   * AI辅助分析行业竞争格局，推荐公司和角色配置
   */
  @Post("ai-assist/analyze")
  async analyzeIndustry(
    @Body()
    body: {
      industry: string;
      region?: string;
      existingCompanies?: string[];
    },
  ): Promise<any> {
    return this.aiAssist.analyzeIndustry(body);
  }

  /**
   * AI辅助推荐角色配置
   */
  @Post("ai-assist/suggest-agents")
  async suggestAgents(
    @Body()
    body: {
      industry: string;
      companies: Array<{ name: string; type: string }>;
      existingAgents?: Array<{ role: string; team: string }>;
    },
  ): Promise<any> {
    return this.aiAssist.suggestAgents(body);
  }

  /**
   * AI辅助生成推演场景建议
   */
  @Post("ai-assist/suggest-scenario")
  async suggestScenario(
    @Body()
    body: {
      industry: string;
      region?: string;
      goals?: string;
    },
  ): Promise<any> {
    return this.aiAssist.generateScenarioSuggestions(body);
  }
}
