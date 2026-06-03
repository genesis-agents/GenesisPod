/**
 * Teams API Module (open-api/teams)
 *
 * PR-X16: TeamsController 从 ai-harness/teams/controllers/ 上提到这里。
 * HTTP Controller 应在 L4 open-api 层，不在 L2 ai-harness。
 *
 * 路由：/api/ai/teams/*
 */

import { Module } from "@nestjs/common";
import { TeamsController } from "./teams.controller";

@Module({
  controllers: [TeamsController],
})
export class TeamsApiModule {}
