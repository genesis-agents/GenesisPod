import { Module } from "@nestjs/common";
import { AiCoreController } from "./ai-core.controller";
import { AiCoreService } from "./ai-core.service";
import { AiEngineModule } from "../../ai-engine/ai-engine.module";
import { PrismaModule } from "../../../common/prisma/prisma.module";
import { SecretsModule } from "../../ai-infra/secrets/secrets.module";

@Module({
  imports: [PrismaModule, AiEngineModule, SecretsModule],
  controllers: [AiCoreController],
  providers: [AiCoreService],
})
export class AiCoreModule {}
