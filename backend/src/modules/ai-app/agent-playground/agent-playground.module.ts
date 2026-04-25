/**
 * AgentPlaygroundModule
 *
 * Demo 模块 —— 展示 Harness 全栈能力（loop / verify / handoff / memory / cost）。
 * 所有依赖来自既有真实系统（Harness facade + ai-infra/credits + RuntimeEnvironmentService）。
 */

import { Module } from "@nestjs/common";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { JwtModule } from "@nestjs/jwt";
import { AgentPlaygroundController } from "./agent-playground.controller";
import { AgentPlaygroundGateway } from "./agent-playground.gateway";
import { ResearchTeamOrchestrator } from "./services/research-team.orchestrator";
import { MissionOwnershipRegistry } from "./services/mission-ownership.registry";
import { CreditsModule } from "../../ai-infra/credits/credits.module";

@Module({
  imports: [
    CreditsModule,
    // 必修 #4: Gateway 用 JwtService 解析 socket auth.token 做 ownership 鉴权
    JwtModule.registerAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService) => ({
        secret: configService.get<string>("JWT_SECRET"),
        signOptions: { expiresIn: "7d" },
      }),
      inject: [ConfigService],
    }),
    // HarnessModule / RuntimeEnvironmentService 是 @Global，自动可注入
  ],
  controllers: [AgentPlaygroundController],
  providers: [
    AgentPlaygroundGateway,
    ResearchTeamOrchestrator,
    MissionOwnershipRegistry,
  ],
})
export class AgentPlaygroundModule {}
