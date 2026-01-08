import { Module } from "@nestjs/common";
import { AdminController } from "./admin.controller";
import { AdminService } from "./admin.service";
import {
  AITeamsAdminController,
  AITeamsTemplatesController,
} from "./ai-teams-admin.controller";
import { AITeamsAdminService } from "./ai-teams-admin.service";
import { PrismaModule } from "../../../common/prisma/prisma.module";

@Module({
  imports: [PrismaModule],
  controllers: [
    AdminController,
    AITeamsAdminController,
    AITeamsTemplatesController,
  ],
  providers: [AdminService, AITeamsAdminService],
  exports: [AdminService, AITeamsAdminService],
})
export class AdminModule {}
