import { Module } from "@nestjs/common";
import { PrismaModule } from "../../../common/prisma/prisma.module";
import { AiCoreModule } from "../ai-core/ai-core.module";
import { AiSimulationService } from "./ai-simulation.service";
import { AiSimulationController } from "./ai-simulation.controller";
import { AiSimulationEngineService } from "./ai-simulation.engine";
import { ExternalDataService } from "./external-data.service";
import { AIAssistService } from "./ai-assist.service";

@Module({
  imports: [PrismaModule, AiCoreModule],
  controllers: [AiSimulationController],
  providers: [
    AiSimulationService,
    AiSimulationEngineService,
    ExternalDataService,
    AIAssistService,
  ],
})
export class AiSimulationModule {}
