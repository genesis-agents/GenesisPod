/**
 * BYOK Admin API Module (open-api/byok-admin)
 *
 * PR-X17: 4 个 admin Controllers 从 ai-infra/credentials/* 上提到这里。
 * HTTP admin Controller 应在 L4 open-api 层，不在 L2 ai-engine。
 *
 * 路由：/admin/{distributable-keys,key-assignments,key-requests,byok-dashboard}/*
 */

import { Module } from "@nestjs/common";
import { DistributableKeysController } from "./distributable-keys.controller";
import { AdminKeyAssignmentsController } from "./admin-key-assignments.controller";
import { AdminKeyRequestsController } from "./admin-key-requests.controller";
import { AdminByokDashboardController } from "./admin-byok-dashboard.controller";
import { DistributableKeysModule } from "../../ai-infra/credentials/distributable-keys";
import { KeyAssignmentsModule } from "../../ai-infra/credentials/key-assignments";
import { KeyRequestsModule } from "../../ai-infra/credentials/key-requests";
import { KeyResolverModule } from "../../ai-infra/credentials/key-resolver";

@Module({
  imports: [
    DistributableKeysModule,
    KeyAssignmentsModule,
    KeyRequestsModule,
    KeyResolverModule,
  ],
  controllers: [
    DistributableKeysController,
    AdminKeyAssignmentsController,
    AdminKeyRequestsController,
    AdminByokDashboardController,
  ],
})
export class ByokAdminModule {}
