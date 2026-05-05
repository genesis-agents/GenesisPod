/**
 * E R4 Phase 2 (PR-E1, 2026-05-05): 用户自定义 Agent module
 */
import { Module } from "@nestjs/common";
import { PrismaModule } from "@/common/prisma/prisma.module";
import { CustomAgentsController } from "./custom-agents.controller";
import { CustomAgentsService } from "./custom-agents.service";

@Module({
  imports: [PrismaModule],
  controllers: [CustomAgentsController],
  providers: [CustomAgentsService],
  exports: [CustomAgentsService],
})
export class CustomAgentsModule {}
