import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { AiCodingController } from "./ai-coding.controller";
import { AiCodingService } from "./ai-coding.service";
import { PrismaModule } from "../../../common/prisma/prisma.module";
import { AiCoreModule } from "../ai-core/ai-core.module";
import {
  StandardsService,
  ComplianceService,
  GithubOAuthService,
  GithubRepoService,
  DocumentService,
} from "./services";

@Module({
  imports: [PrismaModule, AiCoreModule, ConfigModule],
  controllers: [AiCodingController],
  providers: [
    AiCodingService,
    StandardsService,
    ComplianceService,
    GithubOAuthService,
    GithubRepoService,
    DocumentService,
  ],
  exports: [
    AiCodingService,
    StandardsService,
    ComplianceService,
    GithubOAuthService,
    GithubRepoService,
    DocumentService,
  ],
})
export class AiCodingModule {}
