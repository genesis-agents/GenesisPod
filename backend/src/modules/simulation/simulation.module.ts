import { Module } from "@nestjs/common";
import { PrismaModule } from "../../common/prisma/prisma.module";
import { AiModule } from "../ai/ai.module";
import { SimulationService } from "./simulation.service";
import { SimulationController } from "./simulation.controller";
import { SimulationEngineService } from "./simulation.engine";
import { ExternalDataService } from "./external-data.service";

@Module({
  imports: [PrismaModule, AiModule],
  controllers: [SimulationController],
  providers: [SimulationService, SimulationEngineService, ExternalDataService],
})
export class SimulationModule {}
