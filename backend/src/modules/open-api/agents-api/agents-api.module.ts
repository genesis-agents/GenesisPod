import { Module } from "@nestjs/common";
import { AgentsController } from "./agents.controller";
import { AgentsService } from "./agents.service";
import { AiEngineModule } from "../../ai-engine/ai-engine.module";
import { PrismaModule } from "../../../common/prisma/prisma.module";

@Module({
  imports: [PrismaModule, AiEngineModule],
  controllers: [AgentsController],
  providers: [AgentsService],
  exports: [AgentsService],
})
export class AgentsApiModule {}
