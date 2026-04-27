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
import { AiEngineToolsModule } from "../../ai-engine-tools.module";
import { AiEngineSkillsModule } from "../../ai-engine-skills.module";
import { AiEngineOrchestrationModule } from "../../ai-engine-orchestration.module";
import { HarnessModule as L2HarnessModule } from "../../../ai-harness/harness.module";
import { KeyResolverModule } from "../../../ai-infra/key-resolver/key-resolver.module";
import { SecretsModule } from "../../../ai-infra/secrets/secrets.module";
import { ResourceManagerService } from "./resource-manager.service";
import { CircuitBreakerService } from "./circuit-breaker.service";
import { ConstraintEngine } from "./constraint-engine";
import { ConstraintEnforcementService } from "./constraint-enforcement.service";
import { CostController } from "./cost-controller";
import { RateLimiter } from "./rate-limiter";
import { TokenBudgetService } from "./token-budget.service";
import { RuntimeEnvironmentService } from "./runtime-environment.service";

const RUNTIME_RESOURCE_PROVIDERS = [
  ResourceManagerService,
  CircuitBreakerService,
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
    // v2（P1-5 / P2-2）引入四个 registry 模块，让 RuntimeEnvironmentService 能看到
    // 全部 L2 能力：legacy AgentRegistry + ToolRegistry + SkillRegistry +
    // 新的 SpecAgentRegistry（spec-driven agents）。
    forwardRef(() => AiEngineToolsModule),
    forwardRef(() => AiEngineSkillsModule),
    forwardRef(() => AiEngineOrchestrationModule),
    forwardRef(() => L2HarnessModule),
    // discoverUserKeys 真接 KeyResolver + Secrets（替换原来写死的 hasByok=false）
    KeyResolverModule,
    SecretsModule,
  ],
  providers: RUNTIME_RESOURCE_PROVIDERS,
  exports: RUNTIME_RESOURCE_PROVIDERS,
})
export class RuntimeResourceModule {}
