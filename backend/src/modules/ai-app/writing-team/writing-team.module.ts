/**
 * WritingTeamModule —— v5.1 §4 R3-A demo
 *
 * 不挂入 AppModule（demo 模块；生产环境通过 import 引入需要时启用）。
 */
import { Module } from "@nestjs/common";
import {
  MissionPipelineOrchestrator,
  MissionPipelineRegistry,
} from "@/modules/ai-harness/facade";
import { WritingTeamService } from "./writing-team.service";
import { WritingTeamController } from "./writing-team.controller";

@Module({
  controllers: [WritingTeamController],
  providers: [
    WritingTeamService,
    MissionPipelineRegistry,
    MissionPipelineOrchestrator,
  ],
  exports: [WritingTeamService],
})
export class WritingTeamModule {}
