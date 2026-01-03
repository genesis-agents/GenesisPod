import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { AiCodingController } from "./ai-coding.controller";
import { AiCodingService } from "./ai-coding.service";
import { AiCodingGateway } from "./ai-coding.gateway";
import { PrismaModule } from "../../../common/prisma/prisma.module";
import { AiEngineModule } from "../../ai-engine";
import {
  StandardsService,
  ComplianceService,
  GithubOAuthService,
  GithubRepoService,
  DocumentService,
  ProjectEventEmitterService,
  CodingTaskService,
  // 新增：团队协作服务
  CodingTeamService,
  CodingMissionService,
  CodingAgentService,
} from "./services";

@Module({
  imports: [PrismaModule, AiEngineModule, ConfigModule],
  controllers: [AiCodingController],
  providers: [
    AiCodingService,
    AiCodingGateway,
    StandardsService,
    ComplianceService,
    GithubOAuthService,
    GithubRepoService,
    DocumentService,
    ProjectEventEmitterService,
    CodingTaskService,
    // 新增：团队协作服务
    CodingTeamService,
    CodingMissionService,
    CodingAgentService,
  ],
  exports: [
    AiCodingService,
    StandardsService,
    ComplianceService,
    GithubOAuthService,
    GithubRepoService,
    DocumentService,
    ProjectEventEmitterService,
    CodingTaskService,
    // 新增：团队协作服务
    CodingTeamService,
    CodingMissionService,
    CodingAgentService,
  ],
})
export class AiCodingModule {}
