import { Module } from "@nestjs/common";
import { ConsciousnessController } from "./consciousness.controller";
import { ConsciousnessService } from "./consciousness.service";
import { ConsciousnessRepository } from "./consciousness.repository";
import { PrismaModule } from "../../../common/prisma/prisma.module";
import { AiEngineModule } from "../../ai-engine/ai-engine.module";
import { CreditsModule } from "../../ai-infra/credits/credits.module";

@Module({
  imports: [PrismaModule, AiEngineModule, CreditsModule],
  controllers: [ConsciousnessController],
  providers: [ConsciousnessService, ConsciousnessRepository],
  exports: [ConsciousnessService],
})
export class ConsciousnessModule {}
