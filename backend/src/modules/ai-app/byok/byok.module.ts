/**
 * BYOK Module (Bring Your Own Key) — User-facing credential management
 *
 * User-facing controllers for personal API key management and model configuration.
 * Services remain in ai-engine/credentials (credential infrastructure).
 *
 * Controllers migrated from ai-engine/credentials/* (PR-X17, 5 个 user 控制器)
 * + ai-engine/llm/user-models.controller.ts (PR-X17, 模型发现/自动配置)。
 *
 * Routes:
 *   GET   /user/api-keys/*                          — 用户 BYOK Key 管理
 *   GET   /user/key-assignments/*                   — 分配查看
 *   POST  /user/key-requests/*                      — 申请共享 Key
 *   GET   /user/byok                                — BYOK 状态查询
 *   GET   /user/model-configs/*                     — 模型配置 CRUD
 *   POST  /user/api-keys/:provider/available-models — dynamic model discovery
 *   POST  /user/model-configs/auto-configure        — one-click AI setup
 */

import { Module } from "@nestjs/common";
import {
  UserModelsController,
  UserModelConfigsAutoController,
} from "./user-models.controller";
import { UserKeyAssignmentsController } from "./key-assignments.controller";
import { UserKeyRequestsController } from "./key-requests.controller";
import { UserByokController } from "./user-byok.controller";
import { UserApiKeysController } from "./user-api-keys.controller";
import { UserModelConfigsController } from "./user-model-configs.controller";
import { AiEngineLLMModule } from "../../ai-engine/ai-engine-llm.module";
import { UserApiKeysModule } from "../../ai-engine/credentials/user-api-keys/user-api-keys.module";
import { UserModelConfigsModule } from "../../ai-engine/credentials/user-model-configs/user-model-configs.module";
import { KeyAssignmentsModule } from "../../ai-engine/credentials/key-assignments";
import { KeyRequestsModule } from "../../ai-engine/credentials/key-requests";
import { KeyResolverModule } from "../../ai-engine/credentials/key-resolver";

@Module({
  imports: [
    AiEngineLLMModule,
    UserApiKeysModule,
    UserModelConfigsModule,
    KeyAssignmentsModule,
    KeyRequestsModule,
    KeyResolverModule,
  ],
  controllers: [
    UserModelsController,
    UserModelConfigsAutoController,
    UserKeyAssignmentsController,
    UserKeyRequestsController,
    UserByokController,
    UserApiKeysController,
    UserModelConfigsController,
  ],
})
export class ByokModule {}
