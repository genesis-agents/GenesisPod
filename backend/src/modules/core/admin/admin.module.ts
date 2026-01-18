import { Module } from "@nestjs/common";
import { AdminController } from "./admin.controller";
import { AdminService } from "./admin.service";
import {
  AITeamsAdminController,
  AITeamsTemplatesController,
} from "./ai-teams-admin.controller";
import { AITeamsAdminService } from "./ai-teams-admin.service";
import { CapabilitiesAdminController } from "./capabilities-admin.controller";
import { CapabilitiesAdminService } from "./capabilities-admin.service";
import { PrismaModule } from "../../../common/prisma/prisma.module";
import { AiEngineModule } from "../../ai-engine/ai-engine.module";
import { SecretsModule } from "../secrets/secrets.module";

@Module({
  imports: [PrismaModule, AiEngineModule, SecretsModule],
  controllers: [
    AdminController,
    AITeamsAdminController,
    AITeamsTemplatesController,
    CapabilitiesAdminController,
  ],
  providers: [AdminService, AITeamsAdminService, CapabilitiesAdminService],
  exports: [AdminService, AITeamsAdminService, CapabilitiesAdminService],
})
export class AdminModule {}
