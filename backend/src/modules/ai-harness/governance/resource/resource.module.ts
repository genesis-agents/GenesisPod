/**
 * Runtime Resource Module
 *
 * 提供 AI Engine runtime 层的资源管理与约束能力：
 * - ResourceManagerService: 资源配额管理
 * - CircuitBreakerService: 断路器
 * - ConstraintEngine / ConstraintEnforcementService: 三轴约束评估 & 强制
 * - CostController: 成本控制
 * - RateLimiter: 速率限制
 * - TokenBudgetService: Token 预算
 *
 * HealthCheckRunner 是纯类（非 @Injectable），消费者 `new HealthCheckRunner({...})`
 * 自己持有。不要把它放进 providers——Nest 会尝试注入 undefined 导致启动崩溃。
 * 需要使用时从 `@/modules/ai-engine/facade` 导入该 class 即可。
 *
 * 本模块是 @Global()。
 */

import { forwardRef, Global, Module } from "@nestjs/common";
import { PrismaModule } from "../../../../common/prisma/prisma.module";
import { AiEngineToolsModule } from "../../../ai-engine/tools/ai-engine-tools.module";
import { AiEngineSkillsModule } from "../../../ai-engine/skills/ai-engine-skills.module";
import { AiEnginePlanningModule } from "../../../ai-engine/llm/ai-engine-planning.module";
import { KeyResolverModule } from "../../../ai-infra/credentials/key-resolver/key-resolver.module";
import { SecretsModule } from "../../../ai-infra/secrets/secrets.module";
import { ResourceManagerService } from "./resource-manager.service";
// CircuitBreakerService 已搬到 ai-engine/safety/resilience/（PR-X3）
import { ConstraintEngine } from "./constraint-engine";
import { ConstraintEnforcementService } from "./constraint-enforcement.service";
import { CostController } from "./cost-controller";
import { RateLimiter } from "./rate-limiter";
import { TokenBudgetService } from "./token-budget.service";
import { RuntimeEnvironmentService } from "./runtime-environment.service";

const RUNTIME_RESOURCE_PROVIDERS = [
  ResourceManagerService,
  ConstraintEngine,
  ConstraintEnforcementService,
  CostController,
  RateLimiter,
  TokenBudgetService,
  RuntimeEnvironmentService,
];

@Global()
@Module({
  imports: [
    PrismaModule,
    // 引入三个 L2 registry 模块（legacy AgentRegistry + ToolRegistry + SkillRegistry）。
    // SpecAgentRegistry / ToolCircuitBreaker 走 DI token 模式（见
    // runtime-resource.abstractions.ts），由 ai-harness 模块在自己的 providers 里
    // 用 useExisting 绑到 token 上，因此本模块**不**直接 import ai-harness。
    forwardRef(() => AiEngineToolsModule),
    forwardRef(() => AiEngineSkillsModule),
    forwardRef(() => AiEnginePlanningModule),
    // discoverUserKeys 真接 KeyResolver + Secrets（替换原来写死的 hasByok=false）
    KeyResolverModule,
    SecretsModule,
  ],
  providers: RUNTIME_RESOURCE_PROVIDERS,
  exports: RUNTIME_RESOURCE_PROVIDERS,
})
export class RuntimeResourceModule {}
