import { Module } from "@nestjs/common";
import { PrismaModule } from "../../../common/prisma/prisma.module";
import { AiEngineModule } from "../../ai-engine";
import { AiSimulationService } from "./ai-simulation.service";
import { AiSimulationController } from "./ai-simulation.controller";
import { AiSimulationEngineService } from "./ai-simulation.engine";
import { ExternalDataService } from "./external-data.service";
import { AIAssistService } from "./ai-assist.service";

@Module({
  imports: [PrismaModule, AiEngineModule],
  controllers: [AiSimulationController],
  providers: [
    AiSimulationService,
    AiSimulationEngineService,
    ExternalDataService,
    AIAssistService,
  ],
  exports: [
    AiSimulationService,
    AiSimulationEngineService,
    ExternalDataService,
    AIAssistService,
  ],
})
export class AiSimulationModule {}
